// ชุดรายการ (แพ็กเกจ) — กดครั้งเดียวได้ทุกแถวของชุดลงใบเสนอราคา (2026-10-13 ขั้น 1A-1d, sales-cycle หัวข้อ 4.1)
//
// แถวในชุดบันทึกทั้งชุดทีเดียว (ลบของเดิมแล้วใส่ใหม่ใน transaction เดียว) · ใบเสนอราคาที่เคยใช้ชุดนี้ไม่กระทบ (ใบเก็บสำเนาเอง)
// แถวที่อ้างสินค้าที่ถูกปิดใช้งาน: เก็บไว้ได้ (ข้อมูลเดิม) — ตอนกดใส่ใบเสนอราคาจะข้ามแถวนั้นพร้อมแจ้ง
const { AppError } = require("../utils/app-error");
const { generateDailyId } = require("../utils/generateDailyId");
const { assertCategoryExists } = require("./product.service");
const { formatHundredths } = require("../shared/money.mjs");
const { lineAmount } = require("../shared/order-cart-math.mjs");

// รายการในชุดที่ส่งไปให้การ์ดในหน้าสินค้าแสดงเป็นตัวอย่าง
const PREVIEW_ITEM_COUNT = 4;

/**
 * ชุดรายการทั้งหมด พร้อมจำนวนแถว จำนวนแถวที่อ้างสินค้าที่ปิดใช้งานแล้ว
 * ราคาชุดตอนนี้ (pkg_total: แถวรายการ × ราคาปัจจุบันของสินค้า หรือราคาในแถว · ไม่นับแถวสินค้าปิดใช้งาน เพราะใส่ใบเสนอราคาจะถูกข้าม)
 * และชื่อรายการแรกๆ (preview_items) สำหรับการ์ด
 * @param {import("mysql2/promise").Pool} conn
 */
async function listPackages(conn) {
    const packages = await listPackageRows(conn);
    if (packages.length === 0) return packages;
    const [itemRows] = await conn.query(
        `SELECT i.pki_package_id, i.pki_description, i.pki_quantity, i.pki_unit_price, i.pki_product_id, p.product_price, p.product_status
         FROM tb_product_package_items i
         LEFT JOIN tb_products p ON p.product_id = i.pki_product_id
         WHERE i.pki_type = 'item'
         ORDER BY i.pki_package_id, i.pki_order`,
    );
    const totals = new Map();
    const previews = new Map();
    for (const row of itemRows) {
        const preview = previews.get(row.pki_package_id) ?? [];
        if (preview.length < PREVIEW_ITEM_COUNT) preview.push(row.pki_description.split("\n")[0]);
        previews.set(row.pki_package_id, preview);
        if (row.product_status === "inactive") continue;
        const unitPrice = row.pki_product_id ? row.product_price : row.pki_unit_price;
        const amount = lineAmount(unitPrice ?? "0", row.pki_quantity ?? "0");
        totals.set(row.pki_package_id, (totals.get(row.pki_package_id) ?? 0n) + amount);
    }
    return packages.map((row) => ({
        ...row,
        pkg_total: formatHundredths(totals.get(row.pkg_id) ?? 0n),
        preview_items: previews.get(row.pkg_id) ?? [],
    }));
}

async function listPackageRows(conn) {
    const [rows] = await conn.query(
        `SELECT k.pkg_id, k.pkg_name, k.pkg_description, k.pkg_category_id, c.pc_name AS category_name, k.pkg_status,
                k.pkg_is_public, k.pkg_image_url, k.pkg_updated_at,
                (SELECT COUNT(*) FROM tb_product_package_items i WHERE i.pki_package_id = k.pkg_id) AS item_count,
                (SELECT COUNT(*) FROM tb_product_package_items i
                   JOIN tb_products p ON p.product_id = i.pki_product_id
                  WHERE i.pki_package_id = k.pkg_id AND p.product_status = 'inactive') AS inactive_product_count
         FROM tb_product_packages k
         LEFT JOIN tb_product_categories c ON c.pc_id = k.pkg_category_id
         ORDER BY k.pkg_status = 'active' DESC, k.pkg_name`,
    );
    return rows;
}

/**
 * ชุดรายการพร้อมทุกแถว (เรียงตามลำดับ) และข้อมูลปัจจุบันของสินค้าที่อ้าง
 * @param {import("mysql2/promise").Pool | import("mysql2/promise").PoolConnection} conn
 * @param {string} packageId
 */
