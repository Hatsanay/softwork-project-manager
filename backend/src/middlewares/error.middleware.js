const crypto = require("crypto");
const multer = require("multer");
const pool = require("../config/db");

function notFound(req, res) {
    res.status(404).json({ message: "ไม่พบ endpoint นี้" });
}

const MULTER_MESSAGES = {
    LIMIT_FILE_SIZE: "ไฟล์รูปใหญ่เกินไป (สูงสุด 10 MB)",
    LIMIT_FILE_COUNT: "แนบรูปได้สูงสุด 5 รูป",
    LIMIT_UNEXPECTED_FILE: "แนบรูปได้สูงสุด 5 รูป",
};

// เก็บ error 5xx ลง tb_error_logs (2026-10-08) — เดิมไปจบที่ console.error ซึ่งบน production หายไปใน log ของ Passenger
// ที่ไม่มีใครเปิดดู · จัดกลุ่มด้วย fingerprint = ข้อความ + บรรทัดแรกของ stack ที่ชี้ไปโค้ดเรา: error เดิมจากจุดเดิมเกิดร้อยครั้ง
// ยุบเป็นแถวเดียวพร้อมตัวนับ (แบบเดียวกับ fasttiw) · รายละเอียดรายครั้ง (ใคร/คำขอไหน) ดูได้จาก tb_audit_logs ผ่าน request id
// เขียนแบบ fire-and-forget + กลืน error — ห้ามให้ตัวบันทึกพังซ้อน error เดิม (DB ล่มคือเคสที่ต้องรอดที่สุด)
function recordError(err, req, status) {
    const message = String(err?.message ?? err ?? "unknown").slice(0, 500);
    const stack = String(err?.stack ?? "").slice(0, 8000);
    const origin = stack.split("\n").find((l) => l.includes("/src/") || l.includes("\\src\\")) ?? stack.split("\n")[1] ?? "";
    const fingerprint = crypto.createHash("sha1").update(`${message}|${origin.trim()}`).digest("hex");
    const path = req.originalUrl.split("?")[0].slice(0, 255);
    pool.query(
        `INSERT INTO tb_error_logs
            (err_fingerprint, err_message, err_stack, err_status, err_method, err_path,
             err_last_request_id, err_last_user_id, err_last_ip)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            err_count = err_count + 1, err_last_seen = CURRENT_TIMESTAMP(3), err_stack = VALUES(err_stack),
            err_status = VALUES(err_status), err_method = VALUES(err_method), err_path = VALUES(err_path),
            err_last_request_id = VALUES(err_last_request_id), err_last_user_id = VALUES(err_last_user_id),
            err_last_ip = VALUES(err_last_ip)`,
        [fingerprint, message, stack, status, req.method, path, req.id ?? null, req.user?.user_id ?? null, String(req.ip ?? "").slice(0, 45) || null]
    ).catch((e) => console.error("[error-log] บันทึกไม่สำเร็จ:", e.message));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
    console.error(`[${req.id ?? "-"}]`, err);

    // error จากการอัปโหลด (ขนาด/จำนวนไฟล์เกิน หรือไม่ใช่ไฟล์รูป) เป็นความผิดของ input ไม่ใช่เซิร์ฟเวอร์พัง
    if (err instanceof multer.MulterError) {
        return res.status(400).json({ message: MULTER_MESSAGES[err.code] ?? "อัปโหลดไฟล์ไม่สำเร็จ" });
    }
    if (err.isUploadValidation) {
        return res.status(400).json({ message: err.message });
    }
    // JSON body พังหรือใหญ่เกิน (มาจาก express.json)
    if (err.type === "entity.parse.failed" || err.type === "entity.too.large") {
        return res.status(err.status ?? 400).json({ message: "ข้อมูลที่ส่งมาไม่ถูกต้อง" });
    }

    // error ที่ตั้ง status เองไว้ (4xx) ส่งข้อความต่อได้ แต่ 500 ห้ามส่ง err.message ออกไป
    // เพราะอาจเป็นข้อความภายในเช่น SQL error ที่เปิดเผยชื่อตาราง/คอลัมน์ — ดูรายละเอียดจริงใน error log แทน
    const status = err.status ?? 500;
    if (status < 500) {
        return res.status(status).json({ message: err.message ?? "คำขอไม่ถูกต้อง" });
    }
    recordError(err, req, status);
    // request_id ให้ผู้ใช้แจ้งผู้ดูแลได้ แล้วผู้ดูแลค้นเจอเหตุการณ์นั้นในหน้า log ได้ทันที
    res.status(status).json({ message: "เกิดข้อผิดพลาดที่เซิร์ฟเวอร์", request_id: req.id ?? null });
}

module.exports = { notFound, errorHandler };
