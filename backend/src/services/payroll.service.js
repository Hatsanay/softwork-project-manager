// รอบเงินเดือน (2026-10-17 เฟส 4 ขั้น 4-4) — docs/plans/2026-10-17-people-payroll-4.md หัวข้อ 3.7, 4.3
//
// - เดือนละหนึ่งรอบที่ไม่ยกเลิก (ล็อกแถว tb_payroll_settings ก่อนตรวจ — R-H2) · รอบก่อนหน้าต้องอนุมัติแล้ว และเดือนก่อนต้องมีรอบ
//   (ภาษีสะสมต่อเนื่อง — ยกเว้นรอบแรกของระบบ ใช้ยอดยกมาในค่าลดหย่อนรายปีแทน)
// - draft: คิดใหม่ทั้งรอบ · เพิ่ม/ลบรายการกรอกเองรายคน (คิดคนนั้นใหม่) → pending_approval (ตัวเลขล็อก · กติกาอนุมัติ PR)
//   → approved (snapshot ค่าแรงต่อโปรเจกต์ + ล็อกลงเวลา/ลาของเดือน) → paid (สลิปเปิดให้พนักงาน)
// - ผู้ที่มีชื่อในรอบอนุมัติรอบนั้นไม่ได้ (R-H4) และผู้สร้างอนุมัติไม่ได้ — ยกเว้นบริษัทเปิด "อนุมัติเอง"
// - ยกเลิก: ร่าง/รออนุมัติได้เสมอ · อนุมัติแล้ว (ยังไม่จ่าย) ได้เมื่อไม่มีรอบหลังจากนี้ · จ่ายแล้วยกเลิกไม่ได้ (ปรับในรอบถัดไป)
const { AppError } = require("../utils/app-error");
const { todayBangkok } = require("../utils/bangkok-time");
const { hasBit } = require("../shared/permissions.mjs");
const { formatHundredths, parseHundredths } = require("../shared/money.mjs");
const { addDays, daysInMonth, laborCostOf } = require("../shared/payroll-math.mjs");
const { buildApprovalPlan, evaluateApproval } = require("../shared/approval-flow.mjs");
const approvalRulesService = require("./approval-rules.service");
const companyService = require("./company.service");
const { loadPeriodContext, findEligibleEmployees, calculateEmployee } = require("./payroll-calc.service");

const DOCUMENT_TYPE = "PR";
const DOCUMENT_NAME = "รอบเงินเดือน";
const CLOSED_STATUSES = ["approved", "paid"];
const ITEM_MONEY_COLUMNS = [
    "pri_base_salary",
    "pri_salary_amount",
    "pri_unpaid_leave_amount",
    "pri_other_earnings",
    "pri_other_deductions",
    "pri_gross",
    "pri_taxable_income",
    "pri_sso_wage",
    "pri_sso_employee",
    "pri_sso_employer",
    "pri_ytd_income_before",
    "pri_ytd_tax_before",
    "pri_ytd_sso_before",
    "pri_annual_income_estimate",
    "pri_annual_tax_estimate",
    "pri_tax",
    "pri_net",
    "pri_labor_cost",
];
const ITEM_COLUMNS = [
    "pri_employee_id",
    "pri_emp_code",
    "pri_full_name",
    "pri_national_id",
    "pri_position",
    "pri_department_name",
    "pri_bank_name",
    "pri_bank_account_no",
    "pri_sso_enrolled",
    "pri_employed_days",
    "pri_days_in_month",
    "pri_unpaid_leave_days",
    "pri_standard_hours",
    ...ITEM_MONEY_COLUMNS,
];

const money = (value) => parseHundredths(value ?? "0", "ยอดเงิน");

function notFound() {
    return new AppError(404, "PAYROLL_NOT_FOUND", "ไม่พบรอบเงินเดือนนี้ กรุณาโหลดหน้าใหม่");
}

function wrongStatus(message) {
    return new AppError(409, "PAYROLL_WRONG_STATUS", message);
}

function previousPeriodOf(period) {
    return addDays(`${period}-01`, -1).slice(0, 7);
}

// ─── ล็อกเดือนที่ปิดรอบแล้ว (R-H7) — ใช้กับลงเวลาและลา ──────────────────────────────────────────────

/**
 * เดือนที่รอบเงินเดือนอนุมัติ/จ่ายแล้ว จากวันที่ที่ส่งมา
 * @param {string[]} dates "YYYY-MM-DD"
 * @returns {Promise<string[]>} "YYYY-MM" ที่ล็อก
 */
async function findClosedPeriods(conn, dates) {
    const periods = [...new Set(dates.filter(Boolean).map((date) => date.slice(0, 7)))];
    if (periods.length === 0) return [];
    const [rows] = await conn.query(
        "SELECT DISTINCT pr_period FROM tb_payroll_runs WHERE pr_period IN (?) AND pr_status IN (?) ORDER BY pr_period",
        [periods, CLOSED_STATUSES],
    );
    return rows.map((row) => row.pr_period);
}

/**
 * ห้ามแก้ข้อมูลที่อยู่ในเดือนที่ปิดรอบเงินเดือนแล้ว
 * @param {string[]} dates
 * @param {string} what เช่น "ลงเวลา"
 */
async function assertPeriodsOpen(conn, dates, what) {
    const closed = await findClosedPeriods(conn, dates);
    if (closed.length === 0) return;
    throw new AppError(
        409,
        "PAYROLL_PERIOD_CLOSED",
        `${what}ในเดือน ${closed.join(", ")} แก้ไม่ได้ เพราะรอบเงินเดือนของเดือนนั้นอนุมัติแล้ว — ถ้าผิดให้แจ้งฝ่ายบุคคลปรับในรอบถัดไป`,
    );
}

