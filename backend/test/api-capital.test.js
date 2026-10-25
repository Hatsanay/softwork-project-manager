// เงินทุนสะสม P-3 (2026-10-25 · docs/plans/2026-10-24-pre-incorporation.md ข้อ 12)
// ยอด = เข้าจากโปรเจกต์ (อ่านจากการปิดยอด ไม่เก็บซ้ำ) + ฝากเพิ่ม − ถอนออก · ถอนเกินยอด/ไม่มีเหตุผล/วันอนาคต ไม่ได้
// ยกเลิกการปิดยอด = ยอดหายจากเงินทุนเอง · เพดาน VAT ใช้รายได้ปีนี้ตัวเดียวกับหน้ารายงาน · จด VAT แล้วไม่แสดง
const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { startTestServer } = require("./support/test-server");
const { PERMISSION_KEYS } = require("../src/shared/permissions.mjs");
const { todayBangkok } = require("../src/utils/bangkok-time");
// service โหลดหลังเปิด server (มันสร้าง pool ฐานข้อมูลตอน require · ต้องโหลด .env ของเทสต์ก่อน)
let shiftMonth;

const PASSWORD = "Staff@2026";
const today = todayBangkok();
let api;
let bankAccountId;
const people = {};

async function createPerson(name, permissionKeys, userNumber) {
    const bits = PERMISSION_KEYS.map((key) => (permissionKeys.includes(key) ? "1" : "0")).join("");
    const role = await api.callApi("POST", "/V1/roles", { body: { role_name: `role-${name}`, role_permission: bits } });
    assert.equal(role.status, 201, JSON.stringify(role.body));
    const userId = `USE20990120000${userNumber}`;
    await api.pool.query(
        `INSERT INTO tb_users (user_id, user_username, user_email, user_password, user_fname, user_lname, user_role_id, user_must_change_password)
         VALUES (?, ?, ?, ?, ?, 'ทดสอบ', ?, 0)`,
        [userId, name, `${name}@example.com`, await bcrypt.hash(PASSWORD, 10), name, role.body.role_id],
    );
    return { userId, token: await api.login(name, PASSWORD) };
}

const as = (person, method, url, body) => api.callApi(method, url, { token: person?.token, body });

function expectStatus(response, status, note) {
    assert.equal(response.status, status, `${note ?? ""} ${JSON.stringify(response.body)}`);
    return response.body;
}

test.before(async () => {
    api = await startTestServer("capital");
    ({ shiftMonth } = require("../src/services/capital.service"));
    await api.loginAsAdmin();
    people.owner = await createPerson("cap.owner", ["dashboard", "manageFastwork", "manageProfitShares", "manageCapitalFund"], 501);
    people.staff = await createPerson("cap.staff", ["dashboard", "manageFastwork"], 502);
    const bank = await api.callApi("POST", "/V1/company/bank-accounts", {
        body: { ba_bank_name: "กรุงไทย", ba_account_name: "เจ้าของ", ba_account_no: "9876543210", ba_currency: "THB", ba_is_default: true, ba_status: "active" },
    });
    assert.equal(bank.status, 201, JSON.stringify(bank.body));
    bankAccountId = bank.body.ba_id;
    await api.pool.query("UPDATE tb_company_settings SET cs_vat_registered_from = NULL, cs_incorporated_on = NULL WHERE cs_id = 1");
});

test.after(async () => {
    await api?.stop();
});

test("เลื่อนเดือน: ข้ามปีทั้งไปและกลับ", () => {
    assert.equal(shiftMonth("2026-11", 3), "2027-02");
    assert.equal(shiftMonth("2026-01", -1), "2025-12");
    assert.equal(shiftMonth("2026-06", -5), "2026-01");
});

