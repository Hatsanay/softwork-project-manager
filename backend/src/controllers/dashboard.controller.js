const pool = require("../config/db");
const { hasBit } = require("../utils/permissions");

// แปลง query param เป็นช่วงวันที่ [start, end) สำหรับกรอง KPI — รับได้ทั้ง "YYYY-MM" (รายเดือน) และ "YYYY" (รายปีทั้งปี)
// ไม่ใส่มา/ใส่รูปแบบผิด default เป็นเดือนปัจจุบัน
// ใช้ half-open range (>= start AND < end) แทน BETWEEN เพราะ end คำนวณจากวันถัดจากช่วงตรงๆ ไม่ต้องกังวลจำนวนวันในเดือน/ปีอธิกสุรทิน
function periodRange(periodParam) {
    if (typeof periodParam === "string" && /^\d{4}$/.test(periodParam)) {
        const year = Number(periodParam);
        return { start: `${year}-01-01`, end: `${year + 1}-01-01`, periodStr: String(year) };
    }

    let year, month;
    if (typeof periodParam === "string" && /^\d{4}-\d{2}$/.test(periodParam)) {
        [year, month] = periodParam.split("-").map(Number);
    } else {
        const now = new Date();
        year = now.getFullYear();
        month = now.getMonth() + 1;
    }
    const pad = (n) => String(n).padStart(2, "0");
    const start = `${year}-${pad(month)}-01`;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const end = `${nextYear}-${pad(nextMonth)}-01`;
    return { start, end, periodStr: `${year}-${pad(month)}` };
}

