// รอบเงินเดือน ขั้น 4-4 — คิดเงิน (สัดส่วนวัน · ลาไม่รับค่าจ้าง · รายการประจำ/กรอกเอง · ประกันสังคม · ภาษี) · ลำดับรอบ
// ส่ง/อนุมัติ (กติกา PR · ผู้มีชื่อในรอบอนุมัติไม่ได้) · ค่าแรงจริงต่อโปรเจกต์ · ล็อกลงเวลา/ลา · สลิป · ค่าลดหย่อนรายปี · audit ปิดบังยอด
// ยิงผ่านเซิร์ฟเวอร์จริงบนฐานข้อมูลชั่วคราว · แบบระบบ: docs/plans/2026-10-17-people-payroll-4.md หัวข้อ 3.7, 4.2, 4.3
const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { startTestServer } = require("./support/test-server");
const { createTestDepartment } = require("./support/test-department");
const { PERMISSION_KEYS } = require("../src/shared/permissions.mjs");

const PASSWORD = "Staff@2026";
const MARCH = "2026-03";
const APRIL = "2026-04";
const PROJECT_ID = "PRO209901040000001";

let api;
let departmentId;
// ชื่อที่เทสต์ใช้เรียกพนักงาน → รหัสที่ระบบออกให้
const codes = {};
const people = {};
const employees = {};
let marchRunId;

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
    return { userId, roleId: role.body.role_id, token: await api.login(name, PASSWORD) };
}

