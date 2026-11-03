// ตรวจสิทธิ์ทั้งระบบ A-1 ถึง A-6 (2026-11-02 · docs/plans/2026-11-02-permission-audit.md)
const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const sharp = require("sharp");
const { startTestServer, SEED_ADMIN } = require("./support/test-server");
const { createTestDepartment, HEAD_OFFICE_ID } = require("./support/test-department");
const { PERMISSION_KEYS } = require("../src/shared/permissions.mjs");
const { PROJECT_PERMISSION_KEYS } = require("../src/utils/projectPermissions");
const { signToken } = require("../src/utils/jwt");

const PASSWORD = "Staff@2026";
let api;
let departmentId;
let createdUserCount = 0;

async function createPerson(name, permissionKeys) {
    const bits = PERMISSION_KEYS.map((key) => (permissionKeys.includes(key) ? "1" : "0")).join("");
    const role = await api.callApi("POST", "/V1/roles", { body: { role_name: `role-${name}`, role_permission: bits } });
    assert.equal(role.status, 201, JSON.stringify(role.body));
    createdUserCount += 1;
    const userId = `USE20991103${String(createdUserCount).padStart(7, "0")}`;
    await api.pool.query(
        `INSERT INTO tb_users (user_id, user_username, user_email, user_password, user_fname, user_lname, user_role_id, user_must_change_password)
         VALUES (?, ?, ?, ?, ?, 'ทดสอบ', ?, 0)`,
        [userId, name, `${name}@example.com`, await bcrypt.hash(PASSWORD, 10), name, role.body.role_id],
    );
    return { userId, roleId: role.body.role_id, token: await api.login(name, PASSWORD) };
}

const as = (person, method, url, body) => api.callApi(method, url, { token: person.token, body });

function projectBits(keys) {
    return PROJECT_PERMISSION_KEYS.map((key) => (keys.includes(key) ? "1" : "0")).join("");
}

async function createPosition(name, keys) {
    const response = await api.callApi("POST", "/V1/project-positions", {
        body: { position_name: name, position_permission: projectBits(keys) },
    });
    assert.equal(response.status, 201, JSON.stringify(response.body));
    return response.body.position_id;
}

async function signatureForm(password) {
    const ink = await sharp({ create: { width: 200, height: 30, channels: 3, background: "#1e3a8a" } })
        .png()
        .toBuffer();
    const image = await sharp({ create: { width: 600, height: 200, channels: 4, background: "#ffffff" } })
        .composite([{ input: ink, top: 80, left: 200 }])
        .png()
        .toBuffer();
    const form = new FormData();
    form.append("signature", new Blob([image], { type: "image/png" }), "signature.png");
    form.append("method", "upload");
    form.append("password", password);
    return form;
}

function employeeBody(overrides = {}) {
    return {
        emp_first_name_th: "ทดสอบ",
        emp_last_name_th: "สิทธิ์",
        emp_department_id: departmentId,
        emp_hire_date: "2026-01-05",
        emp_sso_enrolled: false,
        ...overrides,
    };
}

test.before(async () => {
    api = await startTestServer("permission_audit");
    await api.loginAsAdmin();
    departmentId = await createTestDepartment(api, "AUD", "แผนกตรวจสิทธิ์");
});

test.after(async () => {
    await api?.stop();
});

// ─── A-1 token ─────────────────────────────────────────────────────────────────────────────────

