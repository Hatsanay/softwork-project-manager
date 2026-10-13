// หน้าตั้งค่าบริษัท (2026-10-13) — รับคำขอ → ตรวจข้อมูล (zod) → เรียก service → ตอบ
// กติกาธุรกิจและ SQL อยู่ใน services/company*.service.js และ services/approval-rules.service.js
const pool = require("../config/db");
const { AppError } = require("../utils/app-error");
const { validate } = require("../utils/validate");
const { withTransaction } = require("../utils/with-transaction");
const { hasBit } = require("../utils/permissions");
const { saveCompanyLogo } = require("../utils/company-logo");
const { isRealDateText } = require("../shared/schemas/common.mjs");
const {
    companySchema,
    vatRateSchema,
    branchCreateSchema,
    branchUpdateSchema,
    bankAccountSchema,
    currencyCreateSchema,
    currencyUpdateSchema,
    approvalLevelsSchema,
} = require("../shared/schemas/company.mjs");
const companyService = require("../services/company.service");
const companyListsService = require("../services/company-lists.service");
const approvalRulesService = require("../services/approval-rules.service");

const QUOTATION_DOCUMENT_TYPE = "QT";

async function getSettings(req, res, next) {
    try {
        const canEdit = hasBit(req.user.role_permission, "companySettings");
        res.json(await companyService.getCompanySettings(pool, { canEdit }));
    } catch (err) {
        next(err);
    }
}

async function updateCompany(req, res, next) {
    try {
        const company = validate(companySchema, req.body);
        res.json(await withTransaction((conn) => companyService.updateCompany(conn, company)));
    } catch (err) {
        next(err);
    }
}

async function uploadLogo(req, res, next) {
    try {
        if (!req.file) {
            throw new AppError(400, "VALIDATION", "กรุณาเลือกไฟล์โลโก้", { logo: "กรุณาเลือกไฟล์โลโก้" });
        }
        const logoUrl = await saveCompanyLogo(req.file.buffer);
        res.json(await withTransaction((conn) => companyService.setLogoUrl(conn, logoUrl)));
    } catch (err) {
        next(err);
    }
}

async function removeLogo(req, res, next) {
    try {
        res.json(await withTransaction((conn) => companyService.setLogoUrl(conn, null)));
    } catch (err) {
        next(err);
    }
}

async function addVatRate(req, res, next) {
    try {
        const vatRate = validate(vatRateSchema, req.body);
        const created = await withTransaction((conn) => companyService.addVatRate(conn, vatRate, req.user.user_id));
        res.status(201).json(created);
    } catch (err) {
        next(err);
    }
}

async function deleteVatRate(req, res, next) {
    try {
        if (!isRealDateText(req.params.date)) {
            throw new AppError(404, "VAT_RATE_NOT_FOUND", "ไม่พบอัตรานี้ กรุณาโหลดหน้าใหม่");
        }
        await withTransaction((conn) => companyService.deleteVatRate(conn, req.params.date));
        res.status(204).end();
    } catch (err) {
        next(err);
    }
}

async function createBranch(req, res, next) {
    try {
        const branch = validate(branchCreateSchema, req.body);
        res.status(201).json(await withTransaction((conn) => companyListsService.createBranch(conn, branch)));
    } catch (err) {
        next(err);
    }
}

async function updateBranch(req, res, next) {
    try {
        const branch = validate(branchUpdateSchema, req.body);
        res.json(await withTransaction((conn) => companyListsService.updateBranch(conn, req.params.id, branch)));
    } catch (err) {
        next(err);
    }
}

async function createBankAccount(req, res, next) {
    try {
        const bankAccount = validate(bankAccountSchema, req.body);
        res.status(201).json(await withTransaction((conn) => companyListsService.createBankAccount(conn, bankAccount)));
    } catch (err) {
        next(err);
    }
}

async function updateBankAccount(req, res, next) {
    try {
        const bankAccount = validate(bankAccountSchema, req.body);
        res.json(
            await withTransaction((conn) => companyListsService.updateBankAccount(conn, req.params.id, bankAccount)),
        );
    } catch (err) {
        next(err);
    }
}

async function createCurrency(req, res, next) {
    try {
        const currency = validate(currencyCreateSchema, req.body);
        res.status(201).json(await withTransaction((conn) => companyListsService.createCurrency(conn, currency)));
    } catch (err) {
        next(err);
    }
}

async function updateCurrency(req, res, next) {
    try {
        const currency = validate(currencyUpdateSchema, req.body);
        const currencyCode = String(req.params.code).toUpperCase();
        res.json(await withTransaction((conn) => companyListsService.updateCurrency(conn, currencyCode, currency)));
    } catch (err) {
        next(err);
    }
}

async function saveApprovalLevels(req, res, next) {
    try {
        const { levels } = validate(approvalLevelsSchema, req.body);
        const saved = await withTransaction((conn) =>
            approvalRulesService.saveApprovalRules(conn, QUOTATION_DOCUMENT_TYPE, levels),
        );
        res.json(saved);
    } catch (err) {
        next(err);
    }
}

module.exports = {
    getSettings,
    updateCompany,
    uploadLogo,
    removeLogo,
    addVatRate,
    deleteVatRate,
    createBranch,
    updateBranch,
    createBankAccount,
    updateBankAccount,
    createCurrency,
    updateCurrency,
    saveApprovalLevels,
};
