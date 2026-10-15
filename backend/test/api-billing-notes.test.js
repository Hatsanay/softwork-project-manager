// ใบวางบิล (ขั้น 1B-4) — รวมใบแจ้งหนี้ที่ออกแล้วของลูกค้ารายเดียว สกุลเดียว · ร่าง → ออก → ยกเลิก
// ยิงผ่านเซิร์ฟเวอร์จริงบนฐานข้อมูลชั่วคราว · แบบระบบ: docs/plans/2026-10-14-invoices-1b.md หัวข้อ 4.4
const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { startTestServer } = require("./support/test-server");
const { PERMISSION_KEYS } = require("../src/shared/permissions.mjs");
const { todayBangkok } = require("../src/utils/bangkok-time");

const HEAD_OFFICE_ID = "BRA202601010000001";
const PASSWORD = "Staff@2026";

let api;
const clients = {};
const people = {};

function daysFromToday(dayCount) {
    const [year, month, day] = todayBangkok().split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day + dayCount)).toISOString().slice(0, 10);
}

let userCounter = 60;
async function createPerson(name, permissionKeys) {
    const bits = PERMISSION_KEYS.map((key) => (permissionKeys.includes(key) ? "1" : "0")).join("");
    const role = await api.callApi("POST", "/V1/roles", { body: { role_name: `role-${name}`, role_permission: bits } });
    assert.equal(role.status, 201, JSON.stringify(role.body));
    userCounter += 1;
    const userId = `USE20990101000${String(userCounter).padStart(4, "0")}`;
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    await api.pool.query(
        `INSERT INTO tb_users (user_id, user_username, user_email, user_password, user_fname, user_lname, user_role_id, user_must_change_password)
         VALUES (?, ?, ?, ?, ?, 'ทดสอบ', ?, 0)`,
        [userId, name, `${name}@example.com`, passwordHash, name, role.body.role_id],
    );
    return { userId, roleId: role.body.role_id, token: await api.login(name, PASSWORD) };
}

function as(person, method, url, body) {
    return api.callApi(method, url, { token: person?.token, body });
}

function expectStatus(response, status) {
    assert.equal(response.status, status, JSON.stringify(response.body));
    return response.body;
}

/**
 * ใบแจ้งหนี้จากใบเสนอราคาเก็บครั้งเดียว (ผู้ดูแลทำทุกขั้น)
 * @param {{ clientId: string, price: string, currency?: string, issue?: boolean }} options
 */
async function invoiceFor({ clientId, price, currency = "THB", issue = true }) {
    const foreign =
        currency === "THB"
            ? {}
            : { qt_exchange_rate: "35", qt_rate_source: "manual", qt_rate_override_reason: "อัตราคงที่ตามสัญญา" };
    const quotation = expectStatus(
        await api.callApi("POST", "/V1/quotations", {
            body: {
                qt_client_id: clientId,
                qt_branch_id: HEAD_OFFICE_ID,
                qt_title: `งาน ${price}`,
                qt_currency: currency,
                qt_valid_days: 30,
                items: [{ qti_type: "item", qti_description: "บริการ", qti_quantity: "1", qti_unit_price: price }],
                ...foreign,
            },
        }),
        201,
    );
    expectStatus(await api.callApi("POST", `/V1/quotations/${quotation.qt_id}/submit`, { body: {} }), 200);
    expectStatus(await api.callApi("POST", `/V1/quotations/${quotation.qt_id}/approve`, { body: {} }), 200);
    expectStatus(
        await api.callApi("POST", `/V1/quotations/${quotation.qt_id}/accept`, {
            body: { project_mode: "none", create_tasks: false },
        }),
        200,
    );
    const billable = expectStatus(
        await api.callApi("GET", `/V1/quotations/${quotation.qt_id}/billable-milestones`),
        200,
    );
    const invoice = expectStatus(
        await api.callApi("POST", "/V1/invoices", {
            body: { quotation_id: quotation.qt_id, milestone_ids: [billable.milestones[0].qtm_id] },
        }),
        201,
    );
    if (issue) expectStatus(await api.callApi("POST", `/V1/invoices/${invoice.inv_id}/issue`, { body: {} }), 200);
    return invoice.inv_id;
}

