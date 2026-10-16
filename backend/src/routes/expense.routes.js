// เส้นทางของค่าใช้จ่าย / บิลผู้ขาย (2026-10-16 เฟส 2 ขั้น 2-2) — docs/plans/2026-10-16-purchasing-2.md หัวข้อ 4.1
//
// ลงทะเบียนเข้า router หลักด้วย path เต็ม (เหตุผลเดียวกับ quotation.routes.js — ให้เทสต์ api-routes มองเห็นทุกเส้น)
// สิทธิ์: ดู + เปิดไฟล์แนบ = viewExpenses หรือคนที่ต้องทำงานกับรายการ (บันทึก/อนุมัติ/ทำจ่าย)
//        บันทึก/แก้/ลบร่าง/ส่ง/คัดลอก/แนบไฟล์ = createExpense · อนุมัติ/ตีกลับ = approveExpense
//        ยกเลิก = approveExpense หรือ createExpense เมื่อรายการผ่านอัตโนมัติ (ตรวจละเอียดใน service)
// ใบเบิกเงินพนักงาน (/V1/claims — ขั้น 2-3): ทุกคนที่ login เบิกของตัวเองได้ ไม่ต้องมีสิทธิ์
//        เจ้าของใบ = แก้/ส่ง/แนบไฟล์ · ผู้มีสิทธิ์ดู/อนุมัติ/ทำจ่ายเห็นทุกใบ · อนุมัติ/ตีกลับ = approveExpense
//        สิทธิ์รายใบตรวจใน service (ใบที่ไม่ใช่ของตัวเองและไม่มีสิทธิ์เห็น = 404)
const { requireAuth } = require("../middlewares/auth.middleware");
const { requirePermission } = require("../middlewares/permission.middleware");
const { uploadDocument } = require("../middlewares/upload.middleware");
const expenseController = require("../controllers/expense.controller");

/**
 * @param {import("express").Router} router
 */
function registerExpenseRoutes(router) {
    const canView = requirePermission(["viewExpenses", "createExpense", "approveExpense", "makePayment"]);
    const canCreate = requirePermission("createExpense");
    const canApprove = requirePermission("approveExpense");
    const canCancel = requirePermission(["approveExpense", "createExpense"]);

    router.get("/V1/expenses", requireAuth, canView, expenseController.list);
    // ต้องอยู่ก่อน /:id ไม่งั้น "project-options" ถูกตีความเป็นรหัสค่าใช้จ่าย
    router.get("/V1/expenses/project-options", requireAuth, canCreate, expenseController.projectOptions);
    router.get("/V1/expenses/:id", requireAuth, canView, expenseController.getOne);
    router.post("/V1/expenses", requireAuth, canCreate, expenseController.create);
    router.put("/V1/expenses/:id", requireAuth, canCreate, expenseController.update);
    router.delete("/V1/expenses/:id", requireAuth, canCreate, expenseController.remove);

    router.post("/V1/expenses/:id/submit", requireAuth, canCreate, expenseController.submit);
    router.post("/V1/expenses/:id/approve", requireAuth, canApprove, expenseController.approve);
    router.post("/V1/expenses/:id/return", requireAuth, canApprove, expenseController.returnToDraft);
    router.post("/V1/expenses/:id/cancel", requireAuth, canCancel, expenseController.cancel);
    router.post("/V1/expenses/:id/copy", requireAuth, canCreate, expenseController.copy);

    router.post(
        "/V1/expenses/:id/attachments",
        requireAuth,
        canCreate,
        uploadDocument.single("file"),
        expenseController.uploadAttachment,
    );
    router.get("/V1/expenses/:id/attachments/:fileId", requireAuth, canView, expenseController.downloadAttachment);
    router.delete("/V1/expenses/:id/attachments/:fileId", requireAuth, canCreate, expenseController.removeAttachment);

    // ─── ใบเบิกเงินพนักงาน ───
    const asClaim = (req, res, next) => {
        req.expenseKind = "claim";
        next();
    };
    router.get("/V1/claims", requireAuth, asClaim, expenseController.list);
    // ต้องอยู่ก่อน /:id
    router.get("/V1/claims/project-options", requireAuth, expenseController.projectOptions);
    router.get("/V1/claims/:id", requireAuth, asClaim, expenseController.getOne);
    router.post("/V1/claims", requireAuth, asClaim, expenseController.create);
    router.put("/V1/claims/:id", requireAuth, asClaim, expenseController.update);
    router.delete("/V1/claims/:id", requireAuth, asClaim, expenseController.remove);
    router.post("/V1/claims/:id/submit", requireAuth, asClaim, expenseController.submit);
    router.post("/V1/claims/:id/approve", requireAuth, canApprove, asClaim, expenseController.approve);
    router.post("/V1/claims/:id/return", requireAuth, canApprove, asClaim, expenseController.returnToDraft);
    router.post("/V1/claims/:id/cancel", requireAuth, asClaim, expenseController.cancel);
    router.post(
        "/V1/claims/:id/attachments",
        requireAuth,
        asClaim,
        uploadDocument.single("file"),
        expenseController.uploadAttachment,
    );
    router.get("/V1/claims/:id/attachments/:fileId", requireAuth, asClaim, expenseController.downloadAttachment);
    router.delete("/V1/claims/:id/attachments/:fileId", requireAuth, asClaim, expenseController.removeAttachment);
}

module.exports = { registerExpenseRoutes };
