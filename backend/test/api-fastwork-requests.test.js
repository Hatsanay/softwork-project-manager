// คำขอจากลิงก์ Fastwork S-5 (2026-10-25 · docs/plans/2026-10-25-client-order-link.md ข้อ 13)
// ก่อนจ้าง: ใบเสนอราคาภายใน (สร้างลูกค้าจากชื่อผู้ซื้อ · ส่งลูกค้า/ตอบรับ/ออกใบแจ้งหนี้ไม่ได้) → รับงานจากคำขอ = งาน Fastwork + งานจากใบ
// งานเดิม: ลิงก์ผูกงาน · คำขอเข้าการ์ดทันที · ลูกค้ายืนยันบน Fastwork = งวดเพิ่มต่อท้าย · ปิดรับความต้องการ = ปิดลิงก์ของงาน
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

async function submitFastwork(link, items, seenTotal) {
    return expectStatus(await anonymous("POST", `/V1/order/${link.ol_short_code}/requests`, { submit_key: crypto.randomUUID(), items, seen_total: seenTotal }), 201);
}

const detailOf = async (requestId) => expectStatus(await api.callApi("GET", `/V1/service-requests/${requestId}`), 200);

test.before(async () => {
    api = await startTestServer("fastwork_requests");
    await api.loginAsAdmin();
    const [[admin]] = await api.pool.query("SELECT user_id FROM tb_users WHERE user_username = 'admin'");
    adminId = admin.user_id;
    // คำถามความต้องการตรวจใน api-order-requirements.test.js
    await api.pool.query("UPDATE tb_requirement_groups SET rqg_status = 'inactive'");
    const product = (name, price) => ({
        product_code: null, product_name: name, product_description: null, product_unit: "งาน", product_price: price,
        product_category_id: null, product_status: "active", product_is_public: true,
    });
    ids.logo = expectStatus(await api.callApi("POST", "/V1/products", { body: product("ออกแบบโลโก้", "3000") }), 201).product_id;
    ids.banner = expectStatus(await api.callApi("POST", "/V1/products", { body: product("แบนเนอร์", "800") }), 201).product_id;
    ids.preHireLink = expectStatus(await api.callApi("POST", "/V1/order-links", { body: { ol_kind: "fastwork", ol_buyer_name: "mint_shop", ol_assignee_id: adminId } }), 201);
});

test.after(async () => {
    await api?.stop();
});

