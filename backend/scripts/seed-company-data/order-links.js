// เรื่องของลิงก์เลือกบริการในข้อมูลจำลอง (2026-10-25 · docs/plans/2026-10-25-client-order-link.md)
//
// ชุดบริษัท: ลิงก์หน้าเว็บ → ลูกค้าใหม่ส่งคำขอ → ผูกลูกค้า ปรับรายการ ออกใบเสนอราคา → ลูกค้ากดยอมรับในลิงก์ (เปิดโปรเจกต์)
//            ลิงก์เฉพาะลูกค้าเดิม → ปฏิเสธ · คำขอใหม่รอตรวจ (มีไฟล์แนบ) · ลิงก์ที่ยังไม่มีคนส่ง
// ชุดช่วงก่อนจด: ลิงก์ Fastwork ก่อนจ้าง → ใบภายใน → รับงานจากคำขอ · ผู้ซื้อไม่จ้าง (ปิด) · รอตรวจ
//                ลิงก์ของงานเดิม → ลูกค้ายืนยันบน Fastwork (งวดเพิ่ม) → ปิดรับความต้องการ
// ลูกค้ายิง API สาธารณะเหมือนหน้าร้านจริง (ไม่มี token) · ยอดที่ส่งคิดด้วยสูตรเดียวกับหน้าร้าน
const crypto = require("crypto");
const sharp = require("sharp");
const { as, rawCall } = require("./api");
const { setToday } = require("./clock");
const { cartTotals, multiplyQuantity } = require("../../src/shared/order-cart-math.mjs");
const { formatHundredths } = require("../../src/shared/money.mjs");
const { applicableGroups } = require("../../src/shared/requirement-answers.mjs");

/** ผูกกลุ่มคำถามกับหมวดสินค้า (กลุ่มที่ติดมากับระบบยังไม่ผูกหมวด) — mapping: ชื่อกลุ่ม → รหัสหมวด · packageMapping: ชื่อกลุ่ม → รหัสชุด */
async function linkRequirementGroups(username, mapping, packageMapping = {}) {
    const { data: groups } = await as(username, "GET", "/V1/requirement-groups");
    for (const group of groups) {
        const categoryIds = mapping[group.rqg_name];
        if (!categoryIds && !packageMapping[group.rqg_name]) continue;
        await as(username, "PUT", `/V1/requirement-groups/${group.rqg_id}`, {
            rqg_name: group.rqg_name,
            rqg_description: group.rqg_description,
            rqg_is_general: Boolean(group.rqg_is_general),
            rqg_sort_order: group.rqg_sort_order,
            rqg_status: group.rqg_status,
            category_ids: categoryIds ?? group.category_ids,
            package_ids: packageMapping[group.rqg_name] ?? group.package_ids ?? [],
        });
    }
}