// ─── อ่าน ───────────────────────────────────────────────────────────────────────────────────

async function listRuns(conn) {
    const [rows] = await conn.query(
        `SELECT pr_id, pr_number, pr_period, DATE_FORMAT(pr_pay_date, '%Y-%m-%d') AS pr_pay_date, pr_status,
                pr_employee_count, pr_total_gross, pr_total_net, pr_total_tax, pr_total_sso_employee, pr_total_sso_employer,
                DATE_FORMAT(pr_paid_date, '%Y-%m-%d') AS pr_paid_date
         FROM tb_payroll_runs ORDER BY pr_period DESC, pr_id DESC`,
    );
    return rows;
}

async function findRun(conn, runId, { forUpdate = false } = {}) {
    const [[run]] = await conn.query(
        `SELECT pr_id, pr_number, pr_period, DATE_FORMAT(pr_pay_date, '%Y-%m-%d') AS pr_pay_date, pr_status, pr_version,
                pr_working_days, pr_standard_hours, pr_employee_count, pr_total_gross, pr_total_deductions,
                pr_total_sso_employee, pr_total_sso_employer, pr_total_tax, pr_total_net, pr_calculated_at,
                pr_approval_round, pr_approval_current_level, pr_approval_plan, pr_submitted_at, pr_approved_at,
                pr_returned_reason, DATE_FORMAT(pr_paid_date, '%Y-%m-%d') AS pr_paid_date, pr_paid_note,
                pr_cancelled_at, pr_cancel_reason, pr_created_by
         FROM tb_payroll_runs WHERE pr_id = ? ${forUpdate ? "FOR UPDATE" : ""}`,
        [runId],
    );
    if (!run) throw notFound();
    return run;
}

function assertVersion(run, version) {
    if (run.pr_version !== version) {
        throw new AppError(409, "PAYROLL_CHANGED", "รอบเงินเดือนนี้มีการเปลี่ยนแปลงไปก่อนแล้ว กรุณาโหลดหน้าใหม่");
    }
}

async function findItems(conn, runId) {
    const [items] = await conn.query(
        `SELECT pri_id, ${ITEM_COLUMNS.join(", ")} FROM tb_payroll_items WHERE pri_run_id = ? ORDER BY pri_emp_code`,
        [runId],
    );
    const [lines] = await conn.query(
        `SELECT l.pil_id, l.pil_item_id, l.pil_source, l.pil_kind, l.pil_label, l.pil_amount, l.pil_is_taxable,
                l.pil_is_sso_wage, l.pil_is_one_off
         FROM tb_payroll_item_lines l JOIN tb_payroll_items i ON i.pri_id = l.pil_item_id
         WHERE i.pri_run_id = ? ORDER BY l.pil_source DESC, l.pil_kind, l.pil_id`,
        [runId],
    );
    return items.map((item) => ({
        ...item,
        pri_sso_enrolled: item.pri_sso_enrolled === 1,
        lines: lines
            .filter((line) => line.pil_item_id === item.pri_id)
            .map(({ pil_item_id: _itemId, ...line }) => ({
                ...line,
                pil_is_taxable: line.pil_is_taxable === 1,
                pil_is_sso_wage: line.pil_is_sso_wage === 1,
                pil_is_one_off: line.pil_is_one_off === 1,
            })),
    }));
}

/**
 * รายละเอียดรอบ + รายคน + ปัญหาที่ต้องแก้ก่อนส่ง + สิทธิ์อนุมัติของผู้ดู
 * @param {{ user_id: string, user_role_id: string | null, role_permission: string }} user
 */
async function getRun(conn, runId, user) {
    const run = await findRun(conn, runId);
    const items = await findItems(conn, runId);
    const [approvals] = await conn.query(
        `SELECT pra_round, pra_level, pra_action, pra_user_name, pra_role_name, pra_reason, pra_created_at
         FROM tb_payroll_approvals WHERE pra_run_id = ? ORDER BY pra_id`,
        [runId],
    );
    const readiness = run.pr_status === "draft" ? await buildReadiness(conn, run, items) : null;
    let approval = null;
    if (run.pr_status === "pending_approval") {
        const company = await companyService.findCompany(conn);
        approval = evaluateFor(
            run,
            await approvalsThisRound(conn, run),
            user,
            await itemsWithUsers(conn, runId),
            company.cs_allow_self_approval,
        );
    }
    const { pr_approval_plan: plan, ...rest } = run;
    return {
        ...rest,
        approval_plan: plan ? JSON.parse(plan) : [],
        items,
        approvals,
        readiness,
        approval: approval && {
            can_approve: approval.canApprove,
            reason: approval.reason,
            is_final: approval.isFinal,
        },
    };
}

/**
 * ปัญหาก่อนส่ง (blocking) + คำเตือน (ส่งได้)
 */
