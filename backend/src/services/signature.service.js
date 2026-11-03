// ลายเซ็นผู้ใช้ (2026-10-13 ขั้น 1A-2 — docs/plans/2026-10-08-sales-cycle.md หัวข้อ 6)
//
// ใช้งานได้ทีละ 1 ฉบับต่อคน (แถวที่ sig_revoked_at ว่าง) · ตั้งใหม่ = ยกเลิกฉบับเดิมแล้วเพิ่มฉบับใหม่ใน transaction เดียว
// ไม่ลบไฟล์/แถวเก่าเด็ดขาด — ใบเสนอราคาที่อนุมัติแล้วอ้างฉบับที่ใช้ตอนนั้น (qt_creator_signature_id / qt_approver_signature_id)
// ไฟล์อยู่นอกโฟลเดอร์ /uploads ที่เปิดสาธารณะ — ส่งผ่าน GET /signatures/:id ที่ต้อง login และเปิดได้ตาม canOpenSignature
const fs = require("fs/promises");
const path = require("path");
const { AppError } = require("../utils/app-error");
const { generateDailyId } = require("../utils/generateDailyId");
const { hasBit } = require("../utils/permissions");

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
 * ผู้ขอเปิดรูปลายเซ็นนี้ได้ไหม (2026-11-02 · docs/plans/2026-11-02-permission-audit.md A-3)
 * เดิมแค่ login ก็เปิดได้ทุกรูป (เลข SIG เรียงตามวัน เดาได้) · ตอนนี้ได้เมื่อ
 * - เป็นลายเซ็นของตัวเอง หรือมีสิทธิ์ดูผู้ใช้ (หน้าจัดการผู้ใช้แสดงลายเซ็น)
 * - ลายเซ็นอยู่บนเอกสารที่ผู้ขอดูได้: ใบเสนอราคา (viewQuotations) · ใบแจ้งหนี้/ใบลดหนี้ (viewInvoices)
 */
async function canOpenSignature(conn, signature, user) {
    if (signature.sig_user_id === user.user_id) return true;
    if (hasBit(user.role_permission, "usersManagement")) return true;
    if (hasBit(user.role_permission, "viewQuotations")) {
        const [[quotation]] = await conn.query(
            "SELECT 1 AS found FROM tb_quotations WHERE qt_creator_signature_id = ? OR qt_approver_signature_id = ? LIMIT 1",
            [signature.sig_id, signature.sig_id],
        );
        if (quotation) return true;
    }
    if (hasBit(user.role_permission, "viewInvoices")) {
        const [[invoiceOrCreditNote]] = await conn.query(
            `SELECT 1 AS found FROM tb_invoices WHERE inv_issuer_signature_id = ?
             UNION ALL SELECT 1 FROM tb_credit_notes WHERE cn_issuer_signature_id = ? LIMIT 1`,
            [signature.sig_id, signature.sig_id],
        );
        if (invoiceOrCreditNote) return true;
    }
    return false;
}

const SIGNATURE_NOT_FOUND_MESSAGE = "ไม่พบลายเซ็นนี้";

async function findSignatureRow(conn, signatureId) {
    if (!SIGNATURE_ID_PATTERN.test(signatureId)) return null;
    const [[signature]] = await conn.query(
        "SELECT sig_id, sig_user_id, sig_file_path FROM tb_user_signatures WHERE sig_id = ?",
        [signatureId],
    );
    return signature ?? null;
}

async function readFileOf(signature) {
    // path.basename กันชื่อไฟล์ในฐานข้อมูลที่พาออกนอกโฟลเดอร์ (../)
    try {
        return await fs.readFile(path.join(storageDir(), path.basename(signature.sig_file_path)));
    } catch {
        throw new AppError(404, "SIGNATURE_FILE_MISSING", "ไม่พบไฟล์ลายเซ็นในเซิร์ฟเวอร์ · แจ้งผู้ดูแลระบบ");
    }
}

/**
 * อ่านไฟล์ลายเซ็นให้ผู้ใช้ที่ขอ (GET /signatures/:id) · รวมฉบับที่ยกเลิกแล้ว (เอกสารเก่ายังต้องแสดง)
 * ไม่มีสิทธิ์ตอบเหมือนไม่มีรูปนี้ ไม่บอกใบ้ว่าเลขนี้มีอยู่จริง
 * @param {import("mysql2/promise").Pool} conn
 * @param {string} signatureId
 * @param {{ user_id: string, role_permission: string }} user ผู้ขอ
 * @returns {Promise<Buffer>}
 */
async function readSignatureFile(conn, signatureId, user) {
    const signature = await findSignatureRow(conn, signatureId);
    if (!signature || !(await canOpenSignature(conn, signature, user))) {
        throw new AppError(404, "SIGNATURE_NOT_FOUND", SIGNATURE_NOT_FOUND_MESSAGE);
    }
    return readFileOf(signature);
}

/**
 * อ่านไฟล์ลายเซ็นที่อยู่บนเอกสาร โดยไม่ตรวจผู้ขอ · ใช้ได้เฉพาะเมื่อผู้เรียกตรวจแล้วว่าคนเปิดเห็นเอกสารนั้นได้
 * (เช่น ใบเสนอราคาที่ลูกค้าเปิดจากลิงก์สถานะคำขอของตัวเอง)
 * @param {import("mysql2/promise").Pool} conn
 * @param {string} signatureId id ที่อ่านจากแถวเอกสาร ไม่ใช่ค่าที่ผู้ใช้ส่งมา
 * @returns {Promise<Buffer>}
 */
async function readDocumentSignatureFile(conn, signatureId) {
    const signature = await findSignatureRow(conn, signatureId);
    if (!signature) throw new AppError(404, "SIGNATURE_NOT_FOUND", SIGNATURE_NOT_FOUND_MESSAGE);
    return readFileOf(signature);
}

module.exports = {
    findActiveSignature,
    replaceSignature,
    revokeSignature,
    readSignatureFile,
    readDocumentSignatureFile,
};
