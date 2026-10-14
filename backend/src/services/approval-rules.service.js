// กติกาอนุมัติหลายชั้นตามยอดเงิน (2026-10-13, docs/plans/2026-10-08-sales-cycle.md หัวข้อ 3)
//
// บันทึกทั้งชุดทีเดียว (ลบของเดิมแล้วใส่ใหม่ใน transaction เดียว) — ใบที่ส่งขออนุมัติไปแล้วเก็บแผนของตัวเองไว้ จึงไม่กระทบ
// คำเตือน (warnings) ไม่บล็อกการบันทึก แต่บอกล่วงหน้าว่าชั้นไหน "ใบจะค้าง" เพราะไม่มีคนอนุมัติได้
const { AppError } = require("../utils/app-error");
const { effectiveRolePermission, hasBit } = require("../utils/permissions");

/**
 * role ทั้งหมดสำหรับให้เลือกเป็นผู้อนุมัติ
 * @param {import("mysql2/promise").Pool | import("mysql2/promise").PoolConnection} conn
 */
async function findRoleChoices(conn) {
    const [rows] = await conn.query("SELECT role_id, role_name, role_type FROM tb_roles ORDER BY role_name");
    return rows.map((row) => ({
        role_id: row.role_id,
        role_name: row.role_name,
        is_system_role: row.role_type === "S",
    }));
}

/**
 * กติกาของเอกสารประเภทหนึ่ง พร้อมผู้ใช้ที่อนุมัติได้ในแต่ละชั้น และคำเตือน
 * ผู้อนุมัติได้ = ผู้ใช้ที่เปิดใช้งาน role อยู่ในชั้นนั้น และ role มีสิทธิ์ "อนุมัติใบเสนอราคา" (1A-3)
 * @param {import("mysql2/promise").Pool | import("mysql2/promise").PoolConnection} conn
 * @param {"QT"} documentType
 */
async function findApprovalRules(conn, documentType) {
    const [levelRows] = await conn.query(
        `SELECT al_level, al_min_amount_thb, al_require_distinct
         FROM tb_approval_levels WHERE al_doc_type = ? ORDER BY al_level`,
        [documentType],
    );
    const [roleRows] = await conn.query(
        `SELECT lr.alr_level, r.role_id, r.role_name
         FROM tb_approval_level_roles lr JOIN tb_roles r ON r.role_id = lr.alr_role_id
         WHERE lr.alr_doc_type = ? ORDER BY r.role_name`,
        [documentType],
    );
    const [userRows] = await conn.query(
        `SELECT u.user_id, CONCAT(u.user_fname, ' ', u.user_lname) AS full_name, u.user_role_id, r.role_permission, r.role_type
         FROM tb_users u JOIN tb_roles r ON r.role_id = u.user_role_id
         WHERE u.user_status = 'active'
           AND u.user_role_id IN (SELECT alr_role_id FROM tb_approval_level_roles WHERE alr_doc_type = ?)
         ORDER BY u.user_fname`,
        [documentType],
    );
    const approverRows = userRows.filter((user) =>
        hasBit(effectiveRolePermission(user.role_type, user.role_permission), "approveQuotation"),
    );

    const levels = levelRows.map((level) => {
        const roles = roleRows
            .filter((role) => role.alr_level === level.al_level)
            .map((role) => ({ role_id: role.role_id, role_name: role.role_name }));
        const roleIds = new Set(roles.map((role) => role.role_id));
        const eligibleUsers = approverRows
            .filter((user) => roleIds.has(user.user_role_id))
            .map((user) => ({ user_id: user.user_id, full_name: user.full_name }));

        return {
            al_level: level.al_level,
            al_min_amount_thb: level.al_min_amount_thb,
            al_require_distinct: level.al_require_distinct === 1,
            roles,
            eligible_users: eligibleUsers,
        };
    });

    return { levels, warnings: buildApprovalWarnings(levels) };
}

/**
 * คำเตือนกรณีที่ใบจะค้างอนุมัติ — แยกเป็นฟังก์ชันล้วน (ไม่แตะฐานข้อมูล) เพื่อเทสต์ได้ตรงๆ
 * @param {Array<{ al_level: number, al_require_distinct: boolean, eligible_users: Array<{ user_id: string, full_name: string }> }>} levels
 * @returns {string[]}
 */
