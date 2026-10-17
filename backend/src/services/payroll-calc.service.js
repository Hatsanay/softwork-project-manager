// คิดเงินเดือนรายคนของรอบ (2026-10-17 เฟส 4 ขั้น 4-4) — docs/plans/2026-10-17-people-payroll-4.md หัวข้อ 4.3
//
// ทุกตัวเลขเป็น BigInt สตางค์ · วันที่เป็นข้อความเวลาไทย · ตัวเลือกที่รอนักบัญชียืนยัน:
//   Y1 ประกันสังคม = ฐาน (จำกัดขั้นต่ำ–เพดาน) × อัตรา ปัดเป็นบาท · Y3 ลาไม่รับค่าจ้าง ÷ 30 หรือ ÷ วันทำงาน (ตั้งค่า) · Y4 เข้า/ออกกลางเดือนตามวันปฏิทิน
// ภาษี (H9): เงินได้ทั้งปีประมาณ = สะสมก่อนเดือนนี้ + เดือนนี้ + เงินได้ประจำเต็มเดือน × เดือนที่เหลือหลังเดือนนี้
//   (รายรับครั้งเดียว เช่น โบนัส ไม่ถูกคูณ) → ภาษีทั้งปี → หักเดือนนี้ = ที่ค้าง ÷ เดือนที่เหลือรวมเดือนนี้ · เดือนสุดท้าย (ธ.ค./เดือนที่ออก) = ที่ค้างทั้งหมด
const { formatHundredths, parseHundredths } = require("../shared/money.mjs");
const {
    addDays,
    daysBetween,
    daysInMonth,
    prorateByDays,
    unpaidLeaveDeductionOf,
    ssoContributionOf,
    incomeTaxOf,
    annualNetIncomeOf,
    monthlyWithholdingOf,
    standardHoursOf,
    workingDatesBetween,
} = require("../shared/payroll-math.mjs");

const money = (value) => parseHundredths(value ?? "0", "ยอดเงิน");
const ALLOWANCE_COLUMNS = [
    "etp_spouse_allowance",
    "etp_child_allowance",
    "etp_parent_allowance",
    "etp_insurance_allowance",
    "etp_fund_allowance",
    "etp_home_loan_interest",
    "etp_other_allowance",
];

/**
 * ข้อมูลของเดือนที่ใช้ร่วมกันทั้งรอบ — ตั้งค่า · วันหยุด · อัตราประกันสังคม · ปีภาษี
 * @param {string} period "YYYY-MM"
 */
async function loadPeriodContext(conn, period) {
    const monthStart = `${period}-01`;
    const totalDays = daysInMonth(period);
    const monthEnd = `${period}-${String(totalDays).padStart(2, "0")}`;
    const taxYear = Number(period.slice(0, 4));

    const [[settings]] = await conn.query(
        "SELECT ps_working_weekdays, ps_hours_per_day, ps_unpaid_leave_divisor FROM tb_payroll_settings WHERE ps_id = 1",
    );
    const [holidays] = await conn.query(
        "SELECT DATE_FORMAT(hd_date, '%Y-%m-%d') AS hd_date FROM tb_company_holidays WHERE hd_date BETWEEN ? AND ?",
        [monthStart, monthEnd],
    );
    const holidayDates = new Set(holidays.map((row) => row.hd_date));
    const workingDates = workingDatesBetween(monthStart, monthEnd, settings.ps_working_weekdays, holidayDates);

    const [[ssoRate]] = await conn.query(
        `SELECT sr_employee_rate, sr_employer_rate, sr_wage_floor, sr_wage_ceiling FROM tb_sso_rates
         WHERE sr_effective_from <= ? ORDER BY sr_effective_from DESC LIMIT 1`,
        [monthStart],
    );
    const [[taxYearRow]] = await conn.query(
        `SELECT ity_tax_year, ity_expense_rate, ity_expense_cap, ity_personal_allowance FROM tb_income_tax_years
         WHERE ity_tax_year <= ? ORDER BY ity_tax_year DESC LIMIT 1`,
        [taxYear],
    );
    const [brackets] = taxYearRow
        ? await conn.query(
              "SELECT itb_from_amount AS `from`, itb_rate AS rate FROM tb_income_tax_brackets WHERE itb_tax_year = ?",
              [taxYearRow.ity_tax_year],
          )
        : [[]];

    return {
        period,
        monthStart,
        monthEnd,
        totalDays,
        taxYear,
        monthNumber: Number(period.slice(5, 7)),
        settings,
        holidayDates,
        workingDates,
        standardHours: standardHoursOf(workingDates.length, settings.ps_hours_per_day),
        ssoRate: ssoRate ?? null,
        taxYearRow: taxYearRow ?? null,
        brackets,
    };
}

