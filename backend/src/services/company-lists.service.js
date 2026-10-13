// สาขา · บัญชีธนาคาร · สกุลเงิน ของหน้าตั้งค่าบริษัท (2026-10-13, docs/plans/2026-10-08-sales-cycle.md หัวข้อ 1)
//
// ไม่มีการลบ — ของที่อาจอยู่บนเอกสารแล้วใช้ "ปิดใช้งาน" แทน (CODING_GUIDELINES หัวข้อ 3.10)
// ทุกฟังก์ชันรับ conn — เขียนผ่าน withTransaction
const { AppError } = require("../utils/app-error");
const { generateDailyId } = require("../utils/generateDailyId");

const HEAD_OFFICE_CODE = "00000";
const BASE_CURRENCY = "THB";

// ─── สาขา ────────────────────────────────────────────────────────────────────────────────────

/**
 * สาขาทั้งหมด สำนักงานใหญ่ก่อน · user_count = ผู้ใช้ที่ใช้สาขานี้เป็นสาขาเริ่มต้น
 * @param {import("mysql2/promise").Pool | import("mysql2/promise").PoolConnection} conn
 */
async function findBranches(conn) {
    const [rows] = await conn.query(
        `SELECT b.branch_id, b.branch_code, b.branch_name_th, b.branch_name_en, b.branch_address_th, b.branch_address_en,
                b.branch_phone, b.branch_status, b.branch_created_at, b.branch_updated_at,
                (SELECT COUNT(*) FROM tb_users u WHERE u.user_branch_id = b.branch_id) AS user_count
         FROM tb_branches b
         ORDER BY b.branch_code`,
    );
    return rows.map((row) => ({ ...row, is_head_office: row.branch_code === HEAD_OFFICE_CODE }));
}

async function findBranchForUpdate(conn, branchId) {
    const [[branch]] = await conn.query(
        "SELECT branch_id, branch_code FROM tb_branches WHERE branch_id = ? FOR UPDATE",
        [branchId],
    );
    if (!branch) {
        throw new AppError(404, "BRANCH_NOT_FOUND", "ไม่พบสาขานี้ อาจถูกลบไปแล้ว กรุณาโหลดหน้าใหม่");
    }
    return branch;
}

/**
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {object} branch ผ่าน branchCreateSchema แล้ว
 */
