// บุคคล: พนักงาน + ค่าจ้าง + ตั้งค่าบุคคล — เฟส 4 ขั้น 4-1 (2026-10-17)
// รับคำขอ → ตรวจข้อมูล (zod) → เรียก service → ตอบ
const pool = require("../config/db");
const { validate } = require("../utils/validate");
const { withTransaction } = require("../utils/with-transaction");
const { todayBangkok } = require("../utils/bangkok-time");
const {
    employeeSchema,
    employeeCreateSchema,
    employeeTerminateSchema,
    compensationSchema,
    compensationUpdateSchema,
    recurringItemSchema,
    recurringItemEndSchema,
    ssoRateSchema,
    taxYearSchema,
    payrollSettingsSchema,
    holidaySchema,
    leaveTypeSchema,
} = require("../shared/schemas/people.mjs");
const employeeService = require("../services/employee.service");
const setupService = require("../services/people-setup.service");

const EARLIEST_HOLIDAY_YEAR = 2000;
const LATEST_HOLIDAY_YEAR = 2200;

// ─── พนักงาน ─────────────────────────────────────────────────────────────────────────────────

async function listEmployees(req, res, next) {
    try {
        res.json(
            await employeeService.listEmployees(pool, {
                limit: req.query.limit,
                offset: req.query.offset,
                search: String(req.query.search ?? ""),
                status: req.query.status,
            }),
        );
    } catch (err) {
        next(err);
    }
}

async function getEmployee(req, res, next) {
    try {
        res.json(await employeeService.getEmployee(pool, req.params.id));
    } catch (err) {
        next(err);
    }
}

async function getEmployeeFormOptions(req, res, next) {
    try {
        res.json(await employeeService.getFormOptions(pool));
    } catch (err) {
        next(err);
    }
}

async function createEmployee(req, res, next) {
    try {
        const employee = validate(employeeCreateSchema, req.body);
        res.status(201).json(await withTransaction((conn) => employeeService.createEmployee(conn, employee, req.user)));
    } catch (err) {
        next(err);
    }
}

async function updateEmployee(req, res, next) {
    try {
        const employee = validate(employeeSchema, req.body);
        res.json(await withTransaction((conn) => employeeService.updateEmployee(conn, req.params.id, employee)));
    } catch (err) {
        next(err);
    }
}

async function deleteEmployee(req, res, next) {
    try {
        await withTransaction((conn) => employeeService.deleteEmployee(conn, req.params.id));
        res.status(204).end();
    } catch (err) {
        next(err);
    }
}

async function terminateEmployee(req, res, next) {
    try {
        const termination = validate(employeeTerminateSchema, req.body);
        res.json(await withTransaction((conn) => employeeService.terminateEmployee(conn, req.params.id, termination)));
    } catch (err) {
        next(err);
    }
}

async function reinstateEmployee(req, res, next) {
    try {
        res.json(await withTransaction((conn) => employeeService.reinstateEmployee(conn, req.params.id)));
    } catch (err) {
        next(err);
    }
}

// ─── ค่าจ้าง + รายการประจำ ──────────────────────────────────────────────────────────────────────

async function addCompensation(req, res, next) {
    try {
        const compensation = validate(compensationSchema, req.body);
        res.status(201).json(
            await withTransaction((conn) =>
                employeeService.addCompensation(conn, req.params.id, compensation, req.user),
            ),
        );
    } catch (err) {
        next(err);
    }
}

async function updateCompensation(req, res, next) {
    try {
        const compensation = validate(compensationUpdateSchema, req.body);
        res.json(
            await withTransaction((conn) =>
                employeeService.updateCompensation(conn, req.params.id, req.params.date, compensation),
            ),
        );
    } catch (err) {
        next(err);
    }
}

async function deleteCompensation(req, res, next) {
    try {
        await withTransaction((conn) => employeeService.deleteCompensation(conn, req.params.id, req.params.date));
        res.status(204).end();
    } catch (err) {
        next(err);
    }
}

async function addRecurringItem(req, res, next) {
    try {
        const item = validate(recurringItemSchema, req.body);
        res.status(201).json(
            await withTransaction((conn) => employeeService.addRecurringItem(conn, req.params.id, item, req.user)),
        );
    } catch (err) {
        next(err);
    }
}

