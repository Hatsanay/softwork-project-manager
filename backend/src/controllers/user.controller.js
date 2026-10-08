const bcrypt = require("bcryptjs");
const { compressImage } = require("../utils/imageCompress");
const fs = require("fs/promises");
const path = require("path");
const pool = require("../config/db");
const { generateDailyId } = require("../utils/generateDailyId");
const { generateTempPassword } = require("../utils/generatePassword");
const { issueOtp, consumeOtp, markOtpUsed, OTP_TTL_MINUTES } = require("../utils/emailOtp");
const { sendEmailOtpEmail } = require("../utils/mailer");

const UPLOADS_DIR = path.join(__dirname, "..", "..", "uploads");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// ห้ามมี @ — login รับได้ทั้งอีเมลและชื่อผู้ใช้ในช่องเดียว ถ้าชื่อผู้ใช้มี @ ได้ อาจไปชนกับอีเมลของอีกคน
const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,50}$/;
const USERNAME_RULE = "ชื่อผู้ใช้ต้องยาว 3-50 ตัว ใช้ได้เฉพาะ a-z, 0-9, จุด, ขีดกลาง, ขีดล่าง";

// ค่าว่าง = null (ไม่ได้ระบุ) · ระบุมาแต่รูปแบบผิด = { error }
function parseEmail(raw) {
    const email = String(raw ?? "").trim();
    if (!email) return { value: null };
    if (!EMAIL_PATTERN.test(email) || email.length > 255) return { error: "รูปแบบอีเมลไม่ถูกต้อง" };
    return { value: email };
}

function parseUsername(raw) {
    const username = String(raw ?? "").trim();
    if (!username) return { value: null };
    if (!USERNAME_PATTERN.test(username)) return { error: USERNAME_RULE };
    return { value: username };
}

// unique key ไหนชน บอกให้ตรงจุด (อีเมลกับชื่อผู้ใช้ซ้ำได้ทั้งคู่)
function duplicateMessage(err) {
    return String(err.sqlMessage ?? "").includes("uq_user_username")
        ? "ชื่อผู้ใช้นี้ถูกใช้งานแล้ว"
        : "อีเมลนี้ถูกใช้งานแล้ว";
}

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

// ข้อมูลของ "ตัวเอง" เสมอ — ใช้ user_id จาก token เท่านั้น
// (เดิมรับ ?user_id= จาก query ทำให้ใครที่ login อยู่ก็ดูข้อมูลส่วนตัวของคนอื่นได้ frontend ยังส่ง query มาได้แต่ถูกเพิกเฉย)
async function me(req, res, next) {
    try {
        const [rows] = await pool.query(
            `SELECT u.user_id, u.user_username, u.user_fname, u.user_lname,
                    CONCAT(u.user_fname, ' ', u.user_lname) AS user_fullname,
                    u.user_email, u.user_phone, u.user_line_uid, u.user_whatsapp_no,
                    u.user_avatar_url, u.user_must_change_password, r.role_name
             FROM tb_users u
             LEFT JOIN tb_roles r ON r.role_id = u.user_role_id
             WHERE u.user_id = ?`,
            [req.user.user_id]
        );
        if (!rows[0]) return res.status(404).json({ message: "ไม่พบผู้ใช้งาน" });
        res.json(rows[0]);
    } catch (err) {
        next(err);
    }
}

// ไม่แตะอีเมลแล้ว — ผู้ใช้เปลี่ยนอีเมลตัวเองได้ทางเดียวคือยืนยันด้วย OTP (requestMyEmailOtp/verifyMyEmailOtp)
// ไม่งั้นการยืนยันอีเมลตอนเข้าระบบครั้งแรกไม่มีความหมาย (แก้เป็นอีเมลอะไรก็ได้ที่หน้าโปรไฟล์โดยไม่ต้องยืนยัน)
async function updateMyProfile(req, res, next) {
    try {
        const { user_fname, user_lname, user_phone, user_line_id, user_whatApp_no } = req.body;
        if (!user_fname || !user_lname) {
            return res.status(400).json({ message: "กรอกข้อมูลไม่ครบ" });
        }

        await pool.query(
            `UPDATE tb_users SET
                user_fname = ?, user_lname = ?, user_phone = ?,
                user_line_uid = ?, user_whatsapp_no = ?
             WHERE user_id = ?`,
            [
                user_fname, user_lname, user_phone || null,
                user_line_id || null, user_whatApp_no || null,
                req.user.user_id,
            ]
        );

        res.json({ message: "แก้ไขโปรไฟล์สำเร็จ" });
    } catch (err) {
        next(err);
    }
}

// ─── ยืนยันอีเมลของตัวเองด้วย OTP (onboarding ครั้งแรก / เปลี่ยนอีเมลที่หน้าโปรไฟล์) ────────────────
const VERIFY_EMAIL_PURPOSE = "verify_email";

