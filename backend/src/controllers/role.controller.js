const pool = require("../config/db");
const { generateDailyId } = require("../utils/generateDailyId");
const {
    PERMISSION_KEYS,
    SYSTEM_ROLE_TYPE,
    FULL_PERMISSION,
    isValidPermissionString,
    effectiveRolePermission,
} = require("../utils/permissions");
const { ACCESS_ERRORS, findRolePermission, canActOn, sendAccessError } = require("../utils/role-access");

// ชื่อประเภทเอกสารในกติกาอนุมัติ (tb_approval_level_roles.alr_doc_type) สำหรับข้อความแจ้งผู้ใช้
const { APPROVAL_DOCUMENTS } = require("../shared/schemas/company.mjs");

// หน้าแก้/สร้าง role ที่เปิดค้างไว้ตั้งแต่ก่อนระบบเพิ่มสิทธิ์ใหม่ จะส่งสตริงสิทธิ์ที่สั้นกว่า backend มา
// ปฏิเสธทั้งคำขอแทนการบันทึกบางส่วน ไม่งั้นสิทธิ์ใหม่ของ role นั้นจะหายเงียบๆ (2026-10-12, risk-fixes R1)
const OUTDATED_PERMISSION_PAGE = {
    code: "PERMISSION_LAYOUT_OUTDATED",
    message: "บันทึกสิทธิ์ไม่ได้ เพราะหน้าเว็บนี้เป็นเวอร์ชันเก่า (ระบบเพิ่งเพิ่มสิทธิ์ใหม่) กรุณารีเฟรชหน้า (Ctrl+F5) แล้วตั้งค่าสิทธิ์อีกครั้ง",
};

const ROLE_TYPE_REGULAR = "R";

async function getAll(req, res, next) {
    try {
        const limit = Number(req.query.limit) || 10;
        const offset = Number(req.query.offset) || 0;
        const search = `%${req.query.search ?? ""}%`;

        const [rows] = await pool.query(
            `SELECT r.role_id, r.role_name, r.role_granted_at, r.role_update_at, r.role_type, r.role_permission,
                    d.dep_name AS role_department_name,
                    CONCAT(u.user_fname, ' ', u.user_lname) AS by_fullname
             FROM tb_roles r
             LEFT JOIN tb_users u ON u.user_id = r.role_granted_by_id
             LEFT JOIN tb_department d ON d.dep_id = r.role_department
             WHERE r.role_name LIKE ?
             ORDER BY r.role_id DESC
             LIMIT ? OFFSET ?`,
            [search, limit, offset]
        );
        const [[{ total }]] = await pool.query(
            "SELECT COUNT(*) AS total FROM tb_roles WHERE role_name LIKE ?",
            [search]
        );

        // can_assign: role นี้มีสิทธิ์ไม่เกินคนที่ดูอยู่ — หน้าผู้ใช้ใช้ซ่อน role ที่มอบให้ใครไม่ได้ (risk-fixes R25)
        // ไม่ส่งสตริงสิทธิ์ดิบออกไปในรายการ
        const data = rows.map(({ role_type, role_permission, ...role }) => ({
            ...role,
            can_assign: canActOn(req.user.role_permission, effectiveRolePermission(role_type, role_permission)),
        }));

        res.json({ data, total });
    } catch (err) {
        next(err);
    }
}

async function getOne(req, res, next) {
    try {
        const [rows] = await pool.query(
            `SELECT r.role_id, r.role_name, r.role_permission, r.role_department, r.role_type,
                    r.role_granted_at, r.role_update_at,
                    d.dep_name AS role_department_name,
                    CONCAT(u.user_fname, ' ', u.user_lname) AS by_fullname
             FROM tb_roles r
             LEFT JOIN tb_users u ON u.user_id = r.role_granted_by_id
             LEFT JOIN tb_department d ON d.dep_id = r.role_department
             WHERE r.role_id = ?`,
            [req.params.id]
        );
        const role = rows[0];
        if (!role) return res.status(404).json({ message: "ไม่พบสิทธิ์นี้" });

        // role ระบบแสดงสิทธิ์ตามที่ใช้จริงตอนตรวจสิทธิ์ คือครบทุกข้อ (risk-fixes R24)
        const effectivePermission = effectiveRolePermission(role.role_type, role.role_permission);

        res.json({
            ...role,
            role_permission: effectivePermission,
            is_system_role: role.role_type === SYSTEM_ROLE_TYPE,
            // แก้ได้เมื่อ role นี้มีสิทธิ์ไม่เกินคนที่เปิดดู (risk-fixes R25)
            can_edit: canActOn(req.user.role_permission, effectivePermission),
            // ให้หน้าแก้ role เทียบกับจำนวนบิตที่หน้าเว็บรู้จัก — ไม่ตรง = หน้าเว็บเก่า ต้องรีเฟรชก่อนแก้ (risk-fixes R1)
            total_bits: PERMISSION_KEYS.length,
        });
    } catch (err) {
        next(err);
    }
}

