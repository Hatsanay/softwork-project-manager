// ค่าลดหย่อนรายปีของพนักงาน (ล.ย.01) + ยอดยกมาของปี (2026-10-17 เฟส 4 ขั้น 4-4) — แบบระบบหัวข้อ 3.4
// ฝ่ายบุคคลกรอก (manageEmployees) · แก้กลางปีได้ — รอบเงินเดือนถัดไปคิดภาษีทั้งปีใหม่จากค่าล่าสุด
const { AppError } = require("../utils/app-error");

const PROFILE_COLUMNS = [
    "etp_spouse_allowance",
    "etp_child_allowance",
    "etp_parent_allowance",
    "etp_insurance_allowance",
    "etp_fund_allowance",
    "etp_home_loan_interest",
    "etp_other_allowance",
    "etp_prior_income",
    "etp_prior_tax",
    "etp_prior_sso",
    "etp_prior_from_other_employer",
    "etp_note",
];

async function assertEmployee(conn, employeeId) {
    const [[employee]] = await conn.query("SELECT emp_id FROM tb_employees WHERE emp_id = ?", [employeeId]);
    if (!employee) throw new AppError(404, "EMPLOYEE_NOT_FOUND", "ไม่พบพนักงานนี้");
}

/**
 * ค่าลดหย่อนของปี — ยังไม่เคยกรอก = ค่าเริ่มต้น 0 ทั้งหมด (is_saved = false)
 */
async function getTaxProfile(conn, employeeId, taxYear) {
    await assertEmployee(conn, employeeId);
    const [[profile]] = await conn.query(
        `SELECT ${PROFILE_COLUMNS.join(", ")} FROM tb_employee_tax_profiles WHERE etp_employee_id = ? AND etp_tax_year = ?`,
        [employeeId, taxYear],
    );
    const empty = Object.fromEntries(PROFILE_COLUMNS.map((column) => [column, column === "etp_note" ? null : "0.00"]));
    const current = profile ?? empty;
    return {
        tax_year: taxYear,
        is_saved: Boolean(profile),
        profile: { ...current, etp_prior_from_other_employer: current.etp_prior_from_other_employer === 1 },
    };
}

/**
 * บันทึกค่าลดหย่อนของปี (เพิ่มหรือแทนที่)
 * @param {object} profile ผ่าน taxProfileSchema แล้ว
 */
async function saveTaxProfile(conn, user, employeeId, taxYear, profile) {
    await assertEmployee(conn, employeeId);
    const values = PROFILE_COLUMNS.map((column) =>
        column === "etp_prior_from_other_employer" ? (profile[column] ? 1 : 0) : profile[column],
    );
    await conn.query(
        `INSERT INTO tb_employee_tax_profiles (etp_employee_id, etp_tax_year, ${PROFILE_COLUMNS.join(", ")}, etp_updated_by)
         VALUES (?, ?, ${PROFILE_COLUMNS.map(() => "?").join(", ")}, ?)
         ON DUPLICATE KEY UPDATE ${PROFILE_COLUMNS.map((column) => `${column} = VALUES(${column})`).join(", ")},
             etp_updated_by = VALUES(etp_updated_by)`,
        [employeeId, taxYear, ...values, user.user_id],
    );
    return { tax_year: taxYear };
}

module.exports = { getTaxProfile, saveTaxProfile };
