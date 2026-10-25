// ลิงก์เลือกบริการ S-1 (2026-10-25 · docs/plans/2026-10-25-client-order-link.md)
// ลิงก์ 3 แบบ · หน้าร้านเห็นเฉพาะสินค้า/ชุดที่เปิดหน้าร้านในหมวดของลิงก์ · ชุดที่มีสินค้าปิดใช้งานไม่แสดง
// ส่งคำขอ: ราคาคิดใหม่จากฐานข้อมูล ยอดต่างจากที่เห็น = 409 · กดซ้ำได้คำขอเดิม · ลิงก์รายคนส่งได้ครั้งเดียว · ลิงก์ปิด/หมดอายุ = 410
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { startTestServer } = require("./support/test-server");
const { PERMISSION_KEYS } = require("../src/shared/permissions.mjs");
const { todayBangkok } = require("../src/utils/bangkok-time");
const { cartTotals, lineAmount, multiplyQuantity } = require("../src/shared/order-cart-math.mjs");

const PASSWORD = "Staff@2026";
let api;
let adminId;
const ids = {};
const people = {};

const as = (person, method, url, body) => api.callApi(method, url, { token: person?.token, body });
const anonymous = (method, url, body) => api.callApi(method, url, { token: null, body });

function expectStatus(response, status, note) {
    assert.equal(response.status, status, `${note ?? ""} ${JSON.stringify(response.body)}`);
    return response.body;
}

const product = (overrides) => ({
    product_code: null, product_name: "สินค้า", product_description: null, product_unit: "งาน", product_price: "1000",
    product_category_id: null, product_status: "active", product_is_public: true, ...overrides,
});

const contact = { contact_name: "คุณวิไล", contact_phone: "081 555 3344", consent: true };

test.before(async () => {
    api = await startTestServer("order_links");
    await api.loginAsAdmin();
    const [[admin]] = await api.pool.query("SELECT user_id FROM tb_users WHERE user_username = 'admin'");
    adminId = admin.user_id;
    const bits = PERMISSION_KEYS.map((key) => (key === "dashboard" ? "1" : "0")).join("");
    const role = expectStatus(await api.callApi("POST", "/V1/roles", { body: { role_name: "role-no-orders", role_permission: bits } }), 201);
    await api.pool.query(
        `INSERT INTO tb_users (user_id, user_username, user_email, user_password, user_fname, user_lname, user_role_id, user_must_change_password)
         VALUES ('USE209901300000001', 'ol.staff', 'ol.staff@example.com', ?, 'ol', 'staff', ?, 0)`,
        [await bcrypt.hash(PASSWORD, 10), role.role_id],
    );
    people.staff = { token: await api.login("ol.staff", PASSWORD) };

    ids.web = expectStatus(await api.callApi("POST", "/V1/product-categories", { body: { pc_name: "เว็บไซต์", pc_sort_order: 1, pc_status: "active" } }), 201).pc_id;
    ids.app = expectStatus(await api.callApi("POST", "/V1/product-categories", { body: { pc_name: "แอปมือถือ", pc_sort_order: 2, pc_status: "active" } }), 201).pc_id;
    ids.website = expectStatus(await api.callApi("POST", "/V1/products", { body: product({ product_name: "เว็บไซต์ร้าน", product_price: "28000", product_category_id: ids.web }) }), 201).product_id;
    ids.screen = expectStatus(await api.callApi("POST", "/V1/products", { body: product({ product_name: "ออกแบบหน้าจอ", product_unit: "หน้าจอ", product_price: "1500.50", product_category_id: ids.web }) }), 201).product_id;
    ids.hidden = expectStatus(await api.callApi("POST", "/V1/products", { body: product({ product_name: "ราคาภายใน", product_category_id: ids.web, product_is_public: false }) }), 201).product_id;
    ids.mobile = expectStatus(await api.callApi("POST", "/V1/products", { body: product({ product_name: "แอป Android", product_price: "40000", product_category_id: ids.app }) }), 201).product_id;
    ids.package = expectStatus(
        await api.callApi("POST", "/V1/product-packages", {
            body: {
                pkg_name: "แพ็กเว็บเริ่มต้น", pkg_description: null, pkg_category_id: ids.web, pkg_status: "active", pkg_is_public: true,
                items: [
                    { pki_type: "item", pki_product_id: ids.screen, pki_description: "ออกแบบหน้าจอ", pki_quantity: "3", pki_unit: "หน้าจอ" },
                    { pki_type: "item", pki_product_id: null, pki_description: "จดโดเมน 1 ปี", pki_quantity: "1", pki_unit: "ปี", pki_unit_price: "650" },
                ],
            },
        }),
        201,
    ).pkg_id;
    // เทสต์นี้ตรวจตะกร้า/ราคา/ลิงก์ · คำถามความต้องการ (ชุดตั้งต้นมีข้อบังคับ) ตรวจใน api-order-requirements.test.js
    await api.pool.query("UPDATE tb_requirement_groups SET rqg_status = 'inactive'");
    ids.client = expectStatus(await api.callApi("POST", "/V1/clients", { body: { client_name: "ร้านครัวอันดามัน", client_phone: "0815553344" } }), 201).client_id;
});

