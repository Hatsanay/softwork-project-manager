// งาน Fastwork (2026-10-24 · P-1) — รับคำขอ → ตรวจข้อมูล (zod) → เรียก service → ตอบ
const pool = require("../config/db");
const { validate } = require("../utils/validate");
const { withTransaction } = require("../utils/with-transaction");
const { hasBit } = require("../shared/permissions.mjs");
const { AppError } = require("../utils/app-error");
const { projectSharesSchema } = require("../shared/schemas/profit-share.mjs");
const {
    fastworkAddMilestonesSchema,
    fastworkCancelSchema,
    fastworkMilestoneCutSchema,
    fastworkPayoutSchema,
    fastworkProjectSchema,
    fastworkProjectUpdateSchema,
    fastworkReceiveSchema,
    fastworkSettingsSchema,
} = require("../shared/schemas/fastwork.mjs");
const fastworkService = require("../services/fastwork.service");
const profitShareService = require("../services/profit-share.service");
const projectNextStepsService = require("../services/project-next-steps.service");
const { recomputeProjectProgress } = require("../utils/projectProgress");

const PAYOUT_STATUSES = new Set(["pending", "received", "cancelled"]);
// สิ่งที่ต้องทำตอนนี้ในหน้า Fastwork (2026-11-01)
const FASTWORK_TODO_LIMIT = 30;

const numericId = (value) => {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : -1;
};

/** ตอบด้วยผลของ service (ไม่มี body เข้า) */
function handle(work) {
    return async (req, res, next) => {
        try {
            res.json(await work(req));
        } catch (err) {
            next(err);
        }
    };
}

