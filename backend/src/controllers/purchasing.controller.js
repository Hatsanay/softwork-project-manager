// จัดซื้อ: ผู้ขาย + ตั้งค่า (หมวดค่าใช้จ่าย / ประเภทเงินได้ / อัตราหัก ณ ที่จ่าย) — เฟส 2 ขั้น 2-1 (2026-10-16)
// รับคำขอ → ตรวจข้อมูล (zod) → เรียก service → ตอบ
const pool = require("../config/db");
const { validate } = require("../utils/validate");
const { withTransaction } = require("../utils/with-transaction");
const {
    vendorSchema,
    expenseCategorySchema,
    whtIncomeTypeSchema,
    whtRateSchema,
} = require("../shared/schemas/purchasing.mjs");
const vendorService = require("../services/vendor.service");
const setupService = require("../services/purchasing-setup.service");

// ─── ผู้ขาย ──────────────────────────────────────────────────────────────────────────────────

async function listVendors(req, res, next) {
    try {
        res.json(
            await vendorService.listVendors(pool, {
                limit: req.query.limit,
                offset: req.query.offset,
                search: String(req.query.search ?? ""),
                status: req.query.status,
            }),
        );
    } catch (err) {
        next(err);
    }
}

async function getVendor(req, res, next) {
    try {
        res.json(await vendorService.findVendor(pool, req.params.id));
    } catch (err) {
        next(err);
    }
}

async function createVendor(req, res, next) {
    try {
        const vendor = validate(vendorSchema, req.body);
        res.status(201).json(await withTransaction((conn) => vendorService.createVendor(conn, vendor, req.user)));
    } catch (err) {
        next(err);
    }
}

async function updateVendor(req, res, next) {
    try {
        const vendor = validate(vendorSchema, req.body);
        res.json(await withTransaction((conn) => vendorService.updateVendor(conn, req.params.id, vendor)));
    } catch (err) {
        next(err);
    }
}

async function deleteVendor(req, res, next) {
    try {
        await withTransaction((conn) => vendorService.deleteVendor(conn, req.params.id));
        res.status(204).end();
    } catch (err) {
        next(err);
    }
}

// ─── ตั้งค่า ──────────────────────────────────────────────────────────────────────────────────

async function getSetup(req, res, next) {
    try {
        res.json(await setupService.getPurchasingSetup(pool));
    } catch (err) {
        next(err);
    }
}

async function createCategory(req, res, next) {
    try {
        const category = validate(expenseCategorySchema, req.body);
        res.status(201).json(await withTransaction((conn) => setupService.createCategory(conn, category)));
    } catch (err) {
        next(err);
    }
}

async function updateCategory(req, res, next) {
    try {
        const category = validate(expenseCategorySchema, req.body);
        res.json(await withTransaction((conn) => setupService.updateCategory(conn, Number(req.params.id), category)));
    } catch (err) {
        next(err);
    }
}

async function createIncomeType(req, res, next) {
    try {
        const incomeType = validate(whtIncomeTypeSchema, req.body);
        res.status(201).json(await withTransaction((conn) => setupService.createIncomeType(conn, incomeType)));
    } catch (err) {
        next(err);
    }
}

async function updateIncomeType(req, res, next) {
    try {
        const incomeType = validate(whtIncomeTypeSchema, { ...req.body, wit_code: req.params.code });
        res.json(await withTransaction((conn) => setupService.updateIncomeType(conn, req.params.code, incomeType)));
    } catch (err) {
        next(err);
    }
}

async function addRate(req, res, next) {
    try {
        const rate = validate(whtRateSchema, req.body);
        res.status(201).json(await withTransaction((conn) => setupService.addRate(conn, rate, req.user.user_id)));
    } catch (err) {
        next(err);
    }
}

async function deleteRate(req, res, next) {
    try {
        await withTransaction((conn) => setupService.deleteRate(conn, req.params.code, req.params.date));
        res.status(204).end();
    } catch (err) {
        next(err);
    }
}

module.exports = {
    listVendors,
    getVendor,
    createVendor,
    updateVendor,
    deleteVendor,
    getSetup,
    createCategory,
    updateCategory,
    createIncomeType,
    updateIncomeType,
    addRate,
    deleteRate,
};
