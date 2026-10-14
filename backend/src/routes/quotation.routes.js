// เส้นทางของใบเสนอราคา (2026-10-13 ขั้น 1A-3)
//
// ลงทะเบียนเข้า router หลักด้วย path เต็ม (เหตุผลเดียวกับ company.routes.js — ให้เทสต์ api-routes มองเห็นทุกเส้น)
// สิทธิ์: ดู = viewQuotations · ร่าง/ส่ง/ส่งลูกค้า/ปฏิเสธ/revision/คัดลอก = createQuotation
//        อนุมัติ/ตีกลับ = approveQuotation (+ role อยู่ในชั้นที่รอ ตรวจใน service) · ยกเลิก = cancelQuotation
const { requireAuth } = require("../middlewares/auth.middleware");
const { requirePermission } = require("../middlewares/permission.middleware");
const quotationController = require("../controllers/quotation.controller");

/**
 * @param {import("express").Router} router
 */
function registerQuotationRoutes(router) {
    const canView = requirePermission("viewQuotations");
    const canCreate = requirePermission("createQuotation");
    const canApprove = requirePermission("approveQuotation");
    const canCancel = requirePermission("cancelQuotation");

    router.get("/V1/quotations", requireAuth, canView, quotationController.list);
    router.get("/V1/quotations/:id", requireAuth, canView, quotationController.getOne);
    router.post("/V1/quotations", requireAuth, canCreate, quotationController.create);
    router.put("/V1/quotations/:id", requireAuth, canCreate, quotationController.update);
    router.delete("/V1/quotations/:id", requireAuth, canCreate, quotationController.remove);

    router.post("/V1/quotations/:id/submit", requireAuth, canCreate, quotationController.submit);
    router.post("/V1/quotations/:id/approve", requireAuth, canApprove, quotationController.approve);
    router.post("/V1/quotations/:id/return", requireAuth, canApprove, quotationController.returnToDraft);
    router.post("/V1/quotations/:id/send", requireAuth, canCreate, quotationController.send);
    router.post("/V1/quotations/:id/decline", requireAuth, canCreate, quotationController.decline);
    router.post("/V1/quotations/:id/cancel", requireAuth, canCancel, quotationController.cancel);
    router.post("/V1/quotations/:id/revise", requireAuth, canCreate, quotationController.revise);
    router.post("/V1/quotations/:id/copy", requireAuth, canCreate, quotationController.copy);
    // ลูกค้าตอบรับ (1A-4) — สร้างโปรเจกต์ใหม่ต้องมีสิทธิ์สร้างโปรเจกต์ด้วย (ตรวจใน service)
    router.get("/V1/quotations/:id/project-options", requireAuth, canCreate, quotationController.projectOptions);
    router.post("/V1/quotations/:id/accept", requireAuth, canCreate, quotationController.accept);
}

module.exports = { registerQuotationRoutes };