// ทุก widget ใช้สิทธิ์ที่มีอยู่แล้วในระบบ ไม่มีบิตแยกสำหรับ dashboard โดยเฉพาะ:
// - "โปรเจกต์ที่กำลังทำ" สโคปด้วย viewAllProjects/viewOwnProjects เหมือนหน้ารายการโปรเจกต์
// - "งานของฉัน"/"ปัญหาที่เปิดอยู่"/"แชทที่ยังไม่อ่าน"/KPI แม้จะเป็นข้อมูลส่วนตัว (ผูกกับ task ที่ตัวเองรับผิดชอบ) ก็ยังต้องมี
//   viewAllProjects หรือ viewOwnProjects อย่างใดอย่างหนึ่งก่อนถึงจะเห็น (hasProjectAccess) — เพราะทุกอย่างในระบบนี้อิงกับโปรเจกต์/task
//   ทั้งหมด ถ้า role ไม่มีสิทธิ์ดูโปรเจกต์เลย (เช่น role ที่ให้แค่บิต dashboard เฉยๆ สำหรับแผนกที่ไม่เกี่ยวกับโปรเจกต์)
//   ก็ไม่ควรเห็นข้อมูลที่มาจากโปรเจกต์/task แม้จะเป็น "ของตัวเอง" ก็ตาม (แก้ตามฟีดแบ็กจริง: role หัวหน้าแผนกบัญชีที่ให้แค่บิต
//   dashboard ยังเห็น widget โปรเจกต์/งานอยู่ ทั้งที่ไม่ควรเห็นอะไรเกี่ยวกับโปรเจกต์เลย)
async function getSummary(req, res, next) {
    try {
        const userId = req.user.user_id;

        const [roleRows] = await pool.query("SELECT role_permission FROM tb_roles WHERE role_id = ?", [req.user.user_role_id]);
        const rolePermission = roleRows[0]?.role_permission ?? "";
        const seesAllProjects = hasBit(rolePermission, "viewAllProjects");
        const hasProjectAccess = seesAllProjects || hasBit(rolePermission, "viewOwnProjects");

        if (!hasProjectAccess) {
            return res.json({
                hasProjectAccess: false,
                activeProjectCount: 0,
                projects: [],
                myTasks: [],
                openIssueCount: 0,
                openIssueCountOwnOnly: 0,
                openIssues: [],
                unreadChatCount: 0,
                unreadChats: [],
                canViewTeamWorkload: false,
                recentActivity: [],
            });
        }

        const memberJoin = seesAllProjects ? "" : "JOIN tb_project_members pm ON pm.project_id = p.project_id AND pm.user_id = ?";
        const memberParams = seesAllProjects ? [] : [userId];

        const [[{ count: activeProjectCount }]] = await pool.query(
            `SELECT COUNT(DISTINCT p.project_id) AS count
             FROM tb_projects p
             ${memberJoin}
             WHERE p.project_status NOT IN ('completed', 'cancelled')`,
            memberParams
        );

        const [projects] = await pool.query(
            `SELECT DISTINCT p.project_id, p.project_name, p.project_status,
                    p.project_progress_percent, p.project_due_date
             FROM tb_projects p
             ${memberJoin}
             WHERE p.project_status NOT IN ('completed', 'cancelled')
             ORDER BY (p.project_due_date IS NULL), p.project_due_date ASC
             LIMIT 6`,
            memberParams
        );

        const [myTasks] = await pool.query(
            `SELECT t.task_id, t.task_title, t.task_status, t.task_due_date, t.task_parent_id,
                    t.project_id, p.project_name
             FROM tb_tasks t
             JOIN tb_task_assignees ta ON ta.task_id = t.task_id AND ta.user_id = ?
             JOIN tb_projects p ON p.project_id = t.project_id
             WHERE t.task_status != 'done' AND p.project_status NOT IN ('completed', 'cancelled')
             ORDER BY (t.task_due_date IS NULL), t.task_due_date ASC
             LIMIT 10`,
            [userId]
        );

        // นับ/แสดงปัญหาที่เปิดอยู่ของ task ที่ตัวเองรับผิดชอบโดยตรง "และ" ของ subtask ที่ตัวเองไม่ได้รับผิดชอบตรงๆ
        // แต่อยู่ใต้ task ที่ตัวเองรับผิดชอบ (ต่างจากบิตสิทธิ์การกระทำ ที่ความรับผิดชอบต่อ task แม่ไม่นับ —
        // ตรงนี้แค่เรื่อง "เห็น/รู้" ว่ามีปัญหาเกิดขึ้น ไม่ใช่สิทธิ์ทำอะไรกับมัน จึงยอมให้ cascade ได้)
        // "หรือถูกแท็ก (@)" ไว้ในปัญหานั้น — ขยายการมองเห็นออกไปนอกเหนือจากผู้รับผิดชอบ task/subtask โดยตรง
        // ให้คนที่ถูกแท็กเห็นปัญหานั้นในรายการของตัวเองด้วยเสมอ แม้ไม่มีความเกี่ยวข้องกับ task นั้นเลยก็ตาม
        const issueScopeCondition = `(
            EXISTS (SELECT 1 FROM tb_task_assignees ta WHERE ta.task_id = t.task_id AND ta.user_id = ?)
            OR (t.task_parent_id IS NOT NULL
                AND EXISTS (SELECT 1 FROM tb_task_assignees ta2 WHERE ta2.task_id = t.task_parent_id AND ta2.user_id = ?))
            OR EXISTS (SELECT 1 FROM tb_task_issue_tags tag WHERE tag.issue_id = i.issue_id AND tag.user_id = ?)
        )`;

        const [[{ count: openIssueCount }]] = await pool.query(
            `SELECT COUNT(DISTINCT i.issue_id) AS count
             FROM tb_task_issues i
             JOIN tb_tasks t ON t.task_id = i.task_id
             WHERE i.issue_status = 'open' AND ${issueScopeCondition}`,
            [userId, userId, userId]
        );

        // นับแบบ "เฉพาะที่รับผิดชอบตรงๆ หรือถูกแท็ก" (ไม่รวม subtask ที่ได้มาจาก parent cascade) — ไว้คู่กับ toggle
        // "แสดงเฉพาะ subtask ของตัวเอง" ฝั่ง frontend ให้ตัวเลข stat tile สลับไปมาได้ตรงกับ list ที่กรองอยู่
        // ปัญหาที่ถูกแท็กยังนับตรงนี้เสมอ ไม่ถูกตัดออกด้วย toggle นี้ เพราะ toggle นี้ตั้งใจกรองแค่ "parent cascade"
        // ที่เป็น noise ไม่ใช่การแท็กที่ตั้งใจเรียกร้องความสนใจโดยตรง
        const [[{ count: openIssueCountOwnOnly }]] = await pool.query(
            `SELECT COUNT(DISTINCT i.issue_id) AS count
             FROM tb_task_issues i
             JOIN tb_tasks t ON t.task_id = i.task_id
             WHERE i.issue_status = 'open' AND (
                 EXISTS (SELECT 1 FROM tb_task_assignees ta WHERE ta.task_id = t.task_id AND ta.user_id = ?)
                 OR EXISTS (SELECT 1 FROM tb_task_issue_tags tag WHERE tag.issue_id = i.issue_id AND tag.user_id = ?)
             )`,
            [userId, userId]
        );

        // รายการปัญหาที่เปิดอยู่ (task ของตัวเอง + subtask ใต้ task ของตัวเอง + ที่ถูกแท็กไว้)
        // is_subtask ไว้แยก tab, is_direct_assignee ไว้กรองตอนติ๊ก "แสดงเฉพาะ subtask ของตัวเอง" (ไม่รวมที่มาจาก parent cascade)
        // is_tagged ไว้ให้ frontend ขึ้นพื้นหลังสีแดง (เฉพาะในมุมมองของคนที่ถูกแท็กเอง ไม่ใช่ทุกคนที่เห็นปัญหานี้)
        const [openIssues] = await pool.query(
            `SELECT DISTINCT i.issue_id, i.issue_title, i.issue_created_at,
                    t.task_id, t.task_title, t.project_id, p.project_name,
                    (t.task_parent_id IS NOT NULL) AS is_subtask,
                    EXISTS (SELECT 1 FROM tb_task_assignees ta3 WHERE ta3.task_id = t.task_id AND ta3.user_id = ?) AS is_direct_assignee,
                    EXISTS (SELECT 1 FROM tb_task_issue_tags tag2 WHERE tag2.issue_id = i.issue_id AND tag2.user_id = ?) AS is_tagged
             FROM tb_task_issues i
             JOIN tb_tasks t ON t.task_id = i.task_id
             JOIN tb_projects p ON p.project_id = t.project_id
             WHERE i.issue_status = 'open' AND ${issueScopeCondition}
             ORDER BY i.issue_created_at DESC
             LIMIT 30`,
            [userId, userId, userId, userId, userId]
        );
        // MySQL คืน (expr)/EXISTS(...) เป็น 0/1 (ไม่ใช่ boolean จริง) ต้องแปลงเองไม่งั้น type ไม่ตรงกับที่ frontend คาดไว้
        for (const iss of openIssues) {
            iss.is_subtask = !!iss.is_subtask;
            iss.is_direct_assignee = !!iss.is_direct_assignee;
            iss.is_tagged = !!iss.is_tagged;
        }

        // sub-query เดียวกันสองที่: อันนี้เอาผลรวมจริงทั้งหมด (ไม่ลิมิต) ไว้ทำ stat tile
        // ต้อง GROUP BY task_id ก่อนแล้วค่อย SUM ทับอีกที ไม่งั้นถ้า SUM ตรงๆ จาก COUNT(*) รวมทุก task
        // มันจะได้ผลลัพธ์ถูกต้องอยู่แล้วเหมือนกัน แต่แยก query ไว้ชัดเจนกว่าเผื่อ query ลิสต์ด้านล่าง LIMIT ไว้แค่ 10 แถว
        const [[{ count: unreadTaskChatCountRaw }]] = await pool.query(
            `SELECT COALESCE(SUM(unread), 0) AS count FROM (
                SELECT COUNT(*) AS unread
                FROM tb_task_chat_messages c
                JOIN tb_task_assignees ta ON ta.task_id = c.task_id AND ta.user_id = ?
                LEFT JOIN tb_task_chat_reads r ON r.task_id = c.task_id AND r.user_id = ?
                WHERE (c.user_id IS NULL OR c.user_id != ?)
                  AND (r.last_read_at IS NULL OR c.message_created_at > r.last_read_at)
                GROUP BY c.task_id
             ) sub`,
            [userId, userId, userId]
        );

        // เหมือนกันแต่นับแชทรวมของโปรเจกต์แทน — สโคปด้วย "เป็นสมาชิกโปรเจกต์" (tb_project_members)
        // ไม่ใช่ viewAllProjects เพราะ widget นี้เป็นข้อมูลส่วนตัว (แชทที่ตัวเองเข้าไปคุยได้จริง) ไม่ใช่มุมมองข้ามบริษัท
        const [[{ count: unreadProjectChatCountRaw }]] = await pool.query(
            `SELECT COALESCE(SUM(unread), 0) AS count FROM (
                SELECT COUNT(*) AS unread
                FROM tb_project_chat_messages c
                JOIN tb_project_members pm ON pm.project_id = c.project_id AND pm.user_id = ?
                LEFT JOIN tb_project_chat_reads r ON r.project_id = c.project_id AND r.user_id = ?
                WHERE (c.user_id IS NULL OR c.user_id != ?)
                  AND (r.last_read_at IS NULL OR c.message_created_at > r.last_read_at)
                GROUP BY c.project_id
             ) sub`,
            [userId, userId, userId]
        );
        // mysql2 คืนผลลัพธ์ SUM() เป็น string เสมอ (ต่างจาก COUNT() ที่ได้ number ตรงๆ) ต้องแปลงเองไม่งั้น type ไม่ตรงกับที่ frontend คาดไว้
        const unreadChatCount = Number(unreadTaskChatCountRaw) + Number(unreadProjectChatCountRaw);

        // รายชื่อ task ที่มีข้อความแชทยังไม่ได้อ่าน (จำกัด 10 อันล่าสุดสำหรับแสดงเป็นลิสต์คลิกเข้าไปอ่านได้)
        // ต่างจากตัวเลขสรุปด้านบน — อันนี้ลิมิตจำนวนแถวเพื่อแสดงผล ไม่ใช่ตัวเลขสรุปที่ต้องถูกต้องครบทุก task
        const [unreadTaskChats] = await pool.query(
            `SELECT c.task_id, t.task_title, t.project_id, p.project_name,
                    COUNT(*) AS unread_count, MAX(c.message_created_at) AS last_message_at
             FROM tb_task_chat_messages c
             JOIN tb_tasks t ON t.task_id = c.task_id
             JOIN tb_task_assignees ta ON ta.task_id = c.task_id AND ta.user_id = ?
             JOIN tb_projects p ON p.project_id = t.project_id
             LEFT JOIN tb_task_chat_reads r ON r.task_id = c.task_id AND r.user_id = ?
             WHERE (c.user_id IS NULL OR c.user_id != ?)
               AND (r.last_read_at IS NULL OR c.message_created_at > r.last_read_at)
             GROUP BY c.task_id
             ORDER BY last_message_at DESC
             LIMIT 10`,
            [userId, userId, userId]
        );
        for (const chat of unreadTaskChats) {
            chat.chat_type = "task";
            const [[lastMsg]] = await pool.query(
                `SELECT c.message_text, CONCAT(u.user_fname, ' ', u.user_lname) AS user_fullname,
                        EXISTS(SELECT 1 FROM tb_task_chat_images i WHERE i.message_id = c.message_id) AS has_images
                 FROM tb_task_chat_messages c
                 LEFT JOIN tb_users u ON u.user_id = c.user_id
                 WHERE c.task_id = ?
                 ORDER BY c.message_created_at DESC
                 LIMIT 1`,
                [chat.task_id]
            );
            chat.last_message_text = lastMsg?.message_text ?? null;
            chat.last_message_sender = lastMsg?.user_fullname ?? "ผู้ใช้งานที่ถูกลบ";
            chat.last_message_has_images = !!lastMsg?.has_images;
        }

        // เหมือนกันแต่ของแชทรวมของโปรเจกต์ (task_id/task_title เป็น null เสมอ ไว้ merge รวมลิสต์เดียวกับด้านบน)
        const [unreadProjectChats] = await pool.query(
            `SELECT c.project_id, p.project_name,
                    COUNT(*) AS unread_count, MAX(c.message_created_at) AS last_message_at
             FROM tb_project_chat_messages c
             JOIN tb_project_members pm ON pm.project_id = c.project_id AND pm.user_id = ?
             JOIN tb_projects p ON p.project_id = c.project_id
             LEFT JOIN tb_project_chat_reads r ON r.project_id = c.project_id AND r.user_id = ?
             WHERE (c.user_id IS NULL OR c.user_id != ?)
               AND (r.last_read_at IS NULL OR c.message_created_at > r.last_read_at)
             GROUP BY c.project_id
             ORDER BY last_message_at DESC
             LIMIT 10`,
            [userId, userId, userId]
        );
        for (const chat of unreadProjectChats) {
            chat.chat_type = "project";
            chat.task_id = null;
            chat.task_title = null;
            const [[lastMsg]] = await pool.query(
                `SELECT c.message_text, CONCAT(u.user_fname, ' ', u.user_lname) AS user_fullname,
                        EXISTS(SELECT 1 FROM tb_project_chat_images i WHERE i.message_id = c.message_id) AS has_images
                 FROM tb_project_chat_messages c
                 LEFT JOIN tb_users u ON u.user_id = c.user_id
                 WHERE c.project_id = ?
                 ORDER BY c.message_created_at DESC
                 LIMIT 1`,
                [chat.project_id]
            );
            chat.last_message_text = lastMsg?.message_text ?? null;
            chat.last_message_sender = lastMsg?.user_fullname ?? "ผู้ใช้งานที่ถูกลบ";
            chat.last_message_has_images = !!lastMsg?.has_images;
        }

        // รวมสองลิสต์เป็นลิสต์เดียว เรียงตามข้อความล่าสุดจริง แล้วตัดเหลือ 10 (chat_type ให้ frontend แยกไปเปิด task chat กับ project chat ถูกที่)
        const unreadChats = [...unreadTaskChats, ...unreadProjectChats]
            .sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime())
            .slice(0, 10);

        // ภาพรวมทีม — เฉพาะคนที่มี viewAllProjects เท่านั้น ตัวข้อมูลจริง (พร้อมฟิลเตอร์ task/subtask + โปรเจกต์)
        // ย้ายไปดึงจาก endpoint แยก (getTeamWorkload) แล้วเพื่อให้ frontend เปลี่ยนฟิลเตอร์ได้โดยไม่ต้องโหลดทั้งหน้าใหม่
        // canViewTeamWorkload ไว้ให้ frontend รู้ว่าจะ render widget นี้ไหมเท่านั้น
        const canViewTeamWorkload = seesAllProjects;

        // ฟีดกิจกรรมล่าสุดข้ามทุกโปรเจกต์ที่เห็นได้ (สโคปเดียวกับ "โปรเจกต์ที่กำลังทำ" แต่ไม่กรองสถานะโปรเจกต์
        // เพราะอยากเห็นความเคลื่อนไหวล่าสุดจริงๆ แม้โปรเจกต์นั้นจะเพิ่งเสร็จ/ถูกยกเลิกไปก็ตาม)
        const [recentActivity] = await pool.query(
            `SELECT l.log_id, l.task_id, t.task_title, l.log_fullname, l.log_action,
                    l.log_old_value, l.log_new_value, l.log_created_at,
                    t.project_id, p.project_name
             FROM tb_task_activity_log l
             JOIN tb_tasks t ON t.task_id = l.task_id
             JOIN tb_projects p ON p.project_id = t.project_id
             ${memberJoin}
             ORDER BY l.log_created_at DESC
             LIMIT 10`,
            memberParams
        );

        res.json({
            hasProjectAccess: true,
            activeProjectCount,
            projects,
            myTasks,
            openIssueCount,
            openIssueCountOwnOnly,
            openIssues,
            unreadChatCount,
            unreadChats,
            canViewTeamWorkload,
            recentActivity,
        });
    } catch (err) {
        next(err);
    }
}

