// เส้นทางงาน Fastwork (2026-10-24 · P-1 · docs/plans/2026-10-24-pre-incorporation.md)
//
// หน้า Fastwork (ภาพรวมขั้นตอน): manageFastwork · createProject · viewAllProjects (ยอดเงินเฉพาะ manageFastwork)
// สร้าง/แก้งาน Fastwork · บันทึก/ยืนยัน/ยกเลิกรายการเงิน · ตั้งอัตราค่าธรรมเนียม: manageFastwork
// ส่งงานงวด: สมาชิกโปรเจกต์ตัวจริง · ดูงวดของโปรเจกต์: สมาชิกหรือผู้ดูโปรเจกต์ทั้งหมด (ยอดเงินตัดตามสิทธิ์ใน controller)
// ส่วนแบ่งกำไร (P-2): ตั้ง/เบิก/ปิดยอด/จ่าย/ดูของทุกคน = manageProfitShares · ส่วนแบ่งของฉัน = ทุกคนที่ login (เห็นเฉพาะของตัวเอง)
// เงินทุนสะสม (P-3): ดู/ตั้งเป้า/ฝาก/ถอน/ยกเลิก = manageCapitalFund
const { requireAuth } = require("../middlewares/auth.middleware");
const { requirePermission } = require("../middlewares/permission.middleware");
const { requireProjectMember, requireRealMember } = require("../middlewares/projectPermission.middleware");
const fastworkController = require("../controllers/fastwork.controller");
const profitShareController = require("../controllers/profit-share.controller");
const capitalController = require("../controllers/capital.controller");

/**
 * @param {import("express").Router} router
 */
function registerFastworkRoutes(router) {
    const canManage = requirePermission("manageFastwork");
    const canSeeHub = requirePermission(["manageFastwork", "createProject", "viewAllProjects", "manageProfitShares", "manageCapitalFund"]);
    const canManageShares = requirePermission("manageProfitShares");
    const canManageCapital = requirePermission("manageCapitalFund");

    router.get("/V1/fastwork/overview", requireAuth, canSeeHub, fastworkController.overview);
    router.get("/V1/fastwork/settings", requireAuth, canSeeHub, fastworkController.getSettings);
    router.put("/V1/fastwork/settings", requireAuth, canManage, fastworkController.updateSettings);

    router.post("/V1/fastwork/projects", requireAuth, canManage, fastworkController.createProject);
    // ตัวคิดราคาภายใน (S-5): สินค้าหน้าร้าน + ชุดคำถาม
    router.get("/V1/fastwork/price-catalog", requireAuth, canManage, fastworkController.priceCatalog);
    router.get("/V1/fastwork/projects/:id", requireAuth, requireProjectMember, fastworkController.projectFastwork);
    router.put("/V1/fastwork/projects/:id", requireAuth, canManage, fastworkController.updateProject);
    router.post(
        "/V1/fastwork/projects/:id/milestones/:milestoneId/delivered",
        requireAuth,
        requireProjectMember,
        requireRealMember,
        fastworkController.setDelivered,
    );

    router.get("/V1/fastwork/payouts", requireAuth, canManage, fastworkController.listPayouts);
    router.post("/V1/fastwork/payouts", requireAuth, canManage, fastworkController.createPayout);
    router.post("/V1/fastwork/payouts/:id/receive", requireAuth, canManage, fastworkController.receivePayout);
    router.post("/V1/fastwork/payouts/:id/cancel", requireAuth, canManage, fastworkController.cancelPayout);

    router.get("/V1/profit-shares/mine", requireAuth, profitShareController.mine);
    router.get("/V1/profit-shares/projects", requireAuth, canManageShares, profitShareController.listProjects);
    router.get("/V1/profit-shares/projects/:id", requireAuth, canManageShares, profitShareController.projectShares);
    router.put("/V1/profit-shares/projects/:id/shares", requireAuth, canManageShares, profitShareController.saveShares);
    router.post("/V1/profit-shares/projects/:id/advances", requireAuth, canManageShares, profitShareController.createAdvance);
    router.post("/V1/profit-shares/projects/:id/settle", requireAuth, canManageShares, profitShareController.settle);
    router.post("/V1/profit-shares/advances/:id/cancel", requireAuth, canManageShares, profitShareController.cancelAdvance);
    router.post("/V1/profit-shares/settlements/:id/cancel", requireAuth, canManageShares, profitShareController.cancelSettlement);
    router.post("/V1/profit-shares/lines/:id/pay", requireAuth, canManageShares, profitShareController.payLine);

    router.get("/V1/capital", requireAuth, canManageCapital, capitalController.overview);
    router.put("/V1/capital/goal", requireAuth, canManageCapital, capitalController.updateGoal);
    router.post("/V1/capital/entries", requireAuth, canManageCapital, capitalController.createEntry);
    router.post("/V1/capital/entries/:id/cancel", requireAuth, canManageCapital, capitalController.cancelEntry);
}

module.exports = { registerFastworkRoutes };
