// ขอแก้เวลา (ลงเวลา A-2 · 2026-10-24) — docs/plans/2026-10-23-attendance-ot.md หัวข้อ 4
//
// - พนักงานขอเอง (ลืมกดเข้า/ออก): วันทำงาน + เข้า/ออก + เวลา + เหตุผล · ไม่เกินตอนนี้ · อยู่ในช่วงที่เป็นพนักงาน
//   ไม่ก่อนวันเริ่มใช้ลงเวลา · เดือนที่ปิดรอบเงินเดือนแล้วขอไม่ได้ · ขอซ้ำ (วันเดียวกัน ชนิดเดียวกัน ที่ยังรออยู่) ไม่ได้
// - ผู้อนุมัติ = สิทธิ์ approveTimesheet ("อนุมัติลงเวลา") · ของตัวเองอนุมัติไม่ได้ · ไม่อนุมัติต้องมีเหตุผล (พนักงานเห็น)
// - อนุมัติ = เพิ่มการกดที่มา 'correction' (เวลาตามที่ขอ) — การกดเดิมไม่ถูกแก้ ระบบใช้เข้าครั้งแรก/ออกครั้งสุดท้ายของวันเอง
// - ยกเลิกเองได้ตอนยังรออนุมัติ
const { AppError } = require("../utils/app-error");
const { nowBangkokText } = require("../utils/bangkok-time");
const { punchDateTimeOf } = require("../shared/attendance-math.mjs");
const { findLinkedEmployee } = require("./linked-employee.service");
const { assertPeriodsOpen } = require("./payroll-lock.service");
const attendanceSetup = require("./attendance-setup.service");

const CORRECTION_COLUMNS = `c.ac_id, c.ac_employee_id, DATE_FORMAT(c.ac_work_date, '%Y-%m-%d') AS ac_work_date, c.ac_type,
    DATE_FORMAT(c.ac_requested_at, '%Y-%m-%d %H:%i:%s') AS ac_requested_at, c.ac_reason, c.ac_status,
    DATE_FORMAT(c.ac_decided_at, '%Y-%m-%d %H:%i:%s') AS ac_decided_at, c.ac_decision_note,
    DATE_FORMAT(c.ac_created_at, '%Y-%m-%d %H:%i:%s') AS ac_created_at,
    CONCAT(decider.user_fname, ' ', decider.user_lname) AS decided_by_name`;

function notFound() {
    return new AppError(404, "CORRECTION_NOT_FOUND", "ไม่พบคำขอแก้เวลานี้ กรุณาโหลดหน้าใหม่");
}

function notPending() {
    return new AppError(409, "CORRECTION_NOT_PENDING", "คำขอนี้ไม่ได้รออนุมัติแล้ว กรุณาโหลดหน้าใหม่");
}

function validationError(fields, message = "คำขอแก้เวลาบางช่องใช้ไม่ได้ กรุณาแก้ตามข้อความใต้ช่อง") {
    return new AppError(400, "VALIDATION", message, fields);
}

async function trackingStartDate(conn) {
    const [[settings]] = await conn.query(
        "SELECT DATE_FORMAT(ps_attendance_start_date, '%Y-%m-%d') AS start_date FROM tb_payroll_settings WHERE ps_id = 1",
    );
    return settings?.start_date ?? null;
}

/**
 * พนักงานขอแก้เวลา
 * @param {{ ac_work_date: string, ac_type: "in" | "out", ac_time: string, ac_reason: string }} request ผ่าน correctionSchema แล้ว
 */
