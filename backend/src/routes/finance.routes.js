// เส้นทางการเงิน/รายงานของช่วง 1D (2026-10-15) — docs/plans/2026-10-15-finance-1d.md
//
// ลงทะเบียนเข้า router หลักด้วย path เต็ม (เหตุผลเดียวกับ quotation.routes.js — ให้เทสต์ api-routes มองเห็นทุกเส้น)
// การเงินโปรเจกต์ (D1): ต้องมีสิทธิ์ดูใบแจ้งหนี้ + เข้าโปรเจกต์ได้ (สมาชิก หรือดูทุกโปรเจกต์) — สมาชิกที่ไม่มีสิทธิ์เงินได้ 403
// รายงานขาย + ไฟล์ส่งนักบัญชี (D3): สิทธิ์ salesReports
const { requireAuth } = require("../middlewares/auth.middleware");
const { requirePermission } = require("../middlewares/permission.middleware");
const { requireProjectMember } = require("../middlewares/projectPermission.middleware");
const financeController = require("../controllers/finance.controller");

/**
 * @param {import("express").Router} router
 */
function registerFinanceRoutes(router) {
    router.get(
        "/V1/projects/:id/finance",
        requireAuth,
        requirePermission("viewInvoices"),
        requireProjectMember,
        financeController.projectFinance,
    );

    const canReport = requirePermission("salesReports");
    router.get("/V1/reports/sales", requireAuth, canReport, financeController.salesSummary);
    router.get("/V1/reports/sales/monthly", requireAuth, canReport, financeController.monthlySales);
    router.get("/V1/reports/accounting-export", requireAuth, canReport, financeController.accountingExport);
}

module.exports = { registerFinanceRoutes };
