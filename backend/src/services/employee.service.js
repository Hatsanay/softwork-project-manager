// ทะเบียนพนักงาน + ค่าจ้างตามวันที่มีผล + รายรับ/รายหักประจำ (2026-10-17 เฟส 4 ขั้น 4-1)
// แบบระบบ: docs/plans/2026-10-17-people-payroll-4.md หัวข้อ 3.1–3.2 และ R-H1/R-H8/R-H9
//
// - ข้อมูลผ่าน zod (shared/schemas/people.mjs) แล้ว · ตรวจที่นี่: รหัสซ้ำ · อ้างอิงมีจริง · วันที่เทียบกับวันเริ่มงาน/พ้นสภาพ
// - สถานะไม่เก็บเป็นคอลัมน์: คิดจากวันเริ่มงาน/วันทำงานวันสุดท้ายเทียบกับวันนี้ (เวลาไทย) ทุกครั้งที่อ่าน
// - เลขประจำตัวประชาชน/บัญชีผู้ใช้ ห้ามซ้ำกับพนักงานที่ยังทำงานอยู่ (คนเดิมกลับมาทำงานใหม่ = พนักงานใหม่ ใช้เลขเดิมได้)
// - ค่าจ้างแถวแรกมีผลวันเริ่มงานเสมอ — เปลี่ยนวันเริ่มงานแล้วแถวแรกเลื่อนตาม
// - ขั้น 4-2/4-4 จะเพิ่มการล็อก: ลบพนักงานที่มีลงเวลา/รอบเงินเดือนไม่ได้ · ค่าจ้าง/รายการที่อยู่ในรอบเงินเดือนที่อนุมัติแล้วแก้ไม่ได้
const { AppError } = require("../utils/app-error");
const { generateDailyId } = require("../utils/generateDailyId");
const { todayBangkok } = require("../utils/bangkok-time");

const MAX_LIST_LIMIT = 200;
const VISIBLE_NATIONAL_ID_DIGITS = 4;

// คอลัมน์ที่บันทึกจากฟอร์ม (ลำดับเดียวกับ toColumnValues)
const EDITABLE_COLUMNS = [
    "emp_code",
    "emp_user_id",
    "emp_title",
    "emp_first_name_th",
    "emp_last_name_th",
    "emp_first_name_en",
    "emp_last_name_en",
    "emp_nickname",
    "emp_national_id",
    "emp_birth_date",
    "emp_address",
    "emp_phone",
    "emp_email",
    "emp_department_id",
    "emp_position",
    "emp_branch_id",
    "emp_hire_date",
    "emp_bank_name",
    "emp_bank_account_no",
    "emp_bank_account_name",
    "emp_sso_enrolled",
    "emp_sso_number",
    "emp_notes",
];

// สถานะการทำงาน ณ วันนี้ — ตัวแปร ? ตัวเดียวคือวันนี้ (ใช้ 2 ครั้ง)
const EMPLOYMENT_STATUS_SQL = `
    CASE
        WHEN e.emp_termination_date IS NOT NULL AND e.emp_termination_date < ? THEN 'terminated'
        WHEN e.emp_hire_date > ? THEN 'upcoming'
        WHEN e.emp_termination_date IS NOT NULL THEN 'leaving'
        ELSE 'active'
    END`;

const DATE_COLUMNS = `
    DATE_FORMAT(e.emp_birth_date, '%Y-%m-%d') AS emp_birth_date,
    DATE_FORMAT(e.emp_hire_date, '%Y-%m-%d') AS emp_hire_date,
    DATE_FORMAT(e.emp_termination_date, '%Y-%m-%d') AS emp_termination_date`;

function notFound() {
    return new AppError(404, "EMPLOYEE_NOT_FOUND", "ไม่พบพนักงานนี้ อาจถูกลบไปแล้ว กรุณาโหลดหน้าใหม่");
}

function validationError(fields, message = "ข้อมูลบางอย่างใช้ไม่ได้ กรุณาแก้ตามข้อความใต้ช่อง") {
    return new AppError(400, "VALIDATION", message, fields);
}

