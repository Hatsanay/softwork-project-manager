// OT (ลงเวลา A-3 · 2026-10-24) — docs/plans/2026-10-23-attendance-ot.md หัวข้อ 3 (Q5 ก: ขอล่วงหน้า + อนุมัติ)
//
// - พนักงานขอเอง = ยินยอมทำ OT ครั้งนั้น (ม.24) · ต้องเป็นคนที่ลงเวลา (จ่ายจริงดูจากเวลาเข้า-ออก)
// - ชนิด (overtimeSplitOf): วันทำงานนอกเวลางาน 1.5 · ทำงานวันหยุดในเวลาปกติ +1 · OT วันหยุด 3 (อัตราตั้งค่าได้)
//   วันทำงานที่ช่วงทับเวลางานปกติ = ขอไม่ได้ · วันลาเต็มวัน = ขอไม่ได้ · ทับ OT อื่นที่รอ/อนุมัติแล้ว = ขอไม่ได้
// - เพดาน: OT วันทำงาน + OT วันหยุด ต่อสัปดาห์ (จันทร์-อาทิตย์) ไม่เกินที่ตั้ง (36 ชม.) — ทำงานวันหยุดในเวลาปกติไม่นับ
//   ตอนขอนับที่รอ + อนุมัติแล้ว · ตอนอนุมัตินับเฉพาะที่อนุมัติแล้ว
// - ผู้อนุมัติ = approveTimesheet · ของตัวเองไม่ได้ · ไม่อนุมัติต้องมีเหตุผล · ยกเลิกเองได้ตอนรอ หรืออนุมัติแล้วแต่ยังไม่ถึงเวลาเริ่ม
// - จ่ายจริง (A-4) = ช่วงที่อนุมัติ ∩ เวลาเข้า-ออกจริง ปัดลงทีละ 15 นาที — หน้านี้แสดง "ทำจริง" ให้เห็นก่อน
const { AppError } = require("../utils/app-error");
const { nowBangkokText } = require("../utils/bangkok-time");
const { addDays, weekStartOf } = require("../shared/payroll-math.mjs");
const {
    actualOvertimeWindowOf,
    floorToQuarterHour,
    minutesFromWorkDate,
    overtimeSplitOf,
} = require("../shared/attendance-math.mjs");
const { MAX_OVERTIME_HOURS_PER_REQUEST } = require("../shared/schemas/attendance.mjs");
const { findLinkedEmployee } = require("./linked-employee.service");
const { assertPeriodsOpen } = require("./payroll-lock.service");
const attendanceSetup = require("./attendance-setup.service");

const ACTIVE_STATUSES = ["pending", "approved"];

const OVERTIME_COLUMNS = `o.ot_id, o.ot_employee_id, DATE_FORMAT(o.ot_work_date, '%Y-%m-%d') AS ot_work_date,
    DATE_FORMAT(o.ot_start_at, '%Y-%m-%d %H:%i:%s') AS ot_start_at, DATE_FORMAT(o.ot_end_at, '%Y-%m-%d %H:%i:%s') AS ot_end_at,
    o.ot_workday_minutes, o.ot_holiday_work_minutes, o.ot_holiday_ot_minutes, o.ot_reason, o.ot_status,
    DATE_FORMAT(o.ot_decided_at, '%Y-%m-%d %H:%i:%s') AS ot_decided_at, o.ot_decision_note,
    DATE_FORMAT(o.ot_created_at, '%Y-%m-%d %H:%i:%s') AS ot_created_at,
    CONCAT(decider.user_fname, ' ', decider.user_lname) AS decided_by_name`;

function validationError(fields, message = "คำขอ OT บางช่องใช้ไม่ได้ กรุณาแก้ตามข้อความใต้ช่อง") {
    return new AppError(400, "VALIDATION", message, fields);
}

function notFound() {
    return new AppError(404, "OVERTIME_NOT_FOUND", "ไม่พบคำขอ OT นี้ กรุณาโหลดหน้าใหม่");
}

