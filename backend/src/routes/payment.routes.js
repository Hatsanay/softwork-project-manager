// เส้นทางของทำจ่าย / ใบสำคัญจ่าย + 50 ทวิ (2026-10-16 เฟส 2 ขั้น 2-4) — docs/plans/2026-10-16-purchasing-2.md หัวข้อ 4.2
//
// ลงทะเบียนเข้า router หลักด้วย path เต็ม (เหตุผลเดียวกับ quotation.routes.js — ให้เทสต์ api-routes มองเห็นทุกเส้น)
// สิทธิ์ (P3 แยกจากผู้อนุมัติ): ดูใบสำคัญจ่าย/50 ทวิ = viewExpenses หรือผู้ทำจ่าย/ยกเลิก
//        ทำจ่าย + ออก 50 ทวิ = makePayment · ยกเลิก = cancelPayment
const { requireAuth } = require("../middlewares/auth.middleware");
const { requirePermission } = require("../middlewares/permission.middleware");
const paymentController = require("../controllers/payment.controller");

/**
 * @param {import("express").Router} router
 */
function registerPaymentRoutes(router) {
    const canView = requirePermission(["viewExpenses", "makePayment", "cancelPayment"]);
    const canPay = requirePermission("makePayment");
    const canCancel = requirePermission("cancelPayment");

    router.get("/V1/payments", requireAuth, canView, paymentController.list);
    // ต้องอยู่ก่อน /:id
    router.get("/V1/payments/payees", requireAuth, canPay, paymentController.payees);
    router.get("/V1/payments/payable-expenses", requireAuth, canPay, paymentController.payableExpenses);
    router.get("/V1/payments/:id", requireAuth, canView, paymentController.getOne);
    router.post("/V1/payments", requireAuth, canPay, paymentController.create);
    router.post("/V1/payments/:id/cancel", requireAuth, canCancel, paymentController.cancel);

    router.get("/V1/wht-certificates", requireAuth, canView, paymentController.listCertificates);
    router.get("/V1/wht-certificates/:id", requireAuth, canView, paymentController.getCertificate);

    // เจ้าหนี้คงค้าง + รายงาน ภ.ง.ด.3/53 รายเดือน (ขั้น 2-5) — สิทธิ์ดูเดียวกับใบสำคัญจ่าย
    router.get("/V1/payables/aging", requireAuth, canView, paymentController.payablesAging);
    router.get("/V1/payables/aging/:kind/:payeeId", requireAuth, canView, paymentController.payablesOfPayee);
    router.get("/V1/reports/withholding", requireAuth, canView, paymentController.withholdingReport);
}

module.exports = { registerPaymentRoutes };