function noteDraft(invoiceIds, overrides = {}) {
    return {
        bn_client_id: clients.main,
        bn_branch_id: HEAD_OFFICE_ID,
        bn_language: "th",
        bn_payment_date: daysFromToday(7),
        bn_notes: "นัดรับเช็คทุกวันศุกร์",
        invoice_ids: invoiceIds,
        ...overrides,
    };
}

async function noteDetail(billingNoteId, person = people.sales) {
    return expectStatus(await as(person, "GET", `/V1/billing-notes/${billingNoteId}`), 200);
}

test.before(async () => {
    api = await startTestServer("billing_notes");
    await api.loginAsAdmin();

    people.sales = await createPerson("bn.sales", ["dashboard", "viewInvoices", "createInvoice"]);
    people.canceller = await createPerson("bn.canceller", ["dashboard", "viewInvoices", "cancelInvoice"]);
    people.viewer = await createPerson("bn.viewer", ["dashboard", "viewInvoices"]);

    for (const [key, name] of [
        ["main", "บริษัท วางบิล จำกัด"],
        ["other", "บริษัท อื่น จำกัด"],
    ]) {
        const client = expectStatus(await api.callApi("POST", "/V1/clients", { body: { client_name: name } }), 201);
        clients[key] = client.client_id;
    }
    // ผู้ดูแลสร้างและอนุมัติใบเสนอราคาเองในเทสต์นี้
    await api.pool.query(
        "UPDATE tb_company_settings SET cs_vat_registered_from = '2000-01-01', cs_allow_self_approval = 1",
    );
});

test.after(async () => {
    await api?.stop();
});

test("รวมได้เฉพาะใบที่ออกแล้วของลูกค้ารายเดียว สกุลเดียว · ยอดรวม = ยอดค้างของทุกใบ · ใบที่อยู่ในร่างแล้วหายจากรายการให้เลือก", async () => {
    const first = await invoiceFor({ clientId: clients.main, price: "10000" });
    const second = await invoiceFor({ clientId: clients.main, price: "5000" });
    const usd = await invoiceFor({ clientId: clients.main, price: "100", currency: "USD" });
    const otherClient = await invoiceFor({ clientId: clients.other, price: "2000" });
    const notIssued = await invoiceFor({ clientId: clients.main, price: "3000", issue: false });

    const billable = expectStatus(
        await as(people.viewer, "GET", `/V1/billing-notes/billable-invoices?client_id=${clients.main}`),
        200,
    );
    const billableIds = billable.data.map((invoice) => invoice.inv_id);
    assert.ok(billableIds.includes(first) && billableIds.includes(second) && billableIds.includes(usd));
    assert.ok(!billableIds.includes(notIssued), "ร่างใบแจ้งหนี้ยังรวมไม่ได้");
    assert.ok(!billableIds.includes(otherClient), "กรองตามลูกค้า");
    assert.equal(billable.data.find((invoice) => invoice.inv_id === first).outstanding_amount, "10700.00");

    const mixedCurrency = await as(people.sales, "POST", "/V1/billing-notes", noteDraft([first, usd]));
    assert.equal(mixedCurrency.status, 409);
    assert.equal(mixedCurrency.body.code, "BILLING_NOTE_INVOICE_UNAVAILABLE");
    assert.match(mixedCurrency.body.message, /สกุล USD/);

    const mixedClient = await as(people.sales, "POST", "/V1/billing-notes", noteDraft([first, otherClient]));
    assert.equal(mixedClient.status, 409);
    assert.match(mixedClient.body.message, /ลูกค้ารายอื่น/);

    const draftInvoice = await as(people.sales, "POST", "/V1/billing-notes", noteDraft([notIssued]));
    assert.equal(draftInvoice.status, 409);
    assert.match(draftInvoice.body.message, /ยังไม่ได้ออก/);

    const pastDate = await as(
        people.sales,
        "POST",
        "/V1/billing-notes",
        noteDraft([first], { bn_payment_date: daysFromToday(-1) }),
    );
    assert.equal(pastDate.status, 400);
    assert.ok(pastDate.body.fields.bn_payment_date);

    const duplicated = await as(people.sales, "POST", "/V1/billing-notes", noteDraft([first, first]));
    assert.equal(duplicated.status, 400);

    const viewerCreate = await as(people.viewer, "POST", "/V1/billing-notes", noteDraft([first]));
    assert.equal(viewerCreate.status, 403);

    const created = expectStatus(await as(people.sales, "POST", "/V1/billing-notes", noteDraft([second, first])), 201);
    const detail = await noteDetail(created.bn_id);
    assert.equal(detail.billing_note.bn_status, "draft");
    assert.equal(detail.billing_note.bn_number, null);
    assert.equal(detail.billing_note.bn_currency, "THB", "สกุลมาจากใบแจ้งหนี้");
    assert.equal(detail.billing_note.bn_total, "16050.00", "5,350 + 10,700");
    assert.deepEqual(
        detail.invoices.map((invoice) => invoice.inv_id),
        [second, first],
        "เรียงตามที่ผู้ใช้เลือก",
    );
    assert.ok(detail.readiness.every((check) => check.ok));
    assert.equal(detail.actions.can_issue, true);

    const afterDraft = expectStatus(
        await as(people.viewer, "GET", `/V1/billing-notes/billable-invoices?client_id=${clients.main}`),
        200,
    );
    assert.ok(!afterDraft.data.some((invoice) => invoice.inv_id === first), "อยู่ในร่างแล้ว เลือกในใบอื่นไม่ได้");
    const forEdit = expectStatus(
        await as(
            people.viewer,
            "GET",
            `/V1/billing-notes/billable-invoices?client_id=${clients.main}&billing_note_id=${created.bn_id}`,
        ),
        200,
    );
    assert.ok(
        forEdit.data.some((invoice) => invoice.inv_id === first),
        "หน้าแก้ร่างเดิมยังเห็นใบของตัวเอง",
    );

    const again = await as(people.sales, "POST", "/V1/billing-notes", noteDraft([first]));
    assert.equal(again.status, 409);
    assert.match(again.body.message, /อยู่ในใบวางบิล/);

    // ใบแจ้งหนี้ที่อยู่ในใบวางบิล (แม้เป็นร่าง) ยกเลิกไม่ได้
    const cancelInvoice = await api.callApi("POST", `/V1/invoices/${first}/cancel`, { body: { reason: "ทดสอบ" } });
    assert.equal(cancelInvoice.status, 409);
    assert.equal(cancelInvoice.body.code, "INVOICE_IN_BILLING_NOTE");
});

