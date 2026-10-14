// ข้อมูลจำลองสำหรับลองใช้งานวงจรขาย (2026-10-14) — `npm run seed:demo`
//
// สร้างผ่าน service ตัวเดียวกับที่ API ใช้ ข้อมูลจึงผ่านกติกาเดียวกับของจริงทุกข้อ (ยอดเงิน เลขที่ แผนอนุมัติ snapshot)
// ทุกอย่างชื่อขึ้นต้นด้วย "[ตัวอย่าง]" หรือผู้ใช้ชื่อ demo.* — แยกออกจากข้อมูลจริงได้ง่าย
//
// ความปลอดภัย:
//   - ทำงานเฉพาะฐานข้อมูลบนเครื่องนี้ (DB_HOST = localhost/127.0.0.1) และ NODE_ENV ไม่ใช่ production
//   - เคยสร้างไปแล้ว (มีผู้ใช้ demo.sales) = หยุด ไม่สร้างซ้ำ
//   - ไม่แตะข้อมูลที่มีอยู่ ยกเว้น: ข้อมูลบริษัท (เติมเฉพาะตอนชื่อบริษัทยังว่าง) และกติกาอนุมัติ (แทนทั้งชุดด้วยชุดตัวอย่าง)
//
// ผู้ใช้ตัวอย่างทุกคนรหัสผ่าน Demo@2026 (ไม่ต้องเปลี่ยนตอนเข้าครั้งแรก)
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
if (process.env.NODE_ENV === "production" || !LOCAL_HOSTS.has(String(process.env.DB_HOST ?? "").trim())) {
    console.error(
        "หยุด: สคริปต์นี้ใช้กับฐานข้อมูลบนเครื่อง dev เท่านั้น (DB_HOST ต้องเป็น localhost และไม่ใช่ production)",
    );
    process.exit(1);
}

const bcrypt = require("bcryptjs");
const sharp = require("sharp");
const pool = require("../src/config/db");
const { withTransaction } = require("../src/utils/with-transaction");
const { validate } = require("../src/utils/validate");
const { todayBangkok } = require("../src/utils/bangkok-time");
const { recomputeProjectProgress } = require("../src/utils/projectProgress");
const { prepareSignatureImage } = require("../src/utils/signature-image");
const { PERMISSION_KEYS, effectiveRolePermission } = require("../src/shared/permissions.mjs");
const { clientSchema } = require("../src/shared/schemas/client.mjs");
const { productSchema, productCategorySchema, productPackageSchema } = require("../src/shared/schemas/product.mjs");
const { companySchema, branchCreateSchema, approvalLevelsSchema } = require("../src/shared/schemas/company.mjs");
const { quotationDraftSchema } = require("../src/shared/schemas/quotation.mjs");
const companyService = require("../src/services/company.service");
const companyListsService = require("../src/services/company-lists.service");
const approvalRulesService = require("../src/services/approval-rules.service");
const clientService = require("../src/services/client.service");
const productService = require("../src/services/product.service");
const packageService = require("../src/services/product-package.service");
const signatureService = require("../src/services/signature.service");
const quotationService = require("../src/services/quotation.service");
const workflowService = require("../src/services/quotation-workflow.service");
const acceptService = require("../src/services/quotation-accept.service");
const { generateDailyId } = require("../src/utils/generateDailyId");

const DEMO_PASSWORD = "Demo@2026";
const MARKER_USERNAME = "demo.sales";

// ─── ตัวช่วย ────────────────────────────────────────────────────────────────────────────────

/** เลขผู้เสียภาษีไทยที่หลักตรวจสอบถูกต้อง จาก 12 หลักแรก */
function thaiTaxId(firstTwelveDigits) {
    const digits = firstTwelveDigits.split("").map(Number);
    const sum = digits.reduce((total, digit, index) => total + digit * (13 - index), 0);
    return firstTwelveDigits + String((11 - (sum % 11)) % 10);
}

function permissionOf(keys) {
    return PERMISSION_KEYS.map((key) => (keys.includes(key) ? "1" : "0")).join("");
}

function shiftDate(dateText, dayCount) {
    const [year, month, day] = dateText.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day + dayCount)).toISOString().slice(0, 10);
}

function step(message) {
    console.log(`• ${message}`);
}

