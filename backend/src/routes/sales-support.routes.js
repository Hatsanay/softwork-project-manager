// เส้นทางของอัตราแลกเปลี่ยนและลายเซ็น (2026-10-13 ขั้น 1A-2)
//
// ลงทะเบียนเข้า router หลักด้วย path เต็ม (เหตุผลเดียวกับ company.routes.js — ให้เทสต์ api-routes มองเห็นทุกเส้น)
// /users/me/signature ต้องประกาศก่อน /users/:id/signature ไม่งั้น express จับ "me" เป็นค่า :id
const { requireAuth } = require("../middlewares/auth.middleware");
const { requirePermission } = require("../middlewares/permission.middleware");
const { uploadImage } = require("../middlewares/upload.middleware");
const exchangeRateController = require("../controllers/exchange-rate.controller");
const signatureController = require("../controllers/signature.controller");

/**
 * @param {import("express").Router} router
 */
function registerSalesSupportRoutes(router) {
    // อัตราแลกเปลี่ยน — ฟอร์มเอกสารขายของทุกคนต้องใช้
    router.get("/V1/exchange-rates/status", requireAuth, exchangeRateController.getStatus);
    router.get("/V1/exchange-rates", requireAuth, exchangeRateController.getDocumentRate);

    // ลายเซ็นของตัวเอง — ไม่ต้องมีสิทธิ์พิเศษ
    router.get("/V1/users/me/signature", requireAuth, signatureController.getMine);
    router.put("/V1/users/me/signature", requireAuth, uploadImage.single("signature"), signatureController.replaceMine);
    router.delete("/V1/users/me/signature", requireAuth, signatureController.revokeMine);

    // ลายเซ็นของผู้ใช้อื่น — ดูในหน้าแก้ไขผู้ใช้ · ยกเลิกได้ (ตั้งแทนไม่ได้)
    router.get(
        "/V1/users/:id/signature",
        requireAuth,
        requirePermission("usersManagement"),
        signatureController.getUserSignature,
    );
    router.delete(
        "/V1/users/:id/signature",
        requireAuth,
        requirePermission("editUsers"),
        signatureController.revokeUserSignature,
    );

    // รูปลายเซ็น — ต้อง login (ไม่อยู่ใน /uploads ที่เปิดสาธารณะ)
    router.get("/V1/signatures/:id", requireAuth, signatureController.getImage);
}

module.exports = { registerSalesSupportRoutes };
