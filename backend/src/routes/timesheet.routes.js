// เส้นทางลงเวลา (2026-10-17 เฟส 4 ขั้น 4-2) — docs/plans/2026-10-17-people-payroll-4.md หัวข้อ 4.1
//
// ลงทะเบียนเข้า router หลักด้วย path เต็ม (เหตุผลเดียวกับ quotation.routes.js)
// ของตัวเอง (/me): ทุกคนที่ login — service หาพนักงานจากบัญชีที่ login เอง ไม่รับ id จากภายนอก
// อนุมัติ/ตีกลับ: ทุกคนที่ login เรียกได้ แต่ service ตรวจขอบเขตเอง (approveTimesheet = ทุกแถว · ผู้จัดการสมาชิกโปรเจกต์ = แถวของโปรเจกต์นั้น)
const { requireAuth } = require("../middlewares/auth.middleware");
const timesheetController = require("../controllers/timesheet.controller");

/**
 * @param {import("express").Router} router
 */
function registerTimesheetRoutes(router) {
    router.get("/V1/timesheet/me", requireAuth, timesheetController.getMyWeek);
    router.put("/V1/timesheet/me", requireAuth, timesheetController.saveMyWeek);
    router.post("/V1/timesheet/me/submit", requireAuth, timesheetController.submitMyWeek);
    router.get("/V1/timesheet/approvals", requireAuth, timesheetController.listApprovals);
    router.post("/V1/timesheet/weeks/:id/approve", requireAuth, timesheetController.approveWeek);
    router.post("/V1/timesheet/weeks/:id/return", requireAuth, timesheetController.returnWeek);
}

module.exports = { registerTimesheetRoutes };