async function buildReadiness(conn, run, items) {
    const problems = [];
    const warnings = [];
    if (items.length === 0) problems.push('ยังไม่มีพนักงานในรอบนี้ — กด "คิดใหม่" หลังเพิ่มพนักงาน');
    const negative = items.filter((item) => money(item.pri_net) < 0n);
    if (negative.length > 0) {
        problems.push(
            `ยอดสุทธิติดลบ ${negative.length} คน (${negative.map((item) => item.pri_emp_code).join(", ")}) — ลดรายการหักก่อน`,
        );
    }
    const monthStart = `${run.pr_period}-01`;
    const monthEnd = `${run.pr_period}-${String(daysInMonth(run.pr_period)).padStart(2, "0")}`;
    const [[{ pendingLeaves }]] = await conn.query(
        `SELECT COUNT(*) AS pendingLeaves FROM tb_leave_requests
         WHERE lr_status = 'pending' AND lr_start_date <= ? AND lr_end_date >= ?`,
        [monthEnd, monthStart],
    );
    if (Number(pendingLeaves) > 0) {
        problems.push(
            `มีคำขอลารออนุมัติ ${pendingLeaves} ใบในเดือนนี้ — อนุมัติหรือไม่อนุมัติก่อน (ลาไม่รับค่าจ้างมีผลกับเงินเดือน)`,
        );
    }
    const [[{ pendingWeeks }]] = await conn.query(
        `SELECT COUNT(DISTINCT w.tsw_id) AS pendingWeeks FROM tb_timesheet_weeks w
         JOIN tb_timesheet_entries e ON e.tse_week_id = w.tsw_id
         WHERE w.tsw_status IN ('submitted', 'returned', 'draft') AND e.tse_date BETWEEN ? AND ?`,
        [monthStart, monthEnd],
    );
    if (Number(pendingWeeks) > 0) {
        warnings.push(
            `ลงเวลา ${pendingWeeks} สัปดาห์ในเดือนนี้ยังไม่อนุมัติ — ชั่วโมงเหล่านี้จะไม่ถูกนับเป็นค่าแรงโปรเจกต์ และแก้ไม่ได้หลังอนุมัติรอบ`,
        );
    }
    const missingBank = items.filter((item) => !item.pri_bank_account_no);
    if (missingBank.length > 0) {
        warnings.push(
            `ไม่มีเลขบัญชีธนาคาร ${missingBank.length} คน (${missingBank.map((item) => item.pri_emp_code).join(", ")})`,
        );
    }
    const missingId = items.filter((item) => !item.pri_national_id);
    if (missingId.length > 0) {
        warnings.push(
            `ไม่มีเลขประจำตัวประชาชน ${missingId.length} คน — ต้องใช้ในแบบ ภ.ง.ด.1 / สปส.1-10 (${missingId.map((item) => item.pri_emp_code).join(", ")})`,
        );
    }
    const missingPrior = await findMissingPriorIncome(conn, run, items);
    if (missingPrior.length > 0) {
        warnings.push(
            `รอบแรกของปีในระบบ — ยังไม่ได้กรอก "ยอดยกมาของปี" (เงินได้/ภาษี/ประกันสังคมก่อนเดือนนี้) ที่หน้าพนักงาน ภาษีทั้งปีจะคิดต่ำไป: ${missingPrior.join(", ")}`,
        );
    }
    const context = await loadPeriodContext(conn, run.pr_period);
    if (!context.ssoRate) warnings.push("ยังไม่มีอัตราประกันสังคมที่มีผลในเดือนนี้ — ประกันสังคมเป็น 0 ทุกคน");
    if (!context.taxYearRow) warnings.push("ยังไม่ได้ตั้งปีภาษี — ภาษีเป็น 0 ทุกคน");
    else if (context.taxYearRow.ity_tax_year !== context.taxYear) {
        warnings.push(
            `ยังไม่ได้ตั้งปีภาษี ${context.taxYear + 543} — ใช้ค่าลดหย่อน/ขั้นภาษีของปี ${context.taxYearRow.ity_tax_year + 543} แทน`,
        );
    }
    return { problems, warnings };
}

/**
 * คนที่ทำงานมาก่อนเดือนนี้ของปี แต่ไม่มีรอบที่อนุมัติก่อนหน้าในปีนี้และไม่ได้กรอกเงินได้ยกมา — ภาษีทั้งปีจะประมาณต่ำ
 * @returns {Promise<string[]>} รหัสพนักงาน
 */
async function findMissingPriorIncome(conn, run, items) {
    const yearStart = `${run.pr_period.slice(0, 4)}-01`;
    if (run.pr_period === yearStart || items.length === 0) return [];
    const [rows] = await conn.query(
        `SELECT e.emp_id, e.emp_code
         FROM tb_employees e
         LEFT JOIN tb_employee_tax_profiles p ON p.etp_employee_id = e.emp_id AND p.etp_tax_year = ?
         WHERE e.emp_id IN (?) AND e.emp_hire_date < ? AND COALESCE(p.etp_prior_income, 0) = 0
           AND NOT EXISTS (
               SELECT 1 FROM tb_payroll_items i JOIN tb_payroll_runs r ON r.pr_id = i.pri_run_id
               WHERE i.pri_employee_id = e.emp_id AND r.pr_status IN ('approved', 'paid')
                 AND r.pr_period >= ? AND r.pr_period < ?
           )
         ORDER BY e.emp_code`,
        [
            Number(run.pr_period.slice(0, 4)),
            items.map((item) => item.pri_employee_id),
            `${run.pr_period}-01`,
            yearStart,
            run.pr_period,
        ],
    );
    return rows.map((row) => row.emp_code);
}

// ─── สร้าง / คิดใหม่ ──────────────────────────────────────────────────────────────────────────

/**
 * สร้างรอบเดือนใหม่แล้วคิดทุกคนทันที
 * @param {{ pr_period: string, pr_pay_date: string }} payload
 */
