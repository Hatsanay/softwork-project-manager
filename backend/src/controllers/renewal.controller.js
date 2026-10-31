// บริการรายรอบ (2026-10-31 · R-1) — รับคำขอ → ตรวจข้อมูล (zod) → เรียก service → ตอบ
// สิทธิ์ที่ route: createInvoice หรือ manageFastwork · สิทธิ์ตามช่องทางของแต่ละรายการตรวจใน service
const pool = require("../config/db");
const { validate } = require("../utils/validate");
const { withTransaction } = require("../utils/with-transaction");
const {
    renewalCreateSchema,
    renewalEndSchema,
    renewalInvoiceSchema,
    renewalResumeSchema,
    renewalUpdateSchema,
} = require("../shared/schemas/renewal.mjs");
const renewalService = require("../services/renewal.service");

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
    list: handle((req) =>
        renewalService.listRenewals(pool, req.user, {
            tab: req.query.tab,
            search: req.query.search ?? "",
            channel: req.query.channel ?? "",
            limit: Number(req.query.limit) || 25,
            offset: Number(req.query.offset) || 0,
        }),
    ),
    getOne: handle((req) => renewalService.getRenewal(pool, req.user, req.params.id)),
    formOptions: handle((req) => renewalService.formOptions(pool, req.query.client_id || null)),
    create: handle((req) => {
        const input = validate(renewalCreateSchema, req.body);
        return withTransaction((conn) => renewalService.createRenewal(conn, req.user, input));
    }, 201),
    update: handle((req) => {
        const input = validate(renewalUpdateSchema, req.body);
        return withTransaction((conn) => renewalService.updateRenewal(conn, req.user, req.params.id, input));
    }),
    pause: handle((req) => {
        const input = validate(renewalEndSchema, req.body);
        return withTransaction((conn) => renewalService.pauseRenewal(conn, req.user, req.params.id, input));
    }),
    resume: handle((req) => {
        const input = validate(renewalResumeSchema, req.body);
        return withTransaction((conn) => renewalService.resumeRenewal(conn, req.user, req.params.id, input));
    }),
    invoice: handle((req) => {
        const input = validate(renewalInvoiceSchema, req.body);
        return withTransaction((conn) => renewalService.invoiceRenewals(conn, req.user, input));
    }, 201),
    cancel: handle((req) => {
        const input = validate(renewalEndSchema, req.body);
        return withTransaction((conn) => renewalService.cancelRenewal(conn, req.user, req.params.id, input));
    }),
};
