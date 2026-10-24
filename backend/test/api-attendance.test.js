// ลงเวลาเข้า-ออกงาน ช่วง A-1 (2026-10-23) — กะทำงาน · จุดลงเวลา · กะของพนักงาน · กดเข้า/ออก (ในจุด/นอกจุด/กดซ้ำ)
// · ไม่ต้องลงเวลา · ปิดลงชั่วโมงต่อโปรเจกต์เป็นค่าเริ่มต้น · สิทธิ์
// ยิงผ่านเซิร์ฟเวอร์จริงบนฐานข้อมูลชั่วคราว · แบบระบบ: docs/plans/2026-10-23-attendance-ot.md
// เวลาที่กด = เวลาจริงของเครื่องที่รันเทสต์ (ตรวจเฉพาะสิ่งที่ไม่ขึ้นกับวัน/เวลา — สาย/ขาดตรวจใน attendance-math.test.js)
const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { startTestServer } = require("./support/test-server");
const { createTestDepartment } = require("./support/test-department");
const { PERMISSION_KEYS } = require("../src/shared/permissions.mjs");
const { todayBangkok } = require("../src/utils/bangkok-time");

const PASSWORD = "Staff@2026";
const OFFICE = { latitude: 13.7563, longitude: 100.5018 };

let api;
let departmentId;
const people = {};

async function createPerson(name, permissionKeys, userNumber) {
    const bits = PERMISSION_KEYS.map((key) => (permissionKeys.includes(key) ? "1" : "0")).join("");
    const role = await api.callApi("POST", "/V1/roles", { body: { role_name: `role-${name}`, role_permission: bits } });
    assert.equal(role.status, 201, JSON.stringify(role.body));
    const userId = `USE20990104000${userNumber}`;
    await api.pool.query(
        `INSERT INTO tb_users (user_id, user_username, user_email, user_password, user_fname, user_lname, user_role_id, user_must_change_password)
         VALUES (?, ?, ?, ?, ?, 'ทดสอบ', ?, 0)`,
        [userId, name, `${name}@example.com`, await bcrypt.hash(PASSWORD, 10), name, role.body.role_id],
    );
    return { userId, token: await api.login(name, PASSWORD) };
}

async function createEmployee(name, userId) {
    const response = await api.callApi("POST", "/V1/employees", {
        body: {
            emp_department_id: departmentId,
            emp_first_name_th: name,
            emp_last_name_th: "ทดสอบ",
            emp_hire_date: "2026-01-05",
            emp_user_id: userId,
            ecm_base_salary: "30000",
        },
    });
    assert.equal(response.status, 201, JSON.stringify(response.body));
    return response.body.emp_id;
}

function as(person, method, url, body) {
    return api.callApi(method, url, { token: person?.token, body });
}

function expectStatus(response, status, note) {
    assert.equal(response.status, status, `${note ?? ""} ${JSON.stringify(response.body)}`);
    return response.body;
}

const schedule = (overrides = {}) => ({
    ws_name: "กะเช้า 07:00-16:00",
    ws_start_time: "07:00",
    ws_end_time: "16:00",
    ws_break_minutes: 60,
    ws_working_weekdays: "1111110",
    ws_late_grace_minutes: 5,
    ws_checkin_open_minutes: 120,
    ws_status: "active",
    ...overrides,
});

test.before(async () => {
    api = await startTestServer("attendance");
    await api.loginAsAdmin();
    departmentId = await createTestDepartment(api, "ATD", "แผนกลงเวลา");
    people.hr = await createPerson("at.hr", ["dashboard", "manageHrSettings", "manageEmployees"], 191);
    people.staff = await createPerson("at.staff", ["dashboard"], 192);
    people.guest = await createPerson("at.guest", ["dashboard"], 193);
    people.boss = await createPerson("at.boss", ["dashboard"], 194);
    people.staff.employeeId = await createEmployee("ลงเวลา", people.staff.userId);
    people.boss.employeeId = await createEmployee("ผู้บริหาร", people.boss.userId);
});

test.after(async () => {
    await api?.stop();
});