async function createRun(conn, user, payload) {
    await conn.query("SELECT ps_id FROM tb_payroll_settings WHERE ps_id = 1 FOR UPDATE");
    const period = payload.pr_period;
    const nextMonth = addDays(`${todayBangkok().slice(0, 7)}-28`, 7).slice(0, 7);
    if (period > nextMonth) {
        throw new AppError(400, "VALIDATION", "สร้างรอบล่วงหน้าได้ไม่เกินเดือนหน้า", {
            pr_period: "เลือกเดือนนี้หรือเดือนหน้า",
        });
    }
    const [runs] = await conn.query(
        "SELECT pr_period, pr_status FROM tb_payroll_runs WHERE pr_status <> 'cancelled' ORDER BY pr_period",
    );
    if (runs.some((run) => run.pr_period === period)) {
        throw new AppError(
            409,
            "PAYROLL_EXISTS",
            `มีรอบเงินเดือนเดือน ${period} แล้ว — เปิดรอบเดิม หรือยกเลิกรอบเดิมก่อน`,
        );
    }
    const unfinished = runs.find((run) => run.pr_period < period && !CLOSED_STATUSES.includes(run.pr_status));
    if (unfinished) {
        throw new AppError(
            409,
            "PAYROLL_PREVIOUS_OPEN",
            `รอบเดือน ${unfinished.pr_period} ยังไม่อนุมัติ — อนุมัติก่อนจึงสร้างรอบถัดไปได้ (ภาษีสะสมต้องต่อเนื่อง)`,
        );
    }
    const hasEarlier = runs.some((run) => run.pr_period < period);
    const previous = previousPeriodOf(period);
    if (hasEarlier && !runs.some((run) => run.pr_period === previous)) {
        throw new AppError(409, "PAYROLL_GAP", `ต้องสร้างรอบเดือน ${previous} ก่อน (ภาษีสะสมต้องต่อเนื่องทุกเดือน)`);
    }
    if (runs.some((run) => run.pr_period > period)) {
        throw new AppError(
            409,
            "PAYROLL_LATER_EXISTS",
            "มีรอบของเดือนหลังจากนี้แล้ว — สร้างรอบย้อนหลังไม่ได้ (ปรับในรอบถัดไปแทน)",
        );
    }

    const [result] = await conn.query(
        `INSERT INTO tb_payroll_runs (pr_period, pr_number, pr_pay_date, pr_created_by) VALUES (?, ?, ?, ?)`,
        [period, `PR-${period}`, payload.pr_pay_date, user.user_id],
    );
    await recalculateAll(conn, result.insertId);
    return { pr_id: result.insertId };
}

/** แก้วันจ่าย (ร่างเท่านั้น) */
async function updateRun(conn, runId, version, payload) {
    const run = await findRun(conn, runId, { forUpdate: true });
    assertVersion(run, version);
    if (run.pr_status !== "draft") throw wrongStatus("แก้ได้เฉพาะรอบที่เป็นร่าง");
    await conn.query("UPDATE tb_payroll_runs SET pr_pay_date = ?, pr_version = pr_version + 1 WHERE pr_id = ?", [
        payload.pr_pay_date,
        runId,
    ]);
    return { pr_id: runId };
}

/** คิดใหม่ทั้งรอบ (ร่างเท่านั้น) — ดึงค่าจ้าง/ลา/รายการประจำ/อัตราล่าสุด · รายการกรอกเองคงไว้ */
async function recalculate(conn, runId, version) {
    const run = await findRun(conn, runId, { forUpdate: true });
    assertVersion(run, version);
    if (run.pr_status !== "draft") throw wrongStatus("คิดใหม่ได้เฉพาะรอบที่เป็นร่าง — ตีกลับเป็นร่างก่อน");
    await recalculateAll(conn, runId);
    return { pr_id: runId };
}

async function recalculateAll(conn, runId) {
    const run = await findRun(conn, runId);
    const context = await loadPeriodContext(conn, run.pr_period);
    const employees = await findEligibleEmployees(conn, context);
    const [existing] = await conn.query("SELECT pri_id, pri_employee_id FROM tb_payroll_items WHERE pri_run_id = ?", [
        runId,
    ]);
    const existingByEmployee = new Map(existing.map((item) => [item.pri_employee_id, item.pri_id]));
    const eligibleIds = new Set(employees.map((employee) => employee.emp_id));

    // คนที่ไม่อยู่ในเดือนแล้ว (แก้วันเริ่ม/วันออก) — ลบพร้อมรายการกรอกเอง
    const removedIds = existing.filter((item) => !eligibleIds.has(item.pri_employee_id)).map((item) => item.pri_id);
    if (removedIds.length > 0) await conn.query("DELETE FROM tb_payroll_items WHERE pri_id IN (?)", [removedIds]);

    for (const employee of employees) {
        await saveEmployeeItem(conn, runId, employee, context, existingByEmployee.get(employee.emp_id) ?? null);
    }
    await updateTotals(conn, runId, context);
}

async function manualLinesOf(conn, itemId) {
    if (!itemId) return [];
    const [rows] = await conn.query(
        `SELECT pil_source, pil_kind, pil_label, pil_amount, pil_is_taxable, pil_is_sso_wage, pil_is_one_off
         FROM tb_payroll_item_lines WHERE pil_item_id = ? AND pil_source = 'manual' ORDER BY pil_id`,
        [itemId],
    );
    return rows.map((row) => ({
        ...row,
        pil_is_taxable: row.pil_is_taxable === 1,
        pil_is_sso_wage: row.pil_is_sso_wage === 1,
        pil_is_one_off: row.pil_is_one_off === 1,
    }));
}

