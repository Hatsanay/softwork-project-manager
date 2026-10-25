// ลูกค้ายอมรับใบเสนอราคาในลิงก์ S-4 (2026-10-25 · docs/plans/2026-10-25-client-order-link.md ข้อ 7)
// ขั้นในหน้าสถานะ (รอตรวจ → ทำใบ → ใบพร้อม → ยอมรับแล้ว) · ยอมรับ = เปิดโปรเจกต์ + งาน (ผู้รับคำขอเป็น PM) · กดซ้ำไม่สร้างซ้ำ
// ใบหมดอายุยอมรับไม่ได้ · Fastwork ไม่เห็นใบเสนอราคา · การ์ดความต้องการในหน้าโปรเจกต์ (สมาชิกเท่านั้น · ไม่มีราคา)
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { startTestServer } = require("./support/test-server");
const { PERMISSION_KEYS } = require("../src/shared/permissions.mjs");

const PASSWORD = "Staff@2026";
let api;
let adminId;
let outsiderToken;
const ids = {};

const anonymous = (method, url, body) => api.callApi(method, url, { token: null, body });

function expectStatus(response, status, note) {
    assert.equal(response.status, status, `${note ?? ""} ${JSON.stringify(response.body)}`);
    return response.body;
}

const contact = { contact_name: "คุณวิไล", contact_phone: "081-555-3344", company_name: "ร้านครัวอันดามัน", consent: true };

/** ลูกค้าส่งคำขอ (เว็บไซต์ 1 + แพ็กออกแบบ 1 = 23,000) → ทีมผูกลูกค้าแล้วยืนยัน */
async function confirmedRequest(createQuotation) {
    const items = [{ kind: "product", id: ids.website, quantity: 1 }, { kind: "package", id: ids.package, quantity: 1 }];
    const sent = expectStatus(await anonymous("POST", `/V1/order/${ids.link.ol_short_code}/requests`, { submit_key: crypto.randomUUID(), items, contact, seen_total: "23000.00" }), 201);
    let detail = expectStatus(await api.callApi("GET", `/V1/service-requests/${sent.svr_id}`), 200);
    detail = expectStatus(await api.callApi("PUT", `/V1/service-requests/${sent.svr_id}/client`, { body: { svr_version: detail.request.svr_version, client_id: ids.client } }), 200);
    const confirmed = expectStatus(await api.callApi("POST", `/V1/service-requests/${sent.svr_id}/confirm`, { body: { svr_version: detail.request.svr_version, create_quotation: createQuotation } }), 200);
    return { ...sent, ...confirmed };
}

/** ข้ามขั้นอนุมัติ (ผู้สร้างอนุมัติเองไม่ได้ · ขั้นอนุมัติตรวจใน api-quotations.test.js) แล้วกดส่งลูกค้าจริง */
async function sendQuotation(quotationId) {
    await api.pool.query("UPDATE tb_quotations SET qt_status = 'approved' WHERE qt_id = ?", [quotationId]);
    expectStatus(await api.callApi("POST", `/V1/quotations/${quotationId}/send`, { body: {} }), 200);
}

const statusOf = async (token) => expectStatus(await anonymous("GET", `/V1/order/requests/${token}`), 200);