async function requestMyEmailOtp(req, res, next) {
    try {
        const email = parseEmail(req.body.email);
        if (email.error) return res.status(400).json({ message: email.error });
        if (!email.value) return res.status(400).json({ message: "กรุณากรอกอีเมล" });

        // อีเมลที่ผู้ใช้คนอื่นใช้อยู่แล้ว ไม่ต้องส่งรหัสไปให้เปลืองเปล่า (ยืนยันผ่านไปก็บันทึกไม่ได้อยู่ดีเพราะ unique)
        const [taken] = await pool.query(
            "SELECT user_id FROM tb_users WHERE user_email = ? AND user_id != ?",
            [email.value, req.user.user_id]
        );
        if (taken[0]) return res.status(409).json({ message: "อีเมลนี้ถูกใช้งานแล้ว" });

        const [[me]] = await pool.query(
            "SELECT CONCAT(user_fname, ' ', user_lname) AS fullname FROM tb_users WHERE user_id = ?",
            [req.user.user_id]
        );
        const { code, otp_id } = await issueOtp({ email: email.value, purpose: VERIFY_EMAIL_PURPOSE, userId: req.user.user_id });

        try {
            await sendEmailOtpEmail({ to: email.value, code, fullname: me?.fullname, expiresMinutes: OTP_TTL_MINUTES });
        } catch (mailErr) {
            // ส่งไม่ออก = รหัสนี้ไม่มีใครได้รับ ตัดทิ้งเลย กันนับเป็นโควตา "รหัสที่ยังใช้ได้" ค้างไว้เปล่าๆ
            await markOtpUsed(otp_id);
            if (mailErr.message === "SMTP_NOT_CONFIGURED") {
                return res.status(503).json({ message: "ระบบยังไม่ได้ตั้งค่าอีเมล (SMTP) กรุณาติดต่อผู้ดูแลระบบ" });
            }
            console.error("[user.controller] sendEmailOtpEmail failed:", mailErr.message);
            return res.status(502).json({ message: "ส่งอีเมลไม่สำเร็จ กรุณาตรวจสอบอีเมลแล้วลองใหม่" });
        }

        res.json({ message: `ส่งรหัสยืนยันไปที่ ${email.value} แล้ว`, expires_minutes: OTP_TTL_MINUTES });
    } catch (err) {
        if (err.status === 429) return res.status(429).json({ message: err.message });
        next(err);
    }
}

async function verifyMyEmailOtp(req, res, next) {
    try {
        const email = parseEmail(req.body.email);
        if (email.error || !email.value) return res.status(400).json({ message: email.error ?? "กรุณากรอกอีเมล" });
        if (!/^\d{6}$/.test(String(req.body.otp ?? "").trim())) {
            return res.status(400).json({ message: "กรุณากรอกรหัสยืนยัน 6 หลัก" });
        }

        let otpId;
        try {
            otpId = await consumeOtp({ email: email.value, purpose: VERIFY_EMAIL_PURPOSE, userId: req.user.user_id, code: req.body.otp });
        } catch (otpErr) {
            return res.status(otpErr.status ?? 400).json({ message: otpErr.message });
        }

        try {
            await pool.query("UPDATE tb_users SET user_email = ? WHERE user_id = ?", [email.value, req.user.user_id]);
        } catch (dbErr) {
            // อีกคนยืนยันอีเมลเดียวกันสำเร็จไปก่อนระหว่างที่รอกรอกรหัส — ไม่ตัดรหัสทิ้ง แต่บอกตรงๆ ว่าใช้ไม่ได้
            if (dbErr.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "อีเมลนี้ถูกใช้งานแล้ว" });
            throw dbErr;
        }
        await markOtpUsed(otpId);

        res.json({ message: "ยืนยันอีเมลสำเร็จ", user_email: email.value });
    } catch (err) {
        next(err);
    }
}

async function getAll(req, res, next) {
    try {
        const limit = Number(req.query.limit) || 10;
        const offset = Number(req.query.offset) || 0;
        const search = `%${req.query.search ?? ""}%`;

        const [rows] = await pool.query(
            `SELECT u.user_id, u.user_username, CONCAT(u.user_fname, ' ', u.user_lname) AS by_fullname,
                    u.user_email, u.user_phone,
                    u.user_created_at, u.user_updated_at,
                    r.role_name, r.role_type
             FROM tb_users u
             LEFT JOIN tb_roles r ON r.role_id = u.user_role_id
             WHERE u.user_fname LIKE ? OR u.user_lname LIKE ? OR u.user_email LIKE ? OR u.user_username LIKE ?
             ORDER BY u.user_id DESC
             LIMIT ? OFFSET ?`,
            [search, search, search, search, limit, offset]
        );
        const [[{ total }]] = await pool.query(
            `SELECT COUNT(*) AS total FROM tb_users
             WHERE user_fname LIKE ? OR user_lname LIKE ? OR user_email LIKE ? OR user_username LIKE ?`,
            [search, search, search, search]
        );

        res.json({ data: rows, total });
    } catch (err) {
        next(err);
    }
}