async function saveEmployeeItem(conn, runId, employee, context, itemId) {
    const manualLines = await manualLinesOf(conn, itemId);
    const { item, recurringLines } = await calculateEmployee(conn, employee, context, manualLines, runId);
    let savedId = itemId;
    if (savedId) {
        await conn.query(
            `UPDATE tb_payroll_items SET ${ITEM_COLUMNS.map((column) => `${column} = ?`).join(", ")} WHERE pri_id = ?`,
            [...ITEM_COLUMNS.map((column) => item[column]), savedId],
        );
        await conn.query("DELETE FROM tb_payroll_item_lines WHERE pil_item_id = ? AND pil_source = 'recurring'", [
            savedId,
        ]);
    } else {
        const [result] = await conn.query(
            `INSERT INTO tb_payroll_items (pri_run_id, ${ITEM_COLUMNS.join(", ")})
             VALUES (?, ${ITEM_COLUMNS.map(() => "?").join(", ")})`,
            [runId, ...ITEM_COLUMNS.map((column) => item[column])],
        );
        savedId = result.insertId;
    }
    for (const line of recurringLines) {
        await conn.query(
            `INSERT INTO tb_payroll_item_lines
                (pil_item_id, pil_source, pil_kind, pil_label, pil_amount, pil_is_taxable, pil_is_sso_wage, pil_is_one_off)
             VALUES (?, 'recurring', ?, ?, ?, ?, ?, 0)`,
            [
                savedId,
                line.pil_kind,
                line.pil_label,
                line.pil_amount,
                line.pil_is_taxable ? 1 : 0,
                line.pil_is_sso_wage ? 1 : 0,
            ],
        );
    }
    return savedId;
}

async function updateTotals(conn, runId, context) {
    const [[totals]] = await conn.query(
        `SELECT COUNT(*) AS employee_count, COALESCE(SUM(pri_gross), 0) AS gross, COALESCE(SUM(pri_other_deductions), 0) AS deductions,
                COALESCE(SUM(pri_sso_employee), 0) AS sso_employee, COALESCE(SUM(pri_sso_employer), 0) AS sso_employer,
                COALESCE(SUM(pri_tax), 0) AS tax, COALESCE(SUM(pri_net), 0) AS net
         FROM tb_payroll_items WHERE pri_run_id = ?`,
        [runId],
    );
    await conn.query(
        `UPDATE tb_payroll_runs
         SET pr_employee_count = ?, pr_total_gross = ?, pr_total_deductions = ?, pr_total_sso_employee = ?,
             pr_total_sso_employer = ?, pr_total_tax = ?, pr_total_net = ?, pr_working_days = ?, pr_standard_hours = ?,
             pr_calculated_at = NOW(), pr_version = pr_version + 1
         WHERE pr_id = ?`,
        [
            Number(totals.employee_count),
            totals.gross,
            totals.deductions,
            totals.sso_employee,
            totals.sso_employer,
            totals.tax,
            totals.net,
            context.workingDates.length,
            formatHundredths(context.standardHours),
            runId,
        ],
    );
}

// ─── รายการกรอกเองรายคน ───────────────────────────────────────────────────────────────────────

async function lockDraftItem(conn, runId, itemId, version) {
    const run = await findRun(conn, runId, { forUpdate: true });
    assertVersion(run, version);
    if (run.pr_status !== "draft") throw wrongStatus("แก้รายการได้เฉพาะรอบที่เป็นร่าง");
    const [[item]] = await conn.query(
        "SELECT pri_id, pri_employee_id FROM tb_payroll_items WHERE pri_id = ? AND pri_run_id = ?",
        [itemId, runId],
    );
    if (!item) throw new AppError(404, "PAYROLL_ITEM_NOT_FOUND", "ไม่พบพนักงานคนนี้ในรอบ กรุณาโหลดหน้าใหม่");
    return { run, item };
}

async function recalculateItem(conn, run, item) {
    const context = await loadPeriodContext(conn, run.pr_period);
    const employees = await findEligibleEmployees(conn, context);
    const employee = employees.find((candidate) => candidate.emp_id === item.pri_employee_id);
    if (!employee) {
        throw wrongStatus('พนักงานคนนี้ไม่อยู่ในเดือนนี้แล้ว (วันเริ่ม/วันออกเปลี่ยน) — กด "คิดใหม่" ทั้งรอบ');
    }
    await saveEmployeeItem(conn, run.pr_id, employee, context, item.pri_id);
    await updateTotals(conn, run.pr_id, context);
}

/**
 * เพิ่มรายการกรอกเอง (โบนัส/OT/หักอื่น) แล้วคิดคนนั้นใหม่
 * @param {object} line ผ่าน payrollLineSchema แล้ว
 */
async function addManualLine(conn, user, runId, itemId, version, line) {
    const { run, item } = await lockDraftItem(conn, runId, itemId, version);
    const isEarning = line.pil_kind === "earning";
    await conn.query(
        `INSERT INTO tb_payroll_item_lines
            (pil_item_id, pil_source, pil_kind, pil_label, pil_amount, pil_is_taxable, pil_is_sso_wage, pil_is_one_off, pil_created_by)
         VALUES (?, 'manual', ?, ?, ?, ?, ?, ?, ?)`,
        [
            itemId,
            line.pil_kind,
            line.pil_label,
            line.pil_amount,
            isEarning && line.pil_is_taxable ? 1 : 0,
            isEarning && line.pil_is_sso_wage ? 1 : 0,
            isEarning && line.pil_is_one_off ? 1 : 0,
            user.user_id,
        ],
    );
    await recalculateItem(conn, run, item);
    return { pri_id: itemId };
}

