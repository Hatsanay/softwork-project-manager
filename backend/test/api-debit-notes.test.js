// ใบเพิ่มหนี้ (ขั้น N-2) — ร่างจากใบแจ้งหนี้ที่ออกแล้ว · หัวเอกสารคัดลอกจากใบเดิม · อนุมัติตามกติกา IV · เลข DN
// มูลค่าเดิม/ที่ถูกต้อง (มาตรา 86/9) · รับเงิน/วางบิลเหมือนใบแจ้งหนี้ · ยกเลิกใบเดิมที่มีใบเพิ่มหนี้ไม่ได้ · ออกใหม่แทน
// ยิงผ่านเซิร์ฟเวอร์จริงบนฐานข้อมูลชั่วคราว · แบบระบบ: docs/plans/2026-10-18-adjustments-po.md หัวข้อ 4.2, 7 (R-N6, R-N13)
const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { startTestServer } = require("./support/test-server");
const { PERMISSION_KEYS } = require("../src/shared/permissions.mjs");
const { todayBangkok } = require("../src/utils/bangkok-time");

const HEAD_OFFICE_ID = "BRA202601010000001";
const BANK_ACCOUNT_ID = "BAN209901010000003";
const PASSWORD = "Staff@2026";

let api;
let clientId;
let otherClientId;
const people = {};

let userCounter = 400;
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

