const sharp = require("sharp");
const fs = require("fs/promises");
const path = require("path");
const pool = require("../config/db");
const { generateDailyId } = require("../utils/generateDailyId");
const { hasProjectBit } = require("../utils/projectPermissions");

const UPLOADS_DIR = path.join(__dirname, "..", "..", "uploads");

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

// บิตของปัญหาแยก task/subtask กันเต็มรูปแบบ ไม่ใช้ร่วมกันแบบที่ task/subtask ปกติทำ (ตามที่ผู้ใช้ระบุไว้ชัดเจน)
// "ของตัวเอง" หมายถึงเป็นผู้รับผิดชอบ (assignee) ของ task/subtask นั้นเอง — ไม่ใช่คนที่แจ้งปัญหา
// action: "add" | "edit" | "delete" | "changeStatus" — ชื่อบิต changeStatus สลับคำเป็น changeIssueStatus* ไม่ใช่ changeStatusIssue*
const ISSUE_BIT_PREFIX = {
    add: "addIssue", edit: "editIssue", delete: "deleteIssue", changeStatus: "changeIssueStatus",
};
const ISSUE_OWN_BIT_PREFIX = {
    add: "addOwnIssue", edit: "editOwnIssue", delete: "deleteOwnIssue", changeStatus: "changeOwnIssueStatus",
};

async function canDoIssueAction(action, projectId, task, userId) {
    const isSubtask = !!task.task_parent_id;
    const scope = isSubtask ? "Subtask" : "Task";
    const allKey = `${ISSUE_BIT_PREFIX[action]}${scope}`;
    const ownKey = `${ISSUE_OWN_BIT_PREFIX[action]}${scope}`;

    if (await hasProjectPositionBit(projectId, userId, allKey)) return true;
    if ((await isAssignee(task.task_id, userId)) && (await hasProjectPositionBit(projectId, userId, ownKey))) return true;
    return false;
}

// ย่อ+บีบเป็น WebP ให้ไฟล์เล็กลงมาก แต่คงสัดส่วนภาพไว้ (ต่างจากรูปโปรไฟล์ที่ครอปเป็นสี่เหลี่ยมจัตุรัส)
// เพราะรูปแนบปัญหามักเป็นภาพหน้าจอ/หลักฐาน สัดส่วนเดิมสำคัญกว่า
async function saveIssueImages(issueId, files) {
    for (const file of files ?? []) {
        const filename = `issue-${Date.now()}-${Math.round(Math.random() * 1e9)}.webp`;
        await sharp(file.buffer)
            .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
            .webp({ quality: 78 })
            .toFile(path.join(UPLOADS_DIR, filename));

        const image_id = await generateDailyId("tb_task_issue_images", "image_id", "IMA");
        await pool.query(
            "INSERT INTO tb_task_issue_images (image_id, issue_id, image_url) VALUES (?, ?, ?)",
            [image_id, issueId, `/uploads/${filename}`]
        );
    }
}

async function deleteImages(imageRows) {
    if (!imageRows.length) return;
    await pool.query("DELETE FROM tb_task_issue_images WHERE image_id IN (?)", [imageRows.map((r) => r.image_id)]);
    for (const row of imageRows) {
        await fs.unlink(path.join(UPLOADS_DIR, path.basename(row.image_url))).catch(() => {});
    }
}

async function attachImages(issues) {
    if (issues.length === 0) return issues;
    const [rows] = await pool.query(
        `SELECT image_id, issue_id, image_url
         FROM tb_task_issue_images
         WHERE issue_id IN (?)
         ORDER BY image_created_at ASC`,
        [issues.map((i) => i.issue_id)]
    );
    return issues.map((i) => ({ ...i, images: rows.filter((r) => r.issue_id === i.issue_id) }));
}

