const pool = require("../config/db");
const { hasProjectBit } = require("../utils/projectPermissions");
const { hasBit } = require("../utils/permissions");

// สมาชิกโปรเจกต์เข้าดูได้เสมอ — ส่วนคนที่มีสิทธิ์ระบบ "viewAllProjects" (ดูแลภาพรวมทั้งบริษัท)
// เข้าดูได้ด้วยแม้ไม่ได้เป็นสมาชิก (อ่านอย่างเดียว) แต่จะทำอะไรในโปรเจกต์นั้นได้ต้องมีตำแหน่ง/สิทธิ์ในโปรเจกต์จริงๆ
// (requireProjectPermission เช็คจาก tb_project_member_positions ต่ออีกชั้น ไม่ผ่านสิทธิ์ระบบตรงนี้)
async function requireProjectMember(req, res, next) {
    try {
        const projectId = req.params.projectId ?? req.params.id;
        const [memberRows] = await pool.query(
            "SELECT project_member_id FROM tb_project_members WHERE project_id = ? AND user_id = ?",
            [projectId, req.user?.user_id]
        );
        if (memberRows[0]) {
            req.projectMemberId = memberRows[0].project_member_id;
            return next();
        }

        const [roleRows] = await pool.query(
            "SELECT role_permission FROM tb_roles WHERE role_id = ?",
            [req.user?.user_role_id]
        );
        if (hasBit(roleRows[0]?.role_permission ?? "", "viewAllProjects")) {
            req.projectMemberId = null;
            return next();
        }

        return res.status(403).json({ message: "คุณไม่ได้อยู่ในโปรเจกต์นี้" });
    } catch (err) {
        next(err);
    }
}

// รวมสิทธิ์จากทุกตำแหน่งที่ถืออยู่ในโปรเจกต์นี้ (ถือหลายตำแหน่งได้ — มีสิทธิ์จากตำแหน่งไหนก็ใช้ได้)
// ห้ามใส่ async ตรงนี้ — ฟังก์ชันนี้ต้อง return middleware function ทันที (sync) ไม่ใช่ Promise ที่ resolve เป็น middleware
function requireProjectPermission(key) {
    return async function (req, res, next) {
        try {
            const projectId = req.params.projectId ?? req.params.id;
            const [rows] = await pool.query(
                `SELECT pp.position_permission
                 FROM tb_project_members pm
                 JOIN tb_project_member_positions pmp ON pmp.project_member_id = pm.project_member_id
                 JOIN tb_project_positions pp ON pp.position_id = pmp.position_id
                 WHERE pm.project_id = ? AND pm.user_id = ?`,
                [projectId, req.user?.user_id]
            );

            const allowed = rows.some((r) => hasProjectBit(r.position_permission, key));
            if (!allowed) {
                return res.status(403).json({ message: "ไม่มีสิทธิ์ทำรายการนี้ในโปรเจกต์นี้" });
            }
            next();
        } catch (err) {
            next(err);
        }
    };
}

module.exports = { requireProjectMember, requireProjectPermission };
