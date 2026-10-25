// งาน Fastwork P-1 (2026-10-24 · docs/plans/2026-10-24-pre-incorporation.md)
// สร้างงานจาก Fastwork (ลูกค้าใหม่จากชื่อ) · งวดงาน · ส่งงาน · บันทึกเงิน รอโอน/เข้าแล้ว · ยกเลิก · สิทธิ์
// · การเงินโปรเจกต์ (รายได้ = ราคางวดที่เงินเข้า · ค่าธรรมเนียมเป็นต้นทุน) · รายงานขาย · หน้า Fastwork · ลบโปรเจกต์ไม่ได้
const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { startTestServer } = require("./support/test-server");
const { PERMISSION_KEYS } = require("../src/shared/permissions.mjs");
const { todayBangkok } = require("../src/utils/bangkok-time");
const { addDays } = require("../src/shared/payroll-math.mjs");
const { suggestPayoutAmounts, payoutNetOf } = require("../src/shared/fastwork-math.mjs");

const PASSWORD = "Staff@2026";
const today = todayBangkok();
let api;
let bankAccountId;
const people = {};

async function createPerson(name, permissionKeys, userNumber) {
    const bits = PERMISSION_KEYS.map((key) => (permissionKeys.includes(key) ? "1" : "0")).join("");
    const role = await api.callApi("POST", "/V1/roles", { body: { role_name: `role-${name}`, role_permission: bits } });
    assert.equal(role.status, 201, JSON.stringify(role.body));
    const userId = `USE20990109000${userNumber}`;
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
    api = await startTestServer("fastwork");
    await api.loginAsAdmin();
    people.owner = await createPerson("fw.owner", ["dashboard", "manageFastwork", "viewInvoices", "salesReports", "viewAllProjects"], 301);
    people.planner = await createPerson("fw.planner", ["dashboard", "createProject"], 302);
    people.member = await createPerson("fw.member", ["dashboard", "viewOwnProjects"], 303);
    const bank = await api.callApi("POST", "/V1/company/bank-accounts", {
        body: {
            ba_bank_name: "กรุงไทย", ba_account_name: "เจ้าของ", ba_account_no: "1234567890", ba_currency: "THB",
            ba_is_default: true, ba_status: "active",
        },
    });
    assert.equal(bank.status, 201, JSON.stringify(bank.body));
    bankAccountId = bank.body.ba_id;
});

test.after(async () => {
    await api?.stop();
});

test("คำนวณค่าธรรมเนียม/ยอดเข้า: ปัดครึ่งขึ้นเป็นสตางค์ · ยอดหักเกินราคางวด = null", () => {
    assert.deepEqual(suggestPayoutAmounts({ gross: "999.99", feeRate: "17.00", feeVatRate: "7.00", whtRate: "3.00" }), {
        fee: "170.00",
        fee_vat: "11.90",
        wht: "30.00",
        net: "788.09",
    });
    assert.equal(payoutNetOf({ gross: "100.00", fee: "90.00", feeVat: "6.30", wht: "3.70" }), "0.00");
    assert.equal(payoutNetOf({ gross: "100.00", fee: "90.00", feeVat: "6.30", wht: "3.71" }), null);
});

