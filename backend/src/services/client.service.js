// ลูกค้า (ปรับ 13 ต.ค. 2026 ขั้น 1A-1d — เพิ่มข้อมูลสำหรับเอกสารขาย: ประเภท ประเทศ เลขผู้เสียภาษี สาขา ค่าเริ่มต้นเอกสาร สถานะ)
// แบบระบบ: docs/plans/2026-10-08-sales-cycle.md หัวข้อ 1 (tb_clients) · ข้อมูลผ่าน clientSchema (shared/schemas/client.mjs) แล้ว
const { AppError } = require("../utils/app-error");
const { generateDailyId } = require("../utils/generateDailyId");

const MAX_LIST_LIMIT = 1000;

const CLIENT_COLUMNS = `
    client_id, client_name, client_company, client_contact_name, client_email, client_phone,
    client_type, client_country, client_tax_id, client_branch_code, client_address,
    client_credit_days, client_wht_rate, client_currency, client_language, client_vat_treatment, client_status,
    client_created_at, client_updated_at`;

/**
 * @param {import("mysql2/promise").Pool} conn
 * @param {{ limit?: number, offset?: number, search?: string, status?: string }} options
 *   status = "active" ใช้กับช่องเลือกลูกค้าในเอกสาร/โปรเจกต์ใหม่ (ลูกค้าที่ปิดใช้งานเลือกไม่ได้)
 */
async function listClients(conn, { limit = 10, offset = 0, search = "", status }) {
    const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), MAX_LIST_LIMIT);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const like = `%${search}%`;

    const conditions = [
        "(client_name LIKE ? OR client_company LIKE ? OR client_tax_id LIKE ? OR client_contact_name LIKE ?)",
    ];
    const params = [like, like, like, like];
    if (status === "active" || status === "inactive") {
        conditions.push("client_status = ?");
        params.push(status);
    }
    const where = conditions.join(" AND ");

    const [rows] = await conn.query(
        `SELECT ${CLIENT_COLUMNS} FROM tb_clients WHERE ${where} ORDER BY client_id DESC LIMIT ? OFFSET ?`,
        [...params, safeLimit, safeOffset],
    );
    const [[{ total }]] = await conn.query(`SELECT COUNT(*) AS total FROM tb_clients WHERE ${where}`, params);
    return { data: rows, total };
}

/**
 * @param {import("mysql2/promise").Pool | import("mysql2/promise").PoolConnection} conn
 * @param {string} clientId
 */
async function findClient(conn, clientId) {
    const [[client]] = await conn.query(`SELECT ${CLIENT_COLUMNS} FROM tb_clients WHERE client_id = ?`, [clientId]);
    if (!client) {
        throw new AppError(404, "CLIENT_NOT_FOUND", "ไม่พบลูกค้านี้ อาจถูกลบไปแล้ว กรุณาโหลดหน้าใหม่");
    }
    return client;
}

// สกุลเงินเริ่มต้นต้องมีอยู่จริง · เลือกใหม่ต้องเป็นสกุลที่เปิดใช้งาน (สกุลเดิมที่ถูกปิดไปแล้วคงไว้ได้)
async function assertCurrencyUsable(conn, currencyCode, currentCurrency) {
    const [[currency]] = await conn.query("SELECT cur_status FROM tb_currencies WHERE cur_code = ?", [currencyCode]);
    if (!currency) {
        throw new AppError(400, "VALIDATION", "ไม่พบสกุลเงินนี้ กรุณาโหลดหน้าใหม่", {
            client_currency: "ไม่พบสกุลเงินนี้",
        });
    }
    const isUnchanged = currencyCode === currentCurrency;
    if (currency.cur_status !== "active" && !isUnchanged) {
        throw new AppError(400, "VALIDATION", "สกุลเงินนี้ถูกปิดใช้งาน", {
            client_currency:
                "สกุลเงินนี้ถูกปิดใช้งาน · เลือกสกุลอื่น หรือเปิดใช้งานที่ ตั้งค่าระบบ › ข้อมูลบริษัท › สกุลเงิน",
        });
    }
}