test("ค่าเริ่มต้นหลัง deploy: มีกะ ออฟฟิศ 09:00-18:00 เป็นกะเริ่มต้น · ปิดลงชั่วโมงต่อโปรเจกต์", async () => {
    const setup = expectStatus(await as(people.staff, "GET", "/V1/people/setup"), 200);
    assert.equal(setup.work_schedules.length, 1);
    const [office] = setup.work_schedules;
    assert.equal(office.ws_name, "ออฟฟิศ 09:00-18:00");
    assert.equal(office.ws_start_time, "09:00");
    assert.equal(setup.settings.ps_default_schedule_id, office.ws_id);
    assert.equal(setup.settings.ps_timesheet_enabled, false);
    assert.equal(setup.settings.ps_attendance_start_date, todayBangkok(), "deploy ตั้งวันเริ่มใช้ = วันนี้ (ยังไม่มีการกด)");

    const save = expectStatus(
        await as(people.staff, "PUT", "/V1/timesheet/me", { week_start: "2026-10-19", tsw_version: 0, entries: [] }),
        409,
    );
    assert.equal(save.code, "TIMESHEET_DISABLED");
    const approvals = expectStatus(await as(people.hr, "GET", "/V1/timesheet/approvals"), 200);
    assert.equal(approvals.can_approve, false);
});

test("กะทำงาน: เฉพาะสิทธิ์ตั้งค่าบุคคล · ชื่อห้ามซ้ำ · พักยาวเกินกะไม่ได้ · กะเริ่มต้นปิดไม่ได้", async () => {
    expectStatus(await as(people.staff, "POST", "/V1/people/work-schedules", schedule()), 403);
    const created = expectStatus(await as(people.hr, "POST", "/V1/people/work-schedules", schedule()), 201);
    const duplicate = expectStatus(await as(people.hr, "POST", "/V1/people/work-schedules", schedule()), 400);
    assert.ok(duplicate.fields.ws_name);
    const tooLongBreak = expectStatus(
        await as(people.hr, "POST", "/V1/people/work-schedules", schedule({ ws_name: "สั้น", ws_end_time: "08:00" })),
        400,
    );
    assert.ok(tooLongBreak.fields.ws_break_minutes);
    expectStatus(
        await as(people.hr, "POST", "/V1/people/work-schedules", schedule({ ws_name: "กะดึก", ws_start_time: "22:00", ws_end_time: "06:00" })),
        201,
        "กะข้ามคืน",
    );

    const setup = expectStatus(await as(people.hr, "GET", "/V1/people/setup"), 200);
    const defaultId = setup.settings.ps_default_schedule_id;
    const office = setup.work_schedules.find((row) => row.ws_id === defaultId);
    const closeDefault = expectStatus(
        await as(people.hr, "PUT", `/V1/people/work-schedules/${defaultId}`, {
            ...schedule({ ws_name: office.ws_name, ws_start_time: "09:00", ws_end_time: "18:00" }),
            ws_status: "inactive",
        }),
        400,
    );
    assert.ok(closeDefault.fields.ws_status);
    expectStatus(
        await as(people.hr, "PUT", `/V1/people/work-schedules/${created.ws_id}`, schedule({ ws_late_grace_minutes: 15 })),
        200,
    );
});

test("กะของพนักงาน: ตามวันที่มีผล · ก่อนวันเริ่มงานไม่ได้ · วันเดียวกันซ้ำ = แทน · ลบได้ · ต้องมีสิทธิ์จัดการพนักงาน", async () => {
    const setup = expectStatus(await as(people.hr, "GET", "/V1/people/setup"), 200);
    const morning = setup.work_schedules.find((row) => row.ws_name === "กะเช้า 07:00-16:00");
    const night = setup.work_schedules.find((row) => row.ws_name === "กะดึก");
    const url = `/V1/employees/${people.boss.employeeId}/schedules`;

    expectStatus(await as(people.staff, "POST", url, { es_schedule_id: morning.ws_id, es_effective_from: "2026-02-01" }), 403);
    const beforeHire = expectStatus(
        await as(people.hr, "POST", url, { es_schedule_id: morning.ws_id, es_effective_from: "2026-01-01" }),
        400,
    );
    assert.ok(beforeHire.fields.es_effective_from);
    expectStatus(await as(people.hr, "POST", url, { es_schedule_id: morning.ws_id, es_effective_from: "2026-02-01" }), 201);
    expectStatus(await as(people.hr, "POST", url, { es_schedule_id: night.ws_id, es_effective_from: "2026-02-01" }), 201);

    const employee = expectStatus(await as(people.hr, "GET", `/V1/employees/${people.boss.employeeId}`), 200);
    assert.equal(employee.schedules.length, 1, "วันเดียวกันแทนของเดิม");
    assert.equal(employee.schedules[0].ws_name, "กะดึก");
    assert.equal(employee.emp_attendance_required, true);
    expectStatus(await as(people.hr, "DELETE", `${url}/${employee.schedules[0].es_id}`), 200);
    const afterDelete = expectStatus(await as(people.hr, "GET", `/V1/employees/${people.boss.employeeId}`), 200);
    assert.equal(afterDelete.schedules.length, 0);
});

