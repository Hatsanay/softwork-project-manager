// ตัวคิดราคา (2026-11-01 · docs/plans/2026-11-01-calculator-direct-quotation.md)
const pool = require("../config/db");
const { validate } = require("../utils/validate");
const { withTransaction } = require("../utils/with-transaction");
const { quotationFromCartSchema } = require("../shared/schemas/price-calculator.mjs");
const priceCalculatorService = require("../services/price-calculator.service");

async function catalog(req, res, next) {
    try {
        res.json(await priceCalculatorService.catalog(pool));
    } catch (err) {
        next(err);
    }
}

async function clientProjects(req, res, next) {
    try {
        res.json({ data: await priceCalculatorService.clientProjects(pool, String(req.query.client_id ?? "")) });
    } catch (err) {
        next(err);
    }
}

async function createQuotationFromCart(req, res, next) {
    try {
        const input = validate(quotationFromCartSchema, req.body);
        res.status(201).json(await withTransaction((conn) => priceCalculatorService.createQuotationFromCart(conn, req.user, input)));
    } catch (err) {
        next(err);
    }
}

module.exports = { catalog, clientProjects, createQuotationFromCart };