// ค้นหาด่วนสำหรับ dashboard — หาโปรเจกต์/งานที่ชื่อตรงกับคำค้น สโคปด้วยสิทธิ์เดิม (viewAllProjects/viewOwnProjects)
// เหมือน widget อื่นๆ ในหน้านี้ ไม่ใช่ full-text search แค่ LIKE ธรรมดาเพราะข้อมูลต่อบริษัทไม่เยอะ
async function search(req, res, next) {
    try {
        const userId = req.user.user_id;
        const q = (req.query.q || "").trim();
        if (!q) return res.json({ projects: [], tasks: [] });

        const [roleRows] = await pool.query("SELECT role_permission FROM tb_roles WHERE role_id = ?", [req.user.user_role_id]);
        const rolePermission = roleRows[0]?.role_permission ?? "";
        const seesAllProjects = hasBit(rolePermission, "viewAllProjects");
        // ไม่มีสิทธิ์ดูโปรเจกต์เลย (ไม่มีทั้ง viewAllProjects/viewOwnProjects) ก็ค้นหาโปรเจกต์/งานไม่ได้เหมือนกัน
        if (!seesAllProjects && !hasBit(rolePermission, "viewOwnProjects")) return res.json({ projects: [], tasks: [] });
        const memberJoin = seesAllProjects ? "" : "JOIN tb_project_members pm ON pm.project_id = p.project_id AND pm.user_id = ?";
        const memberParams = seesAllProjects ? [] : [userId];

        const like = `%${q}%`;

        const [projects] = await pool.query(
            `SELECT DISTINCT p.project_id, p.project_name, p.project_status
             FROM tb_projects p
             ${memberJoin}
             WHERE p.project_name LIKE ?
             ORDER BY p.project_name ASC
             LIMIT 8`,
            [...memberParams, like]
        );

        const [tasks] = await pool.query(
            `SELECT DISTINCT t.task_id, t.task_title, t.task_parent_id, t.project_id, p.project_name
             FROM tb_tasks t
             JOIN tb_projects p ON p.project_id = t.project_id
             ${memberJoin}
             WHERE t.task_title LIKE ?
             ORDER BY t.task_title ASC
             LIMIT 8`,
            [...memberParams, like]
        );

        res.json({ projects, tasks });
    } catch (err) {
        next(err);
    }
}