async function createEmployee(code, { hireDate, salary, userId = null, nationalId = null }) {
    const response = await api.callApi("POST", "/V1/employees", {
        body: {
            emp_department_id: departmentId,
            emp_first_name_th: code,
            emp_last_name_th: "ทดสอบ",
            emp_hire_date: hireDate,
            emp_user_id: userId,
            emp_national_id: nationalId,
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

function expectStatus(response, status, note = "") {
    assert.equal(response.status, status, `${note} ${JSON.stringify(response.body)}`);
    return response.body;
}

async function getRun(runId, person = people.hr) {
    return expectStatus(await as(person, "GET", `/V1/payroll/runs/${runId}`), 200);
}

async function runAction(person, runId, action, extra = {}) {
    const run = await getRun(runId);
    return as(person, "POST", `/V1/payroll/runs/${runId}/${action}`, { pr_version: run.pr_version, ...extra });
}

const itemOf = (run, employeeId) => run.items.find((item) => item.pri_employee_id === employeeId);

test.before(async () => {
    api = await startTestServer("payroll");
    await api.loginAsAdmin();
    departmentId = await createTestDepartment(api);
    people.hr = await createPerson("pr.hr", ["dashboard", "viewPayroll", "runPayroll", "manageEmployees"], 191);
    people.approver = await createPerson("pr.approver", ["dashboard", "viewPayroll", "approvePayroll"], 192);
    people.dev = await createPerson("pr.dev", ["dashboard"], 193);
    people.outsider = await createPerson("pr.out", ["dashboard"], 194);

    employees.full = await createEmployee("PR-A", {
        hireDate: "2026-01-01",
        salary: "30000",
        userId: people.dev.userId,
    });
    employees.joiner = await createEmployee("PR-B", {
        hireDate: "2026-03-16",
        salary: "31000",
        nationalId: "1101700203450",
    });
    employees.leaver = await createEmployee("PR-C", { hireDate: "2026-01-01", salary: "31000" });
    employees.later = await createEmployee("PR-D", { hireDate: "2026-04-01", salary: "20000" });
    await api.pool.query("UPDATE tb_employees SET emp_termination_date = '2026-03-10' WHERE emp_id = ?", [
        employees.leaver,
    ]);
    // รายการประจำของ PR-A: ค่าตำแหน่ง 2,000 (คิดภาษี + ค่าจ้างประกันสังคม) · ผ่อนเงินกู้ 500
    await api.pool.query(
        `INSERT INTO tb_employee_recurring_items
            (eri_employee_id, eri_kind, eri_label, eri_amount, eri_is_taxable, eri_is_sso_wage, eri_effective_from)
         VALUES (?, 'earning', 'ค่าตำแหน่ง', 2000, 1, 1, '2026-01-01'), (?, 'deduction', 'ผ่อนเงินกู้', 500, 0, 0, '2026-01-01')`,
        [employees.full, employees.full],
    );
    // ลาไม่รับค่าจ้าง 1 วัน (อนุมัติแล้ว) ของ PR-A — วันพุธ 11 มี.ค. 2026
    const [[unpaidType]] = await api.pool.query("SELECT lt_id FROM tb_leave_types WHERE lt_is_paid = 0 LIMIT 1");
    await api.pool.query(
        `INSERT INTO tb_leave_requests (lr_employee_id, lr_leave_type_id, lr_start_date, lr_end_date, lr_days, lr_status)
         VALUES (?, ?, '2026-03-11', '2026-03-11', 1.0, 'approved')`,
        [employees.full, unpaidType.lt_id],
    );
    // ชั่วโมงที่อนุมัติแล้วของ PR-A ในโปรเจกต์ (มี.ค.) — ใช้ตรวจค่าแรงจริงตอนอนุมัติรอบ
    await api.pool.query(
        `INSERT INTO tb_projects (project_id, project_name, project_share_token, project_created_by)
         VALUES (?, 'โปรเจกต์ค่าแรง', 'token-payroll-test', 'USE202601010000001')`,
        [PROJECT_ID],
    );
    const [week] = await api.pool.query(
        `INSERT INTO tb_timesheet_weeks (tsw_employee_id, tsw_week_start, tsw_status, tsw_total_hours, tsw_approved_at)
         VALUES (?, '2026-03-02', 'approved', 40, NOW())`,
        [employees.full],
    );
    await api.pool.query(
        `INSERT INTO tb_timesheet_entries (tse_week_id, tse_employee_id, tse_date, tse_project_id, tse_hours, tse_approved_at)
         VALUES (?, ?, '2026-03-02', ?, 8, NOW()), (?, ?, '2026-03-03', ?, 8, NOW())`,
        [week.insertId, employees.full, PROJECT_ID, week.insertId, employees.full, PROJECT_ID],
    );
});

test.after(async () => {
    await api?.stop();
});

test("สิทธิ์: คนทั่วไปเห็นรอบไม่ได้ · ผู้อนุมัติดูได้แต่สร้างไม่ได้", async () => {
    expectStatus(await as(people.outsider, "GET", "/V1/payroll/runs"), 403);
    expectStatus(await as(people.approver, "GET", "/V1/payroll/runs"), 200);
    expectStatus(
        await as(people.approver, "POST", "/V1/payroll/runs", { pr_period: MARCH, pr_pay_date: "2026-03-25" }),
        403,
    );
});

test("สร้างรอบ มี.ค.: เฉพาะคนที่เป็นพนักงานในเดือน · สัดส่วนวัน · ลาไม่รับค่าจ้าง · รายการประจำ · ประกันสังคม · ภาษี", async () => {
    marchRunId = expectStatus(
        await as(people.hr, "POST", "/V1/payroll/runs", { pr_period: MARCH, pr_pay_date: "2026-03-25" }),
        201,
    ).pr_id;
    const run = await getRun(marchRunId);
    assert.equal(run.pr_number, "PR-2026-03");
    assert.deepEqual(
        run.items.map((item) => item.pri_emp_code).sort(),
        [codes["PR-A"], codes["PR-B"], codes["PR-C"]].sort(),
        "PR-D เริ่มงาน เม.ย. ไม่อยู่ในรอบ",
    );

    const full = itemOf(run, employees.full);
    assert.equal(full.pri_salary_amount, "30000.00");
    assert.equal(full.pri_unpaid_leave_days, "1.0");
    assert.equal(full.pri_unpaid_leave_amount, "1000.00", "30,000 ÷ 30");
    assert.equal(full.pri_gross, "31000.00", "30,000 − 1,000 + ค่าตำแหน่ง 2,000");
    assert.equal(full.pri_sso_employee, "875.00", "ฐานเกินเพดาน 17,500 × 5%");
    assert.equal(full.pri_other_deductions, "500.00");
    // ภาษี: ทั้งปีประมาณ = 31,000 + 32,000 × 9 = 319,000 · หักค่าใช้จ่าย 100,000 · ส่วนตัว 60,000 · ประกันสังคม 875 × 10
    // เงินได้สุทธิ 150,250 → ภาษี 12.50 → เดือนนี้ ÷ 10 = 1.25
    assert.equal(full.pri_annual_income_estimate, "319000.00");
    assert.equal(full.pri_tax, "1.25");
    assert.equal(full.pri_net, "29623.75", "31,000 − 500 − 875 − 1.25");
    assert.deepEqual(
        full.lines.map((line) => [line.pil_source, line.pil_label, line.pil_amount]).sort(),
        [
            ["recurring", "ค่าตำแหน่ง", "2000.00"],
            ["recurring", "ผ่อนเงินกู้", "500.00"],
        ].sort(),
    );

    const joiner = itemOf(run, employees.joiner);
    assert.equal(joiner.pri_employed_days, 16);
    assert.equal(joiner.pri_salary_amount, "16000.00", "31,000 × 16/31");
    assert.equal(joiner.pri_sso_employee, "800.00", "16,000 × 5%");

    const leaver = itemOf(run, employees.leaver);
    assert.equal(leaver.pri_salary_amount, "10000.00", "31,000 × 10/31");
    assert.equal(leaver.pri_annual_income_estimate, "10000.00", "เดือนสุดท้าย — ไม่ประมาณการต่อ");
    assert.ok(run.readiness.warnings.some((warning) => warning.includes("เลขประจำตัวประชาชน")));
    const priorWarning = run.readiness.warnings.find((warning) => warning.includes("ยอดยกมาของปี"));
    assert.ok(priorWarning, "รอบแรกของปี (มี.ค.) ไม่มียอดยกมา — ต้องเตือน");
    assert.ok(
        priorWarning.includes(codes["PR-A"]) && !priorWarning.includes(codes["PR-B"]),
        "PR-B เริ่มงาน มี.ค. ไม่ต้องมียอดยกมา",
    );
});

test("ลำดับรอบ: เดือนซ้ำไม่ได้ · รอบก่อนยังไม่อนุมัติสร้างเดือนถัดไปไม่ได้", async () => {
    const duplicate = expectStatus(
        await as(people.hr, "POST", "/V1/payroll/runs", { pr_period: MARCH, pr_pay_date: "2026-03-25" }),
        409,
    );
    assert.equal(duplicate.code, "PAYROLL_EXISTS");
    const next = expectStatus(
        await as(people.hr, "POST", "/V1/payroll/runs", { pr_period: APRIL, pr_pay_date: "2026-04-25" }),
        409,
    );
    assert.equal(next.code, "PAYROLL_PREVIOUS_OPEN");
});

test("รายการกรอกเอง: โบนัสครั้งเดียวไม่ถูกคูณทั้งปี · คิดใหม่แล้วรายการกรอกเองยังอยู่ · ลบได้", async () => {
    let run = await getRun(marchRunId);
    const full = itemOf(run, employees.full);
    expectStatus(
        await as(people.hr, "POST", `/V1/payroll/runs/${marchRunId}/items/${full.pri_id}/lines`, {
            pr_version: run.pr_version,
            pil_kind: "earning",
            pil_label: "โบนัส",
            pil_amount: "10000",
            pil_is_taxable: true,
            pil_is_sso_wage: false,
            pil_is_one_off: true,
        }),
        200,
    );
    run = await getRun(marchRunId);
    const withBonus = itemOf(run, employees.full);
    assert.equal(withBonus.pri_annual_income_estimate, "329000.00", "319,000 + โบนัส 10,000 ครั้งเดียว");
    assert.equal(withBonus.pri_sso_employee, "875.00", "โบนัสไม่ใช่ค่าจ้างประกันสังคม");
    assert.ok(Number(withBonus.pri_tax) > Number(full.pri_tax));

    expectStatus(await runAction(people.hr, marchRunId, "recalculate"), 200);
    run = await getRun(marchRunId);
    const bonus = itemOf(run, employees.full).lines.find((line) => line.pil_label === "โบนัส");
    assert.equal(bonus.pil_source, "manual");
    expectStatus(
        await as(
            people.hr,
            "DELETE",
            `/V1/payroll/runs/${marchRunId}/items/${withBonus.pri_id}/lines/${bonus.pil_id}`,
            {
                pr_version: run.pr_version,
            },
        ),
        200,
    );
    assert.equal(itemOf(await getRun(marchRunId), employees.full).pri_tax, "1.25");
});

test("ส่ง: คำขอลารออนุมัติในเดือนต้องจัดการก่อน · ไม่มีกติกาอนุมัติส่งไม่ได้ · ส่งแล้วคิดใหม่ไม่ได้", async () => {
    const [[sickType]] = await api.pool.query("SELECT lt_id FROM tb_leave_types WHERE lt_is_paid = 1 LIMIT 1");
    const [pending] = await api.pool.query(
        `INSERT INTO tb_leave_requests (lr_employee_id, lr_leave_type_id, lr_start_date, lr_end_date, lr_days, lr_status)
         VALUES (?, ?, '2026-03-20', '2026-03-20', 1.0, 'pending')`,
        [employees.full, sickType.lt_id],
    );
    const blocked = expectStatus(await runAction(people.hr, marchRunId, "submit"), 400);
    assert.match(blocked.message, /คำขอลารออนุมัติ/);
    await api.pool.query("UPDATE tb_leave_requests SET lr_status = 'approved' WHERE lr_id = ?", [pending.insertId]);

    const noRules = expectStatus(await runAction(people.hr, marchRunId, "submit"), 409);
    assert.equal(noRules.code, "APPROVAL_RULES_MISSING");
    expectStatus(
        await api.callApi("PUT", "/V1/company/approval-levels", {
            body: {
                doc_type: "PR",
                levels: [{ al_min_amount_thb: "0", al_require_distinct: false, role_ids: [people.approver.roleId] }],
            },
        }),
        200,
    );
    expectStatus(await runAction(people.hr, marchRunId, "submit"), 200);
    const locked = expectStatus(await runAction(people.hr, marchRunId, "recalculate"), 409);
    assert.equal(locked.code, "PAYROLL_WRONG_STATUS");
});

test("อนุมัติ: ผู้มีชื่อในรอบอนุมัติไม่ได้ · ผู้อนุมัติอื่นอนุมัติ → ค่าแรงจริงเข้าโปรเจกต์ · ลงเวลา/ลาเดือนนี้ล็อก", async () => {
    // ผู้อนุมัติที่ผูกกับพนักงานในรอบ (role เดียวกัน) — R-H4
    const insider = await createPerson("pr.insider", ["dashboard", "viewPayroll", "approvePayroll"], 195);
    await api.pool.query("UPDATE tb_users SET user_role_id = ? WHERE user_id = ?", [
        people.approver.roleId,
        insider.userId,
    ]);
    insider.token = await api.login("pr.insider", PASSWORD);
    await api.pool.query("UPDATE tb_employees SET emp_user_id = ? WHERE emp_id = ?", [
        insider.userId,
        employees.joiner,
    ]);
    const insiderView = await getRun(marchRunId, insider);
    assert.equal(insiderView.approval.can_approve, false);
    assert.match(insiderView.approval.reason, /มีชื่อในรอบเงินเดือนนี้/);
    expectStatus(await runAction(insider, marchRunId, "approve"), 403);

    expectStatus(await runAction(people.hr, marchRunId, "approve"), 403, "ไม่มีสิทธิ์ approvePayroll");
    expectStatus(await runAction(people.approver, marchRunId, "approve"), 200);
    const run = await getRun(marchRunId);
    assert.equal(run.pr_status, "approved");

    const full = itemOf(run, employees.full);
    const finance = expectStatus(await api.callApi("GET", `/V1/projects/${PROJECT_ID}/finance`), 200);
    assert.equal(finance.profit.labor_is_estimate, false);
    assert.equal(finance.profit.labor_hours, "16.00");
    // ต้นทุนเดือน (31,000 + ประกันสังคมส่วนบริษัท 875) × 16 ชม. ÷ ชั่วโมงมาตรฐานของคน (22 วันทำงาน × 8)
    const expected = (Number(full.pri_labor_cost) * 16) / Number(full.pri_standard_hours);
    assert.equal(Number(finance.profit.labor_cost_thb), Math.round(expected * 100) / 100);

    const leaveLocked = expectStatus(
        await as(people.dev, "POST", "/V1/leave/requests", {
            lr_leave_type_id: 1,
            lr_start_date: "2026-03-27",
            lr_end_date: "2026-03-27",
            lr_half_day: "none",
            lr_reason: null,
        }),
        409,
    );
    assert.equal(leaveLocked.code, "PAYROLL_PERIOD_CLOSED");
    const [[closedWeek]] = await api.pool.query(
        "SELECT tsw_version FROM tb_timesheet_weeks WHERE tsw_employee_id = ?",
        [employees.full],
    );
    const timesheetLocked = expectStatus(
        await as(people.dev, "PUT", "/V1/timesheet/me", {
            week_start: "2026-03-02",
            tsw_version: closedWeek.tsw_version,
            entries: [],
        }),
        409,
    );
    assert.ok(["PAYROLL_PERIOD_CLOSED", "TIMESHEET_NOT_EDITABLE"].includes(timesheetLocked.code));
});

test("รอบถัดไปใช้ยอดสะสม · จ่ายแล้ว: สลิปเห็นเฉพาะเจ้าของ · ยกเลิกรอบที่จ่ายแล้วไม่ได้", async () => {
    const aprilRunId = expectStatus(
        await as(people.hr, "POST", "/V1/payroll/runs", { pr_period: APRIL, pr_pay_date: "2026-04-25" }),
        201,
    ).pr_id;
    const april = await getRun(aprilRunId);
    const march = await getRun(marchRunId);
    const marchFull = itemOf(march, employees.full);
    const aprilFull = itemOf(april, employees.full);
    assert.equal(aprilFull.pri_ytd_income_before, marchFull.pri_taxable_income);
    assert.equal(aprilFull.pri_ytd_tax_before, marchFull.pri_tax);
    assert.ok(
        april.items.some((item) => item.pri_employee_id === employees.later),
        "PR-D เริ่มงาน เม.ย.",
    );
    assert.ok(!april.items.some((item) => item.pri_employee_id === employees.leaver), "PR-C ออก มี.ค.");

    expectStatus(await as(people.dev, "GET", `/V1/payroll/payslips/${marchFull.pri_id}`), 404, "ยังไม่จ่าย");
    expectStatus(
        await runAction(people.hr, marchRunId, "paid", { pr_paid_date: "2026-03-25", pr_paid_note: "KBank" }),
        200,
    );
    const mine = expectStatus(await as(people.dev, "GET", "/V1/payroll/payslips"), 200).data;
    assert.deepEqual(
        mine.map((slip) => slip.pr_period),
        [MARCH],
    );
    const slip = expectStatus(await as(people.dev, "GET", `/V1/payroll/payslips/${marchFull.pri_id}`), 200);
    assert.equal(slip.item.pri_net, marchFull.pri_net);
    expectStatus(await as(people.outsider, "GET", `/V1/payroll/payslips/${marchFull.pri_id}`), 404);
    expectStatus(
        await as(people.hr, "GET", `/V1/payroll/payslips/${marchFull.pri_id}`),
        200,
        "ผู้มีสิทธิ์ดูรอบเงินเดือน",
    );

    const cancelPaid = expectStatus(await runAction(people.hr, marchRunId, "cancel", { reason: "ทดสอบ" }), 409);
    assert.equal(cancelPaid.code, "PAYROLL_WRONG_STATUS");
    expectStatus(await runAction(people.hr, aprilRunId, "cancel", { reason: "สร้างผิด" }), 200, "ร่างยกเลิกได้");
});

test("ค่าลดหย่อนรายปี: บันทึก/อ่าน · audit ปิดบังยอด · ลบพนักงานที่อยู่ในรอบไม่ได้", async () => {
    const before = expectStatus(await as(people.hr, "GET", `/V1/employees/${employees.full}/tax-profiles/2026`), 200);
    assert.equal(before.is_saved, false);
    expectStatus(
        await as(people.hr, "PUT", `/V1/employees/${employees.full}/tax-profiles/2026`, {
            etp_spouse_allowance: "60000",
            etp_insurance_allowance: "25000",
            etp_prior_income: "0",
        }),
        200,
    );
    const saved = expectStatus(await as(people.hr, "GET", `/V1/employees/${employees.full}/tax-profiles/2026`), 200);
    assert.equal(saved.profile.etp_spouse_allowance, "60000.00");
    expectStatus(await as(people.dev, "GET", `/V1/employees/${employees.full}/tax-profiles/2026`), 403);

    await new Promise((resolve) => setTimeout(resolve, 300));
    const [[audit]] = await api.pool.query(
        "SELECT aud_payload FROM tb_audit_logs WHERE aud_action = 'บันทึกค่าลดหย่อนรายปี' ORDER BY aud_id DESC LIMIT 1",
    );
    assert.ok(audit, "มีแถว audit");
    assert.ok(!String(audit.aud_payload).includes("60000"), "ไม่เก็บยอดลดหย่อนใน audit");

    const removed = expectStatus(await api.callApi("DELETE", `/V1/employees/${employees.leaver}`), 409);
    assert.equal(removed.code, "EMPLOYEE_HAS_HISTORY");
});

test("แบบยื่น (4-5): ภ.ง.ด.1 / สปส.1-10 นับเฉพาะรอบที่จ่ายแล้ว · ภ.ง.ด.1ก / 50 ทวิ ไม่รวมยอดยกมาจากที่ทำงานเดิม", async () => {
    const pnd1 = expectStatus(await as(people.hr, "GET", `/V1/payroll/reports/pnd1?month=${MARCH}`), 200);
    assert.equal(pnd1.notice, null);
    assert.equal(pnd1.due_date, "2026-04-07");
    assert.deepEqual(
        pnd1.rows.map((row) => [row.emp_code, row.income, row.tax]),
        [
            // เรียงตามรหัส (รหัสแผนก + วันเริ่มงาน + ลำดับ): A, C เริ่ม 1 ม.ค. ก่อน B ที่เริ่ม 16 มี.ค.
            [codes["PR-A"], "31000.00", "1.25"],
            [codes["PR-C"], "10000.00", "0.00"],
            [codes["PR-B"], "16000.00", "0.00"],
        ],
    );
    assert.equal(pnd1.total_income, "57000.00");
    assert.deepEqual(pnd1.missing_national_id, [codes["PR-A"], codes["PR-C"]]);

    const sso = expectStatus(await as(people.hr, "GET", `/V1/payroll/reports/sso?month=${MARCH}`), 200);
    assert.equal(sso.rows.length, 3);
    assert.equal(sso.total_employee, "2175.00", "875 + 800 + 500");
    assert.equal(sso.total_remit, "4350.00", "พนักงาน + บริษัท");

    const april = expectStatus(await as(people.hr, "GET", `/V1/payroll/reports/pnd1?month=${APRIL}`), 200);
    assert.ok(april.notice, "เมษายนยังไม่มีรอบที่จ่าย — มีข้อความบอก");
    assert.equal(april.rows.length, 0);
    expectStatus(await as(people.dev, "GET", `/V1/payroll/reports/pnd1?month=${MARCH}`), 403);

    // ยอดยกมา 50,000 / ภาษี 1,000 จากที่ทำงานเดิม — คิดภาษีได้ แต่ไม่อยู่ในแบบของบริษัท
    expectStatus(
        await as(people.hr, "PUT", `/V1/employees/${employees.full}/tax-profiles/2026`, {
            etp_prior_income: "50000",
            etp_prior_tax: "1000",
            etp_prior_from_other_employer: true,
        }),
        200,
    );
    let pnd1a = expectStatus(await as(people.hr, "GET", "/V1/payroll/reports/pnd1a?year=2026"), 200);
    assert.equal(pnd1a.due_date, "2027-02-28");
    assert.equal(pnd1a.rows.find((row) => row.emp_code === codes["PR-A"]).income, "31000.00");

    expectStatus(
        await as(people.hr, "PUT", `/V1/employees/${employees.full}/tax-profiles/2026`, {
            etp_prior_income: "50000",
            etp_prior_tax: "1000",
            etp_prior_from_other_employer: false,
        }),
        200,
    );
    pnd1a = expectStatus(await as(people.hr, "GET", "/V1/payroll/reports/pnd1a?year=2026"), 200);
    const full = pnd1a.rows.find((row) => row.emp_code === codes["PR-A"]);
    assert.deepEqual([full.income, full.tax], ["81000.00", "1001.25"], "ยอดยกมาของบริษัทนี้รวมในแบบรายปี");

    const certificates = expectStatus(
        await as(people.hr, "GET", `/V1/payroll/reports/certificates?year=2026&employee_id=${employees.full}`),
        200,
    );
    assert.equal(certificates.certificates[0].reference, `2026/${codes["PR-A"]}`);
    assert.equal(certificates.certificates[0].sso, "875.00");

    const mine = expectStatus(await as(people.dev, "GET", "/V1/payroll/my-certificates?year=2026"), 200);
    assert.deepEqual(
        mine.certificates.map((certificate) => certificate.emp_code),
        [codes["PR-A"]],
    );
    const outsider = expectStatus(await as(people.outsider, "GET", "/V1/payroll/my-certificates?year=2026"), 200);
    assert.equal(outsider.certificates.length, 0);
});
