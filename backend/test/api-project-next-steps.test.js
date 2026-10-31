// ต่อไปต้องทำ (2026-10-31 · docs/plans/2026-10-31-project-next-steps.md)
// กฎเรียงตามความเร่ง · ขั้นของวงจร (โปรเจกต์ภายในไม่มีขั้นเงิน) · เรื่องเงินเห็นเฉพาะผู้มีสิทธิ์ · ปุ่มตามสิทธิ์ในโปรเจกต์ · วันที่เวลาไทย
const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { startTestServer } = require("./support/test-server");
const { PERMISSION_KEYS } = require("../src/shared/permissions.mjs");
const { todayBangkok } = require("../src/utils/bangkok-time");

const HEAD_OFFICE_ID = "BRA202601010000001";
const PASSWORD = "Staff@2026";

let api;
let clientId;
const people = {};

function daysFromToday(dayCount) {
    const [year, month, day] = todayBangkok().split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day + dayCount)).toISOString().slice(0, 10);
}

let userCounter = 200;
async function createPerson(name, permissionKeys) {
    const bits = PERMISSION_KEYS.map((key) => (permissionKeys.includes(key) ? "1" : "0")).join("");
    const role = await api.callApi("POST", "/V1/roles", { body: { role_name: `role-${name}`, role_permission: bits } });
    assert.equal(role.status, 201, JSON.stringify(role.body));
    userCounter += 1;
    const userId = `USE20990101000${String(userCounter).padStart(4, "0")}`;
    await api.pool.query(
        `INSERT INTO tb_users (user_id, user_username, user_email, user_password, user_fname, user_lname, user_role_id, user_must_change_password)
         VALUES (?, ?, ?, ?, ?, 'ทดสอบ', ?, 0)`,
        [userId, name, `${name}@example.com`, await bcrypt.hash(PASSWORD, 10), name, role.body.role_id],
    );
    return { userId, token: await api.login(name, PASSWORD) };
}

function expectStatus(response, status) {
    assert.equal(response.status, status, JSON.stringify(response.body));
    return response.body;
}

const admin = (method, url, body) => api.callApi(method, url, { body });
const as = (person, method, url) => api.callApi(method, url, { token: person.token });

let memberCounter = 0;
async function addMember(projectId, person) {
    memberCounter += 1;
    await api.pool.query("INSERT INTO tb_project_members (project_member_id, project_id, user_id) VALUES (?, ?, ?)", [
        `MEM2099103100${String(memberCounter).padStart(4, "0")}`,
        projectId,
        person.userId,
    ]);
}

const keysOf = (steps) => steps.items.map((entry) => entry.key);

test.before(async () => {
    api = await startTestServer("project_next_steps");
    await api.loginAsAdmin();
    await api.pool.query(
        "UPDATE tb_company_settings SET cs_vat_registered_from = '2000-01-01', cs_allow_self_approval = 1",
    );
    clientId = expectStatus(await admin("POST", "/V1/clients", { client_name: "ลูกค้าขั้นถัดไป" }), 201).client_id;
    people.developer = await createPerson("ns.developer", ["dashboard", "viewOwnProjects"]);
    people.outsider = await createPerson("ns.outsider", ["dashboard", "viewOwnProjects", "viewInvoices"]);
});

test.after(async () => {
    await api?.stop();
});