// ลายเซ็นตัวอย่าง: เส้นหยักวาดด้วย SVG → ผ่านตัวแปลงรูปลายเซ็นตัวจริง (ตัดขอบ พื้นโปร่งใส)
async function demoSignature(seed) {
    const wave = Array.from(
        { length: 8 },
        (_, index) => `${40 + index * 60},${120 + ((index + seed) % 3) * 30 - 30}`,
    ).join(" ");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="240"><rect width="600" height="240" fill="#ffffff"/>
        <polyline points="${wave}" fill="none" stroke="#1e3a8a" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M60 170 Q 300 ${200 + seed * 5} 540 150" fill="none" stroke="#1e3a8a" stroke-width="4"/></svg>`;
    return prepareSignatureImage(await sharp(Buffer.from(svg)).png().toBuffer());
}

// ─── ผู้ใช้และสิทธิ์ ─────────────────────────────────────────────────────────────────────────────

const BASE_KEYS = ["dashboard", "clientManagement", "viewQuotations", "viewOwnProjects"];
const ROLES = {
    sales: {
        name: "[ตัวอย่าง] พนักงานขาย",
        keys: [...BASE_KEYS, "createClient", "editClient", "createQuotation", "createProject"],
    },
    salesManager: {
        name: "[ตัวอย่าง] ผู้จัดการฝ่ายขาย",
        keys: [...BASE_KEYS, "createQuotation", "approveQuotation", "productManagement", "createProject"],
    },
    director: {
        name: "[ตัวอย่าง] กรรมการผู้จัดการ",
        keys: [...BASE_KEYS, "approveQuotation", "cancelQuotation", "viewAllProjects", "companySettings"],
    },
};

const USERS = [
    { username: "demo.sales", fname: "สมชาย", lname: "ขายเก่ง", role: "sales" },
    { username: "demo.sales2", fname: "วิภา", lname: "ใจดี", role: "sales" },
    { username: "demo.manager", fname: "ประเสริฐ", lname: "ตรวจละเอียด", role: "salesManager" },
    { username: "demo.director", fname: "อรุณี", lname: "ตัดสินใจ", role: "director" },
    { username: "demo.director2", fname: "ธนา", lname: "รอบคอบ", role: "director" },
];

async function createRolesAndUsers(headOfficeId, secondBranchId) {
    const roleIds = {};
    for (const [key, role] of Object.entries(ROLES)) {
        const roleId = await generateDailyId("tb_roles", "role_id", "ROL");
        await pool.query(
            "INSERT INTO tb_roles (role_id, role_name, role_permission, role_type) VALUES (?, ?, ?, 'R')",
            [roleId, role.name, permissionOf(role.keys)],
        );
        roleIds[key] = roleId;
    }

    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
    const actors = {};
    for (const [index, user] of USERS.entries()) {
        const userId = await generateDailyId("tb_users", "user_id", "USE");
        const branchId = user.username === "demo.sales2" ? secondBranchId : headOfficeId;
        await pool.query(
            `INSERT INTO tb_users (user_id, user_username, user_email, user_password, user_fname, user_lname, user_role_id,
                                   user_branch_id, user_must_change_password, user_status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'active')`,
            [
                userId,
                user.username,
                `${user.username}@example.com`,
                passwordHash,
                user.fname,
                user.lname,
                roleIds[user.role],
                branchId,
            ],
        );
        actors[user.username] = {
            user_id: userId,
            user_role_id: roleIds[user.role],
            role_permission: effectiveRolePermission("R", permissionOf(ROLES[user.role].keys)),
        };
        if (user.username !== "demo.sales2") {
            const image = await demoSignature(index);
            await withTransaction((conn) => signatureService.replaceSignature(conn, userId, { image, method: "draw" }));
        }
    }
    return { roleIds, actors };
}

// ─── ข้อมูลบริษัท สาขา สกุลเงิน อัตรา กติกาอนุมัติ ─────────────────────────────────────────────────

