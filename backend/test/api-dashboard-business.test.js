// ภาพรวมธุรกิจบนแดชบอร์ด (2026-10-31): ส่วนตามสิทธิ์ · ตัวเลขตรงกับหน้าต้นทาง · กราฟเงินเข้า 6 เดือน
const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { startTestServer } = require("./support/test-server");
const { PERMISSION_KEYS } = require("../src/shared/permissions.mjs");
const { todayBangkok } = require("../src/utils/bangkok-time");

const PASSWORD = "Staff@2026";
let api;
let staffToken;

function expectStatus(response, status) {
    assert.equal(response.status, status, JSON.stringify(response.body));
    return response.body;
}

test.before(async () => {
    api = await startTestServer("dashboard_business");
    await api.loginAsAdmin();
    // พนักงานที่มีแค่สิทธิ์เข้าแดชบอร์ด (ไม่มีสิทธิ์เรื่องเงิน/ลูกค้า)
    const bits = PERMISSION_KEYS.map((key) => (key === "dashboard" ? "1" : "0")).join("");
    const role = expectStatus(await api.callApi("POST", "/V1/roles", { body: { role_name: "role-dashboard-only", role_permission: bits } }), 201);
    await api.pool.query(
        `INSERT INTO tb_users (user_id, user_username, user_email, user_password, user_fname, user_lname, user_role_id, user_must_change_password)
         VALUES ('USE209901310000001', 'db.staff', 'db.staff@example.com', ?, 'db', 'staff', ?, 0)`,
        [await bcrypt.hash(PASSWORD, 10), role.role_id],
    );
    staffToken = await api.login("db.staff", PASSWORD);
});

test.after(async () => {
    await api?.stop();
});

test("ผู้ดูแลเห็นทุกส่วน · ตัวเลขตรงกับหน้าต้นทาง · กราฟเงินเข้า 6 เดือนจบที่เดือนนี้", async () => {
    const business = expectStatus(await api.callApi("GET", "/V1/dashboard/business"), 200);
    for (const section of ["requests", "quotations", "receivables", "fastwork", "cash", "capital"]) {
        assert.ok(section in business, `มีส่วน ${section}`);
    }

    const fastwork = expectStatus(await api.callApi("GET", "/V1/fastwork/overview"), 200);
    assert.deepEqual(business.fastwork.steps, fastwork.steps, "ขั้น Fastwork ตรงกับหน้า Fastwork");
    assert.equal(business.fastwork.project_count, fastwork.projects.length);
    assert.ok(business.fastwork.projects.length <= 5);

    const aging = expectStatus(await api.callApi("GET", "/V1/receivables/aging"), 200);
    assert.equal(business.receivables.outstanding, aging.totals.total, "ลูกหนี้คงค้างตรงกับหน้าลูกหนี้");

    const capital = expectStatus(await api.callApi("GET", "/V1/capital"), 200);
    assert.equal(business.capital.balance, capital.totals.balance, "เงินทุนตรงกับหน้าเงินทุน");

    assert.equal(business.cash.months.length, 6);
    assert.equal(business.cash.months.at(-1).month, todayBangkok().slice(0, 7), "เดือนสุดท้าย = เดือนนี้ (เวลาไทย)");
    for (const month of business.cash.months) {
        assert.match(month.month, /^\d{4}-\d{2}$/);
        assert.equal(Number(month.total), Number(month.direct) + Number(month.fastwork));
    }
});

test("พนักงานที่มีแค่สิทธิ์แดชบอร์ด: ไม่มีส่วนเงินและลูกค้าเลย (ไม่ส่งมาแล้วซ่อน)", async () => {
    const business = expectStatus(await api.callApi("GET", "/V1/dashboard/business", { token: staffToken }), 200);
    assert.deepEqual(Object.keys(business), ["today"]);
});

test("ใบเสนอราคาที่ส่งแล้ว: ใกล้หมดอายุนับแยก · เลยวันยืนราคาไม่นับว่ารอตอบ", async () => {
    const client = expectStatus(await api.callApi("POST", "/V1/clients", { body: { client_name: "ลูกค้าแดชบอร์ด", client_phone: "0810000000" } }), 201);
    const [[branch]] = await api.pool.query("SELECT branch_id FROM tb_branches WHERE branch_code = '00000'");
    const created = expectStatus(
        await api.callApi("POST", "/V1/quotations", {
            body: {
                qt_client_id: client.client_id,
                qt_branch_id: branch.branch_id,
                qt_title: "เว็บไซต์ร้าน",
                qt_currency: "THB",
                qt_valid_days: 30,
                items: [{ qti_type: "item", qti_description: "เว็บไซต์", qti_quantity: "1", qti_unit: "งาน", qti_unit_price: "10000" }],
            },
        }),
        201,
    );
    const before = expectStatus(await api.callApi("GET", "/V1/dashboard/business"), 200).quotations;
    // ส่งแล้ว ยืนราคาอีก 3 วัน = รอตอบ + ใกล้หมดอายุ
    await api.pool.query("UPDATE tb_quotations SET qt_status = 'sent', qt_valid_until = DATE_ADD(?, INTERVAL 3 DAY) WHERE qt_id = ?", [todayBangkok(), created.qt_id]);
    const soon = expectStatus(await api.callApi("GET", "/V1/dashboard/business"), 200).quotations;
    assert.equal(soon.waiting, before.waiting + 1);
    assert.equal(soon.expiring_soon, before.expiring_soon + 1);
    // เลยวันยืนราคาแล้ว (เมื่อวาน) = ไม่นับ
    await api.pool.query("UPDATE tb_quotations SET qt_valid_until = DATE_SUB(?, INTERVAL 1 DAY) WHERE qt_id = ?", [todayBangkok(), created.qt_id]);
    const expired = expectStatus(await api.callApi("GET", "/V1/dashboard/business"), 200).quotations;
    assert.equal(expired.waiting, before.waiting);
    assert.equal(expired.expiring_soon, before.expiring_soon);
});
