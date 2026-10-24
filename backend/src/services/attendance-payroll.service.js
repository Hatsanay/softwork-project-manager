// ลงเวลาในรอบเงินเดือน (ลงเวลา A-4 · 2026-10-24) — docs/plans/2026-10-23-attendance-ot.md หัวข้อ 3
//
// - หักสาย/ออกก่อน = ค่าจ้างต่อชั่วโมง × นาที (อัตรา 1.00 = เวลาที่ไม่ได้ทำงานจริง ไม่ใช่ค่าปรับ · ม.76) ไม่เกินเวลางานของวันนั้น
// - หักขาดงาน = วันละเท่าลาไม่รับค่าจ้าง (ตัวหารเดียวกัน ÷30 หรือ ÷วันทำงาน)
//   ทั้งสองอย่างลดเงินเดือนก่อนคิดภาษีและประกันสังคม (ไม่ได้ทำงาน = ไม่มีค่าจ้าง)
// - OT ที่อนุมัติ: จ่ายตามเวลาที่อยู่จริง (ช่วงที่อนุมัติ ∩ เข้า-ออก) แยกชนิดตามวันนั้น ปัดลงทีละ 15 นาที × อัตราตั้งค่า
//   เป็นเงินได้คิดภาษี · นับค่าจ้างประกันสังคมตามตั้งค่า (Y5) · เป็นรายการครั้งเดียว (ไม่ประมาณการซ้ำทั้งปีตอนคิดภาษี)
// - คิดเฉพาะวันที่เป็นพนักงาน · วันก่อนเริ่มใช้ลงเวลา/ไม่ต้องลงเวลา/ยังไม่ถึง = ไม่หัก (daysOf ให้สถานะนั้นอยู่แล้ว)
const { todayBangkok } = require("../utils/bangkok-time");
const { minuteWageOf, unpaidLeaveDeductionOf } = require("../shared/payroll-math.mjs");
const {
    actualOvertimeWindowOf,
    floorToQuarterHour,
    overtimeSplitOf,
    timeToMinutes,
} = require("../shared/attendance-math.mjs");
const { daysOf } = require("./attendance.service");
const attendanceSetup = require("./attendance-setup.service");

const OVERTIME_KINDS = [
    { key: "workday", label: "OT วันทำงาน", rateField: "ps_ot_rate_workday" },
    { key: "holidayWork", label: "ทำงานวันหยุด", rateField: "ps_ot_rate_holiday_work" },
    { key: "holidayOvertime", label: "OT วันหยุด", rateField: "ps_ot_rate_holiday_ot" },
];

function durationText(totalMinutes) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours === 0) return `${minutes} นาที`;
    return minutes > 0 ? `${hours} ชม. ${minutes} นาที` : `${hours} ชม.`;
}

/**
 * ลงเวลาของพนักงานคนหนึ่งในช่วงที่เป็นพนักงานของเดือน
 * @param {object} employee จาก findEligibleEmployees (มี emp_hire_date / emp_termination_date)
 * @param {object} context จาก loadPeriodContext (settings มีชั่วโมงต่อวัน อัตรา OT ตัวหารลาไม่รับค่าจ้าง)
 * @param {{ employedFrom: string, employedTo: string, salaryOn: (date: string) => bigint }} range
 */
async function attendanceForPayroll(conn, employee, context, { employedFrom, employedTo, salaryOn }) {
    const today = todayBangkok();
    const days = await daysOf(conn, employee, employedFrom, employedTo, today);
    const settings = context.settings;

    // ─ สาย/ออกก่อน (ไม่เกินเวลางานของวันนั้น) และขาดงาน ─
    let lateMinutes = 0;
    let earlyLeaveMinutes = 0;
    const lostTimeParts = [];
    const absentDays = [];
    for (const day of days) {
        if (day.status === "absent") {
            absentDays.push({ salary: salaryOn(day.work_date), dayUnits: 100n });
            continue;
        }
        const missedMinutes = (day.late_minutes ?? 0) + (day.early_leave_minutes ?? 0);
        if (missedMinutes === 0) continue;
        const workdaySpan = timeToMinutes(day.expected_end) - timeToMinutes(day.expected_start);
        const cappedMinutes = Math.min(missedMinutes, workdaySpan > 0 ? workdaySpan : missedMinutes);
        lateMinutes += day.late_minutes ?? 0;
        earlyLeaveMinutes += day.early_leave_minutes ?? 0;
        lostTimeParts.push({ salary: salaryOn(day.work_date), minutes: cappedMinutes });
    }
    const divisor = settings.ps_unpaid_leave_divisor === "working_days" ? context.workingDates.length : 30;
    const lostTimeAmount = minuteWageOf(lostTimeParts, "1.00", settings.ps_hours_per_day);
    const absentAmount = unpaidLeaveDeductionOf(absentDays, divisor);

    // ─ OT ที่อนุมัติ: ช่วงที่อนุมัติ ∩ เวลาที่อยู่จริง แยกชนิดตามวันนั้น ─
    const [approvedOvertime] = await conn.query(
        `SELECT DATE_FORMAT(ot_work_date, '%Y-%m-%d') AS ot_work_date,
                DATE_FORMAT(ot_start_at, '%Y-%m-%d %H:%i:%s') AS ot_start_at, DATE_FORMAT(ot_end_at, '%Y-%m-%d %H:%i:%s') AS ot_end_at
         FROM tb_overtime_requests
         WHERE ot_employee_id = ? AND ot_status = 'approved' AND ot_work_date BETWEEN ? AND ?
         ORDER BY ot_start_at`,
        [employee.emp_id, employedFrom, employedTo],
    );
    const daysByDate = new Map(days.map((day) => [day.work_date, day]));
    const schedules = await attendanceSetup.scheduleTimelineOf(conn, employee.emp_id);
    const overtimeParts = { workday: [], holidayWork: [], holidayOvertime: [] };
    const overtimeMinutes = { workday: 0, holidayWork: 0, holidayOvertime: 0 };
    for (const overtime of approvedOvertime) {
        const day = daysByDate.get(overtime.ot_work_date);
        const schedule = attendanceSetup.scheduleOn(schedules, overtime.ot_work_date);
        if (!day || !schedule) continue;
        const window = actualOvertimeWindowOf({
            startAt: overtime.ot_start_at,
            endAt: overtime.ot_end_at,
            firstIn: day.first_in,
            lastOut: day.last_out,
        });
        if (!window) continue;
        const split = overtimeSplitOf({
            workDate: overtime.ot_work_date,
            startAt: window.startAt,
            endAt: window.endAt,
            schedule,
            isHoliday: Boolean(day.holiday_name),
        });
        const salary = salaryOn(overtime.ot_work_date);
        for (const kind of OVERTIME_KINDS) {
            const minutes = floorToQuarterHour(split[kind.key]);
            if (minutes === 0) continue;
            overtimeMinutes[kind.key] += minutes;
            overtimeParts[kind.key].push({ salary, minutes });
        }
    }
    const overtimeLines = [];
    for (const kind of OVERTIME_KINDS) {
        const amount = minuteWageOf(overtimeParts[kind.key], settings[kind.rateField], settings.ps_hours_per_day);
        if (amount <= 0n) continue;
        overtimeLines.push({
            label: `${kind.label} ${durationText(overtimeMinutes[kind.key])} × ${Number(settings[kind.rateField])} เท่า`,
            amount,
        });
    }

    return {
        lateMinutes,
        earlyLeaveMinutes,
        absentDays: absentDays.length,
        deduction: lostTimeAmount + absentAmount,
        overtimeLines,
    };
}

module.exports = { attendanceForPayroll };