test.after(async () => {
    await api?.stop();
});

test("ยอดตะกร้า: ราคา × จำนวน ปัดครึ่งขึ้น · VAT จากรวม · ชุดคูณจำนวนในชุด", () => {
    assert.equal(lineAmount("1500.50", "3.00"), 450150n);
    assert.equal(multiplyQuantity("3.00", 2), "6.00");
    assert.deepEqual(cartTotals({ lines: [{ unitPrice: "1000", quantity: "1" }, { unitPrice: "0.15", quantity: "3" }], vatRate: "7" }), {
        subtotal: 100045n, vat: 7003n, total: 107048n,
    });
    assert.deepEqual(cartTotals({ lines: [{ unitPrice: "100", quantity: "2" }], vatRate: null }), { subtotal: 20000n, vat: 0n, total: 20000n });
});

test("ลิงก์: เฉพาะสิทธิ์ · สาธารณะต้องมีชื่อ · ลูกค้า Fastwork ใช้ลิงก์ลูกค้าตรงไม่ได้ · ลิงก์รายคนหมดอายุ 30 วันเอง", async () => {
    const body = { ol_kind: "public", ol_name: "หน้าเว็บ", ol_assignee_id: adminId, category_ids: [ids.web] };
    expectStatus(await as(people.staff, "POST", "/V1/order-links", body), 403);
    const noName = expectStatus(await api.callApi("POST", "/V1/order-links", { body: { ...body, ol_name: null } }), 400);
    assert.ok(noName.fields.ol_name);
    const publicLink = expectStatus(await api.callApi("POST", "/V1/order-links", { body }), 201);
    assert.equal(publicLink.ol_expires_on, null);
    assert.equal(publicLink.ol_short_code.length, 8);
    assert.equal(publicLink.ol_token.length, 32);
    assert.deepEqual(publicLink.category_ids, [ids.web]);
    ids.publicLink = publicLink;

    const personal = expectStatus(
        await api.callApi("POST", "/V1/order-links", { body: { ol_kind: "personal", ol_client_id: ids.client, ol_assignee_id: adminId } }),
        201,
    );
    const expected = new Date(`${todayBangkok()}T00:00:00Z`);
    expected.setUTCDate(expected.getUTCDate() + 30);
    assert.equal(personal.ol_expires_on, expected.toISOString().slice(0, 10));
    assert.equal(personal.client_name, "ร้านครัวอันดามัน");
    ids.personalLink = personal;

    const fastworkJob = expectStatus(
        await api.callApi("POST", "/V1/fastwork/projects", { body: { project_name: "งาน Fastwork", client_name: "buyer_fw", milestones: [{ fwm_name: "ทั้งงาน", fwm_amount: "5000" }] } }),
        201,
    );
    const [[fastworkProject]] = await api.pool.query("SELECT client_id FROM tb_projects WHERE project_id = ?", [fastworkJob.project_id]);
    const blocked = expectStatus(
        await api.callApi("POST", "/V1/order-links", { body: { ol_kind: "personal", ol_client_id: fastworkProject.client_id, ol_assignee_id: adminId } }),
        400,
    );
    assert.match(blocked.fields.ol_client_id, /Fastwork/);
    const fastworkLink = expectStatus(
        await api.callApi("POST", "/V1/order-links", { body: { ol_kind: "fastwork", ol_buyer_name: "buyer_new", ol_assignee_id: adminId } }),
        201,
    );
    ids.fastworkLink = fastworkLink;

    const list = expectStatus(await api.callApi("GET", "/V1/order-links"), 200);
    assert.equal(list.data.length, 3);
});

