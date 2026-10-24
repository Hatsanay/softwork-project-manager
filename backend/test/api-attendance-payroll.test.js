// ลงเวลา A-4 (2026-10-24) — รอบเงินเดือนคิดจากลงเวลา: หักสาย/ขาด (ลดเงินเดือนก่อนภาษี/ประกันสังคม) · OT ตามเวลาที่อยู่จริง
// · ส่งรอบไม่ได้ถ้ามีคำขอแก้เวลา/OT ค้างหรือวันลงเวลาไม่ครบ · ลานับวันทำงานตามกะ · วันก่อนเริ่มใช้ลงเวลาไม่หัก
// ใส่การกดของเดือนมีนาคม 2026 ลงฐานข้อมูลตรงๆ (เหมือนพนักงานกดมาทั้งเดือน) แล้วสร้างรอบเงินเดือน
const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { startTestServer } = require("./support/test-server");
const { createTestDepartment } = require("./support/test-department");
const { PERMISSION_KEYS } = require("../src/shared/permissions.mjs");
const { todayBangkok } = require("../src/utils/bangkok-time");
const { addDays, weekdayIndex } = require("../src/shared/payroll-math.mjs");

const PASSWORD = "Staff@2026";
const MARCH = "2026-03";
const LATE_DAY = "2026-03-03";
const ABSENT_DAY = "2026-03-04";
const OVERTIME_DAY = "2026-03-05";

let api;
let departmentId;
const people = {};

async function createPerson(name, permissionKeys, userNumber) {
    const bits = PERMISSION_KEYS.map((key) => (permissionKeys.includes(key) ? "1" : "0")).join("");
    const role = await api.callApi("POST", "/V1/roles", { body: { role_name: `role-${name}`, role_permission: bits } });
    assert.equal(role.status, 201, JSON.stringify(role.body));
    const userId = `USE20990107000${userNumber}`;
    await api.pool.query(
        `INSERT INTO tb_users (user_id, user_username, user_email, user_password, user_fname, user_lname, user_role_id, user_must_change_password)
         VALUES (?, ?, ?, ?, ?, 'ทดสอบ', ?, 0)`,
        [userId, name, `${name}@example.com`, await bcrypt.hash(PASSWORD, 10), name, role.body.role_id],
    );
    return { userId, token: await api.login(name, PASSWORD) };
}

function as(person, method, url, body) {
    return api.callApi(method, url, { token: person?.token, body });
}

function expectStatus(response, status, note) {
    assert.equal(response.status, status, `${note ?? ""} ${JSON.stringify(response.body)}`);
    return response.body;
}

async function punch(employeeId, type, dateTime) {
    await api.pool.query(
        `INSERT INTO tb_attendance_punches (ap_employee_id, ap_type, ap_at, ap_work_date, ap_source) VALUES (?, ?, ?, ?, 'mobile')`,
        [employeeId, type, dateTime, dateTime.slice(0, 10)],
    );
}

