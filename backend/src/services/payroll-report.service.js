// แบบยื่นภาษี/ประกันสังคมจากรอบเงินเดือน (2026-10-17 เฟส 4 ขั้น 4-5) — docs/plans/2026-10-17-people-payroll-4.md หัวข้อ 3.8
//
// อ่านอย่างเดียวจาก snapshot ของรอบ (tb_payroll_items) — ไม่คิดใหม่
// - นับเฉพาะรอบที่ "จ่ายแล้ว" (ภาษีหัก ณ ที่จ่ายเกิดตอนจ่าย) · รอบที่อนุมัติแต่ยังไม่บันทึกจ่ายเตือนแยก
// - ภ.ง.ด.1 (รายเดือน) · สปส.1-10 (รายเดือน) · ภ.ง.ด.1ก (รายปี) · 50 ทวิ ประจำปีของพนักงาน (คิดตอนอ่าน ไม่ออกเลขรัน)
// - ยอดยกมาในค่าลดหย่อนรายปีรวมในแบบรายปีเฉพาะที่เป็นของบริษัทนี้ (etp_prior_from_other_employer = 0)
// - ไฟล์ยื่นออนไลน์ (e-filing / สปส. ออนไลน์) ยังไม่ทำ — รอรูปแบบจากนักบัญชี (Y5)
const { AppError } = require("../utils/app-error");
const { addDays } = require("../shared/payroll-math.mjs");
const { parseHundredths } = require("../shared/money.mjs");
const { toDecimalText } = require("../shared/quotation-totals.mjs");
const companyService = require("./company.service");

const money = (value) => parseHundredths(value ?? "0", "ยอดเงิน");

function nextMonthDay(period, day) {
    const nextMonth = addDays(`${period}-28`, 7).slice(0, 7);
    return `${nextMonth}-${String(day).padStart(2, "0")}`;
}

async function companyInfo(conn) {
    const company = await companyService.findCompany(conn);
    return { name: company.cs_name_th, tax_id: company.cs_tax_id, address: company.cs_address_th };
}

/**
 * รอบของเดือน — จ่ายแล้วใช้ได้ · อนุมัติแต่ยังไม่จ่าย / ยังไม่อนุมัติ = ยังไม่มีข้อมูลยื่น (บอกเหตุผล)
 */
async function findPaidRun(conn, period) {
    const [[run]] = await conn.query(
        `SELECT pr_id, pr_number, pr_status, DATE_FORMAT(pr_paid_date, '%Y-%m-%d') AS pr_paid_date
         FROM tb_payroll_runs WHERE pr_period = ? AND pr_status <> 'cancelled'`,
        [period],
    );
    if (!run) return { run: null, notice: "ยังไม่มีรอบเงินเดือนของเดือนนี้" };
    if (run.pr_status !== "paid") {
        return {
            run,
            notice:
                run.pr_status === "approved"
                    ? `รอบ ${run.pr_number} อนุมัติแล้วแต่ยังไม่บันทึกจ่าย — แบบนับเฉพาะเงินที่จ่ายแล้ว`
                    : `รอบ ${run.pr_number} ยังไม่อนุมัติ`,
        };
    }
    return { run, notice: null };
}

/**
 * ใบแนบ ภ.ง.ด.1 ของเดือน — เงินได้ 40(1) ที่จ่าย + ภาษีที่หัก รายคน
 * @param {string} period "YYYY-MM"
 */
async function monthlyPnd1(conn, period) {
    const { run, notice } = await findPaidRun(conn, period);
    const [rows] =
        run && !notice
            ? await conn.query(
                  `SELECT pri_emp_code, pri_full_name, pri_national_id, pri_taxable_income, pri_tax
                   FROM tb_payroll_items WHERE pri_run_id = ? AND pri_taxable_income > 0 ORDER BY pri_emp_code`,
                  [run.pr_id],
              )
            : [[]];
    return {
        period,
        company: await companyInfo(conn),
        run,
        notice,
        paid_date: run?.pr_paid_date ?? null,
        due_date: nextMonthDay(period, 7),
        due_date_online: nextMonthDay(period, 15),
        rows: rows.map((row) => ({
            emp_code: row.pri_emp_code,
            full_name: row.pri_full_name,
            national_id: row.pri_national_id,
            income: row.pri_taxable_income,
            tax: row.pri_tax,
        })),
        total_income: toDecimalText(rows.reduce((sum, row) => sum + money(row.pri_taxable_income), 0n)),
        total_tax: toDecimalText(rows.reduce((sum, row) => sum + money(row.pri_tax), 0n)),
        missing_national_id: rows.filter((row) => !row.pri_national_id).map((row) => row.pri_emp_code),
    };
}

