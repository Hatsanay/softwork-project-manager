// สินค้าที่แสดงเมื่อเลือกบางชุดเท่านั้น (2026-11-02 · docs/plans/2026-11-02-product-only-with-package.md)
// ตั้งที่ฟอร์มสินค้า · บันทึกสินค้า/ชุดไม่ลบกติกาของกันและกัน · ชนกับกติกาเดิม = 400
// ส่งคำขอ/ออกใบจากตะกร้า: สินค้าเฉพาะชุดต้องมีชุดที่รองรับ (นับชุดที่ทีมล็อกไว้) · ชุดปิดใช้งาน = ไม่มีตะกร้าไหนรองรับ
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const { startTestServer } = require("./support/test-server");
const { isSupportedByCart, unsupportedProductIds } = require("../src/shared/addon-rules.mjs");

let api;
let adminId;
const ids = {};

const anonymous = (method, url, body) => api.callApi(method, url, { token: null, body });

function expectStatus(response, status, note) {
    assert.equal(response.status, status, `${note ?? ""} ${JSON.stringify(response.body)}`);
    return response.body;
}

const contact = { contact_name: "คุณภาษา", contact_phone: "0812345678", consent: true };
const submitBody = (items, seenTotal) => ({ submit_key: crypto.randomUUID(), items, seen_total: seenTotal, answers: [], contact });

const productBody = (name, price, extra = {}) => ({
    product_code: null, product_name: name, product_description: null, product_unit: "งาน", product_price: price,
    product_category_id: null, product_status: "active", product_is_public: true, ...extra,
});

const packageBody = (name, price, extra = {}) => ({
    pkg_name: name, pkg_description: null, pkg_category_id: null, pkg_status: "active", pkg_is_public: true,
    items: [{ pki_type: "item", pki_product_id: null, pki_description: name, pki_quantity: "1", pki_unit: "งาน", pki_unit_price: price }],
    ...extra,
});

test.before(async () => {
    api = await startTestServer("product_only_with");
    await api.loginAsAdmin();
    const [[admin]] = await api.pool.query("SELECT user_id FROM tb_users WHERE user_username = 'admin'");
    adminId = admin.user_id;
    await api.pool.query("UPDATE tb_requirement_groups SET rqg_status = 'inactive'");
    ids.twoLanguages = expectStatus(await api.callApi("POST", "/V1/product-packages", { body: packageBody("เว็บ 2 ภาษา", "8000") }), 201).pkg_id;
    ids.business = expectStatus(await api.callApi("POST", "/V1/product-packages", { body: packageBody("เว็บธุรกิจ", "6000") }), 201).pkg_id;
    ids.onePage = expectStatus(await api.callApi("POST", "/V1/product-packages", { body: packageBody("เว็บหน้าเดียว", "1900") }), 201).pkg_id;
    ids.page = expectStatus(await api.callApi("POST", "/V1/products", { body: productBody("หน้าเพิ่ม", "1500") }), 201).product_id;
    ids.thirdLanguage = expectStatus(
        await api.callApi("POST", "/V1/products", {
            body: productBody("เพิ่มภาษาที่ 3", "2500", { only_with_package_ids: [ids.twoLanguages, ids.business] }),
        }),
        201,
    ).product_id;
    ids.publicLink = expectStatus(await api.callApi("POST", "/V1/order-links", { body: { ol_kind: "public", ol_name: "หน้าเว็บ", ol_assignee_id: adminId } }), 201);
});

test.after(async () => {
    await api?.stop();
});

test("ฟังก์ชันกลาง: ไม่ผูกชุด = ขายได้เสมอ · ผูกไว้ต้องมีชุดใดชุดหนึ่ง · เอาชุดออกแล้วสินค้าหลุด", () => {
    assert.equal(isSupportedByCart([], []), true);
    assert.equal(isSupportedByCart(["K1", "K2"], ["K9"]), false);
    assert.equal(isSupportedByCart(["K1", "K2"], ["K9", "K2"]), true);
    assert.deepEqual(
        unsupportedProductIds(
            [
                { id: "P1", only_with_package_ids: ["K1"] },
                { id: "P2", only_with_package_ids: [] },
                { id: "P3", only_with_package_ids: ["K2"] },
            ],
            ["K2"],
        ),
        ["P1"],
    );
});

