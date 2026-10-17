// บอร์ดงานแบบ Trello (2026-10-17) — ป้ายสีของโปรเจกต์ · ป้ายของงาน · checklist · เรียงลำดับการ์ดในคอลัมน์
// แบบระบบ: docs/plans/2026-10-17-project-kanban.md หัวข้อ 2–2.1
//
// สิทธิ์ตัดสินที่ controller (บิตในโปรเจกต์ + ผู้รับผิดชอบ — กติกาเดิมของงาน) · service ตรวจความถูกต้องของข้อมูล:
// ป้ายต้องเป็นของโปรเจกต์เดียวกับงาน (R-K10) · รายการ id ที่ส่งมาเรียงต้องตรงกับของจริงครบ (R-K2) · ข้อ checklist ต้องอยู่ในงานนั้น
const { AppError } = require("../utils/app-error");
const { MAX_CHECKLIST_ITEMS_PER_TASK, MAX_LABELS_PER_PROJECT } = require("../shared/schemas/task-board.mjs");

function labelNotFound() {
    return new AppError(404, "LABEL_NOT_FOUND", "ไม่พบป้ายนี้ อาจถูกลบไปแล้ว กรุณาโหลดหน้าใหม่");
}

function checklistItemNotFound() {
    return new AppError(404, "CHECKLIST_ITEM_NOT_FOUND", "ไม่พบข้อนี้ใน checklist อาจถูกลบไปแล้ว กรุณาโหลดหน้าใหม่");
}

function orderChanged() {
    return new AppError(
        409,
        "ORDER_CHANGED",
        "รายการในคอลัมน์เปลี่ยนไปแล้ว (มีคนย้าย/เพิ่มงาน) — โหลดบอร์ดใหม่ให้แล้ว ลองเรียงอีกครั้ง",
    );
}

// ─── ป้ายของโปรเจกต์ ─────────────────────────────────────────────────────────────────────────

/**
 * ป้ายทั้งหมดของโปรเจกต์ + จำนวนงานที่ติดป้ายนั้น
 * @param {import("mysql2/promise").Pool | import("mysql2/promise").PoolConnection} conn
 * @param {string} projectId
 */
async function listLabels(conn, projectId) {
    const [rows] = await conn.query(
        `SELECT l.pl_id, l.pl_name, l.pl_color, l.pl_sort_order,
                (SELECT COUNT(*) FROM tb_task_labels tl WHERE tl.tl_label_id = l.pl_id) AS task_count
         FROM tb_project_labels l
         WHERE l.pl_project_id = ?
         ORDER BY l.pl_sort_order, l.pl_id`,
        [projectId],
    );
    return rows.map((row) => ({ ...row, task_count: Number(row.task_count) }));
}

/**
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {string} projectId
 * @param {{ pl_name: string, pl_color: string }} label ผ่าน projectLabelSchema แล้ว
 * @param {{ user_id: string }} actor
 */
async function createLabel(conn, projectId, label, actor) {
    await lockProject(conn, projectId);
    const [[{ labelCount }]] = await conn.query(
        "SELECT COUNT(*) AS labelCount FROM tb_project_labels WHERE pl_project_id = ?",
        [projectId],
    );
    if (Number(labelCount) >= MAX_LABELS_PER_PROJECT) {
        throw new AppError(
            409,
            "TOO_MANY_LABELS",
            `โปรเจกต์หนึ่งมีป้ายได้ไม่เกิน ${MAX_LABELS_PER_PROJECT} ป้าย — ลบป้ายที่ไม่ใช้ก่อน`,
        );
    }
    await assertLabelNameFree(conn, projectId, label.pl_name, null);
    const [result] = await conn.query(
        `INSERT INTO tb_project_labels (pl_project_id, pl_name, pl_color, pl_sort_order, pl_created_by)
         VALUES (?, ?, ?, ?, ?)`,
        [projectId, label.pl_name, label.pl_color, Number(labelCount), actor.user_id],
    );
    return { pl_id: result.insertId };
}

/**
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {string} projectId
 * @param {number} labelId
 * @param {{ pl_name: string, pl_color: string }} label
 */
