// ลงเวลาทำงานรายสัปดาห์ (2026-10-17 เฟส 4 ขั้น 4-2) — docs/plans/2026-10-17-people-payroll-4.md หัวข้อ 3.5 และ 4.1
//
// - พนักงาน = พนักงานที่ผูกกับบัญชีผู้ใช้ที่ login (ทุกคนลงเวลาของตัวเองได้โดยไม่ต้องมีสิทธิ์)
// - บันทึกทั้งสัปดาห์ครั้งเดียว (แทนที่ทุกแถว) · แก้ได้เมื่อเป็นร่างหรือถูกตีกลับ · ส่งแล้วแก้ไม่ได้จนกว่าจะถูกตีกลับ
// - ลงวันในอนาคตไม่ได้ · ย้อนหลังได้ไม่เกิน ps_timesheet_backdate_days (สัปดาห์ที่ถูกตีกลับแก้ได้ไม่จำกัด) · นอกช่วงที่เป็นพนักงานไม่ได้
// - โปรเจกต์ต้องเป็นสมาชิกและไม่ถูกยกเลิก (แถวเดิมที่ลงไว้ก่อนออกจากโปรเจกต์คงไว้ได้)
// - ผู้อนุมัติ: approveTimesheet = ทุกแถว · สมาชิกโปรเจกต์ที่มีสิทธิ์ "จัดการสมาชิก" = เฉพาะแถวของโปรเจกต์นั้น · อนุมัติของตัวเองไม่ได้
//   อนุมัติครบทุกแถว = สัปดาห์ approved · ตีกลับ = ทั้งสัปดาห์กลับไปแก้ + ล้างการอนุมัติทุกแถว
// - ลงวันที่ลาเต็มวัน (อนุมัติแล้ว) ไม่ได้ (ขั้น 4-3) · ขั้น 4-4 เพิ่ม: สัปดาห์ในเดือนที่รอบเงินเดือนอนุมัติแล้วแก้/ตีกลับไม่ได้
const { AppError } = require("../utils/app-error");
const { todayBangkok } = require("../utils/bangkok-time");
const { hasBit } = require("../shared/permissions.mjs");
const { PROJECT_BIT_INDEX } = require("../utils/projectPermissions");
const { addDays, weekDates, weekdayIndex } = require("../shared/payroll-math.mjs");
const { formatHundredths } = require("../shared/money.mjs");
const { findLinkedEmployee } = require("./linked-employee.service");
const leaveService = require("./leave.service");
const { assertPeriodsOpen } = require("./payroll-lock.service");
const { assertTimesheetEnabled, isTimesheetEnabled } = require("./timesheet-switch.service");

const EDITABLE_STATUSES = ["draft", "returned"];
const MANAGE_MEMBERS_BIT = PROJECT_BIT_INDEX.manageMembers;

function versionChanged() {
    return new AppError(409, "TIMESHEET_CHANGED", "สัปดาห์นี้มีการเปลี่ยนแปลงไปก่อนแล้ว กรุณาโหลดหน้าใหม่");
}

function validationError(fields, message = "ลงเวลาบางแถวใช้ไม่ได้ กรุณาแก้ตามข้อความใต้แถว") {
    return new AppError(400, "VALIDATION", message, fields);
}

// ─── พนักงานของผู้ใช้ ──────────────────────────────────────────────────────────────────────────

function requireEmployee(employee) {
    if (employee) return employee;
    throw new AppError(
        409,
        "NOT_AN_EMPLOYEE",
        "บัญชีของคุณยังไม่ได้ผูกกับพนักงาน — ติดต่อฝ่ายบุคคลให้ผูกบัญชีในหน้าพนักงานก่อนลงเวลา",
    );
}

// ─── อ่านสัปดาห์ของฉัน ─────────────────────────────────────────────────────────────────────────

/**
 * สัปดาห์ของพนักงานที่ login + ตัวเลือกโปรเจกต์/งาน + ข้อมูลวัน (วันหยุด/วันทำงาน/อยู่ในช่วงที่เป็นพนักงาน)
 * @param {import("mysql2/promise").Pool | import("mysql2/promise").PoolConnection} conn
 * @param {string} userId
 * @param {string} weekStart วันจันทร์ "YYYY-MM-DD"
 */