test.before(async () => {
    api = await startTestServer("order_accept");
    await api.loginAsAdmin();
    const [[admin]] = await api.pool.query("SELECT user_id FROM tb_users WHERE user_username = 'admin'");
    adminId = admin.user_id;
    // พนักงานที่ไม่ใช่สมาชิกโปรเจกต์ (ไม่มีสิทธิ์ดูทุกโปรเจกต์)
    const bits = PERMISSION_KEYS.map((key) => (key === "dashboard" ? "1" : "0")).join("");
    const role = expectStatus(await api.callApi("POST", "/V1/roles", { body: { role_name: "role-outsider", role_permission: bits } }), 201);
    await api.pool.query(
        `INSERT INTO tb_users (user_id, user_username, user_email, user_password, user_fname, user_lname, user_role_id, user_must_change_password)
         VALUES ('USE209901330000001', 'oa.outsider', 'oa.outsider@example.com', ?, 'oa', 'outsider', ?, 0)`,
        [await bcrypt.hash(PASSWORD, 10), role.role_id],
    );
    outsiderToken = await api.login("oa.outsider", PASSWORD);
    // คำถามความต้องการตรวจใน api-order-requirements.test.js
    await api.pool.query("UPDATE tb_requirement_groups SET rqg_status = 'inactive'");

    const product = (name, price) => ({
        product_code: null, product_name: name, product_description: null, product_unit: "งาน", product_price: price,
        product_category_id: null, product_status: "active", product_is_public: true,
    });
    ids.website = expectStatus(await api.callApi("POST", "/V1/products", { body: product("เว็บไซต์ร้าน", "20000") }), 201).product_id;
    ids.screen = expectStatus(await api.callApi("POST", "/V1/products", { body: product("ออกแบบหน้าจอ", "1500") }), 201).product_id;
    ids.package = expectStatus(
        await api.callApi("POST", "/V1/product-packages", {
            body: {
                pkg_name: "แพ็กออกแบบ", pkg_description: null, pkg_category_id: null, pkg_status: "active", pkg_is_public: true,
                items: [{ pki_type: "item", pki_product_id: ids.screen, pki_description: "ออกแบบหน้าจอ", pki_quantity: "2", pki_unit: "หน้าจอ" }],
            },
        }),
        201,
    ).pkg_id;
    ids.client = expectStatus(await api.callApi("POST", "/V1/clients", { body: { client_name: "ร้านครัวอันดามัน", client_phone: "0815553344" } }), 201).client_id;
    ids.link = expectStatus(await api.callApi("POST", "/V1/order-links", { body: { ol_kind: "public", ol_name: "หน้าเว็บ", ol_assignee_id: adminId } }), 201);
    ids.fastworkLink = expectStatus(await api.callApi("POST", "/V1/order-links", { body: { ol_kind: "fastwork", ol_buyer_name: "buyer_x", ol_assignee_id: adminId } }), 201);
});

test.after(async () => {
    await api?.stop();
});

test("ลูกค้ายอมรับในลิงก์: ขั้นในหน้าสถานะ · เปิดโปรเจกต์ + งาน (PM = ผู้รับคำขอ) · กดซ้ำไม่สร้างซ้ำ · การ์ดความต้องการ", async () => {
    const request = await confirmedRequest(true);
    let status = await statusOf(request.access_token);
    assert.equal(status.progress.stage, "preparing", "ใบยังเป็นร่าง");
    assert.equal(status.progress.quotation, undefined, "ลูกค้ายังไม่เห็นร่าง");
    expectStatus(await anonymous("POST", `/V1/order/requests/${request.access_token}/accept`, { name: "คุณวิไล", agree: true }), 409);

    await sendQuotation(request.qt_id);
    status = await statusOf(request.access_token);
    assert.equal(status.progress.stage, "quotation");
    assert.equal(status.progress.quotation.subtotal, "23000.00");
    assert.deepEqual(status.progress.quotation.items.map((row) => row.description), ["เว็บไซต์ร้าน", "แพ็กออกแบบ", "ออกแบบหน้าจอ"]);
    assert.ok(!("qt_internal_note" in status.progress.quotation), "ไม่มีบันทึกภายใน");

    const missing = expectStatus(await anonymous("POST", `/V1/order/requests/${request.access_token}/accept`, { name: " ", agree: false }), 400);
    assert.ok(missing.fields.name);
    assert.ok(missing.fields.agree);

    status = expectStatus(await anonymous("POST", `/V1/order/requests/${request.access_token}/accept`, { name: "วิไล ใจดี", agree: true }), 200);
    assert.equal(status.progress.stage, "accepted");
    assert.equal(status.progress.accepted_name, "วิไล ใจดี");
    assert.match(status.progress.accepted_at, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);

    const [[quotation]] = await api.pool.query("SELECT qt_status, qt_project_id FROM tb_quotations WHERE qt_id = ?", [request.qt_id]);
    assert.equal(quotation.qt_status, "accepted");
    assert.ok(quotation.qt_project_id);
    const [members] = await api.pool.query("SELECT user_id FROM tb_project_members WHERE project_id = ?", [quotation.qt_project_id]);
    assert.deepEqual(members.map((member) => member.user_id), [adminId], "ผู้รับคำขอเป็น PM");
    const [tasks] = await api.pool.query("SELECT task_title FROM tb_tasks WHERE project_id = ? ORDER BY task_sort_order", [quotation.qt_project_id]);
    assert.deepEqual(tasks.map((task) => task.task_title), ["เว็บไซต์ร้าน", "แพ็กออกแบบ", "ออกแบบหน้าจอ"]);

    // กดซ้ำ (เช่น เน็ตหลุดแล้วกดใหม่) = สถานะเดิม ไม่เปิดโปรเจกต์ซ้ำ
    const again = expectStatus(await anonymous("POST", `/V1/order/requests/${request.access_token}/accept`, { name: "วิไล ใจดี", agree: true }), 200);
    assert.equal(again.progress.stage, "accepted");
    const [[{ projectCount }]] = await api.pool.query("SELECT COUNT(*) AS projectCount FROM tb_projects WHERE client_id = ?", [ids.client]);
    assert.equal(Number(projectCount), 1);

    // การ์ดความต้องการ: หาเจอผ่านใบเสนอราคา · ไม่มีราคา · คนนอกโปรเจกต์เปิดไม่ได้
    const requirements = expectStatus(await api.callApi("GET", `/V1/projects/${quotation.qt_project_id}/requirements`), 200).data;
    assert.equal(requirements.length, 1);
    assert.equal(requirements[0].svr_id, request.svr_id);
    assert.deepEqual(requirements[0].items.map((row) => [row.type, row.name, row.in_package]), [
        ["item", "เว็บไซต์ร้าน", false],
        ["heading", "แพ็กออกแบบ", false],
        ["item", "ออกแบบหน้าจอ", true],
    ]);
    assert.ok(!JSON.stringify(requirements).includes("unit_price"), "ไม่มีราคา");
    expectStatus(await api.callApi("GET", `/V1/projects/${quotation.qt_project_id}/requirements`, { token: outsiderToken }), 403);
});

