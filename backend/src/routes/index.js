const express = require("express");
const authController = require("../controllers/auth.controller");
const userController = require("../controllers/user.controller");
const roleController = require("../controllers/role.controller");
const logController = require("../controllers/log.controller");
const departmentController = require("../controllers/department.controller");
const projectPositionController = require("../controllers/project-position.controller");
const clientController = require("../controllers/client.controller");
const projectController = require("../controllers/project.controller");
const taskController = require("../controllers/task.controller");
const issueController = require("../controllers/issue.controller");
const chatController = require("../controllers/chat.controller");
const dashboardController = require("../controllers/dashboard.controller");
const shareController = require("../controllers/share.controller");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requirePermission } = require("../middlewares/permission.middleware");
const { requireProjectMember, requireProjectPermission } = require("../middlewares/projectPermission.middleware");
const { uploadImage } = require("../middlewares/upload.middleware");

const router = express.Router();

router.get("/health", (req, res) => res.json({ status: "ok" }));

// ─── dashboard ──────────────────────────────────────────────────────────────
// ใช้สิทธิ์ "dashboard" ที่มีอยู่แล้วคุมว่าเข้าหน้านี้ได้ไหม ส่วนแต่ละ widget ข้างในสโคปด้วยสิทธิ์เดิม
// (viewAllProjects/viewOwnProjects) หรือเป็นข้อมูลส่วนตัวของผู้ใช้เอง ไม่มีบิตแยกสำหรับ dashboard โดยเฉพาะ
router.get("/V1/dashboard/summary", requireAuth, requirePermission("dashboard"), dashboardController.getSummary);
router.get("/V1/dashboard/search", requireAuth, requirePermission("dashboard"), dashboardController.search);
router.get("/V1/dashboard/team-workload", requireAuth, requirePermission("dashboard"), dashboardController.getTeamWorkload);
router.get("/V1/dashboard/kpis", requireAuth, requirePermission("dashboard"), dashboardController.getKpis);
router.get(
    "/V1/dashboard/kpis/by-member", requireAuth, requirePermission("dashboard"), requirePermission("viewMemberKpi"),
    dashboardController.getKpisByMember
);
router.get("/V1/dashboard/team/:userId/tasks", requireAuth, requirePermission("dashboard"), dashboardController.getMemberTasks);

// ─── auth ───────────────────────────────────────────────────────────────────
router.post("/V1/auth/login", authController.login);
router.post("/V1/auth/logout", requireAuth, authController.logout);
router.get("/V1/auth/verifyPermission", requireAuth, authController.verifyPermission);

// ─── users ──────────────────────────────────────────────────────────────────
// route ที่ขึ้นต้นด้วย /me ต้องประกาศก่อน /:id เสมอ ไม่งั้น express จะจับ "me" เป็นค่า :id ไปก่อน
router.get("/V1/users/me", requireAuth, userController.me);
router.put("/V1/users/me", requireAuth, userController.updateMyProfile);
router.put("/V1/users/me/password", requireAuth, userController.changeOwnPassword);
router.put(
    "/V1/users/me/image",
    requireAuth,
    uploadImage.single("image"),
    userController.uploadMyImage
);
// dropdown เลือกผู้ใช้งาน (เช่น เพิ่มสมาชิกโปรเจกต์) เลยล็อกแค่ requireAuth ต้องมาก่อน /:id
router.get("/V1/users/for-select", requireAuth, userController.forSelect);
router.get("/V1/users", requireAuth, requirePermission("usersManagement"), userController.getAll);
router.get("/V1/users/:id", requireAuth, requirePermission("usersManagement"), userController.getOne);
router.post("/V1/users", requireAuth, requirePermission("createUsers"), userController.create);
router.put("/V1/users/:id", requireAuth, requirePermission("editUsers"), userController.update);
router.put("/V1/users/:id/reset-password", requireAuth, requirePermission("editUsers"), userController.resetPassword);
router.delete("/V1/users/:id", requireAuth, requirePermission("deleteUsers"), userController.remove);
router.put(
    "/V1/users/:id/image",
    requireAuth,
    requirePermission(["createUsers", "editUsers"]),
    uploadImage.single("image"),
    userController.uploadImage
);