async function getMyWeek(conn, userId, weekStart) {
    const today = todayBangkok();
    const settings = await findTimesheetSettings(conn);
    const employee = await findLinkedEmployee(conn, userId);
    const base = { week_start: weekStart, today, backdate_days: settings.ps_timesheet_backdate_days };
    if (!employee) return { ...base, employee: null, week: null, entries: [], days: [], projects: [] };

    const week = await findWeek(conn, employee.emp_id, weekStart);
    const entries = week ? await findEntries(conn, week.tsw_id) : [];
    const days = await describeDays(conn, weekStart, settings, employee, today, week);
    const projects = await findProjectOptions(conn, userId, entries);
    return { ...base, employee, week: week ?? emptyWeek(), entries, days, projects };
}

function emptyWeek() {
    return { tsw_id: null, tsw_status: "draft", tsw_version: 0, tsw_total_hours: "0.00", tsw_return_reason: null };
}

async function findTimesheetSettings(conn) {
    const [[settings]] = await conn.query(
        "SELECT ps_working_weekdays, ps_hours_per_day, ps_timesheet_backdate_days FROM tb_payroll_settings WHERE ps_id = 1",
    );
    return settings;
}

async function findWeek(conn, employeeId, weekStart, { forUpdate = false } = {}) {
    const [[week]] = await conn.query(
        `SELECT tsw_id, tsw_employee_id, DATE_FORMAT(tsw_week_start, '%Y-%m-%d') AS tsw_week_start, tsw_status,
                tsw_version, tsw_total_hours, tsw_submitted_at, tsw_approved_at, tsw_return_reason, tsw_returned_at
         FROM tb_timesheet_weeks WHERE tsw_employee_id = ? AND tsw_week_start = ? ${forUpdate ? "FOR UPDATE" : ""}`,
        [employeeId, weekStart],
    );
    return week ?? null;
}

async function findEntries(conn, weekId) {
    const [rows] = await conn.query(
        `SELECT e.tse_id, DATE_FORMAT(e.tse_date, '%Y-%m-%d') AS tse_date, e.tse_project_id, e.tse_task_id, e.tse_hours,
                e.tse_note, e.tse_approved_at, p.project_name, t.task_title,
                CONCAT(u.user_fname, ' ', u.user_lname) AS approved_by_name
         FROM tb_timesheet_entries e
         LEFT JOIN tb_projects p ON p.project_id = e.tse_project_id
         LEFT JOIN tb_tasks t ON t.task_id = e.tse_task_id
         LEFT JOIN tb_users u ON u.user_id = e.tse_approved_by
         WHERE e.tse_week_id = ?
         ORDER BY e.tse_date, e.tse_id`,
        [weekId],
    );
    return rows;
}

// วันละแถว: วันทำงาน/วันหยุด · อยู่ในช่วงที่เป็นพนักงานไหม · ลงได้ไหม (อนาคต/เกินย้อนหลัง)
async function describeDays(conn, weekStart, settings, employee, today, week) {
    const dates = weekDates(weekStart);
    const [holidays] = await conn.query(
        `SELECT DATE_FORMAT(hd_date, '%Y-%m-%d') AS hd_date, hd_name FROM tb_company_holidays
         WHERE hd_date BETWEEN ? AND ?`,
        [dates[0], dates[6]],
    );
    const holidayNames = new Map(holidays.map((holiday) => [holiday.hd_date, holiday.hd_name]));
    const earliestDate = addDays(today, -settings.ps_timesheet_backdate_days);
    const isReturned = week?.tsw_status === "returned";
    const leaveDays = await leaveService.approvedLeaveDays(conn, employee.emp_id, dates[0], dates[6]);
    return dates.map((date) => ({
        date,
        is_working_day: settings.ps_working_weekdays[weekdayIndex(date)] === "1" && !holidayNames.has(date),
        holiday_name: holidayNames.get(date) ?? null,
        leave: leaveDays.get(date) ?? null,
        blocked_reason: blockedReasonOf(date, { employee, today, earliestDate, isReturned, leaveDays }),
    }));
}

/**
 * ทำไมวันนี้ลงเวลาไม่ได้ — null = ลงได้
 * @returns {string | null}
 */
