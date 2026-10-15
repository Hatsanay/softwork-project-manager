// เส้นทางของใบแจ้งหนี้ (2026-10-14 ขั้น 1B-2)
//
// ลงทะเบียนเข้า router หลักด้วย path เต็ม (เหตุผลเดียวกับ quotation.routes.js — ให้เทสต์ api-routes มองเห็นทุกเส้น)
// สิทธิ์: ดู = viewInvoices · ร่าง/ออก/ส่งขออนุมัติ/ส่งลูกค้า = createInvoice
//        อนุมัติ/ตีกลับ (ใบสร้างเอง) = approveInvoice (+ role อยู่ในชั้นที่รอ ตรวจใน service)
//        ยกเลิก = cancelInvoice · ออกใหม่แทน = cancelInvoice + createInvoice
const { requireAuth } = require("../middlewares/auth.middleware");
const { requirePermission } = require("../middlewares/permission.middleware");
const invoiceController = require("../controllers/invoice.controller");

/**
 * @param {import("express").Router} router
 */
function registerInvoiceRoutes(router) {
    const canView = requirePermission("viewInvoices");
    const canCreate = requirePermission("createInvoice");
    const canApprove = requirePermission("approveInvoice");
    const canCancel = requirePermission("cancelInvoice");

    router.get("/V1/invoices", requireAuth, canView, invoiceController.list);
    router.get("/V1/invoices/:id", requireAuth, canView, invoiceController.getOne);
    router.post("/V1/invoices", requireAuth, canCreate, invoiceController.create);
    router.put("/V1/invoices/:id", requireAuth, canCreate, invoiceController.update);
    router.delete("/V1/invoices/:id", requireAuth, canCreate, invoiceController.remove);

    router.post("/V1/invoices/:id/issue", requireAuth, canCreate, invoiceController.issue);
    router.post("/V1/invoices/:id/submit", requireAuth, canCreate, invoiceController.submit);
    router.post("/V1/invoices/:id/approve", requireAuth, canApprove, invoiceController.approve);
    router.post("/V1/invoices/:id/return", requireAuth, canApprove, invoiceController.returnToDraft);
    router.post("/V1/invoices/:id/send", requireAuth, canCreate, invoiceController.send);
    router.post("/V1/invoices/:id/cancel", requireAuth, canCancel, invoiceController.cancel);
    router.post("/V1/invoices/:id/reissue", requireAuth, canCancel, canCreate, invoiceController.reissue);

    // งวดของใบเสนอราคาพร้อมสถานะการออกบิล — หน้าใบเสนอราคาและหน้าเลือกงวดใช้
    router.get("/V1/quotations/:id/billable-milestones", requireAuth, canView, invoiceController.billableMilestones);
}

module.exports = { registerInvoiceRoutes };
