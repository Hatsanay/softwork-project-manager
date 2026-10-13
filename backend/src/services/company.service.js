// ข้อมูลบริษัท + โลโก้ + อัตรา VAT ตามวันที่มีผล (2026-10-13, docs/plans/2026-10-08-sales-cycle.md หัวข้อ 1)
//
// ทุกฟังก์ชันรับ conn — เรียกจาก withTransaction (เขียน) หรือส่ง pool มา (อ่านอย่างเดียว)
// วันที่ (DATE) ส่งออกเป็นข้อความ "YYYY-MM-DD" เสมอ — ถ้าปล่อยเป็น JS Date จะกลายเป็นเวลา UTC ของวันก่อนหน้าใน JSON
const { AppError } = require("../utils/app-error");
const { todayBangkok } = require("../utils/bangkok-time");
const companyListsService = require("./company-lists.service");
const approvalRulesService = require("./approval-rules.service");

const COMPANY_ROW_ID = 1;

const COMPANY_COLUMNS = `
    cs_name_th, cs_name_en, cs_tax_id, cs_address_th, cs_address_en, cs_phone, cs_email, cs_website, cs_logo_url,
    DATE_FORMAT(cs_vat_registered_from, '%Y-%m-%d') AS cs_vat_registered_from,
    cs_quotation_valid_days, cs_quotation_terms_th, cs_quotation_terms_en, cs_allow_self_approval, cs_updated_at`;

/**
 * ข้อมูลบริษัทแถวเดียว
 * @param {import("mysql2/promise").Pool | import("mysql2/promise").PoolConnection} conn
 */
async function findCompany(conn) {
    const [[company]] = await conn.query(`SELECT ${COMPANY_COLUMNS} FROM tb_company_settings WHERE cs_id = ?`, [
        COMPANY_ROW_ID,
    ]);
    if (!company) {
        throw new AppError(
            503,
            "COMPANY_SETTINGS_MISSING",
            "ยังไม่มีข้อมูลบริษัทในฐานข้อมูล แจ้งผู้ดูแลระบบให้รัน database/query/deploy_schema.sql",
        );
    }
    return { ...company, cs_allow_self_approval: company.cs_allow_self_approval === 1 };
}

/**
 * อัตรา VAT ทั้งหมด ใหม่สุดก่อน — is_locked = มีผลแล้ว (วันนี้หรือก่อนหน้า) แก้/ลบไม่ได้ เพราะเอกสารที่ออกไปแล้วใช้อัตรานั้น
 * @param {import("mysql2/promise").Pool | import("mysql2/promise").PoolConnection} conn
 */
async function findVatRates(conn) {
    const today = todayBangkok();
    const [rows] = await conn.query(
        `SELECT DATE_FORMAT(vr_effective_from, '%Y-%m-%d') AS vr_effective_from, vr_rate, vr_note, vr_created_at
         FROM tb_vat_rates
         ORDER BY vr_effective_from DESC`,
    );
    return rows.map((row) => ({ ...row, is_locked: row.vr_effective_from <= today }));
}

/**
 * อัตรา VAT ที่มีผล ณ วันที่ระบุ — แถวล่าสุดที่ vr_effective_from <= วันนั้น
 * @param {import("mysql2/promise").Pool | import("mysql2/promise").PoolConnection} conn
 * @param {string} dateText "YYYY-MM-DD"
 * @returns {Promise<string | null>} เช่น "7.00" · null ถ้าไม่มีอัตราที่มีผลก่อนวันนั้นเลย
 */
async function findVatRateOn(conn, dateText) {
    const [[row]] = await conn.query(
        "SELECT vr_rate FROM tb_vat_rates WHERE vr_effective_from <= ? ORDER BY vr_effective_from DESC LIMIT 1",
        [dateText],
    );
    return row ? row.vr_rate : null;
}

/**
 * ทุกอย่างของหน้าตั้งค่าบริษัทในคำขอเดียว — ใช้ทั้งหน้าตั้งค่าและฟอร์มเอกสารขาย
 * @param {import("mysql2/promise").Pool} conn
 * @param {{ canEdit: boolean }} options
 */
async function getCompanySettings(conn, { canEdit }) {
    const today = todayBangkok();
    return {
        company: await findCompany(conn),
        vat_rates: await findVatRates(conn),
        vat_rate_today: await findVatRateOn(conn, today),
        today,
        branches: await companyListsService.findBranches(conn),
        bank_accounts: await companyListsService.findBankAccounts(conn),
        currencies: await companyListsService.findCurrencies(conn),
        approval: await approvalRulesService.findApprovalRules(conn, "QT"),
        roles: await approvalRulesService.findRoleChoices(conn),
        can_edit: canEdit,
    };
}

/**
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {object} company ผ่าน companySchema แล้ว
 */
