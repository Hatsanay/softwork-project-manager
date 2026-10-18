// ลงเวลา ขั้น 4-2 — บันทึก/ส่ง/อนุมัติตามขอบเขต/ตีกลับ · ค่าแรงเข้าการเงินโปรเจกต์ · กันลบโปรเจกต์/พนักงานที่มีชั่วโมง
// ยิงผ่านเซิร์ฟเวอร์จริงบนฐานข้อมูลชั่วคราว · แบบระบบ: docs/plans/2026-10-17-people-payroll-4.md หัวข้อ 4.1–4.2
const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { startTestServer } = require("./support/test-server");
const { createTestDepartment } = require("./support/test-department");
const { PERMISSION_KEYS } = require("../src/shared/permissions.mjs");
const { todayBangkok } = require("../src/utils/bangkok-time");
const {
    addDays,
    weekStartOf,
    workingDatesOfMonth,
    standardHoursOf,
    laborCostOf,
} = require("../src/shared/payroll-math.mjs");
const { formatHundredths } = require("../src/shared/money.mjs");

const PASSWORD = "Staff@2026";
const PROJECT_ID = "PRO209901010000001";
const OTHER_PROJECT_ID = "PRO209901010000002";
const TASK_ID = "TAS209901010000001";
const OTHER_TASK_ID = "TAS209901010000002";
const PM_POSITION_ID = "POS202601010000001";
const DEVELOPER_POSITION_ID = "POS209901010000002";
const PROJECT_POSITION_BIT_COUNT = 29;

let api;
let departmentId;
// ชื่อที่เทสต์ใช้เรียกพนักงาน → รหัสที่ระบบออกให้
const codes = {};
const people = {};
// สัปดาห์ที่แล้วทั้งสัปดาห์อยู่ในอดีตและอยู่ในระยะลงย้อนหลัง 14 วันเสมอ (ไม่ว่าวันนี้เป็นวันอะไร)
const lastWeek = addDays(weekStartOf(todayBangkok()), -7);
const monday = lastWeek;
const tuesday = addDays(lastWeek, 1);

async function createPerson(name, permissionKeys, userNumber) {
    const bits = PERMISSION_KEYS.map((key) => (permissionKeys.includes(key) ? "1" : "0")).join("");
    const role = await api.callApi("POST", "/V1/roles", { body: { role_name: `role-${name}`, role_permission: bits } });
    assert.equal(role.status, 201, JSON.stringify(role.body));
    const userId = `USE20990101000${userNumber}`;
    await api.pool.query(
        `INSERT INTO tb_users (user_id, user_username, user_email, user_password, user_fname, user_lname, user_role_id, user_must_change_password)
         VALUES (?, ?, ?, ?, ?, 'ทดสอบ', ?, 0)`,
        [userId, name, `${name}@example.com`, await bcrypt.hash(PASSWORD, 10), name, role.body.role_id],
    );
    return { userId, token: await api.login(name, PASSWORD) };
}

async function addMember(projectId, userId, positionId, memberNumber) {
    const memberId = `PME20990101000${memberNumber}`;
    await api.pool.query("INSERT INTO tb_project_members (project_member_id, project_id, user_id) VALUES (?, ?, ?)", [
        memberId,
        projectId,
        userId,
    ]);
    await api.pool.query("INSERT INTO tb_project_member_positions (project_member_id, position_id) VALUES (?, ?)", [
        memberId,
        positionId,
    ]);
}

async function createEmployee(code, userId, salary) {
    const response = await api.callApi("POST", "/V1/employees", {
        body: {
            emp_department_id: departmentId,
            emp_first_name_th: code,
            emp_last_name_th: "ทดสอบ",
            emp_hire_date: "2026-01-01",
            emp_user_id: userId,
            ecm_base_salary: salary,
        },
    });
    assert.equal(response.status, 201, JSON.stringify(response.body));
    // รหัสพนักงานระบบออกให้ (2026-10-18) — เก็บไว้เทียบกับข้อมูลที่อ้างรหัส
    codes[code] = response.body.emp_code;
    return response.body.emp_id;
}