// แท็กคนในปัญหา (@ tag) — คนที่ถูกแท็กจะเห็นปัญหานี้ใน "ปัญหาที่เปิดอยู่" บนแดชบอร์ดของตัวเองเสมอ แม้ไม่ได้รับผิดชอบ
// task/subtask นั้นโดยตรง (ดู dashboard.controller.js) และขึ้นพื้นหลังสีแดงเฉพาะในมุมมองของคนที่ถูกแท็กเท่านั้น
async function attachTags(issues) {
    if (issues.length === 0) return issues;
    const [rows] = await pool.query(
        `SELECT t.issue_id, u.user_id, CONCAT(u.user_fname, ' ', u.user_lname) AS user_fullname
         FROM tb_task_issue_tags t
         JOIN tb_users u ON u.user_id = t.user_id
         WHERE t.issue_id IN (?)
         ORDER BY t.tagged_at ASC`,
        [issues.map((i) => i.issue_id)]
    );
    return issues.map((i) => ({ ...i, tags: rows.filter((r) => r.issue_id === i.issue_id).map((r) => ({ user_id: r.user_id, user_fullname: r.user_fullname })) }));
}

// แทนที่แท็กทั้งหมดของปัญหาด้วยชุดใหม่ (ลบของเดิมทิ้งก่อนเสมอ ง่ายกว่า diff เพราะจำนวนแท็กต่อปัญหาไม่เยอะ)
// กรอง user_id ที่ไม่มีจริงในระบบทิ้งไปเงียบๆ (กันแท็กมั่ว/พังจาก FK constraint แทนที่จะโยน error ทั้ง request)
async function saveIssueTags(issueId, taggedUserIds) {
    await pool.query("DELETE FROM tb_task_issue_tags WHERE issue_id = ?", [issueId]);
    const uniqueIds = [...new Set(taggedUserIds)];
    if (uniqueIds.length === 0) return;

    const [validUsers] = await pool.query("SELECT user_id FROM tb_users WHERE user_id IN (?)", [uniqueIds]);
    const validIds = validUsers.map((u) => u.user_id);
    if (validIds.length === 0) return;

    const values = validIds.map((userId) => [issueId, userId]);
    await pool.query("INSERT INTO tb_task_issue_tags (issue_id, user_id) VALUES ?", [values]);
}

function parseTaggedUserIds(raw) {
    try {
        const parsed = JSON.parse(raw || "[]");
        return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string" && id) : [];
    } catch {
        return [];
    }
}

async function getForTask(req, res, next) {
    try {
        const [rows] = await pool.query(
            `SELECT i.issue_id, i.task_id, i.issue_title, i.issue_description, i.issue_status,
                    i.created_by, CONCAT(u.user_fname, ' ', u.user_lname) AS created_by_name,
                    i.issue_created_at, i.issue_updated_at
             FROM tb_task_issues i
             LEFT JOIN tb_users u ON u.user_id = i.created_by
             WHERE i.task_id = ?
             ORDER BY i.issue_created_at ASC`,
            [req.params.taskId]
        );
        const data = await attachTags(await attachImages(rows));
        res.json({ data });
    } catch (err) {
        next(err);
    }
}

async function create(req, res, next) {
    try {
        const { issue_title, issue_description } = req.body;
        if (!issue_title) return res.status(400).json({ message: "กรุณากรอกชื่อปัญหา" });

        const [taskRows] = await pool.query(
            "SELECT task_id, project_id, task_parent_id FROM tb_tasks WHERE task_id = ?",
            [req.params.taskId]
        );
        const task = taskRows[0];
        if (!task) return res.status(404).json({ message: "ไม่พบ task นี้" });

        const allowed = await canDoIssueAction("add", task.project_id, task, req.user.user_id);
        if (!allowed) return res.status(403).json({ message: "ไม่มีสิทธิ์เพิ่มปัญหาใน task นี้" });

        const issue_id = await generateDailyId("tb_task_issues", "issue_id", "ISS");
        await pool.query(
            `INSERT INTO tb_task_issues (issue_id, task_id, issue_title, issue_description, created_by)
             VALUES (?, ?, ?, ?, ?)`,
            [issue_id, req.params.taskId, issue_title, issue_description || null, req.user.user_id]
        );
        await saveIssueImages(issue_id, req.files);
        await saveIssueTags(issue_id, parseTaggedUserIds(req.body.tagged_user_ids));

        res.status(201).json({ issue_id });
    } catch (err) {
        next(err);
    }
}

