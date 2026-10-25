// ส่วนแบ่งกำไร P-2 (2026-10-24 · docs/plans/2026-10-24-pre-incorporation.md ข้อ 4)
// กำไร = เงินเข้าจริง − ค่าธรรมเนียม − ค่าใช้จ่าย · ส่วนตายตัวก่อน → % ของที่เหลือ (ปัดลง) → ที่เหลือเข้าทุน
// เบิกล่วงหน้า · ปิดยอด (เงินรอโอน/ตัวเลขเปลี่ยน = ไม่ให้ปิด) · ยกเลิกการปิดยอด · จ่าย · ล็อกหลังปิดยอด · ของฉันเห็นเฉพาะของตัวเอง
const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { startTestServer } = require("./support/test-server");
const { PERMISSION_KEYS } = require("../src/shared/permissions.mjs");
const { todayBangkok } = require("../src/utils/bangkok-time");
const { splitProfit } = require("../src/shared/profit-share-math.mjs");

const PASSWORD = "Staff@2026";
const HEAD_OFFICE_ID = "BRA202601010000001";
const today = todayBangkok();
let api;
let bankAccountId;
let vendorId;
const people = {};

async function createPerson(name, permissionKeys, userNumber) {
    const bits = PERMISSION_KEYS.map((key) => (permissionKeys.includes(key) ? "1" : "0")).join("");
    const role = await api.callApi("POST", "/V1/roles", { body: { role_name: `role-${name}`, role_permission: bits } });
    assert.equal(role.status, 201, JSON.stringify(role.body));
    const userId = `USE20990110000${userNumber}`;
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
    api = await startTestServer("profit_shares");
    await api.loginAsAdmin();
    people.owner = await createPerson(
        "ps.owner",
        ["dashboard", "manageFastwork", "manageProfitShares", "viewInvoices", "manageVendors", "viewExpenses", "createExpense", "approveExpense"],
        401,
    );
    people.dev1 = await createPerson("ps.dev1", ["dashboard", "viewOwnProjects"], 402);
    people.dev2 = await createPerson("ps.dev2", ["dashboard", "viewOwnProjects"], 403);
    const bank = await api.callApi("POST", "/V1/company/bank-accounts", {
        body: { ba_bank_name: "กรุงไทย", ba_account_name: "เจ้าของ", ba_account_no: "1234567890", ba_currency: "THB", ba_is_default: true, ba_status: "active" },
    });
    assert.equal(bank.status, 201, JSON.stringify(bank.body));
    bankAccountId = bank.body.ba_id;
    vendorId = expectStatus(await as(people.owner, "POST", "/V1/vendors", { vd_type: "individual", vd_name: "ฟรีแลนซ์ หาลูกค้า" }), 201).vd_id;
});

test.after(async () => {
    await api?.stop();
});

test("แบ่งกำไร: ส่วนตายตัวก่อน · % ปัดลง · เศษเข้าทุน · ขาดทุน = % ได้ 0 ทุนติดลบ", () => {
    const shares = [
        { kind: "fixed", amount: "1000.00" },
        { kind: "percent", percent: "33.33" },
        { kind: "percent", percent: "33.33" },
    ];
    const split = splitProfit({ distributable: 1000001n, shares }); // 10,000.01
    assert.equal(split.afterFixed, 900001n);
    assert.deepEqual(split.amounts, [100000n, 299970n, 299970n]); // 2,999.70 ปัดลง
    assert.equal(split.companyAmount, 300061n);
    const loss = splitProfit({ distributable: 50000n, shares });
    assert.deepEqual(loss.amounts, [100000n, 0n, 0n]);
    assert.equal(loss.companyAmount, -50000n);
});

