// ลายเซ็นผู้ใช้ (2026-10-13 ขั้น 1A-2) — รับคำขอ → ตรวจ → เรียก service → ตอบ
// ตั้งได้เฉพาะเจ้าตัว (ต้องยืนยันรหัสผ่าน) · แอดมินยกเลิกของคนอื่นได้แต่ตั้งแทนไม่ได้ (sales-cycle หัวข้อ 6)
const bcrypt = require("bcryptjs");
const pool = require("../config/db");
const { AppError } = require("../utils/app-error");
const { withTransaction } = require("../utils/with-transaction");
const { prepareSignatureImage } = require("../utils/signature-image");
const { ACCESS_ERRORS, findUserAccess, canActOn } = require("../utils/role-access");
const signatureService = require("../services/signature.service");

const SIGNATURE_METHODS = new Set(["upload", "draw"]);

async function assertPasswordMatches(userId, password) {
    const wrongPassword = new AppError(400, "VALIDATION", "รหัสผ่านไม่ถูกต้อง", {
        password: "รหัสผ่านไม่ถูกต้อง — ใช้รหัสผ่านเดียวกับที่ใช้เข้าระบบ",
    });
    if (!password) {
        throw new AppError(400, "VALIDATION", "กรุณายืนยันรหัสผ่านก่อนบันทึกลายเซ็น", {
            password: "กรุณากรอกรหัสผ่านของคุณ",
        });
    }
    const [[user]] = await pool.query("SELECT user_password FROM tb_users WHERE user_id = ?", [userId]);
    const isMatch = user ? await bcrypt.compare(String(password), user.user_password) : false;
    if (!isMatch) throw wrongPassword;
}

// ─── ของตัวเอง ───────────────────────────────────────────────────────────────────────────────

async function getMine(req, res, next) {
    try {
        res.json({ signature: await signatureService.findActiveSignature(pool, req.user.user_id) });
    } catch (err) {
        next(err);
    }
}

// multipart: signature (ไฟล์ PNG/JPG/WebP — เซ็นบนจอก็ส่งเป็นไฟล์ PNG), method (upload/draw), password
async function replaceMine(req, res, next) {
    try {
        if (!req.file) {
            throw new AppError(400, "VALIDATION", "กรุณาเลือกรูปลายเซ็นหรือเซ็นบนจอ", { signature: "ยังไม่มีลายเซ็น" });
        }
        const method = String(req.body.method ?? "");
        if (!SIGNATURE_METHODS.has(method)) {
            throw new AppError(400, "VALIDATION", "วิธีได้ลายเซ็นต้องเป็น อัปโหลด หรือ เซ็นบนจอ", {
                method: "ไม่รู้จักวิธีนี้",
            });
        }
        await assertPasswordMatches(req.user.user_id, req.body.password);

        const image = await prepareSignatureImage(req.file.buffer);
        const signature = await withTransaction((conn) =>
            signatureService.replaceSignature(conn, req.user.user_id, { image, method }),
        );
        res.json({ signature });
    } catch (err) {
        next(err);
    }
}

async function revokeMine(req, res, next) {
    try {
        await withTransaction((conn) => signatureService.revokeSignature(conn, req.user.user_id, req.user.user_id));
        res.status(204).end();
    } catch (err) {
        next(err);
    }
}

// ─── ของผู้ใช้อื่น (หน้าแก้ไขผู้ใช้) ──────────────────────────────────────────────────────────────

async function findTargetUser(userId) {
    const target = await findUserAccess(userId);
    if (!target) throw new AppError(404, "USER_NOT_FOUND", "ไม่พบผู้ใช้นี้ อาจถูกลบไปแล้ว");
    return target;
}

async function getUserSignature(req, res, next) {
    try {
        await findTargetUser(req.params.id);
        res.json({ signature: await signatureService.findActiveSignature(pool, req.params.id) });
    } catch (err) {
        next(err);
    }
}

// ยกเลิกได้เฉพาะผู้ใช้ที่สิทธิ์ไม่เกินตัวเอง (risk-fixes R25) — เช่น พนักงานลาออก
async function revokeUserSignature(req, res, next) {
    try {
        const target = await findTargetUser(req.params.id);
        const isSelf = req.params.id === req.user.user_id;
        if (!isSelf && !canActOn(req.user.role_permission, target.permission)) {
            const { status, code, message } = ACCESS_ERRORS.userAboveActor;
            throw new AppError(status, code, message);
        }
        await withTransaction((conn) => signatureService.revokeSignature(conn, req.params.id, req.user.user_id));
        res.status(204).end();
    } catch (err) {
        next(err);
    }
}

// ─── รูปลายเซ็น ──────────────────────────────────────────────────────────────────────────────

// ทุกคนที่ login ดูได้ (ลายเซ็นอยู่บนใบเสนอราคาที่ทั้งทีมเห็น) · ห้าม cache ร่วม และห้ามเบราว์เซอร์เดาชนิดไฟล์
async function getImage(req, res, next) {
    try {
        const image = await signatureService.readSignatureFile(pool, String(req.params.id));
        res.set({
            "Content-Type": "image/png",
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, max-age=3600",
        });
        res.send(image);
    } catch (err) {
        next(err);
    }
}

module.exports = { getMine, replaceMine, revokeMine, getUserSignature, revokeUserSignature, getImage };