async function prepareCompany() {
    const company = await companyService.findCompany(pool);
    if (!company.cs_name_th) {
        const filled = validate(companySchema, {
            cs_name_th: "บริษัท ซอฟต์เวิร์ค ตัวอย่าง จำกัด",
            cs_name_en: "Softwork Demo Co., Ltd.",
            cs_tax_id: thaiTaxId("010555600012"),
            cs_address_th: "99/9 อาคารตัวอย่าง ชั้น 5 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพฯ 10110",
            cs_address_en: "99/9 Demo Building, 5th Floor, Sukhumvit Rd., Khlong Toei, Bangkok 10110",
            cs_phone: "02-000-0000",
            cs_email: "sales@softwork-demo.example",
            cs_website: "https://softwork-demo.example",
            cs_vat_registered_from: null,
            cs_quotation_valid_days: company.cs_quotation_valid_days,
            cs_quotation_terms_th: company.cs_quotation_terms_th,
            cs_quotation_terms_en: company.cs_quotation_terms_en,
            cs_allow_self_approval: false,
        });
        await withTransaction((conn) => companyService.updateCompany(conn, filled));
        step("เติมข้อมูลบริษัทตัวอย่าง (เดิมยังว่าง)");
    }

    const [[headOffice]] = await pool.query("SELECT branch_id FROM tb_branches WHERE branch_code = '00000'");
    let [[secondBranch]] = await pool.query("SELECT branch_id FROM tb_branches WHERE branch_code = '00001'");
    if (!secondBranch) {
        const branch = validate(branchCreateSchema, {
            branch_code: "00001",
            branch_name_th: "[ตัวอย่าง] สาขาเชียงใหม่",
            branch_name_en: "Chiang Mai Branch",
            branch_address_th: "123 ถนนนิมมานเหมินท์ ต.สุเทพ อ.เมือง จ.เชียงใหม่ 50200",
            branch_phone: "053-000-000",
            branch_status: "active",
        });
        secondBranch = await withTransaction((conn) => companyListsService.createBranch(conn, branch));
        step("เพิ่มสาขาเชียงใหม่ (00001)");
    }

    // อัตรา ธปท. ตัวอย่าง 14 วันล่าสุด (ข้ามเสาร์-อาทิตย์) — ใช้ได้แม้ไม่มีคีย์ API · ไม่ทับอัตราจริงที่ดึงไว้แล้ว
    const today = todayBangkok();
    let count = 0;
    for (let dayOffset = 0; dayOffset <= 14; dayOffset += 1) {
        const dateText = shiftDate(today, -dayOffset);
        const weekday = new Date(`${dateText}T00:00:00Z`).getUTCDay();
        if (weekday === 0 || weekday === 6) continue;
        const usd = (34.1 + (dayOffset % 5) * 0.0731).toFixed(4);
        await pool.query(
            `INSERT IGNORE INTO tb_exchange_rates (er_currency, er_rate_date, er_buying_sight, er_buying_transfer, er_selling, er_mid_rate)
             VALUES ('USD', ?, ?, ?, ?, ?)`,
            [
                dateText,
                (Number(usd) - 0.06).toFixed(4),
                usd,
                (Number(usd) + 0.62).toFixed(4),
                (Number(usd) + 0.31).toFixed(4),
            ],
        );
        count += 1;
    }
    step(`อัตราแลกเปลี่ยน USD ตัวอย่าง ${count} วันทำการ`);

    return { headOfficeId: headOffice.branch_id, secondBranchId: secondBranch.branch_id };
}

async function prepareApprovalRules(roleIds) {
    const { levels } = validate(approvalLevelsSchema, {
        levels: [
            { al_min_amount_thb: "0", al_require_distinct: false, role_ids: [roleIds.salesManager, roleIds.director] },
            { al_min_amount_thb: "100000", al_require_distinct: false, role_ids: [roleIds.director] },
            { al_min_amount_thb: "1000000", al_require_distinct: true, role_ids: [roleIds.director] },
        ],
    });
    await withTransaction((conn) => approvalRulesService.saveApprovalRules(conn, "QT", levels));
    step("กติกาอนุมัติ 3 ชั้น: ทุกใบ → ผจก.ขาย/กรรมการ · ≥100,000 → กรรมการ · ≥1,000,000 → กรรมการอีกคน (คนละคน)");
}

// ─── ลูกค้า สินค้า ชุดรายการ ───────────────────────────────────────────────────────────────────