async function getOne(req, res, next) {
    try {
        const [rows] = await pool.query(
            `SELECT u.user_id, u.user_username, u.user_fname, u.user_lname,
                    CONCAT(u.user_fname, ' ', u.user_lname) AS user_fullname,
                    u.user_email, u.user_phone, u.user_line_uid, u.user_whatsapp_no,
                    u.user_avatar_url, u.user_role_id, u.user_status, u.user_must_change_password,
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
            user_fname, user_lname, user_phone,
            user_line_id, user_whatApp_no, user_role_id,
        } = req.body;

        if (!user_fname || !user_lname) {
            return res.status(400).json({ message: "กรอกข้อมูลไม่ครบ" });
        }
        // อีเมลไม่บังคับ — ไม่ใส่ = ผู้ใช้ยืนยันอีเมลเองด้วย OTP ตอนเข้าระบบครั้งแรก (login ด้วยชื่อผู้ใช้ไปก่อน)
        const email = parseEmail(req.body.user_email);
        if (email.error) return res.status(400).json({ message: email.error });
        const username = parseUsername(req.body.user_username);
        if (username.error) return res.status(400).json({ message: username.error });

        // ไม่รับรหัสผ่านจากฟอร์มแล้ว — gen รหัสผ่านชั่วคราวให้แทน แล้วบังคับเปลี่ยนตอน login ครั้งแรก
        const temp_password = generateTempPassword();
        const passwordHash = await bcrypt.hash(temp_password, 10);
        const user_id = await generateDailyId("tb_users", "user_id", "USE");
        // ไม่ระบุชื่อผู้ใช้ = ใช้รหัสผู้ใช้ไปก่อน (ไม่ซ้ำแน่นอน) แอดมินแก้เป็นชื่อที่จำง่ายกว่าทีหลังได้ (เหมือน fasttiw)
        const user_username = username.value ?? user_id;

        await pool.query(
            `INSERT INTO tb_users
                (user_id, user_username, user_fname, user_lname, user_email, user_password, user_phone,
                 user_line_uid, user_whatsapp_no, user_role_id, user_must_change_password)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
            [
                user_id, user_username, user_fname, user_lname, email.value, passwordHash, user_phone || null,
                user_line_id || null, user_whatApp_no || null, user_role_id || null,
            ]
        );

        res.status(201).json({ user_id, user_username, user_email: email.value, temp_password });
    } catch (err) {
        if (err.code === "ER_DUP_ENTRY") {
            return res.status(409).json({ message: duplicateMessage(err) });
        }
        next(err);
    }
}

async function update(req, res, next) {
    try {
        const {
            user_fname, user_lname, user_phone,
            user_line_id, user_whatApp_no, user_role_id, user_status,
        } = req.body;

        if (!user_fname || !user_lname) {
            return res.status(400).json({ message: "กรอกข้อมูลไม่ครบ" });
        }
        // ล้างอีเมลทิ้งได้ (= ผู้ใช้จะถูกขอให้ยืนยันอีเมลใหม่ตอนเข้าระบบครั้งถัดไป)
        const email = parseEmail(req.body.user_email);
        if (email.error) return res.status(400).json({ message: email.error });
        const username = parseUsername(req.body.user_username);
        if (username.error) return res.status(400).json({ message: username.error });

        const [result] = await pool.query(
            `UPDATE tb_users SET
                user_username = COALESCE(?, user_username),
                user_fname = ?, user_lname = ?, user_email = ?, user_phone = ?,
                user_line_uid = ?, user_whatsapp_no = ?, user_role_id = ?, user_status = ?
             WHERE user_id = ?`,
            [
                username.value,
                user_fname, user_lname, email.value, user_phone || null,
                user_line_id || null, user_whatApp_no || null, user_role_id || null,
                user_status === "inactive" ? "inactive" : "active",
                req.params.id,
            ]
        );
        if (result.affectedRows === 0) return res.status(404).json({ message: "ไม่พบผู้ใช้งาน" });

        res.json({ message: "แก้ไขผู้ใช้งานสำเร็จ" });
    } catch (err) {
        if (err.code === "ER_DUP_ENTRY") {
            return res.status(409).json({ message: duplicateMessage(err) });
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

    // ครอปเป็นสี่เหลี่ยม 256px แล้วบีบให้เล็กที่สุดโดยยังคมชัด (วิธีบีบดู utils/imageCompress.js)
    // แยกโฟลเดอร์ avatars/ ออกจากรูปประเภทอื่น (issue/chat) กันโฟลเดอร์ uploads/ รวมทุกอย่างปนกันจนรกตอนไฟล์เยอะขึ้น
    const { data, ext } = await compressImage(file.buffer, { square: 256 });
    const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}.${ext}`;
    await fs.mkdir(path.join(UPLOADS_DIR, "avatars"), { recursive: true });
    await fs.writeFile(path.join(UPLOADS_DIR, "avatars", filename), data);

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
    changeOwnPassword, resetPassword, updateMyProfile, requestMyEmailOtp, verifyMyEmailOtp,
};