/**
 * แบบรายการเงินสมทบประกันสังคม (สปส.1-10 ส่วนที่ 2) ของเดือน — เฉพาะผู้ประกันตน
 */
async function monthlySso(conn, period) {
    const { run, notice } = await findPaidRun(conn, period);
    const [rows] =
        run && !notice
            ? await conn.query(
                  `SELECT i.pri_emp_code, i.pri_full_name, i.pri_national_id, e.emp_sso_number, i.pri_sso_wage,
                          i.pri_sso_employee, i.pri_sso_employer
                   FROM tb_payroll_items i JOIN tb_employees e ON e.emp_id = i.pri_employee_id
                   WHERE i.pri_run_id = ? AND i.pri_sso_enrolled = 1 ORDER BY i.pri_emp_code`,
                  [run.pr_id],
              )
            : [[]];
    const totalOf = (column) => rows.reduce((sum, row) => sum + money(row[column]), 0n);
    const employeeTotal = totalOf("pri_sso_employee");
    const employerTotal = totalOf("pri_sso_employer");
    return {
        period,
        company: await companyInfo(conn),
        run,
        notice,
        due_date: nextMonthDay(period, 15),
        rows: rows.map((row) => ({
            emp_code: row.pri_emp_code,
            full_name: row.pri_full_name,
            sso_number: row.emp_sso_number || row.pri_national_id,
            wage: row.pri_sso_wage,
            employee_contribution: row.pri_sso_employee,
        })),
        total_wage: toDecimalText(totalOf("pri_sso_wage")),
        total_employee: toDecimalText(employeeTotal),
        total_employer: toDecimalText(employerTotal),
        total_remit: toDecimalText(employeeTotal + employerTotal),
        missing_sso_number: rows
            .filter((row) => !row.emp_sso_number && !row.pri_national_id)
            .map((row) => row.pri_emp_code),
    };
}

/**
 * ยอดทั้งปีรายคน (ใช้ทั้ง ภ.ง.ด.1ก และ 50 ทวิ) — รอบที่จ่ายแล้วของปี + ยอดยกมาที่เป็นของบริษัทนี้
 * @param {number} year
 * @param {string | null} employeeId null = ทุกคน
 */
async function annualTotals(conn, year, employeeId = null) {
    const [rows] = await conn.query(
        `SELECT e.emp_id, e.emp_code, e.emp_title, e.emp_first_name_th, e.emp_last_name_th, e.emp_national_id, e.emp_address,
                COALESCE(paid.income, 0) + IF(COALESCE(p.etp_prior_from_other_employer, 0) = 1, 0, COALESCE(p.etp_prior_income, 0)) AS income,
                COALESCE(paid.tax, 0) + IF(COALESCE(p.etp_prior_from_other_employer, 0) = 1, 0, COALESCE(p.etp_prior_tax, 0)) AS tax,
                COALESCE(paid.sso, 0) + IF(COALESCE(p.etp_prior_from_other_employer, 0) = 1, 0, COALESCE(p.etp_prior_sso, 0)) AS sso,
                paid.last_paid_date
         FROM tb_employees e
         LEFT JOIN (
             SELECT i.pri_employee_id, SUM(i.pri_taxable_income) AS income, SUM(i.pri_tax) AS tax,
                    SUM(i.pri_sso_employee) AS sso, DATE_FORMAT(MAX(r.pr_paid_date), '%Y-%m-%d') AS last_paid_date
             FROM tb_payroll_items i JOIN tb_payroll_runs r ON r.pr_id = i.pri_run_id
             WHERE r.pr_status = 'paid' AND r.pr_period BETWEEN ? AND ?
             GROUP BY i.pri_employee_id
         ) paid ON paid.pri_employee_id = e.emp_id
         LEFT JOIN tb_employee_tax_profiles p ON p.etp_employee_id = e.emp_id AND p.etp_tax_year = ?
         WHERE (? IS NULL OR e.emp_id = ?)
         ORDER BY e.emp_code`,
        [`${year}-01`, `${year}-12`, year, employeeId, employeeId],
    );
    return rows
        .filter((row) => money(row.income) > 0n || money(row.tax) > 0n)
        .map((row) => ({
            emp_id: row.emp_id,
            emp_code: row.emp_code,
            full_name: [row.emp_title, `${row.emp_first_name_th} ${row.emp_last_name_th}`].filter(Boolean).join(""),
            national_id: row.emp_national_id,
            address: row.emp_address,
            income: toDecimalText(money(row.income)),
            tax: toDecimalText(money(row.tax)),
            sso: toDecimalText(money(row.sso)),
            last_paid_date: row.last_paid_date,
        }));
}

