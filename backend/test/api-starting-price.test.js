// สินค้าราคาเริ่มต้น (2026-11-01 · docs/plans/2026-11-01-starting-price.md)
// ตั้งที่สินค้า · คำขอจำแถวราคาเริ่มต้น · ห้ามออกเอกสารก่อนตรวจราคา · ราคาสูงขึ้นแล้วเปิดงานตรง = ลูกค้ายืนยันในหน้าสถานะ
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

const contact = { contact_name: "คุณโดเมน", contact_phone: "0812345678", consent: true };
const submitBody = (items, seenTotal) => ({ submit_key: crypto.randomUUID(), items, seen_total: seenTotal, answers: [], contact });

async function submitDomain(link = ids.publicLink) {
    const sent = expectStatus(await anonymous("POST", `/V1/order/${link.ol_short_code}/requests`, submitBody([{ kind: "product", id: ids.domain, quantity: 1 }, { kind: "product", id: ids.page, quantity: 1 }], "2150.00")), 201);
    let detail = expectStatus(await api.callApi("GET", `/V1/service-requests/${sent.svr_id}`), 200);
    detail = expectStatus(await api.callApi("PUT", `/V1/service-requests/${sent.svr_id}/client`, { body: { svr_version: detail.request.svr_version, client_id: ids.client } }), 200);
    return { sent, detail, domainRow: detail.items.find((row) => row.svi_product_id === ids.domain) };
}

test.before(async () => {
    api = await startTestServer("starting_price");
    await api.loginAsAdmin();
    const [[admin]] = await api.pool.query("SELECT user_id FROM tb_users WHERE user_username = 'admin'");
    adminId = admin.user_id;
    await api.pool.query("UPDATE tb_requirement_groups SET rqg_status = 'inactive'");
    const product = (name, price, extra = {}) => ({
        product_code: null, product_name: name, product_description: null, product_unit: "ปี", product_price: price,
        product_category_id: null, product_status: "active", product_is_public: true, ...extra,
    });
    ids.domain = expectStatus(
        await api.callApi("POST", "/V1/products", { body: product("จดโดเมน", "650", { product_price_mode: "from", product_price_note: "นามสกุลและชื่อโดเมน" }) }),
        201,
    ).product_id;
    ids.page = expectStatus(await api.callApi("POST", "/V1/products", { body: product("หน้าเพิ่ม", "1500", { product_unit: "หน้า" }) }), 201).product_id;
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
    ids.client = expectStatus(await api.callApi("POST", "/V1/clients", { body: { client_name: "ร้านโดเมนดี", client_phone: "0812345678" } }), 201).client_id;
    ids.publicLink = expectStatus(await api.callApi("POST", "/V1/order-links", { body: { ol_kind: "public", ol_name: "หน้าเว็บ", ol_assignee_id: adminId } }), 201);
});

test.after(async () => {
    await api?.stop();
});

test("ตั้งสินค้าราคาเริ่มต้น: ต้องบอกว่าราคาขึ้นกับอะไร · ลูกค้าเห็นราคาต่ำสุด + เหตุผล · แบบอื่นไม่เก็บเหตุผล", async () => {
    const missing = expectStatus(
        await api.callApi("POST", "/V1/products", {
            body: { product_name: "ทดสอบ", product_price: "100", product_status: "active", product_price_mode: "from", product_price_note: "" },
        }),
        400,
    );
    assert.ok(missing.fields.product_price_note);
    const fixed = expectStatus(
        await api.callApi("POST", "/V1/products", { body: { product_name: "ตายตัว", product_price: "100", product_status: "active", product_price_note: "ไม่ควรเก็บ" } }),
        201,
    );
    assert.equal(fixed.product_price_note, null);
    const shop = expectStatus(await anonymous("GET", `/V1/order/${ids.publicLink.ol_short_code}`), 200);
    const domain = shop.catalog.products.find((row) => row.product_id === ids.domain);
    assert.deepEqual([domain.product_price_mode, domain.product_price, domain.product_price_note], ["from", "650.00", "นามสกุลและชื่อโดเมน"]);
    const productPackage = shop.catalog.packages.find((row) => row.pkg_id === ids.package);
    assert.deepEqual(productPackage.items.map((item) => item.needs_price), [false, true], "ชุดบอกว่าแถวไหนเป็นราคาเริ่มต้น");
});

