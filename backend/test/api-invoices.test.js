// ใบแจ้งหนี้ (ขั้น 1B-2) — ออกจากงวดของใบเสนอราคา · ใบสร้างเอง + อนุมัติ · ยกเลิก · ออกใหม่แทน · เกินกำหนด
// ยิงผ่านเซิร์ฟเวอร์จริงบนฐานข้อมูลชั่วคราว · แบบระบบ: docs/plans/2026-10-14-invoices-1b.md (R-B1 ถึง R-B13)
const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { startTestServer } = require("./support/test-server");
const { PERMISSION_KEYS } = require("../src/shared/permissions.mjs");
const { todayBangkok } = require("../src/utils/bangkok-time");

const HEAD_OFFICE_ID = "BRA202601010000001";
const PASSWORD = "Staff@2026";

let api;
let clientId;
const people = {};

function daysFromToday(dayCount) {
    const [year, month, day] = todayBangkok().split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day + dayCount)).toISOString().slice(0, 10);
}

let userCounter = 40;
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

// รายการ 20,000 + 2 × 50,000 = 120,000 ก่อน VAT
function quotationDraft(overrides = {}) {
    return {
        qt_client_id: clientId,
        qt_branch_id: HEAD_OFFICE_ID,
        qt_title: "พัฒนาระบบหลังบ้าน",
        qt_currency: "THB",
        qt_valid_days: 30,
        items: [
            { qti_type: "heading", qti_description: "ระบบหลังบ้าน" },
            { qti_type: "item", qti_description: "ออกแบบฐานข้อมูล", qti_quantity: "1", qti_unit: "งาน", qti_unit_price: "20000" },
            { qti_type: "item", qti_description: "ทำ API", qti_quantity: "2", qti_unit: "งาน", qti_unit_price: "50000" },
            { qti_type: "note", qti_description: "ราคานี้ไม่รวมค่าเซิร์ฟเวอร์" },
        ],
        ...overrides,
    };
}

const THREE_MILESTONES = {
    qt_payment_mode: "milestones",
    milestones: [
        { qtm_name: "มัดจำ", qtm_percent: "30" },
        { qtm_name: "ส่งมอบรอบแรก", qtm_percent: "40" },
        { qtm_name: "ปิดงาน", qtm_percent: "30" },
    ],
};

/** ใบเสนอราคาที่ลูกค้าตอบรับแล้ว: พนักงานขายสร้าง → ผู้ดูแล (role ระบบ ชั้น 1) อนุมัติ → ลูกค้าตอบรับ */
async function acceptedQuotation(overrides = {}) {
    const created = expectStatus(await as(people.sales, "POST", "/V1/quotations", quotationDraft(overrides)), 201);
    const quotationId = created.qt_id;
    expectStatus(await as(people.sales, "POST", `/V1/quotations/${quotationId}/submit`, {}), 200);
    expectStatus(await api.callApi("POST", `/V1/quotations/${quotationId}/approve`, { body: {} }), 200);
    expectStatus(
        await as(people.sales, "POST", `/V1/quotations/${quotationId}/accept`, {
            project_mode: "none",
            create_tasks: false,
        }),
        200,
    );
    return quotationId;
}

async function billable(quotationId) {
    return expectStatus(await as(people.sales, "GET", `/V1/quotations/${quotationId}/billable-milestones`), 200);
}

async function invoiceDetail(invoiceId, person = people.sales) {
    return expectStatus(await as(person, "GET", `/V1/invoices/${invoiceId}`), 200);
}

async function createFromMilestones(quotationId, milestoneIds) {
    const created = await as(people.sales, "POST", "/V1/invoices", {
        quotation_id: quotationId,
        milestone_ids: milestoneIds,
    });
    return created;
}

async function registerVat(fromDate) {
    await api.pool.query("UPDATE tb_company_settings SET cs_vat_registered_from = ?", [fromDate]);
}

