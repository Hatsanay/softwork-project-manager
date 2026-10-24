// ลงเวลา A-2 (2026-10-24) — ขอแก้เวลา (ลืมกด) · อนุมัติ/ไม่อนุมัติ/ยกเลิก · ของตัวเองอนุมัติไม่ได้ · กระดานวันนี้ · สรุปเดือน · สิทธิ์
// ยิงผ่านเซิร์ฟเวอร์จริงบนฐานข้อมูลชั่วคราว · แบบระบบ: docs/plans/2026-10-23-attendance-ot.md
const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { startTestServer } = require("./support/test-server");
const { createTestDepartment } = require("./support/test-department");
const { PERMISSION_KEYS } = require("../src/shared/permissions.mjs");
const { todayBangkok } = require("../src/utils/bangkok-time");
const { addDays, weekdayIndex } = require("../src/shared/payroll-math.mjs");

const PASSWORD = "Staff@2026";
const today = todayBangkok();

// วันทำงาน (จันทร์-ศุกร์) ล่าสุดก่อนวันนี้ อย่างน้อย 1 วัน
function lastWeekday() {
    let date = addDays(today, -1);
    while (weekdayIndex(date) > 4) date = addDays(date, -1);
    return date;
}
const workDate = lastWeekday();

let api;
let departmentId;
const people = {};