test("โปรเจกต์ภายใน: ยังไม่แบ่งงาน → งานเลยกำหนด (เร่งก่อน) → งานครบ ปิดได้ · ไม่มีขั้นเงิน · สมาชิกไม่มีสิทธิ์ = รอ PM · คนนอก 403", async () => {
    const { project_id: projectId } = expectStatus(
        await admin("POST", "/V1/projects", { project_name: "ปรับปรุงระบบภายใน" }),
        201,
    );
    await addMember(projectId, people.developer);

    let steps = expectStatus(await admin("GET", `/V1/projects/${projectId}/next-steps`), 200);
    assert.equal(steps.items[0].key, "no_tasks");
    assert.equal(steps.items[0].action.label, "เพิ่มงาน");
    assert.deepEqual(
        steps.stage.steps.map((step) => step.key),
        ["work", "done"],
        "ไม่มีใบเสนอราคา/ใบแจ้งหนี้ = ไม่มีขั้นเงิน (Q3)",
    );
    assert.equal(steps.stage.current, 0);

    const yesterday = daysFromToday(-1);
    await api.pool.query(
        `INSERT INTO tb_tasks (task_id, project_id, task_title, task_status, task_due_date, task_sort_order) VALUES
            ('TAS20991031000001', ?, 'ออกแบบหน้าแรก', 'todo', ?, 1),
            ('TAS20991031000002', ?, 'ทำหน้าติดต่อ', 'todo', ?, 2)`,
        [projectId, yesterday, projectId, todayBangkok()],
    );
    steps = expectStatus(await admin("GET", `/V1/projects/${projectId}/next-steps`), 200);
    assert.equal(steps.items[0].key, "tasks_overdue", "เลยกำหนดขึ้นก่อนเสมอ");
    assert.equal(steps.items[0].level, "urgent");
    assert.equal(steps.items[0].count, 1, "ครบวันนี้ยังไม่นับว่าเลย");
    assert.match(steps.items[0].reason, /ออกแบบหน้าแรก.*เลยมา 1 วัน/);
    assert.match(steps.items[0].action.href, /#project-tasks$/);

    await api.pool.query("UPDATE tb_tasks SET task_status = 'done' WHERE project_id = ?", [projectId]);
    steps = expectStatus(await admin("GET", `/V1/projects/${projectId}/next-steps`), 200);
    assert.deepEqual(keysOf(steps), ["ready_to_complete"]);
    assert.equal(steps.items[0].action.label, "ปิดโปรเจกต์");
    assert.equal(steps.stage.current, 1, "งานครบ = อยู่ขั้นจบ");

    const developerView = expectStatus(await as(people.developer, "GET", `/V1/projects/${projectId}/next-steps`), 200);
    assert.equal(developerView.items[0].action, null, "สมาชิกไม่มีสิทธิ์แก้โปรเจกต์ = ไม่มีปุ่ม");
    assert.equal(developerView.items[0].waiting_for, "PM ของโปรเจกต์");
    expectStatus(await as(people.outsider, "GET", `/V1/projects/${projectId}/next-steps`), 403);

    await api.pool.query("UPDATE tb_projects SET project_status = 'cancelled' WHERE project_id = ?", [projectId]);
    steps = expectStatus(await admin("GET", `/V1/projects/${projectId}/next-steps`), 200);
    assert.equal(steps.stage, null, "ยกเลิกแล้ว = ไม่มีขั้น");
    assert.deepEqual(steps.items, [], "ยกเลิกแล้ว = ไม่มีเรื่องค้าง");
});

test("ลูกค้าตรง: ออกใบมัดจำ → ลูกค้าค้างจ่าย (เร่ง) → งานครบยังไม่ออกงวดที่เหลือ · สมาชิกทั่วไปไม่เห็นเรื่องเงิน", async () => {
    const quotation = expectStatus(
        await admin("POST", "/V1/quotations", {
            qt_client_id: clientId,
            qt_branch_id: HEAD_OFFICE_ID,
            qt_valid_days: 30,
            qt_title: "เว็บร้านค้า",
            qt_currency: "THB",
            qt_payment_mode: "milestones",
            milestones: [
                { qtm_name: "มัดจำ", qtm_percent: "30" },
                { qtm_name: "ส่งมอบ", qtm_percent: "40" },
                { qtm_name: "ปิดงาน", qtm_percent: "30" },
            ],
            items: [
                { qti_type: "item", qti_description: "หน้าเว็บ", qti_quantity: "1", qti_unit_price: "6000" },
                { qti_type: "item", qti_description: "ระบบตะกร้า", qti_quantity: "1", qti_unit_price: "4000" },
            ],
        }),
        201,
    );
    expectStatus(await admin("POST", `/V1/quotations/${quotation.qt_id}/submit`, {}), 200);
    expectStatus(await admin("POST", `/V1/quotations/${quotation.qt_id}/approve`, {}), 200);
    const { project_id: projectId } = expectStatus(
        await admin("POST", `/V1/quotations/${quotation.qt_id}/accept`, { project_mode: "new", create_tasks: true }),
        200,
    );
    await addMember(projectId, people.developer);

    let steps = expectStatus(await admin("GET", `/V1/projects/${projectId}/next-steps`), 200);
    assert.equal(steps.items[0].key, "deposit_not_invoiced");
    assert.match(steps.items[0].title, /มัดจำ/);
    assert.equal(steps.items[0].action.href, `/sales/invoices/new?quotation=${quotation.qt_id}`);
    assert.deepEqual(
        steps.stage.steps.map((step) => step.key),
        ["agree", "work", "collect", "done"],
    );
    assert.equal(steps.stage.current, 1, "ตอบรับแล้ว = อยู่ขั้นทำงาน");

    let developerView = expectStatus(await as(people.developer, "GET", `/V1/projects/${projectId}/next-steps`), 200);
    assert.deepEqual(keysOf(developerView), ["next_task"], "สมาชิกทั่วไปเห็นแค่เรื่องงาน (Q4)");

    // ออกใบมัดจำแล้วเลยกำหนดชำระ
    const billable = expectStatus(await admin("GET", `/V1/quotations/${quotation.qt_id}/billable-milestones`), 200);
    const invoice = expectStatus(
        await admin("POST", "/V1/invoices", {
            quotation_id: quotation.qt_id,
            milestone_ids: [billable.milestones[0].qtm_id],
        }),
        201,
    );
    expectStatus(await admin("POST", `/V1/invoices/${invoice.inv_id}/issue`, {}), 200);
    await api.pool.query("UPDATE tb_invoices SET inv_due_date = ? WHERE inv_id = ?", [
        daysFromToday(-5),
        invoice.inv_id,
    ]);
    steps = expectStatus(await admin("GET", `/V1/projects/${projectId}/next-steps`), 200);
    assert.equal(steps.items[0].key, "invoice_overdue");
    assert.equal(steps.items[0].title, "ลูกค้าค้างจ่าย 3,210.00 บาท");
    assert.match(steps.items[0].reason, /เลยกำหนดชำระ 5 วัน/);
    assert.equal(steps.items[0].action.label, "บันทึกรับเงิน");
    assert.ok(!keysOf(steps).includes("deposit_not_invoiced"), "ออกใบงวดแรกแล้ว ไม่เตือนซ้ำ");

    developerView = expectStatus(await as(people.developer, "GET", `/V1/projects/${projectId}/next-steps`), 200);
    for (const entry of developerView.items)
        assert.doesNotMatch(`${entry.title} ${entry.reason}`, /บาท/, "ไม่มีสิทธิ์เงิน = ไม่เห็นยอด");

    // งานครบ: งวดที่เหลือ 2 งวดยังไม่ออกใบ
    await api.pool.query("UPDATE tb_tasks SET task_status = 'done' WHERE project_id = ?", [projectId]);
    steps = expectStatus(await admin("GET", `/V1/projects/${projectId}/next-steps`), 200);
    assert.deepEqual(keysOf(steps), ["invoice_overdue", "work_done_not_billed"]);
    assert.equal(steps.items[1].title, "งานครบแล้ว ยังไม่ออกใบแจ้งหนี้ 2 งวด");
    assert.ok(!keysOf(steps).includes("ready_to_complete"), "เงินยังไม่ครบ = ยังไม่ชวนปิดโปรเจกต์");
    assert.equal(steps.stage.current, 2, "งานครบ = อยู่ขั้นเก็บเงิน");
});

test("Fastwork: ส่งงวดครบแต่งานในโปรเจกต์ยังค้าง = ยังอยู่ขั้นทำงาน · ส่งแล้วรอบันทึกเงิน · ไม่ได้แบ่งงานแต่ส่งครบ = ไม่ชวนแบ่งงาน", async () => {
    const job = expectStatus(
        await admin("POST", "/V1/fastwork/projects", {
            project_name: "เว็บ Fastwork ขั้นถัดไป",
            client_name: "buyer_next",
            milestones: [{ fwm_name: "งานทั้งหมด", fwm_amount: "1900" }],
            tasks: [
                { type: "item", description: "หน้าแรก" },
                { type: "item", description: "หน้าติดต่อ" },
            ],
        }),
        201,
    );
    await api.pool.query("UPDATE tb_fastwork_milestones SET fwm_delivered_at = NOW() WHERE fwm_project_id = ?", [
        job.project_id,
    ]);
    await api.pool.query("UPDATE tb_tasks SET task_status = 'done' WHERE project_id = ? AND task_title = 'หน้าแรก'", [
        job.project_id,
    ]);

    let steps = expectStatus(await admin("GET", `/V1/projects/${job.project_id}/next-steps`), 200);
    assert.equal(steps.items[0].key, "fastwork_record");
    assert.match(steps.items[0].action.href, /#project-fastwork$/);
    assert.equal(steps.stage.steps[steps.stage.current].key, "work", "งานในโปรเจกต์ยังค้าง 1 ชิ้น");
    assert.ok(!keysOf(steps).includes("ready_to_complete"));

    // ไม่ได้แบ่งงานเลย แต่ส่งงวดครบ = งานถือว่าครบ (ไม่ชวนแบ่งงานย้อนหลัง)
    await api.pool.query("DELETE FROM tb_tasks WHERE project_id = ?", [job.project_id]);
    steps = expectStatus(await admin("GET", `/V1/projects/${job.project_id}/next-steps`), 200);
    assert.ok(!keysOf(steps).includes("no_tasks"));
    assert.equal(steps.stage.steps[steps.stage.current].key, "collect");
    assert.equal(steps.stage.steps[0].is_complete, true);

    // ส่งงานครบแล้วแต่เลยวันครบของโปรเจกต์ = ไม่เตือนเลยกำหนดย้อนหลัง
    await api.pool.query(
        "UPDATE tb_projects SET project_due_date = DATE_SUB(CURDATE(), INTERVAL 3 DAY) WHERE project_id = ?",
        [job.project_id],
    );
    steps = expectStatus(await admin("GET", `/V1/projects/${job.project_id}/next-steps`), 200);
    assert.ok(!keysOf(steps).includes("project_overdue"), "ส่งงานครบแล้ว");
});

test("รายการโปรเจกต์: เรื่องแรกของแต่ละโปรเจกต์ + ตัวเลขบนตัวกรองนับจากทั้งหมด + กรอง ?next= แล้วแบ่งหน้าถูก", async () => {
    const list = expectStatus(await admin("GET", "/V1/projects?limit=100"), 200);
    assert.ok(list.next_counts, "มีตัวเลขบนตัวกรอง");
    const byLevel = { urgent: 0, todo: 0, wait: 0 };
    for (const row of list.data) {
        if (row.next_step && row.next_step.level in byLevel) byLevel[row.next_step.level] += 1;
    }
    assert.deepEqual(list.next_counts, byLevel, "ตัวเลขบนตัวกรอง = นับจากเรื่องแรกของทุกโปรเจกต์");
    assert.ok(list.next_counts.urgent >= 1, "ลูกค้าค้างจ่ายจากเทสต์ก่อนหน้า");

    const urgentOnly = expectStatus(await admin("GET", "/V1/projects?limit=100&next=urgent"), 200);
    assert.equal(urgentOnly.total, list.next_counts.urgent);
    assert.ok(urgentOnly.data.every((row) => row.next_step.level === "urgent"));
    const firstPage = expectStatus(await admin("GET", "/V1/projects?limit=1&offset=0&next=todo"), 200);
    assert.equal(firstPage.total, list.next_counts.todo, "total = ทั้งหมดที่ผ่านตัวกรอง ไม่ใช่แค่หน้านี้");
    assert.ok(firstPage.data.length <= 1);

    // สมาชิกทั่วไปไม่เห็นเรื่องเงินในรายการด้วย
    const developerList = expectStatus(await as(people.developer, "GET", "/V1/projects?limit=100"), 200);
    for (const row of developerList.data) {
        if (row.next_step) assert.doesNotMatch(row.next_step.title, /บาท/);
    }
});

test("แดชบอร์ด: สิ่งที่ต้องทำรวมทุกโปรเจกต์ = เฉพาะเรื่องเร่ง/ถึงคิวที่กดทำได้เอง · เร่งขึ้นก่อน · คนไม่มีสิทธิ์เงินไม่เห็นเรื่องเงิน", async () => {
    const business = expectStatus(await admin("GET", "/V1/dashboard/business"), 200);
    assert.ok(business.todo.items.length > 0);
    assert.ok(business.todo.items.length <= 8);
    for (const entry of business.todo.items) {
        assert.ok(["urgent", "todo"].includes(entry.level));
        assert.ok(entry.action, "มีปุ่มพาไปทำทุกเรื่อง");
        assert.ok(entry.project_id && entry.project_name);
    }
    assert.equal(business.todo.items[0].level, "urgent");
    assert.ok(business.todo.total >= business.todo.items.length);

    const developerBusiness = expectStatus(await as(people.developer, "GET", "/V1/dashboard/business"), 200);
    for (const entry of developerBusiness.todo.items) {
        assert.doesNotMatch(`${entry.title} ${entry.reason}`, /บาท/);
        assert.ok(entry.action);
    }
});
