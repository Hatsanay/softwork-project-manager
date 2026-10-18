// รายงานขาย (ขั้น 1D-2) — ออกบิล (ก่อน VAT เป็นบาท) · รับเงิน · อัตราปิดการขาย · ลูกค้ายอดสูงสุด · รายเดือน · สิทธิ์ (D3)
// ยิงผ่านเซิร์ฟเวอร์จริงบนฐานข้อมูลชั่วคราว · แบบระบบ: docs/plans/2026-10-15-finance-1d.md หัวข้อ 3.2 และ R-D1/R-D4
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
let pastIssueDate;
const people = {};

function daysFromToday(dayCount) {
    const [year, month, day] = todayBangkok().split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day + dayCount)).toISOString().slice(0, 10);
}

async function createPerson(name, permissionKeys, userNumber) {
    const bits = PERMISSION_KEYS.map((key) => (permissionKeys.includes(key) ? "1" : "0")).join("");
    const role = await api.callApi("POST", "/V1/roles", { body: { role_name: `role-${name}`, role_permission: bits } });
    assert.equal(role.status, 201, JSON.stringify(role.body));
    const userId = `USE20990101000${String(userNumber).padStart(4, "0")}`;
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    await api.pool.query(
        `INSERT INTO tb_users (user_id, user_username, user_email, user_password, user_fname, user_lname, user_role_id, user_must_change_password)
         VALUES (?, ?, ?, ?, ?, 'ทดสอบ', ?, 0)`,
        [userId, name, `${name}@example.com`, passwordHash, name, role.body.role_id],
    );
    return { userId, token: await api.login(name, PASSWORD) };
}

function expectStatus(response, status) {
    assert.equal(response.status, status, JSON.stringify(response.body));
    return response.body;
}

const admin = (method, url, body) => api.callApi(method, url, { body });

async function approvedQuotation(price, currency = "THB") {
    const foreign =
        currency === "THB"
            ? {}
            : { qt_exchange_rate: "35.5", qt_rate_source: "manual", qt_rate_override_reason: "อัตราคงที่" };
    const quotation = expectStatus(
        await admin("POST", "/V1/quotations", {
            qt_client_id: clientId,
            qt_branch_id: HEAD_OFFICE_ID,
            qt_title: `งาน ${price} ${currency}`,
            qt_currency: currency,
            qt_valid_days: 30,
            items: [{ qti_type: "item", qti_description: "บริการ", qti_quantity: "1", qti_unit_price: price }],
            ...foreign,
        }),
        201,
    );
    expectStatus(await admin("POST", `/V1/quotations/${quotation.qt_id}/submit`, {}), 200);
    expectStatus(await admin("POST", `/V1/quotations/${quotation.qt_id}/approve`, {}), 200);
    return quotation.qt_id;
}

async function issuedInvoice(price, currency = "THB") {
    const quotationId = await approvedQuotation(price, currency);
    expectStatus(
        await admin("POST", `/V1/quotations/${quotationId}/accept`, { project_mode: "none", create_tasks: false }),
        200,
    );
    const billable = expectStatus(await admin("GET", `/V1/quotations/${quotationId}/billable-milestones`), 200);
    const invoice = expectStatus(
        await admin("POST", "/V1/invoices", {
            quotation_id: quotationId,
            milestone_ids: [billable.milestones[0].qtm_id],
        }),
        201,
    );
    expectStatus(await admin("POST", `/V1/invoices/${invoice.inv_id}/issue`, {}), 200);
    return invoice.inv_id;
}

function receipt(invoiceId, amount, extra = {}) {
    return admin("POST", "/V1/receipts", {
        rc_client_id: clientId,
        rc_branch_id: HEAD_OFFICE_ID,
        rc_receipt_date: todayBangkok(),
        rc_method: "cash",
        allocations: [{ rca_invoice_id: invoiceId, rca_amount: amount }],
        ...extra,
    });
}

