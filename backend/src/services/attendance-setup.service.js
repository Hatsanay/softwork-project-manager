// ตั้งค่าลงเวลาเข้า-ออกงาน (2026-10-23 ช่วง A-1) — docs/plans/2026-10-23-attendance-ot.md หัวข้อ 2
//
// - กะทำงาน: ชุดเวลาให้เลือก · ชื่อห้ามซ้ำ · ปิดใช้งานแทนลบ · กะเริ่มต้น (ตั้งค่าบุคคล) ปิดไม่ได้
// - จุดลงเวลา: พิกัด + รัศมี · สาขาหนึ่งมีได้หลายจุด · ปิดใช้งานแทนลบ (การกดเก่าเก็บชื่อ/ระยะไว้ในแถวแล้ว)
// - กะของพนักงานตามวันที่มีผล: วันเดียวกันซ้ำ = แทนของเดิม · ห้ามก่อนวันเริ่มงาน · ห้ามอยู่ในเดือนที่รอบเงินเดือนอนุมัติแล้ว
const { AppError } = require("../utils/app-error");
const { assertPeriodsOpen } = require("./payroll-lock.service");
const { addDays, weekdayIndex } = require("../shared/payroll-math.mjs");

const PAYROLL_SETTINGS_ID = 1;

function validationError(fields, message = "ข้อมูลบางอย่างใช้ไม่ได้ กรุณาแก้ตามข้อความใต้ช่อง") {
    return new AppError(400, "VALIDATION", message, fields);
}

// คอลัมน์กะ (เวลาเป็น "HH:MM") · tableAlias = ชื่อย่อตารางเมื่อ JOIN
function scheduleColumns(tableAlias = "") {
    const prefix = tableAlias ? `${tableAlias}.` : "";
    return `${prefix}ws_id AS ws_id, ${prefix}ws_name AS ws_name,
        TIME_FORMAT(${prefix}ws_start_time, '%H:%i') AS ws_start_time, TIME_FORMAT(${prefix}ws_end_time, '%H:%i') AS ws_end_time,
        ${prefix}ws_break_minutes AS ws_break_minutes, ${prefix}ws_working_weekdays AS ws_working_weekdays,
        ${prefix}ws_late_grace_minutes AS ws_late_grace_minutes, ${prefix}ws_checkin_open_minutes AS ws_checkin_open_minutes,
        ${prefix}ws_status AS ws_status`;
}

// ─── กะทำงาน ──────────────────────────────────────────────────────────────────────────────────

async function listSchedules(conn) {
    const [rows] = await conn.query(
        `SELECT ${scheduleColumns("ws")},
                (SELECT COUNT(DISTINCT es.es_employee_id) FROM tb_employee_schedules es WHERE es.es_schedule_id = ws.ws_id)
                    AS employee_count
         FROM tb_work_schedules ws ORDER BY ws.ws_status, ws.ws_start_time, ws.ws_name`,
    );
    return rows.map((row) => ({ ...row, employee_count: Number(row.employee_count) }));
}

async function findSchedule(conn, scheduleId, { forUpdate = false } = {}) {
    const [[schedule]] = await conn.query(
        `SELECT ${scheduleColumns()} FROM tb_work_schedules WHERE ws_id = ? ${forUpdate ? "FOR UPDATE" : ""}`,
        [scheduleId],
    );
    return schedule ?? null;
}

/** กะที่เลือกต้องมีอยู่และเปิดใช้งาน */
async function assertActiveSchedule(conn, scheduleId, field) {
    const schedule = await findSchedule(conn, scheduleId);
    if (!schedule || schedule.ws_status !== "active") {
        throw validationError({ [field]: "กะนี้ปิดใช้งานแล้วหรือไม่มีอยู่ เลือกกะอื่น" });
    }
    return schedule;
}