test("สองคนรวมใบแจ้งหนี้ใบเดียวกันพร้อมกัน → ได้ใบวางบิลใบเดียว", async () => {
    const invoiceId = await invoiceFor({ clientId: clients.main, price: "7000" });
    const responses = await Promise.all(
        Array.from({ length: 4 }, () => as(people.sales, "POST", "/V1/billing-notes", noteDraft([invoiceId]))),
    );
    const statuses = responses.map((response) => response.status).sort();
    assert.deepEqual(statuses, [201, 409, 409, 409], JSON.stringify(responses.map((response) => response.body)));
    const [[{ count }]] = await api.pool.query(
        "SELECT COUNT(*) AS count FROM tb_billing_note_invoices WHERE bni_invoice_id = ?",
        [invoiceId],
    );
    assert.equal(Number(count), 1);
});

test("แก้ร่าง: ต้องส่งเวอร์ชัน · เวอร์ชันเก่าถูกปฏิเสธ · เปลี่ยนใบที่รวมได้ · ลบร่างแล้วใบแจ้งหนี้ว่าง", async () => {
    const first = await invoiceFor({ clientId: clients.main, price: "1000" });
    const second = await invoiceFor({ clientId: clients.main, price: "2000" });
    const created = expectStatus(await as(people.sales, "POST", "/V1/billing-notes", noteDraft([first])), 201);

    const noVersion = await as(people.sales, "PUT", `/V1/billing-notes/${created.bn_id}`, noteDraft([first, second]));
    assert.equal(noVersion.status, 400);

    expectStatus(
        await as(
            people.sales,
            "PUT",
            `/V1/billing-notes/${created.bn_id}`,
            noteDraft([second, first], { bn_version: 0, bn_language: "en" }),
        ),
        200,
    );
    const detail = await noteDetail(created.bn_id);
    assert.equal(detail.billing_note.bn_version, 1);
    assert.equal(detail.billing_note.bn_language, "en");
    assert.equal(detail.billing_note.bn_total, "3210.00");

    const stale = await as(
        people.sales,
        "PUT",
        `/V1/billing-notes/${created.bn_id}`,
        noteDraft([first], { bn_version: 0 }),
    );
    assert.equal(stale.status, 409);
    assert.equal(stale.body.code, "BILLING_NOTE_CHANGED");

    expectStatus(await as(people.sales, "DELETE", `/V1/billing-notes/${created.bn_id}`, { bn_version: 1 }), 204);
    const reuse = expectStatus(await as(people.sales, "POST", "/V1/billing-notes", noteDraft([first, second])), 201);
    assert.ok(reuse.bn_id);
});

