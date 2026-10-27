// หน้าร้านตรงกับของที่ขาย (2026-10-25 · docs/plans/2026-10-25-client-order-link.md ข้อ 19, 20)
// รายการที่ทีมเลือกให้ในลิงก์ (ล็อก) · หมวดเลือกได้อย่างเดียว · กติกางานเพิ่มต่อแพ็ก · งานเพิ่มแบบ % · คำถามเฉพาะแพ็ก
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const { startTestServer } = require("./support/test-server");

let api;
let adminId;
const ids = {};

const anonymous = (method, url, body) => api.callApi(method, url, { token: null, body });

function expectStatus(response, status, note) {
    assert.equal(response.status, status, `${note ?? ""} ${JSON.stringify(response.body)}`);
    return response.body;
}

const submitBody = (items, seenTotal, extra = {}) => ({ submit_key: crypto.randomUUID(), items, seen_total: seenTotal, answers: [], ...extra });

test.before(async () => {
    api = await startTestServer("order_store");
    await api.loginAsAdmin();
    const [[admin]] = await api.pool.query("SELECT user_id FROM tb_users WHERE user_username = 'admin'");
    adminId = admin.user_id;
    await api.pool.query("UPDATE tb_requirement_groups SET rqg_status = 'inactive'");

    ids.packageCategory = expectStatus(
        await api.callApi("POST", "/V1/product-categories", { body: { pc_name: "แพ็กเกจเว็บไซต์", pc_sort_order: 0, pc_status: "active", pc_is_single_choice: true } }),
        201,
    ).pc_id;
    ids.addonCategory = expectStatus(await api.callApi("POST", "/V1/product-categories", { body: { pc_name: "งานเพิ่ม", pc_sort_order: 1, pc_status: "active" } }), 201).pc_id;
    const product = (name, price, extra = {}) => ({
        product_code: null, product_name: name, product_description: null, product_unit: "งาน", product_price: price,
        product_category_id: ids.addonCategory, product_status: "active", product_is_public: true, ...extra,
    });
    ids.topic = expectStatus(await api.callApi("POST", "/V1/products", { body: product("เพิ่มหัวข้อ", "400") }), 201).product_id;
    ids.form = expectStatus(await api.callApi("POST", "/V1/products", { body: product("ฟอร์มติดต่อ", "700") }), 201).product_id;
    ids.blog = expectStatus(await api.callApi("POST", "/V1/products", { body: product("หน้าบทความ", "1500") }), 201).product_id;
    ids.rush = expectStatus(await api.callApi("POST", "/V1/products", { body: product("งานด่วน", "0", { product_price_mode: "percent", product_percent: "30" }) }), 201).product_id;
    const packageBody = (name, price, extra = {}) => ({
        pkg_name: name, pkg_description: null, pkg_category_id: ids.packageCategory, pkg_status: "active", pkg_is_public: true,
        items: [{ pki_type: "item", pki_product_id: null, pki_description: name, pki_quantity: "1", pki_unit: "งาน", pki_unit_price: price }],
        ...extra,
    });
    ids.onePage = expectStatus(await api.callApi("POST", "/V1/product-packages", { body: packageBody("เว็บหน้าเดียว", "1900", { addon_rules: [{ product_id: ids.blog, rule: "not_available" }] }) }), 201).pkg_id;
    ids.business = expectStatus(await api.callApi("POST", "/V1/product-packages", { body: packageBody("เว็บธุรกิจ", "4900", { addon_rules: [{ product_id: ids.form, rule: "included" }] }) }), 201).pkg_id;
    // ชุดที่ไม่เปิดหน้าร้าน: ทีมล็อกให้ในลิงก์ได้
    ids.custom = expectStatus(await api.callApi("POST", "/V1/product-packages", { body: packageBody("เว็บตามตกลง", "8000", { pkg_is_public: false }) }), 201).pkg_id;
    ids.publicLink = expectStatus(await api.callApi("POST", "/V1/order-links", { body: { ol_kind: "public", ol_name: "หน้าเว็บ", ol_assignee_id: adminId } }), 201);
});

test.after(async () => {
    await api?.stop();
});