/**
 * พนักงานที่เป็นพนักงานอย่างน้อยหนึ่งวันในเดือน (R-H9 — ออกก่อนเดือนนี้ไม่ถูกคิด)
 */
async function findEligibleEmployees(conn, context) {
    const [rows] = await conn.query(
        `SELECT e.emp_id, e.emp_code, e.emp_title, e.emp_first_name_th, e.emp_last_name_th, e.emp_national_id, e.emp_position,
                e.emp_bank_name, e.emp_bank_account_no, e.emp_sso_enrolled, d.dep_name,
                DATE_FORMAT(e.emp_hire_date, '%Y-%m-%d') AS emp_hire_date,
                DATE_FORMAT(e.emp_termination_date, '%Y-%m-%d') AS emp_termination_date
         FROM tb_employees e LEFT JOIN tb_department d ON d.dep_id = e.emp_department_id
         WHERE e.emp_hire_date <= ? AND (e.emp_termination_date IS NULL OR e.emp_termination_date >= ?)
         ORDER BY e.emp_code`,
        [context.monthEnd, context.monthStart],
    );
    return rows;
}

// เงินเดือนต่อเดือน ณ วันหนึ่ง = อัตราล่าสุดที่มีผลแล้ว
function salaryOn(compensations, date) {
    let salary = 0n;
    for (const compensation of compensations) {
        if (compensation.ecm_effective_from > date) break;
        salary = money(compensation.ecm_base_salary);
    }
    return salary;
}

/**
 * ตัวเลขทั้งหมดของพนักงานหนึ่งคนในเดือน (ยังไม่บันทึก)
 * @param {object} employee จาก findEligibleEmployees
 * @param {object} context จาก loadPeriodContext
 * @param {Array<object>} manualLines รายการกรอกเองของคนนี้ในรอบ (คงไว้ทุกครั้งที่คิดใหม่)
 * @param {number} runId รอบนี้ (ไม่นับตัวเองในยอดสะสม)
 */
