// เทสต์ระดับ API ของรอบ 0R (docs/plans/2026-10-12-risk-fixes.md กลุ่ม ก)
// ยิงผ่านเซิร์ฟเวอร์จริงบนฐานข้อมูลชั่วคราวที่สร้างจาก deploy_schema.sql แล้วลบทิ้งตอนจบ — ไม่แตะฐานข้อมูลที่ใช้งานอยู่
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });

const TEMP_DATABASE = `tmp_test_risk_fixes_${process.pid}`;
const DEPLOY_SCHEMA_PATH = path.join(__dirname, "..", "..", "database", "query", "deploy_schema.sql");
const SEED_ADMIN = { userId: "USE202601010000001", login: "admin", password: "Admin@12345" };
const SEED_ADMIN_ROLE_ID = "ROL202601010000001";

// ต้องตั้งก่อนโหลด app เพราะ config/db อ่านชื่อฐานข้อมูลตอนโหลดไฟล์
process.env.DB_NAME = TEMP_DATABASE;
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-that-is-long-enough-for-jwt-signing";

let setupConnection;
let server;
let baseUrl;
let adminToken;
let app;
let pool;

async function callApi(method, url, { body, token = adminToken } = {}) {
    const response = await fetch(`${baseUrl}/api/V1${url}`, {
        method,
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function createRole(name, permission) {
    const response = await callApi("POST", "/roles", { body: { role_name: name, role_permission: permission } });
    assert.equal(response.status, 201, JSON.stringify(response.body));
    return response.body.role_id;
}

async function createUser(firstName, roleId = SEED_ADMIN_ROLE_ID) {
    const response = await callApi("POST", "/users", {
        body: { user_fname: firstName, user_lname: "ทดสอบ", user_role_id: roleId },
    });
    assert.equal(response.status, 201, JSON.stringify(response.body));
    return response.body.user_id;
}

test.before(async () => {
    setupConnection = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        multipleStatements: true,
    });
    await setupConnection.query(
        `CREATE DATABASE \`${TEMP_DATABASE}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await setupConnection.query(`USE \`${TEMP_DATABASE}\``);
    await setupConnection.query(fs.readFileSync(DEPLOY_SCHEMA_PATH, "utf8"));

    app = require("../src/app");
    pool = require("../src/config/db");
    await new Promise((resolve) => {
        server = app.listen(0, resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    adminToken = await login(SEED_ADMIN.login, SEED_ADMIN.password);

    // seed admin ถูกบังคับเปลี่ยนรหัสผ่านตอนเข้าครั้งแรก (R23) — ทำให้ครบก่อน เทสต์อื่นจะได้ใช้ API ได้
    const changePassword = await callApi("PUT", "/users/me/password", { body: { new_password: "NewAdmin@2026" } });
    assert.equal(changePassword.status, 200, JSON.stringify(changePassword.body));
});

async function login(loginName, password) {
    const response = await callApi("POST", "/auth/login", {
        token: null,
        body: { login: loginName, user_password: password },
    });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    return response.body.token;
}

test.after(async () => {
    await new Promise((resolve) => server?.close(resolve));
    await pool?.end();
    await setupConnection?.query(`DROP DATABASE IF EXISTS \`${TEMP_DATABASE}\``);
    await setupConnection?.end();
});

// ── R1: สิทธิ์ใหม่หายเงียบๆ ────────────────────────────────────────────────────
test("หน้าแก้ role ได้สตริงสิทธิ์ยาวเท่าจำนวนบิตของ backend พร้อม total_bits ไว้เทียบ", async () => {
    const response = await callApi("GET", `/roles/${SEED_ADMIN_ROLE_ID}`);
    assert.equal(response.status, 200);
    assert.equal(typeof response.body.total_bits, "number");
    assert.equal(response.body.role_permission.length, response.body.total_bits);
});

test("บันทึก role ด้วยสตริงสิทธิ์ที่สั้นกว่า (หน้าเว็บเวอร์ชันเก่า) ถูกปฏิเสธ และสิทธิ์เดิมไม่เปลี่ยน", async () => {
    const { body: adminRole } = await callApi("GET", `/roles/${SEED_ADMIN_ROLE_ID}`);
    const fullPermission = "1".repeat(adminRole.total_bits);
    const roleId = await createRole("ทดสอบหน้าเว็บเก่า", fullPermission);

    const outdatedPermission = "1".repeat(adminRole.total_bits - 1);
    const update = await callApi("PUT", `/roles/${roleId}`, {
        body: { role_name: "ทดสอบหน้าเว็บเก่า", role_permission: outdatedPermission },
    });
    assert.equal(update.status, 400);
    assert.equal(update.body.code, "PERMISSION_LAYOUT_OUTDATED");

    const afterUpdate = await callApi("GET", `/roles/${roleId}`);
    assert.equal(afterUpdate.body.role_permission, fullPermission);
});

test("สร้าง role โดยแอบส่ง role_type เป็น system มา ระบบยังสร้างเป็น role ปกติ และผู้สร้างคือคนที่ login", async () => {
    const { body: adminRole } = await callApi("GET", `/roles/${SEED_ADMIN_ROLE_ID}`);
    const response = await callApi("POST", "/roles", {
        body: {
            role_name: "แอบเป็น system role",
            role_permission: "0".repeat(adminRole.total_bits),
            role_type: "S",
            role_granted_by_id: "USE209901010000001",
        },
    });
    assert.equal(response.status, 201);

    const [[role]] = await pool.query("SELECT role_type, role_granted_by_id FROM tb_roles WHERE role_id = ?", [response.body.role_id]);
    assert.equal(role.role_type, "R");
    assert.equal(role.role_granted_by_id, SEED_ADMIN.userId);
});

// ── R20/R6: ลบ role ที่ยังมีคนใช้ ───────────────────────────────────────────────
test("ลบ role ที่ยังมีผู้ใช้อยู่ไม่ได้ และบอกจำนวนผู้ใช้", async () => {
    const { body: adminRole } = await callApi("GET", `/roles/${SEED_ADMIN_ROLE_ID}`);
    const roleId = await createRole("ทดสอบมีคนใช้", "0".repeat(adminRole.total_bits));
    await createUser("ผู้ใช้ของroleนี้", roleId);

    const response = await callApi("DELETE", `/roles/${roleId}`);
    assert.equal(response.status, 409);
    assert.equal(response.body.code, "ROLE_IN_USE");
    assert.match(response.body.message, /ผู้ใช้ 1 คน/);
});

test("ลบ role ที่ไม่มีคนใช้ได้", async () => {
    const { body: adminRole } = await callApi("GET", `/roles/${SEED_ADMIN_ROLE_ID}`);
    const roleId = await createRole("ทดสอบไม่มีคนใช้", "0".repeat(adminRole.total_bits));

    const response = await callApi("DELETE", `/roles/${roleId}`);
    assert.equal(response.status, 204);
});

// ── R20/R7: ลบผู้ใช้ ─────────────────────────────────────────────────────────
test("ลบบัญชีของตัวเองไม่ได้", async () => {
    const response = await callApi("DELETE", `/users/${SEED_ADMIN.userId}`);
    assert.equal(response.status, 409);
    assert.equal(response.body.code, "CANNOT_DELETE_SELF");
});

test("ลบผู้ใช้ที่เป็นสมาชิกโปรเจกต์ไม่ได้ บอกเหตุผลและแนะนำให้ยกเลิกใช้งานแทน", async () => {
    const userId = await createUser("สมาชิกโปรเจกต์");
    const project = await callApi("POST", "/projects", { body: { project_name: "โปรเจกต์ทดสอบลบผู้ใช้" } });
    assert.equal(project.status, 201, JSON.stringify(project.body));
    const member = await callApi("POST", `/projects/${project.body.project_id}/members`, {
        body: { user_id: userId, position_ids: [] },
    });
    assert.equal(member.status, 201, JSON.stringify(member.body));

    const response = await callApi("DELETE", `/users/${userId}`);
    assert.equal(response.status, 409);
    assert.equal(response.body.code, "USER_HAS_HISTORY");
    assert.match(response.body.message, /เป็นสมาชิก 1 โปรเจกต์/);
    assert.match(response.body.message, /ยกเลิกใช้งาน/);
});

test("ลบผู้ใช้ที่ยังไม่เคยใช้งานได้", async () => {
    const userId = await createUser("สร้างผิด");

    const response = await callApi("DELETE", `/users/${userId}`);
    assert.equal(response.status, 204);

    const afterDelete = await callApi("GET", `/users/${userId}`);
    assert.equal(afterDelete.status, 404);
});

test("ลบผู้ใช้ที่ไม่มีอยู่ได้ 404", async () => {
    const response = await callApi("DELETE", "/users/USE209901010000001");
    assert.equal(response.status, 404);
});

// ── R23: บังคับขั้นตอนเข้าระบบครั้งแรกที่ backend ──────────────────────────────
test("ผู้ใช้ที่ยังไม่ได้เปลี่ยนรหัสผ่านชั่วคราว เรียก API อื่นไม่ได้ แต่ใช้ endpoint ของขั้นตอนเข้าระบบครั้งแรกได้", async () => {
    const created = await callApi("POST", "/users", {
        body: { user_fname: "พนักงานใหม่", user_lname: "ทดสอบ", user_username: "new.staff", user_role_id: SEED_ADMIN_ROLE_ID },
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const token = await login("new.staff", created.body.temp_password);

    const blocked = await callApi("GET", "/projects", { token });
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.code, "ONBOARDING_REQUIRED");

    const profile = await callApi("GET", "/users/me", { token });
    assert.equal(profile.status, 200);

    const changePassword = await callApi("PUT", "/users/me/password", { token, body: { new_password: "Staff@2026new" } });
    assert.equal(changePassword.status, 200);

    // เปลี่ยนรหัสผ่านแล้วแต่ยังไม่มีอีเมล — ยังต้องยืนยันอีเมลก่อน
    const stillBlocked = await callApi("GET", "/projects", { token });
    assert.equal(stillBlocked.status, 403);

    // จำลองการยืนยันอีเมลด้วย OTP สำเร็จ (ส่งอีเมลจริงในเทสต์ไม่ได้)
    await pool.query("UPDATE tb_users SET user_email = ? WHERE user_id = ?", ["new.staff@example.com", created.body.user_id]);
    const allowed = await callApi("GET", "/projects", { token });
    assert.equal(allowed.status, 200);
});

// ── R24: role ระบบได้สิทธิ์ครบเสมอ ─────────────────────────────────────────────
test("role ระบบยังได้สิทธิ์ครบทุกข้อ แม้สิทธิ์ที่เก็บในฐานข้อมูลถูกล้างเป็น 0 ทั้งหมด", async () => {
    await pool.query("UPDATE tb_roles SET role_permission = REPEAT('0', ?) WHERE role_id = ?", [PERMISSION_KEYS.length, SEED_ADMIN_ROLE_ID]);

    const usersPage = await callApi("GET", "/users");
    assert.equal(usersPage.status, 200);

    const permission = await callApi("GET", "/auth/verifyPermission");
    assert.match(permission.body.role_permission, /^1+$/);
});

test("แก้ role ระบบ: เปลี่ยนชื่อได้ แต่สิทธิ์ยังครบทุกข้อเหมือนเดิม", async () => {
    const { body: before } = await callApi("GET", `/roles/${SEED_ADMIN_ROLE_ID}`);
    assert.equal(before.is_system_role, true);

    const update = await callApi("PUT", `/roles/${SEED_ADMIN_ROLE_ID}`, {
        body: { role_name: "ผู้ดูแลระบบสูงสุด", role_permission: "0".repeat(before.total_bits) },
    });
    assert.equal(update.status, 200, JSON.stringify(update.body));

    const { body: after } = await callApi("GET", `/roles/${SEED_ADMIN_ROLE_ID}`);
    assert.equal(after.role_name, "ผู้ดูแลระบบสูงสุด");
    assert.equal(after.role_permission, "1".repeat(before.total_bits));

    const [[stored]] = await pool.query("SELECT role_permission FROM tb_roles WHERE role_id = ?", [SEED_ADMIN_ROLE_ID]);
    assert.equal(stored.role_permission, "1".repeat(before.total_bits));
});

// ── R25: ยกระดับสิทธิ์ตัวเองผ่าน role ไม่ได้ ──────────────────────────────────────
// ตัวละคร: "หัวหน้าฝ่ายบุคคล" จัดการผู้ใช้และ role ได้ แต่ไม่ใช่แอดมิน และไม่มีสิทธิ์ดูโปรเจกต์ทั้งหมด
const { PERMISSION_KEYS } = require("../src/utils/permissions");

function permissionWith(keys) {
    return PERMISSION_KEYS.map((key) => (keys.includes(key) ? "1" : "0")).join("");
}

const HR_KEYS = [
    "dashboard", "usersManagement", "createUsers", "editUsers", "deleteUsers",
    "roleManagement", "createRole", "editRole", "deleteRole",
];

async function createReadyUser(username, roleId) {
    const created = await callApi("POST", "/users", {
        body: { user_fname: username, user_lname: "ทดสอบ", user_username: username, user_role_id: roleId },
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    // ข้ามขั้นตอนเข้าระบบครั้งแรก (ทดสอบแยกไว้แล้วที่ R23)
    await pool.query(
        "UPDATE tb_users SET user_must_change_password = FALSE, user_email = ? WHERE user_id = ?",
        [`${username}@example.com`, created.body.user_id]
    );
    const token = await login(username, created.body.temp_password);
    return { userId: created.body.user_id, token };
}

let hr;
let hrRoleId;
let staffRoleId;

test("เตรียมผู้ใช้หัวหน้าฝ่ายบุคคล (จัดการผู้ใช้และ role ได้ แต่ไม่ใช่แอดมิน)", async () => {
    hrRoleId = await createRole("หัวหน้าฝ่ายบุคคล", permissionWith(HR_KEYS));
    staffRoleId = await createRole("พนักงานทั่วไป", permissionWith(["dashboard"]));
    hr = await createReadyUser("hr.head", hrRoleId);
});

test("เปลี่ยน role ของตัวเองเป็น role ระบบไม่ได้", async () => {
    const response = await callApi("PUT", `/users/${hr.userId}`, {
        token: hr.token,
        body: { user_fname: "hr.head", user_lname: "ทดสอบ", user_role_id: SEED_ADMIN_ROLE_ID },
    });
    assert.equal(response.status, 403);
    assert.equal(response.body.code, "CANNOT_CHANGE_OWN_ACCESS");
});

test("รีเซ็ตรหัสผ่านของแอดมินไม่ได้ (ไม่งั้นได้รหัสชั่วคราวไปเข้าระบบแทนแอดมิน)", async () => {
    const response = await callApi("PUT", `/users/${SEED_ADMIN.userId}/reset-password`, { token: hr.token });
    assert.equal(response.status, 403);
    assert.equal(response.body.code, "USER_ABOVE_YOUR_PERMISSION");
});

test("มอบ role ระบบให้ผู้ใช้คนอื่นไม่ได้", async () => {
    const response = await callApi("POST", "/users", {
        token: hr.token,
        body: { user_fname: "แอบเป็นแอดมิน", user_lname: "ทดสอบ", user_role_id: SEED_ADMIN_ROLE_ID },
    });
    assert.equal(response.status, 403);
    assert.equal(response.body.code, "ASSIGN_ROLE_ABOVE_YOURS");
});

test("สร้าง role ที่มีสิทธิ์เกินตัวเองไม่ได้ แต่สร้าง role ที่ไม่เกินตัวเองได้", async () => {
    const tooPowerful = await callApi("POST", "/roles", {
        token: hr.token,
        body: { role_name: "เกินตัว", role_permission: permissionWith([...HR_KEYS, "viewAllProjects"]) },
    });
    assert.equal(tooPowerful.status, 403);
    assert.equal(tooPowerful.body.code, "PERMISSION_ABOVE_YOURS");

    const withinLimit = await callApi("POST", "/roles", {
        token: hr.token,
        body: { role_name: "ผู้ช่วยฝ่ายบุคคล", role_permission: permissionWith(["dashboard", "usersManagement"]) },
    });
    assert.equal(withinLimit.status, 201);
});

test("แก้ไข role ระบบไม่ได้", async () => {
    const response = await callApi("PUT", `/roles/${SEED_ADMIN_ROLE_ID}`, {
        token: hr.token,
        body: { role_name: "เปลี่ยนชื่อแอดมิน", role_permission: permissionWith(HR_KEYS) },
    });
    assert.equal(response.status, 403);
    assert.equal(response.body.code, "ROLE_ABOVE_YOUR_PERMISSION");
});

test("หน้าเว็บได้ธงบอกว่าจัดการอะไรได้บ้าง: role ระบบมอบไม่ได้ แอดมินจัดการไม่ได้ แต่ role ระดับล่างมอบได้", async () => {
    const roles = await callApi("GET", "/roles?limit=50", { token: hr.token });
    const adminRole = roles.body.data.find((role) => role.role_id === SEED_ADMIN_ROLE_ID);
    const staffRole = roles.body.data.find((role) => role.role_id === staffRoleId);
    assert.equal(adminRole.can_assign, false);
    assert.equal(staffRole.can_assign, true);
    assert.equal(adminRole.role_permission, undefined, "ห้ามส่งสตริงสิทธิ์ดิบในรายการ");

    const adminUser = await callApi("GET", `/users/${SEED_ADMIN.userId}`, { token: hr.token });
    assert.equal(adminUser.body.can_manage, false);
});

test("จัดการผู้ใช้ที่สิทธิ์ต่ำกว่าได้ตามปกติ (สร้าง + รีเซ็ตรหัสผ่าน)", async () => {
    const created = await callApi("POST", "/users", {
        token: hr.token,
        body: { user_fname: "พนักงานใหม่ของ HR", user_lname: "ทดสอบ", user_role_id: staffRoleId },
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));

    const reset = await callApi("PUT", `/users/${created.body.user_id}/reset-password`, { token: hr.token });
    assert.equal(reset.status, 200);
});

test("แอดมินแก้ชื่อตัวเองได้ แต่ปิดใช้งานบัญชีตัวเองไม่ได้", async () => {
    const { body: me } = await callApi("GET", `/users/${SEED_ADMIN.userId}`);
    const baseBody = {
        user_fname: "System", user_lname: "Admin ใหม่", user_username: me.user_username,
        user_email: me.user_email, user_role_id: me.user_role_id,
    };

    const rename = await callApi("PUT", `/users/${SEED_ADMIN.userId}`, { body: { ...baseBody, user_status: "active" } });
    assert.equal(rename.status, 200, JSON.stringify(rename.body));

    const deactivate = await callApi("PUT", `/users/${SEED_ADMIN.userId}`, { body: { ...baseBody, user_status: "inactive" } });
    assert.equal(deactivate.status, 403);
    assert.equal(deactivate.body.code, "CANNOT_CHANGE_OWN_ACCESS");
});

// ── R16: ลืมรัน deploy_schema.sql ─────────────────────────────────────────────
// ต้องเป็นเทสต์สุดท้ายของไฟล์ เพราะลบตารางในฐานข้อมูลชั่วคราวทิ้ง
test("ฐานข้อมูลขาดตารางที่โค้ดต้องใช้: ตรวจตอนเริ่มเจอ และ endpoint ตอบ 503 บอกให้รัน deploy_schema.sql", async () => {
    const { checkDatabaseSchema } = require("../src/utils/schema-check");
    await setupConnection.query("SET FOREIGN_KEY_CHECKS = 0; DROP TABLE tb_department; SET FOREIGN_KEY_CHECKS = 1;");

    const originalConsoleError = console.error;
    console.error = () => {};
    try {
        const status = await checkDatabaseSchema();
        assert.equal(status.isOutdated, true);
        assert.ok(status.missing.includes("tb_department.dep_name"));

        const response = await callApi("GET", "/departments");
        assert.equal(response.status, 503);
        assert.equal(response.body.code, "DATABASE_OUTDATED");
        assert.match(response.body.message, /deploy_schema\.sql/);
    } finally {
        console.error = originalConsoleError;
    }
});