async function updateLabel(conn, projectId, labelId, label) {
    await findLabel(conn, projectId, labelId, { forUpdate: true });
    await assertLabelNameFree(conn, projectId, label.pl_name, labelId);
    await conn.query("UPDATE tb_project_labels SET pl_name = ?, pl_color = ? WHERE pl_id = ?", [
        label.pl_name,
        label.pl_color,
        labelId,
    ]);
    return { pl_id: labelId };
}

/**
 * ลบป้าย — งานที่ติดป้ายนี้หลุดป้ายตาม (FK cascade ใน transaction เดียว)
 * @returns {Promise<{ removed_from_tasks: number }>}
 */
async function deleteLabel(conn, projectId, labelId) {
    await findLabel(conn, projectId, labelId, { forUpdate: true });
    const [[{ taskCount }]] = await conn.query(
        "SELECT COUNT(*) AS taskCount FROM tb_task_labels WHERE tl_label_id = ?",
        [labelId],
    );
    await conn.query("DELETE FROM tb_project_labels WHERE pl_id = ?", [labelId]);
    return { removed_from_tasks: Number(taskCount) };
}

/**
 * ตั้งป้ายของงานใหม่ทั้งชุด — ทุกป้ายต้องเป็นของโปรเจกต์เดียวกับงาน (R-K10)
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {{ task_id: string, project_id: string }} task
 * @param {number[]} labelIds
 * @returns {Promise<string[]>} ชื่อป้ายหลังแก้ (ใช้เขียนประวัติงาน)
 */
async function setTaskLabels(conn, task, labelIds) {
    let labels = [];
    if (labelIds.length > 0) {
        [labels] = await conn.query(
            "SELECT pl_id, pl_name FROM tb_project_labels WHERE pl_project_id = ? AND pl_id IN (?)",
            [task.project_id, labelIds],
        );
    }
    if (labels.length !== labelIds.length) {
        throw new AppError(
            400,
            "LABEL_NOT_IN_PROJECT",
            "มีป้ายที่ไม่ใช่ของโปรเจกต์นี้ หรือถูกลบไปแล้ว กรุณาโหลดหน้าใหม่",
            {
                label_ids: "เลือกป้ายจากรายการของโปรเจกต์นี้",
            },
        );
    }
    await conn.query("DELETE FROM tb_task_labels WHERE tl_task_id = ?", [task.task_id]);
    for (const labelId of labelIds) {
        await conn.query("INSERT INTO tb_task_labels (tl_task_id, tl_label_id) VALUES (?, ?)", [task.task_id, labelId]);
    }
    return labels.map((label) => label.pl_name);
}

/**
 * ป้ายของทุกงานในโปรเจกต์ (สำหรับรายการงาน/บอร์ด) — query เดียว
 * @returns {Promise<Map<string, object[]>>} task_id → ป้าย
 */
async function findLabelsByTask(conn, projectId) {
    const [rows] = await conn.query(
        `SELECT tl.tl_task_id, l.pl_id, l.pl_name, l.pl_color
         FROM tb_task_labels tl
         JOIN tb_project_labels l ON l.pl_id = tl.tl_label_id
         WHERE l.pl_project_id = ?
         ORDER BY l.pl_sort_order, l.pl_id`,
        [projectId],
    );
    const labelsByTask = new Map();
    for (const { tl_task_id: taskId, ...label } of rows) {
        labelsByTask.set(taskId, [...(labelsByTask.get(taskId) ?? []), label]);
    }
    return labelsByTask;
}

// ─── checklist ────────────────────────────────────────────────────────────────────────────

/**
 * @param {import("mysql2/promise").Pool | import("mysql2/promise").PoolConnection} conn
 * @param {string} taskId
 */
async function listChecklist(conn, taskId) {
    const [rows] = await conn.query(
        `SELECT c.tci_id, c.tci_text, c.tci_is_done, c.tci_sort_order, c.tci_done_at,
                CONCAT(u.user_fname, ' ', u.user_lname) AS done_by_name
         FROM tb_task_checklist_items c
         LEFT JOIN tb_users u ON u.user_id = c.tci_done_by
         WHERE c.tci_task_id = ?
         ORDER BY c.tci_sort_order, c.tci_id`,
        [taskId],
    );
    return rows.map((row) => ({ ...row, tci_is_done: row.tci_is_done === 1 }));
}

/**
 * จำนวนข้อ checklist เสร็จ/ทั้งหมด ต่องาน (สำหรับการ์ด) — query เดียว
 * @returns {Promise<Map<string, { done: number, total: number }>>}
 */