async function removeManualLine(conn, runId, itemId, lineId, version) {
    const { run, item } = await lockDraftItem(conn, runId, itemId, version);
    const [result] = await conn.query(
        "DELETE FROM tb_payroll_item_lines WHERE pil_id = ? AND pil_item_id = ? AND pil_source = 'manual'",
        [lineId, itemId],
    );
    if (result.affectedRows === 0) {
        throw new AppError(404, "PAYROLL_LINE_NOT_FOUND", "ไม่พบรายการนี้ (รายการประจำลบที่หน้าพนักงาน)");
    }
    await recalculateItem(conn, run, item);
    return { pri_id: itemId };
}

// ─── ส่ง / อนุมัติ / ตีกลับ ─────────────────────────────────────────────────────────────────────

async function submit(conn, runId, version) {
    const run = await findRun(conn, runId, { forUpdate: true });
    assertVersion(run, version);
    if (run.pr_status !== "draft") throw wrongStatus("ส่งได้เฉพาะรอบที่เป็นร่าง");
    const readiness = await buildReadiness(conn, run, await findItems(conn, runId));
    if (readiness.problems.length > 0) {
        throw new AppError(400, "PAYROLL_NOT_READY", `ยังส่งไม่ได้: ${readiness.problems.join(" · ")}`);
    }
    const rules = await approvalRulesService.findApprovalRules(conn, DOCUMENT_TYPE);
    if (rules.levels.length === 0) {
        throw new AppError(
            409,
            "APPROVAL_RULES_MISSING",
            "ยังไม่ได้ตั้งกติกาอนุมัติรอบเงินเดือน — ให้ผู้ดูแลตั้งที่ ตั้งค่าระบบ › ข้อมูลบริษัท › การอนุมัติ › รอบเงินเดือน",
        );
    }
    const plan = buildApprovalPlan(rules.levels, run.pr_total_net);
    await conn.query(
        `UPDATE tb_payroll_runs
         SET pr_status = 'pending_approval', pr_approval_round = pr_approval_round + 1, pr_approval_current_level = ?,
             pr_approval_plan = ?, pr_submitted_at = NOW(), pr_returned_reason = NULL, pr_version = pr_version + 1
         WHERE pr_id = ?`,
        [plan[0].level, JSON.stringify(plan), runId],
    );
    return { pr_id: runId, approval_levels: plan.map((level) => level.level) };
}

async function approvalsThisRound(conn, run) {
    const [rows] = await conn.query(
        `SELECT pra_level, pra_user_id FROM tb_payroll_approvals
         WHERE pra_run_id = ? AND pra_round = ? AND pra_action = 'approve'`,
        [run.pr_id, run.pr_approval_round],
    );
    return rows.map((row) => ({ level: row.pra_level, user_id: row.pra_user_id }));
}

/**
 * สิทธิ์อนุมัติของผู้ใช้ — กติกาเดิม + ผู้มีชื่อในรอบอนุมัติไม่ได้ (R-H4) เว้นแต่บริษัทเปิดอนุมัติเอง
 */
function evaluateFor(run, approvals, user, items, allowSelfApproval) {
    const evaluation = evaluateApproval({
        plan: run.pr_approval_plan ? JSON.parse(run.pr_approval_plan) : [],
        currentLevel: run.pr_approval_current_level,
        approvalsThisRound: approvals,
        actor: {
            user_id: user.user_id,
            role_id: user.user_role_id,
            can_approve: hasBit(user.role_permission, "approvePayroll"),
        },
        creatorId: run.pr_created_by,
        allowSelfApproval,
        documentName: DOCUMENT_NAME,
    });
    if (!evaluation.canApprove || allowSelfApproval) return evaluation;
    const isInRun = items.some((item) => item.linked_user_id === user.user_id);
    if (!isInRun) return evaluation;
    return {
        ...evaluation,
        canApprove: false,
        reason: "คุณมีชื่อในรอบเงินเดือนนี้ จึงอนุมัติไม่ได้ (หลักควบคุมภายใน) — ต้องให้ผู้อนุมัติคนอื่น",
    };
}

async function itemsWithUsers(conn, runId) {
    const [rows] = await conn.query(
        `SELECT i.pri_id, i.pri_employee_id, e.emp_user_id AS linked_user_id
         FROM tb_payroll_items i JOIN tb_employees e ON e.emp_id = i.pri_employee_id WHERE i.pri_run_id = ?`,
        [runId],
    );
    return rows;
}

async function findUserLabel(conn, userId) {
    const [[user]] = await conn.query(
        `SELECT CONCAT(u.user_fname, ' ', u.user_lname) AS full_name, u.user_role_id, r.role_name
         FROM tb_users u LEFT JOIN tb_roles r ON r.role_id = u.user_role_id WHERE u.user_id = ?`,
        [userId],
    );
    return user ?? { full_name: "(ผู้ใช้ถูกลบ)", user_role_id: null, role_name: null };
}

