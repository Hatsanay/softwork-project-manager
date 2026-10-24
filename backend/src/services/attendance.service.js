// ลงเวลาเข้า-ออกงาน (2026-10-23 ช่วง A-1) — docs/plans/2026-10-23-attendance-ot.md หัวข้อ 3, 6
//
// - พนักงาน = พนักงานที่ผูกกับบัญชีที่ login (ทุกคนลงเวลาของตัวเองได้โดยไม่ต้องมีสิทธิ์)
// - เวลาที่บันทึก = เวลาเซิร์ฟเวอร์ (เวลาไทย) เสมอ ไม่รับเวลาจากมือถือ (A1)
// - ในรัศมีจุดลงเวลา = ในจุด · นอกรัศมีหรือไม่มีตำแหน่ง = นอกจุด ต้องใส่เหตุผล (Q1 ข) · ยังไม่ได้ตั้งจุดเลย = ไม่ตรวจตำแหน่ง
// - กดซ้ำชนิดเดิมภายใน 60 วินาที = ไม่บันทึกเพิ่ม (กันนิ้วกดสองที/เน็ตส่งซ้ำ · A5) · ล็อกแถวพนักงานกันสองคำขอชนกัน
// - วันในเดือนที่รอบเงินเดือนอนุมัติแล้ว กดไม่ได้ (A17)
// - สถานะรายวันคิดสดทุกครั้งจากการกด + กะ + วันหยุด + ลาที่อนุมัติ (ลาอนุมัติทีหลัง วันที่เคยขาดเปลี่ยนเป็นลาเอง · A11)
// - วัน WFH (2026-10-24 · วันประจำหรือคำขออนุมัติแล้ว): กดได้ทุกที่ ไม่ต้องใส่เหตุผล · การกดติดป้าย WFH แทนนอกจุด
const { AppError } = require("../utils/app-error");
const { todayBangkok, nowBangkokText } = require("../utils/bangkok-time");
const { addDays, daysInMonth } = require("../shared/payroll-math.mjs");
const { attendanceTotalsOf, dayAttendanceOf, nearestLocation, workDateOf } = require("../shared/attendance-math.mjs");
const { findLinkedEmployee } = require("./linked-employee.service");
const { assertPeriodsOpen } = require("./payroll-lock.service");
const attendanceSetup = require("./attendance-setup.service");
const correctionService = require("./attendance-correction.service");
const overtimeService = require("./attendance-overtime.service");
const wfhService = require("./attendance-wfh.service");

const DUPLICATE_WINDOW_MS = 60_000;

function notAnEmployee() {
    return new AppError(
        409,
        "NOT_AN_EMPLOYEE",
        "บัญชีของคุณยังไม่ได้ผูกกับพนักงาน · ติดต่อฝ่ายบุคคลให้ผูกบัญชีในหน้าพนักงานก่อนลงเวลา",
    );
}

async function attendanceRequiredOf(conn, employeeId) {
    const [[row]] = await conn.query("SELECT emp_attendance_required FROM tb_employees WHERE emp_id = ?", [employeeId]);
    return row?.emp_attendance_required === 1;
}

function isEmployedOn(employee, dateText) {
    if (dateText < employee.emp_hire_date) return false;
    return !employee.emp_termination_date || dateText <= employee.emp_termination_date;
}

// ─── ข้อมูลประกอบของช่วงวัน ──────────────────────────────────────────────────────────────────

async function holidaysBetween(conn, fromDate, toDate) {
    const [rows] = await conn.query(
        `SELECT DATE_FORMAT(hd_date, '%Y-%m-%d') AS hd_date, hd_name FROM tb_company_holidays
         WHERE hd_date BETWEEN ? AND ?`,
        [fromDate, toDate],
    );
    return new Map(rows.map((row) => [row.hd_date, row.hd_name]));
}