async function createCorrection(conn, user, request) {
    const employee = await findLinkedEmployee(conn, user.user_id, { forUpdate: true });
    if (!employee) {
        throw new AppError(409, "NOT_AN_EMPLOYEE", "บัญชีของคุณยังไม่ได้ผูกกับพนักงาน · ติดต่อฝ่ายบุคคลก่อน");
    }
    const [[flags]] = await conn.query("SELECT emp_attendance_required FROM tb_employees WHERE emp_id = ?", [employee.emp_id]);
    if (flags?.emp_attendance_required !== 1) {
        throw new AppError(409, "ATTENDANCE_NOT_REQUIRED", "คุณไม่ต้องลงเวลาเข้า-ออกงาน จึงไม่ต้องขอแก้เวลา");
    }
    const workDate = request.ac_work_date;
    if (workDate < employee.emp_hire_date) {
        throw validationError({ ac_work_date: `ก่อนวันเริ่มงาน (${employee.emp_hire_date}) ไม่ได้` });
    }
    if (employee.emp_termination_date && workDate > employee.emp_termination_date) {
        throw validationError({ ac_work_date: `หลังวันทำงานวันสุดท้าย (${employee.emp_termination_date}) ไม่ได้` });
    }
    const startDate = await trackingStartDate(conn);
    if (startDate && workDate < startDate) {
        throw validationError({ ac_work_date: `ก่อนวันเริ่มใช้ลงเวลา (${startDate}) ไม่ต้องขอแก้` });
    }
    const schedule = attendanceSetup.scheduleOn(await attendanceSetup.scheduleTimelineOf(conn, employee.emp_id), workDate);
    if (!schedule) throw new AppError(409, "NO_WORK_SCHEDULE", "ยังไม่ได้ตั้งกะทำงาน · ให้ฝ่ายบุคคลตั้งกะก่อน");
    const requestedAt = punchDateTimeOf(workDate, request.ac_time, schedule);
    if (!requestedAt) throw validationError({ ac_time: "เวลานี้ไม่อยู่ในวันทำงานที่เลือก" });
    if (requestedAt > nowBangkokText()) throw validationError({ ac_time: "ขอเวลาในอนาคตไม่ได้" });
    await assertPeriodsOpen(conn, [workDate], "ลงเวลา");

    const [[duplicate]] = await conn.query(
        `SELECT ac_id FROM tb_attendance_corrections
         WHERE ac_employee_id = ? AND ac_work_date = ? AND ac_type = ? AND ac_status = 'pending'`,
        [employee.emp_id, workDate, request.ac_type],
    );
    if (duplicate) {
        throw new AppError(409, "CORRECTION_DUPLICATE", "มีคำขอแก้เวลาวันนี้แบบเดียวกันรออนุมัติอยู่แล้ว · ยกเลิกอันเดิมก่อนถ้าจะแก้");
    }
    const [result] = await conn.query(
        `INSERT INTO tb_attendance_corrections (ac_employee_id, ac_work_date, ac_type, ac_requested_at, ac_reason, ac_created_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [employee.emp_id, workDate, request.ac_type, requestedAt, request.ac_reason, user.user_id],
    );
    return { ac_id: result.insertId, ac_requested_at: requestedAt };
}

/** คำขอของฉัน (รออนุมัติทั้งหมด + ที่ตัดสินแล้วใน 60 วัน) */
async function listMine(conn, employeeId) {
    const [rows] = await conn.query(
        `SELECT ${CORRECTION_COLUMNS}
         FROM tb_attendance_corrections c LEFT JOIN tb_users decider ON decider.user_id = c.ac_decided_by
         WHERE c.ac_employee_id = ? AND (c.ac_status = 'pending' OR c.ac_created_at >= DATE_SUB(NOW(), INTERVAL 60 DAY))
         ORDER BY c.ac_status = 'pending' DESC, c.ac_work_date DESC, c.ac_id DESC`,
        [employeeId],
    );
    return rows;
}

async function lockCorrection(conn, correctionId) {
    const [[row]] = await conn.query(
        `SELECT ac_id, ac_employee_id, DATE_FORMAT(ac_work_date, '%Y-%m-%d') AS ac_work_date, ac_type,
                DATE_FORMAT(ac_requested_at, '%Y-%m-%d %H:%i:%s') AS ac_requested_at, ac_reason, ac_status
         FROM tb_attendance_corrections WHERE ac_id = ? FOR UPDATE`,
        [correctionId],
    );
    if (!row) throw notFound();
    return row;
}

/** ยกเลิกคำขอของตัวเอง (ตอนยังรออนุมัติ) */
async function cancelCorrection(conn, user, correctionId) {
    const employee = await findLinkedEmployee(conn, user.user_id);
    const row = await lockCorrection(conn, correctionId);
    if (!employee || row.ac_employee_id !== employee.emp_id) throw notFound();
    if (row.ac_status !== "pending") throw notPending();
    await conn.query("UPDATE tb_attendance_corrections SET ac_status = 'cancelled' WHERE ac_id = ?", [correctionId]);
    return { ac_id: correctionId };
}

/** คำขอที่รออนุมัติทั้งบริษัท (ผู้มีสิทธิ์อนุมัติลงเวลา) — ไม่รวมของตัวเอง */
async function listPending(conn, user) {
    const own = await findLinkedEmployee(conn, user.user_id);
    const [rows] = await conn.query(
        `SELECT ${CORRECTION_COLUMNS}, e.emp_code, e.emp_nickname,
                CONCAT(e.emp_first_name_th, ' ', e.emp_last_name_th) AS employee_name
         FROM tb_attendance_corrections c
         JOIN tb_employees e ON e.emp_id = c.ac_employee_id
         LEFT JOIN tb_users decider ON decider.user_id = c.ac_decided_by
         WHERE c.ac_status = 'pending' AND c.ac_employee_id <> ?
         ORDER BY c.ac_work_date, c.ac_id`,
        [own?.emp_id ?? ""],
    );
    return rows;
}

async function assertNotOwn(conn, user, row) {
    const own = await findLinkedEmployee(conn, user.user_id);
    if (own && own.emp_id === row.ac_employee_id) {
        throw new AppError(409, "CORRECTION_OWN", "อนุมัติหรือไม่อนุมัติคำขอของตัวเองไม่ได้ · ให้ผู้อนุมัติคนอื่นตัดสิน");
    }
}

/** อนุมัติ = เพิ่มการกดที่มา correction ตามเวลาที่ขอ */
async function approveCorrection(conn, user, correctionId) {
    const row = await lockCorrection(conn, correctionId);
    if (row.ac_status !== "pending") throw notPending();
    await assertNotOwn(conn, user, row);
    await assertPeriodsOpen(conn, [row.ac_work_date], "ลงเวลา");
    const [result] = await conn.query(
        `INSERT INTO tb_attendance_punches
            (ap_employee_id, ap_type, ap_at, ap_work_date, ap_source, ap_is_offsite, ap_note, ap_created_by)
         VALUES (?, ?, ?, ?, 'correction', 0, ?, ?)`,
        [row.ac_employee_id, row.ac_type, row.ac_requested_at, row.ac_work_date, `ขอแก้เวลา: ${row.ac_reason}`.slice(0, 255), user.user_id],
    );
    await conn.query(
        `UPDATE tb_attendance_corrections
         SET ac_status = 'approved', ac_decided_by = ?, ac_decided_at = ?, ac_punch_id = ? WHERE ac_id = ?`,
        [user.user_id, nowBangkokText(), result.insertId, correctionId],
    );
    return { ac_id: correctionId, ap_id: result.insertId };
}

async function rejectCorrection(conn, user, correctionId, reason) {
    const row = await lockCorrection(conn, correctionId);
    if (row.ac_status !== "pending") throw notPending();
    await assertNotOwn(conn, user, row);
    await conn.query(
        `UPDATE tb_attendance_corrections
         SET ac_status = 'rejected', ac_decided_by = ?, ac_decided_at = ?, ac_decision_note = ? WHERE ac_id = ?`,
        [user.user_id, nowBangkokText(), reason, correctionId],
    );
    return { ac_id: correctionId };
}

module.exports = { createCorrection, listMine, cancelCorrection, listPending, approveCorrection, rejectCorrection };
