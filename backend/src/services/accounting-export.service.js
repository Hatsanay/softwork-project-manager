// ไฟล์ส่งนักบัญชีรายเดือน (.xlsx) (2026-10-15 ขั้น 1D-3 — docs/plans/2026-10-15-finance-1d.md หัวข้อ 3.3)
//
// 6 ชีต: สรุป · ใบแจ้งหนี้ · ใบเสร็จ · หัก ณ ที่จ่าย · ลูกหนี้ ณ สิ้นเดือน · ยกเลิกในเดือน
// - ตัวเลขเป็นตัวเลขจริง · วันที่เป็นวันที่จริง · เลขผู้เสียภาษี/เลขที่เอกสารเป็นข้อความ (ศูนย์นำหน้าไม่หาย)
// - ข้อความทุกช่องเขียนเป็นเซลล์ข้อความ ไม่ใช่สูตร — ชื่อลูกค้า "=HYPERLINK(...)" ไม่ถูกคำนวณ (R-D7)
// - ลูกหนี้ ณ สิ้นเดือน คิดย้อนหลังจากใบเสร็จ ไม่ใช้ยอดค้างปัจจุบัน (R-D3)
// - ข้อมูลลูกค้าบนใบที่ออกแล้วใช้ snapshot ณ วันออก (ตรงกับเอกสารที่ส่งลูกค้า)
// - สร้างแล้วส่งเลย ไม่เก็บไฟล์บนเซิร์ฟเวอร์ (R-D9)
const ExcelJS = require("exceljs");
const { AppError } = require("../utils/app-error");
const companyService = require("./company.service");
const { AGING_BUCKETS } = require("./receivable.service");

const MONTH_TEXT = /^(\d{4})-(0[1-9]|1[0-2])$/;
const MONEY_FORMAT = "#,##0.00";
const RATE_FORMAT = "#,##0.0000";
const DATE_FORMAT = "dd/mm/yyyy";
const METHOD_LABELS = { transfer: "โอนเงิน", cheque: "เช็ค", cash: "เงินสด", other: "อื่นๆ" };
const INVOICE_STATUS = { issued: "ออกแล้ว", cancelled: "ยกเลิก" };
const RECEIPT_STATUS = { issued: "ออกแล้ว", cancelled: "ยกเลิก" };

/**
 * "2026-10" → ช่วงวันที่ของเดือน
 * @param {unknown} monthText
 */
function monthRange(monthText) {
    const match = String(monthText ?? "").match(MONTH_TEXT);
    if (!match)
        throw new AppError(400, "VALIDATION", "เลือกเดือนที่จะส่งออก", { month: "รูปแบบเดือนต้องเป็น YYYY-MM" });
    const year = Number(match[1]);
    const month = Number(match[2]);
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return { month: match[0], from: `${match[0]}-01`, to: `${match[0]}-${String(lastDay).padStart(2, "0")}` };
}

// ─── แปลงค่าลงเซลล์ ───────────────────────────────────────────────────────────────────────────

const number = (value) => (value === null || value === undefined ? null : Number(value));

// "YYYY-MM-DD" → Date (เที่ยงคืน UTC — Excel แสดงเป็นวันนั้นพอดี ไม่เลื่อนตามเขตเวลา)
function dateCell(text) {
    if (!text) return null;
    const [year, month, day] = String(text).slice(0, 10).split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day));
}

function parseJson(value) {
    if (!value) return null;
    if (typeof value === "object") return value;
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
}

function clientBranchLabel(client) {
    if (!client?.client_branch_code || client.client_type !== "juristic") return "";
    return client.client_branch_code === "00000" ? "สำนักงานใหญ่" : `สาขา ${client.client_branch_code}`;
}