test("ตั้งที่ฟอร์มสินค้า: อ่านกลับมาพร้อมชื่อชุด · บันทึกชุด (กติกางานเพิ่ม) ไม่ลบ · บันทึกสินค้าไม่ลบกติกาของชุด · ชนกัน = 400", async () => {
    const product = expectStatus(await api.callApi("GET", `/V1/products/${ids.thirdLanguage}`), 200);
    assert.deepEqual(product.only_with_packages.map((row) => row.pkg_name).sort(), ["เว็บ 2 ภาษา", "เว็บธุรกิจ"]);
    assert.equal(Number(product.only_with_count), 2);
    // รายการสินค้าแนบชุดมาด้วย (ฟอร์มแก้เปิดจากแถว) · บันทึกโดยไม่ส่งช่องนี้ (หน้าเว็บเก่า) = ไม่ล้างของเดิม
    const list = expectStatus(await api.callApi("GET", "/V1/products?search=ภาษาที่ 3"), 200);
    assert.equal(list.data[0].only_with_packages.length, 2);
    expectStatus(await api.callApi("PUT", `/V1/products/${ids.thirdLanguage}`, { body: productBody("เพิ่มภาษาที่ 3", "2500") }), 200);
    assert.equal(expectStatus(await api.callApi("GET", `/V1/products/${ids.thirdLanguage}`), 200).only_with_packages.length, 2);

    // ชุดหน้าเดียวตั้ง "ใช้กับแพ็กนี้ไม่ได้" ให้หน้าเพิ่ม → บันทึกสินค้า "หน้าเพิ่ม" แบบไม่ผูกชุด ต้องไม่ลบกติกานี้
    expectStatus(
        await api.callApi("PUT", `/V1/product-packages/${ids.onePage}`, {
            body: packageBody("เว็บหน้าเดียว", "1900", { addon_rules: [{ product_id: ids.page, rule: "not_available" }] }),
        }),
        200,
    );
    expectStatus(await api.callApi("PUT", `/V1/products/${ids.page}`, { body: productBody("หน้าเพิ่ม", "1500") }), 200);
    const onePage = expectStatus(await api.callApi("GET", `/V1/product-packages/${ids.onePage}`), 200);
    assert.deepEqual(onePage.addon_rules.map((rule) => [rule.product_id, rule.rule]), [[ids.page, "not_available"]]);

    // บันทึกชุด 2 ภาษา (ไม่มีกติกา) ต้องไม่ลบ "ขายคู่กับชุดนี้" ที่ตั้งจากสินค้า · ฟอร์มชุดเห็นเป็นรายการอ่านอย่างเดียว
    expectStatus(await api.callApi("PUT", `/V1/product-packages/${ids.twoLanguages}`, { body: packageBody("เว็บ 2 ภาษา", "8000", { addon_rules: [] }) }), 200);
    const twoLanguages = expectStatus(await api.callApi("GET", `/V1/product-packages/${ids.twoLanguages}`), 200);
    assert.deepEqual(twoLanguages.addon_rules, []);
    assert.deepEqual(twoLanguages.only_with_products.map((row) => row.product_id), [ids.thirdLanguage]);

    // ชนกัน: ตั้งกติกาของชุดซ้อนกับสินค้าที่ขายคู่ชุดนั้น / ผูกสินค้ากับชุดที่ตั้งกติกาไว้แล้ว
    const packageConflict = expectStatus(
        await api.callApi("PUT", `/V1/product-packages/${ids.twoLanguages}`, {
            body: packageBody("เว็บ 2 ภาษา", "8000", { addon_rules: [{ product_id: ids.thirdLanguage, rule: "included" }] }),
        }),
        400,
    );
    assert.match(packageConflict.fields.addon_rules, /เพิ่มภาษาที่ 3/);
    const productConflict = expectStatus(
        await api.callApi("PUT", `/V1/products/${ids.page}`, { body: productBody("หน้าเพิ่ม", "1500", { only_with_package_ids: [ids.onePage] }) }),
        400,
    );
    assert.match(productConflict.fields.only_with_package_ids, /เว็บหน้าเดียว/);
});

