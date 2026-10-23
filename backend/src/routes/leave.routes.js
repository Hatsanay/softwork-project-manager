// เส้นทางการลา (2026-10-17 เฟส 4 ขั้น 4-3) — docs/plans/2026-10-17-people-payroll-4.md หัวข้อ 4.4
//
// ลงทะเบียนเข้า router หลักด้วย path เต็ม (เหตุผลเดียวกับ quotation.routes.js)
// ของตัวเอง: ทุกคนที่ login — service ตรวจว่าคำขอเป็นของพนักงานที่ผูกกับบัญชีนี้ (ของคนอื่น = 404)
// ปฏิทินทีม: ทุกคนที่ login (ชื่อ + ช่วงวันเท่านั้น) · อนุมัติ/ไม่อนุมัติ/ยกเลิกที่อนุมัติแล้ว: approveLeave
// ยอดลาของพนักงานคนอื่น: manageEmployees หรือ approveLeave · ไฟล์แนบ: เจ้าของ/ผู้อนุมัติ/ฝ่ายบุคคล (ตรวจใน service)
const { requireAuth } = require("../middlewares/auth.middleware");
const { requirePermission } = require("../middlewares/permission.middleware");
const { uploadDocument } = require("../middlewares/upload.middleware");
const leaveController = require("../controllers/leave.controller");

/**
 * @param {import("express").Router} router
 */
function registerLeaveRoutes(router) {
    const canApprove = requirePermission("approveLeave");

    router.get("/V1/leave/me", requireAuth, leaveController.getMine);
    router.get("/V1/leave/preview", requireAuth, leaveController.preview);
    router.get("/V1/leave/calendar", requireAuth, leaveController.getCalendar);
    router.get("/V1/leave/approvals", requireAuth, canApprove, leaveController.listPending);
    router.get(
        "/V1/leave/balances/:employeeId",
        requireAuth,
        requirePermission(["manageEmployees", "approveLeave"]),
        leaveController.getEmployeeBalances,
    );

    router.post("/V1/leave/requests", requireAuth, leaveController.create);
    router.put("/V1/leave/requests/:id", requireAuth, leaveController.update);
    router.delete("/V1/leave/requests/:id", requireAuth, leaveController.remove);
    router.post("/V1/leave/requests/:id/submit", requireAuth, leaveController.submit);
    router.post("/V1/leave/requests/:id/withdraw", requireAuth, leaveController.withdraw);
    router.post("/V1/leave/requests/:id/cancel", requireAuth, leaveController.cancelOwn);

    router.post("/V1/leave/requests/:id/approve", requireAuth, canApprove, leaveController.approve);
    router.post("/V1/leave/requests/:id/reject", requireAuth, canApprove, leaveController.reject);
    router.post("/V1/leave/requests/:id/cancel-approved", requireAuth, canApprove, leaveController.cancelApproved);

    router.post(
        "/V1/leave/requests/:id/attachments",
        requireAuth,
        uploadDocument.single("file"),
        leaveController.uploadAttachment,
    );
    router.get("/V1/leave/requests/:id/attachments/:fileId", requireAuth, leaveController.downloadAttachment);
    router.delete("/V1/leave/requests/:id/attachments/:fileId", requireAuth, leaveController.removeAttachment);
}

module.exports = { registerLeaveRoutes };