test("กดเข้า/ออก: ในจุด · กดซ้ำภายใน 1 นาทีไม่บันทึกเพิ่ม · นอกจุดต้องใส่เหตุผล · ไม่มีตำแหน่ง = นอกจุด", async () => {
    expectStatus(await as(people.staff, "POST", "/V1/people/attendance-locations", {}), 403);
    expectStatus(
        await as(people.hr, "POST", "/V1/people/attendance-locations", {
            al_name: "สำนักงานใหญ่",
            al_latitude: OFFICE.latitude,
            al_longitude: OFFICE.longitude,
            al_radius_m: 150,
        }),
        201,
    );

    const guest = expectStatus(await as(people.guest, "POST", "/V1/attendance/punch", { ap_type: "in", ...OFFICE }), 409);
    assert.equal(guest.code, "NOT_AN_EMPLOYEE");

    // ไม่มีตำแหน่ง (มือถือไม่ให้ GPS) = นอกจุด ต้องใส่เหตุผล — ทดสอบก่อนกดจริง เพราะกดซ้ำชนิดเดิมใน 1 นาทีจะได้ผลเดิมกลับมา
    const noLocation = expectStatus(await as(people.staff, "POST", "/V1/attendance/punch", { ap_type: "in" }), 400);
    assert.match(noLocation.fields.note, /ไม่ได้รับตำแหน่ง/);
    const nearOffice = { latitude: OFFICE.latitude + 0.0005, longitude: OFFICE.longitude, accuracy: 12 };
    const first = expectStatus(await as(people.staff, "POST", "/V1/attendance/punch", { ap_type: "in", ...nearOffice }), 201);
    assert.equal(first.is_duplicate, false);
    const again = expectStatus(await as(people.staff, "POST", "/V1/attendance/punch", { ap_type: "in", ...nearOffice }), 200);
    assert.equal(again.is_duplicate, true);
    assert.equal(again.ap_id, first.ap_id);

    const farAway = { latitude: OFFICE.latitude + 0.05, longitude: OFFICE.longitude };
    const noReason = expectStatus(await as(people.staff, "POST", "/V1/attendance/punch", { ap_type: "out", ...farAway }), 400);
    assert.match(noReason.fields.note, /นอกจุดลงเวลา/);
    expectStatus(
        await as(people.staff, "POST", "/V1/attendance/punch", { ap_type: "out", ...farAway, note: "ไปพบลูกค้า" }),
        201,
    );

    const [rows] = await api.pool.query(
        "SELECT ap_type, ap_is_offsite, ap_location_name, ap_distance_m, ap_note, ap_source FROM tb_attendance_punches WHERE ap_employee_id = ? ORDER BY ap_id",
        [people.staff.employeeId],
    );
    assert.equal(rows.length, 2);
    assert.deepEqual(
        rows.map((row) => [row.ap_type, row.ap_is_offsite, row.ap_location_name, row.ap_source]),
        [
            ["in", 0, "สำนักงานใหญ่", "mobile"],
            ["out", 1, "สำนักงานใหญ่", "mobile"],
        ],
    );
    assert.ok(rows[0].ap_distance_m > 40 && rows[0].ap_distance_m < 70, "ห่างราว 55 ม.");

    const mine = expectStatus(await as(people.staff, "GET", "/V1/attendance/me"), 200);
    assert.equal(mine.attendance_required, true);
    // ก่อนวันเริ่มใช้ลงเวลาไม่นับขาด (เริ่มใช้วันนี้ ทั้งเดือนก่อนหน้าจึงไม่ขาดเลย)
    assert.equal(mine.days.filter((day) => day.work_date < mine.today).every((day) => day.status !== "absent"), true);
    assert.equal(mine.locations.length, 1);
    assert.equal(mine.month, todayBangkok().slice(0, 7));
    assert.equal(mine.today_day.punches.length, 2);
    assert.equal(mine.days.length >= 28, true);
    assert.equal(mine.timesheet_enabled, false);
});

test("ไม่ต้องลงเวลา: กดไม่ได้ และวันทำงานไม่นับขาด", async () => {
    await api.pool.query("UPDATE tb_employees SET emp_attendance_required = 0 WHERE emp_id = ?", [people.boss.employeeId]);
    const blocked = expectStatus(
        await as(people.boss, "POST", "/V1/attendance/punch", { ap_type: "in", ...OFFICE }),
        409,
    );
    assert.equal(blocked.code, "ATTENDANCE_NOT_REQUIRED");
    const mine = expectStatus(await as(people.boss, "GET", "/V1/attendance/me?month=2026-03"), 200);
    assert.equal(mine.attendance_required, false);
    assert.ok(mine.days.every((day) => day.status === "not_required"));
    assert.equal(mine.totals.absent, 0);
});
