// รหัสแผนก/รหัสพนักงาน · ย้ายแผนก/สาขา · บัตรพนักงาน (2026-10-18)
// ยิงผ่านเซิร์ฟเวอร์จริงบนฐานข้อมูลชั่วคราว · แบบระบบ: docs/plans/2026-10-18-employee-department-codes.md (ข้อ 2–3, R1–R10)
const test = require("node:test");
const assert = require("node:assert/strict");
const { startTestServer, createTestImage } = require("./support/test-server");
const { HEAD_OFFICE_ID } = require("./support/test-department");
const { todayBangkok } = require("../src/utils/bangkok-time");

const BRANCH_ID = "BRA209901010000001"; // สาขาที่ 2 (00001)

let api;
const departments = {};

function expectStatus(response, status) {
    assert.equal(response.status, status, JSON.stringify(response.body));
    return response.body;
}

function call(method, url, body) {
    return api.callApi(method, url, { body });
}

async function createDepartment(name, abbr, branchId = HEAD_OFFICE_ID) {
    return expectStatus(await call("POST", "/V1/departments", { dep_name: name, dep_branch_id: branchId, dep_abbr: abbr }), 201);
}

async function createEmployee(name, departmentId, hireDate) {
    return expectStatus(
        await call("POST", "/V1/employees", {
            emp_first_name_th: name,
            emp_last_name_th: "ทดสอบรหัส",
            emp_department_id: departmentId,
            emp_hire_date: hireDate,
            ecm_base_salary: "25000",
        }),
        201,
    );
}

async function detail(employeeId) {
    return expectStatus(await call("GET", `/V1/employees/${employeeId}`), 200);
}

function bodyFor(employee, overrides = {}) {
    return {
        emp_title: employee.emp_title,
        emp_first_name_th: employee.emp_first_name_th,
        emp_last_name_th: employee.emp_last_name_th,
        emp_department_id: employee.emp_department_id,
        emp_hire_date: employee.emp_hire_date,
        emp_sso_enrolled: employee.emp_sso_enrolled,
        ...overrides,
    };
}

/** จำลองว่าพนักงานอยู่ในรอบเงินเดือนแล้ว (ตรวจเฉพาะการล็อกรหัส — การคำนวณเงินเดือนมีเทสต์ของตัวเอง) */
async function putInPayroll(employee, period) {
    const [run] = await api.pool.query(
        "INSERT INTO tb_payroll_runs (pr_period, pr_number, pr_pay_date, pr_status) VALUES (?, ?, ?, 'paid')",
        [period, `PR-${period}`, `${period}-25`],
    );
    await api.pool.query(
        `INSERT INTO tb_payroll_items (pri_run_id, pri_employee_id, pri_emp_code, pri_full_name, pri_employed_days, pri_days_in_month,
                                       pri_base_salary, pri_salary_amount)
         VALUES (?, ?, ?, ?, 30, 30, 25000, 25000)`,
        [run.insertId, employee.emp_id, employee.emp_code, employee.emp_first_name_th],
    );
}

test.before(async () => {
    api = await startTestServer("employee_codes");
    await api.loginAsAdmin();
    await api.pool.query(
        "INSERT INTO tb_branches (branch_id, branch_code, branch_name_th) VALUES (?, '00001', 'สาขาเชียงใหม่')",
        [BRANCH_ID],
    );
    departments.accounting = await createDepartment("บัญชี", "acc");
    departments.it = await createDepartment("ไอที", "ITD");
    departments.itBranch = await createDepartment("ไอที", "ITD", BRANCH_ID);
});

test.after(async () => {
    await api?.stop();
});

test("แผนก: รหัส = รหัสสาขา + ตัวย่อ (ตัวพิมพ์ใหญ่) · ชื่อซ้ำได้ข้ามสาขา · ตัวย่อซ้ำในสาขาไม่ได้ · ตัวย่อต้อง 3 ตัว", async () => {
    assert.equal(departments.accounting.dep_code, "00000ACC");
    assert.equal(departments.itBranch.dep_code, "00001ITD");

    const sameAbbr = await call("POST", "/V1/departments", { dep_name: "บัญชีสอง", dep_branch_id: HEAD_OFFICE_ID, dep_abbr: "ACC" });
    assert.equal(sameAbbr.status, 409);
    assert.ok(sameAbbr.body.fields.dep_abbr);
    const sameName = await call("POST", "/V1/departments", { dep_name: "บัญชี", dep_branch_id: HEAD_OFFICE_ID, dep_abbr: "AC2" });
    assert.equal(sameName.status, 409);
    const shortAbbr = await call("POST", "/V1/departments", { dep_name: "ขาย", dep_branch_id: HEAD_OFFICE_ID, dep_abbr: "SA" });
    assert.equal(shortAbbr.status, 400);
    assert.ok(shortAbbr.body.fields.dep_abbr);
});

