// WFH (ทำงานที่บ้าน · 2026-10-24) — ผู้ใช้ตอบ: ตั้งรายคน + ขอรายวัน · ไม่ตรวจตำแหน่ง (บันทึกพิกัด) · กดเข้า/ออกอย่างเดียว
//
// - วัน WFH = วันในสัปดาห์ที่ตั้งไว้ (tb_employees.emp_wfh_weekdays · ฝ่ายบุคคลตั้ง) หรือวันที่คำขอ WFH อนุมัติแล้ว
// - วัน WFH กดเข้า/ออกได้ทุกที่ ไม่ต้องใส่เหตุผล · การกดติดป้าย WFH (ไม่ใช่นอกจุด) · สาย/ขาด/OT คิดเหมือนวันปกติ
// - ขอ WFH: วันนี้หรือหลังจากนี้ (ขอย้อนหลังไม่ได้ เพราะการกดของวันนั้นบันทึกไปแล้ว) · ต้องเป็นวันทำงานของกะ
//   ไม่ใช่วัน WFH ประจำอยู่แล้ว · ขอซ้ำวันเดียวกัน (รอ/อนุมัติแล้ว) ไม่ได้ · เดือนที่ปิดรอบเงินเดือนแล้วไม่ได้
// - ผู้อนุมัติ = approveTimesheet ("อนุมัติลงเวลา") · ของตัวเองไม่ได้ · ไม่อนุมัติต้องมีเหตุผล
// - ยกเลิกเองได้: รออนุมัติ หรืออนุมัติแล้วแต่ยังไม่ถึงวัน
const { AppError } = require("../utils/app-error");
const { nowBangkokText, todayBangkok } = require("../utils/bangkok-time");
const { weekdayIndex } = require("../shared/payroll-math.mjs");
const { findLinkedEmployee } = require("./linked-employee.service");
const { assertPeriodsOpen } = require("./payroll-lock.service");
const attendanceSetup = require("./attendance-setup.service");

const NO_WFH_DAYS = "0000000";

const WFH_COLUMNS = `w.wfh_id, w.wfh_employee_id, DATE_FORMAT(w.wfh_date, '%Y-%m-%d') AS wfh_date, w.wfh_reason, w.wfh_status,
    DATE_FORMAT(w.wfh_decided_at, '%Y-%m-%d %H:%i:%s') AS wfh_decided_at, w.wfh_decision_note,
    DATE_FORMAT(w.wfh_created_at, '%Y-%m-%d %H:%i:%s') AS wfh_created_at,
    CONCAT(decider.user_fname, ' ', decider.user_lname) AS decided_by_name`;

function validationError(fields, message = "คำขอ WFH บางช่องใช้ไม่ได้ กรุณาแก้ตามข้อความใต้ช่อง") {
    return new AppError(400, "VALIDATION", message, fields);
}

function notFound() {
    return new AppError(404, "WFH_NOT_FOUND", "ไม่พบคำขอ WFH นี้ กรุณาโหลดหน้าใหม่");
}

/**
 * ข้อมูล WFH ของพนักงานในช่วงวัน: วันประจำ + วันที่อนุมัติแล้ว
 * @returns {Promise<{ weekdays: string, approvedDates: Set<string> }>}
 */
async function wfhInfoOf(conn, employeeId, fromDate, toDate) {
    const [[employee]] = await conn.query("SELECT emp_wfh_weekdays FROM tb_employees WHERE emp_id = ?", [employeeId]);
    const [rows] = await conn.query(
        `SELECT DATE_FORMAT(wfh_date, '%Y-%m-%d') AS wfh_date FROM tb_wfh_requests
         WHERE wfh_employee_id = ? AND wfh_status = 'approved' AND wfh_date BETWEEN ? AND ?`,
        [employeeId, fromDate, toDate],
    );
    return {
        weekdays: employee?.emp_wfh_weekdays ?? NO_WFH_DAYS,
        approvedDates: new Set(rows.map((row) => row.wfh_date)),
    };
}

