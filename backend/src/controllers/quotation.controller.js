// ใบเสนอราคา (2026-10-13 ขั้น 1A-3) — รับคำขอ → ตรวจข้อมูล (zod) → เรียก service → ตอบ
// อ่าน/ร่างอยู่ใน services/quotation.service.js · เปลี่ยนสถานะอยู่ใน services/quotation-workflow.service.js
const pool = require("../config/db");
const { validate } = require("../utils/validate");
const { withTransaction } = require("../utils/with-transaction");
const {
    quotationDraftSchema,
    quotationReasonSchema,
    quotationActionSchema,
    quotationAcceptSchema,
} = require("../shared/schemas/quotation.mjs");
const { recomputeProjectProgress } = require("../utils/projectProgress");
const acceptService = require("../services/quotation-accept.service");
const quotationService = require("../services/quotation.service");
const workflowService = require("../services/quotation-workflow.service");

async function list(req, res, next) {
    try {
        const result = await quotationService.listQuotations(
            pool,
            {
                tab: String(req.query.tab ?? "all"),
                search: String(req.query.search ?? ""),
                branchId: req.query.branch_id ? String(req.query.branch_id) : undefined,
                currency: req.query.currency ? String(req.query.currency) : undefined,
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
        res.json(await quotationService.getQuotationDetail(pool, req.params.id, req.user));
    } catch (err) {
        next(err);
    }
}

async function create(req, res, next) {
    try {
        const draft = validate(quotationDraftSchema, req.body);
        res.status(201).json(await withTransaction((conn) => quotationService.createDraft(conn, draft, req.user)));
    } catch (err) {
        next(err);
    }
}

async function update(req, res, next) {
    try {
        const draft = validate(quotationDraftSchema, req.body);
        res.json(await withTransaction((conn) => quotationService.updateDraft(conn, req.params.id, draft)));
    } catch (err) {
        next(err);
    }
}

async function remove(req, res, next) {
    try {
        const { qt_version: version } = validate(quotationActionSchema, req.body ?? {});
        await withTransaction((conn) => quotationService.deleteDraft(conn, req.params.id, version));
        res.status(204).end();
    } catch (err) {
        next(err);
    }
}

async function submit(req, res, next) {
    try {
        const { qt_version: version } = validate(quotationActionSchema, req.body ?? {});
        res.json(
            await withTransaction((conn) => workflowService.submitForApproval(conn, req.params.id, version, req.user)),
        );
    } catch (err) {
        next(err);
    }
}

async function approve(req, res, next) {
    try {
        const { qt_version: version } = validate(quotationActionSchema, req.body ?? {});
        res.json(await withTransaction((conn) => workflowService.approve(conn, req.params.id, version, req.user)));
    } catch (err) {
        next(err);
    }
}

async function returnToDraft(req, res, next) {
    try {
        const { reason, qt_version: version } = validate(quotationReasonSchema, req.body ?? {});
        res.json(
            await withTransaction((conn) =>
                workflowService.returnToDraft(conn, req.params.id, reason, version, req.user),
            ),
        );
    } catch (err) {
        next(err);
    }
}

async function send(req, res, next) {
    try {
        const { qt_version: version } = validate(quotationActionSchema, req.body ?? {});
        res.json(await withTransaction((conn) => workflowService.markSent(conn, req.params.id, version)));
    } catch (err) {
        next(err);
    }
}

async function decline(req, res, next) {
    try {
        const { reason, qt_version: version } = validate(quotationReasonSchema, req.body ?? {});
        res.json(await withTransaction((conn) => workflowService.markDeclined(conn, req.params.id, reason, version)));
    } catch (err) {
        next(err);
    }
}

async function cancel(req, res, next) {
    try {
        const { reason, qt_version: version } = validate(quotationReasonSchema, req.body ?? {});
        res.json(
            await withTransaction((conn) => workflowService.cancel(conn, req.params.id, reason, version, req.user)),
        );
    } catch (err) {
        next(err);
    }
}

// อัตราใหม่ดึงก่อนเปิด transaction (อาจรอ ธปท. 5 วินาที ไม่ถือล็อกระหว่างนั้น)
async function revise(req, res, next) {
    try {
        const freshRate = await workflowService.prepareFreshRate(pool, req.params.id);
        const created = await withTransaction((conn) =>
            workflowService.revise(conn, req.params.id, freshRate, req.user),
        );
        res.status(201).json(created);
    } catch (err) {
        next(err);
    }
}

async function copy(req, res, next) {
    try {
        const freshRate = await workflowService.prepareFreshRate(pool, req.params.id);
        const created = await withTransaction((conn) => workflowService.copy(conn, req.params.id, freshRate, req.user));
        res.status(201).json(created);
    } catch (err) {
        next(err);
    }
}

async function projectOptions(req, res, next) {
    try {
        res.json(await acceptService.listProjectOptions(pool, req.params.id, req.user));
    } catch (err) {
        next(err);
    }
}

async function accept(req, res, next) {
    try {
        const choice = validate(quotationAcceptSchema, req.body ?? {});
        const result = await withTransaction((conn) =>
            acceptService.acceptQuotation(conn, req.params.id, choice, req.user),
        );
        // % ความคืบหน้าคิดจากงานระดับบนสุด — คำนวณใหม่หลัง commit (ฟังก์ชันเดิมใช้ pool)
        if (result.project_id && result.task_count > 0) await recomputeProjectProgress(result.project_id);
        res.json(result);
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
    send,
    decline,
    cancel,
    revise,
    copy,
    projectOptions,
    accept,
};
