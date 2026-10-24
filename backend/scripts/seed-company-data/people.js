// งานบุคคล: รอบเงินเดือน · การลา · ลงเวลารายสัปดาห์ · บัตรพนักงาน
const sharp = require("sharp");
const { as } = require("./api");

/** รูปใบรับรองแพทย์ (PNG) สำหรับแนบใบลาป่วย — วาดจาก SVG ในเครื่อง ไม่ใช่เอกสารจริง */
async function medicalCertificateImage(patientName, fromDate, toDate) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="780">
        <rect width="100%" height="100%" fill="#ffffff"/>
        <rect x="20" y="20" width="560" height="740" fill="none" stroke="#0f766e" stroke-width="3"/>
        <text x="300" y="80" font-family="Arial" font-size="26" text-anchor="middle" font-weight="bold" fill="#0f766e">KRABI CITY HOSPITAL</text>
        <text x="300" y="115" font-family="Arial" font-size="20" text-anchor="middle">MEDICAL CERTIFICATE</text>
        <line x1="60" y1="140" x2="540" y2="140" stroke="#999"/>
        <text x="60" y="200" font-family="Arial" font-size="18">Patient: ${patientName}</text>
        <text x="60" y="245" font-family="Arial" font-size="18">Diagnosis: Dengue fever</text>
        <text x="60" y="290" font-family="Arial" font-size="18">Rest required: ${fromDate} to ${toDate}</text>
        <text x="60" y="335" font-family="Arial" font-size="18">Examined on: ${fromDate}</text>
        <text x="380" y="640" font-family="Arial" font-size="16" fill="#555">Physician signature</text>
        <path d="M 380 600 C 420 560, 450 640, 520 590" fill="none" stroke="#1e3a8a" stroke-width="2"/>
        <text x="300" y="730" font-family="Arial" font-size="12" text-anchor="middle" fill="#999">SAMPLE DOCUMENT FOR DEMO DATA</text>
    </svg>`;
    return sharp(Buffer.from(svg)).png().toBuffer();
}

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
async function leave({ employee, approver, typeId, start, end = start, halfDay = "none", reason, medicalCertificate = false }) {
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
    // ลาป่วยตั้งแต่ 3 วันต้องแนบใบรับรองแพทย์ก่อนส่ง
    if (medicalCertificate) {
        const form = new FormData();
        const image = await medicalCertificateImage(employee, start, end);
        form.append("file", new Blob([image], { type: "image/png" }), "medical-certificate.png");
        await as(employee, "POST", `/V1/leave/requests/${created.lr_id}/attachments`, form);
    }
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
