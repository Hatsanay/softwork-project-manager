// รหัสพนักงาน · ประวัติรหัส · ย้ายแผนก/สาขา · บัตรพนักงาน (2026-10-18 — docs/plans/2026-10-18-employee-department-codes.md)
//
// - รหัสออกตอนสร้างพนักงาน · แก้วันเริ่มงาน/แผนกก่อนเข้ารอบเงินเดือนแรก = ออกใหม่ (เหตุผล correction)
// - ย้ายแผนก/สาขา (หลังเข้ารอบเงินเดือนแล้วก็ทำได้) = รหัสใหม่ด้วยวันเริ่มงานเดิม (T1-ก) + ประวัติ + บัตรใหม่ (ข้อ 3.3)
// - รหัสเปลี่ยนทุกครั้ง: ปิดแถวรหัสเดิมใน tb_employee_codes · บัตรที่ใช้อยู่ถูกยกเลิก · ออกบัตรใบใหม่รอพิมพ์
// - บัตรที่ใช้ได้มีทีละใบต่อคน (R10) — ยกเลิกใบเดิมกับออกใบใหม่อยู่ใน transaction เดียวกันเสมอ
// - ทุกฟังก์ชันที่เปลี่ยนข้อมูลรับ conn ใน transaction และผู้เรียกล็อกแถวพนักงานแล้ว (lockEmployee)
const { AppError } = require("../utils/app-error");
const { todayBangkok } = require("../utils/bangkok-time");
const { issueEmployeeCode } = require("../utils/employee-code");

// บัตรใช้ได้กี่ปี: ตั้งที่ตั้งค่าบุคคล (ps_card_valid_years) · ยังไม่มีแถวตั้งค่า = 3 ปี · ใกล้หมดอายุกี่วันเข้าคิว "บัตรใกล้หมดอายุ"
const DEFAULT_CARD_VALID_YEARS = 3;
const CARD_EXPIRY_WARNING_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