// ─── roles ──────────────────────────────────────────────────────────────────
// getRole ใช้ทั้งหน้า "จัดการสิทธิ์" และ dropdown เลือกสิทธิ์ตอนสร้าง/แก้ผู้ใช้
// เลยล็อกแค่ requireAuth ไม่ล็อกด้วย roleManagement bit เพื่อไม่บล็อก dropdown นั้น
router.get("/V1/roles", requireAuth, roleController.getAll);
router.get("/V1/roles/:id", requireAuth, roleController.getOne);
router.post("/V1/roles", requireAuth, requirePermission("createRole"), roleController.create);
router.put("/V1/roles/:id", requireAuth, requirePermission("editRole"), roleController.update);
router.delete("/V1/roles/:id", requireAuth, requirePermission("deleteRole"), roleController.remove);

// ─── departments ────────────────────────────────────────────────────────────
// getAll ใช้ทั้งหน้า "จัดการแผนก" และ dropdown ตอนสร้าง/แก้ role เลยล็อกแค่ requireAuth เหมือน getRole
router.get("/V1/departments", requireAuth, departmentController.getAll);
router.get("/V1/departments/:id", requireAuth, departmentController.getOne);
router.post("/V1/departments", requireAuth, requirePermission("createDepartment"), departmentController.create);
router.put("/V1/departments/:id", requireAuth, requirePermission("editDepartment"), departmentController.update);
router.delete("/V1/departments/:id", requireAuth, requirePermission("deleteDepartment"), departmentController.remove);

// ─── project positions ──────────────────────────────────────────────────────
// getAll/getOne ใช้ทั้งหน้า "จัดการตำแหน่ง" และ dropdown ตอนเพิ่ม/แก้ตำแหน่งสมาชิกในโปรเจกต์
// เลยล็อกแค่ requireAuth (เหมือน getRole/getDepartment) ส่วน create/edit/delete ยังคุมด้วยสิทธิ์ระบบตามเดิม
// สิทธิ์พวกนี้ = ใครจัดการ "นิยาม" ตำแหน่งได้ คนละเรื่องกับ position_permission ภายในตัวตำแหน่งเอง
router.get("/V1/project-positions", requireAuth, projectPositionController.getAll);
router.get("/V1/project-positions/:id", requireAuth, projectPositionController.getOne);
router.post("/V1/project-positions", requireAuth, requirePermission("createProjectPosition"), projectPositionController.create);
router.put("/V1/project-positions/:id", requireAuth, requirePermission("editProjectPosition"), projectPositionController.update);
router.delete("/V1/project-positions/:id", requireAuth, requirePermission("deleteProjectPosition"), projectPositionController.remove);

// ─── logs ───────────────────────────────────────────────────────────────────
router.get("/V1/logs", requireAuth, requirePermission("loginLogs"), logController.getAll);
router.delete("/V1/logs", requireAuth, requirePermission("loginLogs"), logController.removeAll);

// ─── clients ────────────────────────────────────────────────────────────────
// getAll/getOne ใช้ทั้งหน้า "จัดการลูกค้า" และ dropdown ตอนสร้าง/แก้โปรเจกต์ เลยล็อกแค่ requireAuth
// เหมือน roles/departments/project-positions ส่วน create/edit/delete มีสิทธิ์แยกของตัวเอง
router.get("/V1/clients", requireAuth, clientController.getAll);
router.get("/V1/clients/:id", requireAuth, clientController.getOne);
router.post("/V1/clients", requireAuth, requirePermission("createClient"), clientController.create);
router.put("/V1/clients/:id", requireAuth, requirePermission("editClient"), clientController.update);
router.delete("/V1/clients/:id", requireAuth, requirePermission("deleteClient"), clientController.remove);