test.before(async () => {
    api = await startTestServer("invoices");
    await api.loginAsAdmin();

    people.sales = await createPerson("inv.sales", [
        "dashboard",
        "viewQuotations",
        "createQuotation",
        "viewInvoices",
        "createInvoice",
    ]);
    people.approver = await createPerson("inv.approver", ["dashboard", "viewInvoices", "approveInvoice"]);
    people.viewer = await createPerson("inv.viewer", ["dashboard", "viewInvoices"]);

    // ใบสร้างเอง: ชั้น 1 ผู้อนุมัติบิล · ชั้น 2 (ตั้งแต่ 100,000) role ระบบ
    const [[systemRole]] = await api.pool.query("SELECT role_id FROM tb_roles WHERE role_type = 'S' LIMIT 1");
    expectStatus(
        await api.callApi("PUT", "/V1/company/approval-levels", {
            body: {
                doc_type: "IV",
                levels: [
                    { al_min_amount_thb: "0", al_require_distinct: false, role_ids: [people.approver.roleId] },
                    { al_min_amount_thb: "100000", al_require_distinct: false, role_ids: [systemRole.role_id] },
                ],
            },
        }),
        200,
    );

    const client = expectStatus(await api.callApi("POST", "/V1/clients", { body: { client_name: "บริษัท ลูกค้าบิล จำกัด" } }), 201);
    clientId = client.client_id;
    await api.pool.query("UPDATE tb_company_settings SET cs_promptpay_id = '0812345678'");
    await registerVat("2000-01-01");
});

test.after(async () => {
    await api?.stop();
});

test("ใบเสนอราคาเก็บครั้งเดียวมีงวด \"ชำระเต็มจำนวน\" 1 แถว → ใบแจ้งหนี้คัดลอกรายการเต็ม ยอดเท่าใบเสนอราคา", async () => {
    const quotationId = await acceptedQuotation();
    const milestones = await billable(quotationId);
    assert.equal(milestones.can_bill, true);
    assert.equal(milestones.milestones.length, 1);
    const [full] = milestones.milestones;
    assert.equal(full.qtm_name, "ชำระเต็มจำนวน");
    assert.equal(full.qtm_amount, "128400.00");
    assert.equal(full.base_amount, "120000.00");
    assert.equal(full.billed_invoice, null);

    const created = expectStatus(await createFromMilestones(quotationId, [full.qtm_id]), 201);
    const draft = await invoiceDetail(created.inv_id);
    assert.equal(draft.invoice.inv_status, "draft");
    assert.equal(draft.invoice.inv_source, "quotation");
    assert.equal(draft.invoice.inv_number, null, "ร่างยังไม่มีเลข");
    assert.equal(draft.invoice.inv_total, "128400.00");
    assert.equal(draft.invoice.inv_credit_days, 30, "ลูกค้าไม่ได้ตั้งเครดิต → ใช้ค่าเริ่มต้นของบริษัท");
    assert.deepEqual(
        draft.items.map((item) => item.invi_type),
        ["heading", "item", "item", "note"],
    );
    assert.equal(draft.actions.can_issue, true);
    assert.equal(draft.actions.can_submit, false, "ใบจากงวดไม่ต้องอนุมัติ");

    const afterDraft = await billable(quotationId);
    assert.equal(afterDraft.milestones[0].billed_invoice.inv_status, "draft");
});