const CLIENTS = [
    {
        client_name: "[ตัวอย่าง] คุณสมศักดิ์",
        client_company: "บริษัท ไทยรุ่งเรือง เทรดดิ้ง จำกัด",
        taxBase: "010555700034",
        client_branch_code: "00000",
        client_contact_name: "คุณสมศักดิ์ มั่นคง",
        client_credit_days: 30,
        client_wht_rate: "3",
    },
    {
        client_name: "[ตัวอย่าง] โรงแรมริมน้ำ",
        client_company: "บริษัท ริมน้ำ ฮอสพิทาลิตี้ จำกัด",
        taxBase: "010555800056",
        client_branch_code: "00002",
        client_contact_name: "คุณนภา ฝ่ายไอที",
        client_credit_days: 45,
        client_wht_rate: "3",
    },
    {
        client_name: "[ตัวอย่าง] คลินิกหมอใจดี",
        client_company: "ห้างหุ้นส่วนจำกัด คลินิกหมอใจดี",
        taxBase: "010355900078",
        client_branch_code: "00000",
        client_contact_name: "พญ.ใจดี รักษา",
        client_credit_days: 15,
    },
    {
        client_name: "[ตัวอย่าง] คุณมานี",
        client_type: "individual",
        taxBase: "310010000012",
        client_contact_name: "คุณมานี มีนา",
    },
    {
        client_name: "[ตัวอย่าง] Global Widgets",
        client_company: "Global Widgets Inc.",
        client_country: "US",
        client_tax_id: "12-3456789",
        client_currency: "USD",
        client_language: "en",
        client_vat_treatment: "zero",
        client_contact_name: "John Smith",
    },
    {
        client_name: "[ตัวอย่าง] ร้านกาแฟสามแยก",
        client_company: "บริษัท สามแยก คอฟฟี่ จำกัด",
        taxBase: "010556000090",
        client_branch_code: "00000",
        client_contact_name: "คุณเอ",
    },
];

const CATEGORIES = ["พัฒนาระบบ", "ออกแบบ", "ดูแลรายเดือน (MA)", "ฮาร์ดแวร์"];

const PRODUCTS = [
    { code: "DEV-WEB", name: "พัฒนาเว็บไซต์บริษัท", unit: "งาน", price: "45000", category: 0 },
    { code: "DEV-API", name: "พัฒนา API เชื่อมต่อระบบ", unit: "งาน", price: "60000", category: 0 },
    { code: "DEV-APP", name: "พัฒนาแอปมือถือ (iOS/Android)", unit: "งาน", price: "180000", category: 0 },
    { code: "DEV-MD", name: "นักพัฒนา (Man-day)", unit: "วัน", price: "6000", category: 0 },
    { code: "DES-UI", name: "ออกแบบ UX/UI", unit: "หน้าจอ", price: "3500", category: 1 },
    { code: "DES-LOGO", name: "ออกแบบโลโก้และ CI", unit: "งาน", price: "25000", category: 1 },
    { code: "MA-BASIC", name: "ดูแลระบบรายเดือน แพ็กเกจพื้นฐาน", unit: "เดือน", price: "5000", category: 2 },
    { code: "MA-PRO", name: "ดูแลระบบรายเดือน แพ็กเกจมืออาชีพ", unit: "เดือน", price: "12000", category: 2 },
    { code: "HOST-1Y", name: "โฮสติ้ง + โดเมน 1 ปี", unit: "ปี", price: "4500", category: 2 },
    { code: "HW-NB", name: "โน้ตบุ๊กสำหรับทำงาน", unit: "เครื่อง", price: "32000", category: 3 },
    { code: "HW-POS", name: "เครื่อง POS พร้อมลิ้นชักเก็บเงิน", unit: "ชุด", price: "28500", category: 3 },
    { code: "TRAIN", name: "อบรมการใช้งานระบบ", unit: "ครั้ง", price: "8000", category: null },
];

