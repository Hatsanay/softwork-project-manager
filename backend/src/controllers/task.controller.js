const pool = require("../config/db");
const { generateDailyId } = require("../utils/generateDailyId");
const { recomputeProjectProgress } = require("../utils/projectProgress");
const { hasProjectBit } = require("../utils/projectPermissions");
const { sendTaskAssignedEmail } = require("../utils/mailer");

async function writeTaskLog({ task_id, user_id, action, old_value, new_value, message }) {
    const log_id = await generateDailyId("tb_task_activity_log", "log_id", "LOG");

    let fullname = null;
    if (user_id) {
        const [userRows] = await pool.query(
            "SELECT CONCAT(user_fname, ' ', user_lname) AS fullname FROM tb_users WHERE user_id = ?",
            [user_id]
        );
        fullname = userRows[0]?.fullname ?? null;
    }

    await pool.query(
        `INSERT INTO tb_task_activity_log
            (log_id, task_id, user_id, log_fullname, log_action, log_old_value, log_new_value, log_message)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [log_id, task_id, user_id ?? null, fullname, action, old_value ?? null, new_value ?? null, message ?? null]
    );
}

async function isAssignee(taskId, userId) {
    const [rows] = await pool.query(
        "SELECT 1 FROM tb_task_assignees WHERE task_id = ? AND user_id = ?",
        [taskId, userId]
    );
    return rows.length > 0;
}

async function hasProjectPositionBit(projectId, userId, key) {
    const [permRows] = await pool.query(
        `SELECT pp.position_permission
         FROM tb_project_members pm
         JOIN tb_project_member_positions pmp ON pmp.project_member_id = pm.project_member_id
         JOIN tb_project_positions pp ON pp.position_id = pmp.position_id
         WHERE pm.project_id = ? AND pm.user_id = ?`,
        [projectId, userId]
    );
    return permRows.some((r) => hasProjectBit(r.position_permission, key));
}

// แก้ไขข้อมูล task (full edit) ได้ถ้ามีสิทธิ์ editTask (แก้ไขได้ทุก task) ในโปรเจกต์
// หรือมีสิทธิ์ editOwnTask "และ" เป็นผู้รับผิดชอบของ task นั้นเอง (ทั้ง task หลักและ subtask)
// ความรับผิดชอบต่อ "task แม่" ไม่นับต่อมาถึง subtask สำหรับการแก้ไขข้อมูลเต็มรูปแบบ
// ถ้าไม่มีทั้งสองสิทธิ์นี้เลย แก้ไขข้อมูล task ไม่ได้ แม้จะเป็นผู้รับผิดชอบก็ตาม
async function canEditTask(projectId, taskId, userId) {
    if (await hasProjectPositionBit(projectId, userId, "editTask")) return true;
    if ((await isAssignee(taskId, userId)) && (await hasProjectPositionBit(projectId, userId, "editOwnTask"))) return true;
    return false;
}

// เพิ่ม task ระดับบนสุดต้องมีสิทธิ์ addTask เท่านั้น
// เพิ่ม subtask ได้เพิ่มถ้ามีสิทธิ์ addOwnSubtask "และ" เป็นผู้รับผิดชอบของ task แม่
async function canAddTask(projectId, parentTaskId, userId) {
    if (await hasProjectPositionBit(projectId, userId, "addTask")) return true;
    if (parentTaskId) {
        const isParentAssignee = await isAssignee(parentTaskId, userId);
        if (isParentAssignee && (await hasProjectPositionBit(projectId, userId, "addOwnSubtask"))) return true;
    }
    return false;
}

// เปลี่ยนสถานะ task/subtask ตอนนี้ต้องมีสิทธิ์ชัดเจนเสมอ ไม่มี bypass อัตโนมัติแบบเดิมอีกต่อไป
// - task ระดับบนสุด: ต้องมี changeTaskStatus (เปลี่ยนได้ทุก task) หรือ changeOwnTaskStatus "และ" เป็นผู้รับผิดชอบของ task นั้นเอง
// - subtask: ต้องมี changeSubtaskStatus (เปลี่ยนได้ทุก subtask) หรือ changeOwnSubtaskStatus "และ" เป็นผู้รับผิดชอบของ subtask นั้นเอง
// ความรับผิดชอบต่อ "task แม่" ไม่นับต่อมาถึง subtask — ต้องเป็นผู้รับผิดชอบของตัว subtask เองเท่านั้น
async function canChangeStatus(projectId, task, userId) {
    const isSubtask = !!task.task_parent_id;
    const allKey = isSubtask ? "changeSubtaskStatus" : "changeTaskStatus";
    const ownKey = isSubtask ? "changeOwnSubtaskStatus" : "changeOwnTaskStatus";

    if (await hasProjectPositionBit(projectId, userId, allKey)) return true;
    if ((await isAssignee(task.task_id, userId)) && (await hasProjectPositionBit(projectId, userId, ownKey))) return true;
    return false;
}

async function attachAssignees(projectId, tasks) {
    if (tasks.length === 0) return tasks;
    const [assigneeRows] = await pool.query(
        `SELECT ta.task_id, u.user_id, CONCAT(u.user_fname, ' ', u.user_lname) AS user_fullname
         FROM tb_task_assignees ta
         JOIN tb_users u ON u.user_id = ta.user_id
         JOIN tb_tasks t ON t.task_id = ta.task_id
         WHERE t.project_id = ?`,
        [projectId]
    );
    return tasks.map((t) => ({
        ...t,
        assignees: assigneeRows
            .filter((a) => a.task_id === t.task_id)
            .map((a) => ({ user_id: a.user_id, user_fullname: a.user_fullname })),
    }));
}

// ส่งอีเมลแจ้งเฉพาะคนที่เพิ่ง "ถูกเพิ่ม" เป็นผู้รับผิดชอบ (เทียบรายชื่อเก่ากับใหม่) ไม่แจ้งซ้ำคนที่มีอยู่แล้ว
// fire-and-forget เสมอ — เรียกแล้วไม่ await ในตัว caller ป้องกันไม่ให้อีเมลพังแล้วทำให้สร้าง/แก้ไข task ล้มเหลวไปด้วย
async function notifyNewAssignees({
    project_id, task_title, task_description, task_status,
    task_start_date, task_due_date, previousAssigneeIds, newAssigneeIds, assignerUserId,
}) {
    const newlyAdded = (newAssigneeIds ?? []).filter((id) => !previousAssigneeIds.includes(id));
    if (newlyAdded.length === 0) return;

    try {
        const [[project]] = await pool.query("SELECT project_name FROM tb_projects WHERE project_id = ?", [project_id]);
        const [[assigner]] = await pool.query(
            "SELECT CONCAT(user_fname, ' ', user_lname) AS fullname FROM tb_users WHERE user_id = ?",
            [assignerUserId]
        );
        const [recipients] = await pool.query(
            "SELECT user_id, user_email FROM tb_users WHERE user_id IN (?)",
            [newlyAdded]
        );

        const actionUrl = `${process.env.FRONTEND_URL}/projects/view?id=${project_id}`;
        for (const r of recipients) {
            sendTaskAssignedEmail({
                to: r.user_email,
                taskTitle: task_title,
                taskDescription: task_description,
                taskStatus: task_status,
                projectName: project?.project_name ?? "",
                assignerName: assigner?.fullname ?? "",
                startDate: task_start_date,
                dueDate: task_due_date,
                actionUrl,
            });
        }
    } catch (err) {
        console.error("[task.controller] notifyNewAssignees failed:", err.message);
    }
}

// นับปัญหาที่ "เปิดอยู่" ของ task/subtask นั้นๆ เองเท่านั้น — ไม่รวม/ไม่นับจากปัญหาของ subtask ลูก
async function attachIssueCounts(projectId, tasks) {
    if (tasks.length === 0) return tasks;
    const [rows] = await pool.query(
        `SELECT i.task_id, COUNT(*) AS open_issue_count
         FROM tb_task_issues i
         JOIN tb_tasks t ON t.task_id = i.task_id
         WHERE t.project_id = ? AND i.issue_status = 'open'
         GROUP BY i.task_id`,
        [projectId]
    );
    const countMap = Object.fromEntries(rows.map((r) => [r.task_id, r.open_issue_count]));
    const withOwnCounts = tasks.map((t) => ({ ...t, open_issue_count: countMap[t.task_id] ?? 0 }));

    // ผลรวมปัญหาที่เปิดอยู่ของ subtask ทั้งหมด แยกเป็นอีกฟิลด์ต่างหาก (ไม่ปนกับ open_issue_count ของ task เอง)
    // ใช้แสดงเป็นตัวเลขสีน้ำเงินคู่กับตัวเลขสีแดง (ของ task เอง) ในตารางหลัก
    return withOwnCounts.map((t) => ({
        ...t,
        subtask_open_issue_count: withOwnCounts
            .filter((c) => c.task_parent_id === t.task_id)
            .reduce((sum, c) => sum + c.open_issue_count, 0),
    }));
}

// นับข้อความแชทที่ยังไม่ได้อ่านของผู้ใช้คนนี้ ต่อ task ของตัวเอง (ไม่รวม/ไม่นับจาก subtask ลูก เหมือน issue count)
// ไม่นับข้อความที่ตัวเองส่งเอง — และ task ที่ไม่เคยเปิดดูแชทเลยถือว่าทุกข้อความยังไม่ได้อ่านหมด
async function attachUnreadChatCounts(projectId, userId, tasks) {
    if (tasks.length === 0) return tasks;
    const [rows] = await pool.query(
        `SELECT c.task_id, COUNT(*) AS unread_chat_count
         FROM tb_task_chat_messages c
         JOIN tb_tasks t ON t.task_id = c.task_id
         LEFT JOIN tb_task_chat_reads r ON r.task_id = c.task_id AND r.user_id = ?
         WHERE t.project_id = ?
           AND (c.user_id IS NULL OR c.user_id != ?)
           AND (r.last_read_at IS NULL OR c.message_created_at > r.last_read_at)
         GROUP BY c.task_id`,
        [userId, projectId, userId]
    );
    const countMap = Object.fromEntries(rows.map((r) => [r.task_id, r.unread_chat_count]));
    return tasks.map((t) => ({ ...t, unread_chat_count: countMap[t.task_id] ?? 0 }));
}

async function getAll(req, res, next) {
    try {
        const [rows] = await pool.query(
            `SELECT t.task_id, t.project_id, t.task_parent_id, t.task_title, t.task_status,
                    t.task_start_date, t.task_due_date, t.task_completed_at, t.task_weight, t.task_sort_order,
                    t.task_created_at, t.task_updated_at
             FROM tb_tasks t
             WHERE t.project_id = ?
             ORDER BY t.task_sort_order ASC, t.task_id ASC`,
            [req.params.projectId]
        );
        let data = await attachAssignees(req.params.projectId, rows);
        data = await attachIssueCounts(req.params.projectId, data);
        data = await attachUnreadChatCounts(req.params.projectId, req.user.user_id, data);
        res.json({ data });
    } catch (err) {
        next(err);
    }
}

async function getOne(req, res, next) {
    try {
        const [rows] = await pool.query("SELECT * FROM tb_tasks WHERE task_id = ?", [req.params.id]);
        const task = rows[0];
        if (!task) return res.status(404).json({ message: "ไม่พบ task นี้" });

        const [assigneeRows] = await pool.query(
            `SELECT u.user_id, CONCAT(u.user_fname, ' ', u.user_lname) AS user_fullname
             FROM tb_task_assignees ta
             JOIN tb_users u ON u.user_id = ta.user_id
             WHERE ta.task_id = ?`,
            [req.params.id]
        );

        res.json({ ...task, assignees: assigneeRows });
    } catch (err) {
        next(err);
    }
}

async function create(req, res, next) {
    const {
        task_title, task_description, assignee_ids,
        task_start_date, task_due_date, task_weight, task_parent_id,
    } = req.body;
    if (!task_title) return res.status(400).json({ message: "กรุณากรอกชื่องาน" });

    // จำกัด subtask ไว้แค่ 1 ชั้น — parent ที่ระบุต้องเป็น task ระดับบนสุดเท่านั้น ห้ามเป็น subtask อยู่แล้ว
    if (task_parent_id) {
        const [parentRows] = await pool.query(
            "SELECT task_parent_id FROM tb_tasks WHERE task_id = ?",
            [task_parent_id]
        );
        if (!parentRows[0]) return res.status(400).json({ message: "ไม่พบ task แม่ที่ระบุ" });
        if (parentRows[0].task_parent_id) {
            return res.status(400).json({ message: "ไม่สามารถสร้าง subtask ซ้อนใน subtask ได้" });
        }
    }

    const allowed = await canAddTask(req.params.projectId, task_parent_id || null, req.user.user_id);
    if (!allowed) return res.status(403).json({ message: "ไม่มีสิทธิ์เพิ่ม task นี้" });

    const task_id = await generateDailyId("tb_tasks", "task_id", "TAS");
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        await conn.query(
            `INSERT INTO tb_tasks
                (task_id, project_id, task_parent_id, task_title, task_description,
                 task_start_date, task_due_date, task_weight)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                task_id, req.params.projectId, task_parent_id || null, task_title, task_description || null,
                task_start_date || null, task_due_date || null, task_weight || 1,
            ]
        );
        for (const user_id of assignee_ids ?? []) {
            await conn.query("INSERT INTO tb_task_assignees (task_id, user_id) VALUES (?, ?)", [task_id, user_id]);
        }

        await conn.commit();

        await writeTaskLog({ task_id, user_id: req.user.user_id, action: "created", message: task_title });
        await recomputeProjectProgress(req.params.projectId);

        notifyNewAssignees({
            project_id: req.params.projectId, task_title, task_description, task_status: "todo",
            task_start_date, task_due_date, previousAssigneeIds: [], newAssigneeIds: assignee_ids ?? [],
            assignerUserId: req.user.user_id,
        });

        res.status(201).json({ task_id });
    } catch (err) {
        await conn.rollback();
        if (err.code === "ER_NO_REFERENCED_ROW_2" || err.code === "ER_NO_REFERENCED_ROW") {
            return res.status(400).json({ message: "ผู้รับผิดชอบที่เลือกไม่ถูกต้อง" });
        }
        next(err);
    } finally {
        conn.release();
    }
}

