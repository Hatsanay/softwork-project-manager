// บุคคล ขั้น 4-1 — ทะเบียนพนักงาน · ค่าจ้างตามวันที่มีผล · รายการประจำ · พ้นสภาพ · ตั้งค่าบุคคล · สิทธิ์ · audit ไม่เก็บเงินเดือน
// ยิงผ่านเซิร์ฟเวอร์จริงบนฐานข้อมูลชั่วคราว · แบบระบบ: docs/plans/2026-10-17-people-payroll-4.md หัวข้อ 3.1–3.3 และ R-H1/R-H8/R-H9
const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { startTestServer } = require("./support/test-server");
const { PERMISSION_KEYS } = require("../src/shared/permissions.mjs");
const { todayBangkok } = require("../src/utils/bangkok-time");

const PASSWORD = "Staff@2026";
const DEPARTMENT_ID = "DEP209901010000001";

let api;
const people = {};

function daysFromToday(dayCount) {
    const [year, month, day] = todayBangkok().split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day + dayCount)).toISOString().slice(0, 10);
}

// เลขประจำตัว 13 หลักที่หลักตรวจสอบถูก
function validCitizenId(first12) {
    let sum = 0;
    for (let index = 0; index < 12; index++) sum += Number(first12[index]) * (13 - index);
    return `${first12}${(11 - (sum % 11)) % 10}`;
}

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

function as(person, method, url, body) {
    return api.callApi(method, url, { token: person?.token, body });
}

function expectStatus(response, status) {
    assert.equal(response.status, status, JSON.stringify(response.body));
    return response.body;
}

const employeeBody = (overrides = {}) => ({
    emp_title: "นาย",
    emp_first_name_th: "สมชาย",
    emp_last_name_th: "ตั้งใจงาน",
    emp_national_id: validCitizenId("110170023070"),
    emp_department_id: DEPARTMENT_ID,
    emp_position: "นักพัฒนา",
    emp_hire_date: "2026-01-05",
    emp_bank_name: "กสิกรไทย",
    emp_bank_account_no: "123-4-56789-0",
    ecm_base_salary: "30000",
    ...overrides,
});

test.before(async () => {
    api = await startTestServer("people");
    await api.loginAsAdmin();
    await api.pool.query(
        `INSERT INTO tb_department (dep_id, dep_name, dep_branch_id, dep_abbr, dep_code)
         VALUES (?, 'วิศวกรรม', 'BRA202601010000001', 'ENG', '00000ENG')`,
        [DEPARTMENT_ID],
    );
    people.hr = await createPerson("pp.hr", ["dashboard", "manageEmployees"], 151);
    people.hrAdmin = await createPerson("pp.hradmin", ["dashboard", "manageHrSettings"], 152);
    people.staff = await createPerson("pp.staff", ["dashboard", "viewExpenses", "loginLogs"], 153);
});

test.after(async () => {
    await api?.stop();
});

test("สิทธิ์: ข้อมูลพนักงานเปิดได้เฉพาะผู้จัดการพนักงาน · ตั้งค่าบุคคลอ่านได้ทุกคน แก้ได้เฉพาะผู้มีสิทธิ์", async () => {
    expectStatus(await as(people.staff, "GET", "/V1/employees"), 403);
    expectStatus(await as(people.staff, "GET", "/V1/employees/form-options"), 403);
    expectStatus(await as(people.staff, "POST", "/V1/employees", employeeBody({ emp_code: "X-1" })), 403);
    expectStatus(await as(people.hrAdmin, "GET", "/V1/employees"), 403, "ตั้งค่าบุคคลไม่ได้แปลว่าเห็นเงินเดือน");

    const setup = expectStatus(await as(people.staff, "GET", "/V1/people/setup"), 200);
    assert.equal(setup.sso_rates[0].sr_wage_ceiling, "17500.00");
    assert.equal(setup.sso_rates[0].is_current, true);
    assert.deepEqual(
        setup.leave_types.map((type) => type.lt_name_th),
        ["ลาป่วย", "ลากิจ", "ลาพักร้อน", "ลาไม่รับค่าจ้าง"],
    );
    assert.equal(setup.tax_years[0].brackets.length, 8);
    assert.equal(setup.settings.ps_working_weekdays, "1111100");
    expectStatus(
        await as(people.staff, "POST", "/V1/people/holidays", { hd_date: "2026-12-31", hd_name: "สิ้นปี" }),
        403,
    );
    expectStatus(await as(people.hr, "PUT", "/V1/people/settings", { ...setup.settings }), 403);
});

