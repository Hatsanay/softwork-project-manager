// งานบุคคล: รอบเงินเดือน · การลา · ลงเวลารายสัปดาห์ · บัตรพนักงาน
const { as } = require("./api");

/** รอบเงินเดือนของเดือน: สร้าง (คำนวณ) → ส่ง → อนุมัติ → บันทึกจ่าย (ไม่ส่ง paidDate = ค้างเป็นร่าง) */
async function payrollMonth({ hr, approver, payer, period, payDate, paidDate }) {
    const created = await as(hr, "POST", "/V1/payroll/runs", { pr_period: period, pr_pay_date: payDate });
    const runId = created.pr_id;
    if (!paidDate) return runId;
    const action = async (user, name, extra = {}) => {
        const run = await as(user, "GET", `/V1/payroll/runs/${runId}`);
        await as(user, "POST", `/V1/payroll/runs/${runId}/${name}`, { pr_version: run.pr_version, ...extra });
    };
    await action(hr, "submit");
    await action(approver, "approve");
    await action(payer, "paid", { pr_paid_date: paidDate, pr_paid_note: "โอนเงินเดือนผ่านกรุงไทย Corporate Banking" });
    return runId;
}

/** คำขอลา: ร่าง → ส่ง → (ผู้อนุมัติตัดสิน · ไม่ส่ง approver = รออนุมัติ) */
async function leave({ employee, approver, typeId, start, end = start, halfDay = "none", reason }) {
    const created = await as(employee, "POST", "/V1/leave/requests", {
        lr_leave_type_id: typeId,
        lr_start_date: start,
        lr_end_date: end,
        lr_half_day: halfDay,
        lr_reason: reason ?? null,
    });
    const year = start.slice(0, 4);
    const versionOf = async () => {
        const mine = await as(employee, "GET", `/V1/leave/me?year=${year}`);
        return mine.requests.find((request) => request.lr_id === created.lr_id).lr_version;
    };
    await as(employee, "POST", `/V1/leave/requests/${created.lr_id}/submit`, { lr_version: await versionOf() });
    if (approver) {
        await as(approver, "POST", `/V1/leave/requests/${created.lr_id}/approve`, { lr_version: await versionOf() });
    }
    return created.lr_id;
}

/**
 * ลงเวลาทั้งสัปดาห์แล้วส่ง → หัวหน้าอนุมัติ (ไม่ส่ง approver = ส่งแล้วรออนุมัติ · submit=false = ร่าง)
 * @param {{ tse_date, tse_project_id, tse_hours, tse_note }[]} entries
 */
async function timesheetWeek({ employee, approver, monday, entries, submit = true }) {
    const saved = await as(employee, "PUT", "/V1/timesheet/me", { week_start: monday, tsw_version: 0, entries });
    if (!submit) return;
    const submitted = await as(employee, "POST", "/V1/timesheet/me/submit", {
        week_start: monday,
        tsw_version: saved.week.tsw_version,
    });
    if (!approver) return;
    await as(approver, "POST", `/V1/timesheet/weeks/${submitted.week.tsw_id}/approve`, {
        tsw_version: submitted.week.tsw_version,
    });
}

/** พิมพ์บัตรที่รอพิมพ์ทั้งหมด (ฝ่ายบุคคลพิมพ์รวดเดียว) */
async function printPendingCards(hr) {
    const queue = await as(hr, "GET", "/V1/employee-cards?kind=pending_print");
    for (const card of queue.data) {
        await as(hr, "POST", `/V1/employees/${card.ec_employee_id}/cards/${card.ec_id}/printed`, {});
    }
}

module.exports = { payrollMonth, leave, timesheetWeek, printPendingCards };
