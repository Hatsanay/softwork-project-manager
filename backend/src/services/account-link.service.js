// บัญชีเข้าระบบ ↔ พนักงาน (2026-10-18 — docs/plans/2026-10-18-user-employee-link.md)
//
// - "พนักงานปัจจุบัน" ของบัญชี = แถวที่ผูกบัญชีนี้และยังไม่พ้นสภาพ (วันสุดท้ายว่าง หรือ ≥ วันนี้ เวลาไทย)
//   ระบบห้ามผูกบัญชีเดียวกับพนักงานที่ยังทำงานอยู่สองคนอยู่แล้ว (employee.service assertEmployeeReferences)
// - ชื่อ-สกุล · เบอร์โทร · สาขา: พนักงานปัจจุบันเป็นตัวจริง → คัดลอกไปที่บัญชี (อีเมลและรูปแยกกัน · K1)
// - ปิดการเข้าระบบ: ไม่มีพนักงานปัจจุบัน + มีแถวที่พ้นสภาพแล้วและติ๊กปิดไว้ (กันกลับมาทำงานใหม่แล้วโดนแถวเก่าปิด · R1)
//   ไม่มีงานตั้งเวลาบน hosting → ตรวจตอน login และทุกคำขอ (auth middleware) แทนการเปลี่ยน user_status
const { AppError } = require("../utils/app-error");
const { todayBangkok } = require("../utils/bangkok-time");
const { SYSTEM_ROLE_TYPE } = require("../shared/permissions.mjs");

const CURRENT_EMPLOYEE_SQL = "(e.emp_termination_date IS NULL OR e.emp_termination_date >= ?)";

/**
 * เงื่อนไข SQL "บัญชีนี้ถูกปิดเพราะพ้นสภาพ" — ใช้ทั้ง login, auth middleware และรายการผู้ใช้
 * ต้องส่งวันนี้ (เวลาไทย) เป็นพารามิเตอร์ 2 ตัว · `userColumn` = คอลัมน์ user_id ของแถวผู้ใช้ใน query นั้น
 */
function loginClosedSql(userColumn) {
    return `(NOT EXISTS (SELECT 1 FROM tb_employees e WHERE e.emp_user_id = ${userColumn} AND ${CURRENT_EMPLOYEE_SQL})
             AND EXISTS (SELECT 1 FROM tb_employees e WHERE e.emp_user_id = ${userColumn}
                         AND e.emp_close_login_on_termination = 1 AND e.emp_termination_date < ?))`;
}

/** พนักงานปัจจุบันของบัญชี (ไม่มี = null) */
async function findCurrentEmployee(conn, userId) {
    const [[employee]] = await conn.query(
        `SELECT e.emp_id, e.emp_code, e.emp_first_name_th, e.emp_last_name_th, e.emp_phone, e.emp_branch_id
         FROM tb_employees e
         WHERE e.emp_user_id = ? AND ${CURRENT_EMPLOYEE_SQL}
         ORDER BY e.emp_hire_date DESC
         LIMIT 1`,
        [userId, todayBangkok()],
    );
    return employee ?? null;
}

/**
 * คัดลอกชื่อ เบอร์ สาขา จากพนักงานไปที่บัญชีที่ผูก — เรียกหลังบันทึกพนักงานใน transaction เดียวกัน
 * ข้ามถ้าไม่ได้ผูก หรือแถวนี้ไม่ใช่พนักงานปัจจุบัน (พ้นสภาพแล้ว)
 */
async function syncAccountFromEmployee(conn, employeeId) {
    const today = todayBangkok();
    const [[employee]] = await conn.query(
        `SELECT emp_user_id, emp_first_name_th, emp_last_name_th, emp_phone, emp_branch_id,
                DATE_FORMAT(emp_termination_date, '%Y-%m-%d') AS emp_termination_date
         FROM tb_employees WHERE emp_id = ?`,
        [employeeId],
    );
    if (!employee?.emp_user_id) return;
    if (employee.emp_termination_date && employee.emp_termination_date < today) return;
    await conn.query(
        "UPDATE tb_users SET user_fname = ?, user_lname = ?, user_phone = ?, user_branch_id = ? WHERE user_id = ?",
        [
            employee.emp_first_name_th,
            employee.emp_last_name_th,
            employee.emp_phone,
            employee.emp_branch_id,
            employee.emp_user_id,
        ],
    );
}

/**
 * ค่าที่หน้าบัญชีผู้ใช้/โปรไฟล์ส่งมา → ถ้ามีพนักงานปัจจุบัน ช่องชื่อ เบอร์ สาขา ใช้ของพนักงานแทน (ไม่รับค่าที่ส่งมา · R6)
 * @param {{ user_fname: string, user_lname: string, user_phone: string | null, user_branch_id?: string | null }} values
 */
async function applyEmployeeOwnedFields(conn, userId, values) {
    const employee = await findCurrentEmployee(conn, userId);
    if (!employee) return values;
    return {
        ...values,
        user_fname: employee.emp_first_name_th,
        user_lname: employee.emp_last_name_th,
        user_phone: employee.emp_phone,
        user_branch_id: employee.emp_branch_id,
    };
}

