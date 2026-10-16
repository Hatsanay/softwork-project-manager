// เส้นทางของใบเสร็จรับเงิน + ลูกหนี้คงค้าง (2026-10-15 ขั้น 1C-2)
//
// ลงทะเบียนเข้า router หลักด้วย path เต็ม (เหตุผลเดียวกับ quotation.routes.js — ให้เทสต์ api-routes มองเห็นทุกเส้น)
// สิทธิ์ (C3 แยกจากใบแจ้งหนี้): ดู + เปิดไฟล์ 50 ทวิ + ลูกหนี้คงค้าง = viewReceipts
//        บันทึกรับเงิน + แก้ข้อมูล/ไฟล์ 50 ทวิ = createReceipt · ยกเลิก = cancelReceipt
const { requireAuth } = require("../middlewares/auth.middleware");
const { requirePermission } = require("../middlewares/permission.middleware");
const { uploadDocument } = require("../middlewares/upload.middleware");
const receiptController = require("../controllers/receipt.controller");

/**
 * @param {import("express").Router} router
 */
function registerReceiptRoutes(router) {
    const canView = requirePermission("viewReceipts");
    const canCreate = requirePermission("createReceipt");
    const canCancel = requirePermission("cancelReceipt");

    router.get("/V1/receipts", requireAuth, canView, receiptController.list);
    // ต้องอยู่ก่อน /:id ไม่งั้น "receivable-invoices" ถูกตีความเป็นรหัสใบเสร็จ
    router.get("/V1/receipts/receivable-invoices", requireAuth, canCreate, receiptController.receivableInvoices);
    router.get("/V1/receipts/:id", requireAuth, canView, receiptController.getOne);
    router.post("/V1/receipts", requireAuth, canCreate, receiptController.create);
    router.put("/V1/receipts/:id", requireAuth, canCreate, receiptController.updateDetails);
    router.post("/V1/receipts/:id/cancel", requireAuth, canCancel, receiptController.cancel);

    router.get("/V1/receipts/:id/wht-certificate/file", requireAuth, canView, receiptController.downloadWhtFile);
    router.post(
        "/V1/receipts/:id/wht-certificate/file",
        requireAuth,
        canCreate,
        uploadDocument.single("file"),
        receiptController.uploadWhtFile,
    );
    router.delete("/V1/receipts/:id/wht-certificate/file", requireAuth, canCreate, receiptController.removeWhtFile);

    router.get("/V1/receivables/aging", requireAuth, canView, receiptController.aging);
    router.get("/V1/receivables/aging/:clientId", requireAuth, canView, receiptController.agingOfClient);
}

module.exports = { registerReceiptRoutes };
