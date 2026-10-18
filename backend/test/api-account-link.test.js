// บัญชีเข้าระบบ ↔ พนักงาน (2026-10-18 — docs/plans/2026-10-18-user-employee-link.md)
// ข้อ 1 ชื่อ เบอร์ สาขา: พนักงานปัจจุบันเป็นตัวจริง · ข้อ 2 ปิดการเข้าระบบหลังวันทำงานวันสุดท้าย (R1 กลับมาทำงาน · R2 token เดิม · R4 ผู้ดูแลคนสุดท้าย)
const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { startTestServer, SEED_ADMIN } = require("./support/test-server");
const { createTestDepartment, HEAD_OFFICE_ID } = require("./support/test-department");
const { todayBangkok } = require("../src/utils/bangkok-time");

const PASSWORD = "Staff@2026";
const STAFF_ID = "USE209901010000001";

let api;
let departmentId;
let staffToken;

function daysFromToday(dayCount) {
    const [year, month, day] = todayBangkok().split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day + dayCount)).toISOString().slice(0, 10);
}

function expectStatus(response, status) {
    assert.equal(response.status, status, JSON.stringify(response.body));
    return response.body;
}

function call(method, url, body) {
    return api.callApi(method, url, { body });
}

function asStaff(method, url, body) {
    return api.callApi(method, url, { token: staffToken, body });
}

async function createEmployee(overrides) {
    return expectStatus(
        await call("POST", "/V1/employees", {
            emp_first_name_th: "สมหญิง",
            emp_last_name_th: "ตามทะเบียน",
            emp_phone: "0899999999",
            emp_department_id: departmentId,
            emp_hire_date: "2026-01-05",
            ecm_base_salary: "25000",
            ...overrides,
        }),
        201,
    );
}

async function employeeBody(employeeId, overrides = {}) {
    const employee = expectStatus(await call("GET", `/V1/employees/${employeeId}`), 200);
    return {
        emp_title: employee.emp_title,
        emp_first_name_th: employee.emp_first_name_th,
        emp_last_name_th: employee.emp_last_name_th,
        emp_phone: employee.emp_phone,
        emp_user_id: employee.emp_user_id,
        emp_department_id: employee.emp_department_id,
        emp_hire_date: employee.emp_hire_date,
        emp_sso_enrolled: employee.emp_sso_enrolled,
        ...overrides,
    };
}

async function terminate(employeeId, lastDay, closeLogin) {
    return call("POST", `/V1/employees/${employeeId}/terminate`, {
        emp_termination_date: lastDay,
        emp_termination_reason: "ลาออก",
        emp_close_login_on_termination: closeLogin,
    });
}

test.before(async () => {
    api = await startTestServer("account_link");
    await api.loginAsAdmin();
    departmentId = await createTestDepartment(api, "LNK", "แผนกผูกบัญชี");
    await api.pool.query(
        `INSERT INTO tb_users (user_id, user_username, user_email, user_password, user_fname, user_lname, user_phone, user_must_change_password)
         VALUES (?, 'staff.link', 'staff.link@example.com', ?, 'ชื่อในบัญชี', 'ไม่ตรงทะเบียน', '0800000000', 0)`,
        [STAFF_ID, await bcrypt.hash(PASSWORD, 10)],
    );
    staffToken = await api.login("staff.link", PASSWORD);
});

test.after(async () => {
    await api?.stop();
});

