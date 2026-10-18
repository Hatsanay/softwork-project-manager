// รายงานขาย (2026-10-15 ขั้น 1D-2 — docs/plans/2026-10-15-finance-1d.md หัวข้อ 3.2)
//
// ยอดขาย (D4) = ยอดก่อน VAT เป็นบาทของใบแจ้งหนี้ที่ออกในช่วง และยังไม่ยกเลิก (เกณฑ์สิทธิ์) · แสดงเงินรับจริงคู่กัน
// ทุกยอดรวมใช้คอลัมน์บาท (R-D1) · ช่วงเป็นวันที่ของเอกสาร (DATE — ไม่ขึ้นกับเขตเวลาเครื่อง R-D4) · รวมใน SQL
const { AppError } = require("../utils/app-error");
const { todayBangkok } = require("../utils/bangkok-time");
const { isRealDateText } = require("../shared/schemas/common.mjs");
const { parseHundredths } = require("../shared/money.mjs");
const { toDecimalText } = require("../shared/quotation-totals.mjs");
const invoiceService = require("./invoice.service");

const MAX_RANGE_MONTHS = 24;
const TOP_CLIENT_COUNT = 10;

const money = (value) => parseHundredths(value ?? "0", "ยอดเงิน");
const text = (value) => toDecimalText(money(value));

function monthIndex(dateText) {
    const [year, month] = dateText.split("-").map(Number);
    return year * 12 + (month - 1);
}

/**
 * ตรวจช่วงวันที่ของรายงาน — ผิดตอบ 400 พร้อมช่องที่ผิด
 * @param {unknown} from
 * @param {unknown} to
 */
function validateRange(from, to) {
    const fields = {};
    if (!isRealDateText(String(from ?? ""))) fields.from = "เลือกวันเริ่มต้น";
    if (!isRealDateText(String(to ?? ""))) fields.to = "เลือกวันสิ้นสุด";
    if (!fields.from && !fields.to) {
        if (from > to) fields.to = "วันสิ้นสุดต้องไม่ก่อนวันเริ่มต้น";
        else if (monthIndex(to) - monthIndex(from) >= MAX_RANGE_MONTHS)
            fields.to = `ช่วงรายงานยาวได้ไม่เกิน ${MAX_RANGE_MONTHS} เดือน`;
    }
    if (Object.keys(fields).length > 0) {
        throw new AppError(400, "VALIDATION", "ช่วงวันที่ของรายงานใช้ไม่ได้", fields);
    }
    return { from: String(from), to: String(to) };
}

// เงินรับในช่วง (ใบเสร็จที่ไม่ยกเลิก) — หัก ณ ที่จ่าย/ค่าธรรมเนียมแปลงเป็นบาทด้วยอัตราจริงของใบเสร็จ
const RECEIVED_COLUMNS = `
    COUNT(*) AS receipt_count,
    COALESCE(SUM(r.rc_received_thb), 0) AS received_thb,
    COALESCE(SUM(ROUND(r.rc_wht_amount * COALESCE(r.rc_actual_rate, 1), 2)), 0) AS withholding_thb,
    COALESCE(SUM(ROUND(r.rc_fee_amount * COALESCE(r.rc_actual_rate, 1), 2)), 0) AS fee_thb`;

/**
 * สรุปตามช่วง: ออกบิล · รับเงิน · ใบเสนอราคา (ตอบรับ/อัตราปิดการขาย) · ลูกค้ายอดสูงสุด · ค้างรับปัจจุบัน
 * @param {import("mysql2/promise").Pool} conn
 * @param {{ from: unknown, to: unknown }} range
 */
