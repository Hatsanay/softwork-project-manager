// ทะเบียนพนักงาน + ค่าจ้างตามวันที่มีผล + รายรับ/รายหักประจำ (2026-10-17 เฟส 4 ขั้น 4-1)
// แบบระบบ: docs/plans/2026-10-17-people-payroll-4.md หัวข้อ 3.1–3.2 และ R-H1/R-H8/R-H9
//
// - ข้อมูลผ่าน zod (shared/schemas/people.mjs) แล้ว · ตรวจที่นี่: รหัสซ้ำ · อ้างอิงมีจริง · วันที่เทียบกับวันเริ่มงาน/พ้นสภาพ
// - สถานะไม่เก็บเป็นคอลัมน์: คิดจากวันเริ่มงาน/วันทำงานวันสุดท้ายเทียบกับวันนี้ (เวลาไทย) ทุกครั้งที่อ่าน
// - เลขประจำตัวประชาชน/บัญชีผู้ใช้ ห้ามซ้ำกับพนักงานที่ยังทำงานอยู่ (คนเดิมกลับมาทำงานใหม่ = พนักงานใหม่ ใช้เลขเดิมได้)
// - ค่าจ้างแถวแรกมีผลวันเริ่มงานเสมอ — เปลี่ยนวันเริ่มงานแล้วแถวแรกเลื่อนตาม
// - ขั้น 4-2/4-4 จะเพิ่มการล็อก: ลบพนักงานที่มีลงเวลา/รอบเงินเดือนไม่ได้ · ค่าจ้าง/รายการที่อยู่ในรอบเงินเดือนที่อนุมัติแล้วแก้ไม่ได้
// - รหัสพนักงานระบบออกให้ · แผนกบังคับ · สาขา = สาขาของแผนก · ย้ายแผนก/บัตร อยู่ที่ employee-code.service.js
//   (2026-10-18 — docs/plans/2026-10-18-employee-department-codes.md)
const { AppError } = require("../utils/app-error");
const { generateDailyId } = require("../utils/generateDailyId");
const { todayBangkok } = require("../utils/bangkok-time");
const employeeCodeService = require("./employee-code.service");
const accountLinkService = require("./account-link.service");
const attendanceSetupService = require("./attendance-setup.service");

const MAX_LIST_LIMIT = 200;
const VISIBLE_NATIONAL_ID_DIGITS = 4;