/** รูปตัวอย่างที่ลูกค้าแนบ (ข้อความอังกฤษ · ฟอนต์ไทยในเครื่องสร้างภาพไม่แน่นอน) */
function sampleImage(title, color) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320">
        <rect width="100%" height="100%" fill="${color}"/>
        <text x="240" y="160" font-family="Arial" font-size="30" text-anchor="middle" fill="#ffffff" font-weight="bold">${title}</text>
        <text x="240" y="300" font-family="Arial" font-size="12" text-anchor="middle" fill="#ffffff">SAMPLE FILE FOR DEMO DATA</text>
    </svg>`;
    return sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * ลูกค้าส่งคำขอผ่านลิงก์ (ไม่ login) → { svr_id, access_token }
 * @param {string} code รหัสสั้นของลิงก์
 * @param {{ items: { kind: "product" | "package", id: string, quantity: number }[], contact?: object, note?: string,
 *           answers?: Record<string, unknown>, files?: Record<string, { name: string, buffer: Buffer }[]> }} order
 *   answers / files อ้างคำถามด้วยข้อความคำถาม · ข้อบังคับที่ไม่ได้ตอบ = หยุดสคริปต์ (กันข้อมูลจำลองหลุดจากชุดคำถาม)
 */
async function submitOrder(code, order) {
    const shop = await rawCall("GET", `/V1/order/${code}`);
    if (shop.status !== 200 || !shop.body.catalog) throw new Error(`เปิดลิงก์ ${code} ไม่ได้: ${JSON.stringify(shop.body)}`);
    const { catalog, vat_rate: vatRate, questionnaire } = shop.body;
    const productsById = new Map(catalog.products.map((product) => [product.product_id, product]));
    const packagesById = new Map(catalog.packages.map((productPackage) => [productPackage.pkg_id, productPackage]));

    const lines = [];
    const categoryIds = [];
    const packageIds = (shop.body.preset ?? []).filter((item) => item.kind === "package").map((item) => item.package.pkg_id);
    for (const item of order.items) {
        if (item.kind === "product") {
            const product = productsById.get(item.id);
            if (!product) throw new Error(`สินค้า ${item.id} ไม่อยู่บนหน้าร้านของลิงก์ ${code}`);
            lines.push({ unitPrice: product.product_price, quantity: String(item.quantity) });
            categoryIds.push(product.product_category_id);
            continue;
        }
        const productPackage = packagesById.get(item.id);
        if (!productPackage) throw new Error(`ชุด ${item.id} ไม่อยู่บนหน้าร้านของลิงก์ ${code}`);
        for (const packageItem of productPackage.items) {
            lines.push({ unitPrice: packageItem.unit_price, quantity: multiplyQuantity(packageItem.quantity, item.quantity) });
        }
        categoryIds.push(productPackage.pkg_category_id);
        packageIds.push(productPackage.pkg_id);
    }

    const answers = [];
    const fileFields = [];
    for (const group of applicableGroups(questionnaire, categoryIds.filter(Boolean), packageIds)) {
        for (const question of group.questions) {
            const files = order.files?.[question.rqq_text] ?? [];
            const value = order.answers?.[question.rqq_text] ?? null;
            if (question.rqq_is_required && value === null && files.length === 0) {
                throw new Error(`คำขอผ่านลิงก์ ${code}: ยังไม่ได้ตอบข้อบังคับ "${question.rqq_text}"`);
            }
            if (question.rqq_type !== "file") answers.push({ question_id: question.rqq_id, value });
            for (const file of files) fileFields.push([`file_${question.rqq_id}`, file]);
        }
    }

    const payload = {
        submit_key: crypto.randomUUID(),
        items: order.items,
        contact: order.contact,
        note: order.note ?? null,
        answers,
        seen_total: formatHundredths(cartTotals({ lines, vatRate }).total),
    };
    let body = payload;
    if (fileFields.length > 0) {
        body = new FormData();
        body.append("payload", JSON.stringify(payload));
        for (const [field, file] of fileFields) body.append(field, new Blob([file.buffer], { type: "image/png" }), file.name);
    }
    const sent = await rawCall("POST", `/V1/order/${code}/requests`, { body });
    if (sent.status !== 201) throw new Error(`ส่งคำขอผ่านลิงก์ ${code} ไม่สำเร็จ: ${sent.status} ${JSON.stringify(sent.body)}`);
    return sent.body;
}

/** กติกางานเพิ่มของชุด (แก้ชุดทั้งชุดตาม API · คงแถวเดิม) */
async function setAddonRules(username, packageId, addonRules) {
    const detail = await as(username, "GET", `/V1/product-packages/${packageId}`);
    await as(username, "PUT", `/V1/product-packages/${packageId}`, {
        pkg_name: detail.pkg_name,
        pkg_description: detail.pkg_description,
        pkg_category_id: detail.pkg_category_id,
        pkg_status: detail.pkg_status,
        pkg_is_public: Boolean(detail.pkg_is_public),
        items: detail.items.map((item) => ({
            pki_type: item.pki_type, pki_product_id: item.pki_product_id, pki_description: item.pki_description,
            pki_quantity: item.pki_quantity, pki_unit: item.pki_unit, pki_unit_price: item.pki_unit_price,
        })),
        addon_rules: addonRules,
    });
}

const requestDetail = (username, requestId) => as(username, "GET", `/V1/service-requests/${requestId}`);

// ─── ชุดบริษัท ────────────────────────────────────────────────────────────────────────────

const SALES_MANAGER = "siriporn";

/**
 * @param {{ on: Function, ids: object, state: object, sales: object }} context
 */
function scheduleOrderLinks({ on, ids, state, sales }) {
    const product = (key) => ids.products[key].id;

    on("2026-08-03", "ตั้งลิงก์เลือกบริการบนหน้าเว็บบริษัท", async () => {
        await as(SALES_MANAGER, "PUT", "/V1/service-requests/settings", { cs_service_request_assignee_id: ids.users.siriporn });
        await linkRequirementGroups(
            SALES_MANAGER,
            { เว็บไซต์: [ids.categories[0]], "ออกแบบ UX/UI": [ids.categories[1]] },
            { ระบบงาน: [ids.packages.corporateWebsite] },
        );
        // ชุดเว็บไซต์องค์กรมีโฮสติ้งและโดเมนปีแรกแล้ว · แอปมือถือใช้กับชุดนี้ไม่ได้
        await setAddonRules(SALES_MANAGER, ids.packages.corporateWebsite, [
            { product_id: product("hosting"), rule: "included" },
            { product_id: product("domain"), rule: "included" },
            { product_id: product("mobileDev"), rule: "not_available" },
        ]);
        state.publicLink = await as(SALES_MANAGER, "POST", "/V1/order-links", {
            ol_kind: "public",
            ol_name: "หน้าเว็บบริษัท (ปุ่มขอใบเสนอราคา)",
            ol_assignee_id: ids.users.siriporn,
            category_ids: [],
        });
    });

    // ── โฮมสเตย์: ลูกค้าใหม่ → ใบเสนอราคา → ลูกค้ากดยอมรับในลิงก์ → เปิดโปรเจกต์
    on("2026-08-12", "ลูกค้าใหม่ส่งคำขอเว็บไซต์ผ่านหน้าเว็บ", async () => {
        setToday("2026-08-12", 21, 14);
        state.homestayRequest = await submitOrder(state.publicLink.ol_short_code, {
            items: [
                { kind: "package", id: ids.packages.corporateWebsite, quantity: 1 },
                { kind: "product", id: product("maintenance"), quantity: 6 },
            ],
            contact: {
                contact_name: "คุณมานพ ใจเย็น",
                contact_phone: "081-776-2045",
                contact_email: "baanrimklong.homestay@gmail.com",
                contact_line: "baanrimklong",
                company_name: "บ้านริมคลอง โฮมสเตย์",
                wants_tax_invoice: false,
                consent: true,
            },
            note: "อยากให้ลูกค้าต่างชาติจองห้องได้เองครับ ตอนนี้รับจองทาง Facebook อย่างเดียว",
            answers: {
                "ธุรกิจ/องค์กรของคุณทำอะไร ลูกค้าหลักคือใคร": "โฮมสเตย์ 6 ห้องริมคลองกระบี่ ลูกค้าส่วนใหญ่เป็นนักท่องเที่ยวยุโรปและคนไทยที่มาเที่ยวสุดสัปดาห์",
                เป้าหมายของงานนี้: ["ให้ลูกค้าจอง/สั่งเอง", "สร้างภาพลักษณ์"],
                อยากให้เสร็จภายใน: "2026-10-31",
                งบประมาณที่ตั้งไว้: "มากกว่า 100,000",
                "ใครเป็นคนตัดสินใจ/ตรวจรับงาน": "มานพ (เจ้าของ) กับภรรยา",
                ช่องทางที่สะดวกให้ติดต่อ: "LINE",
                มีเว็บไซต์เดิมไหม: "no",
                "ประมาณกี่หน้า และมีหน้าอะไรบ้าง": "หน้าแรก ห้องพัก กิจกรรม รีวิว ติดต่อ (ไทย/อังกฤษ)",
                มีโดเมนแล้วไหม: "ยังไม่มี ให้จดให้",
                ต้องการระบบอะไรเพิ่ม: ["จอง/นัดหมาย", "ฟอร์มติดต่อ"],
                ใครจะแก้เนื้อหาหลังส่งมอบ: "แก้เอง ต้องมีหลังบ้าน",
                "มีเนื้อหา/รูปพร้อมแล้วไหม": "บางส่วน",
                // กลุ่ม "ระบบงาน" ผูกชุดเว็บไซต์องค์กร (ถามเฉพาะคนที่เลือกชุดนี้)
                "ตอนนี้ทำงานนี้อย่างไร และติดปัญหาอะไร": "รับจองทาง Facebook แชตทีละคน จดลงสมุด ลูกค้าต่างชาติถามเรื่องห้องว่างซ้ำทุกวัน",
            },
        });
    });
    on("2026-08-13", "ตรวจคำขอโฮมสเตย์ สร้างลูกค้า ปรับรายการ ออกใบเสนอราคา", async () => {
        setToday("2026-08-13", 9, 40);
        const requestId = state.homestayRequest.svr_id;
        let detail = await requestDetail(SALES_MANAGER, requestId);
        const client = await as(SALES_MANAGER, "POST", "/V1/clients", {
            client_name: "บ้านริมคลอง โฮมสเตย์",
            client_type: "individual",
            client_contact_name: "มานพ ใจเย็น",
            client_phone: "0817762045",
            client_email: "baanrimklong.homestay@gmail.com",
            client_language: "th",
        });
        detail = await as(SALES_MANAGER, "PUT", `/V1/service-requests/${requestId}/client`, { svr_version: detail.request.svr_version, client_id: client.client_id });
        // ดูแลระบบ 6 เดือน → 3 เดือนแรก (ลูกค้าตกลงทางโทรศัพท์) · ลดค่าพัฒนาเว็บเหลือ 10 วัน (ไม่มีระบบสมาชิก)
        const rows = detail.items.filter((row) => row.svi_type === "item");
        detail = await as(SALES_MANAGER, "PUT", `/V1/service-requests/${requestId}/items`, {
            svr_version: detail.request.svr_version,
            items: rows.map((row) => ({
                svi_id: row.svi_id,
                product_id: row.svi_product_id,
                name: row.svi_name,
                unit: row.svi_unit,
                unit_price: row.svi_unit_price,
                quantity: row.svi_product_id === product("maintenance") ? "3" : row.svi_product_id === product("webDev") ? "10" : row.svi_quantity,
                is_removed: false,
            })),
        });
        const confirmed = await as(SALES_MANAGER, "POST", `/V1/service-requests/${requestId}/confirm`, { svr_version: detail.request.svr_version, create_quotation: true });
        state.homestayQuotation = confirmed.qt_id;
        await sales.submitAndApprove(SALES_MANAGER, confirmed.qt_id, ["hatsanai"]);
        await sales.sendQuotation(SALES_MANAGER, confirmed.qt_id);
    });
    on("2026-08-17", "ลูกค้าโฮมสเตย์กดยอมรับใบเสนอราคาในลิงก์", async () => {
        setToday("2026-08-17", 20, 3);
        const accepted = await rawCall("POST", `/V1/order/requests/${state.homestayRequest.access_token}/accept`, { body: { name: "มานพ ใจเย็น", agree: true } });
        if (accepted.status !== 200) throw new Error(`ยอมรับใบเสนอราคาในลิงก์ไม่สำเร็จ: ${JSON.stringify(accepted.body)}`);
    });

    // ── คลินิกทันตกรรม (ลูกค้าเดิม): ลิงก์เฉพาะลูกค้า เปิดเฉพาะหมวดออกแบบ → ปฏิเสธ (งบยังไม่อนุมัติ)
    on("2026-09-08", "ส่งลิงก์เฉพาะลูกค้าให้คลินิกทันตกรรม", async () => {
        state.clinicLink = await as(SALES_MANAGER, "POST", "/V1/order-links", {
            ol_kind: "personal",
            ol_client_id: ids.clients.smileClinic,
            ol_name: "ออกแบบแอปนัดหมายคลินิก",
            ol_assignee_id: ids.users.siriporn,
            category_ids: [ids.categories[1], ids.categories[0]],
        });
    });
    on("2026-09-09", "คลินิกส่งคำขอออกแบบแอปนัดหมาย", async () => {
        setToday("2026-09-09", 13, 25);
        const shop = await rawCall("GET", `/V1/order/${state.clinicLink.ol_short_code}`);
        state.clinicRequest = await submitOrder(state.clinicLink.ol_short_code, {
            items: [
                { kind: "product", id: product("uxui"), quantity: 12 },
                { kind: "product", id: product("mobileDev"), quantity: 25 },
            ],
            contact: { ...shop.body.prefill, consent: true },
            answers: {
                "ธุรกิจ/องค์กรของคุณทำอะไร ลูกค้าหลักคือใคร": "คลินิกทันตกรรม 2 สาขาในกระบี่ คนไข้ประจำและนักท่องเที่ยว",
                เป้าหมายของงานนี้: ["ให้ลูกค้าจอง/สั่งเอง", "ลดงานเอกสาร"],
                งบประมาณที่ตั้งไว้: "50,000-100,000",
                ออกแบบให้อะไร: "แอปมือถือ",
                ประมาณกี่หน้าจอ: "12",
                "มีโลโก้/สีประจำแบรนด์แล้วไหม": "มีครบ",
                โทนที่ต้องการ: ["เรียบหรู", "มินิมอล"],
                มีเว็บไซต์เดิมไหม: "yes",
                "ลิงก์เว็บไซต์เดิม (ถ้ามี)": "https://smiledentalkrabi.example.com",
            },
        });
    });
    on("2026-09-10", "ปฏิเสธคำขอคลินิก (งบยังไม่อนุมัติ)", async () => {
        const detail = await requestDetail(SALES_MANAGER, state.clinicRequest.svr_id);
        await as(SALES_MANAGER, "POST", `/V1/service-requests/${state.clinicRequest.svr_id}/reject`, {
            svr_version: detail.request.svr_version,
            reason: "โทรคุยแล้ว ผู้บริหารยังไม่อนุมัติงบปีนี้ ขอให้ติดต่อใหม่ ม.ค. 2027",
        });
    });

    // ── คำขอใหม่รอตรวจ (มีไฟล์โลโก้แนบ) + ลิงก์ที่ส่งแล้วแต่ลูกค้ายังไม่เปิด
    on("2026-10-21", "ร้านเบเกอรี่ส่งคำขอแอปสั่งขนมผ่านหน้าเว็บ", async () => {
        setToday("2026-10-21", 19, 48);
        await submitOrder(state.publicLink.ol_short_code, {
            items: [
                { kind: "product", id: product("uxui"), quantity: 10 },
                { kind: "product", id: product("mobileDev"), quantity: 20 },
            ],
            contact: {
                contact_name: "คุณอรอุมา ทองสุข",
                contact_phone: "089-554-1208",
                contact_email: "orn.bakehouse@gmail.com",
                company_name: "อร เบคเฮาส์",
                wants_tax_invoice: false,
                consent: true,
            },
            note: "อยากได้แอปให้ลูกค้าสั่งเค้กล่วงหน้าและเลือกวันรับ",
            answers: {
                "ธุรกิจ/องค์กรของคุณทำอะไร ลูกค้าหลักคือใคร": "ร้านเบเกอรี่ทำเค้กสั่งทำ ลูกค้าเป็นคนในตัวเมืองกระบี่",
                เป้าหมายของงานนี้: ["เพิ่มยอดขาย", "ให้ลูกค้าจอง/สั่งเอง"],
                งบประมาณที่ตั้งไว้: "50,000-100,000",
                ออกแบบให้อะไร: "แอปมือถือ",
                ประมาณกี่หน้าจอ: "10",
                "มีโลโก้/สีประจำแบรนด์แล้วไหม": "มีโลโก้อย่างเดียว",
                โทนที่ต้องการ: ["สดใส", "เป็นกันเอง"],
            },
            files: { ไฟล์โลโก้หรือคู่มือแบรนด์: [{ name: "orn-bakehouse-logo.png", buffer: await sampleImage("ORN BAKEHOUSE", "#d9778f") }] },
        });
    });
    // ตกลงชุดเว็บไซต์องค์กรทาง LINE แล้ว → ลิงก์ล็อกชุดนี้ไว้ ลูกค้าเลือกงานเพิ่มเอง (ยังไม่เปิด)
    on("2026-10-22", "ส่งลิงก์ที่ล็อกชุดเว็บไซต์ให้ลูกค้าใหม่ทาง LINE (ยังไม่เปิด)", () =>
        as(SALES_MANAGER, "POST", "/V1/order-links", {
            ol_kind: "personal",
            ol_name: "คุณจิราพร (ตกลงเว็บไซต์องค์กรทาง LINE)",
            ol_assignee_id: ids.users.siriporn,
            category_ids: [ids.categories[2], ids.categories[3]],
            preset_items: [{ kind: "package", id: ids.packages.corporateWebsite, quantity: 1 }],
        }),
    );
}

// ─── ชุดช่วงก่อนจด (Fastwork) ─────────────────────────────────────────────────────────────

const GENERAL_ANSWER = (business) => ({
    "ธุรกิจ/องค์กรของคุณทำอะไร ลูกค้าหลักคือใคร": business,
});

/**
 * @param {{ on: Function, ids: object, state: object, owner: string, takeFastworkJob: Function }} context
 */
function scheduleFastworkLinks({ on, ids, state, owner }) {
    const website = ids.products.website.id;
    const screen = ids.products.screen.id;

    on("2026-09-01", "ส่งลิงก์ Fastwork ให้ผู้ซื้อ seaside_spa (ก่อนจ้าง)", async () => {
        await linkRequirementGroups(owner, { เว็บไซต์: [ids.categories.web] });
        state.spaLink = await as(owner, "POST", "/V1/order-links", { ol_kind: "fastwork", ol_buyer_name: "seaside_spa", ol_assignee_id: ids.users[owner], category_ids: [] });
    });
    on("2026-09-02", "seaside_spa เลือกขอบเขตงานผ่านลิงก์", async () => {
        setToday("2026-09-02", 22, 10);
        state.spaRequest = await submitOrder(state.spaLink.ol_short_code, {
            items: [
                { kind: "product", id: website, quantity: 1 },
                { kind: "product", id: screen, quantity: 5 },
            ],
            note: "อยากได้หน้าจองคิวนวดและแพ็กเกจสปา",
            answers: {
                ...GENERAL_ANSWER("สปาเล็กๆ ที่อ่าวนาง ลูกค้าเป็นนักท่องเที่ยว"),
                มีเว็บไซต์เดิมไหม: "no",
                ต้องการระบบอะไรเพิ่ม: ["จอง/นัดหมาย"],
                "มีเนื้อหา/รูปพร้อมแล้วไหม": "พร้อม",
            },
        });
    });
    on("2026-09-03", "ออกใบเสนอราคาภายใน (ไม่ส่งลูกค้า) แล้วส่งราคาบน Fastwork", async () => {
        const requestId = state.spaRequest.svr_id;
        const detail = await requestDetail(owner, requestId);
        const confirmed = await as(owner, "POST", `/V1/service-requests/${requestId}/confirm`, { svr_version: detail.request.svr_version, create_quotation: true });
        await as(owner, "POST", `/V1/quotations/${confirmed.qt_id}/submit`, {});
        // ช่วงก่อนจดอนุมัติเองได้ (ตั้งค่าอนุญาตอนุมัติเอกสารของตัวเอง)
        await as(owner, "POST", `/V1/quotations/${confirmed.qt_id}/approve`, {});
    });
    on("2026-09-05", "seaside_spa จ่ายบน Fastwork → รับงานจากคำขอ", async () => {
        const detail = await requestDetail(owner, state.spaRequest.svr_id);
        const plan = detail.fastwork_plan;
        state.G = await as(owner, "POST", "/V1/fastwork/projects", {
            project_name: plan.title,
            client_id: plan.client_id,
            project_fastwork_order_no: "FW2609-30551",
            project_start_date: "2026-09-05",
            project_due_date: "2026-10-30",
            milestones: [
                { fwm_name: "ออกแบบหน้าจอ 5 หน้า", fwm_amount: "7500", fwm_due_date: "2026-09-25" },
                { fwm_name: "เว็บไซต์พร้อมระบบจองคิว", fwm_amount: "28000", fwm_due_date: "2026-10-30" },
            ],
            service_request_id: state.spaRequest.svr_id,
        });
    });

    on("2026-10-14", "ส่งลิงก์ Fastwork ให้ phuket_pet (ก่อนจ้าง)", async () => {
        state.petLink = await as(owner, "POST", "/V1/order-links", { ol_kind: "fastwork", ol_buyer_name: "phuket_pet", ol_assignee_id: ids.users[owner], category_ids: [] });
        setToday("2026-10-14", 16, 30);
        state.petRequest = await submitOrder(state.petLink.ol_short_code, {
            items: [{ kind: "product", id: website, quantity: 1 }],
            answers: GENERAL_ANSWER("ร้านอาบน้ำตัดขนสัตว์เลี้ยง ภูเก็ต"),
        });
    });
    on("2026-10-18", "phuket_pet ไม่จ้าง → ปิดคำขอ", async () => {
        const detail = await requestDetail(owner, state.petRequest.svr_id);
        await as(owner, "POST", `/V1/service-requests/${state.petRequest.svr_id}/close`, {
            svr_version: detail.request.svr_version,
            reason: "ผู้ซื้อบอกว่างบไม่พอ เลือกทำเพจ Facebook ไปก่อน",
        });
    });

    // ── งานเดิม F: ผู้ซื้อขอหน้าสรุปยอดเพิ่ม → ยืนยันบน Fastwork → งวดเพิ่ม → ปิดรับความต้องการ
    on("2026-10-21", "ส่งลิงก์ให้ shopkeeper_th เลือกงานเพิ่ม", async () => {
        state.extraLink = await as(owner, "POST", "/V1/order-links", { ol_kind: "fastwork", ol_project_id: state.F.projectId, ol_assignee_id: ids.users[owner], category_ids: [] });
        setToday("2026-10-21", 20, 45);
        state.extraRequest = await submitOrder(state.extraLink.ol_short_code, {
            items: [{ kind: "product", id: screen, quantity: 2 }],
            note: "ขอหน้าสรุปยอดรายสินค้าเพิ่ม 2 หน้า",
            answers: GENERAL_ANSWER("ร้านขายเสื้อผ้าออนไลน์ ขายผ่าน Shopee และ LINE"),
        });
    });
    on("2026-10-22", "shopkeeper_th จ่ายงานเพิ่มบน Fastwork → งวดเพิ่ม", async () => {
        const detail = await requestDetail(owner, state.extraRequest.svr_id);
        await as(owner, "POST", `/V1/service-requests/${state.extraRequest.svr_id}/fastwork-accept`, {
            svr_version: detail.request.svr_version,
            milestones: [{ fwm_name: "งานเพิ่ม: หน้าสรุปยอดรายสินค้า 2 หน้า", fwm_amount: "3000", fwm_due_date: "2026-11-15" }],
        });
        await as(owner, "POST", `/V1/projects/${state.F.projectId}/requirements/close-links`, {});
    });

    on("2026-10-23", "kbi_bakery เลือกขอบเขตงาน (รอตรวจ)", async () => {
        const link = await as(owner, "POST", "/V1/order-links", { ol_kind: "fastwork", ol_buyer_name: "kbi_bakery", ol_assignee_id: ids.users[owner], category_ids: [] });
        setToday("2026-10-23", 14, 20);
        await submitOrder(link.ol_short_code, {
            items: [
                { kind: "product", id: website, quantity: 1 },
                { kind: "product", id: screen, quantity: 3 },
            ],
            answers: { ...GENERAL_ANSWER("ร้านเบเกอรี่ในตัวเมืองกระบี่ ขายหน้าร้านและส่งเดลิเวอรี"), มีเว็บไซต์เดิมไหม: "no" },
        });
    });
}

module.exports = { scheduleOrderLinks, scheduleFastworkLinks, submitOrder };
