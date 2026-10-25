// ตรวจคำขอบริการ S-3 (2026-10-25 · docs/plans/2026-10-25-client-order-link.md ข้อ 6, 6.1)
// หาลูกค้าเดิมที่ตรง · ผูกลูกค้า · ปรับรายการ (เก็บค่าที่ปรับแยก ลูกค้ายังเห็นที่ตัวเองส่ง) · ยืนยันแบบออกใบเสนอราคา/เปิดโปรเจกต์ทันที
// ปฏิเสธ/ปิด · เวอร์ชันกันแก้ทับ · คำขอ Fastwork เปิดโปรเจกต์ทางนี้ไม่ได้ (ใช้รับงาน Fastwork) · ออกใบ/เปิดโปรเจกต์ต้องมีสิทธิ์ของเอกสารนั้น
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { startTestServer } = require("./support/test-server");
const { PERMISSION_KEYS } = require("../src/shared/permissions.mjs");

const PASSWORD = "Staff@2026";
let api;
let adminId;
let reviewerToken;
const ids = {};

const anonymous = (method, url, body) => api.callApi(method, url, { token: null, body });

function expectStatus(response, status, note) {
    assert.equal(response.status, status, `${note ?? ""} ${JSON.stringify(response.body)}`);
    return response.body;
}

const contact = { contact_name: "คุณวิไล", contact_phone: "081-555-3344", company_name: "ร้านครัวอันดามัน", consent: true };

async function submit(link, items, seenTotal) {
    return expectStatus(await anonymous("POST", `/V1/order/${link.ol_short_code}/requests`, { submit_key: crypto.randomUUID(), items, contact, seen_total: seenTotal }), 201);
}

test.before(async () => {
    api = await startTestServer("service_requests");
    await api.loginAsAdmin();
    const [[admin]] = await api.pool.query("SELECT user_id FROM tb_users WHERE user_username = 'admin'");
    adminId = admin.user_id;
    // ตรวจคำขอได้ แต่ไม่มีสิทธิ์สร้างใบเสนอราคา/โปรเจกต์
    const bits = PERMISSION_KEYS.map((key) => (["dashboard", "manageServiceRequests"].includes(key) ? "1" : "0")).join("");
    const role = expectStatus(await api.callApi("POST", "/V1/roles", { body: { role_name: "role-reviewer", role_permission: bits } }), 201);
    await api.pool.query(
        `INSERT INTO tb_users (user_id, user_username, user_email, user_password, user_fname, user_lname, user_role_id, user_must_change_password)
         VALUES ('USE209901320000001', 'sr.reviewer', 'sr.reviewer@example.com', ?, 'sr', 'reviewer', ?, 0)`,
        [await bcrypt.hash(PASSWORD, 10), role.role_id],
    );
    reviewerToken = await api.login("sr.reviewer", PASSWORD);
    // เทสต์นี้ตรวจขั้นตรวจคำขอ · คำถามความต้องการตรวจใน api-order-requirements.test.js
    await api.pool.query("UPDATE tb_requirement_groups SET rqg_status = 'inactive'");

    const product = (name, price) => ({
        product_code: null, product_name: name, product_description: null, product_unit: "งาน", product_price: price,
        product_category_id: null, product_status: "active", product_is_public: true,
    });
    ids.website = expectStatus(await api.callApi("POST", "/V1/products", { body: product("เว็บไซต์ร้าน", "20000") }), 201).product_id;
    ids.screen = expectStatus(await api.callApi("POST", "/V1/products", { body: product("ออกแบบหน้าจอ", "1500") }), 201).product_id;
    ids.hosting = expectStatus(await api.callApi("POST", "/V1/products", { body: product("โฮสติ้ง 1 ปี", "2400") }), 201).product_id;
    ids.package = expectStatus(
        await api.callApi("POST", "/V1/product-packages", {
            body: {
                pkg_name: "แพ็กออกแบบ", pkg_description: null, pkg_category_id: null, pkg_status: "active", pkg_is_public: true,
                items: [{ pki_type: "item", pki_product_id: ids.screen, pki_description: "ออกแบบหน้าจอ", pki_quantity: "2", pki_unit: "หน้าจอ" }],
            },
        }),
        201,
    ).pkg_id;
    ids.existingClient = expectStatus(await api.callApi("POST", "/V1/clients", { body: { client_name: "ร้านครัวอันดามัน", client_phone: "0815553344" } }), 201).client_id;
    ids.link = expectStatus(await api.callApi("POST", "/V1/order-links", { body: { ol_kind: "public", ol_name: "หน้าเว็บ", ol_assignee_id: adminId } }), 201);
    ids.fastworkLink = expectStatus(await api.callApi("POST", "/V1/order-links", { body: { ol_kind: "fastwork", ol_buyer_name: "buyer_x", ol_assignee_id: adminId } }), 201);
});

test.after(async () => {
    await api?.stop();
});