test("ออกใบจากงวด: แยกยอดก่อน VAT/VAT ตามใบเสนอราคา · ได้เลข วันที่ ครบกำหนด snapshot · ผลรวมทุกใบ = ใบเสนอราคาพอดี", async () => {
    const quotationId = await acceptedQuotation(THREE_MILESTONES);
    const { milestones } = await billable(quotationId);
    assert.deepEqual(
        milestones.map((milestone) => [milestone.qtm_amount, milestone.base_amount, milestone.vat_amount]),
        [
            ["38520.00", "36000.00", "2520.00"],
            ["51360.00", "48000.00", "3360.00"],
            ["38520.00", "36000.00", "2520.00"],
        ],
    );

    // งวด 1 + 3 รวมใบเดียว
    const first = expectStatus(await createFromMilestones(quotationId, [milestones[0].qtm_id, milestones[2].qtm_id]), 201);
    const draft = await invoiceDetail(first.inv_id);
    assert.deepEqual(
        draft.items.map((item) => [item.invi_description, item.invi_amount]),
        [
            ["งวดที่ 1 มัดจำ (30%) ตามใบเสนอราคาเลขที่ " + draft.invoice.qt_number, "36000.00"],
            ["งวดที่ 3 ปิดงาน (30%) ตามใบเสนอราคาเลขที่ " + draft.invoice.qt_number, "36000.00"],
        ],
    );
    assert.equal(draft.invoice.inv_total, "77040.00");

    const issued = expectStatus(await as(people.sales, "POST", `/V1/invoices/${first.inv_id}/issue`, { inv_version: 0 }), 200);
    assert.match(issued.inv_number, /^IV-\d{8}-\d{6}$/);
    assert.equal(issued.inv_issue_date, todayBangkok());
    assert.equal(issued.inv_due_date, daysFromToday(30));

    const issuedDetail = await invoiceDetail(first.inv_id);
    assert.equal(issuedDetail.invoice.inv_status, "issued");
    assert.equal(issuedDetail.invoice.inv_client_snapshot.client_name, "บริษัท ลูกค้าบิล จำกัด");
    assert.equal(issuedDetail.invoice.inv_bank_snapshot.promptpay_id, "0812345678");
    assert.equal(issuedDetail.invoice.is_outstanding, true);
    assert.equal(issuedDetail.invoice.is_overdue, false);
    assert.ok(issuedDetail.payment.qr_payload.startsWith("000201010212"), "QR มียอด (ใช้ครั้งเดียว)");
    assert.equal(issuedDetail.actions.can_edit, false);

    // ใบที่ออกแล้วแก้ไม่ได้
    const editIssued = await as(people.sales, "PUT", `/V1/invoices/${first.inv_id}`, {
        inv_title: "แก้ไม่ได้",
        inv_branch_id: HEAD_OFFICE_ID,
        inv_credit_days: 15,
        inv_version: issuedDetail.invoice.inv_version,
    });
    assert.equal(editIssued.status, 409);

    // งวด 2 ใบที่สอง → ผลรวมสองใบ = 128,400 พอดี
    const second = expectStatus(await createFromMilestones(quotationId, [milestones[1].qtm_id]), 201);
    expectStatus(await as(people.sales, "POST", `/V1/invoices/${second.inv_id}/issue`, {}), 200);
    const [[sums]] = await api.pool.query(
        "SELECT SUM(inv_after_discount) AS base, SUM(inv_vat_amount) AS vat, SUM(inv_total) AS total FROM tb_invoices WHERE inv_quotation_id = ?",
        [quotationId],
    );
    assert.deepEqual(sums, { base: "120000.00", vat: "8400.00", total: "128400.00" });
});

test("R-B1: งวดที่อยู่ในใบอื่นแล้วออกซ้ำไม่ได้ · กดพร้อมกันสองคำขอได้ใบเดียว · ลบร่างแล้วงวดกลับมาว่าง", async () => {
    const quotationId = await acceptedQuotation(THREE_MILESTONES);
    const { milestones } = await billable(quotationId);
    const firstId = milestones[0].qtm_id;

    const results = await Promise.all([createFromMilestones(quotationId, [firstId]), createFromMilestones(quotationId, [firstId])]);
    const statuses = results.map((result) => result.status).sort();
    assert.deepEqual(statuses, [201, 409]);
    const conflict = results.find((result) => result.status === 409);
    assert.equal(conflict.body.code, "MILESTONE_ALREADY_BILLED");
    assert.match(conflict.body.message, /งวดที่ 1/);

    const created = results.find((result) => result.status === 201).body;
    expectStatus(await as(people.sales, "DELETE", `/V1/invoices/${created.inv_id}`, {}), 204);
    expectStatus(await createFromMilestones(quotationId, [firstId]), 201);

    const otherQuotationMilestone = await createFromMilestones(quotationId, [999999]);
    assert.equal(otherQuotationMilestone.status, 400);
});