async function createCatalog() {
    const categoryIds = [];
    for (const [index, name] of CATEGORIES.entries()) {
        const category = validate(productCategorySchema, {
            pc_name: `[ตัวอย่าง] ${name}`,
            pc_sort_order: index + 1,
            pc_status: "active",
        });
        const created = await withTransaction((conn) => productService.createCategory(conn, category));
        categoryIds.push(created.pc_id);
    }

    const products = {};
    for (const item of PRODUCTS) {
        const product = validate(productSchema, {
            product_code: `DEMO-${item.code}`,
            product_name: item.name,
            product_description: null,
            product_unit: item.unit,
            product_price: item.price,
            product_category_id: item.category === null ? null : categoryIds[item.category],
            product_status: "active",
        });
        products[item.code] = await withTransaction((conn) => productService.createProduct(conn, product));
    }
    // สินค้าที่เลิกขายแล้ว (ไว้ดูป้าย "ปิดใช้งาน")
    const retired = validate(productSchema, {
        product_code: "DEMO-OLD-HOST",
        product_name: "โฮสติ้งรุ่นเก่า (เลิกขาย)",
        product_unit: "ปี",
        product_price: "3000",
        product_status: "inactive",
    });
    products.OLD = await withTransaction((conn) => productService.createProduct(conn, retired));

    const websitePackage = validate(productPackageSchema, {
        pkg_name: "[ตัวอย่าง] แพ็กเกจเว็บไซต์บริษัทครบชุด",
        pkg_category_id: categoryIds[0],
        pkg_status: "active",
        items: [
            { pki_type: "heading", pki_description: "ออกแบบและพัฒนา" },
            {
                pki_type: "item",
                pki_product_id: products["DES-UI"].product_id,
                pki_description: "ออกแบบ UX/UI หน้าหลักและหน้าย่อย",
                pki_quantity: "8",
                pki_unit: "หน้าจอ",
            },
            {
                pki_type: "item",
                pki_product_id: products["DEV-WEB"].product_id,
                pki_description: "พัฒนาเว็บไซต์บริษัท รองรับมือถือ",
                pki_quantity: "1",
                pki_unit: "งาน",
            },
            { pki_type: "heading", pki_description: "บริการหลังส่งมอบ" },
            {
                pki_type: "item",
                pki_product_id: products["HOST-1Y"].product_id,
                pki_description: "โฮสติ้ง + โดเมน 1 ปี",
                pki_quantity: "1",
                pki_unit: "ปี",
            },
            {
                pki_type: "item",
                pki_product_id: products["MA-BASIC"].product_id,
                pki_description: "ดูแลระบบรายเดือน 3 เดือนแรก",
                pki_quantity: "3",
                pki_unit: "เดือน",
            },
            { pki_type: "note", pki_description: "ไม่รวมค่าจัดทำเนื้อหาและรูปภาพ" },
        ],
    });
    await withTransaction((conn) => packageService.createPackage(conn, websitePackage));

    const posPackage = validate(productPackageSchema, {
        pkg_name: "[ตัวอย่าง] ชุดร้านค้า POS",
        pkg_category_id: categoryIds[3],
        pkg_status: "active",
        items: [
            {
                pki_type: "item",
                pki_product_id: products["HW-POS"].product_id,
                pki_description: "เครื่อง POS พร้อมลิ้นชักเก็บเงิน",
                pki_quantity: "1",
                pki_unit: "ชุด",
            },
            {
                pki_type: "item",
                pki_product_id: products.TRAIN.product_id,
                pki_description: "อบรมพนักงานหน้าร้าน",
                pki_quantity: "1",
                pki_unit: "ครั้ง",
            },
            {
                pki_type: "item",
                pki_product_id: products.OLD.product_id,
                pki_description: "โฮสติ้งรุ่นเก่า",
                pki_quantity: "1",
                pki_unit: "ปี",
            },
            {
                pki_type: "item",
                pki_description: "ค่าติดตั้งนอกสถานที่",
                pki_quantity: "1",
                pki_unit: "ครั้ง",
                pki_unit_price: "1500",
            },
        ],
    });
    await withTransaction((conn) => packageService.createPackage(conn, posPackage));
    step(`สินค้า/บริการ ${Object.keys(products).length} รายการ · หมวด ${CATEGORIES.length} · ชุดรายการ 2 ชุด`);
    return products;
}

async function createClients() {
    const clientIds = [];
    for (const raw of CLIENTS) {
        const { taxBase, ...fields } = raw;
        const client = validate(clientSchema, {
            ...fields,
            client_tax_id: taxBase ? thaiTaxId(taxBase) : (fields.client_tax_id ?? null),
        });
        const created = await withTransaction((conn) => clientService.createClient(conn, client));
        clientIds.push(created.client_id);
    }
    step(`ลูกค้า ${clientIds.length} ราย (นิติบุคคล บุคคลธรรมดา และลูกค้าต่างประเทศสกุล USD)`);
    return clientIds;
}

// ─── ใบเสนอราคาในทุกสถานะ ─────────────────────────────────────────────────────────────────────

function line(product, quantity, overrides = {}) {
    return {
        qti_type: "item",
        qti_product_id: product.product_id,
        qti_description: product.product_name,
        qti_quantity: quantity,
        qti_unit: product.product_unit,
        qti_unit_price: product.product_price,
        qti_list_price: product.product_price,
        ...overrides,
    };
}

