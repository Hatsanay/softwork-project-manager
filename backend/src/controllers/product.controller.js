// สินค้า/บริการ หมวดหมู่ และชุดรายการ (2026-10-13 ขั้น 1A-1d) — รับคำขอ → ตรวจข้อมูล (zod) → เรียก service → ตอบ
// กติกาธุรกิจและ SQL อยู่ใน services/product.service.js และ services/product-package.service.js
const pool = require("../config/db");
const { validate } = require("../utils/validate");
const { withTransaction } = require("../utils/with-transaction");
const { productSchema, productCategorySchema, productPackageSchema } = require("../shared/schemas/product.mjs");
const productService = require("../services/product.service");
const packageService = require("../services/product-package.service");

// ─── สินค้า/บริการ ──────────────────────────────────────────────────────────────────────────

async function listProducts(req, res, next) {
    try {
        const result = await productService.listProducts(pool, {
            limit: req.query.limit,
            offset: req.query.offset,
            search: String(req.query.search ?? ""),
            categoryId: req.query.category_id ? String(req.query.category_id) : undefined,
            status: req.query.status,
        });
        res.json(result);
    } catch (err) {
        next(err);
    }
}

async function getProduct(req, res, next) {
    try {
        res.json(await productService.findProduct(pool, req.params.id));
    } catch (err) {
        next(err);
    }
}

async function createProduct(req, res, next) {
    try {
        const product = validate(productSchema, req.body);
        res.status(201).json(await withTransaction((conn) => productService.createProduct(conn, product)));
    } catch (err) {
        next(err);
    }
}

async function updateProduct(req, res, next) {
    try {
        const product = validate(productSchema, req.body);
        res.json(await withTransaction((conn) => productService.updateProduct(conn, req.params.id, product)));
    } catch (err) {
        next(err);
    }
}

async function deleteProduct(req, res, next) {
    try {
        await withTransaction((conn) => productService.deleteProduct(conn, req.params.id));
        res.status(204).end();
    } catch (err) {
        next(err);
    }
}

// ─── หมวดหมู่ ────────────────────────────────────────────────────────────────────────────────

async function listCategories(req, res, next) {
    try {
        res.json({ data: await productService.listCategories(pool) });
    } catch (err) {
        next(err);
    }
}

async function createCategory(req, res, next) {
    try {
        const category = validate(productCategorySchema, req.body);
        res.status(201).json(await withTransaction((conn) => productService.createCategory(conn, category)));
    } catch (err) {
        next(err);
    }
}

async function updateCategory(req, res, next) {
    try {
        const category = validate(productCategorySchema, req.body);
        res.json(await withTransaction((conn) => productService.updateCategory(conn, req.params.id, category)));
    } catch (err) {
        next(err);
    }
}

async function deleteCategory(req, res, next) {
    try {
        await withTransaction((conn) => productService.deleteCategory(conn, req.params.id));
        res.status(204).end();
    } catch (err) {
        next(err);
    }
}

// ─── ชุดรายการ ───────────────────────────────────────────────────────────────────────────────

async function listPackages(req, res, next) {
    try {
        res.json({ data: await packageService.listPackages(pool) });
    } catch (err) {
        next(err);
    }
}

async function getPackage(req, res, next) {
    try {
        res.json(await packageService.findPackage(pool, req.params.id));
    } catch (err) {
        next(err);
    }
}

async function createPackage(req, res, next) {
    try {
        const productPackage = validate(productPackageSchema, req.body);
        res.status(201).json(await withTransaction((conn) => packageService.createPackage(conn, productPackage)));
    } catch (err) {
        next(err);
    }
}

async function updatePackage(req, res, next) {
    try {
        const productPackage = validate(productPackageSchema, req.body);
        res.json(await withTransaction((conn) => packageService.updatePackage(conn, req.params.id, productPackage)));
    } catch (err) {
        next(err);
    }
}

async function deletePackage(req, res, next) {
    try {
        await withTransaction((conn) => packageService.deletePackage(conn, req.params.id));
        res.status(204).end();
    } catch (err) {
        next(err);
    }
}

module.exports = {
    listProducts,
    getProduct,
    createProduct,
    updateProduct,
    deleteProduct,
    listCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    listPackages,
    getPackage,
    createPackage,
    updatePackage,
    deletePackage,
};
