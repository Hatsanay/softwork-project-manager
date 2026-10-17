// บอร์ดงานแบบ Trello — ย้ายสถานะพร้อมกันได้ 409 · เรียงลำดับ (editTask) · ป้ายสีของโปรเจกต์ · checklist · ลิงก์ลูกค้าไม่เห็นของใหม่
// ยิงผ่านเซิร์ฟเวอร์จริงบนฐานข้อมูลชั่วคราว · แบบระบบ: docs/plans/2026-10-17-project-kanban.md หัวข้อ 2–2.1 และ R-K1/R-K2/R-K10/R-K13/R-K14
const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { startTestServer } = require("./support/test-server");
const { PERMISSION_KEYS } = require("../src/shared/permissions.mjs");
const { PROJECT_PERMISSION_KEYS } = require("../src/utils/projectPermissions");

const PASSWORD = "Staff@2026";
const PROJECT_ID = "PRO209901020000001";
const OTHER_PROJECT_ID = "PRO209901020000002";
const SHARE_TOKEN = "token-board-share-test";
const PM_POSITION_ID = "POS202601010000001";
const DEVELOPER_POSITION_ID = "POS209901020000002";
const TASKS = {
    mine: "TAS209901020000001", // ผู้รับผิดชอบ = developer
    unassigned: "TAS209901020000002",
    doing: "TAS209901020000003",
    subtask: "TAS209901020000004", // อยู่ใต้ mine
};

let api;
const people = {};

function positionBits(keys) {
    return PROJECT_PERMISSION_KEYS.map((key) => (keys.includes(key) ? "1" : "0")).join("");
}

async function createPerson(name, userNumber) {
    const bits = PERMISSION_KEYS.map((key) => (key === "dashboard" ? "1" : "0")).join("");
    const role = await api.callApi("POST", "/V1/roles", { body: { role_name: `role-${name}`, role_permission: bits } });
    assert.equal(role.status, 201, JSON.stringify(role.body));
    const userId = `USE20990102000${userNumber}`;
    await api.pool.query(
        `INSERT INTO tb_users (user_id, user_username, user_email, user_password, user_fname, user_lname, user_role_id, user_must_change_password)
         VALUES (?, ?, ?, ?, ?, 'ทดสอบ', ?, 0)`,
        [userId, name, `${name}@example.com`, await bcrypt.hash(PASSWORD, 10), name, role.body.role_id],
    );
    return { userId, token: await api.login(name, PASSWORD) };
}

async function addMember(userId, positionId, memberNumber) {
    const memberId = `PME20990102000${memberNumber}`;
    await api.pool.query("INSERT INTO tb_project_members (project_member_id, project_id, user_id) VALUES (?, ?, ?)", [
        memberId,
        PROJECT_ID,
        userId,
    ]);
    await api.pool.query("INSERT INTO tb_project_member_positions (project_member_id, position_id) VALUES (?, ?)", [
        memberId,
        positionId,
    ]);
}

function as(person, method, url, body) {
    return api.callApi(method, url, { token: person?.token, body });
}

function expectStatus(response, status) {
    assert.equal(response.status, status, JSON.stringify(response.body));
    return response.body;
}

async function listTasks(person = people.manager) {
    return expectStatus(await as(person, "GET", `/V1/projects/${PROJECT_ID}/tasks`), 200).data;
}

const projectUrl = `/V1/projects/${PROJECT_ID}`;

