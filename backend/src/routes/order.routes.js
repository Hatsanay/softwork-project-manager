// เส้นทางลิงก์เลือกบริการ + คำขอบริการ (2026-10-25 · docs/plans/2026-10-25-client-order-link.md)
//
// พนักงาน: manageServiceRequests · ลูกค้า (ไม่ต้อง login): หน้าร้าน /V1/order/:code · ส่งคำขอ · หน้าสถานะ /V1/order/requests/:token
// เส้นทางสาธารณะต้องอยู่ใน PUBLIC_ROUTES ของ test/api-routes.test.js
const { requireAuth } = require("../middlewares/auth.middleware");
const { requirePermission } = require("../middlewares/permission.middleware");
const { uploadOrderFiles } = require("../middlewares/upload.middleware");
const { requireProjectMember } = require("../middlewares/projectPermission.middleware");
const orderController = require("../controllers/order.controller");

/**
 * @param {import("express").Router} router
 */
function registerOrderRoutes(router) {
    const canManage = requirePermission("manageServiceRequests");

    router.get("/V1/order-links", requireAuth, canManage, orderController.listLinks);
    router.post("/V1/order-links", requireAuth, canManage, orderController.createLink);
    router.get("/V1/order-links/:id", requireAuth, canManage, orderController.getLink);
    router.put("/V1/order-links/:id", requireAuth, canManage, orderController.updateLink);

    router.get("/V1/service-requests/settings", requireAuth, canManage, orderController.getSettings);
    router.put("/V1/service-requests/settings", requireAuth, canManage, orderController.updateSettings);
    router.get("/V1/service-requests", requireAuth, canManage, orderController.listRequests);
    router.get("/V1/service-requests/:id", requireAuth, canManage, orderController.getRequest);
    router.get("/V1/service-requests/:id/files/:fileId", requireAuth, canManage, orderController.downloadRequestFile);
    // ตรวจคำขอ (S-3) · ออกใบเสนอราคา/เปิดโปรเจกต์ตรวจสิทธิ์ createQuotation/createProject เพิ่มใน service
    router.put("/V1/service-requests/:id/client", requireAuth, canManage, orderController.bindRequestClient);
    router.put("/V1/service-requests/:id/items", requireAuth, canManage, orderController.updateRequestItems);
    router.post("/V1/service-requests/:id/reject", requireAuth, canManage, orderController.rejectRequest);
    router.post("/V1/service-requests/:id/close", requireAuth, canManage, orderController.closeRequest);
    router.post("/V1/service-requests/:id/confirm", requireAuth, canManage, orderController.confirmRequest);
    // ลิงก์ของงาน Fastwork เดิม (S-5) · ตรวจสิทธิ์ manageFastwork เพิ่มใน service
    router.post("/V1/service-requests/:id/fastwork-accept", requireAuth, canManage, orderController.acceptRequestOnFastwork);

    // ชุดคำถามความต้องการ (S-2): ดูได้ทั้งผู้ดูแลคำขอและผู้จัดการสินค้า · แก้ = productManagement
    const canManageQuestions = requirePermission("productManagement");
    const canViewQuestions = requirePermission(["productManagement", "manageServiceRequests"]);
    router.get("/V1/requirement-groups", requireAuth, canViewQuestions, orderController.listRequirementGroups);
    router.post("/V1/requirement-groups", requireAuth, canManageQuestions, orderController.createRequirementGroup);
    router.put("/V1/requirement-groups/:id", requireAuth, canManageQuestions, orderController.updateRequirementGroup);
    router.delete("/V1/requirement-groups/:id", requireAuth, canManageQuestions, orderController.deleteRequirementGroup);
    router.put("/V1/requirement-groups/:id/question-order", requireAuth, canManageQuestions, orderController.reorderRequirementQuestions);
    router.post("/V1/requirement-groups/:id/questions", requireAuth, canManageQuestions, orderController.createRequirementQuestion);
    router.put("/V1/requirement-questions/:id", requireAuth, canManageQuestions, orderController.updateRequirementQuestion);
    router.delete("/V1/requirement-questions/:id", requireAuth, canManageQuestions, orderController.deleteRequirementQuestion);
    router.put("/V1/requirement-group-order", requireAuth, canManageQuestions, orderController.reorderRequirementGroups);
    router.post("/V1/requirement-groups/:id/copy", requireAuth, canManageQuestions, orderController.copyRequirementGroup);
    router.post("/V1/requirement-questions/:id/copy", requireAuth, canManageQuestions, orderController.copyRequirementQuestion);
    router.post("/V1/requirement-questions/:id/move", requireAuth, canManageQuestions, orderController.moveRequirementQuestion);

    // การ์ด "ความต้องการจากลูกค้า" ในหน้าโปรเจกต์ (S-4) — สมาชิกโปรเจกต์ (ไม่มีราคา)
    router.get("/V1/projects/:id/requirements", requireAuth, requireProjectMember, orderController.projectRequirements);
    router.get("/V1/projects/:id/requirements/files/:fileId", requireAuth, requireProjectMember, orderController.downloadProjectRequirementFile);
    // ปิดรับความต้องการ (S-5) = ปิดลิงก์ Fastwork ทุกอันของงาน
    const canCloseLinks = requirePermission(["manageFastwork", "manageServiceRequests"]);
    router.post("/V1/projects/:id/requirements/close-links", requireAuth, requireProjectMember, canCloseLinks, orderController.closeProjectLinks);

    // ─── ลูกค้า (ไม่ต้อง login) · requests/:token ต้องมาก่อน :code ───
    router.get("/V1/order/requests/:token", orderController.publicStatus);
    router.post("/V1/order/requests/:token/accept", orderController.publicAccept);
    router.get("/V1/order/:code", orderController.publicShop);
    router.post("/V1/order/:code/requests", uploadOrderFiles.any(), orderController.publicSubmit);
}

module.exports = { registerOrderRoutes };
