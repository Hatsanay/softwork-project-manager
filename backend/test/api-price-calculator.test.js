// ตัวคิดราคา: ออกใบเสนอราคาจากตะกร้า (2026-11-01 · docs/plans/2026-11-01-calculator-direct-quotation.md)
// ชุด = หัวข้อ + รายการในชุด · ราคาเริ่มต้นใช้ราคาที่ทีมกรอก (รวมแถวในชุด) · งานเพิ่มแบบ % คิดจากยอดรายการอื่นตอนออก
// ลูกค้าใหม่จากชื่อ · ร่างให้ตรวจก่อน · จ่ายครั้งเดียว · แค็ตตาล็อกรวมรายการที่ไม่อยู่บนหน้าร้าน
const test = require("node:test");
const assert = require("node:assert/strict");
const { startTestServer } = require("./support/test-server");

let api;
const ids = {};

function expectStatus(response, status, note) {
    assert.equal(response.status, status, `${note ?? ""} ${JSON.stringify(response.body)}`);
    return response.body;
}

test.before(async () => {
    api = await startTestServer("price_calculator");
    await api.loginAsAdmin();
    const product = (name, price, extra = {}) => ({
        product_code: null, product_name: name, product_description: null, product_unit: "งาน", product_price: price,
        product_category_id: null, product_status: "active", product_is_public: true, ...extra,
    });
    ids.page = expectStatus(await api.callApi("POST", "/V1/products", { body: product("หน้าเพิ่ม", "1500", { product_unit: "หน้า" }) }), 201).product_id;
    ids.domain = expectStatus(
        await api.callApi("POST", "/V1/products", { body: product("จดโดเมน", "650", { product_unit: "ปี", product_price_mode: "from", product_price_note: "นามสกุลโดเมน" }) }),
        201,
    ).product_id;
    ids.rush = expectStatus(await api.callApi("POST", "/V1/products", { body: product("งานด่วน", "0", { product_price_mode: "percent", product_percent: "30" }) }), 201).product_id;
    ids.hidden = expectStatus(await api.callApi("POST", "/V1/products", { body: product("งานพิเศษ", "2000", { product_is_public: false }) }), 201).product_id;
    ids.package = expectStatus(
        await api.callApi("POST", "/V1/product-packages", {
            body: {
                pkg_name: "เว็บพร้อมโดเมน", pkg_description: null, pkg_category_id: null, pkg_status: "active", pkg_is_public: true,
                items: [
                    { pki_type: "item", pki_product_id: null, pki_description: "ทำเว็บ", pki_quantity: "1", pki_unit: "งาน", pki_unit_price: "4000" },
                    { pki_type: "item", pki_product_id: ids.domain, pki_description: "จดโดเมนปีแรก", pki_quantity: "1", pki_unit: "ปี", pki_unit_price: null },
                ],
            },
        }),
        201,
    ).pkg_id;
});

test.after(async () => {
    await api?.stop();
});

test("แค็ตตาล็อกของตัวคิดราคารวมสินค้าที่ไม่อยู่บนหน้าร้าน (บอกว่าไม่อยู่)", async () => {
    const catalog = expectStatus(await api.callApi("GET", "/V1/price-calculator/catalog"), 200);
    const hidden = catalog.catalog.products.find((row) => row.product_id === ids.hidden);
    assert.equal(hidden.product_is_public, false);
});

