// ใบแจ้งหนี้ (2026-10-14 ขั้น 1B-2) — รับคำขอ → ตรวจข้อมูล (zod) → เรียก service → ตอบ
// อ่าน/ร่างอยู่ใน services/invoice.service.js · เปลี่ยนสถานะอยู่ใน services/invoice-workflow.service.js
const pool = require("../config/db");
const { validate } = require("../utils/validate");
const { withTransaction } = require("../utils/with-transaction");
const {
    invoiceFromQuotationSchema,
    invoiceManualDraftSchema,
    invoiceDebitNoteDraftSchema,
    invoiceQuotationDraftSchema,
    invoiceIssueSchema,
    invoiceActionSchema,
    invoiceReasonSchema,
} = require("../shared/schemas/invoice.mjs");
const invoiceService = require("../services/invoice.service");
const workflowService = require("../services/invoice-workflow.service");

async function list(req, res, next) {
    try {
        const result = await invoiceService.listInvoices(
            pool,
            {
                tab: String(req.query.tab ?? "all"),
                search: String(req.query.search ?? ""),
                clientId: req.query.client_id ? String(req.query.client_id) : undefined,
                quotationId: req.query.quotation_id ? String(req.query.quotation_id) : undefined,
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
        res.json(await invoiceService.getInvoiceDetail(pool, req.params.id, req.user));
    } catch (err) {
        next(err);
    }
}

async function billableMilestones(req, res, next) {
    try {
        res.json(await invoiceService.listBillableMilestones(pool, req.params.id));
    } catch (err) {
        next(err);
    }
}

// มี quotation_id = ร่างจากงวดของใบเสนอราคา · มี inv_reference_invoice_id = ใบเพิ่มหนี้ (ขั้น N-2) · ไม่มีทั้งคู่ = ใบสร้างเอง
async function create(req, res, next) {
    try {
        let created;
        if (req.body?.quotation_id) {
            const input = validate(invoiceFromQuotationSchema, req.body);
            created = await withTransaction((conn) => invoiceService.createFromQuotation(conn, input, req.user));
        } else if (req.body?.inv_reference_invoice_id) {
            const draft = validate(invoiceDebitNoteDraftSchema, req.body);
            created = await withTransaction((conn) => invoiceService.createDebitNote(conn, draft, req.user));
        } else {
            const draft = validate(invoiceManualDraftSchema, req.body);
            created = await withTransaction((conn) => invoiceService.createManual(conn, draft, req.user));
        }
        res.status(201).json(created);
    } catch (err) {
        next(err);
    }
}

// ใบจากงวดแก้ได้แค่ข้อมูลประกอบ (ยอดล็อกตามใบเสนอราคา) · ใบเพิ่มหนี้แก้หัวเอกสารไม่ได้ — เลือกชุดตรวจตามแหล่งของใบ
const DRAFT_SCHEMAS = {
    quotation: invoiceQuotationDraftSchema,
    manual: invoiceManualDraftSchema,
    debit_note: invoiceDebitNoteDraftSchema,
};

async function update(req, res, next) {
    try {
        const source = await invoiceService.findSource(pool, req.params.id);
        const schema = DRAFT_SCHEMAS[source];
        const draft = validate(schema, req.body);
        res.json(await withTransaction((conn) => invoiceService.updateDraft(conn, req.params.id, draft)));
    } catch (err) {
        next(err);
    }
}

async function remove(req, res, next) {
    try {
        const { inv_version: version } = validate(invoiceActionSchema, req.body ?? {});
        await withTransaction((conn) => invoiceService.deleteDraft(conn, req.params.id, version));
        res.status(204).end();
    } catch (err) {
        next(err);
    }
}

// อัตรา ณ วันออกดึงก่อนเปิด transaction (อาจรอ ธปท. 5 วินาที ไม่ถือล็อกระหว่างนั้น)
async function issue(req, res, next) {
    try {
        const options = validate(invoiceIssueSchema, req.body ?? {});
        const freshRate = await workflowService.prepareIssueRate(pool, req.params.id);
        res.json(
            await withTransaction((conn) => workflowService.issue(conn, req.params.id, options, freshRate, req.user)),
        );
    } catch (err) {
        next(err);
    }
}

async function submit(req, res, next) {
    try {
        const { inv_version: version } = validate(invoiceActionSchema, req.body ?? {});
        res.json(await withTransaction((conn) => workflowService.submitForApproval(conn, req.params.id, version)));
    } catch (err) {
        next(err);
    }
}

async function approve(req, res, next) {
    try {
        const { inv_version: version } = validate(invoiceActionSchema, req.body ?? {});
        const freshRate = await workflowService.prepareIssueRate(pool, req.params.id);
        res.json(
            await withTransaction((conn) => workflowService.approve(conn, req.params.id, version, freshRate, req.user)),
        );
    } catch (err) {
        next(err);
    }
}

async function returnToDraft(req, res, next) {
    try {
        const { reason, inv_version: version } = validate(invoiceReasonSchema, req.body ?? {});
        res.json(
            await withTransaction((conn) => workflowService.returnToDraft(conn, req.params.id, reason, version, req.user)),
        );
    } catch (err) {
        next(err);
    }
}

async function send(req, res, next) {
    try {
        const { inv_version: version } = validate(invoiceActionSchema, req.body ?? {});
        res.json(await withTransaction((conn) => workflowService.markSent(conn, req.params.id, version)));
    } catch (err) {
        next(err);
    }
}

async function cancel(req, res, next) {
    try {
        const { reason, inv_version: version } = validate(invoiceReasonSchema, req.body ?? {});
        res.json(await withTransaction((conn) => workflowService.cancel(conn, req.params.id, reason, version, req.user)));
    } catch (err) {
        next(err);
    }
}

async function reissue(req, res, next) {
    try {
        const { reason, inv_version: version } = validate(invoiceReasonSchema, req.body ?? {});
        const created = await withTransaction((conn) =>
            workflowService.reissue(conn, req.params.id, reason, version, req.user),
        );
        res.status(201).json(created);
    } catch (err) {
        next(err);
    }
}

module.exports = {
    list,
    getOne,
    billableMilestones,
    create,
    update,
    remove,
    issue,
    submit,
    approve,
    returnToDraft,
    send,
    cancel,
    reissue,
};