/**
 * เลขประจำตัวประชาชนแบบปิดบางส่วน (รายการพนักงาน — R-H8) เช่น "•••••••••0708"
 * @param {string | null} nationalId
 */
function maskNationalId(nationalId) {
    if (!nationalId) return null;
    const hiddenLength = nationalId.length - VISIBLE_NATIONAL_ID_DIGITS;
    return "•".repeat(hiddenLength) + nationalId.slice(hiddenLength);
}

// ─── อ่าน ────────────────────────────────────────────────────────────────────────────────────

/**
 * @param {import("mysql2/promise").Pool} conn
 * @param {{ limit?: number, offset?: number, search?: string, status?: string }} options
 *   status: "employed" = ยังไม่พ้นสภาพ (รวมยังไม่เริ่มงาน/กำลังจะออก) · "terminated" · อื่นๆ = ทั้งหมด
 */
async function listEmployees(conn, { limit = 25, offset = 0, search = "", status }) {
    const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), MAX_LIST_LIMIT);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const today = todayBangkok();
    const like = `%${search}%`;
    const conditions = [
        `(e.emp_code LIKE ? OR e.emp_first_name_th LIKE ? OR e.emp_last_name_th LIKE ? OR e.emp_nickname LIKE ?
          OR CONCAT(e.emp_first_name_th, ' ', e.emp_last_name_th) LIKE ? OR e.emp_position LIKE ?)`,
    ];
    const params = [like, like, like, like, like, like];
    if (status === "employed") {
        conditions.push("(e.emp_termination_date IS NULL OR e.emp_termination_date >= ?)");
        params.push(today);
    }
    if (status === "terminated") {
        conditions.push("e.emp_termination_date < ?");
        params.push(today);
    }
    const where = conditions.join(" AND ");
    const [rows] = await conn.query(
        `SELECT e.emp_id, e.emp_code, e.emp_title, e.emp_first_name_th, e.emp_last_name_th, e.emp_nickname,
                e.emp_national_id, e.emp_position, e.emp_user_id, ${DATE_COLUMNS},
                d.dep_name AS department_name, b.branch_name_th AS branch_name, u.user_username AS user_username,
                ${EMPLOYMENT_STATUS_SQL} AS employment_status
         FROM tb_employees e
         LEFT JOIN tb_department d ON d.dep_id = e.emp_department_id
         LEFT JOIN tb_branches b ON b.branch_id = e.emp_branch_id
         LEFT JOIN tb_users u ON u.user_id = e.emp_user_id
         WHERE ${where}
         ORDER BY e.emp_code, e.emp_id
         LIMIT ? OFFSET ?`,
        [today, today, ...params, safeLimit, safeOffset],
    );
    const [[{ total }]] = await conn.query(`SELECT COUNT(*) AS total FROM tb_employees e WHERE ${where}`, params);
    const data = rows.map(({ emp_national_id: nationalId, ...row }) => ({
        ...row,
        national_id_masked: maskNationalId(nationalId),
    }));
    return { data, total: Number(total) };
}

/**
 * ข้อมูลพนักงานครบ (เลขประจำตัวเต็ม · ค่าจ้างทุกแถว · รายการประจำ) — เฉพาะผู้มีสิทธิ์จัดการพนักงาน (route คุม)
 * @param {import("mysql2/promise").Pool | import("mysql2/promise").PoolConnection} conn
 * @param {string} employeeId
 */
async function getEmployee(conn, employeeId) {
    const today = todayBangkok();
    const [[employee]] = await conn.query(
        `SELECT e.*, ${DATE_COLUMNS},
                d.dep_name AS department_name, b.branch_name_th AS branch_name,
                u.user_username AS user_username, CONCAT(u.user_fname, ' ', u.user_lname) AS user_fullname,
                u.user_status AS user_status,
                ${EMPLOYMENT_STATUS_SQL} AS employment_status
         FROM tb_employees e
         LEFT JOIN tb_department d ON d.dep_id = e.emp_department_id
         LEFT JOIN tb_branches b ON b.branch_id = e.emp_branch_id
         LEFT JOIN tb_users u ON u.user_id = e.emp_user_id
         WHERE e.emp_id = ?`,
        [today, today, employeeId],
    );
    if (!employee) throw notFound();
    const compensations = await findCompensations(conn, employeeId);
    const recurringItems = await findRecurringItems(conn, employeeId);
    return {
        ...employee,
        emp_sso_enrolled: employee.emp_sso_enrolled === 1,
        compensations,
        current_compensation: compensationOn(compensations, today),
        recurring_items: recurringItems.map((item) => ({ ...item, item_status: recurringItemStatus(item, today) })),
        today,
    };
}

