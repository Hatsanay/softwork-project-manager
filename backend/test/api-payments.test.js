// จัดซื้อ ขั้น 2-4 — ทำจ่าย / ใบสำคัญจ่าย + 50 ทวิ: หักตามประเภทเงินได้ · จ่ายบางส่วน · จ่ายพร้อมกันไม่เกิน (R-P1)
// ยกเลิกแล้ว 50 ทวิ ยกเลิกตาม · เลข 50 ทวิ ไม่ข้าม · ใบเบิกจ่ายคืนพนักงาน · สิทธิ์ · audit
// ยิงผ่านเซิร์ฟเวอร์จริงบนฐานข้อมูลชั่วคราว · แบบระบบ: docs/plans/2026-10-16-purchasing-2.md หัวข้อ 4.2 และ R-P1/R-P3/R-P5/R-P6
const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { startTestServer } = require("./support/test-server");
const { PERMISSION_KEYS } = require("../src/shared/permissions.mjs");
const { todayBangkok } = require("../src/utils/bangkok-time");

const PASSWORD = "Staff@2026";
const BANK_ACCOUNT_ID = "BAC209901010000001";
const PNG_BYTES = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
);

let api;
let userCounter = 0;
let categoryId;
const people = {};
const vendors = {};

function daysFromToday(dayCount) {
    const [year, month, day] = todayBangkok().split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day + dayCount)).toISOString().slice(0, 10);
}

