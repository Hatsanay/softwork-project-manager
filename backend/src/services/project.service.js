// สร้างโปรเจกต์ — ที่เดียวของระบบ (2026-10-14 ขั้น 1A-4)
// ใช้ทั้งหน้าสร้างโปรเจกต์ (project.controller.js) และตอนลูกค้าตอบรับใบเสนอราคา (quotation-accept.service.js)
// ผู้สร้างเข้าเป็นสมาชิกพร้อมตำแหน่ง PM (ถ้ามีตำแหน่งชื่อ PM) ให้คุมโปรเจกต์ตัวเองได้เต็มที่ทันที
const { generateDailyId } = require("../utils/generateDailyId");
const { generateShareToken } = require("../utils/shareToken");

/**
 * @param {import("mysql2/promise").Pool | import("mysql2/promise").PoolConnection} conn
 * @param {{ project_name: string, client_id?: string | null, project_description?: string | null, project_status?: string,
 *           project_type?: string, project_start_date?: string | null, project_due_date?: string | null }} project
 * @param {string} creatorId
 * @returns {Promise<{ project_id: string, project_share_token: string }>}
 */
async function insertProject(conn, project, creatorId) {
    const projectId = await generateDailyId("tb_projects", "project_id", "PRO");
    const shareToken = generateShareToken();

    await conn.query(
        `INSERT INTO tb_projects
            (project_id, client_id, project_name, project_description, project_status, project_type,
             project_start_date, project_due_date, project_share_token, project_created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            projectId,
            project.client_id || null,
            project.project_name,
            project.project_description || null,
            project.project_status || "planning",
            project.project_type || "waterfall",
            project.project_start_date || null,
            project.project_due_date || null,
            shareToken,
            creatorId,
        ],
    );

    const memberId = await generateDailyId("tb_project_members", "project_member_id", "MEM");
    await conn.query("INSERT INTO tb_project_members (project_member_id, project_id, user_id) VALUES (?, ?, ?)", [
        memberId,
        projectId,
        creatorId,
    ]);
    const [[pmPosition]] = await conn.query(
        "SELECT position_id FROM tb_project_positions WHERE position_name = 'PM' LIMIT 1",
    );
    if (pmPosition?.position_id) {
        await conn.query("INSERT INTO tb_project_member_positions (project_member_id, position_id) VALUES (?, ?)", [
            memberId,
            pmPosition.position_id,
        ]);
    }

    return { project_id: projectId, project_share_token: shareToken };
}

/**
 * สินค้า/ชุดรายการสำหรับสร้างงานตอนสร้างโปรเจกต์ (2026-10-31) — เปิดใช้งานทุกตัว ไม่สนว่าแสดงหน้าร้านไหม
 * ไม่มีราคา (คนสร้างโปรเจกต์อาจไม่มีสิทธิ์ดูราคา) · สินค้าแบบ % ไม่อยู่ในรายการ เพราะเป็นค่าบริการเพิ่ม ไม่ใช่ชิ้นงาน
 * @returns {Promise<{ products: object[], packages: object[] }>}
 */
async function listTaskCatalog(conn) {
    const [products] = await conn.query(
        `SELECT product_id, product_name, product_unit
         FROM tb_products
         WHERE product_status = 'active' AND product_price_mode = 'fixed'
         ORDER BY product_name`,
    );
    const [packages] = await conn.query(
        "SELECT pkg_id, pkg_name FROM tb_product_packages WHERE pkg_status = 'active' ORDER BY pkg_name",
    );
    const packageIds = packages.map((row) => row.pkg_id);
    const [itemRows] = packageIds.length
        ? await conn.query(
              `SELECT i.pki_package_id, i.pki_description, i.pki_quantity, COALESCE(i.pki_unit, p.product_unit) AS unit
               FROM tb_product_package_items i LEFT JOIN tb_products p ON p.product_id = i.pki_product_id
               WHERE i.pki_package_id IN (?) AND i.pki_type = 'item'
               ORDER BY i.pki_package_id, i.pki_order`,
              [packageIds],
          )
        : [[]];
    const itemsByPackage = new Map();
    for (const row of itemRows) {
        const items = itemsByPackage.get(row.pki_package_id) ?? [];
        items.push({ name: row.pki_description, quantity: row.pki_quantity, unit: row.unit });
        itemsByPackage.set(row.pki_package_id, items);
    }
    return {
        products,
        packages: packages.map((row) => ({ ...row, items: itemsByPackage.get(row.pkg_id) ?? [] })),
    };
}

module.exports = { insertProject, listTaskCatalog };