async function calculateEmployee(conn, employee, context, manualLines, runId) {
    const employedFrom = employee.emp_hire_date > context.monthStart ? employee.emp_hire_date : context.monthStart;
    const employedTo =
        employee.emp_termination_date && employee.emp_termination_date < context.monthEnd
            ? employee.emp_termination_date
            : context.monthEnd;
    const employedDays = daysBetween(employedFrom, employedTo) + 1;

    // ─ เงินเดือนตามสัดส่วน (แยกช่วงเมื่ออัตราเปลี่ยนกลางเดือน) ─
    const [compensations] = await conn.query(
        `SELECT DATE_FORMAT(ecm_effective_from, '%Y-%m-%d') AS ecm_effective_from, ecm_base_salary
         FROM tb_employee_compensations WHERE ecm_employee_id = ? ORDER BY ecm_effective_from`,
        [employee.emp_id],
    );
    const parts = [];
    let segmentStart = employedFrom;
    let segmentSalary = salaryOn(compensations, employedFrom);
    for (let date = addDays(employedFrom, 1); date <= employedTo; date = addDays(date, 1)) {
        const salary = salaryOn(compensations, date);
        if (salary === segmentSalary) continue;
        parts.push({ amount: segmentSalary, days: daysBetween(segmentStart, date) });
        segmentStart = date;
        segmentSalary = salary;
    }
    parts.push({ amount: segmentSalary, days: daysBetween(segmentStart, employedTo) + 1 });
    const salaryAmount = prorateByDays(parts, context.totalDays);
    const baseSalary = salaryOn(compensations, employedTo);

    // ─ ลาไม่รับค่าจ้าง (อนุมัติแล้ว · วันทำงานในช่วงที่เป็นพนักงาน) ─
    const [unpaidLeaves] = await conn.query(
        `SELECT DATE_FORMAT(r.lr_start_date, '%Y-%m-%d') AS lr_start_date, DATE_FORMAT(r.lr_end_date, '%Y-%m-%d') AS lr_end_date,
                r.lr_half_day
         FROM tb_leave_requests r JOIN tb_leave_types t ON t.lt_id = r.lr_leave_type_id
         WHERE r.lr_employee_id = ? AND r.lr_status = 'approved' AND t.lt_is_paid = 0
           AND r.lr_start_date <= ? AND r.lr_end_date >= ?`,
        [employee.emp_id, employedTo, employedFrom],
    );
    const leaveDays = [];
    for (const leave of unpaidLeaves) {
        const start = leave.lr_start_date > employedFrom ? leave.lr_start_date : employedFrom;
        const end = leave.lr_end_date < employedTo ? leave.lr_end_date : employedTo;
        const dates = workingDatesBetween(start, end, context.settings.ps_working_weekdays, context.holidayDates);
        const dayUnits = leave.lr_half_day === "none" ? 100n : 50n;
        for (const date of dates) leaveDays.push({ salary: salaryOn(compensations, date), dayUnits });
    }
    const divisor = context.settings.ps_unpaid_leave_divisor === "working_days" ? context.workingDates.length : 30;
    const unpaidLeaveAmount = unpaidLeaveDeductionOf(leaveDays, divisor);
    const unpaidLeaveDays = leaveDays.reduce((sum, day) => sum + day.dayUnits, 0n);

    // ─ รายการประจำที่มีผลในเดือน (เต็มจำนวน) + รายการกรอกเอง ─
    const [recurring] = await conn.query(
        `SELECT eri_kind, eri_label, eri_amount, eri_is_taxable, eri_is_sso_wage FROM tb_employee_recurring_items
         WHERE eri_employee_id = ? AND eri_effective_from <= ? AND (eri_effective_to IS NULL OR eri_effective_to >= ?)
         ORDER BY eri_kind, eri_id`,
        [employee.emp_id, employedTo, employedFrom],
    );
    const recurringLines = recurring.map((item) => ({
        pil_source: "recurring",
        pil_kind: item.eri_kind,
        pil_label: item.eri_label,
        pil_amount: item.eri_amount,
        pil_is_taxable: item.eri_kind === "earning" && item.eri_is_taxable === 1,
        pil_is_sso_wage: item.eri_kind === "earning" && item.eri_is_sso_wage === 1,
        pil_is_one_off: false,
    }));
    const lines = [...recurringLines, ...manualLines];
    const earningLines = lines.filter((line) => line.pil_kind === "earning");
    const sumOf = (selected) => selected.reduce((sum, line) => sum + money(line.pil_amount), 0n);
    const otherEarnings = sumOf(earningLines);
    const otherDeductions = sumOf(lines.filter((line) => line.pil_kind === "deduction"));
    const taxableEarnings = sumOf(earningLines.filter((line) => line.pil_is_taxable));
    const ssoWageEarnings = sumOf(earningLines.filter((line) => line.pil_is_sso_wage));
    const regularTaxableEarnings = sumOf(earningLines.filter((line) => line.pil_is_taxable && !line.pil_is_one_off));
    const regularSsoEarnings = sumOf(
        earningLines.filter((line) => line.pil_is_sso_wage && line.pil_source === "recurring"),
    );

    const salaryAfterLeave = salaryAmount - unpaidLeaveAmount;
    const gross = salaryAfterLeave + otherEarnings;
    const taxableIncome = salaryAfterLeave + taxableEarnings;
    const ssoWage = salaryAfterLeave + ssoWageEarnings;

    // ─ ประกันสังคม ─
    const isSsoEnrolled = employee.emp_sso_enrolled === 1 && context.ssoRate !== null;
    const ssoOf = (wage, rate) =>
        isSsoEnrolled && wage > 0n
            ? ssoContributionOf(wage, {
                  rate,
                  floor: context.ssoRate.sr_wage_floor,
                  ceiling: context.ssoRate.sr_wage_ceiling,
              })
            : 0n;
    const ssoEmployee = ssoOf(ssoWage, context.ssoRate?.sr_employee_rate);
    const ssoEmployer = ssoOf(ssoWage, context.ssoRate?.sr_employer_rate);

    // ─ ภาษี (H9) ─
    const ytd = await yearToDate(conn, employee.emp_id, context, runId);
    const lastMonth =
        employee.emp_termination_date && employee.emp_termination_date.slice(0, 4) === String(context.taxYear)
            ? Number(employee.emp_termination_date.slice(5, 7))
            : 12;
    const remainingMonths = Math.max(1, lastMonth - context.monthNumber + 1);
    const futureMonths = BigInt(remainingMonths - 1);
    const regularMonthly = baseSalary + regularTaxableEarnings;
    const regularSso = ssoOf(baseSalary + regularSsoEarnings, context.ssoRate?.sr_employee_rate);
    const annualIncome = ytd.income + taxableIncome + regularMonthly * futureMonths;
    let annualTax = 0n;
    let tax = 0n;
    if (context.taxYearRow) {
        const allowances = money(context.taxYearRow.ity_personal_allowance) + ytd.allowances;
        const annualNet = annualNetIncomeOf({
            annualIncome,
            expenseRate: context.taxYearRow.ity_expense_rate,
            expenseCap: context.taxYearRow.ity_expense_cap,
            allowances,
            ssoAnnual: ytd.sso + ssoEmployee + regularSso * futureMonths,
        });
        annualTax = incomeTaxOf(annualNet, context.brackets);
        tax = monthlyWithholdingOf({ annualTax, withheldBefore: ytd.tax, remainingMonths });
    }

    const net = gross - otherDeductions - ssoEmployee - tax;
    const employedWorkingDays = context.workingDates.filter(
        (date) => date >= employedFrom && date <= employedTo,
    ).length;

    return {
        item: {
            pri_employee_id: employee.emp_id,
            pri_emp_code: employee.emp_code,
            pri_full_name: [employee.emp_title, `${employee.emp_first_name_th} ${employee.emp_last_name_th}`]
                .filter(Boolean)
                .join(""),
            pri_national_id: employee.emp_national_id,
            pri_position: employee.emp_position,
            pri_department_name: employee.dep_name,
            pri_bank_name: employee.emp_bank_name,
            pri_bank_account_no: employee.emp_bank_account_no,
            pri_sso_enrolled: employee.emp_sso_enrolled === 1 ? 1 : 0,
            pri_employed_days: employedDays,
            pri_days_in_month: context.totalDays,
            pri_base_salary: formatHundredths(baseSalary),
            pri_salary_amount: formatHundredths(salaryAmount),
            pri_unpaid_leave_days: formatHundredths(unpaidLeaveDays),
            pri_unpaid_leave_amount: formatHundredths(unpaidLeaveAmount),
            pri_other_earnings: formatHundredths(otherEarnings),
            pri_other_deductions: formatHundredths(otherDeductions),
            pri_gross: formatHundredths(gross),
            pri_taxable_income: formatHundredths(taxableIncome),
            pri_sso_wage: formatHundredths(ssoWage),
            pri_sso_employee: formatHundredths(ssoEmployee),
            pri_sso_employer: formatHundredths(ssoEmployer),
            pri_ytd_income_before: formatHundredths(ytd.income),
            pri_ytd_tax_before: formatHundredths(ytd.tax),
            pri_ytd_sso_before: formatHundredths(ytd.sso),
            pri_annual_income_estimate: formatHundredths(annualIncome),
            pri_annual_tax_estimate: formatHundredths(annualTax),
            pri_tax: formatHundredths(tax),
            pri_net: formatHundredths(net),
            pri_standard_hours: formatHundredths(
                standardHoursOf(employedWorkingDays, context.settings.ps_hours_per_day),
            ),
            pri_labor_cost: formatHundredths(gross + ssoEmployer),
        },
        recurringLines,
    };
}

