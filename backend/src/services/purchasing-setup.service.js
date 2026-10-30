// ตั้งค่าฝั่งจัดซื้อ (2026-10-16 เฟส 2 ขั้น 2-1 — docs/plans/2026-10-16-purchasing-2.md หัวข้อ 3.2–3.3)
//
// - หมวดค่าใช้จ่าย: เพิ่ม/แก้/ปิดใช้งาน (ลบไม่ได้ — FK จากเอกสาร)
// - ประเภทเงินได้: เพิ่ม/แก้ชื่อ ข้อความบน 50 ทวิ สถานะ · รหัสตั้งครั้งเดียว (โค้ดอ้างด้วยรหัส)
// - อัตราหัก ณ ที่จ่าย: แบบตาราง VAT — เพิ่มได้เฉพาะวันที่มีผลตั้งแต่พรุ่งนี้ · อัตราที่มีผลแล้วแก้/ลบไม่ได้ (R-P4)
//   อัตรา ณ วันที่ใด = แถวล่าสุดที่วันที่มีผล <= วันนั้น (whtRateOn)
const { AppError } = require("../utils/app-error");
const { todayBangkok } = require("../utils/bangkok-time");

function validationError(fields, message = "ข้อมูลบางอย่างใช้ไม่ได้ กรุณาแก้ตามข้อความใต้ช่อง") {
    return new AppError(400, "VALIDATION", message, fields);
}

// ─── อ่าน ────────────────────────────────────────────────────────────────────────────────────

/**
 * ทุกอย่างที่ฟอร์มฝั่งจัดซื้อและหน้าตั้งค่าต้องใช้ — หมวด + ประเภทเงินได้ (พร้อมอัตราวันนี้และประวัติอัตรา)
 * @param {import("mysql2/promise").Pool} conn
 */
async function getPurchasingSetup(conn) {
    const today = todayBangkok();
    const [categories] = await conn.query(
        `SELECT c.*, t.wit_name_th AS income_type_name
         FROM tb_expense_categories c LEFT JOIN tb_wht_income_types t ON t.wit_code = c.ec_default_income_type
         ORDER BY c.ec_sort_order, c.ec_name_th`,
    );
    const [incomeTypes] = await conn.query("SELECT * FROM tb_wht_income_types ORDER BY wit_sort_order, wit_code");
    const [rates] = await conn.query(
        `SELECT wr_income_type, DATE_FORMAT(wr_effective_from, '%Y-%m-%d') AS wr_effective_from, wr_rate, wr_min_payment, wr_note
         FROM tb_wht_rates ORDER BY wr_income_type, wr_effective_from DESC`,
    );
    return {
        categories: categories.map((row) => ({ ...row, ec_is_asset: row.ec_is_asset === 1 })),
        income_types: incomeTypes.map((type) => {
            const history = rates
                .filter((rate) => rate.wr_income_type === type.wit_code)
                .map(({ wr_income_type: _type, ...rate }) => ({ ...rate, is_locked: rate.wr_effective_from <= today }));
            const current = history.find((rate) => rate.wr_effective_from <= today) ?? null;
            return { ...type, current_rate: current, rates: history };
        }),
        today,
    };
}

/**
 * อัตราหัก ณ ที่จ่ายของประเภทเงินได้ ณ วันที่ระบุ
 * @param {import("mysql2/promise").Pool | import("mysql2/promise").PoolConnection} conn
 * @param {string} incomeType
 * @param {string} dateText "YYYY-MM-DD" (เวลาไทย)
 * @returns {Promise<{ rate: string, minPayment: string } | null>} null = ยังไม่มีอัตราที่มีผลก่อนวันนั้น
 */
async function whtRateOn(conn, incomeType, dateText) {
    const [[row]] = await conn.query(
        `SELECT wr_rate, wr_min_payment FROM tb_wht_rates
         WHERE wr_income_type = ? AND wr_effective_from <= ? ORDER BY wr_effective_from DESC LIMIT 1`,
        [incomeType, dateText],
    );
    return row ? { rate: row.wr_rate, minPayment: row.wr_min_payment } : null;
}

// ─── หมวดค่าใช้จ่าย ───────────────────────────────────────────────────────────────────────────