test("A-1 เปลี่ยนรหัสผ่าน: ต้องใส่รหัสปัจจุบัน · เครื่องอื่นหลุด เครื่องนี้ได้ token ใหม่", async () => {
    const person = await createPerson("audit.password", ["dashboard"]);
    const otherDevice = await api.login("audit.password", PASSWORD);

    const noCurrent = await as(person, "PUT", "/V1/users/me/password", { new_password: "Changed@2026" });
    assert.equal(noCurrent.status, 400);
    assert.ok(noCurrent.body.fields.current_password);
    const wrongCurrent = await as(person, "PUT", "/V1/users/me/password", {
        new_password: "Changed@2026",
        current_password: "wrong-password",
    });
    assert.equal(wrongCurrent.status, 400);

    const changed = await as(person, "PUT", "/V1/users/me/password", {
        new_password: "Changed@2026",
        current_password: PASSWORD,
    });
    assert.equal(changed.status, 200, JSON.stringify(changed.body));
    assert.ok(changed.body.token);

    for (const oldToken of [person.token, otherDevice]) {
        const old = await api.callApi("GET", "/V1/users/me", { token: oldToken });
        assert.equal(old.status, 401);
        assert.equal(old.body.code, "SESSION_REVOKED");
    }
    assert.equal((await api.callApi("GET", "/V1/users/me", { token: changed.body.token })).status, 200);
});

test("A-1 token ที่ออกก่อนมีเลขรุ่น (ก่อน deploy) ยังใช้ได้ ไม่หลุดตอน deploy", async () => {
    const person = await createPerson("audit.legacy", ["dashboard"]);
    const legacyToken = signToken({ user_id: person.userId, user_role_id: person.roleId });
    assert.equal((await api.callApi("GET", "/V1/users/me", { token: legacyToken })).status, 200);
});

test("A-1 ออกจากระบบเครื่องอื่น · แอดมินรีเซ็ตรหัส/สั่งออกทุกเครื่อง = token เดิมใช้ไม่ได้", async () => {
    const person = await createPerson("audit.sessions", ["dashboard"]);
    const otherDevice = await api.login("audit.sessions", PASSWORD);

    const others = await as(person, "POST", "/V1/auth/logout-other-devices");
    assert.equal(others.status, 200);
    assert.equal((await api.callApi("GET", "/V1/users/me", { token: otherDevice })).status, 401);
    assert.equal((await api.callApi("GET", "/V1/users/me", { token: others.body.token })).status, 200);

    const everywhere = await api.callApi("POST", `/V1/users/${person.userId}/sign-out-everywhere`);
    assert.equal(everywhere.status, 200);
    assert.equal((await api.callApi("GET", "/V1/users/me", { token: others.body.token })).status, 401);

    const fresh = await api.login("audit.sessions", PASSWORD);
    const reset = await api.callApi("PUT", `/V1/users/${person.userId}/reset-password`);
    assert.equal(reset.status, 200);
    assert.equal((await api.callApi("GET", "/V1/users/me", { token: fresh })).status, 401);

    // ผู้ช่วยที่สิทธิ์ต่ำกว่า สั่งแอดมินออกจากระบบไม่ได้
    const helper = await createPerson("audit.helper", ["dashboard", "usersManagement", "editUsers"]);
    assert.equal((await as(helper, "POST", `/V1/users/${SEED_ADMIN.userId}/sign-out-everywhere`)).status, 403);
});

// ─── A-2 ตำแหน่งในโปรเจกต์ ─────────────────────────────────────────────────────────────────────

