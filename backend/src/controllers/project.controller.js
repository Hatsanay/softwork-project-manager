const pool = require("../config/db");
const { generateDailyId } = require("../utils/generateDailyId");
const { generateShareToken } = require("../utils/shareToken");
const { hasBit } = require("../utils/permissions");
const { sendProjectMemberAddedEmail, sendClientShareLinkEmail } = require("../utils/mailer");
const { insertProject, listTaskCatalog } = require("../services/project.service");
const { insertTasksFromRows } = require("../services/quotation-accept.service");
const { validate } = require("../utils/validate");
const { withTransaction } = require("../utils/with-transaction");
const { projectCreateTasksSchema } = require("../shared/schemas/project.mjs");

async function getAll(req, res, next) {
    try {
        const limit = Number(req.query.limit) || 10;
        const offset = Number(req.query.offset) || 0;
        const search = `%${req.query.search ?? ""}%`;
        // ค่าเริ่มต้นไม่โชว์โปรเจกต์ที่ยกเลิกแล้ว ต้องขอดูผ่าน ?status=cancelled ชัดเจน (ปุ่ม "ดูโปรเจกต์ที่ยกเลิก" ฝั่งหน้าบ้าน)
        const wantCancelled = req.query.status === "cancelled";
        const statusClause = wantCancelled ? "p.project_status = 'cancelled'" : "p.project_status != 'cancelled'";

        // เห็นทุกโปรเจกต์ถ้ามีสิทธิ์ viewAllProjects ไม่งั้นเห็นแค่ที่ตัวเองเป็นสมาชิก (viewAllProjects/viewOwnProjects อย่างใดอย่างหนึ่งถูกบังคับไว้แล้วที่ route)
        const rolePermission = req.user.role_permission; // ดึงสดจาก DB แล้วใน requireAuth
        const seesAll = hasBit(rolePermission, "viewAllProjects");

        const memberJoin = seesAll ? "" : "JOIN tb_project_members pm ON pm.project_id = p.project_id AND pm.user_id = ?";
        const memberParams = seesAll ? [] : [req.user.user_id];

        const [rows] = await pool.query(
            `SELECT p.project_id, p.project_name, p.project_status, p.project_type, p.project_start_date, p.project_due_date,
                    p.project_progress_percent, c.client_name,
                    (SELECT COUNT(*) FROM tb_project_members pm2 WHERE pm2.project_id = p.project_id) AS member_count
             FROM tb_projects p
             ${memberJoin}
             LEFT JOIN tb_clients c ON c.client_id = p.client_id
             WHERE p.project_name LIKE ? AND ${statusClause}
             ORDER BY p.project_id DESC
             LIMIT ? OFFSET ?`,
            [...memberParams, search, limit, offset]
        );
        const [[{ total }]] = await pool.query(
            `SELECT COUNT(*) AS total FROM tb_projects p ${memberJoin} WHERE p.project_name LIKE ? AND ${statusClause}`,
            [...memberParams, search]
        );

        res.json({ data: rows, total });
    } catch (err) {
        next(err);
    }
}

async function getOne(req, res, next) {
    try {
        const [rows] = await pool.query(
            `SELECT p.*, c.client_name, c.client_company, c.client_email, c.client_phone
             FROM tb_projects p
             LEFT JOIN tb_clients c ON c.client_id = p.client_id
             WHERE p.project_id = ?`,
            [req.params.id]
        );
        if (!rows[0]) return res.status(404).json({ message: "ไม่พบโปรเจกต์นี้" });

        // จำนวนข้อความแชทรวมของโปรเจกต์ที่ยังไม่ได้อ่าน — แนบมาพร้อม getOne เลยเพื่อโชว์ badge บนปุ่มแชทได้ทันทีไม่ต้องยิง request แยก
        const [[{ unread_chat_count }]] = await pool.query(
            `SELECT COUNT(*) AS unread_chat_count
             FROM tb_project_chat_messages c
             LEFT JOIN tb_project_chat_reads r ON r.project_id = c.project_id AND r.user_id = ?
             WHERE c.project_id = ?
               AND (c.user_id IS NULL OR c.user_id != ?)
               AND (r.last_read_at IS NULL OR c.message_created_at > r.last_read_at)`,
            [req.user.user_id, req.params.id, req.user.user_id]
        );

        res.json({ ...rows[0], unread_chat_count });
    } catch (err) {
        next(err);
    }
}

