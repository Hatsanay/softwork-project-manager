// ใบเสร็จรับเงิน + ลูกหนี้คงค้าง (2026-10-15 ขั้น 1C-2) — รับคำขอ → ตรวจข้อมูล (zod) → เรียก service → ตอบ
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
const { receiptCreateSchema, receiptDetailsSchema, receiptReasonSchema } = require("../shared/schemas/receipt.mjs");
const receiptService = require("../services/receipt.service");
const receivableService = require("../services/receivable.service");

const WHT_FOLDER = "wht-certificates";
async function list(req, res, next) {
    try {
        const result = await receiptService.listReceipts(pool, {
            tab: String(req.query.tab ?? "all"),
            search: String(req.query.search ?? ""),
            clientId: req.query.client_id ? String(req.query.client_id) : undefined,
            invoiceId: req.query.invoice_id ? String(req.query.invoice_id) : undefined,
            limit: req.query.limit,
            offset: req.query.offset,
        });
        res.json(result);
    } catch (err) {
        next(err);
    }
}

async function receivableInvoices(req, res, next) {
    try {
        const result = await receiptService.listReceivableInvoices(pool, {
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
        res.json(await receiptService.getReceiptDetail(pool, req.params.id, req.user));
    } catch (err) {
        next(err);
    }
}

async function create(req, res, next) {
    try {
        const input = validate(receiptCreateSchema, req.body);
        const created = await withTransaction((conn) => receiptService.createReceipt(conn, input, req.user));
        res.status(201).json(created);
    } catch (err) {
        next(err);
    }
}

async function updateDetails(req, res, next) {
    try {
        const input = validate(receiptDetailsSchema, req.body ?? {});
        res.json(await withTransaction((conn) => receiptService.updateDetails(conn, req.params.id, input)));
    } catch (err) {
        next(err);
    }
}

async function cancel(req, res, next) {
    try {
        const { reason, rc_version: version } = validate(receiptReasonSchema, req.body ?? {});
        res.json(
            await withTransaction((conn) =>
                receiptService.cancelReceipt(conn, req.params.id, reason, version, req.user),
            ),
        );
    } catch (err) {
        next(err);
    }
}

// แนบ/เปลี่ยนไฟล์ 50 ทวิ: เขียนไฟล์ใหม่ก่อน → บันทึก DB → สำเร็จแล้วค่อยลบไฟล์เก่า · DB ไม่สำเร็จ = ลบไฟล์ใหม่ทิ้ง (R-C10)
async function uploadWhtFile(req, res, next) {
    let newPath = null;
    try {
        if (!req.file) {
            throw new AppError(400, "VALIDATION", "กรุณาเลือกไฟล์", { file: "เลือกไฟล์ PDF, JPG หรือ PNG" });
        }
        const filePrefix =
            String(req.params.id)
                .replace(/[^A-Za-z0-9]/g, "")
                .slice(0, 18) || "receipt";
        newPath = await savePrivateFile(WHT_FOLDER, filePrefix, req.file.buffer, "file");
        const fileName = cleanUploadedFileName(req.file.originalname, "50-tawi");
        const { oldPath } = await withTransaction((conn) =>
            receiptService.setWhtFile(conn, req.params.id, newPath, fileName),
        );
        newPath = null;
        if (oldPath) await deletePrivateFile(oldPath).catch(() => {});
        res.json({ rc_id: req.params.id, rc_wht_file_name: fileName });
    } catch (err) {
        if (newPath) await deletePrivateFile(newPath).catch(() => {});
        next(err);
    }
}

async function removeWhtFile(req, res, next) {
    try {
        const { oldPath } = await withTransaction((conn) => receiptService.setWhtFile(conn, req.params.id, null, null));
        if (oldPath) await deletePrivateFile(oldPath).catch(() => {});
        res.status(204).end();
    } catch (err) {
        next(err);
    }
}

// เปิดไฟล์ 50 ทวิ ผ่านการตรวจสิทธิ์ (ไม่มีลิงก์ static) · ไม่ให้ browser/proxy เก็บ cache
async function downloadWhtFile(req, res, next) {
    try {
        const { storedPath, fileName } = await receiptService.findWhtFile(pool, req.params.id);
        const fullPath = resolvePrivateFile(storedPath);
        if (!fullPath) throw new AppError(404, "WHT_FILE_MISSING", "ไม่พบไฟล์ 50 ทวิ บนเซิร์ฟเวอร์ — แนบไฟล์ใหม่");
        res.setHeader("Content-Type", contentTypeOf(storedPath));
        res.setHeader("Cache-Control", "private, no-store");
        res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(fileName ?? "50-tawi")}`);
        res.sendFile(fullPath, (err) => {
            if (!err) return;
            if (err.code === "ENOENT") {
                next(new AppError(404, "WHT_FILE_MISSING", "ไม่พบไฟล์ 50 ทวิ บนเซิร์ฟเวอร์ — แนบไฟล์ใหม่"));
                return;
            }
            next(err);
        });
    } catch (err) {
        next(err);
    }
}

async function aging(req, res, next) {
    try {
        res.json(await receivableService.agingByClient(pool));
    } catch (err) {
        next(err);
    }
}

async function agingOfClient(req, res, next) {
    try {
        res.json(await receivableService.agingInvoicesOfClient(pool, req.params.clientId));
    } catch (err) {
        next(err);
    }
}

module.exports = {
    list,
    receivableInvoices,
    getOne,
    create,
    updateDetails,
    cancel,
    uploadWhtFile,
    removeWhtFile,
    downloadWhtFile,
    aging,
    agingOfClient,
};
