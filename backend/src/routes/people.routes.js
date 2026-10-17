// เส้นทางฝั่งบุคคล (2026-10-17 เฟส 4) — docs/plans/2026-10-17-people-payroll-4.md
//
// ลงทะเบียนเข้า router หลักด้วย path เต็ม (เหตุผลเดียวกับ quotation.routes.js — ให้เทสต์ api-routes มองเห็นทุกเส้น)
// พนักงาน (รวมเงินเดือน เลขประจำตัว บัญชีรับเงิน): ทุกเส้นต้องมี manageEmployees — ข้อมูลอ่อนไหว (R-H1/R-H8)
// ตั้งค่าบุคคล: อ่าน = ทุกคนที่ login (ประเภทลา/วันหยุด/เวลาทำงานใช้ในหน้าลงเวลา-ขอลา ไม่มีข้อมูลรายคน) · แก้ = manageHrSettings
// /V1/employees/form-options ต้องมาก่อน /V1/employees/:id
const { requireAuth } = require("../middlewares/auth.middleware");
const { requirePermission } = require("../middlewares/permission.middleware");
const peopleController = require("../controllers/people.controller");

/**
 * @param {import("express").Router} router
 */
function registerPeopleRoutes(router) {
    const canManageEmployees = requirePermission("manageEmployees");
    const canEditSetup = requirePermission("manageHrSettings");

    router.get("/V1/employees", requireAuth, canManageEmployees, peopleController.listEmployees);
    router.get("/V1/employees/form-options", requireAuth, canManageEmployees, peopleController.getEmployeeFormOptions);
    router.get("/V1/employees/:id", requireAuth, canManageEmployees, peopleController.getEmployee);
    router.post("/V1/employees", requireAuth, canManageEmployees, peopleController.createEmployee);
    router.put("/V1/employees/:id", requireAuth, canManageEmployees, peopleController.updateEmployee);
    router.delete("/V1/employees/:id", requireAuth, canManageEmployees, peopleController.deleteEmployee);
    router.post("/V1/employees/:id/terminate", requireAuth, canManageEmployees, peopleController.terminateEmployee);
    router.post("/V1/employees/:id/reinstate", requireAuth, canManageEmployees, peopleController.reinstateEmployee);

    router.post("/V1/employees/:id/compensations", requireAuth, canManageEmployees, peopleController.addCompensation);
    router.put(
        "/V1/employees/:id/compensations/:date",
        requireAuth,
        canManageEmployees,
        peopleController.updateCompensation,
    );
    router.delete(
        "/V1/employees/:id/compensations/:date",
        requireAuth,
        canManageEmployees,
        peopleController.deleteCompensation,
    );
    router.post(
        "/V1/employees/:id/recurring-items",
        requireAuth,
        canManageEmployees,
        peopleController.addRecurringItem,
    );
    router.post(
        "/V1/employees/:id/recurring-items/:itemId/end",
        requireAuth,
        canManageEmployees,
        peopleController.endRecurringItem,
    );
    router.delete(
        "/V1/employees/:id/recurring-items/:itemId",
        requireAuth,
        canManageEmployees,
        peopleController.deleteRecurringItem,
    );

    router.get("/V1/people/setup", requireAuth, peopleController.getSetup);
    router.get("/V1/people/holidays", requireAuth, peopleController.listHolidays);
    router.put("/V1/people/settings", requireAuth, canEditSetup, peopleController.updateSettings);
    router.post("/V1/people/sso-rates", requireAuth, canEditSetup, peopleController.addSsoRate);
    router.delete("/V1/people/sso-rates/:date", requireAuth, canEditSetup, peopleController.deleteSsoRate);
    router.put("/V1/people/tax-years/:year", requireAuth, canEditSetup, peopleController.saveTaxYear);
    router.delete("/V1/people/tax-years/:year", requireAuth, canEditSetup, peopleController.deleteTaxYear);
    router.post("/V1/people/holidays", requireAuth, canEditSetup, peopleController.addHoliday);
    router.delete("/V1/people/holidays/:date", requireAuth, canEditSetup, peopleController.deleteHoliday);
    router.post("/V1/people/leave-types", requireAuth, canEditSetup, peopleController.createLeaveType);
    router.put("/V1/people/leave-types/:id", requireAuth, canEditSetup, peopleController.updateLeaveType);
}

module.exports = { registerPeopleRoutes };