test("ตรวจคำขอ: หาลูกค้าที่ตรง · ปรับรายการ (ลูกค้ายังเห็นที่ส่ง) · ยืนยันแบบออกใบเสนอราคา · ยืนยันซ้ำไม่ได้", async () => {
    // ส่ง: แพ็กออกแบบ 1 ชุด (2 หน้าจอ = 3,000) + เว็บไซต์ 1 (20,000) = 23,000
    const sent = await submit(ids.link, [{ kind: "package", id: ids.package, quantity: 1 }, { kind: "product", id: ids.website, quantity: 1 }], "23000.00");
    let detail = expectStatus(await api.callApi("GET", `/V1/service-requests/${sent.svr_id}`, { token: reviewerToken }), 200);
    assert.deepEqual(detail.client_matches.map((client) => client.client_id), [ids.existingClient], "เบอร์ตรงแม้เขียนต่างรูปแบบ");
    assert.equal(detail.totals.total, "23000.00");

    // ปรับ: เว็บไซต์ลดเหลือ 18,000 · หน้าจอเป็น 3 · เพิ่มโฮสติ้ง 2,400 → 18,000 + 4,500 + 2,400 = 24,900
    const websiteRow = detail.items.find((row) => row.svi_name === "เว็บไซต์ร้าน");
    const screenRow = detail.items.find((row) => row.svi_name === "ออกแบบหน้าจอ");
    const itemsBody = (version) => ({
        svr_version: version,
        items: [
            { svi_id: websiteRow.svi_id, name: websiteRow.svi_name, unit: "งาน", unit_price: "18000", quantity: "1" },
            { svi_id: screenRow.svi_id, name: screenRow.svi_name, unit: "หน้าจอ", unit_price: "1500", quantity: "3" },
            { svi_id: null, product_id: ids.hosting, name: "โฮสติ้ง 1 ปี", unit: "ปี", unit_price: "2400", quantity: "1" },
        ],
    });
    expectStatus(await api.callApi("PUT", `/V1/service-requests/${sent.svr_id}/items`, { token: reviewerToken, body: itemsBody(detail.request.svr_version + 1) }), 409);
    detail = expectStatus(await api.callApi("PUT", `/V1/service-requests/${sent.svr_id}/items`, { token: reviewerToken, body: itemsBody(detail.request.svr_version) }), 200);
    assert.equal(detail.totals.total, "24900.00");
    assert.equal(detail.submitted_totals.total, "23000.00");
    const adjusted = detail.items.find((row) => row.svi_id === websiteRow.svi_id);
    assert.equal(adjusted.svi_adjusted_unit_price, "18000.00");
    assert.equal(adjusted.svi_adjusted_quantity, null, "จำนวนเท่าเดิม = ไม่นับว่าปรับ");
    const customerView = expectStatus(await anonymous("GET", `/V1/order/requests/${sent.access_token}`), 200);
    assert.equal(customerView.totals.total, "23000.00");
    assert.ok(!customerView.items.some((row) => row.name === "โฮสติ้ง 1 ปี"), "ลูกค้าไม่เห็นแถวที่ทีมเพิ่ม");

    // ยืนยันต้องผูกลูกค้าก่อน · ผู้ตรวจไม่มีสิทธิ์สร้างใบเสนอราคา
    const noClient = expectStatus(await api.callApi("POST", `/V1/service-requests/${sent.svr_id}/confirm`, { body: { svr_version: detail.request.svr_version, create_quotation: true } }), 400);
    assert.ok(noClient.fields.client_id);
    detail = expectStatus(await api.callApi("PUT", `/V1/service-requests/${sent.svr_id}/client`, { token: reviewerToken, body: { svr_version: detail.request.svr_version, client_id: ids.existingClient } }), 200);
    assert.equal(detail.request.client_name, "ร้านครัวอันดามัน");
    expectStatus(await api.callApi("POST", `/V1/service-requests/${sent.svr_id}/confirm`, { token: reviewerToken, body: { svr_version: detail.request.svr_version, create_quotation: true } }), 403);

    const confirmed = expectStatus(await api.callApi("POST", `/V1/service-requests/${sent.svr_id}/confirm`, { body: { svr_version: detail.request.svr_version, create_quotation: true } }), 200);
    assert.ok(confirmed.qt_id);
    const quotation = expectStatus(await api.callApi("GET", `/V1/quotations/${confirmed.qt_id}`), 200);
    const qt = quotation.quotation ?? quotation;
    assert.equal(qt.qt_status, "draft");
    assert.equal(qt.qt_client_id, ids.existingClient);
    assert.equal(qt.qt_title, "เว็บไซต์ร้าน + โฮสติ้ง 1 ปี + แพ็กออกแบบ");
    // รายการเดี่ยวก่อน แล้วชุด (หัวข้อ + รายการ) · ราคา/จำนวนหลังปรับ
    const qtItems = quotation.items ?? qt.items;
    assert.deepEqual(qtItems.map((row) => [row.qti_type, row.qti_description, row.qti_quantity, row.qti_unit_price]), [
        ["item", "เว็บไซต์ร้าน", "1.00", "18000.00"],
        ["item", "โฮสติ้ง 1 ปี", "1.00", "2400.00"],
        ["heading", "แพ็กออกแบบ", null, null],
        ["item", "ออกแบบหน้าจอ", "3.00", "1500.00"],
    ]);
    detail = expectStatus(await api.callApi("GET", `/V1/service-requests/${sent.svr_id}`), 200);
    assert.equal(detail.request.svr_status, "converted");
    assert.equal(detail.request.svr_quotation_id, confirmed.qt_id);
    expectStatus(await api.callApi("POST", `/V1/service-requests/${sent.svr_id}/confirm`, { body: { svr_version: detail.request.svr_version, create_quotation: true } }), 409);
    const afterView = expectStatus(await anonymous("GET", `/V1/order/requests/${sent.access_token}`), 200);
    assert.equal(afterView.progress.stage, "preparing", "ออกใบแล้ว ยังเป็นร่าง");
});