/**
 * เพิ่มชีตแบบตาราง: หัวตารางตัวหนา ตรึงแถวแรก ความกว้าง/รูปแบบตัวเลขตามคอลัมน์
 * @param {ExcelJS.Workbook} workbook
 * @param {string} name
 * @param {{ header: string, key: string, width?: number, type?: "text" | "money" | "date" | "rate" | "integer" }[]} columns
 * @param {object[]} rows
 */
function addTableSheet(workbook, name, columns, rows) {
    const sheet = workbook.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
    sheet.columns = columns.map((column) => ({ header: column.header, key: column.key, width: column.width ?? 14 }));
    sheet.getRow(1).font = { bold: true };
    for (const row of rows) {
        const values = {};
        for (const column of columns) {
            const value = row[column.key];
            // ข้อความเป็นเซลล์ข้อความเสมอ (ไม่ใช่สูตร) — เลขผู้เสียภาษีไม่ถูกแปลงเป็นตัวเลข
            values[column.key] =
                column.type === "text" || !column.type
                    ? value === null || value === undefined
                        ? ""
                        : String(value)
                    : value;
        }
        sheet.addRow(values);
    }
    columns.forEach((column, index) => {
        const format = { money: MONEY_FORMAT, rate: RATE_FORMAT, date: DATE_FORMAT, integer: "0" }[column.type];
        if (format) sheet.getColumn(index + 1).numFmt = format;
    });
    return sheet;
}

// ─── อ่านข้อมูล ───────────────────────────────────────────────────────────────────────────────

async function findInvoices(conn, { from, to }) {
    const [rows] = await conn.query(
        `SELECT i.inv_number, DATE_FORMAT(i.inv_issue_date, '%Y-%m-%d') AS issue_date, DATE_FORMAT(i.inv_due_date, '%Y-%m-%d') AS due_date,
                i.inv_client_snapshot, c.client_name, c.client_company, c.client_tax_id, i.inv_title, i.inv_currency, i.inv_exchange_rate,
                i.inv_after_discount, i.inv_vat_rate, i.inv_vat_amount, i.inv_total, i.inv_after_discount_thb, i.inv_total_thb,
                i.inv_wht_amount, q.qt_number, p.project_name, i.inv_status,
                DATE_FORMAT(i.inv_cancelled_at, '%Y-%m-%d') AS cancelled_date, i.inv_cancel_reason
         FROM tb_invoices i
         JOIN tb_clients c ON c.client_id = i.inv_client_id
         LEFT JOIN tb_quotations q ON q.qt_id = i.inv_quotation_id
         LEFT JOIN tb_projects p ON p.project_id = i.inv_project_id
         WHERE i.inv_status IN ('issued', 'cancelled') AND i.inv_issue_date BETWEEN ? AND ?
         ORDER BY i.inv_issue_date, i.inv_number`,
        [from, to],
    );
    return rows.map((row) => {
        const client = parseJson(row.inv_client_snapshot) ?? row;
        return {
            number: row.inv_number,
            issue_date: dateCell(row.issue_date),
            due_date: dateCell(row.due_date),
            client: client.client_company || client.client_name,
            tax_id: client.client_tax_id,
            client_branch: clientBranchLabel(client),
            title: row.inv_title,
            currency: row.inv_currency,
            rate: number(row.inv_exchange_rate),
            before_vat: number(row.inv_after_discount),
            vat_rate: number(row.inv_vat_rate),
            vat: number(row.inv_vat_amount),
            total: number(row.inv_total),
            before_vat_thb: number(row.inv_after_discount_thb),
            vat_thb: Math.round((Number(row.inv_total_thb) - Number(row.inv_after_discount_thb)) * 100) / 100,
            total_thb: number(row.inv_total_thb),
            withholding: number(row.inv_wht_amount),
            quotation: row.qt_number,
            project: row.project_name,
            status: INVOICE_STATUS[row.inv_status] ?? row.inv_status,
            cancelled_date: dateCell(row.cancelled_date),
            cancel_reason: row.inv_cancel_reason,
        };
    });
}