test("ห้ามออกเอกสารก่อนตรวจราคา · ราคาเดิมกดต่อได้ (ยืนยันว่าใช้ราคาเริ่มต้น) · ใบเสนอราคาใช้ราคาที่ยืนยัน", async () => {
    const { sent, detail, domainRow } = await submitDomain();
    assert.equal(domainRow.svi_needs_price, true);
    assert.deepEqual(detail.price_pending_ids, [domainRow.svi_id]);
    const list = expectStatus(await api.callApi("GET", "/V1/service-requests"), 200);
    assert.equal(list.data.find((row) => row.svr_id === sent.svr_id).price_pending_count, 1);

    const status = expectStatus(await anonymous("GET", `/V1/order/requests/${sent.access_token}`), 200);
    assert.equal(status.price_check.is_estimate, true);
    assert.deepEqual(status.price_check.pending, ["จดโดเมน"]);

    const blocked = expectStatus(await api.callApi("POST", `/V1/service-requests/${sent.svr_id}/confirm`, { body: { svr_version: detail.request.svr_version, create_quotation: true } }), 409);
    assert.equal(blocked.code, "PRICE_NOT_CONFIRMED");
    // แถวอื่น (ไม่ใช่ราคาเริ่มต้น) ยืนยันราคาไม่ได้
    const pageRow = detail.items.find((row) => row.svi_product_id === ids.page);
    expectStatus(await api.callApi("PUT", `/V1/service-requests/${sent.svr_id}/prices`, { body: { svr_version: detail.request.svr_version, prices: [{ svi_id: pageRow.svi_id, unit_price: "1" }] } }), 400);

    const priced = expectStatus(
        await api.callApi("PUT", `/V1/service-requests/${sent.svr_id}/prices`, { body: { svr_version: detail.request.svr_version, prices: [{ svi_id: domainRow.svi_id, unit_price: "650.00" }] } }),
        200,
    );
    const confirmedRow = priced.items.find((row) => row.svi_id === domainRow.svi_id);
    assert.ok(confirmedRow.svi_price_confirmed_at, "ราคาเดิม = ยืนยันแล้ว");
    assert.equal(confirmedRow.svi_adjusted_unit_price, null, "ราคาเท่าเดิมไม่นับว่าปรับ");
    assert.equal(confirmedRow.price_confirmed_by_name, "System Admin");
    assert.deepEqual(priced.price_pending_ids, []);
    const confirmed = expectStatus(await api.callApi("POST", `/V1/service-requests/${sent.svr_id}/confirm`, { body: { svr_version: priced.request.svr_version, create_quotation: true } }), 200);
    assert.ok(confirmed.qt_id);
});

