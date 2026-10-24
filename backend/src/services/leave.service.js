// การลา (2026-10-17 เฟส 4 ขั้น 4-3) — docs/plans/2026-10-17-people-payroll-4.md หัวข้อ 4.4
//
// - พนักงาน = พนักงานที่ผูกกับบัญชีที่ login (ทุกคนขอลาของตัวเองได้โดยไม่ต้องมีสิทธิ์)
// - draft (แก้/แนบไฟล์ได้) → pending → approved / rejected · ดึงกลับ pending → draft · ยกเลิก = cancelled
// - จำนวนวัน = วันทำงานในช่วง (ตั้งค่าวันทำงานในสัปดาห์ ไม่รวมวันหยุดบริษัท) · ครึ่งวัน = 0.5 · คิดใหม่ทุกครั้งที่ส่ง/อนุมัติ (วันหยุดอาจเปลี่ยน)
// - โควตารายปีปฏิทิน = โควตาของประเภท + ยกยอดจากปีก่อน (ไม่เกินที่ตั้ง) · เกินโควตาส่งได้ แต่ผู้อนุมัติเห็นคำเตือน
// - ทับซ้อนกับลาที่ส่งแล้ว/อนุมัติแล้วไม่ได้ (เช้า + บ่ายวันเดียวกันได้) · ลาเต็มวันในวันที่มีลงเวลาไว้ไม่ได้ (ลบชั่วโมงก่อน)
// - ผู้อนุมัติ = สิทธิ์ approveLeave · อนุมัติ/ไม่อนุมัติของตัวเองไม่ได้
// - ปฏิทินทีมเห็นแค่ชื่อ + ช่วงวัน + ครึ่งวัน — ไม่เห็นประเภท/เหตุผล/ไฟล์ (เห็นเฉพาะเจ้าของ/ผู้อนุมัติ/ฝ่ายบุคคล)
// - ขั้น 4-4 เพิ่ม: ลาที่อยู่ในเดือนที่รอบเงินเดือนอนุมัติแล้ว แก้/ยกเลิกไม่ได้
const { AppError } = require("../utils/app-error");
const { todayBangkok } = require("../utils/bangkok-time");
const { hasBit } = require("../shared/permissions.mjs");
const { formatHundredths, parseHundredths } = require("../shared/money.mjs");
const { addDays, daysBetween, workingDatesBetween } = require("../shared/payroll-math.mjs");
const { HALF_DAY_OPTIONS, MAX_LEAVE_ATTACHMENTS } = require("../shared/schemas/leave.mjs");
const { isRealDateText } = require("../shared/schemas/common.mjs");
const { findLinkedEmployee } = require("./linked-employee.service");
const attendanceSetup = require("./attendance-setup.service");
const { assertPeriodsOpen } = require("./payroll-lock.service");
const { isTimesheetEnabled } = require("./timesheet-switch.service");

const DAY_HUNDREDTHS = 100n;
const HALF_DAY_HUNDREDTHS = 50n;
const ACTIVE_STATUSES = ["pending", "approved"];
const APPROVED_LIST_DAYS = 60;

const days = (value) => parseHundredths(value ?? "0", "วันลา");

function notFound() {
    return new AppError(404, "LEAVE_NOT_FOUND", "ไม่พบคำขอลานี้ กรุณาโหลดหน้าใหม่");
}

function versionChanged() {
    return new AppError(409, "LEAVE_CHANGED", "คำขอลานี้มีการเปลี่ยนแปลงไปก่อนแล้ว กรุณาโหลดหน้าใหม่");
}

function wrongStatus(message) {
    return new AppError(409, "LEAVE_WRONG_STATUS", message);
}

function requireEmployee(employee) {
    if (employee) return employee;
    throw new AppError(
        409,
        "NOT_AN_EMPLOYEE",
        "บัญชีของคุณยังไม่ได้ผูกกับพนักงาน — ติดต่อฝ่ายบุคคลให้ผูกบัญชีในหน้าพนักงานก่อนขอลา",
    );
}

// ─── ปฏิทินทำงาน / จำนวนวันลา ─────────────────────────────────────────────────────────────────────

async function loadWorkCalendar(conn, startDate, endDate) {
    const [[settings]] = await conn.query("SELECT ps_working_weekdays FROM tb_payroll_settings WHERE ps_id = 1");
    const [holidays] = await conn.query(
        "SELECT DATE_FORMAT(hd_date, '%Y-%m-%d') AS hd_date FROM tb_company_holidays WHERE hd_date BETWEEN ? AND ?",
        [startDate, endDate],
    );
    return { workingWeekdays: settings.ps_working_weekdays, holidayDates: new Set(holidays.map((row) => row.hd_date)) };
}

/**
 * วันทำงานที่ลา + จำนวนวัน (หน่วย 1/100 วัน)
 * นับตามวันทำงานของกะพนักงานแต่ละวัน (2026-10-24 · กะทำงานเสาร์ ลาเสาร์ก็นับ) · ไม่รู้พนักงาน = วันทำงานของบริษัท
 * @param {string | null} employeeId
 * @returns {Promise<{ dates: string[], dayCount: bigint, holidayDates: string[] }>} holidayDates = วันทำงานที่ตรงวันหยุดบริษัท
 */
async function leaveDaysOf(conn, request, employeeId) {
    const { dates, holidayDates } = await attendanceSetup.workingDatesOf(
        conn,
        employeeId ?? null,
        request.lr_start_date,
        request.lr_end_date,
    );
    const isHalfDay = request.lr_half_day && request.lr_half_day !== "none";
    const dayCount = isHalfDay && dates.length > 0 ? HALF_DAY_HUNDREDTHS : BigInt(dates.length) * DAY_HUNDREDTHS;
    return { dates, dayCount, holidayDates };
}

