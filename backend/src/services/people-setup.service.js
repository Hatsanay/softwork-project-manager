// ตั้งค่าบุคคล (2026-10-17 เฟส 4 ขั้น 4-1 — docs/plans/2026-10-17-people-payroll-4.md หัวข้อ 3.3 และ 3.6)
//
// - อัตราประกันสังคม: ตามวันที่มีผล · อัตรา ณ วันใด = แถวล่าสุดที่วันที่มีผล <= วันนั้น (ssoRateOn)
// - ปีภาษี + ขั้นภาษี: ทั้งชุดต่อปี · ปีที่ไม่มีแถว = ใช้ปีล่าสุดก่อนหน้า (taxYearFor)
// - ต่างจากอัตรา VAT/หัก ณ ที่จ่าย: แก้/ลบได้แม้มีผลแล้ว เพราะค่าเริ่มต้นต้องรอนักบัญชียืนยันก่อนจ่ายเงินเดือนจริง (Y1/Y2)
//   ขั้น 4-4 จะล็อกอัตรา/ปีภาษี/วันหยุดที่อยู่ในรอบเงินเดือนที่อนุมัติแล้ว
// - วันหยุดบริษัท · ประเภทลา (ปิดใช้งานแทนการลบ) · ตั้งค่าเวลาทำงาน (แถวเดียว ps_id = 1)
const { AppError } = require("../utils/app-error");
const { todayBangkok } = require("../utils/bangkok-time");

const PAYROLL_SETTINGS_ID = 1;

function validationError(fields, message = "ข้อมูลบางอย่างใช้ไม่ได้ กรุณาแก้ตามข้อความใต้ช่อง") {
    return new AppError(400, "VALIDATION", message, fields);
}

// ─── อ่าน ────────────────────────────────────────────────────────────────────────────────────

/**
 * ทุกอย่างที่หน้าตั้งค่าบุคคลและฟอร์มอื่นๆ ใช้ — ไม่มีข้อมูลรายคน (อ่านได้ทุกคนที่ login)
 * @param {import("mysql2/promise").Pool} conn
 */
async function getPeopleSetup(conn) {
    const today = todayBangkok();
    const [[settings]] = await conn.query(
        `SELECT ps_working_weekdays, ps_hours_per_day, ps_pay_day, ps_unpaid_leave_divisor, ps_timesheet_backdate_days,
                ps_card_valid_years
         FROM tb_payroll_settings WHERE ps_id = ?`,
        [PAYROLL_SETTINGS_ID],
    );
    const [ssoRates] = await conn.query(
        `SELECT DATE_FORMAT(sr_effective_from, '%Y-%m-%d') AS sr_effective_from, sr_employee_rate, sr_employer_rate,
                sr_wage_floor, sr_wage_ceiling, sr_note
         FROM tb_sso_rates ORDER BY sr_effective_from DESC`,
    );
    const currentSso = ssoRates.find((rate) => rate.sr_effective_from <= today) ?? null;
    const [leaveTypes] = await conn.query("SELECT * FROM tb_leave_types ORDER BY lt_sort_order, lt_id");
    return {
        settings: settings ?? null,
        sso_rates: ssoRates.map((rate) => ({ ...rate, is_current: rate === currentSso })),
        tax_years: await findTaxYears(conn),
        current_tax_year: Number(today.slice(0, 4)),
        leave_types: leaveTypes.map((type) => ({ ...type, lt_is_paid: type.lt_is_paid === 1 })),
        today,
    };
}

async function findTaxYears(conn) {
    const [years] = await conn.query(
        `SELECT ity_tax_year, ity_expense_rate, ity_expense_cap, ity_personal_allowance, ity_note
         FROM tb_income_tax_years ORDER BY ity_tax_year DESC`,
    );
    const [brackets] = await conn.query(
        "SELECT itb_tax_year, itb_from_amount, itb_rate FROM tb_income_tax_brackets ORDER BY itb_tax_year, itb_from_amount",
    );
    return years.map((year) => ({
        ...year,
        brackets: brackets
            .filter((bracket) => bracket.itb_tax_year === year.ity_tax_year)
            .map(({ itb_from_amount, itb_rate }) => ({ itb_from_amount, itb_rate })),
    }));
}