async function getIssueWithTask(issueId) {
    const [rows] = await pool.query(
        `SELECT i.issue_id, i.task_id, i.issue_status, t.project_id, t.task_parent_id
         FROM tb_task_issues i
         JOIN tb_tasks t ON t.task_id = i.task_id
         WHERE i.issue_id = ?`,
        [issueId]
    );
    return rows[0];
}

async function update(req, res, next) {
    try {
        const { issue_title, issue_description } = req.body;
        if (!issue_title) return res.status(400).json({ message: "กรุณากรอกชื่อปัญหา" });

        const row = await getIssueWithTask(req.params.issueId);
        if (!row) return res.status(404).json({ message: "ไม่พบปัญหานี้" });

        const allowed = await canDoIssueAction("edit", row.project_id, row, req.user.user_id);
        if (!allowed) return res.status(403).json({ message: "ไม่มีสิทธิ์แก้ไขปัญหานี้" });

        await pool.query(
            "UPDATE tb_task_issues SET issue_title = ?, issue_description = ? WHERE issue_id = ?",
            [issue_title, issue_description || null, req.params.issueId]
        );

        // keep_image_ids = JSON array ของรูปเดิมที่ยังเก็บไว้ — รูปเดิมที่ไม่อยู่ในนี้จะถูกลบทิ้ง (ทั้ง DB และไฟล์จริง)
        let keepIds = [];
        try {
            keepIds = JSON.parse(req.body.keep_image_ids || "[]");
        } catch {
            keepIds = [];
        }
        const [existingImages] = await pool.query(
            "SELECT image_id, image_url FROM tb_task_issue_images WHERE issue_id = ?",
            [req.params.issueId]
        );
        const toDelete = existingImages.filter((img) => !keepIds.includes(img.image_id));
        await deleteImages(toDelete);
        await saveIssueImages(req.params.issueId, req.files);
        await saveIssueTags(req.params.issueId, parseTaggedUserIds(req.body.tagged_user_ids));

        res.json({ message: "แก้ไขปัญหาสำเร็จ" });
    } catch (err) {
        next(err);
    }
}

async function updateStatus(req, res, next) {
    try {
        const { issue_status } = req.body;
        if (!["open", "resolved"].includes(issue_status)) {
            return res.status(400).json({ message: "สถานะไม่ถูกต้อง" });
        }

        const row = await getIssueWithTask(req.params.issueId);
        if (!row) return res.status(404).json({ message: "ไม่พบปัญหานี้" });

        const allowed = await canDoIssueAction("changeStatus", row.project_id, row, req.user.user_id);
        if (!allowed) return res.status(403).json({ message: "ไม่มีสิทธิ์เปลี่ยนสถานะปัญหานี้" });

        // issue_resolved_at ตั้งครั้งเดียวตอน "เพิ่งเปลี่ยน" เป็น resolved เท่านั้น (เหมือน task_completed_at/project_completed_at)
        // ไม่ใช้ issue_updated_at เพราะ ON UPDATE CURRENT_TIMESTAMP จะขยับทุกครั้งที่แก้ไข issue (เช่นแก้ชื่อ/รายละเอียดทีหลัง)
        // ทำให้เวลาแก้ปัญหาที่ใช้คำนวณ KPI เพี้ยน — เปิดปัญหาขึ้นมาใหม่ก็เคลียร์ทิ้งกันค่าค้าง
        let resolvedAtClause = "";
        if (issue_status === "resolved" && row.issue_status !== "resolved") {
            resolvedAtClause = ", issue_resolved_at = NOW()";
        } else if (issue_status !== "resolved" && row.issue_status === "resolved") {
            resolvedAtClause = ", issue_resolved_at = NULL";
        }

        await pool.query(
            `UPDATE tb_task_issues SET issue_status = ? ${resolvedAtClause} WHERE issue_id = ?`,
            [issue_status, req.params.issueId]
        );
        res.json({ message: "อัปเดตสถานะสำเร็จ" });
    } catch (err) {
        next(err);
    }
}

