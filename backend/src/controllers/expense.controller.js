// ค่าใช้จ่าย / บิลผู้ขาย (ขั้น 2-2) และใบเบิกเงินพนักงาน (ขั้น 2-3) — รับคำขอ → ตรวจข้อมูล (zod) → เรียก service → ตอบ
// ชนิดเอกสารมาจากเส้นทาง (routes/expense.routes.js ตั้ง req.expenseKind) — /expenses = บิล · /claims = ใบเบิก
const pool = require("../config/db");
const { AppError } = require("../utils/app-error");
const { validate } = require("../utils/validate");
const { withTransaction } = require("../utils/with-transaction");
const {
    savePrivateFile,
    resolvePrivateFile,
    deletePrivateFile,
    contentTypeOf,
    cleanUploadedFileName,
} = require("../utils/private-file");
const {
    expenseBillDraftSchema,
    expenseClaimDraftSchema,
    expenseActionSchema,
    expenseReasonSchema,
} = require("../shared/schemas/expense.mjs");
const expenseService = require("../services/expense.service");
const expenseWorkflowService = require("../services/expense-workflow.service");

// ไฟล์เอกสารของผู้ขาย (มีเลขผู้เสียภาษี/ข้อมูลส่วนตัว) — เก็บต้นฉบับไม่บีบอัด เป็นหลักฐานทางภาษี (R-P7)
const ATTACHMENT_FOLDER = "expense-documents";

/** @returns {"bill" | "claim"} */
function kindOf(req) {
    return req.expenseKind === "claim" ? "claim" : "bill";
}

function draftSchemaOf(req) {
    return kindOf(req) === "claim" ? expenseClaimDraftSchema : expenseBillDraftSchema;
}