test("เพิ่มพนักงาน: เงินเดือนเริ่มงานมีผลวันเริ่มงาน · รายการปิดเลขประจำตัวบางส่วน · รหัส/เลขประจำตัวซ้ำไม่ได้", async () => {
    const created = expectStatus(await as(people.hr, "POST", "/V1/employees", employeeBody()), 201);
    const detail = expectStatus(await as(people.hr, "GET", `/V1/employees/${created.emp_id}`), 200);
    assert.equal(detail.emp_bank_account_no, "1234567890", "ตัดขีดในเลขบัญชี");
    assert.equal(detail.emp_sso_enrolled, true);
    assert.equal(detail.department_name, "วิศวกรรม");
    assert.equal(detail.employment_status, "active");
    assert.deepEqual(
        detail.compensations.map((row) => [row.ecm_effective_from, row.ecm_base_salary]),
        [["2026-01-05", "30000.00"]],
    );
    assert.equal(detail.current_compensation.ecm_base_salary, "30000.00");

    const list = expectStatus(await as(people.hr, "GET", "/V1/employees?status=employed&search=สมชาย"), 200);
    assert.equal(list.total, 1);
    assert.equal(list.data[0].emp_national_id, undefined, "รายการไม่ส่งเลขเต็ม");
    assert.match(list.data[0].national_id_masked, /^•{9}\d{4}$/);

    // รหัสระบบออกให้ (2026-10-18): รหัสแผนก 00000ENG + วันเริ่มงาน 260105 + ลำดับ 0001 · ส่ง emp_code มาเองไม่มีผล
    assert.equal(created.emp_code, "00000ENG2601050001");
    assert.equal(detail.emp_code, created.emp_code);
    assert.equal(detail.department_code, "00000ENG");
    const duplicateId = expectStatus(
        await as(people.hr, "POST", "/V1/employees", employeeBody({ emp_code: "E002" })),
        400,
    );
    assert.match(duplicateId.fields.emp_national_id, new RegExp(created.emp_code));

    const badId = expectStatus(
        await as(
            people.hr,
            "POST",
            "/V1/employees",
            employeeBody({ emp_code: "E003", emp_national_id: "1234567890123" }),
        ),
        400,
    );
    assert.ok(badId.fields.emp_national_id);
});

test("ค่าจ้างตามวันที่มีผล: เพิ่มหลังวันเริ่มงาน · ซ้ำวันเดิมไม่ได้ · ลบแถวแรกไม่ได้แต่แก้ยอดได้ · เลื่อนวันเริ่มงานแล้วแถวแรกตาม", async () => {
    const created = expectStatus(
        await as(people.hr, "POST", "/V1/employees", employeeBody({ emp_code: "C001", emp_national_id: null })),
        201,
    );
    const url = `/V1/employees/${created.emp_id}`;

    const onHireDate = expectStatus(
        await as(people.hr, "POST", `${url}/compensations`, {
            ecm_effective_from: "2026-01-05",
            ecm_base_salary: "31000",
        }),
        400,
    );
    assert.ok(onHireDate.fields.ecm_effective_from);
    expectStatus(
        await as(people.hr, "POST", `${url}/compensations`, {
            ecm_effective_from: "2026-04-01",
            ecm_base_salary: "33000",
            ecm_note: "ผ่านทดลองงาน",
        }),
        201,
    );
    expectStatus(
        await as(people.hr, "POST", `${url}/compensations`, {
            ecm_effective_from: "2026-04-01",
            ecm_base_salary: "34000",
        }),
        409,
    );

    expectStatus(await as(people.hr, "DELETE", `${url}/compensations/2026-01-05`), 409);
    expectStatus(await as(people.hr, "PUT", `${url}/compensations/2026-01-05`, { ecm_base_salary: "29500" }), 200);

    const tooLate = expectStatus(
        await as(
            people.hr,
            "PUT",
            url,
            employeeBody({ emp_code: "C001", emp_national_id: null, emp_hire_date: "2026-04-01" }),
        ),
        400,
    );
    assert.ok(tooLate.fields.emp_hire_date, "วันเริ่มงานต้องก่อนอัตราถัดไป");
    expectStatus(
        await as(
            people.hr,
            "PUT",
            url,
            employeeBody({ emp_code: "C001", emp_national_id: null, emp_hire_date: "2026-01-12" }),
        ),
        200,
    );

    const detail = expectStatus(await as(people.hr, "GET", url), 200);
    assert.deepEqual(
        detail.compensations.map((row) => [row.ecm_effective_from, row.ecm_base_salary]),
        [
            ["2026-04-01", "33000.00"],
            ["2026-01-12", "29500.00"],
        ],
    );
    expectStatus(await as(people.hr, "DELETE", `${url}/compensations/2026-04-01`), 204);
});

