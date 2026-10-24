// หน้า "ของฉัน" และ "ภาพรวมบุคคล" (2026-10-19 — docs/plans/2026-10-19-people-ux-redesign.md ข้อ 2.1–2.2)
// รวมตัวเลขที่ต้องใช้ในคำขอเดียว · ส่วนไหนแสดงขึ้นกับสิทธิ์ของคนเปิด (ไม่มีสิทธิ์ = ไม่ส่งส่วนนั้นมาเลย)
const { hasBit } = require("../utils/permissions");
const { todayBangkok } = require("../utils/bangkok-time");
const employeeCodeService = require("./employee-code.service");
const timesheetService = require("./timesheet.service");
const correctionService = require("./attendance-correction.service");
const boardService = require("./attendance-board.service");
const overtimeService = require("./attendance-overtime.service");
const wfhService = require("./attendance-wfh.service");

const CURRENT_SQL = "(e.emp_termination_date IS NULL OR e.emp_termination_date >= ?)";

function monthBounds(today) {
    const month = today.slice(0, 7);
    const [year, monthNumber] = month.split("-").map(Number);
    const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    return { month, first: `${month}-01`, last: `${month}-${String(lastDay).padStart(2, "0")}` };
}

function previousMonth(month) {
    const [year, monthNumber] = month.split("-").map(Number);
    const date = new Date(Date.UTC(year, monthNumber - 2, 1));
    return date.toISOString().slice(0, 7);
}

// ─── ของฉัน ───────────────────────────────────────────────────────────────────────────────

/**
 * ข้อมูลพนักงานของผู้ใช้ที่เข้าระบบ + บัตรที่ใช้อยู่ (ไม่ใช่พนักงาน = employee null)
 * ไม่มีเงินเดือน/เลขประจำตัว — หน้านี้เปิดได้ทุกคน
 */
async function getMyProfile(conn, user) {
    const today = todayBangkok();
    const [[employee]] = await conn.query(
        `SELECT e.emp_id, e.emp_code, e.emp_title, e.emp_first_name_th, e.emp_last_name_th, e.emp_nickname, e.emp_position,
                DATE_FORMAT(e.emp_hire_date, '%Y-%m-%d') AS emp_hire_date,
                DATE_FORMAT(e.emp_termination_date, '%Y-%m-%d') AS emp_termination_date,
                COALESCE(e.emp_photo_url, u.user_avatar_url) AS photo_url,
                d.dep_name AS department_name, d.dep_code AS department_code, b.branch_name_th AS branch_name
         FROM tb_employees e
         JOIN tb_users u ON u.user_id = e.emp_user_id
         LEFT JOIN tb_department d ON d.dep_id = e.emp_department_id
         LEFT JOIN tb_branches b ON b.branch_id = e.emp_branch_id
         WHERE e.emp_user_id = ?
         ORDER BY ${CURRENT_SQL} DESC, e.emp_hire_date DESC
         LIMIT 1`,
        [user.user_id, today],
    );
    if (!employee) return { employee: null, card: null, today };
    const [[card]] = await conn.query(
        `SELECT ec_id, ec_seq, ec_emp_code, DATE_FORMAT(ec_expires_on, '%Y-%m-%d') AS ec_expires_on, ec_printed_at
         FROM tb_employee_cards WHERE ec_employee_id = ? AND ec_voided_at IS NULL
         ORDER BY ec_seq DESC LIMIT 1`,
        [employee.emp_id],
    );
    return { employee, card: card ?? null, today };
}

// ─── ภาพรวมบุคคล ────────────────────────────────────────────────────────────────────────────

async function countPendingLeave(conn, userId) {
    const [[{ total }]] = await conn.query(
        `SELECT COUNT(*) AS total FROM tb_leave_requests r
         WHERE r.lr_status = 'pending'
           AND r.lr_employee_id NOT IN (SELECT emp_id FROM tb_employees WHERE emp_user_id = ?)`,
        [userId],
    );
    return Number(total);
}

async function headcountOf(conn, today) {
    const { first, last } = monthBounds(today);
    const [[row]] = await conn.query(
        `SELECT
            SUM(e.emp_hire_date <= ? AND ${CURRENT_SQL}) AS working,
            SUM(e.emp_hire_date > ?) AS upcoming,
            SUM(e.emp_hire_date BETWEEN ? AND ?) AS joined_this_month,
            SUM(e.emp_termination_date BETWEEN ? AND ?) AS leaving_this_month
         FROM tb_employees e`,
        [today, today, today, first, last, first, last],
    );
    return {
        working: Number(row.working ?? 0),
        upcoming: Number(row.upcoming ?? 0),
        joined_this_month: Number(row.joined_this_month ?? 0),
        leaving_this_month: Number(row.leaving_this_month ?? 0),
    };
}

