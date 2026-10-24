// ลงเวลาเข้า-ออกงาน (2026-10-23 ช่วง A-1) — รับคำขอ → ตรวจข้อมูล (zod) → เรียก service → ตอบ
// ของตัวเองใช้ req.user เสมอ (ไม่รับ id พนักงานจาก URL) · ตั้งค่ากะ/จุดลงเวลา = manageHrSettings · กะของพนักงาน = manageEmployees
const pool = require("../config/db");
const { validate } = require("../utils/validate");
const { withTransaction } = require("../utils/with-transaction");
const { todayBangkok } = require("../utils/bangkok-time");
const {
    attendanceLocationSchema,
    correctionRejectSchema,
    correctionSchema,
    employeeScheduleSchema,
    employeeWfhSchema,
    overtimeRejectSchema,
    overtimeSchema,
    punchSchema,
    wfhRejectSchema,
    wfhRequestSchema,
    workScheduleSchema,
} = require("../shared/schemas/attendance.mjs");
const { isRealDateText } = require("../shared/schemas/common.mjs");
const correctionService = require("../services/attendance-correction.service");
const boardService = require("../services/attendance-board.service");
const overtimeService = require("../services/attendance-overtime.service");
const wfhService = require("../services/attendance-wfh.service");
const attendanceService = require("../services/attendance.service");
const attendanceSetup = require("../services/attendance-setup.service");

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function requestedMonth(query) {
    const requested = String(query.month ?? "");
    return MONTH_PATTERN.test(requested) ? requested : todayBangkok().slice(0, 7);
}

const numericId = (value) => Number(value);

function requestedDate(query) {
    const requested = String(query.date ?? "");
    return isRealDateText(requested) ? requested : todayBangkok();
}

// handler ที่รับแค่ (conn, user, id) แล้วตอบผลของ service
function idAction(serviceFunction) {
    return async function (req, res, next) {
        try {
            res.json(await withTransaction((conn) => serviceFunction(conn, req.user, numericId(req.params.id))));
        } catch (err) {
            next(err);
        }
    };
}

// ─── ขอแก้เวลา (A-2) ──────────────────────────────────────────────────────────────────────────

async function createCorrection(req, res, next) {
    try {
        const request = validate(correctionSchema, req.body);
        res.status(201).json(await withTransaction((conn) => correctionService.createCorrection(conn, req.user, request)));
    } catch (err) {
        next(err);
    }
}

async function listPendingCorrections(req, res, next) {
    try {
        res.json({ data: await correctionService.listPending(pool, req.user) });
    } catch (err) {
        next(err);
    }
}

async function rejectCorrection(req, res, next) {
    try {
        const { reason } = validate(correctionRejectSchema, req.body);
        res.json(
            await withTransaction((conn) => correctionService.rejectCorrection(conn, req.user, numericId(req.params.id), reason)),
        );
    } catch (err) {
        next(err);
    }
}

// ─── OT (A-3) ─────────────────────────────────────────────────────────────────────────────────

const overtimePreviewSchema = overtimeSchema.omit({ ot_reason: true });

async function previewOvertime(req, res, next) {
    try {
        const request = validate(overtimePreviewSchema, req.query);
        res.json(await overtimeService.preview(pool, req.user, request));
    } catch (err) {
        next(err);
    }
}

async function createOvertime(req, res, next) {
    try {
        const request = validate(overtimeSchema, req.body);
        res.status(201).json(await withTransaction((conn) => overtimeService.createOvertime(conn, req.user, request)));
    } catch (err) {
        next(err);
    }
}

async function listPendingOvertime(req, res, next) {
    try {
        res.json({ data: await overtimeService.listPending(pool, req.user) });
    } catch (err) {
        next(err);
    }
}

async function rejectOvertime(req, res, next) {
    try {
        const { reason } = validate(overtimeRejectSchema, req.body);
        res.json(await withTransaction((conn) => overtimeService.rejectOvertime(conn, req.user, numericId(req.params.id), reason)));
    } catch (err) {
        next(err);
    }
}

// ─── WFH (2026-10-24) ─────────────────────────────────────────────────────────────────────────

async function createWfh(req, res, next) {
    try {
        const request = validate(wfhRequestSchema, req.body);
        res.status(201).json(await withTransaction((conn) => wfhService.createWfh(conn, req.user, request)));
    } catch (err) {
        next(err);
    }
}

async function listPendingWfh(req, res, next) {
    try {
        res.json({ data: await wfhService.listPending(pool, req.user) });
    } catch (err) {
        next(err);
    }
}

async function rejectWfh(req, res, next) {
    try {
        const { reason } = validate(wfhRejectSchema, req.body);
        res.json(await withTransaction((conn) => wfhService.rejectWfh(conn, req.user, numericId(req.params.id), reason)));
    } catch (err) {
        next(err);
    }
}

