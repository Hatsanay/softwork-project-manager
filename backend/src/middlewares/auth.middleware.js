const pool = require("../config/db");
const { verifyToken } = require("../utils/jwt");
const { effectiveRolePermission } = require("../utils/permissions");

// endpoint ที่ใช้ได้ระหว่างยังทำขั้นตอนเข้าระบบครั้งแรกไม่ครบ (2026-10-12, risk-fixes R23)
// ตรงกับที่หน้า login (actions.ts) และ first-login-onboarding.tsx เรียก — เดิมบังคับแค่ที่หน้าเว็บ
// ผู้ใช้ที่ได้รหัสผ่านชั่วคราวจึงยิง API อื่นตรงๆ ได้โดยไม่ต้องเปลี่ยนรหัสผ่าน
const ONBOARDING_ROUTES = new Set([
    "POST /V1/auth/logout",
    "GET /V1/auth/verifyPermission",
    "GET /V1/users/me",
    "PUT /V1/users/me/password",
    "POST /V1/users/me/email/otp",
    "POST /V1/users/me/email/verify",
    "PUT /V1/users/me/image",
]);

function needsOnboarding(user) {
    return Boolean(user.user_must_change_password) || !user.user_email;
}

function isOnboardingRoute(req) {
    return ONBOARDING_ROUTES.has(`${req.method} ${req.route?.path}`);
}

async function requireAuth(req, res, next) {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) return res.status(401).json({ message: "ไม่พบ token" });

    let payload;
    try {
        payload = verifyToken(token); // { user_id, user_role_id } — user_role_id ตรงนี้เป็นแค่ค่า ณ ตอน login
    } catch {
        return res.status(401).json({ message: "token ไม่ถูกต้องหรือหมดอายุ" });
    }

    try {
        // token มีอายุนานสุด 30 วัน ถ้าแอดมินเปลี่ยน role ผู้ใช้หลัง login ไปแล้ว ต้อง query role_id ปัจจุบันจาก DB สดทุกครั้ง
        // ไม่งั้นทุก permission check ที่ใช้ req.user.user_role_id ต่อจากนี้จะยังอิงสิทธิ์เก่าที่ฝังอยู่ใน token อยู่ดี
        // JOIN เอา role_permission มาในคราวเดียว — requirePermission/requireProjectMember/controller ใช้ req.user.role_permission ต่อ
        // ไม่ต้อง query tb_roles ซ้ำอีกในแต่ละ request
        const [rows] = await pool.query(
            `SELECT u.user_role_id, u.user_status, u.user_must_change_password, u.user_email,
                    r.role_permission, r.role_type
             FROM tb_users u
             LEFT JOIN tb_roles r ON r.role_id = u.user_role_id
             WHERE u.user_id = ?`,
            [payload.user_id]
        );
        const user = rows[0];
        if (!user || user.user_status !== "active") {
            return res.status(401).json({ message: "บัญชีผู้ใช้งานถูกระงับหรือไม่พบผู้ใช้งาน" });
        }
        if (needsOnboarding(user) && !isOnboardingRoute(req)) {
            return res.status(403).json({
                code: "ONBOARDING_REQUIRED",
                message: "ต้องตั้งรหัสผ่านใหม่และยืนยันอีเมลให้ครบก่อนใช้งานระบบ — เข้าสู่ระบบผ่านหน้าเว็บแล้วทำตามขั้นตอน",
            });
        }

        // role ระบบได้สิทธิ์ครบทุกข้อเสมอ (risk-fixes R24) — กันแอดมินเอาสิทธิ์จัดการ role ของตัวเองออกโดยไม่ตั้งใจ
        // จนไม่มีใครแก้กลับได้ และสิทธิ์ใหม่ที่เพิ่มในอนาคตได้ทันทีโดยไม่ต้อง migrate
        req.user = {
            user_id: payload.user_id,
            user_role_id: user.user_role_id,
            role_permission: user.user_role_id ? effectiveRolePermission(user.role_type, user.role_permission) : "",
        };
        next();
    } catch (err) {
        next(err);
    }
}

module.exports = { requireAuth };
