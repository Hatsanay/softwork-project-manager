// หน้าร้านของลิงก์เลือกบริการ ฝั่งลูกค้า (2026-10-25 · S-1 · docs/plans/2026-10-25-client-order-link.md ข้อ 3, 5)
//
// ไม่ต้อง login · เปิดด้วย token 32 ตัว หรือรหัสสั้น 8 ตัว · ข้อมูลที่ส่งออกไปเป็นของหน้าร้านเท่านั้น (ไม่มีโน้ต/เหตุผลภายใน)
// ราคาคิดใหม่จากฐานข้อมูลตอนส่งเสมอ (ไม่เชื่อราคาจากหน้าเว็บ) · ยอดต่างจากที่ลูกค้าเห็น = ให้ดูยอดใหม่ก่อน (ไม่เปลี่ยนเงียบๆ)
const crypto = require("crypto");
const { AppError } = require("../utils/app-error");
const { nowBangkokText, todayBangkok } = require("../utils/bangkok-time");
const { generateDailyId } = require("../utils/generateDailyId");
const { validate } = require("../utils/validate");
const { formatHundredths, parseHundredths } = require("../shared/money.mjs");
const { cartTotals, multiplyQuantity, fixedSubtotal, percentAmount } = require("../shared/order-cart-math.mjs");
const { orderContactSchema } = require("../shared/schemas/order-link.mjs");
const {
    visibleQuestionnaire,
    answerError,
    storedAnswer,
    storedOtherText,
    answerText,
    maxFileBytesOf,
    MAX_TOTAL_FILE_BYTES,
} = require("../shared/requirement-answers.mjs");
const { cleanUploadedFileName, detectFileType, isViewableFile, savePrivateFile } = require("../utils/private-file");
const { findCompany, findVatRateOn } = require("./company.service");
const requirementService = require("./requirement.service");
const { acceptQuotation } = require("./quotation-accept.service");
const { openStateOf } = require("./order-link.service");
const { readSignatureFile } = require("./signature.service");

const COMPANY_ROW_ID = 1;
// ลิงก์หนึ่งรับคำขอได้ไม่เกินเท่านี้ต่อชั่วโมง (กันสแปมลิงก์สาธารณะ)
const MAX_REQUESTS_PER_HOUR = 20;
const text = (hundredths) => formatHundredths(hundredths);

const LINK_NOT_FOUND = () => new AppError(404, "ORDER_LINK_NOT_FOUND", "ไม่พบลิงก์นี้ ตรวจที่อยู่อีกครั้ง หรือขอลิงก์ใหม่จากทีมงาน");

async function findShop(conn) {
    const [[shop]] = await conn.query(
        `SELECT cs_name_th AS name, cs_logo_url AS logo_url, DATE_FORMAT(cs_vat_registered_from, '%Y-%m-%d') AS vat_registered_from
         FROM tb_company_settings WHERE cs_id = ?`,
        [COMPANY_ROW_ID],
    );
    return shop;
}

/** หาลิงก์จาก token (32) หรือรหัสสั้น (8) · forUpdate = ล็อกตอนส่งคำขอ */
async function findLinkByCode(conn, code, { forUpdate = false } = {}) {
    const value = String(code ?? "").trim();
    const column = value.length === 32 ? "ol_token" : value.length === 8 ? "ol_short_code" : null;
    if (!column) throw LINK_NOT_FOUND();
    const [[link]] = await conn.query(
        `SELECT l.ol_id, l.ol_kind, l.ol_name, l.ol_client_id, l.ol_project_id, l.ol_buyer_name, l.ol_assignee_id,
                DATE_FORMAT(l.ol_expires_on, '%Y-%m-%d') AS ol_expires_on, l.ol_status, l.ol_allow_more, p.project_status, p.client_id AS project_client_id
         FROM tb_order_links l LEFT JOIN tb_projects p ON p.project_id = l.ol_project_id
         WHERE l.${column} = ? ${forUpdate ? "FOR UPDATE OF l" : ""}`,
        [column === "ol_short_code" ? value.toUpperCase() : value.toLowerCase()],
    );
    if (!link) throw LINK_NOT_FOUND();
    return link;
}

/** อัตรา VAT ที่ลูกค้าเห็นวันนี้ · ยังไม่จด VAT = null (ไม่แสดงบรรทัด VAT) */
async function vatRateToday(conn, shop) {
    const today = todayBangkok();
    if (!shop.vat_registered_from || shop.vat_registered_from > today) return null;
    return findVatRateOn(conn, today);
}

const PRODUCT_COLUMNS = `p.product_id, p.product_name, p.product_description, p.product_unit, p.product_price, p.product_image_url,
    p.product_category_id, p.product_price_mode, p.product_percent`;

/**
 * ใส่แถวในชุด + กติกางานเพิ่มของชุด · ชุดที่มีสินค้าข้างในถูกปิดใช้งาน = ใช้ไม่ได้ (ราคาไม่ครบ) ไม่คืนมา
 * ราคาในชุด: แถวที่อ้างสินค้าใช้ราคาปัจจุบันของสินค้า · แถวที่ไม่อ้างใช้ราคาของแถวเอง (กติกาเดียวกับตอนดึงชุดเข้าใบเสนอราคา)
 */
async function attachPackageItems(conn, packages) {
    const packageIds = packages.map((row) => row.pkg_id);
    if (packageIds.length === 0) return [];
    const [itemRows] = await conn.query(
        `SELECT i.pki_package_id, i.pki_order, i.pki_product_id, i.pki_description, i.pki_quantity, i.pki_unit, i.pki_unit_price,
                p.product_status, p.product_price, p.product_unit
         FROM tb_product_package_items i LEFT JOIN tb_products p ON p.product_id = i.pki_product_id
         WHERE i.pki_package_id IN (?) AND i.pki_type = 'item'
         ORDER BY i.pki_package_id, i.pki_order`,
        [packageIds],
    );
    const [ruleRows] = await conn.query("SELECT par_package_id, par_product_id, par_rule FROM tb_package_addon_rules WHERE par_package_id IN (?)", [packageIds]);
    const itemsByPackage = new Map();
    const brokenPackages = new Set();
    for (const row of itemRows) {
        if (row.pki_product_id && row.product_status !== "active") brokenPackages.add(row.pki_package_id);
        const list = itemsByPackage.get(row.pki_package_id) ?? [];
        list.push({
            product_id: row.pki_product_id,
            name: row.pki_description,
            unit: row.pki_unit ?? row.product_unit,
            quantity: row.pki_quantity,
            unit_price: row.pki_product_id ? row.product_price : row.pki_unit_price,
        });
        itemsByPackage.set(row.pki_package_id, list);
    }
    return packages
        .filter((row) => !brokenPackages.has(row.pkg_id) && itemsByPackage.has(row.pkg_id))
        .map((row) => ({
            ...row,
            items: itemsByPackage.get(row.pkg_id),
            addon_rules: ruleRows.filter((rule) => rule.par_package_id === row.pkg_id).map((rule) => ({ product_id: rule.par_product_id, rule: rule.par_rule })),
        }));
}

/**
 * สินค้า/ชุดที่ลูกค้าเลือกเองได้ในลิงก์นี้ · ชุดที่มีสินค้าข้างในถูกปิดใช้งาน = ไม่แสดงทั้งชุด
 * linkId ว่าง = ทุกหมวด (ตัวคิดราคาภายใน) · excludeKeys = รายการที่ทีมเลือกให้แล้ว ("p:<id>" / "k:<id>") ไม่แสดงซ้ำ
 */