const MAX_PREVIEW_SPAN_DAYS = 366;

/**
 * ตัวอย่างก่อนขอลา (ฟอร์มขอลาแสดงทันทีที่เลือกวัน — U-2 · 2026-10-19)
 * จำนวนวันคิดด้วย leaveDaysOf ตัวเดียวกับตอนบันทึก ตัวเลขบนฟอร์มจึงตรงกับที่บันทึกจริง
 * @param {{ start_date?: unknown, end_date?: unknown, half_day?: unknown, leave_type_id?: unknown }} query
 */
async function preview(conn, userId, query) {
    const startDate = String(query.start_date ?? "");
    const endDate = String(query.end_date ?? "");
    const isValidRange = isRealDateText(startDate) && isRealDateText(endDate) && startDate <= endDate;
    if (!isValidRange) {
        throw new AppError(400, "VALIDATION", "เลือกวันเริ่มลาและวันสุดท้ายให้ถูกต้องก่อน");
    }
    if (daysBetween(startDate, endDate) >= MAX_PREVIEW_SPAN_DAYS) {
        throw new AppError(400, "VALIDATION", "ช่วงลายาวเกิน 1 ปี");
    }
    const requestedHalf = HALF_DAY_OPTIONS.includes(query.half_day) ? query.half_day : "none";
    const halfDay = startDate === endDate ? requestedHalf : "none";
    const employee = await findLinkedEmployee(conn, userId);
    const { dates, dayCount, holidayDates } = await leaveDaysOf(
        conn,
        { lr_start_date: startDate, lr_end_date: endDate, lr_half_day: halfDay },
        employee?.emp_id ?? null,
    );

    // วันที่ไม่นับ: วันหยุดบริษัทที่ตรงวันทำงานของกะ (พร้อมชื่อ) + วันหยุดประจำสัปดาห์ของกะ
    const [holidayRows] = await conn.query(
        `SELECT DATE_FORMAT(hd_date, '%Y-%m-%d') AS hd_date, hd_name FROM tb_company_holidays
         WHERE hd_date BETWEEN ? AND ? ORDER BY hd_date`,
        [startDate, endDate],
    );
    const holidays = holidayRows.filter((row) => holidayDates.includes(row.hd_date));
    const calendarDays = daysBetween(startDate, endDate) + 1;

    return {
        days: formatHundredths(dayCount),
        working_dates: dates,
        calendar_days: calendarDays,
        weekly_off_days: calendarDays - dates.length - holidays.length,
        holidays,
        balance: await previewBalance(conn, userId, query.leave_type_id, startDate, dayCount),
    };
}

// ยอดของประเภทที่เลือกในปีที่ลา: คงเหลือ − รออนุมัติ − ใบนี้ (ร่างไม่ถูกนับในยอด จึงไม่ต้องหักใบเดิม)
async function previewBalance(conn, userId, leaveTypeId, startDate, dayCount) {
    const typeId = Number(leaveTypeId);
    if (!Number.isInteger(typeId) || typeId <= 0) return null;
    const employee = await findLinkedEmployee(conn, userId);
    if (!employee) return null;
    const balances = await balancesOf(conn, employee, Number(startDate.slice(0, 4)));
    const balance = balances.find((row) => row.lt_id === typeId);
    if (!balance) return null;
    const remainingAfter =
        balance.remaining === null ? null : days(balance.remaining) - days(balance.pending) - dayCount;
    return {
        ...balance,
        year: Number(startDate.slice(0, 4)),
        remaining_after: remainingAfter === null ? null : formatHundredths(remainingAfter),
        is_over_quota: remainingAfter !== null && remainingAfter < 0n,
    };
}

// ─── โควตา / ยอดคงเหลือ ──────────────────────────────────────────────────────────────────────

/**
 * ยอดลาของพนักงานในปีหนึ่ง แยกตามประเภท
 * @param {string} employeeId
 * @param {number} year
 * @returns {Promise<object[]>} ต่อประเภท: โควตา (null = ไม่จำกัด) · ยกยอด · ใช้แล้ว (อนุมัติ) · รออนุมัติ · คงเหลือ
 */
async function balancesOf(conn, employee, year) {
    const [types] = await conn.query(
        `SELECT lt_id, lt_name_th, lt_days_per_year, lt_is_paid, lt_attachment_from_days, lt_min_service_days,
                lt_carry_over_days, lt_status
         FROM tb_leave_types ORDER BY lt_sort_order, lt_id`,
    );
    const [usage] = await conn.query(
        `SELECT lr_leave_type_id, YEAR(lr_start_date) AS leave_year, lr_status, SUM(lr_days) AS total_days
         FROM tb_leave_requests
         WHERE lr_employee_id = ? AND lr_status IN ('pending', 'approved') AND YEAR(lr_start_date) IN (?, ?)
         GROUP BY lr_leave_type_id, leave_year, lr_status`,
        [employee.emp_id, year, year - 1],
    );
    const usedOf = (typeId, usageYear, status) =>
        days(
            usage.find(
                (row) =>
                    row.lr_leave_type_id === typeId && Number(row.leave_year) === usageYear && row.lr_status === status,
            )?.total_days,
        );
    const wasEmployedLastYear = employee.emp_hire_date < `${year}-01-01`;

    return types
        .map((type) => {
            const used = usedOf(type.lt_id, year, "approved");
            const pending = usedOf(type.lt_id, year, "pending");
            if (type.lt_days_per_year === null) {
                return { ...summaryOf(type), quota: null, carried: "0.00", used, pending, remaining: null };
            }
            const baseQuota = days(type.lt_days_per_year);
            const carryLimit = days(type.lt_carry_over_days);
            const lastYearLeft = baseQuota - usedOf(type.lt_id, year - 1, "approved");
            const carried = wasEmployedLastYear ? carriedDays(lastYearLeft, carryLimit) : 0n;
            return {
                ...summaryOf(type),
                quota: baseQuota,
                carried: formatHundredths(carried),
                used,
                pending,
                remaining: baseQuota + carried - used,
            };
        })
        .filter((balance) => balance.lt_status === "active" || balance.used > 0n || balance.pending > 0n)
        .map((balance) => ({
            ...balance,
            quota: balance.quota === null ? null : formatHundredths(balance.quota),
            used: formatHundredths(balance.used),
            pending: formatHundredths(balance.pending),
            remaining: balance.remaining === null ? null : formatHundredths(balance.remaining),
        }));
}

