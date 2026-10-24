// เส้นทางลงเวลาเข้า-ออกงาน (2026-10-23 ช่วง A-1) — docs/plans/2026-10-23-attendance-ot.md
//
// ลงทะเบียนเข้า router หลักด้วย path เต็ม (เหตุผลเดียวกับ quotation.routes.js)
// ของตัวเอง: ทุกคนที่ login (service ตรวจว่าเป็นพนักงานและต้องลงเวลา)
// กะทำงาน/จุดลงเวลา: แก้ = manageHrSettings (อ่านผ่าน GET /V1/people/setup ได้ทุกคน) · กะของพนักงาน: manageEmployees
// ขอแก้เวลา (A-2): ขอ/ยกเลิก = ของตัวเอง · ดูที่รอ/อนุมัติ/ไม่อนุมัติ = approveTimesheet ("อนุมัติลงเวลา")
// กระดาน/สรุปเดือน/รายวันของพนักงาน (มีตำแหน่งที่กด): manageEmployees หรือ approveTimesheet
// OT (A-3): ขอ/ตัวอย่าง/ยกเลิก = ของตัวเอง · ดูที่รอ/อนุมัติ/ไม่อนุมัติ = approveTimesheet
// WFH (2026-10-24): ขอ/ยกเลิก = ของตัวเอง · ดูที่รอ/อนุมัติ/ไม่อนุมัติ = approveTimesheet · วัน WFH ประจำ = manageEmployees
// /V1/attendance/corrections/pending · /overtime/pending|preview · /wfh/pending ต้องมาก่อน /:id
const { requireAuth } = require("../middlewares/auth.middleware");
const { requirePermission } = require("../middlewares/permission.middleware");
const attendanceController = require("../controllers/attendance.controller");

/**
 * @param {import("express").Router} router
 */
function registerAttendanceRoutes(router) {
    const canEditSetup = requirePermission("manageHrSettings");
    const canManageEmployees = requirePermission("manageEmployees");

    router.get("/V1/attendance/me", requireAuth, attendanceController.getMine);
    router.post("/V1/attendance/punch", requireAuth, attendanceController.punch);

    const canApproveAttendance = requirePermission("approveTimesheet");
    const canViewAttendance = requirePermission(["manageEmployees", "approveTimesheet"]);
    router.post("/V1/attendance/corrections", requireAuth, attendanceController.createCorrection);
    router.get("/V1/attendance/corrections/pending", requireAuth, canApproveAttendance, attendanceController.listPendingCorrections);
    router.post("/V1/attendance/corrections/:id/cancel", requireAuth, attendanceController.cancelCorrection);
    router.post("/V1/attendance/corrections/:id/approve", requireAuth, canApproveAttendance, attendanceController.approveCorrection);
    router.post("/V1/attendance/corrections/:id/reject", requireAuth, canApproveAttendance, attendanceController.rejectCorrection);
    router.get("/V1/attendance/overtime/preview", requireAuth, attendanceController.previewOvertime);
    router.get("/V1/attendance/overtime/pending", requireAuth, canApproveAttendance, attendanceController.listPendingOvertime);
    router.post("/V1/attendance/overtime", requireAuth, attendanceController.createOvertime);
    router.post("/V1/attendance/overtime/:id/cancel", requireAuth, attendanceController.cancelOvertime);
    router.post("/V1/attendance/overtime/:id/approve", requireAuth, canApproveAttendance, attendanceController.approveOvertime);
    router.post("/V1/attendance/overtime/:id/reject", requireAuth, canApproveAttendance, attendanceController.rejectOvertime);
    router.get("/V1/attendance/wfh/pending", requireAuth, canApproveAttendance, attendanceController.listPendingWfh);
    router.post("/V1/attendance/wfh", requireAuth, attendanceController.createWfh);
    router.post("/V1/attendance/wfh/:id/cancel", requireAuth, attendanceController.cancelWfh);
    router.post("/V1/attendance/wfh/:id/approve", requireAuth, canApproveAttendance, attendanceController.approveWfh);
    router.post("/V1/attendance/wfh/:id/reject", requireAuth, canApproveAttendance, attendanceController.rejectWfh);
    router.get("/V1/attendance/board", requireAuth, canViewAttendance, attendanceController.getBoard);
    router.get("/V1/attendance/summary", requireAuth, canViewAttendance, attendanceController.getMonthSummary);
    router.get("/V1/attendance/employees/:id", requireAuth, canViewAttendance, attendanceController.getEmployeeMonth);

    router.post("/V1/people/work-schedules", requireAuth, canEditSetup, attendanceController.createSchedule);
    router.put("/V1/people/work-schedules/:id", requireAuth, canEditSetup, attendanceController.updateSchedule);
    router.post("/V1/people/attendance-locations", requireAuth, canEditSetup, attendanceController.createLocation);
    router.put("/V1/people/attendance-locations/:id", requireAuth, canEditSetup, attendanceController.updateLocation);

    router.post("/V1/employees/:id/schedules", requireAuth, canManageEmployees, attendanceController.setEmployeeSchedule);
    router.put("/V1/employees/:id/wfh-days", requireAuth, canManageEmployees, attendanceController.setEmployeeWfhDays);
    router.delete(
        "/V1/employees/:id/schedules/:scheduleRowId",
        requireAuth,
        canManageEmployees,
        attendanceController.deleteEmployeeSchedule,
    );
}

module.exports = { registerAttendanceRoutes };
