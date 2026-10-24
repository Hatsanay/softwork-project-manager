// ลงเวลา A-3 (2026-10-24) — ขอ OT · ตัวอย่างก่อนส่ง · ชนิด (วันทำงาน/วันหยุด) · ทับเวลางาน/ทับกันไม่ได้ · เพดานต่อสัปดาห์
// · อนุมัติ/ไม่อนุมัติ/ยกเลิก · ของตัวเองอนุมัติไม่ได้ · ไม่ต้องลงเวลาขอไม่ได้ · สิทธิ์
// ยิงผ่านเซิร์ฟเวอร์จริงบนฐานข้อมูลชั่วคราว · ใช้สัปดาห์หน้า (ขอล่วงหน้า) จึงไม่ขึ้นกับเวลาที่รันเทสต์
const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { startTestServer } = require("./support/test-server");
const { createTestDepartment } = require("./support/test-department");
const { PERMISSION_KEYS } = require("../src/shared/permissions.mjs");
const { todayBangkok } = require("../src/utils/bangkok-time");
const { addDays, weekStartOf } = require("../src/shared/payroll-math.mjs");

const PASSWORD = "Staff@2026";
const nextMonday = addDays(weekStartOf(todayBangkok()), 7);
const nextTuesday = addDays(nextMonday, 1);
const nextSaturday = addDays(nextMonday, 5);

let api;
let departmentId;
const people = {};