test.before(async () => {
    api = await startTestServer("attendance_payroll");
    await api.loginAsAdmin();
    departmentId = await createTestDepartment(api, "APY", "แผนกเงินเดือนลงเวลา");
    await api.pool.query("UPDATE tb_payroll_settings SET ps_attendance_start_date = '2026-01-01' WHERE ps_id = 1");
    people.hr = await createPerson("ap.hr", ["dashboard", "runPayroll", "viewPayroll"], 221);
    people.staff = await createPerson("ap.staff", ["dashboard"], 222);
    const created = await api.callApi("POST", "/V1/employees", {
        body: {
            emp_department_id: departmentId,
            emp_first_name_th: "ลงเวลา",
            emp_last_name_th: "เงินเดือน",
            emp_hire_date: "2026-01-05",
            emp_user_id: people.staff.userId,
            ecm_base_salary: "30000",
        },
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    people.staff.employeeId = created.body.emp_id;

    // มีนาคม 2026: มาทุกวันทำงาน (จ.-ศ.) 08:55-18:00 · 3 มี.ค. สาย 30 นาที · 4 มี.ค. ไม่มา · 5 มี.ค. อยู่ถึง 19:50 (OT 18:00-20:00)
    for (let date = `${MARCH}-01`; date <= `${MARCH}-31`; date = addDays(date, 1)) {
        if (weekdayIndex(date) > 4 || date === ABSENT_DAY) continue;
        await punch(people.staff.employeeId, "in", `${date} ${date === LATE_DAY ? "09:30:00" : "08:55:00"}`);
        await punch(people.staff.employeeId, "out", `${date} ${date === OVERTIME_DAY ? "19:50:00" : "18:00:00"}`);
    }
    await api.pool.query(
        `INSERT INTO tb_overtime_requests (ot_employee_id, ot_work_date, ot_start_at, ot_end_at, ot_workday_minutes, ot_reason, ot_status)
         VALUES (?, ?, ?, ?, 120, 'ปิดงาน', 'approved')`,
        [people.staff.employeeId, OVERTIME_DAY, `${OVERTIME_DAY} 18:00:00`, `${OVERTIME_DAY} 20:00:00`],
    );
});

test.after(async () => {
    await api?.stop();
});

test("รอบเงินเดือน: หักสาย 30 นาที + ขาด 1 วัน ก่อนคิดภาษี/ประกันสังคม · OT จ่ายตามเวลาที่อยู่จริงปัดลง 15 นาที", async () => {
    const created = expectStatus(await as(people.hr, "POST", "/V1/payroll/runs", { pr_period: MARCH, pr_pay_date: "2026-03-25" }), 201);
    const run = expectStatus(await as(people.hr, "GET", `/V1/payroll/runs/${created.pr_id}`), 200);
    const item = run.items.find((row) => row.pri_employee_id === people.staff.employeeId);

    // ค่าจ้างต่อชั่วโมง 30,000 ÷ 30 ÷ 8 = 125 · สาย 30 นาที = 62.50 · ขาด 1 วัน = 30,000 ÷ 30 = 1,000.00
    assert.equal(item.pri_late_minutes, 30);
    assert.equal(item.pri_early_leave_minutes, 0);
    assert.equal(item.pri_absent_days, 1);
    assert.equal(item.pri_attendance_deduction, "1062.50");
    // OT อนุมัติ 18:00-20:00 แต่อยู่ถึง 19:50 = 110 นาที ปัดลงเป็น 105 นาที × 125 × 1.5 = 328.13
    const overtimeLine = item.lines.find((line) => line.pil_source === "attendance");
    assert.match(overtimeLine.pil_label, /^OT วันทำงาน 1 ชม\. 45 นาที × 1\.5 เท่า$/);
    assert.equal(overtimeLine.pil_amount, "328.13");
    assert.equal(overtimeLine.pil_is_one_off, true);
    // เงินได้ = 30,000 − 1,062.50 + 328.13
    assert.equal(item.pri_gross, "29265.63");
    assert.equal(item.pri_sso_wage, "29265.63", "หักสาย/ขาดลดฐานประกันสังคม · OT นับค่าจ้างตามค่าเริ่มต้น");
    assert.deepEqual(run.readiness.problems, []);
});

test("ส่งรอบไม่ได้: มีคำขอแก้เวลา/OT ค้าง หรือวันลงเวลาไม่ครบ · คิดใหม่แล้วตัวเลขตาม", async () => {
    const staffId = people.staff.employeeId;
    await api.pool.query(
        `INSERT INTO tb_attendance_corrections (ac_employee_id, ac_work_date, ac_type, ac_requested_at, ac_reason)
         VALUES (?, ?, 'in', ?, 'ลืมกด')`,
        [staffId, ABSENT_DAY, `${ABSENT_DAY} 09:00:00`],
    );
    await api.pool.query(
        `INSERT INTO tb_overtime_requests (ot_employee_id, ot_work_date, ot_start_at, ot_end_at, ot_workday_minutes, ot_reason)
         VALUES (?, '2026-03-06', '2026-03-06 18:00:00', '2026-03-06 19:00:00', 60, 'รอ')`,
        [staffId],
    );
    // 10 มี.ค. มีเข้าแต่ไม่มีออก (ลบเวลาออก) = ไม่ครบ
    await api.pool.query(
        "DELETE FROM tb_attendance_punches WHERE ap_employee_id = ? AND ap_work_date = '2026-03-10' AND ap_type = 'out'",
        [staffId],
    );
    const runs = expectStatus(await as(people.hr, "GET", "/V1/payroll/runs"), 200);
    const runId = runs.data.find((row) => row.pr_period === MARCH).pr_id;
    const run = expectStatus(await as(people.hr, "GET", `/V1/payroll/runs/${runId}`), 200);
    const problems = run.readiness.problems.join(" | ");
    assert.match(problems, /คำขอแก้เวลารออนุมัติ 1 รายการ/);
    assert.match(problems, /OT รออนุมัติ 1 รายการ/);
    assert.match(problems, /ลงเวลาไม่ครบ 1 คน/);
    const submit = expectStatus(await as(people.hr, "POST", `/V1/payroll/runs/${runId}/submit`, { pr_version: run.pr_version }), 400);
    assert.equal(submit.code, "PAYROLL_NOT_READY");
});

test("ลานับวันทำงานตามกะ: กะที่ทำงานวันเสาร์ ลาวันเสาร์นับ 1 วัน · วันก่อนเริ่มใช้ลงเวลาไม่หักขาด", async () => {
    const nextYear = Number(todayBangkok().slice(0, 4)) + 1;
    let saturday = `${nextYear}-02-01`;
    while (weekdayIndex(saturday) !== 5) saturday = addDays(saturday, 1);
    const url = `/V1/leave/preview?start_date=${saturday}&end_date=${saturday}`;
    const before = expectStatus(await as(people.staff, "GET", url), 200);
    assert.equal(before.days, "0.00", "กะเริ่มต้น (จ.-ศ.) เสาร์ไม่ใช่วันทำงาน");

    const schedule = expectStatus(
        await api.callApi("POST", "/V1/people/work-schedules", {
            body: {
                ws_name: "หกวัน",
                ws_start_time: "09:00",
                ws_end_time: "18:00",
                ws_break_minutes: 60,
                ws_working_weekdays: "1111110",
                ws_late_grace_minutes: 0,
            },
        }),
        201,
    );
    expectStatus(
        await api.callApi("POST", `/V1/employees/${people.staff.employeeId}/schedules`, {
            body: { es_schedule_id: schedule.ws_id, es_effective_from: `${nextYear}-01-01` },
        }),
        201,
    );
    const after = expectStatus(await as(people.staff, "GET", url), 200);
    assert.equal(after.days, "1.00");

    // เริ่มใช้ลงเวลา 15 มี.ค. → ขาดวันที่ 4 ไม่ถูกหักแล้ว
    await api.pool.query("UPDATE tb_payroll_settings SET ps_attendance_start_date = '2026-03-15' WHERE ps_id = 1");
    const runs = expectStatus(await as(people.hr, "GET", "/V1/payroll/runs"), 200);
    const run = runs.data.find((row) => row.pr_period === MARCH);
    const current = expectStatus(await as(people.hr, "GET", `/V1/payroll/runs/${run.pr_id}`), 200);
    expectStatus(await as(people.hr, "POST", `/V1/payroll/runs/${run.pr_id}/recalculate`, { pr_version: current.pr_version }), 200);
    const recalculated = expectStatus(await as(people.hr, "GET", `/V1/payroll/runs/${run.pr_id}`), 200);
    const item = recalculated.items.find((row) => row.pri_employee_id === people.staff.employeeId);
    assert.equal(item.pri_absent_days, 0);
    assert.equal(item.pri_late_minutes, 0);
    // OT ที่อนุมัติแล้วและมีเวลาเข้า-ออกจริงยังจ่าย (ไม่ติดตามแค่เรื่องสาย/ขาด)
    assert.equal(item.lines.some((line) => line.pil_source === "attendance"), true);
});
