// ออกจากระบบทุกเครื่อง (2026-11-02 · docs/plans/2026-11-02-permission-audit.md A-1)
//
// token เป็น JWT อายุ 30 วัน ไม่ได้เก็บในฐานข้อมูล · ยกเลิก token ที่ออกไปแล้วด้วยการเพิ่ม user_token_version
// requireAuth เทียบเลขใน token กับในฐานข้อมูลทุกคำขอ → token ทุกใบที่ออกก่อนหน้าใช้ไม่ได้ทันที
// ใช้เมื่อ: เปลี่ยนรหัสผ่านเอง · แอดมินรีเซ็ตรหัสผ่าน · กด "ออกจากระบบเครื่องอื่นทั้งหมด" · แอดมินสั่งออกจากระบบทุกเครื่อง
const { signSessionToken } = require("../utils/jwt");

/**
 * ยกเลิก token ทุกใบของผู้ใช้
 * @param {import("mysql2/promise").Pool | import("mysql2/promise").PoolConnection} conn
 * @param {string} userId
 * @returns {Promise<boolean>} false = ไม่พบผู้ใช้
 */
async function revokeAllSessions(conn, userId) {
    const [result] = await conn.query(
        "UPDATE tb_users SET user_token_version = user_token_version + 1 WHERE user_id = ?",
        [userId],
    );
    return result.affectedRows > 0;
}

/**
 * ยกเลิก token ทุกใบ แล้วออก token ใหม่ให้เครื่องที่สั่ง (เครื่องนี้ไม่หลุด เครื่องอื่นหลุด)
 * @param {import("mysql2/promise").Pool | import("mysql2/promise").PoolConnection} conn
 * @param {string} userId
 * @returns {Promise<string>} token ใหม่
 */
async function revokeOtherSessions(conn, userId) {
    await revokeAllSessions(conn, userId);
    const [[user]] = await conn.query(
        "SELECT user_id, user_role_id, user_token_version FROM tb_users WHERE user_id = ?",
        [userId],
    );
    return signSessionToken(user);
}

module.exports = { revokeAllSessions, revokeOtherSessions };