async function setEmployeeWfhDays(req, res, next) {
    try {
        const { emp_wfh_weekdays: weekdays } = validate(employeeWfhSchema, req.body);
        res.json(await withTransaction((conn) => wfhService.setEmployeeWfhDays(conn, req.params.id, weekdays)));
    } catch (err) {
        next(err);
    }
}

// ─── ฝ่ายบุคคล/ผู้อนุมัติ (A-2) ─────────────────────────────────────────────────────────────────

async function getBoard(req, res, next) {
    try {
        res.json(await boardService.getBoard(pool, requestedDate(req.query)));
    } catch (err) {
        next(err);
    }
}

async function getMonthSummary(req, res, next) {
    try {
        res.json(await boardService.getMonthSummary(pool, requestedMonth(req.query)));
    } catch (err) {
        next(err);
    }
}

async function getEmployeeMonth(req, res, next) {
    try {
        res.json(await boardService.getEmployeeMonth(pool, req.params.id, requestedMonth(req.query)));
    } catch (err) {
        next(err);
    }
}

// ─── ของฉัน ───────────────────────────────────────────────────────────────────────────────────

async function getMine(req, res, next) {
    try {
        res.json(await attendanceService.getMine(pool, req.user.user_id, requestedMonth(req.query)));
    } catch (err) {
        next(err);
    }
}

async function punch(req, res, next) {
    try {
        const request = validate(punchSchema, req.body);
        const client = { ip: req.ip ?? null, userAgent: req.headers["user-agent"] ?? null };
        const result = await withTransaction((conn) => attendanceService.punch(conn, req.user, request, client));
        res.status(result.is_duplicate ? 200 : 201).json(result);
    } catch (err) {
        next(err);
    }
}

// ─── ตั้งค่า ─────────────────────────────────────────────────────────────────────────────────

async function createSchedule(req, res, next) {
    try {
        const schedule = validate(workScheduleSchema, req.body);
        res.status(201).json(await withTransaction((conn) => attendanceSetup.createSchedule(conn, schedule, req.user)));
    } catch (err) {
        next(err);
    }
}

async function updateSchedule(req, res, next) {
    try {
        const schedule = validate(workScheduleSchema, req.body);
        res.json(await withTransaction((conn) => attendanceSetup.updateSchedule(conn, numericId(req.params.id), schedule)));
    } catch (err) {
        next(err);
    }
}

async function createLocation(req, res, next) {
    try {
        const location = validate(attendanceLocationSchema, req.body);
        res.status(201).json(await withTransaction((conn) => attendanceSetup.createLocation(conn, location, req.user)));
    } catch (err) {
        next(err);
    }
}

async function updateLocation(req, res, next) {
    try {
        const location = validate(attendanceLocationSchema, req.body);
        res.json(await withTransaction((conn) => attendanceSetup.updateLocation(conn, numericId(req.params.id), location)));
    } catch (err) {
        next(err);
    }
}

// ─── กะของพนักงาน ─────────────────────────────────────────────────────────────────────────────

async function setEmployeeSchedule(req, res, next) {
    try {
        const request = validate(employeeScheduleSchema, req.body);
        res.status(201).json(
            await withTransaction((conn) => attendanceSetup.setEmployeeSchedule(conn, req.params.id, request, req.user)),
        );
    } catch (err) {
        next(err);
    }
}

async function deleteEmployeeSchedule(req, res, next) {
    try {
        res.json(
            await withTransaction((conn) =>
                attendanceSetup.deleteEmployeeSchedule(conn, req.params.id, numericId(req.params.scheduleRowId)),
            ),
        );
    } catch (err) {
        next(err);
    }
}

module.exports = {
    getMine,
    punch,
    createCorrection,
    cancelCorrection: idAction(correctionService.cancelCorrection),
    listPendingCorrections,
    approveCorrection: idAction(correctionService.approveCorrection),
    rejectCorrection,
    previewOvertime,
    createOvertime,
    cancelOvertime: idAction(overtimeService.cancelOvertime),
    listPendingOvertime,
    approveOvertime: idAction(overtimeService.approveOvertime),
    rejectOvertime,
    createWfh,
    cancelWfh: idAction(wfhService.cancelWfh),
    listPendingWfh,
    approveWfh: idAction(wfhService.approveWfh),
    rejectWfh,
    setEmployeeWfhDays,
    getBoard,
    getMonthSummary,
    getEmployeeMonth,
    createSchedule,
    updateSchedule,
    createLocation,
    updateLocation,
    setEmployeeSchedule,
    deleteEmployeeSchedule,
};