async function findReceipts(conn, { from, to }) {
    const [rows] = await conn.query(
        `SELECT r.rc_id, r.rc_number, DATE_FORMAT(r.rc_receipt_date, '%Y-%m-%d') AS receipt_date, r.rc_client_snapshot, r.rc_bank_snapshot,
                r.rc_method, r.rc_reference, r.rc_cheque_no, r.rc_cheque_bank, r.rc_currency, r.rc_allocated_total, r.rc_wht_amount,
                r.rc_fee_amount, r.rc_received_amount, r.rc_received_thb, r.rc_actual_rate, r.rc_allocated_thb, r.rc_fx_diff_thb,
                r.rc_wht_certificate_no, DATE_FORMAT(r.rc_wht_certificate_date, '%Y-%m-%d') AS certificate_date,
                r.rc_wht_file_path IS NOT NULL AS has_file, r.rc_status,
                DATE_FORMAT(r.rc_cancelled_at, '%Y-%m-%d') AS cancelled_date, r.rc_cancel_reason,
                (SELECT GROUP_CONCAT(i.inv_number ORDER BY a.rca_order SEPARATOR ', ')
                 FROM tb_receipt_allocations a JOIN tb_invoices i ON i.inv_id = a.rca_invoice_id
                 WHERE a.rca_receipt_id = r.rc_id) AS invoice_numbers
         FROM tb_receipts r
         WHERE r.rc_receipt_date BETWEEN ? AND ?
         ORDER BY r.rc_receipt_date, r.rc_number`,
        [from, to],
    );
    return rows.map((row) => {
        const client = parseJson(row.rc_client_snapshot) ?? {};
        const bank = parseJson(row.rc_bank_snapshot);
        let methodDetail = row.rc_reference ?? "";
        if (row.rc_method === "transfer")
            methodDetail =
                `${bank ? `${bank.ba_bank_name} ${bank.ba_account_no}` : ""} ${row.rc_reference ?? ""}`.trim();
        if (row.rc_method === "cheque") methodDetail = `${row.rc_cheque_bank ?? ""} เลขที่ ${row.rc_cheque_no ?? ""}`;
        return {
            number: row.rc_number,
            receipt_date: dateCell(row.receipt_date),
            client: client.client_company || client.client_name,
            tax_id: client.client_tax_id,
            invoices: row.invoice_numbers,
            method: METHOD_LABELS[row.rc_method] ?? row.rc_method,
            method_detail: methodDetail,
            currency: row.rc_currency,
            allocated: number(row.rc_allocated_total),
            withholding: number(row.rc_wht_amount),
            fee: number(row.rc_fee_amount),
            received: number(row.rc_received_amount),
            received_thb: number(row.rc_received_thb),
            actual_rate: number(row.rc_actual_rate),
            fx_diff_thb: number(row.rc_fx_diff_thb),
            certificate_no: row.rc_wht_certificate_no,
            certificate_date: dateCell(row.certificate_date),
            has_file: row.has_file ? "มี" : "ยังไม่มี",
            status: RECEIPT_STATUS[row.rc_status] ?? row.rc_status,
            is_issued: row.rc_status === "issued",
            cancelled_date: dateCell(row.cancelled_date),
            cancel_reason: row.rc_cancel_reason,
        };
    });
}

/**
 * ลูกหนี้ ณ วันสิ้นเดือน (R-D3): ใบที่ออก ≤ วันนั้น และยังไม่ยกเลิก ณ วันนั้น · รับแล้ว = ใบเสร็จวันที่ ≤ วันนั้น ที่ยังไม่ยกเลิก ณ วันนั้น
 */
