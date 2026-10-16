// เจ้าหนี้คงค้างแยกอายุ + รายงานภาษีหัก ณ ที่จ่าย (ภ.ง.ด.3 / 53) รายเดือน (2026-10-17 เฟส 2 ขั้น 2-5)
// แบบระบบ: docs/plans/2026-10-16-purchasing-2.md หัวข้อ 1 ข้อ 7
//
// เจ้าหนี้ = ค่าใช้จ่าย/ใบเบิกที่อนุมัติแล้ว ยอดจ่ายแล้ว < ยอดรวม · อายุนับจากวันครบกำหนดเทียบวันนี้เวลาไทย
// ช่วงอายุชุดเดียวกับลูกหนี้ (receivable.service.js) · ยอดบาท = ยอดค้าง × (ยอดบาทของรายการ ÷ ยอดรวม) = อัตราของรายการ
// รวมยอดใน MySQL (GROUP BY — DECIMAL บวก/คูณแม่นยำ ไม่ผ่าน float)
//
// รายงาน ภ.ง.ด.: 50 ทวิ ที่ไม่ยกเลิก ของเดือนที่จ่าย (เวลาไทย) แยกแบบ · รายแถวเงินได้ (ผู้รับหนึ่งรายมีได้หลายแถว)
// ยื่นภายในวันที่ 7 ของเดือนถัดไป (ยื่นออนไลน์ถึงวันที่ 15) — รูปแบบไฟล์นำเข้า e-filing รอคำตอบนักบัญชี (X5)
const { AppError } = require("../utils/app-error");
const { todayBangkok } = require("../utils/bangkok-time");
const { parseHundredths } = require("../shared/money.mjs");
const { toDecimalText } = require("../shared/quotation-totals.mjs");
const { AGING_BUCKETS } = require("./receivable.service");

function bucketCondition(bucket) {
    const parts = [];
    if (bucket.minDays !== null) parts.push(`days_overdue >= ${bucket.minDays}`);
    if (bucket.maxDays !== null) parts.push(`days_overdue <= ${bucket.maxDays}`);
    return parts.join(" AND ");
}

function bucketOf(daysOverdue) {
    return AGING_BUCKETS.find(
        (bucket) =>
            (bucket.minDays === null || daysOverdue >= bucket.minDays) &&
            (bucket.maxDays === null || daysOverdue <= bucket.maxDays),
    ).key;
}

// รายการค้างจ่าย + ยอดค้าง (สกุลเดิม / บาท) + วันที่เกินกำหนด + ผู้รับ — ? ตัวแรก = วันนี้ (เวลาไทย)
const OUTSTANDING_EXPENSES = `
    SELECT e.ex_id, e.ex_number, e.ex_kind, e.ex_title, e.ex_currency, e.ex_total, e.ex_paid_amount,
           IF(e.ex_kind = 'claim', 'employee', 'vendor') AS payee_kind,
           IF(e.ex_kind = 'claim', e.ex_employee_id, e.ex_vendor_id) AS payee_id,
           IF(e.ex_kind = 'claim', CONCAT(u.user_fname, ' ', u.user_lname), v.vd_name) AS payee_name,
           DATE_FORMAT(e.ex_expense_date, '%Y-%m-%d') AS ex_expense_date, DATE_FORMAT(e.ex_due_date, '%Y-%m-%d') AS ex_due_date,
           e.ex_total - e.ex_paid_amount AS outstanding_amount,
           ROUND((e.ex_total - e.ex_paid_amount) * e.ex_total_thb / e.ex_total, 2) AS outstanding_thb,
           DATEDIFF(?, e.ex_due_date) AS days_overdue, cu.cur_decimals
    FROM tb_expenses e
    JOIN tb_currencies cu ON cu.cur_code = e.ex_currency
    LEFT JOIN tb_vendors v ON v.vd_id = e.ex_vendor_id
    LEFT JOIN tb_users u ON u.user_id = e.ex_employee_id
    WHERE e.ex_status = 'approved' AND e.ex_paid_amount < e.ex_total AND e.ex_total > 0`;

/**
 * สรุปรายผู้รับ (ยอดบาทแยกช่วงอายุ) + รวมทั้งหมด
 * @param {import("mysql2/promise").Pool} conn
 */
async function agingByPayee(conn) {
    const today = todayBangkok();
    const bucketColumns = AGING_BUCKETS.map(
        (bucket) => `SUM(CASE WHEN ${bucketCondition(bucket)} THEN outstanding_thb ELSE 0 END) AS ${bucket.key}`,
    ).join(",\n               ");
    const [rows] = await conn.query(
        `SELECT o.payee_kind, o.payee_id, o.payee_name, COUNT(*) AS expense_count, SUM(outstanding_thb) AS total,
                MAX(days_overdue) AS oldest_days_overdue,
               ${bucketColumns}
         FROM (${OUTSTANDING_EXPENSES}) o
         GROUP BY o.payee_kind, o.payee_id, o.payee_name
         ORDER BY total DESC, o.payee_name`,
        [today],
    );

    const totals = Object.fromEntries([...AGING_BUCKETS.map((bucket) => [bucket.key, 0n]), ["total", 0n]]);
    const payees = rows.map((row) => {
        const payee = {
            payee_kind: row.payee_kind,
            payee_id: row.payee_id,
            payee_name: row.payee_name,
            expense_count: Number(row.expense_count),
            oldest_days_overdue: Math.max(Number(row.oldest_days_overdue), 0),
            total: toDecimalText(parseHundredths(row.total, "ยอดค้าง")),
        };
        totals.total += parseHundredths(row.total, "ยอดค้าง");
        for (const bucket of AGING_BUCKETS) {
            const amount = parseHundredths(row[bucket.key], "ยอดค้าง");
            payee[bucket.key] = toDecimalText(amount);
            totals[bucket.key] += amount;
        }
        return payee;
    });

    return {
        buckets: AGING_BUCKETS.map(({ key, label }) => ({ key, label })),
        payees,
        totals: Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, toDecimalText(value)])),
        today,
    };
}