test("ออก: ได้เลข BN วันที่วันนี้ snapshot ลูกค้า · แก้/ลบไม่ได้ · ยกเลิกต้องมีสิทธิ์และเหตุผล · ยกเลิกแล้วใบแจ้งหนี้ใช้ใหม่ได้", async () => {
    const invoiceId = await invoiceFor({ clientId: clients.main, price: "4000" });
    const created = expectStatus(await as(people.sales, "POST", "/V1/billing-notes", noteDraft([invoiceId])), 201);

    const viewerIssue = await as(people.viewer, "POST", `/V1/billing-notes/${created.bn_id}/issue`, {});
    assert.equal(viewerIssue.status, 403);

    const issued = expectStatus(
        await as(people.sales, "POST", `/V1/billing-notes/${created.bn_id}/issue`, { bn_version: 0 }),
        200,
    );
    assert.match(issued.bn_number, /^BN-\d{8}-\d{6}$/);
    assert.equal(issued.bn_issue_date, todayBangkok());

    const issueAgain = await as(people.sales, "POST", `/V1/billing-notes/${created.bn_id}/issue`, {});
    assert.equal(issueAgain.status, 409, "กดออกซ้ำไม่ได้เลขใหม่");

    // snapshot ไม่เปลี่ยนเมื่อแก้ชื่อลูกค้าทีหลัง
    await api.pool.query("UPDATE tb_clients SET client_name = 'ชื่อใหม่' WHERE client_id = ?", [clients.main]);
    let detail = await noteDetail(created.bn_id);
    assert.equal(detail.billing_note.bn_client_snapshot.client_name, "บริษัท วางบิล จำกัด");
    assert.equal(detail.billing_note.bn_company_snapshot.branch.branch_code, "00000");
    assert.equal(detail.billing_note.bn_total, "4280.00");
    assert.equal(detail.actions.can_edit, false);
    await api.pool.query("UPDATE tb_clients SET client_name = 'บริษัท วางบิล จำกัด' WHERE client_id = ?", [
        clients.main,
    ]);

    const edit = await as(
        people.sales,
        "PUT",
        `/V1/billing-notes/${created.bn_id}`,
        noteDraft([invoiceId], { bn_version: 1 }),
    );
    assert.equal(edit.status, 409);
    const remove = await as(people.sales, "DELETE", `/V1/billing-notes/${created.bn_id}`, {});
    assert.equal(remove.status, 409);

    const salesCancel = await as(people.sales, "POST", `/V1/billing-notes/${created.bn_id}/cancel`, { reason: "ผิด" });
    assert.equal(salesCancel.status, 403, "ไม่มีสิทธิ์ยกเลิกใบแจ้งหนี้");
    const noReason = await as(people.canceller, "POST", `/V1/billing-notes/${created.bn_id}/cancel`, {});
    assert.equal(noReason.status, 400);
    expectStatus(
        await as(people.canceller, "POST", `/V1/billing-notes/${created.bn_id}/cancel`, {
            reason: "ลูกค้าขอรวมกับบิลเดือนหน้า",
        }),
        200,
    );
    detail = await noteDetail(created.bn_id);
    assert.equal(detail.billing_note.bn_status, "cancelled");
    assert.equal(detail.billing_note.bn_cancel_reason, "ลูกค้าขอรวมกับบิลเดือนหน้า");
    assert.equal(detail.billing_note.bn_number, issued.bn_number, "เลขยังอยู่");

    const reuse = await as(people.sales, "POST", "/V1/billing-notes", noteDraft([invoiceId]));
    assert.equal(reuse.status, 201, "ใบวางบิลยกเลิกแล้ว ใบแจ้งหนี้กลับมาเลือกได้");
});

