// เส้นทางของใบวางบิล (2026-10-15 ขั้น 1B-4)
//
// ลงทะเบียนเข้า router หลักด้วย path เต็ม (เหตุผลเดียวกับ quotation.routes.js — ให้เทสต์ api-routes มองเห็นทุกเส้น)
// สิทธิ์ใช้ชุดเดียวกับใบแจ้งหนี้: ดู = viewInvoices · ร่าง/แก้/ลบร่าง/ออก = createInvoice · ยกเลิก = cancelInvoice
const { requireAuth } = require("../middlewares/auth.middleware");
const { requirePermission } = require("../middlewares/permission.middleware");
const billingNoteController = require("../controllers/billing-note.controller");

/**
 * @param {import("express").Router} router
 */
function registerBillingNoteRoutes(router) {
    const canView = requirePermission("viewInvoices");
    const canCreate = requirePermission("createInvoice");
    const canCancel = requirePermission("cancelInvoice");

    router.get("/V1/billing-notes", requireAuth, canView, billingNoteController.list);
    // ต้องอยู่ก่อน /:id ไม่งั้น "billable-invoices" ถูกตีความเป็นรหัสใบวางบิล
    router.get("/V1/billing-notes/billable-invoices", requireAuth, canView, billingNoteController.billableInvoices);
    router.get("/V1/billing-notes/:id", requireAuth, canView, billingNoteController.getOne);
    router.post("/V1/billing-notes", requireAuth, canCreate, billingNoteController.create);
    router.put("/V1/billing-notes/:id", requireAuth, canCreate, billingNoteController.update);
    router.delete("/V1/billing-notes/:id", requireAuth, canCreate, billingNoteController.remove);
    router.post("/V1/billing-notes/:id/issue", requireAuth, canCreate, billingNoteController.issue);
    router.post("/V1/billing-notes/:id/cancel", requireAuth, canCancel, billingNoteController.cancel);
}

module.exports = { registerBillingNoteRoutes };
