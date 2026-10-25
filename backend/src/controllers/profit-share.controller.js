// ส่วนแบ่งกำไรรายโปรเจกต์ (2026-10-24 · P-2) — รับคำขอ → ตรวจข้อมูล (zod) → เรียก service → ตอบ
// ของฉัน: ใช้ req.user เสมอ (ไม่รับ id ผู้ใช้จาก URL) · ที่เหลือ: manageProfitShares (คุมที่ route)
const pool = require("../config/db");
const { validate } = require("../utils/validate");
const { withTransaction } = require("../utils/with-transaction");
const {
    projectSharesSchema,
    settleSchema,
    settlementCancelSchema,
    shareAdvanceSchema,
    shareCancelSchema,
    sharePaymentSchema,
} = require("../shared/schemas/profit-share.mjs");
const profitShareService = require("../services/profit-share.service");

const numericId = (value) => {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : -1;
};

/** ตอบด้วยผลของ service · status 201 สำหรับการสร้าง */
function handle(work, status = 200) {
    return async (req, res, next) => {
        try {
            res.status(status).json(await work(req));
        } catch (err) {
            next(err);
        }
    };
}

module.exports = {
    listProjects: handle(async () => ({ data: await profitShareService.listProjects(pool) })),
    projectShares: handle((req) => profitShareService.projectShares(pool, req.params.id)),
    saveShares: handle((req) => {
        const input = validate(projectSharesSchema, req.body);
        return withTransaction((conn) => profitShareService.saveShares(conn, req.user, req.params.id, input));
    }),
    createAdvance: handle((req) => {
        const input = validate(shareAdvanceSchema, req.body);
        return withTransaction((conn) => profitShareService.createAdvance(conn, req.user, req.params.id, input));
    }, 201),
    cancelAdvance: handle((req) => {
        const input = validate(shareCancelSchema, req.body);
        return withTransaction((conn) => profitShareService.cancelAdvance(conn, req.user, numericId(req.params.id), input));
    }),
    settle: handle((req) => {
        const input = validate(settleSchema, req.body);
        return withTransaction((conn) => profitShareService.settle(conn, req.user, req.params.id, input));
    }, 201),
    cancelSettlement: handle((req) => {
        const input = validate(settlementCancelSchema, req.body);
        return withTransaction((conn) => profitShareService.cancelSettlement(conn, req.user, numericId(req.params.id), input));
    }),
    payLine: handle((req) => {
        const input = validate(sharePaymentSchema, req.body);
        return withTransaction((conn) => profitShareService.payLine(conn, req.user, numericId(req.params.id), input));
    }),
    mine: handle((req) => profitShareService.mine(pool, req.user)),
};