test("รหัสพนักงาน 18 ตัว: รหัสแผนก + วันเริ่มงาน + ลำดับ · ลำดับนับรวมทั้งบริษัทต่อวัน · สร้างพร้อมกันไม่ซ้ำ (R1) · บัตรใบแรกรอพิมพ์", async () => {
    const first = await createEmployee("ก", departments.accounting.dep_id, "2026-03-02");
    const second = await createEmployee("ข", departments.itBranch.dep_id, "2026-03-02");
    assert.equal(first.emp_code, "00000ACC2603020001");
    assert.equal(second.emp_code, "00001ITD2603020002", "วันเดียวกันต่างแผนก ลำดับต่อกัน");

    const parallel = await Promise.all(
        ["ค", "ง", "จ", "ฉ", "ช"].map((name) => createEmployee(name, departments.it.dep_id, "2026-03-09")),
    );
    const codes = parallel.map((row) => row.emp_code).sort();
    assert.deepEqual(codes, [1, 2, 3, 4, 5].map((n) => `00000ITD260309000${n}`));

    const employee = await detail(first.emp_id);
    assert.equal(employee.emp_branch_id, HEAD_OFFICE_ID, "สาขา = สาขาของแผนก");
    assert.deepEqual(
        employee.code_history.map((row) => [row.ecd_code, row.ecd_reason, row.ecd_valid_to]),
        [["00000ACC2603020001", "hire", null]],
    );
    assert.equal(employee.cards.length, 1);
    assert.equal(employee.cards[0].ec_reason, "first_issue");
    assert.equal(employee.cards[0].ec_emp_code, first.emp_code);
    assert.equal(employee.cards[0].ec_printed_at, null);

    const queue = expectStatus(await call("GET", "/V1/employee-cards?kind=pending_print"), 200);
    assert.ok(queue.data.some((card) => card.ec_employee_id === first.emp_id));
});

test("แก้วันเริ่มงาน/แผนกก่อนเข้ารอบเงินเดือน = รหัสใหม่ + บัตรใหม่ · หลังเข้ารอบ แก้ในฟอร์มไม่ได้", async () => {
    const created = await createEmployee("แก้", departments.accounting.dep_id, "2026-04-01");
    let employee = await detail(created.emp_id);
    const updated = expectStatus(
        await call("PUT", `/V1/employees/${created.emp_id}`, bodyFor(employee, { emp_hire_date: "2026-04-06" })),
        200,
    );
    assert.equal(updated.code_changed, true);
    assert.match(updated.emp_code, /^00000ACC260406\d{4}$/);
    employee = await detail(created.emp_id);
    assert.deepEqual(employee.code_history.map((row) => row.ecd_reason), ["correction", "hire"]);
    assert.equal(employee.cards.filter((card) => card.ec_voided_at === null).length, 1, "บัตรใช้ได้ใบเดียว (R10)");
    assert.equal(employee.cards[0].ec_emp_code, updated.emp_code);

    // แก้ชื่อเฉย ๆ รหัสไม่เปลี่ยน
    const renamed = expectStatus(
        await call("PUT", `/V1/employees/${created.emp_id}`, bodyFor(employee, { emp_first_name_th: "แก้ชื่อ" })),
        200,
    );
    assert.equal(renamed.code_changed, false);

    await putInPayroll({ ...employee, emp_code: updated.emp_code }, "2026-04");
    employee = await detail(created.emp_id);
    assert.equal(employee.code_locked_by_payroll, "2026-04");
    const locked = await call(
        "PUT",
        `/V1/employees/${created.emp_id}`,
        bodyFor(employee, { emp_hire_date: "2026-04-07", emp_department_id: departments.it.dep_id }),
    );
    assert.equal(locked.status, 400);
    assert.ok(locked.body.fields.emp_hire_date);
    assert.match(locked.body.fields.emp_department_id, /ย้ายแผนก/);
});