async function assertIncomeTypeUsable(conn, code, currentCode, field) {
    if (!code) return;
    const [[type]] = await conn.query("SELECT wit_status FROM tb_wht_income_types WHERE wit_code = ?", [code]);
    if (!type) throw validationError({ [field]: "ไม่พบประเภทเงินได้นี้" });
    if (type.wit_status !== "active" && code !== currentCode) {
        throw validationError({ [field]: "ประเภทเงินได้นี้ถูกปิดใช้งาน" });
    }
}

async function assertCategoryNameFree(conn, name, categoryId = null) {
    const [[duplicate]] = await conn.query(
        "SELECT ec_id FROM tb_expense_categories WHERE ec_name_th = ? AND ec_id <> ?",
        [name, categoryId ?? 0],
    );
    if (duplicate) throw validationError({ ec_name_th: "มีหมวดชื่อนี้แล้ว" });
}

const CATEGORY_COLUMNS = [
    "ec_name_th",
    "ec_name_en",
    "ec_account_code",
    "ec_default_income_type",
    "ec_is_asset",
    "ec_status",
    "ec_sort_order",
];

function categoryValues(category) {
    return CATEGORY_COLUMNS.map((column) =>
        column === "ec_is_asset" ? (category.ec_is_asset ? 1 : 0) : category[column],
    );
}

/**
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {object} category ผ่าน expenseCategorySchema แล้ว
 */
async function createCategory(conn, category) {
    await assertCategoryNameFree(conn, category.ec_name_th);
    await assertIncomeTypeUsable(conn, category.ec_default_income_type, null, "ec_default_income_type");
    const [result] = await conn.query(
        `INSERT INTO tb_expense_categories (${CATEGORY_COLUMNS.join(", ")}) VALUES (${CATEGORY_COLUMNS.map(() => "?").join(", ")})`,
        categoryValues(category),
    );
    return { ec_id: result.insertId };
}

/**
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {number} categoryId
 * @param {object} category ผ่าน expenseCategorySchema แล้ว
 */
async function updateCategory(conn, categoryId, category) {
    const [[existing]] = await conn.query("SELECT * FROM tb_expense_categories WHERE ec_id = ? FOR UPDATE", [
        categoryId,
    ]);
    if (!existing) throw new AppError(404, "CATEGORY_NOT_FOUND", "ไม่พบหมวดนี้ อาจถูกลบไปแล้ว กรุณาโหลดหน้าใหม่");
    await assertCategoryNameFree(conn, category.ec_name_th, categoryId);
    await assertIncomeTypeUsable(
        conn,
        category.ec_default_income_type,
        existing.ec_default_income_type,
        "ec_default_income_type",
    );
    await conn.query(
        `UPDATE tb_expense_categories SET ${CATEGORY_COLUMNS.map((column) => `${column} = ?`).join(", ")} WHERE ec_id = ?`,
        [...categoryValues(category), categoryId],
    );
    return { ec_id: categoryId };
}

// ─── ประเภทเงินได้ + อัตรา ──────────────────────────────────────────────────────────────────────

/**
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {object} incomeType ผ่าน whtIncomeTypeSchema แล้ว
 */