/** ลาที่อนุมัติแล้ว → วันที่ → "full" | "morning" | "afternoon" (เช้า + บ่ายวันเดียวกัน = เต็มวัน) */
async function approvedLeavesBetween(conn, employeeId, fromDate, toDate) {
    const [rows] = await conn.query(
        `SELECT DATE_FORMAT(lr_start_date, '%Y-%m-%d') AS lr_start_date, DATE_FORMAT(lr_end_date, '%Y-%m-%d') AS lr_end_date,
                lr_half_day
         FROM tb_leave_requests
         WHERE lr_employee_id = ? AND lr_status = 'approved' AND lr_start_date <= ? AND lr_end_date >= ?`,
        [employeeId, toDate, fromDate],
    );
    const leaves = new Map();
    for (const row of rows) {
        for (let date = row.lr_start_date; date <= row.lr_end_date; date = addDays(date, 1)) {
            const previous = leaves.get(date);
            const isOtherHalf = previous && previous !== "full" && previous !== row.lr_half_day && row.lr_half_day !== "none";
            if (row.lr_half_day === "none" || isOtherHalf) leaves.set(date, "full");
            else if (!previous) leaves.set(date, row.lr_half_day);
        }
    }
    return leaves;
}

/** การกด (ที่ยังใช้อยู่) ของช่วงวันทำงาน จัดกลุ่มตามวันทำงาน */
async function punchesBetween(conn, employeeId, fromDate, toDate) {
    const [rows] = await conn.query(
        `SELECT ap_id, ap_type, DATE_FORMAT(ap_at, '%Y-%m-%d %H:%i:%s') AS ap_at,
                DATE_FORMAT(ap_work_date, '%Y-%m-%d') AS ap_work_date, ap_source, ap_location_name, ap_distance_m,
                ap_is_offsite, ap_is_wfh, ap_note
         FROM tb_attendance_punches
         WHERE ap_employee_id = ? AND ap_work_date BETWEEN ? AND ? AND ap_voided_at IS NULL
         ORDER BY ap_at`,
        [employeeId, fromDate, toDate],
    );
    const byDate = new Map();
    for (const row of rows) {
        const punch = { ...row, ap_is_offsite: row.ap_is_offsite === 1, ap_is_wfh: row.ap_is_wfh === 1 };
        if (!byDate.has(row.ap_work_date)) byDate.set(row.ap_work_date, []);
        byDate.get(row.ap_work_date).push(punch);
    }
    return byDate;
}

/**
 * สถานะรายวันของพนักงานในช่วงวัน (ทุกวันในช่วง)
 * @returns {Promise<object[]>} ต่อวัน: ผลจาก dayAttendanceOf + กะ + ชื่อวันหยุด + การกด
 */
async function daysOf(conn, employee, fromDate, toDate, today) {
    const isRequired = await attendanceRequiredOf(conn, employee.emp_id);
    const [[settings]] = await conn.query(
        "SELECT DATE_FORMAT(ps_attendance_start_date, '%Y-%m-%d') AS start_date FROM tb_payroll_settings WHERE ps_id = 1",
    );
    const trackingFrom = settings?.start_date ?? null;
    const schedules = await attendanceSetup.scheduleTimelineOf(conn, employee.emp_id);
    const holidays = await holidaysBetween(conn, fromDate, toDate);
    const leaves = await approvedLeavesBetween(conn, employee.emp_id, fromDate, toDate);
    const punches = await punchesBetween(conn, employee.emp_id, fromDate, toDate);
    const wfh = await wfhService.wfhInfoOf(conn, employee.emp_id, fromDate, toDate);
    const days = [];
    for (let date = fromDate; date <= toDate; date = addDays(date, 1)) {
        const schedule = attendanceSetup.scheduleOn(schedules, date);
        const dayPunches = punches.get(date) ?? [];
        if (!schedule) {
            days.push({ work_date: date, status: "no_schedule", punches: dayPunches, schedule: null, is_wfh: false });
            continue;
        }
        const day = dayAttendanceOf({
            workDate: date,
            today,
            schedule,
            isHoliday: holidays.has(date),
            leave: leaves.get(date) ?? null,
            isEmployed: isEmployedOn(employee, date),
            isRequired,
            punches: dayPunches,
            trackingFrom,
        });
        days.push({
            ...day,
            holiday_name: holidays.get(date) ?? null,
            leave: leaves.get(date) ?? null,
            is_wfh: wfhService.isWfhOn(wfh, date),
            schedule: {
                ws_id: schedule.ws_id,
                ws_name: schedule.ws_name,
                ws_start_time: schedule.ws_start_time,
                ws_end_time: schedule.ws_end_time,
                ws_late_grace_minutes: schedule.ws_late_grace_minutes,
            },
            punches: dayPunches,
        });
    }
    return days;
}