async function approve(conn, user, runId, version) {
    const run = await findRun(conn, runId, { forUpdate: true });
    assertVersion(run, version);
    if (run.pr_status !== "pending_approval") throw wrongStatus("รอบนี้ไม่ได้รออนุมัติแล้ว");
    const company = await companyService.findCompany(conn);
    const evaluation = evaluateFor(
        run,
        await approvalsThisRound(conn, run),
        user,
        await itemsWithUsers(conn, runId),
        company.cs_allow_self_approval,
    );
    if (!evaluation.canApprove) throw new AppError(403, "APPROVAL_NOT_ALLOWED", evaluation.reason);

    const approver = await findUserLabel(conn, user.user_id);
    for (const level of evaluation.levels) {
        await conn.query(
            `INSERT INTO tb_payroll_approvals
                (pra_run_id, pra_round, pra_level, pra_action, pra_user_id, pra_user_name, pra_role_id, pra_role_name)
             VALUES (?, ?, ?, 'approve', ?, ?, ?, ?)`,
            [
                runId,
                run.pr_approval_round,
                level,
                user.user_id,
                approver.full_name,
                approver.user_role_id,
                approver.role_name,
            ],
        );
    }
    if (!evaluation.isFinal) {
        await conn.query(
            "UPDATE tb_payroll_runs SET pr_approval_current_level = ?, pr_version = pr_version + 1 WHERE pr_id = ?",
            [evaluation.nextLevel.level, runId],
        );
        return { pr_id: runId, is_final: false, next_level: evaluation.nextLevel.level };
    }
    await snapshotLaborCost(conn, run);
    await conn.query(
        `UPDATE tb_payroll_runs
         SET pr_status = 'approved', pr_approved_at = NOW(), pr_approval_current_level = NULL, pr_version = pr_version + 1
         WHERE pr_id = ?`,
        [runId],
    );
    return { pr_id: runId, is_final: true };
}

/**
 * ค่าแรงจริงต่อโปรเจกต์ (H2-ก) = ต้นทุนทั้งเดือนของคน × ชั่วโมงที่อนุมัติในโปรเจกต์ ÷ ชั่วโมงมาตรฐานของคนนั้น
 * ที่เหลือ (งานภายใน + ชั่วโมงที่ไม่ได้ลง) = ส่วนกลาง (ไม่ติดลบ — ลงเวลาเกินมาตรฐานทำให้รวมเกินต้นทุนจริงได้ ตามแบบ 4.2)
 */
async function snapshotLaborCost(conn, run) {
    await conn.query("DELETE FROM tb_labor_cost_allocations WHERE lca_run_id = ?", [run.pr_id]);
    const monthStart = `${run.pr_period}-01`;
    const monthEnd = `${run.pr_period}-${String(daysInMonth(run.pr_period)).padStart(2, "0")}`;
    const [items] = await conn.query(
        "SELECT pri_employee_id, pri_labor_cost, pri_standard_hours FROM tb_payroll_items WHERE pri_run_id = ?",
        [run.pr_id],
    );
    for (const item of items) {
        const monthlyCost = money(item.pri_labor_cost);
        const standardHours = money(item.pri_standard_hours);
        const [hoursByProject] = await conn.query(
            `SELECT tse_project_id, SUM(tse_hours) AS hours FROM tb_timesheet_entries
             WHERE tse_employee_id = ? AND tse_date BETWEEN ? AND ? AND tse_approved_at IS NOT NULL
             GROUP BY tse_project_id`,
            [item.pri_employee_id, monthStart, monthEnd],
        );
        let allocated = 0n;
        let projectHours = 0n;
        for (const row of hoursByProject.filter((entry) => entry.tse_project_id)) {
            const hours = money(row.hours);
            const amount = laborCostOf(monthlyCost, hours, standardHours);
            allocated += amount;
            projectHours += hours;
            await insertAllocation(conn, run, item.pri_employee_id, row.tse_project_id, hours, amount);
        }
        const centralAmount = monthlyCost - allocated;
        const centralHours = standardHours - projectHours;
        await insertAllocation(
            conn,
            run,
            item.pri_employee_id,
            null,
            centralHours > 0n ? centralHours : 0n,
            centralAmount > 0n ? centralAmount : 0n,
        );
    }
}