function blockedReasonOf(date, { employee, today, earliestDate, isReturned, leaveDays }) {
    if (date < employee.emp_hire_date) return "ก่อนวันเริ่มงาน";
    if (leaveDays.get(date) === "full") return "ลาเต็มวัน (อนุมัติแล้ว)";
    if (employee.emp_termination_date && date > employee.emp_termination_date) return "หลังวันทำงานวันสุดท้าย";
    if (date > today) return "ยังไม่ถึงวันนี้";
    if (!isReturned && date < earliestDate) return "เกินระยะลงย้อนหลัง";
    return null;
}

/**
 * โปรเจกต์ที่ลงเวลาได้ = เป็นสมาชิกและไม่ถูกยกเลิก + โปรเจกต์ที่มีแถวอยู่แล้วในสัปดาห์นี้ (คงไว้แสดงได้)
 * งานที่เลือกได้ = งาน/งานย่อยที่ยังไม่เสร็จ + งานที่มีแถวอยู่แล้ว
 */
async function findProjectOptions(conn, userId, entries) {
    const existingProjectIds = [...new Set(entries.map((entry) => entry.tse_project_id).filter(Boolean))];
    const existingTaskIds = [...new Set(entries.map((entry) => entry.tse_task_id).filter(Boolean))];
    const [projects] = await conn.query(
        `SELECT p.project_id, p.project_name, p.project_status,
                EXISTS (SELECT 1 FROM tb_project_members m WHERE m.project_id = p.project_id AND m.user_id = ?) AS is_member
         FROM tb_projects p
         WHERE (p.project_status <> 'cancelled'
                AND EXISTS (SELECT 1 FROM tb_project_members m WHERE m.project_id = p.project_id AND m.user_id = ?))
            OR p.project_id IN (?)
         ORDER BY p.project_name`,
        [userId, userId, existingProjectIds.length ? existingProjectIds : [""]],
    );
    if (projects.length === 0) return [];
    const [tasks] = await conn.query(
        `SELECT t.task_id, t.project_id, t.task_title, t.task_parent_id, t.task_status
         FROM tb_tasks t
         WHERE t.project_id IN (?) AND (t.task_status <> 'done' OR t.task_id IN (?))
         ORDER BY t.task_parent_id IS NOT NULL, t.task_title`,
        [projects.map((project) => project.project_id), existingTaskIds.length ? existingTaskIds : [""]],
    );
    return projects.map((project) => ({
        ...project,
        is_member: project.is_member === 1,
        can_log: project.is_member === 1 && project.project_status !== "cancelled",
        tasks: tasks
            .filter((task) => task.project_id === project.project_id)
            .map(({ project_id: _projectId, ...task }) => task),
    }));
}

// ─── บันทึก / ส่ง ──────────────────────────────────────────────────────────────────────────────

/**
 * บันทึกทั้งสัปดาห์ (แทนที่ทุกแถว) — สร้างสัปดาห์ใหม่ถ้ายังไม่มี
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {string} userId
 * @param {{ week_start: string, tsw_version: number, entries: object[] }} payload ผ่าน timesheetWeekSchema แล้ว (ชั่วโมงเป็น BigInt)
 */