// ─── อ่าน ───────────────────────────────────────────────────────────────────────────────────

/**
 * หน้าลงเวลาของฉัน: วันนี้ + ทั้งเดือน + จุดลงเวลา
 * @param {string} yearMonth "YYYY-MM"
 */
async function getMine(conn, userId, yearMonth) {
    const today = todayBangkok();
    const now = nowBangkokText();
    const employee = await findLinkedEmployee(conn, userId);
    const locations = (await attendanceSetup.listLocations(conn, { activeOnly: true })).map((location) => ({
        al_id: location.al_id,
        al_name: location.al_name,
        al_latitude: location.al_latitude,
        al_longitude: location.al_longitude,
        al_radius_m: location.al_radius_m,
    }));
    const [[settings]] = await conn.query("SELECT ps_timesheet_enabled FROM tb_payroll_settings WHERE ps_id = 1");
    const base = { today, now, month: yearMonth, locations, timesheet_enabled: settings?.ps_timesheet_enabled === 1 };
    if (!employee) {
        return {
            ...base,
            employee: null,
            attendance_required: false,
            today_day: null,
            days: [],
            totals: null,
            corrections: [],
            overtime: [],
            wfh_weekdays: "0000000",
            wfh_requests: [],
        };
    }

    const monthStart = `${yearMonth}-01`;
    const monthEnd = `${yearMonth}-${String(daysInMonth(yearMonth)).padStart(2, "0")}`;
    const days = await daysOf(conn, employee, monthStart, monthEnd, today);
    // วันนี้ (เผื่อเปิดดูเดือนอื่น) · กะข้ามคืนที่ยังไม่ออก: หลังเที่ยงคืนยังนับเป็นกะของเมื่อวาน
    const todaySchedules = await attendanceSetup.scheduleTimelineOf(conn, employee.emp_id);
    const todaySchedule = attendanceSetup.scheduleOn(todaySchedules, today);
    const currentWorkDate = todaySchedule ? workDateOf(now, todaySchedule) : today;
    const [todayDay] = await daysOf(conn, employee, currentWorkDate, currentWorkDate, today);
    return {
        ...base,
        employee: { emp_id: employee.emp_id, emp_code: employee.emp_code, emp_hire_date: employee.emp_hire_date },
        attendance_required: await attendanceRequiredOf(conn, employee.emp_id),
        today_day: todayDay,
        days,
        totals: attendanceTotalsOf(days.filter((day) => day.work_date <= today)),
        // คำขอแก้เวลาของฉัน (A-2) — รออนุมัติทั้งหมด + ที่ตัดสินแล้วใน 60 วัน
        corrections: await correctionService.listMine(conn, employee.emp_id),
        // WFH (2026-10-24): วันประจำ + คำขอของฉัน
        wfh_weekdays: (await wfhService.wfhInfoOf(conn, employee.emp_id, today, today)).weekdays,
        wfh_requests: await wfhService.listMine(conn, employee.emp_id),
        // OT ของฉัน (A-3) — รออนุมัติทั้งหมด + 60 วันล่าสุด พร้อมนาทีที่ทำจริง
        overtime: await overtimeService.listMine(conn, employee.emp_id),
    };
}

// ─── กดเข้า/ออกงาน ─────────────────────────────────────────────────────────────────────────

/**
 * @param {{ user_id: string }} user
 * @param {{ ap_type: "in" | "out", latitude: number | null, longitude: number | null, accuracy: number | null, note: string | null }} request ผ่าน punchSchema แล้ว
 * @param {{ ip: string | null, userAgent: string | null }} client
 */
