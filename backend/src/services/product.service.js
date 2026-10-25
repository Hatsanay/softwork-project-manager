// สินค้า/บริการ และหมวดหมู่ (2026-10-13 ขั้น 1A-1d — docs/plans/2026-10-08-sales-cycle.md หัวข้อ 1, 4.1)
//
// ราคาตั้งต้นเป็นบาทเสมอ · เอกสารเก็บสำเนาของรายการไว้เอง แก้สินค้าทีหลังเอกสารเก่าไม่เปลี่ยน
// สินค้าที่เคยใช้ในใบเสนอราคาหรือชุดรายการลบไม่ได้ ให้ปิดใช้งานแทน · ลบหมวด = สินค้า/ชุดในหมวดนั้นกลายเป็นไม่มีหมวด
const { AppError } = require("../utils/app-error");
const { generateDailyId } = require("../utils/generateDailyId");

const MAX_LIST_LIMIT = 200;

// ─── สินค้า/บริการ ──────────────────────────────────────────────────────────────────────────

const PRODUCT_COLUMNS = `
    p.product_id, p.product_code, p.product_name, p.product_description, p.product_unit, p.product_price,
    p.product_category_id, c.pc_name AS category_name, p.product_status, p.product_is_public, p.product_image_url,
    p.product_price_mode, p.product_percent,
    p.product_created_at, p.product_updated_at`;

/**
 * ค้นหาจากชื่อ รหัส หรือรายละเอียด · สูงสุด 200 แถวต่อครั้ง (ช่องค้นหาในใบเสนอราคาเรียกทุกครั้งที่พิมพ์)
 * @param {import("mysql2/promise").Pool} conn
 * @param {{ limit?: number, offset?: number, search?: string, categoryId?: string, status?: string }} options
 */
async function listProducts(conn, { limit = 20, offset = 0, search = "", categoryId, status }) {
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), MAX_LIST_LIMIT);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const like = `%${search}%`;

    const conditions = ["(p.product_name LIKE ? OR p.product_code LIKE ? OR p.product_description LIKE ?)"];
    const params = [like, like, like];
    if (categoryId === "none") {
        conditions.push("p.product_category_id IS NULL");
    } else if (categoryId) {
        conditions.push("p.product_category_id = ?");
        params.push(categoryId);
    }
    if (status === "active" || status === "inactive") {
        conditions.push("p.product_status = ?");
        params.push(status);
    }
    const where = conditions.join(" AND ");

    const [rows] = await conn.query(
        `SELECT ${PRODUCT_COLUMNS}
         FROM tb_products p LEFT JOIN tb_product_categories c ON c.pc_id = p.product_category_id
         WHERE ${where}
         ORDER BY p.product_status = 'active' DESC, p.product_name
         LIMIT ? OFFSET ?`,
        [...params, safeLimit, safeOffset],
    );
    const [[{ total }]] = await conn.query(`SELECT COUNT(*) AS total FROM tb_products p WHERE ${where}`, params);
    return { data: rows, total };
}

/**
 * @param {import("mysql2/promise").Pool | import("mysql2/promise").PoolConnection} conn
 * @param {string} productId
 */
async function findProduct(conn, productId) {
    const [[product]] = await conn.query(
        `SELECT ${PRODUCT_COLUMNS}
         FROM tb_products p LEFT JOIN tb_product_categories c ON c.pc_id = p.product_category_id
         WHERE p.product_id = ?`,
        [productId],
    );
    if (!product) {
        throw new AppError(404, "PRODUCT_NOT_FOUND", "ไม่พบสินค้านี้ อาจถูกลบไปแล้ว กรุณาโหลดหน้าใหม่");
    }
    return product;
}

async function assertCategoryExists(conn, categoryId, field) {
    if (!categoryId) return;
    const [[category]] = await conn.query("SELECT 1 FROM tb_product_categories WHERE pc_id = ?", [categoryId]);
    if (!category) {
        throw new AppError(400, "VALIDATION", "ไม่พบหมวดที่เลือก อาจถูกลบไปแล้ว กรุณาเลือกใหม่", {
            [field]: "ไม่พบหมวดนี้",
        });
    }
}