test("ย้ายแผนก/สาขา: รหัสใหม่ใช้วันเริ่มงานเดิม · ประวัติ · บัตรเดิมยกเลิก + ใบใหม่ · ค้นด้วยรหัสเก่าเจอ · กดซ้ำ 409 (R7, R9)", async () => {
    const today = todayBangkok();
    const created = await createEmployee("ย้าย", departments.accounting.dep_id, "2026-01-05");
    const before = await detail(created.emp_id);

    const tooEarly = await call("POST", `/V1/employees/${created.emp_id}/transfer`, {
        emp_department_id: departments.itBranch.dep_id,
        effective_date: "2026-01-04",
        reason: "ย้ายไปดูแลระบบสาขา",
    });
    assert.equal(tooEarly.status, 400);
    assert.ok(tooEarly.body.fields.effective_date);

    const moved = expectStatus(
        await call("POST", `/V1/employees/${created.emp_id}/transfer`, {
            emp_department_id: departments.itBranch.dep_id,
            effective_date: today,
            reason: "ย้ายไปดูแลระบบสาขา",
        }),
        200,
    );
    assert.equal(moved.old_code, before.emp_code);
    assert.match(moved.emp_code, /^00001ITD260105\d{4}$/, "แผนกใหม่ + วันเริ่มงานเดิม (T1-ก)");

    const after = await detail(created.emp_id);
    assert.equal(after.emp_department_id, departments.itBranch.dep_id);
    assert.equal(after.emp_branch_id, BRANCH_ID);
    assert.deepEqual(
        after.code_history.map((row) => [row.ecd_code, row.ecd_reason, row.ecd_valid_to === null]),
        [
            [moved.emp_code, "transfer", true],
            [before.emp_code, "hire", false],
        ],
    );
    const activeCards = after.cards.filter((card) => card.ec_voided_at === null);
    assert.equal(activeCards.length, 1);
    assert.equal(activeCards[0].ec_seq, 2);
    assert.equal(activeCards[0].ec_emp_code, moved.emp_code);
    assert.equal(after.cards.find((card) => card.ec_seq === 1).ec_void_reason, "ย้ายแผนก/สาขา");

    const search = expectStatus(await call("GET", `/V1/employees?search=${before.emp_code}`), 200);
    assert.equal(search.data[0].emp_id, created.emp_id, "ค้นด้วยรหัสเก่าเจอ");

    const again = await call("POST", `/V1/employees/${created.emp_id}/transfer`, {
        emp_department_id: departments.itBranch.dep_id,
        effective_date: today,
        reason: "กดซ้ำ",
    });
    assert.equal(again.status, 409);

    // แผนกที่มีพนักงานแล้ว เปลี่ยนตัวย่อไม่ได้ (ต้องสร้างแผนกใหม่แล้วย้าย)
    const rename = await call("PUT", `/V1/departments/${departments.itBranch.dep_id}`, {
        dep_name: "ไอที",
        dep_branch_id: BRANCH_ID,
        dep_abbr: "ITX",
    });
    assert.equal(rename.status, 409);
    assert.equal(rename.body.code, "DEPARTMENT_HAS_EMPLOYEES");
});

test("บัตร: ออกใหม่เพราะหาย = รหัสเดิม ใบที่ N+1 · พิมพ์แล้ว · เก็บคืนได้เฉพาะใบที่ยกเลิก/คนพ้นสภาพ", async () => {
    const created = await createEmployee("บัตร", departments.accounting.dep_id, "2026-02-02");
    let employee = await detail(created.emp_id);
    const firstCard = employee.cards[0];
    expectStatus(await call("POST", `/V1/employees/${created.emp_id}/cards/${firstCard.ec_id}/printed`, {}), 200);

    const stillActive = await call("POST", `/V1/employees/${created.emp_id}/cards/${firstCard.ec_id}/returned`, {});
    assert.equal(stillActive.status, 409);

    expectStatus(await call("POST", `/V1/employees/${created.emp_id}/cards`, { ec_reason: "lost", ec_note: "หายที่ลานจอดรถ" }), 201);
    employee = await detail(created.emp_id);
    assert.deepEqual(
        employee.cards.map((card) => [card.ec_seq, card.ec_emp_code, card.ec_voided_at === null]),
        [
            [2, created.emp_code, true],
            [1, created.emp_code, false],
        ],
    );
    const notReturned = expectStatus(await call("GET", "/V1/employee-cards?kind=not_returned"), 200);
    assert.ok(notReturned.data.some((card) => card.ec_id === firstCard.ec_id));
    expectStatus(await call("POST", `/V1/employees/${created.emp_id}/cards/${firstCard.ec_id}/returned`, {}), 200);
    const again = await call("POST", `/V1/employees/${created.emp_id}/cards/${firstCard.ec_id}/returned`, {});
    assert.equal(again.status, 409);
});