async function remove(req, res, next) {
    try {
        const row = await getIssueWithTask(req.params.issueId);
        if (!row) return res.status(404).json({ message: "ไม่พบปัญหานี้" });

        const allowed = await canDoIssueAction("delete", row.project_id, row, req.user.user_id);
        if (!allowed) return res.status(403).json({ message: "ไม่มีสิทธิ์ลบปัญหานี้" });

        const [images] = await pool.query("SELECT image_id, image_url FROM tb_task_issue_images WHERE issue_id = ?", [req.params.issueId]);
        await pool.query("DELETE FROM tb_task_issues WHERE issue_id = ?", [req.params.issueId]);
        for (const img of images) {
            await fs.unlink(path.join(UPLOADS_DIR, path.basename(img.image_url))).catch(() => {});
        }

        res.status(204).end();
    } catch (err) {
        next(err);
    }
}

// รูปแนบของการตอบกลับ — ย่อ+บีบเป็น WebP เหมือน saveIssueImages ทุกอย่าง แค่ผูกกับ reply_id แทน issue_id
async function saveReplyImages(replyId, files) {
    for (const file of files ?? []) {
        const filename = `issue-reply-${Date.now()}-${Math.round(Math.random() * 1e9)}.webp`;
        await sharp(file.buffer)
            .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
            .webp({ quality: 78 })
            .toFile(path.join(UPLOADS_DIR, filename));

        const image_id = await generateDailyId("tb_task_issue_reply_images", "image_id", "IRI");
        await pool.query(
            "INSERT INTO tb_task_issue_reply_images (image_id, reply_id, image_url) VALUES (?, ?, ?)",
            [image_id, replyId, `/uploads/${filename}`]
        );
    }
}

async function attachReplyImages(replies) {
    if (replies.length === 0) return replies;
    const [rows] = await pool.query(
        `SELECT image_id, reply_id, image_url
         FROM tb_task_issue_reply_images
         WHERE reply_id IN (?)
         ORDER BY image_created_at ASC`,
        [replies.map((r) => r.reply_id)]
    );
    return replies.map((r) => ({ ...r, images: rows.filter((row) => row.reply_id === r.reply_id) }));
}

// ตอบกลับปัญหา — ใครก็ตามที่เป็นสมาชิกโปรเจกต์ตอบได้เลย (เช็คแค่ requireProjectMember ที่ route เหมือนแชท)
// ไม่ต้องมีสิทธิ์เฉพาะเหมือนบิต addIssue/editIssue เพราะเป็นแค่การพูดคุย/อัปเดตความคืบหน้า ไม่ใช่การกระทำต่อ workflow ของปัญหา
async function getReplies(req, res, next) {
    try {
        const [issueRows] = await pool.query("SELECT issue_id FROM tb_task_issues WHERE issue_id = ?", [req.params.issueId]);
        if (!issueRows[0]) return res.status(404).json({ message: "ไม่พบปัญหานี้" });

        const [rows] = await pool.query(
            `SELECT r.reply_id, r.issue_id, r.user_id,
                    CONCAT(u.user_fname, ' ', u.user_lname) AS user_fullname, u.user_avatar_url,
                    r.reply_text, r.reply_created_at
             FROM tb_task_issue_replies r
             LEFT JOIN tb_users u ON u.user_id = r.user_id
             WHERE r.issue_id = ?
             ORDER BY r.reply_created_at ASC, r.reply_id ASC`,
            [req.params.issueId]
        );
        const data = await attachReplyImages(rows);

        // ดูการตอบกลับ = ถือว่าอ่านแล้ว ไม่มี endpoint mark-read แยกต่างหาก (เหมือนแชท)
        // ใช้ NOW(3) ไม่ใช่ NOW() เฉยๆ กันตอบกลับใหม่มาถึงพร้อมวินาทีเดียวกับตอนอ่านแล้วเทียบเท่ากันพอดีจนไม่นับว่ายังไม่อ่าน
        await pool.query(
            `INSERT INTO tb_task_issue_reply_reads (issue_id, user_id, last_read_at) VALUES (?, ?, NOW(3))
             ON DUPLICATE KEY UPDATE last_read_at = VALUES(last_read_at)`,
            [req.params.issueId, req.user.user_id]
        );

        res.json({ data });
    } catch (err) {
        next(err);
    }
}

