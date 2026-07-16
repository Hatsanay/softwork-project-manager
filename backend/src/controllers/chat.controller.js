const sharp = require("sharp");
const path = require("path");
const pool = require("../config/db");
const { generateDailyId } = require("../utils/generateDailyId");

const UPLOADS_DIR = path.join(__dirname, "..", "..", "uploads");

// สมาชิกโปรเจกต์ทุกคนแชทได้ ไม่ต้องมีสิทธิ์เฉพาะ — เช็คแค่ requireProjectMember ที่ route ก็พอ

async function saveChatImages(messageId, files) {
    for (const file of files ?? []) {
        const filename = `chat-${Date.now()}-${Math.round(Math.random() * 1e9)}.webp`;
        await sharp(file.buffer)
            .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
            .webp({ quality: 78 })
            .toFile(path.join(UPLOADS_DIR, filename));

        const image_id = await generateDailyId("tb_task_chat_images", "image_id", "MSI");
        await pool.query(
            "INSERT INTO tb_task_chat_images (image_id, message_id, image_url) VALUES (?, ?, ?)",
            [image_id, messageId, `/uploads/${filename}`]
        );
    }
}

async function attachImages(messages) {
    if (messages.length === 0) return messages;
    const [rows] = await pool.query(
        `SELECT image_id, message_id, image_url
         FROM tb_task_chat_images
         WHERE message_id IN (?)
         ORDER BY image_created_at ASC`,
        [messages.map((m) => m.message_id)]
    );
    return messages.map((m) => ({ ...m, images: rows.filter((r) => r.message_id === m.message_id) }));
}

// ดูข้อความ = ถือว่าอ่านแล้ว ไม่มี endpoint mark-read แยกต่างหาก
// ใช้ NOW(3) ไม่ใช่ NOW() เฉยๆ — ต้องมีความละเอียดระดับมิลลิวินาที ไม่งั้นข้อความที่มาถึงในวินาทีเดียวกับตอนอ่าน
// จะเทียบ message_created_at > last_read_at แล้วเท่ากันพอดี (ปัดเป็นวินาทีเดียวกัน) กลายเป็นไม่นับว่ายังไม่อ่าน
async function markRead(taskId, userId) {
    await pool.query(
        `INSERT INTO tb_task_chat_reads (task_id, user_id, last_read_at) VALUES (?, ?, NOW(3))
         ON DUPLICATE KEY UPDATE last_read_at = VALUES(last_read_at)`,
        [taskId, userId]
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
        const data = await attachImages(rows);
        await markRead(req.params.taskId, req.user.user_id);
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
        await saveChatImages(message_id, req.files);

        res.status(201).json({ message_id });
    } catch (err) {
        next(err);
    }
}

module.exports = { getForTask, create };