async function createPerson(name, permissionKeys) {
    const bits = PERMISSION_KEYS.map((key) => (permissionKeys.includes(key) ? "1" : "0")).join("");
    const role = await api.callApi("POST", "/V1/roles", { body: { role_name: `role-${name}`, role_permission: bits } });
    assert.equal(role.status, 201, JSON.stringify(role.body));
    userCounter += 1;
    const userId = `USE20990101000${String(userCounter).padStart(4, "0")}`;
    await api.pool.query(
        `INSERT INTO tb_users (user_id, user_username, user_email, user_password, user_fname, user_lname, user_role_id, user_must_change_password)
         VALUES (?, ?, ?, ?, ?, 'ทดสอบ', ?, 0)`,
        [userId, name, `${name}@example.com`, await bcrypt.hash(PASSWORD, 10), name, role.body.role_id],
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

/** บิลที่อนุมัติแล้ว (กติกา EX ตั้งวงเงินสูง → ผ่านอัตโนมัติ) */
async function approvedBill({
    vendorId = vendors.thai,
    price = "2000",
    vat = "140",
    whtType = "SERVICE",
    currency,
} = {}) {
    const body = {
        ex_vendor_id: vendorId,
        ex_title: "ค่าจ้างพัฒนาระบบ",
        ex_branch_id: "BRA202601010000001",
        ex_doc_type: "substitute_receipt",
        ex_expense_date: todayBangkok(),
        ex_vat_amount: vat,
        ex_wht_income_type: whtType,
        lines: [{ exl_category_id: categoryId, exl_description: "งานพัฒนา", exl_unit_price: price }],
    };
    if (currency) Object.assign(body, currency);
    const created = expectStatus(await api.callApi("POST", "/V1/expenses", { body }), 201);
    expectStatus(await api.callApi("POST", `/V1/expenses/${created.ex_id}/submit`, { body: {} }), 200);
    return created.ex_id;
}

const payment = (expenseId, amount, overrides = {}) => ({
    pv_payee_kind: "vendor",
    pv_vendor_id: vendors.thai,
    pv_branch_id: "BRA202601010000001",
    pv_payment_date: todayBangkok(),
    pv_method: "cash",
    allocations: [{ pva_expense_id: expenseId, pva_amount: amount }],
    ...overrides,
});

test.before(async () => {
    api = await startTestServer("payments");
    await api.loginAsAdmin();

    people.payer = await createPerson("pv.payer", ["dashboard", "viewExpenses", "makePayment"]);
    people.canceller = await createPerson("pv.canceller", ["dashboard", "viewExpenses", "cancelPayment"]);
    people.viewer = await createPerson("pv.viewer", ["dashboard", "viewExpenses"]);
    people.staff = await createPerson("pv.staff", ["dashboard"]);

    // ทุกรายการผ่านอัตโนมัติ — เทสต์นี้ดูการจ่าย ไม่ใช่การอนุมัติ
    for (const documentType of ["EX", "EC"]) {
        const [[systemRole]] = await api.pool.query("SELECT role_id FROM tb_roles WHERE role_type = 'S' LIMIT 1");
        expectStatus(
            await api.callApi("PUT", "/V1/company/approval-levels", {
                body: {
                    doc_type: documentType,
                    levels: [
                        { al_min_amount_thb: "1000000", al_require_distinct: false, role_ids: [systemRole.role_id] },
                    ],
                },
            }),
            200,
        );
    }
    await api.pool.query(
        `INSERT INTO tb_bank_accounts (ba_id, ba_bank_name, ba_account_name, ba_account_no, ba_currency, ba_is_default, ba_status)
         VALUES (?, 'กสิกรไทย', 'บริษัท ทดสอบ จำกัด', '123-4-56789-0', 'THB', 1, 'active')`,
        [BANK_ACCOUNT_ID],
    );

    vendors.thai = expectStatus(
        await api.callApi("POST", "/V1/vendors", {
            body: {
                vd_name: "บริษัท พัฒนาดี จำกัด",
                vd_tax_id: "0105557000347",
                vd_branch_code: "00000",
                vd_address: "1 ถนนสีลม กรุงเทพฯ",
                vd_bank_name: "ไทยพาณิชย์",
                vd_bank_account_no: "1112223334",
                vd_bank_account_name: "บริษัท พัฒนาดี จำกัด",
            },
        }),
        201,
    ).vd_id;
    vendors.foreign = expectStatus(
        await api.callApi("POST", "/V1/vendors", {
            body: { vd_country: "US", vd_name: "Cloud Inc.", vd_currency: "USD" },
        }),
        201,
    ).vd_id;
    const setup = expectStatus(await api.callApi("GET", "/V1/purchasing/setup"), 200);
    categoryId = setup.categories.find((category) => category.ec_sort_order === 1).ec_id;
});

test.after(async () => {
    await api?.stop();
});

test("จ่ายเต็ม: ได้เลข PV + 50 ทวิ (ภ.ง.ด.53) · หักตามอัตรา ณ วันจ่าย · snapshot ผู้รับ · รายการกลายเป็นจ่ายแล้ว", async () => {
    const expenseId = await approvedBill();
    const payable = expectStatus(
        await as(people.payer, "GET", `/V1/payments/payable-expenses?payee_kind=vendor&payee_id=${vendors.thai}`),
        200,
    );
    assert.equal(payable.wht_form, "PND53");
    assert.deepEqual(payable.rates.SERVICE, { rate: "3.00", min_payment: "1000.00" });
    assert.ok(payable.data.some((row) => row.ex_id === expenseId && row.outstanding_amount === "2140.00"));
    const payees = expectStatus(await as(people.payer, "GET", "/V1/payments/payees"), 200);
    assert.ok(payees.data.some((row) => row.payee_id === vendors.thai && row.payee_kind === "vendor"));

    const created = expectStatus(
        await as(people.payer, "POST", "/V1/payments", payment(expenseId, "2140", { pv_fee_amount: "25" })),
        201,
    );
    assert.match(created.pv_number, /^PV-\d{8}-\d{6}$/);
    assert.match(created.wt_number, /^WT-\d{4}-000001$/);

    const detail = expectStatus(await as(people.viewer, "GET", `/V1/payments/${created.pv_id}`), 200);
    assert.equal(detail.payment.pv_wht_amount, "60.00");
    assert.equal(detail.payment.pv_net_paid, "2080.00");
    assert.equal(detail.payment.pv_fee_amount, "25.00");
    assert.equal(detail.payment.pv_payee_snapshot.vd_bank_account_no, "1112223334", "เก็บบัญชีผู้รับ ณ วันจ่าย");
    assert.equal(detail.allocations[0].pva_base_amount, "2000.00");
    assert.equal(detail.certificate.wt_form, "PND53");
    assert.deepEqual(
        detail.certificate.lines.map((line) => [
            line.wtl_form_row,
            line.wtl_rate,
            line.wtl_paid_amount,
            line.wtl_tax_amount,
        ]),
        [[5, "3.00", "2000.00", "60.00"]],
    );
    assert.equal(detail.certificate.wt_payee_snapshot.vd_tax_id, "0105557000347");

    const expense = expectStatus(await api.callApi("GET", `/V1/expenses/${expenseId}`), 200);
    assert.equal(expense.expense.payment_state, "paid");
    assert.equal(expense.payments[0].pv_number, created.pv_number);
    assert.equal(expense.actions.can_pay, false);
    assert.match(expense.actions.cancel_blocked_reason, /ยกเลิกใบสำคัญจ่ายก่อน/);

    const again = await as(people.payer, "POST", "/V1/payments", payment(expenseId, "1"));
    assert.equal(again.status, 409, "จ่ายครบแล้วจ่ายซ้ำไม่ได้");
});

test("จ่ายบางส่วนสองครั้ง: ฐานครั้งสุดท้ายรับเศษ · ฐานต่ำกว่าเกณฑ์ไม่หัก (ไม่ออก 50 ทวิ) · แก้ยอดหักได้", async () => {
    const expenseId = await approvedBill({ price: "3333.33", vat: "233.33" });
    const first = expectStatus(await as(people.payer, "POST", "/V1/payments", payment(expenseId, "1000")), 201);
    assert.equal(first.wt_number, null, "ฐาน 934.58 ต่ำกว่าเกณฑ์ 1,000 · ไม่หัก ไม่ออก 50 ทวิ");
    const firstDetail = expectStatus(await as(people.payer, "GET", `/V1/payments/${first.pv_id}`), 200);
    assert.equal(firstDetail.allocations[0].pva_base_amount, "934.58");

    const second = expectStatus(
        await as(
            people.payer,
            "POST",
            "/V1/payments",
            payment(expenseId, "2566.66", { withholdings: [{ income_type: "SERVICE", amount: "70" }] }),
        ),
        201,
    );
    const secondDetail = expectStatus(await as(people.payer, "GET", `/V1/payments/${second.pv_id}`), 200);
    assert.equal(secondDetail.allocations[0].pva_base_amount, "2398.75", "3,333.33 − 934.58");
    assert.equal(secondDetail.payment.pv_wht_amount, "70.00", "ใช้ยอดที่ผู้ใช้แก้");
    assert.equal(secondDetail.certificate.lines[0].wtl_paid_amount, "2398.75");
});

test("จ่ายรายการเดียวกันเต็มยอดพร้อมกัน 3 คำขอ ได้ใบเดียว (R-P1)", async () => {
    const expenseId = await approvedBill({ price: "500", vat: "0", whtType: null });
    const results = await Promise.all(
        [1, 2, 3].map(() => as(people.payer, "POST", "/V1/payments", payment(expenseId, "500"))),
    );
    assert.deepEqual(results.map((result) => result.status).sort(), [201, 409, 409]);
    const [[expense]] = await api.pool.query("SELECT ex_paid_amount FROM tb_expenses WHERE ex_id = ?", [expenseId]);
    assert.equal(expense.ex_paid_amount, "500.00");
});

test("ใบเบิก: จ่ายคืนพนักงานด้วยการโอน (ต้องเลือกบัญชีบริษัท) · ไม่หัก ณ ที่จ่าย · ผู้เบิกเห็นว่าได้เงินคืนแล้ว", async () => {
    const claim = expectStatus(
        await as(people.staff, "POST", "/V1/claims", {
            ex_title: "ค่าแท็กซี่",
            ex_branch_id: "BRA202601010000001",
            ex_doc_type: "substitute_receipt",
            ex_expense_date: todayBangkok(),
            lines: [{ exl_category_id: categoryId, exl_description: "ไปพบลูกค้า", exl_unit_price: "1500" }],
        }),
        201,
    );
    const form = new FormData();
    form.append("file", new Blob([PNG_BYTES], { type: "image/png" }), "ใบเสร็จ.png");
    expectStatus(
        await api.callApi("POST", `/V1/claims/${claim.ex_id}/attachments`, { token: people.staff.token, body: form }),
        201,
    );
    expectStatus(await as(people.staff, "POST", `/V1/claims/${claim.ex_id}/submit`, {}), 200);

    const reimburse = {
        pv_payee_kind: "employee",
        pv_employee_id: people.staff.userId,
        pv_branch_id: "BRA202601010000001",
        pv_payment_date: todayBangkok(),
        pv_method: "transfer",
        allocations: [{ pva_expense_id: claim.ex_id, pva_amount: "1500" }],
    };
    const noAccount = await as(people.payer, "POST", "/V1/payments", reimburse);
    assert.equal(noAccount.status, 400);
    assert.ok(noAccount.body.fields.pv_bank_account_id);
    const wrongPayee = await as(people.payer, "POST", "/V1/payments", {
        ...reimburse,
        pv_employee_id: people.payer.userId,
        pv_bank_account_id: BANK_ACCOUNT_ID,
    });
    assert.equal(wrongPayee.status, 409, "จ่ายใบเบิกให้คนอื่นที่ไม่ใช่ผู้เบิกไม่ได้");

    const paid = expectStatus(
        await as(people.payer, "POST", "/V1/payments", { ...reimburse, pv_bank_account_id: BANK_ACCOUNT_ID }),
        201,
    );
    assert.equal(paid.wt_number, null);
    const ownView = expectStatus(await as(people.staff, "GET", `/V1/claims/${claim.ex_id}`), 200);
    assert.equal(ownView.expense.payment_state, "paid");
    assert.equal(ownView.payments[0].pv_number, paid.pv_number);
});

test("ยกเลิก: ต้องมีสิทธิ์ยกเลิก · ยอดค้างกลับมา · 50 ทวิ ยกเลิกตาม เลขยังอยู่ · ใบถัดไปได้เลขต่อ (ไม่ใช้ซ้ำ)", async () => {
    const expenseId = await approvedBill();
    const created = expectStatus(await as(people.payer, "POST", "/V1/payments", payment(expenseId, "2140")), 201);
    assert.equal(
        (await as(people.payer, "POST", `/V1/payments/${created.pv_id}/cancel`, { reason: "ผิด" })).status,
        403,
    );

    expectStatus(
        await as(people.canceller, "POST", `/V1/payments/${created.pv_id}/cancel`, { reason: "โอนผิดบัญชี" }),
        200,
    );
    const detail = expectStatus(await as(people.viewer, "GET", `/V1/payments/${created.pv_id}`), 200);
    assert.equal(detail.payment.pv_status, "cancelled");
    assert.equal(detail.certificate.wt_status, "cancelled");
    assert.equal(detail.certificate.wt_number, created.wt_number, "เลขยังอยู่");
    const expense = expectStatus(await api.callApi("GET", `/V1/expenses/${expenseId}`), 200);
    assert.equal(expense.expense.outstanding_amount, "2140.00");

    const repaid = expectStatus(await as(people.payer, "POST", "/V1/payments", payment(expenseId, "2140")), 201);
    const [, , previousSequence] = created.wt_number.split("-");
    assert.equal(repaid.wt_number.split("-")[2], String(Number(previousSequence) + 1).padStart(6, "0"));
    const list = expectStatus(await as(people.viewer, "GET", "/V1/wht-certificates?form=PND53"), 200);
    assert.ok(list.data.some((row) => row.wt_number === created.wt_number && row.wt_status === "cancelled"));
});

test("สิทธิ์ · ตรวจวันที่/ผู้รับต่างประเทศ · audit", async () => {
    assert.equal((await as(people.viewer, "GET", "/V1/payments")).status, 200);
    assert.equal((await as(people.viewer, "GET", "/V1/payments/payees")).status, 403);
    assert.equal((await as(people.staff, "GET", "/V1/payments")).status, 403);

    const expenseId = await approvedBill({ price: "100", vat: "0", whtType: null });
    assert.equal((await as(people.viewer, "POST", "/V1/payments", payment(expenseId, "100"))).status, 403);
    const future = await as(
        people.payer,
        "POST",
        "/V1/payments",
        payment(expenseId, "100", { pv_payment_date: daysFromToday(1) }),
    );
    assert.equal(future.status, 400);
    assert.ok(future.body.fields.pv_payment_date);
    const tooOld = await as(
        people.payer,
        "POST",
        "/V1/payments",
        payment(expenseId, "100", { pv_payment_date: daysFromToday(-31) }),
    );
    assert.equal(tooOld.status, 400);

    const usdBill = await approvedBill({
        vendorId: vendors.foreign,
        price: "100",
        vat: "0",
        whtType: null,
        currency: {
            ex_currency: "USD",
            ex_exchange_rate: "35.5",
            ex_rate_source: "manual",
            ex_rate_override_reason: "อัตราที่บัตรตัด",
        },
    });
    const usdPayment = payment(usdBill, "100", { pv_vendor_id: vendors.foreign });
    const noThb = await as(people.payer, "POST", "/V1/payments", usdPayment);
    assert.equal(noThb.status, 400);
    assert.ok(noThb.body.fields.pv_paid_thb);
    const usdPaid = expectStatus(
        await as(people.payer, "POST", "/V1/payments", { ...usdPayment, pv_paid_thb: "3600" }),
        201,
    );
    const usdDetail = expectStatus(await as(people.payer, "GET", `/V1/payments/${usdPaid.pv_id}`), 200);
    assert.equal(usdDetail.payment.pv_fx_diff_thb, "-50.00", "จ่ายบาทมากกว่าที่บันทึก 50 = ขาดทุน");
    assert.equal(usdPaid.wt_number, null, "ต่างประเทศไม่ออก 50 ทวิ");

    await new Promise((resolve) => setTimeout(resolve, 300));
    const [rows] = await api.pool.query(
        "SELECT DISTINCT aud_action FROM tb_audit_logs WHERE (aud_path LIKE '/payments%' OR aud_path LIKE '/wht-certificates%') AND aud_success = 1",
    );
    const actions = new Set(rows.map((row) => row.aud_action));
    for (const expected of ["ทำจ่าย (ออกใบสำคัญจ่าย / 50 ทวิ)", "ยกเลิกใบสำคัญจ่าย (50 ทวิ ยกเลิกตาม)"]) {
        assert.ok(actions.has(expected), `audit ต้องมี "${expected}" (มี: ${[...actions].join(", ")})`);
    }
});
