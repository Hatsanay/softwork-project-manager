// หน้าของฉัน + ภาพรวมบุคคล (2026-10-19 — docs/plans/2026-10-19-people-ux-redesign.md ข้อ 2.1–2.2)
const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { startTestServer } = require("./support/test-server");
const { createTestDepartment } = require("./support/test-department");
const { todayBangkok } = require("../src/utils/bangkok-time");

const PASSWORD = "Staff@2026";
const STAFF_ID = "USE209901010000001";

let api;
let staffToken;
let departmentId;

function expectStatus(response, status) {
    assert.equal(response.status, status, JSON.stringify(response.body));
    return response.body;
}

test.before(async () => {
    api = await startTestServer("people_overview");
    await api.loginAsAdmin();
    departmentId = await createTestDepartment(api, "OVR", "แผนกภาพรวม");
    await api.pool.query(
        `INSERT INTO tb_users (user_id, user_username, user_email, user_password, user_fname, user_lname, user_must_change_password)
         VALUES (?, 'staff.overview', 'staff.overview@example.com', ?, 'พนักงาน', 'ภาพรวม', 0)`,
        [STAFF_ID, await bcrypt.hash(PASSWORD, 10)],
    );
    staffToken = await api.login("staff.overview", PASSWORD);
});

test.after(async () => {
    await api?.stop();
});

test("หน้าของฉัน: ยังไม่ผูกพนักงาน = employee null · ผูกแล้วได้ข้อมูลงานและบัตร ไม่มีเงินเดือน/เลขประจำตัว", async () => {
    const before = expectStatus(await api.callApi("GET", "/V1/people/me", { token: staffToken }), 200);
    assert.equal(before.employee, null);

    await api.callApi("POST", "/V1/employees", {
        body: {
            emp_user_id: STAFF_ID,
            emp_first_name_th: "สมใจ",
            emp_last_name_th: "ภาพรวม",
            emp_nickname: "ใจ",
            emp_national_id: null,
            emp_department_id: departmentId,
            emp_position: "นักพัฒนา",
            emp_hire_date: "2026-01-05",
            ecm_base_salary: "30000",
        },
    });
    const mine = expectStatus(await api.callApi("GET", "/V1/people/me", { token: staffToken }), 200);
    assert.equal(mine.employee.emp_first_name_th, "สมใจ");
    assert.equal(mine.employee.department_name, "แผนกภาพรวม");
    assert.equal(mine.card.ec_seq, 1);
    assert.equal(mine.employee.emp_national_id, undefined, "ไม่ส่งข้อมูลอ่อนไหว");
    assert.equal(mine.employee.ecm_base_salary, undefined);
});

test("ภาพรวมบุคคล: พนักงานทั่วไปเปิดไม่ได้ · ผู้ดูแลเห็นตัวเลขครบ (คน · บัตร · ข้อมูลไม่ครบ · รอบเงินเดือนที่ยังไม่สร้าง)", async () => {
    expectStatus(await api.callApi("GET", "/V1/people/overview", { token: staffToken }), 403);

    const overview = expectStatus(await api.callApi("GET", "/V1/people/overview"), 200);
    assert.equal(overview.today, todayBangkok());
    assert.equal(overview.headcount.working, 1);
    assert.equal(overview.cards.pending_print, 1, "บัตรใบแรกของพนักงานใหม่รอพิมพ์");
    assert.equal(overview.pending.leave, 0);
    assert.equal(overview.incomplete_employees.length, 1);
    assert.deepEqual(overview.incomplete_employees[0].missing, ["เลขประจำตัวประชาชน", "ที่อยู่", "บัญชีรับเงินเดือน"]);
    assert.equal(overview.payroll.latest_run, null);
    assert.match(overview.payroll.missing_period, /^\d{4}-\d{2}$/);
    assert.deepEqual(overview.on_leave_today, []);
});