// ─── projects ───────────────────────────────────────────────────────────────
// list ต้องมี viewAllProjects (เห็นทุกโปรเจกต์) หรือ viewOwnProjects (เห็นแค่ที่ตัวเองเป็นสมาชิก) อย่างใดอย่างหนึ่ง — เช็คว่าอันไหนใน controller
// create ต้องมีสิทธิ์ createProject โดยเฉพาะ — ดู/แก้ไข "โปรเจกต์ที่มีอยู่แล้ว" ต้องเป็นสมาชิกโปรเจกต์นั้นก่อนเสมอ
// แล้วจะทำอะไรได้ต่อ (แก้ข้อมูล/ลบ/จัดการสมาชิก/จัดการลิงก์) ขึ้นกับตำแหน่งที่ถือในโปรเจกต์นั้น (requireProjectPermission)
router.get("/V1/projects", requireAuth, requirePermission(["viewAllProjects", "viewOwnProjects"]), projectController.getAll);
router.post("/V1/projects", requireAuth, requirePermission("createProject"), projectController.create);
router.get("/V1/projects/:id", requireAuth, requireProjectMember, projectController.getOne);
router.get("/V1/projects/:id/my-permissions", requireAuth, requireProjectMember, projectController.getMyPermissions);
router.put(
    "/V1/projects/:id", requireAuth, requireProjectMember,
    requireProjectPermission("editProjectInfo"), projectController.update
);
router.delete(
    "/V1/projects/:id", requireAuth, requireProjectMember,
    requireProjectPermission("deleteProject"), projectController.remove
);
router.put(
    "/V1/projects/:id/share/regenerate", requireAuth, requireProjectMember,
    requireProjectPermission("manageShareLink"), projectController.regenerateShareLink
);
router.put(
    "/V1/projects/:id/share/toggle", requireAuth, requireProjectMember,
    requireProjectPermission("manageShareLink"), projectController.toggleShareEnabled
);
router.post(
    "/V1/projects/:id/share/send-email", requireAuth, requireProjectMember,
    requireProjectPermission("manageShareLink"), projectController.sendShareLinkEmail
);
router.put(
    "/V1/projects/:id/task-weight/toggle", requireAuth, requireProjectMember,
    requireProjectPermission("editProjectInfo"), projectController.toggleTaskWeight
);
// ยกเลิก/กู้คืนโปรเจกต์เป็นสิทธิ์ระดับระบบ (cancelProject) ไม่ต้องเป็นสมาชิกโปรเจกต์นั้นก็ทำได้ — คนละเรื่องกับ deleteProject ที่ต้องเป็นสมาชิก
router.put("/V1/projects/:id/cancel", requireAuth, requirePermission("cancelProject"), projectController.cancel);
router.put("/V1/projects/:id/reactivate", requireAuth, requirePermission("cancelProject"), projectController.reactivate);

// ─── project members ────────────────────────────────────────────────────────
router.get("/V1/projects/:id/members", requireAuth, requireProjectMember, projectController.getMembers);
router.post(
    "/V1/projects/:id/members", requireAuth, requireProjectMember,
    requireProjectPermission("manageMembers"), projectController.addMember
);
router.put(
    "/V1/projects/:id/members/:memberId", requireAuth, requireProjectMember,
    requireProjectPermission("manageMembers"), projectController.updateMemberPositions
);
router.delete(
    "/V1/projects/:id/members/:memberId", requireAuth, requireProjectMember,
    requireProjectPermission("manageMembers"), projectController.removeMember
);

