// ย้ายแผนก/สาขา · บัตรพนักงาน · รูปพนักงาน (2026-10-18 — docs/plans/2026-10-18-employee-department-codes.md)
// + เปิด/ปิดการเข้าระบบหลังพ้นสภาพ (docs/plans/2026-10-18-user-employee-link.md)
// รับคำขอ → ตรวจข้อมูล (zod) → เรียก service → ตอบ
const pool = require("../config/db");
const { AppError } = require("../utils/app-error");
const { validate } = require("../utils/validate");
const { withTransaction } = require("../utils/with-transaction");
const { saveEmployeePhoto } = require("../utils/employee-photo");
const {
    employeeTransferSchema,
    employeeCardIssueSchema,
    employeeLoginClosureSchema,
} = require("../shared/schemas/people.mjs");
const employeeService = require("../services/employee.service");
const employeeCodeService = require("../services/employee-code.service");

function cardIdOf(req) {
    const cardId = Number(req.params.cardId);
    if (!Number.isInteger(cardId) || cardId <= 0) {
        throw new AppError(404, "CARD_NOT_FOUND", "ไม่พบบัตรใบนี้ กรุณาโหลดหน้าใหม่");
    }
    return cardId;
}

async function transfer(req, res, next) {
    try {
        const request = validate(employeeTransferSchema, req.body);
        res.json(
            await withTransaction((conn) => employeeService.transferEmployee(conn, req.params.id, request, req.user)),
        );
    } catch (err) {
        next(err);
    }
}

async function issueCard(req, res, next) {
    try {
        const request = validate(employeeCardIssueSchema, req.body);
        res.status(201).json(
            await withTransaction((conn) => employeeService.issueEmployeeCard(conn, req.params.id, request, req.user)),
        );
    } catch (err) {
        next(err);
    }
}

async function markPrinted(req, res, next) {
    try {
        const cardId = cardIdOf(req);
        res.json(
            await withTransaction((conn) => employeeCodeService.markCardPrinted(conn, req.params.id, cardId)),
        );
    } catch (err) {
        next(err);
    }
}

async function markReturned(req, res, next) {
    try {
        const cardId = cardIdOf(req);
        res.json(
            await withTransaction((conn) => employeeCodeService.markCardReturned(conn, req.params.id, cardId)),
        );
    } catch (err) {
        next(err);
    }
}

// คิวงานบัตรของฝ่ายบุคคล: ?kind=pending_print (รอพิมพ์) | not_returned (ยังไม่ได้คืน) | expiring (ใกล้หมดอายุ)
const CARD_QUEUE_KINDS = new Set(["pending_print", "not_returned", "expiring"]);

async function cardQueue(req, res, next) {
    try {
        const kind = CARD_QUEUE_KINDS.has(req.query.kind) ? req.query.kind : "pending_print";
        res.json({ data: await employeeCodeService.listCardQueue(pool, kind) });
    } catch (err) {
        next(err);
    }
}

async function uploadPhoto(req, res, next) {
    try {
        if (!req.file) {
            throw new AppError(400, "VALIDATION", "กรุณาเลือกรูปพนักงาน", { photo: "กรุณาเลือกรูปพนักงาน" });
        }
        const photoUrl = await saveEmployeePhoto(req.file.buffer, req.params.id);
        res.json(await withTransaction((conn) => employeeService.setEmployeePhoto(conn, req.params.id, photoUrl)));
    } catch (err) {
        next(err);
    }
}

async function removePhoto(req, res, next) {
    try {
        res.json(await withTransaction((conn) => employeeService.setEmployeePhoto(conn, req.params.id, null)));
    } catch (err) {
        next(err);
    }
}

// เปิด/ปิดการเข้าระบบหลังพ้นสภาพ (2026-10-18 · docs/plans/2026-10-18-user-employee-link.md ข้อ 2)
async function setLoginClosure(req, res, next) {
    try {
        const request = validate(employeeLoginClosureSchema, req.body);
        res.json(await withTransaction((conn) => employeeService.setLoginClosure(conn, req.params.id, request)));
    } catch (err) {
        next(err);
    }
}

module.exports = { transfer, issueCard, markPrinted, markReturned, cardQueue, uploadPhoto, removePhoto, setLoginClosure };
