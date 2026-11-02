// สิทธิ์อ่านรายชื่อลูกค้าและกลุ่มสิทธิ์ (2026-11-02 · docs/plans/2026-11-02-client-role-read-permission.md)
// เดิมแค่ login ก็อ่านได้ · ตอนนี้ลูกค้า = ผู้มีสิทธิ์งานขาย · กลุ่มสิทธิ์ = ผู้จัดการสิทธิ์/ผู้ใช้
const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { startTestServer } = require("./support/test-server");
const { PERMISSION_KEYS } = require("../src/shared/permissions.mjs");

const PASSWORD = "Staff@2026";
let api;
let clientId;
let roleId;
const people = {};

async function createPerson(name, permissionKeys, userNumber) {
    const bits = PERMISSION_KEYS.map((key) => (permissionKeys.includes(key) ? "1" : "0")).join("");
    const role = await api.callApi("POST", "/V1/roles", { body: { role_name: `role-${name}`, role_permission: bits } });
    assert.equal(role.status, 201, JSON.stringify(role.body));
    const userId = `USE20991102000${userNumber}`;
    await api.pool.query(
        `INSERT INTO tb_users (user_id, user_username, user_email, user_password, user_fname, user_lname, user_role_id, user_must_change_password)
         VALUES (?, ?, ?, ?, ?, 'ทดสอบ', ?, 0)`,
        [userId, name, `${name}@example.com`, await bcrypt.hash(PASSWORD, 10), name, role.body.role_id],
    );
    return { token: await api.login(name, PASSWORD), roleId: role.body.role_id };
}

const as = (person, method, url) => api.callApi(method, url, { token: person.token });

test.before(async () => {
    api = await startTestServer("client_role_read");
    await api.loginAsAdmin();
    clientId = (await api.callApi("POST", "/V1/clients", { body: { client_name: "ร้านลับ", client_phone: "0812345678" } })).body.client_id;
    people.staff = await createPerson("read.staff", ["dashboard", "viewOwnProjects"], 601);
    people.sales = await createPerson("read.sales", ["dashboard", "viewQuotations"], 602);
    people.userAdmin = await createPerson("read.useradmin", ["dashboard", "createUsers"], 603);
    roleId = people.staff.roleId;
});

test.after(async () => {
    await api?.stop();
});

test("พนักงานทั่วไป: อ่านลูกค้าและกลุ่มสิทธิ์ไม่ได้ (รายการและรายตัว)", async () => {
    for (const url of ["/V1/clients", `/V1/clients/${clientId}`, "/V1/roles", `/V1/roles/${roleId}`]) {
        assert.equal((await as(people.staff, "GET", url)).status, 403, url);
    }
});

test("ผู้ดูใบเสนอราคา: อ่านลูกค้าได้ (ช่องเลือก/หน้าพิมพ์) แต่อ่านกลุ่มสิทธิ์ไม่ได้", async () => {
    assert.equal((await as(people.sales, "GET", "/V1/clients")).status, 200);
    assert.equal((await as(people.sales, "GET", `/V1/clients/${clientId}`)).status, 200);
    assert.equal((await as(people.sales, "GET", "/V1/roles")).status, 403);
});

test("ผู้สร้างผู้ใช้: อ่านกลุ่มสิทธิ์ได้ (เลือกสิทธิ์ให้ผู้ใช้) แต่อ่านลูกค้าไม่ได้", async () => {
    assert.equal((await as(people.userAdmin, "GET", "/V1/roles")).status, 200);
    assert.equal((await as(people.userAdmin, "GET", `/V1/roles/${roleId}`)).status, 200);
    assert.equal((await as(people.userAdmin, "GET", "/V1/clients")).status, 403);
});