test("หน้าร้าน: เฉพาะสินค้าที่เปิดหน้าร้านในหมวดของลิงก์ · เปิดด้วยรหัสสั้นได้ · ชุดมีราคาจากสินค้าปัจจุบัน · ไม่ต้อง login", async () => {
    const shop = expectStatus(await anonymous("GET", `/V1/order/${ids.publicLink.ol_short_code}`), 200);
    assert.equal(shop.link.state, "open");
    assert.deepEqual(shop.catalog.categories.map((row) => row.pc_name), ["เว็บไซต์"]);
    assert.deepEqual(shop.catalog.products.map((row) => row.product_name).sort(), ["ออกแบบหน้าจอ", "เว็บไซต์ร้าน"].sort());
    assert.equal(shop.catalog.packages.length, 1);
    assert.deepEqual(shop.catalog.packages[0].items.map((row) => row.unit_price), ["1500.50", "650.00"]);
    assert.equal(shop.vat_rate, null, "ยังไม่จด VAT");
    assert.equal(shop.prefill, null);

    const personalShop = expectStatus(await anonymous("GET", `/V1/order/${ids.personalLink.ol_token}`), 200);
    assert.equal(personalShop.prefill.contact_name, "ร้านครัวอันดามัน");
    assert.equal(personalShop.catalog.categories.length, 2, "ไม่เลือกหมวด = ทุกหมวด");

    expectStatus(await anonymous("GET", "/V1/order/XXXXXXXX"), 404);
});

test("ส่งคำขอ: ข้อมูลติดต่อบังคับ · ยอดต้องตรง · กดซ้ำได้คำขอเดิม · ลิงก์รายคนครั้งเดียว · หน้าสถานะ · ฝั่งพนักงานเห็นยอด", async () => {
    const code = ids.publicLink.ol_short_code;
    // เว็บไซต์ 1 + ชุด 2 ชุด (หน้าจอ 6 × 1,500.50 + โดเมน 2 × 650) = 28,000 + 9,003 + 1,300 = 38,303
    const items = [
        { kind: "product", id: ids.website, quantity: 1 },
        { kind: "package", id: ids.package, quantity: 2 },
    ];
    const submitKey = crypto.randomUUID();
    const noContact = expectStatus(await anonymous("POST", `/V1/order/${code}/requests`, { submit_key: submitKey, items, seen_total: "38303.00" }), 400);
    assert.ok(noContact.fields.contact_name);
    expectStatus(await anonymous("POST", `/V1/order/${code}/requests`, { submit_key: submitKey, items: [{ kind: "product", id: ids.hidden, quantity: 1 }], contact, seen_total: "1000.00" }), 409);
    const stale = expectStatus(await anonymous("POST", `/V1/order/${code}/requests`, { submit_key: submitKey, items, contact, seen_total: "38000.00" }), 409);
    assert.equal(stale.code, "ORDER_PRICE_CHANGED");
    assert.equal(stale.fields.total, "38303.00");

    const sent = expectStatus(await anonymous("POST", `/V1/order/${code}/requests`, { submit_key: submitKey, items, contact, note: "อยากได้ภายในเดือนหน้า", seen_total: "38303.00" }), 201);
    const again = expectStatus(await anonymous("POST", `/V1/order/${code}/requests`, { submit_key: submitKey, items, contact, seen_total: "38303.00" }), 201);
    assert.equal(again.svr_id, sent.svr_id, "กดซ้ำได้คำขอเดิม");

    const status = expectStatus(await anonymous("GET", `/V1/order/requests/${sent.access_token}`), 200);
    assert.equal(status.progress.stage, "submitted");
    assert.equal(status.totals.total, "38303.00");
    assert.deepEqual(status.items.map((row) => [row.type, row.name, row.quantity]), [
        ["item", "เว็บไซต์ร้าน", "1.00"],
        ["heading", "แพ็กเว็บเริ่มต้น", "2.00"],
        ["item", "ออกแบบหน้าจอ", "6.00"],
        ["item", "จดโดเมน 1 ปี", "2.00"],
    ]);

    // ราคาที่เก็บเป็นของวันส่ง: แก้ราคาสินค้าทีหลัง คำขอเดิมไม่เปลี่ยน
    expectStatus(await api.callApi("PUT", `/V1/products/${ids.website}`, { body: product({ product_name: "เว็บไซต์ร้าน", product_price: "30000", product_category_id: ids.web }) }), 200);
    const detail = expectStatus(await api.callApi("GET", `/V1/service-requests/${sent.svr_id}`), 200);
    assert.equal(detail.totals.total, "38303.00");
    assert.equal(detail.request.svr_contact_name, "คุณวิไล");
    assert.equal(detail.request.ol_kind, "public");
    const list = expectStatus(await api.callApi("GET", "/V1/service-requests?status=submitted"), 200);
    assert.equal(list.waiting_count, 1);
    expectStatus(await as(people.staff, "GET", "/V1/service-requests"), 403);

    // ลิงก์รายคน: เติมลูกค้าแล้ว · ส่งครั้งที่สองไม่ได้ · เปิดลิงก์อีกครั้งได้ token หน้าสถานะ
    const personalCode = ids.personalLink.ol_token;
    const personalItems = [{ kind: "product", id: ids.mobile, quantity: 1 }];
    const first = expectStatus(await anonymous("POST", `/V1/order/${personalCode}/requests`, { submit_key: crypto.randomUUID(), items: personalItems, contact, seen_total: "40000.00" }), 201);
    const second = expectStatus(await anonymous("POST", `/V1/order/${personalCode}/requests`, { submit_key: crypto.randomUUID(), items: personalItems, contact, seen_total: "40000.00" }), 409);
    assert.equal(second.fields.access_token, first.access_token);
    const reopened = expectStatus(await anonymous("GET", `/V1/order/${personalCode}`), 200);
    assert.equal(reopened.submitted_token, first.access_token);
    const personalDetail = expectStatus(await api.callApi("GET", `/V1/service-requests/${first.svr_id}`), 200);
    assert.equal(personalDetail.request.svr_client_id, ids.client);

    // ลิงก์ Fastwork: ไม่ถามข้อมูลติดต่อ · ชื่อผู้ซื้อจากลิงก์
    const fastworkSent = expectStatus(
        await anonymous("POST", `/V1/order/${ids.fastworkLink.ol_short_code}/requests`, { submit_key: crypto.randomUUID(), items: personalItems, seen_total: "40000.00" }),
        201,
    );
    const fastworkDetail = expectStatus(await api.callApi("GET", `/V1/service-requests/${fastworkSent.svr_id}`), 200);
    assert.equal(fastworkDetail.request.svr_contact_name, "buyer_new");
    assert.equal(fastworkDetail.request.svr_consent_at, null);
});