test("ข้อ 1: ผูกบัญชีแล้ว ชื่อ เบอร์ สาขาตามพนักงาน · หน้าโปรไฟล์/หน้าผู้ใช้แก้ไม่ได้ · แก้ที่พนักงานแล้วบัญชีเปลี่ยนตาม · เลิกผูกแล้วแก้เองได้", async () => {
    const created = await createEmployee({ emp_user_id: STAFF_ID });
    let me = expectStatus(await asStaff("GET", "/V1/users/me"), 200);
    assert.equal(me.user_fname, "สมหญิง");
    assert.equal(me.user_lname, "ตามทะเบียน");
    assert.equal(me.user_phone, "0899999999");
    assert.equal(me.user_branch_id, HEAD_OFFICE_ID);
    assert.equal(me.linked_employee.emp_id, created.emp_id);
    assert.equal(me.user_email, "staff.link@example.com", "อีเมลบัญชีแยกจากพนักงาน (K1)");

    // โปรไฟล์ตัวเอง: ช่องที่พนักงานเป็นตัวจริงไม่รับค่า · LINE ยังแก้ได้
    expectStatus(
        await asStaff("PUT", "/V1/users/me", { user_fname: "แก้เอง", user_lname: "จากโปรไฟล์", user_phone: "0811111111", user_line_id: "line-me" }),
        200,
    );
    me = expectStatus(await asStaff("GET", "/V1/users/me"), 200);
    assert.deepEqual([me.user_fname, me.user_lname, me.user_phone, me.user_line_uid], ["สมหญิง", "ตามทะเบียน", "0899999999", "line-me"]);

    // แอดมินแก้ที่หน้าผู้ใช้: เหมือนกัน
    const user = expectStatus(await call("GET", `/V1/users/${STAFF_ID}`), 200);
    assert.equal(user.linked_employee.emp_code, created.emp_code);
    expectStatus(
        await call("PUT", `/V1/users/${STAFF_ID}`, {
            user_username: user.user_username,
            user_fname: "แอดมินแก้",
            user_lname: "ที่หน้าผู้ใช้",
            user_email: user.user_email,
            user_phone: "0822222222",
            user_role_id: user.user_role_id,
            user_status: "active",
            user_branch_id: user.user_branch_id,
        }),
        200,
    );
    me = expectStatus(await asStaff("GET", "/V1/users/me"), 200);
    assert.deepEqual([me.user_fname, me.user_phone], ["สมหญิง", "0899999999"]);

    // แก้ที่พนักงาน → บัญชีเปลี่ยนตาม
    expectStatus(
        await call("PUT", `/V1/employees/${created.emp_id}`, await employeeBody(created.emp_id, { emp_last_name_th: "เปลี่ยนนามสกุล", emp_phone: "0833333333" })),
        200,
    );
    me = expectStatus(await asStaff("GET", "/V1/users/me"), 200);
    assert.deepEqual([me.user_lname, me.user_phone], ["เปลี่ยนนามสกุล", "0833333333"]);

    // เลิกผูก → บัญชีคงค่าล่าสุด แล้วแก้เองได้
    expectStatus(await call("PUT", `/V1/employees/${created.emp_id}`, await employeeBody(created.emp_id, { emp_user_id: null })), 200);
    expectStatus(await asStaff("PUT", "/V1/users/me", { user_fname: "แก้เองได้แล้ว", user_lname: "หลังเลิกผูก", user_phone: "0844444444" }), 200);
    me = expectStatus(await asStaff("GET", "/V1/users/me"), 200);
    assert.equal(me.user_fname, "แก้เองได้แล้ว");
    assert.equal(me.linked_employee, null);

    // ผูกกลับ (คืนสภาพให้เทสต์ถัดไป)
    expectStatus(await call("PUT", `/V1/employees/${created.emp_id}`, await employeeBody(created.emp_id, { emp_user_id: STAFF_ID })), 200);
});

