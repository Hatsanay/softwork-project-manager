// ลิงก์เลือกบริการ ฝั่งพนักงาน (2026-10-25 · S-1 · docs/plans/2026-10-25-client-order-link.md ข้อ 2)
//
// personal = ลูกค้าตรงรายเดียว · public = ติดหน้าเว็บ/เพจ · fastwork = ผู้ซื้อบน Fastwork (S-5)
// token 32 ตัว = ที่อยู่เต็ม · รหัสสั้น 8 ตัว = ที่อยู่ใต้ QR (ชี้ลิงก์เดียวกัน) · หมวดที่เปิด: ไม่เลือก = ทุกหมวดที่เปิดหน้าร้าน
// รายการที่ทีมเลือกให้ (ล็อก) เก็บใน tb_order_link_items · ol_allow_more = 0 → ลูกค้าเลือกเพิ่มไม่ได้
const crypto = require("crypto");
const { AppError } = require("../utils/app-error");
const { todayBangkok } = require("../utils/bangkok-time");
const { DEFAULT_LINK_DAYS } = require("../shared/schemas/order-link.mjs");

const COMPANY_ROW_ID = 1;
// ไม่มีตัวที่อ่านสับสน (0/O 1/I/L) — ลูกค้าพิมพ์จากใต้ QR ได้
const SHORT_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const SHORT_CODE_LENGTH = 8;

function validationError(fields, message = "ข้อมูลบางช่องใช้ไม่ได้ กรุณาแก้ตามข้อความใต้ช่อง") {
    return new AppError(400, "VALIDATION", message, fields);
}

function randomShortCode() {
    const bytes = crypto.randomBytes(SHORT_CODE_LENGTH);
    return [...bytes].map((byte) => SHORT_CODE_ALPHABET[byte % SHORT_CODE_ALPHABET.length]).join("");
}

