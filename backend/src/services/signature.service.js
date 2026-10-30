// ลายเซ็นผู้ใช้ (2026-10-13 ขั้น 1A-2 — docs/plans/2026-10-08-sales-cycle.md หัวข้อ 6)
//
// ใช้งานได้ทีละ 1 ฉบับต่อคน (แถวที่ sig_revoked_at ว่าง) · ตั้งใหม่ = ยกเลิกฉบับเดิมแล้วเพิ่มฉบับใหม่ใน transaction เดียว
// ไม่ลบไฟล์/แถวเก่าเด็ดขาด — ใบเสนอราคาที่อนุมัติแล้วอ้างฉบับที่ใช้ตอนนั้น (qt_creator_signature_id / qt_approver_signature_id)
// ไฟล์อยู่นอกโฟลเดอร์ /uploads ที่เปิดสาธารณะ — ส่งผ่าน GET /signatures/:id ที่ต้อง login เท่านั้น
const fs = require("fs/promises");
const path = require("path");
const { AppError } = require("../utils/app-error");
const { generateDailyId } = require("../utils/generateDailyId");

const DEFAULT_STORAGE_DIR = path.join(__dirname, "..", "..", "storage", "signatures");
const SIGNATURE_ID_PATTERN = /^SIG\d{15}$/;

// เทสต์ชี้ไปโฟลเดอร์ชั่วคราวได้ด้วย SIGNATURE_STORAGE_DIR
function storageDir() {
    return process.env.SIGNATURE_STORAGE_DIR?.trim() || DEFAULT_STORAGE_DIR;
}

/**
 * ลายเซ็นที่ใช้งานอยู่ของผู้ใช้ (ไม่มี = null)
 * @param {import("mysql2/promise").Pool | import("mysql2/promise").PoolConnection} conn
 * @param {string} userId
 */
async function findActiveSignature(conn, userId) {
    const [[signature]] = await conn.query(
        `SELECT sig_id, sig_method, sig_created_at
         FROM tb_user_signatures
         WHERE sig_user_id = ? AND sig_revoked_at IS NULL
         ORDER BY sig_created_at DESC
         LIMIT 1`,
        [userId],
    );
    return signature ?? null;
}

// ล็อกแถวผู้ใช้ — สองแท็บกดบันทึก/ยกเลิกพร้อมกัน ต้องไม่เกิดลายเซ็นใช้งานอยู่ 2 ฉบับ
async function lockUser(conn, userId) {
    const [[user]] = await conn.query("SELECT user_id FROM tb_users WHERE user_id = ? FOR UPDATE", [userId]);
    if (!user) throw new AppError(404, "USER_NOT_FOUND", "ไม่พบผู้ใช้นี้ อาจถูกลบไปแล้ว");
}

async function revokeActive(conn, userId, revokedBy) {
    const [result] = await conn.query(
        "UPDATE tb_user_signatures SET sig_revoked_at = NOW(), sig_revoked_by = ? WHERE sig_user_id = ? AND sig_revoked_at IS NULL",
        [revokedBy, userId],
    );
    return result.affectedRows;
}

/**
 * ตั้งลายเซ็นใหม่ของตัวเอง (ตรวจรหัสผ่านที่ controller แล้ว)
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {string} userId
 * @param {{ image: Buffer, method: "upload" | "draw" }} signature รูปที่ผ่าน prepareSignatureImage แล้ว
 */
async function replaceSignature(conn, userId, { image, method }) {
    await lockUser(conn, userId);
    await revokeActive(conn, userId, userId);

    const signatureId = await generateDailyId("tb_user_signatures", "sig_id", "SIG");
    const fileName = `${signatureId}.png`;
    // เขียนไฟล์ก่อนบันทึกแถว — ถ้าบันทึกแถวพลาด ไฟล์ค้างเปล่าๆ ไม่มีใครอ้าง (ดีกว่าแถวที่อ้างไฟล์ที่ไม่มี)
    await fs.mkdir(storageDir(), { recursive: true });
    await fs.writeFile(path.join(storageDir(), fileName), image);

    await conn.query(
        "INSERT INTO tb_user_signatures (sig_id, sig_user_id, sig_file_path, sig_method) VALUES (?, ?, ?, ?)",
        [signatureId, userId, fileName, method],
    );
    return findActiveSignature(conn, userId);
}

/**
 * ยกเลิกลายเซ็นที่ใช้งานอยู่ (เจ้าตัว หรือแอดมินกรณีพนักงานลาออก) — ไฟล์และแถวยังอยู่ เอกสารเก่ายังแสดงได้
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {string} userId เจ้าของลายเซ็น
 * @param {string} revokedBy คนที่กดยกเลิก
 */
async function revokeSignature(conn, userId, revokedBy) {
    await lockUser(conn, userId);
    const revokedCount = await revokeActive(conn, userId, revokedBy);
    if (revokedCount === 0) {
        throw new AppError(
            404,
            "NO_ACTIVE_SIGNATURE",
            "ผู้ใช้นี้ไม่มีลายเซ็นที่ใช้งานอยู่ อาจถูกยกเลิกไปแล้ว · โหลดหน้าใหม่",
        );
    }
}

/**
 * อ่านไฟล์ลายเซ็นตาม id (รวมฉบับที่ยกเลิกแล้ว — เอกสารเก่ายังต้องแสดง)
 * @param {import("mysql2/promise").Pool} conn
 * @param {string} signatureId
 * @returns {Promise<Buffer>}
 */
async function readSignatureFile(conn, signatureId) {
    const notFound = new AppError(404, "SIGNATURE_NOT_FOUND", "ไม่พบลายเซ็นนี้");
    if (!SIGNATURE_ID_PATTERN.test(signatureId)) throw notFound;

    const [[signature]] = await conn.query("SELECT sig_file_path FROM tb_user_signatures WHERE sig_id = ?", [
        signatureId,
    ]);
    if (!signature) throw notFound;
    // path.basename กันชื่อไฟล์ในฐานข้อมูลที่พาออกนอกโฟลเดอร์ (../)
    try {
        return await fs.readFile(path.join(storageDir(), path.basename(signature.sig_file_path)));
    } catch {
        throw new AppError(404, "SIGNATURE_FILE_MISSING", "ไม่พบไฟล์ลายเซ็นในเซิร์ฟเวอร์ · แจ้งผู้ดูแลระบบ");
    }
}

module.exports = { findActiveSignature, replaceSignature, revokeSignature, readSignatureFile };
