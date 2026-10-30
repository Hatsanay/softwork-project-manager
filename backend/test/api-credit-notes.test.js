// ใบลดหนี้ (ขั้น N-1) — ลดบางส่วน/ทั้งใบ · อนุมัติ · คืนเงิน · ยอดค้าง/QR/ใบเสร็จ/รายงานหลังลดหนี้ · ลดพร้อมกัน
// ยิงผ่านเซิร์ฟเวอร์จริงบนฐานข้อมูลชั่วคราว · แบบระบบ: docs/plans/2026-10-18-adjustments-po.md หัวข้อ 4.1, 5, 7 (R-N1 ถึง R-N8)
const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { startTestServer } = require("./support/test-server");
const { PERMISSION_KEYS } = require("../src/shared/permissions.mjs");
const { todayBangkok } = require("../src/utils/bangkok-time");

const HEAD_OFFICE_ID = "BRA202601010000001";
const BANK_ACCOUNT_ID = "BAN209901010000002";
const PASSWORD = "Staff@2026";

let api;
let clientId;
const people = {};

let userCounter = 300;
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

/** ใบแจ้งหนี้ที่ออกแล้ว ราคา price + VAT 7% · ลูกค้าหัก ณ ที่จ่าย 3% (ผู้ดูแลทำทุกขั้น) */
async function issuedInvoice(price) {
    const quotation = expectStatus(
        await api.callApi("POST", "/V1/quotations", {
            body: {
                qt_client_id: clientId,
                qt_branch_id: HEAD_OFFICE_ID,
                qt_title: `งาน ${price}`,
                qt_currency: "THB",
                qt_valid_days: 30,
                items: [{ qti_type: "item", qti_description: "บริการ", qti_quantity: "1", qti_unit_price: price }],
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
    expectStatus(await api.callApi("POST", `/V1/invoices/${invoice.inv_id}/issue`, { body: {} }), 200);
    return invoice.inv_id;
}

function creditBody(invoiceId, amounts) {
    return {
        cn_invoice_id: invoiceId,
        cn_reason_code: "price_reduction",
        cn_reason: "ตกลงลดราคาหลังส่งมอบ",
        lines: amounts.map((amount, index) => ({ cnl_description: `ส่วนลด ${index + 1}`, cnl_amount: amount })),
    };
}

/** ร่าง → ส่งขออนุมัติ (ฝ่ายขาย) → อนุมัติ (ผู้อนุมัติ) */
async function issuedCreditNote(invoiceId, amounts) {
    const created = expectStatus(
        await as(people.sales, "POST", "/V1/credit-notes", creditBody(invoiceId, amounts)),
        201,
    );
    expectStatus(await as(people.sales, "POST", `/V1/credit-notes/${created.cn_id}/submit`, {}), 200);
    expectStatus(await as(people.approver, "POST", `/V1/credit-notes/${created.cn_id}/approve`, {}), 200);
    return created.cn_id;
}

async function invoiceDetail(invoiceId) {
    return expectStatus(await api.callApi("GET", `/V1/invoices/${invoiceId}`), 200);
}

function receiptBody(invoiceId, amount, overrides = {}) {
    return {
        rc_client_id: clientId,
        rc_branch_id: HEAD_OFFICE_ID,
        rc_receipt_date: todayBangkok(),
        rc_method: "transfer",
        rc_bank_account_id: BANK_ACCOUNT_ID,
        rc_reference: "FT2026101800001",
        allocations: [{ rca_invoice_id: invoiceId, rca_amount: amount }],
        rc_wht_amount: "0",
        rc_fee_amount: "0",
        ...overrides,
    };
}

// ยอดรวมใบลดหนี้ในใบแจ้งหนี้ = ผลรวมใบลดหนี้ที่ออกแล้ว · คืนเงินแล้ว = ผลรวมที่บันทึกคืน (แบบ R-C2)
async function assertCreditedAmountsConsistent() {
    const [rows] = await api.pool.query(
        `SELECT i.inv_number, i.inv_credited_amount, i.inv_refunded_amount,
                COALESCE((SELECT SUM(cn_total) FROM tb_credit_notes WHERE cn_invoice_id = i.inv_id AND cn_status = 'issued'), 0) AS credited,
                COALESCE((SELECT SUM(cn_refund_required) FROM tb_credit_notes
                          WHERE cn_invoice_id = i.inv_id AND cn_status = 'issued' AND cn_refunded_at IS NOT NULL), 0) AS refunded
         FROM tb_invoices i`,
    );
    for (const row of rows) {
        assert.equal(Number(row.inv_credited_amount), Number(row.credited), `ยอดลดหนี้ของ ${row.inv_number} ไม่ตรง`);
        assert.equal(Number(row.inv_refunded_amount), Number(row.refunded), `ยอดคืนเงินของ ${row.inv_number} ไม่ตรง`);
    }
}

test.before(async () => {
    api = await startTestServer("credit_notes");
    await api.loginAsAdmin();

    people.sales = await createPerson("cn.sales", ["dashboard", "viewInvoices", "createInvoice"]);
    people.approver = await createPerson("cn.approver", ["dashboard", "viewInvoices", "approveInvoice"]);
    people.refunder = await createPerson("cn.refunder", ["dashboard", "viewInvoices", "refundCustomer"]);
    people.cashier = await createPerson("cn.cashier", ["dashboard", "viewInvoices", "viewReceipts", "createReceipt"]);

    const client = expectStatus(
        await api.callApi("POST", "/V1/clients", {
            body: { client_name: "บริษัท ลดหนี้ จำกัด", client_wht_rate: "3" },
        }),
        201,
    );
    clientId = client.client_id;
    await api.pool.query(
        "UPDATE tb_company_settings SET cs_vat_registered_from = '2000-01-01', cs_allow_self_approval = 1, cs_promptpay_id = '0812345678'",
    );
    await api.pool.query(
        `INSERT INTO tb_bank_accounts (ba_id, ba_bank_name, ba_account_name, ba_account_no, ba_currency, ba_is_default)
         VALUES (?, 'กสิกรไทย', 'บริษัท ทดสอบ จำกัด', '123-4-56789-0', 'THB', 1)`,
        [BANK_ACCOUNT_ID],
    );
});

test.after(async () => {
    await api?.stop();
});

test("ยังไม่ตั้งกติกาอนุมัติใบลดหนี้ = ส่งขออนุมัติไม่ได้ พร้อมบอกที่ตั้ง · ตั้งแล้วส่งได้", async () => {
    const invoiceId = await issuedInvoice("1000");
    const created = expectStatus(
        await as(people.sales, "POST", "/V1/credit-notes", creditBody(invoiceId, ["100"])),
        201,
    );
    const missing = await as(people.sales, "POST", `/V1/credit-notes/${created.cn_id}/submit`, {});
    assert.equal(missing.status, 409);
    assert.equal(missing.body.code, "APPROVAL_RULES_MISSING");

    expectStatus(
        await api.callApi("PUT", "/V1/company/approval-levels", {
            body: {
                doc_type: "CN",
                levels: [{ al_min_amount_thb: "0", al_require_distinct: false, role_ids: [people.approver.roleId] }],
            },
        }),
        200,
    );
    expectStatus(await as(people.sales, "POST", `/V1/credit-notes/${created.cn_id}/submit`, {}), 200);
    // ฝ่ายขายไม่มีสิทธิ์อนุมัติ · ผู้อนุมัติตีกลับได้ → ร่างลบได้
    assert.equal((await as(people.sales, "POST", `/V1/credit-notes/${created.cn_id}/approve`, {})).status, 403);
    expectStatus(
        await as(people.approver, "POST", `/V1/credit-notes/${created.cn_id}/return`, {
            reason: "ยอดยังไม่ตรงที่ตกลง",
        }),
        200,
    );
    assert.equal((await as(people.sales, "DELETE", `/V1/credit-notes/${created.cn_id}`, {})).status, 204);
});

test("ลดบางส่วนก่อนรับเงิน: ยอดค้าง/QR หลังลดหนี้ · ยกเลิกใบเดิมไม่ได้ · รับเงินเต็มยอดหลังลดหนี้ = ชำระครบ", async () => {
    const invoiceId = await issuedInvoice("10000"); // 10,700 · หักประมาณ 300
    const tooMuch = await as(people.sales, "POST", "/V1/credit-notes", creditBody(invoiceId, ["10000.01"]));
    assert.equal(tooMuch.status, 400);
    assert.ok(tooMuch.body.fields.lines);

    const creditNoteId = await issuedCreditNote(invoiceId, ["1500", "500"]); // ลด 2,000 + VAT 140 = 2,140 · หัก 60
    const creditNote = expectStatus(await as(people.sales, "GET", `/V1/credit-notes/${creditNoteId}`), 200);
    assert.match(creditNote.credit_note.cn_number, /^CN-\d{8}-\d{6}$/);
    assert.equal(creditNote.credit_note.cn_status, "issued");
    assert.equal(creditNote.credit_note.cn_total, "2140.00");
    assert.equal(creditNote.credit_note.cn_original_total, "10700.00");
    assert.equal(creditNote.credit_note.cn_wht_amount, "60.00");
    assert.equal(creditNote.credit_note.cn_refund_required, "0.00");

    const detail = await invoiceDetail(invoiceId);
    assert.equal(detail.invoice.outstanding_amount, "8560.00");
    assert.equal(detail.invoice.payment_state, "unpaid");
    assert.equal(detail.payment.effective_total, "8560.00");
    assert.equal(detail.payment.credited, "2140.00");
    // QR = 8,560 − หักหลังลดหนี้ (300 − 60) = 8,320
    assert.equal(detail.payment.qr_amount, "8320.00");
    assert.equal(detail.credit_notes.length, 1);

    const cancelInvoice = await api.callApi("POST", `/V1/invoices/${invoiceId}/cancel`, { body: { reason: "ทดสอบ" } });
    assert.equal(cancelInvoice.status, 409);
    assert.equal(cancelInvoice.body.code, "INVOICE_HAS_CREDIT_NOTE");

    const overpay = await as(people.cashier, "POST", "/V1/receipts", receiptBody(invoiceId, "8560.01"));
    assert.equal(overpay.status, 400);
    expectStatus(await as(people.cashier, "POST", "/V1/receipts", receiptBody(invoiceId, "8560")), 201);
    const paid = await invoiceDetail(invoiceId);
    assert.equal(paid.invoice.payment_state, "paid");
    assert.equal(paid.invoice.outstanding_amount, "0.00");
    await assertCreditedAmountsConsistent();
});

test("N1-ก: ลูกค้าจ่ายครบแล้วลดหนี้ = รอคืนเงิน · คืนต้องครบสมการ · ยกเลิกใบลดหนี้ต้องยกเลิกการคืนก่อน", async () => {
    const invoiceId = await issuedInvoice("1000"); // 1,070 · หัก 30
    expectStatus(
        await as(people.cashier, "POST", "/V1/receipts", receiptBody(invoiceId, "1070", { rc_wht_amount: "30" })),
        201,
    );
    const creditNoteId = await issuedCreditNote(invoiceId, ["1000"]); // ลดทั้งใบ
    const issued = expectStatus(await as(people.refunder, "GET", `/V1/credit-notes/${creditNoteId}`), 200);
    assert.equal(issued.credit_note.cn_refund_required, "1070.00");
    assert.equal(issued.credit_note.is_refund_due, true);
    assert.equal(issued.actions.can_refund, true);
    assert.equal((await invoiceDetail(invoiceId)).invoice.payment_state, "refund_due");

    const refund = {
        cn_refund_date: todayBangkok(),
        cn_refund_bank_account_id: BANK_ACCOUNT_ID,
        cn_refund_amount: "1040",
        cn_refund_wht: "30",
        cn_refund_reference: "FT-REFUND-1",
    };
    assert.equal((await as(people.sales, "POST", `/V1/credit-notes/${creditNoteId}/refund`, refund)).status, 403);
    const wrongSum = await as(people.refunder, "POST", `/V1/credit-notes/${creditNoteId}/refund`, {
        ...refund,
        cn_refund_amount: "1070",
    });
    assert.equal(wrongSum.status, 400);
    assert.ok(wrongSum.body.fields.cn_refund_amount);
    expectStatus(await as(people.refunder, "POST", `/V1/credit-notes/${creditNoteId}/refund`, refund), 200);

    const settled = await invoiceDetail(invoiceId);
    assert.equal(settled.invoice.payment_state, "credited");
    assert.equal(settled.payment.qr_payload, null);
    await assertCreditedAmountsConsistent();

    const blocked = await api.callApi("POST", `/V1/credit-notes/${creditNoteId}/cancel`, { body: { reason: "ทดสอบ" } });
    assert.equal(blocked.status, 409);
    assert.equal(blocked.body.code, "CREDIT_NOTE_REFUNDED");
    expectStatus(await as(people.refunder, "POST", `/V1/credit-notes/${creditNoteId}/refund/cancel`, {}), 200);
    expectStatus(
        await api.callApi("POST", `/V1/credit-notes/${creditNoteId}/cancel`, { body: { reason: "ลูกค้าไม่ขอลดแล้ว" } }),
        200,
    );
    assert.equal((await invoiceDetail(invoiceId)).invoice.payment_state, "paid");
    await assertCreditedAmountsConsistent();
});

test("R-N5: ใบที่อยู่ในใบวางบิลที่ยังไม่ยกเลิกลดหนี้ไม่ได้", async () => {
    const invoiceId = await issuedInvoice("2000");
    expectStatus(
        await as(people.sales, "POST", "/V1/billing-notes", {
            bn_client_id: clientId,
            bn_branch_id: HEAD_OFFICE_ID,
            bn_language: "th",
            invoice_ids: [invoiceId],
        }),
        201,
    );
    const blocked = await as(people.sales, "POST", "/V1/credit-notes", creditBody(invoiceId, ["100"]));
    assert.equal(blocked.status, 409);
    assert.equal(blocked.body.code, "INVOICE_NOT_CREDITABLE");
    assert.match(blocked.body.message, /ใบวางบิล/);
    const detail = await invoiceDetail(invoiceId);
    assert.equal(detail.actions.can_credit, false);
});

test("R-N1: อนุมัติใบลดหนี้สองใบของใบเดียวพร้อมกันจนเกินยอด · ผ่านใบเดียว อีกใบได้ 409", async () => {
    const invoiceId = await issuedInvoice("1000");
    const ids = [];
    for (let index = 0; index < 2; index += 1) {
        const created = expectStatus(
            await as(people.sales, "POST", "/V1/credit-notes", creditBody(invoiceId, ["600"])),
            201,
        );
        expectStatus(await as(people.sales, "POST", `/V1/credit-notes/${created.cn_id}/submit`, {}), 200);
        ids.push(created.cn_id);
    }
    const results = await Promise.all(
        ids.map((id) => as(people.approver, "POST", `/V1/credit-notes/${id}/approve`, {})),
    );
    const statuses = results.map((result) => result.status).sort();
    assert.deepEqual(statuses, [200, 409], JSON.stringify(results.map((result) => result.body)));
    const [[invoice]] = await api.pool.query("SELECT inv_credited_base FROM tb_invoices WHERE inv_id = ?", [invoiceId]);
    assert.equal(invoice.inv_credited_base, "600.00");
    await assertCreditedAmountsConsistent();
});

test("R-N3: ใบเสร็จที่ออกก่อนลดหนี้ ยอดคงค้างหลังรับชำระไม่เปลี่ยน · ลูกหนี้/รายงานขายนับใบลดหนี้", async () => {
    const invoiceId = await issuedInvoice("5000"); // 5,350
    const receipt = expectStatus(await as(people.cashier, "POST", "/V1/receipts", receiptBody(invoiceId, "2000")), 201);
    const before = expectStatus(await as(people.cashier, "GET", `/V1/receipts/${receipt.rc_id}`), 200);
    assert.equal(before.allocations[0].outstanding_after_receipt, "3350.00");

    await issuedCreditNote(invoiceId, ["1000"]); // ลด 1,070
    const after = expectStatus(await as(people.cashier, "GET", `/V1/receipts/${receipt.rc_id}`), 200);
    assert.equal(after.allocations[0].outstanding_after_receipt, "3350.00");

    const receivable = expectStatus(
        await as(people.cashier, "GET", `/V1/receipts/receivable-invoices?client_id=${clientId}`),
        200,
    );
    const row = receivable.data.find((item) => item.inv_id === invoiceId);
    assert.equal(row.outstanding_amount, "2280.00");
    assert.equal(row.effective_total, "4280.00");
    assert.equal(row.effective_wht_amount, "120.00");

    const aging = expectStatus(await api.callApi("GET", "/V1/receivables/aging"), 200);
    const agingClient = aging.clients.find((item) => item.client_id === clientId);
    assert.ok(agingClient, JSON.stringify(aging));

    const today = todayBangkok();
    const report = expectStatus(await api.callApi("GET", `/V1/reports/sales?from=${today}&to=${today}`), 200);
    assert.ok(Number(report.credited.amount_thb) >= 1000);
    assert.equal(
        Number(report.net_sales.amount_thb),
        Math.round((Number(report.billed.amount_thb) - Number(report.credited.amount_thb)) * 100) / 100,
    );
});
