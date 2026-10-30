// กติกา "จัดการได้เฉพาะผู้ใช้และ role ที่มีสิทธิ์ไม่เกินตัวเอง" (2026-10-12, docs/plans/2026-10-12-risk-fixes.md R25)
//
// ใช้กับทุกการกระทำที่เปลี่ยนสิทธิ์หรือเข้าถึงบัญชีของคนอื่น: สร้าง/แก้/ลบ role, มอบ role ให้ผู้ใช้,
// แก้ไข/รีเซ็ตรหัสผ่าน/เปลี่ยนรูป/ลบผู้ใช้ — ไม่งั้นคนที่มีสิทธิ์ "แก้ไขผู้ใช้" จะมอบ role ระบบให้ตัวเอง
// หรือรีเซ็ตรหัสผ่านของแอดมินแล้วเข้าระบบแทนได้ · role ระบบมีสิทธิ์ครบ จึงทำได้ทุกอย่างเหมือนเดิม

const pool = require("../config/db");
const { effectiveRolePermission, isPermissionWithin } = require("./permissions");

const ACCESS_ERRORS = {
    roleAboveActor: {
        status: 403,
        code: "ROLE_ABOVE_YOUR_PERMISSION",
        message: "แก้ไขหรือลบ role นี้ไม่ได้ เพราะ role นี้มีสิทธิ์บางข้อที่คุณเองไม่มี · ให้ผู้ที่มีสิทธิ์สูงกว่าเป็นคนจัดการ",
    },
    permissionAboveActor: {
        status: 403,
        code: "PERMISSION_ABOVE_YOURS",
        message: "ให้สิทธิ์ที่คุณเองไม่มีไม่ได้ · เอาสิทธิ์ข้อที่เกินออก หรือให้ผู้ที่มีสิทธิ์สูงกว่าเป็นคนตั้ง",
    },
    assignRoleAboveActor: {
        status: 403,
        code: "ASSIGN_ROLE_ABOVE_YOURS",
        message: "มอบ role นี้ไม่ได้ เพราะ role นี้มีสิทธิ์บางข้อที่คุณเองไม่มี · ให้ผู้ที่มีสิทธิ์สูงกว่าเป็นคนมอบ",
    },
    userAboveActor: {
        status: 403,
        code: "USER_ABOVE_YOUR_PERMISSION",
        message: "จัดการผู้ใช้นี้ไม่ได้ เพราะผู้ใช้นี้มีสิทธิ์บางข้อที่คุณไม่มี · ให้ผู้ที่มีสิทธิ์สูงกว่าเป็นคนจัดการ",
    },
    changeOwnAccess: {
        status: 403,
        code: "CANNOT_CHANGE_OWN_ACCESS",
        message: "เปลี่ยน role หรือสถานะของบัญชีตัวเองไม่ได้ ให้ผู้ดูแลคนอื่นเป็นคนจัดการ",
    },
};

// สิทธิ์ที่ใช้ได้จริงของ role · ไม่ระบุ role = ไม่มีสิทธิ์ใดเลย · ไม่พบ role = null
async function findRolePermission(roleId) {
    if (!roleId) return "";
    const [rows] = await pool.query("SELECT role_type, role_permission FROM tb_roles WHERE role_id = ?", [roleId]);
    const role = rows[0];
    if (!role) return null;
    return effectiveRolePermission(role.role_type, role.role_permission);
}

// สิทธิ์ที่ใช้ได้จริงของผู้ใช้ (ผ่าน role ของเขา) · ไม่พบผู้ใช้ = null
async function findUserAccess(userId) {
    const [rows] = await pool.query(
        `SELECT u.user_role_id, u.user_status, r.role_type, r.role_permission
         FROM tb_users u
         LEFT JOIN tb_roles r ON r.role_id = u.user_role_id
         WHERE u.user_id = ?`,
        [userId]
    );
    const user = rows[0];
    if (!user) return null;
    return {
        roleId: user.user_role_id,
        status: user.user_status,
        permission: user.user_role_id ? effectiveRolePermission(user.role_type, user.role_permission) : "",
    };
}

function canActOn(actorPermission, targetPermission) {
    return isPermissionWithin(targetPermission, actorPermission);
}

function sendAccessError(res, error) {
    return res.status(error.status).json({ code: error.code, message: error.message });
}

module.exports = { ACCESS_ERRORS, findRolePermission, findUserAccess, canActOn, sendAccessError };