test("ลิงก์ล็อกรายการ: ไม่ให้เลือกเพิ่มต้องมีรายการ · ลูกค้าเห็นรายการล็อก · ส่งได้โดยไม่เลือกเพิ่ม · แก้จำนวนจากเบราว์เซอร์ไม่ได้", async () => {
    const empty = expectStatus(await api.callApi("POST", "/V1/order-links", { body: { ol_kind: "public", ol_name: "ว่าง", ol_assignee_id: adminId, ol_allow_more: false } }), 400);
    assert.ok(empty.fields.preset_items);

    const link = expectStatus(
        await api.callApi("POST", "/V1/order-links", {
            body: { ol_kind: "personal", ol_assignee_id: adminId, ol_allow_more: true, category_ids: [ids.addonCategory], preset_items: [{ kind: "package", id: ids.custom, quantity: 1 }] },
        }),
        201,
    );
    assert.deepEqual(link.preset_items.map((item) => [item.kind, item.name, item.quantity, item.is_available]), [["package", "เว็บตามตกลง", 1, true]]);

    const shop = expectStatus(await anonymous("GET", `/V1/order/${link.ol_short_code}`), 200);
    assert.equal(shop.preset[0].package.pkg_name, "เว็บตามตกลง");
    assert.ok(shop.catalog.products.some((row) => row.product_id === ids.topic), "เลือกงานเพิ่มได้");
    assert.ok(!shop.catalog.packages.length, "หมวดที่เปิดมีแต่งานเพิ่ม");

    const contact = { contact_name: "คุณมะลิ", contact_phone: "0811112222", consent: true };
    // ส่งรายการล็อกซ้ำมาพร้อมจำนวน 5 = ไม่นับ (ใช้จำนวนของลิงก์) · เพิ่มหัวข้อ 2 = 800 → 8,800
    const sent = expectStatus(
        await anonymous("POST", `/V1/order/${link.ol_short_code}/requests`, submitBody([{ kind: "package", id: ids.custom, quantity: 5 }, { kind: "product", id: ids.topic, quantity: 2 }], "8800.00", { contact })),
        201,
    );
    const detail = expectStatus(await api.callApi("GET", `/V1/service-requests/${sent.svr_id}`), 200);
    assert.deepEqual(detail.items.map((row) => [row.svi_name, row.svi_quantity, row.svi_is_preset]), [
        ["เว็บตามตกลง", "1.00", true],
        ["เว็บตามตกลง", "1.00", true],
        ["เพิ่มหัวข้อ", "2.00", false],
    ]);
    assert.equal(detail.totals.total, "8800.00");

    const lockedOnly = expectStatus(
        await api.callApi("POST", "/V1/order-links", { body: { ol_kind: "public", ol_name: "ล็อกอย่างเดียว", ol_assignee_id: adminId, ol_allow_more: false, preset_items: [{ kind: "package", id: ids.business, quantity: 1 }] } }),
        201,
    );
    const lockedShop = expectStatus(await anonymous("GET", `/V1/order/${lockedOnly.ol_short_code}`), 200);
    assert.equal(lockedShop.allow_more, false);
    assert.equal(lockedShop.catalog.products.length + lockedShop.catalog.packages.length, 0);
    expectStatus(await anonymous("POST", `/V1/order/${lockedOnly.ol_short_code}/requests`, submitBody([], "4900.00", { contact })), 201);
    expectStatus(await anonymous("POST", `/V1/order/${lockedOnly.ol_short_code}/requests`, submitBody([{ kind: "product", id: ids.topic, quantity: 1 }], "5300.00", { contact })), 409);
});

test("รายการล็อกใช้ไม่ได้แล้ว = ลิงก์ใช้ไม่ได้ชั่วคราว · ลบชุด/สินค้าที่ลิงก์ล็อกไว้ไม่ได้", async () => {
    const temporary = expectStatus(
        await api.callApi("POST", "/V1/product-packages", {
            body: {
                pkg_name: "ชุดชั่วคราว", pkg_description: null, pkg_category_id: null, pkg_status: "active", pkg_is_public: false,
                items: [{ pki_type: "item", pki_product_id: null, pki_description: "งาน", pki_quantity: "1", pki_unit: "งาน", pki_unit_price: "100" }],
            },
        }),
        201,
    ).pkg_id;
    const link = expectStatus(await api.callApi("POST", "/V1/order-links", { body: { ol_kind: "public", ol_name: "ชั่วคราว", ol_assignee_id: adminId, preset_items: [{ kind: "package", id: temporary, quantity: 1 }] } }), 201);
    const deleteBlocked = expectStatus(await api.callApi("DELETE", `/V1/product-packages/${temporary}`), 409);
    assert.equal(deleteBlocked.code, "PACKAGE_IN_USE");
    await api.pool.query("UPDATE tb_product_packages SET pkg_status = 'inactive' WHERE pkg_id = ?", [temporary]);
    const shop = expectStatus(await anonymous("GET", `/V1/order/${link.ol_short_code}`), 200);
    assert.equal(shop.link.state, "unavailable");
    const listed = expectStatus(await api.callApi("GET", "/V1/order-links"), 200).data.find((row) => row.ol_id === link.ol_id);
    assert.equal(listed.has_preset_problem, true);
    const contact = { contact_name: "คุณชั่วคราว", contact_phone: "0899998888", consent: true };
    expectStatus(await anonymous("POST", `/V1/order/${link.ol_short_code}/requests`, submitBody([{ kind: "product", id: ids.topic, quantity: 1 }], "500.00", { contact })), 409);
});