async function findChecklistCounts(conn, projectId) {
    const [rows] = await conn.query(
        `SELECT c.tci_task_id, SUM(c.tci_is_done) AS done_count, COUNT(*) AS total_count
         FROM tb_task_checklist_items c
         JOIN tb_tasks t ON t.task_id = c.tci_task_id
         WHERE t.project_id = ?
         GROUP BY c.tci_task_id`,
        [projectId],
    );
    return new Map(
        rows.map((row) => [row.tci_task_id, { done: Number(row.done_count), total: Number(row.total_count) }]),
    );
}

/**
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {string} taskId
 * @param {string} text
 * @param {{ user_id: string }} actor
 */
async function addChecklistItem(conn, taskId, text, actor) {
    await lockTask(conn, taskId);
    const [[{ itemCount, lastOrder }]] = await conn.query(
        `SELECT COUNT(*) AS itemCount, COALESCE(MAX(tci_sort_order), -1) AS lastOrder
         FROM tb_task_checklist_items WHERE tci_task_id = ?`,
        [taskId],
    );
    if (Number(itemCount) >= MAX_CHECKLIST_ITEMS_PER_TASK) {
        throw new AppError(
            409,
            "TOO_MANY_CHECKLIST_ITEMS",
            `checklist มีได้ไม่เกิน ${MAX_CHECKLIST_ITEMS_PER_TASK} ข้อต่องาน — ถ้างานใหญ่ให้แบ่งเป็น subtask`,
        );
    }
    const [result] = await conn.query(
        `INSERT INTO tb_task_checklist_items (tci_task_id, tci_text, tci_sort_order, tci_created_by)
         VALUES (?, ?, ?, ?)`,
        [taskId, text, Number(lastOrder) + 1, actor.user_id],
    );
    return { tci_id: result.insertId };
}

/**
 * แก้ข้อความ
 * @returns {Promise<{ before: string }>} ข้อความเดิม (ใช้เขียนประวัติงาน)
 */
async function updateChecklistItem(conn, taskId, itemId, text) {
    const item = await findChecklistItem(conn, taskId, itemId);
    await conn.query("UPDATE tb_task_checklist_items SET tci_text = ? WHERE tci_id = ?", [text, itemId]);
    return { before: item.tci_text };
}

/**
 * ติ๊ก/เอาติ๊กออก — ตั้งตามค่าที่ส่ง (กดซ้ำพร้อมกันได้ผลเหมือนเดิม R-K13)
 * @returns {Promise<{ text: string, changed: boolean }>}
 */
async function setChecklistItemDone(conn, taskId, itemId, isDone, actor) {
    const item = await findChecklistItem(conn, taskId, itemId);
    const wasDone = item.tci_is_done === 1;
    if (wasDone === isDone) return { text: item.tci_text, changed: false };
    await conn.query(
        "UPDATE tb_task_checklist_items SET tci_is_done = ?, tci_done_by = ?, tci_done_at = ? WHERE tci_id = ?",
        [isDone ? 1 : 0, isDone ? actor.user_id : null, isDone ? new Date() : null, itemId],
    );
    return { text: item.tci_text, changed: true };
}

/**
 * @returns {Promise<{ text: string }>} ข้อความของข้อที่ลบ (ใช้เขียนประวัติงาน)
 */
async function deleteChecklistItem(conn, taskId, itemId) {
    const item = await findChecklistItem(conn, taskId, itemId);
    await conn.query("DELETE FROM tb_task_checklist_items WHERE tci_id = ?", [itemId]);
    return { text: item.tci_text };
}

/**
 * เรียงลำดับข้อ checklist ใหม่ — ต้องส่งครบทุกข้อของงาน
 */
async function reorderChecklist(conn, taskId, itemIds) {
    await lockTask(conn, taskId);
    const [rows] = await conn.query("SELECT tci_id FROM tb_task_checklist_items WHERE tci_task_id = ?", [taskId]);
    assertSameIds(
        rows.map((row) => row.tci_id),
        itemIds,
    );
    for (const [index, itemId] of itemIds.entries()) {
        await conn.query("UPDATE tb_task_checklist_items SET tci_sort_order = ? WHERE tci_id = ?", [index, itemId]);
    }
}