test("ออกร่างใบจากตะกร้า: ชุด + ราคาเริ่มต้นที่กรอก + งานเพิ่ม % · ลูกค้าใหม่จากชื่อ · จ่ายครั้งเดียว", async () => {
    const missingClient = expectStatus(
        await api.callApi("POST", "/V1/quotations/from-cart", { body: { qt_title: "เว็บร้าน", lines: [{ kind: "product", id: ids.page, quantity: 1 }] } }),
        400,
    );
    assert.ok(missingClient.fields.client_name);

    const created = expectStatus(
        await api.callApi("POST", "/V1/quotations/from-cart", {
            body: {
                client_name: "ร้านกาแฟริมทะเล",
                qt_title: "เว็บร้านกาแฟ",
                lines: [
                    { kind: "product", id: ids.rush, quantity: 1 },
                    { kind: "package", id: ids.package, quantity: 1 },
                    { kind: "product", id: ids.page, quantity: 2 },
                    { kind: "product", id: ids.domain, quantity: 1 },
                ],
                starting_prices: { [ids.domain]: "900" },
            },
        }),
        201,
    );
    const detail = expectStatus(await api.callApi("GET", `/V1/quotations/${created.qt_id}`), 200);
    assert.equal(detail.quotation.qt_status, "draft");
    assert.equal(detail.quotation.qt_payment_mode, "single");
    assert.deepEqual(
        detail.items.map((item) => [item.qti_type, item.qti_description, item.qti_quantity, item.qti_unit_price, item.qti_list_price]),
        [
            ["heading", "เว็บพร้อมโดเมน", null, null, null],
            ["item", "ทำเว็บ", "1.00", "4000.00", null],
            ["item", "จดโดเมนปีแรก", "1.00", "900.00", "650.00"],
            ["item", "หน้าเพิ่ม", "2.00", "1500.00", "1500.00"],
            ["item", "จดโดเมน", "1.00", "900.00", "650.00"],
            // 30% ของ 4,000 + 900 + 3,000 + 900 = 8,800
            ["item", "งานด่วน (+30% ของยอดรายการอื่น)", "1.00", "2640.00", null],
        ],
    );
    const [[client]] = await api.pool.query("SELECT client_name, client_type FROM tb_clients WHERE client_id = ?", [created.client_id]);
    assert.deepEqual({ ...client }, { client_name: "ร้านกาแฟริมทะเล", client_type: "individual" });
});

test("ลูกค้าเดิม · รายการที่ปิดใช้งานแล้ว = ให้โหลดหน้าใหม่", async () => {
    const clientId = expectStatus(await api.callApi("POST", "/V1/clients", { body: { client_name: "ลูกค้าเดิม" } }), 201).client_id;
    const created = expectStatus(
        await api.callApi("POST", "/V1/quotations/from-cart", {
            body: { client_id: clientId, qt_title: "งานพิเศษ", lines: [{ kind: "product", id: ids.hidden, quantity: 1 }] },
        }),
        201,
    );
    assert.equal(created.client_id, clientId);
    await api.pool.query("UPDATE tb_products SET product_status = 'inactive' WHERE product_id = ?", [ids.hidden]);
    const unavailable = expectStatus(
        await api.callApi("POST", "/V1/quotations/from-cart", {
            body: { client_id: clientId, qt_title: "งานพิเศษ", lines: [{ kind: "product", id: ids.hidden, quantity: 1 }] },
        }),
        409,
    );
    assert.equal(unavailable.code, "CART_ITEM_UNAVAILABLE");
});

test("ผูกโปรเจกต์เดิมของลูกค้า: เลือกได้เฉพาะโปรเจกต์ที่ยังไม่ปิดของลูกค้ารายนั้น · ลูกค้าใหม่ผูกไม่ได้", async () => {
    const clientId = expectStatus(await api.callApi("POST", "/V1/clients", { body: { client_name: "ลูกค้ามีงาน" } }), 201).client_id;
    const otherClientId = expectStatus(await api.callApi("POST", "/V1/clients", { body: { client_name: "ลูกค้าอื่น" } }), 201).client_id;
    const project = expectStatus(await api.callApi("POST", "/V1/projects", { body: { project_name: "เว็บเดิม", client_id: clientId } }), 201);
    const projectId = project.project_id ?? project.data?.project_id;
    const options = expectStatus(await api.callApi("GET", `/V1/price-calculator/client-projects?client_id=${clientId}`), 200);
    assert.deepEqual(options.data.map((row) => row.project_id), [projectId]);

    const line = [{ kind: "product", id: ids.page, quantity: 1 }];
    const wrongClient = expectStatus(
        await api.callApi("POST", "/V1/quotations/from-cart", { body: { client_id: otherClientId, project_id: projectId, qt_title: "งานเพิ่ม", lines: line } }),
        400,
    );
    assert.ok(wrongClient.fields.project_id);
    expectStatus(await api.callApi("POST", "/V1/quotations/from-cart", { body: { client_name: "ใหม่", project_id: projectId, qt_title: "งานเพิ่ม", lines: line } }), 400);
    const linked = expectStatus(
        await api.callApi("POST", "/V1/quotations/from-cart", { body: { client_id: clientId, project_id: projectId, qt_title: "งานเพิ่ม", lines: line } }),
        201,
    );
    const [[quotation]] = await api.pool.query("SELECT qt_project_id FROM tb_quotations WHERE qt_id = ?", [linked.qt_id]);
    assert.equal(quotation.qt_project_id, projectId);
});