// ภาพรวมทีม — แยก endpoint จาก getSummary เพื่อให้ frontend สลับฟิลเตอร์ (task/subtask, โปรเจกต์) ได้โดยไม่ต้องโหลดทั้งหน้าใหม่
// ต้องมี viewAllProjects เหมือนกัน เพราะเป็นมุมมองข้ามทั้งบริษัท ไม่ใช่ข้อมูลส่วนตัว
// taskType: "all" | "task" | "subtask" — กรองด้วย task_parent_id, projectId: "all" หรือ project_id เจาะจง
async function getTeamWorkload(req, res, next) {
    try {
        const [roleRows] = await pool.query("SELECT role_permission FROM tb_roles WHERE role_id = ?", [req.user.user_role_id]);
        const seesAllProjects = hasBit(roleRows[0]?.role_permission ?? "", "viewAllProjects");
        if (!seesAllProjects) return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึง" });

        const taskType = ["task", "subtask"].includes(req.query.taskType) ? req.query.taskType : "all";
        const projectId = req.query.projectId && req.query.projectId !== "all" ? req.query.projectId : null;

        const conditions = ["p.project_status NOT IN ('completed', 'cancelled')"];
        const params = [];
        if (taskType === "task") conditions.push("t.task_parent_id IS NULL");
        else if (taskType === "subtask") conditions.push("t.task_parent_id IS NOT NULL");
        if (projectId) {
            conditions.push("p.project_id = ?");
            params.push(projectId);
        }

        // ไม่กรอง task_status != 'done' ออกเพราะต้องนับ done_task_count ไว้ทำแถบสีเขียวในบาร์ด้วย
        const [rows] = await pool.query(
            `SELECT u.user_id, CONCAT(u.user_fname, ' ', u.user_lname) AS user_fullname, u.user_avatar_url,
                    SUM(CASE WHEN t.task_status = 'done' THEN 1 ELSE 0 END) AS done_task_count,
                    SUM(CASE WHEN t.task_status != 'done' AND t.task_due_date IS NOT NULL AND t.task_due_date < CURDATE() THEN 1 ELSE 0 END) AS overdue_task_count,
                    SUM(CASE WHEN t.task_status != 'done' AND (t.task_due_date IS NULL OR t.task_due_date >= CURDATE()) THEN 1 ELSE 0 END) AS pending_task_count
             FROM tb_task_assignees ta
             JOIN tb_users u ON u.user_id = ta.user_id
             JOIN tb_tasks t ON t.task_id = ta.task_id
             JOIN tb_projects p ON p.project_id = t.project_id
             WHERE ${conditions.join(" AND ")}
             GROUP BY u.user_id
             ORDER BY overdue_task_count DESC, pending_task_count DESC
             LIMIT 10`,
            params
        );
        // SUM() ของ mysql2 คืนเป็น string เสมอ (ต่างจาก COUNT() ที่ได้ number ตรงๆ) ต้องแปลงเองไม่งั้น type ไม่ตรงกับที่ frontend คาดไว้
        const teamWorkload = rows.map((r) => ({
            ...r,
            done_task_count: Number(r.done_task_count),
            overdue_task_count: Number(r.overdue_task_count),
            pending_task_count: Number(r.pending_task_count),
        }));

        // รายชื่อโปรเจกต์ทั้งหมด (ไม่กรองตามฟิลเตอร์ปัจจุบัน) ไว้ทำ dropdown ตัวเลือกโปรเจกต์ ไม่ให้ตัวเลือกหดหายไปตอนกรองอยู่
        const [projectOptions] = await pool.query(
            `SELECT project_id, project_name FROM tb_projects
             WHERE project_status NOT IN ('completed', 'cancelled')
             ORDER BY project_name ASC`
        );

        res.json({ teamWorkload, projectOptions });
    } catch (err) {
        next(err);
    }
}