async function create(req, res, next) {
    try {
        const { project_name, client_id, project_description, project_status, project_type, project_start_date, project_due_date } = req.body;
        if (!project_name) return res.status(400).json({ message: "กรุณากรอกชื่อโปรเจกต์" });
        if (project_type && !["waterfall", "agile"].includes(project_type)) {
            return res.status(400).json({ message: "รูปแบบโปรเจกต์ไม่ถูกต้อง" });
        }

        // งานจากสินค้าที่เลือก (2026-10-31) · ไม่ส่ง = ไม่สร้างงาน
        const { tasks } = validate(projectCreateTasksSchema, { tasks: req.body.tasks });

        // แยกไปที่ services/project.service.js (2026-10-14) — ใช้ร่วมกับตอนลูกค้าตอบรับใบเสนอราคา
        // โปรเจกต์ + งานในธุรกรรมเดียว: สร้างงานไม่สำเร็จ = ไม่มีโปรเจกต์ค้างครึ่งทาง
        const result = await withTransaction(async (conn) => {
            const created = await insertProject(
                conn,
                { project_name, client_id, project_description, project_status, project_type, project_start_date, project_due_date },
                req.user.user_id
            );
            const taskCount = tasks.length > 0
                ? await insertTasksFromRows(conn, created.project_id, tasks, "จากสินค้าที่เลือกตอนสร้างโปรเจกต์")
                : 0;
            return { ...created, task_count: taskCount };
        });

        res.status(201).json(result);
    } catch (err) {
        next(err);
    }
}

async function taskCatalog(req, res, next) {
    try {
        res.json(await listTaskCatalog(pool));
    } catch (err) {
        next(err);
    }
}

async function update(req, res, next) {
    try {
        const { project_name, client_id, project_description, project_status, project_start_date, project_due_date } = req.body;
        if (!project_name) return res.status(400).json({ message: "กรุณากรอกชื่อโปรเจกต์" });

        const nextStatus = project_status || "planning";

        // project_completed_at ตั้งครั้งเดียวตอน "เพิ่งเปลี่ยน" เป็น completed เท่านั้น (เหมือน task_completed_at ของ task)
        // ไม่ใช้ project_updated_at แทนเพราะแก้ไขข้อมูลอื่นทีหลัง (เช่นแก้ชื่อ) จะทำให้เวลาคลาดเคลื่อนจากเวลาที่เสร็จจริง
        // ใช้คำนวณ KPI "อัตราส่งโปรเจกต์ตรงเวลา" บนแดชบอร์ด — เปลี่ยนสถานะออกจาก completed ก็เคลียร์ทิ้งกันค่าค้าง
        const [[current]] = await pool.query("SELECT project_status FROM tb_projects WHERE project_id = ?", [req.params.id]);
        if (!current) return res.status(404).json({ message: "ไม่พบโปรเจกต์นี้" });
        let completedAtClause = "";
        if (nextStatus === "completed" && current.project_status !== "completed") {
            completedAtClause = ", project_completed_at = NOW()";
        } else if (nextStatus !== "completed" && current.project_status === "completed") {
            completedAtClause = ", project_completed_at = NULL";
        }

        await pool.query(
            `UPDATE tb_projects SET
                project_name = ?, client_id = ?, project_description = ?, project_status = ?,
                project_start_date = ?, project_due_date = ?
                ${completedAtClause}
             WHERE project_id = ?`,
            [
                project_name, client_id || null, project_description || null, nextStatus,
                project_start_date || null, project_due_date || null, req.params.id,
            ]
        );

        res.json({ message: "แก้ไขโปรเจกต์สำเร็จ" });
    } catch (err) {
        next(err);
    }
}

