// ตัวคิดราคา (2026-11-01 · docs/plans/2026-11-01-calculator-direct-quotation.md)
// หน้าเดียว 2 โหมด: ลูกค้าตรง (ออกใบเสนอราคาจากตะกร้า) · Fastwork (ราคาเสนอ/ค่าธรรมเนียม/เงินเข้า แบบเดิม)
// ใบที่ออกจากตะกร้า = ร่าง (Q3 ก) ให้ทีมตรวจแล้วส่งอนุมัติตามขั้นตอนเดิม · จ่ายครั้งเดียว (Q4 ก) แก้เป็นแบ่งงวดในใบได้
// ราคาในใบ = ราคาปัจจุบันของสินค้า/ชุด · ราคาเริ่มต้นใช้ราคาที่ทีมกรอก · ราคาตั้งต้นของแถว = ราคาสินค้า (กติกาขายต่ำกว่าราคาของใบทำงานตามเดิม)
const { AppError } = require("../utils/app-error");
const { validate } = require("../utils/validate");
const { formatHundredths } = require("../shared/money.mjs");
const { fixedSubtotal, multiplyQuantity, percentAmount } = require("../shared/order-cart-math.mjs");
const { quotationDraftSchema } = require("../shared/schemas/quotation.mjs");
const quotationService = require("./quotation.service");

function validationError(fields, message = "ข้อมูลบางช่องใช้ไม่ได้ กรุณาแก้ตามข้อความใต้ช่อง") {
    return new AppError(400, "VALIDATION", message, fields);
}

/** แค็ตตาล็อกของตัวคิดราคา: ทุกสินค้า/ชุดที่เปิดใช้งาน (รวมที่ไม่อยู่บนหน้าร้าน) + อัตรา VAT วันนี้ + ชุดคำถาม */
async function catalog(conn) {
    return require("./order-public.service").internalCatalog(conn);
}

/** โปรเจกต์ที่ยังไม่ปิดของลูกค้า (เลือกผูกตอนออกใบ · จ้างเพิ่มในงานเดิม) */
async function clientProjects(conn, clientId) {
    const [rows] = await conn.query(
        `SELECT project_id, project_name, project_status FROM tb_projects
         WHERE client_id = ? AND project_status NOT IN ('completed', 'cancelled')
         ORDER BY project_created_at DESC LIMIT 50`,
        [clientId],
    );
    return rows;
}

/** ราคาเริ่มต้นที่ทีมกรอก หรือราคาของแถว */
const priceOf = (startingPrices, productId, isStartingPrice, fallback) =>
    isStartingPrice && productId && startingPrices[productId] !== undefined ? startingPrices[productId] : fallback;

/**
 * แถวของใบเสนอราคาจากตะกร้า: ชุดก่อน (หัวข้อ + รายการในชุด) แล้วสินค้าเดี่ยว · งานเพิ่มแบบ % คิดจากยอดรายการอื่นตอนออก (ใบไม่มีแถว %)
 * รายการที่ปิดใช้งาน/ลบไปแล้ว = 409 ให้โหลดหน้าใหม่
 */