// รหัสสินค้าไม่บังคับ แต่ถ้ามีต้องไม่ซ้ำ — บอกว่าซ้ำกับสินค้าไหน
async function assertCodeAvailable(conn, productCode, exceptProductId) {
    if (!productCode) return;
    const [[sameCode]] = await conn.query(
        "SELECT product_id, product_name FROM tb_products WHERE product_code = ? AND product_id <> ?",
        [productCode, exceptProductId ?? ""],
    );
    if (sameCode) {
        throw new AppError(409, "PRODUCT_CODE_EXISTS", `รหัส ${productCode} ถูกใช้แล้วกับ "${sameCode.product_name}"`, {
            product_code: "รหัสนี้ถูกใช้แล้ว",
        });
    }
}

function productValues(product) {
    return [
        product.product_code,
        product.product_name,
        product.product_description,
        product.product_unit,
        product.product_price,
        product.product_category_id,
        product.product_status,
        product.product_is_public ? 1 : 0,
        product.product_price_mode,
        product.product_percent,
    ];
}

/** สินค้าแบบ % อยู่ในชุดรายการไม่ได้ (ราคาชุด = ผลรวมราคาแถว คิดเป็น % ไม่ได้) */
async function assertNotInPackage(conn, productId) {
    const [[used]] = await conn.query(
        "SELECT k.pkg_name FROM tb_product_package_items i JOIN tb_product_packages k ON k.pkg_id = i.pki_package_id WHERE i.pki_product_id = ? LIMIT 1",
        [productId],
    );
    if (used) {
        throw new AppError(400, "VALIDATION", "สินค้านี้อยู่ในชุดรายการ จึงคิดเป็น % ไม่ได้", {
            product_price_mode: `อยู่ในชุด "${used.pkg_name}" · เอาออกจากชุดก่อน หรือใช้ราคาตายตัว`,
        });
    }
}

/**
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {object} product ผ่าน productSchema แล้ว
 */
