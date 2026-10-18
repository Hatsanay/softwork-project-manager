// ใบลดหนี้ (2026-10-18 ขั้น N-1) — รับคำขอ → ตรวจข้อมูล (zod) → เรียก service → ตอบ
// แบบระบบ: docs/plans/2026-10-18-adjustments-po.md หัวข้อ 4.1
const pool = require("../config/db");
const { validate } = require("../utils/validate");
const { withTransaction } = require("../utils/with-transaction");
const {
    creditNoteDraftSchema,
    creditNoteActionSchema,
    creditNoteReasonSchema,
    creditNoteRefundSchema,
} = require("../shared/schemas/credit-note.mjs");
const creditNoteService = require("../services/credit-note.service");

async function list(req, res, next) {
    try {
        const result = await creditNoteService.listCreditNotes(
            pool,
            {
                tab: String(req.query.tab ?? "all"),
                search: String(req.query.search ?? ""),
                invoiceId: req.query.invoice_id ? String(req.query.invoice_id) : undefined,
                limit: req.query.limit,
                offset: req.query.offset,
            },
            req.user,
        );
        res.json(result);
    } catch (err) {
        next(err);
    }
}

async function getOne(req, res, next) {
    try {
        res.json(await creditNoteService.getCreditNoteDetail(pool, req.params.id, req.user));
    } catch (err) {
        next(err);
    }
}

async function create(req, res, next) {
    try {
        const draft = validate(creditNoteDraftSchema, req.body);
        const created = await withTransaction((conn) => creditNoteService.createDraft(conn, draft, req.user));
        res.status(201).json(created);
    } catch (err) {
        next(err);
    }
}

async function update(req, res, next) {
    try {
        const draft = validate(creditNoteDraftSchema, req.body);
        res.json(await withTransaction((conn) => creditNoteService.updateDraft(conn, req.params.id, draft)));
    } catch (err) {
        next(err);
    }
}

async function remove(req, res, next) {
    try {
        const { cn_version: version } = validate(creditNoteActionSchema, req.body ?? {});
        await withTransaction((conn) => creditNoteService.deleteDraft(conn, req.params.id, version));
        res.status(204).end();
    } catch (err) {
        next(err);
    }
}

async function submit(req, res, next) {
    try {
        const { cn_version: version } = validate(creditNoteActionSchema, req.body ?? {});
        res.json(await withTransaction((conn) => creditNoteService.submitForApproval(conn, req.params.id, version)));
    } catch (err) {
        next(err);
    }
}

async function approve(req, res, next) {
    try {
        const { cn_version: version } = validate(creditNoteActionSchema, req.body ?? {});
        res.json(await withTransaction((conn) => creditNoteService.approve(conn, req.params.id, version, req.user)));
    } catch (err) {
        next(err);
    }
}

async function returnToDraft(req, res, next) {
    try {
        const { reason, cn_version: version } = validate(creditNoteReasonSchema, req.body ?? {});
        res.json(
            await withTransaction((conn) =>
                creditNoteService.returnToDraft(conn, req.params.id, reason, version, req.user),
            ),
        );
    } catch (err) {
        next(err);
    }
}

async function cancel(req, res, next) {
    try {
        const { reason, cn_version: version } = validate(creditNoteReasonSchema, req.body ?? {});
        res.json(
            await withTransaction((conn) => creditNoteService.cancel(conn, req.params.id, reason, version, req.user)),
        );
    } catch (err) {
        next(err);
    }
}

async function recordRefund(req, res, next) {
    try {
        const input = validate(creditNoteRefundSchema, req.body ?? {});
        res.json(await withTransaction((conn) => creditNoteService.recordRefund(conn, req.params.id, input, req.user)));
    } catch (err) {
        next(err);
    }
}

async function cancelRefund(req, res, next) {
    try {
        const { cn_version: version } = validate(creditNoteActionSchema, req.body ?? {});
        res.json(await withTransaction((conn) => creditNoteService.cancelRefund(conn, req.params.id, version)));
    } catch (err) {
        next(err);
    }
}

module.exports = {
    list,
    getOne,
    create,
    update,
    remove,
    submit,
    approve,
    returnToDraft,
    cancel,
    recordRefund,
    cancelRefund,
};