function as(person, method, url, body) {
    return api.callApi(method, url, { token: person?.token, body });
}

function expectStatus(response, status) {
    assert.equal(response.status, status, JSON.stringify(response.body));
    return response.body;
}

const entry = (date, hours, overrides = {}) => ({
    tse_date: date,
    tse_project_id: PROJECT_ID,
    tse_task_id: TASK_ID,
    tse_hours: hours,
    tse_note: null,
    ...overrides,
});

test.before(async () => {
    api = await startTestServer("timesheet");
    await api.loginAsAdmin();
    departmentId = await createTestDepartment(api);
    people.developer = await createPerson("ts.dev", ["dashboard"], 161);
    people.manager = await createPerson("ts.pm", ["dashboard"], 162);
    people.hr = await createPerson("ts.hr", ["dashboard", "approveTimesheet"], 163);
    people.guest = await createPerson("ts.guest", ["dashboard"], 164);

    for (const [projectId, name, token] of [
        [PROJECT_ID, "แอปลูกค้า", "token-ts-1"],
        [OTHER_PROJECT_ID, "เว็บภายใน", "token-ts-2"],
    ]) {
        await api.pool.query(
            `INSERT INTO tb_projects (project_id, project_name, project_share_token, project_created_by)
             VALUES (?, ?, ?, 'USE202601010000001')`,
            [projectId, name, token],
        );
    }
    await api.pool.query("INSERT INTO tb_tasks (task_id, project_id, task_title) VALUES (?, ?, 'ออกแบบหน้าจอ'), (?, ?, 'งานอื่น')", [
        TASK_ID,
        PROJECT_ID,
        OTHER_TASK_ID,
        OTHER_PROJECT_ID,
    ]);
    await api.pool.query("INSERT INTO tb_project_positions (position_id, position_name, position_permission) VALUES (?, 'Developer', ?)", [
        DEVELOPER_POSITION_ID,
        "0".repeat(PROJECT_POSITION_BIT_COUNT),
    ]);
    await addMember(PROJECT_ID, people.developer.userId, DEVELOPER_POSITION_ID, 161);
    await addMember(PROJECT_ID, people.manager.userId, PM_POSITION_ID, 162);
    await addMember(PROJECT_ID, "USE202601010000001", PM_POSITION_ID, 163);

    people.developer.employeeId = await createEmployee("TS-DEV", people.developer.userId, "32000");
    people.hr.employeeId = await createEmployee("TS-HR", people.hr.userId, "40000");
});

test.after(async () => {
    await api?.stop();
});

test("ผู้ใช้ที่ไม่ได้ผูกพนักงานเห็นสถานะ แต่บันทึกไม่ได้", async () => {
    const view = expectStatus(await as(people.guest, "GET", `/V1/timesheet/me?week=${tuesday}`), 200);
    assert.equal(view.employee, null);
    assert.equal(view.week_start, monday, "วันไหนในสัปดาห์ก็ได้ → วันจันทร์");
    const saved = expectStatus(
        await as(people.guest, "PUT", "/V1/timesheet/me", { week_start: monday, tsw_version: 0, entries: [] }),
        409,
    );
    assert.equal(saved.code, "NOT_AN_EMPLOYEE");
});