test("รูปบนบัตร: อัปโหลดแล้วบัตรที่รอพิมพ์ใช้รูปใหม่ · บัตรที่พิมพ์แล้วไม่เปลี่ยน · คนพ้นสภาพไม่อยู่ในคิวรอพิมพ์", async () => {
    const created = await createEmployee("รูป", departments.accounting.dep_id, "2026-02-03");
    let employee = await detail(created.emp_id);
    assert.equal(employee.cards[0].ec_photo_url, null);

    const form = new FormData();
    form.append("photo", await createTestImage(), "face.png");
    const uploaded = expectStatus(await call("POST", `/V1/employees/${created.emp_id}/photo`, form), 200);
    assert.match(uploaded.emp_photo_url, /^\/uploads\/employees\/.+\.jpg$/);
    assert.equal(uploaded.is_pending_card_updated, true);
    employee = await detail(created.emp_id);
    assert.equal(employee.cards[0].ec_photo_url, uploaded.emp_photo_url, "บัตรรอพิมพ์ใช้รูปใหม่");

    expectStatus(await call("POST", `/V1/employees/${created.emp_id}/cards/${employee.cards[0].ec_id}/printed`, {}), 200);
    const removed = expectStatus(await call("DELETE", `/V1/employees/${created.emp_id}/photo`), 200);
    assert.equal(removed.is_pending_card_updated, false);
    employee = await detail(created.emp_id);
    assert.equal(employee.cards[0].ec_photo_url, uploaded.emp_photo_url, "บัตรที่พิมพ์แล้วเก็บรูปตอนออก");

    // พ้นสภาพแล้ว (วันสุดท้ายเมื่อวาน) บัตรที่ยังไม่ได้พิมพ์ไม่ต้องพิมพ์ให้
    const leaver = await createEmployee("ลาออก", departments.accounting.dep_id, "2026-02-04");
    await api.pool.query("UPDATE tb_employees SET emp_termination_date = DATE_SUB(?, INTERVAL 1 DAY) WHERE emp_id = ?", [
        todayBangkok(),
        leaver.emp_id,
    ]);
    const queue = expectStatus(await call("GET", "/V1/employee-cards?kind=pending_print"), 200);
    assert.ok(!queue.data.some((card) => card.ec_employee_id === leaver.emp_id));
});

test("วันหมดอายุบัตร: วันออก + อายุบัตรตามตั้งค่า (เริ่ม 3 ปี) · เปลี่ยนตั้งค่ามีผลกับบัตรใบถัดไป · ใกล้หมดอายุเข้าคิว · ต่ออายุ = ใบใหม่รหัสเดิม", async () => {
    const today = todayBangkok();
    const yearsLater = (years) => `${Number(today.slice(0, 4)) + years}${today.slice(4)}`;
    const created = await createEmployee("หมดอายุ", departments.accounting.dep_id, "2026-02-05");
    let employee = await detail(created.emp_id);
    // 29 ก.พ. + 3 ปี = 28 ก.พ. (MySQL) — วันอื่นตรงกับปีที่บวก
    if (!today.endsWith("-02-29")) assert.equal(employee.cards[0].ec_expires_on, yearsLater(3));

    const setup = expectStatus(await call("GET", "/V1/people/setup"), 200);
    assert.equal(setup.settings.ps_card_valid_years, 3);
    expectStatus(await call("PUT", "/V1/people/settings", { ...setup.settings, ps_card_valid_years: 5 }), 200);
    const tooLong = await call("PUT", "/V1/people/settings", { ...setup.settings, ps_card_valid_years: 11 });
    assert.equal(tooLong.status, 400);
    assert.ok(tooLong.body.fields.ps_card_valid_years);

    // บัตรใบเดิมใกล้หมดอายุ (อีก 10 วัน) → อยู่ในคิว · ต่ออายุแล้วใบใหม่ใช้อายุ 5 ปีตามตั้งค่าใหม่ และออกจากคิว
    await api.pool.query("UPDATE tb_employee_cards SET ec_expires_on = DATE_ADD(?, INTERVAL 10 DAY) WHERE ec_id = ?", [
        today,
        employee.cards[0].ec_id,
    ]);
    let expiring = expectStatus(await call("GET", "/V1/employee-cards?kind=expiring"), 200);
    assert.ok(expiring.data.some((card) => card.ec_id === employee.cards[0].ec_id));

    expectStatus(await call("POST", `/V1/employees/${created.emp_id}/cards`, { ec_reason: "expired" }), 201);
    employee = await detail(created.emp_id);
    assert.equal(employee.cards[0].ec_seq, 2);
    assert.equal(employee.cards[0].ec_emp_code, created.emp_code, "ต่ออายุ = รหัสเดิม");
    assert.equal(employee.cards[1].ec_void_reason, "บัตรหมดอายุ");
    if (!today.endsWith("-02-29")) assert.equal(employee.cards[0].ec_expires_on, yearsLater(5));
    expiring = expectStatus(await call("GET", "/V1/employee-cards?kind=expiring"), 200);
    assert.ok(!expiring.data.some((card) => card.ec_employee_id === created.emp_id));

    expectStatus(await call("PUT", "/V1/people/settings", { ...setup.settings, ps_card_valid_years: 3 }), 200);
});