test("ออกบิลได้เฉพาะใบเสนอราคาที่ลูกค้าตอบรับแล้ว", async () => {
    const created = expectStatus(await as(people.sales, "POST", "/V1/quotations", quotationDraft()), 201);
    const { milestones, can_bill: canBill } = await billable(created.qt_id);
    assert.equal(canBill, false);
    const response = await createFromMilestones(created.qt_id, [milestones[0].qtm_id]);
    assert.equal(response.status, 409);
    assert.equal(response.body.code, "QUOTATION_NOT_ACCEPTED");
});

test("R-B4: ใบเสนอราคาก่อนจด VAT แต่ออกใบแจ้งหนี้หลังจด → ต้องยืนยัน แล้วคิด VAT ใหม่", async () => {
    await registerVat(null);
    const quotationId = await acceptedQuotation();
    const { milestones } = await billable(quotationId);
    assert.equal(milestones[0].qtm_amount, "120000.00", "ใบเสนอราคาไม่มี VAT");
    const created = expectStatus(await createFromMilestones(quotationId, [milestones[0].qtm_id]), 201);
    await registerVat(todayBangkok());

    const blocked = await as(people.sales, "POST", `/V1/invoices/${created.inv_id}/issue`, {});
    assert.equal(blocked.status, 409);
    assert.equal(blocked.body.code, "INVOICE_VAT_CHANGED");
    assert.match(blocked.body.message, /128,400\.00/);
    assert.match(blocked.body.message, /120,000\.00/);

    const issued = expectStatus(
        await as(people.sales, "POST", `/V1/invoices/${created.inv_id}/issue`, { confirm_vat_change: true }),
        200,
    );
    const detail = await invoiceDetail(issued.inv_id);
    assert.equal(detail.invoice.inv_vat_rate, "7.00");
    assert.equal(detail.invoice.inv_total, "128400.00");
    await registerVat("2000-01-01");
});

test("แก้ร่างจากงวด: แก้ได้แค่ข้อมูลประกอบ · หัก ณ ที่จ่ายคิดจากยอดก่อน VAT · QR ใส่ยอดสุทธิ · บัญชีต้องรับสกุลเดียวกัน", async () => {
    const quotationId = await acceptedQuotation();
    const { milestones } = await billable(quotationId);
    const created = expectStatus(await createFromMilestones(quotationId, [milestones[0].qtm_id]), 201);

    const updated = await as(people.sales, "PUT", `/V1/invoices/${created.inv_id}`, {
        inv_title: "ค่าพัฒนาระบบ งวดเดียว",
        inv_branch_id: HEAD_OFFICE_ID,
        inv_credit_days: 0,
        inv_wht_rate: "3",
        inv_notes: "โอนเข้าบัญชีบริษัทเท่านั้น",
        inv_version: 0,
        // ช่องที่ใบจากงวดแก้ไม่ได้ — ถูกตัดทิ้งโดยชุดตรวจ ไม่มีผลกับยอด
        items: [{ invi_type: "item", invi_description: "แอบแก้ยอด", invi_quantity: "1", invi_unit_price: "1" }],
    });
    expectStatus(updated, 200);
    const detail = await invoiceDetail(created.inv_id);
    assert.equal(detail.invoice.inv_title, "ค่าพัฒนาระบบ งวดเดียว");
    assert.equal(detail.invoice.inv_total, "128400.00", "ยอดยังตามใบเสนอราคา");
    assert.equal(detail.invoice.inv_wht_amount, "3600.00", "120,000 × 3%");
    assert.equal(detail.payment.net_payable, "124800.00");
    assert.ok(detail.payment.qr_payload.includes("5409124800.00"), "QR ฝังยอดหลังหัก ณ ที่จ่าย");

    const stale = await as(people.sales, "PUT", `/V1/invoices/${created.inv_id}`, {
        inv_title: "ซ้ำ",
        inv_branch_id: HEAD_OFFICE_ID,
        inv_credit_days: 0,
        inv_version: 0,
    });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.code, "INVOICE_CHANGED");

    const usdAccount = expectStatus(
        await api.callApi("POST", "/V1/company/bank-accounts", {
            body: {
                ba_bank_name: "ธนาคารทดสอบ",
                ba_account_name: "บริษัท",
                ba_account_no: "111-2-33333-4",
                ba_currency: "USD",
                ba_is_default: false,
                ba_status: "active",
            },
        }),
        201,
    );
    const wrongCurrency = await as(people.sales, "PUT", `/V1/invoices/${created.inv_id}`, {
        inv_title: "ค่าพัฒนาระบบ",
        inv_branch_id: HEAD_OFFICE_ID,
        inv_credit_days: 0,
        inv_bank_account_id: usdAccount.ba_id,
        inv_version: detail.invoice.inv_version,
    });
    assert.equal(wrongCurrency.status, 400);
    assert.match(wrongCurrency.body.fields.inv_bank_account_id, /USD/);

    // เครดิต 0 วัน = ครบกำหนดวันที่ออก
    const issued = expectStatus(await as(people.sales, "POST", `/V1/invoices/${created.inv_id}/issue`, {}), 200);
    assert.equal(issued.inv_due_date, todayBangkok());
});