// ─── tasks (ซ้อนใต้ project) ─────────────────────────────────────────────────
router.get("/V1/projects/:projectId/tasks", requireAuth, requireProjectMember, taskController.getAll);
// เพิ่ม task ได้ถ้ามีสิทธิ์ addTask หรือ (เพิ่ม subtask ให้ task ที่ตัวเองรับผิดชอบ + มีสิทธิ์ addOwnSubtask) — เช็คในตัว controller เอง
router.post(
    "/V1/projects/:projectId/tasks", requireAuth, requireProjectMember,
    taskController.create
);
router.get("/V1/projects/:projectId/activity", requireAuth, requireProjectMember, taskController.getActivity);
router.get("/V1/projects/:projectId/tasks/:id", requireAuth, requireProjectMember, taskController.getOne);
// แก้ไข task ได้ถ้ามีสิทธิ์ editTask หรือเป็นผู้รับผิดชอบของ task นั้นเอง — เช็คในตัว controller เอง
router.put(
    "/V1/projects/:projectId/tasks/:id", requireAuth, requireProjectMember,
    taskController.update
);
// เปลี่ยนสถานะงานตัวเองทำได้เสมอ (เช็คในตัว controller เอง) เลยล็อกแค่ requireProjectMember ที่ route
router.put(
    "/V1/projects/:projectId/tasks/:id/status", requireAuth, requireProjectMember,
    taskController.updateStatus
);
router.delete(
    "/V1/projects/:projectId/tasks/:id", requireAuth, requireProjectMember,
    requireProjectPermission("deleteTask"), taskController.remove
);
// รับ task/subtask เอง (Agile) — สมาชิกโปรเจกต์คนไหนก็กดรับได้ ไม่เช็คบิตสิทธิ์ assign ใดๆ เช็คในตัว controller แค่ project_type/สถานะ
router.post(
    "/V1/projects/:projectId/tasks/:id/claim", requireAuth, requireProjectMember,
    taskController.claim
);

// ─── issues (ปัญหาของ task/subtask ซ้อนใต้ project) ──────────────────────────
// สิทธิ์ทำอะไรได้บ้าง (add/edit/delete/changeStatus x all/own x task/subtask) เช็คในตัว controller เอง
// เพราะต้องรู้ว่า task นั้นเป็น subtask หรือไม่ก่อนถึงจะเลือกบิตที่ถูกต้องมาเช็คได้
router.get(
    "/V1/projects/:projectId/tasks/:taskId/issues", requireAuth, requireProjectMember,
    issueController.getForTask
);
router.get(
    "/V1/projects/:projectId/tasks/:taskId/issues/replies", requireAuth, requireProjectMember,
    issueController.getRepliesForTask
);
router.post(
    "/V1/projects/:projectId/tasks/:taskId/issues", requireAuth, requireProjectMember,
    uploadImage.array("images", 5), issueController.create
);
router.put(
    "/V1/projects/:projectId/issues/:issueId", requireAuth, requireProjectMember,
    uploadImage.array("images", 5), issueController.update
);
router.put(
    "/V1/projects/:projectId/issues/:issueId/status", requireAuth, requireProjectMember,
    issueController.updateStatus
);
router.delete(
    "/V1/projects/:projectId/issues/:issueId", requireAuth, requireProjectMember,
    issueController.remove
);

// ตอบกลับปัญหา — สมาชิกโปรเจกต์ทุกคนตอบได้ ไม่มีสิทธิ์เฉพาะเหมือนแชท (ดูเหตุผลใน issue.controller.js)
router.get(
    "/V1/projects/:projectId/issues/:issueId/replies", requireAuth, requireProjectMember,
    issueController.getReplies
);
router.post(
    "/V1/projects/:projectId/issues/:issueId/replies", requireAuth, requireProjectMember,
    uploadImage.array("images", 5), issueController.createReply
);

// ─── chat (แชทของ task/subtask) ──────────────────────────────────────────────
// สมาชิกโปรเจกต์ทุกคนแชทได้ — ล็อกแค่ requireProjectMember ไม่มีสิทธิ์เฉพาะเหมือน issue
router.get(
    "/V1/projects/:projectId/tasks/:taskId/chat", requireAuth, requireProjectMember,
    chatController.getForTask
);
router.post(
    "/V1/projects/:projectId/tasks/:taskId/chat", requireAuth, requireProjectMember,
    uploadImage.array("images", 5), chatController.create
);

// ─── chat (แชทรวมของโปรเจกต์ ไม่ผูกกับ task ไหน) ────────────────────────────────
router.get(
    "/V1/projects/:projectId/chat", requireAuth, requireProjectMember,
    chatController.getForProject
);
router.post(
    "/V1/projects/:projectId/chat", requireAuth, requireProjectMember,
    uploadImage.array("images", 5), chatController.createForProject
);

// ─── public share (ลูกค้าดู ไม่ต้อง login) ───────────────────────────────────
router.get("/V1/share/:token", shareController.getSharedProject);

module.exports = router;