async function createPerson(name, permissionKeys, userNumber) {
    const bits = PERMISSION_KEYS.map((key) => (permissionKeys.includes(key) ? "1" : "0")).join("");
    const role = await api.callApi("POST", "/V1/roles", { body: { role_name: `role-${name}`, role_permission: bits } });
    assert.equal(role.status, 201, JSON.stringify(role.body));
    const userId = `USE20990106000${userNumber}`;
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

const overtime = (overrides = {}) => ({
    ot_work_date: nextMonday,
    ot_start_time: "18:00",
    ot_end_time: "20:00",
    ot_reason: "ปิดงานส่งลูกค้า",
    ...overrides,
});

function previewUrl(request) {
    const { ot_reason: _reason, ...query } = request;
    void _reason;
    return `/V1/attendance/overtime/preview?${new URLSearchParams(query)}`;
}

test.before(async () => {
    api = await startTestServer("attendance_overtime");
    await api.loginAsAdmin();
    departmentId = await createTestDepartment(api, "AOT", "แผนก OT");
    people.staff = await createPerson("ot.staff", ["dashboard"], 211);
    people.approver = await createPerson("ot.approver", ["dashboard", "approveTimesheet"], 212);
    people.boss = await createPerson("ot.boss", ["dashboard"], 213);
    people.staff.employeeId = await createEmployee("ขอโอที", people.staff.userId);
    people.approver.employeeId = await createEmployee("อนุมัติโอที", people.approver.userId);
    people.boss.employeeId = await createEmployee("ผู้บริหาร", people.boss.userId);
    await api.pool.query("UPDATE tb_employees SET emp_attendance_required = 0 WHERE emp_id = ?", [people.boss.employeeId]);
});

test.after(async () => {
    await api?.stop();
});

test("ตัวอย่างและขอ: วันทำงานนอกเวลางาน 1.5 · ทับเวลางานไม่ได้ · ทับ OT อื่นไม่ได้ · วันหยุดแยกในเวลาปกติ/นอกเวลา", async () => {
    const preview = expectStatus(await as(people.staff, "GET", previewUrl(overtime())), 200);
    assert.equal(preview.workday_minutes, 120);
    assert.equal(preview.rates.workday, "1.50");
    assert.equal(preview.week.cap_minutes, 36 * 60);
    assert.equal(preview.is_after_the_fact, false);

    const overlapNormal = expectStatus(
        await as(people.staff, "POST", "/V1/attendance/overtime", overtime({ ot_start_time: "17:00", ot_end_time: "19:00" })),
        400,
    );
    assert.match(overlapNormal.fields.ot_start_time, /ทับเวลางานปกติ/);
    const badMinute = expectStatus(
        await as(people.staff, "POST", "/V1/attendance/overtime", overtime({ ot_end_time: "20:10" })),
        400,
    );
    assert.ok(badMinute.fields.ot_end_time);

    expectStatus(await as(people.staff, "POST", "/V1/attendance/overtime", overtime()), 201);
    const overlapOther = expectStatus(
        await as(people.staff, "POST", "/V1/attendance/overtime", overtime({ ot_start_time: "19:00", ot_end_time: "21:00" })),
        400,
    );
    assert.match(overlapOther.fields.ot_start_time, /ทับกับคำขอ OT อื่น/);

    const saturday = expectStatus(
        await as(people.staff, "POST", "/V1/attendance/overtime", overtime({ ot_work_date: nextSaturday, ot_start_time: "09:00", ot_end_time: "20:00" })),
        201,
    );
    assert.equal(saturday.holiday_work_minutes, 480);
    assert.equal(saturday.holiday_ot_minutes, 180);
    assert.equal(saturday.is_off_day, true);
});

test("เพดานต่อสัปดาห์: นับ OT วันทำงาน + OT วันหยุด (ไม่นับทำงานวันหยุดในเวลาปกติ) · รวมที่รออนุมัติ", async () => {
    await api.pool.query("UPDATE tb_payroll_settings SET ps_ot_weekly_cap_hours = 6 WHERE ps_id = 1");
    // ใช้ไปแล้ว 2 ชม. (จันทร์) + 3 ชม. (OT วันหยุดเสาร์) = 5 ชม. → ขออีก 2 ชม. = 7 เกิน 6
    const preview = expectStatus(await as(people.staff, "GET", previewUrl(overtime({ ot_work_date: nextTuesday }))), 200);
    assert.equal(preview.week.used_minutes, 300);
    assert.equal(preview.is_over_cap, true);
    const over = expectStatus(await as(people.staff, "POST", "/V1/attendance/overtime", overtime({ ot_work_date: nextTuesday })), 409);
    assert.equal(over.code, "OVERTIME_OVER_CAP");
    expectStatus(
        await as(people.staff, "POST", "/V1/attendance/overtime", overtime({ ot_work_date: nextTuesday, ot_end_time: "19:00" })),
        201,
        "1 ชม. พอดีเพดาน",
    );
    await api.pool.query("UPDATE tb_payroll_settings SET ps_ot_weekly_cap_hours = 36 WHERE ps_id = 1");
});

test("อนุมัติ/ไม่อนุมัติ/ยกเลิก: ต้องมีสิทธิ์ · ของตัวเองไม่ได้ · ไม่อนุมัติต้องมีเหตุผล · อนุมัติแล้วยกเลิกได้ก่อนถึงเวลา", async () => {
    expectStatus(await as(people.staff, "GET", "/V1/attendance/overtime/pending"), 403);
    const pending = expectStatus(await as(people.approver, "GET", "/V1/attendance/overtime/pending"), 200);
    assert.equal(pending.data.length, 3);
    const monday = pending.data.find((row) => row.ot_work_date === nextMonday);
    const saturday = pending.data.find((row) => row.ot_work_date === nextSaturday);
    assert.equal(monday.employee_name, "ขอโอที ทดสอบ");

    expectStatus(await as(people.approver, "POST", `/V1/attendance/overtime/${monday.ot_id}/approve`), 200);
    expectStatus(await as(people.approver, "POST", `/V1/attendance/overtime/${saturday.ot_id}/reject`, {}), 400);
    expectStatus(await as(people.approver, "POST", `/V1/attendance/overtime/${saturday.ot_id}/reject`, { reason: "ไม่มีงานด่วน" }), 200);

    const own = expectStatus(await as(people.approver, "POST", "/V1/attendance/overtime", overtime()), 201);
    const ownApprove = expectStatus(await as(people.approver, "POST", `/V1/attendance/overtime/${own.ot_id}/approve`), 409);
    assert.equal(ownApprove.code, "OVERTIME_OWN");

    const mine = expectStatus(await as(people.staff, "GET", "/V1/attendance/me"), 200);
    const approved = mine.overtime.find((row) => row.ot_id === monday.ot_id);
    assert.equal(approved.ot_status, "approved");
    assert.equal(approved.actual_minutes, null, "ยังไม่ถึงวัน = ยังไม่มีเวลาทำจริง");
    assert.equal(mine.overtime.find((row) => row.ot_id === saturday.ot_id).ot_decision_note, "ไม่มีงานด่วน");
    expectStatus(await as(people.staff, "POST", `/V1/attendance/overtime/${monday.ot_id}/cancel`), 200, "อนุมัติแล้วแต่ยังไม่ถึงเวลา");
    expectStatus(await as(people.approver, "POST", `/V1/attendance/overtime/${own.ot_id}/cancel`), 200);
});

test("ไม่ต้องลงเวลา = ขอ OT ไม่ได้ (จ่ายตามเวลาเข้า-ออกจริง)", async () => {
    const blocked = expectStatus(await as(people.boss, "POST", "/V1/attendance/overtime", overtime()), 409);
    assert.equal(blocked.code, "ATTENDANCE_NOT_REQUIRED");
});