test("รายการประจำ: รายหักไม่คิดภาษี/ประกันสังคม · หยุดก่อนวันเริ่มไม่ได้ · ลบได้", async () => {
    const created = expectStatus(
        await as(people.hr, "POST", "/V1/employees", employeeBody({ emp_code: "R001", emp_national_id: null })),
        201,
    );
    const url = `/V1/employees/${created.emp_id}/recurring-items`;
    const beforeHire = expectStatus(
        await as(people.hr, "POST", url, {
            eri_kind: "earning",
            eri_label: "ค่าตำแหน่ง",
            eri_amount: "2000",
            eri_effective_from: "2025-12-01",
        }),
        400,
    );
    assert.ok(beforeHire.fields.eri_effective_from);

    const deduction = expectStatus(
        await as(people.hr, "POST", url, {
            eri_kind: "deduction",
            eri_label: "ผ่อนเงินกู้สวัสดิการ",
            eri_amount: "1500",
            eri_is_taxable: true,
            eri_is_sso_wage: true,
            eri_effective_from: "2026-02-01",
        }),
        201,
    );
    const detail = expectStatus(await as(people.hr, "GET", `/V1/employees/${created.emp_id}`), 200);
    const item = detail.recurring_items.find((row) => row.eri_id === deduction.eri_id);
    assert.equal(item.eri_is_taxable, false);
    assert.equal(item.eri_is_sso_wage, false);

    expectStatus(
        await as(people.hr, "POST", `${url}/${deduction.eri_id}/end`, { eri_effective_to: "2026-01-31" }),
        400,
    );
    expectStatus(
        await as(people.hr, "POST", `${url}/${deduction.eri_id}/end`, { eri_effective_to: "2026-06-30" }),
        200,
    );
    expectStatus(await as(people.hr, "DELETE", `${url}/${deduction.eri_id}`), 204);
    expectStatus(await as(people.hr, "DELETE", `${url}/${deduction.eri_id}`), 404);
});