test("แก้ราคาในตาราง = ยืนยันแล้ว · ทีมเพิ่มสินค้าราคาเริ่มต้นเอง = ยืนยันในตัว · เอาแถวออก = ไม่ต้องตรวจ", async () => {
    const { sent, detail, domainRow } = await submitDomain();
    const rows = detail.items
        .filter((row) => row.svi_type === "item")
        .map((row) => ({
            svi_id: row.svi_id, product_id: row.svi_product_id, name: row.svi_name, unit: row.svi_unit,
            unit_price: row.svi_id === domainRow.svi_id ? "990.00" : row.svi_unit_price, quantity: row.svi_quantity, is_removed: false,
        }));
    rows.push({ svi_id: null, product_id: ids.domain, name: "จดโดเมนที่สอง", unit: "ปี", unit_price: "1200.00", quantity: "1.00", is_removed: false });
    const updated = expectStatus(await api.callApi("PUT", `/V1/service-requests/${sent.svr_id}/items`, { body: { svr_version: detail.request.svr_version, items: rows } }), 200);
    assert.deepEqual(updated.price_pending_ids, []);
    const staffRow = updated.items.find((row) => row.svi_added_by_staff);
    assert.deepEqual([staffRow.svi_needs_price, Boolean(staffRow.svi_price_confirmed_at)], [true, true]);

    const second = await submitDomain();
    const removedRows = second.detail.items
        .filter((row) => row.svi_type === "item")
        .map((row) => ({
            svi_id: row.svi_id, product_id: row.svi_product_id, name: row.svi_name, unit: row.svi_unit, unit_price: row.svi_unit_price,
            quantity: row.svi_quantity, is_removed: row.svi_id === second.domainRow.svi_id,
        }));
    const removed = expectStatus(await api.callApi("PUT", `/V1/service-requests/${second.sent.svr_id}/items`, { body: { svr_version: second.detail.request.svr_version, items: removedRows } }), 200);
    assert.deepEqual(removed.price_pending_ids, []);
});

test("เปิดงานตรงแล้วราคาสูงขึ้น: รอลูกค้ายืนยัน · ลูกค้าไม่ตกลง = กลับมาที่ทีม · ไม่ให้ยืนยันต้องมีเหตุผล", async () => {
    const { sent, detail, domainRow } = await submitDomain();
    let current = expectStatus(
        await api.callApi("PUT", `/V1/service-requests/${sent.svr_id}/prices`, { body: { svr_version: detail.request.svr_version, prices: [{ svi_id: domainRow.svi_id, unit_price: "1200" }] } }),
        200,
    );
    assert.deepEqual(current.raised_price_ids, [domainRow.svi_id]);
    const waiting = expectStatus(
        await api.callApi("POST", `/V1/service-requests/${sent.svr_id}/confirm`, { body: { svr_version: current.request.svr_version, create_quotation: false, ask_customer_price: true } }),
        200,
    );
    assert.equal(waiting.awaiting_customer, true);
    current = expectStatus(await api.callApi("GET", `/V1/service-requests/${sent.svr_id}`), 200);
    assert.equal(current.request.svr_status, "awaiting_customer");
    // รอลูกค้าอยู่ ยืนยันซ้ำไม่ได้
    expectStatus(await api.callApi("POST", `/V1/service-requests/${sent.svr_id}/confirm`, { body: { svr_version: current.request.svr_version, create_quotation: false } }), 409);

    let status = expectStatus(await anonymous("GET", `/V1/order/requests/${sent.access_token}`), 200);
    assert.equal(status.progress.stage, "price_confirm");
    assert.deepEqual(status.price_check.adjustments, [{ name: "จดโดเมน", seen_price: "650.00", real_price: "1200.00", note: "นามสกุลและชื่อโดเมน" }]);
    assert.equal(status.price_check.confirmed_totals.total, "2700.00");
    assert.equal(status.totals.total, "2150.00", "ยอดที่ลูกค้าเห็นตอนเลือกยังอยู่");

    status = expectStatus(await anonymous("POST", `/V1/order/requests/${sent.access_token}/price-response`, { response: "declined", note: "แพงไป ขอคุยก่อน" }), 200);
    assert.equal(status.progress.stage, "submitted");
    assert.equal(status.progress.price_declined, true);
    current = expectStatus(await api.callApi("GET", `/V1/service-requests/${sent.svr_id}`), 200);
    assert.deepEqual([current.request.svr_status, current.request.svr_price_response, current.request.svr_price_response_note], ["submitted", "declined", "แพงไป ขอคุยก่อน"]);
    expectStatus(await anonymous("POST", `/V1/order/requests/${sent.access_token}/price-response`, { response: "accepted" }), 409);

    const noReason = expectStatus(
        await api.callApi("POST", `/V1/service-requests/${sent.svr_id}/confirm`, { body: { svr_version: current.request.svr_version, create_quotation: false, ask_customer_price: false } }),
        400,
    );
    assert.ok(noReason.fields.price_skip_reason);
    const started = expectStatus(
        await api.callApi("POST", `/V1/service-requests/${sent.svr_id}/confirm`, {
            body: { svr_version: current.request.svr_version, create_quotation: false, ask_customer_price: false, price_skip_reason: "ลูกค้าตกลงทางโทรศัพท์แล้ว" },
        }),
        200,
    );
    assert.ok(started.project_id);
});

