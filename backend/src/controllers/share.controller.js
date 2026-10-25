const pool = require("../config/db");

async function getSharedProject(req, res, next) {
    try {
        const [projectRows] = await pool.query(
            `SELECT p.project_id, p.project_name, p.project_description, p.project_status,
                    p.project_start_date, p.project_due_date, p.project_progress_percent,
                    c.client_name
             FROM tb_projects p
             LEFT JOIN tb_clients c ON c.client_id = p.client_id
             WHERE p.project_share_token = ? AND p.project_share_enabled = TRUE`,
            [req.params.token]
        );
        const project = projectRows[0];
        if (!project) return res.status(404).json({ message: "ไม่พบโปรเจกต์นี้ หรือลิงก์ถูกปิดใช้งานแล้ว" });

        // งานระดับบนสุด + งานย่อย (ชื่อและสถานะเท่านั้น · 2026-10-25: งานย่อยจากชุดบริการคือสิ่งที่ลูกค้าซื้อ เช่น "ดูแลบั๊ก 30 วัน"
        // ลูกค้าเห็นชื่องานย่อยในความเคลื่อนไหวอยู่แล้ว) · ไม่ส่งวันที่/ผู้รับผิดชอบของงานย่อย
        const [tasks] = await pool.query(
            `SELECT t.task_id, t.task_title, t.task_status,
                    (SELECT GROUP_CONCAT(CONCAT(u.user_fname, ' ', u.user_lname) SEPARATOR ', ')
                     FROM tb_task_assignees ta JOIN tb_users u ON u.user_id = ta.user_id
                     WHERE ta.task_id = t.task_id) AS assignee_names,
                    t.task_start_date, t.task_due_date, t.task_completed_at
             FROM tb_tasks t
             WHERE t.project_id = ? AND t.task_parent_id IS NULL
             ORDER BY t.task_sort_order ASC, t.task_id ASC`,
            [project.project_id]
        );

        // หน้า share สำหรับลูกค้า: โชว์แค่ "สร้างงาน"/"เปลี่ยนสถานะ" (ตัด "แก้ไข" ทิ้งเพราะเป็น noise ไม่ใช่ progress)
        // และไม่ส่งชื่อพนักงานจริงออกไป (ไม่เปิดเผยโครงสร้างทีมภายในให้ลูกค้าเห็น)
        const [timeline] = await pool.query(
            `SELECT l.log_id, t.task_title, l.log_action,
                    l.log_old_value, l.log_new_value, l.log_message, l.log_created_at
             FROM tb_task_activity_log l
             JOIN tb_tasks t ON t.task_id = l.task_id
             WHERE t.project_id = ? AND l.log_action IN ('created', 'status_changed')
             ORDER BY l.log_id DESC
             LIMIT 50`,
            [project.project_id]
        );

        const [subtasks] = tasks.length
            ? await pool.query(
                  `SELECT task_id, task_parent_id, task_title, task_status FROM tb_tasks
                   WHERE project_id = ? AND task_parent_id IS NOT NULL
                   ORDER BY task_sort_order ASC, task_id ASC`,
                  [project.project_id],
              )
            : [[]];
        for (const task of tasks) {
            task.subtasks = subtasks
                .filter((subtask) => subtask.task_parent_id === task.task_id)
                .map((subtask) => ({ task_id: subtask.task_id, task_title: subtask.task_title, task_status: subtask.task_status }));
        }
        // ชื่อร้านและโลโก้บนหัวหน้า (แทนคำว่า SOFTWORK)
        const [[shop]] = await pool.query("SELECT cs_name_th AS name, cs_logo_url AS logo_url FROM tb_company_settings WHERE cs_id = 1");

        res.json({ project, tasks, timeline, shop: shop ?? null });
    } catch (err) {
        next(err);
    }
}

module.exports = { getSharedProject };