async function update(req, res, next) {
    const conn = await pool.getConnection();
    try {
        const [existingRows] = await pool.query(
            "SELECT project_id, task_weight, task_status FROM tb_tasks WHERE task_id = ?",
            [req.params.id]
        );
        const task = existingRows[0];
        if (!task) return res.status(404).json({ message: "ไม่พบ task นี้" });

        const allowed = await canEditTask(task.project_id, req.params.id, req.user.user_id);
        if (!allowed) return res.status(403).json({ message: "ไม่มีสิทธิ์แก้ไข task นี้" });

        const {
            task_title, task_description, assignee_ids,
            task_start_date, task_due_date, task_weight,
        } = req.body;
        if (!task_title) return res.status(400).json({ message: "กรุณากรอกชื่องาน" });

        const [prevAssigneeRows] = await pool.query(
            "SELECT user_id FROM tb_task_assignees WHERE task_id = ?",
            [req.params.id]
        );
        const previousAssigneeIds = prevAssigneeRows.map((r) => r.user_id);

        await conn.beginTransaction();

        await conn.query(
            `UPDATE tb_tasks SET
                task_title = ?, task_description = ?,
                task_start_date = ?, task_due_date = ?, task_weight = ?
             WHERE task_id = ?`,
            [
                task_title, task_description || null,
                task_start_date || null, task_due_date || null, task_weight || 1,
                req.params.id,
            ]
        );
        await conn.query("DELETE FROM tb_task_assignees WHERE task_id = ?", [req.params.id]);
        for (const user_id of assignee_ids ?? []) {
            await conn.query("INSERT INTO tb_task_assignees (task_id, user_id) VALUES (?, ?)", [req.params.id, user_id]);
        }

        await conn.commit();

        await writeTaskLog({ task_id: req.params.id, user_id: req.user.user_id, action: "edited", message: task_title });
        if (Number(task_weight || 1) !== Number(task.task_weight)) {
            await recomputeProjectProgress(task.project_id);
        }

        notifyNewAssignees({
            project_id: task.project_id, task_title, task_description, task_status: task.task_status,
            task_start_date, task_due_date, previousAssigneeIds, newAssigneeIds: assignee_ids ?? [],
            assignerUserId: req.user.user_id,
        });

        res.json({ message: "แก้ไข task สำเร็จ" });
    } catch (err) {
        await conn.rollback();
        if (err.code === "ER_NO_REFERENCED_ROW_2" || err.code === "ER_NO_REFERENCED_ROW") {
            return res.status(400).json({ message: "ผู้รับผิดชอบที่เลือกไม่ถูกต้อง" });
        }
        next(err);
    } finally {
        conn.release();
    }
}