async function endRecurringItem(req, res, next) {
    try {
        const { eri_effective_to: effectiveTo } = validate(recurringItemEndSchema, req.body);
        res.json(
            await withTransaction((conn) =>
                employeeService.endRecurringItem(conn, req.params.id, Number(req.params.itemId), effectiveTo),
            ),
        );
    } catch (err) {
        next(err);
    }
}

async function deleteRecurringItem(req, res, next) {
    try {
        await withTransaction((conn) =>
            employeeService.deleteRecurringItem(conn, req.params.id, Number(req.params.itemId)),
        );
        res.status(204).end();
    } catch (err) {
        next(err);
    }
}

// ─── ตั้งค่าบุคคล ────────────────────────────────────────────────────────────────────────────────

async function getSetup(req, res, next) {
    try {
        res.json(await setupService.getPeopleSetup(pool));
    } catch (err) {
        next(err);
    }
}

async function listHolidays(req, res, next) {
    try {
        const requestedYear = Number(req.query.year);
        const isValidYear =
            Number.isInteger(requestedYear) &&
            requestedYear >= EARLIEST_HOLIDAY_YEAR &&
            requestedYear <= LATEST_HOLIDAY_YEAR;
        const year = isValidYear ? requestedYear : Number(todayBangkok().slice(0, 4));
        res.json(await setupService.listHolidays(pool, year));
    } catch (err) {
        next(err);
    }
}

async function updateSettings(req, res, next) {
    try {
        const settings = validate(payrollSettingsSchema, req.body);
        res.json(await withTransaction((conn) => setupService.updateSettings(conn, settings, req.user)));
    } catch (err) {
        next(err);
    }
}

async function addSsoRate(req, res, next) {
    try {
        const rate = validate(ssoRateSchema, req.body);
        res.status(201).json(await withTransaction((conn) => setupService.addSsoRate(conn, rate, req.user)));
    } catch (err) {
        next(err);
    }
}

async function deleteSsoRate(req, res, next) {
    try {
        await withTransaction((conn) => setupService.deleteSsoRate(conn, req.params.date));
        res.status(204).end();
    } catch (err) {
        next(err);
    }
}

async function saveTaxYear(req, res, next) {
    try {
        const taxYear = validate(taxYearSchema, { ...req.body, ity_tax_year: Number(req.params.year) });
        res.json(await withTransaction((conn) => setupService.saveTaxYear(conn, taxYear, req.user)));
    } catch (err) {
        next(err);
    }
}

async function deleteTaxYear(req, res, next) {
    try {
        await withTransaction((conn) => setupService.deleteTaxYear(conn, Number(req.params.year)));
        res.status(204).end();
    } catch (err) {
        next(err);
    }
}

async function addHoliday(req, res, next) {
    try {
        const holiday = validate(holidaySchema, req.body);
        res.status(201).json(await withTransaction((conn) => setupService.addHoliday(conn, holiday, req.user)));
    } catch (err) {
        next(err);
    }
}

async function deleteHoliday(req, res, next) {
    try {
        await withTransaction((conn) => setupService.deleteHoliday(conn, req.params.date));
        res.status(204).end();
    } catch (err) {
        next(err);
    }
}

async function createLeaveType(req, res, next) {
    try {
        const leaveType = validate(leaveTypeSchema, req.body);
        res.status(201).json(await withTransaction((conn) => setupService.createLeaveType(conn, leaveType)));
    } catch (err) {
        next(err);
    }
}

async function updateLeaveType(req, res, next) {
    try {
        const leaveType = validate(leaveTypeSchema, req.body);
        res.json(await withTransaction((conn) => setupService.updateLeaveType(conn, Number(req.params.id), leaveType)));
    } catch (err) {
        next(err);
    }
}

module.exports = {
    listEmployees,
    getEmployee,
    getEmployeeFormOptions,
    createEmployee,
    updateEmployee,
    deleteEmployee,
    terminateEmployee,
    reinstateEmployee,
    addCompensation,
    updateCompensation,
    deleteCompensation,
    addRecurringItem,
    endRecurringItem,
    deleteRecurringItem,
    getSetup,
    listHolidays,
    updateSettings,
    addSsoRate,
    deleteSsoRate,
    saveTaxYear,
    deleteTaxYear,
    addHoliday,
    deleteHoliday,
    createLeaveType,
    updateLeaveType,
};