async function findPackage(conn, packageId) {
    const [[productPackage]] = await conn.query(
        `SELECT pkg_id, pkg_name, pkg_description, pkg_category_id, pkg_status, pkg_is_public, pkg_image_url FROM tb_product_packages WHERE pkg_id = ?`,
        [packageId],
    );
    if (!productPackage) {
        throw new AppError(404, "PACKAGE_NOT_FOUND", "ไม่พบชุดรายการนี้ อาจถูกลบไปแล้ว กรุณาโหลดหน้าใหม่");
    }
    const [items] = await conn.query(
        `SELECT i.pki_id, i.pki_order, i.pki_type, i.pki_product_id, i.pki_description, i.pki_quantity, i.pki_unit, i.pki_unit_price,
                p.product_name, p.product_code, p.product_price, p.product_unit, p.product_status
         FROM tb_product_package_items i
         LEFT JOIN tb_products p ON p.product_id = i.pki_product_id
         WHERE i.pki_package_id = ?
         ORDER BY i.pki_order, i.pki_id`,
        [packageId],
    );
    const [addonRules] = await conn.query(
        `SELECT r.par_product_id AS product_id, r.par_rule AS rule, p.product_name
         FROM tb_package_addon_rules r JOIN tb_products p ON p.product_id = r.par_product_id
         WHERE r.par_package_id = ? ORDER BY p.product_name`,
        [packageId],
    );
    return { ...productPackage, items, addon_rules: addonRules };
}

// สินค้าที่อ้างต้องยังมีอยู่ (อาจถูกลบไประหว่างที่เปิดหน้าค้างไว้)
async function assertProductsExist(conn, items) {
    const productIds = [...new Set(items.map((item) => item.pki_product_id).filter(Boolean))];
    if (productIds.length === 0) return;
    const [rows] = await conn.query("SELECT product_id FROM tb_products WHERE product_id IN (?)", [productIds]);
    const existingIds = new Set(rows.map((row) => row.product_id));
    const fields = {};
    items.forEach((item, index) => {
        if (item.pki_product_id && !existingIds.has(item.pki_product_id)) {
            fields[`items.${index}.pki_product_id`] = "สินค้านี้ถูกลบไปแล้ว กรุณาเลือกใหม่";
        }
    });
    if (Object.keys(fields).length > 0) {
        throw new AppError(400, "VALIDATION", "มีสินค้าที่ถูกลบไปแล้วในชุดรายการ กรุณาเลือกใหม่", fields);
    }
    const [percentRows] = await conn.query("SELECT product_name FROM tb_products WHERE product_id IN (?) AND product_price_mode = 'percent'", [productIds]);
    if (percentRows.length > 0) {
        throw new AppError(400, "VALIDATION", `"${percentRows[0].product_name}" คิดเป็น % ใส่ในชุดรายการไม่ได้`, { items: "เอาสินค้าที่คิดเป็น % ออกจากชุด" });
    }
}

/** กติกางานเพิ่ม: บันทึกทั้งชุดใหม่ · สินค้าที่ถูกลบไประหว่างเปิดหน้า = แจ้งให้เลือกใหม่ */
async function saveAddonRules(conn, packageId, rules) {
    await conn.query("DELETE FROM tb_package_addon_rules WHERE par_package_id = ?", [packageId]);
    if (rules.length === 0) return;
    const [rows] = await conn.query("SELECT product_id FROM tb_products WHERE product_id IN (?)", [rules.map((rule) => rule.product_id)]);
    if (rows.length !== rules.length) {
        throw new AppError(400, "VALIDATION", "งานเพิ่มบางรายการถูกลบไปแล้ว กรุณาเลือกใหม่", { addon_rules: "เลือกงานเพิ่มใหม่" });
    }
    await conn.query("INSERT INTO tb_package_addon_rules (par_package_id, par_product_id, par_rule) VALUES ?", [
        rules.map((rule) => [packageId, rule.product_id, rule.rule]),
    ]);
}

