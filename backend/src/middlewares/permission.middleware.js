const { hasBit } = require("../utils/permissions");

// role_permission ถูกดึงสดจาก DB ใน requireAuth แล้วทุก request (ไม่เชื่อค่าที่ฝังใน JWT/cookie เพราะ role แก้ไขได้ตลอด)
// keys: single permission key, or an array where ANY match grants access.
function requirePermission(keys) {
    const required = Array.isArray(keys) ? keys : [keys];
    return function (req, res, next) {
        const rolePermission = req.user?.role_permission ?? "";
        if (!required.some((key) => hasBit(rolePermission, key))) {
            return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึง" });
        }
        next();
    };
}

module.exports = { requirePermission };