test("บันทึก: ตรวจชั่วโมง/โปรเจกต์/งาน · เวอร์ชันเก่าถูกปฏิเสธ · ส่งแล้วแก้ไม่ได้", async () => {
    const week = expectStatus(await as(people.developer, "GET", `/V1/timesheet/me?week=${monday}`), 200);
    assert.deepEqual(
        week.projects.map((project) => project.project_id),
        [PROJECT_ID],
        "เลือกได้เฉพาะโปรเจกต์ที่เป็นสมาชิก",
    );
    assert.equal(week.days.length, 7);

    const badHours = expectStatus(
        await as(people.developer, "PUT", "/V1/timesheet/me", {
            week_start: monday,
            tsw_version: 0,
            entries: [entry(monday, "1.1")],
        }),
        400,
    );
    assert.ok(badHours.fields["entries.0.tse_hours"], "ทีละ 15 นาที");
    const overDay = expectStatus(
        await as(people.developer, "PUT", "/V1/timesheet/me", {
            week_start: monday,
            tsw_version: 0,
            entries: [entry(tuesday, "20"), entry(tuesday, "5", { tse_project_id: null, tse_task_id: null })],
        }),
        400,
    );
    assert.ok(overDay.fields["entries.0.tse_hours"], "รวมทั้งวันเกิน 24");

    const notMember = expectStatus(
        await as(people.developer, "PUT", "/V1/timesheet/me", {
            week_start: monday,
            tsw_version: 0,
            entries: [
                entry(monday, "2", { tse_project_id: OTHER_PROJECT_ID, tse_task_id: null }),
                entry(tuesday, "2", { tse_task_id: OTHER_TASK_ID }),
            ],
        }),
        400,
    );
    assert.ok(notMember.fields["entries.0.tse_project_id"]);
    assert.ok(notMember.fields["entries.1.tse_task_id"]);

    const saved = expectStatus(
        await as(people.developer, "PUT", "/V1/timesheet/me", {
            week_start: monday,
            tsw_version: 0,
            entries: [
                entry(monday, "8"),
                entry(tuesday, "4"),
                entry(tuesday, "3.75", { tse_project_id: null, tse_task_id: null, tse_note: "ประชุมบริษัท" }),
            ],
        }),
        200,
    );
    assert.equal(saved.week.tsw_version, 1);
    assert.equal(saved.week.tsw_total_hours, "15.75");
    expectStatus(
        await as(people.developer, "PUT", "/V1/timesheet/me", { week_start: monday, tsw_version: 0, entries: [] }),
        409,
    );

    const submitted = expectStatus(
        await as(people.developer, "POST", "/V1/timesheet/me/submit", { week_start: monday, tsw_version: 1 }),
        200,
    );
    assert.equal(submitted.week.tsw_status, "submitted");
    const locked = expectStatus(
        await as(people.developer, "PUT", "/V1/timesheet/me", {
            week_start: monday,
            tsw_version: submitted.week.tsw_version,
            entries: [],
        }),
        409,
    );
    assert.equal(locked.code, "TIMESHEET_NOT_EDITABLE");
});