async function updateStatus(req, res, next) {
    try {
        const { task_status } = req.body;
        const validStatuses = ["todo", "in_progress", "review", "done"];
        if (!validStatuses.includes(task_status)) {
            return res.status(400).json({ message: "สถานะไม่ถูกต้อง" });
        }

        const [taskRows] = await pool.query(
            "SELECT task_id, project_id, task_parent_id, task_status FROM tb_tasks WHERE task_id = ?",
            [req.params.id]
        );
        const task = taskRows[0];
        if (!task) return res.status(404).json({ message: "ไม่พบ task นี้" });

        const allowed = await canChangeStatus(task.project_id, task, req.user.user_id);
        if (!allowed) return res.status(403).json({ message: "ไม่มีสิทธิ์เปลี่ยนสถานะ task นี้" });

        const completedAt = task_status === "done" ? new Date() : null;
        await pool.query(
            "UPDATE tb_tasks SET task_status = ?, task_completed_at = ? WHERE task_id = ?",
            [task_status, completedAt, req.params.id]
        );

        await writeTaskLog({
            task_id: req.params.id, user_id: req.user.user_id, action: "status_changed",
            old_value: task.task_status, new_value: task_status,
        });
        await recomputeProjectProgress(task.project_id);

        res.json({ message: "อัปเดตสถานะสำเร็จ" });
    } catch (err) {
        next(err);
    }
}

async function remove(req, res, next) {
    try {
        const [taskRows] = await pool.query("SELECT project_id FROM tb_tasks WHERE task_id = ?", [req.params.id]);
        const task = taskRows[0];
        if (!task) return res.status(404).json({ message: "ไม่พบ task นี้" });

        await pool.query("DELETE FROM tb_tasks WHERE task_id = ?", [req.params.id]);
        await recomputeProjectProgress(task.project_id);

        res.status(204).end();
    } catch (err) {
        next(err);
    }
}

async function getActivity(req, res, next) {
    try {
        const [rows] = await pool.query(
            `SELECT l.log_id, l.task_id, t.task_title, l.log_fullname, l.log_action,
                    l.log_old_value, l.log_new_value, l.log_message, l.log_created_at
             FROM tb_task_activity_log l
             JOIN tb_tasks t ON t.task_id = l.task_id
             WHERE t.project_id = ?
             ORDER BY l.log_id DESC
             LIMIT 100`,
            [req.params.projectId]
        );
        res.json({ data: rows });
    } catch (err) {
        next(err);
    }
}

module.exports = { getAll, getOne, create, update, updateStatus, remove, getActivity };