// ยกยอดจากปีก่อน = วันที่เหลือของปีก่อน แต่ไม่เกินที่ประเภทลาตั้งไว้ (ไม่ยกยอดซ้อนหลายปี)
function carriedDays(lastYearLeft, carryLimit) {
    if (carryLimit <= 0n || lastYearLeft <= 0n) return 0n;
    return lastYearLeft < carryLimit ? lastYearLeft : carryLimit;
}

function summaryOf(type) {
    return {
        lt_id: type.lt_id,
        lt_name_th: type.lt_name_th,
        lt_is_paid: type.lt_is_paid === 1,
        lt_attachment_from_days: type.lt_attachment_from_days,
        lt_min_service_days: type.lt_min_service_days,
        lt_status: type.lt_status,
    };
}

// ─── อ่าน ───────────────────────────────────────────────────────────────────────────────────

const REQUEST_COLUMNS = `r.lr_id, r.lr_employee_id, r.lr_leave_type_id, t.lt_name_th, t.lt_is_paid,
    DATE_FORMAT(r.lr_start_date, '%Y-%m-%d') AS lr_start_date, DATE_FORMAT(r.lr_end_date, '%Y-%m-%d') AS lr_end_date,
    r.lr_half_day, r.lr_days, r.lr_reason, r.lr_status, r.lr_version, r.lr_submitted_at, r.lr_decided_at,
    r.lr_decision_note, r.lr_cancelled_at, r.lr_cancel_reason,
    CONCAT(decider.user_fname, ' ', decider.user_lname) AS decided_by_name,
    (SELECT COUNT(*) FROM tb_leave_attachments a WHERE a.lra_request_id = r.lr_id) AS attachment_count`;

const REQUEST_JOINS = `FROM tb_leave_requests r
    JOIN tb_leave_types t ON t.lt_id = r.lr_leave_type_id
    LEFT JOIN tb_users decider ON decider.user_id = r.lr_decided_by`;

function shapeRequest(row) {
    return { ...row, lt_is_paid: row.lt_is_paid === 1, attachment_count: Number(row.attachment_count) };
}

async function attachmentsOf(conn, requestIds) {
    if (requestIds.length === 0) return new Map();
    const [rows] = await conn.query(
        `SELECT lra_id, lra_request_id, lra_file_name, lra_file_size FROM tb_leave_attachments
         WHERE lra_request_id IN (?) ORDER BY lra_id`,
        [requestIds],
    );
    const byRequest = new Map();
    for (const { lra_request_id: requestId, ...file } of rows) {
        byRequest.set(requestId, [...(byRequest.get(requestId) ?? []), file]);
    }
    return byRequest;
}

/**
 * หน้า "ลาของฉัน" — ยอดคงเหลือ + คำขอทั้งปี + ประเภทที่เลือกได้
 * @param {string} userId
 * @param {number} year
 */
async function getMine(conn, userId, year) {
    const today = todayBangkok();
    const employee = await findLinkedEmployee(conn, userId);
    if (!employee) return { year, today, employee: null, balances: [], requests: [] };
    const [rows] = await conn.query(
        `SELECT ${REQUEST_COLUMNS} ${REQUEST_JOINS}
         WHERE r.lr_employee_id = ? AND YEAR(r.lr_start_date) = ?
         ORDER BY r.lr_start_date DESC, r.lr_id DESC`,
        [employee.emp_id, year],
    );
    const attachments = await attachmentsOf(
        conn,
        rows.map((row) => row.lr_id),
    );
    return {
        year,
        today,
        employee,
        balances: await balancesOf(conn, employee, year),
        requests: rows.map((row) => ({ ...shapeRequest(row), attachments: attachments.get(row.lr_id) ?? [] })),
    };
}

/**
 * ยอดลาของพนักงานคนหนึ่ง (ฝ่ายบุคคล/ผู้อนุมัติ — หน้าพนักงาน)
 */
async function getEmployeeBalances(conn, employeeId, year) {
    const [[employee]] = await conn.query(
        "SELECT emp_id, DATE_FORMAT(emp_hire_date, '%Y-%m-%d') AS emp_hire_date FROM tb_employees WHERE emp_id = ?",
        [employeeId],
    );
    if (!employee) throw new AppError(404, "EMPLOYEE_NOT_FOUND", "ไม่พบพนักงานนี้");
    return { year, balances: await balancesOf(conn, employee, year) };
}

/**
 * ปฏิทินลาของทีมในเดือน — ชื่อ + ช่วงวัน + ครึ่งวัน + อนุมัติแล้ว/รออนุมัติ (ไม่มีประเภท/เหตุผล)
 * @param {string} yearMonth "YYYY-MM"
 */