test("อนุมัติตามขอบเขต: ผู้จัดการโปรเจกต์อนุมัติแถวโปรเจกต์ · ฝ่ายบุคคลอนุมัติแถวที่เหลือ · ค่าแรงเข้าการเงินโปรเจกต์", async () => {
    const developerView = expectStatus(await as(people.developer, "GET", "/V1/timesheet/approvals"), 200);
    assert.equal(developerView.can_approve, false);

    const managerView = expectStatus(await as(people.manager, "GET", "/V1/timesheet/approvals"), 200);
    const managerWeek = managerView.weeks.find((week) => week.emp_code === codes["TS-DEV"]);
    assert.equal(managerWeek.entries.length, 2, "ผู้จัดการโปรเจกต์เห็นเฉพาะแถวของโปรเจกต์ตัวเอง (ไม่เห็นงานภายใน)");

    const approvedByManager = expectStatus(
        await as(people.manager, "POST", `/V1/timesheet/weeks/${managerWeek.tsw_id}/approve`, {
            tsw_version: managerWeek.tsw_version,
        }),
        200,
    );
    assert.deepEqual(approvedByManager, { tsw_id: managerWeek.tsw_id, approved_rows: 2, is_fully_approved: false });

    const finance = expectStatus(await api.callApi("GET", `/V1/projects/${PROJECT_ID}/finance`), 200);
    const monthlyCost = 3_200_000n + 87_500n; // เงินเดือน 32,000 + ประกันสังคมส่วนบริษัท 875 (เพดาน 17,500 × 5%)
    const expectedCost = [
        [monday, 800n],
        [tuesday, 400n],
    ].reduce((sum, [date, hours]) => {
        const standardHours = standardHoursOf(workingDatesOfMonth(date.slice(0, 7), "1111100", new Set()).length, "8.00");
        return sum + laborCostOf(monthlyCost, hours, standardHours);
    }, 0n);
    // แยกเดือนได้ถ้าสัปดาห์ที่แล้วคร่อมสิ้นเดือน — คิดแยกเดือนแล้วรวม (ตรงกับ backend)
    const sameMonth = monday.slice(0, 7) === tuesday.slice(0, 7);
    if (sameMonth) {
        const standardHours = standardHoursOf(workingDatesOfMonth(monday.slice(0, 7), "1111100", new Set()).length, "8.00");
        assert.equal(finance.profit.labor_cost_thb, formatHundredths(laborCostOf(monthlyCost, 1200n, standardHours)));
    } else {
        assert.equal(finance.profit.labor_cost_thb, formatHundredths(expectedCost));
    }
    assert.equal(finance.profit.labor_hours, "12.00");
    assert.equal(finance.profit.labor_pending_hours, "0.00");
    assert.equal(finance.profit.labor_is_estimate, true);
    assert.equal(finance.profit.cost_thb, finance.profit.labor_cost_thb, "ยังไม่มีค่าใช้จ่าย ต้นทุนรวม = ค่าแรง");

    const hrView = expectStatus(await as(people.hr, "GET", "/V1/timesheet/approvals"), 200);
    const hrWeek = hrView.weeks.find((week) => week.emp_code === codes["TS-DEV"]);
    assert.equal(hrWeek.entries.filter((row) => !row.is_approved).length, 1, "เหลืองานภายใน 1 แถว");
    const approvedByHr = expectStatus(
        await as(people.hr, "POST", `/V1/timesheet/weeks/${hrWeek.tsw_id}/approve`, { tsw_version: hrWeek.tsw_version }),
        200,
    );
    assert.equal(approvedByHr.is_fully_approved, true);
    const view = expectStatus(await as(people.developer, "GET", `/V1/timesheet/me?week=${monday}`), 200);
    assert.equal(view.week.tsw_status, "approved");
});

test("สัปดาห์ที่อนุมัติครบแล้วตีกลับไม่ได้ · ชั่วโมงหลายสัปดาห์รวมเข้าค่าแรงโปรเจกต์", async () => {
    // สองสัปดาห์ก่อนอาจเกินระยะย้อนหลัง 14 วัน — ขยายเป็น 30 วันก่อน
    const setup = expectStatus(await api.callApi("GET", "/V1/people/setup"), 200);
    expectStatus(
        await api.callApi("PUT", "/V1/people/settings", { body: { ...setup.settings, ps_timesheet_backdate_days: 30 } }),
        200,
    );
    const earlierWeek = addDays(monday, -7);
    const tooEarly = expectStatus(
        await as(people.developer, "PUT", "/V1/timesheet/me", {
            week_start: addDays(monday, -35),
            tsw_version: 0,
            entries: [entry(addDays(monday, -35), "6")],
        }),
        400,
    );
    assert.match(tooEarly.fields["entries.0.tse_date"], /ย้อนหลัง/);
    expectStatus(
        await as(people.developer, "PUT", "/V1/timesheet/me", {
            week_start: earlierWeek,
            tsw_version: 0,
            entries: [entry(earlierWeek, "6")],
        }),
        200,
    );
    const mine = expectStatus(await as(people.developer, "GET", `/V1/timesheet/me?week=${earlierWeek}`), 200);
    expectStatus(
        await as(people.developer, "POST", "/V1/timesheet/me/submit", {
            week_start: earlierWeek,
            tsw_version: mine.week.tsw_version,
        }),
        200,
    );
    const managerWeek = expectStatus(await as(people.manager, "GET", "/V1/timesheet/approvals"), 200).weeks[0];
    const afterApprove = expectStatus(
        await as(people.manager, "POST", `/V1/timesheet/weeks/${managerWeek.tsw_id}/approve`, {
            tsw_version: managerWeek.tsw_version,
        }),
        200,
    );
    assert.equal(afterApprove.is_fully_approved, true);

    // อนุมัติครบแล้วตีกลับไม่ได้ (ไม่ได้รออนุมัติ)
    expectStatus(
        await as(people.hr, "POST", `/V1/timesheet/weeks/${managerWeek.tsw_id}/return`, {
            tsw_version: managerWeek.tsw_version + 1,
            reason: "ผิด",
        }),
        409,
    );
    const financeBefore = expectStatus(await api.callApi("GET", `/V1/projects/${PROJECT_ID}/finance`), 200);
    assert.equal(financeBefore.profit.labor_hours, "18.00");
});