async function list(req, res, next) {
    try {
        const result = await expenseService.listExpenses(
            pool,
            {
                kind: kindOf(req),
                scope: String(req.query.scope ?? "mine"),
                tab: String(req.query.tab ?? "all"),
                search: String(req.query.search ?? ""),
                vendorId: req.query.vendor_id ? String(req.query.vendor_id) : undefined,
                projectId: req.query.project_id ? String(req.query.project_id) : undefined,
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

async function projectOptions(req, res, next) {
    try {
        res.json({ data: await expenseService.listProjectOptions(pool, String(req.query.search ?? "")) });
    } catch (err) {
        next(err);
    }
}

async function getOne(req, res, next) {
    try {
        res.json(await expenseService.getExpenseDetail(pool, req.params.id, req.user, kindOf(req)));
    } catch (err) {
        next(err);
    }
}

async function create(req, res, next) {
    try {
        const draft = validate(draftSchemaOf(req), req.body);
        const created = await withTransaction((conn) =>
            kindOf(req) === "claim"
                ? expenseService.createClaimDraft(conn, draft, req.user)
                : expenseService.createBillDraft(conn, draft, req.user),
        );
        res.status(201).json(created);
    } catch (err) {
        next(err);
    }
}

async function update(req, res, next) {
    try {
        const draft = validate(draftSchemaOf(req), req.body);
        res.json(
            await withTransaction((conn) =>
                expenseService.updateDraft(conn, req.params.id, draft, req.user, kindOf(req)),
            ),
        );
    } catch (err) {
        next(err);
    }
}

// ลบร่าง → commit แล้วค่อยลบไฟล์แนบจากดิสก์ (rollback แล้วไฟล์ยังอยู่ครบ)
async function remove(req, res, next) {
    try {
        const { ex_version: version } = validate(expenseActionSchema, req.body ?? {});
        const { filePaths } = await withTransaction((conn) =>
            expenseService.deleteDraft(conn, req.params.id, version, req.user, kindOf(req)),
        );
        for (const filePath of filePaths) await deletePrivateFile(filePath).catch(() => {});
        res.status(204).end();
    } catch (err) {
        next(err);
    }
}

async function submit(req, res, next) {
    try {
        const { ex_version: version } = validate(expenseActionSchema, req.body ?? {});
        res.json(
            await withTransaction((conn) =>
                expenseWorkflowService.submit(conn, req.params.id, version, req.user, kindOf(req)),
            ),
        );
    } catch (err) {
        next(err);
    }
}

async function approve(req, res, next) {
    try {
        const { ex_version: version } = validate(expenseActionSchema, req.body ?? {});
        res.json(
            await withTransaction((conn) =>
                expenseWorkflowService.approve(conn, req.params.id, version, req.user, kindOf(req)),
            ),
        );
    } catch (err) {
        next(err);
    }
}

async function returnToDraft(req, res, next) {
    try {
        const { reason, ex_version: version } = validate(expenseReasonSchema, req.body ?? {});
        res.json(
            await withTransaction((conn) =>
                expenseWorkflowService.returnToDraft(conn, req.params.id, reason, version, req.user, kindOf(req)),
            ),
        );
    } catch (err) {
        next(err);
    }
}

async function cancel(req, res, next) {
    try {
        const { reason, ex_version: version } = validate(expenseReasonSchema, req.body ?? {});
        res.json(
            await withTransaction((conn) =>
                expenseWorkflowService.cancel(conn, req.params.id, reason, version, req.user, kindOf(req)),
            ),
        );
    } catch (err) {
        next(err);
    }
}

async function copy(req, res, next) {
    try {
        const created = await withTransaction((conn) => expenseWorkflowService.copyBill(conn, req.params.id, req.user));
        res.status(201).json(created);
    } catch (err) {
        next(err);
    }
}

// แนบไฟล์: เขียนไฟล์ก่อน → บันทึก DB · DB ไม่สำเร็จ = ลบไฟล์ใหม่ทิ้ง (ไม่เหลือไฟล์กำพร้า)
async function uploadAttachment(req, res, next) {
    let newPath = null;
    try {
        if (!req.file) {
            throw new AppError(400, "VALIDATION", "กรุณาเลือกไฟล์", { file: "เลือกไฟล์ PDF, JPG หรือ PNG" });
        }
        const filePrefix =
            String(req.params.id)
                .replace(/[^A-Za-z0-9]/g, "")
                .slice(0, 18) || "expense";
        newPath = await savePrivateFile(ATTACHMENT_FOLDER, filePrefix, req.file.buffer, "file");
        const file = {
            storedPath: newPath,
            fileName: cleanUploadedFileName(
                req.file.originalname,
                kindOf(req) === "claim" ? "ใบเสร็จ" : "เอกสารผู้ขาย",
            ),
            fileSize: req.file.size,
        };
        const created = await withTransaction((conn) =>
            expenseService.addAttachment(conn, req.params.id, file, req.user, kindOf(req)),
        );
        newPath = null;
        res.status(201).json(created);
    } catch (err) {
        if (newPath) await deletePrivateFile(newPath).catch(() => {});
        next(err);
    }
}

async function removeAttachment(req, res, next) {
    try {
        const { oldPath } = await withTransaction((conn) =>
            expenseService.removeAttachment(conn, req.params.id, req.params.fileId, req.user, kindOf(req)),
        );
        await deletePrivateFile(oldPath).catch(() => {});
        res.status(204).end();
    } catch (err) {
        next(err);
    }
}

// เปิดไฟล์แนบผ่านการตรวจสิทธิ์ (ไม่มีลิงก์ static) · ไม่ให้ browser/proxy เก็บ cache
async function downloadAttachment(req, res, next) {
    try {
        const { storedPath, fileName } = await expenseService.findAttachment(
            pool,
            req.params.id,
            req.params.fileId,
            req.user,
            kindOf(req),
        );
        const missing = () => new AppError(404, "EXPENSE_FILE_MISSING", "ไม่พบไฟล์บนเซิร์ฟเวอร์ · แนบไฟล์ใหม่");
        const fullPath = resolvePrivateFile(storedPath);
        if (!fullPath) throw missing();
        res.setHeader("Content-Type", contentTypeOf(storedPath));
        res.setHeader("Cache-Control", "private, no-store");
        res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`);
        res.sendFile(fullPath, (err) => {
            if (!err) return;
            next(err.code === "ENOENT" ? missing() : err);
        });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    list,
    projectOptions,
    getOne,
    create,
    update,
    remove,
    submit,
    approve,
    returnToDraft,
    cancel,
    copy,
    uploadAttachment,
    removeAttachment,
    downloadAttachment,
};
