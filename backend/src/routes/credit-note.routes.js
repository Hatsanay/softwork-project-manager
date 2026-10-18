// เส้นทางของใบลดหนี้ (2026-10-18 ขั้น N-1)
//
// ลงทะเบียนเข้า router หลักด้วย path เต็ม (เหตุผลเดียวกับ quotation.routes.js — ให้เทสต์ api-routes มองเห็นทุกเส้น)
// สิทธิ์: ดู = viewInvoices · ร่าง/ส่งขออนุมัติ = createInvoice · อนุมัติ/ตีกลับ = approveInvoice (+ role อยู่ในชั้นที่รอ ตรวจใน service)
//        ยกเลิก = cancelInvoice · บันทึก/ยกเลิกการคืนเงินลูกค้า = refundCustomer (เงินออกจากบัญชี แยกสิทธิ์ R-N8)
const { requireAuth } = require("../middlewares/auth.middleware");
const { requirePermission } = require("../middlewares/permission.middleware");
const creditNoteController = require("../controllers/credit-note.controller");

/**
 * @param {import("express").Router} router
 */
function registerCreditNoteRoutes(router) {
    const canView = requirePermission("viewInvoices");
    const canCreate = requirePermission("createInvoice");
    const canApprove = requirePermission("approveInvoice");
    const canCancel = requirePermission("cancelInvoice");
    const canRefund = requirePermission("refundCustomer");

    router.get("/V1/credit-notes", requireAuth, canView, creditNoteController.list);
    router.get("/V1/credit-notes/:id", requireAuth, canView, creditNoteController.getOne);
    router.post("/V1/credit-notes", requireAuth, canCreate, creditNoteController.create);
    router.put("/V1/credit-notes/:id", requireAuth, canCreate, creditNoteController.update);
    router.delete("/V1/credit-notes/:id", requireAuth, canCreate, creditNoteController.remove);

    router.post("/V1/credit-notes/:id/submit", requireAuth, canCreate, creditNoteController.submit);
    router.post("/V1/credit-notes/:id/approve", requireAuth, canApprove, creditNoteController.approve);
    router.post("/V1/credit-notes/:id/return", requireAuth, canApprove, creditNoteController.returnToDraft);
    router.post("/V1/credit-notes/:id/cancel", requireAuth, canCancel, creditNoteController.cancel);
    router.post("/V1/credit-notes/:id/refund", requireAuth, canRefund, creditNoteController.recordRefund);
    router.post("/V1/credit-notes/:id/refund/cancel", requireAuth, canRefund, creditNoteController.cancelRefund);
}

module.exports = { registerCreditNoteRoutes };