test("หมวดเลือกได้อย่างเดียว · งานเพิ่มที่มีในแพ็กแล้ว/ใช้กับแพ็กไม่ได้ ส่งไม่ได้", async () => {
    const code = ids.publicLink.ol_short_code;
    const contact = { contact_name: "คุณดาว", contact_phone: "0822223333", consent: true };
    const twoPackages = expectStatus(
        await anonymous("POST", `/V1/order/${code}/requests`, submitBody([{ kind: "package", id: ids.onePage, quantity: 1 }, { kind: "package", id: ids.business, quantity: 1 }], "6800.00", { contact })),
        409,
    );
    assert.equal(twoPackages.code, "ORDER_CART_RULE");
    assert.match(twoPackages.message, /เลือกได้ 1 รายการ/);
    const included = expectStatus(
        await anonymous("POST", `/V1/order/${code}/requests`, submitBody([{ kind: "package", id: ids.business, quantity: 1 }, { kind: "product", id: ids.form, quantity: 1 }], "5600.00", { contact })),
        409,
    );
    assert.match(included.message, /มีใน เว็บธุรกิจ แล้ว/);
    const notAvailable = expectStatus(
        await anonymous("POST", `/V1/order/${code}/requests`, submitBody([{ kind: "package", id: ids.onePage, quantity: 1 }, { kind: "product", id: ids.blog, quantity: 1 }], "3400.00", { contact })),
        409,
    );
    assert.match(notAvailable.message, /ใช้กับ เว็บหน้าเดียว ไม่ได้/);
    // ไม่มีแพ็กในตะกร้า = งานเพิ่มเลือกได้ทุกอย่าง
    expectStatus(await anonymous("POST", `/V1/order/${code}/requests`, submitBody([{ kind: "product", id: ids.form, quantity: 1 }], "700.00", { contact })), 201);

    const shop = expectStatus(await anonymous("GET", `/V1/order/${code}`), 200);
    assert.equal(shop.catalog.categories.find((row) => row.pc_id === ids.packageCategory).pc_is_single_choice, true);
    assert.deepEqual(shop.catalog.packages.find((row) => row.pkg_id === ids.business).addon_rules, [{ product_id: ids.form, rule: "included" }]);
    const detail = expectStatus(await api.callApi("GET", `/V1/product-packages/${ids.business}`), 200);
    assert.deepEqual(detail.addon_rules.map((rule) => [rule.product_name, rule.rule]), [["ฟอร์มติดต่อ", "included"]]);
});