/** พนักงานที่ยังทำงานอยู่แต่ข้อมูลไม่พอทำเงินเดือน (เลขประจำตัว · ที่อยู่ · บัญชีรับเงิน) */
async function incompleteEmployees(conn, today) {
    const [rows] = await conn.query(
        `SELECT e.emp_id, e.emp_code, e.emp_first_name_th, e.emp_last_name_th,
                e.emp_national_id IS NULL AS no_national_id, e.emp_address IS NULL AS no_address,
                e.emp_bank_account_no IS NULL AS no_bank
         FROM tb_employees e
         WHERE ${CURRENT_SQL} AND (e.emp_national_id IS NULL OR e.emp_address IS NULL OR e.emp_bank_account_no IS NULL)
         ORDER BY e.emp_code`,
        [today],
    );
    return rows.map((row) => ({
        emp_id: row.emp_id,
        emp_code: row.emp_code,
        full_name: `${row.emp_first_name_th} ${row.emp_last_name_th}`,
        missing: [
            row.no_national_id ? "เลขประจำตัวประชาชน" : null,
            row.no_address ? "ที่อยู่" : null,
            row.no_bank ? "บัญชีรับเงินเดือน" : null,
        ].filter(Boolean),
    }));
}

/** รอบเงินเดือนล่าสุด + เดือนถัดไปที่ควรทำ (เดือนก่อนหน้าเดือนนี้ที่ยังไม่มีรอบ) */
async function payrollStatus(conn, today) {
    const [[latest]] = await conn.query(
        `SELECT pr_id, pr_number, pr_period, pr_status, pr_total_net, pr_employee_count,
                DATE_FORMAT(pr_pay_date, '%Y-%m-%d') AS pr_pay_date
         FROM tb_payroll_runs WHERE pr_status <> 'cancelled' ORDER BY pr_period DESC LIMIT 1`,
    );
    const lastMonth = previousMonth(today.slice(0, 7));
    const [[lastMonthRun]] = await conn.query(
        "SELECT pr_id FROM tb_payroll_runs WHERE pr_period = ? AND pr_status <> 'cancelled' LIMIT 1",
        [lastMonth],
    );
    return { latest_run: latest ?? null, missing_period: lastMonthRun ? null : lastMonth };
}

/** ลาวันนี้ (อนุมัติแล้ว) — ทุกคนเห็นปฏิทินทีมอยู่แล้ว จึงไม่ใช่ข้อมูลลับ */
async function onLeaveToday(conn, today) {
    const [rows] = await conn.query(
        `SELECT r.lr_id, r.lr_half_day, t.lt_name_th, e.emp_first_name_th, e.emp_last_name_th, e.emp_nickname
         FROM tb_leave_requests r
         JOIN tb_leave_types t ON t.lt_id = r.lr_leave_type_id
         JOIN tb_employees e ON e.emp_id = r.lr_employee_id
         WHERE r.lr_status = 'approved' AND ? BETWEEN r.lr_start_date AND r.lr_end_date
         ORDER BY e.emp_first_name_th`,
        [today],
    );
    return rows.map((row) => ({
        lr_id: row.lr_id,
        full_name: `${row.emp_first_name_th} ${row.emp_last_name_th}`,
        nickname: row.emp_nickname,
        leave_type: row.lt_name_th,
        half_day: row.lr_half_day,
    }));
}

/**
 * ตัวเลขของหน้าภาพรวมบุคคล — ส่วนที่ไม่มีสิทธิ์เป็น null
 * @param {{ user_id: string, role_permission: string }} user
 */
async function getOverview(conn, user) {
    const today = todayBangkok();
    const permission = user.role_permission;
    const canManage = hasBit(permission, "manageEmployees");
    const canPayroll = ["viewPayroll", "runPayroll", "approvePayroll"].some((key) => hasBit(permission, key));
    const canApproveLeave = hasBit(permission, "approveLeave");
    const canApproveAttendance = hasBit(permission, "approveTimesheet");
    // ลงเวลาวันนี้ (A-2): ฝ่ายบุคคลและผู้อนุมัติลงเวลาเห็นตัวเลขรวม
    const attendanceToday = canManage || canApproveAttendance ? (await boardService.getBoard(conn, today)).counts : null;

    const timesheet = await timesheetService.listPendingApprovals(conn, user);
    const cardQueue = async (kind) => (await employeeCodeService.listCardQueue(conn, kind)).length;

    return {
        today,
        headcount: canManage || canPayroll ? await headcountOf(conn, today) : null,
        pending: {
            leave: canApproveLeave ? await countPendingLeave(conn, user.user_id) : null,
            timesheet: timesheet.can_approve ? timesheet.weeks.length : null,
            attendance_corrections: canApproveAttendance ? (await correctionService.listPending(conn, user)).length : null,
            overtime: canApproveAttendance ? (await overtimeService.listPending(conn, user)).length : null,
            wfh: canApproveAttendance ? (await wfhService.listPending(conn, user)).length : null,
        },
        attendance_today: attendanceToday,
        cards: canManage
            ? {
                  pending_print: await cardQueue("pending_print"),
                  not_returned: await cardQueue("not_returned"),
                  expiring: await cardQueue("expiring"),
              }
            : null,
        incomplete_employees: canManage ? await incompleteEmployees(conn, today) : null,
        payroll: canPayroll ? await payrollStatus(conn, today) : null,
        on_leave_today: await onLeaveToday(conn, today),
    };
}

module.exports = { getMyProfile, getOverview };