// คอลัมน์ที่บันทึกจากฟอร์ม (ลำดับเดียวกับ toColumnValues) — รหัสพนักงาน/สาขา ระบบตั้งเอง ไม่อยู่ในรายการนี้
const EDITABLE_COLUMNS = [
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
    "emp_hire_date",
    "emp_bank_name",
    "emp_bank_account_no",
    "emp_bank_account_name",
    "emp_sso_enrolled",
    "emp_sso_number",
    "emp_notes",
    "emp_attendance_required",
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
async function listEmployees(conn, { limit = 25, offset = 0, search = "", status, departmentId = "" }) {
    const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), MAX_LIST_LIMIT);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const today = todayBangkok();
    const like = `%${search}%`;
    const conditions = [
        `(e.emp_code LIKE ? OR e.emp_first_name_th LIKE ? OR e.emp_last_name_th LIKE ? OR e.emp_nickname LIKE ?
          OR CONCAT(e.emp_first_name_th, ' ', e.emp_last_name_th) LIKE ? OR e.emp_position LIKE ?
          OR EXISTS (SELECT 1 FROM tb_employee_codes c WHERE c.ecd_employee_id = e.emp_id AND c.ecd_code LIKE ?))`,
    ];
    // ค้นด้วยรหัสเก่าก็เจอ (รหัสเปลี่ยนเมื่อย้ายแผนก — R9)
    const params = [like, like, like, like, like, like, like];
    if (status === "employed") {
        conditions.push("(e.emp_termination_date IS NULL OR e.emp_termination_date >= ?)");
        params.push(today);
    }
    if (status === "terminated") {
        conditions.push("e.emp_termination_date < ?");
        params.push(today);
    }
    // ตัวกรองแผนก (ชิปในหน้ารายการ · U-3 2026-10-23)
    if (departmentId) {
        conditions.push("e.emp_department_id = ?");
        params.push(String(departmentId));
    }
    const where = conditions.join(" AND ");
    const [rows] = await conn.query(
        `SELECT e.emp_id, e.emp_code, e.emp_title, e.emp_first_name_th, e.emp_last_name_th, e.emp_nickname,
                e.emp_national_id, e.emp_position, e.emp_user_id, ${DATE_COLUMNS},
                d.dep_name AS department_name, d.dep_code AS department_code, b.branch_name_th AS branch_name,
                u.user_username AS user_username,
                COALESCE(e.emp_photo_url, u.user_avatar_url) AS photo_url,
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
                d.dep_name AS department_name, d.dep_code AS department_code, b.branch_name_th AS branch_name,
                b.branch_code, u.user_avatar_url,
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
    // รหัสล็อกเมื่อเข้ารอบเงินเดือนแล้ว (แก้วันเริ่มงาน/แผนกในฟอร์มไม่ได้ · ย้ายแผนกยังทำได้)
    const latestPayrollPeriod = await employeeCodeService.latestPayrollPeriod(conn, employeeId);
    return {
        ...employee,
        code_locked_by_payroll: latestPayrollPeriod,
        code_history: await employeeCodeService.listCodeHistory(conn, employeeId),
        cards: await employeeCodeService.listCards(conn, employeeId),
        transfer_range: await employeeCodeService.transferDateRange(conn, employee),
        // การเข้าระบบของบัญชีที่ผูก (ปิดเมื่อพ้นสภาพ · docs/plans/2026-10-18-user-employee-link.md ข้อ 2)
        login_access: await accountLinkService.loginAccessOf(conn, employee),
        emp_close_login_on_termination: employee.emp_close_login_on_termination === 1,
        emp_sso_enrolled: employee.emp_sso_enrolled === 1,
        emp_attendance_required: employee.emp_attendance_required === 1,
        // กะทำงานตามวันที่มีผล (ลงเวลาเข้า-ออกงาน A-1)
        schedules: await attendanceSetupService.listEmployeeSchedules(conn, employeeId),
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
    const [departments] = await conn.query(
        `SELECT d.dep_id, d.dep_name, d.dep_status, d.dep_code, d.dep_branch_id, b.branch_code, b.branch_name_th
         FROM tb_department d JOIN tb_branches b ON b.branch_id = d.dep_branch_id
         ORDER BY d.dep_code`,
    );
    const [branches] = await conn.query(
        "SELECT branch_id, branch_code, branch_name_th, branch_status FROM tb_branches ORDER BY branch_code",
    );
    const [users] = await conn.query(
        // ชื่อ เบอร์ อีเมล: ฟอร์มเพิ่มพนักงานเติมให้เองเมื่อเลือกบัญชี (2026-10-19 ผู้ใช้สั่ง — ไม่ต้องกรอกซ้ำ)
        `SELECT u.user_id, u.user_username, CONCAT(u.user_fname, ' ', u.user_lname) AS fullname, u.user_status,
                u.user_fname, u.user_lname, u.user_phone, u.user_email, u.user_avatar_url, u.user_branch_id,
                (SELECT e.emp_id FROM tb_employees e
                 WHERE e.emp_user_id = u.user_id AND (e.emp_termination_date IS NULL OR e.emp_termination_date >= ?)
                 LIMIT 1) AS linked_employee_id
         FROM tb_users u
         ORDER BY u.user_fname, u.user_lname`,
        [today],
    );
    // คนเดิมกลับมาทำงาน: ฟอร์มหาแถวที่พ้นสภาพแล้วของบัญชีที่เลือก แล้วเติมข้อมูลเดิมให้ (ใหม่สุดก่อน)
    // ไม่ส่งเลขประจำตัว (หน้ารายชื่อปิดบังไว้) — หาจากเลขประจำตัวใช้ findFormerByNationalId ทีละเลข
    const [formerEmployees] = await conn.query(
        `SELECT emp_id, emp_code, emp_user_id,
                CONCAT(emp_first_name_th, ' ', emp_last_name_th) AS full_name, emp_termination_date
         FROM tb_employees
         WHERE emp_termination_date < ? AND emp_user_id IS NOT NULL
         ORDER BY emp_termination_date DESC, emp_id DESC`,
        [today],
    );
    return { departments, branches, users, former_employees: formerEmployees };
}

/**
 * คนเดิมกลับมาทำงาน (ไม่มีบัญชีก็ได้): หาพนักงานที่พ้นสภาพแล้วจากเลขประจำตัว 13 หลัก — แถวใหม่สุด
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {unknown} nationalIdText
 */
async function findFormerByNationalId(conn, nationalIdText) {
    const digits = String(nationalIdText ?? "").replace(/\D/g, "");
    if (digits.length !== 13) return null;
    const [rows] = await conn.query(
        `SELECT emp_id, emp_code, emp_user_id,
                CONCAT(emp_first_name_th, ' ', emp_last_name_th) AS full_name, emp_termination_date
         FROM tb_employees
         WHERE emp_national_id = ? AND emp_termination_date < ?
         ORDER BY emp_termination_date DESC, emp_id DESC
         LIMIT 1`,
        [digits, todayBangkok()],
    );
    return rows[0] ?? null;
}

// ─── เพิ่ม / แก้ / ลบ ─────────────────────────────────────────────────────────────────────────

/**
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {object} employee ผ่าน employeeCreateSchema แล้ว (มี ecm_base_salary)
 * @param {{ user_id: string }} actor
 */
async function createEmployee(conn, employee, actor) {
    await assertEmployeeReferences(conn, employee, null);
    const department = await employeeCodeService.findDepartment(conn, employee.emp_department_id, true);
    const code = await employeeCodeService.issueCodeForNewEmployee(conn, department, employee.emp_hire_date);
    const employeeId = await generateDailyId("tb_employees", "emp_id", "EMP");
    await conn.query(
        `INSERT INTO tb_employees (emp_id, emp_code, emp_branch_id, ${EDITABLE_COLUMNS.join(", ")}, emp_created_by)
         VALUES (?, ?, ?, ${EDITABLE_COLUMNS.map(() => "?").join(", ")}, ?)`,
        [employeeId, code, department.dep_branch_id, ...toColumnValues(employee), actor.user_id],
    );
    await employeeCodeService.recordCode(conn, {
        employeeId,
        code,
        department,
        validFrom: employee.emp_hire_date,
        reason: "hire",
        actorId: actor.user_id,
    });
    await employeeCodeService.issueCard(conn, employeeId, "first_issue", { actorId: actor.user_id });
    await conn.query(
        `INSERT INTO tb_employee_compensations (ecm_employee_id, ecm_effective_from, ecm_base_salary, ecm_note, ecm_created_by)
         VALUES (?, ?, ?, 'เงินเดือนเริ่มงาน', ?)`,
        [employeeId, employee.emp_hire_date, employee.ecm_base_salary, actor.user_id],
    );
    // บัญชีที่ผูก: ชื่อ เบอร์ สาขา ตามพนักงาน (ข้อมูลตัวจริงที่เดียว)
    await accountLinkService.syncAccountFromEmployee(conn, employeeId);
    return { emp_id: employeeId, emp_code: code };
}

/**
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {string} employeeId
 * @param {object} employee ผ่าน employeeSchema แล้ว
 */
async function updateEmployee(conn, employeeId, employee, actor) {
    const existing = await lockEmployee(conn, employeeId);
    await assertEmployeeReferences(conn, employee, existing);
    const department = await employeeCodeService.findDepartment(
        conn,
        employee.emp_department_id,
        employee.emp_department_id !== existing.emp_department_id,
    );
    // วันเริ่มงาน/แผนกเปลี่ยน: ก่อนเข้ารอบเงินเดือนแรก = รหัสใหม่ · หลังจากนั้นทำไม่ได้ (ย้ายแผนกต้องใช้ปุ่มย้าย)
    const newCode = await employeeCodeService.prepareCorrection(conn, existing, employee, department);
    if (employee.emp_hire_date !== existing.emp_hire_date) {
        await moveFirstCompensation(conn, existing, employee.emp_hire_date);
    }
    await conn.query(
        `UPDATE tb_employees SET ${EDITABLE_COLUMNS.map((column) => `${column} = ?`).join(", ")}, emp_branch_id = ?, emp_code = ?
         WHERE emp_id = ?`,
        [...toColumnValues(employee), department.dep_branch_id, newCode ?? existing.emp_code, employeeId],
    );
    if (newCode) {
        await employeeCodeService.recordCode(conn, {
            employeeId,
            code: newCode,
            department,
            validFrom: employee.emp_hire_date,
            reason: "correction",
            note: "แก้วันเริ่มงาน/แผนกก่อนเข้ารอบเงินเดือนแรก",
            actorId: actor?.user_id ?? null,
        });
        await employeeCodeService.issueCard(conn, employeeId, "code_change", {
            voidReason: "แก้ข้อมูล รหัสพนักงานเปลี่ยน",
            actorId: actor?.user_id ?? null,
        });
    }
    await accountLinkService.syncAccountFromEmployee(conn, employeeId);
    return { emp_id: employeeId, emp_code: newCode ?? existing.emp_code, code_changed: Boolean(newCode) };
}

/** ย้ายแผนก/สาขา = รหัสใหม่ + บัตรใหม่ (ข้อ 3.3) */
async function transferEmployee(conn, employeeId, transfer, actor) {
    const existing = await lockEmployee(conn, employeeId);
    const result = await employeeCodeService.transferEmployee(conn, existing, transfer, actor);
    // สาขาของบัญชีที่ผูกเปลี่ยนตามแผนกใหม่
    await accountLinkService.syncAccountFromEmployee(conn, employeeId);
    return result;
}

/** ออกบัตรใหม่เอง (หาย/ชำรุด/ข้อมูลบนบัตรเปลี่ยน/หมดอายุ) — รหัสเดิม · ใบเดิมยกเลิก */
async function issueEmployeeCard(conn, employeeId, request, actor) {
    const existing = await lockEmployee(conn, employeeId);
    if (existing.emp_termination_date && existing.emp_termination_date < todayBangkok()) {
        throw new AppError(409, "EMPLOYEE_TERMINATED", "พนักงานคนนี้พ้นสภาพแล้ว ออกบัตรใหม่ไม่ได้");
    }
    const voidReasons = { lost: "บัตรหาย", damaged: "บัตรชำรุด", info_change: "ข้อมูลบนบัตรเปลี่ยน", expired: "บัตรหมดอายุ" };
    return employeeCodeService.issueCard(conn, employeeId, request.ec_reason, {
        note: request.ec_note,
        voidReason: voidReasons[request.ec_reason],
        actorId: actor.user_id,
    });
}

/**
 * ตั้ง/ลบรูปพนักงาน
 * - บัตรใบที่ใช้อยู่ที่ยังไม่ได้พิมพ์ เปลี่ยนรูปตามไปด้วย (บัตรใบแรกออกตอนเพิ่มพนักงาน ก่อนมีรูป)
 * - บัตรที่พิมพ์แล้วเก็บรูปของตอนออก · อยากได้รูปใหม่บนบัตร = ออกบัตรใหม่ (ข้อมูลบนบัตรเปลี่ยน)
 */
async function setEmployeePhoto(conn, employeeId, photoUrl) {
    await lockEmployee(conn, employeeId);
    await conn.query("UPDATE tb_employees SET emp_photo_url = ? WHERE emp_id = ?", [photoUrl, employeeId]);
    // ลบรูป = กลับไปใช้รูปโปรไฟล์บัญชีผู้ใช้ที่ผูก (ถ้ามี) เหมือนตอนออกบัตร
    const [result] = await conn.query(
        `UPDATE tb_employee_cards c
         JOIN tb_employees e ON e.emp_id = c.ec_employee_id
         LEFT JOIN tb_users u ON u.user_id = e.emp_user_id
         SET c.ec_photo_url = COALESCE(e.emp_photo_url, u.user_avatar_url)
         WHERE c.ec_employee_id = ? AND c.ec_voided_at IS NULL AND c.ec_printed_at IS NULL`,
        [employeeId],
    );
    return { emp_id: employeeId, emp_photo_url: photoUrl, is_pending_card_updated: result.affectedRows > 0 };
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
            `ลบพนักงานนี้ไม่ได้ เพราะมีลงเวลาแล้ว ${weekCount} สัปดาห์ · ใช้ "ตั้งพ้นสภาพ" แทน (ประวัติยังอยู่ครบ)`,
        );
    }
    const [[{ payrollCount }]] = await conn.query(
        "SELECT COUNT(*) AS payrollCount FROM tb_payroll_items WHERE pri_employee_id = ?",
        [employeeId],
    );
    if (Number(payrollCount) > 0) {
        throw new AppError(
            409,
            "EMPLOYEE_HAS_HISTORY",
            `ลบพนักงานนี้ไม่ได้ เพราะอยู่ในรอบเงินเดือนแล้ว ${payrollCount} รอบ · ใช้ "ตั้งพ้นสภาพ" แทน (ประวัติยังอยู่ครบ)`,
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
            `ลบพนักงานนี้ไม่ได้ เพราะมีคำขอลาแล้ว ${leaveCount} ใบ · ใช้ "ตั้งพ้นสภาพ" แทน (ประวัติยังอยู่ครบ)`,
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
    // ปิดการเข้าระบบหลังวันสุดท้าย (ค่าเริ่ม = ปิด · K4) — ห้ามปิดผู้ดูแลระบบคนสุดท้าย (R4)
    const closeLogin = termination.emp_close_login_on_termination;
    if (closeLogin) await accountLinkService.assertNotLastAdmin(conn, existing.emp_user_id);
    await conn.query(
        `UPDATE tb_employees SET emp_termination_date = ?, emp_termination_reason = ?, emp_close_login_on_termination = ?
         WHERE emp_id = ?`,
        [termination.emp_termination_date, termination.emp_termination_reason, closeLogin ? 1 : 0, employeeId],
    );
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
    // กลับเป็นพนักงานปัจจุบัน → บัญชีเข้าได้อีก และชื่อ เบอร์ สาขากลับมาตามพนักงาน
    await accountLinkService.syncAccountFromEmployee(conn, employeeId);
    return { emp_id: employeeId };
}

/**
 * เปิด/ปิดการเข้าระบบหลังพ้นสภาพ (ติ๊กที่หน้าพนักงาน) — มีผลตามวันทำงานวันสุดท้าย ไม่ได้ปิดทันที
 * @param {{ emp_close_login_on_termination: boolean }} request
 */
async function setLoginClosure(conn, employeeId, request) {
    const existing = await lockEmployee(conn, employeeId);
    if (!existing.emp_termination_date) {
        throw new AppError(409, "EMPLOYEE_NOT_TERMINATED", "ยังไม่ได้ตั้งวันพ้นสภาพ · ตั้งพ้นสภาพก่อน แล้วค่อยเลือกปิดการเข้าระบบ");
    }
    const closeLogin = request.emp_close_login_on_termination;
    if (closeLogin) await accountLinkService.assertNotLastAdmin(conn, existing.emp_user_id);
    await conn.query("UPDATE tb_employees SET emp_close_login_on_termination = ? WHERE emp_id = ?", [
        closeLogin ? 1 : 0,
        employeeId,
    ]);
    return { emp_id: employeeId, emp_close_login_on_termination: closeLogin };
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
            ecm_effective_from: "ต้องหลังวันเริ่มงาน · ถ้าเงินเดือนเริ่มงานผิด ให้กดแก้ที่แถวเงินเดือนเริ่มงาน",
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
            "ลบเงินเดือนเริ่มงานไม่ได้ (ต้องมีเงินเดือนตั้งแต่วันแรกเสมอ) · ถ้าตัวเลขผิด ให้กดแก้ที่แถวนั้นแทน",
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
        `SELECT emp_id, emp_code, emp_national_id, emp_user_id, emp_department_id,
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
        if (column === "emp_attendance_required") return employee.emp_attendance_required ? 1 : 0;
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

    // แผนก/สาขา ตรวจที่ employeeCodeService.findDepartment (รหัสพนักงานประกอบจากรหัสแผนก)
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
            emp_hire_date: `วันเริ่มงานต้องก่อนอัตราเงินเดือนถัดไป (มีผล ${second.ecm_effective_from}) · ลบอัตรานั้นก่อนถ้าจะเลื่อน`,
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
    findFormerByNationalId,
    createEmployee,
    updateEmployee,
    deleteEmployee,
    transferEmployee,
    issueEmployeeCard,
    setEmployeePhoto,
    terminateEmployee,
    reinstateEmployee,
    setLoginClosure,
    addCompensation,
    updateCompensation,
    deleteCompensation,
    addRecurringItem,
    endRecurringItem,
    deleteRecurringItem,
    compensationOn,
    maskNationalId,
};