async function createPerson(name, permissionKeys, userNumber) {
    const bits = PERMISSION_KEYS.map((key) => (permissionKeys.includes(key) ? "1" : "0")).join("");
    const role = await api.callApi("POST", "/V1/roles", { body: { role_name: `role-${name}`, role_permission: bits } });
    assert.equal(role.status, 201, JSON.stringify(role.body));
    const userId = `USE20990105000${userNumber}`;
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

const correction = (overrides = {}) => ({
    ac_work_date: workDate,
    ac_type: "in",
    ac_time: "08:55",
    ac_reason: "ลืมกดเข้างาน",
    ...overrides,
});

test.before(async () => {
    api = await startTestServer("attendance_corrections");
    await api.loginAsAdmin();
    departmentId = await createTestDepartment(api, "ACR", "แผนกแก้เวลา");
    // เริ่มใช้ลงเวลาตั้งแต่ต้นปี (deploy ตั้งเป็นวันนี้ — วันก่อนหน้าขอแก้ไม่ได้)
    await api.pool.query("UPDATE tb_payroll_settings SET ps_attendance_start_date = '2026-01-01' WHERE ps_id = 1");
    people.staff = await createPerson("ac.staff", ["dashboard"], 201);
    people.approver = await createPerson("ac.approver", ["dashboard", "approveTimesheet"], 202);
    people.hr = await createPerson("ac.hr", ["dashboard", "manageEmployees"], 203);
    people.staff.employeeId = await createEmployee("ขอแก้", people.staff.userId);
    people.approver.employeeId = await createEmployee("ผู้อนุมัติ", people.approver.userId);
});

test.after(async () => {
    await api?.stop();
});

test("ขอแก้เวลา: ก่อนวันเริ่มงาน/อนาคตไม่ได้ · ขอซ้ำที่ยังรออยู่ไม่ได้ · ยกเลิกเองได้ · ของคนอื่นยกเลิกไม่ได้", async () => {
    const beforeHire = expectStatus(await as(people.staff, "POST", "/V1/attendance/corrections", correction({ ac_work_date: "2026-01-02" })), 400);
    assert.ok(beforeHire.fields.ac_work_date);
    const future = expectStatus(
        await as(people.staff, "POST", "/V1/attendance/corrections", correction({ ac_work_date: addDays(today, 1) })),
        400,
    );
    assert.match(future.fields.ac_time, /อนาคต/);
    const missingReason = expectStatus(
        await as(people.staff, "POST", "/V1/attendance/corrections", correction({ ac_reason: "" })),
        400,
    );
    assert.ok(missingReason.fields.ac_reason);

    const created = expectStatus(await as(people.staff, "POST", "/V1/attendance/corrections", correction()), 201);
    assert.equal(created.ac_requested_at, `${workDate} 08:55:00`);
    const duplicate = expectStatus(await as(people.staff, "POST", "/V1/attendance/corrections", correction()), 409);
    assert.equal(duplicate.code, "CORRECTION_DUPLICATE");

    expectStatus(await as(people.approver, "POST", `/V1/attendance/corrections/${created.ac_id}/cancel`), 404, "ของคนอื่น");
    expectStatus(await as(people.staff, "POST", `/V1/attendance/corrections/${created.ac_id}/cancel`), 200);
    const mine = expectStatus(await as(people.staff, "GET", "/V1/attendance/me"), 200);
    assert.equal(mine.corrections.find((row) => row.ac_id === created.ac_id).ac_status, "cancelled");
});

test("อนุมัติ: ได้การกดที่มา correction วันนั้นมีเวลาเข้า · ไม่อนุมัติต้องมีเหตุผล · ของตัวเองอนุมัติไม่ได้ · ต้องมีสิทธิ์", async () => {
    const inRequest = expectStatus(await as(people.staff, "POST", "/V1/attendance/corrections", correction()), 201);
    const outRequest = expectStatus(
        await as(people.staff, "POST", "/V1/attendance/corrections", correction({ ac_type: "out", ac_time: "18:10", ac_reason: "ลืมกดออก" })),
        201,
    );
    expectStatus(await as(people.staff, "GET", "/V1/attendance/corrections/pending"), 403);
    expectStatus(await as(people.hr, "POST", `/V1/attendance/corrections/${inRequest.ac_id}/approve`), 403, "จัดการพนักงานไม่ได้แปลว่าอนุมัติลงเวลา");

    const pending = expectStatus(await as(people.approver, "GET", "/V1/attendance/corrections/pending"), 200);
    assert.deepEqual(
        pending.data.map((row) => row.ac_id).sort(),
        [inRequest.ac_id, outRequest.ac_id].sort(),
    );
    assert.equal(pending.data[0].employee_name, "ขอแก้ ทดสอบ");

    const approved = expectStatus(await as(people.approver, "POST", `/V1/attendance/corrections/${inRequest.ac_id}/approve`), 200);
    expectStatus(await as(people.approver, "POST", `/V1/attendance/corrections/${inRequest.ac_id}/approve`), 409, "อนุมัติซ้ำ");
    const [[punch]] = await api.pool.query(
        "SELECT ap_type, ap_source, DATE_FORMAT(ap_at, '%Y-%m-%d %H:%i:%s') AS ap_at, ap_created_by FROM tb_attendance_punches WHERE ap_id = ?",
        [approved.ap_id],
    );
    assert.deepEqual(punch, { ap_type: "in", ap_source: "correction", ap_at: `${workDate} 08:55:00`, ap_created_by: people.approver.userId });

    expectStatus(await as(people.approver, "POST", `/V1/attendance/corrections/${outRequest.ac_id}/reject`, {}), 400);
    expectStatus(
        await as(people.approver, "POST", `/V1/attendance/corrections/${outRequest.ac_id}/reject`, { reason: "เวลาไม่ตรงกับกล้อง" }),
        200,
    );

    // วันนั้นมีเข้า แต่ออกถูกปฏิเสธ = ยังไม่ครบ
    const month = workDate.slice(0, 7);
    const detail = expectStatus(await as(people.hr, "GET", `/V1/attendance/employees/${people.staff.employeeId}?month=${month}`), 200);
    const day = detail.days.find((item) => item.work_date === workDate);
    assert.equal(day.first_in, `${workDate} 08:55:00`);
    assert.equal(day.status, "incomplete");
    assert.equal(detail.corrections.find((row) => row.ac_id === outRequest.ac_id).ac_decision_note, "เวลาไม่ตรงกับกล้อง");

    const own = expectStatus(
        await as(people.approver, "POST", "/V1/attendance/corrections", correction({ ac_reason: "ลืมกด" })),
        201,
    );
    const ownApprove = expectStatus(await as(people.approver, "POST", `/V1/attendance/corrections/${own.ac_id}/approve`), 409);
    assert.equal(ownApprove.code, "CORRECTION_OWN");
    const pendingNow = expectStatus(await as(people.approver, "GET", "/V1/attendance/corrections/pending"), 200);
    assert.equal(pendingNow.data.some((row) => row.ac_id === own.ac_id), false, "ของตัวเองไม่ขึ้นในรายการรออนุมัติ");
});

test("กระดานวันนี้และสรุปเดือน: เฉพาะฝ่ายบุคคล/ผู้อนุมัติลงเวลา · นับไม่ครบ/ขาดได้", async () => {
    expectStatus(await as(people.staff, "GET", "/V1/attendance/board"), 403);
    expectStatus(await as(people.staff, "GET", "/V1/attendance/summary"), 403);

    const board = expectStatus(await as(people.hr, "GET", `/V1/attendance/board?date=${workDate}`), 200);
    assert.equal(board.date, workDate);
    assert.equal(board.counts.total, 2);
    const staffRow = board.rows.find((row) => row.emp_id === people.staff.employeeId);
    assert.equal(staffRow.day.status, "incomplete");
    assert.equal(board.counts.incomplete >= 1, true);

    const summary = expectStatus(await as(people.approver, "GET", `/V1/attendance/summary?month=${workDate.slice(0, 7)}`), 200);
    const staffSummary = summary.rows.find((row) => row.emp_id === people.staff.employeeId);
    assert.ok(staffSummary.incomplete_dates.includes(workDate));
    assert.equal(staffSummary.totals.incomplete >= 1, true);

    const overview = expectStatus(await as(people.approver, "GET", "/V1/people/overview"), 200);
    assert.equal(typeof overview.pending.attendance_corrections, "number");
    assert.equal(overview.attendance_today.total, 2);
});
