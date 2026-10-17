// การลา ขั้น 4-3 — ร่าง/ส่ง/อนุมัติ · จำนวนวันข้ามวันหยุด · โควตา/เกินโควตา · ทับซ้อน · ไฟล์แนบ · ลงเวลาในวันลา · ปฏิทินทีม
// ยิงผ่านเซิร์ฟเวอร์จริงบนฐานข้อมูลชั่วคราว · แบบระบบ: docs/plans/2026-10-17-people-payroll-4.md หัวข้อ 4.4
const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { startTestServer } = require("./support/test-server");
const { PERMISSION_KEYS } = require("../src/shared/permissions.mjs");
const { todayBangkok } = require("../src/utils/bangkok-time");
const { addDays, weekStartOf, weekdayIndex } = require("../src/shared/payroll-math.mjs");

const PASSWORD = "Staff@2026";
const PDF_BYTES = Buffer.from("%PDF-1.4\n%ใบรับรองแพทย์\n", "utf8");

let api;
const people = {};
const leaveTypes = {};
const today = todayBangkok();
const nextYear = Number(today.slice(0, 4)) + 1;

// วันจันทร์แรกของ ก.พ. ปีหน้า — อยู่ในอนาคตเสมอ ไม่คร่อมปี
function firstMondayOfFebruary(year) {
    let date = `${year}-02-01`;
    while (weekdayIndex(date) !== 0) date = addDays(date, 1);
    return date;
}
const futureMonday = firstMondayOfFebruary(nextYear);
const lastWeekMonday = addDays(weekStartOf(today), -7);

async function createPerson(name, permissionKeys, userNumber) {
    const bits = PERMISSION_KEYS.map((key) => (permissionKeys.includes(key) ? "1" : "0")).join("");
    const role = await api.callApi("POST", "/V1/roles", { body: { role_name: `role-${name}`, role_permission: bits } });
    assert.equal(role.status, 201, JSON.stringify(role.body));
    const userId = `USE20990103000${userNumber}`;
    await api.pool.query(
        `INSERT INTO tb_users (user_id, user_username, user_email, user_password, user_fname, user_lname, user_role_id, user_must_change_password)
         VALUES (?, ?, ?, ?, ?, 'ทดสอบ', ?, 0)`,
        [userId, name, `${name}@example.com`, await bcrypt.hash(PASSWORD, 10), name, role.body.role_id],
    );
    return { userId, token: await api.login(name, PASSWORD) };
}