async function assertScheduleNameFree(conn, name, exceptId = null) {
    const [[duplicate]] = await conn.query("SELECT ws_id FROM tb_work_schedules WHERE ws_name = ? AND ws_id <> ?", [
        name,
        exceptId ?? 0,
    ]);
    if (duplicate) throw validationError({ ws_name: "มีกะชื่อนี้แล้ว" });
}

const SCHEDULE_FIELDS = [
    "ws_name",
    "ws_start_time",
    "ws_end_time",
    "ws_break_minutes",
    "ws_working_weekdays",
    "ws_late_grace_minutes",
    "ws_checkin_open_minutes",
    "ws_status",
];

/**
 * @param {object} schedule ผ่าน workScheduleSchema แล้ว
 * @param {{ user_id: string }} actor
 */
async function createSchedule(conn, schedule, actor) {
    await assertScheduleNameFree(conn, schedule.ws_name);
    const [result] = await conn.query(
        `INSERT INTO tb_work_schedules (${SCHEDULE_FIELDS.join(", ")}, ws_created_by)
         VALUES (${SCHEDULE_FIELDS.map(() => "?").join(", ")}, ?)`,
        [...SCHEDULE_FIELDS.map((field) => schedule[field]), actor.user_id],
    );
    return { ws_id: result.insertId };
}

/** แก้กะ — เวลาใหม่มีผลกับวันที่ยังไม่ปิดรอบเงินเดือนด้วย (หน้าตั้งค่าบอกไว้) · กะเริ่มต้นปิดไม่ได้ */
async function updateSchedule(conn, scheduleId, schedule) {
    const existing = await findSchedule(conn, scheduleId, { forUpdate: true });
    if (!existing) throw new AppError(404, "SCHEDULE_NOT_FOUND", "ไม่พบกะนี้ กรุณาโหลดหน้าใหม่");
    await assertScheduleNameFree(conn, schedule.ws_name, scheduleId);
    if (schedule.ws_status === "inactive") {
        const [[settings]] = await conn.query("SELECT ps_default_schedule_id FROM tb_payroll_settings WHERE ps_id = ?", [
            PAYROLL_SETTINGS_ID,
        ]);
        if (settings?.ps_default_schedule_id === scheduleId) {
            throw validationError({ ws_status: "กะนี้เป็นกะเริ่มต้น เปลี่ยนกะเริ่มต้นในหมวดเวลาทำงานก่อนจึงปิดได้" });
        }
    }
    await conn.query(
        `UPDATE tb_work_schedules SET ${SCHEDULE_FIELDS.map((field) => `${field} = ?`).join(", ")} WHERE ws_id = ?`,
        [...SCHEDULE_FIELDS.map((field) => schedule[field]), scheduleId],
    );
    return { ws_id: scheduleId };
}

// ─── จุดลงเวลา ────────────────────────────────────────────────────────────────────────────────

const LOCATION_FIELDS = ["al_name", "al_branch_id", "al_latitude", "al_longitude", "al_radius_m", "al_status"];

async function listLocations(conn, { activeOnly = false } = {}) {
    const [rows] = await conn.query(
        `SELECT l.al_id, l.al_name, l.al_branch_id, l.al_latitude, l.al_longitude, l.al_radius_m, l.al_status,
                b.branch_name_th
         FROM tb_attendance_locations l LEFT JOIN tb_branches b ON b.branch_id = l.al_branch_id
         ${activeOnly ? "WHERE l.al_status = 'active'" : ""}
         ORDER BY l.al_status, l.al_name`,
    );
    return rows;
}

async function assertBranchExists(conn, branchId) {
    if (!branchId) return;
    const [[branch]] = await conn.query("SELECT branch_id FROM tb_branches WHERE branch_id = ?", [branchId]);
    if (!branch) throw validationError({ al_branch_id: "ไม่พบสาขานี้ เลือกจากรายการ" });
}

async function createLocation(conn, location, actor) {
    await assertBranchExists(conn, location.al_branch_id);
    const [result] = await conn.query(
        `INSERT INTO tb_attendance_locations (${LOCATION_FIELDS.join(", ")}, al_created_by)
         VALUES (${LOCATION_FIELDS.map(() => "?").join(", ")}, ?)`,
        [...LOCATION_FIELDS.map((field) => location[field]), actor.user_id],
    );
    return { al_id: result.insertId };
}