async function updateCompany(conn, company) {
    await conn.query(
        `UPDATE tb_company_settings SET
            cs_name_th = ?, cs_name_en = ?, cs_tax_id = ?, cs_address_th = ?, cs_address_en = ?,
            cs_phone = ?, cs_email = ?, cs_website = ?, cs_vat_registered_from = ?,
            cs_quotation_valid_days = ?, cs_quotation_terms_th = ?, cs_quotation_terms_en = ?, cs_allow_self_approval = ?
         WHERE cs_id = ?`,
        [
            company.cs_name_th,
            company.cs_name_en,
            company.cs_tax_id,
            company.cs_address_th,
            company.cs_address_en,
            company.cs_phone,
            company.cs_email,
            company.cs_website,
            company.cs_vat_registered_from,
            company.cs_quotation_valid_days,
            company.cs_quotation_terms_th,
            company.cs_quotation_terms_en,
            company.cs_allow_self_approval ? 1 : 0,
            COMPANY_ROW_ID,
        ],
    );
    return findCompany(conn);
}

/**
 * ตั้ง/ลบโลโก้ — ไฟล์เก่าไม่ลบ เพราะเอกสารที่อนุมัติแล้วเก็บ path โลโก้ ณ ตอนนั้นไว้ (snapshot)
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {string | null} logoUrl
 */
async function setLogoUrl(conn, logoUrl) {
    await conn.query("UPDATE tb_company_settings SET cs_logo_url = ? WHERE cs_id = ?", [logoUrl, COMPANY_ROW_ID]);
    return findCompany(conn);
}

// ─── อัตรา VAT ───────────────────────────────────────────────────────────────────────────────

/**
 * เพิ่มอัตราใหม่ล่วงหน้า — วันที่มีผลต้องเป็นวันพรุ่งนี้เป็นต้นไป
 * (ถ้าให้เพิ่มอัตราที่มีผลวันนี้ เอกสารที่อนุมัติไปแล้วเมื่อเช้ากับที่อนุมัติตอนบ่ายจะใช้อัตราต่างกันในวันเดียวกัน)
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {{ vr_effective_from: string, vr_rate: string, vr_note: string | null }} vatRate
 * @param {string} userId
 */
async function addVatRate(conn, vatRate, userId) {
    const today = todayBangkok();
    if (vatRate.vr_effective_from <= today) {
        throw new AppError(400, "VALIDATION", "วันที่มีผลต้องเป็นวันพรุ่งนี้เป็นต้นไป", {
            vr_effective_from:
                "อัตราที่มีผลแล้วเพิ่มย้อนหลังไม่ได้ เพราะเอกสารที่ออกไปแล้วใช้อัตราเดิม — เลือกวันพรุ่งนี้เป็นต้นไป",
        });
    }

    const [[existing]] = await conn.query("SELECT 1 FROM tb_vat_rates WHERE vr_effective_from = ?", [
        vatRate.vr_effective_from,
    ]);
    if (existing) {
        throw new AppError(409, "VAT_RATE_EXISTS", "มีอัตราที่มีผลวันนี้อยู่แล้ว ถ้าจะเปลี่ยนให้ลบอันเดิมก่อน", {
            vr_effective_from: "มีอัตราที่มีผลวันนี้อยู่แล้ว",
        });
    }

    await conn.query(
        "INSERT INTO tb_vat_rates (vr_effective_from, vr_rate, vr_note, vr_created_by) VALUES (?, ?, ?, ?)",
        [vatRate.vr_effective_from, vatRate.vr_rate, vatRate.vr_note, userId],
    );
    return { vr_effective_from: vatRate.vr_effective_from, vr_rate: vatRate.vr_rate, vr_note: vatRate.vr_note };
}

/**
 * ลบได้เฉพาะอัตราที่ยังไม่มีผล (วันที่มีผลหลังวันนี้)
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {string} effectiveFrom "YYYY-MM-DD"
 */
async function deleteVatRate(conn, effectiveFrom) {
    const [[vatRate]] = await conn.query(
        "SELECT DATE_FORMAT(vr_effective_from, '%Y-%m-%d') AS vr_effective_from FROM tb_vat_rates WHERE vr_effective_from = ? FOR UPDATE",
        [effectiveFrom],
    );
    if (!vatRate) {
        throw new AppError(404, "VAT_RATE_NOT_FOUND", "ไม่พบอัตรานี้ อาจถูกลบไปแล้ว กรุณาโหลดหน้าใหม่");
    }
    if (vatRate.vr_effective_from <= todayBangkok()) {
        throw new AppError(
            409,
            "VAT_RATE_LOCKED",
            "อัตรานี้มีผลแล้ว ลบไม่ได้ เพราะเอกสารที่ออกไปแล้วใช้อัตรานี้ — ถ้าอัตราเปลี่ยน ให้เพิ่มอัตราใหม่พร้อมวันที่มีผล",
        );
    }

    await conn.query("DELETE FROM tb_vat_rates WHERE vr_effective_from = ?", [effectiveFrom]);
}

module.exports = {
    getCompanySettings,
    findCompany,
    findVatRateOn,
    updateCompany,
    setLogoUrl,
    addVatRate,
    deleteVatRate,
};