async function insertAllocation(conn, run, employeeId, projectId, hours, amount) {
    await conn.query(
        `INSERT INTO tb_labor_cost_allocations (lca_run_id, lca_period, lca_employee_id, lca_project_id, lca_hours, lca_amount)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [run.pr_id, run.pr_period, employeeId, projectId, formatHundredths(hours), formatHundredths(amount)],
    );
}

/** ตีกลับเป็นร่าง — ผู้อนุมัติที่ role อยู่ในชั้นที่รออยู่ */
async function returnToDraft(conn, user, runId, version, reason) {
    const run = await findRun(conn, runId, { forUpdate: true });
    assertVersion(run, version);
    if (run.pr_status !== "pending_approval") throw wrongStatus("รอบนี้ไม่ได้รออนุมัติแล้ว");
    const plan = run.pr_approval_plan ? JSON.parse(run.pr_approval_plan) : [];
    const currentLevel = plan.find((level) => level.level === run.pr_approval_current_level);
    const isApprover =
        hasBit(user.role_permission, "approvePayroll") &&
        Boolean(currentLevel?.roles.some((role) => role.role_id === user.user_role_id));
    if (!isApprover) throw new AppError(403, "APPROVAL_NOT_ALLOWED", "ตีกลับได้เฉพาะผู้อนุมัติของชั้นที่รออยู่");
    const approver = await findUserLabel(conn, user.user_id);
    await conn.query(
        `INSERT INTO tb_payroll_approvals
            (pra_run_id, pra_round, pra_level, pra_action, pra_user_id, pra_user_name, pra_role_id, pra_role_name, pra_reason)
         VALUES (?, ?, ?, 'return', ?, ?, ?, ?, ?)`,
        [
            runId,
            run.pr_approval_round,
            run.pr_approval_current_level,
            user.user_id,
            approver.full_name,
            approver.user_role_id,
            approver.role_name,
            reason,
        ],
    );
    await conn.query(
        `UPDATE tb_payroll_runs
         SET pr_status = 'draft', pr_approval_current_level = NULL, pr_returned_reason = ?, pr_version = pr_version + 1
         WHERE pr_id = ?`,
        [reason, runId],
    );
    return { pr_id: runId };
}

// ─── จ่าย / ยกเลิก ──────────────────────────────────────────────────────────────────────────

async function markPaid(conn, user, runId, version, payload) {
    const run = await findRun(conn, runId, { forUpdate: true });
    assertVersion(run, version);
    if (run.pr_status !== "approved") throw wrongStatus("บันทึกจ่ายได้เฉพาะรอบที่อนุมัติแล้ว");
    await conn.query(
        `UPDATE tb_payroll_runs
         SET pr_status = 'paid', pr_paid_date = ?, pr_paid_note = ?, pr_paid_by = ?, pr_version = pr_version + 1
         WHERE pr_id = ?`,
        [payload.pr_paid_date, payload.pr_paid_note, user.user_id, runId],
    );
    return { pr_id: runId };
}

async function cancelRun(conn, user, runId, version, reason) {
    const run = await findRun(conn, runId, { forUpdate: true });
    assertVersion(run, version);
    if (run.pr_status === "paid") throw wrongStatus("รอบที่จ่ายแล้วยกเลิกไม่ได้ — ปรับยอดในรอบถัดไป");
    if (run.pr_status === "cancelled") throw wrongStatus("รอบนี้ยกเลิกไปแล้ว");
    if (run.pr_status === "approved") {
        const [[later]] = await conn.query(
            "SELECT pr_number FROM tb_payroll_runs WHERE pr_period > ? AND pr_status <> 'cancelled' LIMIT 1",
            [run.pr_period],
        );
        if (later) throw wrongStatus(`มีรอบ ${later.pr_number} แล้ว — ยกเลิกรอบนั้นก่อน (ภาษีสะสมต่อเนื่อง)`);
        await conn.query("DELETE FROM tb_labor_cost_allocations WHERE lca_run_id = ?", [runId]);
    }
    await conn.query(
        `UPDATE tb_payroll_runs
         SET pr_status = 'cancelled', pr_cancelled_at = NOW(), pr_cancelled_by = ?, pr_cancel_reason = ?,
             pr_approval_current_level = NULL, pr_version = pr_version + 1
         WHERE pr_id = ?`,
        [user.user_id, reason, runId],
    );
    return { pr_id: runId };
}

// ─── สลิป ───────────────────────────────────────────────────────────────────────────────────

/** สลิปของฉัน — เฉพาะรอบที่จ่ายแล้ว (ทุกช่วงการเป็นพนักงานของบัญชีนี้) */
async function listMyPayslips(conn, userId) {
    const [rows] = await conn.query(
        `SELECT i.pri_id, r.pr_number, r.pr_period, DATE_FORMAT(r.pr_paid_date, '%Y-%m-%d') AS pr_paid_date,
                i.pri_gross, i.pri_net, i.pri_tax, i.pri_sso_employee
         FROM tb_payroll_items i
         JOIN tb_payroll_runs r ON r.pr_id = i.pri_run_id
         JOIN tb_employees e ON e.emp_id = i.pri_employee_id
         WHERE e.emp_user_id = ? AND r.pr_status = 'paid'
         ORDER BY r.pr_period DESC`,
        [userId],
    );
    return rows;
}

/**
 * สลิปหนึ่งใบ — เจ้าของ (จ่ายแล้ว) หรือผู้มีสิทธิ์ดูรอบเงินเดือน (ทุกสถานะ) · คนอื่น = ไม่พบ
 */
async function getPayslip(conn, user, itemId) {
    const [[row]] = await conn.query(
        `SELECT i.pri_id, i.pri_run_id, r.pr_status, e.emp_user_id FROM tb_payroll_items i
         JOIN tb_payroll_runs r ON r.pr_id = i.pri_run_id JOIN tb_employees e ON e.emp_id = i.pri_employee_id
         WHERE i.pri_id = ?`,
        [itemId],
    );
    const isOwnPaid = row && row.emp_user_id === user.user_id && row.pr_status === "paid";
    const canViewAll = hasBit(user.role_permission, "viewPayroll");
    if (!row || (!isOwnPaid && !canViewAll)) {
        throw new AppError(404, "PAYSLIP_NOT_FOUND", "ไม่พบสลิปนี้ (สลิปเปิดให้ดูหลังบันทึกจ่ายเงินเดือนแล้ว)");
    }
    const run = await findRun(conn, row.pri_run_id);
    const item = (await findItems(conn, row.pri_run_id)).find((candidate) => candidate.pri_id === itemId);
    const company = await companyService.findCompany(conn);
    return {
        company: { name: company.cs_name_th, tax_id: company.cs_tax_id },
        run: {
            pr_number: run.pr_number,
            pr_period: run.pr_period,
            pr_pay_date: run.pr_pay_date,
            pr_status: run.pr_status,
        },
        item,
    };
}

module.exports = {
    findClosedPeriods,
    assertPeriodsOpen,
    listRuns,
    getRun,
    createRun,
    updateRun,
    recalculate,
    addManualLine,
    removeManualLine,
    submit,
    approve,
    returnToDraft,
    markPaid,
    cancelRun,
    listMyPayslips,
    getPayslip,
};
