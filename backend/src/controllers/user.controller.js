const bcrypt = require("bcryptjs");
const sharp = require("sharp");
const fs = require("fs/promises");
const path = require("path");
const pool = require("../config/db");
const { generateDailyId } = require("../utils/generateDailyId");
const { generateTempPassword } = require("../utils/generatePassword");

const UPLOADS_DIR = path.join(__dirname, "..", "..", "uploads");

// ใช้เป็น dropdown เลือกผู้ใช้งาน (เช่น เพิ่มสมาชิกเข้าโปรเจกต์) เลยล็อกแค่ requireAuth
// ไม่ใช่ usersManagement เพราะ PM ทั่วไปที่ไม่มีสิทธิ์จัดการผู้ใช้งานระบบก็ต้องเพิ่มสมาชิกได้
async function forSelect(req, res, next) {
    try {
        const search = `%${req.query.search ?? ""}%`;
        const [rows] = await pool.query(
            `SELECT user_id, CONCAT(user_fname, ' ', user_lname) AS user_fullname
             FROM tb_users
             WHERE user_status = 'active' AND (user_fname LIKE ? OR user_lname LIKE ? OR user_email LIKE ?)
             ORDER BY user_fname
             LIMIT 20`,
            [search, search, search]
        );
        res.json(rows);
    } catch (err) {
        next(err);
    }
}

async function me(req, res, next) {
    try {
        const user_id = req.query.user_id;
        const [rows] = await pool.query(
            `SELECT u.user_id, u.user_fname, u.user_lname,
                    CONCAT(u.user_fname, ' ', u.user_lname) AS user_fullname,
                    u.user_email, u.user_phone, u.user_line_uid, u.user_whatsapp_no,
                    u.user_avatar_url, u.user_must_change_password, r.role_name
             FROM tb_users u
             LEFT JOIN tb_roles r ON r.role_id = u.user_role_id
             WHERE u.user_id = ?`,
            [user_id]
        );
        if (!rows[0]) return res.status(404).json({ message: "ไม่พบผู้ใช้งาน" });
        res.json(rows[0]);
    } catch (err) {
        next(err);
    }
}

async function updateMyProfile(req, res, next) {
    try {
        const { user_fname, user_lname, user_email, user_phone, user_line_id, user_whatApp_no } = req.body;
        if (!user_fname || !user_lname || !user_email) {
            return res.status(400).json({ message: "กรอกข้อมูลไม่ครบ" });
        }

        await pool.query(
            `UPDATE tb_users SET
                user_fname = ?, user_lname = ?, user_email = ?, user_phone = ?,
                user_line_uid = ?, user_whatsapp_no = ?
             WHERE user_id = ?`,
            [
                user_fname, user_lname, user_email, user_phone || null,
                user_line_id || null, user_whatApp_no || null,
                req.user.user_id,
            ]
        );

        res.json({ message: "แก้ไขโปรไฟล์สำเร็จ" });
    } catch (err) {
        if (err.code === "ER_DUP_ENTRY") {
            return res.status(409).json({ message: "อีเมลนี้ถูกใช้งานแล้ว" });
        }
        next(err);
    }
}

async function getAll(req, res, next) {
    try {
        const limit = Number(req.query.limit) || 10;
        const offset = Number(req.query.offset) || 0;
        const search = `%${req.query.search ?? ""}%`;

        const [rows] = await pool.query(
            `SELECT u.user_id, CONCAT(u.user_fname, ' ', u.user_lname) AS by_fullname,
                    u.user_email, u.user_phone,
                    u.user_created_at, u.user_updated_at,
                    r.role_name, r.role_type
             FROM tb_users u
             LEFT JOIN tb_roles r ON r.role_id = u.user_role_id
             WHERE u.user_fname LIKE ? OR u.user_lname LIKE ? OR u.user_email LIKE ?
             ORDER BY u.user_id DESC
             LIMIT ? OFFSET ?`,
            [search, search, search, limit, offset]
        );
        const [[{ total }]] = await pool.query(
            `SELECT COUNT(*) AS total FROM tb_users
             WHERE user_fname LIKE ? OR user_lname LIKE ? OR user_email LIKE ?`,
            [search, search, search]
        );

        res.json({ data: rows, total });
    } catch (err) {
        next(err);
    }
}