async function createQuotations({ clientIds, products, actors, headOfficeId, secondBranchId }) {
    const sales = actors["demo.sales"];
    const sales2 = actors["demo.sales2"];
    const manager = actors["demo.manager"];
    const director = actors["demo.director"];
    const director2 = actors["demo.director2"];

    async function draft(actor, fields) {
        const parsed = validate(quotationDraftSchema, {
            qt_branch_id: actor === sales2 ? secondBranchId : headOfficeId,
            qt_valid_days: 30,
            ...fields,
        });
        const { qt_id: quotationId } = await withTransaction((conn) =>
            quotationService.createDraft(conn, parsed, actor),
        );
        return quotationId;
    }
    const submit = (id, actor) => withTransaction((conn) => workflowService.submitForApproval(conn, id, null, actor));
    const approve = (id, actor) => withTransaction((conn) => workflowService.approve(conn, id, null, actor));

    const websiteItems = [
        { qti_type: "heading", qti_description: "ออกแบบและพัฒนา" },
        line(products["DES-UI"], "8"),
        line(products["DEV-WEB"], "1", { qti_unit_price: "42000" }),
        { qti_type: "heading", qti_description: "บริการหลังส่งมอบ" },
        line(products["HOST-1Y"], "1"),
        line(products["MA-BASIC"], "3"),
        { qti_type: "note", qti_description: "ไม่รวมค่าจัดทำเนื้อหาและรูปภาพ" },
    ];
    const terms = (await companyService.findCompany(pool)).cs_quotation_terms_th;

    // 1) ร่าง
    await draft(sales, {
        qt_client_id: clientIds[5],
        qt_title: "[ตัวอย่าง] ระบบสมาชิกร้านกาแฟ (ร่าง)",
        qt_terms: terms,
        items: [line(products["DEV-APP"], "1"), line(products["DES-UI"], "12")],
    });

    // 2) รออนุมัติชั้น 1
    const pendingLevel1 = await draft(sales, {
        qt_client_id: clientIds[2],
        qt_title: "[ตัวอย่าง] ระบบนัดหมายคลินิก",
        qt_terms: terms,
        items: [line(products["DEV-WEB"], "1"), line(products["TRAIN"], "1")],
    });
    await submit(pendingLevel1, sales);

    // 3) รออนุมัติชั้น 2 (ผจก.ขายอนุมัติชั้น 1 แล้ว) + ขายต่ำกว่าราคาตั้งต้น
    const pendingLevel2 = await draft(sales, {
        qt_client_id: clientIds[1],
        qt_title: "[ตัวอย่าง] ระบบจองห้องพักโรงแรม",
        qt_terms: terms,
        qt_payment_mode: "milestones",
        items: [
            line(products["DEV-API"], "1", { qti_unit_price: "55000" }),
            line(products["DEV-APP"], "1"),
            line(products["MA-PRO"], "6"),
        ],
        milestones: [
            { qtm_name: "มัดจำ", qtm_condition: "เมื่อเซ็นสัญญา", qtm_percent: "30" },
            { qtm_name: "ส่งมอบรอบแรก", qtm_condition: "เมื่อทดสอบระบบจองได้", qtm_percent: "40" },
            { qtm_name: "ส่งมอบงานทั้งหมด", qtm_condition: "เมื่อขึ้นระบบจริง", qtm_percent: "30" },
        ],
    });
    await submit(pendingLevel2, sales);
    await approve(pendingLevel2, manager);

    // 4) อนุมัติแล้ว (ส่วนลดท้ายบิล)
    const approved = await draft(sales, {
        qt_client_id: clientIds[0],
        qt_title: "[ตัวอย่าง] เว็บไซต์บริษัทไทยรุ่งเรือง",
        qt_terms: terms,
        qt_discount_type: "percent",
        qt_discount_value: "5",
        items: websiteItems,
    });
    await submit(approved, sales);
    await approve(approved, manager);

    // 5) ส่งลูกค้าแล้ว — สาขาเชียงใหม่
    const sent = await draft(sales2, {
        qt_client_id: clientIds[3],
        qt_title: "[ตัวอย่าง] ชุดร้านค้า POS คุณมานี",
        qt_terms: terms,
        items: [line(products["HW-POS"], "2"), line(products["TRAIN"], "1")],
    });
    await submit(sent, sales2);
    await approve(sent, manager);
    await withTransaction((conn) => workflowService.markSent(conn, sent, null));

    // 6) ลูกค้าตอบรับ → โปรเจกต์ใหม่ + งานจากรายการ
    const accepted = await draft(sales, {
        qt_client_id: clientIds[0],
        qt_title: "[ตัวอย่าง] ระบบหลังบ้านไทยรุ่งเรือง",
        qt_terms: terms,
        items: websiteItems,
    });
    await submit(accepted, sales);
    await approve(accepted, manager);
    await withTransaction((conn) => workflowService.markSent(conn, accepted, null));
    const acceptance = await withTransaction((conn) =>
        acceptService.acceptQuotation(
            conn,
            accepted,
            { project_mode: "new", project_id: null, create_tasks: true },
            sales,
        ),
    );
    await recomputeProjectProgress(acceptance.project_id);

    // 7) ลูกค้าปฏิเสธ
    const declined = await draft(sales, {
        qt_client_id: clientIds[2],
        qt_title: "[ตัวอย่าง] แอปคลินิก (เสนอครั้งแรก)",
        qt_terms: terms,
        items: [line(products["DEV-APP"], "1")],
    });
    await submit(declined, sales);
    await approve(declined, director);
    await withTransaction((conn) =>
        workflowService.markDeclined(conn, declined, "งบประมาณปีนี้ไม่พอ ขอเลื่อนไปปีหน้า", null),
    );

    // 8) หมดอายุ (เลยวันยืนราคา)
    const expired = await draft(sales, {
        qt_client_id: clientIds[5],
        qt_title: "[ตัวอย่าง] โลโก้ร้านกาแฟ",
        qt_terms: terms,
        items: [line(products["DES-LOGO"], "1")],
    });
    await submit(expired, sales);
    await approve(expired, manager);
    await pool.query("UPDATE tb_quotations SET qt_valid_until = ? WHERE qt_id = ?", [
        shiftDate(todayBangkok(), -1),
        expired,
    ]);
    await quotationService.expireOverdue(pool); // ปกติเปลี่ยนตอนมีคนเปิดดู — ทำเลยให้เห็นสถานะหมดอายุทันที

    // 9) ยกเลิก
    const cancelled = await draft(sales, {
        qt_client_id: clientIds[1],
        qt_title: "[ตัวอย่าง] โน้ตบุ๊กพนักงานโรงแรม",
        qt_terms: terms,
        items: [line(products["HW-NB"], "10")],
    });
    await submit(cancelled, sales);
    await approve(cancelled, director);
    await withTransaction((conn) =>
        workflowService.cancel(conn, cancelled, "ลูกค้าจัดซื้อเองผ่านฝ่ายจัดซื้อกลาง", null, director),
    );

    // 10) ตีกลับ (กลับเป็นร่างพร้อมเหตุผล)
    const returned = await draft(sales2, {
        qt_client_id: clientIds[3],
        qt_title: "[ตัวอย่าง] เว็บไซต์ส่วนตัวคุณมานี",
        qt_terms: terms,
        items: [line(products["DEV-WEB"], "1", { qti_unit_price: "30000" })],
    });
    await submit(returned, sales2);
    await withTransaction((conn) =>
        workflowService.returnToDraft(conn, returned, "ราคาต่ำกว่าทุนมาก ช่วยตรวจส่วนลดอีกครั้ง", null, manager),
    );

    // 11) revision: Rev.0 ส่งแล้ว → Rev.1 อนุมัติ (Rev.0 กลายเป็น "มีฉบับใหม่แทน")
    const revisionSource = await draft(sales, {
        qt_client_id: clientIds[0],
        qt_title: "[ตัวอย่าง] ระบบ API เชื่อมคลังสินค้า",
        qt_terms: terms,
        items: [line(products["DEV-API"], "1"), line(products["DEV-MD"], "10")],
    });
    await submit(revisionSource, sales);
    await approve(revisionSource, director); // 120,000 บาท ต้องผ่าน 2 ชั้น — กรรมการกดครั้งเดียวผ่านทั้งสองชั้น
    await withTransaction((conn) => workflowService.markSent(conn, revisionSource, null));
    const freshRate = await workflowService.prepareFreshRate(pool, revisionSource);
    const { qt_id: revisionId } = await withTransaction((conn) =>
        workflowService.revise(conn, revisionSource, freshRate, sales),
    );
    await submit(revisionId, sales);
    await approve(revisionId, director);

    // 12) ยอดสูง 3 ชั้น: กรรมการคนแรกผ่านชั้น 1–2 แล้ว รอกรรมการอีกคนชั้น 3
    const bigDeal = await draft(sales, {
        qt_client_id: clientIds[1],
        qt_title: "[ตัวอย่าง] ระบบบริหารโรงแรมทั้งเครือ",
        qt_terms: terms,
        items: [
            { qti_type: "heading", qti_description: "ระบบหลัก" },
            line(products["DEV-APP"], "3"),
            line(products["DEV-API"], "4"),
            line(products["DEV-MD"], "120"),
            { qti_type: "heading", qti_description: "อุปกรณ์" },
            line(products["HW-NB"], "15"),
        ],
    });
    await submit(bigDeal, sales);
    await approve(bigDeal, director);

    // 13) ลูกค้าต่างประเทศ USD อัตรา ธปท. ตัวอย่าง — อนุมัติแล้ว (3 ชั้นครบ เพราะยอดเป็นบาทเกิน 1 ล้าน)
    const today = todayBangkok();
    const [[usdRate]] = await pool.query(
        `SELECT DATE_FORMAT(er_rate_date, '%Y-%m-%d') AS rate_date, er_buying_transfer AS rate FROM tb_exchange_rates
         WHERE er_currency = 'USD' AND er_rate_date <= ? AND er_buying_transfer IS NOT NULL ORDER BY er_rate_date DESC LIMIT 1`,
        [today],
    );
    const usd = await draft(sales, {
        qt_client_id: clientIds[4],
        qt_title: "[ตัวอย่าง] Mobile app for Global Widgets",
        qt_language: "en",
        qt_currency: "USD",
        qt_exchange_rate: usdRate.rate,
        qt_rate_source: "bot",
        qt_rate_date: usdRate.rate_date,
        qt_vat_treatment: "zero",
        qt_terms: (await companyService.findCompany(pool)).cs_quotation_terms_en,
        items: [
            { qti_type: "heading", qti_description: "Mobile application" },
            {
                qti_type: "item",
                qti_description: "iOS and Android app development",
                qti_quantity: "1",
                qti_unit: "project",
                qti_unit_price: "28000",
            },
            {
                qti_type: "item",
                qti_description: "UX/UI design",
                qti_quantity: "15",
                qti_unit: "screen",
                qti_unit_price: "110",
            },
            {
                qti_type: "item",
                qti_description: "Monthly maintenance",
                qti_quantity: "12",
                qti_unit: "month",
                qti_unit_price: "350",
            },
        ],
    });
    await submit(usd, sales);
    await approve(usd, director);
    await approve(usd, director2);

    step(
        "ใบเสนอราคา 14 ใบ ครบทุกสถานะ: ร่าง · รออนุมัติชั้น 1/2/3 · อนุมัติ · ส่งแล้ว · ตอบรับ (+โปรเจกต์และงาน) · ปฏิเสธ · หมดอายุ · ยกเลิก · ถูกตีกลับ · revision · สกุล USD",
    );
}

