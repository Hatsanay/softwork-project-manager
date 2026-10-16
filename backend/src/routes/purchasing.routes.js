// เส้นทางฝั่งจัดซื้อ (2026-10-16 เฟส 2) — docs/plans/2026-10-16-purchasing-2.md
//
// ลงทะเบียนเข้า router หลักด้วย path เต็ม (เหตุผลเดียวกับ quotation.routes.js — ให้เทสต์ api-routes มองเห็นทุกเส้น)
// ผู้ขาย: ดู = คนที่ทำงานฝั่งจัดซื้อ (จัดการผู้ขาย/ดู/บันทึกค่าใช้จ่าย/ทำจ่าย) · เพิ่ม/แก้/ลบ = manageVendors (รวมเลขบัญชี R-P6)
// ตั้งค่า (หมวด/ประเภทเงินได้/อัตรา): อ่าน = ทุกคนที่ login (ฟอร์มเบิกเงินของพนักงานใช้) · แก้ = companySettings
const { requireAuth } = require("../middlewares/auth.middleware");
const { requirePermission } = require("../middlewares/permission.middleware");
const purchasingController = require("../controllers/purchasing.controller");

/**
 * @param {import("express").Router} router
 */
function registerPurchasingRoutes(router) {
    const canViewVendors = requirePermission(["manageVendors", "viewExpenses", "createExpense", "makePayment"]);
    const canManageVendors = requirePermission("manageVendors");
    const canEditSetup = requirePermission("companySettings");

    router.get("/V1/vendors", requireAuth, canViewVendors, purchasingController.listVendors);
    router.get("/V1/vendors/:id", requireAuth, canViewVendors, purchasingController.getVendor);
    router.post("/V1/vendors", requireAuth, canManageVendors, purchasingController.createVendor);
    router.put("/V1/vendors/:id", requireAuth, canManageVendors, purchasingController.updateVendor);
    router.delete("/V1/vendors/:id", requireAuth, canManageVendors, purchasingController.deleteVendor);

    router.get("/V1/purchasing/setup", requireAuth, purchasingController.getSetup);
    router.post("/V1/purchasing/categories", requireAuth, canEditSetup, purchasingController.createCategory);
    router.put("/V1/purchasing/categories/:id", requireAuth, canEditSetup, purchasingController.updateCategory);
    router.post("/V1/purchasing/income-types", requireAuth, canEditSetup, purchasingController.createIncomeType);
    router.put("/V1/purchasing/income-types/:code", requireAuth, canEditSetup, purchasingController.updateIncomeType);
    router.post("/V1/purchasing/wht-rates", requireAuth, canEditSetup, purchasingController.addRate);
    router.delete("/V1/purchasing/wht-rates/:code/:date", requireAuth, canEditSetup, purchasingController.deleteRate);
}

module.exports = { registerPurchasingRoutes };
