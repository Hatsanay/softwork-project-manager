// เงินทุนสะสม (2026-10-25 · P-3) — รับคำขอ → ตรวจข้อมูล (zod) → เรียก service → ตอบ · สิทธิ์ manageCapitalFund (คุมที่ route)
const pool = require("../config/db");
const { validate } = require("../utils/validate");
const { withTransaction } = require("../utils/with-transaction");
const { capitalCancelSchema, capitalEntrySchema, capitalGoalSchema } = require("../shared/schemas/capital.mjs");
const capitalService = require("../services/capital.service");

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

module.exports = {
    overview: handle(() => capitalService.overview(pool)),
    updateGoal: handle((req) => {
        const input = validate(capitalGoalSchema, req.body);
        return withTransaction((conn) => capitalService.updateGoal(conn, input));
    }),
    createEntry: handle((req) => {
        const input = validate(capitalEntrySchema, req.body);
        return withTransaction((conn) => capitalService.createEntry(conn, req.user, input));
    }, 201),
    cancelEntry: handle((req) => {
        const input = validate(capitalCancelSchema, req.body);
        return withTransaction((conn) => capitalService.cancelEntry(conn, req.user, numericId(req.params.id), input));
    }),
};
