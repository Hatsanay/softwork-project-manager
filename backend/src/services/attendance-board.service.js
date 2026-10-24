// ลงเวลาพนักงาน สำหรับฝ่ายบุคคล/ผู้อนุมัติ (A-2 · 2026-10-24) — กระดานรายวัน · สรุปรายเดือน · รายวันของคนหนึ่ง
// สิทธิ์: manageEmployees หรือ approveTimesheet (route คุม) · ตำแหน่งที่กดเห็นได้เฉพาะกลุ่มนี้ + เจ้าตัว (PDPA · A16)
// สถานะรายวันคิดสดด้วย daysOf ตัวเดียวกับหน้าของพนักงาน (ตัวเลขตรงกันทุกหน้า)
const { AppError } = require("../utils/app-error");
const { todayBangkok } = require("../utils/bangkok-time");
const { daysInMonth } = require("../shared/payroll-math.mjs");
const { attendanceTotalsOf } = require("../shared/attendance-math.mjs");
const { daysOf } = require("./attendance.service");
const correctionService = require("./attendance-correction.service");
const overtimeService = require("./attendance-overtime.service");

const EMPLOYEE_COLUMNS = `e.emp_id, e.emp_code, e.emp_title, e.emp_first_name_th, e.emp_last_name_th, e.emp_nickname, e.emp_position,
    DATE_FORMAT(e.emp_hire_date, '%Y-%m-%d') AS emp_hire_date,
    DATE_FORMAT(e.emp_termination_date, '%Y-%m-%d') AS emp_termination_date,
    e.emp_attendance_required, d.dep_name AS department_name, COALESCE(e.emp_photo_url, u.user_avatar_url) AS photo_url`;

const EMPLOYEE_JOINS = `FROM tb_employees e
    LEFT JOIN tb_department d ON d.dep_id = e.emp_department_id
    LEFT JOIN tb_users u ON u.user_id = e.emp_user_id`;

function shapeEmployee(row) {
    return {
        emp_id: row.emp_id,
        emp_code: row.emp_code,
        full_name: `${row.emp_title ?? ""}${row.emp_first_name_th} ${row.emp_last_name_th}`,
        emp_nickname: row.emp_nickname,
        emp_position: row.emp_position,
        department_name: row.department_name,
        photo_url: row.photo_url,
        attendance_required: row.emp_attendance_required === 1,
    };
}

/** พนักงานที่เป็นพนักงานอยู่ในช่วงวัน (เริ่มงานก่อนวันสุดท้ายของช่วง และยังไม่พ้นสภาพก่อนวันแรก) */
async function employeesBetween(conn, fromDate, toDate) {
    const [rows] = await conn.query(
        `SELECT ${EMPLOYEE_COLUMNS} ${EMPLOYEE_JOINS}
         WHERE e.emp_hire_date <= ? AND (e.emp_termination_date IS NULL OR e.emp_termination_date >= ?)
         ORDER BY e.emp_code`,
        [toDate, fromDate],
    );
    return rows;
}

/**
 * กระดานรายวัน: ทุกคนที่เป็นพนักงานในวันนั้น + สถานะ + เวลาเข้า/ออก + กดนอกจุดไหม
 * @param {string} date "YYYY-MM-DD"
 */
async function getBoard(conn, date) {
    const today = todayBangkok();
    const employees = await employeesBetween(conn, date, date);
    const rows = [];
    for (const employee of employees) {
        const [day] = await daysOf(conn, employee, date, date, today);
        rows.push({ ...shapeEmployee(employee), day, has_offsite: day.punches.some((punch) => punch.ap_is_offsite) });
    }
    const countOf = (predicate) => rows.filter(predicate).length;
    return {
        date,
        today,
        counts: {
            total: rows.length,
            arrived: countOf((row) => Boolean(row.day.first_in)),
            late: countOf((row) => (row.day.late_minutes ?? 0) > 0),
            not_yet: countOf((row) => row.day.status === "not_yet"),
            absent: countOf((row) => row.day.status === "absent"),
            incomplete: countOf((row) => row.day.status === "incomplete"),
            leave: countOf((row) => row.day.status === "leave"),
            offsite: countOf((row) => row.has_offsite),
            wfh: countOf((row) => row.day.is_wfh && row.day.status !== "leave" && row.day.status !== "off"),
        },
        rows,
    };
}

function monthRange(yearMonth) {
    return { start: `${yearMonth}-01`, end: `${yearMonth}-${String(daysInMonth(yearMonth)).padStart(2, "0")}` };
}

/**
 * สรุปรายเดือนต่อคน (ใช้ตรวจก่อนปิดรอบเงินเดือน) — นับเฉพาะวันที่ผ่านมาแล้วและวันนี้
 * @param {string} yearMonth "YYYY-MM"
 */
async function getMonthSummary(conn, yearMonth) {
    const today = todayBangkok();
    const { start, end } = monthRange(yearMonth);
    const employees = await employeesBetween(conn, start, end);
    const rows = [];
    for (const employee of employees) {
        const days = await daysOf(conn, employee, start, end, today);
        const pastDays = days.filter((day) => day.work_date <= today);
        rows.push({
            ...shapeEmployee(employee),
            totals: attendanceTotalsOf(pastDays),
            incomplete_dates: pastDays.filter((day) => day.status === "incomplete").map((day) => day.work_date),
            absent_dates: pastDays.filter((day) => day.status === "absent").map((day) => day.work_date),
        });
    }
    return { month: yearMonth, today, rows };
}

/** รายวันของพนักงานคนหนึ่งในเดือน (หน้าพนักงาน แท็บเวลาทำงาน) + คำขอแก้เวลา */
async function getEmployeeMonth(conn, employeeId, yearMonth) {
    const today = todayBangkok();
    const [[employee]] = await conn.query(`SELECT ${EMPLOYEE_COLUMNS} ${EMPLOYEE_JOINS} WHERE e.emp_id = ?`, [employeeId]);
    if (!employee) throw new AppError(404, "EMPLOYEE_NOT_FOUND", "ไม่พบพนักงานนี้");
    const { start, end } = monthRange(yearMonth);
    const days = await daysOf(conn, employee, start, end, today);
    return {
        month: yearMonth,
        today,
        employee: shapeEmployee(employee),
        days,
        totals: attendanceTotalsOf(days.filter((day) => day.work_date <= today)),
        corrections: await correctionService.listMine(conn, employeeId),
        overtime: await overtimeService.listMine(conn, employeeId),
    };
}

module.exports = { getBoard, getMonthSummary, getEmployeeMonth };
