// ใบเสร็จรับเงิน + ลูกหนี้คงค้าง (ขั้น 1C-2) — รับเต็ม/บางส่วน/หลายใบ · หัก ณ ที่จ่าย · ยกเลิก · 50 ทวิ · สกุลต่างประเทศ · แยกอายุ
// ยิงผ่านเซิร์ฟเวอร์จริงบนฐานข้อมูลชั่วคราว · แบบระบบ: docs/plans/2026-10-15-receipts-1c.md (R-C1 ถึง R-C14)
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const { startTestServer } = require("./support/test-server");
const { PERMISSION_KEYS } = require("../src/shared/permissions.mjs");
const { todayBangkok } = require("../src/utils/bangkok-time");

const HEAD_OFFICE_ID = "BRA202601010000001";
const BANK_ACCOUNT_ID = "BAN209901010000001";
const PASSWORD = "Staff@2026";
const PDF_BYTES = Buffer.from("%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n");

let api;
const clients = {};
const people = {};

function daysFromToday(dayCount) {
    const [year, month, day] = todayBangkok().split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day + dayCount)).toISOString().slice(0, 10);
}

let userCounter = 80;
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
 * ใบแจ้งหนี้ที่ออกแล้วจากใบเสนอราคาเก็บครั้งเดียว (ผู้ดูแลทำทุกขั้น) — ลูกค้าตั้งหัก ณ ที่จ่าย 3% ไว้
 * @returns {Promise<string>} inv_id
 */
