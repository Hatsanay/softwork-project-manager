const pool = require("../config/db");
const { generateDailyId } = require("../utils/generateDailyId");
const { generateShareToken } = require("../utils/shareToken");
const { hasBit } = require("../utils/permissions");
const { sendProjectMemberAddedEmail, sendClientShareLinkEmail } = require("../utils/mailer");

async function getAll(req, res, next) {
    try {
        const limit = Number(req.query.limit) || 10;
        const offset = Number(req.query.offset) || 0;
        const search = `%${req.query.search ?? ""}%`;
        // ค่าเริ่มต้นไม่โชว์โปรเจกต์ที่ยกเลิกแล้ว ต้องขอดูผ่าน ?status=cancelled ชัดเจน (ปุ่ม "ดูโปรเจกต์ที่ยกเลิก" ฝั่งหน้าบ้าน)
        const wantCancelled = req.query.status === "cancelled";
        const statusClause = wantCancelled ? "p.project_status = 'cancelled'" : "p.project_status != 'cancelled'";

        // เห็นทุกโปรเจกต์ถ้ามีสิทธิ์ viewAllProjects ไม่งั้นเห็นแค่ที่ตัวเองเป็นสมาชิก (viewAllProjects/viewOwnProjects อย่างใดอย่างหนึ่งถูกบังคับไว้แล้วที่ route)
        const [roleRows] = await pool.query("SELECT role_permission FROM tb_roles WHERE role_id = ?", [req.user.user_role_id]);
        const rolePermission = roleRows[0]?.role_permission ?? "";
        const seesAll = hasBit(rolePermission, "viewAllProjects");

        const memberJoin = seesAll ? "" : "JOIN tb_project_members pm ON pm.project_id = p.project_id AND pm.user_id = ?";
        const memberParams = seesAll ? [] : [req.user.user_id];

        const [rows] = await pool.query(
            `SELECT p.project_id, p.project_name, p.project_status, p.project_start_date, p.project_due_date,
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
        res.json(rows[0]);
    } catch (err) {
        next(err);
    }
}

async function create(req, res, next) {
    try {
        const { project_name, client_id, project_description, project_status, project_start_date, project_due_date } = req.body;
        if (!project_name) return res.status(400).json({ message: "กรุณากรอกชื่อโปรเจกต์" });

        const project_id = await generateDailyId("tb_projects", "project_id", "PRO");
        const project_share_token = generateShareToken();

        await pool.query(
            `INSERT INTO tb_projects
                (project_id, client_id, project_name, project_description, project_status,
                 project_start_date, project_due_date, project_share_token, project_created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                project_id, client_id || null, project_name, project_description || null,
                project_status || "planning", project_start_date || null, project_due_date || null,
                project_share_token, req.user.user_id,
            ]
        );

        // ผู้สร้างเข้าโปรเจกต์อัตโนมัติ พร้อมตำแหน่ง PM (ถ้ามี) ให้คุมโปรเจกต์ตัวเองได้เต็มที่ทันที
        const project_member_id = await generateDailyId("tb_project_members", "project_member_id", "MEM");
        await pool.query(
            "INSERT INTO tb_project_members (project_member_id, project_id, user_id) VALUES (?, ?, ?)",
            [project_member_id, project_id, req.user.user_id]
        );

        const [pmRows] = await pool.query(
            "SELECT position_id FROM tb_project_positions WHERE position_name = 'PM' LIMIT 1"
        );
        if (pmRows[0]?.position_id) {
            await pool.query(
                "INSERT INTO tb_project_member_positions (project_member_id, position_id) VALUES (?, ?)",
                [project_member_id, pmRows[0].position_id]
            );
        }

        res.status(201).json({ project_id, project_share_token });
    } catch (err) {
        next(err);
    }
}

async function update(req, res, next) {
    try {
        const { project_name, client_id, project_description, project_status, project_start_date, project_due_date } = req.body;
        if (!project_name) return res.status(400).json({ message: "กรุณากรอกชื่อโปรเจกต์" });

        await pool.query(
            `UPDATE tb_projects SET
                project_name = ?, client_id = ?, project_description = ?, project_status = ?,
                project_start_date = ?, project_due_date = ?
             WHERE project_id = ?`,
            [
                project_name, client_id || null, project_description || null, project_status || "planning",
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

// รวมสิทธิ์จากทุกตำแหน่งที่ตัวเองถือในโปรเจกต์นี้ เป็น bitmask เดียว (OR แต่ละบิต)
// ให้ frontend เอาไปเช็คเองว่าจะโชว์ปุ่มอะไรบ้าง — ไม่ส่งรายละเอียดตำแหน่ง/สิทธิ์ของสมาชิกคนอื่นออกไป
async function getMyPermissions(req, res, next) {
    try {
        const [rows] = await pool.query(
            `SELECT pp.position_permission
             FROM tb_project_members pm
             JOIN tb_project_member_positions pmp ON pmp.project_member_id = pm.project_member_id
             JOIN tb_project_positions pp ON pp.position_id = pmp.position_id
             WHERE pm.project_id = ? AND pm.user_id = ?`,
            [req.params.id, req.user.user_id]
        );

        const length = Math.max(0, ...rows.map((r) => r.position_permission.length));
        let combined = "0".repeat(length);
        for (const r of rows) {
            combined = combined
                .split("")
                .map((bit, i) => (bit === "1" || r.position_permission[i] === "1" ? "1" : "0"))
                .join("");
        }

        res.json({ position_permission: combined });
    } catch (err) {
        next(err);
    }
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
        if (!recipient) return;

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
    getAll, getOne, create, update, remove, cancel, reactivate,
    regenerateShareLink, toggleShareEnabled, toggleTaskWeight, sendShareLinkEmail,
    getMembers, addMember, updateMemberPositions, removeMember,
    getMyPermissions,
};
