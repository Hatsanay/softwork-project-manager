// เส้นทางของหน้าตั้งค่าบริษัท (2026-10-13)
//
// ลงทะเบียนเข้า router หลักด้วย path เต็ม (ไม่ใช้ router ย่อย) — เทสต์ test/api-routes.test.js ไล่ตรวจจากตาราง route ของ
// router หลักว่าทุกเส้นมี requireAuth ถ้าแยกเป็น router ย่อยเทสต์จะมองไม่เห็นเส้นทางเหล่านี้
//
// อ่าน (GET) ทุกคนที่ login ได้ — ฟอร์มเอกสารขายต้องใช้สาขา/สกุลเงิน/อัตรา VAT · เปลี่ยนข้อมูลต้องมีสิทธิ์ companySettings
const { requireAuth } = require("../middlewares/auth.middleware");
const { requirePermission } = require("../middlewares/permission.middleware");
const { uploadImage } = require("../middlewares/upload.middleware");
const companyController = require("../controllers/company.controller");

/**
 * @param {import("express").Router} router
 */
function registerCompanyRoutes(router) {
    const canEditCompany = requirePermission("companySettings");

    router.get("/V1/company", requireAuth, companyController.getSettings);
    router.put("/V1/company", requireAuth, canEditCompany, companyController.updateCompany);
    router.post(
        "/V1/company/logo",
        requireAuth,
        canEditCompany,
        uploadImage.single("logo"),
        companyController.uploadLogo,
    );
    router.delete("/V1/company/logo", requireAuth, canEditCompany, companyController.removeLogo);

    router.post("/V1/company/vat-rates", requireAuth, canEditCompany, companyController.addVatRate);
    router.delete("/V1/company/vat-rates/:date", requireAuth, canEditCompany, companyController.deleteVatRate);

    router.post("/V1/company/branches", requireAuth, canEditCompany, companyController.createBranch);
    router.put("/V1/company/branches/:id", requireAuth, canEditCompany, companyController.updateBranch);

    router.post("/V1/company/bank-accounts", requireAuth, canEditCompany, companyController.createBankAccount);
    router.put("/V1/company/bank-accounts/:id", requireAuth, canEditCompany, companyController.updateBankAccount);

    router.post("/V1/company/currencies", requireAuth, canEditCompany, companyController.createCurrency);
    router.put("/V1/company/currencies/:code", requireAuth, canEditCompany, companyController.updateCurrency);

    router.put("/V1/company/approval-levels", requireAuth, canEditCompany, companyController.saveApprovalLevels);
}

module.exports = { registerCompanyRoutes };