async function saveMyWeek(conn, userId, payload) {
    await assertTimesheetEnabled(conn);
    const employee = requireEmployee(await findLinkedEmployee(conn, userId, { forUpdate: true }));
    const week = await findWeek(conn, employee.emp_id, payload.week_start, { forUpdate: true });
    assertEditable(week, payload.tsw_version);
    await assertPeriodsOpen(conn, weekDates(payload.week_start), "ลงเวลา");

    const previousEntries = week ? await findEntries(conn, week.tsw_id) : [];
    await assertEntriesAllowed(conn, userId, employee, week, payload.entries, previousEntries);

    const totalHours = payload.entries.reduce((sum, entry) => sum + entry.tse_hours, 0n);
    const weekId = week
        ? await updateWeekTotal(conn, week, totalHours)
        : await insertWeek(conn, employee.emp_id, payload.week_start, totalHours);
    await conn.query("DELETE FROM tb_timesheet_entries WHERE tse_week_id = ?", [weekId]);
    for (const entry of payload.entries) {
        await conn.query(
            `INSERT INTO tb_timesheet_entries (tse_week_id, tse_employee_id, tse_date, tse_project_id, tse_task_id, tse_hours, tse_note)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                weekId,
                employee.emp_id,
                entry.tse_date,
                entry.tse_project_id,
                entry.tse_task_id,
                formatHundredths(entry.tse_hours),
                entry.tse_note,
            ],
        );
    }
    return { tsw_id: weekId };
}

/**
 * ส่งสัปดาห์ให้ผู้อนุมัติ — ต้องมีอย่างน้อย 1 แถว
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {string} userId
 * @param {string} weekStart
 * @param {number} version
 */
async function submitMyWeek(conn, userId, weekStart, version) {
    await assertTimesheetEnabled(conn);
    const employee = requireEmployee(await findLinkedEmployee(conn, userId, { forUpdate: true }));
    const week = await findWeek(conn, employee.emp_id, weekStart, { forUpdate: true });
    if (!week) throw new AppError(409, "TIMESHEET_EMPTY", "ยังไม่ได้ลงเวลาในสัปดาห์นี้ — บันทึกก่อนแล้วค่อยส่ง");
    assertEditable(week, version);
    await assertPeriodsOpen(conn, weekDates(weekStart), "ลงเวลา");
    const [[{ entryCount }]] = await conn.query(
        "SELECT COUNT(*) AS entryCount FROM tb_timesheet_entries WHERE tse_week_id = ?",
        [week.tsw_id],
    );
    if (Number(entryCount) === 0) {
        throw new AppError(409, "TIMESHEET_EMPTY", "ยังไม่มีชั่วโมงในสัปดาห์นี้ — ลงเวลาอย่างน้อย 1 แถวก่อนส่ง");
    }
    await conn.query(
        "UPDATE tb_timesheet_entries SET tse_approved_by = NULL, tse_approved_at = NULL WHERE tse_week_id = ?",
        [week.tsw_id],
    );
    await conn.query(
        `UPDATE tb_timesheet_weeks
         SET tsw_status = 'submitted', tsw_submitted_at = NOW(), tsw_approved_at = NULL, tsw_version = tsw_version + 1
         WHERE tsw_id = ?`,
        [week.tsw_id],
    );
    return { tsw_id: week.tsw_id };
}

function assertEditable(week, version) {
    const currentVersion = week ? week.tsw_version : 0;
    if (currentVersion !== version) throw versionChanged();
    if (week && !EDITABLE_STATUSES.includes(week.tsw_status)) {
        throw new AppError(
            409,
            "TIMESHEET_NOT_EDITABLE",
            week.tsw_status === "approved"
                ? "สัปดาห์นี้อนุมัติแล้ว แก้ไม่ได้ — ถ้าผิดให้แจ้งฝ่ายบุคคล"
                : "สัปดาห์นี้ส่งแล้ว รอผู้อนุมัติ — แก้ได้เมื่อถูกตีกลับ",
        );
    }
}

/**
 * ตรวจทุกแถว: วันที่ลงได้ · โปรเจกต์เป็นสมาชิก/ไม่ถูกยกเลิก · งานอยู่ในโปรเจกต์
 * แถวที่ไม่เปลี่ยน (วัน+โปรเจกต์+งาน เดิม) ผ่านกติกาโปรเจกต์ได้ แม้ออกจากโปรเจกต์ไปแล้ว
 */
async function assertEntriesAllowed(conn, userId, employee, week, entries, previousEntries) {
    const today = todayBangkok();
    const settings = await findTimesheetSettings(conn);
    const entryDates = entries.map((entry) => entry.tse_date).sort();
    const leaveDays =
        entryDates.length > 0
            ? await leaveService.approvedLeaveDays(conn, employee.emp_id, entryDates[0], entryDates.at(-1))
            : new Map();
    const context = {
        employee,
        today,
        earliestDate: addDays(today, -settings.ps_timesheet_backdate_days),
        isReturned: week?.tsw_status === "returned",
        leaveDays,
    };
    const previousKeys = new Set(previousEntries.map(entryKey));
    const projects = await findProjectsForCheck(conn, userId, entries);
    const tasks = await findTasksForCheck(conn, entries);

    const fields = {};
    entries.forEach((entry, index) => {
        const blockedReason = blockedReasonOf(entry.tse_date, context);
        const isUnchanged = previousKeys.has(entryKey(entry));
        if (blockedReason && !isUnchanged) {
            fields[`entries.${index}.tse_date`] = `ลงวันนี้ไม่ได้: ${blockedReason}`;
            return;
        }
        if (!entry.tse_project_id) return;
        const project = projects.get(entry.tse_project_id);
        if (!project) {
            fields[`entries.${index}.tse_project_id`] = "ไม่พบโปรเจกต์นี้";
            return;
        }
        if (!isUnchanged && !project.is_member) {
            fields[`entries.${index}.tse_project_id`] = "คุณไม่ได้เป็นสมาชิกของโปรเจกต์นี้";
        } else if (!isUnchanged && project.project_status === "cancelled") {
            fields[`entries.${index}.tse_project_id`] = "โปรเจกต์นี้ถูกยกเลิกแล้ว";
        }
        if (entry.tse_task_id && tasks.get(entry.tse_task_id) !== entry.tse_project_id) {
            fields[`entries.${index}.tse_task_id`] = "งานนี้ไม่ได้อยู่ในโปรเจกต์ที่เลือก";
        }
    });
    if (Object.keys(fields).length > 0) throw validationError(fields);
}

function entryKey(entry) {
    return `${entry.tse_date}|${entry.tse_project_id ?? ""}|${entry.tse_task_id ?? ""}`;
}

async function findProjectsForCheck(conn, userId, entries) {
    const projectIds = [...new Set(entries.map((entry) => entry.tse_project_id).filter(Boolean))];
    if (projectIds.length === 0) return new Map();
    const [rows] = await conn.query(
        `SELECT p.project_id, p.project_status,
                EXISTS (SELECT 1 FROM tb_project_members m WHERE m.project_id = p.project_id AND m.user_id = ?) AS is_member
         FROM tb_projects p WHERE p.project_id IN (?)`,
        [userId, projectIds],
    );
    return new Map(rows.map((row) => [row.project_id, { ...row, is_member: row.is_member === 1 }]));
}

async function findTasksForCheck(conn, entries) {
    const taskIds = [...new Set(entries.map((entry) => entry.tse_task_id).filter(Boolean))];
    if (taskIds.length === 0) return new Map();
    const [rows] = await conn.query("SELECT task_id, project_id FROM tb_tasks WHERE task_id IN (?)", [taskIds]);
    return new Map(rows.map((row) => [row.task_id, row.project_id]));
}

async function insertWeek(conn, employeeId, weekStart, totalHours) {
    const [result] = await conn.query(
        `INSERT INTO tb_timesheet_weeks (tsw_employee_id, tsw_week_start, tsw_total_hours, tsw_version)
         VALUES (?, ?, ?, 1)`,
        [employeeId, weekStart, formatHundredths(totalHours)],
    );
    return result.insertId;
}

async function updateWeekTotal(conn, week, totalHours) {
    await conn.query(
        "UPDATE tb_timesheet_weeks SET tsw_total_hours = ?, tsw_version = tsw_version + 1 WHERE tsw_id = ?",
        [formatHundredths(totalHours), week.tsw_id],
    );
    return week.tsw_id;
}

// ─── อนุมัติ / ตีกลับ ─────────────────────────────────────────────────────────────────────────

/**
 * ขอบเขตการอนุมัติของผู้ใช้: ทุกแถว (approveTimesheet) หรือเฉพาะโปรเจกต์ที่มีสิทธิ์จัดการสมาชิก
 * @returns {Promise<{ canApproveAll: boolean, projectIds: Set<string>, ownEmployeeIds: Set<string> }>}
 */
async function findApprovalScope(conn, user) {
    const canApproveAll = hasBit(user.role_permission, "approveTimesheet");
    const [positions] = await conn.query(
        `SELECT m.project_id, pos.position_permission
         FROM tb_project_members m
         JOIN tb_project_member_positions mp ON mp.project_member_id = m.project_member_id
         JOIN tb_project_positions pos ON pos.position_id = mp.position_id
         WHERE m.user_id = ?`,
        [user.user_id],
    );
    const projectIds = new Set(
        positions
            .filter((row) => String(row.position_permission ?? "")[MANAGE_MEMBERS_BIT] === "1")
            .map((row) => row.project_id),
    );
    const [ownEmployees] = await conn.query("SELECT emp_id FROM tb_employees WHERE emp_user_id = ?", [user.user_id]);
    return { canApproveAll, projectIds, ownEmployeeIds: new Set(ownEmployees.map((row) => row.emp_id)) };
}

function isInScope(entry, scope) {
    if (scope.canApproveAll) return true;
    return Boolean(entry.tse_project_id) && scope.projectIds.has(entry.tse_project_id);
}

/**
 * สัปดาห์ที่รอผู้ใช้คนนี้อนุมัติ (มีแถวในขอบเขตที่ยังไม่อนุมัติ) — ไม่รวมของตัวเอง
 * @param {import("mysql2/promise").Pool} conn
 * @param {{ user_id: string, role_permission: string }} user
 */
async function listPendingApprovals(conn, user) {
    // ปิดลงชั่วโมงแล้ว = ไม่มีอะไรรออนุมัติ (หน้ารออนุมัติ/ภาพรวมซ่อนส่วนนี้เอง)
    if (!(await isTimesheetEnabled(conn))) return { can_approve: false, weeks: [] };
    const scope = await findApprovalScope(conn, user);
    if (!scope.canApproveAll && scope.projectIds.size === 0) return { can_approve: false, weeks: [] };

    const [rows] = await conn.query(
        `SELECT w.tsw_id, w.tsw_version, w.tsw_employee_id, DATE_FORMAT(w.tsw_week_start, '%Y-%m-%d') AS tsw_week_start,
                w.tsw_total_hours, w.tsw_submitted_at,
                emp.emp_code, emp.emp_first_name_th, emp.emp_last_name_th, emp.emp_nickname,
                e.tse_id, DATE_FORMAT(e.tse_date, '%Y-%m-%d') AS tse_date, e.tse_project_id, e.tse_task_id, e.tse_hours,
                e.tse_note, e.tse_approved_at, p.project_name, t.task_title
         FROM tb_timesheet_weeks w
         JOIN tb_employees emp ON emp.emp_id = w.tsw_employee_id
         JOIN tb_timesheet_entries e ON e.tse_week_id = w.tsw_id
         LEFT JOIN tb_projects p ON p.project_id = e.tse_project_id
         LEFT JOIN tb_tasks t ON t.task_id = e.tse_task_id
         WHERE w.tsw_status = 'submitted'
         ORDER BY w.tsw_week_start, emp.emp_code, e.tse_date, e.tse_id`,
    );
    const weeks = new Map();
    for (const row of rows) {
        if (scope.ownEmployeeIds.has(row.tsw_employee_id) || !isInScope(row, scope)) continue;
        const week = weeks.get(row.tsw_id) ?? {
            tsw_id: row.tsw_id,
            tsw_version: row.tsw_version,
            tsw_week_start: row.tsw_week_start,
            tsw_total_hours: row.tsw_total_hours,
            tsw_submitted_at: row.tsw_submitted_at,
            employee_name: `${row.emp_first_name_th} ${row.emp_last_name_th}`,
            emp_code: row.emp_code,
            emp_nickname: row.emp_nickname,
            entries: [],
        };
        week.entries.push({
            tse_id: row.tse_id,
            tse_date: row.tse_date,
            tse_project_id: row.tse_project_id,
            project_name: row.project_name,
            task_title: row.task_title,
            tse_hours: row.tse_hours,
            tse_note: row.tse_note,
            is_approved: row.tse_approved_at !== null,
        });
        weeks.set(row.tsw_id, week);
    }
    const pendingWeeks = [...weeks.values()].filter((week) => week.entries.some((entry) => !entry.is_approved));
    return { can_approve: true, weeks: pendingWeeks };
}

/**
 * อนุมัติแถวในขอบเขตของผู้อนุมัติ — อนุมัติครบทุกแถวแล้ว สัปดาห์เป็น approved
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {{ user_id: string, role_permission: string }} user
 * @param {number} weekId
 * @param {number} version
 */
async function approveWeek(conn, user, weekId, version) {
    await assertTimesheetEnabled(conn);
    const week = await lockSubmittedWeek(conn, weekId, version);
    const scope = await findApprovalScope(conn, user);
    assertNotOwnWeek(week, scope);
    const [entries] = await conn.query(
        "SELECT tse_id, tse_project_id, tse_approved_at FROM tb_timesheet_entries WHERE tse_week_id = ?",
        [weekId],
    );
    const approvableIds = entries
        .filter((entry) => entry.tse_approved_at === null && isInScope(entry, scope))
        .map((entry) => entry.tse_id);
    if (approvableIds.length === 0) {
        throw new AppError(
            403,
            "NO_TIMESHEET_ROWS_TO_APPROVE",
            "ไม่มีแถวที่คุณอนุมัติได้ในสัปดาห์นี้ (อาจมีคนอนุมัติไปแล้ว)",
        );
    }
    await conn.query(
        "UPDATE tb_timesheet_entries SET tse_approved_by = ?, tse_approved_at = NOW() WHERE tse_id IN (?)",
        [user.user_id, approvableIds],
    );
    const remaining = entries.filter((entry) => entry.tse_approved_at === null).length - approvableIds.length;
    const isFullyApproved = remaining === 0;
    await conn.query(
        `UPDATE tb_timesheet_weeks
         SET tsw_status = ?, tsw_approved_at = IF(? , NOW(), NULL), tsw_version = tsw_version + 1
         WHERE tsw_id = ?`,
        [isFullyApproved ? "approved" : "submitted", isFullyApproved, weekId],
    );
    return { tsw_id: weekId, approved_rows: approvableIds.length, is_fully_approved: isFullyApproved };
}

/**
 * ตีกลับทั้งสัปดาห์ — ผู้อนุมัติต้องมีแถวในขอบเขตอย่างน้อย 1 แถว · ล้างการอนุมัติทุกแถว
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {{ user_id: string, role_permission: string }} user
 * @param {number} weekId
 * @param {number} version
 * @param {string} reason
 */
async function returnWeek(conn, user, weekId, version, reason) {
    await assertTimesheetEnabled(conn);
    const week = await lockSubmittedWeek(conn, weekId, version);
    const scope = await findApprovalScope(conn, user);
    assertNotOwnWeek(week, scope);
    const [entries] = await conn.query("SELECT tse_project_id FROM tb_timesheet_entries WHERE tse_week_id = ?", [
        weekId,
    ]);
    if (!entries.some((entry) => isInScope(entry, scope))) {
        throw new AppError(403, "NO_TIMESHEET_ROWS_TO_APPROVE", "สัปดาห์นี้ไม่มีแถวของโปรเจกต์ที่คุณดูแล ตีกลับไม่ได้");
    }
    await conn.query(
        "UPDATE tb_timesheet_entries SET tse_approved_by = NULL, tse_approved_at = NULL WHERE tse_week_id = ?",
        [weekId],
    );
    await conn.query(
        `UPDATE tb_timesheet_weeks
         SET tsw_status = 'returned', tsw_return_reason = ?, tsw_returned_by = ?, tsw_returned_at = NOW(),
             tsw_approved_at = NULL, tsw_version = tsw_version + 1
         WHERE tsw_id = ?`,
        [reason, user.user_id, weekId],
    );
    return { tsw_id: weekId };
}

async function lockSubmittedWeek(conn, weekId, version) {
    const [[week]] = await conn.query(
        `SELECT tsw_id, tsw_employee_id, tsw_status, tsw_version, DATE_FORMAT(tsw_week_start, '%Y-%m-%d') AS tsw_week_start
         FROM tb_timesheet_weeks WHERE tsw_id = ? FOR UPDATE`,
        [weekId],
    );
    if (!week) throw new AppError(404, "TIMESHEET_NOT_FOUND", "ไม่พบสัปดาห์นี้ กรุณาโหลดหน้าใหม่");
    if (week.tsw_version !== version) throw versionChanged();
    if (week.tsw_status !== "submitted") {
        throw new AppError(409, "TIMESHEET_NOT_SUBMITTED", "สัปดาห์นี้ไม่ได้รออนุมัติแล้ว กรุณาโหลดหน้าใหม่");
    }
    await assertPeriodsOpen(conn, weekDates(week.tsw_week_start), "ลงเวลา");
    return week;
}

function assertNotOwnWeek(week, scope) {
    if (scope.ownEmployeeIds.has(week.tsw_employee_id)) {
        throw new AppError(
            403,
            "SELF_APPROVAL_NOT_ALLOWED",
            "อนุมัติหรือตีกลับลงเวลาของตัวเองไม่ได้ — ให้ผู้อนุมัติคนอื่นทำ",
        );
    }
}

module.exports = {
    findLinkedEmployee,
    getMyWeek,
    saveMyWeek,
    submitMyWeek,
    listPendingApprovals,
    approveWeek,
    returnWeek,
};
