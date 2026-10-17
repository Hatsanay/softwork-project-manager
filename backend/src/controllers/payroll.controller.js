// รอบเงินเดือน + สลิป + ค่าลดหย่อนรายปี — เฟส 4 ขั้น 4-4 (2026-10-17)
// รับคำขอ → ตรวจข้อมูล (zod) → เรียก service → ตอบ · สิทธิ์ระดับเส้นทางอยู่ใน payroll.routes.js
const pool = require("../config/db");
const { validate } = require("../utils/validate");
const { withTransaction } = require("../utils/with-transaction");
const { todayBangkok } = require("../utils/bangkok-time");
const {
    payrollRunSchema,
    payrollPayDateSchema,
    payrollActionSchema,
    payrollReasonSchema,
    payrollPaidSchema,
    payrollLineSchema,
    taxProfileSchema,
} = require("../shared/schemas/payroll.mjs");
const payrollService = require("../services/payroll.service");
const taxProfileService = require("../services/tax-profile.service");
const reportService = require("../services/payroll-report.service");

const runId = (req) => Number(req.params.id);

// ห่อ handler ที่คืนผลลัพธ์ — undefined = 204
function handle(work) {
    return async function (req, res, next) {
        try {
            const result = await work(req);
            if (result === undefined) res.status(204).end();
            else res.json(result);
        } catch (err) {
            next(err);
        }
    };
}

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function requestedMonth(req) {
    const month = String(req.query.month ?? "");
    return MONTH_PATTERN.test(month) ? month : todayBangkok().slice(0, 7);
}

function requestedQueryYear(req) {
    const year = Number(req.query.year);
    return Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : Number(todayBangkok().slice(0, 4));
}

function requestedYear(req) {
    const year = Number(req.params.year);
    return Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : Number(todayBangkok().slice(0, 4));
}

async function createRun(req, res, next) {
    try {
        const payload = validate(payrollRunSchema, req.body);
        res.status(201).json(await withTransaction((conn) => payrollService.createRun(conn, req.user, payload)));
    } catch (err) {
        next(err);
    }
}

module.exports = {
    listRuns: handle(async () => ({ data: await payrollService.listRuns(pool) })),
    getRun: handle((req) => payrollService.getRun(pool, runId(req), req.user)),
    createRun,
    updateRun: handle((req) => {
        const { pr_version: version, ...payload } = validate(payrollPayDateSchema, req.body);
        return withTransaction((conn) => payrollService.updateRun(conn, runId(req), version, payload));
    }),
    recalculate: handle((req) => {
        const { pr_version: version } = validate(payrollActionSchema, req.body);
        return withTransaction((conn) => payrollService.recalculate(conn, runId(req), version));
    }),
    addLine: handle((req) => {
        const { pr_version: version, ...line } = validate(payrollLineSchema, req.body);
        return withTransaction((conn) =>
            payrollService.addManualLine(conn, req.user, runId(req), Number(req.params.itemId), version, line),
        );
    }),
    removeLine: handle((req) => {
        const { pr_version: version } = validate(payrollActionSchema, req.body ?? {});
        return withTransaction((conn) =>
            payrollService.removeManualLine(
                conn,
                runId(req),
                Number(req.params.itemId),
                Number(req.params.lineId),
                version,
            ),
        );
    }),
    submit: handle((req) => {
        const { pr_version: version } = validate(payrollActionSchema, req.body);
        return withTransaction((conn) => payrollService.submit(conn, runId(req), version));
    }),
    approve: handle((req) => {
        const { pr_version: version } = validate(payrollActionSchema, req.body);
        return withTransaction((conn) => payrollService.approve(conn, req.user, runId(req), version));
    }),
    returnToDraft: handle((req) => {
        const { pr_version: version, reason } = validate(payrollReasonSchema, req.body);
        return withTransaction((conn) => payrollService.returnToDraft(conn, req.user, runId(req), version, reason));
    }),
    markPaid: handle((req) => {
        const { pr_version: version, ...payload } = validate(payrollPaidSchema, req.body);
        return withTransaction((conn) => payrollService.markPaid(conn, req.user, runId(req), version, payload));
    }),
    cancel: handle((req) => {
        const { pr_version: version, reason } = validate(payrollReasonSchema, req.body);
        return withTransaction((conn) => payrollService.cancelRun(conn, req.user, runId(req), version, reason));
    }),

    listMyPayslips: handle(async (req) => ({ data: await payrollService.listMyPayslips(pool, req.user.user_id) })),
    getPayslip: handle((req) => payrollService.getPayslip(pool, req.user, Number(req.params.itemId))),

    pnd1Report: handle((req) => reportService.monthlyPnd1(pool, requestedMonth(req))),
    ssoReport: handle((req) => reportService.monthlySso(pool, requestedMonth(req))),
    pnd1aReport: handle((req) => reportService.annualPnd1a(pool, requestedQueryYear(req))),
    certificates: handle((req) =>
        reportService.annualCertificates(
            pool,
            requestedQueryYear(req),
            req.query.employee_id ? String(req.query.employee_id) : null,
        ),
    ),
    myCertificates: handle((req) => reportService.myCertificates(pool, req.user.user_id, requestedQueryYear(req))),

    getTaxProfile: handle((req) => taxProfileService.getTaxProfile(pool, req.params.employeeId, requestedYear(req))),
    saveTaxProfile: handle((req) => {
        const profile = validate(taxProfileSchema, req.body);
        return withTransaction((conn) =>
            taxProfileService.saveTaxProfile(conn, req.user, req.params.employeeId, requestedYear(req), profile),
        );
    }),
};