// ทุก task ที่เพิ่งเปลี่ยนสถานะเป็น "in_progress" ครั้งแรกจะมี log ผูกไว้ (task.controller.js writeTaskLog)
// ใช้เวลานั้นเป็นจุดเริ่ม "cycle time" (เวลาทำงานจริง) แทน task_created_at (เวลาสร้าง อาจรอคิวนานก่อนมีคนเริ่มทำ)
// task ที่ไม่เคยผ่านสถานะ in_progress เลย (เช่นข้ามจาก todo ไป done ตรงๆ) จะไม่มีแถวใน subquery นี้ ถูกตัดออกจากค่าเฉลี่ยไปเอง (ไม่ใช่ 0)
const TASK_START_LOG_SUBQUERY = `(
    SELECT task_id, MIN(log_created_at) AS started_at
    FROM tb_task_activity_log
    WHERE log_action = 'status_changed' AND log_new_value = 'in_progress'
    GROUP BY task_id
)`;

// KPI ภาพรวม "ของตัวเอง" รายเดือน/รายปี — แยก endpoint จาก getSummary เพื่อสลับช่วงเวลาได้โดยไม่โหลดทั้งหน้าใหม่
// เป็นข้อมูลส่วนตัวเหมือน "งานของฉัน"/"ปัญหาที่เปิดอยู่" เห็นได้เสมอไม่ต้องมี viewAllProjects (ต่างจาก "KPI รายคน" ที่ดูของคนอื่นได้
// ต้องมีบิต viewMemberKpi เพราะเป็นข้อมูลของคนอื่น) — สโคปด้วยความเป็นสมาชิกโปรเจกต์/ผู้รับผิดชอบ task ของตัวเองล้วนๆ
// eligibleCount = 0 หรือไม่มีแถวที่เข้าเงื่อนไข ให้ rate/avg เป็น null (ยังไม่มีข้อมูลพอ) ไม่ใช่ 0 (0% จะทำให้เข้าใจผิดว่าทำได้แย่)
//
// ── methodology (คุยกับผู้ใช้แล้วว่าใช้ผลนี้ในการขึ้นเงินเดือน/เชิญออก เลยต้องรอบคอบ) ──
// อัตราตรงเวลา (KPI 1-3) นับจาก "เดือนที่ครบกำหนด" ไม่ใช่ "เดือนที่เสร็จ" — eligible = ตัดสินผลได้แล้วจริง คือ
// (เสร็จไปแล้ว ไม่ว่าจะก่อนหรือหลังกำหนด) หรือ (ยังไม่เสร็จแต่เลยกำหนดมาแล้ว) งานที่เลยกำหนดแล้วแต่ยังไม่เสร็จจะถูกนับ
// เป็น "สาย" ทันที ไม่ใช่รอจนกว่าจะปิดงานถึงจะโดนนับ (ของเดิมนับจาก "เดือนที่เสร็จ" มีช่องโหว่ให้ปล่อยงานค้างไม่ปิดเพื่อเลี่ยง)
// ต้องเช็คว่า "เสร็จไปแล้ว" ด้วย ไม่ใช่แค่ "เลยกำหนดแล้ว" อย่างเดียว — ไม่งั้นงานที่เสร็จก่อนกำหนด (due date ยังไม่ถึง
// ตามปฏิทิน) จะไม่ถูกนับเป็น eligible เลยจนกว่าจะถึงวันครบกำหนด ทั้งที่ผลตัดสินว่า "ตรงเวลา" ไปแล้วจริงๆ (บั๊กที่เจอจริง)
// โปรเจกต์/งานที่ถูกยกเลิกไม่นับเป็น eligible (ไม่ได้ตั้งใจจะส่งอยู่แล้ว ไม่ควรนับเป็นความล้มเหลวส่งงาน)
// taskType: "all" (default) | "task" | "subtask" — เลือกได้ว่าจะดู "งานตรงเวลา"/"เวลาเฉลี่ยทำงาน" แบบรวม task+subtask
// เฉพาะ task หลัก หรือเฉพาะ subtask (เหตุผลที่แยกได้: ทีม/โปรเจกต์ที่ตัด subtask ย่อยถี่ๆ จะได้ตัวเลข "งานเสร็จ" พองกว่า
// ทีมที่ไม่ใช้ subtask ทั้งที่ปริมาณงานจริงเท่ากัน เทียบกันตรงๆ ไม่ได้ถ้านับรวมเสมอ — ให้เลือกมุมมองเอาเองได้)
async function getKpis(req, res, next) {
    try {
        const userId = req.user.user_id;
        const [roleRows] = await pool.query("SELECT role_permission FROM tb_roles WHERE role_id = ?", [req.user.user_role_id]);
        const rolePermission = roleRows[0]?.role_permission ?? "";
        const hasProjectAccess = hasBit(rolePermission, "viewAllProjects") || hasBit(rolePermission, "viewOwnProjects");
        const { start, end, periodStr } = periodRange(req.query.month);
        const taskType = ["task", "subtask"].includes(req.query.taskType) ? req.query.taskType : "all";
        const parentCondition = taskType === "subtask" ? "t.task_parent_id IS NOT NULL"
            : taskType === "task" ? "t.task_parent_id IS NULL"
            : "1=1";

        // ไม่มีสิทธิ์ดูโปรเจกต์เลย (role แบบหัวหน้าแผนกบัญชีที่ให้แค่บิต dashboard) ก็ไม่ควรเห็น KPI ที่มาจากโปรเจกต์/task เลย
        if (!hasProjectAccess) {
            return res.json({
                period: periodStr, taskType,
                projectOnTimeRate: null, projectOnTimeEligible: 0,
                taskOnTimeRate: null, taskOnTimeEligible: 0,
                avgTaskCycleHours: null,
                avgIssueResolveHours: null,
            });
        }

        // KPI 1: อัตราส่งโปรเจกต์ตรงเวลา — เฉพาะโปรเจกต์ที่ตัวเองเป็นสมาชิก และครบกำหนดในช่วงที่เลือก
        // eligible = "ตัดสินผลได้แล้วจริง" คือ (เสร็จไปแล้ว ไม่ว่าจะก่อนหรือหลังกำหนด) หรือ (ยังไม่เสร็จแต่เลยกำหนดมาแล้ว)
        // ไม่ใช่แค่ "เลยกำหนดแล้ว" เฉยๆ (บั๊กที่เจอจริง: ถ้าเช็คแค่ due_date < CURDATE() โปรเจกต์ที่ทำเสร็จก่อนกำหนดจะไม่ถูกนับ
        // เป็น eligible เลยจนกว่าจะถึงวันครบกำหนดตามปฏิทิน ทั้งที่ผลตัดสินแล้วว่า "ตรงเวลา" ไปแล้วจริงๆ)
        const [[projectOnTime]] = await pool.query(
            `SELECT COUNT(*) AS eligible_count,
                    SUM(CASE WHEN p.project_status = 'completed' AND p.project_completed_at IS NOT NULL
                                  AND DATE(p.project_completed_at) <= p.project_due_date THEN 1 ELSE 0 END) AS on_time_count
             FROM tb_projects p
             JOIN tb_project_members pm ON pm.project_id = p.project_id AND pm.user_id = ?
             WHERE p.project_due_date IS NOT NULL AND p.project_due_date >= ? AND p.project_due_date < ?
               AND (p.project_completed_at IS NOT NULL OR p.project_due_date < CURDATE())
               AND p.project_status != 'cancelled'`,
            [userId, start, end]
        );
        const projectOnTimeEligible = Number(projectOnTime.eligible_count);
        const projectOnTimeRate = projectOnTimeEligible > 0
            ? Math.round((Number(projectOnTime.on_time_count) / projectOnTimeEligible) * 1000) / 10
            : null;

        // KPI 2: อัตราของตัวเองเสร็จตรงเวลา (task หลัก/subtask/ทั้งหมด ตาม taskType) — eligible ใช้เงื่อนไขเดียวกับ KPI 1 ข้างบน
        const [[taskOnTime]] = await pool.query(
            `SELECT COUNT(*) AS eligible_count,
                    SUM(CASE WHEN t.task_status = 'done' AND t.task_completed_at IS NOT NULL
                                  AND DATE(t.task_completed_at) <= t.task_due_date THEN 1 ELSE 0 END) AS on_time_count
             FROM tb_tasks t
             JOIN tb_task_assignees ta ON ta.task_id = t.task_id AND ta.user_id = ?
             JOIN tb_projects p ON p.project_id = t.project_id
             WHERE t.task_due_date IS NOT NULL AND t.task_due_date >= ? AND t.task_due_date < ?
               AND (t.task_completed_at IS NOT NULL OR t.task_due_date < CURDATE())
               AND p.project_status != 'cancelled' AND ${parentCondition}`,
            [userId, start, end]
        );
        const taskOnTimeEligible = Number(taskOnTime.eligible_count);
        const taskOnTimeRate = taskOnTimeEligible > 0
            ? Math.round((Number(taskOnTime.on_time_count) / taskOnTimeEligible) * 1000) / 10
            : null;

        // KPI 3: เวลาเฉลี่ยทำงานจริงของตัวเอง (cycle time: จาก in_progress ครั้งแรกถึงเสร็จ) ตาม taskType เดียวกับข้างบน
        // นับตาม "เดือนที่เสร็จ" (ไม่ใช่ due date) เพราะเป็นตัวชี้วัดความเร็วในการทำงาน ไม่ใช่ความตรงเวลาต่อ deadline
        const [[avgCycle]] = await pool.query(
            `SELECT AVG(GREATEST(TIMESTAMPDIFF(HOUR, start_log.started_at, t.task_completed_at), 0)) AS avg_hours
             FROM tb_tasks t
             JOIN tb_task_assignees ta ON ta.task_id = t.task_id AND ta.user_id = ?
             JOIN ${TASK_START_LOG_SUBQUERY} start_log ON start_log.task_id = t.task_id
             WHERE t.task_status = 'done' AND t.task_completed_at >= ? AND t.task_completed_at < ? AND ${parentCondition}`,
            [userId, start, end]
        );
        const avgTaskCycleHours = avgCycle.avg_hours === null ? null : Number(avgCycle.avg_hours);

        // KPI 4: เวลาเฉลี่ยแก้ปัญหาของตัวเอง (ปัญหาบน task ที่ตัวเองรับผิดชอบ) — ใช้ issue_resolved_at (ตั้งครั้งเดียวตอน resolved จริง
        // ไม่ใช่ issue_updated_at ที่ขยับทุกครั้งที่แก้ไข issue) นับตาม "เดือนที่แก้เสร็จ" เช่นเดียวกับ cycle time ของงาน
        // ไม่แยกตาม taskType (ยังไม่มีคนขอให้แยก และปัญหาผูกกับ task ไหนก็ได้อยู่แล้วไม่ค่อยมีนัยสำคัญเท่าฝั่งงาน)
        const [[avgIssueResolve]] = await pool.query(
            `SELECT AVG(GREATEST(TIMESTAMPDIFF(HOUR, i.issue_created_at, i.issue_resolved_at), 0)) AS avg_hours
             FROM tb_task_issues i
             JOIN tb_tasks t ON t.task_id = i.task_id
             JOIN tb_task_assignees ta ON ta.task_id = t.task_id AND ta.user_id = ?
             WHERE i.issue_status = 'resolved' AND i.issue_resolved_at IS NOT NULL
               AND i.issue_resolved_at >= ? AND i.issue_resolved_at < ?`,
            [userId, start, end]
        );
        const avgIssueResolveHours = avgIssueResolve.avg_hours === null ? null : Number(avgIssueResolve.avg_hours);

        res.json({
            period: periodStr, taskType,
            projectOnTimeRate, projectOnTimeEligible,
            taskOnTimeRate, taskOnTimeEligible,
            avgTaskCycleHours,
            avgIssueResolveHours,
        });
    } catch (err) {
        next(err);
    }
}

