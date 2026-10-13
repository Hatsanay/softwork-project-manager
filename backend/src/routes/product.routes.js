// เส้นทางของสินค้า/บริการ หมวดหมู่ และชุดรายการ (2026-10-13 ขั้น 1A-1d)
//
// ลงทะเบียนเข้า router หลักด้วย path เต็ม (เหตุผลเดียวกับ company.routes.js — ให้เทสต์ api-routes มองเห็นทุกเส้น)
//
// อ่าน (GET) ทุกคนที่ login ได้ — คนทำใบเสนอราคาต้องค้นและเลือกสินค้า/ชุดรายการได้ · เพิ่ม/แก้/ลบต้องมีสิทธิ์ productManagement
const { requireAuth } = require("../middlewares/auth.middleware");
const { requirePermission } = require("../middlewares/permission.middleware");
const productController = require("../controllers/product.controller");

/**
 * @param {import("express").Router} router
 */
function registerProductRoutes(router) {
    const canManageProducts = requirePermission("productManagement");

    router.get("/V1/products", requireAuth, productController.listProducts);
    router.get("/V1/products/:id", requireAuth, productController.getProduct);
    router.post("/V1/products", requireAuth, canManageProducts, productController.createProduct);
    router.put("/V1/products/:id", requireAuth, canManageProducts, productController.updateProduct);
    router.delete("/V1/products/:id", requireAuth, canManageProducts, productController.deleteProduct);

    router.get("/V1/product-categories", requireAuth, productController.listCategories);
    router.post("/V1/product-categories", requireAuth, canManageProducts, productController.createCategory);
    router.put("/V1/product-categories/:id", requireAuth, canManageProducts, productController.updateCategory);
    router.delete("/V1/product-categories/:id", requireAuth, canManageProducts, productController.deleteCategory);

    router.get("/V1/product-packages", requireAuth, productController.listPackages);
    router.get("/V1/product-packages/:id", requireAuth, productController.getPackage);
    router.post("/V1/product-packages", requireAuth, canManageProducts, productController.createPackage);
    router.put("/V1/product-packages/:id", requireAuth, canManageProducts, productController.updatePackage);
    router.delete("/V1/product-packages/:id", requireAuth, canManageProducts, productController.deletePackage);
}

module.exports = { registerProductRoutes };