async function updateLocation(conn, locationId, location) {
    const [[existing]] = await conn.query("SELECT al_id FROM tb_attendance_locations WHERE al_id = ? FOR UPDATE", [
        locationId,
    ]);
    if (!existing) throw new AppError(404, "LOCATION_NOT_FOUND", "ไม่พบจุดลงเวลานี้ กรุณาโหลดหน้าใหม่");
    await assertBranchExists(conn, location.al_branch_id);
    await conn.query(
        `UPDATE tb_attendance_locations SET ${LOCATION_FIELDS.map((field) => `${field} = ?`).join(", ")} WHERE al_id = ?`,
        [...LOCATION_FIELDS.map((field) => location[field]), locationId],
    );
    return { al_id: locationId };
}

// ─── กะของพนักงาน ─────────────────────────────────────────────────────────────────────────────

/** ประวัติกะของพนักงาน ใหม่สุดก่อน */
async function listEmployeeSchedules(conn, employeeId) {
    const [rows] = await conn.query(
        `SELECT es.es_id, DATE_FORMAT(es.es_effective_from, '%Y-%m-%d') AS es_effective_from, es.es_schedule_id,
                ws.ws_name, TIME_FORMAT(ws.ws_start_time, '%H:%i') AS ws_start_time,
                TIME_FORMAT(ws.ws_end_time, '%H:%i') AS ws_end_time, ws.ws_status
         FROM tb_employee_schedules es JOIN tb_work_schedules ws ON ws.ws_id = es.es_schedule_id
         WHERE es.es_employee_id = ?
         ORDER BY es.es_effective_from DESC`,
        [employeeId],
    );
    return rows;
}

/**
 * กะทั้งหมดที่ใช้คิดของพนักงาน: แถวตามวันที่มีผล (เก่า→ใหม่) + กะเริ่มต้น
 * @returns {Promise<{ timeline: { from: string, schedule: object }[], fallback: object | null }>}
 */
async function scheduleTimelineOf(conn, employeeId) {
    const [rows] = await conn.query(
        `SELECT DATE_FORMAT(es.es_effective_from, '%Y-%m-%d') AS es_effective_from, ${scheduleColumns("ws")}
         FROM tb_employee_schedules es JOIN tb_work_schedules ws ON ws.ws_id = es.es_schedule_id
         WHERE es.es_employee_id = ?
         ORDER BY es.es_effective_from`,
        [employeeId],
    );
    const [[settings]] = await conn.query("SELECT ps_default_schedule_id FROM tb_payroll_settings WHERE ps_id = ?", [
        PAYROLL_SETTINGS_ID,
    ]);
    const fallback = settings?.ps_default_schedule_id ? await findSchedule(conn, settings.ps_default_schedule_id) : null;
    return {
        timeline: rows.map(({ es_effective_from: from, ...schedule }) => ({ from, schedule })),
        fallback,
    };
}

/** กะ ณ วันที่ = แถวล่าสุดที่มีผลไม่เกินวันนั้น · ไม่มี = กะเริ่มต้น */
function scheduleOn({ timeline, fallback }, dateText) {
    let found = null;
    for (const row of timeline) {
        if (row.from <= dateText) found = row.schedule;
    }
    return found ?? fallback;
}

/**
 * วันทำงานของพนักงานตามกะของแต่ละวัน (A-4 · 2026-10-24) — ใช้นับวันลาและลาไม่รับค่าจ้างในรอบเงินเดือน
 * ไม่มีกะเลย (ยังไม่ตั้งกะเริ่มต้น) = ใช้วันทำงานของบริษัท · วันหยุดบริษัทไม่นับทุกกะ
 * @returns {Promise<{ dates: string[], holidayDates: string[] }>} holidayDates = วันทำงานของกะที่ตรงวันหยุดบริษัท (ไม่นับ)
 */