async function insertItems(conn, packageId, items) {
    for (const [index, item] of items.entries()) {
        await conn.query(
            `INSERT INTO tb_product_package_items
                (pki_package_id, pki_order, pki_type, pki_product_id, pki_description, pki_quantity, pki_unit, pki_unit_price)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                packageId,
                index + 1,
                item.pki_type,
                item.pki_product_id,
                item.pki_description,
                item.pki_quantity,
                item.pki_unit,
                item.pki_unit_price,
            ],
        );
    }
}

/**
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {object} productPackage ผ่าน productPackageSchema แล้ว
 */
async function createPackage(conn, productPackage) {
    await assertCategoryExists(conn, productPackage.pkg_category_id, "pkg_category_id");
    await assertProductsExist(conn, productPackage.items);

    const packageId = await generateDailyId("tb_product_packages", "pkg_id", "PKG");
    await conn.query(
        "INSERT INTO tb_product_packages (pkg_id, pkg_name, pkg_description, pkg_category_id, pkg_status, pkg_is_public) VALUES (?, ?, ?, ?, ?, ?)",
        [
            packageId,
            productPackage.pkg_name,
            productPackage.pkg_description,
            productPackage.pkg_category_id,
            productPackage.pkg_status,
            productPackage.pkg_is_public ? 1 : 0,
        ],
    );
    await insertItems(conn, packageId, productPackage.items);
    await saveAddonRules(conn, packageId, productPackage.addon_rules);
    return { pkg_id: packageId };
}

/**
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {string} packageId
 * @param {object} productPackage ผ่าน productPackageSchema แล้ว
 */
async function updatePackage(conn, packageId, productPackage) {
    // ล็อกแถวชุดรายการ — สองคนบันทึกพร้อมกัน คนหลังรอ แล้วได้แถวของคนหลังครบทั้งชุด ไม่ปนกัน
    const [[existing]] = await conn.query("SELECT pkg_id FROM tb_product_packages WHERE pkg_id = ? FOR UPDATE", [
        packageId,
    ]);
    if (!existing) {
        throw new AppError(404, "PACKAGE_NOT_FOUND", "ไม่พบชุดรายการนี้ อาจถูกลบไปแล้ว กรุณาโหลดหน้าใหม่");
    }
    await assertCategoryExists(conn, productPackage.pkg_category_id, "pkg_category_id");
    await assertProductsExist(conn, productPackage.items);

    await conn.query(
        "UPDATE tb_product_packages SET pkg_name = ?, pkg_description = ?, pkg_category_id = ?, pkg_status = ?, pkg_is_public = ? WHERE pkg_id = ?",
        [
            productPackage.pkg_name,
            productPackage.pkg_description,
            productPackage.pkg_category_id,
            productPackage.pkg_status,
            productPackage.pkg_is_public ? 1 : 0,
            packageId,
        ],
    );
    await conn.query("DELETE FROM tb_product_package_items WHERE pki_package_id = ?", [packageId]);
    await insertItems(conn, packageId, productPackage.items);
    await saveAddonRules(conn, packageId, productPackage.addon_rules);
    return { pkg_id: packageId };
}

/**
 * ลบได้เสมอ — รายการในใบเสนอราคาที่เคยมาจากชุดนี้แค่ไม่รู้ว่ามาจากชุดไหน (foreign key ตั้ง SET NULL)
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {string} packageId
 */
async function deletePackage(conn, packageId) {
    // ลิงก์ที่ล็อกชุดนี้ไว้ให้ลูกค้า ลบชุดไม่ได้ (ลูกค้าจะได้คำขอที่ขาดรายการ)
    const [[{ linkCount }]] = await conn.query("SELECT COUNT(DISTINCT oli_link_id) AS linkCount FROM tb_order_link_items WHERE oli_package_id = ?", [packageId]);
    if (linkCount > 0) {
        throw new AppError(409, "PACKAGE_IN_USE", `ลบชุดนี้ไม่ได้ เพราะลิงก์เลือกบริการ ${linkCount} ลิงก์ล็อกชุดนี้ไว้ให้ลูกค้า · เอาออกจากลิงก์ หรือปิดใช้งานชุดแทน`);
    }
    const [result] = await conn.query("DELETE FROM tb_product_packages WHERE pkg_id = ?", [packageId]);
    if (result.affectedRows === 0) {
        throw new AppError(404, "PACKAGE_NOT_FOUND", "ไม่พบชุดรายการนี้ อาจถูกลบไปแล้ว กรุณาโหลดหน้าใหม่");
    }
}

module.exports = { listPackages, findPackage, createPackage, updatePackage, deletePackage };