async function salesSummary(conn, range) {
    const { from, to } = validateRange(range.from, range.to);
    const today = todayBangkok();

    const [[billed]] = await conn.query(
        `SELECT COUNT(*) AS invoice_count, COALESCE(SUM(inv_after_discount_thb), 0) AS billed_thb,
                COALESCE(SUM(inv_total_thb), 0) AS billed_with_vat_thb
         FROM tb_invoices WHERE inv_status = 'issued' AND inv_issue_date BETWEEN ? AND ?`,
        [from, to],
    );
    const [[received]] = await conn.query(
        `SELECT ${RECEIVED_COLUMNS} FROM tb_receipts r WHERE r.rc_status = 'issued' AND r.rc_receipt_date BETWEEN ? AND ?`,
        [from, to],
    );
    // ใบลดหนี้ที่ออกในช่วง (ขั้น N-1) — ลดยอดขายของช่วงที่ออกใบลดหนี้ · คืนเงินลูกค้าตามวันที่คืน
    const [[credited]] = await conn.query(
        `SELECT COUNT(*) AS credit_note_count, COALESCE(SUM(cn_base_thb), 0) AS credited_thb,
                COALESCE(SUM(cn_total_thb), 0) AS credited_with_vat_thb
         FROM tb_credit_notes WHERE cn_status = 'issued' AND cn_issue_date BETWEEN ? AND ?`,
        [from, to],
    );
    const [[refunded]] = await conn.query(
        `SELECT COUNT(*) AS refund_count, COALESCE(SUM(ROUND(cn_refund_amount * cn_total_thb / cn_total, 2)), 0) AS refunded_thb
         FROM tb_credit_notes
         WHERE cn_status = 'issued' AND cn_refunded_at IS NOT NULL AND cn_total > 0 AND cn_refund_date BETWEEN ? AND ?`,
        [from, to],
    );
    // ใบเสนอราคาที่ "จบผล" ในช่วง: ตอบรับ/ปฏิเสธ ตามวันที่บันทึกผล · หมดอายุตามวันหมดอายุ
    const [[quotations]] = await conn.query(
        `SELECT
            SUM(qt_status = 'accepted' AND DATE(qt_responded_at) BETWEEN ? AND ?) AS accepted_count,
            COALESCE(SUM(CASE WHEN qt_status = 'accepted' AND DATE(qt_responded_at) BETWEEN ? AND ? THEN qt_after_discount_thb END), 0) AS accepted_thb,
            SUM(qt_status = 'declined' AND DATE(qt_responded_at) BETWEEN ? AND ?) AS declined_count,
            SUM(qt_status = 'expired' AND qt_valid_until BETWEEN ? AND ?) AS expired_count
         FROM tb_quotations`,
        [from, to, from, to, from, to, from, to],
    );
    const [topClients] = await conn.query(
        `SELECT c.client_id, c.client_name, c.client_company, COUNT(*) AS invoice_count,
                SUM(i.inv_after_discount_thb) AS billed_thb,
                (SELECT COALESCE(SUM(cn.cn_base_thb), 0) FROM tb_credit_notes cn
                 WHERE cn.cn_client_id = c.client_id AND cn.cn_status = 'issued' AND cn.cn_issue_date BETWEEN ? AND ?) AS credited_thb,
                (SELECT COALESCE(SUM(${invoiceService.outstandingThbSql("o")}), 0)
                 FROM tb_invoices o WHERE o.inv_client_id = c.client_id AND o.inv_status = 'issued'
                   AND ${invoiceService.outstandingSql("o")} > 0) AS outstanding_thb
         FROM tb_invoices i JOIN tb_clients c ON c.client_id = i.inv_client_id
         WHERE i.inv_status = 'issued' AND i.inv_issue_date BETWEEN ? AND ?
         GROUP BY c.client_id, c.client_name, c.client_company
         ORDER BY billed_thb DESC, c.client_name
         LIMIT ${TOP_CLIENT_COUNT}`,
        [from, to, from, to],
    );
    const [[outstanding]] = await conn.query(
        `SELECT
            COALESCE(SUM(${invoiceService.outstandingThbSql("i")}), 0) AS outstanding_thb,
            COALESCE(SUM(CASE WHEN i.inv_due_date < ? THEN ${invoiceService.outstandingThbSql("i")} END), 0) AS overdue_thb
         FROM tb_invoices i WHERE i.inv_status = 'issued' AND ${invoiceService.outstandingSql("i")} > 0`,
        [today],
    );

    const acceptedCount = Number(quotations.accepted_count ?? 0);
    const decidedCount = acceptedCount + Number(quotations.declined_count ?? 0) + Number(quotations.expired_count ?? 0);
    const receivedThb = money(received.received_thb);
    const withholdingThb = money(received.withholding_thb);
    const feeThb = money(received.fee_thb);

    return {
        range: { from, to },
        billed: {
            invoice_count: Number(billed.invoice_count),
            amount_thb: text(billed.billed_thb),
            amount_with_vat_thb: text(billed.billed_with_vat_thb),
        },
        // ยอดขายสุทธิ = ออกบิล − ใบลดหนี้ของช่วง (แสดงแยกบรรทัด ไม่หักเงียบ — กติกาเงิน 3.8)
        credited: {
            credit_note_count: Number(credited.credit_note_count),
            amount_thb: text(credited.credited_thb),
            amount_with_vat_thb: text(credited.credited_with_vat_thb),
        },
        net_sales: {
            amount_thb: toDecimalText(money(billed.billed_thb) - money(credited.credited_thb)),
            amount_with_vat_thb: toDecimalText(
                money(billed.billed_with_vat_thb) - money(credited.credited_with_vat_thb),
            ),
        },
        refunds: {
            refund_count: Number(refunded.refund_count),
            refunded_thb: text(refunded.refunded_thb),
        },
        received: {
            receipt_count: Number(received.receipt_count),
            received_thb: toDecimalText(receivedThb),
            withholding_thb: toDecimalText(withholdingThb),
            fee_thb: toDecimalText(feeThb),
            settled_thb: toDecimalText(receivedThb + withholdingThb + feeThb),
        },
        quotations: {
            accepted_count: acceptedCount,
            accepted_thb: text(quotations.accepted_thb),
            declined_count: Number(quotations.declined_count ?? 0),
            expired_count: Number(quotations.expired_count ?? 0),
            win_rate_percent: decidedCount > 0 ? Math.round((acceptedCount / decidedCount) * 1000) / 10 : null,
        },
        top_clients: topClients.map((row) => ({
            client_id: row.client_id,
            client_name: row.client_name,
            client_company: row.client_company,
            invoice_count: Number(row.invoice_count),
            billed_thb: text(row.billed_thb),
            credited_thb: text(row.credited_thb),
            outstanding_thb: text(row.outstanding_thb),
        })),
        outstanding_now: {
            outstanding_thb: text(outstanding.outstanding_thb),
            overdue_thb: text(outstanding.overdue_thb),
        },
        today,
    };
}

