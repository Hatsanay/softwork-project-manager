const sharp = require("sharp");
const path = require("path");
const pool = require("../config/db");
const { generateDailyId } = require("../utils/generateDailyId");

const UPLOADS_DIR = path.join(__dirname, "..", "..", "uploads");

// สมาชิกโปรเจกต์ทุกคนแชทได้ ไม่ต้องมีสิทธิ์เฉพาะ — เช็คแค่ requireProjectMember ที่ route ก็พอ
// (ใช้กับทั้งแชทของ task/subtask และแชทรวมของโปรเจกต์ — โครงสร้างตารางเหมือนกันทุกอย่าง ต่างแค่ผูกกับ task_id หรือ project_id)

async function saveChatImages(imagesTable, imageIdPrefix, messageId, files) {
    for (const file of files ?? []) {
        const filename = `chat-${Date.now()}-${Math.round(Math.random() * 1e9)}.webp`;
        await sharp(file.buffer)
            .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
            .webp({ quality: 78 })
            .toFile(path.join(UPLOADS_DIR, filename));

        const image_id = await generateDailyId(imagesTable, "image_id", imageIdPrefix);
        await pool.query(
            `INSERT INTO ${imagesTable} (image_id, message_id, image_url) VALUES (?, ?, ?)`,
            [image_id, messageId, `/uploads/${filename}`]
        );
    }
}

async function attachImages(imagesTable, messages) {
    if (messages.length === 0) return messages;
    const [rows] = await pool.query(
        `SELECT image_id, message_id, image_url
         FROM ${imagesTable}
         WHERE message_id IN (?)
         ORDER BY image_created_at ASC`,
        [messages.map((m) => m.message_id)]
    );
    return messages.map((m) => ({ ...m, images: rows.filter((r) => r.message_id === m.message_id) }));
}

// ดูข้อความ = ถือว่าอ่านแล้ว ไม่มี endpoint mark-read แยกต่างหาก
// ใช้ NOW(3) ไม่ใช่ NOW() เฉยๆ — ต้องมีความละเอียดระดับมิลลิวินาที ไม่งั้นข้อความที่มาถึงในวินาทีเดียวกับตอนอ่าน
// จะเทียบ message_created_at > last_read_at แล้วเท่ากันพอดี (ปัดเป็นวินาทีเดียวกัน) กลายเป็นไม่นับว่ายังไม่อ่าน
async function markRead(readsTable, idColumn, entityId, userId) {
    await pool.query(
        `INSERT INTO ${readsTable} (${idColumn}, user_id, last_read_at) VALUES (?, ?, NOW(3))
         ON DUPLICATE KEY UPDATE last_read_at = VALUES(last_read_at)`,
        [entityId, userId]
    );
}

async function getForTask(req, res, next) {
    try {
        const [rows] = await pool.query(
            `SELECT c.message_id, c.task_id, c.user_id,
                    CONCAT(u.user_fname, ' ', u.user_lname) AS user_fullname, u.user_avatar_url,
                    c.message_text, c.message_created_at
             FROM tb_task_chat_messages c
             LEFT JOIN tb_users u ON u.user_id = c.user_id
             WHERE c.task_id = ?
             ORDER BY c.message_created_at ASC, c.message_id ASC`,
            [req.params.taskId]
        );
        const data = await attachImages("tb_task_chat_images", rows);
        await markRead("tb_task_chat_reads", "task_id", req.params.taskId, req.user.user_id);
        res.json({ data });
    } catch (err) {
        next(err);
    }
}

async function create(req, res, next) {
    try {
        const message_text = (req.body.message_text || "").trim();
        const hasImages = (req.files ?? []).length > 0;
        if (!message_text && !hasImages) {
            return res.status(400).json({ message: "กรุณาพิมพ์ข้อความหรือแนบรูป" });
        }

        const [taskRows] = await pool.query("SELECT task_id FROM tb_tasks WHERE task_id = ?", [req.params.taskId]);
        if (!taskRows[0]) return res.status(404).json({ message: "ไม่พบ task นี้" });

        const message_id = await generateDailyId("tb_task_chat_messages", "message_id", "MES");
        await pool.query(
            "INSERT INTO tb_task_chat_messages (message_id, task_id, user_id, message_text) VALUES (?, ?, ?, ?)",
            [message_id, req.params.taskId, req.user.user_id, message_text || null]
        );
        await saveChatImages("tb_task_chat_images", "MSI", message_id, req.files);

        res.status(201).json({ message_id });
    } catch (err) {
        next(err);
    }
}

// แชทรวมของโปรเจกต์ (ไม่ผูกกับ task ไหน) — คุยเรื่องภาพรวม ไม่ต้องเปิด task ก่อนถึงจะคุยได้
async function getForProject(req, res, next) {
    try {
        const [rows] = await pool.query(
            `SELECT c.message_id, c.project_id, c.user_id,
                    CONCAT(u.user_fname, ' ', u.user_lname) AS user_fullname, u.user_avatar_url,
                    c.message_text, c.message_created_at
             FROM tb_project_chat_messages c
             LEFT JOIN tb_users u ON u.user_id = c.user_id
             WHERE c.project_id = ?
             ORDER BY c.message_created_at ASC, c.message_id ASC`,
            [req.params.projectId]
        );
        const data = await attachImages("tb_project_chat_images", rows);
        await markRead("tb_project_chat_reads", "project_id", req.params.projectId, req.user.user_id);
        res.json({ data });
    } catch (err) {
        next(err);
    }
}

async function createForProject(req, res, next) {
    try {
        const message_text = (req.body.message_text || "").trim();
        const hasImages = (req.files ?? []).length > 0;
        if (!message_text && !hasImages) {
            return res.status(400).json({ message: "กรุณาพิมพ์ข้อความหรือแนบรูป" });
        }

        const [projectRows] = await pool.query("SELECT project_id FROM tb_projects WHERE project_id = ?", [req.params.projectId]);
        if (!projectRows[0]) return res.status(404).json({ message: "ไม่พบโปรเจกต์นี้" });

        const message_id = await generateDailyId("tb_project_chat_messages", "message_id", "PCM");
        await pool.query(
            "INSERT INTO tb_project_chat_messages (message_id, project_id, user_id, message_text) VALUES (?, ?, ?, ?)",
            [message_id, req.params.projectId, req.user.user_id, message_text || null]
        );
        await saveChatImages("tb_project_chat_images", "PCI", message_id, req.files);

        res.status(201).json({ message_id });
    } catch (err) {
        next(err);
    }
}

module.exports = { getForTask, create, getForProject, createForProject };