/** วันนี้เป็นวัน WFH ไหม (วันประจำ หรือคำขออนุมัติแล้ว) */
function isWfhOn(info, dateText) {
    return info.weekdays[weekdayIndex(dateText)] === "1" || info.approvedDates.has(dateText);
}

async function requireWfhEmployee(conn, userId, options) {
    const employee = await findLinkedEmployee(conn, userId, options);
    if (!employee) throw new AppError(409, "NOT_AN_EMPLOYEE", "บัญชีของคุณยังไม่ได้ผูกกับพนักงาน · ติดต่อฝ่ายบุคคลก่อน");
    return employee;
}

/** ขอ WFH รายวัน */
async function createWfh(conn, user, request) {
    const employee = await requireWfhEmployee(conn, user.user_id, { forUpdate: true });
    const date = request.wfh_date;
    if (date < todayBangkok()) throw validationError({ wfh_date: "ขอย้อนหลังไม่ได้ · ขอได้ตั้งแต่วันนี้เป็นต้นไป" });
    if (date < employee.emp_hire_date) throw validationError({ wfh_date: `ก่อนวันเริ่มงาน (${employee.emp_hire_date}) ไม่ได้` });
    if (employee.emp_termination_date && date > employee.emp_termination_date) {
        throw validationError({ wfh_date: `หลังวันทำงานวันสุดท้าย (${employee.emp_termination_date}) ไม่ได้` });
    }
    await assertPeriodsOpen(conn, [date], "WFH");
    const { dates } = await attendanceSetup.workingDatesOf(conn, employee.emp_id, date, date);
    if (dates.length === 0) throw validationError({ wfh_date: "วันนี้เป็นวันหยุดของกะ ไม่ต้องขอ WFH" });
    const info = await wfhInfoOf(conn, employee.emp_id, date, date);
    if (info.weekdays[weekdayIndex(date)] === "1") {
        throw validationError({ wfh_date: "วันนี้เป็นวัน WFH ประจำของคุณอยู่แล้ว ไม่ต้องขอ" });
    }
    const [[duplicate]] = await conn.query(
        `SELECT wfh_id FROM tb_wfh_requests WHERE wfh_employee_id = ? AND wfh_date = ? AND wfh_status IN ('pending', 'approved')`,
        [employee.emp_id, date],
    );
    if (duplicate) throw validationError({ wfh_date: "ขอ WFH วันนี้ไปแล้ว (รออนุมัติหรืออนุมัติแล้ว)" });
    const [result] = await conn.query(
        "INSERT INTO tb_wfh_requests (wfh_employee_id, wfh_date, wfh_reason, wfh_created_by) VALUES (?, ?, ?, ?)",
        [employee.emp_id, date, request.wfh_reason, user.user_id],
    );
    return { wfh_id: result.insertId };
}

/** คำขอ WFH ของฉัน (รอทั้งหมด + 60 วันล่าสุด) */
async function listMine(conn, employeeId) {
    const [rows] = await conn.query(
        `SELECT ${WFH_COLUMNS}
         FROM tb_wfh_requests w LEFT JOIN tb_users decider ON decider.user_id = w.wfh_decided_by
         WHERE w.wfh_employee_id = ? AND (w.wfh_status = 'pending' OR w.wfh_date >= DATE_SUB(CURDATE(), INTERVAL 60 DAY))
         ORDER BY w.wfh_status = 'pending' DESC, w.wfh_date DESC, w.wfh_id DESC`,
        [employeeId],
    );
    return rows;
}

async function lockWfh(conn, wfhId) {
    const [[row]] = await conn.query(
        `SELECT wfh_id, wfh_employee_id, DATE_FORMAT(wfh_date, '%Y-%m-%d') AS wfh_date, wfh_status
         FROM tb_wfh_requests WHERE wfh_id = ? FOR UPDATE`,
        [wfhId],
    );
    if (!row) throw notFound();
    return row;
}