async function findAgingAsOf(conn, asOf) {
    const [rows] = await conn.query(
        `SELECT o.*, ROUND(o.outstanding * o.inv_total_thb / o.inv_total, 2) AS outstanding_thb, DATEDIFF(?, o.due_date) AS days_overdue
         FROM (
             SELECT i.inv_number, i.inv_client_snapshot, c.client_name, c.client_company, i.inv_currency, i.inv_total, i.inv_total_thb,
                    DATE_FORMAT(i.inv_issue_date, '%Y-%m-%d') AS issue_date, i.inv_due_date AS due_date,
                    DATE_FORMAT(i.inv_due_date, '%Y-%m-%d') AS due_date_text,
                    COALESCE((SELECT SUM(a.rca_amount) FROM tb_receipt_allocations a JOIN tb_receipts r ON r.rc_id = a.rca_receipt_id
                              WHERE a.rca_invoice_id = i.inv_id AND r.rc_receipt_date <= ?
                                AND (r.rc_status = 'issued' OR DATE(r.rc_cancelled_at) > ?)), 0) AS paid_as_of,
                    i.inv_total - COALESCE((SELECT SUM(a.rca_amount) FROM tb_receipt_allocations a JOIN tb_receipts r ON r.rc_id = a.rca_receipt_id
                              WHERE a.rca_invoice_id = i.inv_id AND r.rc_receipt_date <= ?
                                AND (r.rc_status = 'issued' OR DATE(r.rc_cancelled_at) > ?)), 0) AS outstanding
             FROM tb_invoices i JOIN tb_clients c ON c.client_id = i.inv_client_id
             WHERE i.inv_issue_date <= ? AND i.inv_total > 0
               AND (i.inv_status = 'issued' OR (i.inv_status = 'cancelled' AND DATE(i.inv_cancelled_at) > ?))
         ) o
         WHERE o.outstanding > 0
         ORDER BY o.due_date, o.inv_number`,
        [asOf, asOf, asOf, asOf, asOf, asOf, asOf],
    );
    return rows.map((row) => {
        const client = parseJson(row.inv_client_snapshot) ?? row;
        const daysOverdue = Number(row.days_overdue);
        const bucket = AGING_BUCKETS.find(
            (item) =>
                (item.minDays === null || daysOverdue >= item.minDays) &&
                (item.maxDays === null || daysOverdue <= item.maxDays),
        );
        return {
            client: client.client_company || client.client_name,
            number: row.inv_number,
            issue_date: dateCell(row.issue_date),
            due_date: dateCell(row.due_date_text),
            currency: row.inv_currency,
            total: number(row.inv_total),
            paid_as_of: number(row.paid_as_of),
            outstanding: number(row.outstanding),
            outstanding_thb: number(row.outstanding_thb),
            days_overdue: Math.max(daysOverdue, 0),
            bucket: bucket.label,
        };
    });
}