async function loadCatalog(conn, linkId, { excludeKeys = new Set() } = {}) {
    const [scopeRows] = await conn.query("SELECT olc_category_id FROM tb_order_link_categories WHERE olc_link_id = ?", [linkId]);
    const scope = scopeRows.map((row) => row.olc_category_id);
    const inScope = (alias) => (scope.length > 0 ? `AND ${alias} IN (?)` : "");
    const scopeParams = scope.length > 0 ? [scope] : [];

    const [categories] = await conn.query(
        `SELECT pc_id, pc_name, pc_is_single_choice FROM tb_product_categories WHERE pc_status = 'active' ${inScope("pc_id")} ORDER BY pc_sort_order, pc_name`,
        scopeParams,
    );
    const [products] = await conn.query(
        `SELECT ${PRODUCT_COLUMNS}
         FROM tb_products p LEFT JOIN tb_product_categories c ON c.pc_id = p.product_category_id
         WHERE p.product_status = 'active' AND p.product_is_public = 1
           AND (p.product_category_id IS NULL OR c.pc_status = 'active') ${inScope("p.product_category_id")}
         ORDER BY p.product_name`,
        scopeParams,
    );
    const [packages] = await conn.query(
        `SELECT g.pkg_id, g.pkg_name, g.pkg_description, g.pkg_image_url, g.pkg_category_id
         FROM tb_product_packages g LEFT JOIN tb_product_categories c ON c.pc_id = g.pkg_category_id
         WHERE g.pkg_status = 'active' AND g.pkg_is_public = 1
           AND (g.pkg_category_id IS NULL OR c.pc_status = 'active') ${inScope("g.pkg_category_id")}
         ORDER BY g.pkg_name`,
        scopeParams,
    );
    return {
        categories: categories.map((row) => ({ ...row, pc_is_single_choice: Boolean(row.pc_is_single_choice) })),
        products: products.filter((row) => !excludeKeys.has(`p:${row.product_id}`)),
        packages: (await attachPackageItems(conn, packages)).filter((row) => !excludeKeys.has(`k:${row.pkg_id}`)),
    };
}

/**
 * รายการที่ทีมเลือกให้ (ล็อก) · ราคาปัจจุบัน · ไม่ต้องเปิดหน้าร้าน (ทีมเลือกเอง) แต่ต้องยังใช้งานได้
 * problem = มีรายการที่ถูกลบ/ปิดใช้งาน → ลิงก์ส่งคำขอไม่ได้จนกว่าทีมแก้ลิงก์
 * @returns {Promise<{ items: { kind: "product" | "package", quantity: number, product?: object, package?: object }[], problem: boolean }>}
 */
async function loadPreset(conn, linkId) {
    const [rows] = await conn.query("SELECT oli_product_id, oli_package_id, oli_quantity FROM tb_order_link_items WHERE oli_link_id = ? ORDER BY oli_order", [linkId]);
    if (rows.length === 0) return { items: [], problem: false };
    const productIds = rows.map((row) => row.oli_product_id).filter(Boolean);
    const packageIds = rows.map((row) => row.oli_package_id).filter(Boolean);
    const [products] = productIds.length
        ? await conn.query(`SELECT ${PRODUCT_COLUMNS} FROM tb_products p WHERE p.product_id IN (?) AND p.product_status = 'active'`, [productIds])
        : [[]];
    const [packages] = packageIds.length
        ? await conn.query(
              "SELECT pkg_id, pkg_name, pkg_description, pkg_image_url, pkg_category_id FROM tb_product_packages WHERE pkg_id IN (?) AND pkg_status = 'active'",
              [packageIds],
          )
        : [[]];
    const productsById = new Map(products.map((row) => [row.product_id, row]));
    const packagesById = new Map((await attachPackageItems(conn, packages)).map((row) => [row.pkg_id, row]));
    const items = [];
    let problem = false;
    for (const row of rows) {
        if (row.oli_product_id) {
            const product = productsById.get(row.oli_product_id);
            if (product) items.push({ kind: "product", quantity: row.oli_quantity, product });
            else problem = true;
            continue;
        }
        const productPackage = packagesById.get(row.oli_package_id);
        if (productPackage) items.push({ kind: "package", quantity: row.oli_quantity, package: productPackage });
        else problem = true;
    }
    return { items, problem };
}

const presetKeyOf = (item) => (item.kind === "product" ? `p:${item.product.product_id}` : `k:${item.package.pkg_id}`);

/** ข้อมูลติดต่อที่เติมให้ (ลิงก์เฉพาะลูกค้าที่ผูกลูกค้าเดิม) */
async function prefillOf(conn, link) {
    if (link.ol_kind !== "personal" || !link.ol_client_id) return null;
    const [[client]] = await conn.query(
        `SELECT client_name, client_type, client_contact_name, client_phone, client_email, client_tax_id, client_address
         FROM tb_clients WHERE client_id = ?`,
        [link.ol_client_id],
    );
    if (!client) return null;
    const isCompany = client.client_type === "juristic";
    return {
        contact_name: client.client_contact_name || client.client_name,
        contact_phone: client.client_phone ?? "",
        contact_email: client.client_email ?? "",
        company_name: isCompany ? client.client_name : "",
        wants_tax_invoice: isCompany && Boolean(client.client_tax_id),
        tax_id: client.client_tax_id ?? "",
        address: client.client_address ?? "",
    };
}

/** หน้าร้าน (GET) · ลิงก์ปิด/หมดอายุ = บอกชื่อร้านและเหตุผล · ลิงก์รายคนที่ส่งแล้ว = บอก token หน้าสถานะ */
async function shop(conn, code) {
    const link = await findLinkByCode(conn, code);
    const shopInfo = await findShop(conn);
    const state = openStateOf(link, todayBangkok());
    const base = { shop: { name: shopInfo.name, logo_url: shopInfo.logo_url }, link: { kind: link.ol_kind, state } };
    if (state !== "open") return base;
    if (link.ol_kind === "personal") {
        const [[sent]] = await conn.query("SELECT svr_access_token FROM tb_service_requests WHERE svr_link_id = ? LIMIT 1", [link.ol_id]);
        if (sent) return { ...base, submitted_token: sent.svr_access_token };
    }
    const preset = await loadPreset(conn, link.ol_id);
    // รายการที่ทีมเลือกให้ใช้ไม่ได้แล้ว → ห้ามส่ง (คำขอจะขาดรายการที่ตกลงกันไว้)
    if (preset.problem) return { ...base, link: { ...base.link, state: "unavailable" } };
    const catalog = await loadCatalog(conn, link.ol_id, { excludeKeys: new Set(preset.items.map(presetKeyOf)) });
    return {
        ...base,
        buyer_name: link.ol_buyer_name,
        vat_rate: await vatRateToday(conn, shopInfo),
        preset: preset.items,
        allow_more: Boolean(link.ol_allow_more),
        catalog: link.ol_allow_more ? catalog : { ...catalog, products: [], packages: [] },
        prefill: await prefillOf(conn, link),
        questionnaire: await requirementService.listGroups(conn, { activeOnly: true }),
        question_rules: await loadLinkQuestionRules(conn, link.ol_id),
        answer_prefill: await answerPrefillOf(conn, link),
    };
}