async function unpaidRunsOfYear(conn, year) {
    const [rows] = await conn.query(
        `SELECT pr_number FROM tb_payroll_runs
         WHERE pr_period BETWEEN ? AND ? AND pr_status IN ('draft', 'pending_approval', 'approved') ORDER BY pr_period`,
        [`${year}-01`, `${year}-12`],
    );
    return rows.map((row) => row.pr_number);
}

/**
 * ใบแนบ ภ.ง.ด.1ก ของปี — ยื่นภายนอกสิ้นเดือน ก.พ. ปีถัดไป
 */
async function annualPnd1a(conn, year) {
    const rows = await annualTotals(conn, year);
    return {
        year,
        company: await companyInfo(conn),
        due_date: addDays(`${year + 1}-03-01`, -1), // วันสุดท้ายของ ก.พ. (ปีอธิกสุรทิน = 29)
        unpaid_runs: await unpaidRunsOfYear(conn, year),
        rows,
        total_income: toDecimalText(rows.reduce((sum, row) => sum + money(row.income), 0n)),
        total_tax: toDecimalText(rows.reduce((sum, row) => sum + money(row.tax), 0n)),
        missing_national_id: rows.filter((row) => !row.national_id).map((row) => row.emp_code),
    };
}

/**
 * 50 ทวิ ประจำปีของพนักงาน (แบบ ภ.ง.ด.1ก) — เลขอ้างอิง = ปี/รหัสพนักงาน (ไม่ออกเลขรัน)
 * @param {string | null} employeeId null = ทุกคนที่มีเงินได้ในปี
 */
async function annualCertificates(conn, year, employeeId = null) {
    const rows = await annualTotals(conn, year, employeeId);
    if (employeeId && rows.length === 0) {
        throw new AppError(404, "CERTIFICATE_NOT_FOUND", "ไม่มีเงินได้ที่จ่ายแล้วในปีนี้ — ยังออก 50 ทวิ ไม่ได้");
    }
    return {
        year,
        company: await companyInfo(conn),
        unpaid_runs: await unpaidRunsOfYear(conn, year),
        certificates: rows.map((row) => ({ ...row, reference: `${year}/${row.emp_code}` })),
    };
}

/** 50 ทวิ ประจำปีของตัวเอง (ทุกช่วงการเป็นพนักงานของบัญชีนี้) */
async function myCertificates(conn, userId, year) {
    const [employees] = await conn.query("SELECT emp_id FROM tb_employees WHERE emp_user_id = ?", [userId]);
    const certificates = [];
    for (const employee of employees) {
        certificates.push(...(await annualTotals(conn, year, employee.emp_id)));
    }
    return {
        year,
        company: await companyInfo(conn),
        unpaid_runs: [],
        certificates: certificates.map((row) => ({ ...row, reference: `${year}/${row.emp_code}` })),
    };
}

/**
 * ยอดรวมรอบเงินเดือนของเดือน สำหรับไฟล์ส่งนักบัญชี (ยอดรวมเท่านั้น — ไม่มีรายคน R-H1)
 */
async function payrollJournalOfMonth(conn, period) {
    const [[run]] = await conn.query(
        `SELECT pr_number, pr_status, pr_employee_count, pr_total_gross, pr_total_deductions, pr_total_sso_employee,
                pr_total_sso_employer, pr_total_tax, pr_total_net
         FROM tb_payroll_runs WHERE pr_period = ? AND pr_status IN ('approved', 'paid')`,
        [period],
    );
    return run ?? null;
}

module.exports = {
    monthlyPnd1,
    monthlySso,
    annualPnd1a,
    annualCertificates,
    myCertificates,
    payrollJournalOfMonth,
};
