const pool = require("../config/db");
const { hasBit } = require("../utils/permissions");

// ทุก widget ใช้สิทธิ์ที่มีอยู่แล้วในระบบ ไม่มีบิตแยกสำหรับ dashboard โดยเฉพาะ:
// - "โปรเจกต์ที่กำลังทำ" สโคปด้วย viewAllProjects/viewOwnProjects เหมือนหน้ารายการโปรเจกต์
// - "งานของฉัน"/"ปัญหาที่เปิดอยู่"/"แชทที่ยังไม่อ่าน" เป็นข้อมูลส่วนตัว (ผูกกับ task ที่ตัวเองรับผิดชอบ) เห็นได้เสมอ
async function getSummary(req, res, next) {
    try {
        const userId = req.user.user_id;

        const [roleRows] = await pool.query("SELECT role_permission FROM tb_roles WHERE role_id = ?", [req.user.user_role_id]);
        const seesAllProjects = hasBit(roleRows[0]?.role_permission ?? "", "viewAllProjects");

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
        const issueScopeCondition = `(
            EXISTS (SELECT 1 FROM tb_task_assignees ta WHERE ta.task_id = t.task_id AND ta.user_id = ?)
            OR (t.task_parent_id IS NOT NULL
                AND EXISTS (SELECT 1 FROM tb_task_assignees ta2 WHERE ta2.task_id = t.task_parent_id AND ta2.user_id = ?))
        )`;

        const [[{ count: openIssueCount }]] = await pool.query(
            `SELECT COUNT(DISTINCT i.issue_id) AS count
             FROM tb_task_issues i
             JOIN tb_tasks t ON t.task_id = i.task_id
             WHERE i.issue_status = 'open' AND ${issueScopeCondition}`,
            [userId, userId]
        );

        // นับแบบ "เฉพาะที่รับผิดชอบตรงๆ" (ไม่รวม subtask ที่ได้มาจาก parent cascade) — ไว้คู่กับ toggle
        // "แสดงเฉพาะ subtask ของตัวเอง" ฝั่ง frontend ให้ตัวเลข stat tile สลับไปมาได้ตรงกับ list ที่กรองอยู่
        const [[{ count: openIssueCountOwnOnly }]] = await pool.query(
            `SELECT COUNT(DISTINCT i.issue_id) AS count
             FROM tb_task_issues i
             JOIN tb_tasks t ON t.task_id = i.task_id
             JOIN tb_task_assignees ta ON ta.task_id = t.task_id AND ta.user_id = ?
             WHERE i.issue_status = 'open'`,
            [userId]
        );

        // รายการปัญหาที่เปิดอยู่ (task ของตัวเอง + subtask ใต้ task ของตัวเอง)
        // is_subtask ไว้แยก tab, is_direct_assignee ไว้กรองตอนติ๊ก "แสดงเฉพาะ subtask ของตัวเอง" (ไม่รวมที่มาจาก parent cascade)
        const [openIssues] = await pool.query(
            `SELECT DISTINCT i.issue_id, i.issue_title, i.issue_created_at,
                    t.task_id, t.task_title, t.project_id, p.project_name,
                    (t.task_parent_id IS NOT NULL) AS is_subtask,
                    EXISTS (SELECT 1 FROM tb_task_assignees ta3 WHERE ta3.task_id = t.task_id AND ta3.user_id = ?) AS is_direct_assignee
             FROM tb_task_issues i
             JOIN tb_tasks t ON t.task_id = i.task_id
             JOIN tb_projects p ON p.project_id = t.project_id
             WHERE i.issue_status = 'open' AND ${issueScopeCondition}
             ORDER BY i.issue_created_at DESC
             LIMIT 30`,
            [userId, userId, userId]
        );
        // MySQL คืน (expr)/EXISTS(...) เป็น 0/1 (ไม่ใช่ boolean จริง) ต้องแปลงเองไม่งั้น type ไม่ตรงกับที่ frontend คาดไว้
        for (const iss of openIssues) {
            iss.is_subtask = !!iss.is_subtask;
            iss.is_direct_assignee = !!iss.is_direct_assignee;
        }

        // sub-query เดียวกันสองที่: อันนี้เอาผลรวมจริงทั้งหมด (ไม่ลิมิต) ไว้ทำ stat tile
        // ต้อง GROUP BY task_id ก่อนแล้วค่อย SUM ทับอีกที ไม่งั้นถ้า SUM ตรงๆ จาก COUNT(*) รวมทุก task
        // มันจะได้ผลลัพธ์ถูกต้องอยู่แล้วเหมือนกัน แต่แยก query ไว้ชัดเจนกว่าเผื่อ query ลิสต์ด้านล่าง LIMIT ไว้แค่ 10 แถว
        const [[{ count: unreadChatCountRaw }]] = await pool.query(
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
        // mysql2 คืนผลลัพธ์ SUM() เป็น string เสมอ (ต่างจาก COUNT() ที่ได้ number ตรงๆ) ต้องแปลงเองไม่งั้น type ไม่ตรงกับที่ frontend คาดไว้
        const unreadChatCount = Number(unreadChatCountRaw);

        // รายชื่อ task ที่มีข้อความแชทยังไม่ได้อ่าน (จำกัด 10 อันล่าสุดสำหรับแสดงเป็นลิสต์คลิกเข้าไปอ่านได้)
        // ต่างจากตัวเลขสรุปด้านบน — อันนี้ลิมิตจำนวนแถวเพื่อแสดงผล ไม่ใช่ตัวเลขสรุปที่ต้องถูกต้องครบทุก task
        const [unreadChats] = await pool.query(
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

        // ดึงเนื้อหาข้อความล่าสุดจริง (+ ชื่อคนส่ง + มีรูปแนบไหม) มาแปะไว้เป็น preview ต่อ task
        // แยก query เป็นรอบต่อ task (สูงสุด 10 ครั้งเพราะ unreadChats ลิมิตไว้ 10 แถว) ง่ายกว่าไล่ tuple-IN ซับซ้อน
        for (const chat of unreadChats) {
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
            activeProjectCount,
            projects,
            myTasks,
            openIssueCount,
            openIssueCountOwnOnly,
            openIssues,
            unreadChatCount,
            unreadChats,
            recentActivity,
        });
    } catch (err) {
        next(err);
    }
}

module.exports = { getSummary };