/** ยกเลิกของตัวเอง: รออนุมัติ หรืออนุมัติแล้วแต่ยังไม่ถึงวัน */
async function cancelWfh(conn, user, wfhId) {
    const employee = await findLinkedEmployee(conn, user.user_id);
    const row = await lockWfh(conn, wfhId);
    if (!employee || row.wfh_employee_id !== employee.emp_id) throw notFound();
    const canCancel = row.wfh_status === "pending" || (row.wfh_status === "approved" && row.wfh_date > todayBangkok());
    if (!canCancel) {
        throw new AppError(409, "WFH_NOT_CANCELLABLE", "ยกเลิกได้เฉพาะคำขอที่รออนุมัติ หรืออนุมัติแล้วแต่ยังไม่ถึงวัน");
    }
    await conn.query("UPDATE tb_wfh_requests SET wfh_status = 'cancelled' WHERE wfh_id = ?", [wfhId]);
    return { wfh_id: wfhId };
}

/** คำขอ WFH ที่รออนุมัติทั้งบริษัท (ไม่รวมของตัวเอง) */
async function listPending(conn, user) {
    const own = await findLinkedEmployee(conn, user.user_id);
    const [rows] = await conn.query(
        `SELECT ${WFH_COLUMNS}, e.emp_code, e.emp_nickname, CONCAT(e.emp_first_name_th, ' ', e.emp_last_name_th) AS employee_name
         FROM tb_wfh_requests w
         JOIN tb_employees e ON e.emp_id = w.wfh_employee_id
         LEFT JOIN tb_users decider ON decider.user_id = w.wfh_decided_by
         WHERE w.wfh_status = 'pending' AND w.wfh_employee_id <> ?
         ORDER BY w.wfh_date, w.wfh_id`,
        [own?.emp_id ?? ""],
    );
    return rows;
}

async function decide(conn, user, wfhId, status, note) {
    const row = await lockWfh(conn, wfhId);
    if (row.wfh_status !== "pending") throw new AppError(409, "WFH_NOT_PENDING", "คำขอนี้ไม่ได้รออนุมัติแล้ว กรุณาโหลดหน้าใหม่");
    const own = await findLinkedEmployee(conn, user.user_id);
    if (own && own.emp_id === row.wfh_employee_id) {
        throw new AppError(409, "WFH_OWN", "อนุมัติหรือไม่อนุมัติ WFH ของตัวเองไม่ได้ · ให้ผู้อนุมัติคนอื่นตัดสิน");
    }
    await conn.query(
        "UPDATE tb_wfh_requests SET wfh_status = ?, wfh_decided_by = ?, wfh_decided_at = ?, wfh_decision_note = ? WHERE wfh_id = ?",
        [status, user.user_id, nowBangkokText(), note, wfhId],
    );
    return { wfh_id: wfhId };
}

const approveWfh = (conn, user, wfhId) => decide(conn, user, wfhId, "approved", null);
const rejectWfh = (conn, user, wfhId, reason) => decide(conn, user, wfhId, "rejected", reason);

/** ตั้งวัน WFH ประจำของพนักงาน (ฝ่ายบุคคล) — มีผลกับการกดหลังจากนี้ */
async function setEmployeeWfhDays(conn, employeeId, weekdays) {
    const [result] = await conn.query("UPDATE tb_employees SET emp_wfh_weekdays = ? WHERE emp_id = ?", [weekdays, employeeId]);
    if (result.affectedRows === 0) throw new AppError(404, "EMPLOYEE_NOT_FOUND", "ไม่พบพนักงานนี้ กรุณาโหลดหน้าใหม่");
    return { emp_id: employeeId, emp_wfh_weekdays: weekdays };
}

module.exports = {
    wfhInfoOf,
    isWfhOn,
    createWfh,
    listMine,
    cancelWfh,
    listPending,
    approveWfh,
    rejectWfh,
    setEmployeeWfhDays,
};