async function createBranch(conn, branch) {
    const [[sameCode]] = await conn.query("SELECT branch_name_th FROM tb_branches WHERE branch_code = ?", [
        branch.branch_code,
    ]);
    if (sameCode) {
        throw new AppError(
            409,
            "BRANCH_CODE_EXISTS",
            `รหัสสาขา ${branch.branch_code} ถูกใช้แล้วกับ "${sameCode.branch_name_th}"`,
            {
                branch_code: "รหัสสาขานี้ถูกใช้แล้ว",
            },
        );
    }

    const branchId = await generateDailyId("tb_branches", "branch_id", "BRA");
    await conn.query(
        `INSERT INTO tb_branches
            (branch_id, branch_code, branch_name_th, branch_name_en, branch_address_th, branch_address_en, branch_phone, branch_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            branchId,
            branch.branch_code,
            branch.branch_name_th,
            branch.branch_name_en,
            branch.branch_address_th,
            branch.branch_address_en,
            branch.branch_phone,
            branch.branch_status,
        ],
    );
    return { branch_id: branchId };
}

/**
 * รหัสสาขาแก้ไม่ได้ (อยู่บนเอกสารภาษีแล้ว) · สำนักงานใหญ่ปิดใช้งานไม่ได้
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {string} branchId
 * @param {object} branch ผ่าน branchUpdateSchema แล้ว
 */
async function updateBranch(conn, branchId, branch) {
    const existing = await findBranchForUpdate(conn, branchId);
    const isHeadOffice = existing.branch_code === HEAD_OFFICE_CODE;
    if (isHeadOffice && branch.branch_status === "inactive") {
        throw new AppError(
            409,
            "HEAD_OFFICE_CANNOT_CLOSE",
            "สำนักงานใหญ่ปิดใช้งานไม่ได้ — เอกสารและผู้ใช้ที่ไม่ได้ระบุสาขาใช้สำนักงานใหญ่",
            {
                branch_status: "สำนักงานใหญ่ปิดใช้งานไม่ได้",
            },
        );
    }

    await conn.query(
        `UPDATE tb_branches SET
            branch_name_th = ?, branch_name_en = ?, branch_address_th = ?, branch_address_en = ?, branch_phone = ?, branch_status = ?
         WHERE branch_id = ?`,
        [
            branch.branch_name_th,
            branch.branch_name_en,
            branch.branch_address_th,
            branch.branch_address_en,
            branch.branch_phone,
            branch.branch_status,
            branchId,
        ],
    );
    return { branch_id: branchId };
}

// ─── บัญชีธนาคาร ──────────────────────────────────────────────────────────────────────────────

/**
 * @param {import("mysql2/promise").Pool | import("mysql2/promise").PoolConnection} conn
 */
async function findBankAccounts(conn) {
    const [rows] = await conn.query(
        `SELECT ba_id, ba_bank_name, ba_account_name, ba_account_no, ba_bank_branch, ba_swift_code, ba_currency,
                ba_is_default, ba_status, ba_created_at, ba_updated_at
         FROM tb_bank_accounts
         ORDER BY ba_currency, ba_is_default DESC, ba_bank_name`,
    );
    return rows.map((row) => ({ ...row, ba_is_default: row.ba_is_default === 1 }));
}

async function assertCurrencyUsable(conn, currencyCode, { mustBeActive }) {
    const [[currency]] = await conn.query("SELECT cur_status FROM tb_currencies WHERE cur_code = ?", [currencyCode]);
    if (!currency) {
        throw new AppError(400, "VALIDATION", "ไม่พบสกุลเงินนี้ กรุณาโหลดหน้าใหม่", {
            ba_currency: "ไม่พบสกุลเงินนี้",
        });
    }
    if (mustBeActive && currency.cur_status !== "active") {
        throw new AppError(400, "VALIDATION", "สกุลเงินนี้ถูกปิดใช้งานอยู่", {
            ba_currency: "สกุลเงินนี้ถูกปิดใช้งาน — เปิดใช้งานในแท็บสกุลเงินก่อน",
        });
    }
}

// บัญชีหลักต้องเปิดใช้งานอยู่ — ใบแจ้งหนี้ (1B) แสดงบัญชีหลักของสกุลเงินนั้น
function assertDefaultIsActive(bankAccount) {
    if (bankAccount.ba_is_default && bankAccount.ba_status === "inactive") {
        throw new AppError(400, "VALIDATION", "บัญชีหลักต้องเปิดใช้งาน", {
            ba_status: "บัญชีหลักปิดใช้งานไม่ได้ — ตั้งบัญชีอื่นเป็นบัญชีหลักก่อน หรือเอาเครื่องหมายบัญชีหลักออก",
        });
    }
}

// บัญชีหลักมีได้ 1 บัญชีต่อสกุลเงิน — ตั้งบัญชีนี้เป็นหลักแล้ว บัญชีหลักเดิมของสกุลเดียวกันไม่เป็นหลักอีกต่อไป
// UPDATE นี้ล็อกแถวที่เกี่ยวข้อง สองคนตั้งบัญชีหลักพร้อมกันจะรอกัน ไม่เกิดบัญชีหลักซ้อน
async function clearOtherDefaults(conn, currencyCode, keepAccountId) {
    await conn.query(
        "UPDATE tb_bank_accounts SET ba_is_default = 0 WHERE ba_currency = ? AND ba_id <> ? AND ba_is_default = 1",
        [currencyCode, keepAccountId],
    );
}

/**
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {object} bankAccount ผ่าน bankAccountSchema แล้ว
 */
async function createBankAccount(conn, bankAccount) {
    await assertCurrencyUsable(conn, bankAccount.ba_currency, { mustBeActive: true });
    assertDefaultIsActive(bankAccount);

    const bankAccountId = await generateDailyId("tb_bank_accounts", "ba_id", "BAC");
    await conn.query(
        `INSERT INTO tb_bank_accounts
            (ba_id, ba_bank_name, ba_account_name, ba_account_no, ba_bank_branch, ba_swift_code, ba_currency, ba_is_default, ba_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            bankAccountId,
            bankAccount.ba_bank_name,
            bankAccount.ba_account_name,
            bankAccount.ba_account_no,
            bankAccount.ba_bank_branch,
            bankAccount.ba_swift_code,
            bankAccount.ba_currency,
            bankAccount.ba_is_default ? 1 : 0,
            bankAccount.ba_status,
        ],
    );
    if (bankAccount.ba_is_default) {
        await clearOtherDefaults(conn, bankAccount.ba_currency, bankAccountId);
    }
    return { ba_id: bankAccountId };
}