async function overtimeSettings(conn) {
    const [[settings]] = await conn.query(
        `SELECT ps_ot_rate_workday, ps_ot_rate_holiday_work, ps_ot_rate_holiday_ot, ps_ot_weekly_cap_hours
         FROM tb_payroll_settings WHERE ps_id = 1`,
    );
    return settings;
}

async function requireOvertimeEmployee(conn, userId, options) {
    const employee = await findLinkedEmployee(conn, userId, options);
    if (!employee) throw new AppError(409, "NOT_AN_EMPLOYEE", "บัญชีของคุณยังไม่ได้ผูกกับพนักงาน · ติดต่อฝ่ายบุคคลก่อน");
    const [[flags]] = await conn.query("SELECT emp_attendance_required FROM tb_employees WHERE emp_id = ?", [employee.emp_id]);
    if (flags?.emp_attendance_required !== 1) {
        throw new AppError(409, "ATTENDANCE_NOT_REQUIRED", "คุณไม่ต้องลงเวลาเข้า-ออกงาน จึงขอ OT ไม่ได้ (OT จ่ายตามเวลาเข้า-ออกจริง)");
    }
    return employee;
}

/** นาทีที่นับเพดานในสัปดาห์ (OT วันทำงาน + OT วันหยุด) ของคำขอสถานะที่ระบุ ไม่รวม exceptId */
async function weekUsedMinutes(conn, employeeId, workDate, statuses, exceptId = 0) {
    const weekStart = weekStartOf(workDate);
    const [[row]] = await conn.query(
        `SELECT COALESCE(SUM(ot_workday_minutes + ot_holiday_ot_minutes), 0) AS used FROM tb_overtime_requests
         WHERE ot_employee_id = ? AND ot_work_date BETWEEN ? AND ? AND ot_status IN (?) AND ot_id <> ?`,
        [employeeId, weekStart, addDays(weekStart, 6), statuses, exceptId],
    );
    return Number(row.used);
}

/**
 * ตรวจคำขอ + คิดชนิด/เพดาน (ใช้ทั้งตัวอย่างและตอนบันทึก)
 * @param {{ ot_work_date: string, ot_start_time: string, ot_end_time: string }} request
 */