test("A-2 ผู้จัดการสมาชิกให้ตำแหน่งได้ไม่เกินตัวเอง · แก้ตำแหน่งตัวเองไม่ได้ · แอดมินทำได้", async () => {
    const fullPosition = await createPosition("ทุกสิทธิ์ (ตรวจ)", PROJECT_PERMISSION_KEYS);
    const managerPosition = await createPosition("ผู้จัดการสมาชิก (ตรวจ)", ["manageMembers", "editOwnTask"]);
    const devPosition = await createPosition("นักพัฒนา (ตรวจ)", ["editOwnTask"]);
    const manager = await createPerson("audit.pm", ["dashboard", "viewOwnProjects"]);
    const developer = await createPerson("audit.dev", ["dashboard", "viewOwnProjects"]);
    const lead = await createPerson("audit.lead", ["dashboard", "viewOwnProjects"]);

    const project = await api.callApi("POST", "/V1/projects", {
        body: {
            project_name: "ตรวจตำแหน่ง",
            project_type: "agile",
            project_start_date: "2026-01-01",
            project_due_date: "2026-12-31",
        },
    });
    assert.equal(project.status, 201, JSON.stringify(project.body));
    const membersUrl = `/V1/projects/${project.body.project_id}/members`;

    const managerMember = await api.callApi("POST", membersUrl, {
        body: { user_id: manager.userId, position_ids: [managerPosition] },
    });
    assert.equal(managerMember.status, 201);
    const leadMember = await api.callApi("POST", membersUrl, {
        body: { user_id: lead.userId, position_ids: [fullPosition] },
    });
    assert.equal(leadMember.status, 201, "แอดมินให้ตำแหน่งได้ทุกตำแหน่ง");

    const tooHigh = await as(manager, "POST", membersUrl, { user_id: developer.userId, position_ids: [fullPosition] });
    assert.equal(tooHigh.status, 403);
    assert.equal(tooHigh.body.code, "POSITION_ABOVE_YOURS");
    const allowed = await as(manager, "POST", membersUrl, { user_id: developer.userId, position_ids: [devPosition] });
    assert.equal(allowed.status, 201, JSON.stringify(allowed.body));

    const ownChange = await as(manager, "PUT", `${membersUrl}/${managerMember.body.project_member_id}`, {
        position_ids: [managerPosition, devPosition],
    });
    assert.equal(ownChange.body.code, "CANNOT_CHANGE_OWN_POSITIONS");
    const editLead = await as(manager, "PUT", `${membersUrl}/${leadMember.body.project_member_id}`, {
        position_ids: [devPosition],
    });
    assert.equal(editLead.body.code, "MEMBER_ABOVE_YOURS");
    const removeLead = await as(manager, "DELETE", `${membersUrl}/${leadMember.body.project_member_id}`);
    assert.equal(removeLead.status, 403);
    const promoteDeveloper = await as(manager, "PUT", `${membersUrl}/${allowed.body.project_member_id}`, {
        position_ids: [fullPosition],
    });
    assert.equal(promoteDeveloper.body.code, "POSITION_ABOVE_YOURS");

    // หน้าเว็บรู้ว่าจัดการใครได้ โดยไม่เห็นสิทธิ์ของคนอื่น
    const members = await as(manager, "GET", membersUrl);
    const canManage = Object.fromEntries(members.body.map((member) => [member.user_id, member.can_manage]));
    assert.equal(canManage[lead.userId], false);
    assert.equal(canManage[developer.userId], true);
    const mine = await as(manager, "GET", `/V1/projects/${project.body.project_id}/my-permissions`);
    assert.equal(mine.body.manages_all_positions, false);
});

// ─── A-3 รูปลายเซ็น ──────────────────────────────────────────────────────────────────────────