/**
 * รายการค้างจ่ายของผู้รับหนึ่งราย — เก่าสุดก่อน
 * @param {{ payeeKind: "vendor" | "employee", payeeId: string }} payee
 */
async function agingExpensesOfPayee(conn, { payeeKind, payeeId }) {
    const today = todayBangkok();
    const [rows] = await conn.query(
        `SELECT o.* FROM (${OUTSTANDING_EXPENSES}) o WHERE o.payee_kind = ? AND o.payee_id = ?
         ORDER BY o.ex_due_date, o.ex_number`,
        [today, payeeKind, payeeId],
    );
    return {
        payee: rows[0] ? { payee_kind: payeeKind, payee_id: payeeId, payee_name: rows[0].payee_name } : null,
        buckets: AGING_BUCKETS.map(({ key, label }) => ({ key, label })),
        expenses: rows.map((row) => {
            const daysOverdue = Number(row.days_overdue);
            return { ...row, days_overdue: Math.max(daysOverdue, 0), bucket: bucketOf(daysOverdue) };
        }),
        today,
    };
}

// ─── รายงาน ภ.ง.ด.3 / 53 รายเดือน ────────────────────────────────────────────────────────────

const MONTH_TEXT = /^(\d{4})-(0[1-9]|1[0-2])$/;

/**
 * แถวเงินได้ของ 50 ทวิ ที่ไม่ยกเลิก ในเดือนที่จ่าย ของแบบที่เลือก + ยอดรวม · ผู้รับใช้ snapshot ณ วันจ่าย
 * @param {import("mysql2/promise").Pool} conn
 * @param {{ month: string, form: "PND3" | "PND53" }} options
 */
async function withholdingReport(conn, { month, form }) {
    if (!MONTH_TEXT.test(month ?? "")) {
        throw new AppError(400, "VALIDATION", "เลือกเดือนของรายงาน", { month: "รูปแบบเดือนต้องเป็น YYYY-MM" });
    }
    if (form !== "PND3" && form !== "PND53") {
        throw new AppError(400, "VALIDATION", "เลือกแบบ ภ.ง.ด.3 หรือ ภ.ง.ด.53", { form: "เลือกแบบที่จะยื่น" });
    }
    const [rows] = await conn.query(
        `SELECT w.wt_id, w.wt_number, DATE_FORMAT(w.wt_payment_date, '%Y-%m-%d') AS wt_payment_date, p.pv_number,
                JSON_UNQUOTE(JSON_EXTRACT(w.wt_payee_snapshot, '$.vd_name')) AS payee_name,
                JSON_UNQUOTE(JSON_EXTRACT(w.wt_payee_snapshot, '$.vd_tax_id')) AS payee_tax_id,
                JSON_UNQUOTE(JSON_EXTRACT(w.wt_payee_snapshot, '$.vd_branch_code')) AS payee_branch_code,
                JSON_UNQUOTE(JSON_EXTRACT(w.wt_payee_snapshot, '$.vd_address')) AS payee_address,
                l.wtl_income_type, l.wtl_form_label, l.wtl_rate, l.wtl_paid_amount, l.wtl_tax_amount
         FROM tb_wht_certificates w
         JOIN tb_payments p ON p.pv_id = w.wt_payment_id
         JOIN tb_wht_certificate_lines l ON l.wtl_certificate_id = w.wt_id
         WHERE w.wt_status = 'issued' AND w.wt_form = ? AND DATE_FORMAT(w.wt_payment_date, '%Y-%m') = ?
         ORDER BY w.wt_payment_date, w.wt_number, l.wtl_form_row, l.wtl_id`,
        [form, month],
    );
    let totalPaid = 0n;
    let totalTax = 0n;
    const payeeKeys = new Set();
    for (const row of rows) {
        totalPaid += parseHundredths(row.wtl_paid_amount, "เงินได้");
        totalTax += parseHundredths(row.wtl_tax_amount, "ภาษี");
        payeeKeys.add(row.payee_tax_id ?? row.payee_name);
    }
    // กำหนดยื่น: วันที่ 7 ของเดือนถัดไป (ยื่นออนไลน์ถึงวันที่ 15)
    const [year, monthNumber] = month.split("-").map(Number);
    const nextMonth = monthNumber === 12 ? `${year + 1}-01` : `${year}-${String(monthNumber + 1).padStart(2, "0")}`;
    return {
        month,
        form,
        rows: rows.map((row, index) => ({ ...row, sequence: index + 1 })),
        totals: {
            certificate_count: new Set(rows.map((row) => row.wt_id)).size,
            payee_count: payeeKeys.size,
            paid_amount: toDecimalText(totalPaid),
            tax_amount: toDecimalText(totalTax),
        },
        due_dates: { paper: `${nextMonth}-07`, online: `${nextMonth}-15` },
    };
}

module.exports = { agingByPayee, agingExpensesOfPayee, withholdingReport };