test("ส่วนแบ่งงาน Fastwork: ตั้ง → เบิก → ปิดยอด → ล็อก → ยกเลิกปิดยอด → ปิดใหม่ → จ่าย · ของฉันเห็นที่มาครบแต่ไม่เห็นยอดคนอื่น", async () => {
    const job = expectStatus(
        await as(people.owner, "POST", "/V1/fastwork/projects", {
            project_name: "แอปจองคิวร้านตัดผม",
            client_name: "barber_bkk",
            milestones: [
                { fwm_name: "ออกแบบ", fwm_amount: "10000" },
                { fwm_name: "ส่งมอบ", fwm_amount: "5000" },
            ],
        }),
        201,
    );
    const projectId = job.project_id;
    for (const person of [people.dev1, people.dev2]) {
        expectStatus(await as(people.owner, "POST", `/V1/projects/${projectId}/members`, { user_id: person.userId, position_ids: [] }), 201);
    }
    const detail = expectStatus(await as(people.owner, "GET", `/V1/fastwork/projects/${projectId}`), 200);
    const [first, second] = detail.fastwork.milestones;
    const payout = (milestone, status, gross, fee) => ({
        fwp_status: status, fwp_project_id: projectId, fwp_milestone_id: milestone.fwm_id, fwp_gross: gross, fwp_fee_rate: "17",
        fwp_fee: fee, fwp_fee_vat: "0", fwp_wht: "0", fwp_approved_date: today,
        ...(status === "received" ? { fwp_received_date: today, fwp_bank_account_id: bankAccountId } : {}),
    });
    expectStatus(await as(people.owner, "POST", "/V1/fastwork/payouts", payout(first, "received", "10000", "1700.00")), 201);
    // ค่าใช้จ่ายของโปรเจกต์ 1,000 (ต่ำกว่าวงเงินอนุมัติ = อนุมัติอัตโนมัติ)
    const expense = expectStatus(
        await as(people.owner, "POST", "/V1/expenses", {
            ex_branch_id: HEAD_OFFICE_ID, ex_vendor_id: vendorId, ex_currency: "THB", ex_vat_amount: "0", ex_title: "ค่าปลั๊กอินปฏิทินจอง",
            ex_doc_type: "receipt", ex_expense_date: today, ex_vendor_doc_no: "RC-0001", ex_vendor_doc_date: today,
            lines: [{ exl_category_id: 3, exl_project_id: projectId, exl_description: "ปลั๊กอินปฏิทิน 1 ปี", exl_quantity: "1", exl_unit_price: "1000" }],
        }),
        201,
    );
    expectStatus(await as(people.owner, "POST", `/V1/expenses/${expense.ex_id}/submit`, {}), 200);

    // ตั้งส่วนแบ่ง: % รวมเกิน 100 / ผู้รับซ้ำ ไม่ได้ · ฟรีแลนซ์ (ผู้ขาย) ตายตัว 1,000 · dev1 40% · dev2 30.5%
    const sharesBody = {
        shares: [
            { recipient_type: "vendor", recipient_id: vendorId, kind: "fixed", amount: "1000", note: "คนหางาน" },
            { recipient_type: "user", recipient_id: people.dev1.userId, kind: "percent", percent: "40", note: "นักพัฒนาหลัก" },
            { recipient_type: "user", recipient_id: people.dev2.userId, kind: "percent", percent: "30.5", note: "ออกแบบ" },
        ],
    };
    expectStatus(await as(people.dev1, "PUT", `/V1/profit-shares/projects/${projectId}/shares`, sharesBody), 403);
    const tooMuch = expectStatus(
        await as(people.owner, "PUT", `/V1/profit-shares/projects/${projectId}/shares`, {
            shares: [sharesBody.shares[1], { ...sharesBody.shares[2], percent: "60.01" }],
        }),
        400,
    );
    assert.ok(tooMuch.fields.shares);
    expectStatus(await as(people.owner, "PUT", `/V1/profit-shares/projects/${projectId}/shares`, { shares: [sharesBody.shares[1], sharesBody.shares[1]] }), 400);
    expectStatus(await as(people.owner, "PUT", `/V1/profit-shares/projects/${projectId}/shares`, sharesBody), 200);

    // ประมาณการ: กำไร 10,000 − 1,700 − 1,000 = 7,300 · หลังตายตัว 6,300 · dev1 2,520 · dev2 1,921.50 · ทุน 1,858.50
    const estimate = expectStatus(await as(people.owner, "GET", `/V1/profit-shares/projects/${projectId}`), 200);
    assert.equal(estimate.profit.distributable, "7300.00");
    assert.deepEqual(estimate.estimate.lines.map((line) => line.amount), ["1000.00", "2520.00", "1921.50"]);
    assert.equal(estimate.estimate.company_amount, "1858.50");

    // เบิกล่วงหน้า: ต้องอยู่ในรายชื่อ · เอาคนที่เบิกแล้วออกไม่ได้
    const advanceBody = { recipient_type: "user", recipient_id: people.dev1.userId, amount: "1000", paid_date: today, bank_account_id: bankAccountId };
    expectStatus(await as(people.owner, "POST", `/V1/profit-shares/projects/${projectId}/advances`, { ...advanceBody, recipient_id: people.owner.userId }), 400);
    expectStatus(await as(people.owner, "POST", `/V1/profit-shares/projects/${projectId}/advances`, advanceBody), 201);
    const removeAdvanced = expectStatus(
        await as(people.owner, "PUT", `/V1/profit-shares/projects/${projectId}/shares`, { shares: [sharesBody.shares[0], sharesBody.shares[2]] }),
        400,
    );
    assert.match(removeAdvanced.fields.shares, /เบิกล่วงหน้า/);

    // ของฉัน (ประมาณการ): ที่มาครบ · ส่วนตายตัวเป็นยอดรวม · ไม่มียอดของ dev2
    const mineEstimate = expectStatus(await as(people.dev1, "GET", "/V1/profit-shares/mine"), 200);
    assert.equal(mineEstimate.data.length, 1);
    assert.equal(mineEstimate.data[0].state, "estimate");
    assert.deepEqual({ ...mineEstimate.data[0].mine, wht: null }, {
        kind: "percent", percent: "40.00", amount: "2520.00", advanced: "1000.00", due: "1520.00",
        wht: null, transfer_amount: null, paid_date: null, reference: null,
    });
    assert.equal(mineEstimate.data[0].numbers.fixed_total, "1000.00");
    assert.ok(!JSON.stringify(mineEstimate).includes("1921.50"), "ไม่เห็นยอดของคนอื่น");

    // ปิดยอด: ยังมีเงินรอโอนไม่ได้
    expectStatus(await as(people.owner, "POST", "/V1/fastwork/payouts", payout(second, "pending", "5000", "850.00")), 201);
    const blocked = expectStatus(await as(people.owner, "POST", `/V1/profit-shares/projects/${projectId}/settle`, { settled_date: today, expected_distributable: "7300.00" }), 409);
    assert.equal(blocked.code, "PAYOUTS_PENDING");
    const pendingRow = expectStatus(await as(people.owner, "GET", `/V1/fastwork/payouts?project_id=${projectId}&status=pending`), 200).data[0];
    expectStatus(
        await as(people.owner, "POST", `/V1/fastwork/payouts/${pendingRow.fwp_id}/receive`, {
            fwp_fee: "850.00", fwp_fee_vat: "0", fwp_wht: "0", fwp_received_date: today, fwp_bank_account_id: bankAccountId, fwp_version: pendingRow.fwp_version,
        }),
        200,
    );
    // ตัวเลขเปลี่ยนแล้ว (เงินงวด 2 เข้า) → ปิดด้วยตัวเลขเก่าไม่ได้ · กำไรใหม่ 15,000 − 2,550 − 1,000 = 11,450
    const stale = expectStatus(await as(people.owner, "POST", `/V1/profit-shares/projects/${projectId}/settle`, { settled_date: today, expected_distributable: "7300.00" }), 409);
    assert.equal(stale.code, "PROFIT_CHANGED");
    const settleBody = { settled_date: today, expected_distributable: "11450.00" };
    const settled = expectStatus(await as(people.owner, "POST", `/V1/profit-shares/projects/${projectId}/settle`, settleBody), 201);

    // หลังปิดยอด: แก้ส่วนแบ่ง/เบิก/ยกเลิกเงิน Fastwork ไม่ได้
    expectStatus(await as(people.owner, "PUT", `/V1/profit-shares/projects/${projectId}/shares`, sharesBody), 409);
    expectStatus(await as(people.owner, "POST", `/V1/profit-shares/projects/${projectId}/advances`, advanceBody), 409);
    const lockedPayout = await as(people.owner, "POST", `/V1/fastwork/payouts/${pendingRow.fwp_id}/cancel`, { reason: "ทดสอบ", fwp_version: pendingRow.fwp_version + 1 });
    expectStatus(lockedPayout, 409);
    assert.equal(lockedPayout.body.code, "SHARES_SETTLED");

    // ยกเลิกการปิดยอด (ยังไม่จ่ายใคร) → ปิดใหม่
    let shares = expectStatus(await as(people.owner, "GET", `/V1/profit-shares/projects/${projectId}`), 200);
    expectStatus(
        await as(people.owner, "POST", `/V1/profit-shares/settlements/${settled.sst_id}/cancel`, { reason: "ลืมใส่ค่าใช้จ่าย", sst_version: shares.settlement.sst_version }),
        200,
    );
    expectStatus(await as(people.owner, "POST", `/V1/profit-shares/projects/${projectId}/settle`, settleBody), 201);
    shares = expectStatus(await as(people.owner, "GET", `/V1/profit-shares/projects/${projectId}`), 200);
    // หลังตายตัว 10,450 · dev1 40% 4,180 − เบิก 1,000 = 3,180 · dev2 30.5% 3,187.25 · ทุน 11,450 − 1,000 − 4,180 − 3,187.25 = 3,082.75
    assert.equal(shares.settlement.sst_company_amount, "3082.75");
    assert.deepEqual(
        shares.settlement.lines.map((line) => [line.ssl_recipient_name, line.ssl_amount, line.ssl_advanced, line.ssl_due]),
        [
            ["ฟรีแลนซ์ หาลูกค้า", "1000.00", "0.00", "1000.00"],
            ["ps.dev1 ทดสอบ", "4180.00", "1000.00", "3180.00"],
            ["ps.dev2 ทดสอบ", "3187.25", "0.00", "3187.25"],
        ],
    );

    // จ่าย dev1 · จ่ายซ้ำไม่ได้ · ยกเลิกการปิดยอดหลังจ่ายแล้วไม่ได้
    const dev1Line = shares.settlement.lines[1];
    const payBody = { paid_date: today, bank_account_id: bankAccountId, reference: "KTB-001", wht: "0", ssl_version: dev1Line.ssl_version };
    expectStatus(await as(people.owner, "POST", `/V1/profit-shares/lines/${dev1Line.ssl_id}/pay`, { ...payBody, wht: "3180.01" }), 400);
    expectStatus(await as(people.owner, "POST", `/V1/profit-shares/lines/${dev1Line.ssl_id}/pay`, payBody), 200);
    expectStatus(await as(people.owner, "POST", `/V1/profit-shares/lines/${dev1Line.ssl_id}/pay`, { ...payBody, ssl_version: dev1Line.ssl_version + 1 }), 409);
    const cannotCancel = expectStatus(
        await as(people.owner, "POST", `/V1/profit-shares/settlements/${shares.settlement.sst_id}/cancel`, { reason: "x", sst_version: shares.settlement.sst_version }),
        409,
    );
    assert.equal(cannotCancel.code, "SETTLEMENT_HAS_PAYMENTS");

    // ของฉัน (หลังปิดยอด): ตัวเลข ณ วันปิดยอด + การจ่ายของตัวเอง
    const mineDev1 = expectStatus(await as(people.dev1, "GET", "/V1/profit-shares/mine"), 200).data[0];
    assert.equal(mineDev1.state, "paid");
    assert.equal(mineDev1.numbers.distributable, "11450.00");
    assert.equal(mineDev1.mine.transfer_amount, "3180.00");
    assert.equal(mineDev1.mine.reference, "KTB-001");
    const mineDev2 = expectStatus(await as(people.dev2, "GET", "/V1/profit-shares/mine"), 200).data[0];
    assert.equal(mineDev2.state, "settled");
    assert.ok(!JSON.stringify(mineDev2).includes("4180.00"), "dev2 ไม่เห็นยอดของ dev1");

    // รายการโปรเจกต์ + หน้า Fastwork: ค้างจ่าย 2 คน (ฟรีแลนซ์ + dev2)
    const list = expectStatus(await as(people.owner, "GET", "/V1/profit-shares/projects"), 200);
    const row = list.data.find((item) => item.project_id === projectId);
    assert.equal(row.state, "unpaid");
    assert.equal(row.unpaid_count, 2);
    const hub = expectStatus(await as(people.owner, "GET", "/V1/fastwork/overview"), 200);
    assert.equal(hub.steps.share_lines_unpaid, 2);
    assert.equal(hub.projects.find((item) => item.project_id === projectId).next_step, "pay");
    expectStatus(await as(people.dev1, "GET", "/V1/profit-shares/projects"), 403);
});
