// ผู้ขาย / ผู้รับเงิน (2026-10-16 เฟส 2 ขั้น 2-1 — docs/plans/2026-10-16-purchasing-2.md หัวข้อ 3.1)
//
// ข้อมูลผ่าน vendorSchema (shared/schemas/purchasing.mjs) แล้ว · ตรวจที่นี่: รหัสซ้ำ · สกุลเงิน/ประเภทเงินได้/หมวด มีอยู่จริงและเปิดใช้งาน
// เลขบัญชีธนาคารของผู้ขาย: audit log เก็บค่าก่อน/หลังให้อัตโนมัติ (auditLog.middleware) — กันโกงเปลี่ยนบัญชีรับเงิน (R-P6)
// ภ.ง.ด. ที่ใช้: บุคคลธรรมดาในไทย = 3 · นิติบุคคลในไทย = 53 · ต่างประเทศ = ไม่ออก 50 ทวิ (คำถามนักบัญชี X2)
const { AppError } = require("../utils/app-error");
const { generateDailyId } = require("../utils/generateDailyId");

const MAX_LIST_LIMIT = 1000;

const VENDOR_COLUMNS = `
    v.vd_id, v.vd_code, v.vd_type, v.vd_country, v.vd_name, v.vd_tax_id, v.vd_branch_code, v.vd_address,
    v.vd_contact_name, v.vd_email, v.vd_phone, v.vd_bank_name, v.vd_bank_account_no, v.vd_bank_account_name,
    v.vd_promptpay_id, v.vd_credit_days, v.vd_currency, v.vd_default_income_type, v.vd_default_category_id,
    v.vd_notes, v.vd_status, v.vd_created_at, v.vd_updated_at`;

// คอลัมน์ที่บันทึกจากฟอร์ม (ลำดับเดียวกับ toColumnValues)
const EDITABLE_COLUMNS = [
    "vd_code",
    "vd_type",
    "vd_country",
    "vd_name",
    "vd_tax_id",
    "vd_branch_code",
    "vd_address",
    "vd_contact_name",
    "vd_email",
    "vd_phone",
    "vd_bank_name",
    "vd_bank_account_no",
    "vd_bank_account_name",
    "vd_promptpay_id",
    "vd_credit_days",
    "vd_currency",
    "vd_default_income_type",
    "vd_default_category_id",
    "vd_notes",
    "vd_status",
];

function notFound() {
    return new AppError(404, "VENDOR_NOT_FOUND", "ไม่พบผู้ขายนี้ อาจถูกลบไปแล้ว กรุณาโหลดหน้าใหม่");
}

/**
 * แบบยื่นภาษีหัก ณ ที่จ่ายของผู้ขายรายนี้ — null = ไม่ออก 50 ทวิ (ต่างประเทศ)
 * @param {{ vd_country: string, vd_type: string }} vendor
 * @returns {"PND3" | "PND53" | null}
 */
function whtFormOf(vendor) {
    if (vendor.vd_country !== "TH") return null;
    return vendor.vd_type === "individual" ? "PND3" : "PND53";
}

/**
 * @param {import("mysql2/promise").Pool} conn
 * @param {{ limit?: number, offset?: number, search?: string, status?: string }} options status = "active" ใช้กับช่องเลือกในเอกสารใหม่
 */
async function listVendors(conn, { limit = 25, offset = 0, search = "", status }) {
    const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), MAX_LIST_LIMIT);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const like = `%${search}%`;
    const conditions = ["(v.vd_name LIKE ? OR v.vd_code LIKE ? OR v.vd_tax_id LIKE ? OR v.vd_contact_name LIKE ?)"];
    const params = [like, like, like, like];
    if (status === "active" || status === "inactive") {
        conditions.push("v.vd_status = ?");
        params.push(status);
    }
    const where = conditions.join(" AND ");
    const [rows] = await conn.query(
        `SELECT ${VENDOR_COLUMNS}, t.wit_name_th AS income_type_name, c.ec_name_th AS category_name
         FROM tb_vendors v
         LEFT JOIN tb_wht_income_types t ON t.wit_code = v.vd_default_income_type
         LEFT JOIN tb_expense_categories c ON c.ec_id = v.vd_default_category_id
         WHERE ${where}
         ORDER BY v.vd_name, v.vd_id
         LIMIT ? OFFSET ?`,
        [...params, safeLimit, safeOffset],
    );
    const [[{ total }]] = await conn.query(`SELECT COUNT(*) AS total FROM tb_vendors v WHERE ${where}`, params);
    return { data: rows.map((row) => ({ ...row, wht_form: whtFormOf(row) })), total: Number(total) };
}

/**
 * @param {import("mysql2/promise").Pool | import("mysql2/promise").PoolConnection} conn
 * @param {string} vendorId
 */
async function findVendor(conn, vendorId) {
    const [[vendor]] = await conn.query(`SELECT ${VENDOR_COLUMNS} FROM tb_vendors v WHERE v.vd_id = ?`, [vendorId]);
    if (!vendor) throw notFound();
    return { ...vendor, wht_form: whtFormOf(vendor) };
}

/**
 * อ้างอิงต้องมีอยู่จริง · ที่เลือกใหม่ต้องเปิดใช้งาน (ค่าเดิมที่ถูกปิดไปแล้วคงไว้ได้) · รหัสห้ามซ้ำ
 * @returns {Promise<void>} ผิดโยน 400 พร้อมช่อง
 */
