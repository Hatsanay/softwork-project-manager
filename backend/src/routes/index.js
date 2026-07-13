const express = require("express");
const authController = require("../controllers/auth.controller");
const userController = require("../controllers/user.controller");
const roleController = require("../controllers/role.controller");
const logController = require("../controllers/log.controller");
const departmentController = require("../controllers/department.controller");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requirePermission } = require("../middlewares/permission.middleware");
const { uploadImage } = require("../middlewares/upload.middleware");

const router = express.Router();

router.get("/health", (req, res) => res.json({ status: "ok" }));

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

// ─── logs ───────────────────────────────────────────────────────────────────
router.get("/V1/logs", requireAuth, requirePermission("loginLogs"), logController.getAll);
router.delete("/V1/logs", requireAuth, requirePermission("loginLogs"), logController.removeAll);

module.exports = router;