async function punch(conn, user, request, client) {
    const employee = await findLinkedEmployee(conn, user.user_id, { forUpdate: true });
    if (!employee) throw notAnEmployee();
    const now = nowBangkokText();
    const today = now.slice(0, 10);
    if (!(await attendanceRequiredOf(conn, employee.emp_id))) {
        throw new AppError(409, "ATTENDANCE_NOT_REQUIRED", "คุณไม่ต้องลงเวลาเข้า-ออกงาน (ฝ่ายบุคคลตั้งไว้) · ถ้าไม่ถูกต้องให้แจ้งฝ่ายบุคคล");
    }
    const schedules = await attendanceSetup.scheduleTimelineOf(conn, employee.emp_id);
    const todaySchedule = attendanceSetup.scheduleOn(schedules, today);
    if (!todaySchedule) {
        throw new AppError(409, "NO_WORK_SCHEDULE", "ยังไม่ได้ตั้งกะทำงาน · ให้ฝ่ายบุคคลตั้งกะเริ่มต้นในตั้งค่าบุคคลก่อน");
    }
    const workDate = workDateOf(now, todaySchedule);
    if (!isEmployedOn(employee, workDate)) {
        throw new AppError(409, "NOT_EMPLOYED_ON_DATE", "วันนี้อยู่นอกช่วงที่เป็นพนักงาน (ก่อนวันเริ่มงานหรือหลังวันทำงานวันสุดท้าย)");
    }
    await assertPeriodsOpen(conn, [workDate], "ลงเวลา");

    // กดซ้ำชนิดเดิมภายใน 60 วินาที → ตอบผลเดิม ไม่บันทึกเพิ่ม
    const duplicateSince = nowBangkokText(new Date(Date.now() - DUPLICATE_WINDOW_MS));
    const [[recent]] = await conn.query(
        `SELECT ap_id FROM tb_attendance_punches
         WHERE ap_employee_id = ? AND ap_type = ? AND ap_at >= ? AND ap_voided_at IS NULL
         ORDER BY ap_at DESC LIMIT 1`,
        [employee.emp_id, request.ap_type, duplicateSince],
    );
    if (recent) {
        const [day] = await daysOf(conn, employee, workDate, workDate, today);
        return { ap_id: recent.ap_id, is_duplicate: true, day };
    }

    const point =
        request.latitude !== null && request.longitude !== null
            ? { latitude: request.latitude, longitude: request.longitude }
            : null;
    const locations = await attendanceSetup.listLocations(conn, { activeOnly: true });
    const nearest = nearestLocation(point, locations);
    // วัน WFH = ไม่ตรวจตำแหน่ง (บันทึกพิกัดไว้) · ยังไม่ได้ตั้งจุดลงเวลาเลย = ไม่ตรวจตำแหน่ง (ทุกการกดถือว่าในจุด)
    const isWfh = wfhService.isWfhOn(await wfhService.wfhInfoOf(conn, employee.emp_id, workDate, workDate), workDate);
    const isOffsite = !isWfh && locations.length > 0 && !nearest.isInside;
    if (isOffsite && !request.note) {
        const reason = point
            ? `อยู่นอกจุดลงเวลา (ห่าง${nearest.location ? ` ${nearest.location.al_name}` : ""} ${nearest.distance} ม.)`
            : "ไม่ได้รับตำแหน่งจากมือถือ";
        throw new AppError(400, "VALIDATION", `${reason} · ใส่เหตุผลก่อนกด เช่น ไปพบลูกค้า`, {
            note: `${reason} · ใส่เหตุผล เช่น ไปพบลูกค้า ทำงานนอกสถานที่`,
        });
    }

    const [result] = await conn.query(
        `INSERT INTO tb_attendance_punches
            (ap_employee_id, ap_type, ap_at, ap_work_date, ap_source, ap_latitude, ap_longitude, ap_accuracy_m,
             ap_location_id, ap_location_name, ap_distance_m, ap_is_offsite, ap_is_wfh, ap_note, ap_ip, ap_user_agent, ap_created_by)
         VALUES (?, ?, ?, ?, 'mobile', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            employee.emp_id,
            request.ap_type,
            now,
            workDate,
            point?.latitude ?? null,
            point?.longitude ?? null,
            request.accuracy,
            nearest.location?.al_id ?? null,
            nearest.location?.al_name ?? null,
            nearest.distance,
            isOffsite ? 1 : 0,
            isWfh ? 1 : 0,
            request.note,
            client.ip ? String(client.ip).slice(0, 45) : null,
            client.userAgent ? String(client.userAgent).slice(0, 255) : null,
            user.user_id,
        ],
    );
    const [day] = await daysOf(conn, employee, workDate, workDate, today);
    return { ap_id: result.insertId, is_duplicate: false, day };
}

module.exports = { getMine, punch, daysOf };