test("ลูกค้ากดยืนยันราคา = เปิดงานให้เลย (ผู้รับคำขอเป็น PM) · ทีมแก้ราคาระหว่างรอ = ลูกค้าต้องยืนยันใหม่", async () => {
    const { sent, detail, domainRow } = await submitDomain();
    let current = expectStatus(
        await api.callApi("PUT", `/V1/service-requests/${sent.svr_id}/prices`, { body: { svr_version: detail.request.svr_version, prices: [{ svi_id: domainRow.svi_id, unit_price: "900" }] } }),
        200,
    );
    expectStatus(await api.callApi("POST", `/V1/service-requests/${sent.svr_id}/confirm`, { body: { svr_version: current.request.svr_version, create_quotation: false } }), 200);
    current = expectStatus(await api.callApi("GET", `/V1/service-requests/${sent.svr_id}`), 200);
    // ทีมเปลี่ยนใจลดราคาลงอีก → กลับไปรอตรวจ (ลูกค้าตอบไม่ได้จนทีมยืนยันใหม่)
    current = expectStatus(
        await api.callApi("PUT", `/V1/service-requests/${sent.svr_id}/prices`, { body: { svr_version: current.request.svr_version, prices: [{ svi_id: domainRow.svi_id, unit_price: "800" }] } }),
        200,
    );
    assert.equal(current.request.svr_status, "submitted");
    expectStatus(await anonymous("POST", `/V1/order/requests/${sent.access_token}/price-response`, { response: "accepted" }), 409);
    expectStatus(await api.callApi("POST", `/V1/service-requests/${sent.svr_id}/confirm`, { body: { svr_version: current.request.svr_version, create_quotation: false } }), 200);

    const status = expectStatus(await anonymous("POST", `/V1/order/requests/${sent.access_token}/price-response`, { response: "accepted" }), 200);
    assert.equal(status.progress.stage, "started");
    current = expectStatus(await api.callApi("GET", `/V1/service-requests/${sent.svr_id}`), 200);
    assert.deepEqual([current.request.svr_status, current.request.svr_price_response], ["converted", "accepted"]);
    const [[project]] = await api.pool.query("SELECT project_created_by FROM tb_projects WHERE project_id = ?", [current.request.svr_project_id]);
    assert.equal(project.project_created_by, adminId);
    // กดซ้ำ = สถานะเดิม
    expectStatus(await anonymous("POST", `/V1/order/requests/${sent.access_token}/price-response`, { response: "accepted" }), 200);
});