async function getCalendar(conn, yearMonth) {
    const monthStart = `${yearMonth}-01`;
    const monthEnd = addDays(addDays(monthStart, 32).slice(0, 8) + "01", -1);
    const [rows] = await conn.query(
        `SELECT r.lr_id, DATE_FORMAT(r.lr_start_date, '%Y-%m-%d') AS lr_start_date,
                DATE_FORMAT(r.lr_end_date, '%Y-%m-%d') AS lr_end_date, r.lr_half_day, r.lr_status,
                e.emp_first_name_th, e.emp_last_name_th, e.emp_nickname
         FROM tb_leave_requests r
         JOIN tb_employees e ON e.emp_id = r.lr_employee_id
         WHERE r.lr_status IN ('pending', 'approved') AND r.lr_start_date <= ? AND r.lr_end_date >= ?
         ORDER BY r.lr_start_date, e.emp_first_name_th`,
        [monthEnd, monthStart],
    );
    const calendar = await loadWorkCalendar(conn, monthStart, monthEnd);
    return {
        month: yearMonth,
        month_start: monthStart,
        month_end: monthEnd,
        working_weekdays: calendar.workingWeekdays,
        holidays: [...calendar.holidayDates],
        leaves: rows.map((row) => ({
            lr_id: row.lr_id,
            lr_start_date: row.lr_start_date,
            lr_end_date: row.lr_end_date,
            lr_half_day: row.lr_half_day,
            lr_status: row.lr_status,
            employee_name: row.emp_nickname
                ? `${row.emp_first_name_th} (${row.emp_nickname})`
                : `${row.emp_first_name_th} ${row.emp_last_name_th.slice(0, 1)}.`,
        })),
    };
}

/**
 * คำขอของคนอื่นสำหรับผู้อนุมัติ (approveLeave) — ไม่รวมของตัวเอง · มียอดคงเหลือของประเภทนั้นให้เห็นว่าเกินโควตาไหม
 * status "pending" = รออนุมัติ · "approved" = อนุมัติแล้วที่จบไปไม่เกิน 60 วัน (ไว้ยกเลิกเมื่อพนักงานกลับมาทำงาน/ลาผิด)
 * @param {{ user_id: string }} user
 * @param {"pending" | "approved"} status
 */
async function listPending(conn, user, status = "pending") {
    const ownEmployeeIds = await ownEmployeeIdsOf(conn, user.user_id);
    const [rows] = await conn.query(
        `SELECT ${REQUEST_COLUMNS}, e.emp_code, e.emp_first_name_th, e.emp_last_name_th, e.emp_nickname,
                DATE_FORMAT(e.emp_hire_date, '%Y-%m-%d') AS emp_hire_date
         ${REQUEST_JOINS}
         JOIN tb_employees e ON e.emp_id = r.lr_employee_id
         WHERE r.lr_status = ? AND (? = 'pending' OR r.lr_end_date >= ?)
         ORDER BY r.lr_start_date, r.lr_id`,
        [status, status, addDays(todayBangkok(), -APPROVED_LIST_DAYS)],
    );
    const pending = rows.filter((row) => !ownEmployeeIds.has(row.lr_employee_id));
    const attachments = await attachmentsOf(
        conn,
        pending.map((row) => row.lr_id),
    );
    const result = [];
    for (const row of pending) {
        const year = Number(row.lr_start_date.slice(0, 4));
        const employee = { emp_id: row.lr_employee_id, emp_hire_date: row.emp_hire_date };
        const balance = (await balancesOf(conn, employee, year)).find((item) => item.lt_id === row.lr_leave_type_id);
        const remainingAfter =
            balance?.remaining === null || balance === undefined
                ? null
                : formatHundredths(days(balance.remaining) - days(row.lr_days));
        result.push({
            ...shapeRequest(row),
            employee_name: `${row.emp_first_name_th} ${row.emp_last_name_th}`,
            emp_code: row.emp_code,
            emp_nickname: row.emp_nickname,
            quota: balance?.quota ?? null,
            remaining_after_approve: remainingAfter,
            is_over_quota: remainingAfter !== null && days(remainingAfter) < 0n,
            attachments: attachments.get(row.lr_id) ?? [],
        });
    }
    return result;
}

async function ownEmployeeIdsOf(conn, userId) {
    const [rows] = await conn.query("SELECT emp_id FROM tb_employees WHERE emp_user_id = ?", [userId]);
    return new Set(rows.map((row) => row.emp_id));
}

// ─── สร้าง / แก้ / ลบร่าง ────────────────────────────────────────────────────────────────────

/**
 * ตรวจกติกาที่ไม่ขึ้นกับคนอื่น: ประเภทใช้ได้ · อยู่ในช่วงที่เป็นพนักงาน · อายุงานถึง · ไม่ไกลเกินปีหน้า · มีวันทำงาน
 * @returns {Promise<{ type: object, dates: string[], dayCount: bigint }>}
 */