async function evaluate(conn, employee, request) {
    const workDate = request.ot_work_date;
    if (workDate < employee.emp_hire_date) throw validationError({ ot_work_date: `ก่อนวันเริ่มงาน (${employee.emp_hire_date}) ไม่ได้` });
    if (employee.emp_termination_date && workDate > employee.emp_termination_date) {
        throw validationError({ ot_work_date: `หลังวันทำงานวันสุดท้าย (${employee.emp_termination_date}) ไม่ได้` });
    }
    const schedule = attendanceSetup.scheduleOn(await attendanceSetup.scheduleTimelineOf(conn, employee.emp_id), workDate);
    if (!schedule) throw new AppError(409, "NO_WORK_SCHEDULE", "ยังไม่ได้ตั้งกะทำงาน · ให้ฝ่ายบุคคลตั้งกะก่อน");

    const startAt = `${workDate} ${request.ot_start_time.slice(0, 5)}:00`;
    const endDate = request.ot_end_time > request.ot_start_time ? workDate : addDays(workDate, 1);
    const endAt = `${endDate} ${request.ot_end_time.slice(0, 5)}:00`;
    const totalMinutes = minutesFromWorkDate(workDate, endAt) - minutesFromWorkDate(workDate, startAt);
    if (totalMinutes > MAX_OVERTIME_HOURS_PER_REQUEST * 60) {
        throw validationError({ ot_end_time: `ขอได้ไม่เกิน ${MAX_OVERTIME_HOURS_PER_REQUEST} ชั่วโมงต่อครั้ง` });
    }

    const [[holiday]] = await conn.query("SELECT hd_name FROM tb_company_holidays WHERE hd_date = ?", [workDate]);
    const [[fullLeave]] = await conn.query(
        `SELECT lr_id FROM tb_leave_requests WHERE lr_employee_id = ? AND lr_status = 'approved'
           AND lr_half_day = 'none' AND lr_start_date <= ? AND lr_end_date >= ?`,
        [employee.emp_id, workDate, workDate],
    );
    if (fullLeave) throw validationError({ ot_work_date: "วันนี้ลาเต็มวัน (อนุมัติแล้ว) ขอ OT ไม่ได้" });

    const split = overtimeSplitOf({ workDate, startAt, endAt, schedule, isHoliday: Boolean(holiday) });
    if (split.overlapsNormalHours) {
        throw validationError({
            ot_start_time: `ช่วงนี้ทับเวลางานปกติ (${schedule.ws_start_time}-${schedule.ws_end_time}) · OT วันทำงานต้องอยู่นอกเวลางาน`,
        });
    }

    const [[overlap]] = await conn.query(
        `SELECT ot_id FROM tb_overtime_requests
         WHERE ot_employee_id = ? AND ot_status IN (?) AND ot_start_at < ? AND ot_end_at > ? LIMIT 1`,
        [employee.emp_id, ACTIVE_STATUSES, endAt, startAt],
    );
    if (overlap) throw validationError({ ot_start_time: "ทับกับคำขอ OT อื่นที่รอหรืออนุมัติแล้ว" });

    const settings = await overtimeSettings(conn);
    const capMinutes = settings.ps_ot_weekly_cap_hours * 60;
    const usedMinutes = await weekUsedMinutes(conn, employee.emp_id, workDate, ACTIVE_STATUSES);
    const countedMinutes = split.workday + split.holidayOvertime;
    return {
        ot_work_date: workDate,
        ot_start_at: startAt,
        ot_end_at: endAt,
        total_minutes: totalMinutes,
        workday_minutes: split.workday,
        holiday_work_minutes: split.holidayWork,
        holiday_ot_minutes: split.holidayOvertime,
        is_off_day: split.isOffDay,
        holiday_name: holiday?.hd_name ?? null,
        schedule: { ws_name: schedule.ws_name, ws_start_time: schedule.ws_start_time, ws_end_time: schedule.ws_end_time },
        rates: {
            workday: settings.ps_ot_rate_workday,
            holiday_work: settings.ps_ot_rate_holiday_work,
            holiday_ot: settings.ps_ot_rate_holiday_ot,
        },
        week: { used_minutes: usedMinutes, cap_minutes: capMinutes, after_minutes: usedMinutes + countedMinutes },
        is_over_cap: usedMinutes + countedMinutes > capMinutes,
        is_after_the_fact: startAt < nowBangkokText(),
    };
}

/** ตัวอย่างก่อนส่ง (ฟอร์มขอ OT แสดงทันที): ชนิด · อัตรา · ใช้ไปในสัปดาห์ */
async function preview(conn, user, request) {
    const employee = await requireOvertimeEmployee(conn, user.user_id);
    return evaluate(conn, employee, request);
}