/**
 * วันหยุดบริษัทของปี (ค.ศ.)
 * @param {import("mysql2/promise").Pool} conn
 * @param {number} year
 */
async function listHolidays(conn, year) {
    const [rows] = await conn.query(
        `SELECT DATE_FORMAT(hd_date, '%Y-%m-%d') AS hd_date, hd_name FROM tb_company_holidays
         WHERE hd_date BETWEEN ? AND ? ORDER BY hd_date`,
        [`${year}-01-01`, `${year}-12-31`],
    );
    return { year, holidays: rows };
}

/**
 * อัตราประกันสังคม ณ วันที่ระบุ (ใช้ขั้น 4-2/4-4)
 * @param {import("mysql2/promise").Pool | import("mysql2/promise").PoolConnection} conn
 * @param {string} dateText "YYYY-MM-DD"
 * @returns {Promise<object | null>} null = ยังไม่มีอัตราที่มีผลก่อนวันนั้น
 */
async function ssoRateOn(conn, dateText) {
    const [[rate]] = await conn.query(
        `SELECT sr_employee_rate, sr_employer_rate, sr_wage_floor, sr_wage_ceiling FROM tb_sso_rates
         WHERE sr_effective_from <= ? ORDER BY sr_effective_from DESC LIMIT 1`,
        [dateText],
    );
    return rate ?? null;
}

// ─── ตั้งค่าเวลาทำงาน ───────────────────────────────────────────────────────────────────────────

/**
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {object} settings ผ่าน payrollSettingsSchema แล้ว
 * @param {{ user_id: string }} actor
 */
async function updateSettings(conn, settings, actor) {
    await conn.query(
        `UPDATE tb_payroll_settings
         SET ps_working_weekdays = ?, ps_hours_per_day = ?, ps_pay_day = ?, ps_unpaid_leave_divisor = ?,
             ps_timesheet_backdate_days = ?, ps_card_valid_years = ?, ps_updated_by = ?
         WHERE ps_id = ?`,
        [
            settings.ps_working_weekdays,
            settings.ps_hours_per_day,
            settings.ps_pay_day,
            settings.ps_unpaid_leave_divisor,
            settings.ps_timesheet_backdate_days,
            settings.ps_card_valid_years,
            actor.user_id,
            PAYROLL_SETTINGS_ID,
        ],
    );
    return { ps_id: PAYROLL_SETTINGS_ID };
}

// ─── อัตราประกันสังคม ──────────────────────────────────────────────────────────────────────────

/**
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {object} rate ผ่าน ssoRateSchema แล้ว
 * @param {{ user_id: string }} actor
 */