function itemsFromCart(cartCatalog, lines, startingPrices) {
    const productsById = new Map(cartCatalog.products.map((row) => [row.product_id, row]));
    const packagesById = new Map(cartCatalog.packages.map((row) => [row.pkg_id, row]));
    const packageItems = [];
    const productItems = [];
    const percentProducts = [];
    for (const line of lines) {
        if (line.kind === "package") {
            const productPackage = packagesById.get(line.id);
            if (!productPackage) throw new AppError(409, "CART_ITEM_UNAVAILABLE", "บางรายการในตะกร้าปิดใช้งานหรือถูกลบแล้ว กรุณาโหลดหน้าใหม่");
            packageItems.push({ qti_type: "heading", qti_package_id: productPackage.pkg_id, qti_description: productPackage.pkg_name });
            for (const item of productPackage.items) {
                packageItems.push({
                    qti_type: "item",
                    qti_product_id: item.product_id,
                    qti_package_id: productPackage.pkg_id,
                    qti_description: item.name,
                    qti_quantity: multiplyQuantity(item.quantity, String(line.quantity)),
                    qti_unit: item.unit,
                    qti_unit_price: priceOf(startingPrices, item.product_id, item.needs_price, item.unit_price),
                    qti_list_price: item.product_id ? item.unit_price : null,
                });
            }
            continue;
        }
        const product = productsById.get(line.id);
        if (!product) throw new AppError(409, "CART_ITEM_UNAVAILABLE", "บางรายการในตะกร้าปิดใช้งานหรือถูกลบแล้ว กรุณาโหลดหน้าใหม่");
        if (product.product_price_mode === "percent") {
            percentProducts.push(product);
            continue;
        }
        productItems.push({
            qti_type: "item",
            qti_product_id: product.product_id,
            qti_description: product.product_name,
            qti_quantity: String(line.quantity),
            qti_unit: product.product_unit,
            qti_unit_price: priceOf(startingPrices, product.product_id, product.product_price_mode === "from", product.product_price),
            qti_list_price: product.product_price,
        });
    }
    const priced = [...packageItems, ...productItems].filter((item) => item.qti_type === "item");
    const base = fixedSubtotal(priced.map((item) => ({ unitPrice: item.qti_unit_price, quantity: item.qti_quantity })));
    const percentItems = percentProducts.map((product) => ({
        qti_type: "item",
        qti_product_id: product.product_id,
        qti_description: `${product.product_name} (+${Number(product.product_percent)}% ของยอดรายการอื่น)`,
        qti_quantity: "1",
        qti_unit: product.product_unit,
        qti_unit_price: formatHundredths(percentAmount(base, product.product_percent)),
    }));
    return [...packageItems, ...productItems, ...percentItems];
}

/**
 * ออกร่างใบเสนอราคาจากตะกร้า · ลูกค้าใหม่จากชื่อ = สร้างลูกค้าบุคคล (ธุรกรรมเดียวกับใบ)
 * @returns {Promise<{ qt_id: string, client_id: string }>}
 */
async function createQuotationFromCart(conn, actor, input) {
    let clientId = input.client_id;
    if (clientId) {
        const [[client]] = await conn.query("SELECT client_id FROM tb_clients WHERE client_id = ? AND client_status = 'active'", [clientId]);
        if (!client) throw validationError({ client_id: "ไม่พบลูกค้านี้หรือปิดใช้งานแล้ว เลือกใหม่หรือพิมพ์ชื่อลูกค้า" });
        if (input.project_id) {
            const [[project]] = await conn.query(
                "SELECT client_id, project_status FROM tb_projects WHERE project_id = ?",
                [input.project_id],
            );
            if (!project || project.client_id !== clientId || ["completed", "cancelled"].includes(project.project_status)) {
                throw validationError({ project_id: "เลือกได้เฉพาะโปรเจกต์ที่ยังไม่ปิดของลูกค้ารายนี้" });
            }
        }
    } else {
        clientId = await require("./fastwork.service").resolveClient(conn, { client_id: null, client_name: input.client_name });
    }
    const cartCatalog = await require("./order-public.service").loadCatalog(conn, null, { includeHidden: true });
    const items = itemsFromCart(cartCatalog, input.lines, input.starting_prices);
    const [[branch]] = await conn.query(
        "SELECT branch_id FROM tb_branches WHERE branch_status = 'active' ORDER BY branch_code = '00000' DESC, branch_code LIMIT 1",
    );
    if (!branch) throw new AppError(409, "NO_BRANCH", "ยังไม่มีสาขาที่ใช้งานในตั้งค่าบริษัท");
    const [[company]] = await conn.query("SELECT cs_quotation_terms_th, cs_quotation_valid_days FROM tb_company_settings LIMIT 1");
    const draft = validate(quotationDraftSchema, {
        qt_client_id: clientId,
        qt_branch_id: branch.branch_id,
        qt_project_id: input.client_id ? input.project_id : null,
        qt_title: input.qt_title,
        qt_payment_mode: "single",
        qt_valid_days: company?.cs_quotation_valid_days ?? 30,
        qt_terms: company?.cs_quotation_terms_th ?? null,
        qt_internal_note: "ออกจากตัวคิดราคา",
        milestones: [],
        items,
    });
    const { qt_id: quotationId } = await quotationService.createDraft(conn, draft, actor);
    return { qt_id: quotationId, client_id: clientId };
}

module.exports = { catalog, clientProjects, createQuotationFromCart, itemsFromCart };