async function checkRequest(conn, employee, request) {
    await assertPeriodsOpen(conn, [request.lr_start_date, request.lr_end_date], "การลา");
    const [[type]] = await conn.query(
        "SELECT lt_id, lt_name_th, lt_status, lt_min_service_days, lt_attachment_from_days FROM tb_leave_types WHERE lt_id = ?",
        [request.lr_leave_type_id],
    );
    const fields = {};
    if (!type || type.lt_status !== "active") fields.lr_leave_type_id = "ประเภทลานี้ปิดใช้งานแล้ว เลือกประเภทอื่น";
    if (request.lr_start_date < employee.emp_hire_date) {
        fields.lr_start_date = `ลาก่อนวันเริ่มงาน (${employee.emp_hire_date}) ไม่ได้`;
    }
    if (employee.emp_termination_date && request.lr_end_date > employee.emp_termination_date) {
        fields.lr_end_date = `ลาหลังวันทำงานวันสุดท้าย (${employee.emp_termination_date}) ไม่ได้`;
    }
    const nextYear = Number(todayBangkok().slice(0, 4)) + 1;
    if (Number(request.lr_start_date.slice(0, 4)) > nextYear) {
        fields.lr_start_date = "ลาล่วงหน้าได้ถึงสิ้นปีหน้าเท่านั้น";
    }
    if (type && type.lt_min_service_days > 0) {
        const eligibleFrom = addDays(employee.emp_hire_date, type.lt_min_service_days);
        if (request.lr_start_date < eligibleFrom) {
            fields.lr_leave_type_id = `${type.lt_name_th}ใช้ได้เมื่อทำงานครบ ${type.lt_min_service_days} วัน (ตั้งแต่ ${eligibleFrom})`;
        }
    }
    if (Object.keys(fields).length > 0) {
        throw new AppError(400, "VALIDATION", "คำขอลาบางช่องใช้ไม่ได้ กรุณาแก้ตามข้อความใต้ช่อง", fields);
    }
    const { dates, dayCount } = await leaveDaysOf(conn, request, employee.emp_id);
    if (dayCount === 0n) {
        throw new AppError(400, "VALIDATION", "ช่วงที่เลือกไม่มีวันทำงาน (เป็นวันหยุดทั้งหมด)", {
            lr_end_date: "ช่วงนี้ไม่มีวันทำงาน — ไม่ต้องขอลา",
        });
    }
    return { type, dates, dayCount };
}

/**
 * สร้างคำขอลาเป็นร่าง
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {{ user_id: string }} user
 * @param {object} request ผ่าน leaveRequestSchema แล้ว
 */
