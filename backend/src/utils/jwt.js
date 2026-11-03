const jwt = require("jsonwebtoken");

// ล็อก algorithm ไว้ตัวเดียว กันการปลอม token ด้วย algorithm อื่น (เช่น "none")
const ALGORITHM = "HS256";

function signToken(payload) {
    return jwt.sign(payload, process.env.JWT_SECRET, {
        algorithm: ALGORITHM,
        expiresIn: process.env.JWT_EXPIRES_IN || "30d",
    });
}

function verifyToken(token) {
    return jwt.verify(token, process.env.JWT_SECRET, { algorithms: [ALGORITHM] });
}

/**
 * token เข้าระบบของผู้ใช้ · tv = user_token_version ตอนออก token (2026-11-02 · docs/plans/2026-11-02-permission-audit.md A-1)
 * requireAuth เทียบ tv กับค่าในฐานข้อมูล · เปลี่ยน/รีเซ็ตรหัสผ่านหรือออกจากระบบทุกเครื่อง = เพิ่มเลข → token เก่าใช้ไม่ได้
 * @param {{ user_id: string, user_role_id: string | null, user_token_version: number }} user
 */
function signSessionToken(user) {
    return signToken({ user_id: user.user_id, user_role_id: user.user_role_id, tv: user.user_token_version });
}

/** เลขรุ่นใน token · token ที่ออกก่อนมีเลขรุ่น (ก่อน deploy A-1) ถือเป็น 0 = ค่าเริ่มต้นของคอลัมน์ ไม่หลุดตอน deploy */
function tokenVersionOf(payload) {
    return Number.isInteger(payload.tv) ? payload.tv : 0;
}

module.exports = { signToken, verifyToken, signSessionToken, tokenVersionOf };