test.before(async () => {
    api = await startTestServer("task_board");
    await api.loginAsAdmin();
    people.developer = await createPerson("kb.dev", 171);
    people.manager = await createPerson("kb.pm", 172);

    await api.pool.query(
        `INSERT INTO tb_projects (project_id, project_name, project_share_token, project_share_enabled, project_created_by)
         VALUES (?, 'บอร์ดทดสอบ', ?, TRUE, 'USE202601010000001'), (?, 'โปรเจกต์อื่น', 'token-board-other', FALSE, 'USE202601010000001')`,
        [PROJECT_ID, SHARE_TOKEN, OTHER_PROJECT_ID],
    );
    await api.pool.query(
        "INSERT INTO tb_project_positions (position_id, position_name, position_permission) VALUES (?, 'Developer', ?)",
        [DEVELOPER_POSITION_ID, positionBits(["changeOwnTaskStatus", "editOwnTask", "changeOwnSubtaskStatus"])],
    );
    await addMember(people.developer.userId, DEVELOPER_POSITION_ID, 171);
    await addMember(people.manager.userId, PM_POSITION_ID, 172);

    await api.pool.query(
        `INSERT INTO tb_tasks (task_id, project_id, task_parent_id, task_title, task_status, task_sort_order) VALUES
            (?, ?, NULL, 'ออกแบบ API', 'todo', 0),
            (?, ?, NULL, 'เขียนคู่มือ', 'todo', 0),
            (?, ?, NULL, 'หน้า login', 'in_progress', 5),
            (?, ?, ?, 'endpoint ผู้ใช้', 'todo', 0)`,
        [
            TASKS.mine,
            PROJECT_ID,
            TASKS.unassigned,
            PROJECT_ID,
            TASKS.doing,
            PROJECT_ID,
            TASKS.subtask,
            PROJECT_ID,
            TASKS.mine,
        ],
    );
    await api.pool.query("INSERT INTO tb_task_assignees (task_id, user_id) VALUES (?, ?)", [
        TASKS.mine,
        people.developer.userId,
    ]);
});

test.after(async () => {
    await api?.stop();
});

test("ย้ายสถานะ: expected_status ไม่ตรง = 409 (มีคนย้ายไปก่อน) · สถานะเดิม = ไม่ทำอะไร · ไม่ส่งก็ใช้ได้เหมือนเดิม · ย้ายงานคนอื่นไม่ได้ตามสิทธิ์", async () => {
    const statusUrl = `${projectUrl}/tasks/${TASKS.mine}/status`;
    const stale = expectStatus(
        await as(people.developer, "PUT", statusUrl, { task_status: "in_progress", expected_status: "review" }),
        409,
    );
    assert.equal(stale.code, "TASK_STATUS_CHANGED");

    expectStatus(
        await as(people.developer, "PUT", statusUrl, { task_status: "in_progress", expected_status: "todo" }),
        200,
    );
    const same = expectStatus(
        await as(people.developer, "PUT", statusUrl, { task_status: "in_progress", expected_status: "in_progress" }),
        200,
    );
    assert.equal(same.message, "สถานะเดิมอยู่แล้ว");
    const [logs] = await api.pool.query(
        "SELECT COUNT(*) AS total FROM tb_task_activity_log WHERE task_id = ? AND log_action = 'status_changed'",
        [TASKS.mine],
    );
    assert.equal(Number(logs[0].total), 1, "ย้ายไปสถานะเดิมไม่เขียนประวัติซ้ำ");

    expectStatus(await as(people.developer, "PUT", statusUrl, { task_status: "todo" }), 200);
    expectStatus(
        await as(people.developer, "PUT", `${projectUrl}/tasks/${TASKS.unassigned}/status`, {
            task_status: "in_progress",
            expected_status: "todo",
        }),
        403,
    );
});

test("เรียงลำดับการ์ด: ต้องมีสิทธิ์แก้ไขงาน · ส่งไม่ครบคอลัมน์ = 409 · ลำดับใหม่ใช้กับรายการงาน", async () => {
    const order = { task_status: "todo", parent_task_id: null, task_ids: [TASKS.unassigned, TASKS.mine] };
    expectStatus(await as(people.developer, "PUT", `${projectUrl}/task-order`, order), 403);
    const partial = expectStatus(
        await as(people.manager, "PUT", `${projectUrl}/task-order`, { ...order, task_ids: [TASKS.unassigned] }),
        409,
    );
    assert.equal(partial.code, "ORDER_CHANGED");
    expectStatus(
        await as(people.manager, "PUT", `${projectUrl}/task-order`, {
            ...order,
            task_ids: [TASKS.unassigned, TASKS.doing],
        }),
        409,
        "ปนงานคอลัมน์อื่น",
    );

    expectStatus(await as(people.manager, "PUT", `${projectUrl}/task-order`, order), 200);
    const todo = (await listTasks()).filter((task) => task.task_status === "todo" && !task.task_parent_id);
    assert.deepEqual(
        todo.map((task) => task.task_id),
        [TASKS.unassigned, TASKS.mine],
    );
    assert.ok(todo[0].task_sort_order < todo[1].task_sort_order, "ค่าซ้ำ (0, 0) ถูกขยับให้เรียงได้จริง");
});