/** ใบแจ้งหนี้ที่ออกแล้ว ราคา price + VAT 7% ของลูกค้า (ผู้ดูแลทำทุกขั้น) */
async function issuedInvoice(price, client = clientId) {
    const quotation = expectStatus(
        await api.callApi("POST", "/V1/quotations", {
            body: {
                qt_client_id: client,
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

function debitBody(referenceId, price, overrides = {}) {
    return {
        inv_reference_invoice_id: referenceId,
        inv_adjust_reason_code: "scope_increase",
        inv_adjust_reason: "ลูกค้าขอหน้ารายงานเพิ่ม",
        inv_title: "งานเพิ่ม หน้ารายงาน",
        inv_credit_days: 15,
        items: [{ invi_type: "item", invi_description: "หน้ารายงานผู้บริหาร", invi_quantity: "1", invi_unit_price: price }],
        ...overrides,
    };
}

/** ร่าง (ฝ่ายขาย) → ส่งขออนุมัติ → อนุมัติ (ผู้อนุมัติ) */
async function issuedDebitNote(referenceId, price) {
    const created = expectStatus(await as(people.sales, "POST", "/V1/invoices", debitBody(referenceId, price)), 201);
    expectStatus(await as(people.sales, "POST", `/V1/invoices/${created.inv_id}/submit`, {}), 200);
    expectStatus(await as(people.approver, "POST", `/V1/invoices/${created.inv_id}/approve`, {}), 200);
    return created.inv_id;
}

async function detail(invoiceId) {
    return expectStatus(await api.callApi("GET", `/V1/invoices/${invoiceId}`), 200);
}

test.before(async () => {
    api = await startTestServer("debit_notes");
    await api.loginAsAdmin();

    people.sales = await createPerson("dn.sales", ["dashboard", "viewInvoices", "createInvoice"]);
    people.approver = await createPerson("dn.approver", ["dashboard", "viewInvoices", "approveInvoice"]);
    people.cashier = await createPerson("dn.cashier", ["dashboard", "viewInvoices", "viewReceipts", "createReceipt"]);

    const client = expectStatus(
        await api.callApi("POST", "/V1/clients", { body: { client_name: "บริษัท เพิ่มหนี้ จำกัด", client_wht_rate: "3" } }),
        201,
    );
    clientId = client.client_id;
    const other = expectStatus(
        await api.callApi("POST", "/V1/clients", { body: { client_name: "บริษัท อื่น จำกัด" } }),
        201,
    );
    otherClientId = other.client_id;
    await api.pool.query(
        "UPDATE tb_company_settings SET cs_vat_registered_from = '2000-01-01', cs_allow_self_approval = 1, cs_promptpay_id = '0812345678'",
    );
    await api.pool.query(
        `INSERT INTO tb_bank_accounts (ba_id, ba_bank_name, ba_account_name, ba_account_no, ba_currency, ba_is_default)
         VALUES (?, 'กสิกรไทย', 'บริษัท ทดสอบ จำกัด', '123-4-56789-0', 'THB', 1)`,
        [BANK_ACCOUNT_ID],
    );
    // ใบเพิ่มหนี้ใช้กติกาอนุมัติของใบแจ้งหนี้สร้างเอง (IV)
    expectStatus(
        await api.callApi("PUT", "/V1/company/approval-levels", {
            body: {
                doc_type: "IV",
                levels: [{ al_min_amount_thb: "0", al_require_distinct: false, role_ids: [people.approver.roleId] }],
            },
        }),
        200,
    );
});

test.after(async () => {
    await api?.stop();
});

test("ร่างใบเพิ่มหนี้: หัวเอกสารคัดลอกจากใบเดิม · อ้างได้เฉพาะใบแจ้งหนี้ที่ออกแล้ว · ต้องมีเหตุผล", async () => {
    const referenceId = await issuedInvoice("10000");
    const reference = await detail(referenceId);
    assert.equal(reference.actions.can_debit, true);

    const missingReason = await as(people.sales, "POST", "/V1/invoices", debitBody(referenceId, "500", { inv_adjust_reason: "" }));
    assert.equal(missingReason.status, 400);
    assert.ok(missingReason.body.fields.inv_adjust_reason);

    // ส่งลูกค้า/สกุลเงินอื่นมา = ไม่สน ใช้ของใบเดิมเสมอ
    const created = expectStatus(
        await as(
            people.sales,
            "POST",
            "/V1/invoices",
            debitBody(referenceId, "500", { inv_client_id: otherClientId, inv_currency: "USD" }),
        ),
        201,
    );
    const draft = await detail(created.inv_id);
    assert.equal(draft.invoice.inv_doc_type, "debit_note");
    assert.equal(draft.invoice.inv_reference_invoice_id, referenceId);
    assert.equal(draft.invoice.reference_number, reference.invoice.inv_number);
    assert.equal(draft.invoice.inv_client_id, clientId);
    assert.equal(draft.invoice.inv_currency, "THB");
    assert.equal(draft.invoice.inv_wht_rate, null);
    assert.equal(draft.invoice.inv_total, "535.00");
    // ร่าง: มูลค่าเดิมคิดจากปัจจุบัน (ยังไม่บันทึก)
    assert.deepEqual(draft.debit_comparison, {
        original_total: "10700.00",
        this_total: "535.00",
        correct_total: "11235.00",
        is_snapshot: false,
    });
    assert.equal(draft.actions.can_submit, true);

    // แก้ร่าง: เปลี่ยนใบที่อ้างไม่ได้ (ใช้ของร่างเสมอ)
    const anotherReference = await issuedInvoice("2000");
    expectStatus(
        await as(people.sales, "PUT", `/V1/invoices/${created.inv_id}`, {
            ...debitBody(anotherReference, "700"),
            inv_version: draft.invoice.inv_version,
        }),
        200,
    );
    const edited = await detail(created.inv_id);
    assert.equal(edited.invoice.inv_reference_invoice_id, referenceId);
    assert.equal(edited.invoice.inv_total, "749.00");

    // อ้างร่างไม่ได้ · อ้างใบเพิ่มหนี้ไม่ได้
    const draftInvoice = expectStatus(
        await api.callApi("POST", "/V1/invoices", {
            body: {
                inv_client_id: clientId,
                inv_branch_id: HEAD_OFFICE_ID,
                inv_title: "ร่าง",
                inv_credit_days: 30,
                items: [{ invi_type: "item", invi_description: "x", invi_quantity: "1", invi_unit_price: "100" }],
            },
        }),
        201,
    );
    const fromDraft = await as(people.sales, "POST", "/V1/invoices", debitBody(draftInvoice.inv_id, "100"));
    assert.equal(fromDraft.status, 409);
    assert.equal(fromDraft.body.code, "DEBIT_REFERENCE_INVALID");
    const fromDebitNote = await as(people.sales, "POST", "/V1/invoices", debitBody(created.inv_id, "100"));
    assert.equal(fromDebitNote.status, 409);
});

test("อนุมัติครบ: เลข DN · บันทึกมูลค่าเดิม · ใบเดิมเห็นใบเพิ่มหนี้และยกเลิกไม่ได้ · ใบเพิ่มหนี้ออกใบเพิ่มหนี้ต่อไม่ได้", async () => {
    const referenceId = await issuedInvoice("10000");
    const debitNoteId = await issuedDebitNote(referenceId, "500");

    const issued = await detail(debitNoteId);
    assert.match(issued.invoice.inv_number, /^DN-\d{8}-\d{6}$/);
    assert.equal(issued.invoice.inv_status, "issued");
    assert.equal(issued.invoice.inv_original_total, "10700.00");
    assert.deepEqual(issued.debit_comparison, {
        original_total: "10700.00",
        this_total: "535.00",
        correct_total: "11235.00",
        is_snapshot: true,
    });
    assert.equal(issued.actions.can_debit, false);
    assert.match(issued.actions.debit_blocked_reason, /ใบแจ้งหนี้เดิม/);

    const reference = await detail(referenceId);
    assert.deepEqual(
        reference.debit_notes.map((note) => [note.inv_number, note.inv_status]),
        [[issued.invoice.inv_number, "issued"]],
    );
    assert.equal(reference.actions.can_cancel, false);
    assert.match(reference.actions.cancel_blocked_reason, /ใบเพิ่มหนี้/);
    const cancel = await api.callApi("POST", `/V1/invoices/${referenceId}/cancel`, {
        body: { reason: "ทดสอบ", inv_version: reference.invoice.inv_version },
    });
    assert.equal(cancel.status, 409);
    assert.equal(cancel.body.code, "INVOICE_HAS_DEBIT_NOTE");

    // ใบเดิมยอดค้างไม่เปลี่ยน (ใบเพิ่มหนี้เป็นลูกหนี้ใบใหม่)
    assert.equal(reference.invoice.outstanding_amount, "10700.00");
    const list = expectStatus(await api.callApi("GET", "/V1/invoices?search=DN-"), 200);
    assert.ok(list.data.some((row) => row.inv_id === debitNoteId && row.inv_doc_type === "debit_note"));
});

test("มูลค่าเดิมของใบเพิ่มหนี้ใบที่สอง = ใบเดิมหลังลดหนี้ + ใบเพิ่มหนี้ที่ออกก่อนหน้า", async () => {
    const referenceId = await issuedInvoice("10000"); // 10,700
    expectStatus(
        await api.callApi("PUT", "/V1/company/approval-levels", {
            body: {
                doc_type: "CN",
                levels: [{ al_min_amount_thb: "0", al_require_distinct: false, role_ids: [people.approver.roleId] }],
            },
        }),
        200,
    );
    const creditNote = expectStatus(
        await as(people.sales, "POST", "/V1/credit-notes", {
            cn_invoice_id: referenceId,
            cn_reason_code: "price_reduction",
            cn_reason: "ลดราคา",
            lines: [{ cnl_description: "ส่วนลด", cnl_amount: "1000" }],
        }),
        201,
    );
    expectStatus(await as(people.sales, "POST", `/V1/credit-notes/${creditNote.cn_id}/submit`, {}), 200);
    expectStatus(await as(people.approver, "POST", `/V1/credit-notes/${creditNote.cn_id}/approve`, {}), 200);

    const first = await issuedDebitNote(referenceId, "500"); // 535
    const second = await issuedDebitNote(referenceId, "200"); // 214
    assert.equal((await detail(first)).invoice.inv_original_total, "9630.00"); // 10,700 − 1,070
    const secondDetail = await detail(second);
    assert.equal(secondDetail.invoice.inv_original_total, "10165.00"); // 9,630 + 535
    assert.equal(secondDetail.debit_comparison.correct_total, "10379.00");
});

test("ใบเพิ่มหนี้รับเงินและวางบิลได้เหมือนใบแจ้งหนี้ · ยกเลิกแล้วออกใหม่แทน = ร่างใบเพิ่มหนี้อ้างใบเดิมเดิม", async () => {
    const referenceId = await issuedInvoice("3000");
    const debitNoteId = await issuedDebitNote(referenceId, "1000"); // 1,070

    const billingNote = expectStatus(
        await as(people.sales, "POST", "/V1/billing-notes", {
            bn_client_id: clientId,
            bn_branch_id: HEAD_OFFICE_ID,
            bn_language: "th",
            bn_payment_date: todayBangkok(),
            invoice_ids: [referenceId, debitNoteId],
        }),
        201,
    );
    assert.ok(billingNote.bn_id);
    expectStatus(await as(people.sales, "DELETE", `/V1/billing-notes/${billingNote.bn_id}`, {}), 204);

    const receipt = await as(people.cashier, "POST", "/V1/receipts", {
        rc_client_id: clientId,
        rc_branch_id: HEAD_OFFICE_ID,
        rc_receipt_date: todayBangkok(),
        rc_method: "transfer",
        rc_bank_account_id: BANK_ACCOUNT_ID,
        rc_reference: "FT2026101800009",
        allocations: [{ rca_invoice_id: debitNoteId, rca_amount: "1070" }],
        rc_wht_amount: "0",
        rc_fee_amount: "0",
    });
    expectStatus(receipt, 201);
    assert.equal((await detail(debitNoteId)).invoice.payment_state, "paid");

    // ใบเพิ่มหนี้อีกใบ (ยังไม่รับเงิน) ยกเลิกแล้วออกใหม่แทน
    const another = await issuedDebitNote(referenceId, "100");
    const anotherDetail = await detail(another);
    const reissued = expectStatus(
        await api.callApi("POST", `/V1/invoices/${another}/reissue`, {
            body: { reason: "กรอกรายการผิด", inv_version: anotherDetail.invoice.inv_version },
        }),
        201,
    );
    const draft = await detail(reissued.inv_id);
    assert.equal(draft.invoice.inv_doc_type, "debit_note");
    assert.equal(draft.invoice.inv_reference_invoice_id, referenceId);
    assert.equal(draft.invoice.inv_adjust_reason, "ลูกค้าขอหน้ารายงานเพิ่ม");
    assert.equal(draft.invoice.inv_status, "draft");
});