async function createIncomeType(conn, incomeType) {
    const [[existing]] = await conn.query("SELECT wit_code FROM tb_wht_income_types WHERE wit_code = ?", [
        incomeType.wit_code,
    ]);
    if (existing) throw validationError({ wit_code: "มีรหัสนี้แล้ว" });
    await conn.query(
        `INSERT INTO tb_wht_income_types (wit_code, wit_name_th, wit_name_en, wit_form_row, wit_form_label, wit_status, wit_sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
            incomeType.wit_code,
            incomeType.wit_name_th,
            incomeType.wit_name_en,
            incomeType.wit_form_row,
            incomeType.wit_form_label,
            incomeType.wit_status,
            incomeType.wit_sort_order,
        ],
    );
    return { wit_code: incomeType.wit_code };
}

/**
 * แก้ได้ทุกช่องยกเว้นรหัส (รหัสใน URL)
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {string} code
 * @param {object} incomeType ผ่าน whtIncomeTypeSchema แล้ว
 */
async function updateIncomeType(conn, code, incomeType) {
    const [result] = await conn.query(
        `UPDATE tb_wht_income_types SET wit_name_th = ?, wit_name_en = ?, wit_form_row = ?, wit_form_label = ?, wit_status = ?,
                wit_sort_order = ?
         WHERE wit_code = ?`,
        [
            incomeType.wit_name_th,
            incomeType.wit_name_en,
            incomeType.wit_form_row,
            incomeType.wit_form_label,
            incomeType.wit_status,
            incomeType.wit_sort_order,
            code,
        ],
    );
    if (result.affectedRows === 0) {
        throw new AppError(404, "INCOME_TYPE_NOT_FOUND", "ไม่พบประเภทเงินได้นี้ กรุณาโหลดหน้าใหม่");
    }
    return { wit_code: code };
}

/**
 * อัตราใหม่ — วันที่มีผลต้องเป็นพรุ่งนี้เป็นต้นไป (เอกสารที่ทำไปแล้วใช้อัตราเดิมเสมอ)
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {object} rate ผ่าน whtRateSchema แล้ว
 * @param {string} userId
 */
async function addRate(conn, rate, userId) {
    if (rate.wr_effective_from <= todayBangkok()) {
        throw validationError(
            { wr_effective_from: "วันที่มีผลต้องเป็นวันพรุ่งนี้เป็นต้นไป" },
            "อัตราที่มีผลแล้วแก้ย้อนหลังไม่ได้ · เอกสารที่ทำไปแล้วใช้อัตราเดิม",
        );
    }
    const [[type]] = await conn.query("SELECT wit_code FROM tb_wht_income_types WHERE wit_code = ?", [
        rate.wr_income_type,
    ]);
    if (!type) throw validationError({ wr_income_type: "ไม่พบประเภทเงินได้นี้" });
    const [[existing]] = await conn.query(
        "SELECT wr_rate FROM tb_wht_rates WHERE wr_income_type = ? AND wr_effective_from = ?",
        [rate.wr_income_type, rate.wr_effective_from],
    );
    if (existing) {
        throw new AppError(409, "WHT_RATE_EXISTS", "มีอัตราที่มีผลวันนี้อยู่แล้ว ถ้าจะเปลี่ยนให้ลบอันเดิมก่อน", {
            wr_effective_from: "มีอัตราของวันนี้แล้ว",
        });
    }
    await conn.query(
        `INSERT INTO tb_wht_rates (wr_income_type, wr_effective_from, wr_rate, wr_min_payment, wr_note, wr_created_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [rate.wr_income_type, rate.wr_effective_from, rate.wr_rate, rate.wr_min_payment, rate.wr_note, userId],
    );
    return { wr_income_type: rate.wr_income_type, wr_effective_from: rate.wr_effective_from };
}

/**
 * ลบอัตราที่ยังไม่มีผล (ตั้งผิด/ยกเลิกแผน) — ที่มีผลแล้วลบไม่ได้
 * @param {import("mysql2/promise").PoolConnection} conn
 */
async function deleteRate(conn, incomeType, effectiveFrom) {
    const [[rate]] = await conn.query(
        `SELECT DATE_FORMAT(wr_effective_from, '%Y-%m-%d') AS wr_effective_from FROM tb_wht_rates
         WHERE wr_income_type = ? AND wr_effective_from = ? FOR UPDATE`,
        [incomeType, effectiveFrom],
    );
    if (!rate) throw new AppError(404, "WHT_RATE_NOT_FOUND", "ไม่พบอัตรานี้ อาจถูกลบไปแล้ว กรุณาโหลดหน้าใหม่");
    if (rate.wr_effective_from <= todayBangkok()) {
        throw new AppError(
            409,
            "WHT_RATE_LOCKED",
            "อัตรานี้มีผลแล้ว ลบไม่ได้ · ถ้าจะเปลี่ยนให้เพิ่มอัตราใหม่ที่มีผลวันถัดไป",
        );
    }
    await conn.query("DELETE FROM tb_wht_rates WHERE wr_income_type = ? AND wr_effective_from = ?", [
        incomeType,
        effectiveFrom,
    ]);
}

module.exports = {
    getPurchasingSetup,
    whtRateOn,
    createCategory,
    updateCategory,
    createIncomeType,
    updateIncomeType,
    addRate,
    deleteRate,
};