function toColumnValues(client) {
    return [
        client.client_name,
        client.client_company,
        client.client_contact_name,
        client.client_email,
        client.client_phone,
        client.client_type,
        client.client_country,
        client.client_tax_id,
        client.client_branch_code,
        client.client_address,
        client.client_credit_days,
        client.client_wht_rate,
        client.client_currency,
        client.client_language,
        client.client_vat_treatment,
        client.client_status,
    ];
}

/**
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {object} client ผ่าน clientSchema แล้ว
 */
async function createClient(conn, client) {
    await assertCurrencyUsable(conn, client.client_currency, null);
    const clientId = await generateDailyId("tb_clients", "client_id", "CLI");
    await conn.query(
        `INSERT INTO tb_clients
            (client_id, client_name, client_company, client_contact_name, client_email, client_phone,
             client_type, client_country, client_tax_id, client_branch_code, client_address,
             client_credit_days, client_wht_rate, client_currency, client_language, client_vat_treatment, client_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [clientId, ...toColumnValues(client)],
    );
    return { client_id: clientId, client_name: client.client_name };
}

/**
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {string} clientId
 * @param {object} client ผ่าน clientSchema แล้ว
 */
async function updateClient(conn, clientId, client) {
    const [[existing]] = await conn.query("SELECT client_currency FROM tb_clients WHERE client_id = ? FOR UPDATE", [
        clientId,
    ]);
    if (!existing) {
        throw new AppError(404, "CLIENT_NOT_FOUND", "ไม่พบลูกค้านี้ อาจถูกลบไปแล้ว กรุณาโหลดหน้าใหม่");
    }
    await assertCurrencyUsable(conn, client.client_currency, existing.client_currency);

    await conn.query(
        `UPDATE tb_clients SET
            client_name = ?, client_company = ?, client_contact_name = ?, client_email = ?, client_phone = ?,
            client_type = ?, client_country = ?, client_tax_id = ?, client_branch_code = ?, client_address = ?,
            client_credit_days = ?, client_wht_rate = ?, client_currency = ?, client_language = ?,
            client_vat_treatment = ?, client_status = ?
         WHERE client_id = ?`,
        [...toColumnValues(client), clientId],
    );
}

/**
 * ลบได้เฉพาะลูกค้าที่ยังไม่มีโปรเจกต์และเอกสารขาย — ที่เคยใช้แล้วให้ปิดใช้งานแทน (ประวัติต้องอยู่ครบ)
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {string} clientId
 */
async function deleteClient(conn, clientId) {
    await findClient(conn, clientId);

    const [[{ projectCount }]] = await conn.query(
        "SELECT COUNT(*) AS projectCount FROM tb_projects WHERE client_id = ?",
        [clientId],
    );
    const [[{ quotationCount }]] = await conn.query(
        "SELECT COUNT(*) AS quotationCount FROM tb_quotations WHERE qt_client_id = ?",
        [clientId],
    );
    const usages = [];
    if (projectCount > 0) usages.push(`โปรเจกต์ ${projectCount} โปรเจกต์`);
    if (quotationCount > 0) usages.push(`ใบเสนอราคา ${quotationCount} ใบ`);
    if (usages.length > 0) {
        throw new AppError(
            409,
            "CLIENT_IN_USE",
            `ลบลูกค้านี้ไม่ได้ เพราะมี${usages.join(" และ ")} · ถ้าไม่ใช้แล้วให้แก้ไขแล้วเปลี่ยนเป็นปิดใช้งาน (เลือกในงานใหม่ไม่ได้ แต่ประวัติยังอยู่)`,
        );
    }

    await conn.query("DELETE FROM tb_clients WHERE client_id = ?", [clientId]);
}

module.exports = { listClients, findClient, createClient, updateClient, deleteClient };