// ─── เรียงลำดับการ์ดในคอลัมน์ ────────────────────────────────────────────────────────────────────

/**
 * เรียงการ์ดในคอลัมน์ใหม่ — ส่งครบทุกงานในคอลัมน์นั้นระดับเดียวกัน (task หลัก หรือ subtask ใต้แม่เดียวกัน)
 * ใช้ค่า task_sort_order เดิมของงานกลุ่มนี้มาสลับที่กัน (ไม่ใช่ 0,1,2…) ลำดับเทียบกับงานคอลัมน์อื่นในมุมมองตารางจึงไม่กระโดด
 * ค่าที่ซ้ำกัน (งานเก่าที่ sort_order = 0 ทั้งหมด) ขยับให้เพิ่มขึ้นทีละ 1 ไม่งั้นการเรียงไม่มีผล
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {string} projectId
 * @param {{ task_status: string, parent_task_id: string | null, task_ids: string[] }} order ผ่าน taskOrderSchema แล้ว
 */
async function reorderTasks(conn, projectId, order) {
    const [rows] = await conn.query(
        `SELECT task_id, task_sort_order FROM tb_tasks
         WHERE project_id = ? AND task_status = ? AND task_parent_id <=> ?
         ORDER BY task_sort_order, task_id
         FOR UPDATE`,
        [projectId, order.task_status, order.parent_task_id],
    );
    assertSameIds(
        rows.map((row) => row.task_id),
        order.task_ids,
    );
    const sortValues = rows.map((row) => row.task_sort_order);
    for (let index = 1; index < sortValues.length; index++) {
        if (sortValues[index] <= sortValues[index - 1]) sortValues[index] = sortValues[index - 1] + 1;
    }
    for (const [index, taskId] of order.task_ids.entries()) {
        await conn.query("UPDATE tb_tasks SET task_sort_order = ? WHERE task_id = ?", [sortValues[index], taskId]);
    }
}

// ─── ตัวช่วย ────────────────────────────────────────────────────────────────────────────────

function assertSameIds(actualIds, requestedIds) {
    const actual = new Set(actualIds.map(String));
    const requested = new Set(requestedIds.map(String));
    const isSameSize = actual.size === requested.size && requestedIds.length === requested.size;
    if (!isSameSize || [...requested].some((id) => !actual.has(id))) throw orderChanged();
}

async function lockProject(conn, projectId) {
    await conn.query("SELECT project_id FROM tb_projects WHERE project_id = ? FOR UPDATE", [projectId]);
}

async function lockTask(conn, taskId) {
    await conn.query("SELECT task_id FROM tb_tasks WHERE task_id = ? FOR UPDATE", [taskId]);
}

async function findLabel(conn, projectId, labelId, { forUpdate = false } = {}) {
    const [[label]] = await conn.query(
        `SELECT pl_id, pl_name FROM tb_project_labels WHERE pl_id = ? AND pl_project_id = ? ${forUpdate ? "FOR UPDATE" : ""}`,
        [labelId, projectId],
    );
    if (!label) throw labelNotFound();
    return label;
}

async function assertLabelNameFree(conn, projectId, name, labelId) {
    const [[duplicate]] = await conn.query(
        "SELECT pl_id FROM tb_project_labels WHERE pl_project_id = ? AND pl_name = ? AND pl_id <> ?",
        [projectId, name, labelId ?? 0],
    );
    if (duplicate) {
        throw new AppError(400, "VALIDATION", "มีป้ายชื่อนี้ในโปรเจกต์แล้ว", { pl_name: "มีป้ายชื่อนี้แล้ว" });
    }
}

async function findChecklistItem(conn, taskId, itemId) {
    const [[item]] = await conn.query(
        "SELECT tci_id, tci_text, tci_is_done FROM tb_task_checklist_items WHERE tci_id = ? AND tci_task_id = ? FOR UPDATE",
        [itemId, taskId],
    );
    if (!item) throw checklistItemNotFound();
    return item;
}

module.exports = {
    listLabels,
    createLabel,
    updateLabel,
    deleteLabel,
    setTaskLabels,
    findLabelsByTask,
    listChecklist,
    findChecklistCounts,
    addChecklistItem,
    updateChecklistItem,
    setChecklistItemDone,
    deleteChecklistItem,
    reorderChecklist,
    reorderTasks,
};
