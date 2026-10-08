const bcrypt = require("bcryptjs");
const pool = require("../config/db");
const { signToken } = require("../utils/jwt");
const { generateDailyId } = require("../utils/generateDailyId");

async function writeLoginLog({ user_id, email, fullname, action, req }) {
    const log_id = await generateDailyId("tb_login_logs", "log_id", "LOG");
    await pool.query(
        `INSERT INTO tb_login_logs
            (log_id, log_user_id, log_email, log_fullname, log_action, log_ip_address, log_user_agent)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [log_id, user_id ?? null, email, fullname ?? null, action, req.ip, req.headers["user-agent"] ?? null]
    );
}

async function login(req, res, next) {
    try {
        // ช่องเดียวรับได้ทั้งอีเมลและชื่อผู้ใช้ (ผู้ใช้ที่แอดมินสร้างโดยไม่ใส่อีเมลมีแค่ชื่อผู้ใช้)
        // ชื่อผู้ใช้ห้ามมี @ จึงไม่มีทางชนกับอีเมลของอีกคน · รับ user_email ด้วยเผื่อหน้า login รุ่นเก่าที่ค้างในเบราว์เซอร์
        const login = String(req.body.login ?? req.body.user_email ?? "").trim();
        const { user_password } = req.body;
        if (!login || !user_password) {
            return res.status(400).json({ message: "กรุณากรอกอีเมลหรือชื่อผู้ใช้ และรหัสผ่าน" });
        }

        const [rows] = await pool.query(
            `SELECT user_id, user_password, user_role_id, user_status, user_fname, user_lname
             FROM tb_users WHERE ${login.includes("@") ? "user_email" : "user_username"} = ?`,
            [login]
        );
        const user = rows[0];
        const fullname = user ? `${user.user_fname} ${user.user_lname}` : null;

        // log_email เก็บสิ่งที่พิมพ์มาจริง (อีเมลหรือชื่อผู้ใช้) — ไว้ดูย้อนหลังว่ามีคนไล่เดาบัญชีไหน
        if (!user || user.user_status !== "active") {
            await writeLoginLog({ user_id: user?.user_id, email: login, fullname, action: "login_failed", req });
            return res.status(401).json({ message: "อีเมล/ชื่อผู้ใช้ หรือรหัสผ่านไม่ถูกต้อง" });
        }

        const passwordOk = await bcrypt.compare(user_password, user.user_password);
        if (!passwordOk) {
            await writeLoginLog({ user_id: user.user_id, email: login, fullname, action: "login_failed", req });
            return res.status(401).json({ message: "อีเมล/ชื่อผู้ใช้ หรือรหัสผ่านไม่ถูกต้อง" });
        }

        await pool.query("UPDATE tb_users SET user_last_login_at = NOW() WHERE user_id = ?", [
            user.user_id,
        ]);
        await writeLoginLog({ user_id: user.user_id, email: login, fullname, action: "login", req });

        const token = signToken({ user_id: user.user_id, user_role_id: user.user_role_id });
        res.json({ token });
    } catch (err) {
        next(err);
    }
}

async function logout(req, res, next) {
    try {
        const [rows] = await pool.query(
            "SELECT user_email, user_username, user_fname, user_lname FROM tb_users WHERE user_id = ?",
            [req.user.user_id]
        );
        const user = rows[0];
        await writeLoginLog({
            user_id: req.user.user_id,
            email: user?.user_email ?? user?.user_username ?? "",
            fullname: user ? `${user.user_fname} ${user.user_lname}` : null,
            action: "logout",
            req,
        });
        res.json({ message: "ออกจากระบบสำเร็จ" });
    } catch (err) {
        next(err);
    }
}

// คืนสิทธิ์ของ role ตัวเองเท่านั้น (requireAuth ดึงสดจาก DB มาให้แล้ว) — ไม่รับ role_id จาก query
// เดิมรับ ?user_role_id= มาตรงๆ ทำให้ใครก็ตามที่ login แล้วส่อง bitmask ของ role ไหนก็ได้
// frontend ยังส่ง query นั้นมาเหมือนเดิมได้ แค่ถูกเพิกเฉย
async function verifyPermission(req, res) {
    if (!req.user.user_role_id) return res.status(404).json({ message: "ไม่พบสิทธิ์นี้" });
    res.json({ role_permission: req.user.role_permission });
}

module.exports = { login, logout, verifyPermission };