/**
 * คำตอบเดิมของลูกค้าคนนี้ สำหรับข้อที่เปิด "เติมคำตอบเดิม" (Q-4 · แบบข้อ 8)
 * เฉพาะลิงก์เฉพาะลูกค้าที่ผูกลูกค้าไว้ (ลิงก์สาธารณะไม่รู้ว่าใคร และกันข้อมูลรั่วไปคนอื่น) · ไม่เติมไฟล์ · ใช้คำตอบล่าสุดของแต่ละข้อ
 * @returns {Promise<Record<number, { value: string | string[], other_text: string | null }>>}
 */
async function answerPrefillOf(conn, link) {
    if (link.ol_kind !== "personal" || !link.ol_client_id) return {};
    const [rows] = await conn.query(
        `SELECT a.sva_question_id, a.sva_type, a.sva_value, a.sva_other_text
         FROM tb_service_request_answers a
         JOIN tb_service_requests r ON r.svr_id = a.sva_request_id
         JOIN tb_requirement_questions q ON q.rqq_id = a.sva_question_id
         WHERE r.svr_client_id = ? AND q.rqq_prefill = 1 AND q.rqq_status = 'active' AND q.rqq_type <> 'file' AND a.sva_value IS NOT NULL
         ORDER BY r.svr_submitted_at DESC, a.sva_id DESC`,
        [link.ol_client_id],
    );
    const prefill = {};
    for (const row of rows) {
        if (prefill[row.sva_question_id]) continue;
        prefill[row.sva_question_id] = { value: storedValueToAnswer(row.sva_type, row.sva_value), other_text: row.sva_other_text };
    }
    return prefill;
}

/** ค่าที่เก็บ → รูปคำตอบของหน้าร้าน (เลือกได้หลายข้อเก็บเป็น JSON array) */
function storedValueToAnswer(type, storedValue) {
    if (type !== "multi") return storedValue;
    try {
        return JSON.parse(storedValue);
    } catch {
        return [];
    }
}

/**
 * กลุ่มคำถามที่ลิงก์นี้ถามเพิ่ม / ไม่ถาม (Q-3 · ไม่มีแถว = ตามกติกาปกติ) · หน้าร้านคิดข้อที่ขึ้นด้วยกติกาเดียวกับ backend
 * @returns {Promise<{ include_group_ids: number[], exclude_group_ids: number[] }>}
 */
async function loadLinkQuestionRules(conn, linkId) {
    const [rows] = await conn.query("SELECT olq_group_id, olq_mode FROM tb_order_link_requirement_groups WHERE olq_link_id = ?", [linkId]);
    return {
        include_group_ids: rows.filter((row) => row.olq_mode === "include").map((row) => row.olq_group_id),
        exclude_group_ids: rows.filter((row) => row.olq_mode === "exclude").map((row) => row.olq_group_id),
    };
}

/**
 * สิ่งที่อยู่ในตะกร้า (รายการล็อก + ที่ลูกค้าเลือก) แบบเดียวกัน: ชนิด รหัส ชื่อ หมวด กติกางานเพิ่ม (ชุด)
 * ใช้เลือกกลุ่มคำถาม และตรวจกติกาของตะกร้า
 */
function chosenEntries(preset, catalog, customerItems) {
    const productsById = new Map(catalog.products.map((row) => [row.product_id, row]));
    const packagesById = new Map(catalog.packages.map((row) => [row.pkg_id, row]));
    const entries = preset.items.map((item) =>
        item.kind === "product"
            ? { kind: "product", id: item.product.product_id, name: item.product.product_name, category_id: item.product.product_category_id, is_preset: true }
            : { kind: "package", id: item.package.pkg_id, name: item.package.pkg_name, category_id: item.package.pkg_category_id, addon_rules: item.package.addon_rules, is_preset: true },
    );
    for (const item of customerItems) {
        const product = item.kind === "product" ? productsById.get(item.id) : null;
        const productPackage = item.kind === "package" ? packagesById.get(item.id) : null;
        if (product) entries.push({ kind: "product", id: product.product_id, name: product.product_name, category_id: product.product_category_id, is_preset: false });
        if (productPackage) {
            entries.push({ kind: "package", id: productPackage.pkg_id, name: productPackage.pkg_name, category_id: productPackage.pkg_category_id, addon_rules: productPackage.addon_rules, is_preset: false });
        }
    }
    return entries;
}

/**
 * กติกาของตะกร้า → ข้อความบอกลูกค้า หรือ null
 * - หมวดที่เลือกได้อย่างเดียว (เช่น แพ็กเกจ) มีได้ 1 รายการ
 * - งานเพิ่มที่ลูกค้าเลือกเอง ต้องไม่ "มีในแพ็กแล้ว" หรือ "ใช้กับแพ็กนี้ไม่ได้" ของแพ็กในตะกร้า (รายการที่ทีมเลือกให้ไม่ตรวจ)
 */
function cartRuleError(entries, singleChoiceCategories) {
    for (const category of singleChoiceCategories) {
        const inCategory = entries.filter((entry) => entry.category_id === category.pc_id);
        if (inCategory.length > 1) return `หมวด "${category.pc_name}" เลือกได้ 1 รายการ (ตอนนี้มี ${inCategory.map((entry) => entry.name).join(", ")})`;
    }
    const packages = entries.filter((entry) => entry.kind === "package");
    for (const entry of entries.filter((item) => item.kind === "product" && !item.is_preset)) {
        for (const productPackage of packages) {
            const rule = productPackage.addon_rules.find((item) => item.product_id === entry.id);
            if (rule?.rule === "included") return `"${entry.name}" มีใน ${productPackage.name} แล้ว ไม่ต้องเลือกเพิ่ม`;
            if (rule?.rule === "not_available") return `"${entry.name}" ใช้กับ ${productPackage.name} ไม่ได้`;
        }
    }
    return null;
}

/**
 * ตรวจคำตอบของข้อที่ลูกค้าเห็น → { rows, fields }
 * ข้อที่ไม่ขึ้น (กลุ่มไม่เกี่ยว · ข้อลูกที่ข้อแม่ตอบไม่ตรง) ไม่ตรวจ ไม่เก็บ · ไฟล์ของข้อที่ไม่ได้ถาม/ไม่ใช่ชนิดไฟล์ = ผิด
 * @param {object[]} groups ผลของ visibleQuestionnaire
 * @param {object[]} answers [{ question_id, value, other_text }]
 * @param {object[]} files จาก multer (fieldname = file_<question_id>)
 * @param {string} today วันนี้เวลาไทย (ข้อวันที่ที่ต้องเป็นอนาคต)
 */
function checkAnswers(groups, answers, files, today) {
    const answerById = new Map(answers.map((answer) => [answer.question_id, answer]));
    const filesById = filesByQuestion(files);
    const fields = {};
    const rows = [];
    for (const group of groups) {
        for (const question of group.questions) {
            const answer = answerById.get(question.rqq_id);
            const value = answer?.value ?? null;
            const otherText = answer?.other_text ?? null;
            const questionFiles = question.rqq_type === "file" ? (filesById.get(question.rqq_id) ?? []) : [];
            const error = answerError(question, value, { fileCount: questionFiles.length, otherText, today }) ?? fileError(question, questionFiles);
            if (error) fields[`answers.${question.rqq_id}`] = error;
            rows.push({
                group,
                question,
                value: storedAnswer(question, value),
                otherText: storedOtherText(question, value, otherText),
                files: questionFiles,
            });
        }
    }
    const askedFileQuestions = new Set(rows.filter((row) => row.question.rqq_type === "file").map((row) => row.question.rqq_id));
    for (const questionId of filesById.keys()) {
        if (!askedFileQuestions.has(questionId)) fields[`answers.${questionId}`] = "แนบไฟล์ในข้อนี้ไม่ได้ (ข้อนี้ไม่ได้ถามแล้ว กรุณาโหลดหน้าใหม่)";
    }
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    if (totalBytes > MAX_TOTAL_FILE_BYTES) {
        const firstFileQuestion = [...filesById.keys()][0];
        fields[`answers.${firstFileQuestion}`] = `ไฟล์รวมทุกข้อใหญ่เกิน ${MAX_TOTAL_FILE_BYTES / 1024 / 1024} MB ลองย่อไฟล์หรือแนบเฉพาะที่จำเป็น`;
    }
    return { rows, fields };
}