function shiftDate(dateText, days) {
    return new Date(Date.parse(`${dateText}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function firstDayOfNextMonth(period) {
    const [year, month] = period.split("-").map(Number);
    return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
}

/**
 * แผนกที่พนักงานจะสังกัด (รหัสแผนก + สาขา) · ที่เลือกใหม่ต้องเปิดใช้งาน
 * @param {boolean} isNewChoice false = แผนกเดิมของพนักงาน (ถูกปิดไปแล้วก็ยังใช้ต่อได้)
 */
async function findDepartment(conn, departmentId, isNewChoice) {
    const [[department]] = await conn.query(
        `SELECT d.dep_id, d.dep_name, d.dep_code, d.dep_status, d.dep_branch_id, b.branch_name_th, b.branch_status
         FROM tb_department d JOIN tb_branches b ON b.branch_id = d.dep_branch_id
         WHERE d.dep_id = ?`,
        [departmentId],
    );
    if (!department) {
        throw new AppError(400, "VALIDATION", "ไม่พบแผนกนี้", { emp_department_id: "ไม่พบแผนกนี้ กรุณาเลือกใหม่" });
    }
    if (isNewChoice && (department.dep_status !== "active" || department.branch_status !== "active")) {
        throw new AppError(400, "VALIDATION", "แผนกนี้ถูกปิดใช้งาน", {
            emp_department_id: "แผนก (หรือสาขาของแผนก) นี้ถูกปิดใช้งาน",
        });
    }
    return department;
}

/** รอบเงินเดือนล่าสุด (ที่ไม่ยกเลิก) ที่มีพนักงานคนนี้ — "YYYY-MM" หรือ null = ยังไม่เคยเข้ารอบ */
async function latestPayrollPeriod(conn, employeeId) {
    const [[row]] = await conn.query(
        `SELECT MAX(r.pr_period) AS period
         FROM tb_payroll_items i JOIN tb_payroll_runs r ON r.pr_id = i.pri_run_id
         WHERE i.pri_employee_id = ? AND r.pr_status <> 'cancelled'`,
        [employeeId],
    );
    return row?.period ?? null;
}

/**
 * บันทึกรหัสใหม่ในประวัติ: ปิดแถวที่ใช้อยู่ (ถึงวันก่อน validFrom) แล้วเปิดแถวใหม่
 * @param {{ employeeId: string, code: string, department: { dep_id: string, dep_branch_id: string }, validFrom: string,
 *           reason: "hire" | "correction" | "transfer", note?: string | null, actorId: string | null }} change
 */
async function recordCode(conn, change) {
    await conn.query(
        `UPDATE tb_employee_codes SET ecd_valid_to = GREATEST(ecd_valid_from, ?)
         WHERE ecd_employee_id = ? AND ecd_valid_to IS NULL`,
        [shiftDate(change.validFrom, -1), change.employeeId],
    );
    await conn.query(
        `INSERT INTO tb_employee_codes
            (ecd_employee_id, ecd_code, ecd_department_id, ecd_branch_id, ecd_valid_from, ecd_reason, ecd_note, ecd_created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            change.employeeId,
            change.code,
            change.department.dep_id,
            change.department.dep_branch_id,
            change.validFrom,
            change.reason,
            change.note ?? null,
            change.actorId,
        ],
    );
}

// ─── บัตร ───────────────────────────────────────────────────────────────────────────────────

/** ยกเลิกบัตรที่ใช้อยู่ (ถ้ามี) */
async function voidActiveCard(conn, employeeId, voidReason) {
    await conn.query(
        "UPDATE tb_employee_cards SET ec_voided_at = NOW(), ec_void_reason = ? WHERE ec_employee_id = ? AND ec_voided_at IS NULL",
        [voidReason, employeeId],
    );
}

/**
 * ออกบัตรใบใหม่จากข้อมูลพนักงานตอนนี้ (snapshot) — ยกเลิกใบเดิมก่อนเสมอ
 * วันหมดอายุ = วันออก (เวลาไทย) + อายุบัตรตามตั้งค่า ณ ตอนออก · เปลี่ยนตั้งค่าภายหลังบัตรเดิมไม่เปลี่ยน
 * @param {"first_issue" | "code_change" | "lost" | "damaged" | "info_change" | "expired"} reason
 */
async function issueCard(conn, employeeId, reason, { note = null, voidReason = null, actorId = null } = {}) {
    const [[employee]] = await conn.query(
        `SELECT e.emp_code, e.emp_title, e.emp_first_name_th, e.emp_last_name_th, e.emp_first_name_en, e.emp_last_name_en,
                e.emp_position, d.dep_name, b.branch_name_th,
                -- รูปบนบัตร (T3-ก): รูปพนักงาน → รูปโปรไฟล์บัญชีผู้ใช้ที่ผูก → ไม่มี (หน้าพิมพ์ใช้ตัวย่อชื่อ)
                COALESCE(e.emp_photo_url, u.user_avatar_url) AS photo_url
         FROM tb_employees e
         JOIN tb_department d ON d.dep_id = e.emp_department_id
         LEFT JOIN tb_branches b ON b.branch_id = e.emp_branch_id
         LEFT JOIN tb_users u ON u.user_id = e.emp_user_id
         WHERE e.emp_id = ?`,
        [employeeId],
    );
    await voidActiveCard(conn, employeeId, voidReason ?? "ออกบัตรใบใหม่แทน");
    const [[{ lastSeq }]] = await conn.query(
        "SELECT COALESCE(MAX(ec_seq), 0) AS lastSeq FROM tb_employee_cards WHERE ec_employee_id = ?",
        [employeeId],
    );
    const nameEnglish = [employee.emp_first_name_en, employee.emp_last_name_en].filter(Boolean).join(" ");
    const [[settings]] = await conn.query("SELECT ps_card_valid_years FROM tb_payroll_settings WHERE ps_id = 1");
    const validYears = settings?.ps_card_valid_years ?? DEFAULT_CARD_VALID_YEARS;
    await conn.query(
        `INSERT INTO tb_employee_cards
            (ec_employee_id, ec_seq, ec_emp_code, ec_name_th, ec_name_en, ec_position, ec_department_name, ec_branch_name,
             ec_photo_url, ec_reason, ec_note, ec_issued_by, ec_expires_on)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(?, INTERVAL ? YEAR))`,
        [
            employeeId,
            Number(lastSeq) + 1,
            employee.emp_code,
            `${employee.emp_title ?? ""}${employee.emp_first_name_th} ${employee.emp_last_name_th}`,
            nameEnglish || null,
            employee.emp_position,
            employee.dep_name,
            employee.branch_name_th,
            employee.photo_url,
            reason,
            note,
            actorId,
            todayBangkok(),
            validYears,
        ],
    );
    return { ec_seq: Number(lastSeq) + 1 };
}

// ─── รหัสตอนสร้าง / แก้ข้อมูล ────────────────────────────────────────────────────────────────

/**
 * พนักงานใหม่: ออกรหัส + แถวประวัติ (hire) — บัตรใบแรกออกหลัง insert แล้ว (issueCard)
 * @returns {Promise<string>} รหัสพนักงาน
 */
async function issueCodeForNewEmployee(conn, department, hireDate) {
    return issueEmployeeCode(conn, department.dep_code, hireDate);
}

/**
 * ก่อนแก้ข้อมูลพนักงาน: วันเริ่มงาน/แผนกเปลี่ยน → ตรวจว่าทำได้ไหม และคืนรหัสใหม่ (หรือ null = รหัสเดิม)
 * - เข้ารอบเงินเดือนแล้ว: วันเริ่มงานแก้ไม่ได้ · แผนกต้องใช้ "ย้ายแผนก / สาขา"
 * - ยังไม่เข้ารอบ: ออกรหัสใหม่ (แก้ข้อมูลที่กรอกผิด)
 */
async function prepareCorrection(conn, existing, employee, newDepartment) {
    const isHireDateChanged = existing.emp_hire_date !== employee.emp_hire_date;
    const isDepartmentChanged = existing.emp_department_id !== employee.emp_department_id;
    if (!isHireDateChanged && !isDepartmentChanged) return null;

    const period = await latestPayrollPeriod(conn, existing.emp_id);
    if (period) {
        const fields = {};
        if (isHireDateChanged) {
            fields.emp_hire_date = `เข้ารอบเงินเดือน ${period} แล้ว แก้วันเริ่มงานไม่ได้ (รหัสพนักงานล็อกแล้ว)`;
        }
        if (isDepartmentChanged) {
            fields.emp_department_id = 'เข้ารอบเงินเดือนแล้ว เปลี่ยนแผนกที่นี่ไม่ได้ · ใช้ปุ่ม "ย้ายแผนก / สาขา" ที่หน้าพนักงาน';
        }
        throw new AppError(400, "VALIDATION", "ข้อมูลบางอย่างใช้ไม่ได้ กรุณาแก้ตามข้อความใต้ช่อง", fields);
    }
    return issueEmployeeCode(conn, newDepartment.dep_code, employee.emp_hire_date);
}

// ─── ย้ายแผนก / สาขา ──────────────────────────────────────────────────────────────────────────

/**
 * วันที่มีผลที่เลือกได้ (T2-ก): วันนี้ หรือย้อนได้ แต่ไม่ก่อนวันแรกของเดือนที่ยังไม่ทำเงินเดือน · ไม่ก่อนวันเริ่มใช้รหัสปัจจุบัน
 * @returns {Promise<{ minDate: string, maxDate: string, latestPeriod: string | null }>}
 */
async function transferDateRange(conn, employee) {
    const today = todayBangkok();
    const latestPeriod = await latestPayrollPeriod(conn, employee.emp_id);
    const [[current]] = await conn.query(
        `SELECT DATE_FORMAT(ecd_valid_from, '%Y-%m-%d') AS validFrom FROM tb_employee_codes
         WHERE ecd_employee_id = ? AND ecd_valid_to IS NULL ORDER BY ecd_id DESC LIMIT 1`,
        [employee.emp_id],
    );
    const firstOfMonth = `${today.slice(0, 7)}-01`;
    const candidates = [
        firstOfMonth,
        employee.emp_hire_date,
        latestPeriod ? firstDayOfNextMonth(latestPeriod) : null,
        // วันแรกที่ใช้รหัสปัจจุบัน +1 (ย้ายวันเดียวกับรหัสเดิมเริ่มไม่ได้ — ประวัติช่วงวันที่จะซ้อน)
        current?.validFrom ? shiftDate(current.validFrom, 1) : null,
    ].filter(Boolean);
    const minDate = candidates.reduce((latest, date) => (date > latest ? date : latest));
    return { minDate, maxDate: today, latestPeriod };
}

/**
 * ย้ายแผนก/สาขา → รหัสใหม่ (แผนกใหม่ + วันเริ่มงานเดิม + ลำดับถัดไป) · ประวัติ · ยกเลิกบัตรเดิม · บัตรใหม่รอพิมพ์
 * @param {object} employee แถวที่ล็อกแล้ว (lockEmployee)
 * @param {{ emp_department_id: string, effective_date: string, reason: string }} transfer
 */
async function transferEmployee(conn, employee, transfer, actor) {
    const today = todayBangkok();
    if (employee.emp_termination_date && employee.emp_termination_date < today) {
        throw new AppError(409, "EMPLOYEE_TERMINATED", "พนักงานคนนี้พ้นสภาพแล้ว ย้ายแผนกไม่ได้");
    }
    if (employee.emp_department_id === transfer.emp_department_id) {
        throw new AppError(409, "ALREADY_IN_DEPARTMENT", "พนักงานอยู่แผนกนี้อยู่แล้ว · อาจมีคนย้ายไปก่อน กรุณาโหลดหน้าใหม่", {
            emp_department_id: "เลือกแผนกอื่นที่ไม่ใช่แผนกปัจจุบัน",
        });
    }
    const department = await findDepartment(conn, transfer.emp_department_id, true);
    const range = await transferDateRange(conn, employee);
    if (transfer.effective_date > range.maxDate || transfer.effective_date < range.minDate) {
        throw new AppError(400, "VALIDATION", "วันที่มีผลอยู่นอกช่วงที่เลือกได้", {
            effective_date: `เลือกได้ตั้งแต่ ${range.minDate} ถึง ${range.maxDate} (วันนี้) · ย้อนได้เฉพาะเดือนที่ยังไม่ทำเงินเดือน`,
        });
    }

    const oldCode = employee.emp_code;
    const code = await issueEmployeeCode(conn, department.dep_code, employee.emp_hire_date);
    await conn.query(
        "UPDATE tb_employees SET emp_code = ?, emp_department_id = ?, emp_branch_id = ? WHERE emp_id = ?",
        [code, department.dep_id, department.dep_branch_id, employee.emp_id],
    );
    await recordCode(conn, {
        employeeId: employee.emp_id,
        code,
        department,
        validFrom: transfer.effective_date,
        reason: "transfer",
        note: transfer.reason,
        actorId: actor.user_id,
    });
    await issueCard(conn, employee.emp_id, "code_change", {
        note: `ย้ายไป ${department.dep_name} (${department.branch_name_th})`,
        voidReason: "ย้ายแผนก/สาขา",
        actorId: actor.user_id,
    });
    return { emp_id: employee.emp_id, old_code: oldCode, emp_code: code };
}

// ─── อ่าน ────────────────────────────────────────────────────────────────────────────────────

async function listCodeHistory(conn, employeeId) {
    const [rows] = await conn.query(
        `SELECT c.ecd_id, c.ecd_code, c.ecd_reason, c.ecd_note,
                DATE_FORMAT(c.ecd_valid_from, '%Y-%m-%d') AS ecd_valid_from, DATE_FORMAT(c.ecd_valid_to, '%Y-%m-%d') AS ecd_valid_to,
                d.dep_name, d.dep_code, b.branch_name_th, CONCAT(u.user_fname, ' ', u.user_lname) AS created_by_name, c.ecd_created_at
         FROM tb_employee_codes c
         LEFT JOIN tb_department d ON d.dep_id = c.ecd_department_id
         LEFT JOIN tb_branches b ON b.branch_id = c.ecd_branch_id
         LEFT JOIN tb_users u ON u.user_id = c.ecd_created_by
         WHERE c.ecd_employee_id = ?
         ORDER BY c.ecd_valid_from DESC, c.ecd_id DESC`,
        [employeeId],
    );
    return rows;
}

async function listCards(conn, employeeId) {
    const [rows] = await conn.query(
        `SELECT c.*, DATE_FORMAT(c.ec_expires_on, '%Y-%m-%d') AS ec_expires_on,
                CONCAT(u.user_fname, ' ', u.user_lname) AS issued_by_name
         FROM tb_employee_cards c LEFT JOIN tb_users u ON u.user_id = c.ec_issued_by
         WHERE c.ec_employee_id = ? ORDER BY c.ec_seq DESC`,
        [employeeId],
    );
    return rows;
}

const STILL_EMPLOYED_SQL = "(e.emp_termination_date IS NULL OR e.emp_termination_date >= ?)";

/**
 * คิวงานบัตรของฝ่ายบุคคล
 * - pending_print: บัตรที่ใช้อยู่แต่ยังไม่ได้พิมพ์ (คนที่พ้นสภาพแล้วไม่ต้องพิมพ์ให้)
 * - not_returned: บัตรที่ยกเลิกแล้วยังไม่ได้เก็บคืน + บัตรที่ใช้อยู่ของคนที่พ้นสภาพแล้ว
 * - expiring: บัตรที่ใช้อยู่ที่หมดอายุแล้ว หรือจะหมดภายใน CARD_EXPIRY_WARNING_DAYS วัน (ของคนที่ยังทำงาน)
 */
async function listCardQueue(conn, kind) {
    const today = todayBangkok();
    const queues = {
        pending_print: {
            condition: `c.ec_voided_at IS NULL AND c.ec_printed_at IS NULL AND ${STILL_EMPLOYED_SQL}`,
            params: [today],
            order: "c.ec_issued_at, c.ec_id",
        },
        not_returned: {
            condition: `c.ec_returned_at IS NULL AND c.ec_printed_at IS NOT NULL
               AND (c.ec_voided_at IS NOT NULL OR (e.emp_termination_date IS NOT NULL AND e.emp_termination_date < ?))`,
            params: [today],
            order: "c.ec_issued_at, c.ec_id",
        },
        expiring: {
            condition: `c.ec_voided_at IS NULL AND c.ec_expires_on <= DATE_ADD(?, INTERVAL ? DAY) AND ${STILL_EMPLOYED_SQL}`,
            params: [today, CARD_EXPIRY_WARNING_DAYS, today],
            order: "c.ec_expires_on, c.ec_id",
        },
    };
    const queue = queues[kind];
    const [rows] = await conn.query(
        `SELECT c.ec_id, c.ec_employee_id, c.ec_seq, c.ec_emp_code, c.ec_name_th, c.ec_department_name, c.ec_branch_name,
                c.ec_reason, c.ec_issued_at, c.ec_printed_at, c.ec_voided_at, c.ec_void_reason,
                DATE_FORMAT(c.ec_expires_on, '%Y-%m-%d') AS ec_expires_on,
                DATE_FORMAT(e.emp_termination_date, '%Y-%m-%d') AS emp_termination_date
         FROM tb_employee_cards c JOIN tb_employees e ON e.emp_id = c.ec_employee_id
         WHERE ${queue.condition}
         ORDER BY ${queue.order}`,
        queue.params,
    );
    return rows;
}

async function findCard(conn, employeeId, cardId, { forUpdate = false } = {}) {
    const [[card]] = await conn.query(
        `SELECT * FROM tb_employee_cards WHERE ec_id = ? AND ec_employee_id = ?${forUpdate ? " FOR UPDATE" : ""}`,
        [cardId, employeeId],
    );
    if (!card) throw new AppError(404, "CARD_NOT_FOUND", "ไม่พบบัตรใบนี้ อาจถูกลบไปแล้ว กรุณาโหลดหน้าใหม่");
    return card;
}

/** พิมพ์แล้ว (ครั้งแรก) — บันทึกตอนกดพิมพ์ในหน้าพิมพ์บัตร */
async function markCardPrinted(conn, employeeId, cardId) {
    await findCard(conn, employeeId, cardId, { forUpdate: true });
    await conn.query("UPDATE tb_employee_cards SET ec_printed_at = COALESCE(ec_printed_at, NOW()) WHERE ec_id = ?", [
        cardId,
    ]);
    return { ec_id: Number(cardId) };
}

/**
 * เก็บบัตรคืนแล้ว — ได้เฉพาะบัตรที่ยกเลิกแล้ว หรือบัตรของคนที่พ้นสภาพแล้ว (ยกเลิกให้พร้อมกัน)
 */
async function markCardReturned(conn, employeeId, cardId) {
    const card = await findCard(conn, employeeId, cardId, { forUpdate: true });
    if (card.ec_returned_at) throw new AppError(409, "CARD_ALREADY_RETURNED", "บันทึกว่าคืนบัตรใบนี้ไปแล้ว");
    if (!card.ec_voided_at) {
        const [[employee]] = await conn.query(
            "SELECT DATE_FORMAT(emp_termination_date, '%Y-%m-%d') AS terminationDate FROM tb_employees WHERE emp_id = ?",
            [employeeId],
        );
        if (!employee?.terminationDate || employee.terminationDate >= todayBangkok()) {
            throw new AppError(409, "CARD_STILL_ACTIVE", "บัตรใบนี้ยังใช้งานอยู่ · บันทึกคืนได้เฉพาะบัตรที่ยกเลิกแล้วหรือของคนที่พ้นสภาพแล้ว");
        }
        await conn.query("UPDATE tb_employee_cards SET ec_voided_at = NOW(), ec_void_reason = 'พ้นสภาพพนักงาน' WHERE ec_id = ?", [
            cardId,
        ]);
    }
    await conn.query("UPDATE tb_employee_cards SET ec_returned_at = NOW() WHERE ec_id = ?", [cardId]);
    return { ec_id: Number(cardId) };
}

module.exports = {
    findDepartment,
    latestPayrollPeriod,
    recordCode,
    issueCard,
    voidActiveCard,
    issueCodeForNewEmployee,
    prepareCorrection,
    transferDateRange,
    transferEmployee,
    listCodeHistory,
    listCards,
    listCardQueue,
    findCard,
    markCardPrinted,
    markCardReturned,
};