test("ยืนยันแบบไม่ออกใบเสนอราคา: เปิดโปรเจกต์ + งานจากรายการทันที (ชุด = งานหลัก + งานย่อย)", async () => {
    const sent = await submit(ids.link, [{ kind: "product", id: ids.website, quantity: 1 }, { kind: "package", id: ids.package, quantity: 1 }], "23000.00");
    let detail = expectStatus(await api.callApi("GET", `/V1/service-requests/${sent.svr_id}`), 200);
    detail = expectStatus(await api.callApi("PUT", `/V1/service-requests/${sent.svr_id}/client`, { body: { svr_version: detail.request.svr_version, client_id: ids.existingClient } }), 200);
    expectStatus(await api.callApi("POST", `/V1/service-requests/${sent.svr_id}/confirm`, { token: reviewerToken, body: { svr_version: detail.request.svr_version, create_quotation: false } }), 403);
    const confirmed = expectStatus(await api.callApi("POST", `/V1/service-requests/${sent.svr_id}/confirm`, { body: { svr_version: detail.request.svr_version, create_quotation: false } }), 200);
    assert.ok(confirmed.project_id);
    const [tasks] = await api.pool.query(
        "SELECT task_id, task_parent_id, task_title FROM tb_tasks WHERE project_id = ? ORDER BY task_sort_order",
        [confirmed.project_id],
    );
    assert.deepEqual(tasks.map((task) => task.task_title), ["เว็บไซต์ร้าน", "แพ็กออกแบบ", "ออกแบบหน้าจอ"]);
    assert.equal(tasks[0].task_parent_id, null);
    assert.equal(tasks[2].task_parent_id, tasks[1].task_id, "รายการในชุดเป็นงานย่อยของชุด");
    const [[project]] = await api.pool.query("SELECT client_id FROM tb_projects WHERE project_id = ?", [confirmed.project_id]);
    assert.equal(project.client_id, ids.existingClient);
});

test("ปฏิเสธ/ปิด: ต้องมีเหตุผล · ลูกค้าไม่เห็นเหตุผล · คำขอ Fastwork ยืนยันทางนี้ไม่ได้", async () => {
    const sent = await submit(ids.link, [{ kind: "product", id: ids.screen, quantity: 1 }], "1500.00");
    let detail = expectStatus(await api.callApi("GET", `/V1/service-requests/${sent.svr_id}`), 200);
    expectStatus(await api.callApi("POST", `/V1/service-requests/${sent.svr_id}/reject`, { body: { svr_version: detail.request.svr_version, reason: "" } }), 400);
    detail = expectStatus(await api.callApi("POST", `/V1/service-requests/${sent.svr_id}/reject`, { token: reviewerToken, body: { svr_version: detail.request.svr_version, reason: "งบไม่พอ คุยกันแล้ว" } }), 200);
    assert.equal(detail.request.svr_status, "rejected");
    const view = expectStatus(await anonymous("GET", `/V1/order/requests/${sent.access_token}`), 200);
    assert.equal(view.progress.stage, "contact");
    assert.ok(!JSON.stringify(view).includes("งบไม่พอ"), "เหตุผลเป็นข้อมูลภายใน");

    const fastwork = expectStatus(
        await anonymous("POST", `/V1/order/${ids.fastworkLink.ol_short_code}/requests`, { submit_key: crypto.randomUUID(), items: [{ kind: "product", id: ids.screen, quantity: 1 }], seen_total: "1500.00" }),
        201,
    );
    let fastworkDetail = expectStatus(await api.callApi("GET", `/V1/service-requests/${fastwork.svr_id}`), 200);
    fastworkDetail = expectStatus(await api.callApi("PUT", `/V1/service-requests/${fastwork.svr_id}/client`, { body: { svr_version: fastworkDetail.request.svr_version, client_id: ids.existingClient } }), 200);
    const blocked = expectStatus(await api.callApi("POST", `/V1/service-requests/${fastwork.svr_id}/confirm`, { body: { svr_version: fastworkDetail.request.svr_version, create_quotation: false } }), 409);
    assert.equal(blocked.code, "SERVICE_REQUEST_FASTWORK");
    const closed = expectStatus(await api.callApi("POST", `/V1/service-requests/${fastwork.svr_id}/close`, { body: { svr_version: fastworkDetail.request.svr_version, reason: "ผู้ซื้อไม่จ้าง" } }), 200);
    assert.equal(closed.request.svr_status, "closed");
});