async function remove(req, res, next) {
    try {
        // โปรเจกต์ที่ผูกกับใบเสนอราคาลบไม่ได้ (FK ไม่ cascade) — บอกเหตุผลแทน error 500 (2026-10-14, sales-cycle หัวข้อ 1)
        const [[{ quotationCount }]] = await pool.query(
            "SELECT COUNT(*) AS quotationCount FROM tb_quotations WHERE qt_project_id = ?",
            [req.params.id]
        );
        if (quotationCount > 0) {
            return res.status(409).json({
                code: "PROJECT_HAS_QUOTATIONS",
                message: `ลบโปรเจกต์นี้ไม่ได้ เพราะผูกกับใบเสนอราคา ${quotationCount} ใบ · ถ้าไม่ทำต่อแล้วให้ใช้ "ยกเลิกโปรเจกต์" แทน (กู้คืนได้ ประวัติยังอยู่)`,
            });
        }
        // ค่าใช้จ่ายที่ผูกโปรเจกต์ (ต้นทุนโปรเจกต์ — เฟส 2 P4) ก็ลบไม่ได้เหมือนกัน
        const [[{ expenseCount }]] = await pool.query(
            "SELECT COUNT(DISTINCT exl_expense_id) AS expenseCount FROM tb_expense_lines WHERE exl_project_id = ?",
            [req.params.id]
        );
        if (expenseCount > 0) {
            return res.status(409).json({
                code: "PROJECT_HAS_EXPENSES",
                message: `ลบโปรเจกต์นี้ไม่ได้ เพราะมีค่าใช้จ่าย ${expenseCount} รายการผูกอยู่ (เป็นต้นทุนโปรเจกต์) · ถ้าไม่ทำต่อแล้วให้ใช้ "ยกเลิกโปรเจกต์" แทน`,
            });
        }
        // เงินจาก Fastwork ที่บันทึกไว้ (รายได้ · 2026-10-24 P-1) ก็ลบไม่ได้ — รวมรายการที่ยกเลิกแล้ว (เป็นประวัติการเงิน)
        const [[{ payoutCount }]] = await pool.query(
            "SELECT COUNT(*) AS payoutCount FROM tb_fastwork_payouts WHERE fwp_project_id = ?",
            [req.params.id]
        );
        if (payoutCount > 0) {
            return res.status(409).json({
                code: "PROJECT_HAS_FASTWORK_PAYOUTS",
                message: `ลบโปรเจกต์นี้ไม่ได้ เพราะบันทึกเงินจาก Fastwork ไว้ ${payoutCount} รายการ (เป็นรายได้) · ถ้าไม่ทำต่อแล้วให้ใช้ "ยกเลิกโปรเจกต์" แทน`,
            });
        }
        // ชั่วโมงทำงานที่ลงไว้ (ต้นทุนค่าแรง — เฟส 4 ขั้น 4-2 R-H10) ก็ลบไม่ได้เหมือนกัน
        const [[{ timesheetCount }]] = await pool.query(
            "SELECT COUNT(*) AS timesheetCount FROM tb_timesheet_entries WHERE tse_project_id = ?",
            [req.params.id]
        );
        if (timesheetCount > 0) {
            return res.status(409).json({
                code: "PROJECT_HAS_TIMESHEETS",
                message: `ลบโปรเจกต์นี้ไม่ได้ เพราะมีชั่วโมงทำงานลงไว้ ${timesheetCount} แถว (เป็นต้นทุนค่าแรง) · ถ้าไม่ทำต่อแล้วให้ใช้ "ยกเลิกโปรเจกต์" แทน`,
            });
        }
        await pool.query("DELETE FROM tb_projects WHERE project_id = ?", [req.params.id]);
        res.status(204).end();
    } catch (err) {
        next(err);
    }
}

// ยกเลิกโปรเจกต์เป็นแค่เปลี่ยนสถานะ (soft, กู้คืนได้) คนละเรื่องกับ deleteProject ที่ลบถาวร
// สิทธิ์ระดับระบบ ไม่ต้องเป็นสมาชิกโปรเจกต์นั้นก็ยกเลิกได้ (ต่างจาก editProjectInfo ที่ต้องเป็นสมาชิก)
async function cancel(req, res, next) {
    try {
        const [rows] = await pool.query("SELECT project_id FROM tb_projects WHERE project_id = ?", [req.params.id]);
        if (!rows[0]) return res.status(404).json({ message: "ไม่พบโปรเจกต์นี้" });

        await pool.query("UPDATE tb_projects SET project_status = 'cancelled' WHERE project_id = ?", [req.params.id]);
        res.json({ message: "ยกเลิกโปรเจกต์สำเร็จ" });
    } catch (err) {
        next(err);
    }
}

async function reactivate(req, res, next) {
    try {
        const [rows] = await pool.query("SELECT project_id FROM tb_projects WHERE project_id = ?", [req.params.id]);
        if (!rows[0]) return res.status(404).json({ message: "ไม่พบโปรเจกต์นี้" });

        await pool.query("UPDATE tb_projects SET project_status = 'planning' WHERE project_id = ?", [req.params.id]);
        res.json({ message: "กู้คืนโปรเจกต์สำเร็จ" });
    } catch (err) {
        next(err);
    }
}

async function regenerateShareLink(req, res, next) {
    try {
        const project_share_token = generateShareToken();
        await pool.query("UPDATE tb_projects SET project_share_token = ? WHERE project_id = ?", [
            project_share_token,
            req.params.id,
        ]);
        res.json({ project_share_token });
    } catch (err) {
        next(err);
    }
}

async function toggleShareEnabled(req, res, next) {
    try {
        const { project_share_enabled } = req.body;
        await pool.query("UPDATE tb_projects SET project_share_enabled = ? WHERE project_id = ?", [
            !!project_share_enabled,
            req.params.id,
        ]);
        res.json({ message: "อัปเดตสำเร็จ" });
    } catch (err) {
        next(err);
    }
}

