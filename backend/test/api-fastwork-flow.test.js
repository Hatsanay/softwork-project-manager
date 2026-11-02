// งาน Fastwork 4 ช่วง (2026-11-01 · docs/plans/2026-11-01-fastwork-flow-simplify.md)
// รับงานพร้อมทีมและส่วนแบ่ง (เติมจากงานล่าสุด) · ตัดงวดที่ลูกค้าไม่จ่าย · ปิดยอดได้เมื่อเงินเข้าครบ (F-1)
// ปิดยอด = ปิดงาน (F-3) · ขั้นถัดไปดูงวดก่อนส่วนแบ่ง (F-4) · หน้า Fastwork มีสิ่งที่ต้องทำและงานที่ปิดแล้วแต่ค้างจ่าย
const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { startTestServer } = require("./support/test-server");
const { PERMISSION_KEYS } = require("../src/shared/permissions.mjs");
const { todayBangkok } = require("../src/utils/bangkok-time");

const PASSWORD = "Staff@2026";
const today = todayBangkok();
let api;
let bankAccountId;
const people = {};

async function createPerson(name, permissionKeys, userNumber) {
    const bits = PERMISSION_KEYS.map((key) => (permissionKeys.includes(key) ? "1" : "0")).join("");
    const role = await api.callApi("POST", "/V1/roles", { body: { role_name: `role-${name}`, role_permission: bits } });
    assert.equal(role.status, 201, JSON.stringify(role.body));
    const userId = `USE20991101000${userNumber}`;
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

const jobBody = (name, extra = {}) => ({
    project_name: name,
    client_name: `buyer_${name}`,
    milestones: [
        { fwm_name: "ออกแบบ", fwm_amount: "3000" },
        { fwm_name: "ทำเว็บ", fwm_amount: "5000" },
    ],
    ...extra,
});

const receivedPayout = (projectId, milestoneId, gross) => ({
    fwp_status: "received", fwp_project_id: projectId, fwp_milestone_id: milestoneId, fwp_gross: gross, fwp_fee_rate: "17",
    fwp_fee: (Number(gross) * 0.17).toFixed(2), fwp_fee_vat: "0", fwp_wht: "0", fwp_approved_date: today,
    fwp_received_date: today, fwp_bank_account_id: bankAccountId,
});

async function milestonesOf(projectId) {
    return expectStatus(await as(people.owner, "GET", `/V1/fastwork/projects/${projectId}`), 200).fastwork.milestones;
}

async function overviewRow(person, projectId) {
    const overview = expectStatus(await as(person, "GET", "/V1/fastwork/overview"), 200);
    return { overview, row: overview.projects.find((project) => project.project_id === projectId) };
}

test.before(async () => {
    api = await startTestServer("fastwork_flow");
    await api.loginAsAdmin();
    people.owner = await createPerson("fw.owner", ["dashboard", "viewAllProjects", "manageFastwork", "manageProfitShares", "viewInvoices"], 501);
    people.sales = await createPerson("fw.sales", ["dashboard", "viewAllProjects", "manageFastwork"], 502);
    people.dev = await createPerson("fw.dev", ["dashboard", "viewOwnProjects"], 503);
    people.left = await createPerson("fw.left", ["dashboard", "viewOwnProjects"], 504);
    const bank = await api.callApi("POST", "/V1/company/bank-accounts", {
        body: { ba_bank_name: "กรุงไทย", ba_account_name: "เจ้าของ", ba_account_no: "1234567890", ba_currency: "THB", ba_is_default: true, ba_status: "active" },
    });
    assert.equal(bank.status, 201, JSON.stringify(bank.body));
    bankAccountId = bank.body.ba_id;
});

test.after(async () => {
    await api?.stop();
});

test("รับงานพร้อมทีมและส่วนแบ่ง: ผู้รับเป็นสมาชิก · ไม่มีสิทธิ์ส่วนแบ่ง = 403 · % เกิน 100 = 400 · งานถัดไปเติมจากงานล่าสุด (ข้ามคนที่ปิดใช้งาน)", async () => {
    const shares = [
        { recipient_type: "user", recipient_id: people.dev.userId, kind: "percent", percent: "40", note: "ทำเว็บ" },
        { recipient_type: "user", recipient_id: people.left.userId, kind: "fixed", amount: "500" },
    ];
    const noRight = expectStatus(await as(people.sales, "POST", "/V1/fastwork/projects", jobBody("noright", { shares })), 403);
    assert.match(noRight.message, /ส่วนแบ่ง/);
    const tooMuch = expectStatus(
        await as(people.owner, "POST", "/V1/fastwork/projects", jobBody("toomuch", { shares: [{ ...shares[0], percent: "101" }] })),
        400,
    );
    assert.ok(Object.keys(tooMuch.fields).some((field) => field.startsWith("shares")));

    const job = expectStatus(await as(people.owner, "POST", "/V1/fastwork/projects", jobBody("withshares", { shares })), 201);
    assert.equal(job.share_count, 2);
    const [members] = await api.pool.query("SELECT user_id FROM tb_project_members WHERE project_id = ?", [job.project_id]);
    assert.ok([people.dev.userId, people.left.userId].every((userId) => members.some((row) => row.user_id === userId)));
    // คนขายที่ไม่มีสิทธิ์ส่วนแบ่ง รับงานได้ตามปกติเมื่อไม่ส่งส่วนแบ่ง
    expectStatus(await as(people.sales, "POST", "/V1/fastwork/projects", jobBody("salesjob")), 201);

    await api.pool.query("UPDATE tb_users SET user_status = 'inactive' WHERE user_id = ?", [people.left.userId]);
    const defaults = expectStatus(await as(people.owner, "GET", "/V1/fastwork/share-defaults"), 200);
    assert.equal(defaults.source.project_id, job.project_id);
    assert.deepEqual(
        defaults.shares.map((share) => [share.recipient_id, share.kind, share.percent]),
        [[people.dev.userId, "percent", "40.00"]],
    );
    assert.equal(defaults.skipped.length, 1);
    expectStatus(await as(people.sales, "GET", "/V1/fastwork/share-defaults"), 403);
});

test("ตัดงวด: ต้องมีเหตุผล · บันทึกเงินงวดที่ตัดไม่ได้ · งวดที่มีเงินตัดไม่ได้ · ยกเลิกการตัดได้ · ราคางานไม่นับงวดที่ตัด", async () => {
    const job = expectStatus(await as(people.owner, "POST", "/V1/fastwork/projects", jobBody("cutjob")), 201);
    const [first, second] = await milestonesOf(job.project_id);
    const cutUrl = (milestone) => `/V1/fastwork/projects/${job.project_id}/milestones/${milestone.fwm_id}/cut`;

    expectStatus(await as(people.owner, "POST", cutUrl(second), {}), 400);
    expectStatus(await as(people.owner, "POST", cutUrl(second), { reason: "ลูกค้ายกเลิกส่วนทำเว็บ" }), 200);
    const blockedPayout = expectStatus(await as(people.owner, "POST", "/V1/fastwork/payouts", receivedPayout(job.project_id, second.fwm_id, "5000")), 400);
    assert.match(blockedPayout.fields.fwp_milestone_id, /ตัดแล้ว/);
    // ผู้รับงาน (PM) กดส่งงานงวดที่ตัดแล้วไม่ได้
    const deliverCut = expectStatus(await as(people.owner, "POST", `/V1/fastwork/projects/${job.project_id}/milestones/${second.fwm_id}/delivered`, {}), 409);
    assert.equal(deliverCut.code, "MILESTONE_CUT");

    const detail = expectStatus(await as(people.owner, "GET", `/V1/fastwork/projects/${job.project_id}`), 200);
    assert.equal(detail.fastwork.milestones[1].state, "cut");
    assert.equal(detail.fastwork.milestones[1].fwm_cancel_reason, "ลูกค้ายกเลิกส่วนทำเว็บ");
    assert.equal(detail.fastwork.totals.contract, "3000.00");

    expectStatus(await as(people.owner, "POST", "/V1/fastwork/payouts", receivedPayout(job.project_id, first.fwm_id, "3000")), 201);
    const hasPayout = expectStatus(await as(people.owner, "POST", cutUrl(first), { reason: "ลอง" }), 409);
    assert.equal(hasPayout.code, "MILESTONE_HAS_PAYOUT");

    expectStatus(await as(people.owner, "POST", `/V1/fastwork/projects/${job.project_id}/milestones/${second.fwm_id}/restore`, {}), 200);
    assert.equal((await milestonesOf(job.project_id))[1].state, "open");
});

test("ปิดยอดได้เมื่อทุกงวดเงินเข้า (F-1) · ปิดยอด = ปิดงาน (F-3) · ยังค้างจ่ายอยู่ในหน้า Fastwork · ยกเลิกการปิดยอด = กลับมากำลังทำ", async () => {
    const shares = [{ recipient_type: "user", recipient_id: people.dev.userId, kind: "percent", percent: "50" }];
    const job = expectStatus(await as(people.owner, "POST", "/V1/fastwork/projects", jobBody("closejob", { shares })), 201);
    const projectId = job.project_id;
    const [first, second] = await milestonesOf(projectId);
    expectStatus(await as(people.owner, "POST", "/V1/fastwork/payouts", receivedPayout(projectId, first.fwm_id, "3000")), 201);

    const settleUrl = `/V1/profit-shares/projects/${projectId}/settle`;
    const notYet = expectStatus(await as(people.owner, "POST", settleUrl, { settled_date: today, expected_distributable: "2490.00" }), 409);
    assert.equal(notYet.code, "MILESTONES_NOT_RECEIVED");
    assert.match(notYet.message, /ทำเว็บ/);

    // ลูกค้าไม่จ่ายงวดที่สอง → ตัดงวด แล้วปิดงานได้
    expectStatus(await as(people.owner, "POST", `/V1/fastwork/projects/${projectId}/milestones/${second.fwm_id}/cut`, { reason: "ลูกค้าขอจบแค่ออกแบบ" }), 200);
    const settled = expectStatus(await as(people.owner, "POST", settleUrl, { settled_date: today, expected_distributable: "2490.00" }), 201);
    assert.equal(settled.project_completed, true);
    const [[project]] = await api.pool.query("SELECT project_status FROM tb_projects WHERE project_id = ?", [projectId]);
    assert.equal(project.project_status, "completed");

    const { overview, row } = await overviewRow(people.owner, projectId);
    assert.equal(row.next_step, "pay", "ปิดงานแล้วยังค้างจ่าย = อยู่ในหน้า Fastwork");
    assert.deepEqual([row.milestone_count, row.delivered_count, row.received_count], [1, 1, 1]);
    assert.ok(overview.todo.items.some((item) => item.project_id === projectId && item.key === "shares_pay"));

    const detail = expectStatus(await as(people.owner, "GET", `/V1/profit-shares/projects/${projectId}`), 200);
    expectStatus(
        await as(people.owner, "POST", `/V1/profit-shares/settlements/${detail.settlement.sst_id}/cancel`, {
            reason: "ลืมค่าใช้จ่าย",
            sst_version: detail.settlement.sst_version,
        }),
        200,
    );
    const [[reopened]] = await api.pool.query("SELECT project_status FROM tb_projects WHERE project_id = ?", [projectId]);
    assert.equal(reopened.project_status, "in_progress");
    assert.equal((await overviewRow(people.owner, projectId)).row.next_step, "close");
});

test("ขั้นถัดไปดูงวดก่อน (F-4): ข้อมูลเก่าที่ปิดยอดก่อนเงินเข้า ไม่ขึ้นว่าจ่ายครบ · ต่อไปต้องทำเตือนตั้งส่วนแบ่ง ไม่มีปุ่มปิดโปรเจกต์แยก", async () => {
    const job = expectStatus(await as(people.owner, "POST", "/V1/fastwork/projects", jobBody("legacy")), 201);
    // จำลองข้อมูลก่อน F-1: ปิดยอดไว้ทั้งที่ยังไม่มีเงินเข้า
    await api.pool.query(
        `INSERT INTO tb_share_settlements (sst_project_id, sst_settled_date, sst_revenue, sst_platform_fee, sst_expense_cost, sst_distributable,
                                           sst_fixed_total, sst_after_fixed, sst_company_amount, sst_created_by)
         VALUES (?, ?, 0, 0, 0, 0, 0, 0, 0, ?)`,
        [job.project_id, today, people.owner.userId],
    );
    assert.equal((await overviewRow(people.owner, job.project_id)).row.next_step, "work");

    const fresh = expectStatus(await as(people.owner, "POST", "/V1/fastwork/projects", jobBody("noshares")), 201);
    const steps = expectStatus(await as(people.owner, "GET", `/V1/projects/${fresh.project_id}/next-steps`), 200);
    const keys = steps.items.map((entry) => entry.key);
    assert.ok(keys.includes("shares_unset"), JSON.stringify(keys));
    assert.ok(!keys.includes("ready_to_complete"));
});