async function assertReferences(conn, vendor, existing, vendorId = null) {
    const fields = {};
    const isChanged = (column) => !existing || String(existing[column] ?? "") !== String(vendor[column] ?? "");

    const [[currency]] = await conn.query("SELECT cur_status FROM tb_currencies WHERE cur_code = ?", [
        vendor.vd_currency,
    ]);
    if (!currency) fields.vd_currency = "ไม่พบสกุลเงินนี้";
    else if (currency.cur_status !== "active" && isChanged("vd_currency"))
        fields.vd_currency = "สกุลเงินนี้ถูกปิดใช้งาน";

    if (vendor.vd_default_income_type) {
        const [[incomeType]] = await conn.query("SELECT wit_status FROM tb_wht_income_types WHERE wit_code = ?", [
            vendor.vd_default_income_type,
        ]);
        if (!incomeType) fields.vd_default_income_type = "ไม่พบประเภทเงินได้นี้";
        else if (incomeType.wit_status !== "active" && isChanged("vd_default_income_type"))
            fields.vd_default_income_type = "ประเภทเงินได้นี้ถูกปิดใช้งาน";
    }
    if (vendor.vd_default_category_id) {
        const [[category]] = await conn.query("SELECT ec_status FROM tb_expense_categories WHERE ec_id = ?", [
            vendor.vd_default_category_id,
        ]);
        if (!category) fields.vd_default_category_id = "ไม่พบหมวดนี้";
        else if (category.ec_status !== "active" && isChanged("vd_default_category_id"))
            fields.vd_default_category_id = "หมวดนี้ถูกปิดใช้งาน";
    }
    if (vendor.vd_code) {
        const [[duplicate]] = await conn.query("SELECT vd_name FROM tb_vendors WHERE vd_code = ? AND vd_id <> ?", [
            vendor.vd_code,
            vendorId ?? "",
        ]);
        if (duplicate) fields.vd_code = `รหัสนี้ใช้กับ "${duplicate.vd_name}" แล้ว`;
    }
    if (Object.keys(fields).length > 0) {
        throw new AppError(400, "VALIDATION", "ข้อมูลบางอย่างใช้ไม่ได้ กรุณาแก้ตามข้อความใต้ช่อง", fields);
    }
}

function toColumnValues(vendor) {
    return EDITABLE_COLUMNS.map((column) => vendor[column] ?? null);
}

/**
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {object} vendor ผ่าน vendorSchema แล้ว
 * @param {{ user_id: string }} actor
 */
async function createVendor(conn, vendor, actor) {
    await assertReferences(conn, vendor, null);
    const vendorId = await generateDailyId("tb_vendors", "vd_id", "VND");
    await conn.query(
        `INSERT INTO tb_vendors (vd_id, ${EDITABLE_COLUMNS.join(", ")}, vd_created_by)
         VALUES (?, ${EDITABLE_COLUMNS.map(() => "?").join(", ")}, ?)`,
        [vendorId, ...toColumnValues(vendor), actor.user_id],
    );
    return { vd_id: vendorId, vd_name: vendor.vd_name };
}

/**
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {string} vendorId
 * @param {object} vendor ผ่าน vendorSchema แล้ว
 */
async function updateVendor(conn, vendorId, vendor) {
    const [[existing]] = await conn.query("SELECT * FROM tb_vendors WHERE vd_id = ? FOR UPDATE", [vendorId]);
    if (!existing) throw notFound();
    await assertReferences(conn, vendor, existing, vendorId);
    await conn.query(
        `UPDATE tb_vendors SET ${EDITABLE_COLUMNS.map((column) => `${column} = ?`).join(", ")} WHERE vd_id = ?`,
        [...toColumnValues(vendor), vendorId],
    );
    return { vd_id: vendorId };
}

/**
 * ลบได้เฉพาะผู้ขายที่ยังไม่มีเอกสาร — ที่ใช้แล้วให้ปิดใช้งาน (ประวัติต้องอยู่ครบ)
 * ตรวจค่าใช้จ่าย (ขั้น 2-2) · ใบสำคัญจ่ายเพิ่มตอนขั้น 2-4 — FK ไม่ cascade กันไว้อีกชั้น
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {string} vendorId
 */
async function deleteVendor(conn, vendorId) {
    const [[existing]] = await conn.query("SELECT vd_id FROM tb_vendors WHERE vd_id = ? FOR UPDATE", [vendorId]);
    if (!existing) throw notFound();
    const [[{ expenseCount }]] = await conn.query(
        "SELECT COUNT(*) AS expenseCount FROM tb_expenses WHERE ex_vendor_id = ?",
        [vendorId],
    );
    if (Number(expenseCount) > 0) {
        throw new AppError(
            409,
            "VENDOR_IN_USE",
            `ลบผู้ขายนี้ไม่ได้ เพราะมีค่าใช้จ่าย ${expenseCount} รายการ (รวมร่าง) — ถ้าไม่ใช้แล้วให้เปลี่ยนสถานะเป็น "ปิดใช้งาน" แทน`,
        );
    }
    await conn.query("DELETE FROM tb_vendors WHERE vd_id = ?", [vendorId]);
}

module.exports = { listVendors, findVendor, createVendor, updateVendor, deleteVendor, whtFormOf };
