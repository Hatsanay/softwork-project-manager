// ใบวางบิล (2026-10-15 ขั้น 1B-4) — รับคำขอ → ตรวจข้อมูล (zod) → เรียก service → ตอบ
const pool = require("../config/db");
const { validate } = require("../utils/validate");
const { withTransaction } = require("../utils/with-transaction");
const {
    billingNoteDraftSchema,
    billingNoteActionSchema,
    billingNoteReasonSchema,
} = require("../shared/schemas/billing-note.mjs");
const billingNoteService = require("../services/billing-note.service");

async function list(req, res, next) {
    try {
        const result = await billingNoteService.listBillingNotes(pool, {
            tab: String(req.query.tab ?? "all"),
            search: String(req.query.search ?? ""),
            clientId: req.query.client_id ? String(req.query.client_id) : undefined,
            limit: req.query.limit,
            offset: req.query.offset,
        });
        res.json(result);
    } catch (err) {
        next(err);
    }
}

async function billableInvoices(req, res, next) {
    try {
        const result = await billingNoteService.listBillableInvoices(pool, {
            clientId: req.query.client_id ? String(req.query.client_id) : undefined,
            billingNoteId: req.query.billing_note_id ? String(req.query.billing_note_id) : undefined,
        });
        res.json(result);
    } catch (err) {
        next(err);
    }
}

async function getOne(req, res, next) {
    try {
        res.json(await billingNoteService.getBillingNoteDetail(pool, req.params.id, req.user));
    } catch (err) {
        next(err);
    }
}

async function create(req, res, next) {
    try {
        const draft = validate(billingNoteDraftSchema, req.body);
        const created = await withTransaction((conn) => billingNoteService.createDraft(conn, draft, req.user));
        res.status(201).json(created);
    } catch (err) {
        next(err);
    }
}

async function update(req, res, next) {
    try {
        const draft = validate(billingNoteDraftSchema, req.body);
        res.json(await withTransaction((conn) => billingNoteService.updateDraft(conn, req.params.id, draft)));
    } catch (err) {
        next(err);
    }
}

async function remove(req, res, next) {
    try {
        const { bn_version: version } = validate(billingNoteActionSchema, req.body ?? {});
        await withTransaction((conn) => billingNoteService.deleteDraft(conn, req.params.id, version));
        res.status(204).end();
    } catch (err) {
        next(err);
    }
}

async function issue(req, res, next) {
    try {
        const { bn_version: version } = validate(billingNoteActionSchema, req.body ?? {});
        res.json(await withTransaction((conn) => billingNoteService.issue(conn, req.params.id, version, req.user)));
    } catch (err) {
        next(err);
    }
}

async function cancel(req, res, next) {
    try {
        const { reason, bn_version: version } = validate(billingNoteReasonSchema, req.body ?? {});
        res.json(
            await withTransaction((conn) => billingNoteService.cancel(conn, req.params.id, reason, version, req.user)),
        );
    } catch (err) {
        next(err);
    }
}

module.exports = { list, billableInvoices, getOne, create, update, remove, issue, cancel };