test("ราคาลดลง = เปิดงานได้เลยไม่ต้องให้ลูกค้ายืนยัน · ชุดที่มีสินค้าราคาเริ่มต้นต้องตรวจราคา · Fastwork รับงานก่อนตรวจราคาไม่ได้", async () => {
    const { sent, detail, domainRow } = await submitDomain();
    const current = expectStatus(
        await api.callApi("PUT", `/V1/service-requests/${sent.svr_id}/prices`, { body: { svr_version: detail.request.svr_version, prices: [{ svi_id: domainRow.svi_id, unit_price: "500" }] } }),
        200,
    );
    assert.deepEqual(current.raised_price_ids, []);
    const started = expectStatus(await api.callApi("POST", `/V1/service-requests/${sent.svr_id}/confirm`, { body: { svr_version: current.request.svr_version, create_quotation: false } }), 200);
    assert.ok(started.project_id);

    const fastworkLink = expectStatus(await api.callApi("POST", "/V1/order-links", { body: { ol_kind: "fastwork", ol_buyer_name: "buyer_domain", ol_assignee_id: adminId } }), 201);
    const fastworkRequest = expectStatus(
        await anonymous("POST", `/V1/order/${fastworkLink.ol_short_code}/requests`, { submit_key: crypto.randomUUID(), items: [{ kind: "package", id: ids.package, quantity: 1 }], seen_total: "4650.00", answers: [] }),
        201,
    );
    const fastworkDetail = expectStatus(await api.callApi("GET", `/V1/service-requests/${fastworkRequest.svr_id}`), 200);
    assert.equal(fastworkDetail.price_pending_ids.length, 1, "แถวโดเมนในชุดต้องตรวจราคา");
    const take = expectStatus(
        await api.callApi("POST", "/V1/fastwork/projects", {
            body: {
                project_name: "เว็บพร้อมโดเมน", client_name: "buyer_domain", service_request_id: fastworkRequest.svr_id,
                milestones: [{ fwm_name: "ทั้งงาน", fwm_amount: "4650.00" }],
            },
        }),
        409,
    );
    assert.equal(take.code, "PRICE_NOT_CONFIRMED");
});

test("ทีมเพิ่มชุดรายการในคำขอได้ (หัวข้อ + รายการในชุด) · แถวราคาเริ่มต้นในชุดที่ทีมเพิ่ม = ยืนยันแล้ว · ชุดที่ไม่มีจริง = 400", async () => {
    const { sent, detail } = await submitDomain();
    const customerRows = detail.items
        .filter((row) => row.svi_type === "item")
        .map((row) => ({
            svi_id: row.svi_id, product_id: row.svi_product_id, name: row.svi_name, unit: row.svi_unit, unit_price: row.svi_unit_price,
            quantity: row.svi_quantity, is_removed: false,
        }));
    const packageRows = [
        { svi_id: null, type: "heading", package_id: ids.package, product_id: null, name: "เว็บพร้อมโดเมน", unit: "ชุด", unit_price: "0", quantity: "1", is_removed: false },
        { svi_id: null, type: "item", package_id: ids.package, product_id: null, name: "ทำเว็บ", unit: "งาน", unit_price: "4000", quantity: "1", is_removed: false },
        { svi_id: null, type: "item", package_id: ids.package, product_id: ids.domain, name: "จดโดเมนปีแรก", unit: "ปี", unit_price: "980", quantity: "1", is_removed: false },
    ];
    const missing = expectStatus(
        await api.callApi("PUT", `/V1/service-requests/${sent.svr_id}/items`, {
            body: { svr_version: detail.request.svr_version, items: [...customerRows, { ...packageRows[0], package_id: "PKG999999999999999" }] },
        }),
        400,
    );
    assert.ok(missing.fields.items);
    const updated = expectStatus(
        await api.callApi("PUT", `/V1/service-requests/${sent.svr_id}/items`, { body: { svr_version: detail.request.svr_version, items: [...customerRows, ...packageRows] } }),
        200,
    );
    const staffRows = updated.items.filter((row) => row.svi_added_by_staff);
    assert.deepEqual(staffRows.map((row) => [row.svi_type, row.svi_package_id, row.svi_name]), [
        ["heading", ids.package, "เว็บพร้อมโดเมน"],
        ["item", ids.package, "ทำเว็บ"],
        ["item", ids.package, "จดโดเมนปีแรก"],
    ]);
    assert.ok(staffRows[2].svi_price_confirmed_at, "ทีมใส่ราคาเอง = ยืนยันแล้ว");
    // แถวโดเมนของลูกค้ายังต้องตรวจ · ยอดหลังปรับรวมชุดที่ทีมเพิ่ม (650 + 1500 + 4000 + 980)
    assert.equal(updated.price_pending_ids.length, 1);
    assert.equal(updated.totals.total, "7130.00");
});