test.before(async () => {
    api = await startTestServer("sales_report");
    await api.loginAsAdmin();
    await api.pool.query(
        "UPDATE tb_company_settings SET cs_vat_registered_from = '2000-01-01', cs_allow_self_approval = 1",
    );
    clientId = expectStatus(await admin("POST", "/V1/clients", { client_name: "บริษัท รายงาน จำกัด" }), 201).client_id;

    // วันนี้: ใบบาท 10,000 (+VAT = 10,700) · ใบ USD 100 (= 3,550 บาทก่อน VAT) · ใบบาท 5,000 ยกเลิก (ไม่นับ)
    const thbInvoice = await issuedInvoice("10000");
    const usdInvoice = await issuedInvoice("100", "USD");
    const cancelled = await issuedInvoice("5000");
    expectStatus(await admin("POST", `/V1/invoices/${cancelled}/cancel`, { reason: "ออกผิด" }), 200);
    // ใบที่ออกเมื่อ ~2 เดือนก่อน — อยู่นอกช่วง "วันนี้" แต่อยู่ในกราฟรายเดือน
    const oldInvoice = await issuedInvoice("10000");
    pastIssueDate = daysFromToday(-62);
    await api.pool.query("UPDATE tb_invoices SET inv_issue_date = ?, inv_due_date = ? WHERE inv_id = ?", [
        pastIssueDate,
        daysFromToday(-32),
        oldInvoice,
    ]);

    // รับเงิน: ใบบาท 5,000 (หัก 150 ค่าธรรมเนียม 10 → เข้า 4,840) · ใบ USD เต็ม 107 USD ได้เงินจริง 3,700 บาท
    expectStatus(await receipt(thbInvoice, "5000", { rc_wht_amount: "150", rc_fee_amount: "10" }), 201);
    expectStatus(await receipt(usdInvoice, "107", { rc_received_thb: "3700" }), 201);

    // ใบเสนอราคาที่จบผลวันนี้: ตอบรับ 4 (ข้างบน) · ปฏิเสธ 1 · หมดอายุ 1
    const declined = await approvedQuotation("1000");
    expectStatus(await admin("POST", `/V1/quotations/${declined}/decline`, { reason: "แพงไป" }), 200);
    const expired = await approvedQuotation("2000");
    await api.pool.query("UPDATE tb_quotations SET qt_status = 'expired', qt_valid_until = ? WHERE qt_id = ?", [
        todayBangkok(),
        expired,
    ]);

    people.reporter = await createPerson("sr.reporter", ["dashboard", "salesReports"], 121);
    people.invoiceViewer = await createPerson("sr.viewer", ["dashboard", "viewInvoices", "viewReceipts"], 122);
});

test.after(async () => {
    await api?.stop();
});

test("สรุปช่วงวันนี้: ออกบิลก่อน VAT เป็นบาท (ไม่นับใบยกเลิก/นอกช่วง) · รับเงินแยกเงินเข้า/หัก/ค่าธรรมเนียม · อัตราปิดการขาย", async () => {
    const today = todayBangkok();
    const summary = expectStatus(
        await api.callApi("GET", `/V1/reports/sales?from=${today}&to=${today}`, { token: people.reporter.token }),
        200,
    );
    assert.deepEqual(summary.billed, { invoice_count: 2, amount_thb: "13550.00", amount_with_vat_thb: "14498.50" });
    assert.deepEqual(summary.received, {
        receipt_count: 2,
        received_thb: "8540.00",
        withholding_thb: "150.00",
        fee_thb: "10.00",
        settled_thb: "8700.00",
    });
    assert.equal(summary.quotations.accepted_count, 4);
    assert.equal(summary.quotations.declined_count, 1);
    assert.equal(summary.quotations.expired_count, 1);
    assert.equal(summary.quotations.win_rate_percent, 66.7);
    assert.equal(summary.top_clients.length, 1);
    assert.equal(summary.top_clients[0].billed_thb, "13550.00");
    // ค้างปัจจุบัน: ใบบาท 10,700 − 5,000 = 5,700 · ใบเก่า 10,700 (เกินกำหนด) · ใบ USD รับครบแล้ว
    assert.equal(summary.top_clients[0].outstanding_thb, "16400.00");
    assert.deepEqual(summary.outstanding_now, { outstanding_thb: "16400.00", overdue_thb: "10700.00" });
});

test("รายเดือน 12 เดือน: เดือนที่ไม่มีข้อมูลเป็น 0 · ใบเก่าอยู่ในเดือนที่ออกจริง", async () => {
    const monthly = expectStatus(
        await api.callApi("GET", "/V1/reports/sales/monthly?months=12", { token: people.reporter.token }),
        200,
    );
    assert.equal(monthly.months.length, 12);
    const currentMonth = todayBangkok().slice(0, 7);
    assert.equal(monthly.months[11].month, currentMonth);
    assert.deepEqual(monthly.months[11], {
        month: currentMonth,
        billed_thb: "13550.00",
        credited_thb: "0.00",
        received_thb: "8700.00",
    });
    const pastMonth = monthly.months.find((row) => row.month === pastIssueDate.slice(0, 7));
    assert.equal(pastMonth.billed_thb, "10000.00");
    assert.ok(monthly.months.filter((row) => row.billed_thb === "0.00").length >= 9);
});

test("ตรวจช่วงวันที่ + สิทธิ์ (D3): วันสลับ/ยาวเกิน 24 เดือนได้ 400 · คนที่ดูใบแจ้งหนี้ได้แต่ไม่มีสิทธิ์รายงานได้ 403", async () => {
    const reversed = await api.callApi("GET", "/V1/reports/sales?from=2026-10-10&to=2026-10-01", {
        token: people.reporter.token,
    });
    assert.equal(reversed.status, 400);
    assert.ok(reversed.body.fields.to);
    const tooLong = await api.callApi("GET", "/V1/reports/sales?from=2024-01-01&to=2026-01-31", {
        token: people.reporter.token,
    });
    assert.equal(tooLong.status, 400);
    const badDate = await api.callApi("GET", "/V1/reports/sales?from=2026-02-30&to=2026-03-01", {
        token: people.reporter.token,
    });
    assert.equal(badDate.status, 400);
    const forbidden = await api.callApi("GET", "/V1/reports/sales/monthly", { token: people.invoiceViewer.token });
    assert.equal(forbidden.status, 403);
});