async function createDraft(conn, user, request) {
    const employee = requireEmployee(await findLinkedEmployee(conn, user.user_id, { forUpdate: true }));
    const { dayCount } = await checkRequest(conn, employee, request);
    const [result] = await conn.query(
        `INSERT INTO tb_leave_requests
            (lr_employee_id, lr_leave_type_id, lr_start_date, lr_end_date, lr_half_day, lr_days, lr_reason, lr_created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            employee.emp_id,
            request.lr_leave_type_id,
            request.lr_start_date,
            request.lr_end_date,
            request.lr_half_day,
            formatHundredths(dayCount),
            request.lr_reason,
            user.user_id,
        ],
    );
    return { lr_id: result.insertId };
}

/**
 * แก้ร่าง (ของตัวเองเท่านั้น)
 */
async function updateDraft(conn, user, requestId, version, request) {
    const { row, employee } = await lockOwn(conn, user, requestId, version);
    if (row.lr_status !== "draft") throw wrongStatus("แก้ได้เฉพาะร่าง — ดึงกลับจากรออนุมัติก่อนแล้วจึงแก้");
    const { dayCount } = await checkRequest(conn, employee, request);
    await conn.query(
        `UPDATE tb_leave_requests
         SET lr_leave_type_id = ?, lr_start_date = ?, lr_end_date = ?, lr_half_day = ?, lr_days = ?, lr_reason = ?,
             lr_version = lr_version + 1
         WHERE lr_id = ?`,
        [
            request.lr_leave_type_id,
            request.lr_start_date,
            request.lr_end_date,
            request.lr_half_day,
            formatHundredths(dayCount),
            request.lr_reason,
            requestId,
        ],
    );
    return { lr_id: requestId };
}

/**
 * ลบร่าง — ส่งคืน path ไฟล์แนบให้ controller ลบหลัง transaction สำเร็จ
 * @returns {Promise<{ filePaths: string[] }>}
 */
async function deleteDraft(conn, user, requestId, version) {
    const { row } = await lockOwn(conn, user, requestId, version);
    if (row.lr_status !== "draft") throw wrongStatus("ลบได้เฉพาะร่าง — ที่ส่งแล้วให้ใช้ยกเลิก (เก็บประวัติไว้)");
    const [files] = await conn.query("SELECT lra_file_path FROM tb_leave_attachments WHERE lra_request_id = ?", [
        requestId,
    ]);
    await conn.query("DELETE FROM tb_leave_requests WHERE lr_id = ?", [requestId]);
    return { filePaths: files.map((file) => file.lra_file_path) };
}

// ─── ส่ง / ดึงกลับ / ยกเลิกของตัวเอง ──────────────────────────────────────────────────────────────

/**
 * ส่งให้ผู้อนุมัติ — คิดวันใหม่ · ตรวจทับซ้อน · ตรวจลงเวลาในวันลาเต็มวัน · ตรวจไฟล์แนบตามประเภท
 */
async function submit(conn, user, requestId, version) {
    const { row, employee } = await lockOwn(conn, user, requestId, version);
    if (row.lr_status !== "draft") throw wrongStatus("ส่งได้เฉพาะร่าง");
    const { type, dates, dayCount } = await checkRequest(conn, employee, row);
    await assertNoOverlap(conn, row);
    await assertNoTimesheetHours(conn, row, dates);
    if (type.lt_attachment_from_days !== null && dayCount >= days(type.lt_attachment_from_days)) {
        const [[{ fileCount }]] = await conn.query(
            "SELECT COUNT(*) AS fileCount FROM tb_leave_attachments WHERE lra_request_id = ?",
            [requestId],
        );
        if (Number(fileCount) === 0) {
            throw new AppError(
                409,
                "LEAVE_ATTACHMENT_REQUIRED",
                `${type.lt_name_th}ตั้งแต่ ${Number(type.lt_attachment_from_days)} วันต้องแนบไฟล์ (เช่น ใบรับรองแพทย์) ก่อนส่ง`,
            );
        }
    }
    await conn.query(
        `UPDATE tb_leave_requests
         SET lr_status = 'pending', lr_days = ?, lr_submitted_at = NOW(), lr_version = lr_version + 1
         WHERE lr_id = ?`,
        [formatHundredths(dayCount), requestId],
    );
    return { lr_id: requestId };
}

/** ดึงกลับจากรออนุมัติเป็นร่าง (แก้แล้วส่งใหม่) */
async function withdraw(conn, user, requestId, version) {
    const { row } = await lockOwn(conn, user, requestId, version);
    if (row.lr_status !== "pending") throw wrongStatus("ดึงกลับได้เฉพาะคำขอที่รออนุมัติ");
    await conn.query(
        "UPDATE tb_leave_requests SET lr_status = 'draft', lr_submitted_at = NULL, lr_version = lr_version + 1 WHERE lr_id = ?",
        [requestId],
    );
    return { lr_id: requestId };
}

/**
 * ยกเลิกของตัวเอง — ร่าง/รออนุมัติได้เสมอ · อนุมัติแล้วได้ถ้ายังไม่ถึงวันลา (เริ่มแล้วให้ผู้อนุมัติยกเลิก)
 */
async function cancelOwn(conn, user, requestId, version, reason) {
    const { row } = await lockOwn(conn, user, requestId, version);
    if (row.lr_status === "approved" && row.lr_start_date <= todayBangkok()) {
        throw wrongStatus("ลาที่ถึงวันแล้วยกเลิกเองไม่ได้ — แจ้งผู้อนุมัติให้ยกเลิกให้");
    }
    if (!["draft", "pending", "approved"].includes(row.lr_status)) throw wrongStatus("คำขอนี้ปิดไปแล้ว");
    await markCancelled(conn, requestId, user, reason);
    return { lr_id: requestId };
}

// ─── อนุมัติ / ไม่อนุมัติ / ยกเลิกโดยผู้อนุมัติ ─────────────────────────────────────────────────────────

/** อนุมัติ — ตรวจทับซ้อน/ลงเวลาอีกรอบ (อาจเปลี่ยนตั้งแต่ส่ง) · คิดวันใหม่ */
async function approve(conn, user, requestId, version) {
    const { row } = await lockForApprover(conn, user, requestId, version);
    if (row.lr_status !== "pending") throw wrongStatus("คำขอนี้ไม่ได้รออนุมัติแล้ว กรุณาโหลดหน้าใหม่");
    const { dates, dayCount } = await leaveDaysOf(conn, row, row.lr_employee_id);
    if (dayCount === 0n) throw wrongStatus("ช่วงลาไม่มีวันทำงานแล้ว (วันหยุดถูกเพิ่ม) — ให้พนักงานยกเลิกคำขอนี้");
    await assertNoOverlap(conn, row);
    await assertNoTimesheetHours(conn, row, dates);
    await conn.query(
        `UPDATE tb_leave_requests
         SET lr_status = 'approved', lr_days = ?, lr_decided_by = ?, lr_decided_at = NOW(), lr_decision_note = NULL,
             lr_version = lr_version + 1
         WHERE lr_id = ?`,
        [formatHundredths(dayCount), user.user_id, requestId],
    );
    return { lr_id: requestId };
}

async function reject(conn, user, requestId, version, reason) {
    const { row } = await lockForApprover(conn, user, requestId, version);
    if (row.lr_status !== "pending") throw wrongStatus("คำขอนี้ไม่ได้รออนุมัติแล้ว กรุณาโหลดหน้าใหม่");
    await conn.query(
        `UPDATE tb_leave_requests
         SET lr_status = 'rejected', lr_decided_by = ?, lr_decided_at = NOW(), lr_decision_note = ?, lr_version = lr_version + 1
         WHERE lr_id = ?`,
        [user.user_id, reason, requestId],
    );
    return { lr_id: requestId };
}

/** ยกเลิกลาที่อนุมัติแล้ว (ผู้อนุมัติ — ใช้เมื่อพนักงานกลับมาทำงานก่อน/ลาผิด) */
async function cancelApproved(conn, user, requestId, version, reason) {
    const { row } = await lockForApprover(conn, user, requestId, version);
    if (row.lr_status !== "approved") throw wrongStatus("ยกเลิกแบบนี้ได้เฉพาะลาที่อนุมัติแล้ว");
    await markCancelled(conn, requestId, user, reason);
    return { lr_id: requestId };
}

async function markCancelled(conn, requestId, user, reason) {
    await conn.query(
        `UPDATE tb_leave_requests
         SET lr_status = 'cancelled', lr_cancelled_by = ?, lr_cancelled_at = NOW(), lr_cancel_reason = ?,
             lr_version = lr_version + 1
         WHERE lr_id = ?`,
        [user.user_id, reason ?? null, requestId],
    );
}

// ─── ล็อก + สิทธิ์ ──────────────────────────────────────────────────────────────────────────

async function lockRequest(conn, requestId) {
    const [[row]] = await conn.query(
        `SELECT lr_id, lr_employee_id, lr_leave_type_id, DATE_FORMAT(lr_start_date, '%Y-%m-%d') AS lr_start_date,
                DATE_FORMAT(lr_end_date, '%Y-%m-%d') AS lr_end_date, lr_half_day, lr_days, lr_status, lr_version
         FROM tb_leave_requests WHERE lr_id = ? FOR UPDATE`,
        [requestId],
    );
    if (!row) throw notFound();
    return row;
}

// ล็อกแถวพนักงานก่อนคำขอเสมอ (ลำดับเดียวกันทุกเส้น) — ตรวจทับซ้อนของคนเดียวกันพร้อมกันได้ถูก
async function lockEmployeeOf(conn, employeeId) {
    const [[employee]] = await conn.query(
        `SELECT emp_id, emp_user_id, DATE_FORMAT(emp_hire_date, '%Y-%m-%d') AS emp_hire_date,
                DATE_FORMAT(emp_termination_date, '%Y-%m-%d') AS emp_termination_date
         FROM tb_employees WHERE emp_id = ? FOR UPDATE`,
        [employeeId],
    );
    return employee;
}

async function lockOwn(conn, user, requestId, version) {
    const [[owner]] = await conn.query("SELECT lr_employee_id FROM tb_leave_requests WHERE lr_id = ?", [requestId]);
    if (!owner) throw notFound();
    const employee = await lockEmployeeOf(conn, owner.lr_employee_id);
    if (employee.emp_user_id !== user.user_id) throw notFound();
    const row = await lockRequest(conn, requestId);
    if (row.lr_version !== version) throw versionChanged();
    await assertPeriodsOpen(conn, [row.lr_start_date, row.lr_end_date], "การลา");
    return { row, employee };
}

async function lockForApprover(conn, user, requestId, version) {
    const [[owner]] = await conn.query("SELECT lr_employee_id FROM tb_leave_requests WHERE lr_id = ?", [requestId]);
    if (!owner) throw notFound();
    const employee = await lockEmployeeOf(conn, owner.lr_employee_id);
    if (employee.emp_user_id === user.user_id) {
        throw new AppError(
            403,
            "SELF_APPROVAL_NOT_ALLOWED",
            "อนุมัติหรือตัดสินคำขอลาของตัวเองไม่ได้ — ให้ผู้อนุมัติคนอื่นทำ",
        );
    }
    const row = await lockRequest(conn, requestId);
    if (row.lr_version !== version) throw versionChanged();
    await assertPeriodsOpen(conn, [row.lr_start_date, row.lr_end_date], "การลา");
    return { row, employee };
}

/**
 * ทับซ้อนกับลาที่ส่งแล้ว/อนุมัติแล้วของคนเดียวกัน — ครึ่งวันเช้า + ครึ่งวันบ่ายวันเดียวกันไม่ถือว่าทับ
 */
async function assertNoOverlap(conn, request) {
    const [others] = await conn.query(
        `SELECT lr_id, DATE_FORMAT(lr_start_date, '%Y-%m-%d') AS lr_start_date,
                DATE_FORMAT(lr_end_date, '%Y-%m-%d') AS lr_end_date, lr_half_day, lr_status
         FROM tb_leave_requests
         WHERE lr_employee_id = ? AND lr_id <> ? AND lr_status IN (?) AND lr_start_date <= ? AND lr_end_date >= ?`,
        [request.lr_employee_id, request.lr_id, ACTIVE_STATUSES, request.lr_end_date, request.lr_start_date],
    );
    const clash = others.find((other) => {
        const isOppositeHalves =
            request.lr_half_day !== "none" && other.lr_half_day !== "none" && request.lr_half_day !== other.lr_half_day;
        return !isOppositeHalves;
    });
    if (clash) {
        throw new AppError(
            409,
            "LEAVE_OVERLAP",
            `ทับกับลาที่${clash.lr_status === "approved" ? "อนุมัติแล้ว" : "รออนุมัติ"} (${clash.lr_start_date} ถึง ${clash.lr_end_date}) — แก้ช่วงวันหรือยกเลิกใบเดิมก่อน`,
        );
    }
}

/**
 * ลาเต็มวันในวันที่มีชั่วโมงลงเวลาไว้ไม่ได้ (ต้นทุนโปรเจกต์จะนับซ้ำ) — ครึ่งวันลงเวลาได้
 */
async function assertNoTimesheetHours(conn, request, dates) {
    if (request.lr_half_day !== "none" || dates.length === 0) return;
    // ปิดลงชั่วโมงต่อโปรเจกต์แล้ว (2026-10-23) ไม่ต้องตรวจชั่วโมงเก่า
    if (!(await isTimesheetEnabled(conn))) return;
    const [rows] = await conn.query(
        `SELECT DATE_FORMAT(tse_date, '%Y-%m-%d') AS tse_date FROM tb_timesheet_entries
         WHERE tse_employee_id = ? AND tse_date IN (?) GROUP BY tse_date ORDER BY tse_date`,
        [request.lr_employee_id, dates],
    );
    if (rows.length === 0) return;
    throw new AppError(
        409,
        "LEAVE_HAS_TIMESHEET",
        `มีชั่วโมงลงเวลาในวันที่ ${rows.map((row) => row.tse_date).join(", ")} — ลบชั่วโมงวันนั้นในหน้าลงเวลาก่อน หรือลาครึ่งวันแทน`,
    );
}

// ─── ไฟล์แนบ ────────────────────────────────────────────────────────────────────────────────

/** แนบไฟล์ — เจ้าของ ตอนเป็นร่าง/รออนุมัติ */
async function addAttachment(conn, user, requestId, file) {
    const [[owner]] = await conn.query(
        `SELECT r.lr_status, e.emp_user_id FROM tb_leave_requests r JOIN tb_employees e ON e.emp_id = r.lr_employee_id
         WHERE r.lr_id = ? FOR UPDATE`,
        [requestId],
    );
    if (!owner || owner.emp_user_id !== user.user_id) throw notFound();
    if (!["draft", "pending"].includes(owner.lr_status)) {
        throw wrongStatus("แนบไฟล์ได้เฉพาะคำขอที่เป็นร่างหรือรออนุมัติ");
    }
    const [[{ fileCount }]] = await conn.query(
        "SELECT COUNT(*) AS fileCount FROM tb_leave_attachments WHERE lra_request_id = ?",
        [requestId],
    );
    if (Number(fileCount) >= MAX_LEAVE_ATTACHMENTS) {
        throw new AppError(409, "LEAVE_ATTACHMENT_LIMIT", `แนบได้ไม่เกิน ${MAX_LEAVE_ATTACHMENTS} ไฟล์ต่อคำขอ`);
    }
    const [result] = await conn.query(
        `INSERT INTO tb_leave_attachments (lra_request_id, lra_file_path, lra_file_name, lra_file_size, lra_uploaded_by)
         VALUES (?, ?, ?, ?, ?)`,
        [requestId, file.storedPath, file.fileName, file.fileSize, user.user_id],
    );
    return { lra_id: Number(result.insertId), lra_file_name: file.fileName };
}

/** ลบไฟล์แนบ — เจ้าของ ตอนเป็นร่างเท่านั้น (ส่งแล้วไฟล์เป็นหลักฐานของผู้อนุมัติ) */
async function removeAttachment(conn, user, requestId, attachmentId) {
    const [[owner]] = await conn.query(
        `SELECT r.lr_status, e.emp_user_id FROM tb_leave_requests r JOIN tb_employees e ON e.emp_id = r.lr_employee_id
         WHERE r.lr_id = ? FOR UPDATE`,
        [requestId],
    );
    if (!owner || owner.emp_user_id !== user.user_id) throw notFound();
    if (owner.lr_status !== "draft") throw wrongStatus("ลบไฟล์ได้เฉพาะตอนเป็นร่าง — ดึงกลับก่อนแล้วจึงลบ");
    const [[file]] = await conn.query(
        "SELECT lra_file_path FROM tb_leave_attachments WHERE lra_id = ? AND lra_request_id = ?",
        [attachmentId, requestId],
    );
    if (!file) throw new AppError(404, "LEAVE_ATTACHMENT_NOT_FOUND", "ไม่พบไฟล์แนบนี้ อาจถูกลบไปแล้ว");
    await conn.query("DELETE FROM tb_leave_attachments WHERE lra_id = ?", [attachmentId]);
    return { oldPath: file.lra_file_path };
}

/** เปิดไฟล์แนบ — เจ้าของ · ผู้อนุมัติลา · ฝ่ายบุคคล (manageEmployees) */
async function findAttachment(conn, user, requestId, attachmentId) {
    const [[owner]] = await conn.query(
        `SELECT e.emp_user_id FROM tb_leave_requests r JOIN tb_employees e ON e.emp_id = r.lr_employee_id
         WHERE r.lr_id = ?`,
        [requestId],
    );
    if (!owner) throw notFound();
    const canSee =
        owner.emp_user_id === user.user_id ||
        hasBit(user.role_permission, "approveLeave") ||
        hasBit(user.role_permission, "manageEmployees");
    if (!canSee) throw notFound();
    const [[file]] = await conn.query(
        "SELECT lra_file_path, lra_file_name FROM tb_leave_attachments WHERE lra_id = ? AND lra_request_id = ?",
        [attachmentId, requestId],
    );
    if (!file) throw new AppError(404, "LEAVE_ATTACHMENT_NOT_FOUND", "ไม่พบไฟล์แนบนี้ อาจถูกลบไปแล้ว");
    return { storedPath: file.lra_file_path, fileName: file.lra_file_name };
}

// ─── ใช้ร่วมกับลงเวลา ──────────────────────────────────────────────────────────────────────────

/**
 * วันลา (อนุมัติแล้ว) ของพนักงานในช่วง — วันทำงานเท่านั้น · แยกเต็มวัน/ครึ่งวัน (หน้าลงเวลาแสดง + กันลงเวลาวันลาเต็มวัน)
 * @returns {Promise<Map<string, "full" | "morning" | "afternoon">>}
 */
async function approvedLeaveDays(conn, employeeId, fromDate, toDate) {
    const [rows] = await conn.query(
        `SELECT DATE_FORMAT(lr_start_date, '%Y-%m-%d') AS lr_start_date, DATE_FORMAT(lr_end_date, '%Y-%m-%d') AS lr_end_date,
                lr_half_day
         FROM tb_leave_requests
         WHERE lr_employee_id = ? AND lr_status = 'approved' AND lr_start_date <= ? AND lr_end_date >= ?`,
        [employeeId, toDate, fromDate],
    );
    const leaveDays = new Map();
    if (rows.length === 0) return leaveDays;
    const calendar = await loadWorkCalendar(conn, fromDate, toDate);
    for (const row of rows) {
        const start = row.lr_start_date < fromDate ? fromDate : row.lr_start_date;
        const end = row.lr_end_date > toDate ? toDate : row.lr_end_date;
        for (const date of workingDatesBetween(start, end, calendar.workingWeekdays, calendar.holidayDates)) {
            const kind = row.lr_half_day === "none" ? "full" : row.lr_half_day;
            // เช้า + บ่ายวันเดียวกัน (สองใบ) = เต็มวัน
            const isSecondHalf = leaveDays.has(date) && leaveDays.get(date) !== kind;
            leaveDays.set(date, isSecondHalf ? "full" : kind);
        }
    }
    return leaveDays;
}

module.exports = {
    getMine,
    preview,
    getEmployeeBalances,
    getCalendar,
    listPending,
    createDraft,
    updateDraft,
    deleteDraft,
    submit,
    withdraw,
    cancelOwn,
    approve,
    reject,
    cancelApproved,
    addAttachment,
    removeAttachment,
    findAttachment,
    approvedLeaveDays,
};