test("หน้าร้าน: แค็ตตาล็อกบอกชุดที่ขายคู่ · ส่งคำขอไม่มีชุดที่รองรับ = 409 · มีชุด = ส่งได้ · ชุดที่ทีมล็อกไว้นับ", async () => {
    const shop = expectStatus(await anonymous("GET", `/V1/order/${ids.publicLink.ol_short_code}`), 200);
    const listed = shop.catalog.products.find((row) => row.product_id === ids.thirdLanguage);
    assert.deepEqual(listed.only_with_packages.map((row) => row.id).sort(), [ids.business, ids.twoLanguages].sort());

    const alone = expectStatus(
        await anonymous("POST", `/V1/order/${ids.publicLink.ol_short_code}/requests`, submitBody([{ kind: "product", id: ids.thirdLanguage, quantity: 1 }], "2500.00")),
        409,
    );
    assert.equal(alone.code, "ORDER_CART_RULE", "กติกาตะกร้าเดียวกับมีในแพ็กแล้ว/ใช้ไม่ได้");
    assert.match(alone.message, /ขายคู่กับ เว็บ 2 ภาษา หรือ เว็บธุรกิจ/);
    expectStatus(
        await anonymous(
            "POST",
            `/V1/order/${ids.publicLink.ol_short_code}/requests`,
            submitBody(
                [
                    { kind: "package", id: ids.business, quantity: 1 },
                    { kind: "product", id: ids.thirdLanguage, quantity: 1 },
                ],
                "8500.00",
            ),
        ),
        201,
    );

    // ทีมล็อกชุด 2 ภาษาไว้ในลิงก์ → ลูกค้าเลือกภาษาที่ 3 เพิ่มได้
    const lockedLink = expectStatus(
        await api.callApi("POST", "/V1/order-links", {
            body: { ol_kind: "public", ol_name: "ลิงก์ล็อกชุด", ol_assignee_id: adminId, preset_items: [{ kind: "package", id: ids.twoLanguages, quantity: 1 }] },
        }),
        201,
    );
    expectStatus(
        await anonymous("POST", `/V1/order/${lockedLink.ol_short_code}/requests`, submitBody([{ kind: "product", id: ids.thirdLanguage, quantity: 1 }], "10500.00")),
        201,
    );
});

test("ออกใบจากตะกร้า (ตัวคิดราคา) ตรวจเหมือนกัน · ชุดที่ผูกปิดใช้งานหมด = ขายไม่ได้", async () => {
    const line = { kind: "product", id: ids.thirdLanguage, quantity: 1 };
    const blocked = expectStatus(await api.callApi("POST", "/V1/quotations/from-cart", { body: { client_name: "ลูกค้าภาษา", qt_title: "เพิ่มภาษา", lines: [line] } }), 400);
    assert.match(blocked.fields.lines, /ขายคู่กับ/);
    expectStatus(
        await api.callApi("POST", "/V1/quotations/from-cart", {
            body: { client_name: "ลูกค้าภาษา", qt_title: "เว็บ 2 ภาษา", lines: [{ kind: "package", id: ids.twoLanguages, quantity: 1 }, line] },
        }),
        201,
    );

    await api.pool.query("UPDATE tb_product_packages SET pkg_status = 'inactive' WHERE pkg_id IN (?)", [[ids.twoLanguages, ids.business]]);
    const catalog = expectStatus(await api.callApi("GET", "/V1/price-calculator/catalog"), 200);
    const product = catalog.catalog.products.find((row) => row.product_id === ids.thirdLanguage);
    assert.deepEqual(product.only_with_packages.map((row) => row.id), [""], "ชุดปิดหมด = ไม่มีตะกร้าไหนรองรับ");
    await api.pool.query("UPDATE tb_product_packages SET pkg_status = 'active' WHERE pkg_id IN (?)", [[ids.twoLanguages, ids.business]]);
});
