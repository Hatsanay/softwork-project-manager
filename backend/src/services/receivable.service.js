// ลูกหนี้คงค้างแยกอายุ (2026-10-15 ขั้น 1C-2 — docs/plans/2026-10-15-receipts-1c.md หัวข้อ 4.5)
//
// ใบแจ้งหนี้ที่ออกแล้วและยอดค้าง > 0 · อายุนับจากวันครบกำหนดเทียบวันนี้เวลาไทย (C5 — ไม่ใช่เวลาเครื่อง R-C5)
// ช่วง: ยังไม่ถึงกำหนด / เกิน 1–30 / 31–60 / 61–90 / เกิน 90 วัน
// ยอดรวมเป็นบาท: สกุลต่างประเทศคิดยอดค้าง × (ยอดบาทของใบ ÷ ยอดรวมของใบ) = อัตรา ณ วันออกใบแจ้งหนี้
// รวมยอดใน MySQL (GROUP BY) ไม่ดึงทุกใบมาบวกใน Node (R-C13) — DECIMAL ของ MySQL บวก/คูณแม่นยำ ไม่ผ่าน float
const { todayBangkok } = require("../utils/bangkok-time");
const { parseHundredths } = require("../shared/money.mjs");
const { toDecimalText } = require("../shared/quotation-totals.mjs");
const invoiceService = require("./invoice.service");

// ช่วงอายุ (จำนวนวันที่เกินกำหนด รวมขอบทั้งสองข้าง · null = ไม่จำกัด) — key ใช้ทั้ง API และหน้าเว็บ · ลำดับ = ลำดับคอลัมน์
const AGING_BUCKETS = [
    { key: "current", label: "ยังไม่ถึงกำหนด", minDays: null, maxDays: 0 },
    { key: "days_1_30", label: "เกิน 1–30 วัน", minDays: 1, maxDays: 30 },
    { key: "days_31_60", label: "เกิน 31–60 วัน", minDays: 31, maxDays: 60 },
    { key: "days_61_90", label: "เกิน 61–90 วัน", minDays: 61, maxDays: 90 },
    { key: "days_over_90", label: "เกิน 90 วัน", minDays: 91, maxDays: null },
];

function isInBucket(bucket, daysOverdue) {
    const isAboveMinimum = bucket.minDays === null || daysOverdue >= bucket.minDays;
    const isBelowMaximum = bucket.maxDays === null || daysOverdue <= bucket.maxDays;
    return isAboveMinimum && isBelowMaximum;
}

// เงื่อนไข SQL ของช่วงอายุ — สร้างจากตัวเลขในโค้ดเท่านั้น (ไม่มีค่าจากผู้ใช้)
function bucketCondition(bucket) {
    const parts = [];
    if (bucket.minDays !== null) parts.push(`days_overdue >= ${bucket.minDays}`);
    if (bucket.maxDays !== null) parts.push(`days_overdue <= ${bucket.maxDays}`);
    return parts.join(" AND ");
}

function bucketOf(daysOverdue) {
    return AGING_BUCKETS.find((bucket) => isInBucket(bucket, daysOverdue)).key;
}

// ใบที่ค้างชำระ + ยอดค้าง (สกุลของใบ / บาท) + จำนวนวันที่เกินกำหนด — ? ตัวแรก = วันนี้ (เวลาไทย)
const OUTSTANDING_INVOICES = `
    SELECT i.inv_id, i.inv_number, i.inv_title, i.inv_client_id, i.inv_currency, i.inv_total, i.inv_paid_amount,
           DATE_FORMAT(i.inv_issue_date, '%Y-%m-%d') AS inv_issue_date, DATE_FORMAT(i.inv_due_date, '%Y-%m-%d') AS inv_due_date,
           ${invoiceService.outstandingSql("i")} AS outstanding_amount,
           ${invoiceService.outstandingThbSql("i")} AS outstanding_thb,
           DATEDIFF(?, i.inv_due_date) AS days_overdue, cu.cur_decimals
    FROM tb_invoices i
    JOIN tb_currencies cu ON cu.cur_code = i.inv_currency
    WHERE i.inv_status = 'issued' AND ${invoiceService.outstandingSql("i")} > 0`;

/**
 * สรุปรายลูกค้า (ยอดบาทแยกช่วงอายุ) + รวมทุกลูกค้า
 * @param {import("mysql2/promise").Pool} conn
 */
async function agingByClient(conn) {
    const today = todayBangkok();
    const bucketColumns = AGING_BUCKETS.map(
        (bucket) => `SUM(CASE WHEN ${bucketCondition(bucket)} THEN outstanding_thb ELSE 0 END) AS ${bucket.key}`,
    ).join(",\n               ");
    const [rows] = await conn.query(
        `SELECT o.inv_client_id AS client_id, c.client_name, c.client_company, COUNT(*) AS invoice_count,
                SUM(outstanding_thb) AS total, MAX(days_overdue) AS oldest_days_overdue,
               ${bucketColumns}
         FROM (${OUTSTANDING_INVOICES}) o
         JOIN tb_clients c ON c.client_id = o.inv_client_id
         GROUP BY o.inv_client_id, c.client_name, c.client_company
         ORDER BY total DESC, c.client_name`,
        [today],
    );

    const totals = Object.fromEntries([...AGING_BUCKETS.map((bucket) => [bucket.key, 0n]), ["total", 0n]]);
    const clients = rows.map((row) => {
        const client = {
            client_id: row.client_id,
            client_name: row.client_name,
            client_company: row.client_company,
            invoice_count: Number(row.invoice_count),
            oldest_days_overdue: Math.max(Number(row.oldest_days_overdue), 0),
            total: toDecimalText(parseHundredths(row.total, "ยอดค้าง")),
        };
        totals.total += parseHundredths(row.total, "ยอดค้าง");
        for (const bucket of AGING_BUCKETS) {
            const amount = parseHundredths(row[bucket.key], "ยอดค้าง");
            client[bucket.key] = toDecimalText(amount);
            totals[bucket.key] += amount;
        }
        return client;
    });

    return {
        buckets: AGING_BUCKETS.map(({ key, label }) => ({ key, label })),
        clients,
        totals: Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, toDecimalText(value)])),
        today,
    };
}

/**
 * รายใบของลูกค้าหนึ่งราย (ยอดค้างสกุลเดิม + บาท + ช่วงอายุ) — เก่าสุดก่อน
 * @param {import("mysql2/promise").Pool} conn
 * @param {string} clientId
 */
async function agingInvoicesOfClient(conn, clientId) {
    const today = todayBangkok();
    const [rows] = await conn.query(
        `SELECT o.* FROM (${OUTSTANDING_INVOICES}) o WHERE o.inv_client_id = ? ORDER BY o.inv_due_date, o.inv_number`,
        [today, clientId],
    );
    const [[client]] = await conn.query(
        "SELECT client_id, client_name, client_company FROM tb_clients WHERE client_id = ?",
        [clientId],
    );
    return {
        client: client ?? null,
        buckets: AGING_BUCKETS.map(({ key, label }) => ({ key, label })),
        invoices: rows.map((row) => {
            const daysOverdue = Number(row.days_overdue);
            return {
                ...row,
                days_overdue: Math.max(daysOverdue, 0),
                bucket: bucketOf(daysOverdue),
            };
        }),
        today,
    };
}

module.exports = { agingByClient, agingInvoicesOfClient, AGING_BUCKETS };