/** ไฟล์จาก multer แยกตามข้อ (ชื่อช่อง file_<question_id>) */
function filesByQuestion(files) {
    const filesById = new Map();
    for (const file of files) {
        const questionId = Number(String(file.fieldname).replace(/^file_/, ""));
        const list = filesById.get(questionId) ?? [];
        list.push(file);
        filesById.set(questionId, list);
    }
    return filesById;
}

/** ไฟล์ของข้อนี้: ขนาดต่อไฟล์ และชนิดจากเนื้อไฟล์ (ข้อรูป/PDF ไม่รับไฟล์งานออกแบบ) */
function fileError(question, questionFiles) {
    if (questionFiles.length === 0) return null;
    const maxBytes = maxFileBytesOf(question);
    if (questionFiles.some((file) => file.size > maxBytes)) return `ไฟล์ใหญ่เกิน ${maxBytes / 1024 / 1024} MB`;
    const allowDesignFiles = question.rqq_file_kind === "design";
    if (questionFiles.some((file) => !detectFileType(file.buffer, { allowDesignFiles }))) {
        return allowDesignFiles
            ? "ใช้ไฟล์ PDF JPG PNG AI PSD SVG หรือ ZIP (ไฟล์ที่เปลี่ยนนามสกุลเองใช้ไม่ได้)"
            : "ใช้ไฟล์ PDF JPG หรือ PNG (ไฟล์ที่เปลี่ยนนามสกุลเองใช้ไม่ได้)";
    }
    return null;
}

/** แถวของสินค้า · แบบ % = จำนวน 1 ราคาว่าง (ยอดคิดจากแถวอื่นทุกครั้ง ไม่เก็บซ้ำ) */
function productRow(product, quantity) {
    const base = { type: "item", product_id: product.product_id, package_id: null, name: product.product_name, unit: product.product_unit };
    if (product.product_price_mode === "percent") return { ...base, unit_price: null, quantity: "1.00", percent: product.product_percent };
    return { ...base, unit_price: product.product_price, quantity: `${quantity}.00`, percent: null };
}

/** แถวของชุด: หัวข้อ (จำนวนชุด) + รายการในชุดคูณจำนวนชุด */
function packageRows(productPackage, quantity) {
    return [
        { type: "heading", product_id: null, package_id: productPackage.pkg_id, name: productPackage.pkg_name, unit: "ชุด", unit_price: null, quantity: `${quantity}.00`, percent: null },
        ...productPackage.items.map((packageItem) => ({
            type: "item", product_id: packageItem.product_id, package_id: productPackage.pkg_id, name: packageItem.name, unit: packageItem.unit,
            unit_price: packageItem.unit_price, quantity: multiplyQuantity(packageItem.quantity, quantity), percent: null,
        })),
    ];
}

/** ตะกร้าของลูกค้า → แถวที่จะเก็บ (ราคา ณ ตอนนี้) · รายการที่ไม่มีให้เลือกแล้ว = บอกชื่อ */
function snapshotLines(catalog, items) {
    const productsById = new Map(catalog.products.map((row) => [row.product_id, row]));
    const packagesById = new Map(catalog.packages.map((row) => [row.pkg_id, row]));
    const rows = [];
    const unavailable = [];
    for (const item of items) {
        if (item.kind === "product") {
            const product = productsById.get(item.id);
            if (product) rows.push(productRow(product, item.quantity));
            else unavailable.push(item.id);
            continue;
        }
        const productPackage = packagesById.get(item.id);
        if (productPackage) rows.push(...packageRows(productPackage, item.quantity));
        else unavailable.push(item.id);
    }
    return { rows, unavailable };
}

/** แถวที่คิดเงิน (แถว % คิดจากแถวราคาตายตัว) */
const pricedLines = (rows) =>
    rows
        .filter((row) => row.type === "item")
        .map((row) => (row.percent ? { percent: row.percent } : { unitPrice: row.unit_price, quantity: row.quantity }));

/**
 * ส่งคำขอ · กดซ้ำด้วย submit_key เดิม = ได้คำขอเดิม · ลิงก์รายคนส่งได้ครั้งเดียว
 * @returns {Promise<{ svr_id: string, access_token: string, notify: object | null }>}
 */