/**
 * ออกบิล vs รับเงิน รายเดือน ย้อนหลัง N เดือนถึงเดือนนี้ (เดือนที่ไม่มีข้อมูล = 0)
 * @param {import("mysql2/promise").Pool} conn
 * @param {number} monthCount
 */
async function monthlySales(conn, monthCount = 12) {
    const count = Math.min(Math.max(Number(monthCount) || 12, 1), MAX_RANGE_MONTHS);
    const today = todayBangkok();
    const currentMonth = monthIndex(today);
    const months = Array.from({ length: count }, (_, index) => {
        const value = currentMonth - (count - 1 - index);
        const year = Math.floor(value / 12);
        const month = (value % 12) + 1;
        return `${year}-${String(month).padStart(2, "0")}`;
    });
    const from = `${months[0]}-01`;

    const [billedRows] = await conn.query(
        `SELECT DATE_FORMAT(inv_issue_date, '%Y-%m') AS month, SUM(inv_after_discount_thb) AS billed_thb
         FROM tb_invoices WHERE inv_status = 'issued' AND inv_issue_date BETWEEN ? AND ?
         GROUP BY month`,
        [from, today],
    );
    const [creditedRows] = await conn.query(
        `SELECT DATE_FORMAT(cn_issue_date, '%Y-%m') AS month, SUM(cn_base_thb) AS credited_thb
         FROM tb_credit_notes WHERE cn_status = 'issued' AND cn_issue_date BETWEEN ? AND ?
         GROUP BY month`,
        [from, today],
    );
    const [receivedRows] = await conn.query(
        `SELECT DATE_FORMAT(r.rc_receipt_date, '%Y-%m') AS month, ${RECEIVED_COLUMNS}
         FROM tb_receipts r WHERE r.rc_status = 'issued' AND r.rc_receipt_date BETWEEN ? AND ?
         GROUP BY month`,
        [from, today],
    );
    const billedByMonth = new Map(billedRows.map((row) => [row.month, money(row.billed_thb)]));
    const creditedByMonth = new Map(creditedRows.map((row) => [row.month, money(row.credited_thb)]));
    const receivedByMonth = new Map(
        receivedRows.map((row) => [
            row.month,
            money(row.received_thb) + money(row.withholding_thb) + money(row.fee_thb),
        ]),
    );
    return {
        months: months.map((month) => ({
            month,
            // ออกบิลสุทธิ = ใบแจ้งหนี้ − ใบลดหนี้ของเดือน (ขั้น N-1)
            billed_thb: toDecimalText((billedByMonth.get(month) ?? 0n) - (creditedByMonth.get(month) ?? 0n)),
            credited_thb: toDecimalText(creditedByMonth.get(month) ?? 0n),
            received_thb: toDecimalText(receivedByMonth.get(month) ?? 0n),
        })),
        today,
    };
}

module.exports = { salesSummary, monthlySales, validateRange, MAX_RANGE_MONTHS };