// การตอบกลับของทุกปัญหาใน task/subtask เดียว ในคำขอเดียว — ใช้ตอนเปิดดูรายละเอียด task เพราะตอนนี้เธรดตอบกลับ
// แสดงตลอด ไม่ต้องกดขยายทีละปัญหาเหมือนเดิม (ยิง N คำขอแยกทีละปัญหาจะช้ากว่านี้มาก) เปิดดู task = ถือว่าอ่านทุกปัญหาในนั้นแล้ว
// เหมือนกับ getReplies เดิม แค่ทำทีเดียวพร้อมกันทุกปัญหา
async function getRepliesForTask(req, res, next) {
    try {
        const [issueRows] = await pool.query("SELECT issue_id FROM tb_task_issues WHERE task_id = ?", [req.params.taskId]);
        const issueIds = issueRows.map((r) => r.issue_id);
        if (issueIds.length === 0) return res.json({ data: {} });

        const [rows] = await pool.query(
            `SELECT r.reply_id, r.issue_id, r.user_id,
                    CONCAT(u.user_fname, ' ', u.user_lname) AS user_fullname, u.user_avatar_url,
                    r.reply_text, r.reply_created_at
             FROM tb_task_issue_replies r
             LEFT JOIN tb_users u ON u.user_id = r.user_id
             WHERE r.issue_id IN (?)
             ORDER BY r.reply_created_at ASC, r.reply_id ASC`,
            [issueIds]
        );
        const withImages = await attachReplyImages(rows);

        const data = {};
        for (const id of issueIds) data[id] = [];
        for (const row of withImages) data[row.issue_id].push(row);

        await Promise.all(issueIds.map((issueId) => pool.query(
            `INSERT INTO tb_task_issue_reply_reads (issue_id, user_id, last_read_at) VALUES (?, ?, NOW(3))
             ON DUPLICATE KEY UPDATE last_read_at = VALUES(last_read_at)`,
            [issueId, req.user.user_id]
        )));

        res.json({ data });
    } catch (err) {
        next(err);
    }
}

async function createReply(req, res, next) {
    try {
        const reply_text = (req.body.reply_text || "").trim();
        const hasImages = (req.files ?? []).length > 0;
        if (!reply_text && !hasImages) return res.status(400).json({ message: "กรุณาพิมพ์ข้อความหรือแนบรูป" });

        const [issueRows] = await pool.query("SELECT issue_id FROM tb_task_issues WHERE issue_id = ?", [req.params.issueId]);
        if (!issueRows[0]) return res.status(404).json({ message: "ไม่พบปัญหานี้" });

        const reply_id = await generateDailyId("tb_task_issue_replies", "reply_id", "IRP");
        await pool.query(
            "INSERT INTO tb_task_issue_replies (reply_id, issue_id, user_id, reply_text) VALUES (?, ?, ?, ?)",
            [reply_id, req.params.issueId, req.user.user_id, reply_text || null]
        );
        await saveReplyImages(reply_id, req.files);

        res.status(201).json({ reply_id });
    } catch (err) {
        next(err);
    }
}

module.exports = { getForTask, create, update, updateStatus, remove, getReplies, createReply, getRepliesForTask };
