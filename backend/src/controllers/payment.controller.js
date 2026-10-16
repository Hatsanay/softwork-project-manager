// ทำจ่าย / ใบสำคัญจ่าย + 50 ทวิ (2026-10-16 เฟส 2 ขั้น 2-4) — รับคำขอ → ตรวจข้อมูล (zod) → เรียก service → ตอบ
const pool = require("../config/db");
const { validate } = require("../utils/validate");
const { withTransaction } = require("../utils/with-transaction");
const { paymentCreateSchema, paymentReasonSchema } = require("../shared/schemas/payment.mjs");
const paymentService = require("../services/payment.service");
const payableService = require("../services/payable.service");

async function list(req, res, next) {
    try {
        res.json(
            await paymentService.listPayments(pool, {
                tab: String(req.query.tab ?? "all"),
                search: String(req.query.search ?? ""),
                expenseId: req.query.expense_id ? String(req.query.expense_id) : undefined,
                limit: req.query.limit,
                offset: req.query.offset,
            }),
        );
    } catch (err) {
        next(err);
    }
}

async function payees(req, res, next) {
    try {
        res.json({ data: await paymentService.listPayees(pool) });
    } catch (err) {
        next(err);
    }
}

async function payableExpenses(req, res, next) {
    try {
        const payeeKind = req.query.payee_kind === "employee" ? "employee" : "vendor";
        res.json(
            await paymentService.listPayableExpenses(pool, { payeeKind, payeeId: String(req.query.payee_id ?? "") }),
        );
    } catch (err) {
        next(err);
    }
}

async function getOne(req, res, next) {
    try {
        res.json(await paymentService.getPaymentDetail(pool, req.params.id, req.user));
    } catch (err) {
        next(err);
    }
}

async function create(req, res, next) {
    try {
        const input = validate(paymentCreateSchema, req.body);
        res.status(201).json(await withTransaction((conn) => paymentService.createPayment(conn, input, req.user)));
    } catch (err) {
        next(err);
    }
}

async function cancel(req, res, next) {
    try {
        const { reason, pv_version: version } = validate(paymentReasonSchema, req.body ?? {});
        res.json(
            await withTransaction((conn) =>
                paymentService.cancelPayment(conn, req.params.id, reason, version, req.user),
            ),
        );
    } catch (err) {
        next(err);
    }
}

async function listCertificates(req, res, next) {
    try {
        res.json(
            await paymentService.listCertificates(pool, {
                form: req.query.form ? String(req.query.form) : undefined,
                month: req.query.month ? String(req.query.month) : undefined,
                search: String(req.query.search ?? ""),
                limit: req.query.limit,
                offset: req.query.offset,
            }),
        );
    } catch (err) {
        next(err);
    }
}

async function getCertificate(req, res, next) {
    try {
        res.json(await paymentService.getCertificate(pool, req.params.id));
    } catch (err) {
        next(err);
    }
}

// ─── เจ้าหนี้คงค้าง + รายงาน ภ.ง.ด. (ขั้น 2-5) ───

async function payablesAging(req, res, next) {
    try {
        res.json(await payableService.agingByPayee(pool));
    } catch (err) {
        next(err);
    }
}

async function payablesOfPayee(req, res, next) {
    try {
        const payeeKind = req.params.kind === "employee" ? "employee" : "vendor";
        res.json(await payableService.agingExpensesOfPayee(pool, { payeeKind, payeeId: req.params.payeeId }));
    } catch (err) {
        next(err);
    }
}

async function withholdingReport(req, res, next) {
    try {
        res.json(
            await payableService.withholdingReport(pool, {
                month: String(req.query.month ?? ""),
                form: String(req.query.form ?? ""),
            }),
        );
    } catch (err) {
        next(err);
    }
}

module.exports = {
    list,
    payees,
    payableExpenses,
    getOne,
    create,
    cancel,
    listCertificates,
    getCertificate,
    payablesAging,
    payablesOfPayee,
    withholdingReport,
};