test("พ้นสภาพ: ไม่ก่อนวันเริ่มงาน · ออกแล้วเลขประจำตัวใช้กับพนักงานใหม่ได้ · ยกเลิกพ้นสภาพไม่ได้ถ้าเลขถูกใช้แล้ว", async () => {
    const nationalId = validCitizenId("310050012345");
    const first = expectStatus(
        await as(
            people.hr,
            "POST",
            "/V1/employees",
            employeeBody({ emp_code: "T001", emp_national_id: nationalId, emp_user_id: people.staff.userId }),
        ),
        201,
    );
    const url = `/V1/employees/${first.emp_id}`;
    expectStatus(
        await as(people.hr, "POST", `${url}/terminate`, {
            emp_termination_date: "2025-12-31",
            emp_termination_reason: "ลาออก",
        }),
        400,
    );

    expectStatus(
        await as(people.hr, "POST", `${url}/terminate`, {
            emp_termination_date: daysFromToday(7),
            emp_termination_reason: "ลาออก",
        }),
        200,
    );
    const leaving = expectStatus(await as(people.hr, "GET", url), 200);
    assert.equal(leaving.employment_status, "leaving", "ตั้งล่วงหน้า = ยังทำงานอยู่จนถึงวันนั้น");
    expectStatus(
        await as(people.hr, "POST", "/V1/employees", employeeBody({ emp_code: "T002", emp_national_id: nationalId })),
        400,
    );

    expectStatus(
        await as(people.hr, "POST", `${url}/terminate`, {
            emp_termination_date: daysFromToday(-1),
            emp_termination_reason: "ลาออก",
        }),
        200,
    );
    const terminated = expectStatus(await as(people.hr, "GET", "/V1/employees?status=terminated"), 200);
    assert.ok(
        terminated.data.some((row) => row.emp_id === first.emp_id && row.employment_status === "terminated"),
    );

    // คนเดิมกลับมาทำงาน: ฟอร์มหาแถวเดิมจากบัญชี (form-options ไม่ส่งเลขประจำตัว) หรือจากเลขประจำตัวทีละเลข
    const options = expectStatus(await as(people.hr, "GET", "/V1/employees/form-options"), 200);
    const formerOfStaff = options.former_employees.find((row) => row.emp_user_id === people.staff.userId);
    assert.equal(formerOfStaff?.emp_id, first.emp_id);
    assert.equal("emp_national_id" in formerOfStaff, false, "รายการพนักงานเดิมไม่ส่งเลขประจำตัว");
    const dashed = `${nationalId.slice(0, 1)}-${nationalId.slice(1, 5)}-${nationalId.slice(5)}`;
    const byNationalId = expectStatus(await as(people.hr, "GET", `/V1/employees/former?national_id=${dashed}`), 200);
    assert.equal(byNationalId.former?.emp_id, first.emp_id);
    const tooShort = expectStatus(await as(people.hr, "GET", "/V1/employees/former?national_id=12345"), 200);
    assert.equal(tooShort.former, null);
    expectStatus(await as(people.hrAdmin, "GET", `/V1/employees/former?national_id=${nationalId}`), 403);

    expectStatus(
        await as(
            people.hr,
            "POST",
            "/V1/employees",
            employeeBody({
                emp_code: "T002",
                emp_national_id: nationalId,
                emp_user_id: people.staff.userId,
                emp_hire_date: todayBangkok(),
            }),
        ),
        201,
    );
    const conflict = expectStatus(await as(people.hr, "POST", `${url}/reinstate`), 409);
    assert.ok(conflict.fields.emp_national_id);
    assert.ok(conflict.fields.emp_user_id);
});

test("audit: บันทึกการเปิดข้อมูลพนักงาน · ค่าเงินเดือนไม่อยู่ใน log", async () => {
    const created = expectStatus(
        await as(
            people.hr,
            "POST",
            "/V1/employees",
            employeeBody({ emp_code: "A001", emp_national_id: null, ecm_base_salary: "45678" }),
        ),
        201,
    );
    expectStatus(await as(people.hr, "GET", `/V1/employees/${created.emp_id}`), 200);
    expectStatus(
        await as(people.hr, "POST", `/V1/employees/${created.emp_id}/compensations`, {
            ecm_effective_from: "2026-07-01",
            ecm_base_salary: "48765",
        }),
        201,
    );
    // audit เขียนหลังตอบกลับ (res "finish") — รอให้แถวลงครบก่อนอ่าน
    await new Promise((resolve) => setTimeout(resolve, 300));
    const [logs] = await api.pool.query(
        "SELECT aud_event, aud_action, aud_payload FROM tb_audit_logs WHERE aud_entity_id = ? ORDER BY aud_id",
        [created.emp_id],
    );
    assert.deepEqual(
        logs.map((log) => log.aud_action),
        ["เพิ่มพนักงาน", "เปิดข้อมูลพนักงาน", "เพิ่มอัตราเงินเดือนพนักงาน"],
    );
    const allText = JSON.stringify(logs);
    assert.ok(!allText.includes("45678"), "เงินเดือนเริ่มงานต้องไม่อยู่ใน log");
    assert.ok(!allText.includes("48765"), "เงินเดือนใหม่ต้องไม่อยู่ใน log");
});

