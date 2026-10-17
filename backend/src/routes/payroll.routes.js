// เส้นทางรอบเงินเดือน (2026-10-17 เฟส 4 ขั้น 4-4) — docs/plans/2026-10-17-people-payroll-4.md หัวข้อ 3.7, 4.3
//
// ลงทะเบียนเข้า router หลักด้วย path เต็ม (เหตุผลเดียวกับ quotation.routes.js)
// ดูรอบ: viewPayroll หรือ runPayroll หรือ approvePayroll · สร้าง/คิดใหม่/แก้รายการ/ส่ง/บันทึกจ่าย/ยกเลิก: runPayroll
// อนุมัติ/ตีกลับ: approvePayroll (+ role อยู่ในชั้นที่รออยู่ — ตรวจใน service) · สลิปของฉัน: ทุกคนที่ login (service ตรวจเจ้าของ)
// ค่าลดหย่อนรายปี: manageEmployees
const { requireAuth } = require("../middlewares/auth.middleware");
const { requirePermission } = require("../middlewares/permission.middleware");
const payrollController = require("../controllers/payroll.controller");

/**
 * @param {import("express").Router} router
 */
function registerPayrollRoutes(router) {
    const canView = requirePermission(["viewPayroll", "runPayroll", "approvePayroll"]);
    const canRun = requirePermission("runPayroll");
    const canApprove = requirePermission("approvePayroll");
    const canManageEmployees = requirePermission("manageEmployees");
    const runPath = "/V1/payroll/runs/:id";

    router.get("/V1/payroll/runs", requireAuth, canView, payrollController.listRuns);
    router.post("/V1/payroll/runs", requireAuth, canRun, payrollController.createRun);
    router.get(runPath, requireAuth, canView, payrollController.getRun);
    router.put(runPath, requireAuth, canRun, payrollController.updateRun);
    router.post(`${runPath}/recalculate`, requireAuth, canRun, payrollController.recalculate);
    router.post(`${runPath}/items/:itemId/lines`, requireAuth, canRun, payrollController.addLine);
    router.delete(`${runPath}/items/:itemId/lines/:lineId`, requireAuth, canRun, payrollController.removeLine);
    router.post(`${runPath}/submit`, requireAuth, canRun, payrollController.submit);
    router.post(`${runPath}/approve`, requireAuth, canApprove, payrollController.approve);
    router.post(`${runPath}/return`, requireAuth, canApprove, payrollController.returnToDraft);
    router.post(`${runPath}/paid`, requireAuth, canRun, payrollController.markPaid);
    router.post(`${runPath}/cancel`, requireAuth, canRun, payrollController.cancel);

    router.get("/V1/payroll/payslips", requireAuth, payrollController.listMyPayslips);
    router.get("/V1/payroll/payslips/:itemId", requireAuth, payrollController.getPayslip);

    const taxProfilePath = "/V1/employees/:employeeId/tax-profiles/:year";
    router.get(taxProfilePath, requireAuth, canManageEmployees, payrollController.getTaxProfile);
    router.put(taxProfilePath, requireAuth, canManageEmployees, payrollController.saveTaxProfile);
}

module.exports = { registerPayrollRoutes };