function manualInvoice(overrides = {}) {
    return {
        inv_client_id: clientId,
        inv_branch_id: HEAD_OFFICE_ID,
        inv_title: "ค่าบริการเพิ่มเติม",
        inv_credit_days: 15,
        inv_currency: "THB",
        items: [{ invi_type: "item", invi_description: "แก้ไขหน้าเว็บ", invi_quantity: "3", invi_unit: "ชม.", invi_unit_price: "1500" }],
        ...overrides,
    };
}

test("ใบสร้างเอง: ออกตรงไม่ได้ ต้องส่งขออนุมัติ → คนไม่มีสิทธิ์อนุมัติไม่ได้ → ตีกลับต้องมีเหตุผล → อนุมัติครบ = ออกอัตโนมัติ", async () => {
    const missingPrice = await as(people.sales, "POST", "/V1/invoices", manualInvoice({ items: [{ invi_type: "item", invi_description: "ไม่มีราคา", invi_quantity: "1" }] }));
    assert.equal(missingPrice.status, 400);
    assert.ok(missingPrice.body.fields["items.0.invi_unit_price"]);

    const created = expectStatus(await as(people.sales, "POST", "/V1/invoices", manualInvoice()), 201);
    let detail = await invoiceDetail(created.inv_id);
    assert.equal(detail.invoice.inv_source, "manual");
    assert.equal(detail.invoice.inv_total, "4815.00", "4,500 + VAT 7%");
    assert.equal(detail.actions.can_issue, false);
    assert.equal(detail.actions.can_submit, true);

    const directIssue = await as(people.sales, "POST", `/V1/invoices/${created.inv_id}/issue`, {});
    assert.equal(directIssue.status, 409, "ใบสร้างเองต้องผ่านการอนุมัติ");

    const submitted = expectStatus(await as(people.sales, "POST", `/V1/invoices/${created.inv_id}/submit`, {}), 200);
    assert.deepEqual(submitted.approval_levels, [1], "ยอด 4,500 ไม่ถึงชั้น 2");

    const noPermission = await as(people.viewer, "POST", `/V1/invoices/${created.inv_id}/approve`, {});
    assert.equal(noPermission.status, 403);

    const noReason = await as(people.approver, "POST", `/V1/invoices/${created.inv_id}/return`, { reason: " " });
    assert.equal(noReason.status, 400);
    expectStatus(await as(people.approver, "POST", `/V1/invoices/${created.inv_id}/return`, { reason: "ราคาต่อชั่วโมงผิด" }), 200);
    detail = await invoiceDetail(created.inv_id);
    assert.equal(detail.invoice.inv_status, "draft");
    assert.equal(detail.invoice.inv_returned_reason, "ราคาต่อชั่วโมงผิด");

    expectStatus(await as(people.sales, "POST", `/V1/invoices/${created.inv_id}/submit`, {}), 200);
    detail = await invoiceDetail(created.inv_id, people.approver);
    assert.equal(detail.approval.canApprove, true);
    const approved = expectStatus(await as(people.approver, "POST", `/V1/invoices/${created.inv_id}/approve`, {}), 200);
    assert.equal(approved.is_final, true);
    assert.match(approved.inv_number, /^IV-/);
    assert.equal(approved.inv_due_date, daysFromToday(15));

    detail = await invoiceDetail(created.inv_id);
    assert.equal(detail.invoice.inv_status, "issued");
    assert.equal(detail.invoice.inv_issued_by_name, "inv.approver ทดสอบ");
    const history = detail.approval_history.map((row) => [row.inva_round, row.inva_action]);
    assert.deepEqual(history, [
        [1, "return"],
        [2, "approve"],
    ]);
});