test("ก่อนจ้าง: ใบภายใน (ลูกค้าจากชื่อผู้ซื้อ · ส่ง/ตอบรับ/ใบแจ้งหนี้ไม่ได้) → รับงานจากคำขอ = งาน Fastwork + งานจากใบ", async () => {
    // โลโก้ 1 + แบนเนอร์ 2 = 4,600
    const sent = await submitFastwork(ids.preHireLink, [{ kind: "product", id: ids.logo, quantity: 1 }, { kind: "product", id: ids.banner, quantity: 2 }], "4600.00");
    let detail = await detailOf(sent.svr_id);
    assert.equal(detail.fastwork_plan.mode, "new");
    assert.equal(detail.fastwork_plan.can_take, true, "รับงานได้เลยโดยไม่ออกใบ");
    assert.deepEqual(detail.fastwork_plan.milestones, [{ fwm_name: "ทั้งงาน", fwm_amount: "4600.00" }]);

    const confirmed = expectStatus(await api.callApi("POST", `/V1/service-requests/${sent.svr_id}/confirm`, { body: { svr_version: detail.request.svr_version, create_quotation: true } }), 200);
    const [[client]] = await api.pool.query("SELECT c.client_name, c.client_type FROM tb_service_requests r JOIN tb_clients c ON c.client_id = r.svr_client_id WHERE r.svr_id = ?", [sent.svr_id]);
    assert.deepEqual({ ...client }, { client_name: "mint_shop", client_type: "individual" }, "สร้างลูกค้าบุคคลจากชื่อผู้ซื้อ");

    const quotation = expectStatus(await api.callApi("GET", `/V1/quotations/${confirmed.qt_id}`), 200);
    assert.deepEqual(quotation.fastwork_internal, { request_id: sent.svr_id });
    detail = await detailOf(sent.svr_id);
    assert.equal(detail.fastwork_plan.can_take, false, "ใบภายในยังเป็นร่าง");
    assert.match(detail.fastwork_plan.blocked_reason, /ยังไม่อนุมัติ/);

    await api.pool.query("UPDATE tb_quotations SET qt_status = 'approved' WHERE qt_id = ?", [confirmed.qt_id]);
    const approved = expectStatus(await api.callApi("GET", `/V1/quotations/${confirmed.qt_id}`), 200);
    assert.equal(approved.actions.can_send, false);
    assert.equal(approved.actions.can_accept, false);
    const sendBlocked = expectStatus(await api.callApi("POST", `/V1/quotations/${confirmed.qt_id}/send`, { body: {} }), 409);
    assert.equal(sendBlocked.code, "QUOTATION_FASTWORK_INTERNAL");
    expectStatus(await api.callApi("POST", `/V1/quotations/${confirmed.qt_id}/accept`, { body: { project_mode: "none", create_tasks: false } }), 409);

    detail = await detailOf(sent.svr_id);
    assert.equal(detail.fastwork_plan.can_take, true);
    assert.equal(detail.fastwork_plan.title, "ออกแบบโลโก้ + แบนเนอร์");
    const job = expectStatus(
        await api.callApi("POST", "/V1/fastwork/projects", {
            body: {
                project_name: detail.fastwork_plan.title,
                client_id: detail.fastwork_plan.client_id,
                milestones: detail.fastwork_plan.milestones,
                service_request_id: sent.svr_id,
            },
        }),
        201,
    );
    const [[accepted]] = await api.pool.query("SELECT qt_status, qt_project_id FROM tb_quotations WHERE qt_id = ?", [confirmed.qt_id]);
    assert.deepEqual({ ...accepted }, { qt_status: "accepted", qt_project_id: job.project_id }, "ใบภายในผูกงานเป็นตอบรับ");
    const [tasks] = await api.pool.query("SELECT task_title, task_quotation_item_id FROM tb_tasks WHERE project_id = ? ORDER BY task_sort_order", [job.project_id]);
    assert.deepEqual(tasks.map((task) => task.task_title), ["ออกแบบโลโก้", "แบนเนอร์"]);
    assert.ok(tasks.every((task) => task.task_quotation_item_id), "งานอ้างกลับรายการในใบ");
    detail = await detailOf(sent.svr_id);
    assert.equal(detail.request.svr_project_id, job.project_id);
    assert.equal(detail.fastwork_plan.can_take, false);

    const invoiceBlocked = expectStatus(await api.callApi("POST", "/V1/invoices", { body: { quotation_id: confirmed.qt_id, milestone_ids: [999999] } }), 409);
    assert.equal(invoiceBlocked.code, "QUOTATION_FASTWORK_INTERNAL");
    const requirements = expectStatus(await api.callApi("GET", `/V1/projects/${job.project_id}/requirements`), 200);
    assert.deepEqual(requirements.data.map((row) => row.svr_id), [sent.svr_id]);

    // รับซ้ำ = ไม่เปิดงานซ้ำ (ทั้งคำสั่งย้อนกลับ)
    const [[{ projectsBefore }]] = await api.pool.query("SELECT COUNT(*) AS projectsBefore FROM tb_projects");
    expectStatus(
        await api.callApi("POST", "/V1/fastwork/projects", { body: { project_name: "ซ้ำ", client_id: detail.fastwork_plan.client_id, milestones: detail.fastwork_plan.milestones, service_request_id: sent.svr_id } }),
        409,
    );
    const [[{ projectsAfter }]] = await api.pool.query("SELECT COUNT(*) AS projectsAfter FROM tb_projects");
    assert.equal(Number(projectsAfter), Number(projectsBefore));
});

test("ก่อนจ้าง: ผู้ซื้อไม่จ้างหลังออกใบภายใน → ปิดคำขอได้ · รับงานไม่ออกใบ = งานจากรายการในคำขอ", async () => {
    const unhired = await submitFastwork(ids.preHireLink, [{ kind: "product", id: ids.logo, quantity: 1 }], "3000.00");
    let detail = await detailOf(unhired.svr_id);
    expectStatus(await api.callApi("POST", `/V1/service-requests/${unhired.svr_id}/confirm`, { body: { svr_version: detail.request.svr_version, create_quotation: true } }), 200);
    detail = await detailOf(unhired.svr_id);
    const closed = expectStatus(await api.callApi("POST", `/V1/service-requests/${unhired.svr_id}/close`, { body: { svr_version: detail.request.svr_version, reason: "ผู้ซื้อเลือกร้านอื่น" } }), 200);
    assert.equal(closed.request.svr_status, "closed");

    const direct = await submitFastwork(ids.preHireLink, [{ kind: "product", id: ids.banner, quantity: 3 }], "2400.00");
    const job = expectStatus(
        await api.callApi("POST", "/V1/fastwork/projects", { body: { project_name: "แบนเนอร์ 3 ชิ้น", client_name: "mint_shop", milestones: [{ fwm_name: "ทั้งงาน", fwm_amount: "2400" }], service_request_id: direct.svr_id } }),
        201,
    );
    const [tasks] = await api.pool.query("SELECT task_title FROM tb_tasks WHERE project_id = ?", [job.project_id]);
    assert.deepEqual(tasks.map((task) => task.task_title), ["แบนเนอร์"]);
    detail = await detailOf(direct.svr_id);
    assert.equal(detail.request.svr_status, "converted");
});

