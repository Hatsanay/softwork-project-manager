const pool = require("../config/db");
const { verifyToken } = require("../utils/jwt");

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
            `SELECT u.user_role_id, u.user_status, r.role_permission
             FROM tb_users u
             LEFT JOIN tb_roles r ON r.role_id = u.user_role_id
             WHERE u.user_id = ?`,
            [payload.user_id]
        );
        const user = rows[0];
        if (!user || user.user_status !== "active") {
            return res.status(401).json({ message: "บัญชีผู้ใช้งานถูกระงับหรือไม่พบผู้ใช้งาน" });
        }
        req.user = {
            user_id: payload.user_id,
            user_role_id: user.user_role_id,
            role_permission: user.role_permission ?? "",
        };
        next();
    } catch (err) {
        next(err);
    }
}

module.exports = { requireAuth };