test("ป้ายสี: จัดการได้เฉพาะผู้มีสิทธิ์แก้ข้อมูลโปรเจกต์ · ชื่อซ้ำไม่ได้ · ติดป้ายของโปรเจกต์อื่นไม่ได้ · ลบป้ายแล้วหลุดจากงาน", async () => {
    expectStatus(await as(people.developer, "POST", `${projectUrl}/labels`, { pl_name: "ด่วน", pl_color: "red" }), 403);
    const urgent = expectStatus(
        await as(people.manager, "POST", `${projectUrl}/labels`, { pl_name: "ด่วน", pl_color: "red" }),
        201,
    );
    const frontend = expectStatus(
        await as(people.manager, "POST", `${projectUrl}/labels`, { pl_name: "Frontend", pl_color: "sky" }),
        201,
    );
    const duplicate = expectStatus(
        await as(people.manager, "POST", `${projectUrl}/labels`, { pl_name: "ด่วน", pl_color: "green" }),
        400,
    );
    assert.ok(duplicate.fields.pl_name);
    expectStatus(
        await as(people.manager, "POST", `${projectUrl}/labels`, { pl_name: "ผิดสี", pl_color: "gold" }),
        400,
    );

    const [otherLabel] = await api.pool.query(
        "INSERT INTO tb_project_labels (pl_project_id, pl_name, pl_color) VALUES (?, 'ของโปรเจกต์อื่น', 'blue')",
        [OTHER_PROJECT_ID],
    );
    const foreign = expectStatus(
        await as(people.developer, "PUT", `${projectUrl}/tasks/${TASKS.mine}/labels`, {
            label_ids: [urgent.pl_id, otherLabel.insertId],
        }),
        400,
    );
    assert.equal(foreign.code, "LABEL_NOT_IN_PROJECT");

    expectStatus(
        await as(people.developer, "PUT", `${projectUrl}/tasks/${TASKS.mine}/labels`, {
            label_ids: [urgent.pl_id, frontend.pl_id],
        }),
        200,
        "ผู้รับผิดชอบ + editOwnTask ติดป้ายงานตัวเองได้",
    );
    expectStatus(
        await as(people.developer, "PUT", `${projectUrl}/tasks/${TASKS.unassigned}/labels`, { label_ids: [urgent.pl_id] }),
        403,
    );
    const mine = (await listTasks()).find((task) => task.task_id === TASKS.mine);
    assert.deepEqual(
        mine.labels.map((label) => [label.pl_name, label.pl_color]),
        [
            ["ด่วน", "red"],
            ["Frontend", "sky"],
        ],
    );

    const labels = expectStatus(await as(people.developer, "GET", `${projectUrl}/labels`), 200).data;
    assert.equal(labels.find((label) => label.pl_id === urgent.pl_id).task_count, 1);
    const removed = expectStatus(await as(people.manager, "DELETE", `${projectUrl}/labels/${urgent.pl_id}`), 200);
    assert.equal(removed.removed_from_tasks, 1);
    const afterDelete = (await listTasks()).find((task) => task.task_id === TASKS.mine);
    assert.deepEqual(
        afterDelete.labels.map((label) => label.pl_name),
        ["Frontend"],
    );
    expectStatus(await as(people.manager, "DELETE", `${projectUrl}/labels/${otherLabel.insertId}`), 404, "ป้ายของโปรเจกต์อื่น");
});