test("A-3 รูปลายเซ็น: เจ้าของ ผู้ดูผู้ใช้ และผู้ดูเอกสารที่มีลายเซ็นเปิดได้ · คนอื่นได้ 404", async () => {
    const signer = await createPerson("audit.signer", ["dashboard"]);
    const stranger = await createPerson("audit.stranger", ["dashboard"]);
    const quoteViewer = await createPerson("audit.quoteviewer", ["dashboard", "viewQuotations"]);
    const signed = await api.callApi("PUT", "/V1/users/me/signature", {
        token: signer.token,
        body: await signatureForm(PASSWORD),
    });
    assert.equal(signed.status, 200, JSON.stringify(signed.body));
    // รูปเป็น PNG ไม่ใช่ JSON จึงยิง fetch เอง ดูแค่สถานะ
    const imageStatus = async (token) => {
        const response = await fetch(`${api.baseUrl}/api/V1/signatures/${signed.body.signature.sig_id}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        await response.arrayBuffer();
        return response.status;
    };
    const adminToken = await api.login(SEED_ADMIN.login, SEED_ADMIN.newPassword);

    assert.equal(await imageStatus(signer.token), 200);
    assert.equal(await imageStatus(adminToken), 200, "แอดมินดูผู้ใช้ได้");
    assert.equal(await imageStatus(stranger.token), 404);
    assert.equal(await imageStatus(quoteViewer.token), 404, "ยังไม่อยู่บนใบเสนอราคาใด");

    const client = await api.callApi("POST", "/V1/clients", { body: { client_name: "ลูกค้าลายเซ็น" } });
    const quotation = await api.callApi("POST", "/V1/quotations", {
        body: {
            qt_client_id: client.body.client_id,
            qt_branch_id: HEAD_OFFICE_ID,
            qt_title: "ใบที่มีลายเซ็น",
            qt_currency: "THB",
            qt_valid_days: 30,
            items: [
                {
                    qti_type: "item",
                    qti_description: "งาน",
                    qti_quantity: "1",
                    qti_unit: "งาน",
                    qti_unit_price: "1000",
                },
            ],
        },
    });
    assert.equal(quotation.status, 201, JSON.stringify(quotation.body));
    await api.pool.query("UPDATE tb_quotations SET qt_creator_signature_id = ? WHERE qt_id = ?", [
        signed.body.signature.sig_id,
        quotation.body.qt_id,
    ]);
    assert.equal(await imageStatus(quoteViewer.token), 200);
});

// ─── A-4 เงินเดือน ──────────────────────────────────────────────────────────────────────────

test("A-4 จัดการพนักงานอย่างเดียว: ไม่เห็นและแก้เงินเดือนไม่ได้ · สร้างพนักงานโดยไม่มีเงินเดือนได้ · คนทำเงินเดือนตั้งทีหลัง", async () => {
    const hr = await createPerson("audit.hr", ["dashboard", "manageEmployees"]);
    const payroll = await createPerson("audit.payroll", ["dashboard", "manageEmployees", "runPayroll"]);

    const created = await as(hr, "POST", "/V1/employees", employeeBody({ ecm_base_salary: "99999" }));
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const employeeUrl = `/V1/employees/${created.body.emp_id}`;
    const [salaryRows] = await api.pool.query("SELECT * FROM tb_employee_compensations WHERE ecm_employee_id = ?", [
        created.body.emp_id,
    ]);
    assert.equal(salaryRows.length, 0, "ค่าที่คนไม่มีสิทธิ์ส่งมาไม่บันทึก");

    const hrView = await as(hr, "GET", employeeUrl);
    assert.equal(hrView.body.can_see_pay, false);
    assert.equal(hrView.body.compensations, null);
    assert.equal(hrView.body.recurring_items, null);
    assert.equal(hrView.body.current_compensation, null);
    const hrAdd = await as(hr, "POST", `${employeeUrl}/compensations`, {
        ecm_effective_from: "2026-01-05",
        ecm_base_salary: "30000",
    });
    assert.equal(hrAdd.status, 403);

    const missingSalary = await as(
        payroll,
        "POST",
        "/V1/employees",
        employeeBody({ emp_first_name_th: "ต้องมีเงินเดือน" }),
    );
    assert.equal(missingSalary.status, 400);
    assert.ok(missingSalary.body.fields.ecm_base_salary);

    const laterThanHire = await as(payroll, "POST", `${employeeUrl}/compensations`, {
        ecm_effective_from: "2026-02-01",
        ecm_base_salary: "30000",
    });
    assert.equal(laterThanHire.status, 400, "แถวแรกต้องมีผลวันเริ่มงาน");
    const first = await as(payroll, "POST", `${employeeUrl}/compensations`, {
        ecm_effective_from: "2026-01-05",
        ecm_base_salary: "30000",
    });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    const payrollView = await as(payroll, "GET", employeeUrl);
    assert.equal(payrollView.body.can_edit_pay, true);
    assert.equal(payrollView.body.current_compensation.ecm_base_salary, "30000.00");
});

// ─── A-5 บัญชีที่สิทธิ์สูงกว่า ──────────────────────────────────────────────────────────────────

test("A-5 จัดการพนักงานผูกบัญชีแอดมินหรือปิดการเข้าระบบของบัญชีที่สิทธิ์สูงกว่าไม่ได้", async () => {
    const hr = await createPerson("audit.hr2", ["dashboard", "manageEmployees"]);
    const staff = await createPerson("audit.linked", ["dashboard"]);

    const linkAdmin = await as(hr, "POST", "/V1/employees", employeeBody({ emp_user_id: SEED_ADMIN.userId }));
    assert.equal(linkAdmin.status, 403);
    assert.equal(linkAdmin.body.code, "USER_ABOVE_YOUR_PERMISSION");

    // แอดมินผูกพนักงานกับบัญชีแอดมินคนที่สอง แล้ว HR พยายามปิดการเข้าระบบ
    const secondAdmin = await createPerson("audit.admin2", PERMISSION_KEYS);
    const adminEmployee = await api.callApi("POST", "/V1/employees", {
        body: employeeBody({ emp_user_id: secondAdmin.userId, ecm_base_salary: "50000" }),
    });
    assert.equal(adminEmployee.status, 201, JSON.stringify(adminEmployee.body));
    const terminate = await as(hr, "POST", `/V1/employees/${adminEmployee.body.emp_id}/terminate`, {
        emp_termination_date: "2026-03-31",
        emp_termination_reason: "ลาออก",
        emp_close_login_on_termination: true,
    });
    assert.equal(terminate.status, 403);

    const staffEmployee = await as(hr, "POST", "/V1/employees", employeeBody({ emp_user_id: staff.userId }));
    assert.equal(staffEmployee.status, 201, "บัญชีที่สิทธิ์ไม่เกินตัวเองผูกได้ตามปกติ");
});

// ─── A-6 ช่องเลือกโปรเจกต์ในใบเบิก ──────────────────────────────────────────────────────────

test("A-6 ใบเบิก: พนักงานทั่วไปเห็นเฉพาะโปรเจกต์ที่เป็นสมาชิก และไม่เห็นชื่อลูกค้า", async () => {
    const staff = await createPerson("audit.claimer", ["dashboard", "viewOwnProjects"]);
    const client = await api.callApi("POST", "/V1/clients", { body: { client_name: "ลูกค้าลับเฉพาะ" } });
    const dates = { project_type: "agile", project_start_date: "2026-01-01", project_due_date: "2026-12-31" };
    const mine = await api.callApi("POST", "/V1/projects", {
        body: { project_name: "งานเบิกของฉัน", client_id: client.body.client_id, ...dates },
    });
    await api.callApi("POST", "/V1/projects", {
        body: { project_name: "งานเบิกของคนอื่น", client_id: client.body.client_id, ...dates },
    });
    await api.callApi("POST", `/V1/projects/${mine.body.project_id}/members`, {
        body: { user_id: staff.userId, position_ids: [] },
    });

    const staffOptions = await as(staff, "GET", "/V1/claims/project-options?search=งานเบิก");
    assert.deepEqual(
        staffOptions.body.data.map((project) => [project.project_name, project.client_name]),
        [["งานเบิกของฉัน", null]],
    );
    const byClientName = await as(staff, "GET", "/V1/claims/project-options?search=ลูกค้าลับ");
    assert.equal(byClientName.body.data.length, 0, "ค้นด้วยชื่อลูกค้าไม่ได้");

    const adminOptions = await api.callApi("GET", "/V1/claims/project-options?search=งานเบิก");
    assert.equal(adminOptions.body.data.length, 2);
    assert.equal(adminOptions.body.data[0].client_name, "ลูกค้าลับเฉพาะ");
});
