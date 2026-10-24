// WFH (2026-10-24) — วัน WFH ประจำ (ฝ่ายบุคคลตั้ง) กดได้ทุกที่ไม่ต้องใส่เหตุผล (ป้าย WFH ไม่ใช่นอกจุด)
// · ขอ WFH รายวัน: ย้อนหลัง/วันหยุดของกะ/วันประจำอยู่แล้ว/ขอซ้ำ ไม่ได้ · อนุมัติ/ไม่อนุมัติ/ยกเลิก · ของตัวเองไม่ได้ · สิทธิ์
const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { startTestServer } = require("./support/test-server");
const { createTestDepartment } = require("./support/test-department");
const { PERMISSION_KEYS } = require("../src/shared/permissions.mjs");
const { todayBangkok } = require("../src/utils/bangkok-time");
const { addDays, weekStartOf } = require("../src/shared/payroll-math.mjs");

const PASSWORD = "Staff@2026";
const OFFICE = { latitude: 13.7563, longitude: 100.5018 };
const FAR_AWAY = { latitude: 13.9, longitude: 100.6 };
const nextMonday = addDays(weekStartOf(todayBangkok()), 7);
const nextSaturday = addDays(nextMonday, 5);

let api;
let departmentId;
const people = {};

async function createPerson(name, permissionKeys, userNumber) {
    const bits = PERMISSION_KEYS.map((key) => (permissionKeys.includes(key) ? "1" : "0")).join("");
    const role = await api.callApi("POST", "/V1/roles", { body: { role_name: `role-${name}`, role_permission: bits } });
    assert.equal(role.status, 201, JSON.stringify(role.body));
    const userId = `USE20990108000${userNumber}`;
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

test.before(async () => {
    api = await startTestServer("attendance_wfh");
    await api.loginAsAdmin();
    departmentId = await createTestDepartment(api, "WFH", "แผนก WFH");
    people.hr = await createPerson("wf.hr", ["dashboard", "manageEmployees"], 231);
    people.approver = await createPerson("wf.approver", ["dashboard", "approveTimesheet"], 232);
    people.remote = await createPerson("wf.remote", ["dashboard"], 233);
    people.hybrid = await createPerson("wf.hybrid", ["dashboard"], 234);
    people.remote.employeeId = await createEmployee("ทำงานที่บ้าน", people.remote.userId);
    people.hybrid.employeeId = await createEmployee("บางวัน", people.hybrid.userId);
    people.approver.employeeId = await createEmployee("ผู้อนุมัติ", people.approver.userId);
    await api.callApi("POST", "/V1/people/attendance-locations", {
        body: { al_name: "สำนักงานใหญ่", al_latitude: OFFICE.latitude, al_longitude: OFFICE.longitude, al_radius_m: 150 },
    });
});

test.after(async () => {
    await api?.stop();
});

test("WFH ประจำ: ฝ่ายบุคคลตั้ง · วัน WFH กดไกลออฟฟิศได้โดยไม่ต้องใส่เหตุผล ติดป้าย WFH ไม่ใช่นอกจุด", async () => {
    const outside = expectStatus(await as(people.remote, "POST", "/V1/attendance/punch", { ap_type: "in", ...FAR_AWAY }), 400);
    assert.ok(outside.fields.note, "ยังไม่ได้ตั้ง WFH = นอกจุดต้องใส่เหตุผล");

    const url = `/V1/employees/${people.remote.employeeId}/wfh-days`;
    expectStatus(await as(people.remote, "PUT", url, { emp_wfh_weekdays: "1111111" }), 403);
    expectStatus(await as(people.hr, "PUT", url, { emp_wfh_weekdays: "11111" }), 400);
    expectStatus(await as(people.hr, "PUT", url, { emp_wfh_weekdays: "1111111" }), 200);

    expectStatus(await as(people.remote, "POST", "/V1/attendance/punch", { ap_type: "in", ...FAR_AWAY }), 201);
    const [[punch]] = await api.pool.query(
        "SELECT ap_is_offsite, ap_is_wfh, ap_latitude, ap_distance_m FROM tb_attendance_punches WHERE ap_employee_id = ?",
        [people.remote.employeeId],
    );
    assert.equal(punch.ap_is_offsite, 0);
    assert.equal(punch.ap_is_wfh, 1);
    assert.equal(Number(punch.ap_latitude), FAR_AWAY.latitude, "ยังบันทึกพิกัดไว้");
    assert.ok(punch.ap_distance_m > 10000);

    const mine = expectStatus(await as(people.remote, "GET", "/V1/attendance/me"), 200);
    assert.equal(mine.wfh_weekdays, "1111111");
    assert.equal(mine.today_day.is_wfh, true);
    const employee = expectStatus(await as(people.hr, "GET", `/V1/employees/${people.remote.employeeId}`), 200);
    assert.equal(employee.emp_wfh_weekdays, "1111111");
});

test("ขอ WFH รายวัน: ย้อนหลัง/วันหยุดของกะ/วันประจำ/ขอซ้ำ ไม่ได้ · อนุมัติ · ของตัวเองไม่ได้ · ยกเลิกก่อนถึงวันได้", async () => {
    const past = expectStatus(
        await as(people.hybrid, "POST", "/V1/attendance/wfh", { wfh_date: addDays(todayBangkok(), -1), wfh_reason: "ลืม" }),
        400,
    );
    assert.match(past.fields.wfh_date, /ย้อนหลัง/);
    const dayOff = expectStatus(await as(people.hybrid, "POST", "/V1/attendance/wfh", { wfh_date: nextSaturday, wfh_reason: "x" }), 400);
    assert.match(dayOff.fields.wfh_date, /วันหยุด/);
    const regular = expectStatus(await as(people.remote, "POST", "/V1/attendance/wfh", { wfh_date: nextMonday, wfh_reason: "x" }), 400);
    assert.match(regular.fields.wfh_date, /ประจำ/);

    const created = expectStatus(
        await as(people.hybrid, "POST", "/V1/attendance/wfh", { wfh_date: nextMonday, wfh_reason: "รอช่างซ่อมบ้าน" }),
        201,
    );
    expectStatus(await as(people.hybrid, "POST", "/V1/attendance/wfh", { wfh_date: nextMonday, wfh_reason: "ซ้ำ" }), 400);

    expectStatus(await as(people.hybrid, "GET", "/V1/attendance/wfh/pending"), 403);
    expectStatus(await as(people.hr, "GET", "/V1/attendance/wfh/pending"), 403, "จัดการพนักงานไม่ได้แปลว่าอนุมัติลงเวลา");
    const pending = expectStatus(await as(people.approver, "GET", "/V1/attendance/wfh/pending"), 200);
    assert.equal(pending.data[0].wfh_id, created.wfh_id);
    assert.equal(pending.data[0].employee_name, "บางวัน ทดสอบ");
    expectStatus(await as(people.approver, "POST", `/V1/attendance/wfh/${created.wfh_id}/approve`), 200);

    const own = expectStatus(await as(people.approver, "POST", "/V1/attendance/wfh", { wfh_date: nextMonday, wfh_reason: "x" }), 201);
    const ownApprove = expectStatus(await as(people.approver, "POST", `/V1/attendance/wfh/${own.wfh_id}/approve`), 409);
    assert.equal(ownApprove.code, "WFH_OWN");
    expectStatus(await as(people.approver, "POST", `/V1/attendance/wfh/${own.wfh_id}/reject`, {}), 400);

    const month = nextMonday.slice(0, 7);
    const mine = expectStatus(await as(people.hybrid, "GET", `/V1/attendance/me?month=${month}`), 200);
    assert.equal(mine.days.find((day) => day.work_date === nextMonday).is_wfh, true);
    assert.equal(mine.wfh_requests.find((row) => row.wfh_id === created.wfh_id).wfh_status, "approved");
    expectStatus(await as(people.hybrid, "POST", `/V1/attendance/wfh/${created.wfh_id}/cancel`), 200, "อนุมัติแล้วแต่ยังไม่ถึงวัน");
});
