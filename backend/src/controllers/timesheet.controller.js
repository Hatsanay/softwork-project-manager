// ลงเวลาทำงาน — เฟส 4 ขั้น 4-2 (2026-10-17)
// รับคำขอ → ตรวจข้อมูล (zod) → เรียก service → ตอบ · ของตัวเองใช้ req.user เสมอ (ไม่รับ id พนักงานจาก URL)
const pool = require("../config/db");
const { validate } = require("../utils/validate");
const { withTransaction } = require("../utils/with-transaction");
const { todayBangkok } = require("../utils/bangkok-time");
const { weekStartOf } = require("../shared/payroll-math.mjs");
const { isRealDateText, requiredDate } = require("../shared/schemas/common.mjs");
const {
    timesheetWeekSchema,
    timesheetActionSchema,
    timesheetReturnSchema,
} = require("../shared/schemas/timesheet.mjs");
const timesheetService = require("../services/timesheet.service");

const submitSchema = timesheetActionSchema.extend({ week_start: requiredDate("สัปดาห์") });

// ?week=YYYY-MM-DD วันไหนก็ได้ในสัปดาห์ → วันจันทร์ · ไม่ส่ง/ผิดรูปแบบ = สัปดาห์นี้
function requestedWeekStart(query) {
    const requested = String(query.week ?? "");
    return weekStartOf(isRealDateText(requested) ? requested : todayBangkok());
}

async function getMyWeek(req, res, next) {
    try {
        res.json(await timesheetService.getMyWeek(pool, req.user.user_id, requestedWeekStart(req.query)));
    } catch (err) {
        next(err);
    }
}

async function saveMyWeek(req, res, next) {
    try {
        const payload = validate(timesheetWeekSchema, req.body);
        await withTransaction((conn) => timesheetService.saveMyWeek(conn, req.user.user_id, payload));
        res.json(await timesheetService.getMyWeek(pool, req.user.user_id, payload.week_start));
    } catch (err) {
        next(err);
    }
}

async function submitMyWeek(req, res, next) {
    try {
        const payload = validate(submitSchema, req.body);
        const weekStart = weekStartOf(payload.week_start);
        await withTransaction((conn) =>
            timesheetService.submitMyWeek(conn, req.user.user_id, weekStart, payload.tsw_version),
        );
        res.json(await timesheetService.getMyWeek(pool, req.user.user_id, weekStart));
    } catch (err) {
        next(err);
    }
}

async function listApprovals(req, res, next) {
    try {
        res.json(await timesheetService.listPendingApprovals(pool, req.user));
    } catch (err) {
        next(err);
    }
}

async function approveWeek(req, res, next) {
    try {
        const { tsw_version: version } = validate(timesheetActionSchema, req.body);
        res.json(
            await withTransaction((conn) =>
                timesheetService.approveWeek(conn, req.user, Number(req.params.id), version),
            ),
        );
    } catch (err) {
        next(err);
    }
}

async function returnWeek(req, res, next) {
    try {
        const { tsw_version: version, reason } = validate(timesheetReturnSchema, req.body);
        res.json(
            await withTransaction((conn) =>
                timesheetService.returnWeek(conn, req.user, Number(req.params.id), version, reason),
            ),
        );
    } catch (err) {
        next(err);
    }
}

module.exports = { getMyWeek, saveMyWeek, submitMyWeek, listApprovals, approveWeek, returnWeek };