test("ตั้งค่าบุคคล: อัตราประกันสังคม · ปีภาษี · วันหยุด · ประเภทลา · เวลาทำงาน — ซ้ำไม่ได้ และต้องเหลืออย่างน้อย 1 ชุด", async () => {
    const rate = {
        sr_effective_from: "2029-01-01",
        sr_employee_rate: "5",
        sr_employer_rate: "5",
        sr_wage_floor: "1650",
        sr_wage_ceiling: "20000",
        sr_note: "กฎกระทรวง (ทดสอบ)",
    };
    expectStatus(await as(people.hrAdmin, "POST", "/V1/people/sso-rates", rate), 201);
    expectStatus(await as(people.hrAdmin, "POST", "/V1/people/sso-rates", rate), 409);
    expectStatus(await as(people.hrAdmin, "DELETE", "/V1/people/sso-rates/2026-01-01"), 204);
    expectStatus(await as(people.hrAdmin, "DELETE", "/V1/people/sso-rates/2029-01-01"), 409);

    const taxYear = {
        ity_expense_rate: "50",
        ity_expense_cap: "100000",
        ity_personal_allowance: "60000",
        brackets: [
            { itb_from_amount: "0", itb_rate: "0" },
            { itb_from_amount: "150000", itb_rate: "5" },
        ],
    };
    expectStatus(await as(people.hrAdmin, "PUT", "/V1/people/tax-years/2027", taxYear), 200);
    expectStatus(
        await as(people.hrAdmin, "PUT", "/V1/people/tax-years/2027", {
            ...taxYear,
            brackets: [{ itb_from_amount: "100", itb_rate: "0" }],
        }),
        400,
    );
    let setup = expectStatus(await as(people.hrAdmin, "GET", "/V1/people/setup"), 200);
    assert.deepEqual(
        setup.tax_years.map((year) => [year.ity_tax_year, year.brackets.length]),
        [
            [2027, 2],
            [2026, 8],
        ],
    );
    expectStatus(await as(people.hrAdmin, "DELETE", "/V1/people/tax-years/2027"), 204);
    expectStatus(await as(people.hrAdmin, "DELETE", "/V1/people/tax-years/2026"), 409);

    expectStatus(
        await as(people.hrAdmin, "POST", "/V1/people/holidays", { hd_date: "2026-12-31", hd_name: "วันสิ้นปี" }),
        201,
    );
    expectStatus(
        await as(people.hrAdmin, "POST", "/V1/people/holidays", { hd_date: "2026-12-31", hd_name: "ซ้ำ" }),
        409,
    );
    const holidays = expectStatus(await as(people.staff, "GET", "/V1/people/holidays?year=2026"), 200);
    assert.deepEqual(holidays.holidays, [{ hd_date: "2026-12-31", hd_name: "วันสิ้นปี" }]);
    expectStatus(await as(people.hrAdmin, "DELETE", "/V1/people/holidays/2026-12-31"), 204);

    const leaveType = expectStatus(
        await as(people.hrAdmin, "POST", "/V1/people/leave-types", {
            lt_name_th: "ลาบวช",
            lt_days_per_year: "15",
            lt_min_service_days: 365,
        }),
        201,
    );
    expectStatus(await as(people.hrAdmin, "POST", "/V1/people/leave-types", { lt_name_th: "ลาบวช" }), 400);
    expectStatus(
        await as(people.hrAdmin, "PUT", `/V1/people/leave-types/${leaveType.lt_id}`, {
            lt_name_th: "ลาบวช",
            lt_status: "inactive",
        }),
        200,
    );

    setup = expectStatus(await as(people.hrAdmin, "GET", "/V1/people/setup"), 200);
    const noWorkday = expectStatus(
        await as(people.hrAdmin, "PUT", "/V1/people/settings", { ...setup.settings, ps_working_weekdays: "0000000" }),
        400,
    );
    assert.ok(noWorkday.fields.ps_working_weekdays);
    expectStatus(
        await as(people.hrAdmin, "PUT", "/V1/people/settings", { ...setup.settings, ps_working_weekdays: "1111110" }),
        200,
    );
});