// KPI รายคน รายเดือน (กรองรายโปรเจกต์ + task/subtask ได้) — ตารางสรุปว่าแต่ละคนทำงาน/แก้ปัญหาไปเท่าไหร่ ตรงเวลาแค่ไหนในเดือนนั้น
// สโคปการมองเห็นเหมือน getKpis (memberJoin) ส่วน projectId ถ้าระบุมาคือกรองเฉพาะโปรเจกต์นั้นซ้อนเข้าไปอีกชั้น
// taskType: "task" (default) | "subtask" | "all" (task+subtask รวมกัน) — ปกติแยกนับ task หลักกับ subtask ต่างหาก
// (ดูเหตุผลที่ getKpis) แต่มี "ทั้งหมด" ไว้เป็นมุมมองรวมเสริมให้เลือกดูได้ด้วย
// งานที่เสร็จ (throughput) นับตาม "เดือนที่เสร็จ" ส่วนอัตราตรงเวลานับตาม "เดือนที่ครบกำหนด" (ครบกำหนดไปแล้วจริง)
// สองอันนี้คนละ eligible set กัน เป็นเรื่องปกติของ KPI dashboard ทั่วไปที่รายงาน throughput กับ SLA compliance แยกกัน
async function getKpisByMember(req, res, next) {
    try {
        const userId = req.user.user_id;
        const [roleRows] = await pool.query("SELECT role_permission FROM tb_roles WHERE role_id = ?", [req.user.user_role_id]);
        const seesAllProjects = hasBit(roleRows[0]?.role_permission ?? "", "viewAllProjects");
        const memberJoin = seesAllProjects ? "" : "JOIN tb_project_members pm ON pm.project_id = p.project_id AND pm.user_id = ?";
        const memberParams = seesAllProjects ? [] : [userId];

        const { start, end, periodStr } = periodRange(req.query.month);
        const projectId = req.query.projectId && req.query.projectId !== "all" ? req.query.projectId : null;
        const projectFilterClause = projectId ? "AND p.project_id = ?" : "";
        const projectFilterParams = projectId ? [projectId] : [];
        const taskType = ["subtask", "all"].includes(req.query.taskType) ? req.query.taskType : "task";
        const parentCondition = taskType === "subtask" ? "t.task_parent_id IS NOT NULL"
            : taskType === "all" ? "1=1"
            : "t.task_parent_id IS NULL";

        // งานที่เสร็จในเดือนนี้ ต่อคน (throughput) + cycle time (จาก in_progress ครั้งแรกถึงเสร็จ ไม่รวม task ที่ไม่เคยผ่าน in_progress)
        const [taskRows] = await pool.query(
            `SELECT ta.user_id, CONCAT(u.user_fname, ' ', u.user_lname) AS user_fullname, u.user_avatar_url,
                    COUNT(*) AS tasks_completed,
                    AVG(GREATEST(TIMESTAMPDIFF(HOUR, start_log.started_at, t.task_completed_at), 0)) AS avg_cycle_hours
             FROM tb_tasks t
             JOIN tb_task_assignees ta ON ta.task_id = t.task_id
             JOIN tb_users u ON u.user_id = ta.user_id
             JOIN tb_projects p ON p.project_id = t.project_id
             LEFT JOIN ${TASK_START_LOG_SUBQUERY} start_log ON start_log.task_id = t.task_id
             ${memberJoin}
             WHERE t.task_status = 'done' AND t.task_completed_at >= ? AND t.task_completed_at < ?
               AND ${parentCondition} ${projectFilterClause}
             GROUP BY ta.user_id`,
            [...memberParams, start, end, ...projectFilterParams]
        );

        // อัตราตรงเวลา ต่อคน — eligible = "ตัดสินผลได้แล้วจริง" คือ (เสร็จไปแล้ว ไม่ว่าก่อนหรือหลังกำหนด) หรือ (ยังไม่เสร็จแต่เลยกำหนดแล้ว)
        // เหมือนกับ getKpis (ไม่ใช่แค่เช็ค due_date < CURDATE() เฉยๆ ไม่งั้นงานที่เสร็จก่อนกำหนดจะไม่ถูกนับจนกว่าจะถึงวันครบกำหนดตามปฏิทิน)
        // คนละ eligible set กับ throughput ด้านบน (taskRows)
        // ต้อง JOIN tb_users มาด้วย (ไม่ใช่แค่ user_id) เพราะคนที่มีแค่งานเลยกำหนด-ยังไม่เสร็จ (ไม่เคยโผล่ใน taskRows เลย
        // เพราะ taskRows กรอง task_status='done') จะเข้ามาสร้างแถวใหม่ผ่าน emptyRow(r) ด้านล่าง ถ้าไม่มี user_fullname/avatar
        // ติดมาด้วยตรงนี้ แถวนั้นจะโชว์ชื่อว่างเปล่า (บั๊กที่เจอจริง — คนที่มีแต่งานค้างเลยกำหนดจะไม่มีชื่อในตาราง)
        const [onTimeRows] = await pool.query(
            `SELECT ta.user_id, CONCAT(u.user_fname, ' ', u.user_lname) AS user_fullname, u.user_avatar_url,
                    COUNT(*) AS due_eligible_count,
                    SUM(CASE WHEN t.task_status = 'done' AND t.task_completed_at IS NOT NULL
                                  AND DATE(t.task_completed_at) <= t.task_due_date THEN 1 ELSE 0 END) AS due_on_time_count
             FROM tb_tasks t
             JOIN tb_task_assignees ta ON ta.task_id = t.task_id
             JOIN tb_users u ON u.user_id = ta.user_id
             JOIN tb_projects p ON p.project_id = t.project_id
             ${memberJoin}
             WHERE t.task_due_date IS NOT NULL AND t.task_due_date >= ? AND t.task_due_date < ?
               AND (t.task_completed_at IS NOT NULL OR t.task_due_date < CURDATE()) AND p.project_status != 'cancelled'
               AND ${parentCondition} ${projectFilterClause}
             GROUP BY ta.user_id`,
            [...memberParams, start, end, ...projectFilterParams]
        );

        // ปัญหาที่แก้ไขในเดือนนี้ ต่อคน (นับจากผู้รับผิดชอบของ task ที่ผูกกับ issue นั้น — ปัญหาไม่มีผู้รับผิดชอบของตัวเอง)
        // กรองด้วย taskType เดียวกัน ให้ทั้งแถวสอดคล้องกับตัวกรอง Task/Subtask ที่เลือกอยู่
        const [issueRows] = await pool.query(
            `SELECT ta.user_id, CONCAT(u.user_fname, ' ', u.user_lname) AS user_fullname, u.user_avatar_url,
                    COUNT(*) AS issues_resolved,
                    AVG(GREATEST(TIMESTAMPDIFF(HOUR, i.issue_created_at, i.issue_resolved_at), 0)) AS avg_resolve_hours
             FROM tb_task_issues i
             JOIN tb_tasks t ON t.task_id = i.task_id
             JOIN tb_task_assignees ta ON ta.task_id = t.task_id
             JOIN tb_users u ON u.user_id = ta.user_id
             JOIN tb_projects p ON p.project_id = t.project_id
             ${memberJoin}
             WHERE i.issue_status = 'resolved' AND i.issue_resolved_at IS NOT NULL
               AND i.issue_resolved_at >= ? AND i.issue_resolved_at < ?
               AND ${parentCondition} ${projectFilterClause}
             GROUP BY ta.user_id`,
            [...memberParams, start, end, ...projectFilterParams]
        );

        // รวมสามผลลัพธ์เข้าด้วยกันต่อคน (คนที่มีแค่บางฝั่งก็ต้องโผล่ในตารางด้วย ไม่ใช่แค่ที่ตัดกันทุกฝั่ง)
        const memberMap = new Map();
        const emptyRow = (r) => ({
            user_id: r.user_id, user_fullname: r.user_fullname, user_avatar_url: r.user_avatar_url,
            tasksCompleted: 0, avgTaskCycleHours: null,
            taskOnTimeRate: null, issuesResolved: 0, avgIssueResolveHours: null,
        });
        for (const r of taskRows) {
            const existing = memberMap.get(r.user_id) ?? emptyRow(r);
            existing.tasksCompleted = Number(r.tasks_completed);
            existing.avgTaskCycleHours = r.avg_cycle_hours === null ? null : Number(r.avg_cycle_hours);
            memberMap.set(r.user_id, existing);
        }
        for (const r of onTimeRows) {
            const existing = memberMap.get(r.user_id) ?? emptyRow(r);
            const dueEligible = Number(r.due_eligible_count);
            existing.taskOnTimeRate = dueEligible > 0 ? Math.round((Number(r.due_on_time_count) / dueEligible) * 1000) / 10 : null;
            memberMap.set(r.user_id, existing);
        }
        for (const r of issueRows) {
            const existing = memberMap.get(r.user_id) ?? emptyRow(r);
            existing.issuesResolved = Number(r.issues_resolved);
            existing.avgIssueResolveHours = r.avg_resolve_hours === null ? null : Number(r.avg_resolve_hours);
            memberMap.set(r.user_id, existing);
        }

        const members = [...memberMap.values()].sort(
            (a, b) => (b.tasksCompleted + b.issuesResolved) - (a.tasksCompleted + a.issuesResolved)
        );

        // รายชื่อโปรเจกต์ทั้งหมด (ไม่กรองตามฟิลเตอร์ปัจจุบัน) ไว้ทำ dropdown ตัวเลือกโปรเจกต์ ไม่ให้ตัวเลือกหดหายไปตอนกรองอยู่
        const [projectOptions] = await pool.query(
            `SELECT DISTINCT p.project_id, p.project_name FROM tb_projects p ${memberJoin} ORDER BY p.project_name ASC`,
            memberParams
        );

        res.json({ period: periodStr, taskType, members, projectOptions });
    } catch (err) {
        next(err);
    }
}