test("revision: ลูกค้าเห็นฉบับล่าสุด · ใบหมดอายุยอมรับไม่ได้", async () => {
    const request = await confirmedRequest(true);
    await sendQuotation(request.qt_id);
    const revision = expectStatus(await api.callApi("POST", `/V1/quotations/${request.qt_id}/revise`, { body: {} }), 201);
    let status = await statusOf(request.access_token);
    assert.equal(status.progress.stage, "preparing", "ทีมกำลังแก้ฉบับใหม่");

    await sendQuotation(revision.qt_id);
    status = await statusOf(request.access_token);
    assert.equal(status.progress.stage, "quotation");
    assert.match(status.progress.quotation.number, /Rev\.1$/);

    await api.pool.query("UPDATE tb_quotations SET qt_valid_until = '2020-01-01' WHERE qt_id = ?", [revision.qt_id]);
    status = await statusOf(request.access_token);
    assert.equal(status.progress.stage, "expired");
    const expired = expectStatus(await anonymous("POST", `/V1/order/requests/${request.access_token}/accept`, { name: "คุณวิไล", agree: true }), 409);
    assert.equal(expired.code, "QUOTATION_EXPIRED");
});

test("เปิดโปรเจกต์ทันที (ไม่ออกใบ) = ขั้น started · Fastwork ยอมรับในลิงก์ไม่ได้", async () => {
    const request = await confirmedRequest(false);
    const status = await statusOf(request.access_token);
    assert.equal(status.progress.stage, "started");
    const requirements = expectStatus(await api.callApi("GET", `/V1/projects/${request.project_id}/requirements`), 200).data;
    assert.deepEqual(requirements.map((row) => row.svr_id), [request.svr_id], "หาเจอผ่าน svr_project_id");

    const items = [{ kind: "product", id: ids.website, quantity: 1 }];
    const fastwork = expectStatus(await anonymous("POST", `/V1/order/${ids.fastworkLink.ol_short_code}/requests`, { submit_key: crypto.randomUUID(), items, seen_total: "20000.00" }), 201);
    expectStatus(await anonymous("POST", `/V1/order/requests/${fastwork.access_token}/accept`, { name: "buyer_x", agree: true }), 409);
});