async function findCompensations(conn, employeeId) {
    const [rows] = await conn.query(
        `SELECT DATE_FORMAT(c.ecm_effective_from, '%Y-%m-%d') AS ecm_effective_from, c.ecm_base_salary, c.ecm_note,
                c.ecm_created_at, CONCAT(u.user_fname, ' ', u.user_lname) AS created_by_name
         FROM tb_employee_compensations c
         LEFT JOIN tb_users u ON u.user_id = c.ecm_created_by
         WHERE c.ecm_employee_id = ?
         ORDER BY c.ecm_effective_from DESC`,
        [employeeId],
    );
    return rows;
}

async function findRecurringItems(conn, employeeId) {
    const [rows] = await conn.query(
        `SELECT eri_id, eri_kind, eri_label, eri_amount, eri_is_taxable, eri_is_sso_wage, eri_note,
                DATE_FORMAT(eri_effective_from, '%Y-%m-%d') AS eri_effective_from,
                DATE_FORMAT(eri_effective_to, '%Y-%m-%d') AS eri_effective_to
         FROM tb_employee_recurring_items
         WHERE eri_employee_id = ?
         ORDER BY eri_effective_from DESC, eri_id DESC`,
        [employeeId],
    );
    return rows.map((row) => ({
        ...row,
        eri_is_taxable: row.eri_is_taxable === 1,
        eri_is_sso_wage: row.eri_is_sso_wage === 1,
    }));
}

/**
 * อัตราที่มีผล ณ วันที่ระบุ = แถวล่าสุดที่วันที่มีผล <= วันนั้น · ยังไม่ถึงวันเริ่มงาน = แถวแรก (เงินเดือนที่ตกลงไว้)
 * @param {{ ecm_effective_from: string }[]} compensations เรียงจากใหม่ไปเก่า
 * @param {string} dateText
 */
function compensationOn(compensations, dateText) {
    const effective = compensations.find((row) => row.ecm_effective_from <= dateText);
    return effective ?? compensations[compensations.length - 1] ?? null;
}

function recurringItemStatus(item, today) {
    if (item.eri_effective_from > today) return "upcoming";
    if (item.eri_effective_to && item.eri_effective_to < today) return "ended";
    return "active";
}

/**
 * ตัวเลือกของฟอร์มพนักงาน: แผนก/สาขาที่เปิดใช้งาน + บัญชีผู้ใช้ (บอกว่าผูกกับพนักงานคนไหนอยู่แล้ว)
 * @param {import("mysql2/promise").Pool} conn
 */
async function getFormOptions(conn) {
    const today = todayBangkok();
    const [departments] = await conn.query("SELECT dep_id, dep_name, dep_status FROM tb_department ORDER BY dep_name");
    const [branches] = await conn.query(
        "SELECT branch_id, branch_code, branch_name_th, branch_status FROM tb_branches ORDER BY branch_code",
    );
    const [users] = await conn.query(
        `SELECT u.user_id, u.user_username, CONCAT(u.user_fname, ' ', u.user_lname) AS fullname, u.user_status,
                (SELECT e.emp_id FROM tb_employees e
                 WHERE e.emp_user_id = u.user_id AND (e.emp_termination_date IS NULL OR e.emp_termination_date >= ?)
                 LIMIT 1) AS linked_employee_id
         FROM tb_users u
         ORDER BY u.user_fname, u.user_lname`,
        [today],
    );
    return { departments, branches, users };
}

// ─── เพิ่ม / แก้ / ลบ ─────────────────────────────────────────────────────────────────────────

/**
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {object} employee ผ่าน employeeCreateSchema แล้ว (มี ecm_base_salary)
 * @param {{ user_id: string }} actor
 */