async function createOvertime(conn, user, request) {
    const employee = await requireOvertimeEmployee(conn, user.user_id, { forUpdate: true });
    await assertPeriodsOpen(conn, [request.ot_work_date], "OT");
    const result = await evaluate(conn, employee, request);
    if (result.is_over_cap) {
        throw new AppError(
            409,
            "OVERTIME_OVER_CAP",
            `เกินเพดาน OT ${result.week.cap_minutes / 60} ชม. ต่อสัปดาห์ (ใช้ไป ${result.week.used_minutes / 60} ชม. รวมที่รออนุมัติ)`,
        );
    }
    const [inserted] = await conn.query(
        `INSERT INTO tb_overtime_requests
            (ot_employee_id, ot_work_date, ot_start_at, ot_end_at, ot_workday_minutes, ot_holiday_work_minutes,
             ot_holiday_ot_minutes, ot_reason, ot_created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            employee.emp_id,
            result.ot_work_date,
            result.ot_start_at,
            result.ot_end_at,
            result.workday_minutes,
            result.holiday_work_minutes,
            result.holiday_ot_minutes,
            request.ot_reason,
            user.user_id,
        ],
    );
    return { ot_id: inserted.insertId, ...result };
}

/** เวลาเข้าครั้งแรก/ออกครั้งสุดท้ายของวันทำงาน (การกดที่ยังใช้อยู่) */
async function presenceOf(conn, employeeId, workDate) {
    const [[row]] = await conn.query(
        `SELECT DATE_FORMAT(MIN(CASE WHEN ap_type = 'in' THEN ap_at END), '%Y-%m-%d %H:%i:%s') AS first_in,
                DATE_FORMAT(MAX(CASE WHEN ap_type = 'out' THEN ap_at END), '%Y-%m-%d %H:%i:%s') AS last_out
         FROM tb_attendance_punches WHERE ap_employee_id = ? AND ap_work_date = ? AND ap_voided_at IS NULL`,
        [employeeId, workDate],
    );
    return row;
}

/** นาที OT ที่ทำจริง (ช่วงที่อนุมัติ ∩ เข้า-ออกจริง ปัดลง 15 นาที) · ยังไม่มีเวลาออก = null */
async function actualMinutesOf(conn, overtime) {
    const presence = await presenceOf(conn, overtime.ot_employee_id, overtime.ot_work_date);
    if (!presence.first_in || !presence.last_out) return null;
    const window = actualOvertimeWindowOf({
        startAt: overtime.ot_start_at,
        endAt: overtime.ot_end_at,
        firstIn: presence.first_in,
        lastOut: presence.last_out,
    });
    if (!window) return 0;
    const workDate = overtime.ot_work_date;
    return floorToQuarterHour(minutesFromWorkDate(workDate, window.endAt) - minutesFromWorkDate(workDate, window.startAt));
}

/** OT ของฉัน (รอทั้งหมด + 60 วันล่าสุด) พร้อมนาทีที่ทำจริงของรายการที่อนุมัติแล้ว */
async function listMine(conn, employeeId) {
    const [rows] = await conn.query(
        `SELECT ${OVERTIME_COLUMNS}
         FROM tb_overtime_requests o LEFT JOIN tb_users decider ON decider.user_id = o.ot_decided_by
         WHERE o.ot_employee_id = ? AND (o.ot_status = 'pending' OR o.ot_work_date >= DATE_SUB(CURDATE(), INTERVAL 60 DAY))
         ORDER BY o.ot_status = 'pending' DESC, o.ot_work_date DESC, o.ot_id DESC`,
        [employeeId],
    );
    const result = [];
    for (const row of rows) {
        result.push({ ...row, actual_minutes: row.ot_status === "approved" ? await actualMinutesOf(conn, row) : null });
    }
    return result;
}

async function lockOvertime(conn, overtimeId) {
    const [[row]] = await conn.query(
        `SELECT ot_id, ot_employee_id, DATE_FORMAT(ot_work_date, '%Y-%m-%d') AS ot_work_date,
                DATE_FORMAT(ot_start_at, '%Y-%m-%d %H:%i:%s') AS ot_start_at, ot_workday_minutes, ot_holiday_ot_minutes, ot_status
         FROM tb_overtime_requests WHERE ot_id = ? FOR UPDATE`,
        [overtimeId],
    );
    if (!row) throw notFound();
    return row;
}

/** ยกเลิกของตัวเอง: รออนุมัติ หรืออนุมัติแล้วแต่ยังไม่ถึงเวลาเริ่ม */
async function cancelOvertime(conn, user, overtimeId) {
    const employee = await findLinkedEmployee(conn, user.user_id);
    const row = await lockOvertime(conn, overtimeId);
    if (!employee || row.ot_employee_id !== employee.emp_id) throw notFound();
    const isBeforeStart = row.ot_start_at > nowBangkokText();
    const canCancel = row.ot_status === "pending" || (row.ot_status === "approved" && isBeforeStart);
    if (!canCancel) {
        throw new AppError(409, "OVERTIME_NOT_CANCELLABLE", "ยกเลิกได้เฉพาะคำขอที่รออนุมัติ หรืออนุมัติแล้วแต่ยังไม่ถึงเวลาเริ่ม");
    }
    await conn.query("UPDATE tb_overtime_requests SET ot_status = 'cancelled' WHERE ot_id = ?", [overtimeId]);
    return { ot_id: overtimeId };
}

/** OT ที่รออนุมัติทั้งบริษัท (ไม่รวมของตัวเอง) + ใช้ไปในสัปดาห์ (อนุมัติแล้ว) */
async function listPending(conn, user) {
    const own = await findLinkedEmployee(conn, user.user_id);
    const [rows] = await conn.query(
        `SELECT ${OVERTIME_COLUMNS}, e.emp_code, e.emp_nickname, CONCAT(e.emp_first_name_th, ' ', e.emp_last_name_th) AS employee_name
         FROM tb_overtime_requests o
         JOIN tb_employees e ON e.emp_id = o.ot_employee_id
         LEFT JOIN tb_users decider ON decider.user_id = o.ot_decided_by
         WHERE o.ot_status = 'pending' AND o.ot_employee_id <> ?
         ORDER BY o.ot_work_date, o.ot_start_at`,
        [own?.emp_id ?? ""],
    );
    const settings = await overtimeSettings(conn);
    const result = [];
    for (const row of rows) {
        const approvedMinutes = await weekUsedMinutes(conn, row.ot_employee_id, row.ot_work_date, ["approved"], row.ot_id);
        result.push({ ...row, week_approved_minutes: approvedMinutes, week_cap_minutes: settings.ps_ot_weekly_cap_hours * 60 });
    }
    return result;
}

async function assertNotOwn(conn, user, row) {
    const own = await findLinkedEmployee(conn, user.user_id);
    if (own && own.emp_id === row.ot_employee_id) {
        throw new AppError(409, "OVERTIME_OWN", "อนุมัติหรือไม่อนุมัติ OT ของตัวเองไม่ได้ · ให้ผู้อนุมัติคนอื่นตัดสิน");
    }
}

async function approveOvertime(conn, user, overtimeId) {
    const row = await lockOvertime(conn, overtimeId);
    if (row.ot_status !== "pending") throw new AppError(409, "OVERTIME_NOT_PENDING", "คำขอนี้ไม่ได้รออนุมัติแล้ว กรุณาโหลดหน้าใหม่");
    await assertNotOwn(conn, user, row);
    await assertPeriodsOpen(conn, [row.ot_work_date], "OT");
    const settings = await overtimeSettings(conn);
    const approvedMinutes = await weekUsedMinutes(conn, row.ot_employee_id, row.ot_work_date, ["approved"], row.ot_id);
    const afterMinutes = approvedMinutes + row.ot_workday_minutes + row.ot_holiday_ot_minutes;
    if (afterMinutes > settings.ps_ot_weekly_cap_hours * 60) {
        throw new AppError(
            409,
            "OVERTIME_OVER_CAP",
            `อนุมัติแล้วจะเกินเพดาน ${settings.ps_ot_weekly_cap_hours} ชม. ต่อสัปดาห์ (อนุมัติไปแล้ว ${approvedMinutes / 60} ชม.)`,
        );
    }
    await conn.query(
        "UPDATE tb_overtime_requests SET ot_status = 'approved', ot_decided_by = ?, ot_decided_at = ? WHERE ot_id = ?",
        [user.user_id, nowBangkokText(), overtimeId],
    );
    return { ot_id: overtimeId };
}

async function rejectOvertime(conn, user, overtimeId, reason) {
    const row = await lockOvertime(conn, overtimeId);
    if (row.ot_status !== "pending") throw new AppError(409, "OVERTIME_NOT_PENDING", "คำขอนี้ไม่ได้รออนุมัติแล้ว กรุณาโหลดหน้าใหม่");
    await assertNotOwn(conn, user, row);
    await conn.query(
        `UPDATE tb_overtime_requests SET ot_status = 'rejected', ot_decided_by = ?, ot_decided_at = ?, ot_decision_note = ?
         WHERE ot_id = ?`,
        [user.user_id, nowBangkokText(), reason, overtimeId],
    );
    return { ot_id: overtimeId };
}

module.exports = {
    preview,
    createOvertime,
    listMine,
    cancelOvertime,
    listPending,
    approveOvertime,
    rejectOvertime,
    actualMinutesOf,
};
