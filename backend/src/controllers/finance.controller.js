// การเงินโปรเจกต์ + รายงานขาย + ไฟล์ส่งนักบัญชี (2026-10-15 ช่วง 1D) — รับคำขอ → เรียก service → ตอบ
const pool = require("../config/db");
const projectFinanceService = require("../services/project-finance.service");
const salesReportService = require("../services/sales-report.service");
const accountingExportService = require("../services/accounting-export.service");

async function projectFinance(req, res, next) {
    try {
        res.json(await projectFinanceService.getProjectFinance(pool, req.params.id));
    } catch (err) {
        next(err);
    }
}

async function salesSummary(req, res, next) {
    try {
        res.json(await salesReportService.salesSummary(pool, { from: req.query.from, to: req.query.to }));
    } catch (err) {
        next(err);
    }
}

async function monthlySales(req, res, next) {
    try {
        res.json(await salesReportService.monthlySales(pool, req.query.months));
    } catch (err) {
        next(err);
    }
}

// ไฟล์ Excel ส่งนักบัญชี — สร้างแล้วส่งเลย ไม่เก็บบนเซิร์ฟเวอร์ · ไม่ให้ cache (มีเลขผู้เสียภาษีของลูกค้า)
async function accountingExport(req, res, next) {
    try {
        const { buffer, fileName, month } = await accountingExportService.buildAccountingExport(
            pool,
            req.query.month,
            req.user,
        );
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="softwork-accounting-${month}.xlsx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        );
        res.setHeader("Cache-Control", "private, no-store");
        res.send(buffer);
    } catch (err) {
        next(err);
    }
}

module.exports = { projectFinance, salesSummary, monthlySales, accountingExport };