function addDays(dateText, days) {
    const date = new Date(`${dateText}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

const LINK_COLUMNS = `
    l.ol_id, l.ol_token, l.ol_short_code, l.ol_kind, l.ol_name, l.ol_client_id, l.ol_project_id, l.ol_buyer_name,
    l.ol_assignee_id, DATE_FORMAT(l.ol_expires_on, '%Y-%m-%d') AS ol_expires_on, l.ol_status,
    DATE_FORMAT(l.ol_created_at, '%Y-%m-%d %H:%i') AS ol_created_at, l.ol_allow_more,
    c.client_name, p.project_name, p.project_status, CONCAT(a.user_fname, ' ', a.user_lname) AS assignee_name,
    (SELECT COUNT(*) FROM tb_service_requests r WHERE r.svr_link_id = l.ol_id) AS request_count,
    (SELECT GROUP_CONCAT(olc.olc_category_id ORDER BY olc.olc_category_id) FROM tb_order_link_categories olc WHERE olc.olc_link_id = l.ol_id) AS category_ids_text`;

const LINK_FROM = `
    FROM tb_order_links l
    LEFT JOIN tb_clients c ON c.client_id = l.ol_client_id
    LEFT JOIN tb_projects p ON p.project_id = l.ol_project_id
    LEFT JOIN tb_users a ON a.user_id = l.ol_assignee_id`;

const CLOSED_PROJECT_STATUSES = new Set(["completed", "cancelled"]);

/** สถานะที่ลูกค้าจะเจอตอนเปิด: open · disabled (ปิดเอง หรืองานที่ผูกปิดแล้ว) · expired (เลยวันหมดอายุ) */
function openStateOf(link, today) {
    if (link.ol_status !== "active") return "disabled";
    if (CLOSED_PROJECT_STATUSES.has(link.project_status)) return "disabled";
    if (link.ol_expires_on && link.ol_expires_on < today) return "expired";
    return "open";
}

/**
 * รายการที่ทีมเลือกให้ของแต่ละลิงก์ · is_available = ยังใช้งานได้ (สินค้า/ชุดเปิดอยู่ และสินค้าในชุดไม่ถูกปิด)
 * @returns {Promise<Map<number, object[]>>}
 */
async function presetItemsOf(conn, linkIds) {
    const byLink = new Map();
    if (linkIds.length === 0) return byLink;
    const [rows] = await conn.query(
        `SELECT i.oli_link_id, i.oli_product_id, i.oli_package_id, i.oli_quantity,
                COALESCE(p.product_name, k.pkg_name) AS name,
                CASE WHEN i.oli_product_id IS NOT NULL THEN p.product_status = 'active'
                     ELSE k.pkg_status = 'active' AND NOT EXISTS (
                         SELECT 1 FROM tb_product_package_items pi JOIN tb_products pp ON pp.product_id = pi.pki_product_id
                         WHERE pi.pki_package_id = k.pkg_id AND pp.product_status <> 'active')
                END AS is_available
         FROM tb_order_link_items i
         LEFT JOIN tb_products p ON p.product_id = i.oli_product_id
         LEFT JOIN tb_product_packages k ON k.pkg_id = i.oli_package_id
         WHERE i.oli_link_id IN (?)
         ORDER BY i.oli_link_id, i.oli_order`,
        [linkIds],
    );
    for (const row of rows) {
        const list = byLink.get(row.oli_link_id) ?? [];
        list.push({
            kind: row.oli_product_id ? "product" : "package",
            id: row.oli_product_id ?? row.oli_package_id,
            name: row.name,
            quantity: row.oli_quantity,
            is_available: Boolean(row.is_available),
        });
        byLink.set(row.oli_link_id, list);
    }
    return byLink;
}

function present(row, today, presetItems) {
    const { category_ids_text: categoryIdsText, ...link } = row;
    return {
        ...link,
        ol_allow_more: Boolean(link.ol_allow_more),
        request_count: Number(link.request_count),
        category_ids: categoryIdsText ? categoryIdsText.split(",") : [],
        preset_items: presetItems,
        // รายการที่ทีมเลือกให้ถูกปิดใช้งาน = ลูกค้าส่งคำขอไม่ได้ (หน้ารายการลิงก์เตือน)
        has_preset_problem: presetItems.some((item) => !item.is_available),
        open_state: openStateOf(link, today),
    };
}

async function listLinks(conn) {
    const today = todayBangkok();
    const [rows] = await conn.query(`SELECT ${LINK_COLUMNS} ${LINK_FROM} ORDER BY l.ol_status = 'active' DESC, l.ol_id DESC`);
    const presets = await presetItemsOf(conn, rows.map((row) => row.ol_id));
    return rows.map((row) => present(row, today, presets.get(row.ol_id) ?? []));
}

async function findLink(conn, linkId) {
    const [[row]] = await conn.query(`SELECT ${LINK_COLUMNS} ${LINK_FROM} WHERE l.ol_id = ?`, [linkId]);
    if (!row) throw new AppError(404, "ORDER_LINK_NOT_FOUND", "ไม่พบลิงก์นี้ กรุณาโหลดหน้าใหม่");
    const presets = await presetItemsOf(conn, [linkId]);
    return present(row, todayBangkok(), presets.get(linkId) ?? []);
}

/** รายการที่ทีมเลือกให้ต้องมีอยู่และยังเปิดใช้งาน (เลือกของที่ไม่ได้เปิดหน้าร้านได้ เพราะทีมเลือกเอง) */
async function savePresetItems(conn, linkId, items) {
    const productIds = items.filter((item) => item.kind === "product").map((item) => item.id);
    const packageIds = items.filter((item) => item.kind === "package").map((item) => item.id);
    const [products] = productIds.length
        ? await conn.query("SELECT product_id FROM tb_products WHERE product_id IN (?) AND product_status = 'active'", [productIds])
        : [[]];
    const [packages] = packageIds.length
        ? await conn.query("SELECT pkg_id FROM tb_product_packages WHERE pkg_id IN (?) AND pkg_status = 'active'", [packageIds])
        : [[]];
    if (products.length !== productIds.length || packages.length !== packageIds.length) {
        throw validationError({ preset_items: "บางรายการถูกลบหรือปิดใช้งานแล้ว กรุณาเลือกใหม่" });
    }
    await conn.query("DELETE FROM tb_order_link_items WHERE oli_link_id = ?", [linkId]);
    if (items.length === 0) return;
    await conn.query("INSERT INTO tb_order_link_items (oli_link_id, oli_product_id, oli_package_id, oli_quantity, oli_order) VALUES ?", [
        items.map((item, index) => [linkId, item.kind === "product" ? item.id : null, item.kind === "package" ? item.id : null, item.quantity, index + 1]),
    ]);
}

async function assertActiveUser(conn, userId, field) {
    const [[user]] = await conn.query("SELECT user_id FROM tb_users WHERE user_id = ? AND user_status = 'active'", [userId]);
    if (!user) throw validationError({ [field]: "ไม่พบผู้ใช้นี้ หรือปิดใช้งานแล้ว" });
}

async function assertCategories(conn, categoryIds) {
    if (categoryIds.length === 0) return;
    const [rows] = await conn.query("SELECT pc_id FROM tb_product_categories WHERE pc_id IN (?)", [categoryIds]);
    if (rows.length !== new Set(categoryIds).size) throw validationError({ category_ids: "บางหมวดถูกลบไปแล้ว กรุณาเลือกใหม่" });
}

/** ลูกค้าที่มีงาน Fastwork ใช้ลิงก์ลูกค้าตรงไม่ได้ (ราคาและการจ่ายต้องอยู่บน Fastwork) */
async function assertNotFastworkClient(conn, clientId) {
    const [[row]] = await conn.query(
        "SELECT project_name FROM tb_projects WHERE client_id = ? AND project_channel = 'fastwork' LIMIT 1",
        [clientId],
    );
    if (row) {
        throw validationError({
            ol_client_id: `ลูกค้านี้มีงาน Fastwork (${row.project_name}) · ใช้ลิงก์ Fastwork แทน เพราะราคาและการจ่ายเงินต้องอยู่บน Fastwork`,
        });
    }
}

async function saveCategories(conn, linkId, categoryIds) {
    await conn.query("DELETE FROM tb_order_link_categories WHERE olc_link_id = ?", [linkId]);
    const unique = [...new Set(categoryIds)];
    if (unique.length === 0) return;
    await conn.query("INSERT INTO tb_order_link_categories (olc_link_id, olc_category_id) VALUES ?", [unique.map((id) => [linkId, id])]);
}

async function createLink(conn, user, input) {
    await assertActiveUser(conn, input.ol_assignee_id, "ol_assignee_id");
    await assertCategories(conn, input.category_ids);
    if (input.ol_client_id) {
        const [[client]] = await conn.query("SELECT client_id FROM tb_clients WHERE client_id = ?", [input.ol_client_id]);
        if (!client) throw validationError({ ol_client_id: "ไม่พบลูกค้านี้ กรุณาเลือกใหม่" });
        await assertNotFastworkClient(conn, input.ol_client_id);
    }
    if (input.ol_project_id) {
        const [[project]] = await conn.query("SELECT project_channel, project_status FROM tb_projects WHERE project_id = ?", [input.ol_project_id]);
        if (!project || project.project_channel !== "fastwork") throw validationError({ ol_project_id: "เลือกงาน Fastwork" });
        if (CLOSED_PROJECT_STATUSES.has(project.project_status)) throw validationError({ ol_project_id: "งานนี้ปิดแล้ว สร้างลิงก์ไม่ได้" });
    }
    const today = todayBangkok();
    if (input.ol_expires_on && input.ol_expires_on < today) throw validationError({ ol_expires_on: "วันหมดอายุต้องไม่ก่อนวันนี้" });
    // ลิงก์รายคนหมดอายุเองถ้าไม่ได้กำหนด · ลิงก์สาธารณะเปิดตลอดจนปิดเอง
    const expiresOn = input.ol_expires_on ?? (input.ol_kind === "public" ? null : addDays(today, DEFAULT_LINK_DAYS));

    for (let attempt = 0; attempt < 5; attempt++) {
        const token = crypto.randomBytes(16).toString("hex");
        const shortCode = randomShortCode();
        try {
            const [result] = await conn.query(
                `INSERT INTO tb_order_links
                    (ol_token, ol_short_code, ol_kind, ol_name, ol_client_id, ol_project_id, ol_buyer_name, ol_assignee_id, ol_expires_on, ol_allow_more, ol_created_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    token, shortCode, input.ol_kind, input.ol_name, input.ol_client_id, input.ol_project_id, input.ol_buyer_name, input.ol_assignee_id,
                    expiresOn, input.ol_allow_more ? 1 : 0, user.user_id,
                ],
            );
            await saveCategories(conn, result.insertId, input.category_ids);
            await savePresetItems(conn, result.insertId, input.preset_items);
            return findLink(conn, result.insertId);
        } catch (error) {
            // รหัสสั้นชนของเดิม (โอกาสน้อยมาก) → สุ่มใหม่
            if (error.code !== "ER_DUP_ENTRY") throw error;
        }
    }
    throw new AppError(503, "SHORT_CODE_EXHAUSTED", "สร้างลิงก์ไม่สำเร็จ กรุณาลองใหม่");
}