async function workingDatesOf(conn, employeeId, fromDate, toDate) {
    const schedules = employeeId ? await scheduleTimelineOf(conn, employeeId) : { timeline: [], fallback: null };
    const [[settings]] = await conn.query("SELECT ps_working_weekdays FROM tb_payroll_settings WHERE ps_id = ?", [
        PAYROLL_SETTINGS_ID,
    ]);
    const [holidayRows] = await conn.query(
        "SELECT DATE_FORMAT(hd_date, '%Y-%m-%d') AS hd_date FROM tb_company_holidays WHERE hd_date BETWEEN ? AND ?",
        [fromDate, toDate],
    );
    const holidays = new Set(holidayRows.map((row) => row.hd_date));
    const dates = [];
    const holidayDates = [];
    for (let date = fromDate; date <= toDate; date = addDays(date, 1)) {
        const schedule = scheduleOn(schedules, date);
        const weekdays = schedule?.ws_working_weekdays ?? settings?.ps_working_weekdays ?? "1111100";
        if (weekdays[weekdayIndex(date)] !== "1") continue;
        if (holidays.has(date)) holidayDates.push(date);
        else dates.push(date);
    }
    return { dates, holidayDates };
}

/**
 * กำหนดกะให้พนักงาน (วันเดียวกันซ้ำ = แทนของเดิม)
 * @param {{ es_schedule_id: number, es_effective_from: string }} request ผ่าน employeeScheduleSchema แล้ว
 */
async function setEmployeeSchedule(conn, employeeId, request, actor) {
    const [[employee]] = await conn.query(
        "SELECT emp_id, DATE_FORMAT(emp_hire_date, '%Y-%m-%d') AS emp_hire_date FROM tb_employees WHERE emp_id = ? FOR UPDATE",
        [employeeId],
    );
    if (!employee) throw new AppError(404, "EMPLOYEE_NOT_FOUND", "ไม่พบพนักงานนี้ กรุณาโหลดหน้าใหม่");
    await assertActiveSchedule(conn, request.es_schedule_id, "es_schedule_id");
    if (request.es_effective_from < employee.emp_hire_date) {
        throw validationError({ es_effective_from: `ต้องไม่ก่อนวันเริ่มงาน (${employee.emp_hire_date})` });
    }
    await assertPeriodsOpen(conn, [request.es_effective_from], "กะทำงาน");
    await conn.query(
        `INSERT INTO tb_employee_schedules (es_employee_id, es_schedule_id, es_effective_from, es_created_by)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE es_schedule_id = VALUES(es_schedule_id), es_created_by = VALUES(es_created_by)`,
        [employeeId, request.es_schedule_id, request.es_effective_from, actor.user_id],
    );
    return { emp_id: employeeId };
}

async function deleteEmployeeSchedule(conn, employeeId, rowId) {
    const [[row]] = await conn.query(
        `SELECT es_id, DATE_FORMAT(es_effective_from, '%Y-%m-%d') AS es_effective_from
         FROM tb_employee_schedules WHERE es_id = ? AND es_employee_id = ? FOR UPDATE`,
        [rowId, employeeId],
    );
    if (!row) throw new AppError(404, "EMPLOYEE_SCHEDULE_NOT_FOUND", "ไม่พบแถวกะนี้ กรุณาโหลดหน้าใหม่");
    await assertPeriodsOpen(conn, [row.es_effective_from], "กะทำงาน");
    await conn.query("DELETE FROM tb_employee_schedules WHERE es_id = ?", [rowId]);
    return { emp_id: employeeId };
}

module.exports = {
    listSchedules,
    findSchedule,
    assertActiveSchedule,
    createSchedule,
    updateSchedule,
    listLocations,
    createLocation,
    updateLocation,
    listEmployeeSchedules,
    scheduleTimelineOf,
    scheduleOn,
    workingDatesOf,
    setEmployeeSchedule,
    deleteEmployeeSchedule,
};