async function findCancellations(conn, { from, to }) {
    const [rows] = await conn.query(
        `SELECT 'ใบแจ้งหนี้' AS kind, i.inv_number AS number, DATE_FORMAT(i.inv_issue_date, '%Y-%m-%d') AS document_date,
                c.client_name, c.client_company, i.inv_currency AS currency, i.inv_total AS amount,
                DATE_FORMAT(i.inv_cancelled_at, '%Y-%m-%d') AS cancelled_date, i.inv_cancel_reason AS reason,
                CONCAT(u.user_fname, ' ', u.user_lname) AS cancelled_by
         FROM tb_invoices i JOIN tb_clients c ON c.client_id = i.inv_client_id LEFT JOIN tb_users u ON u.user_id = i.inv_cancelled_by
         WHERE i.inv_status = 'cancelled' AND DATE(i.inv_cancelled_at) BETWEEN ? AND ?
         UNION ALL
         SELECT 'ใบวางบิล', b.bn_number, DATE_FORMAT(b.bn_issue_date, '%Y-%m-%d'), c.client_name, c.client_company, b.bn_currency, b.bn_total,
                DATE_FORMAT(b.bn_cancelled_at, '%Y-%m-%d'), b.bn_cancel_reason, CONCAT(u.user_fname, ' ', u.user_lname)
         FROM tb_billing_notes b JOIN tb_clients c ON c.client_id = b.bn_client_id LEFT JOIN tb_users u ON u.user_id = b.bn_cancelled_by
         WHERE b.bn_status = 'cancelled' AND DATE(b.bn_cancelled_at) BETWEEN ? AND ?
         UNION ALL
         SELECT 'ใบเสร็จรับเงิน', r.rc_number, DATE_FORMAT(r.rc_receipt_date, '%Y-%m-%d'), c.client_name, c.client_company, r.rc_currency,
                r.rc_allocated_total, DATE_FORMAT(r.rc_cancelled_at, '%Y-%m-%d'), r.rc_cancel_reason, CONCAT(u.user_fname, ' ', u.user_lname)
         FROM tb_receipts r JOIN tb_clients c ON c.client_id = r.rc_client_id LEFT JOIN tb_users u ON u.user_id = r.rc_cancelled_by
         WHERE r.rc_status = 'cancelled' AND DATE(r.rc_cancelled_at) BETWEEN ? AND ?
         ORDER BY cancelled_date, number`,
        [from, to, from, to, from, to],
    );
    return rows.map((row) => ({
        kind: row.kind,
        number: row.number,
        document_date: dateCell(row.document_date),
        client: row.client_company || row.client_name,
        currency: row.currency,
        amount: number(row.amount),
        cancelled_date: dateCell(row.cancelled_date),
        reason: row.reason,
        cancelled_by: row.cancelled_by,
    }));
}

// ─── สร้างไฟล์ ────────────────────────────────────────────────────────────────────────────────

const sum = (rows, key) => Math.round(rows.reduce((total, row) => total + (row[key] ?? 0), 0) * 100) / 100;

/**
 * @param {import("mysql2/promise").Pool} conn
 * @param {unknown} monthText "YYYY-MM"
 * @param {{ user_id: string }} actor
 * @returns {Promise<{ buffer: Buffer, fileName: string }>}
 */