test("ตีกลับระหว่างรออนุมัติ: ล้างการอนุมัติบางส่วน · อนุมัติของตัวเองไม่ได้", async () => {
    const hrWeekStart = monday;
    const hrSaved = expectStatus(
        await as(people.hr, "PUT", "/V1/timesheet/me", {
            week_start: hrWeekStart,
            tsw_version: 0,
            entries: [entry(monday, "2", { tse_project_id: null, tse_task_id: null })],
        }),
        200,
    );
    const hrSubmitted = expectStatus(
        await as(people.hr, "POST", "/V1/timesheet/me/submit", {
            week_start: hrWeekStart,
            tsw_version: hrSaved.week.tsw_version,
        }),
        200,
    );
    const self = expectStatus(
        await as(people.hr, "POST", `/V1/timesheet/weeks/${hrSubmitted.week.tsw_id}/approve`, {
            tsw_version: hrSubmitted.week.tsw_version,
        }),
        403,
    );
    assert.equal(self.code, "SELF_APPROVAL_NOT_ALLOWED");
    const hrList = expectStatus(await as(people.hr, "GET", "/V1/timesheet/approvals"), 200);
    assert.ok(!hrList.weeks.some((week) => week.emp_code === codes["TS-HR"]), "ไม่เห็นของตัวเองในรายการรออนุมัติ");

    const outOfScope = expectStatus(
        await as(people.manager, "POST", `/V1/timesheet/weeks/${hrSubmitted.week.tsw_id}/return`, {
            tsw_version: hrSubmitted.week.tsw_version,
            reason: "ไม่ใช่โปรเจกต์ของฉัน",
        }),
        403,
    );
    assert.equal(outOfScope.code, "NO_TIMESHEET_ROWS_TO_APPROVE");

    const adminReturn = expectStatus(
        await api.callApi("POST", `/V1/timesheet/weeks/${hrSubmitted.week.tsw_id}/return`, {
            body: { tsw_version: hrSubmitted.week.tsw_version, reason: "ระบุงานให้ชัดกว่านี้" },
        }),
        200,
    );
    assert.equal(adminReturn.tsw_id, hrSubmitted.week.tsw_id);
    const hrView = expectStatus(await as(people.hr, "GET", `/V1/timesheet/me?week=${hrWeekStart}`), 200);
    assert.equal(hrView.week.tsw_status, "returned");
    assert.equal(hrView.week.tsw_return_reason, "ระบุงานให้ชัดกว่านี้");
    expectStatus(
        await as(people.hr, "PUT", "/V1/timesheet/me", {
            week_start: hrWeekStart,
            tsw_version: hrView.week.tsw_version,
            entries: [entry(monday, "2", { tse_project_id: null, tse_task_id: null, tse_note: "อบรม PDPA" })],
        }),
        200,
        "ถูกตีกลับแล้วแก้ได้",
    );
});

test("กันลบ: โปรเจกต์ที่มีชั่วโมงลงไว้ และพนักงานที่มีลงเวลาแล้ว", async () => {
    const project = expectStatus(await api.callApi("DELETE", `/V1/projects/${PROJECT_ID}`), 409);
    assert.equal(project.code, "PROJECT_HAS_TIMESHEETS");
    const employee = expectStatus(await api.callApi("DELETE", `/V1/employees/${people.developer.employeeId}`), 409);
    assert.equal(employee.code, "EMPLOYEE_HAS_HISTORY");
});
