// งาน Fastwork (2026-10-24 · P-1) — รับคำขอ → ตรวจข้อมูล (zod) → เรียก service → ตอบ
const pool = require("../config/db");
const { validate } = require("../utils/validate");
const { withTransaction } = require("../utils/with-transaction");
const { hasBit } = require("../shared/permissions.mjs");
const {
    fastworkCancelSchema,
    fastworkPayoutSchema,
    fastworkProjectSchema,
    fastworkProjectUpdateSchema,
    fastworkReceiveSchema,
    fastworkSettingsSchema,
} = require("../shared/schemas/fastwork.mjs");
const fastworkService = require("../services/fastwork.service");

const PAYOUT_STATUSES = new Set(["pending", "received", "cancelled"]);

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
    overview: handle((req) =>
        fastworkService.overview(pool, { canSeeMoney: hasBit(req.user.role_permission, "manageFastwork") }),
    ),
    getSettings: handle(() => fastworkService.getSettings(pool)),
    updateSettings: handle((req) => {
        const settings = validate(fastworkSettingsSchema, req.body);
        return withTransaction((conn) => fastworkService.updateSettings(conn, settings));
    }),
    priceCatalog: handle(() => require("../services/order-public.service").internalCatalog(pool)),
    createProject: async (req, res, next) => {
        try {
            const project = validate(fastworkProjectSchema, req.body);
            res.status(201).json(await withTransaction((conn) => fastworkService.createProject(conn, req.user, project)));
        } catch (err) {
            next(err);
        }
    },
    updateProject: handle((req) => {
        const project = validate(fastworkProjectUpdateSchema, req.body);
        return withTransaction((conn) => fastworkService.updateProject(conn, req.user, req.params.id, project));
    }),
    setDelivered: handle((req) =>
        withTransaction((conn) =>
            fastworkService.setDelivered(conn, req.user, req.params.id, numericId(req.params.milestoneId), req.body?.delivered !== false),
        ),
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