async function createProduct(conn, product) {
    await assertCategoryExists(conn, product.product_category_id, "product_category_id");
    await assertCodeAvailable(conn, product.product_code, null);

    const productId = await generateDailyId("tb_products", "product_id", "PRD");
    await conn.query(
        `INSERT INTO tb_products
            (product_id, product_code, product_name, product_description, product_unit, product_price, product_category_id, product_status,
             product_is_public, product_price_mode, product_percent)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [productId, ...productValues(product)],
    );
    return findProduct(conn, productId);
}

/**
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {string} productId
 * @param {object} product ผ่าน productSchema แล้ว
 */
async function updateProduct(conn, productId, product) {
    await findProduct(conn, productId);
    if (product.product_price_mode === "percent") await assertNotInPackage(conn, productId);
    await assertCategoryExists(conn, product.product_category_id, "product_category_id");
    await assertCodeAvailable(conn, product.product_code, productId);

    await conn.query(
        `UPDATE tb_products SET
            product_code = ?, product_name = ?, product_description = ?, product_unit = ?, product_price = ?,
            product_category_id = ?, product_status = ?, product_is_public = ?, product_price_mode = ?, product_percent = ?
         WHERE product_id = ?`,
        [...productValues(product), productId],
    );
    return findProduct(conn, productId);
}

/**
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {string} productId
 */
async function deleteProduct(conn, productId) {
    await findProduct(conn, productId);

    const [[{ quotationCount }]] = await conn.query(
        "SELECT COUNT(DISTINCT qti_quotation_id) AS quotationCount FROM tb_quotation_items WHERE qti_product_id = ?",
        [productId],
    );
    const [[{ packageCount }]] = await conn.query(
        "SELECT COUNT(DISTINCT pki_package_id) AS packageCount FROM tb_product_package_items WHERE pki_product_id = ?",
        [productId],
    );
    const usages = [];
    if (quotationCount > 0) usages.push(`ใบเสนอราคา ${quotationCount} ใบ`);
    if (packageCount > 0) usages.push(`ชุดรายการ ${packageCount} ชุด`);
    const [[{ linkCount }]] = await conn.query("SELECT COUNT(DISTINCT oli_link_id) AS linkCount FROM tb_order_link_items WHERE oli_product_id = ?", [productId]);
    if (linkCount > 0) usages.push(`ลิงก์เลือกบริการ ${linkCount} ลิงก์ (รายการที่ทีมเลือกให้)`);
    if (usages.length > 0) {
        throw new AppError(
            409,
            "PRODUCT_IN_USE",
            `ลบสินค้านี้ไม่ได้ เพราะใช้อยู่ใน${usages.join(" และ ")} — ถ้าไม่ขายแล้วให้แก้ไขแล้วเปลี่ยนเป็นปิดใช้งาน (เลือกในใบใหม่ไม่ได้ แต่เอกสารเก่ายังแสดงได้)`,
        );
    }

    await conn.query("DELETE FROM tb_products WHERE product_id = ?", [productId]);
}

// ─── หมวดหมู่ ────────────────────────────────────────────────────────────────────────────────

/**
 * หมวดทั้งหมด พร้อมจำนวนสินค้าในหมวด
 * @param {import("mysql2/promise").Pool | import("mysql2/promise").PoolConnection} conn
 */
async function listCategories(conn) {
    const [rows] = await conn.query(
        `SELECT c.pc_id, c.pc_name, c.pc_sort_order, c.pc_status, c.pc_is_single_choice,
                (SELECT COUNT(*) FROM tb_products p WHERE p.product_category_id = c.pc_id) AS product_count
         FROM tb_product_categories c
         ORDER BY c.pc_sort_order, c.pc_name`,
    );
    return rows;
}

async function assertCategoryNameAvailable(conn, categoryName, exceptCategoryId) {
    const [[sameName]] = await conn.query("SELECT 1 FROM tb_product_categories WHERE pc_name = ? AND pc_id <> ?", [
        categoryName,
        exceptCategoryId ?? "",
    ]);
    if (sameName) {
        throw new AppError(409, "CATEGORY_NAME_EXISTS", `มีหมวด "${categoryName}" อยู่แล้ว`, {
            pc_name: "ชื่อหมวดนี้ถูกใช้แล้ว",
        });
    }
}

/**
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {object} category ผ่าน productCategorySchema แล้ว
 */
async function createCategory(conn, category) {
    await assertCategoryNameAvailable(conn, category.pc_name, null);
    const categoryId = await generateDailyId("tb_product_categories", "pc_id", "PCA");
    await conn.query(
        "INSERT INTO tb_product_categories (pc_id, pc_name, pc_sort_order, pc_status, pc_is_single_choice) VALUES (?, ?, ?, ?, ?)",
        [categoryId, category.pc_name, category.pc_sort_order, category.pc_status, category.pc_is_single_choice ? 1 : 0],
    );
    return { pc_id: categoryId };
}

/**
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {string} categoryId
 * @param {object} category ผ่าน productCategorySchema แล้ว
 */
async function updateCategory(conn, categoryId, category) {
    const [result] = await conn.query("SELECT 1 FROM tb_product_categories WHERE pc_id = ? FOR UPDATE", [categoryId]);
    if (result.length === 0) {
        throw new AppError(404, "CATEGORY_NOT_FOUND", "ไม่พบหมวดนี้ อาจถูกลบไปแล้ว กรุณาโหลดหน้าใหม่");
    }
    await assertCategoryNameAvailable(conn, category.pc_name, categoryId);
    await conn.query("UPDATE tb_product_categories SET pc_name = ?, pc_sort_order = ?, pc_status = ?, pc_is_single_choice = ? WHERE pc_id = ?", [
        category.pc_name,
        category.pc_sort_order,
        category.pc_status,
        category.pc_is_single_choice ? 1 : 0,
        categoryId,
    ]);
    return { pc_id: categoryId };
}

/**
 * ลบหมวดได้เสมอ — สินค้าและชุดรายการในหมวดนั้นกลายเป็น "ไม่มีหมวด" (foreign key ตั้ง SET NULL ไว้)
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {string} categoryId
 */
async function deleteCategory(conn, categoryId) {
    const [result] = await conn.query("DELETE FROM tb_product_categories WHERE pc_id = ?", [categoryId]);
    if (result.affectedRows === 0) {
        throw new AppError(404, "CATEGORY_NOT_FOUND", "ไม่พบหมวดนี้ อาจถูกลบไปแล้ว กรุณาโหลดหน้าใหม่");
    }
}

module.exports = {
    listProducts,
    findProduct,
    createProduct,
    updateProduct,
    deleteProduct,
    listCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    assertCategoryExists,
};