/**
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {string} bankAccountId
 * @param {object} bankAccount ผ่าน bankAccountSchema แล้ว
 */
async function updateBankAccount(conn, bankAccountId, bankAccount) {
    const [[existing]] = await conn.query("SELECT ba_currency FROM tb_bank_accounts WHERE ba_id = ? FOR UPDATE", [
        bankAccountId,
    ]);
    if (!existing) {
        throw new AppError(404, "BANK_ACCOUNT_NOT_FOUND", "ไม่พบบัญชีธนาคารนี้ อาจถูกลบไปแล้ว กรุณาโหลดหน้าใหม่");
    }
    const isChangingCurrency = existing.ba_currency !== bankAccount.ba_currency;
    await assertCurrencyUsable(conn, bankAccount.ba_currency, { mustBeActive: isChangingCurrency });
    assertDefaultIsActive(bankAccount);

    await conn.query(
        `UPDATE tb_bank_accounts SET
            ba_bank_name = ?, ba_account_name = ?, ba_account_no = ?, ba_bank_branch = ?, ba_swift_code = ?,
            ba_currency = ?, ba_is_default = ?, ba_status = ?
         WHERE ba_id = ?`,
        [
            bankAccount.ba_bank_name,
            bankAccount.ba_account_name,
            bankAccount.ba_account_no,
            bankAccount.ba_bank_branch,
            bankAccount.ba_swift_code,
            bankAccount.ba_currency,
            bankAccount.ba_is_default ? 1 : 0,
            bankAccount.ba_status,
            bankAccountId,
        ],
    );
    if (bankAccount.ba_is_default) {
        await clearOtherDefaults(conn, bankAccount.ba_currency, bankAccountId);
    }
    return { ba_id: bankAccountId };
}

// ─── สกุลเงิน ─────────────────────────────────────────────────────────────────────────────────

/**
 * is_used_in_documents = มีใบเสนอราคาใช้สกุลนี้แล้ว → เปลี่ยนจำนวนทศนิยมไม่ได้
 * @param {import("mysql2/promise").Pool | import("mysql2/promise").PoolConnection} conn
 */
async function findCurrencies(conn) {
    const [rows] = await conn.query(
        `SELECT c.cur_code, c.cur_name_th, c.cur_name_en, c.cur_symbol, c.cur_decimals, c.cur_unit_th, c.cur_subunit_th,
                c.cur_unit_en, c.cur_subunit_en, c.cur_bot_unit, c.cur_sort_order, c.cur_status,
                EXISTS (SELECT 1 FROM tb_quotations q WHERE q.qt_currency = c.cur_code) AS is_used_in_documents
         FROM tb_currencies c
         ORDER BY c.cur_sort_order, c.cur_code`,
    );
    return rows.map((row) => ({
        ...row,
        is_base_currency: row.cur_code === BASE_CURRENCY,
        is_used_in_documents: row.is_used_in_documents === 1,
    }));
}

/**
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {object} currency ผ่าน currencyCreateSchema แล้ว
 */