async function createEmployee(conn, employee, actor) {
    await assertEmployeeReferences(conn, employee, null);
    const employeeId = await generateDailyId("tb_employees", "emp_id", "EMP");
    await conn.query(
        `INSERT INTO tb_employees (emp_id, ${EDITABLE_COLUMNS.join(", ")}, emp_created_by)
         VALUES (?, ${EDITABLE_COLUMNS.map(() => "?").join(", ")}, ?)`,
        [employeeId, ...toColumnValues(employee), actor.user_id],
    );
    await conn.query(
        `INSERT INTO tb_employee_compensations (ecm_employee_id, ecm_effective_from, ecm_base_salary, ecm_note, ecm_created_by)
         VALUES (?, ?, ?, 'เงินเดือนเริ่มงาน', ?)`,
        [employeeId, employee.emp_hire_date, employee.ecm_base_salary, actor.user_id],
    );
    return { emp_id: employeeId, emp_code: employee.emp_code };
}

/**
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {string} employeeId
 * @param {object} employee ผ่าน employeeSchema แล้ว
 */
async function updateEmployee(conn, employeeId, employee) {
    const existing = await lockEmployee(conn, employeeId);
    await assertEmployeeReferences(conn, employee, existing);
    if (employee.emp_hire_date !== existing.emp_hire_date) {
        await moveFirstCompensation(conn, existing, employee.emp_hire_date);
    }
    await conn.query(
        `UPDATE tb_employees SET ${EDITABLE_COLUMNS.map((column) => `${column} = ?`).join(", ")} WHERE emp_id = ?`,
        [...toColumnValues(employee), employeeId],
    );
    return { emp_id: employeeId };
}

/**
 * ลบได้เฉพาะพนักงานที่ยังไม่มีประวัติการทำงานในระบบ (ค่าจ้าง/รายการประจำลบตาม — เป็นส่วนหนึ่งของพนักงาน)
 * มีลงเวลาแล้วลบไม่ได้ (ขั้น 4-2) · ขั้น 4-4 เพิ่มรอบเงินเดือน → ที่มีประวัติแล้วให้ใช้ "พ้นสภาพ" แทน
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {string} employeeId
 */
async function deleteEmployee(conn, employeeId) {
    await lockEmployee(conn, employeeId);
    const [[{ weekCount }]] = await conn.query(
        "SELECT COUNT(*) AS weekCount FROM tb_timesheet_weeks WHERE tsw_employee_id = ?",
        [employeeId],
    );
    if (Number(weekCount) > 0) {
        throw new AppError(
            409,
            "EMPLOYEE_HAS_HISTORY",
            `ลบพนักงานนี้ไม่ได้ เพราะมีลงเวลาแล้ว ${weekCount} สัปดาห์ — ใช้ "ตั้งพ้นสภาพ" แทน (ประวัติยังอยู่ครบ)`,
        );
    }
    const [[{ leaveCount }]] = await conn.query(
        "SELECT COUNT(*) AS leaveCount FROM tb_leave_requests WHERE lr_employee_id = ?",
        [employeeId],
    );
    if (Number(leaveCount) > 0) {
        throw new AppError(
            409,
            "EMPLOYEE_HAS_HISTORY",
            `ลบพนักงานนี้ไม่ได้ เพราะมีคำขอลาแล้ว ${leaveCount} ใบ — ใช้ "ตั้งพ้นสภาพ" แทน (ประวัติยังอยู่ครบ)`,
        );
    }
    await conn.query("DELETE FROM tb_employees WHERE emp_id = ?", [employeeId]);
}

/**
 * พ้นสภาพ — ตั้งวันทำงานวันสุดท้าย (ล่วงหน้าได้) · บัญชีผู้ใช้ที่ผูกไม่ถูกปิดเอง (R-H9 — หน้าเว็บบอกให้ปิดแยก)
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {string} employeeId
 * @param {{ emp_termination_date: string, emp_termination_reason: string }} termination
 */