test("ออกไม่ได้เมื่อวันนัดชำระผ่านไปแล้ว หรือใบแจ้งหนี้ในร่างรับชำระครบแล้ว", async () => {
    const invoiceId = await invoiceFor({ clientId: clients.main, price: "1500" });
    const created = expectStatus(await as(people.sales, "POST", "/V1/billing-notes", noteDraft([invoiceId])), 201);

    await api.pool.query("UPDATE tb_billing_notes SET bn_payment_date = ? WHERE bn_id = ?", [
        daysFromToday(-2),
        created.bn_id,
    ]);
    let detail = await noteDetail(created.bn_id);
    assert.equal(detail.readiness.find((check) => check.key === "payment_date").ok, false);
    const pastDate = await as(people.sales, "POST", `/V1/billing-notes/${created.bn_id}/issue`, {});
    assert.equal(pastDate.status, 400);
    assert.equal(pastDate.body.code, "BILLING_NOTE_NOT_READY");

    await api.pool.query("UPDATE tb_billing_notes SET bn_payment_date = NULL WHERE bn_id = ?", [created.bn_id]);
    await api.pool.query("UPDATE tb_invoices SET inv_paid_amount = inv_total WHERE inv_id = ?", [invoiceId]);
    detail = await noteDetail(created.bn_id);
    assert.match(detail.invoices[0].problem, /รับชำระครบแล้ว/);
    const paid = await as(people.sales, "POST", `/V1/billing-notes/${created.bn_id}/issue`, {});
    assert.equal(paid.status, 409);
    assert.equal(paid.body.code, "BILLING_NOTE_INVOICE_UNAVAILABLE");
});

test("รายการ: แท็บตามสถานะ · ค้นหาด้วยเลขใบแจ้งหนี้ในใบวางบิล", async () => {
    const invoiceId = await invoiceFor({ clientId: clients.other, price: "900" });
    const created = expectStatus(
        await as(people.sales, "POST", "/V1/billing-notes", noteDraft([invoiceId], { bn_client_id: clients.other })),
        201,
    );
    const issued = expectStatus(await as(people.sales, "POST", `/V1/billing-notes/${created.bn_id}/issue`, {}), 200);
    const [[invoice]] = await api.pool.query("SELECT inv_number FROM tb_invoices WHERE inv_id = ?", [invoiceId]);

    const byInvoiceNumber = expectStatus(
        await as(people.viewer, "GET", `/V1/billing-notes?search=${encodeURIComponent(invoice.inv_number)}`),
        200,
    );
    assert.equal(byInvoiceNumber.total, 1);
    assert.equal(byInvoiceNumber.data[0].bn_number, issued.bn_number);
    assert.equal(byInvoiceNumber.data[0].invoice_count, 1);

    const drafts = expectStatus(await as(people.viewer, "GET", "/V1/billing-notes?tab=draft&limit=200"), 200);
    assert.ok(!drafts.data.some((note) => note.bn_id === created.bn_id));
    const issuedTab = expectStatus(await as(people.viewer, "GET", "/V1/billing-notes?tab=issued&limit=200"), 200);
    assert.ok(issuedTab.data.some((note) => note.bn_id === created.bn_id));

    const invoiceDetail = expectStatus(await as(people.viewer, "GET", `/V1/invoices/${invoiceId}`), 200);
    assert.equal(invoiceDetail.billing_note.bn_number, issued.bn_number, "หน้าใบแจ้งหนี้รู้ว่าอยู่ในใบวางบิลไหน");
});

test("ทุกการกระทำเข้า audit log ด้วยชื่อการกระทำภาษาไทย", async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    const [rows] = await api.pool.query(
        "SELECT DISTINCT aud_action FROM tb_audit_logs WHERE aud_path LIKE '/billing-notes%' AND aud_success = 1",
    );
    const actions = new Set(rows.map((row) => row.aud_action));
    for (const expected of [
        "สร้างร่างใบวางบิล",
        "แก้ร่างใบวางบิล",
        "ลบร่างใบวางบิล",
        "ออกใบวางบิล",
        "ยกเลิกใบวางบิล",
    ]) {
        assert.ok(actions.has(expected), `ไม่พบ "${expected}" (มี: ${[...actions].join(", ")})`);
    }
});