test("งาน Fastwork: สร้าง → ส่งงาน → รอโอน → เงินเข้า · ยกเลิกแล้วบันทึกใหม่ได้ · การเงิน/รายงาน/หน้า Fastwork", async () => {
    const newJob = {
        project_name: "เว็บไซต์ร้านกาแฟ (Fastwork)",
        client_name: "coffee_lover88",
        project_fastwork_order_no: "FW-20261024-001",
        project_fastwork_url: "https://fastwork.co/user/order/123",
        milestones: [
            { fwm_name: "ออกแบบหน้าเว็บ", fwm_amount: "4000", fwm_due_date: addDays(today, 3) },
            { fwm_name: "พัฒนาและส่งมอบ", fwm_amount: "6000", fwm_due_date: addDays(today, 20) },
        ],
    };
    expectStatus(await as(people.planner, "POST", "/V1/fastwork/projects", newJob), 403, "สร้างโปรเจกต์ได้ไม่ได้แปลว่าจัดการ Fastwork");
    const invalid = expectStatus(await as(people.owner, "POST", "/V1/fastwork/projects", { ...newJob, client_name: null }), 400);
    assert.ok(invalid.fields.client_name);
    const created = expectStatus(await as(people.owner, "POST", "/V1/fastwork/projects", newJob), 201);
    const projectId = created.project_id;
    const [[project]] = await api.pool.query(
        "SELECT p.project_channel, p.project_status, c.client_name, c.client_type FROM tb_projects p JOIN tb_clients c ON c.client_id = p.client_id WHERE p.project_id = ?",
        [projectId],
    );
    assert.deepEqual({ ...project }, { project_channel: "fastwork", project_status: "in_progress", client_name: "coffee_lover88", client_type: "individual" });

    // ผู้สร้างเป็น PM → เพิ่มสมาชิก
    expectStatus(await as(people.owner, "POST", `/V1/projects/${projectId}/members`, { user_id: people.member.userId, position_ids: [] }), 201);
    const detail = expectStatus(await as(people.member, "GET", `/V1/fastwork/projects/${projectId}`), 200);
    assert.equal(detail.can_see_money, false, "สมาชิกทั่วไปไม่เห็นยอดเงิน");
    assert.equal(detail.fastwork.milestones[0].fwm_amount, undefined);
    const [first, second] = detail.fastwork.milestones;
    expectStatus(await as(people.member, "POST", `/V1/fastwork/projects/${projectId}/milestones/${first.fwm_id}/delivered`, { delivered: true }), 200);

    // หน้า Fastwork: งวดที่ส่งแล้วรอบันทึก 1 · ผู้สร้างโปรเจกต์เห็นได้แต่ไม่เห็นยอดเงิน
    const hubForPlanner = expectStatus(await as(people.planner, "GET", "/V1/fastwork/overview"), 200);
    assert.equal(hubForPlanner.steps.milestones_awaiting_record, 1);
    assert.equal(hubForPlanner.steps.payouts_pending_net, null);
    assert.equal(hubForPlanner.projects.find((row) => row.project_id === projectId).next_step, "record");
    expectStatus(await as(people.member, "GET", "/V1/fastwork/overview"), 403);

    // บันทึกรอโอน (ยอดตามค่าเริ่มต้น 17%) · บันทึกซ้ำงวดเดิมไม่ได้ · ยอดหักเกินไม่ได้
    const amounts = suggestPayoutAmounts({ gross: "4000.00", feeRate: "17.00", feeVatRate: "0", whtRate: "0" });
    const pendingBody = {
        fwp_status: "pending", fwp_project_id: projectId, fwp_milestone_id: first.fwm_id, fwp_gross: "4000", fwp_fee_rate: "17",
        fwp_fee: amounts.fee, fwp_fee_vat: amounts.fee_vat, fwp_wht: amounts.wht, fwp_approved_date: today,
    };
    expectStatus(await as(people.member, "POST", "/V1/fastwork/payouts", pendingBody), 403);
    const pending = expectStatus(await as(people.owner, "POST", "/V1/fastwork/payouts", pendingBody), 201);
    assert.equal(pending.fwp_net, "3320.00");
    const duplicate = expectStatus(await as(people.owner, "POST", "/V1/fastwork/payouts", pendingBody), 400);
    assert.match(duplicate.fields.fwp_milestone_id, /บันทึกเงินไปแล้ว/);
    expectStatus(await as(people.member, "POST", `/V1/fastwork/projects/${projectId}/milestones/${first.fwm_id}/delivered`, { delivered: false }), 409);

    // ยืนยันเงินเข้า: เวอร์ชันเก่า 409 · วันที่ก่อนวันยืนยัน 400 · ผ่าน
    const receiveBody = {
        fwp_fee: "680.00", fwp_fee_vat: "0", fwp_wht: "0", fwp_received_date: today,
        fwp_bank_account_id: bankAccountId, fwp_reference: "FW-PAYOUT-1", fwp_version: pending.fwp_version,
    };
    expectStatus(await as(people.owner, "POST", `/V1/fastwork/payouts/${pending.fwp_id}/receive`, { ...receiveBody, fwp_version: 99 }), 409);
    expectStatus(await as(people.owner, "POST", `/V1/fastwork/payouts/${pending.fwp_id}/receive`, { ...receiveBody, fwp_received_date: addDays(today, -1) }), 400);
    const future = expectStatus(await as(people.owner, "POST", `/V1/fastwork/payouts/${pending.fwp_id}/receive`, { ...receiveBody, fwp_received_date: addDays(today, 1) }), 400);
    assert.match(future.fields.fwp_received_date, /ไม่เกินวันนี้/);
    const received = expectStatus(await as(people.owner, "POST", `/V1/fastwork/payouts/${pending.fwp_id}/receive`, receiveBody), 200);
    assert.equal(received.fwp_status, "received");

    // งวด 2: บันทึกผิด → ยกเลิก (ต้องมีเหตุผล) → บันทึกใหม่ได้ · ยอดหักเกินราคางวดไม่ได้
    const overCharged = expectStatus(
        await as(people.owner, "POST", "/V1/fastwork/payouts", { ...pendingBody, fwp_milestone_id: second.fwm_id, fwp_gross: "6000", fwp_fee: "6000.01" }),
        400,
    );
    assert.ok(overCharged.fields.fwp_fee);
    const wrong = expectStatus(
        await as(people.owner, "POST", "/V1/fastwork/payouts", {
            ...pendingBody, fwp_status: "received", fwp_milestone_id: second.fwm_id, fwp_gross: "600", fwp_fee: "102",
            fwp_received_date: today, fwp_bank_account_id: bankAccountId,
        }),
        201,
    );
    expectStatus(await as(people.owner, "POST", `/V1/fastwork/payouts/${wrong.fwp_id}/cancel`, { reason: "", fwp_version: wrong.fwp_version }), 400);
    expectStatus(
        await as(people.owner, "POST", `/V1/fastwork/payouts/${wrong.fwp_id}/cancel`, { reason: "พิมพ์ราคางวดผิด (ขาด 0)", fwp_version: wrong.fwp_version }),
        200,
    );
    const pendingTwo = expectStatus(
        await as(people.owner, "POST", "/V1/fastwork/payouts", { ...pendingBody, fwp_milestone_id: second.fwm_id, fwp_gross: "6000", fwp_fee: "1020.00" }),
        201,
    );

    // การเงินโปรเจกต์: รายได้ = ราคางวดที่เงินเข้าแล้ว (4,000) · ค่าธรรมเนียม 680 เป็นต้นทุน · รอโอน/ยกเลิกไม่นับ
    const finance = expectStatus(await as(people.owner, "GET", `/V1/projects/${projectId}/finance`), 200);
    assert.equal(finance.channel, "fastwork");
    assert.equal(finance.profit.fastwork_received_thb, "4000.00");
    assert.equal(finance.profit.revenue_thb, "4000.00");
    assert.equal(finance.profit.platform_fee_thb, "680.00");
    assert.equal(finance.profit.gross_profit_thb, "3320.00");
    const ownerDetail = expectStatus(await as(people.owner, "GET", `/V1/fastwork/projects/${projectId}`), 200);
    assert.deepEqual(
        { ...ownerDetail.fastwork.totals },
        {
            contract: "10000.00", received_gross: "4000.00", pending_gross: "6000.00", not_yet_paid: "0.00",
            fee: "680.00", fee_vat: "0.00", wht: "0.00", net_received: "3320.00",
        },
    );
    assert.deepEqual(ownerDetail.fastwork.milestones.map((milestone) => milestone.state), ["received", "pending"]);

    // รายงานขาย: บล็อก Fastwork ตามวันที่เงินเข้า · รายได้รวม = ลูกค้าตรง + Fastwork
    const report = expectStatus(await as(people.owner, "GET", `/V1/reports/sales?from=${today}&to=${addDays(today, 5)}`), 200);
    assert.equal(report.fastwork.gross_thb, "4000.00");
    assert.equal(report.fastwork.net_thb, "3320.00");
    assert.equal(report.total_income.amount_thb, "4000.00");
    const monthly = expectStatus(await as(people.owner, "GET", "/V1/reports/sales/monthly?months=1"), 200);
    assert.equal(monthly.months[0].fastwork_thb, "4000.00");

    // หน้า Fastwork: รอโอน 1 รายการ (ยอดเข้า 4,980) · ขั้นถัดไปของโปรเจกต์ = ยืนยันเงินเข้า
    const hub = expectStatus(await as(people.owner, "GET", "/V1/fastwork/overview"), 200);
    assert.equal(hub.steps.payouts_pending, 1);
    assert.equal(hub.steps.payouts_pending_net, "4980.00");
    assert.equal(hub.projects.find((row) => row.project_id === projectId).next_step, "receive");
    expectStatus(
        await as(people.owner, "POST", `/V1/fastwork/payouts/${pendingTwo.fwp_id}/receive`, {
            ...receiveBody, fwp_fee: "1020.00", fwp_version: pendingTwo.fwp_version,
        }),
        200,
    );
    const hubAfter = expectStatus(await as(people.owner, "GET", "/V1/fastwork/overview"), 200);
    assert.equal(hubAfter.projects.find((row) => row.project_id === projectId).next_step, "close");

    // แก้งวด: ลบงวดที่มีเงินแล้วไม่ได้ · ลบโปรเจกต์ที่มีรายการเงินไม่ได้
    const removeMilestone = await as(people.owner, "PUT", `/V1/fastwork/projects/${projectId}`, {
        project_fastwork_order_no: "FW-20261024-001",
        milestones: [{ fwm_id: first.fwm_id, fwm_name: "ออกแบบหน้าเว็บ", fwm_amount: "4000" }],
    });
    expectStatus(removeMilestone, 409);
    assert.equal(removeMilestone.body.code, "MILESTONE_HAS_PAYOUT");
    const removeProject = expectStatus(await as(people.owner, "DELETE", `/V1/projects/${projectId}`), 409);
    assert.equal(removeProject.code, "PROJECT_HAS_FASTWORK_PAYOUTS");
});

test("ตั้งอัตราค่าธรรมเนียม: ค่าเริ่มต้น 17% · แก้ได้เฉพาะผู้จัดการ Fastwork · เกิน 100% ไม่ได้", async () => {
    const settings = expectStatus(await as(people.planner, "GET", "/V1/fastwork/settings"), 200);
    assert.equal(settings.cs_fastwork_fee_rate, "17.00");
    const body = { cs_fastwork_fee_rate: "10", cs_fastwork_fee_vat_rate: "7", cs_fastwork_wht_rate: "3" };
    expectStatus(await as(people.planner, "PUT", "/V1/fastwork/settings", body), 403);
    expectStatus(await as(people.owner, "PUT", "/V1/fastwork/settings", { ...body, cs_fastwork_fee_rate: "100.01" }), 400);
    const updated = expectStatus(await as(people.owner, "PUT", "/V1/fastwork/settings", body), 200);
    assert.equal(updated.cs_fastwork_fee_rate, "10.00");
});