test("งานด่วน +30%: ยอดจากแถวอื่น · ทีมปรับแล้วคิดใหม่ · ใบเสนอราคาได้ยอดที่คิดแล้ว · อยู่ในชุดไม่ได้", async () => {
    const code = ids.publicLink.ol_short_code;
    const contact = { contact_name: "คุณด่วน", contact_phone: "0833334444", consent: true };
    // เว็บธุรกิจ 4,900 + หัวข้อ 1 (400) = 5,300 · ด่วน 30% = 1,590 → 6,890 (จำนวนด่วนส่งมา 3 = นับ 1)
    const wrongTotal = expectStatus(
        await anonymous("POST", `/V1/order/${code}/requests`, submitBody([{ kind: "package", id: ids.business, quantity: 1 }, { kind: "product", id: ids.topic, quantity: 1 }, { kind: "product", id: ids.rush, quantity: 3 }], "5300.00", { contact })),
        409,
    );
    assert.equal(wrongTotal.fields.total, "6890.00");
    const sent = expectStatus(
        await anonymous("POST", `/V1/order/${code}/requests`, submitBody([{ kind: "package", id: ids.business, quantity: 1 }, { kind: "product", id: ids.topic, quantity: 1 }, { kind: "product", id: ids.rush, quantity: 3 }], "6890.00", { contact })),
        201,
    );
    const status = expectStatus(await anonymous("GET", `/V1/order/requests/${sent.access_token}`), 200);
    assert.equal(status.items.find((row) => row.name === "งานด่วน").unit_price, "1590.00");

    let detail = expectStatus(await api.callApi("GET", `/V1/service-requests/${sent.svr_id}`), 200);
    const rushRow = detail.items.find((row) => row.svi_name === "งานด่วน");
    assert.equal(rushRow.percent_amount, "1590.00");
    assert.equal(rushRow.svi_unit_price, null, "ไม่เก็บยอดซ้ำ");
    // ทีมเพิ่มหัวข้อเป็น 3 → ฐาน 4,900 + 1,200 = 6,100 · ด่วน 1,830 → 7,930
    const topicRow = detail.items.find((row) => row.svi_name === "เพิ่มหัวข้อ");
    detail = expectStatus(
        await api.callApi("PUT", `/V1/service-requests/${sent.svr_id}/items`, {
            body: {
                svr_version: detail.request.svr_version,
                items: detail.items
                    .filter((row) => row.svi_type === "item")
                    .map((row) => ({
                        svi_id: row.svi_id, product_id: row.svi_product_id, name: row.svi_name, unit: row.svi_unit,
                        unit_price: row.svi_unit_price ?? "0", quantity: row.svi_id === topicRow.svi_id ? "3" : row.svi_quantity, is_removed: false,
                    })),
            },
        }),
        200,
    );
    assert.equal(detail.totals.total, "7930.00");
    assert.equal(detail.submitted_totals.total, "6890.00");

    const client = expectStatus(await api.callApi("POST", "/V1/clients", { body: { client_name: "ร้านด่วน" } }), 201).client_id;
    detail = expectStatus(await api.callApi("PUT", `/V1/service-requests/${sent.svr_id}/client`, { body: { svr_version: detail.request.svr_version, client_id: client } }), 200);
    const confirmed = expectStatus(await api.callApi("POST", `/V1/service-requests/${sent.svr_id}/confirm`, { body: { svr_version: detail.request.svr_version, create_quotation: true } }), 200);
    const quotation = expectStatus(await api.callApi("GET", `/V1/quotations/${confirmed.qt_id}`), 200);
    const rushLine = quotation.items.find((row) => row.qti_description === "งานด่วน");
    assert.deepEqual([rushLine.qti_quantity, rushLine.qti_unit_price], ["1.00", "1830.00"]);

    const inPackage = expectStatus(
        await api.callApi("POST", "/V1/product-packages", {
            body: {
                pkg_name: "ชุดด่วน", pkg_description: null, pkg_category_id: null, pkg_status: "active",
                items: [{ pki_type: "item", pki_product_id: ids.rush, pki_description: "งานด่วน", pki_quantity: "1", pki_unit: "งาน", pki_unit_price: "0" }],
            },
        }),
        400,
    );
    assert.match(inPackage.message, /คิดเป็น %/);
});

test("กลุ่มคำถามผูกแพ็ก: ถามเฉพาะเมื่อเลือกแพ็กนั้น", async () => {
    const group = expectStatus(
        await api.callApi("POST", "/V1/requirement-groups", {
            body: { rqg_name: "ระบบที่ต้องการ", rqg_description: null, rqg_trigger: "selection", rqg_sort_order: 9, rqg_status: "active", category_ids: [], package_ids: [ids.business] },
        }),
        201,
    );
    const question = expectStatus(
        await api.callApi("POST", `/V1/requirement-groups/${group.rqg_id}/questions`, {
            body: { rqq_text: "ต้องการระบบไหน", rqq_help: null, rqq_type: "single", rqq_options: ["จองคิว", "รับออเดอร์"], rqq_is_required: true, rqq_status: "active" },
        }),
        201,
    );
    const code = ids.publicLink.ol_short_code;
    const contact = { contact_name: "คุณถาม", contact_phone: "0844445555", consent: true };
    const missing = expectStatus(await anonymous("POST", `/V1/order/${code}/requests`, submitBody([{ kind: "package", id: ids.business, quantity: 1 }], "4900.00", { contact })), 400);
    assert.ok(missing.fields[`answers.${question.rqq_id}`]);
    expectStatus(
        await anonymous("POST", `/V1/order/${code}/requests`, submitBody([{ kind: "package", id: ids.business, quantity: 1 }], "4900.00", { contact, answers: [{ question_id: question.rqq_id, value: "จองคิว" }] })),
        201,
    );
    expectStatus(await anonymous("POST", `/V1/order/${code}/requests`, submitBody([{ kind: "package", id: ids.onePage, quantity: 1 }], "1900.00", { contact })), 201);
    const groups = expectStatus(await api.callApi("GET", "/V1/requirement-groups"), 200).data;
    assert.deepEqual(groups.find((row) => row.rqg_id === group.rqg_id).package_ids, [ids.business]);
});