module.exports = {
    // ภาพรวม + สิ่งที่ต้องทำของงาน Fastwork (กฎเดียวกับ "ต่อไปต้องทำ" ของโปรเจกต์ · เห็นเฉพาะเรื่องที่สิทธิ์ตัวเองกดได้)
    overview: handle(async (req) => {
        const overview = await fastworkService.overview(pool, { canSeeMoney: hasBit(req.user.role_permission, "manageFastwork") });
        const todo = await projectNextStepsService.todoForUser(pool, req.user, FASTWORK_TODO_LIMIT, { channel: "fastwork" });
        return { ...overview, todo };
    }),
    // ทีมและส่วนแบ่งของงานล่าสุด (เติมให้ในฟอร์มรับงาน)
    shareDefaults: handle(() => profitShareService.latestFastworkShares(pool)),
    getSettings: handle(() => fastworkService.getSettings(pool)),
    updateSettings: handle((req) => {
        const settings = validate(fastworkSettingsSchema, req.body);
        return withTransaction((conn) => fastworkService.updateSettings(conn, settings));
    }),
    priceCatalog: handle(() => require("../services/order-public.service").internalCatalog(pool)),
    // เอกสารงาน Fastwork (2026-11-01): งานที่ยังขาดเอกสาร · ออกย้อนหลังทีละงาน (ธุรกรรมแยกต่องาน พังงานเดียวไม่ล้มทั้งหมด)
    missingDocuments: handle(async () => ({ data: await require("../services/fastwork-document.service").listMissing(pool) })),
    backfillDocuments: handle(async (req) => {
        const documentService = require("../services/fastwork-document.service");
        const missing = await documentService.listMissing(pool);
        const result = { projects: 0, quotations: 0, payouts: 0, failed: [] };
        for (const row of missing) {
            try {
                const issued = await withTransaction((conn) => documentService.backfillProject(conn, req.user, row.project_id));
                result.projects += 1;
                result.quotations += issued.quotations;
                result.payouts += issued.payouts;
            } catch (err) {
                result.failed.push({ project_id: row.project_id, message: err.message });
            }
        }
        return result;
    }),
    createProject: async (req, res, next) => {
        try {
            const project = validate(fastworkProjectSchema, req.body);
            // ทีมและส่วนแบ่งตอนรับงาน (2026-11-01): กติกาเดียวกับหน้าส่วนแบ่ง · ตั้งได้เฉพาะผู้มีสิทธิ์จัดการส่วนแบ่ง
            const { shares } = validate(projectSharesSchema, { shares: project.shares });
            if (shares.length > 0 && !hasBit(req.user.role_permission, "manageProfitShares")) {
                throw new AppError(403, "FORBIDDEN", "ตั้งส่วนแบ่งได้เฉพาะผู้มีสิทธิ์จัดการส่วนแบ่งกำไร · เอาส่วนทีมและส่วนแบ่งออก แล้วให้ผู้มีสิทธิ์ตั้งทีหลัง");
            }
            res.status(201).json(await withTransaction((conn) => fastworkService.createProject(conn, req.user, { ...project, shares })));
        } catch (err) {
            next(err);
        }
    },
    addMilestones: handle(async (req) => {
        const input = validate(fastworkAddMilestonesSchema, req.body);
        const result = await withTransaction((conn) => fastworkService.addMilestones(conn, req.user, req.params.id, input));
        // งานใหม่ยังไม่เสร็จ = % ความคืบหน้าของงานเดิมลดลง (คิดหลัง commit เหมือนตอนตอบรับใบเสนอราคา)
        if (result.task_count > 0) await recomputeProjectProgress(result.project_id);
        return result;
    }),
    updateProject: handle((req) => {
        const project = validate(fastworkProjectUpdateSchema, req.body);
        return withTransaction((conn) => fastworkService.updateProject(conn, req.user, req.params.id, project));
    }),
    setDelivered: handle((req) =>
        withTransaction((conn) =>
            fastworkService.setDelivered(conn, req.user, req.params.id, numericId(req.params.milestoneId), req.body?.delivered !== false),
        ),
    ),
    // ตัดงวด / ยกเลิกการตัด (2026-11-01)
    cutMilestone: handle((req) => {
        const { reason } = validate(fastworkMilestoneCutSchema, req.body);
        return withTransaction((conn) => fastworkService.setMilestoneCut(conn, req.user, req.params.id, numericId(req.params.milestoneId), reason));
    }),
    restoreMilestone: handle((req) =>
        withTransaction((conn) => fastworkService.setMilestoneCut(conn, req.user, req.params.id, numericId(req.params.milestoneId), null)),
    ),
    projectFastwork: handle(async (req) => {
        const fastwork = await fastworkService.projectFastwork(pool, req.params.id);
        if (!fastwork) return { fastwork: null };
        // ยอดเงินเฉพาะผู้จัดการเงิน Fastwork หรือผู้ดูใบแจ้งหนี้ (สิทธิ์เดียวกับการ์ดการเงินโปรเจกต์) · สมาชิกทั่วไปเห็นงวดและสถานะ
        const canSeeMoney = hasBit(req.user.role_permission, "manageFastwork") || hasBit(req.user.role_permission, "viewInvoices");
        const { platform_cost_hundredths: _cost, received_gross_hundredths: _gross, ...rest } = fastwork;
        if (canSeeMoney) return { fastwork: rest, can_see_money: true };
        return {
            fastwork: {
                order_no: rest.order_no,
                url: rest.url,
                milestones: rest.milestones.map(({ fwm_amount: _amount, ...milestone }) => milestone),
                payouts: [],
                totals: null,
            },
            can_see_money: false,
        };
    }),
    listPayouts: handle((req) => {
        const status = PAYOUT_STATUSES.has(req.query.status) ? req.query.status : null;
        const projectId = typeof req.query.project_id === "string" && req.query.project_id ? req.query.project_id : null;
        return fastworkService.listPayouts(pool, { status, projectId }).then((data) => ({ data }));
    }),
    createPayout: async (req, res, next) => {
        try {
            const payout = validate(fastworkPayoutSchema, req.body);
            res.status(201).json(await withTransaction((conn) => fastworkService.createPayout(conn, req.user, payout)));
        } catch (err) {
            next(err);
        }
    },
    receivePayout: handle((req) => {
        const input = validate(fastworkReceiveSchema, req.body);
        return withTransaction((conn) => fastworkService.receivePayout(conn, req.user, numericId(req.params.id), input));
    }),
    cancelPayout: handle((req) => {
        const input = validate(fastworkCancelSchema, req.body);
        return withTransaction((conn) => fastworkService.cancelPayout(conn, req.user, numericId(req.params.id), input));
    }),
};