async function terminateEmployee(conn, employeeId, termination) {
    const existing = await lockEmployee(conn, employeeId);
    if (termination.emp_termination_date < existing.emp_hire_date) {
        throw validationError({ emp_termination_date: "วันทำงานวันสุดท้ายต้องไม่ก่อนวันเริ่มงาน" });
    }
    await conn.query("UPDATE tb_employees SET emp_termination_date = ?, emp_termination_reason = ? WHERE emp_id = ?", [
        termination.emp_termination_date,
        termination.emp_termination_reason,
        employeeId,
    ]);
    return { emp_id: employeeId };
}

/**
 * ยกเลิกการพ้นสภาพ (ตั้งผิด/พนักงานเปลี่ยนใจก่อนออก) — ถ้าระหว่างนั้นมีพนักงานใหม่ใช้เลขประจำตัว/บัญชีผู้ใช้เดียวกันแล้ว ทำไม่ได้
 * กลับมาทำงานใหม่หลังออกไปนานแล้ว ให้สร้างพนักงานใหม่ (ช่วงทำงานแต่ละช่วงต้องแยกกันเพื่อคิดเงินเดือน)
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {string} employeeId
 */
async function reinstateEmployee(conn, employeeId) {
    const existing = await lockEmployee(conn, employeeId);
    if (!existing.emp_termination_date) {
        throw new AppError(409, "EMPLOYEE_NOT_TERMINATED", "พนักงานคนนี้ไม่ได้ตั้งวันพ้นสภาพไว้ กรุณาโหลดหน้าใหม่");
    }
    const fields = await findIdentityConflicts(conn, existing, employeeId);
    if (Object.keys(fields).length > 0) {
        throw new AppError(
            409,
            "EMPLOYEE_IDENTITY_IN_USE",
            "ยกเลิกการพ้นสภาพไม่ได้ เพราะมีพนักงานที่ทำงานอยู่ใช้เลขประจำตัวประชาชนหรือบัญชีผู้ใช้เดียวกันแล้ว",
            fields,
        );
    }
    await conn.query(
        "UPDATE tb_employees SET emp_termination_date = NULL, emp_termination_reason = NULL WHERE emp_id = ?",
        [employeeId],
    );
    return { emp_id: employeeId };
}

// ─── ค่าจ้างตามวันที่มีผล ──────────────────────────────────────────────────────────────────────

/**
 * อัตราใหม่ — ย้อนหลังได้ (ปรับเงินเดือนมีผลต้นเดือนแต่บันทึกทีหลัง) ตั้งล่วงหน้าได้
 * ต้องหลังวันเริ่มงาน (วันเริ่มงานเป็นของแถวแรก) และไม่เกินวันทำงานวันสุดท้าย
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {string} employeeId
 * @param {{ ecm_effective_from: string, ecm_base_salary: string, ecm_note: string | null }} compensation
 * @param {{ user_id: string }} actor
 */
async function addCompensation(conn, employeeId, compensation, actor) {
    const employee = await lockEmployee(conn, employeeId);
    const effectiveFrom = compensation.ecm_effective_from;
    if (effectiveFrom <= employee.emp_hire_date) {
        throw validationError({
            ecm_effective_from: "ต้องหลังวันเริ่มงาน — ถ้าเงินเดือนเริ่มงานผิด ให้กดแก้ที่แถวเงินเดือนเริ่มงาน",
        });
    }
    if (employee.emp_termination_date && effectiveFrom > employee.emp_termination_date) {
        throw validationError({ ecm_effective_from: "ต้องไม่หลังวันทำงานวันสุดท้ายของพนักงาน" });
    }
    const [[duplicate]] = await conn.query(
        "SELECT ecm_base_salary FROM tb_employee_compensations WHERE ecm_employee_id = ? AND ecm_effective_from = ?",
        [employeeId, effectiveFrom],
    );
    if (duplicate) {
        throw new AppError(409, "COMPENSATION_EXISTS", "มีอัตราที่มีผลวันนี้อยู่แล้ว ถ้าจะเปลี่ยนให้ลบอันเดิมก่อน", {
            ecm_effective_from: "มีอัตราของวันนี้แล้ว",
        });
    }
    await conn.query(
        `INSERT INTO tb_employee_compensations (ecm_employee_id, ecm_effective_from, ecm_base_salary, ecm_note, ecm_created_by)
         VALUES (?, ?, ?, ?, ?)`,
        [employeeId, effectiveFrom, compensation.ecm_base_salary, compensation.ecm_note, actor.user_id],
    );
    return { emp_id: employeeId, ecm_effective_from: effectiveFrom };
}