async function createEmployee(code, userId, hireDate = "2026-01-01") {
    const response = await api.callApi("POST", "/V1/employees", {
        body: {
            emp_code: code,
            emp_first_name_th: code,
            emp_last_name_th: "ทดสอบ",
            emp_nickname: code === "LV-DEV" ? "เดฟ" : null,
            emp_hire_date: hireDate,
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

const leave = (typeKey, start, end = start, overrides = {}) => ({
    lr_leave_type_id: leaveTypes[typeKey],
    lr_start_date: start,
    lr_end_date: end,
    lr_half_day: "none",
    lr_reason: null,
    ...overrides,
});

async function createDraft(person, body) {
    return expectStatus(await as(person, "POST", "/V1/leave/requests", body), 201).lr_id;
}

async function findRequest(person, requestId, year = nextYear) {
    const mine = expectStatus(await as(person, "GET", `/V1/leave/me?year=${year}`), 200);
    return mine.requests.find((request) => request.lr_id === requestId);
}

async function submit(person, requestId, year = nextYear) {
    const request = await findRequest(person, requestId, year);
    return as(person, "POST", `/V1/leave/requests/${requestId}/submit`, { lr_version: request.lr_version });
}

async function decide(person, action, requestId, extra = {}, year = nextYear) {
    const pending = expectStatus(await as(people.hr, "GET", "/V1/leave/approvals"), 200).data;
    const request =
        pending.find((item) => item.lr_id === requestId) ?? (await findRequest(people.developer, requestId, year));
    return as(person, "POST", `/V1/leave/requests/${requestId}/${action}`, {
        lr_version: request.lr_version,
        ...extra,
    });
}

async function attachFile(person, requestId) {
    const form = new FormData();
    form.append("file", new Blob([PDF_BYTES], { type: "application/pdf" }), "ใบรับรองแพทย์.pdf");
    return api.callApi("POST", `/V1/leave/requests/${requestId}/attachments`, { token: person.token, body: form });
}

test.before(async () => {
    api = await startTestServer("leave");
    await api.loginAsAdmin();
    people.developer = await createPerson("lv.dev", ["dashboard"], 181);
    people.hr = await createPerson("lv.hr", ["dashboard", "approveLeave"], 182);
    people.newcomer = await createPerson("lv.new", ["dashboard"], 183);
    people.guest = await createPerson("lv.guest", ["dashboard"], 184);
    people.developer.employeeId = await createEmployee("LV-DEV", people.developer.userId);
    people.hr.employeeId = await createEmployee("LV-HR", people.hr.userId);
    people.newcomer.employeeId = await createEmployee("LV-NEW", people.newcomer.userId, today);

    const [types] = await api.pool.query("SELECT lt_id, lt_name_th FROM tb_leave_types");
    const byName = Object.fromEntries(types.map((type) => [type.lt_name_th, type.lt_id]));
    leaveTypes.sick = byName["ลาป่วย"];
    leaveTypes.personal = byName["ลากิจ"];
    leaveTypes.annual = byName["ลาพักร้อน"];
    leaveTypes.unpaid = byName["ลาไม่รับค่าจ้าง"];
    // วันหยุดบริษัทวันพุธของสัปดาห์ที่ใช้เทสต์ — นับวันลาต้องข้ามวันนี้
    await api.pool.query("INSERT INTO tb_company_holidays (hd_date, hd_name) VALUES (?, 'วันหยุดทดสอบ')", [
        addDays(futureMonday, 2),
    ]);
});

test.after(async () => {
    await api?.stop();
});

test("ไม่ได้ผูกพนักงาน: เห็นหน้าเปล่า แต่ขอลาไม่ได้", async () => {
    const mine = expectStatus(await as(people.guest, "GET", "/V1/leave/me"), 200);
    assert.equal(mine.employee, null);
    const created = expectStatus(
        await as(people.guest, "POST", "/V1/leave/requests", leave("personal", futureMonday)),
        409,
    );
    assert.equal(created.code, "NOT_AN_EMPLOYEE");
});

test("ตรวจคำขอ: ครึ่งวันหลายวัน · คร่อมปี · ก่อนวันเริ่มงาน · อายุงานไม่ถึง · ช่วงที่เป็นวันหยุดทั้งหมด", async () => {
    const halfDay = expectStatus(
        await as(
            people.developer,
            "POST",
            "/V1/leave/requests",
            leave("personal", futureMonday, addDays(futureMonday, 1), { lr_half_day: "morning" }),
        ),
        400,
    );
    assert.ok(halfDay.fields.lr_half_day);
    const crossYear = expectStatus(
        await as(
            people.developer,
            "POST",
            "/V1/leave/requests",
            leave("personal", `${nextYear - 1}-12-31`, `${nextYear}-01-02`),
        ),
        400,
    );
    assert.match(crossYear.fields.lr_end_date, /คร่อมปี/);
    const beforeHire = expectStatus(
        await as(people.developer, "POST", "/V1/leave/requests", leave("personal", "2025-12-29")),
        400,
    );
    assert.ok(beforeHire.fields.lr_start_date);

    const newcomerDay = addDays(weekStartOf(addDays(today, 30)), 7);
    const tooNew = expectStatus(
        await as(people.newcomer, "POST", "/V1/leave/requests", leave("annual", newcomerDay)),
        400,
    );
    assert.match(tooNew.fields.lr_leave_type_id, /ทำงานครบ 365 วัน/);

    const saturday = addDays(futureMonday, 5);
    const weekend = expectStatus(
        await as(people.developer, "POST", "/V1/leave/requests", leave("personal", saturday, addDays(saturday, 1))),
        400,
    );
    assert.ok(weekend.fields.lr_end_date);
});

test("จำนวนวัน: ข้ามเสาร์-อาทิตย์และวันหยุดบริษัท · ลาป่วย 3 วันขึ้นไปต้องแนบไฟล์ก่อนส่ง · ทับซ้อนไม่ได้ · เช้า+บ่ายวันเดียวกันได้", async () => {
    // จันทร์–จันทร์ถัดไป: 6 วันทำงาน − วันหยุดพุธ = 5 วัน
    const sickId = await createDraft(people.developer, leave("sick", futureMonday, addDays(futureMonday, 7)));
    const draft = await findRequest(people.developer, sickId);
    assert.equal(draft.lr_status, "draft");
    assert.equal(Number(draft.lr_days), 5);

    const noFile = expectStatus(await submit(people.developer, sickId), 409);
    assert.equal(noFile.code, "LEAVE_ATTACHMENT_REQUIRED");
    expectStatus(await attachFile(people.developer, sickId), 201);
    expectStatus(await submit(people.developer, sickId), 200);
    assert.equal((await findRequest(people.developer, sickId)).lr_status, "pending");

    const overlapId = await createDraft(people.developer, leave("personal", addDays(futureMonday, 1)));
    const overlap = expectStatus(await submit(people.developer, overlapId), 409);
    assert.equal(overlap.code, "LEAVE_OVERLAP");

    const dayAfter = addDays(futureMonday, 14);
    const morningId = await createDraft(
        people.developer,
        leave("personal", dayAfter, dayAfter, { lr_half_day: "morning" }),
    );
    const afternoonId = await createDraft(
        people.developer,
        leave("personal", dayAfter, dayAfter, { lr_half_day: "afternoon" }),
    );
    expectStatus(await submit(people.developer, morningId), 200);
    expectStatus(await submit(people.developer, afternoonId), 200, "เช้า + บ่าย ไม่ทับกัน");
    assert.equal(Number((await findRequest(people.developer, morningId)).lr_days), 0.5);

    // ทำความสะอาด: ลบร่างที่ทับ
    const overlapDraft = await findRequest(people.developer, overlapId);
    expectStatus(
        await as(people.developer, "DELETE", `/V1/leave/requests/${overlapId}`, {
            lr_version: overlapDraft.lr_version,
        }),
        204,
    );
});

test("อนุมัติ: ผู้อนุมัติเห็นเกินโควตา · อนุมัติของตัวเองไม่ได้ · ไม่มีสิทธิ์อนุมัติไม่ได้ · ไม่อนุมัติต้องมีเหตุผล · ยอดคงเหลือ", async () => {
    // ลากิจโควตา 3 วัน: มีรออนุมัติ 1 วัน (เช้า+บ่าย) ขออีก 4 วัน (จ–พฤ สัปดาห์ที่ไม่มีวันหยุด) = เกิน
    const start = addDays(futureMonday, 21);
    const bigId = await createDraft(people.developer, leave("personal", start, addDays(start, 3)));
    expectStatus(await submit(people.developer, bigId), 200);
    const pending = expectStatus(await as(people.hr, "GET", "/V1/leave/approvals"), 200).data;
    const big = pending.find((item) => item.lr_id === bigId);
    assert.equal(big.is_over_quota, true);
    assert.equal(big.employee_name, "LV-DEV ทดสอบ");

    expectStatus(await decide(people.developer, "approve", bigId), 403, "ไม่มีสิทธิ์ approveLeave");
    const missingReason = await decide(people.hr, "reject", bigId);
    expectStatus(missingReason, 400);
    expectStatus(await decide(people.hr, "reject", bigId, { reason: "เกินโควตาลากิจ ใช้พักร้อนแทน" }), 200);
    const rejected = await findRequest(people.developer, bigId);
    assert.equal(rejected.lr_status, "rejected");
    assert.equal(rejected.lr_decision_note, "เกินโควตาลากิจ ใช้พักร้อนแทน");

    const hrLeaveId = await createDraft(people.hr, leave("personal", futureMonday));
    expectStatus(await submit(people.hr, hrLeaveId), 200);
    const hrRequest = await findRequest(people.hr, hrLeaveId);
    const self = expectStatus(
        await as(people.hr, "POST", `/V1/leave/requests/${hrLeaveId}/approve`, { lr_version: hrRequest.lr_version }),
        403,
    );
    assert.equal(self.code, "SELF_APPROVAL_NOT_ALLOWED");
    assert.ok(
        !expectStatus(await as(people.hr, "GET", "/V1/leave/approvals"), 200).data.some(
            (item) => item.lr_id === hrLeaveId,
        ),
        "ไม่เห็นของตัวเองในรายการรออนุมัติ",
    );

    const sick = pending.find(
        (item) => item.lr_employee_id === people.developer.employeeId && Number(item.lr_days) === 5,
    );
    expectStatus(await decide(people.hr, "approve", sick.lr_id), 200);
    const mine = expectStatus(await as(people.developer, "GET", `/V1/leave/me?year=${nextYear}`), 200);
    const sickBalance = mine.balances.find((balance) => balance.lt_id === leaveTypes.sick);
    assert.deepEqual([sickBalance.quota, sickBalance.used, sickBalance.remaining], ["30.00", "5.00", "25.00"]);
    const personalBalance = mine.balances.find((balance) => balance.lt_id === leaveTypes.personal);
    assert.equal(personalBalance.pending, "1.00", "เช้า + บ่าย รออนุมัติ");
});

test("ไฟล์แนบ: เจ้าของ/ผู้อนุมัติเปิดได้ คนอื่นไม่ได้ · ส่งแล้วลบไฟล์ไม่ได้", async () => {
    const mine = expectStatus(await as(people.developer, "GET", `/V1/leave/me?year=${nextYear}`), 200);
    const sick = mine.requests.find((request) => request.attachments.length > 0);
    const fileUrl = `/V1/leave/requests/${sick.lr_id}/attachments/${sick.attachments[0].lra_id}`;
    const download = (person) =>
        fetch(`${api.baseUrl}/api${fileUrl}`, { headers: { Authorization: `Bearer ${person.token}` } });
    assert.equal((await download(people.developer)).status, 200);
    assert.equal((await download(people.hr)).status, 200);
    assert.equal((await download(people.newcomer)).status, 404);
    expectStatus(await as(people.developer, "DELETE", fileUrl), 409, "อนุมัติแล้วลบไฟล์ไม่ได้");
});

test("ลงเวลา: ลาเต็มวันในวันที่ลงชั่วโมงไว้ไม่ได้ (ครึ่งวันได้) · วันลาเต็มวันที่อนุมัติแล้วลงเวลาไม่ได้", async () => {
    const [monday, tuesday] = [lastWeekMonday, addDays(lastWeekMonday, 1)];
    const lastYear = Number(monday.slice(0, 4));
    const week = expectStatus(await as(people.developer, "GET", `/V1/timesheet/me?week=${monday}`), 200);
    expectStatus(
        await as(people.developer, "PUT", "/V1/timesheet/me", {
            week_start: monday,
            tsw_version: week.week.tsw_version,
            entries: [{ tse_date: monday, tse_project_id: null, tse_task_id: null, tse_hours: "4", tse_note: null }],
        }),
        200,
    );

    const fullId = await createDraft(people.developer, leave("personal", monday));
    const blocked = expectStatus(await submit(people.developer, fullId, lastYear), 409);
    assert.equal(blocked.code, "LEAVE_HAS_TIMESHEET");
    const fullDraft = await findRequest(people.developer, fullId, lastYear);
    expectStatus(
        await as(people.developer, "PUT", `/V1/leave/requests/${fullId}`, {
            ...leave("personal", monday, monday, { lr_half_day: "afternoon" }),
            lr_version: fullDraft.lr_version,
        }),
        200,
    );
    expectStatus(await submit(people.developer, fullId, lastYear), 200, "ครึ่งวันลงเวลาได้");

    const tuesdayId = await createDraft(people.developer, leave("unpaid", tuesday));
    expectStatus(await submit(people.developer, tuesdayId, lastYear), 200);
    expectStatus(await decide(people.hr, "approve", tuesdayId, {}, lastYear), 200);

    const after = expectStatus(await as(people.developer, "GET", `/V1/timesheet/me?week=${monday}`), 200);
    const tuesdayInfo = after.days.find((day) => day.date === tuesday);
    assert.equal(tuesdayInfo.leave, "full");
    assert.match(tuesdayInfo.blocked_reason, /ลาเต็มวัน/);
    const onLeave = expectStatus(
        await as(people.developer, "PUT", "/V1/timesheet/me", {
            week_start: monday,
            tsw_version: after.week.tsw_version,
            entries: [
                { tse_date: monday, tse_project_id: null, tse_task_id: null, tse_hours: "4", tse_note: null },
                { tse_date: tuesday, tse_project_id: null, tse_task_id: null, tse_hours: "2", tse_note: null },
            ],
        }),
        400,
    );
    assert.match(onLeave.fields["entries.1.tse_date"], /ลาเต็มวัน/);

    // อนุมัติแล้วและถึงวันแล้ว — ยกเลิกเองไม่ได้ ผู้อนุมัติยกเลิกได้ (ต้องมีเหตุผล)
    const approved = await findRequest(people.developer, tuesdayId, lastYear);
    const ownCancel = expectStatus(
        await as(people.developer, "POST", `/V1/leave/requests/${tuesdayId}/cancel`, {
            lr_version: approved.lr_version,
        }),
        409,
    );
    assert.equal(ownCancel.code, "LEAVE_WRONG_STATUS");
    expectStatus(
        await as(people.hr, "POST", `/V1/leave/requests/${tuesdayId}/cancel-approved`, {
            lr_version: approved.lr_version,
            reason: "เข้ามาทำงานจริง",
        }),
        200,
    );
});

test("ยกเลิกเอง: อนุมัติแล้วแต่ยังไม่ถึงวันยกเลิกได้ · ดึงกลับแล้วแก้ได้", async () => {
    const mine = expectStatus(await as(people.developer, "GET", `/V1/leave/me?year=${nextYear}`), 200);
    const sick = mine.requests.find((request) => request.lr_status === "approved");
    expectStatus(
        await as(people.developer, "POST", `/V1/leave/requests/${sick.lr_id}/cancel`, {
            lr_version: sick.lr_version,
            reason: "หายป่วยแล้ว",
        }),
        200,
    );
    const morning = mine.requests.find((request) => request.lr_half_day === "morning");
    expectStatus(
        await as(people.developer, "POST", `/V1/leave/requests/${morning.lr_id}/withdraw`, {
            lr_version: morning.lr_version,
        }),
        200,
    );
    assert.equal((await findRequest(people.developer, morning.lr_id)).lr_status, "draft");
    const stale = expectStatus(
        await as(people.developer, "POST", `/V1/leave/requests/${morning.lr_id}/submit`, {
            lr_version: morning.lr_version,
        }),
        409,
    );
    assert.equal(stale.code, "LEAVE_CHANGED");
});

test("ปฏิทินทีม: ทุกคนเห็นชื่อและช่วงวัน ไม่เห็นประเภท/เหตุผล · ฝ่ายบุคคลดูยอดลาของพนักงานได้ · ลบพนักงานที่มีคำขอลาไม่ได้", async () => {
    const calendar = expectStatus(
        await as(people.guest, "GET", `/V1/leave/calendar?month=${futureMonday.slice(0, 7)}`),
        200,
    );
    const names = calendar.leaves.map((item) => item.employee_name);
    assert.ok(names.includes("LV-HR ท."), "ไม่มีชื่อเล่น = ชื่อ + อักษรแรกนามสกุล");
    const text = JSON.stringify(calendar);
    assert.ok(!text.includes("lt_name_th") && !text.includes("lr_reason") && !text.includes("ลากิจ"));

    expectStatus(await as(people.guest, "GET", `/V1/leave/balances/${people.developer.employeeId}`), 403);
    const balances = expectStatus(
        await as(people.hr, "GET", `/V1/leave/balances/${people.developer.employeeId}?year=${nextYear}`),
        200,
    );
    assert.ok(balances.balances.some((balance) => balance.lt_id === leaveTypes.sick));

    const removed = expectStatus(await api.callApi("DELETE", `/V1/employees/${people.hr.employeeId}`), 409);
    assert.equal(removed.code, "EMPLOYEE_HAS_HISTORY");
});