async function submit(conn, code, input, { files = [], savedPaths = [] } = {}) {
    const link = await findLinkByCode(conn, code, { forUpdate: true });
    if (openStateOf(link, todayBangkok()) !== "open") {
        throw new AppError(410, "ORDER_LINK_CLOSED", "ลิงก์นี้ปิดรับแล้ว ติดต่อทีมงานเพื่อขอลิงก์ใหม่");
    }
    const [[same]] = await conn.query(
        "SELECT svr_id, svr_access_token FROM tb_service_requests WHERE svr_link_id = ? AND svr_submit_key = ?",
        [link.ol_id, input.submit_key],
    );
    if (same) return { svr_id: same.svr_id, access_token: same.svr_access_token, notify: null };
    if (link.ol_kind === "personal") {
        const [[sent]] = await conn.query("SELECT svr_access_token FROM tb_service_requests WHERE svr_link_id = ? LIMIT 1", [link.ol_id]);
        if (sent) throw new AppError(409, "ORDER_ALREADY_SUBMITTED", "ลิงก์นี้ส่งคำขอไปแล้ว", { access_token: sent.svr_access_token });
    }
    // ช่องดักบอท: คนมองไม่เห็นช่องนี้ จึงว่างเสมอ
    if (input.website) throw new AppError(400, "VALIDATION", "ส่งไม่สำเร็จ กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง");
    const [[{ recent }]] = await conn.query(
        "SELECT COUNT(*) AS recent FROM tb_service_requests WHERE svr_link_id = ? AND svr_submitted_at >= ?",
        [link.ol_id, nowBangkokText(new Date(Date.now() - 60 * 60 * 1000))],
    );
    if (Number(recent) >= MAX_REQUESTS_PER_HOUR) {
        throw new AppError(429, "ORDER_RATE_LIMITED", "มีคำขอจากลิงก์นี้มากเกินไป กรุณาลองใหม่ในอีกสักครู่");
    }

    const contact = link.ol_kind === "fastwork" ? null : validate(orderContactSchema, input.contact ?? {});
    const shopInfo = await findShop(conn);
    const vatRate = await vatRateToday(conn, shopInfo);
    const preset = await loadPreset(conn, link.ol_id);
    if (preset.problem) throw new AppError(409, "ORDER_LINK_UNAVAILABLE", "ลิงก์นี้ใช้ไม่ได้ชั่วคราว กรุณาติดต่อทีมงาน");
    const presetKeys = new Set(preset.items.map(presetKeyOf));
    const catalog = link.ol_allow_more
        ? await loadCatalog(conn, link.ol_id, { excludeKeys: presetKeys })
        : { categories: [], products: [], packages: [] };
    // รายการที่ทีมเลือกให้มาจากลิงก์เสมอ (ลูกค้าส่งซ้ำมา = ไม่นับซ้ำ · แก้จำนวนจากเบราว์เซอร์ไม่ได้)
    const customerItems = input.items.filter((item) => !presetKeys.has(`${item.kind === "product" ? "p" : "k"}:${item.id}`));
    const { rows: customerRows, unavailable } = snapshotLines(catalog, customerItems);
    if (unavailable.length > 0) {
        throw new AppError(409, "ORDER_ITEM_UNAVAILABLE", "บางรายการในตะกร้าไม่มีให้เลือกแล้ว กรุณาโหลดหน้าใหม่แล้วตรวจตะกร้าอีกครั้ง");
    }
    const presetRows = preset.items.flatMap((item) => (item.kind === "product" ? [productRow(item.product, item.quantity)] : packageRows(item.package, item.quantity)));
    const rows = [...presetRows.map((row) => ({ ...row, is_preset: true })), ...customerRows.map((row) => ({ ...row, is_preset: false }))];
    if (!rows.some((row) => row.type === "item")) throw new AppError(400, "VALIDATION", "เลือกบริการอย่างน้อย 1 รายการ");
    const entries = chosenEntries(preset, catalog, customerItems);
    const [singleChoiceCategories] = await conn.query("SELECT pc_id, pc_name FROM tb_product_categories WHERE pc_is_single_choice = 1");
    const ruleError = cartRuleError(entries, singleChoiceCategories);
    if (ruleError) throw new AppError(409, "ORDER_CART_RULE", `${ruleError} · ตรวจตะกร้าอีกครั้ง`);
    const questionRules = await loadLinkQuestionRules(conn, link.ol_id);
    const answers = input.answers ?? [];
    const groups = visibleQuestionnaire(
        await requirementService.listGroups(conn, { activeOnly: true }),
        {
            linkKind: link.ol_kind,
            categoryIds: entries.map((entry) => entry.category_id),
            packageIds: entries.filter((entry) => entry.kind === "package").map((entry) => entry.id),
            productIds: entries.filter((entry) => entry.kind === "product").map((entry) => entry.id),
            hasPreset: preset.items.length > 0,
            includeGroupIds: questionRules.include_group_ids,
            excludeGroupIds: questionRules.exclude_group_ids,
        },
        Object.fromEntries(answers.map((answer) => [answer.question_id, answer.value ?? null])),
    );
    const answerCheck = checkAnswers(groups, answers, files, todayBangkok());
    // ทีมงานแก้คำถามระหว่างที่ลูกค้ากำลังตอบ (มีข้อที่ต้องตอบที่หน้าลูกค้าไม่เคยแสดง) → ให้โหลดคำถามใหม่ คำตอบเดิมยังอยู่ในหน้า
    const seenQuestionIds = new Set(input.seen_question_ids ?? []);
    const unseenErrors = Object.keys(answerCheck.fields).filter((field) => !seenQuestionIds.has(Number(field.replace("answers.", ""))));
    if (input.seen_question_ids && unseenErrors.length > 0) {
        throw new AppError(409, "QUESTIONNAIRE_CHANGED", "ทีมงานเพิ่งปรับคำถาม กรุณาตอบข้อที่เพิ่มมา (คำตอบเดิมยังอยู่)", answerCheck.fields);
    }
    if (Object.keys(answerCheck.fields).length > 0) {
        throw new AppError(400, "VALIDATION", "ตอบคำถามให้ครบก่อนส่ง (ดูข้อความใต้คำถาม)", answerCheck.fields);
    }
    const totals = cartTotals({ lines: pricedLines(rows), vatRate });
    let seenTotal;
    try {
        seenTotal = parseHundredths(input.seen_total, "ยอด");
    } catch {
        seenTotal = -1n;
    }
    if (seenTotal !== totals.total) {
        throw new AppError(409, "ORDER_PRICE_CHANGED", `ราคาเปลี่ยนตั้งแต่เปิดหน้านี้ ยอดประมาณการใหม่ ${text(totals.total)} บาท · ตรวจตะกร้าอีกครั้งแล้วกดส่ง`, {
            total: text(totals.total),
        });
    }

    // ผู้รับ: ของลิงก์ · ถูกปิดใช้งานแล้ว → ผู้รับเริ่มต้นในตั้งค่า (ถ้ามี)
    let assigneeId = link.ol_assignee_id;
    const [[assignee]] = await conn.query("SELECT user_status FROM tb_users WHERE user_id = ?", [assigneeId]);
    if (assignee?.user_status !== "active") {
        const [[settings]] = await conn.query("SELECT cs_service_request_assignee_id FROM tb_company_settings WHERE cs_id = ?", [COMPANY_ROW_ID]);
        assigneeId = settings?.cs_service_request_assignee_id ?? assigneeId;
    }

    const requestId = await generateDailyId("tb_service_requests", "svr_id", "SVR");
    const accessToken = crypto.randomBytes(16).toString("hex");
    // เวลาไทยจากแอป (เวลาของ MySQL บน production ยังไม่ยืนยันว่าเป็นเขตไหน)
    const submittedAt = nowBangkokText();
    await conn.query(
        `INSERT INTO tb_service_requests
            (svr_id, svr_link_id, svr_access_token, svr_submit_key, svr_contact_name, svr_contact_phone, svr_contact_email, svr_contact_line,
             svr_company_name, svr_tax_id, svr_address, svr_note, svr_consent_at, svr_vat_rate, svr_assignee_id, svr_client_id, svr_submitted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            requestId,
            link.ol_id,
            accessToken,
            input.submit_key,
            contact?.contact_name ?? link.ol_buyer_name,
            contact?.contact_phone ?? null,
            contact?.contact_email ?? null,
            contact?.contact_line ?? null,
            contact?.company_name ?? null,
            contact?.wants_tax_invoice ? contact.tax_id : null,
            contact?.wants_tax_invoice ? contact.address : null,
            input.note,
            contact ? submittedAt : null,
            vatRate,
            assigneeId,
            // ลิงก์ของงาน Fastwork เดิม = ลูกค้าของงานนั้น
            link.ol_client_id ?? link.project_client_id ?? null,
            submittedAt,
        ],
    );
    await conn.query(
        `INSERT INTO tb_service_request_items
            (svi_request_id, svi_order, svi_type, svi_product_id, svi_package_id, svi_name, svi_unit, svi_unit_price, svi_quantity, svi_is_preset, svi_percent)
         VALUES ?`,
        [
            rows.map((row, index) => [
                requestId, index + 1, row.type, row.product_id, row.package_id, row.name, row.unit, row.unit_price, row.quantity, row.is_preset ? 1 : 0, row.percent,
            ]),
        ],
    );

    for (const [index, answer] of answerCheck.rows.entries()) {
        const [answerResult] = await conn.query(
            `INSERT INTO tb_service_request_answers
                (sva_request_id, sva_question_id, sva_order, sva_group_name, sva_question_text, sva_type, sva_value, sva_other_text)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                requestId,
                answer.question.rqq_id,
                index + 1,
                answer.group.rqg_name,
                answer.question.rqq_text,
                answer.question.rqq_type,
                answer.value,
                answer.otherText,
            ],
        );
        for (const file of answer.files) {
            const storedPath = await savePrivateFile("service-requests", requestId, file.buffer, `answers.${answer.question.rqq_id}`, {
                allowDesignFiles: answer.question.rqq_file_kind === "design",
            });
            savedPaths.push(storedPath);
            await conn.query(
                "INSERT INTO tb_service_request_files (svf_answer_id, svf_file_path, svf_original_name, svf_size) VALUES (?, ?, ?, ?)",
                [answerResult.insertId, storedPath, cleanUploadedFileName(file.originalname, "ไฟล์แนบ"), file.size],
            );
        }
    }

    const [[notifyTo]] = await conn.query("SELECT user_email, CONCAT(user_fname, ' ', user_lname) AS full_name FROM tb_users WHERE user_id = ?", [assigneeId]);
    return {
        svr_id: requestId,
        access_token: accessToken,
        notify: notifyTo?.user_email
            ? { to: notifyTo.user_email, requestId, customerName: contact?.contact_name ?? link.ol_buyer_name ?? "ลูกค้า", total: text(totals.total), linkKind: link.ol_kind }
            : null,
    };
}