// ส่งลิงก์สำหรับลูกค้าไปทางอีเมล — เป็นการกดปุ่มของผู้ใช้ตรงๆ จึง await และตอบผลจริงกลับไป (ต่างจาก notify* ที่เป็น fire-and-forget)
async function sendShareLinkEmail(req, res, next) {
    try {
        const [rows] = await pool.query(
            `SELECT p.project_name, p.project_share_token, p.project_share_enabled,
                    p.project_progress_percent, p.project_due_date, c.client_email, c.client_name
             FROM tb_projects p
             LEFT JOIN tb_clients c ON c.client_id = p.client_id
             WHERE p.project_id = ?`,
            [req.params.id]
        );
        const project = rows[0];
        if (!project) return res.status(404).json({ message: "ไม่พบโปรเจกต์นี้" });
        if (!project.project_share_enabled) {
            return res.status(400).json({ message: "กรุณาเปิดใช้งานลิงก์สำหรับลูกค้าก่อนส่งอีเมล" });
        }

        const to = (req.body.to || project.client_email || "").trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
            return res.status(400).json({ message: "กรุณากรอกอีเมลผู้รับให้ถูกต้อง" });
        }

        const [[sender]] = await pool.query(
            "SELECT CONCAT(user_fname, ' ', user_lname) AS fullname FROM tb_users WHERE user_id = ?",
            [req.user.user_id]
        );

        const shareUrl = `${process.env.FRONTEND_URL}/share/${project.project_share_token}`;

        await sendClientShareLinkEmail({
            to,
            clientName: project.client_name,
            projectName: project.project_name,
            senderName: sender?.fullname ?? "",
            message: (req.body.message || "").trim(),
            progressPercent: project.project_progress_percent,
            dueDate: project.project_due_date,
            shareUrl,
        });

        res.json({ message: "ส่งอีเมลสำเร็จ" });
    } catch (err) {
        if (err.message === "SMTP_NOT_CONFIGURED") {
            return res.status(503).json({ message: "ระบบยังไม่ได้ตั้งค่าอีเมล (SMTP) กรุณาติดต่อผู้ดูแลระบบ" });
        }
        console.error("[project.controller] sendShareLinkEmail failed:", err.message);
        res.status(502).json({ message: "ส่งอีเมลไม่สำเร็จ กรุณาลองใหม่" });
    }
}

async function toggleTaskWeight(req, res, next) {
    try {
        const { project_use_task_weight } = req.body;
        await pool.query("UPDATE tb_projects SET project_use_task_weight = ? WHERE project_id = ?", [
            !!project_use_task_weight,
            req.params.id,
        ]);
        res.json({ message: "อัปเดตสำเร็จ" });
    } catch (err) {
        next(err);
    }
}

// รวมสิทธิ์จากทุกตำแหน่งที่ตัวเองถือในโปรเจกต์นี้ เป็น bitmask เดียว (OR แต่ละบิต) — requireProjectMember คำนวณไว้แล้ว
// ให้ frontend เอาไปเช็คเองว่าจะโชว์ปุ่มอะไรบ้าง — ไม่ส่งรายละเอียดตำแหน่ง/สิทธิ์ของสมาชิกคนอื่นออกไป
function getMyPermissions(req, res) {
    res.json({ position_permission: req.projectPermission ?? "" });
}

// ─── สมาชิกโปรเจกต์ ─────────────────────────────────────────────────────────────

async function getMembers(req, res, next) {
    try {
        const [members] = await pool.query(
            `SELECT pm.project_member_id, pm.user_id, u.user_fname, u.user_lname,
                    CONCAT(u.user_fname, ' ', u.user_lname) AS user_fullname, u.user_avatar_url
             FROM tb_project_members pm
             JOIN tb_users u ON u.user_id = pm.user_id
             WHERE pm.project_id = ?
             ORDER BY pm.joined_at ASC`,
            [req.params.id]
        );

        const [positions] = await pool.query(
            `SELECT pmp.project_member_id, pp.position_id, pp.position_name
             FROM tb_project_member_positions pmp
             JOIN tb_project_positions pp ON pp.position_id = pmp.position_id
             JOIN tb_project_members pm ON pm.project_member_id = pmp.project_member_id
             WHERE pm.project_id = ?`,
            [req.params.id]
        );

        const data = members.map((m) => ({
            ...m,
            positions: positions.filter((p) => p.project_member_id === m.project_member_id),
        }));

        res.json(data);
    } catch (err) {
        next(err);
    }
}