/**
 * แก้ยอด/เหตุผลของอัตรา (พิมพ์ผิด) — วันที่มีผลแก้ไม่ได้ (ลบแล้วเพิ่มใหม่แทน)
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {string} employeeId
 * @param {string} effectiveFrom "YYYY-MM-DD"
 * @param {{ ecm_base_salary: string, ecm_note: string | null }} compensation
 */
async function updateCompensation(conn, employeeId, effectiveFrom, compensation) {
    await lockEmployee(conn, employeeId);
    const [result] = await conn.query(
        `UPDATE tb_employee_compensations SET ecm_base_salary = ?, ecm_note = ?
         WHERE ecm_employee_id = ? AND ecm_effective_from = ?`,
        [compensation.ecm_base_salary, compensation.ecm_note, employeeId, effectiveFrom],
    );
    if (result.affectedRows === 0) {
        throw new AppError(404, "COMPENSATION_NOT_FOUND", "ไม่พบอัตรานี้ อาจถูกลบไปแล้ว กรุณาโหลดหน้าใหม่");
    }
    return { emp_id: employeeId, ecm_effective_from: effectiveFrom };
}

/**
 * ลบอัตรา (ตั้งผิด) — แถวแรก (วันเริ่มงาน) ลบไม่ได้ เพราะต้องมีเงินเดือนตั้งแต่วันแรกเสมอ
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {string} employeeId
 * @param {string} effectiveFrom "YYYY-MM-DD"
 */
async function deleteCompensation(conn, employeeId, effectiveFrom) {
    const employee = await lockEmployee(conn, employeeId);
    if (effectiveFrom === employee.emp_hire_date) {
        throw new AppError(
            409,
            "FIRST_COMPENSATION_LOCKED",
            "ลบเงินเดือนเริ่มงานไม่ได้ (ต้องมีเงินเดือนตั้งแต่วันแรกเสมอ) — ถ้าตัวเลขผิด ให้กดแก้ที่แถวนั้นแทน",
        );
    }
    const [result] = await conn.query(
        "DELETE FROM tb_employee_compensations WHERE ecm_employee_id = ? AND ecm_effective_from = ?",
        [employeeId, effectiveFrom],
    );
    if (result.affectedRows === 0) {
        throw new AppError(404, "COMPENSATION_NOT_FOUND", "ไม่พบอัตรานี้ อาจถูกลบไปแล้ว กรุณาโหลดหน้าใหม่");
    }
}

// ─── รายรับ/รายหักประจำ ─────────────────────────────────────────────────────────────────────────

/**
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {string} employeeId
 * @param {object} item ผ่าน recurringItemSchema แล้ว
 * @param {{ user_id: string }} actor
 */