/** คำตอบของคำขอ (ข้อความอ่านง่าย + ชื่อไฟล์) เรียงตามที่ถาม · ใช้ทั้งหน้าสถานะและหน้าพนักงาน */
async function findAnswers(conn, requestId) {
    const [answers] = await conn.query(
        `SELECT sva_id, sva_question_id, sva_group_name, sva_question_text, sva_type, sva_value, sva_other_text
         FROM tb_service_request_answers WHERE sva_request_id = ? ORDER BY sva_order`,
        [requestId],
    );
    if (answers.length === 0) return [];
    const [files] = await conn.query(
        `SELECT svf_id, svf_answer_id, svf_original_name, svf_size, svf_file_path
         FROM tb_service_request_files WHERE svf_answer_id IN (?) ORDER BY svf_id`,
        [answers.map((answer) => answer.sva_id)],
    );
    return answers.map((answer) => ({
        group_name: answer.sva_group_name,
        question: answer.sva_question_text,
        type: answer.sva_type,
        answer: answerText(answer.sva_type, answer.sva_value, answer.sva_other_text),
        // is_viewable = เปิดดูในแท็บได้ (รูป/PDF) · ไฟล์งานออกแบบต้องดาวน์โหลด (SVG ฝังสคริปต์ได้)
        files: files
            .filter((file) => file.svf_answer_id === answer.sva_id)
            .map((file) => ({ id: file.svf_id, name: file.svf_original_name, size: file.svf_size, is_viewable: isViewableFile(file.svf_file_path) })),
    }));
}

/** สถานะที่ลูกค้าเห็น (ไม่มีข้อมูลภายใน) */
// ─── ใบเสนอราคาในหน้าสถานะ (S-4) ─────────────────────────────────────────────────────────

/** ฉบับล่าสุดของใบเสนอราคาที่ออกจากคำขอ (ทีมออก revision แล้ว ลูกค้าเห็นฉบับใหม่เอง ไม่ต้องเก็บรหัสฉบับใหม่ซ้ำ) */
async function latestQuotation(conn, quotationId, { forUpdate = false } = {}) {
    const [[quotation]] = await conn.query(
        `SELECT qt_id, qt_number, qt_revision, qt_status, qt_version, qt_title, qt_currency, qt_project_id, qt_terms, qt_created_by,
                DATE_FORMAT(qt_issue_date, '%Y-%m-%d') AS qt_issue_date, DATE_FORMAT(qt_valid_until, '%Y-%m-%d') AS qt_valid_until,
                qt_subtotal, qt_discount_amount, qt_after_discount, qt_vat_rate, qt_vat_amount, qt_total
         FROM tb_quotations WHERE qt_root_id = (SELECT qt_root_id FROM tb_quotations WHERE qt_id = ?)
         ORDER BY qt_revision DESC LIMIT 1 ${forUpdate ? "FOR UPDATE" : ""}`,
        [quotationId],
    );
    return quotation ?? null;
}

/** ใบเสนอราคาที่ลูกค้าเห็น (ไม่มีบันทึกภายใน) */
async function quotationForCustomer(conn, quotation) {
    const [items] = await conn.query(
        `SELECT qti_type AS type, qti_description AS description, qti_quantity AS quantity, qti_unit AS unit, qti_unit_price AS unit_price,
                qti_discount_amount AS discount, qti_amount AS amount
         FROM tb_quotation_items WHERE qti_quotation_id = ? ORDER BY qti_order, qti_id`,
        [quotation.qt_id],
    );
    const [milestones] = await conn.query(
        "SELECT qtm_name AS name, qtm_percent AS percent, qtm_amount AS amount FROM tb_quotation_milestones WHERE qtm_quotation_id = ? ORDER BY qtm_order",
        [quotation.qt_id],
    );
    return {
        number: quotation.qt_revision > 0 ? `${quotation.qt_number} Rev.${quotation.qt_revision}` : quotation.qt_number,
        title: quotation.qt_title,
        currency: quotation.qt_currency,
        issue_date: quotation.qt_issue_date,
        valid_until: quotation.qt_valid_until,
        subtotal: quotation.qt_subtotal,
        discount: quotation.qt_discount_amount,
        after_discount: quotation.qt_after_discount,
        vat_rate: quotation.qt_vat_rate,
        vat: quotation.qt_vat_amount,
        total: quotation.qt_total,
        terms: quotation.qt_terms,
        items,
        milestones,
    };
}

/** ลิงก์ติดตามงานของโปรเจกต์ (เฉพาะที่เปิดแชร์อยู่) */
async function projectShareToken(conn, projectId) {
    if (!projectId) return null;
    const [[project]] = await conn.query("SELECT project_share_token, project_share_enabled FROM tb_projects WHERE project_id = ?", [projectId]);
    return project?.project_share_enabled ? project.project_share_token : null;
}

const PREPARING_STATUSES = new Set(["draft", "pending_approval", "approved"]);

/**
 * ขั้นที่ลูกค้าเห็น: submitted รอตรวจ · preparing ทีมทำใบเสนอราคา · quotation ใบพร้อม กดยอมรับได้ · accepted ยอมรับแล้ว
 * started ทีมยืนยันแล้วเริ่มงาน (ไม่ออกใบ) · expired ใบหมดอายุ · contact ทีมจะติดต่อกลับ (ปฏิเสธ/ยกเลิก) · closed
 */
async function progressOf(conn, request) {
    if (request.svr_status === "submitted") return { stage: "submitted" };
    if (request.svr_status === "rejected") return { stage: "contact" };
    if (request.svr_status === "closed") return { stage: "closed" };
    // Fastwork: ใบเสนอราคาเป็นเอกสารภายใน ลูกค้าไม่เห็น · ชำระและยืนยันบน Fastwork
    if (request.ol_kind === "fastwork") return { stage: "fastwork_confirmed" };
    if (!request.svr_quotation_id) {
        return { stage: "started", share_token: await projectShareToken(conn, request.svr_project_id) };
    }
    const quotation = await latestQuotation(conn, request.svr_quotation_id);
    if (!quotation || PREPARING_STATUSES.has(quotation.qt_status)) return { stage: "preparing" };
    if (quotation.qt_status === "accepted") {
        return {
            stage: "accepted",
            accepted_name: request.svr_accepted_name,
            accepted_at: request.svr_accepted_at,
            share_token: await projectShareToken(conn, quotation.qt_project_id),
            quotation: await quotationForCustomer(conn, quotation),
        };
    }
    const isExpired = quotation.qt_status === "expired" || (quotation.qt_status === "sent" && quotation.qt_valid_until && quotation.qt_valid_until < todayBangkok());
    if (isExpired) return { stage: "expired" };
    if (quotation.qt_status === "sent") return { stage: "quotation", quotation: await quotationForCustomer(conn, quotation) };
    return { stage: "contact" };
}

