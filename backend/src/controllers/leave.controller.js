// การลา — เฟส 4 ขั้น 4-3 (2026-10-17)
// รับคำขอ → ตรวจข้อมูล (zod) → เรียก service → ตอบ · ของตัวเองใช้ req.user เสมอ (ไม่รับ id พนักงานจาก URL)
const pool = require("../config/db");
const { validate } = require("../utils/validate");
const { withTransaction } = require("../utils/with-transaction");
const { todayBangkok } = require("../utils/bangkok-time");
const { AppError } = require("../utils/app-error");
const {
    savePrivateFile,
    resolvePrivateFile,
    deletePrivateFile,
    contentTypeOf,
    cleanUploadedFileName,
} = require("../utils/private-file");
const {
    leaveRequestSchema,
    leaveActionSchema,
    leaveReasonActionSchema,
    leaveCancelSchema,
} = require("../shared/schemas/leave.mjs");
const leaveService = require("../services/leave.service");

const ATTACHMENT_FOLDER = "leave-attachments";
const YEAR_PATTERN = /^\d{4}$/;
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function requestedYear(query) {
    const requested = String(query.year ?? "");
    return YEAR_PATTERN.test(requested) ? Number(requested) : Number(todayBangkok().slice(0, 4));
}

function requestedMonth(query) {
    const requested = String(query.month ?? "");
    return MONTH_PATTERN.test(requested) ? requested : todayBangkok().slice(0, 7);
}

const requestId = (req) => Number(req.params.id);

// ─── อ่าน ───────────────────────────────────────────────────────────────────────────────────

async function getMine(req, res, next) {
    try {
        res.json(await leaveService.getMine(pool, req.user.user_id, requestedYear(req.query)));
    } catch (err) {
        next(err);
    }
}

// ตัวอย่างก่อนขอลา: จำนวนวัน · วันที่ไม่นับ · ยอดคงเหลือหลังลา (ฟอร์มเรียกทุกครั้งที่เปลี่ยนวัน/ประเภท)
async function preview(req, res, next) {
    try {
        res.json(await leaveService.preview(pool, req.user.user_id, req.query));
    } catch (err) {
        next(err);
    }
}

async function getCalendar(req, res, next) {
    try {
        res.json(await leaveService.getCalendar(pool, requestedMonth(req.query)));
    } catch (err) {
        next(err);
    }
}

async function listPending(req, res, next) {
    try {
        const status = req.query.status === "approved" ? "approved" : "pending";
        res.json({ data: await leaveService.listPending(pool, req.user, status) });
    } catch (err) {
        next(err);
    }
}

async function getEmployeeBalances(req, res, next) {
    try {
        res.json(await leaveService.getEmployeeBalances(pool, req.params.employeeId, requestedYear(req.query)));
    } catch (err) {
        next(err);
    }
}

// ─── ของตัวเอง ───────────────────────────────────────────────────────────────────────────────

async function create(req, res, next) {
    try {
        const request = validate(leaveRequestSchema, req.body);
        res.status(201).json(await withTransaction((conn) => leaveService.createDraft(conn, req.user, request)));
    } catch (err) {
        next(err);
    }
}

async function update(req, res, next) {
    try {
        const request = validate(leaveRequestSchema, req.body);
        const { lr_version: version } = validate(leaveActionSchema, req.body);
        res.json(
            await withTransaction((conn) => leaveService.updateDraft(conn, req.user, requestId(req), version, request)),
        );
    } catch (err) {
        next(err);
    }
}

async function remove(req, res, next) {
    try {
        const { lr_version: version } = validate(leaveActionSchema, req.body ?? {});
        const { filePaths } = await withTransaction((conn) =>
            leaveService.deleteDraft(conn, req.user, requestId(req), version),
        );
        for (const filePath of filePaths) await deletePrivateFile(filePath).catch(() => {});
        res.status(204).end();
    } catch (err) {
        next(err);
    }
}

// action ที่รับแค่เวอร์ชัน (ส่ง / ดึงกลับ / อนุมัติ)
function versionAction(serviceFunction) {
    return async function (req, res, next) {
        try {
            const { lr_version: version } = validate(leaveActionSchema, req.body);
            res.json(await withTransaction((conn) => serviceFunction(conn, req.user, requestId(req), version)));
        } catch (err) {
            next(err);
        }
    };
}

async function cancelOwn(req, res, next) {
    try {
        const { lr_version: version, reason } = validate(leaveCancelSchema, req.body);
        res.json(
            await withTransaction((conn) => leaveService.cancelOwn(conn, req.user, requestId(req), version, reason)),
        );
    } catch (err) {
        next(err);
    }
}

// ─── ผู้อนุมัติ ───────────────────────────────────────────────────────────────────────────────

function reasonAction(serviceFunction) {
    return async function (req, res, next) {
        try {
            const { lr_version: version, reason } = validate(leaveReasonActionSchema, req.body);
            res.json(await withTransaction((conn) => serviceFunction(conn, req.user, requestId(req), version, reason)));
        } catch (err) {
            next(err);
        }
    };
}

// ─── ไฟล์แนบ ────────────────────────────────────────────────────────────────────────────────

async function uploadAttachment(req, res, next) {
    let newPath = null;
    try {
        if (!req.file) {
            throw new AppError(400, "VALIDATION", "กรุณาเลือกไฟล์", { file: "เลือกไฟล์ PDF, JPG หรือ PNG" });
        }
        newPath = await savePrivateFile(ATTACHMENT_FOLDER, `leave${requestId(req)}`, req.file.buffer, "file");
        const file = {
            storedPath: newPath,
            fileName: cleanUploadedFileName(req.file.originalname, "ไฟล์แนบการลา"),
            fileSize: req.file.size,
        };
        const created = await withTransaction((conn) =>
            leaveService.addAttachment(conn, req.user, requestId(req), file),
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
            leaveService.removeAttachment(conn, req.user, requestId(req), Number(req.params.fileId)),
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
        const { storedPath, fileName } = await leaveService.findAttachment(
            pool,
            req.user,
            requestId(req),
            Number(req.params.fileId),
        );
        const missing = () => new AppError(404, "LEAVE_FILE_MISSING", "ไม่พบไฟล์บนเซิร์ฟเวอร์ · แนบไฟล์ใหม่");
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
    getMine,
    preview,
    getCalendar,
    listPending,
    getEmployeeBalances,
    create,
    update,
    remove,
    submit: versionAction(leaveService.submit),
    withdraw: versionAction(leaveService.withdraw),
    cancelOwn,
    approve: versionAction(leaveService.approve),
    reject: reasonAction(leaveService.reject),
    cancelApproved: reasonAction(leaveService.cancelApproved),
    uploadAttachment,
    removeAttachment,
    downloadAttachment,
};
