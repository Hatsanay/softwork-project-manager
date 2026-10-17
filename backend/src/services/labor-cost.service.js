// ต้นทุนค่าแรงโปรเจกต์ (2026-10-17 เฟส 4 ขั้น 4-2 — docs/plans/2026-10-17-people-payroll-4.md หัวข้อ 4.2, H2-ก)
//
// ค่าแรง = ต้นทุนเดือนนั้นของพนักงาน × ชั่วโมงที่อนุมัติในโปรเจกต์ ÷ ชั่วโมงมาตรฐานของเดือน
// ต้นทุนเดือน (ประมาณการ — ขั้น 4-4 จะใช้ตัวเลขจริงจากรอบเงินเดือนที่อนุมัติแทน) =
//   เงินเดือนฐาน + รายรับประจำที่ติ๊ก "นับเป็นค่าจ้างประกันสังคม" + ประกันสังคมส่วนบริษัท (ถ้าเข้าประกันสังคม)
//   ใช้อัตราที่มีผล ณ วันอ้างอิงของเดือน = วันที่ 1 หรือวันเริ่มงานถ้าเริ่มกลางเดือน
// ชั่วโมงมาตรฐาน = วันทำงานของเดือน (ตามวันทำงานในสัปดาห์ ไม่รวมวันหยุดบริษัท) × ชั่วโมงต่อวัน · 0 ชม. = ค่าแรง 0 (R-H11)
// ผลลัพธ์เป็นยอดรวมเท่านั้น ไม่แยกรายคน (H3 — ค่าแรงรายคนคำนวณย้อนกลับเป็นเงินเดือนได้)
const { parseHundredths } = require("../shared/money.mjs");
const { toDecimalText } = require("../shared/quotation-totals.mjs");
const { laborCostOf, ssoContributionOf, standardHoursOf, workingDatesOfMonth } = require("../shared/payroll-math.mjs");

const money = (value) => parseHundredths(value ?? "0", "ยอดเงิน");

/**
 * ค่าแรงประมาณการของโปรเจกต์
 * @param {import("mysql2/promise").Pool | import("mysql2/promise").PoolConnection} conn
 * @param {string} projectId
 * @returns {Promise<{ costThb: bigint, approvedHours: bigint, pendingHours: bigint, byMonth: object[] }>}
 */
async function estimateProjectLabor(conn, projectId) {
    const [approved] = await conn.query(
        `SELECT e.tse_employee_id, DATE_FORMAT(e.tse_date, '%Y-%m') AS month_key, SUM(e.tse_hours) AS hours
         FROM tb_timesheet_entries e
         WHERE e.tse_project_id = ? AND e.tse_approved_at IS NOT NULL
         GROUP BY e.tse_employee_id, month_key
         ORDER BY month_key`,
        [projectId],
    );
    const [[pending]] = await conn.query(
        `SELECT COALESCE(SUM(e.tse_hours), 0) AS hours
         FROM tb_timesheet_entries e JOIN tb_timesheet_weeks w ON w.tsw_id = e.tse_week_id
         WHERE e.tse_project_id = ? AND e.tse_approved_at IS NULL AND w.tsw_status = 'submitted'`,
        [projectId],
    );

    const monthContext = await loadMonthContext(
        conn,
        approved.map((row) => row.month_key),
    );
    const months = new Map();
    let costThb = 0n;
    let approvedHours = 0n;
    for (const row of approved) {
        const hours = money(row.hours);
        const monthlyCost = await monthlyLaborCost(conn, row.tse_employee_id, row.month_key);
        const cost = laborCostOf(monthlyCost, hours, monthContext.get(row.month_key).standardHours);
        costThb += cost;
        approvedHours += hours;
        const month = months.get(row.month_key) ?? { hours: 0n, cost: 0n };
        month.hours += hours;
        month.cost += cost;
        months.set(row.month_key, month);
    }
    return {
        costThb,
        approvedHours,
        pendingHours: money(pending.hours),
        byMonth: [...months.entries()].map(([yearMonth, month]) => ({
            year_month: yearMonth,
            hours: toDecimalText(month.hours),
            cost_thb: toDecimalText(month.cost),
            standard_hours: toDecimalText(monthContext.get(yearMonth).standardHours),
        })),
    };
}