async function addRecurringItem(conn, employeeId, item, actor) {
    const employee = await lockEmployee(conn, employeeId);
    if (item.eri_effective_from < employee.emp_hire_date) {
        throw validationError({ eri_effective_from: "ต้องไม่ก่อนวันเริ่มงาน" });
    }
    const [result] = await conn.query(
        `INSERT INTO tb_employee_recurring_items
            (eri_employee_id, eri_kind, eri_label, eri_amount, eri_is_taxable, eri_is_sso_wage,
             eri_effective_from, eri_effective_to, eri_note, eri_created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            employeeId,
            item.eri_kind,
            item.eri_label,
            item.eri_amount,
            item.eri_is_taxable ? 1 : 0,
            item.eri_is_sso_wage ? 1 : 0,
            item.eri_effective_from,
            item.eri_effective_to,
            item.eri_note,
            actor.user_id,
        ],
    );
    return { eri_id: result.insertId };
}

/**
 * หยุดรายการ — ตั้งวันสุดท้ายที่มีผล (เปลี่ยนยอด = หยุดอันเดิม แล้วเพิ่มอันใหม่)
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {string} employeeId
 * @param {number} itemId
 * @param {string} effectiveTo
 */
async function endRecurringItem(conn, employeeId, itemId, effectiveTo) {
    await lockEmployee(conn, employeeId);
    const item = await findRecurringItem(conn, employeeId, itemId);
    if (effectiveTo < item.eri_effective_from) {
        throw validationError({ eri_effective_to: "วันสุดท้ายต้องไม่ก่อนวันที่รายการเริ่ม" });
    }
    await conn.query("UPDATE tb_employee_recurring_items SET eri_effective_to = ? WHERE eri_id = ?", [
        effectiveTo,
        itemId,
    ]);
    return { eri_id: itemId };
}

/**
 * ลบรายการที่บันทึกผิด
 * @param {import("mysql2/promise").PoolConnection} conn
 */
async function deleteRecurringItem(conn, employeeId, itemId) {
    await lockEmployee(conn, employeeId);
    await findRecurringItem(conn, employeeId, itemId);
    await conn.query("DELETE FROM tb_employee_recurring_items WHERE eri_id = ?", [itemId]);
}

// ─── ตัวช่วย ────────────────────────────────────────────────────────────────────────────────

// ล็อกแถวพนักงานก่อนอ่านอย่างอื่นใน transaction (snapshot ของ REPEATABLE READ เริ่มที่การอ่านครั้งแรก)
async function lockEmployee(conn, employeeId) {
    const [[employee]] = await conn.query(
        `SELECT emp_id, emp_national_id, emp_user_id,
                DATE_FORMAT(emp_hire_date, '%Y-%m-%d') AS emp_hire_date,
                DATE_FORMAT(emp_termination_date, '%Y-%m-%d') AS emp_termination_date
         FROM tb_employees WHERE emp_id = ? FOR UPDATE`,
        [employeeId],
    );
    if (!employee) throw notFound();
    return employee;
}

async function findRecurringItem(conn, employeeId, itemId) {
    const [[item]] = await conn.query(
        `SELECT eri_id, DATE_FORMAT(eri_effective_from, '%Y-%m-%d') AS eri_effective_from
         FROM tb_employee_recurring_items WHERE eri_id = ? AND eri_employee_id = ?`,
        [itemId, employeeId],
    );
    if (!item) {
        throw new AppError(404, "RECURRING_ITEM_NOT_FOUND", "ไม่พบรายการนี้ อาจถูกลบไปแล้ว กรุณาโหลดหน้าใหม่");
    }
    return item;
}

function toColumnValues(employee) {
    return EDITABLE_COLUMNS.map((column) => {
        if (column === "emp_sso_enrolled") return employee.emp_sso_enrolled ? 1 : 0;
        return employee[column] ?? null;
    });
}

/**
 * เลขประจำตัว/บัญชีผู้ใช้ที่ซ้ำกับพนักงานคนอื่นที่ยังทำงานอยู่ (ยังไม่เลยวันทำงานวันสุดท้าย)
 * @returns {Promise<Record<string, string>>} ช่องที่ซ้ำ → ข้อความ
 */
async function findIdentityConflicts(conn, employee, employeeId) {
    const today = todayBangkok();
    const fields = {};
    const stillEmployed = "(emp_termination_date IS NULL OR emp_termination_date >= ?)";
    if (employee.emp_national_id) {
        const [[duplicate]] = await conn.query(
            `SELECT emp_code FROM tb_employees WHERE emp_national_id = ? AND emp_id <> ? AND ${stillEmployed}`,
            [employee.emp_national_id, employeeId ?? "", today],
        );
        if (duplicate) fields.emp_national_id = `เลขนี้เป็นของพนักงานรหัส ${duplicate.emp_code} ที่ยังทำงานอยู่`;
    }
    if (employee.emp_user_id) {
        const [[duplicate]] = await conn.query(
            `SELECT emp_code FROM tb_employees WHERE emp_user_id = ? AND emp_id <> ? AND ${stillEmployed}`,
            [employee.emp_user_id, employeeId ?? "", today],
        );
        if (duplicate) fields.emp_user_id = `บัญชีนี้ผูกกับพนักงานรหัส ${duplicate.emp_code} อยู่แล้ว`;
    }
    return fields;
}

/**
 * อ้างอิงต้องมีอยู่จริง · ที่เลือกใหม่ต้องเปิดใช้งาน (ค่าเดิมที่ถูกปิดไปแล้วคงไว้ได้) · รหัสห้ามซ้ำ
 * วันเริ่มงานต้องไม่หลังวันทำงานวันสุดท้าย
 */
async function assertEmployeeReferences(conn, employee, existing) {
    const employeeId = existing?.emp_id ?? null;
    const fields = await findIdentityConflicts(conn, employee, employeeId);
    const isChanged = (column) => !existing || String(existing[column] ?? "") !== String(employee[column] ?? "");

    const [[duplicateCode]] = await conn.query("SELECT emp_id FROM tb_employees WHERE emp_code = ? AND emp_id <> ?", [
        employee.emp_code,
        employeeId ?? "",
    ]);
    if (duplicateCode) fields.emp_code = "รหัสนี้มีพนักงานใช้แล้ว";

    if (employee.emp_department_id) {
        const [[department]] = await conn.query("SELECT dep_status FROM tb_department WHERE dep_id = ?", [
            employee.emp_department_id,
        ]);
        if (!department) fields.emp_department_id = "ไม่พบแผนกนี้";
        else if (department.dep_status !== "active" && isChanged("emp_department_id"))
            fields.emp_department_id = "แผนกนี้ถูกปิดใช้งาน";
    }
    if (employee.emp_branch_id) {
        const [[branch]] = await conn.query("SELECT branch_status FROM tb_branches WHERE branch_id = ?", [
            employee.emp_branch_id,
        ]);
        if (!branch) fields.emp_branch_id = "ไม่พบสาขานี้";
        else if (branch.branch_status !== "active" && isChanged("emp_branch_id"))
            fields.emp_branch_id = "สาขานี้ถูกปิดใช้งาน";
    }
    if (employee.emp_user_id && !fields.emp_user_id) {
        const [[user]] = await conn.query("SELECT user_id FROM tb_users WHERE user_id = ?", [employee.emp_user_id]);
        if (!user) fields.emp_user_id = "ไม่พบบัญชีผู้ใช้นี้";
    }
    if (existing?.emp_termination_date && employee.emp_hire_date > existing.emp_termination_date) {
        fields.emp_hire_date = "วันเริ่มงานต้องไม่หลังวันทำงานวันสุดท้าย";
    }
    if (Object.keys(fields).length > 0) throw validationError(fields);
}

/**
 * เปลี่ยนวันเริ่มงาน → ค่าจ้างแถวแรกเลื่อนตาม (แถวแรกต้องมีผลวันเริ่มงานเสมอ)
 * วันใหม่ต้องก่อนอัตราถัดไป ไม่งั้นลำดับประวัติเงินเดือนจะสลับกัน
 */
async function moveFirstCompensation(conn, existing, newHireDate) {
    const [rows] = await conn.query(
        `SELECT DATE_FORMAT(ecm_effective_from, '%Y-%m-%d') AS ecm_effective_from
         FROM tb_employee_compensations WHERE ecm_employee_id = ? ORDER BY ecm_effective_from LIMIT 2`,
        [existing.emp_id],
    );
    const [first, second] = rows;
    if (second && newHireDate >= second.ecm_effective_from) {
        throw validationError({
            emp_hire_date: `วันเริ่มงานต้องก่อนอัตราเงินเดือนถัดไป (มีผล ${second.ecm_effective_from}) — ลบอัตรานั้นก่อนถ้าจะเลื่อน`,
        });
    }
    if (!first) return;
    await conn.query(
        "UPDATE tb_employee_compensations SET ecm_effective_from = ? WHERE ecm_employee_id = ? AND ecm_effective_from = ?",
        [newHireDate, existing.emp_id, first.ecm_effective_from],
    );
}

module.exports = {
    listEmployees,
    getEmployee,
    getFormOptions,
    createEmployee,
    updateEmployee,
    deleteEmployee,
    terminateEmployee,
    reinstateEmployee,
    addCompensation,
    updateCompensation,
    deleteCompensation,
    addRecurringItem,
    endRecurringItem,
    deleteRecurringItem,
    compensationOn,
    maskNationalId,
};