/** ข้อมูลพนักงานที่ผูก สำหรับหน้าบัญชีผู้ใช้/โปรไฟล์ (บอกว่าช่องไหนล็อกและแก้ที่ไหน) */
async function describeLinkedEmployee(conn, userId) {
    const employee = await findCurrentEmployee(conn, userId);
    if (!employee) return null;
    return {
        emp_id: employee.emp_id,
        emp_code: employee.emp_code,
        full_name: `${employee.emp_first_name_th} ${employee.emp_last_name_th}`,
    };
}

/**
 * บัญชีนี้ถูกปิดเพราะพ้นสภาพไหม — null = ยังเข้าได้ · มีค่า = วันทำงานวันสุดท้าย (ไว้บอกในข้อความ)
 */
async function findLoginClosure(conn, userId) {
    const today = todayBangkok();
    const [[row]] = await conn.query(
        `SELECT (SELECT DATE_FORMAT(MAX(e.emp_termination_date), '%Y-%m-%d') FROM tb_employees e
                 WHERE e.emp_user_id = u.user_id AND e.emp_close_login_on_termination = 1) AS last_day
         FROM tb_users u
         WHERE u.user_id = ? AND ${loginClosedSql("u.user_id")}`,
        [userId, today, today],
    );
    return row?.last_day ?? null;
}

function loginClosedError(lastDay) {
    return new AppError(
        401,
        "ACCOUNT_CLOSED_TERMINATED",
        `บัญชีนี้ปิดการเข้าระบบแล้วเพราะพ้นสภาพพนักงาน (วันทำงานวันสุดท้าย ${lastDay}) · ติดต่อฝ่ายบุคคล`,
    );
}

/**
 * สถานะการเข้าระบบของบัญชีที่ผูกกับพนักงานคนนี้ — แสดงในหน้าพนักงาน
 * @returns {{ state: "not_linked" | "inactive" | "open" | "closes_after" | "closed" | "kept_open", last_day: string | null } }
 */
async function loginAccessOf(conn, employee) {
    if (!employee.emp_user_id) return { state: "not_linked", last_day: null };
    if (employee.user_status !== "active") return { state: "inactive", last_day: null };
    const lastDay = employee.emp_termination_date;
    if (!lastDay) return { state: "open", last_day: null };
    if (!employee.emp_close_login_on_termination) return { state: "kept_open", last_day: lastDay };
    if (lastDay >= todayBangkok()) return { state: "closes_after", last_day: lastDay };
    // พ้นสภาพแล้ว แต่ถ้ามีพนักงานแถวใหม่ (กลับมาทำงาน) ผูกบัญชีเดียวกัน บัญชียังเข้าได้ (R1)
    const closure = await findLoginClosure(conn, employee.emp_user_id);
    return closure ? { state: "closed", last_day: lastDay } : { state: "open", last_day: null };
}

/**
 * กันปิดบัญชีผู้ดูแลระบบคนสุดท้าย (R4) — บัญชีที่ใช้ role ระบบ (SYSTEM_ROLE_TYPE) ที่ยังเข้าระบบได้ต้องเหลืออย่างน้อย 1 บัญชี
 * @param {string | null} userId บัญชีที่จะถูกปิดเมื่อพ้นสภาพ
 */
async function assertNotLastAdmin(conn, userId) {
    if (!userId) return;
    const today = todayBangkok();
    const [[target]] = await conn.query(
        `SELECT r.role_type FROM tb_users u LEFT JOIN tb_roles r ON r.role_id = u.user_role_id WHERE u.user_id = ?`,
        [userId],
    );
    if (target?.role_type !== SYSTEM_ROLE_TYPE) return;
    const [[{ others }]] = await conn.query(
        `SELECT COUNT(*) AS others
         FROM tb_users u JOIN tb_roles r ON r.role_id = u.user_role_id
         WHERE r.role_type = ? AND u.user_status = 'active' AND u.user_id <> ?
           AND NOT ${loginClosedSql("u.user_id")}`,
        [SYSTEM_ROLE_TYPE, userId, today, today],
    );
    if (Number(others) === 0) {
        throw new AppError(
            409,
            "LAST_ADMIN_ACCOUNT",
            "บัญชีนี้เป็นผู้ดูแลระบบคนสุดท้ายที่ยังเข้าระบบได้ ปิดการเข้าระบบไม่ได้ · ตั้งผู้ดูแลระบบคนอื่นก่อน หรือเอาติ๊กปิดการเข้าระบบออก",
            { emp_close_login_on_termination: "ผู้ดูแลระบบคนสุดท้าย ปิดการเข้าระบบไม่ได้" },
        );
    }
}

module.exports = {
    loginClosedSql,
    findCurrentEmployee,
    syncAccountFromEmployee,
    applyEmployeeOwnedFields,
    describeLinkedEmployee,
    findLoginClosure,
    loginClosedError,
    loginAccessOf,
    assertNotLastAdmin,
};