async function createCurrency(conn, currency) {
    const [[existing]] = await conn.query("SELECT 1 FROM tb_currencies WHERE cur_code = ?", [currency.cur_code]);
    if (existing) {
        throw new AppError(
            409,
            "CURRENCY_EXISTS",
            `มีสกุลเงิน ${currency.cur_code} อยู่แล้ว ถ้าปิดใช้งานอยู่ให้แก้ไขแล้วเปิดใช้งานแทน`,
            {
                cur_code: "มีสกุลเงินนี้อยู่แล้ว",
            },
        );
    }

    await conn.query(
        `INSERT INTO tb_currencies
            (cur_code, cur_name_th, cur_name_en, cur_symbol, cur_decimals, cur_unit_th, cur_subunit_th, cur_unit_en, cur_subunit_en,
             cur_bot_unit, cur_sort_order, cur_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            currency.cur_code,
            currency.cur_name_th,
            currency.cur_name_en,
            currency.cur_symbol,
            currency.cur_decimals,
            currency.cur_unit_th,
            currency.cur_subunit_th,
            currency.cur_unit_en,
            currency.cur_subunit_en,
            currency.cur_bot_unit,
            currency.cur_sort_order,
            currency.cur_status,
        ],
    );
    return { cur_code: currency.cur_code };
}

/**
 * บาท (สกุลหลัก): ปิดใช้งาน/เปลี่ยนทศนิยม/เปลี่ยนหน่วย ธปท. ไม่ได้
 * สกุลที่มีเอกสารใช้แล้ว: เปลี่ยนจำนวนทศนิยมไม่ได้ (ยอดในเอกสารเดิมจะแสดงผิด)
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {string} currencyCode
 * @param {object} currency ผ่าน currencyUpdateSchema แล้ว
 */
async function updateCurrency(conn, currencyCode, currency) {
    const [[existing]] = await conn.query("SELECT cur_decimals FROM tb_currencies WHERE cur_code = ? FOR UPDATE", [
        currencyCode,
    ]);
    if (!existing) {
        throw new AppError(404, "CURRENCY_NOT_FOUND", "ไม่พบสกุลเงินนี้ กรุณาโหลดหน้าใหม่");
    }

    if (currencyCode === BASE_CURRENCY) {
        const fields = {};
        if (currency.cur_status !== "active") fields.cur_status = "บาทเป็นสกุลหลักของระบบ ปิดใช้งานไม่ได้";
        if (currency.cur_decimals !== 2) fields.cur_decimals = "บาทมีทศนิยม 2 ตำแหน่งเสมอ";
        if (currency.cur_bot_unit !== 1) fields.cur_bot_unit = "บาทไม่ต้องแปลงอัตรา (หน่วย = 1)";
        if (Object.keys(fields).length > 0) {
            throw new AppError(
                409,
                "BASE_CURRENCY_FIXED",
                "บาทเป็นสกุลหลักของระบบ แก้ได้เฉพาะชื่อ สัญลักษณ์ คำอ่าน และลำดับ",
                fields,
            );
        }
    }

    const isChangingDecimals = existing.cur_decimals !== currency.cur_decimals;
    if (isChangingDecimals) {
        const [[usedByQuotation]] = await conn.query("SELECT 1 FROM tb_quotations WHERE qt_currency = ? LIMIT 1", [
            currencyCode,
        ]);
        if (usedByQuotation) {
            throw new AppError(
                409,
                "CURRENCY_DECIMALS_LOCKED",
                "สกุลเงินนี้มีเอกสารใช้แล้ว เปลี่ยนจำนวนทศนิยมไม่ได้ (ยอดในเอกสารเดิมจะแสดงผิด)",
                {
                    cur_decimals: "มีเอกสารใช้สกุลนี้แล้ว เปลี่ยนไม่ได้",
                },
            );
        }
    }

    await conn.query(
        `UPDATE tb_currencies SET
            cur_name_th = ?, cur_name_en = ?, cur_symbol = ?, cur_decimals = ?, cur_unit_th = ?, cur_subunit_th = ?,
            cur_unit_en = ?, cur_subunit_en = ?, cur_bot_unit = ?, cur_sort_order = ?, cur_status = ?
         WHERE cur_code = ?`,
        [
            currency.cur_name_th,
            currency.cur_name_en,
            currency.cur_symbol,
            currency.cur_decimals,
            currency.cur_unit_th,
            currency.cur_subunit_th,
            currency.cur_unit_en,
            currency.cur_subunit_en,
            currency.cur_bot_unit,
            currency.cur_sort_order,
            currency.cur_status,
            currencyCode,
        ],
    );
    return { cur_code: currencyCode };
}

module.exports = {
    HEAD_OFFICE_CODE,
    BASE_CURRENCY,
    findBranches,
    createBranch,
    updateBranch,
    findBankAccounts,
    createBankAccount,
    updateBankAccount,
    findCurrencies,
    createCurrency,
    updateCurrency,
};