/**
 * ลูกค้ายอมรับใบเสนอราคาในลิงก์ → ตอบรับใบ (ขั้นตอนเดิม) + เปิดโปรเจกต์ + งานจากรายการ · ผู้รับคำขอเป็น PM
 * ได้เฉพาะใบล่าสุดที่ส่งแล้วและยังไม่หมดอายุ · กดซ้ำ = ตอบสถานะเดิม
 */
async function acceptByCustomer(conn, accessToken, input) {
    const value = String(accessToken ?? "").trim().toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(value)) throw new AppError(404, "SERVICE_REQUEST_NOT_FOUND", "ไม่พบคำขอนี้");
    const [[request]] = await conn.query(
        `SELECT r.svr_id, r.svr_quotation_id, r.svr_assignee_id, l.ol_kind
         FROM tb_service_requests r JOIN tb_order_links l ON l.ol_id = r.svr_link_id
         WHERE r.svr_access_token = ? FOR UPDATE`,
        [value],
    );
    if (!request) throw new AppError(404, "SERVICE_REQUEST_NOT_FOUND", "ไม่พบคำขอนี้");
    if (request.ol_kind === "fastwork") throw new AppError(409, "QUOTATION_NOT_READY", "งาน Fastwork ยืนยันและชำระเงินบน Fastwork");
    const quotation = request.svr_quotation_id ? await latestQuotation(conn, request.svr_quotation_id, { forUpdate: true }) : null;
    if (quotation?.qt_status === "accepted") return { svr_id: request.svr_id };
    if (!quotation || quotation.qt_status !== "sent") {
        throw new AppError(409, "QUOTATION_NOT_READY", "ใบเสนอราคานี้ยังยอมรับไม่ได้ กรุณาโหลดหน้าใหม่");
    }
    if (quotation.qt_valid_until && quotation.qt_valid_until < todayBangkok()) {
        throw new AppError(409, "QUOTATION_EXPIRED", "ใบเสนอราคาหมดอายุแล้ว ทีมงานจะติดต่อกลับเพื่อออกใบใหม่");
    }
    await acceptQuotation(
        conn,
        quotation.qt_id,
        { project_mode: "new", create_tasks: true, qt_version: quotation.qt_version },
        // PM ของโปรเจกต์ใหม่ = ผู้รับคำขอ · ไม่มีผู้รับ (ไม่ได้ตั้งค่าเริ่มต้น) = คนที่ออกใบเสนอราคา
        { user_id: request.svr_assignee_id ?? quotation.qt_created_by, role_permission: "" },
        { isCustomerAcceptance: true },
    );
    await conn.query("UPDATE tb_service_requests SET svr_accepted_name = ?, svr_accepted_at = ? WHERE svr_id = ?", [
        input.name,
        nowBangkokText(),
        request.svr_id,
    ]);
    return { svr_id: request.svr_id };
}

/** แคตตาล็อกสำหรับตัวคิดราคาภายใน (S-5) — ชุดเดียวกับที่ลูกค้าเห็นในลิงก์ (ทุกหมวด) + ชุดคำถาม */
async function internalCatalog(conn) {
    const shopInfo = await findShop(conn);
    return {
        vat_rate: await vatRateToday(conn, shopInfo),
        catalog: await loadCatalog(conn, null),
        questionnaire: await requirementService.listGroups(conn, { activeOnly: true }),
    };
}

/** หน้าสถานะของลูกค้า (หลังส่ง) */
/** คำขอจากลิงก์หน้าสถานะ (token 32 ตัว) · ไม่พบ = 404 เดียวกันทุกกรณี (ไม่บอกว่าผิดรูปแบบหรือไม่มีในระบบ) */
async function findRequestByToken(conn, accessToken) {
    const value = String(accessToken ?? "").trim().toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(value)) throw new AppError(404, "SERVICE_REQUEST_NOT_FOUND", "ไม่พบคำขอนี้");
    const [[request]] = await conn.query(
        `SELECT r.svr_id, r.svr_status, r.svr_contact_name, r.svr_vat_rate, r.svr_note, r.svr_quotation_id, r.svr_project_id,
                r.svr_accepted_name, DATE_FORMAT(r.svr_accepted_at, '%Y-%m-%d %H:%i') AS svr_accepted_at,
                DATE_FORMAT(r.svr_submitted_at, '%Y-%m-%d %H:%i') AS svr_submitted_at, l.ol_kind
         FROM tb_service_requests r JOIN tb_order_links l ON l.ol_id = r.svr_link_id
         WHERE r.svr_access_token = ?`,
        [value],
    );
    if (!request) throw new AppError(404, "SERVICE_REQUEST_NOT_FOUND", "ไม่พบคำขอนี้");
    return request;
}

async function requestStatus(conn, accessToken) {
    const request = await findRequestByToken(conn, accessToken);
    const [items] = await conn.query(
        `SELECT svi_type AS type, svi_package_id AS package_id, svi_name AS name, svi_unit AS unit, svi_unit_price AS unit_price, svi_quantity AS quantity,
                svi_percent AS percent, svi_is_preset AS is_preset
         FROM tb_service_request_items WHERE svi_request_id = ? AND svi_added_by_staff = 0 ORDER BY svi_order`,
        [request.svr_id],
    );
    const lines = items.filter((row) => row.type === "item").map((row) => (row.percent ? { percent: row.percent } : { unitPrice: row.unit_price, quantity: row.quantity }));
    const totals = cartTotals({ lines, vatRate: request.svr_vat_rate });
    // แถว %: ยอดคิดจากแถวราคาตายตัว (แสดงเป็นราคาต่อหน่วยของแถว)
    const base = fixedSubtotal(lines);
    for (const row of items) {
        row.is_preset = Boolean(row.is_preset);
        if (row.percent) row.unit_price = formatHundredths(percentAmount(base, row.percent));
    }
    const shopInfo = await findShop(conn);
    return {
        shop: { name: shopInfo.name, logo_url: shopInfo.logo_url },
        answers: await findAnswers(conn, request.svr_id),
        progress: await progressOf(conn, request),
        request: {
            number: request.svr_id,
            kind: request.ol_kind,
            contact_name: request.svr_contact_name,
            note: request.svr_note,
            submitted_at: request.svr_submitted_at,
            vat_rate: request.svr_vat_rate,
        },
        items,
        totals: { subtotal: text(totals.subtotal), vat: text(totals.vat), total: text(totals.total) },
    };
}

// ─── ใบเสนอราคาแบบเอกสาร A4 ให้ลูกค้าเปิด/บันทึก PDF (2026-10-30 · docs/plans/2026-10-30-quote-pdf-mobile-refactor.md ส่วน A) ───

// เปิดได้เฉพาะขั้นที่ลูกค้าเห็นใบในหน้าสถานะอยู่แล้ว
const DOCUMENT_STAGES = new Set(["quotation", "accepted"]);
const DOCUMENT_UNAVAILABLE_MESSAGES = {
    preparing: "ทีมงานกำลังเตรียมใบเสนอราคา เปิดได้เมื่อทีมส่งใบให้",
    expired: "ใบเสนอราคานี้หมดอายุแล้ว ติดต่อทีมงานเพื่อขอใบใหม่",
    fastwork_confirmed: "งานนี้ชำระและยืนยันบน Fastwork ดูเอกสารได้บน Fastwork",
};