test("งานเดิม: คำขอเข้าการ์ดทันที · ลูกค้ายืนยันบน Fastwork = งวดเพิ่มต่อท้าย · ปิดรับความต้องการ = ปิดลิงก์", async () => {
    const job = expectStatus(
        await api.callApi("POST", "/V1/fastwork/projects", { body: { project_name: "เว็บร้านมิ้นท์", client_name: "mint_web", milestones: [{ fwm_name: "งวดแรก", fwm_amount: "5000" }] } }),
        201,
    );
    const link = expectStatus(await api.callApi("POST", "/V1/order-links", { body: { ol_kind: "fastwork", ol_project_id: job.project_id, ol_assignee_id: adminId } }), 201);
    const sent = await submitFastwork(link, [{ kind: "product", id: ids.banner, quantity: 1 }], "800.00");
    let detail = await detailOf(sent.svr_id);
    assert.equal(detail.request.svr_client_id, job.client_id, "ลูกค้าของงานเดิม");
    assert.equal(detail.fastwork_plan.mode, "existing");
    let requirements = expectStatus(await api.callApi("GET", `/V1/projects/${job.project_id}/requirements`), 200);
    assert.deepEqual(requirements.data.map((row) => row.svr_id), [sent.svr_id], "เห็นในการ์ดก่อนยืนยัน");
    assert.equal(requirements.open_link_count, 1);

    // ลิงก์งานเดิมรับงานใหม่ไม่ได้
    expectStatus(
        await api.callApi("POST", "/V1/fastwork/projects", { body: { project_name: "x", client_id: job.client_id, milestones: [{ fwm_name: "x", fwm_amount: "1" }], service_request_id: sent.svr_id } }),
        409,
    );
    expectStatus(await api.callApi("POST", `/V1/service-requests/${sent.svr_id}/fastwork-accept`, { body: { svr_version: detail.request.svr_version + 1, milestones: [{ fwm_name: "งานเพิ่ม", fwm_amount: "800" }] } }), 409);
    expectStatus(await api.callApi("POST", `/V1/service-requests/${sent.svr_id}/fastwork-accept`, { body: { svr_version: detail.request.svr_version, milestones: [{ fwm_name: "งานเพิ่ม: แบนเนอร์", fwm_amount: "800" }] } }), 200);
    const [milestones] = await api.pool.query("SELECT fwm_order, fwm_name, fwm_amount FROM tb_fastwork_milestones WHERE fwm_project_id = ? ORDER BY fwm_order", [job.project_id]);
    assert.deepEqual(milestones.map((row) => [row.fwm_order, row.fwm_name, row.fwm_amount]), [
        [1, "งวดแรก", "5000.00"],
        [2, "งานเพิ่ม: แบนเนอร์", "800.00"],
    ]);
    const [tasks] = await api.pool.query("SELECT task_title FROM tb_tasks WHERE project_id = ?", [job.project_id]);
    assert.deepEqual(tasks.map((task) => task.task_title), ["แบนเนอร์"]);
    detail = await detailOf(sent.svr_id);
    assert.equal(detail.request.svr_status, "converted");

    const closedLinks = expectStatus(await api.callApi("POST", `/V1/projects/${job.project_id}/requirements/close-links`, { body: {} }), 200);
    assert.equal(closedLinks.closed, 1);
    requirements = expectStatus(await api.callApi("GET", `/V1/projects/${job.project_id}/requirements`), 200);
    assert.equal(requirements.open_link_count, 0);
    const shop = expectStatus(await anonymous("GET", `/V1/order/${link.ol_short_code}`), 200);
    assert.equal(shop.link.state, "disabled");
});

test("ตัวคิดราคาภายใน: สินค้าหน้าร้าน + ชุดคำถาม", async () => {
    const catalog = expectStatus(await api.callApi("GET", "/V1/fastwork/price-catalog"), 200);
    assert.ok(catalog.catalog.products.some((row) => row.product_id === ids.logo));
    assert.ok(Array.isArray(catalog.questionnaire));
});