test("ข้อ 2: ปิดการเข้าระบบหลังวันสุดท้าย · วันสุดท้ายยังเข้าได้ · token เดิมใช้ไม่ได้ (R2) · เปิดต่อ/ยกเลิกพ้นสภาพ = เข้าได้อีก", async () => {
    const [[{ emp_id: employeeId }]] = await api.pool.query("SELECT emp_id FROM tb_employees WHERE emp_user_id = ?", [STAFF_ID]);

    // วันสุดท้าย = วันนี้ → ยังเข้าได้ทั้งวัน
    expectStatus(await terminate(employeeId, todayBangkok(), true), 200);
    expectStatus(await asStaff("GET", "/V1/users/me"), 200);
    let employee = expectStatus(await call("GET", `/V1/employees/${employeeId}`), 200);
    assert.deepEqual(employee.login_access, { state: "closes_after", last_day: todayBangkok() });

    // วันสุดท้าย = เมื่อวาน → token เดิมได้ 401 พร้อมเหตุผล · login ใหม่ไม่ได้
    expectStatus(await terminate(employeeId, daysFromToday(-1), true), 200);
    const blocked = await asStaff("GET", "/V1/users/me");
    assert.equal(blocked.status, 401);
    assert.equal(blocked.body.code, "ACCOUNT_CLOSED_TERMINATED");
    const login = await api.callApi("POST", "/V1/auth/login", { token: null, body: { login: "staff.link", user_password: PASSWORD } });
    assert.equal(login.status, 401);
    assert.equal(login.body.code, "ACCOUNT_CLOSED_TERMINATED");
    const wrongPassword = await api.callApi("POST", "/V1/auth/login", { token: null, body: { login: "staff.link", user_password: "wrong" } });
    assert.equal(wrongPassword.body.code, undefined, "รหัสผิด = ข้อความเดิม ไม่บอกว่าบัญชีถูกปิด");
    employee = expectStatus(await call("GET", `/V1/employees/${employeeId}`), 200);
    assert.equal(employee.login_access.state, "closed");
    const list = expectStatus(await call("GET", "/V1/users?search=staff.link"), 200);
    assert.equal(list.data[0].is_login_closed, true);
    assert.equal(list.data[0].linked_emp_code, null, "พ้นสภาพแล้ว ไม่ใช่พนักงานปัจจุบัน");

    // พ้นสภาพแล้ว: ชื่อในบัญชีกลับมาแก้ได้ (ไม่มีพนักงานปัจจุบัน) · แก้พนักงานที่พ้นสภาพไม่คัดลอกไปบัญชี
    const user = expectStatus(await call("GET", `/V1/users/${STAFF_ID}`), 200);
    assert.equal(user.linked_employee, null);
    assert.equal(user.login_closed_after, daysFromToday(-1));

    // เปิดให้เข้าต่อ → เข้าได้ · ปิดกลับ → เข้าไม่ได้
    expectStatus(await call("POST", `/V1/employees/${employeeId}/login-closure`, { emp_close_login_on_termination: false }), 200);
    expectStatus(await asStaff("GET", "/V1/users/me"), 200);
    employee = expectStatus(await call("GET", `/V1/employees/${employeeId}`), 200);
    assert.equal(employee.login_access.state, "kept_open");
    expectStatus(await call("POST", `/V1/employees/${employeeId}/login-closure`, { emp_close_login_on_termination: true }), 200);
    assert.equal((await asStaff("GET", "/V1/users/me")).status, 401);

    // ยกเลิกพ้นสภาพ → เข้าได้อีก (token เดิมยังใช้ได้เพราะยังไม่หมดอายุ)
    expectStatus(await call("POST", `/V1/employees/${employeeId}/reinstate`, {}), 200);
    expectStatus(await asStaff("GET", "/V1/users/me"), 200);
});

test("R1: กลับมาทำงานใหม่ (พนักงานแถวใหม่ผูกบัญชีเดิม) → แถวเก่าที่ปิดไว้ไม่ปิดบัญชี · ชื่อตามแถวใหม่", async () => {
    const [[{ emp_id: oldEmployeeId }]] = await api.pool.query("SELECT emp_id FROM tb_employees WHERE emp_user_id = ?", [STAFF_ID]);
    expectStatus(await terminate(oldEmployeeId, daysFromToday(-1), true), 200);
    assert.equal((await asStaff("GET", "/V1/users/me")).status, 401);

    await createEmployee({ emp_user_id: STAFF_ID, emp_first_name_th: "กลับมา", emp_last_name_th: "ทำงานใหม่", emp_hire_date: todayBangkok() });
    const me = expectStatus(await asStaff("GET", "/V1/users/me"), 200);
    assert.deepEqual([me.user_fname, me.user_lname], ["กลับมา", "ทำงานใหม่"]);
});

test("R4: ผู้ดูแลระบบคนสุดท้ายปิดการเข้าระบบไม่ได้ · ไม่ติ๊กปิดตั้งพ้นสภาพได้", async () => {
    const admin = await createEmployee({ emp_user_id: SEED_ADMIN.userId, emp_first_name_th: "แอดมิน", emp_last_name_th: "คนเดียว" });
    const closing = await terminate(admin.emp_id, daysFromToday(10), true);
    assert.equal(closing.status, 409);
    assert.equal(closing.body.code, "LAST_ADMIN_ACCOUNT");
    expectStatus(await terminate(admin.emp_id, daysFromToday(10), false), 200);
    const toggled = await call("POST", `/V1/employees/${admin.emp_id}/login-closure`, { emp_close_login_on_termination: true });
    assert.equal(toggled.status, 409);
    expectStatus(await call("POST", `/V1/employees/${admin.emp_id}/reinstate`, {}), 200);
});
