// ลิงก์เลือกบริการ + คำขอบริการ (2026-10-25 · S-1) — รับคำขอ → ตรวจข้อมูล (zod) → เรียก service → ตอบ
// ฝั่งพนักงาน: manageServiceRequests (คุมที่ route) · ฝั่งลูกค้า: ไม่ต้อง login (หน้าร้าน / ส่งคำขอ / หน้าสถานะ)
const pool = require("../config/db");
const { AppError } = require("../utils/app-error");
const { validate } = require("../utils/validate");
const { withTransaction } = require("../utils/with-transaction");
const { sendServiceRequestEmail } = require("../utils/mailer");
const { contentTypeOf, deletePrivateFile, isViewableFile, resolvePrivateFile } = require("../utils/private-file");
const {
    groupOrderSchema,
    questionMoveSchema,
    questionOrderSchema,
    requirementGroupSchema,
    requirementQuestionSchema,
} = require("../shared/schemas/requirement.mjs");
const requirementService = require("../services/requirement.service");
const {
    serviceRequestClientSchema,
    serviceRequestConfirmSchema,
    serviceRequestFastworkAcceptSchema,
    serviceRequestItemsSchema,
    serviceRequestReasonSchema,
} = require("../shared/schemas/service-request.mjs");
const {
    orderAcceptSchema,
    orderLinkSchema,
    orderLinkUpdateSchema,
    orderSubmitSchema,
    serviceRequestSettingsSchema,
} = require("../shared/schemas/order-link.mjs");
const orderLinkService = require("../services/order-link.service");
const orderPublicService = require("../services/order-public.service");
const serviceRequestService = require("../services/service-request.service");

const numericId = (value) => {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : -1;
};

/** ตอบด้วยผลของ service · status 201 สำหรับการสร้าง */
function handle(work, status = 200) {
    return async (req, res, next) => {
        try {
            res.status(status).json(await work(req));
        } catch (err) {
            next(err);
        }
    };
}

// เปิดลิงก์ด้วยรหัสผิดซ้ำๆ จาก IP เดียว = สุ่มเดารหัสสั้น → พักไว้ 15 นาที (เก็บในหน่วยความจำ รีสตาร์ทแล้วหาย รับได้)
const LOOKUP_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_LOOKUPS = 30;
const failedLookups = new Map();

function assertNotGuessing(ip) {
    const entry = failedLookups.get(ip);
    if (entry && entry.resetAt > Date.now() && entry.count >= MAX_FAILED_LOOKUPS) {
        throw new AppError(429, "ORDER_LOOKUP_LIMITED", "เปิดลิงก์ผิดหลายครั้งเกินไป กรุณารอ 15 นาทีแล้วลองใหม่");
    }
}

function recordFailedLookup(ip) {
    const now = Date.now();
    const entry = failedLookups.get(ip);
    if (!entry || entry.resetAt <= now) {
        failedLookups.set(ip, { count: 1, resetAt: now + LOOKUP_WINDOW_MS });
        return;
    }
    entry.count += 1;
}

/**
 * ส่งไฟล์แนบของคำตอบ (ชื่อไฟล์เดิม) · รูป/PDF เปิดในแท็บได้ · ไฟล์งานออกแบบ (SVG PSD ZIP) ดาวน์โหลดเท่านั้น
 * SVG ฝังสคริปต์ได้ ถ้าเบราว์เซอร์เปิดในโดเมนเรา สคริปต์จะรันด้วยสิทธิ์ของคนที่ login อยู่ (2026-10-26 Q-1)
 */
function sendPrivate(res, next, file) {
    const fullPath = resolvePrivateFile(file.svf_file_path);
    if (!fullPath) throw new AppError(404, "SERVICE_REQUEST_FILE_NOT_FOUND", "ไม่พบไฟล์นี้");
    const disposition = isViewableFile(file.svf_file_path) ? "inline" : "attachment";
    res.setHeader("Content-Type", contentTypeOf(file.svf_file_path));
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", `${disposition}; filename*=UTF-8''${encodeURIComponent(file.svf_original_name)}`);
    res.sendFile(fullPath, (err) => {
        if (err && !res.headersSent) next(new AppError(404, "SERVICE_REQUEST_FILE_NOT_FOUND", "ไม่พบไฟล์นี้"));
    });
}