test("ลิงก์ปิด/หมดอายุ: หน้าร้านบอกสถานะ · ส่งไม่ได้ (410) · จด VAT แล้วยอดรวม VAT", async () => {
    const link = ids.publicLink;
    const update = (changes) => api.callApi("PUT", `/V1/order-links/${link.ol_id}`, {
        body: { ol_name: link.ol_name, ol_assignee_id: adminId, ol_expires_on: null, ol_status: "active", category_ids: [ids.web], ...changes },
    });
    expectStatus(await update({ ol_status: "disabled" }), 200);
    const closed = expectStatus(await anonymous("GET", `/V1/order/${link.ol_short_code}`), 200);
    assert.equal(closed.link.state, "disabled");
    assert.equal(closed.catalog, undefined);
    expectStatus(await anonymous("POST", `/V1/order/${link.ol_short_code}/requests`, { submit_key: crypto.randomUUID(), items: [{ kind: "product", id: ids.screen, quantity: 1 }], contact, seen_total: "1500.50" }), 410);

    await api.pool.query("UPDATE tb_order_links SET ol_expires_on = '2020-01-01', ol_status = 'active' WHERE ol_id = ?", [link.ol_id]);
    const expired = expectStatus(await anonymous("GET", `/V1/order/${link.ol_short_code}`), 200);
    assert.equal(expired.link.state, "expired");

    expectStatus(await update({}), 200);
    await api.pool.query("UPDATE tb_company_settings SET cs_vat_registered_from = '2020-01-01' WHERE cs_id = 1");
    const withVat = expectStatus(await anonymous("GET", `/V1/order/${link.ol_short_code}`), 200);
    assert.equal(withVat.vat_rate, "7.00");
    // 1,500.50 + VAT 7% (105.035 → 105.04) = 1,605.54
    const sent = expectStatus(
        await anonymous("POST", `/V1/order/${link.ol_short_code}/requests`, { submit_key: crypto.randomUUID(), items: [{ kind: "product", id: ids.screen, quantity: 1 }], contact, seen_total: "1605.54" }),
        201,
    );
    const status = expectStatus(await anonymous("GET", `/V1/order/requests/${sent.access_token}`), 200);
    assert.deepEqual(status.totals, { subtotal: "1500.50", vat: "105.04", total: "1605.54" });
    await api.pool.query("UPDATE tb_company_settings SET cs_vat_registered_from = NULL WHERE cs_id = 1");
});