test("checklist: แก้ได้ตามสิทธิ์แก้งาน · ติ๊กตามสิทธิ์เปลี่ยนสถานะ · ติ๊กซ้ำผลเหมือนเดิม · นับบนการ์ด · เข้าประวัติงาน", async () => {
    const checklistUrl = `${projectUrl}/tasks/${TASKS.mine}/checklist`;
    expectStatus(
        await as(people.developer, "POST", `${projectUrl}/tasks/${TASKS.unassigned}/checklist`, { tci_text: "ไม่ใช่งานฉัน" }),
        403,
    );
    const first = expectStatus(await as(people.developer, "POST", checklistUrl, { tci_text: "ออกแบบ schema" }), 201);
    const second = expectStatus(await as(people.developer, "POST", checklistUrl, { tci_text: "เขียนเทสต์" }), 201);

    expectStatus(await as(people.developer, "PUT", `${checklistUrl}/${first.tci_id}/done`, { tci_is_done: true }), 200);
    expectStatus(await as(people.developer, "PUT", `${checklistUrl}/${first.tci_id}/done`, { tci_is_done: true }), 200);
    let mine = (await listTasks()).find((task) => task.task_id === TASKS.mine);
    assert.deepEqual([mine.checklist_done, mine.checklist_total], [1, 2]);
    assert.deepEqual([mine.subtask_done, mine.subtask_total], [0, 1]);

    expectStatus(
        await as(people.developer, "PUT", `${projectUrl}/tasks/${TASKS.unassigned}/checklist/${first.tci_id}/done`, {
            tci_is_done: false,
        }),
        403,
        "ไม่ใช่ผู้รับผิดชอบ",
    );
    expectStatus(
        await as(people.manager, "PUT", `${projectUrl}/tasks/${TASKS.unassigned}/checklist/${first.tci_id}/done`, {
            tci_is_done: false,
        }),
        404,
        "ข้อของงานอื่น",
    );

    expectStatus(
        await as(people.developer, "PUT", `${projectUrl}/tasks/${TASKS.mine}/checklist-order`, {
            item_ids: [second.tci_id, first.tci_id],
        }),
        200,
    );
    const items = expectStatus(await as(people.developer, "GET", checklistUrl), 200).data;
    assert.deepEqual(
        items.map((item) => [item.tci_text, item.tci_is_done]),
        [
            ["เขียนเทสต์", false],
            ["ออกแบบ schema", true],
        ],
    );
    expectStatus(await as(people.developer, "DELETE", `${checklistUrl}/${second.tci_id}`), 204);
    mine = (await listTasks()).find((task) => task.task_id === TASKS.mine);
    assert.deepEqual([mine.checklist_done, mine.checklist_total], [1, 1]);

    const [logs] = await api.pool.query(
        "SELECT log_message FROM tb_task_activity_log WHERE task_id = ? AND log_action = 'edited' ORDER BY log_created_at, log_id",
        [TASKS.mine],
    );
    const messages = logs.map((log) => log.log_message);
    assert.ok(messages.includes("ติ๊กเสร็จ checklist: ออกแบบ schema"));
    assert.equal(
        messages.filter((message) => message === "ติ๊กเสร็จ checklist: ออกแบบ schema").length,
        1,
        "ติ๊กซ้ำไม่เขียนประวัติซ้ำ",
    );
    assert.ok(messages.includes("ลบ checklist: เขียนเทสต์"));
});

test("ลิงก์ลูกค้าไม่มีป้ายสีและ checklist (ข้อมูลภายในทีม)", async () => {
    const shared = expectStatus(await api.callApi("GET", `/V1/share/${SHARE_TOKEN}`, { token: null }), 200);
    const text = JSON.stringify(shared);
    assert.ok(!text.includes("Frontend"), "ไม่มีชื่อป้าย");
    assert.ok(!text.includes("ออกแบบ schema"), "ไม่มีข้อ checklist");
    assert.ok(!text.includes("checklist"), "ไม่มีช่อง checklist");
});