async function issuedInvoice({ clientId = clients.main, price, currency = "THB", issue = true }) {
    const foreign =
        currency === "THB"
            ? {}
            : { qt_exchange_rate: "35.5", qt_rate_source: "manual", qt_rate_override_reason: "อัตราคงที่ตามสัญญา" };
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

function receiptBody(allocations, overrides = {}) {
    return {
        rc_client_id: clients.main,
        rc_branch_id: HEAD_OFFICE_ID,
        rc_receipt_date: todayBangkok(),
        rc_method: "transfer",
        rc_bank_account_id: BANK_ACCOUNT_ID,
        rc_reference: "FT2026101500001",
        allocations: allocations.map(([invoiceId, amount]) => ({ rca_invoice_id: invoiceId, rca_amount: amount })),
        rc_wht_amount: "0",
        rc_fee_amount: "0",
        ...overrides,
    };
}

async function invoiceRow(invoiceId) {
    const [[row]] = await api.pool.query(
        "SELECT inv_paid_amount, inv_status, inv_version FROM tb_invoices WHERE inv_id = ?",
        [invoiceId],
    );
    return row;
}

async function receiptDetail(receiptId, person = people.viewer) {
    return expectStatus(await as(person, "GET", `/V1/receipts/${receiptId}`), 200);
}

// R-C2: ยอดรับแล้วของทุกใบ = ผลรวมยอดตัดของใบเสร็จที่ไม่ยกเลิก
async function assertPaidAmountsConsistent() {
    const [rows] = await api.pool.query(
        `SELECT i.inv_number, i.inv_paid_amount,
                COALESCE((SELECT SUM(a.rca_amount) FROM tb_receipt_allocations a JOIN tb_receipts r ON r.rc_id = a.rca_receipt_id
                          WHERE a.rca_invoice_id = i.inv_id AND r.rc_status = 'issued'), 0.00) AS allocated
         FROM tb_invoices i`,
    );
    for (const row of rows) {
        assert.equal(
            Number(row.inv_paid_amount),
            Number(row.allocated),
            `ยอดรับแล้วของ ${row.inv_number} ไม่ตรงกับใบเสร็จ`,
        );
    }
}

function uploadForm(buffer, fileName, type) {
    const form = new FormData();
    form.append("file", new Blob([buffer], { type }), fileName);
    return form;
}

test.before(async () => {
    api = await startTestServer("receipts");
    await api.loginAsAdmin();

    people.cashier = await createPerson("rc.cashier", ["dashboard", "viewInvoices", "viewReceipts", "createReceipt"]);
    people.canceller = await createPerson("rc.canceller", ["dashboard", "viewReceipts", "cancelReceipt"]);
    people.viewer = await createPerson("rc.viewer", ["dashboard", "viewReceipts"]);
    people.sales = await createPerson("rc.sales", ["dashboard", "viewInvoices", "createInvoice"]);

    for (const [key, name] of [
        ["main", "บริษัท รับเงิน จำกัด"],
        ["other", "บริษัท อื่น จำกัด"],
    ]) {
        const client = expectStatus(
            await api.callApi("POST", "/V1/clients", { body: { client_name: name, client_wht_rate: "3" } }),
            201,
        );
        clients[key] = client.client_id;
    }
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

test("รับบางส่วน + รับเต็มหลายใบในใบเดียว: เงินเข้า = ตัดหนี้ − หัก − ค่าธรรมเนียม · ยอดรับแล้ว/สถานะชำระของใบแจ้งหนี้", async () => {
    const first = await issuedInvoice({ price: "10000" }); // 10,700 · หักประมาณ 300
    const second = await issuedInvoice({ price: "2000" }); // 2,140 · หักประมาณ 60

    const receivable = expectStatus(
        await as(people.cashier, "GET", `/V1/receipts/receivable-invoices?client_id=${clients.main}`),
        200,
    );
    const firstRow = receivable.data.find((row) => row.inv_id === first);
    assert.equal(firstRow.outstanding_amount, "10700.00");
    assert.equal(firstRow.inv_wht_amount, "300.00");
    assert.equal(receivable.earliest_receipt_date, daysFromToday(-30));

    const created = expectStatus(
        await as(
            people.cashier,
            "POST",
            "/V1/receipts",
            receiptBody(
                [
                    [first, "5350"],
                    [second, "2140"],
                ],
                { rc_wht_amount: "210", rc_fee_amount: "10", rc_wht_certificate_no: "WHT-001" },
            ),
        ),
        201,
    );
    assert.match(created.rc_number, new RegExp(`^RE-${todayBangkok().replace(/-/g, "")}-\\d{6}$`));
    assert.equal(created.rc_received_amount, "7270.00", "7,490 − 210 − 10");

    const detail = await receiptDetail(created.rc_id);
    assert.equal(detail.receipt.rc_status, "issued");
    assert.equal(detail.receipt.rc_allocated_total, "7490.00");
    assert.equal(detail.receipt.rc_received_thb, "7270.00");
    assert.equal(detail.receipt.rc_fx_diff_thb, "0.00");
    assert.equal(detail.receipt.rc_bank_snapshot.ba_account_no, "123-4-56789-0");
    assert.equal(detail.receipt.rc_wht_file_path, undefined, "ไม่ส่ง path ของไฟล์ออกไป");
    assert.deepEqual(
        detail.allocations.map((row) => [row.inv_id, row.rca_amount, row.rca_vat_amount]),
        [
            [first, "5350.00", "350.00"],
            [second, "2140.00", "140.00"],
        ],
    );
    assert.equal(detail.actions.can_cancel, false, "ผู้ดูไม่มีสิทธิ์ยกเลิก");

    assert.equal((await invoiceRow(first)).inv_paid_amount, "5350.00");
    assert.equal((await invoiceRow(second)).inv_paid_amount, "2140.00");
    const firstInvoice = expectStatus(await as(people.cashier, "GET", `/V1/invoices/${first}`), 200);
    assert.equal(firstInvoice.invoice.payment_state, "partial");
    assert.equal(firstInvoice.invoice.outstanding_amount, "5350.00");
    assert.equal(firstInvoice.actions.can_receive, true);
    // QR ฝังยอดค้างหลังหัก ณ ที่จ่ายตามสัดส่วน: ค้าง 5,350 − (300 × 5,350 ÷ 10,700 = 150) = 5,200 (ไม่ใช่ 10,400 เต็มใบ)
    assert.equal(firstInvoice.payment.net_payable, "10400.00");
    assert.equal(firstInvoice.payment.qr_amount, "5200.00");
    assert.ok(firstInvoice.payment.qr_payload.includes("54075200.00"), "ยอดใน QR (tag 54)");
    assert.deepEqual(
        firstInvoice.receipts.map((row) => [row.rc_number, row.rca_amount]),
        [[created.rc_number, "5350.00"]],
    );
    const secondInvoice = expectStatus(await as(people.cashier, "GET", `/V1/invoices/${second}`), 200);
    assert.equal(secondInvoice.invoice.payment_state, "paid");
    assert.equal(secondInvoice.actions.can_receive, false, "ชำระครบแล้ว");
    assert.equal(secondInvoice.payment.qr_payload, null, "ชำระครบแล้วไม่มี QR · กันลูกค้าโอนซ้ำ");
    const paidTab = expectStatus(await as(people.cashier, "GET", "/V1/invoices?tab=paid&limit=200"), 200);
    assert.ok(paidTab.data.some((row) => row.inv_id === second));
    assert.ok(!paidTab.data.some((row) => row.inv_id === first));

    // รับส่วนที่เหลือ: VAT ครั้งนี้ = ที่เหลือพอดี (350 + 350 = 700)
    const rest = expectStatus(
        await as(
            people.cashier,
            "POST",
            "/V1/receipts",
            receiptBody([[first, "5350"]], { rc_method: "cash", rc_bank_account_id: null }),
        ),
        201,
    );
    const restDetail = await receiptDetail(rest.rc_id);
    assert.equal(restDetail.allocations[0].rca_vat_amount, "350.00");
    assert.equal(restDetail.receipt.rc_bank_account_id, null);
    await assertPaidAmountsConsistent();
});

test("ปฏิเสธ: รับเกินยอดค้าง · ลูกค้าปน · สกุลปน · ใบยังไม่ออก · ไม่มีสิทธิ์ · โอนไม่มีบัญชี · เช็คไม่ครบ · เงินเข้าไม่เหลือ", async () => {
    const invoice = await issuedInvoice({ price: "1000" }); // 1,070
    const otherClient = await issuedInvoice({ clientId: clients.other, price: "1000" });
    const usd = await issuedInvoice({ price: "100", currency: "USD" });
    const draft = await issuedInvoice({ price: "500", issue: false });

    const over = await as(people.cashier, "POST", "/V1/receipts", receiptBody([[invoice, "1070.01"]]));
    assert.equal(over.status, 400);
    assert.match(over.body.fields["allocations.0.rca_amount"], /มากกว่ายอดค้าง/);

    const mixedClient = await as(
        people.cashier,
        "POST",
        "/V1/receipts",
        receiptBody([
            [invoice, "100"],
            [otherClient, "100"],
        ]),
    );
    assert.equal(mixedClient.status, 409);
    assert.equal(mixedClient.body.code, "RECEIPT_INVOICE_UNAVAILABLE");
    const mixedCurrency = await as(
        people.cashier,
        "POST",
        "/V1/receipts",
        receiptBody([
            [invoice, "100"],
            [usd, "10"],
        ]),
    );
    assert.equal(mixedCurrency.status, 409);
    assert.match(mixedCurrency.body.message, /สกุล/);
    const notIssued = await as(people.cashier, "POST", "/V1/receipts", receiptBody([[draft, "100"]]));
    assert.equal(notIssued.status, 409);
    assert.match(notIssued.body.message, /ยังไม่ได้ออก/);

    const sales = await as(people.sales, "POST", "/V1/receipts", receiptBody([[invoice, "100"]]));
    assert.equal(sales.status, 403, "คนขายออกบิลได้แต่รับเงินไม่ได้ (C3)");
    const viewerList = await as(people.viewer, "GET", "/V1/receipts/receivable-invoices");
    assert.equal(viewerList.status, 403);

    const noBank = await as(
        people.cashier,
        "POST",
        "/V1/receipts",
        receiptBody([[invoice, "100"]], { rc_bank_account_id: null }),
    );
    assert.equal(noBank.status, 400);
    assert.ok(noBank.body.fields.rc_bank_account_id);
    const chequeMissing = await as(
        people.cashier,
        "POST",
        "/V1/receipts",
        receiptBody([[invoice, "100"]], { rc_method: "cheque", rc_cheque_no: "12345678" }),
    );
    assert.equal(chequeMissing.status, 400);
    assert.ok(chequeMissing.body.fields.rc_cheque_bank && chequeMissing.body.fields.rc_cheque_date);
    const nothingLeft = await as(
        people.cashier,
        "POST",
        "/V1/receipts",
        receiptBody([[invoice, "100"]], { rc_wht_amount: "100" }),
    );
    assert.equal(nothingLeft.status, 400);
    assert.ok(nothingLeft.body.fields.rc_received_amount);

    // เช็คครบ: บัญชีไม่บังคับ · เช็คลงวันที่ล่วงหน้าได้
    const cheque = await as(
        people.cashier,
        "POST",
        "/V1/receipts",
        receiptBody([[invoice, "1070"]], {
            rc_method: "cheque",
            rc_bank_account_id: null,
            rc_cheque_no: "12345678",
            rc_cheque_bank: "กรุงเทพ",
            rc_cheque_date: daysFromToday(15),
        }),
    );
    assert.equal(cheque.status, 201, JSON.stringify(cheque.body));
    await assertPaidAmountsConsistent();
});

test("วันที่ใบเสร็จ (C2): ไม่ใช่อนาคต · ย้อนได้ไม่เกิน 30 วัน · ไม่ก่อนวันออกใบแจ้งหนี้ · เลขที่ใช้วันที่ใบเสร็จ", async () => {
    const invoice = await issuedInvoice({ price: "3000" });
    const future = await as(
        people.cashier,
        "POST",
        "/V1/receipts",
        receiptBody([[invoice, "100"]], { rc_receipt_date: daysFromToday(1) }),
    );
    assert.equal(future.status, 400);
    assert.match(future.body.fields.rc_receipt_date, /อนาคต/);
    const beforeInvoice = await as(
        people.cashier,
        "POST",
        "/V1/receipts",
        receiptBody([[invoice, "100"]], { rc_receipt_date: daysFromToday(-1) }),
    );
    assert.equal(beforeInvoice.status, 400);
    assert.match(beforeInvoice.body.fields.rc_receipt_date, /ก่อนวันที่ออกใบแจ้งหนี้/);

    await api.pool.query("UPDATE tb_invoices SET inv_issue_date = ? WHERE inv_id = ?", [daysFromToday(-40), invoice]);
    const tooOld = await as(
        people.cashier,
        "POST",
        "/V1/receipts",
        receiptBody([[invoice, "100"]], { rc_receipt_date: daysFromToday(-31) }),
    );
    assert.equal(tooOld.status, 400);
    assert.match(tooOld.body.fields.rc_receipt_date, /30 วัน/);

    const backdated = expectStatus(
        await as(
            people.cashier,
            "POST",
            "/V1/receipts",
            receiptBody([[invoice, "100"]], { rc_receipt_date: daysFromToday(-30) }),
        ),
        201,
    );
    assert.ok(backdated.rc_number.startsWith(`RE-${daysFromToday(-30).replace(/-/g, "")}-`), "เลขที่ตามวันที่ใบเสร็จ");
});

test("R-C1: สี่คำขอรับเงินเต็มใบเดียวกันพร้อมกัน → ได้ใบเสร็จใบเดียว ยอดรับแล้วไม่เกิน", async () => {
    const invoice = await issuedInvoice({ price: "4000" });
    const responses = await Promise.all(
        Array.from({ length: 4 }, () => as(people.cashier, "POST", "/V1/receipts", receiptBody([[invoice, "4280"]]))),
    );
    const statuses = responses.map((response) => response.status).sort();
    assert.deepEqual(statuses, [201, 409, 409, 409], JSON.stringify(responses.map((response) => response.body)));
    assert.equal((await invoiceRow(invoice)).inv_paid_amount, "4280.00");
    await assertPaidAmountsConsistent();
});

test("ยกเลิก: ต้องมีสิทธิ์และเหตุผล · ยอดรับแล้วคืน · ใบแจ้งหนี้ที่มีใบเสร็จยกเลิกไม่ได้จนกว่าจะยกเลิกใบเสร็จ", async () => {
    const invoice = await issuedInvoice({ price: "5000" });
    const created = expectStatus(
        await as(people.cashier, "POST", "/V1/receipts", receiptBody([[invoice, "2000"]])),
        201,
    );

    const invoiceCancel = await api.callApi("POST", `/V1/invoices/${invoice}/cancel`, { body: { reason: "ผิด" } });
    assert.equal(invoiceCancel.status, 409);
    assert.equal(invoiceCancel.body.code, "INVOICE_HAS_PAYMENT");

    const cashierCancel = await as(people.cashier, "POST", `/V1/receipts/${created.rc_id}/cancel`, { reason: "ผิด" });
    assert.equal(cashierCancel.status, 403);
    const noReason = await as(people.canceller, "POST", `/V1/receipts/${created.rc_id}/cancel`, {});
    assert.equal(noReason.status, 400);
    const stale = await as(people.canceller, "POST", `/V1/receipts/${created.rc_id}/cancel`, {
        reason: "ผิด",
        rc_version: 9,
    });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.code, "RECEIPT_CHANGED");
    expectStatus(
        await as(people.canceller, "POST", `/V1/receipts/${created.rc_id}/cancel`, {
            reason: "เช็คเด้ง",
            rc_version: 0,
        }),
        200,
    );
    const again = await as(people.canceller, "POST", `/V1/receipts/${created.rc_id}/cancel`, { reason: "ซ้ำ" });
    assert.equal(again.status, 409);

    const detail = await receiptDetail(created.rc_id);
    assert.equal(detail.receipt.rc_status, "cancelled");
    assert.equal(detail.receipt.rc_cancel_reason, "เช็คเด้ง");
    assert.equal(detail.receipt.rc_number, created.rc_number, "เลขยังอยู่");
    assert.equal((await invoiceRow(invoice)).inv_paid_amount, "0.00");

    const editCancelled = await as(people.cashier, "PUT", `/V1/receipts/${created.rc_id}`, {
        rc_wht_certificate_no: "X",
    });
    assert.equal(editCancelled.status, 409);
    expectStatus(await api.callApi("POST", `/V1/invoices/${invoice}/cancel`, { body: { reason: "ออกผิด" } }), 200);
    await assertPaidAmountsConsistent();
});

test("50 ทวิ: แก้เลขที่หลังออกได้ · แนบ/เปลี่ยน/ลบไฟล์ · ไฟล์ปลอมนามสกุลถูกปฏิเสธ · เปิดได้เฉพาะผู้มีสิทธิ์ · ไฟล์ไม่อยู่ใน /uploads", async () => {
    const invoice = await issuedInvoice({ price: "6000" });
    const created = expectStatus(
        await as(people.cashier, "POST", "/V1/receipts", receiptBody([[invoice, "6420"]], { rc_wht_amount: "180" })),
        201,
    );
    let list = expectStatus(await as(people.viewer, "GET", "/V1/receipts?tab=missing_wht&limit=200"), 200);
    assert.ok(
        list.data.some((row) => row.rc_id === created.rc_id),
        "มีหักแต่ยังไม่แนบ 50 ทวิ",
    );

    expectStatus(
        await as(people.cashier, "PUT", `/V1/receipts/${created.rc_id}`, {
            rc_wht_certificate_no: "เล่ม 1 เลขที่ 25",
            rc_wht_certificate_date: todayBangkok(),
            rc_internal_note: "ลูกค้าส่ง 50 ทวิ ทางอีเมล",
            rc_version: 0,
        }),
        200,
    );

    const fake = await api.callApi("POST", `/V1/receipts/${created.rc_id}/wht-certificate/file`, {
        token: people.cashier.token,
        body: uploadForm(Buffer.from("not really a pdf"), "fake.pdf", "application/pdf"),
    });
    assert.equal(fake.status, 400);
    assert.ok(fake.body.fields.file);
    const viewerUpload = await api.callApi("POST", `/V1/receipts/${created.rc_id}/wht-certificate/file`, {
        token: people.viewer.token,
        body: uploadForm(PDF_BYTES, "50ทวิ.pdf", "application/pdf"),
    });
    assert.equal(viewerUpload.status, 403);

    const uploaded = expectStatus(
        await api.callApi("POST", `/V1/receipts/${created.rc_id}/wht-certificate/file`, {
            token: people.cashier.token,
            body: uploadForm(PDF_BYTES, "50ทวิ ลูกค้า.pdf", "application/pdf"),
        }),
        200,
    );
    assert.equal(uploaded.rc_wht_file_name, "50ทวิ ลูกค้า.pdf", "ชื่อไฟล์ภาษาไทยไม่เพี้ยน");
    const [[stored]] = await api.pool.query("SELECT rc_wht_file_path FROM tb_receipts WHERE rc_id = ?", [
        created.rc_id,
    ]);
    const storedFile = path.join(process.env.DOCUMENT_STORAGE_DIR, stored.rc_wht_file_path);
    assert.ok(fs.existsSync(storedFile));
    assert.ok(!stored.rc_wht_file_path.includes("uploads"), "ไม่อยู่ใต้ /uploads สาธารณะ");

    const opened = await fetch(`${api.baseUrl}/api/V1/receipts/${created.rc_id}/wht-certificate/file`, {
        headers: { Authorization: `Bearer ${people.viewer.token}` },
    });
    assert.equal(opened.status, 200);
    assert.equal(opened.headers.get("content-type"), "application/pdf");
    assert.match(opened.headers.get("cache-control"), /no-store/);
    assert.deepEqual(Buffer.from(await opened.arrayBuffer()), PDF_BYTES);
    const salesOpen = await fetch(`${api.baseUrl}/api/V1/receipts/${created.rc_id}/wht-certificate/file`, {
        headers: { Authorization: `Bearer ${people.sales.token}` },
    });
    assert.equal(salesOpen.status, 403);

    // เปลี่ยนไฟล์ (PNG) → ไฟล์เก่าถูกลบ
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    expectStatus(
        await api.callApi("POST", `/V1/receipts/${created.rc_id}/wht-certificate/file`, {
            token: people.cashier.token,
            body: uploadForm(pngBytes, "scan.png", "image/png"),
        }),
        200,
    );
    assert.ok(!fs.existsSync(storedFile), "ไฟล์เดิมถูกลบหลังเปลี่ยน");
    let detail = await receiptDetail(created.rc_id);
    assert.equal(detail.receipt.has_wht_file, true);
    assert.equal(detail.receipt.rc_wht_file_name, "scan.png");
    assert.equal(detail.receipt.rc_wht_certificate_no, "เล่ม 1 เลขที่ 25");
    list = expectStatus(await as(people.viewer, "GET", "/V1/receipts?tab=missing_wht&limit=200"), 200);
    assert.ok(!list.data.some((row) => row.rc_id === created.rc_id));

    expectStatus(await as(people.cashier, "DELETE", `/V1/receipts/${created.rc_id}/wht-certificate/file`), 204);
    detail = await receiptDetail(created.rc_id);
    assert.equal(detail.receipt.has_wht_file, false);
    const missing = await as(people.viewer, "GET", `/V1/receipts/${created.rc_id}/wht-certificate/file`);
    assert.equal(missing.status, 404);
});

test("สกุลต่างประเทศ: ต้องกรอกยอดบาทจริง · เก็บอัตราจริงและส่วนต่างอัตรา", async () => {
    const usd = await issuedInvoice({ price: "1000", currency: "USD" }); // 1,070 USD × 35.5 = 37,985 บาท
    const missingThb = await as(
        people.cashier,
        "POST",
        "/V1/receipts",
        receiptBody([[usd, "1070"]], { rc_wht_amount: "30", rc_fee_amount: "15" }),
    );
    assert.equal(missingThb.status, 400);
    assert.ok(missingThb.body.fields.rc_received_thb);

    const created = expectStatus(
        await as(
            people.cashier,
            "POST",
            "/V1/receipts",
            receiptBody([[usd, "1070"]], { rc_wht_amount: "30", rc_fee_amount: "15", rc_received_thb: "36000" }),
        ),
        201,
    );
    const detail = await receiptDetail(created.rc_id);
    assert.equal(detail.receipt.rc_currency, "USD");
    assert.equal(detail.receipt.rc_received_amount, "1025.00");
    assert.equal(detail.receipt.rc_actual_rate, "35.1219512195");
    assert.equal(detail.receipt.rc_allocated_thb, "37985.00");
    assert.equal(detail.receipt.rc_fx_diff_thb, "-404.51");
});

test("ใบวางบิล: เติมเฉพาะใบในใบวางบิลที่ยังค้าง · ปุ่มรับเงินในใบวางบิล · อ้างใบวางบิลได้เฉพาะที่ออกแล้ว", async () => {
    const first = await issuedInvoice({ clientId: clients.other, price: "100" });
    const second = await issuedInvoice({ clientId: clients.other, price: "200" });
    const note = expectStatus(
        await api.callApi("POST", "/V1/billing-notes", {
            body: { bn_client_id: clients.other, bn_branch_id: HEAD_OFFICE_ID, invoice_ids: [first, second] },
        }),
        201,
    );
    const draftReference = await as(
        people.cashier,
        "POST",
        "/V1/receipts",
        receiptBody([[first, "107"]], { rc_client_id: clients.other, rc_billing_note_id: note.bn_id }),
    );
    assert.equal(draftReference.status, 400);
    assert.ok(draftReference.body.fields.rc_billing_note_id);
    expectStatus(await api.callApi("POST", `/V1/billing-notes/${note.bn_id}/issue`, { body: {} }), 200);

    const receivable = expectStatus(
        await as(people.cashier, "GET", `/V1/receipts/receivable-invoices?billing_note_id=${note.bn_id}`),
        200,
    );
    assert.deepEqual(receivable.data.map((row) => row.inv_id).sort(), [first, second].sort());
    assert.equal(receivable.billing_note.bn_client_id, clients.other);

    expectStatus(
        await as(
            people.cashier,
            "POST",
            "/V1/receipts",
            receiptBody([[first, "107"]], { rc_client_id: clients.other, rc_billing_note_id: note.bn_id }),
        ),
        201,
    );
    const after = expectStatus(
        await as(people.cashier, "GET", `/V1/receipts/receivable-invoices?billing_note_id=${note.bn_id}`),
        200,
    );
    assert.deepEqual(
        after.data.map((row) => row.inv_id),
        [second],
        "ใบที่รับครบแล้วไม่อยู่ในรายการ",
    );
    const noteDetail = expectStatus(await as(people.cashier, "GET", `/V1/billing-notes/${note.bn_id}`), 200);
    assert.equal(noteDetail.actions.can_receive, true);
});

test("ลูกหนี้คงค้างแยกอายุ: ขอบ 0/30/31/60/61/90/91 วัน · ยอดเป็นบาท · รายใบของลูกค้า", async () => {
    const client = expectStatus(
        await api.callApi("POST", "/V1/clients", { body: { client_name: "ลูกหนี้แยกอายุ" } }),
        201,
    );
    const dueOffsets = [0, -30, -31, -60, -61, -90, -91];
    const invoiceIds = [];
    for (const offset of dueOffsets) {
        const invoiceId = await issuedInvoice({ clientId: client.client_id, price: "100" }); // 107
        await api.pool.query("UPDATE tb_invoices SET inv_due_date = ? WHERE inv_id = ?", [
            daysFromToday(offset),
            invoiceId,
        ]);
        invoiceIds.push(invoiceId);
    }
    const usd = await issuedInvoice({ clientId: client.client_id, price: "10", currency: "USD" }); // 10.70 USD = 379.85 บาท
    await api.pool.query("UPDATE tb_invoices SET inv_due_date = ? WHERE inv_id = ?", [daysFromToday(5), usd]);

    const aging = expectStatus(await as(people.viewer, "GET", "/V1/receivables/aging"), 200);
    const row = aging.clients.find((item) => item.client_id === client.client_id);
    assert.deepEqual(
        [row.current, row.days_1_30, row.days_31_60, row.days_61_90, row.days_over_90, row.total],
        ["486.85", "107.00", "214.00", "214.00", "107.00", "1128.85"],
    );
    assert.equal(row.invoice_count, 8);
    assert.equal(row.oldest_days_overdue, 91);
    assert.deepEqual(
        aging.buckets.map((bucket) => bucket.key),
        ["current", "days_1_30", "days_31_60", "days_61_90", "days_over_90"],
    );

    const perInvoice = expectStatus(await as(people.viewer, "GET", `/V1/receivables/aging/${client.client_id}`), 200);
    assert.equal(perInvoice.client.client_name, "ลูกหนี้แยกอายุ");
    const usdRow = perInvoice.invoices.find((item) => item.inv_id === usd);
    assert.equal(usdRow.outstanding_amount, "10.70");
    assert.equal(usdRow.outstanding_thb, "379.85");
    assert.equal(usdRow.bucket, "current");
    assert.deepEqual(
        invoiceIds.map((id) => perInvoice.invoices.find((item) => item.inv_id === id).bucket),
        ["current", "days_1_30", "days_31_60", "days_31_60", "days_61_90", "days_61_90", "days_over_90"],
    );

    const sales = await as(people.sales, "GET", "/V1/receivables/aging");
    assert.equal(sales.status, 403);
});

test("ทุกการกระทำเข้า audit log ด้วยชื่อการกระทำภาษาไทย (รวมการเปิดไฟล์ 50 ทวิ)", async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    const [rows] = await api.pool.query(
        "SELECT DISTINCT aud_action FROM tb_audit_logs WHERE aud_path LIKE '/receipts%' AND aud_success = 1",
    );
    const actions = new Set(rows.map((row) => row.aud_action));
    for (const expected of [
        "บันทึกรับเงิน (ออกใบเสร็จ)",
        "ยกเลิกใบเสร็จรับเงิน",
        "แก้ข้อมูล 50 ทวิ/บันทึกภายในของใบเสร็จ",
        "แนบไฟล์ 50 ทวิ",
        "ลบไฟล์ 50 ทวิ",
        "เปิดไฟล์ 50 ทวิ",
    ]) {
        assert.ok(actions.has(expected), `ไม่พบ "${expected}" (มี: ${[...actions].join(", ")})`);
    }
});