async function updateLink(conn, linkId, input) {
    const [[link]] = await conn.query("SELECT ol_id, ol_expires_on FROM tb_order_links WHERE ol_id = ? FOR UPDATE", [linkId]);
    if (!link) throw new AppError(404, "ORDER_LINK_NOT_FOUND", "ไม่พบลิงก์นี้ กรุณาโหลดหน้าใหม่");
    await assertActiveUser(conn, input.ol_assignee_id, "ol_assignee_id");
    await assertCategories(conn, input.category_ids);
    await conn.query(
        "UPDATE tb_order_links SET ol_name = ?, ol_assignee_id = ?, ol_expires_on = ?, ol_status = ?, ol_allow_more = ? WHERE ol_id = ?",
        [input.ol_name, input.ol_assignee_id, input.ol_expires_on, input.ol_status, input.ol_allow_more ? 1 : 0, linkId],
    );
    await saveCategories(conn, linkId, input.category_ids);
    await savePresetItems(conn, linkId, input.preset_items);
    return findLink(conn, linkId);
}

/** ผู้รับคำขอเริ่มต้น (ตั้งค่าบริษัท) + ตัวเลือกผู้ใช้ */
async function getSettings(conn) {
    const [[settings]] = await conn.query("SELECT cs_service_request_assignee_id FROM tb_company_settings WHERE cs_id = ?", [COMPANY_ROW_ID]);
    const [users] = await conn.query(
        "SELECT user_id, CONCAT(user_fname, ' ', user_lname) AS full_name FROM tb_users WHERE user_status = 'active' ORDER BY user_fname",
    );
    return { cs_service_request_assignee_id: settings?.cs_service_request_assignee_id ?? null, users };
}

async function updateSettings(conn, input) {
    if (input.cs_service_request_assignee_id) await assertActiveUser(conn, input.cs_service_request_assignee_id, "cs_service_request_assignee_id");
    await conn.query("UPDATE tb_company_settings SET cs_service_request_assignee_id = ? WHERE cs_id = ?", [
        input.cs_service_request_assignee_id,
        COMPANY_ROW_ID,
    ]);
    return getSettings(conn);
}

module.exports = { listLinks, findLink, createLink, updateLink, getSettings, updateSettings, openStateOf, presetItemsOf };