// รายละเอียดงานของสมาชิกคนหนึ่ง (เสร็จแล้ว/ยังไม่เสร็จ/เลยกำหนด) — เปิดจากการคลิกแถวใน "ภาพรวมทีม"
// ต้องมี viewAllProjects เหมือนกับตัว widget เอง เพราะเป็นการดูข้อมูลของ "คนอื่น" ไม่ใช่ข้อมูลตัวเอง
async function getMemberTasks(req, res, next) {
    try {
        const [roleRows] = await pool.query("SELECT role_permission FROM tb_roles WHERE role_id = ?", [req.user.user_role_id]);
        const seesAllProjects = hasBit(roleRows[0]?.role_permission ?? "", "viewAllProjects");
        if (!seesAllProjects) return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึง" });

        const targetUserId = req.params.userId;
        const [userRows] = await pool.query(
            "SELECT CONCAT(user_fname, ' ', user_lname) AS user_fullname FROM tb_users WHERE user_id = ?",
            [targetUserId]
        );
        if (!userRows[0]) return res.status(404).json({ message: "ไม่พบผู้ใช้งานนี้" });

        // คำนวณ is_overdue ด้วย SQL (เทียบกับ CURDATE() ฝั่ง DB) ไม่ใช้ JS Date เทียบเอง
        // กันปัญหา timezone/รูปแบบค่าที่ mysql2 คืนมา (Date object vs string) คลาดเคลื่อนกันระหว่าง server
        const [rows] = await pool.query(
            `SELECT t.task_id, t.task_title, t.task_status, t.task_due_date, t.task_parent_id,
                    t.project_id, p.project_name,
                    (t.task_status != 'done' AND t.task_due_date IS NOT NULL AND t.task_due_date < CURDATE()) AS is_overdue
             FROM tb_tasks t
             JOIN tb_task_assignees ta ON ta.task_id = t.task_id AND ta.user_id = ?
             JOIN tb_projects p ON p.project_id = t.project_id
             WHERE p.project_status NOT IN ('completed', 'cancelled')
             ORDER BY (t.task_due_date IS NULL), t.task_due_date ASC`,
            [targetUserId]
        );

        const done = [];
        const overdue = [];
        const pending = [];
        for (const row of rows) {
            const isOverdue = !!row.is_overdue;
            delete row.is_overdue;
            if (row.task_status === "done") done.push(row);
            else if (isOverdue) overdue.push(row);
            else pending.push(row);
        }

        res.json({ user_fullname: userRows[0].user_fullname, done, pending, overdue });
    } catch (err) {
        next(err);
    }
}

module.exports = { getSummary, search, getTeamWorkload, getMemberTasks, getKpis, getKpisByMember };