test("เงินทุน: ฝาก/ถอน · เข้าจากการปิดยอด · ยกเลิกปิดยอดแล้วยอดหายเอง · เป้าและคาดการณ์ · เพดาน VAT", async () => {
    expectStatus(await as(people.staff, "GET", "/V1/capital"), 403, "ไม่มีสิทธิ์เงินทุน");
    let capital = expectStatus(await as(people.owner, "GET", "/V1/capital"), 200);
    assert.equal(capital.totals.balance, "0.00");
    assert.equal(capital.goal.amount, null);
    assert.equal(capital.vat_ceiling.income, "0.00");
    assert.equal(capital.vat_ceiling.state, "ok");

    // ตั้งเป้า 100,000
    expectStatus(await as(people.owner, "PUT", "/V1/capital/goal", { cs_capital_goal: "0", cs_capital_target_date: null }), 400);
    expectStatus(await as(people.owner, "PUT", "/V1/capital/goal", { cs_capital_goal: "100000", cs_capital_target_date: "2027-06-30" }), 200);

    // ฝาก 5,000 · ถอนต้องมีเหตุผล · ถอนเกินยอดไม่ได้ · วันอนาคตไม่ได้
    const deposit = expectStatus(
        await as(people.owner, "POST", "/V1/capital/entries", { cpe_kind: "deposit", cpe_amount: "5000", cpe_entry_date: today, cpe_note: "เงินเก็บส่วนตัว" }),
        201,
    );
    const noReason = expectStatus(await as(people.owner, "POST", "/V1/capital/entries", { cpe_kind: "withdraw", cpe_amount: "100", cpe_entry_date: today }), 400);
    assert.ok(noReason.fields.cpe_note);
    const tooMuch = expectStatus(
        await as(people.owner, "POST", "/V1/capital/entries", { cpe_kind: "withdraw", cpe_amount: "5000.01", cpe_entry_date: today, cpe_note: "ซื้อโน้ตบุ๊ก" }),
        400,
    );
    assert.match(tooMuch.fields.cpe_amount, /5000\.00/);
    const future = expectStatus(
        await as(people.owner, "POST", "/V1/capital/entries", { cpe_kind: "deposit", cpe_amount: "1", cpe_entry_date: "2099-01-01" }),
        400,
    );
    assert.ok(future.fields.cpe_entry_date);
    expectStatus(
        await as(people.owner, "POST", "/V1/capital/entries", { cpe_kind: "withdraw", cpe_amount: "1000", cpe_entry_date: today, cpe_note: "ค่าทนายจดบริษัท" }),
        201,
    );

    // งาน Fastwork 10,000 ค่าธรรมเนียม 1,700 · ส่วนแบ่งเจ้าของ 50% → กำไร 8,300 · เข้าทุน 4,150
    const job = expectStatus(
        await as(people.owner, "POST", "/V1/fastwork/projects", {
            project_name: "เว็บร้านกาแฟ",
            client_name: "coffee_cnx",
            milestones: [{ fwm_name: "ทั้งงาน", fwm_amount: "10000" }],
        }),
        201,
    );
    const detail = expectStatus(await as(people.owner, "GET", `/V1/fastwork/projects/${job.project_id}`), 200);
    expectStatus(
        await as(people.owner, "POST", "/V1/fastwork/payouts", {
            fwp_status: "received", fwp_project_id: job.project_id, fwp_milestone_id: detail.fastwork.milestones[0].fwm_id, fwp_gross: "10000",
            fwp_fee_rate: "17", fwp_fee: "1700.00", fwp_fee_vat: "0", fwp_wht: "0", fwp_approved_date: today, fwp_received_date: today,
            fwp_bank_account_id: bankAccountId,
        }),
        201,
    );
    expectStatus(
        await as(people.owner, "PUT", `/V1/profit-shares/projects/${job.project_id}/shares`, {
            shares: [{ recipient_type: "user", recipient_id: people.owner.userId, kind: "percent", percent: "50" }],
        }),
        200,
    );
    const settled = expectStatus(
        await as(people.owner, "POST", `/V1/profit-shares/projects/${job.project_id}/settle`, { settled_date: today, expected_distributable: "8300.00" }),
        201,
    );

    // 5,000 − 1,000 + 4,150 = 8,150 · เดือนนี้เข้าสุทธิ 8,150 → เฉลี่ย 6 เดือน 1,358.33 · ขาดอีก 91,850 → 68 เดือน
    capital = expectStatus(await as(people.owner, "GET", "/V1/capital"), 200);
    assert.deepEqual(capital.totals, { from_projects: "4150.00", deposits: "5000.00", withdrawals: "1000.00", balance: "8150.00" });
    assert.equal(capital.project_inflows.length, 1);
    assert.equal(capital.project_inflows[0].project_name, "เว็บร้านกาแฟ");
    assert.equal(capital.goal.percent, 8.1);
    assert.equal(capital.forecast.monthly_average, "1358.33");
    assert.equal(capital.forecast.remaining, "91850.00");
    assert.equal(capital.forecast.reach_month, shiftMonth(today.slice(0, 7), 68));
    // เพดาน VAT: นับราคางวดเต็ม 10,000 (หลังหักค่าธรรมเนียม 8,300 แสดงคู่ไว้จนนักบัญชีตอบ)
    assert.equal(capital.vat_ceiling.income, "10000.00");
    assert.equal(capital.vat_ceiling.income_after_fastwork_fee, "8300.00");
    assert.equal(capital.vat_ceiling.remaining, "1790000.00");

    // ยกเลิกการปิดยอด → เงินจากโปรเจกต์หายเอง (ไม่มีแถวในสมุดให้ตามลบ)
    const shares = expectStatus(await as(people.owner, "GET", `/V1/profit-shares/projects/${job.project_id}`), 200);
    expectStatus(
        await as(people.owner, "POST", `/V1/profit-shares/settlements/${settled.sst_id}/cancel`, { reason: "ตั้ง % ผิด", sst_version: shares.settlement.sst_version }),
        200,
    );
    capital = expectStatus(await as(people.owner, "GET", "/V1/capital"), 200);
    assert.equal(capital.totals.from_projects, "0.00");
    assert.equal(capital.totals.balance, "4000.00");

    // ยกเลิกรายการฝาก (บันทึกผิด) · ยกเลิกซ้ำไม่ได้
    expectStatus(await as(people.owner, "POST", `/V1/capital/entries/${deposit.cpe_id}/cancel`, { reason: "" }), 400);
    expectStatus(await as(people.owner, "POST", `/V1/capital/entries/${deposit.cpe_id}/cancel`, { reason: "บันทึกซ้ำ" }), 200);
    expectStatus(await as(people.owner, "POST", `/V1/capital/entries/${deposit.cpe_id}/cancel`, { reason: "บันทึกซ้ำ" }), 409);
    capital = expectStatus(await as(people.owner, "GET", "/V1/capital"), 200);
    assert.equal(capital.totals.balance, "-1000.00");
    assert.equal(capital.entries.find((entry) => entry.cpe_id === deposit.cpe_id).cpe_status, "cancelled");

    // จด VAT แล้ว → ไม่แสดงเพดาน
    await api.pool.query("UPDATE tb_company_settings SET cs_vat_registered_from = ? WHERE cs_id = 1", [`${today.slice(0, 4)}-01-01`]);
    capital = expectStatus(await as(people.owner, "GET", "/V1/capital"), 200);
    assert.equal(capital.vat_ceiling, null);
    await api.pool.query("UPDATE tb_company_settings SET cs_vat_registered_from = NULL WHERE cs_id = 1");
});

test("วันที่จดบริษัท: ว่าง = บุคคลธรรมดา · วันอนาคตไม่ได้", async () => {
    const company = expectStatus(await api.callApi("GET", "/V1/company"), 200);
    assert.equal(company.company.cs_incorporated_on, null);
    // ฐานทดสอบยังไม่มีชื่อ · ช่วงก่อนจดใช้ชื่อเจ้าของ
    const base = { ...company.company, cs_name_th: "เจ้าของกิจการ ทดสอบ" };
    for (const key of ["cs_logo_url", "cs_updated_at"]) delete base[key];
    const future = expectStatus(await api.callApi("PUT", "/V1/company", { body: { ...base, cs_incorporated_on: "2099-01-01" } }), 400);
    assert.ok(future.fields.cs_incorporated_on, JSON.stringify(future));
    expectStatus(await api.callApi("PUT", "/V1/company", { body: { ...base, cs_incorporated_on: today } }), 200);
    const updated = expectStatus(await api.callApi("GET", "/V1/company"), 200);
    assert.equal(updated.company.cs_incorporated_on, today);
});