async function addSsoRate(conn, rate, actor) {
    const [[existing]] = await conn.query("SELECT sr_effective_from FROM tb_sso_rates WHERE sr_effective_from = ?", [
        rate.sr_effective_from,
    ]);
    if (existing) {
        throw new AppError(409, "SSO_RATE_EXISTS", "มีอัตราที่มีผลวันนี้อยู่แล้ว ถ้าจะเปลี่ยนให้ลบอันเดิมก่อน", {
            sr_effective_from: "มีอัตราของวันนี้แล้ว",
        });
    }
    await conn.query(
        `INSERT INTO tb_sso_rates
            (sr_effective_from, sr_employee_rate, sr_employer_rate, sr_wage_floor, sr_wage_ceiling, sr_note, sr_created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
            rate.sr_effective_from,
            rate.sr_employee_rate,
            rate.sr_employer_rate,
            rate.sr_wage_floor,
            rate.sr_wage_ceiling,
            rate.sr_note,
            actor.user_id,
        ],
    );
    return { sr_effective_from: rate.sr_effective_from };
}

/**
 * ลบได้ถ้ายังเหลืออัตราอื่น — ระบบต้องมีอัตราประกันสังคมอย่างน้อย 1 แถวเสมอ
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {string} effectiveFrom
 */
async function deleteSsoRate(conn, effectiveFrom) {
    const [rates] = await conn.query(
        "SELECT DATE_FORMAT(sr_effective_from, '%Y-%m-%d') AS sr_effective_from FROM tb_sso_rates FOR UPDATE",
    );
    if (!rates.some((rate) => rate.sr_effective_from === effectiveFrom)) {
        throw new AppError(404, "SSO_RATE_NOT_FOUND", "ไม่พบอัตรานี้ อาจถูกลบไปแล้ว กรุณาโหลดหน้าใหม่");
    }
    if (rates.length === 1) {
        throw new AppError(409, "LAST_SSO_RATE", "ลบอัตราสุดท้ายไม่ได้ — เพิ่มอัตราที่ถูกต้องก่อน แล้วค่อยลบอันนี้");
    }
    await conn.query("DELETE FROM tb_sso_rates WHERE sr_effective_from = ?", [effectiveFrom]);
}

// ─── ปีภาษี + ขั้นภาษี ───────────────────────────────────────────────────────────────────────────

/**
 * บันทึกทั้งปี (เพิ่มปีใหม่หรือแก้ปีเดิม) — ขั้นภาษีแทนที่ทั้งชุด
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {object} taxYear ผ่าน taxYearSchema แล้ว
 * @param {{ user_id: string }} actor
 */
async function saveTaxYear(conn, taxYear, actor) {
    const year = taxYear.ity_tax_year;
    await conn.query(
        `INSERT INTO tb_income_tax_years
            (ity_tax_year, ity_expense_rate, ity_expense_cap, ity_personal_allowance, ity_note, ity_created_by)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE ity_expense_rate = VALUES(ity_expense_rate), ity_expense_cap = VALUES(ity_expense_cap),
             ity_personal_allowance = VALUES(ity_personal_allowance), ity_note = VALUES(ity_note)`,
        [
            year,
            taxYear.ity_expense_rate,
            taxYear.ity_expense_cap,
            taxYear.ity_personal_allowance,
            taxYear.ity_note,
            actor.user_id,
        ],
    );
    await conn.query("DELETE FROM tb_income_tax_brackets WHERE itb_tax_year = ?", [year]);
    for (const bracket of taxYear.brackets) {
        await conn.query(
            "INSERT INTO tb_income_tax_brackets (itb_tax_year, itb_from_amount, itb_rate) VALUES (?, ?, ?)",
            [year, bracket.itb_from_amount, bracket.itb_rate],
        );
    }
    return { ity_tax_year: year };
}

/**
 * ลบปีภาษี (ปีที่เพิ่มผิด) — ต้องเหลืออย่างน้อย 1 ปีเสมอ
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {number} year
 */
async function deleteTaxYear(conn, year) {
    const [years] = await conn.query("SELECT ity_tax_year FROM tb_income_tax_years FOR UPDATE");
    if (!years.some((row) => row.ity_tax_year === year)) {
        throw new AppError(404, "TAX_YEAR_NOT_FOUND", "ไม่พบปีภาษีนี้ อาจถูกลบไปแล้ว กรุณาโหลดหน้าใหม่");
    }
    if (years.length === 1) {
        throw new AppError(
            409,
            "LAST_TAX_YEAR",
            "ลบปีภาษีสุดท้ายไม่ได้ — ระบบต้องมีขั้นภาษีอย่างน้อย 1 ปีไว้คิดภาษีเงินเดือน",
        );
    }
    await conn.query("DELETE FROM tb_income_tax_years WHERE ity_tax_year = ?", [year]);
}

// ─── วันหยุดบริษัท ──────────────────────────────────────────────────────────────────────────────

/**
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {{ hd_date: string, hd_name: string }} holiday
 * @param {{ user_id: string }} actor
 */
async function addHoliday(conn, holiday, actor) {
    const [[existing]] = await conn.query("SELECT hd_name FROM tb_company_holidays WHERE hd_date = ?", [
        holiday.hd_date,
    ]);
    if (existing) {
        throw new AppError(409, "HOLIDAY_EXISTS", `วันนี้เป็นวันหยุด "${existing.hd_name}" อยู่แล้ว`, {
            hd_date: "มีวันหยุดในวันนี้แล้ว",
        });
    }
    await conn.query("INSERT INTO tb_company_holidays (hd_date, hd_name, hd_created_by) VALUES (?, ?, ?)", [
        holiday.hd_date,
        holiday.hd_name,
        actor.user_id,
    ]);
    return { hd_date: holiday.hd_date };
}

/**
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {string} dateText
 */
async function deleteHoliday(conn, dateText) {
    const [result] = await conn.query("DELETE FROM tb_company_holidays WHERE hd_date = ?", [dateText]);
    if (result.affectedRows === 0) {
        throw new AppError(404, "HOLIDAY_NOT_FOUND", "ไม่พบวันหยุดนี้ อาจถูกลบไปแล้ว กรุณาโหลดหน้าใหม่");
    }
}

// ─── ประเภทลา ─────────────────────────────────────────────────────────────────────────────────

const LEAVE_TYPE_COLUMNS = [
    "lt_name_th",
    "lt_name_en",
    "lt_days_per_year",
    "lt_is_paid",
    "lt_attachment_from_days",
    "lt_min_service_days",
    "lt_carry_over_days",
    "lt_status",
    "lt_sort_order",
];

function leaveTypeValues(leaveType) {
    return LEAVE_TYPE_COLUMNS.map((column) =>
        column === "lt_is_paid" ? (leaveType.lt_is_paid ? 1 : 0) : leaveType[column],
    );
}

async function assertLeaveTypeNameFree(conn, name, leaveTypeId = null) {
    const [[duplicate]] = await conn.query("SELECT lt_id FROM tb_leave_types WHERE lt_name_th = ? AND lt_id <> ?", [
        name,
        leaveTypeId ?? 0,
    ]);
    if (duplicate) throw validationError({ lt_name_th: "มีประเภทลาชื่อนี้แล้ว" });
}

/**
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {object} leaveType ผ่าน leaveTypeSchema แล้ว
 */
async function createLeaveType(conn, leaveType) {
    await assertLeaveTypeNameFree(conn, leaveType.lt_name_th);
    const [result] = await conn.query(
        `INSERT INTO tb_leave_types (${LEAVE_TYPE_COLUMNS.join(", ")}) VALUES (${LEAVE_TYPE_COLUMNS.map(() => "?").join(", ")})`,
        leaveTypeValues(leaveType),
    );
    return { lt_id: result.insertId };
}

/**
 * แก้แล้วมีผลกับใบลาที่ยื่นหลังจากนี้ (ขั้น 4-3 เก็บจำนวนวัน/การหักเงินของแต่ละใบไว้ตอนยื่น)
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {number} leaveTypeId
 * @param {object} leaveType ผ่าน leaveTypeSchema แล้ว
 */
async function updateLeaveType(conn, leaveTypeId, leaveType) {
    const [[existing]] = await conn.query("SELECT lt_id FROM tb_leave_types WHERE lt_id = ? FOR UPDATE", [leaveTypeId]);
    if (!existing) throw new AppError(404, "LEAVE_TYPE_NOT_FOUND", "ไม่พบประเภทลานี้ กรุณาโหลดหน้าใหม่");
    await assertLeaveTypeNameFree(conn, leaveType.lt_name_th, leaveTypeId);
    await conn.query(
        `UPDATE tb_leave_types SET ${LEAVE_TYPE_COLUMNS.map((column) => `${column} = ?`).join(", ")} WHERE lt_id = ?`,
        [...leaveTypeValues(leaveType), leaveTypeId],
    );
    return { lt_id: leaveTypeId };
}

module.exports = {
    getPeopleSetup,
    listHolidays,
    ssoRateOn,
    updateSettings,
    addSsoRate,
    deleteSsoRate,
    saveTaxYear,
    deleteTaxYear,
    addHoliday,
    deleteHoliday,
    createLeaveType,
    updateLeaveType,
};