/**
 * ยอดสะสมของปีก่อนเดือนนี้ = รอบที่อนุมัติ/จ่ายแล้วของปีเดียวกัน + ยอดยกมาในค่าลดหย่อนรายปี · พร้อมค่าลดหย่อนที่แจ้ง
 */
async function yearToDate(conn, employeeId, context, runId) {
    const [[totals]] = await conn.query(
        `SELECT COALESCE(SUM(i.pri_taxable_income), 0) AS income, COALESCE(SUM(i.pri_tax), 0) AS tax,
                COALESCE(SUM(i.pri_sso_employee), 0) AS sso
         FROM tb_payroll_items i JOIN tb_payroll_runs r ON r.pr_id = i.pri_run_id
         WHERE i.pri_employee_id = ? AND r.pr_id <> ? AND r.pr_status IN ('approved', 'paid')
           AND r.pr_period >= ? AND r.pr_period < ?`,
        [employeeId, runId ?? 0, `${context.taxYear}-01`, context.period],
    );
    const [[profile]] = await conn.query(
        `SELECT ${ALLOWANCE_COLUMNS.join(", ")}, etp_prior_income, etp_prior_tax, etp_prior_sso
         FROM tb_employee_tax_profiles WHERE etp_employee_id = ? AND etp_tax_year = ?`,
        [employeeId, context.taxYear],
    );
    const allowances = profile ? ALLOWANCE_COLUMNS.reduce((sum, column) => sum + money(profile[column]), 0n) : 0n;
    return {
        income: money(totals.income) + money(profile?.etp_prior_income),
        tax: money(totals.tax) + money(profile?.etp_prior_tax),
        sso: money(totals.sso) + money(profile?.etp_prior_sso),
        allowances,
    };
}

module.exports = { loadPeriodContext, findEligibleEmployees, calculateEmployee, ALLOWANCE_COLUMNS };