test("ยกเลิก: ร่างใช้ลบ · อยู่ในใบวางบิลยกเลิกไม่ได้ · ออกใหม่แทนได้ร่างใหม่ที่อ้างกลับใบเดิม", async () => {
    const quotationId = await acceptedQuotation(THREE_MILESTONES);
    const { milestones } = await billable(quotationId);
    const created = expectStatus(await createFromMilestones(quotationId, [milestones[1].qtm_id]), 201);

    const cancelDraft = await api.callApi("POST", `/V1/invoices/${created.inv_id}/cancel`, { body: { reason: "ผิด" } });
    assert.equal(cancelDraft.status, 409);

    expectStatus(await as(people.sales, "POST", `/V1/invoices/${created.inv_id}/issue`, {}), 200);
    const noPermission = await as(people.sales, "POST", `/V1/invoices/${created.inv_id}/cancel`, { reason: "ผิด" });
    assert.equal(noPermission.status, 403, "ไม่มีสิทธิ์ยกเลิกใบแจ้งหนี้");

    // อยู่ในใบวางบิลที่ยังไม่ยกเลิก
    await api.pool.query(
        `INSERT INTO tb_billing_notes (bn_id, bn_number, bn_status, bn_client_id, bn_branch_id) VALUES ('BLN209901010000001', 'BN-20991231-000001', 'issued', ?, ?)`,
        [clientId, HEAD_OFFICE_ID],
    );
    await api.pool.query(
        "INSERT INTO tb_billing_note_invoices (bni_billing_note_id, bni_invoice_id, bni_amount) VALUES ('BLN209901010000001', ?, 1)",
        [created.inv_id],
    );
    let detail = await invoiceDetail(created.inv_id);
    assert.equal(detail.billing_note.bn_number, "BN-20991231-000001");
    const inBillingNote = await api.callApi("POST", `/V1/invoices/${created.inv_id}/cancel`, { body: { reason: "ผิด" } });
    assert.equal(inBillingNote.status, 409);
    assert.equal(inBillingNote.body.code, "INVOICE_IN_BILLING_NOTE");
    await api.pool.query("UPDATE tb_billing_notes SET bn_status = 'cancelled' WHERE bn_id = 'BLN209901010000001'");

    const reissued = expectStatus(
        await api.callApi("POST", `/V1/invoices/${created.inv_id}/reissue`, { body: { reason: "ลูกค้าขอเปลี่ยนชื่อเรื่อง" } }),
        201,
    );
    detail = await invoiceDetail(created.inv_id);
    assert.equal(detail.invoice.inv_status, "cancelled");
    assert.equal(detail.invoice.inv_cancel_reason, "ลูกค้าขอเปลี่ยนชื่อเรื่อง");
    assert.equal(detail.payment.qr_payload, null, "ใบที่ยกเลิกไม่มี QR · กันลูกค้าโอนเข้าใบที่ไม่ใช้แล้ว");
    assert.equal(detail.reissued_to.inv_id, reissued.inv_id);

    const replacement = await invoiceDetail(reissued.inv_id);
    assert.equal(replacement.invoice.inv_status, "draft");
    assert.equal(replacement.invoice.inv_reissued_from_id, created.inv_id);
    assert.equal(replacement.invoice.inv_total, "51360.00", "งวดเดิม ยอดเดิม");
    const after = await billable(quotationId);
    assert.equal(after.milestones[1].billed_invoice.inv_id, reissued.inv_id, "งวดย้ายไปอยู่กับร่างใหม่");
});