function buildApprovalWarnings(levels) {
    const warnings = [];

    levels.forEach((level, index) => {
        if (level.eligible_users.length === 0) {
            warnings.push(
                `ชั้น ${level.al_level} ยังไม่มีผู้ใช้ที่อนุมัติได้ (ไม่มีผู้ใช้ที่เปิดใช้งานใน role ที่เลือก หรือ role นั้นยังไม่ได้ติ๊กสิทธิ์ "อนุมัติใบเสนอราคา") — ใบที่ต้องผ่านชั้นนี้จะค้าง`,
            );
            return;
        }

        if (!level.al_require_distinct) return;

        // ชั้นที่บังคับคนละคน: ถ้ามีผู้อนุมัติได้คนเดียว และคนนั้นอนุมัติชั้นก่อนหน้าได้ด้วย
        // → เมื่อเขาอนุมัติชั้นก่อนหน้าไปแล้ว ชั้นนี้จะไม่เหลือใครอนุมัติได้
        const onlyApprover = level.eligible_users.length === 1 ? level.eligible_users[0] : null;
        if (!onlyApprover) return;
        const isAlsoEarlierApprover = levels
            .slice(0, index)
            .some((earlierLevel) => earlierLevel.eligible_users.some((user) => user.user_id === onlyApprover.user_id));
        if (isAlsoEarlierApprover) {
            warnings.push(
                `ชั้น ${level.al_level} บังคับให้เป็นคนละคน แต่มีผู้อนุมัติได้คนเดียว (${onlyApprover.full_name}) ซึ่งอนุมัติชั้นก่อนหน้าได้ด้วย — ถ้าเขาอนุมัติชั้นก่อนหน้าไปแล้ว ใบจะค้างที่ชั้นนี้`,
            );
        }
    });

    return warnings;
}

/**
 * บันทึกกติกาทั้งชุด — ชั้นที่ = ลำดับในรายการ (1, 2, 3...)
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {"QT"} documentType
 * @param {Array<{ al_min_amount_thb: string, al_require_distinct: boolean, role_ids: string[] }>} levels ผ่าน approvalLevelsSchema แล้ว
 */
async function saveApprovalRules(conn, documentType, levels) {
    // role ที่เลือกต้องยังมีอยู่ (อาจถูกลบไประหว่างที่เปิดหน้าค้างไว้)
    const allRoleIds = [...new Set(levels.flatMap((level) => level.role_ids))];
    const [existingRoles] = await conn.query("SELECT role_id FROM tb_roles WHERE role_id IN (?)", [allRoleIds]);
    const existingRoleIds = new Set(existingRoles.map((role) => role.role_id));
    const fields = {};
    levels.forEach((level, index) => {
        const hasMissingRole = level.role_ids.some((roleId) => !existingRoleIds.has(roleId));
        if (hasMissingRole)
            fields[`levels.${index}.role_ids`] = "มี role ที่ถูกลบไปแล้ว กรุณาโหลดหน้าใหม่แล้วเลือกใหม่";
    });
    if (Object.keys(fields).length > 0) {
        throw new AppError(400, "VALIDATION", "มี role ที่ถูกลบไปแล้ว กรุณาโหลดหน้าใหม่", fields);
    }

    // ล็อกกติกาเดิมก่อนลบ — สองคนบันทึกพร้อมกัน คนหลังรอคนแรกเสร็จ ได้ชุดของคนหลังครบทั้งชุด ไม่ปนกัน
    await conn.query("SELECT al_level FROM tb_approval_levels WHERE al_doc_type = ? FOR UPDATE", [documentType]);
    await conn.query("DELETE FROM tb_approval_levels WHERE al_doc_type = ?", [documentType]);

    for (const [index, level] of levels.entries()) {
        const levelNumber = index + 1;
        await conn.query(
            "INSERT INTO tb_approval_levels (al_doc_type, al_level, al_min_amount_thb, al_require_distinct) VALUES (?, ?, ?, ?)",
            [documentType, levelNumber, level.al_min_amount_thb, level.al_require_distinct ? 1 : 0],
        );
        for (const roleId of level.role_ids) {
            await conn.query(
                "INSERT INTO tb_approval_level_roles (alr_doc_type, alr_level, alr_role_id) VALUES (?, ?, ?)",
                [documentType, levelNumber, roleId],
            );
        }
    }

    return findApprovalRules(conn, documentType);
}

module.exports = { findRoleChoices, findApprovalRules, buildApprovalWarnings, saveApprovalRules };