/** หน้าสาธารณะ: นับเฉพาะครั้งที่หาลิงก์ไม่เจอ */
function publicHandle(work, status = 200) {
    return async (req, res, next) => {
        try {
            assertNotGuessing(req.ip);
            res.status(status).json(await work(req));
        } catch (err) {
            if (err instanceof AppError && err.status === 404) recordFailedLookup(req.ip);
            next(err);
        }
    };
}

module.exports = {
    // ─── ลิงก์ ───
    listLinks: handle(async () => ({ data: await orderLinkService.listLinks(pool) })),
    getLink: handle((req) => orderLinkService.findLink(pool, numericId(req.params.id))),
    createLink: handle((req) => {
        const input = validate(orderLinkSchema, req.body);
        return withTransaction((conn) => orderLinkService.createLink(conn, req.user, input));
    }, 201),
    updateLink: handle((req) => {
        const input = validate(orderLinkUpdateSchema, req.body);
        return withTransaction((conn) => orderLinkService.updateLink(conn, numericId(req.params.id), input));
    }),
    getSettings: handle(() => orderLinkService.getSettings(pool)),
    updateSettings: handle((req) => {
        const input = validate(serviceRequestSettingsSchema, req.body);
        return withTransaction((conn) => orderLinkService.updateSettings(conn, input));
    }),

    // ─── คำขอ (พนักงาน) ───
    listRequests: handle((req) => serviceRequestService.listRequests(pool, { status: req.query.status, linkId: Number(req.query.link) })),
    getRequest: handle((req) => serviceRequestService.findRequest(pool, req.params.id)),
    // ─── ตรวจคำขอ (S-3) ───
    bindRequestClient: handle((req) => {
        const input = validate(serviceRequestClientSchema, req.body);
        return withTransaction((conn) => serviceRequestService.bindClient(conn, req.params.id, input));
    }),
    updateRequestItems: handle((req) => {
        const input = validate(serviceRequestItemsSchema, req.body);
        return withTransaction((conn) => serviceRequestService.updateItems(conn, req.params.id, input));
    }),
    rejectRequest: handle((req) => {
        const input = validate(serviceRequestReasonSchema, req.body);
        return withTransaction((conn) => serviceRequestService.finish(conn, req.params.id, input, "rejected"));
    }),
    closeRequest: handle((req) => {
        const input = validate(serviceRequestReasonSchema, req.body);
        return withTransaction((conn) => serviceRequestService.finish(conn, req.params.id, input, "closed"));
    }),
    acceptRequestOnFastwork: handle((req) => {
        const input = validate(serviceRequestFastworkAcceptSchema, req.body);
        return withTransaction((conn) => serviceRequestService.acceptOnFastwork(conn, req.user, req.params.id, input));
    }),
    closeProjectLinks: handle((req) => withTransaction((conn) => serviceRequestService.closeProjectLinks(conn, req.params.id))),
    confirmRequest: handle((req) => {
        const input = validate(serviceRequestConfirmSchema, req.body);
        return withTransaction((conn) => serviceRequestService.confirm(conn, req.user, req.params.id, input));
    }),
    downloadRequestFile: async (req, res, next) => {
        try {
            const file = await serviceRequestService.findFile(pool, req.params.id, numericId(req.params.fileId));
            sendPrivate(res, next, file);
        } catch (err) {
            next(err);
        }
    },

    // ─── ชุดคำถามความต้องการ (productManagement) ───
    listRequirementGroups: handle(async () => ({ data: await requirementService.listGroups(pool) })),
    createRequirementGroup: handle((req) => {
        const input = validate(requirementGroupSchema, req.body);
        return withTransaction((conn) => requirementService.createGroup(conn, input));
    }, 201),
    updateRequirementGroup: handle((req) => {
        const input = validate(requirementGroupSchema, req.body);
        return withTransaction((conn) => requirementService.updateGroup(conn, numericId(req.params.id), input));
    }),
    deleteRequirementGroup: handle((req) => withTransaction((conn) => requirementService.deleteGroup(conn, numericId(req.params.id)))),
    reorderRequirementQuestions: handle((req) => {
        const input = validate(questionOrderSchema, req.body);
        return withTransaction((conn) => requirementService.reorderQuestions(conn, numericId(req.params.id), input.question_ids));
    }),
    createRequirementQuestion: handle((req) => {
        const input = validate(requirementQuestionSchema, req.body);
        return withTransaction((conn) => requirementService.createQuestion(conn, numericId(req.params.id), input));
    }, 201),
    updateRequirementQuestion: handle((req) => {
        const input = validate(requirementQuestionSchema, req.body);
        return withTransaction((conn) => requirementService.updateQuestion(conn, numericId(req.params.id), input));
    }),
    deleteRequirementQuestion: handle((req) => withTransaction((conn) => requirementService.deleteQuestion(conn, numericId(req.params.id)))),
    // Q-2 (2026-10-26): เรียงกลุ่ม · คัดลอกกลุ่ม/คำถาม · ย้ายคำถามไปกลุ่มอื่น
    reorderRequirementGroups: handle((req) => {
        const input = validate(groupOrderSchema, req.body);
        return withTransaction((conn) => requirementService.reorderGroups(conn, input.group_ids));
    }),
    copyRequirementGroup: handle((req) => withTransaction((conn) => requirementService.copyGroup(conn, numericId(req.params.id))), 201),
    copyRequirementQuestion: handle((req) => withTransaction((conn) => requirementService.copyQuestion(conn, numericId(req.params.id))), 201),
    moveRequirementQuestion: handle((req) => {
        const input = validate(questionMoveSchema, req.body);
        return withTransaction((conn) => requirementService.moveQuestion(conn, numericId(req.params.id), input.group_id));
    }),

    // ─── หน้าร้าน (ลูกค้า) ───
    publicShop: publicHandle((req) => orderPublicService.shop(pool, req.params.code)),
    publicSubmit: publicHandle(async (req) => {
        // มีไฟล์แนบ = multipart (ข้อมูลอยู่ในช่อง payload เป็น JSON) · ไม่มีไฟล์ = JSON ปกติ
        let body = req.body;
        if (req.is("multipart/form-data")) {
            try {
                body = JSON.parse(req.body.payload ?? "{}");
            } catch {
                throw new AppError(400, "VALIDATION", "ส่งไม่สำเร็จ กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง");
            }
        }
        const input = validate(orderSubmitSchema, body);
        const savedPaths = [];
        let result;
        try {
            result = await withTransaction((conn) => orderPublicService.submit(conn, req.params.code, input, { files: req.files ?? [], savedPaths }));
        } catch (error) {
            // บันทึกไม่สำเร็จ = ลบไฟล์ที่เขียนไปแล้ว (ไม่ทิ้งไฟล์ที่ไม่มีคำขออ้างถึง)
            await Promise.all(savedPaths.map((storedPath) => deletePrivateFile(storedPath)));
            throw error;
        }
        if (result.notify) {
            const { to, ...data } = result.notify;
            // ไม่รอผล: ส่งอีเมลไม่ได้ไม่ทำให้คำขอของลูกค้าล้ม
            sendServiceRequestEmail({ to, ...data, actionUrl: `${process.env.FRONTEND_URL}/sales/service-requests/view?id=${result.svr_id}` });
        }
        return { svr_id: result.svr_id, access_token: result.access_token };
    }, 201),
    publicStatus: publicHandle((req) => orderPublicService.requestStatus(pool, req.params.token)),
    publicQuotationDocument: publicHandle((req) => orderPublicService.quotationDocument(pool, req.params.token)),
    publicAccept: publicHandle(async (req) => {
        const input = validate(orderAcceptSchema, req.body);
        await withTransaction((conn) => orderPublicService.acceptByCustomer(conn, req.params.token, input));
        return orderPublicService.requestStatus(pool, req.params.token);
    }),

    // ─── การ์ดความต้องการในหน้าโปรเจกต์ (สมาชิกโปรเจกต์) ───
    projectRequirements: handle((req) => serviceRequestService.projectRequirements(pool, req.params.id)),
    downloadProjectRequirementFile: async (req, res, next) => {
        try {
            const file = await serviceRequestService.findProjectFile(pool, req.params.id, numericId(req.params.fileId));
            sendPrivate(res, next, file);
        } catch (err) {
            next(err);
        }
    },
};