async function getOne(req, res, next) {
    try {
        const [rows] = await pool.query(
            `SELECT u.user_id, u.user_fname, u.user_lname,
                    CONCAT(u.user_fname, ' ', u.user_lname) AS user_fullname,
                    u.user_email, u.user_phone, u.user_line_uid, u.user_whatsapp_no,
                    u.user_avatar_url, u.user_role_id, u.user_status,
                    u.user_last_login_at, u.user_created_at, u.user_updated_at,
                    r.role_name
             FROM tb_users u
             LEFT JOIN tb_roles r ON r.role_id = u.user_role_id
             WHERE u.user_id = ?`,
            [req.params.id]
        );
        if (!rows[0]) return res.status(404).json({ message: "ไม่พบผู้ใช้งาน" });
        res.json(rows[0]);
    } catch (err) {
        next(err);
    }
}

async function create(req, res, next) {
    try {
        const {
            user_fname, user_lname, user_email, user_phone,
            user_line_id, user_whatApp_no, user_role_id,
        } = req.body;

        if (!user_fname || !user_lname || !user_email) {
            return res.status(400).json({ message: "กรอกข้อมูลไม่ครบ" });
        }

        // ไม่รับรหัสผ่านจากฟอร์มแล้ว — gen รหัสผ่านชั่วคราวให้แทน แล้วบังคับเปลี่ยนตอน login ครั้งแรก
        const temp_password = generateTempPassword();
        const passwordHash = await bcrypt.hash(temp_password, 10);
        const user_id = await generateDailyId("tb_users", "user_id", "USE");

        await pool.query(
            `INSERT INTO tb_users
                (user_id, user_fname, user_lname, user_email, user_password, user_phone,
                 user_line_uid, user_whatsapp_no, user_role_id, user_must_change_password)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
            [
                user_id, user_fname, user_lname, user_email, passwordHash, user_phone || null,
                user_line_id || null, user_whatApp_no || null, user_role_id || null,
            ]
        );

        res.status(201).json({ user_id, temp_password });
    } catch (err) {
        if (err.code === "ER_DUP_ENTRY") {
            return res.status(409).json({ message: "อีเมลนี้ถูกใช้งานแล้ว" });
        }
        next(err);
    }
}

async function update(req, res, next) {
    try {
        const {
            user_fname, user_lname, user_email, user_phone,
            user_line_id, user_whatApp_no, user_role_id, user_status,
        } = req.body;

        await pool.query(
            `UPDATE tb_users SET
                user_fname = ?, user_lname = ?, user_email = ?, user_phone = ?,
                user_line_uid = ?, user_whatsapp_no = ?, user_role_id = ?, user_status = ?
             WHERE user_id = ?`,
            [
                user_fname, user_lname, user_email, user_phone || null,
                user_line_id || null, user_whatApp_no || null, user_role_id || null,
                user_status === "inactive" ? "inactive" : "active",
                req.params.id,
            ]
        );

        res.json({ message: "แก้ไขผู้ใช้งานสำเร็จ" });
    } catch (err) {
        if (err.code === "ER_DUP_ENTRY") {
            return res.status(409).json({ message: "อีเมลนี้ถูกใช้งานแล้ว" });
        }
        next(err);
    }
}

async function remove(req, res, next) {
    try {
        await pool.query("DELETE FROM tb_users WHERE user_id = ?", [req.params.id]);
        res.status(204).end();
    } catch (err) {
        next(err);
    }
}

async function changeOwnPassword(req, res, next) {
    try {
        const { new_password } = req.body;
        if (!new_password || new_password.length < 8) {
            return res.status(400).json({ message: "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร" });
        }

        const passwordHash = await bcrypt.hash(new_password, 10);
        await pool.query(
            "UPDATE tb_users SET user_password = ?, user_must_change_password = FALSE WHERE user_id = ?",
            [passwordHash, req.user.user_id]
        );

        res.json({ message: "เปลี่ยนรหัสผ่านสำเร็จ" });
    } catch (err) {
        next(err);
    }
}

async function resetPassword(req, res, next) {
    try {
        const temp_password = generateTempPassword();
        const passwordHash = await bcrypt.hash(temp_password, 10);

        const [result] = await pool.query(
            "UPDATE tb_users SET user_password = ?, user_must_change_password = TRUE WHERE user_id = ?",
            [passwordHash, req.params.id]
        );
        if (result.affectedRows === 0) return res.status(404).json({ message: "ไม่พบผู้ใช้งาน" });

        res.json({ temp_password });
    } catch (err) {
        next(err);
    }
}

async function saveAvatarForUser(userId, file) {
    const [rows] = await pool.query("SELECT user_avatar_url FROM tb_users WHERE user_id = ?", [
        userId,
    ]);
    if (!rows[0]) {
        const err = new Error("ไม่พบผู้ใช้งาน");
        err.status = 404;
        throw err;
    }
    const oldAvatarUrl = rows[0].user_avatar_url;

    // resize + บีบเป็น WebP คุณภาพต่ำสุดที่ยังใช้เป็นรูปโปรไฟล์ได้ ให้ไฟล์เล็กที่สุด
    // แยกโฟลเดอร์ avatars/ ออกจากรูปประเภทอื่น (issue/chat) กันโฟลเดอร์ uploads/ รวมทุกอย่างปนกันจนรกตอนไฟล์เยอะขึ้น
    const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}.webp`;
    await fs.mkdir(path.join(UPLOADS_DIR, "avatars"), { recursive: true });
    await sharp(file.buffer)
        .resize(256, 256, { fit: "cover" })
        .webp({ quality: 70 })
        .toFile(path.join(UPLOADS_DIR, "avatars", filename));

    const user_avatar_url = `/uploads/avatars/${filename}`;
    await pool.query("UPDATE tb_users SET user_avatar_url = ? WHERE user_id = ?", [
        user_avatar_url,
        userId,
    ]);

    // ลบไฟล์รูปเก่าทิ้ง ไม่ให้ค้างอยู่ใน uploads/ เปล่าๆ หลังเปลี่ยนรูปใหม่
    // ใช้ path ที่เก็บไว้ตรงๆ (ตัด "/uploads/" นำหน้าออก) ไม่ใช้ path.basename เฉยๆ เพราะจะทิ้งชื่อโฟลเดอร์ย่อยไป หาไฟล์ไม่เจอ
    if (oldAvatarUrl) {
        await fs.unlink(path.join(UPLOADS_DIR, oldAvatarUrl.replace(/^\/uploads\//, ""))).catch(() => {});
    }

    return user_avatar_url;
}

async function uploadImage(req, res, next) {
    try {
        if (!req.file) return res.status(400).json({ message: "ไม่พบไฟล์รูปภาพ" });
        const user_avatar_url = await saveAvatarForUser(req.params.id, req.file);
        res.json({ user_avatar_url });
    } catch (err) {
        next(err);
    }
}

async function uploadMyImage(req, res, next) {
    try {
        if (!req.file) return res.status(400).json({ message: "ไม่พบไฟล์รูปภาพ" });
        const user_avatar_url = await saveAvatarForUser(req.user.user_id, req.file);
        res.json({ user_avatar_url });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    me, forSelect, getAll, getOne, create, update, remove, uploadImage, uploadMyImage,
    changeOwnPassword, resetPassword, updateMyProfile,
};