test("สกุลต่างประเทศ: ยอดในสกุลของใบตามใบเสนอราคา · ยอดบาทคิดด้วยอัตรา ณ วันออก (ดึง ธปท. ไม่ได้ = ใช้อัตราของร่างพร้อมเหตุผล) · ไม่มี QR", async () => {
    const quotationId = await acceptedQuotation({
        qt_currency: "USD",
        qt_exchange_rate: "35.5",
        qt_rate_source: "manual",
        qt_rate_override_reason: "ตกลงอัตราคงที่กับลูกค้า",
        items: [{ qti_type: "item", qti_description: "Mobile app", qti_quantity: "1", qti_unit_price: "1000" }],
    });
    const { milestones } = await billable(quotationId);
    const created = expectStatus(await createFromMilestones(quotationId, [milestones[0].qtm_id]), 201);
    expectStatus(await as(people.sales, "POST", `/V1/invoices/${created.inv_id}/issue`, {}), 200);

    const detail = await invoiceDetail(created.inv_id);
    assert.equal(detail.invoice.inv_currency, "USD");
    assert.equal(detail.invoice.inv_total, "1070.00");
    assert.equal(detail.invoice.inv_rate_source, "manual", "เทสต์ไม่มีคีย์ ธปท. → ใช้อัตราของร่าง");
    assert.equal(detail.invoice.inv_rate_override_reason, "ตกลงอัตราคงที่กับลูกค้า");
    assert.equal(detail.invoice.inv_total_thb, "37985.00", "1,070 × 35.5");
    assert.equal(detail.payment.qr_payload, null, "QR พร้อมเพย์ใช้กับเงินบาทเท่านั้น");
});

test("เกินกำหนด: คำนวณตอนอ่านจากวันครบกำหนด · แท็บค้างชำระ/เกินกำหนด", async () => {
    const quotationId = await acceptedQuotation();
    const { milestones } = await billable(quotationId);
    const created = expectStatus(await createFromMilestones(quotationId, [milestones[0].qtm_id]), 201);
    expectStatus(await as(people.sales, "POST", `/V1/invoices/${created.inv_id}/issue`, {}), 200);
    await api.pool.query("UPDATE tb_invoices SET inv_due_date = ? WHERE inv_id = ?", [daysFromToday(-5), created.inv_id]);

    const detail = await invoiceDetail(created.inv_id);
    assert.equal(detail.invoice.is_overdue, true);
    assert.equal(detail.invoice.days_overdue, 5);

    const overdue = expectStatus(await as(people.viewer, "GET", "/V1/invoices?tab=overdue&limit=200"), 200);
    const row = overdue.data.find((invoice) => invoice.inv_id === created.inv_id);
    assert.ok(row, "อยู่ในแท็บเกินกำหนด");
    assert.equal(row.days_overdue, 5);
    const drafts = expectStatus(await as(people.viewer, "GET", "/V1/invoices?tab=draft&limit=200"), 200);
    assert.ok(!drafts.data.some((invoice) => invoice.inv_id === created.inv_id));

    const byQuotation = expectStatus(await as(people.viewer, "GET", `/V1/invoices?quotation_id=${quotationId}`), 200);
    assert.equal(byQuotation.total, 1);
});

test("ทุกการกระทำเข้า audit log ด้วยชื่อการกระทำภาษาไทย", async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    const [rows] = await api.pool.query("SELECT DISTINCT aud_action FROM tb_audit_logs WHERE aud_path LIKE '/invoices%' AND aud_success = 1");
    const actions = new Set(rows.map((row) => row.aud_action));
    for (const expected of [
        "สร้างร่างใบแจ้งหนี้",
        "แก้ร่างใบแจ้งหนี้",
        "ลบร่างใบแจ้งหนี้",
        "ออกใบแจ้งหนี้",
        "ส่งใบแจ้งหนี้ขออนุมัติ",
        "อนุมัติใบแจ้งหนี้",
        "ตีกลับใบแจ้งหนี้",
        "ยกเลิกแล้วออกใบแจ้งหนี้ใหม่แทน",
    ]) {
        assert.ok(actions.has(expected), `ไม่พบ "${expected}" (มี: ${[...actions].join(", ")})`);
    }
});