/** รูปลายเซ็นเป็น data URL (ฝังในคำตอบ ไม่ต้องเปิดเส้นทางรูปลายเซ็นสาธารณะ) · ไม่มี/ไฟล์หาย = null (เว้นช่องให้เซ็นมือ) */
async function signatureDataUrl(conn, signatureId) {
    if (!signatureId) return null;
    try {
        const image = await readSignatureFile(conn, signatureId);
        return `data:image/png;base64,${image.toString("base64")}`;
    } catch {
        return null;
    }
}

const parseSnapshot = (value) => (typeof value === "string" ? JSON.parse(value) : value);

/**
 * หัวบริษัทที่พิมพ์บนใบ · snapshot เก็บทั้งแถวตั้งค่าบริษัท (มีค่าภายใน เช่น อัตราค่าธรรมเนียม กติกาอนุมัติ) จึงเลือกเฉพาะที่พิมพ์
 * ไม่มี snapshot (ใบเก่าก่อนมี snapshot) = ใช้ข้อมูลปัจจุบัน แบบเดียวกับหน้าพิมพ์ภายใน
 */
async function printedCompany(conn, snapshot, branchId) {
    let source = snapshot;
    if (!source) {
        const [[branch]] = await conn.query(
            "SELECT branch_code, branch_name_th, branch_name_en, branch_address_th, branch_address_en, branch_phone FROM tb_branches WHERE branch_id = ?",
            [branchId],
        );
        source = { ...(await findCompany(conn)), branch: branch ?? null };
    }
    const branch = source.branch;
    return {
        cs_name_th: source.cs_name_th,
        cs_name_en: source.cs_name_en ?? null,
        cs_tax_id: source.cs_tax_id ?? null,
        cs_address_th: source.cs_address_th ?? null,
        cs_address_en: source.cs_address_en ?? null,
        cs_phone: source.cs_phone ?? null,
        cs_email: source.cs_email ?? null,
        cs_website: source.cs_website ?? null,
        cs_logo_url: source.cs_logo_url ?? null,
        branch: branch
            ? {
                  branch_code: branch.branch_code,
                  branch_name_th: branch.branch_name_th,
                  branch_name_en: branch.branch_name_en ?? null,
                  branch_address_th: branch.branch_address_th ?? null,
                  branch_address_en: branch.branch_address_en ?? null,
                  branch_phone: branch.branch_phone ?? null,
              }
            : null,
    };
}

/** ลูกค้าที่พิมพ์บนใบ (ข้อมูลของลูกค้าเอง ไม่ส่งรหัสภายใน) · ไม่มี snapshot = ข้อมูลปัจจุบัน */
async function printedClient(conn, snapshot, clientId) {
    let source = snapshot;
    if (!source) {
        const [[client]] = await conn.query(
            `SELECT client_name, client_company, client_contact_name, client_email, client_phone, client_type, client_tax_id, client_branch_code, client_address
             FROM tb_clients WHERE client_id = ?`,
            [clientId],
        );
        source = client ?? {};
    }
    return {
        client_name: source.client_name ?? "",
        client_company: source.client_company ?? null,
        client_contact_name: source.client_contact_name ?? null,
        client_email: source.client_email ?? null,
        client_phone: source.client_phone ?? null,
        client_type: source.client_type ?? null,
        client_tax_id: source.client_tax_id ?? null,
        client_branch_code: source.client_branch_code ?? null,
        client_address: source.client_address ?? null,
    };
}

/**
 * ข้อมูลพิมพ์ใบเสนอราคา (ฉบับล่าสุด) สำหรับหน้าเอกสารของลูกค้า · เลือกฟิลด์ทีละตัว ส่งเฉพาะที่พิมพ์บนใบ
 * ไม่ส่ง: บันทึกภายใน ประวัติอนุมัติ ผู้สร้าง รหัสภายใน (ใบ ลูกค้า โปรเจกต์)
 * ใบที่ลูกค้าเห็นผ่านการอนุมัติแล้วเสมอ จึงใช้ข้อมูลบริษัท/ลูกค้า ณ วันอนุมัติ (snapshot)
 */
async function quotationDocument(conn, accessToken) {
    const request = await findRequestByToken(conn, accessToken);
    const progress = await progressOf(conn, request);
    if (!DOCUMENT_STAGES.has(progress.stage)) {
        throw new AppError(409, "QUOTATION_DOCUMENT_UNAVAILABLE", DOCUMENT_UNAVAILABLE_MESSAGES[progress.stage] ?? "ยังไม่มีใบเสนอราคาให้เปิด");
    }
    const latest = await latestQuotation(conn, request.svr_quotation_id);
    const [[quotation]] = await conn.query(
        `SELECT qt_number, qt_revision, qt_status, qt_title, qt_language, qt_currency, qt_payment_mode, qt_terms,
                DATE_FORMAT(qt_issue_date, '%Y-%m-%d') AS qt_issue_date, DATE_FORMAT(qt_valid_until, '%Y-%m-%d') AS qt_valid_until,
                qt_subtotal, qt_discount_amount, qt_after_discount, qt_vat_treatment, qt_vat_rate, qt_vat_amount, qt_total,
                qt_created_by_name, qt_created_by_title, qt_creator_signature_id,
                qt_approved_by_name, qt_approved_by_title, qt_approver_signature_id,
                qt_company_snapshot, qt_client_snapshot, qt_client_id, qt_branch_id
         FROM tb_quotations WHERE qt_id = ?`,
        [latest.qt_id],
    );
    const [items] = await conn.query(
        `SELECT qti_id, qti_type, qti_description, qti_quantity, qti_unit, qti_unit_price, qti_discount_amount, qti_amount
         FROM tb_quotation_items WHERE qti_quotation_id = ? ORDER BY qti_order, qti_id`,
        [latest.qt_id],
    );
    const [milestones] = await conn.query(
        `SELECT qtm_id, qtm_name, qtm_percent, qtm_amount, qtm_condition
         FROM tb_quotation_milestones WHERE qtm_quotation_id = ? ORDER BY qtm_order`,
        [latest.qt_id],
    );
    const [[currency]] = await conn.query(
        "SELECT cur_code, cur_decimals, cur_unit_th, cur_subunit_th, cur_unit_en, cur_subunit_en FROM tb_currencies WHERE cur_code = ?",
        [quotation.qt_currency],
    );
    const {
        qt_company_snapshot: companySnapshot,
        qt_client_snapshot: clientSnapshot,
        qt_client_id: clientId,
        qt_branch_id: branchId,
        qt_creator_signature_id: creatorSignatureId,
        qt_approver_signature_id: approverSignatureId,
        ...printed
    } = quotation;
    return {
        quotation: printed,
        currency,
        items,
        milestones,
        company: await printedCompany(conn, parseSnapshot(companySnapshot), branchId),
        client: await printedClient(conn, parseSnapshot(clientSnapshot), clientId),
        signatures: {
            creator: await signatureDataUrl(conn, creatorSignatureId),
            approver: await signatureDataUrl(conn, approverSignatureId),
        },
    };
}

module.exports = { shop, submit, requestStatus, quotationDocument, acceptByCustomer, loadCatalog, findLinkByCode, findAnswers, latestQuotation, internalCatalog };