async function buildAccountingExport(conn, monthText, actor) {
    const range = monthRange(monthText);
    const company = await companyService.findCompany(conn);
    const [[user]] = await conn.query(
        "SELECT CONCAT(user_fname, ' ', user_lname) AS full_name FROM tb_users WHERE user_id = ?",
        [actor.user_id],
    );
    const [[{ generated_at: generatedAt }]] = await conn.query(
        "SELECT DATE_FORMAT(NOW(), '%d/%m/%Y %H:%i') AS generated_at",
    );

    const invoices = await findInvoices(conn, range);
    const receipts = await findReceipts(conn, range);
    const issuedReceipts = receipts.filter((row) => row.is_issued);
    const withholdingRows = issuedReceipts.filter((row) => row.withholding > 0);
    const aging = await findAgingAsOf(conn, range.to);
    const cancellations = await findCancellations(conn, range);
    const activeInvoices = invoices.filter((row) => row.status === INVOICE_STATUS.issued);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Softwork";

    // สรุป
    const summary = workbook.addWorksheet("สรุป");
    summary.columns = [{ width: 46 }, { width: 22 }];
    const summaryRows = [
        ["ไฟล์ส่งนักบัญชี เดือน", range.month],
        ["บริษัท", company.cs_name_th ?? ""],
        ["เลขประจำตัวผู้เสียภาษี", company.cs_tax_id ?? ""],
        ["ช่วงวันที่", `${range.from} ถึง ${range.to}`],
        ["ส่งออกเมื่อ (เวลาไทย)", generatedAt],
        ["ผู้ส่งออก", user?.full_name ?? ""],
        [],
        ["ใบแจ้งหนี้ที่ออก (ไม่นับที่ยกเลิก) — จำนวน", activeInvoices.length],
        ["ยอดก่อน VAT รวม (บาท)", sum(activeInvoices, "before_vat_thb")],
        ["VAT รวม (บาท)", sum(activeInvoices, "vat_thb")],
        ["ยอดรวม (บาท)", sum(activeInvoices, "total_thb")],
        ["ใบเสร็จ (ไม่นับที่ยกเลิก) — จำนวน", issuedReceipts.length],
        ["เงินเข้าจริง (บาท)", sum(issuedReceipts, "received_thb")],
        ["ส่วนต่างอัตราแลกเปลี่ยน (บาท)", sum(issuedReceipts, "fx_diff_thb")],
        ["ลูกหนี้คงค้าง ณ สิ้นเดือน (บาท)", sum(aging, "outstanding_thb")],
        ["เอกสารที่ยกเลิกในเดือน — จำนวน", cancellations.length],
        [],
        [
            "หมายเหตุ: ใบเสร็จย้อนวันที่ได้ 30 วัน และยกเลิกเอกสารทีหลังได้ — ตัวเลขของเดือนนี้อาจเปลี่ยน ส่งออกใหม่ถ้ามีการแก้ย้อนหลัง",
        ],
        ["ยอดสกุลต่างประเทศเป็นบาทตามอัตรา ณ วันออกใบแจ้งหนี้ · ใบเสร็จมีอัตราจริงและส่วนต่างให้แยกในชีตใบเสร็จ"],
    ];
    for (const row of summaryRows) summary.addRow(row);
    summary.getColumn(2).numFmt = MONEY_FORMAT;
    summary.getRow(1).font = { bold: true, size: 13 };
    for (const rowNumber of [8, 12, 16]) summary.getRow(rowNumber).getCell(2).numFmt = "0";

    addTableSheet(
        workbook,
        "ใบแจ้งหนี้",
        [
            { header: "เลขที่", key: "number", width: 20 },
            { header: "วันที่", key: "issue_date", type: "date", width: 12 },
            { header: "ครบกำหนด", key: "due_date", type: "date", width: 12 },
            { header: "ลูกค้า", key: "client", width: 32 },
            { header: "เลขผู้เสียภาษี", key: "tax_id", width: 16 },
            { header: "สาขาลูกค้า", key: "client_branch", width: 14 },
            { header: "ชื่อเรื่อง", key: "title", width: 32 },
            { header: "สกุล", key: "currency", width: 7 },
            { header: "อัตรา (บาท/หน่วย)", key: "rate", type: "rate" },
            { header: "ยอดก่อน VAT", key: "before_vat", type: "money" },
            { header: "VAT %", key: "vat_rate", type: "money", width: 8 },
            { header: "VAT", key: "vat", type: "money" },
            { header: "ยอดรวม", key: "total", type: "money" },
            { header: "ก่อน VAT (บาท)", key: "before_vat_thb", type: "money" },
            { header: "VAT (บาท)", key: "vat_thb", type: "money" },
            { header: "ยอดรวม (บาท)", key: "total_thb", type: "money" },
            { header: "หัก ณ ที่จ่าย (ประมาณ)", key: "withholding", type: "money" },
            { header: "ใบเสนอราคา", key: "quotation", width: 20 },
            { header: "โปรเจกต์", key: "project", width: 24 },
            { header: "สถานะ", key: "status", width: 10 },
            { header: "วันที่ยกเลิก", key: "cancelled_date", type: "date", width: 12 },
            { header: "เหตุผลที่ยกเลิก", key: "cancel_reason", width: 30 },
        ],
        invoices,
    );

    addTableSheet(
        workbook,
        "ใบเสร็จ",
        [
            { header: "เลขที่", key: "number", width: 20 },
            { header: "วันที่รับเงิน", key: "receipt_date", type: "date", width: 12 },
            { header: "ลูกค้า", key: "client", width: 32 },
            { header: "เลขผู้เสียภาษี", key: "tax_id", width: 16 },
            { header: "ใบแจ้งหนี้ที่ตัด", key: "invoices", width: 28 },
            { header: "วิธีรับ", key: "method", width: 10 },
            { header: "รายละเอียด", key: "method_detail", width: 30 },
            { header: "สกุล", key: "currency", width: 7 },
            { header: "ยอดตัดหนี้", key: "allocated", type: "money" },
            { header: "หัก ณ ที่จ่าย", key: "withholding", type: "money" },
            { header: "ค่าธรรมเนียม", key: "fee", type: "money" },
            { header: "เงินเข้าจริง", key: "received", type: "money" },
            { header: "เงินเข้า (บาท)", key: "received_thb", type: "money" },
            { header: "อัตราจริง", key: "actual_rate", type: "rate" },
            { header: "ส่วนต่างอัตรา (บาท)", key: "fx_diff_thb", type: "money" },
            { header: "เลขที่ 50 ทวิ", key: "certificate_no", width: 16 },
            { header: "สถานะ", key: "status", width: 10 },
            { header: "วันที่ยกเลิก", key: "cancelled_date", type: "date", width: 12 },
            { header: "เหตุผลที่ยกเลิก", key: "cancel_reason", width: 30 },
        ],
        receipts,
    );

    addTableSheet(
        workbook,
        "หัก ณ ที่จ่าย",
        [
            { header: "วันที่รับเงิน", key: "receipt_date", type: "date", width: 12 },
            { header: "เลขที่ใบเสร็จ", key: "number", width: 20 },
            { header: "ลูกค้า (ผู้หัก)", key: "client", width: 32 },
            { header: "เลขผู้เสียภาษีผู้หัก", key: "tax_id", width: 18 },
            { header: "สกุล", key: "currency", width: 7 },
            { header: "ยอดหัก", key: "withholding", type: "money" },
            { header: "เลขที่ 50 ทวิ", key: "certificate_no", width: 16 },
            { header: "วันที่ 50 ทวิ", key: "certificate_date", type: "date", width: 12 },
            { header: "ไฟล์ 50 ทวิ", key: "has_file", width: 10 },
        ],
        withholdingRows,
    );

    addTableSheet(
        workbook,
        "ลูกหนี้ ณ สิ้นเดือน",
        [
            { header: "ลูกค้า", key: "client", width: 32 },
            { header: "ใบแจ้งหนี้", key: "number", width: 20 },
            { header: "วันที่", key: "issue_date", type: "date", width: 12 },
            { header: "ครบกำหนด", key: "due_date", type: "date", width: 12 },
            { header: "สกุล", key: "currency", width: 7 },
            { header: "ยอดรวม", key: "total", type: "money" },
            { header: "รับแล้ว ณ สิ้นเดือน", key: "paid_as_of", type: "money" },
            { header: "ค้าง", key: "outstanding", type: "money" },
            { header: "ค้าง (บาท)", key: "outstanding_thb", type: "money" },
            { header: "เกินกำหนด (วัน)", key: "days_overdue", type: "integer", width: 10 },
            { header: "ช่วงอายุ", key: "bucket", width: 16 },
        ],
        aging,
    );

    addTableSheet(
        workbook,
        "ยกเลิกในเดือน",
        [
            { header: "ประเภท", key: "kind", width: 16 },
            { header: "เลขที่", key: "number", width: 20 },
            { header: "วันที่เอกสาร", key: "document_date", type: "date", width: 12 },
            { header: "ลูกค้า", key: "client", width: 32 },
            { header: "สกุล", key: "currency", width: 7 },
            { header: "ยอด", key: "amount", type: "money" },
            { header: "วันที่ยกเลิก", key: "cancelled_date", type: "date", width: 12 },
            { header: "เหตุผล", key: "reason", width: 30 },
            { header: "ผู้ยกเลิก", key: "cancelled_by", width: 20 },
        ],
        cancellations,
    );

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    return { buffer, fileName: `softwork-บัญชี-${range.month}.xlsx`, month: range.month };
}

module.exports = { buildAccountingExport, monthRange };