async function create(req, res, next) {
    try {
        const { role_name, role_permission, role_department } = req.body;
        if (!role_name?.trim()) {
            return res.status(400).json({ message: "กรุณากรอกชื่อสิทธิ์" });
        }
        if (!isValidPermissionString(role_permission)) {
            return res.status(400).json(OUTDATED_PERMISSION_PAGE);
        }
        if (!canActOn(req.user.role_permission, role_permission)) {
            return sendAccessError(res, ACCESS_ERRORS.permissionAboveActor);
        }

        const role_id = await generateDailyId("tb_roles", "role_id", "ROL");

        // role_type และผู้สร้างกำหนดที่ backend เท่านั้น (2026-10-12) — เดิมรับจาก body ทำให้คนที่มีสิทธิ์สร้าง role
        // ยิง API สร้าง system role ("S") ซึ่งลบไม่ได้และได้สิทธิ์ครบทุกข้อ
        await pool.query(
            `INSERT INTO tb_roles (role_id, role_name, role_permission, role_granted_by_id, role_type, role_department)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [role_id, role_name.trim(), role_permission, req.user.user_id, ROLE_TYPE_REGULAR, role_department || null]
        );

        res.status(201).json({ role_id });
    } catch (err) {
        if (err.code === "ER_DUP_ENTRY") {
            return res.status(409).json({ message: "ชื่อสิทธิ์นี้ถูกใช้งานแล้ว" });
        }
        next(err);
    }
}

async function update(req, res, next) {
    try {
        const { role_name, role_permission, role_department } = req.body;
        if (!role_name?.trim()) {
            return res.status(400).json({ message: "กรุณากรอกชื่อสิทธิ์" });
        }

        const [rows] = await pool.query("SELECT role_type, role_permission FROM tb_roles WHERE role_id = ?", [req.params.id]);
        const role = rows[0];
        if (!role) {
            return res.status(404).json({ message: "ไม่พบสิทธิ์นี้ อาจถูกลบไปแล้ว กรุณากลับไปหน้ารายการ" });
        }
        if (!canActOn(req.user.role_permission, effectiveRolePermission(role.role_type, role.role_permission))) {
            return sendAccessError(res, ACCESS_ERRORS.roleAboveActor);
        }

        // role ระบบแก้ได้เฉพาะชื่อและแผนก สิทธิ์เป็นครบทุกข้อเสมอ (risk-fixes R24) — ไม่สนสตริงที่หน้าเว็บส่งมา
        const isSystemRole = role.role_type === SYSTEM_ROLE_TYPE;
        if (!isSystemRole) {
            if (!isValidPermissionString(role_permission)) {
                return res.status(400).json(OUTDATED_PERMISSION_PAGE);
            }
            if (!canActOn(req.user.role_permission, role_permission)) {
                return sendAccessError(res, ACCESS_ERRORS.permissionAboveActor);
            }
        }
        const permissionToSave = isSystemRole ? FULL_PERMISSION : role_permission;

        await pool.query(
            "UPDATE tb_roles SET role_name = ?, role_permission = ?, role_department = ? WHERE role_id = ?",
            [role_name.trim(), permissionToSave, role_department || null, req.params.id]
        );

        res.json({ message: "แก้ไขสิทธิ์สำเร็จ" });
    } catch (err) {
        if (err.code === "ER_DUP_ENTRY") {
            return res.status(409).json({ message: "ชื่อสิทธิ์นี้ถูกใช้งานแล้ว" });
        }
        next(err);
    }
}

async function remove(req, res, next) {
    try {
        const [rows] = await pool.query("SELECT role_type FROM tb_roles WHERE role_id = ?", [req.params.id]);
        const role = rows[0];
        if (!role) {
            return res.status(404).json({ message: "ไม่พบสิทธิ์นี้ อาจถูกลบไปแล้ว" });
        }
        if (role.role_type === SYSTEM_ROLE_TYPE) {
            return res.status(400).json({ message: "ไม่สามารถลบ system role ได้" });
        }

        const rolePermission = await findRolePermission(req.params.id);
        if (!canActOn(req.user.role_permission, rolePermission)) {
            return sendAccessError(res, ACCESS_ERRORS.roleAboveActor);
        }

        // ผู้ใช้ทุกคนต้องมี role — ลบ role ที่ยังมีคนใช้อยู่จะชน foreign key แล้วได้ error 500 ที่ไม่บอกเหตุผล (risk-fixes R20)
        const [[{ userCount }]] = await pool.query(
            "SELECT COUNT(*) AS userCount FROM tb_users WHERE user_role_id = ?",
            [req.params.id]
        );
        if (userCount > 0) {
            return res.status(409).json({
                code: "ROLE_IN_USE",
                message: `ลบสิทธิ์นี้ไม่ได้ เพราะมีผู้ใช้ ${userCount} คนใช้สิทธิ์นี้อยู่ ย้ายผู้ใช้เหล่านั้นไปสิทธิ์อื่นก่อน แล้วค่อยลบ`,
            });
        }

        // role ที่เป็นผู้อนุมัติในกติกาอนุมัติ — ลบแล้วชั้นนั้นอาจไม่มีใครอนุมัติได้ ใบค้าง (2026-10-13, risk R6)
        const [approvalLevels] = await pool.query(
            "SELECT alr_doc_type, alr_level FROM tb_approval_level_roles WHERE alr_role_id = ? ORDER BY alr_doc_type DESC, alr_level",
            [req.params.id]
        );
        if (approvalLevels.length > 0) {
            const levelNames = approvalLevels
                .map((row) => `${APPROVAL_DOCUMENTS[row.alr_doc_type]?.name ?? row.alr_doc_type} ชั้น ${row.alr_level}`)
                .join(", ");
            return res.status(409).json({
                code: "ROLE_IN_APPROVAL_RULES",
                message: `ลบสิทธิ์นี้ไม่ได้ เพราะเป็นผู้อนุมัติ${levelNames} เอาออกจากกติกาก่อนที่ ตั้งค่าระบบ › ข้อมูลบริษัท › การอนุมัติ แล้วค่อยลบ`,
            });
        }

        await pool.query("DELETE FROM tb_roles WHERE role_id = ?", [req.params.id]);
        res.status(204).end();
    } catch (err) {
        next(err);
    }
}

module.exports = { getAll, getOne, create, update, remove };