// แจ้งอีเมลผู้ถูกเพิ่มเป็นสมาชิกโปรเจกต์ใหม่ — fire-and-forget เหมือน notifyNewAssignees ใน task.controller
async function notifyMemberAdded({ project_id, recipientUserId, position_ids, adderUserId }) {
    try {
        const [[project]] = await pool.query("SELECT project_name FROM tb_projects WHERE project_id = ?", [project_id]);
        const [[adder]] = await pool.query(
            "SELECT CONCAT(user_fname, ' ', user_lname) AS fullname FROM tb_users WHERE user_id = ?",
            [adderUserId]
        );
        const [[recipient]] = await pool.query("SELECT user_email FROM tb_users WHERE user_id = ?", [recipientUserId]);
        if (!recipient?.user_email) return; // ผู้ใช้ที่ยังไม่ได้ยืนยันอีเมล — ข้ามไป ไม่มีที่ให้ส่ง

        let positionNames = [];
        if (position_ids.length) {
            const [rows] = await pool.query(
                "SELECT position_name FROM tb_project_positions WHERE position_id IN (?)",
                [position_ids]
            );
            positionNames = rows.map((r) => r.position_name);
        }

        const actionUrl = `${process.env.FRONTEND_URL}/projects/view?id=${project_id}`;
        sendProjectMemberAddedEmail({
            to: recipient.user_email,
            projectName: project?.project_name ?? "",
            adderName: adder?.fullname ?? "",
            positionNames,
            actionUrl,
        });
    } catch (err) {
        console.error("[project.controller] notifyMemberAdded failed:", err.message);
    }
}

async function addMember(req, res, next) {
    const { user_id, position_ids } = req.body;
    if (!user_id) return res.status(400).json({ message: "กรุณาเลือกผู้ใช้งาน" });

    const project_member_id = await generateDailyId("tb_project_members", "project_member_id", "MEM");
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        await conn.query(
            "INSERT INTO tb_project_members (project_member_id, project_id, user_id) VALUES (?, ?, ?)",
            [project_member_id, req.params.id, user_id]
        );
        for (const position_id of position_ids ?? []) {
            await conn.query(
                "INSERT INTO tb_project_member_positions (project_member_id, position_id) VALUES (?, ?)",
                [project_member_id, position_id]
            );
        }

        await conn.commit();
        res.status(201).json({ project_member_id });

        notifyMemberAdded({
            project_id: req.params.id,
            recipientUserId: user_id,
            position_ids: position_ids ?? [],
            adderUserId: req.user.user_id,
        });
    } catch (err) {
        await conn.rollback();
        if (err.code === "ER_DUP_ENTRY") {
            return res.status(409).json({ message: "ผู้ใช้งานนี้อยู่ในโปรเจกต์นี้แล้ว" });
        }
        if (err.code === "ER_NO_REFERENCED_ROW_2" || err.code === "ER_NO_REFERENCED_ROW") {
            return res.status(400).json({ message: "ผู้ใช้งานหรือตำแหน่งที่เลือกไม่ถูกต้อง" });
        }
        next(err);
    } finally {
        conn.release();
    }
}

async function updateMemberPositions(req, res, next) {
    const { position_ids } = req.body;
    const memberId = req.params.memberId;

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        await conn.query("DELETE FROM tb_project_member_positions WHERE project_member_id = ?", [memberId]);
        for (const position_id of position_ids ?? []) {
            await conn.query(
                "INSERT INTO tb_project_member_positions (project_member_id, position_id) VALUES (?, ?)",
                [memberId, position_id]
            );
        }

        await conn.commit();
        res.json({ message: "แก้ไขตำแหน่งสำเร็จ" });
    } catch (err) {
        await conn.rollback();
        if (err.code === "ER_NO_REFERENCED_ROW_2" || err.code === "ER_NO_REFERENCED_ROW") {
            return res.status(400).json({ message: "ตำแหน่งที่เลือกไม่ถูกต้อง" });
        }
        next(err);
    } finally {
        conn.release();
    }
}

async function removeMember(req, res, next) {
    try {
        await pool.query("DELETE FROM tb_project_members WHERE project_member_id = ? AND project_id = ?", [
            req.params.memberId,
            req.params.id,
        ]);
        res.status(204).end();
    } catch (err) {
        next(err);
    }
}

module.exports = {
    getAll, getOne, create, taskCatalog, update, remove, cancel, reactivate,
    regenerateShareLink, toggleShareEnabled, toggleTaskWeight, sendShareLinkEmail,
    getMembers, addMember, updateMemberPositions, removeMember,
    getMyPermissions,
};