// ─── เริ่ม ──────────────────────────────────────────────────────────────────────────────────

async function main() {
    const [[existing]] = await pool.query("SELECT user_id FROM tb_users WHERE user_username = ?", [MARKER_USERNAME]);
    if (existing) {
        console.log("มีข้อมูลจำลองอยู่แล้ว (พบผู้ใช้ demo.sales) — ไม่สร้างซ้ำ");
        return;
    }
    console.log(`สร้างข้อมูลจำลองในฐานข้อมูล ${process.env.DB_NAME} @ ${process.env.DB_HOST}`);

    const branches = await prepareCompany();
    const { roleIds, actors } = await createRolesAndUsers(branches.headOfficeId, branches.secondBranchId);
    step(`role ตัวอย่าง 3 role · ผู้ใช้ ${USERS.length} คน (รหัสผ่าน ${DEMO_PASSWORD}) พร้อมลายเซ็นตัวอย่าง`);
    await prepareApprovalRules(roleIds);
    const products = await createCatalog();
    const clientIds = await createClients();
    await createQuotations({ clientIds, products, actors, ...branches });
    console.log("เสร็จแล้ว");
}

main()
    .catch((err) => {
        console.error("สร้างข้อมูลจำลองไม่สำเร็จ:", err.message, err.fields ?? "");
        process.exitCode = 1;
    })
    .finally(() => pool.end());