/**
 * ชั่วโมงมาตรฐานของแต่ละเดือน (ทั้งบริษัท)
 * @param {string[]} yearMonths "YYYY-MM"
 * @returns {Promise<Map<string, { standardHours: bigint }>>}
 */
async function loadMonthContext(conn, yearMonths) {
    const uniqueMonths = [...new Set(yearMonths)];
    const context = new Map();
    if (uniqueMonths.length === 0) return context;
    const [[settings]] = await conn.query(
        "SELECT ps_working_weekdays, ps_hours_per_day FROM tb_payroll_settings WHERE ps_id = 1",
    );
    const [holidays] = await conn.query(
        `SELECT DATE_FORMAT(hd_date, '%Y-%m-%d') AS hd_date FROM tb_company_holidays
         WHERE DATE_FORMAT(hd_date, '%Y-%m') IN (?)`,
        [uniqueMonths],
    );
    const holidayDates = new Set(holidays.map((holiday) => holiday.hd_date));
    for (const yearMonth of uniqueMonths) {
        const workingDates = workingDatesOfMonth(yearMonth, settings.ps_working_weekdays, holidayDates);
        context.set(yearMonth, { standardHours: standardHoursOf(workingDates.length, settings.ps_hours_per_day) });
    }
    return context;
}

/**
 * ต้นทุนค่าแรงทั้งเดือนของพนักงาน (ประมาณการ) — สตางค์
 * @param {string} employeeId
 * @param {string} yearMonth "YYYY-MM"
 * @returns {Promise<bigint>}
 */
async function monthlyLaborCost(conn, employeeId, yearMonth) {
    const [[employee]] = await conn.query(
        "SELECT emp_sso_enrolled, DATE_FORMAT(emp_hire_date, '%Y-%m-%d') AS emp_hire_date FROM tb_employees WHERE emp_id = ?",
        [employeeId],
    );
    if (!employee) return 0n;
    const monthStart = `${yearMonth}-01`;
    const referenceDate = employee.emp_hire_date > monthStart ? employee.emp_hire_date : monthStart;

    const [[compensation]] = await conn.query(
        `SELECT ecm_base_salary FROM tb_employee_compensations
         WHERE ecm_employee_id = ? AND ecm_effective_from <= ? ORDER BY ecm_effective_from DESC LIMIT 1`,
        [employeeId, referenceDate],
    );
    const [[wageItems]] = await conn.query(
        `SELECT COALESCE(SUM(eri_amount), 0) AS total FROM tb_employee_recurring_items
         WHERE eri_employee_id = ? AND eri_kind = 'earning' AND eri_is_sso_wage = 1
           AND eri_effective_from <= ? AND (eri_effective_to IS NULL OR eri_effective_to >= ?)`,
        [employeeId, referenceDate, referenceDate],
    );
    const wage = money(compensation?.ecm_base_salary) + money(wageItems.total);
    if (employee.emp_sso_enrolled !== 1) return wage;

    const [[ssoRate]] = await conn.query(
        `SELECT sr_employer_rate, sr_wage_floor, sr_wage_ceiling FROM tb_sso_rates
         WHERE sr_effective_from <= ? ORDER BY sr_effective_from DESC LIMIT 1`,
        [referenceDate],
    );
    if (!ssoRate) return wage;
    const employerContribution = ssoContributionOf(wage, {
        rate: ssoRate.sr_employer_rate,
        floor: ssoRate.sr_wage_floor,
        ceiling: ssoRate.sr_wage_ceiling,
    });
    return wage + employerContribution;
}

module.exports = { estimateProjectLabor, monthlyLaborCost };
