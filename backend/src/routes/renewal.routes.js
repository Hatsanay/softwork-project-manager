// บริการรายรอบ (2026-10-31 · docs/plans/2026-10-31-recurring-services.md)
//
// ลงทะเบียนเข้า router หลักด้วย path เต็ม (ให้เทสต์ api-routes มองเห็นทุกเส้น)
// ต้องมี createInvoice (ลูกค้าตรง) หรือ manageFastwork (ผู้ซื้อ Fastwork) · รายการของช่องทางที่ไม่มีสิทธิ์ = 403 ใน service
const { requireAuth } = require("../middlewares/auth.middleware");
const { requirePermission } = require("../middlewares/permission.middleware");
const renewalController = require("../controllers/renewal.controller");

/**
 * @param {import("express").Router} router
 */
function registerRenewalRoutes(router) {
    const canManage = requirePermission(["createInvoice", "manageFastwork"]);
    router.get("/V1/renewals", requireAuth, canManage, renewalController.list);
    // ต้องอยู่ก่อน /:id
    router.get("/V1/renewals/form-options", requireAuth, canManage, renewalController.formOptions);
    router.get("/V1/renewals/:id", requireAuth, canManage, renewalController.getOne);
    router.post("/V1/renewals", requireAuth, canManage, renewalController.create);
    // ออกใบแจ้งหนี้รอบนี้ (ลูกค้าตรง · ตรวจสิทธิ์สร้างใบแจ้งหนี้ใน service ตามช่องทาง)
    router.post("/V1/renewals/invoice", requireAuth, canManage, renewalController.invoice);
    router.put("/V1/renewals/:id", requireAuth, canManage, renewalController.update);
    router.post("/V1/renewals/:id/pause", requireAuth, canManage, renewalController.pause);
    router.post("/V1/renewals/:id/resume", requireAuth, canManage, renewalController.resume);
    router.post("/V1/renewals/:id/cancel", requireAuth, canManage, renewalController.cancel);
}

module.exports = { registerRenewalRoutes };
