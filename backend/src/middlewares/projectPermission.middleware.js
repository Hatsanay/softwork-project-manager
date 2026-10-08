const pool = require("../config/db");
const { hasProjectBit, combinePositionPermissions } = require("../utils/projectPermissions");
const { hasBit } = require("../utils/permissions");

// สมาชิกโปรเจกต์เข้าดูได้เสมอ — ส่วนคนที่มีสิทธิ์ระบบ "viewAllProjects" (ดูแลภาพรวมทั้งบริษัท)
// เข้าดูได้ด้วยแม้ไม่ได้เป็นสมาชิก (อ่านอย่างเดียว) แต่จะทำอะไรในโปรเจกต์นั้นได้ต้องมีตำแหน่ง/สิทธิ์ในโปรเจกต์จริงๆ
// ดึงตำแหน่งทั้งหมดที่ถือในโปรเจกต์นี้มาในคราวเดียว แล้วรวมเป็น bitmask เดียวเก็บไว้ที่ req.projectPermission
// ให้ requireProjectPermission และ controller ใช้ต่อ ไม่ต้อง query ตำแหน่งซ้ำทุกครั้งที่เช็คบิต
async function requireProjectMember(req, res, next) {
    try {
        const projectId = req.params.projectId ?? req.params.id;
        const [rows] = await pool.query(
            `SELECT pm.project_member_id, pp.position_permission
             FROM tb_project_members pm
             LEFT JOIN tb_project_member_positions pmp ON pmp.project_member_id = pm.project_member_id
             LEFT JOIN tb_project_positions pp ON pp.position_id = pmp.position_id
             WHERE pm.project_id = ? AND pm.user_id = ?`,
            [projectId, req.user?.user_id]
        );
        if (rows[0]) {
            req.projectMemberId = rows[0].project_member_id;
            req.projectPermission = combinePositionPermissions(rows.map((r) => r.position_permission));
            return next();
        }

        if (hasBit(req.user?.role_permission ?? "", "viewAllProjects")) {
            req.projectMemberId = null;
            req.projectPermission = "";
            return next();
        }

        return res.status(403).json({ message: "คุณไม่ได้อยู่ในโปรเจกต์นี้" });
    } catch (err) {
        next(err);
    }
}

// ต้องอยู่หลัง requireProjectMember เสมอ — รวมสิทธิ์จากทุกตำแหน่งที่ถืออยู่ในโปรเจกต์นี้ (ถือหลายตำแหน่งได้)
function requireProjectPermission(key) {
    return function (req, res, next) {
        if (!hasProjectBit(req.projectPermission ?? "", key)) {
            return res.status(403).json({ message: "ไม่มีสิทธิ์ทำรายการนี้ในโปรเจกต์นี้" });
        }
        next();
    };
}

// การกระทำที่ไม่มีบิตคุม (ส่งแชท/ตอบกลับปัญหา/กดรับงาน) ต้องเป็นสมาชิกจริง
// คนที่ผ่าน requireProjectMember มาด้วยสิทธิ์ viewAllProjects อย่างเดียว (ไม่ได้เป็นสมาชิก) ดูได้แต่ทำไม่ได้
function requireRealMember(req, res, next) {
    if (!req.projectMemberId) {
        return res.status(403).json({ message: "ต้องเป็นสมาชิกโปรเจกต์ก่อนถึงจะทำรายการนี้ได้" });
    }
    next();
}

// ─── ตรวจว่า resource ที่อ้างใน URL อยู่ในโปรเจกต์นั้นจริง ──────────────────────────
// requireProjectMember เช็คแค่ :projectId แต่ controller หา task/issue/member ด้วย id ของตัวเองล้วนๆ
// ถ้าไม่เช็คตรงนี้ สมาชิกโปรเจกต์ A จะส่ง id ของโปรเจกต์ B มาแทนแล้วอ่าน/แก้/ลบข้ามโปรเจกต์ได้
// ตอบ 404 (ไม่ใช่ 403) เพื่อไม่บอกใบ้ว่า id นั้นมีอยู่จริงในโปรเจกต์อื่น

function requireTaskInProject(paramName) {
    return async function (req, res, next) {
        try {
            const projectId = req.params.projectId ?? req.params.id;
            const [rows] = await pool.query(
                "SELECT task_id, project_id, task_parent_id, task_status, task_weight FROM tb_tasks WHERE task_id = ?",
                [req.params[paramName]]
            );
            if (!rows[0] || rows[0].project_id !== projectId) {
                return res.status(404).json({ message: "ไม่พบ task นี้" });
            }
            req.task = rows[0];
            next();
        } catch (err) {
            next(err);
        }
    };
}

async function requireIssueInProject(req, res, next) {
    try {
        const [rows] = await pool.query(
            `SELECT i.issue_id, i.task_id, i.issue_status, t.project_id, t.task_parent_id
             FROM tb_task_issues i
             JOIN tb_tasks t ON t.task_id = i.task_id
             WHERE i.issue_id = ?`,
            [req.params.issueId]
        );
        if (!rows[0] || rows[0].project_id !== req.params.projectId) {
            return res.status(404).json({ message: "ไม่พบปัญหานี้" });
        }
        req.issue = rows[0];
        next();
    } catch (err) {
        next(err);
    }
}

async function requireMemberInProject(req, res, next) {
    try {
        const [rows] = await pool.query(
            "SELECT project_member_id FROM tb_project_members WHERE project_member_id = ? AND project_id = ?",
            [req.params.memberId, req.params.id]
        );
        if (!rows[0]) return res.status(404).json({ message: "ไม่พบสมาชิกนี้ในโปรเจกต์" });
        next();
    } catch (err) {
        next(err);
    }
}

module.exports = {
    requireProjectMember, requireProjectPermission, requireRealMember,
    requireTaskInProject, requireIssueInProject, requireMemberInProject,
};
