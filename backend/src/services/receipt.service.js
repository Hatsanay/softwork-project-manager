// ใบเสร็จรับเงิน (2026-10-15 ขั้น 1C-2 — docs/plans/2026-10-15-receipts-1c.md หัวข้อ 4)
//
// - บันทึกรับเงิน = ออกใบเสร็จทันที (C1) ตัดได้หลายใบแจ้งหนี้ของลูกค้ารายเดียว สกุลเดียว · รับบางส่วนได้ · รับเกินยอดค้างไม่ได้
// - ยอดทุกตัวคำนวณใน backend ด้วย shared/receipt-totals.mjs (ไม่เชื่อหน้าเว็บ) · เงินเข้าจริง = ตัดหนี้ − หัก − ค่าธรรมเนียม
// - inv_paid_amount ของใบแจ้งหนี้ = ผลรวมยอดตัดของใบเสร็จที่ไม่ยกเลิก — ปรับใน transaction เดียวกับออก/ยกเลิก (R-C2)
// - ออกแล้วแก้ได้เฉพาะข้อมูล 50 ทวิ + บันทึกภายใน · ไฟล์ 50 ทวิ เก็บนอก /uploads สาธารณะ (utils/private-file.js)
//
// ลำดับล็อก: ใบเสร็จ → ใบแจ้งหนี้ (ทุกใบในคำสั่งเดียว เรียงตาม id) · บันทึกรับเงินล็อกแค่ใบแจ้งหนี้
// **ก่อนล็อกใบแจ้งหนี้ห้ามมี SELECT ธรรมดา** — MySQL จับภาพข้อมูลตอน SELECT ธรรมดาครั้งแรก ถ้าจับก่อนได้ล็อก
// จะมองไม่เห็นใบเสร็จอีกใบที่เพิ่งตัดใบเดียวกันไป (บทเรียนเดียวกับใบวางบิล — billing-note.service.js)
const { AppError } = require("../utils/app-error");
const { generateDailyId } = require("../utils/generateDailyId");
const { todayBangkok } = require("../utils/bangkok-time");
const { issueDocumentNumber } = require("../utils/document-number");
const { hasBit } = require("../utils/permissions");
const { parseHundredths } = require("../shared/money.mjs");
const { toDecimalText } = require("../shared/quotation-totals.mjs");
const { calculateReceipt } = require("../shared/receipt-totals.mjs");
const { MAX_RECEIPT_BACKDATE_DAYS } = require("../shared/schemas/receipt.mjs");
const { BASE_CURRENCY } = require("../shared/schemas/quotation.mjs");
const { shiftDate } = require("./exchange-rate.service");
const companyService = require("./company.service");
const quotationService = require("./quotation.service");
const invoiceService = require("./invoice.service");

const DOCUMENT_TYPE = "RE";
const MAX_LIST_LIMIT = 200;
const MAX_RECEIVABLE_ROWS = 500;

const DATE_COLUMNS = `
    DATE_FORMAT(r.rc_receipt_date, '%Y-%m-%d') AS rc_receipt_date,
    DATE_FORMAT(r.rc_cheque_date, '%Y-%m-%d') AS rc_cheque_date,
    DATE_FORMAT(r.rc_wht_certificate_date, '%Y-%m-%d') AS rc_wht_certificate_date`;

const INVOICE_DATE_COLUMNS = `
    DATE_FORMAT(i.inv_issue_date, '%Y-%m-%d') AS inv_issue_date,
    DATE_FORMAT(i.inv_due_date, '%Y-%m-%d') AS inv_due_date`;

// ─── ข้อผิดพลาดที่ใช้บ่อย ───────────────────────────────────────────────────────────────────────

function notFound() {
    return new AppError(404, "RECEIPT_NOT_FOUND", "ไม่พบใบเสร็จนี้ กรุณาโหลดหน้าใหม่");
}

function wrongStatus(message) {
    return new AppError(409, "RECEIPT_WRONG_STATUS", `${message} — กรุณาโหลดหน้าใหม่เพื่อดูสถานะล่าสุด`);
}

function validationError(fields) {
    return new AppError(400, "VALIDATION", "ข้อมูลบางอย่างใช้ไม่ได้ กรุณาแก้ตามข้อความใต้ช่อง", fields);
}

/**
 * เวอร์ชันที่หน้าเว็บส่งมาต้องตรงกับในฐานข้อมูล — ไม่ส่งมา = ไม่ตรวจ
 * @param {{ rc_version: number }} receipt
 * @param {number | null | undefined} expectedVersion
 */
function assertVersion(receipt, expectedVersion) {
    if (expectedVersion === null || expectedVersion === undefined) return;
    if (receipt.rc_version !== expectedVersion) {
        throw new AppError(
            409,
            "RECEIPT_CHANGED",
            "มีคนแก้หรือยกเลิกใบนี้ไปก่อนแล้ว — โหลดหน้าใหม่เพื่อดูข้อมูลล่าสุด (สิ่งที่คุณแก้ยังไม่ถูกบันทึก)",
        );
    }
}

async function findForUpdate(conn, receiptId) {
    const [[receipt]] = await conn.query(
        `SELECT r.*, ${DATE_COLUMNS} FROM tb_receipts r WHERE r.rc_id = ? FOR UPDATE`,
        [receiptId],
    );
    if (!receipt) throw notFound();
    return receipt;
}

function outstandingOf(invoice) {
    return parseHundredths(invoice.inv_total, "ยอดรวม") - parseHundredths(invoice.inv_paid_amount, "ยอดรับแล้ว");
}

// ─── ล็อกและตรวจใบแจ้งหนี้ที่ตัด ─────────────────────────────────────────────────────────────────

/**
 * ล็อกใบแจ้งหนี้ทุกใบในคำสั่งเดียว (เรียงตาม id) — ต้องเป็นคำสั่งอ่านแรกของ transaction (ดูหัวไฟล์)
 * @param {string[]} invoiceIds
 * @returns {Promise<Map<string, object>>}
 */
async function lockInvoices(conn, invoiceIds) {
    const [rows] = await conn.query(
        `SELECT i.inv_id, i.inv_number, i.inv_status, i.inv_client_id, i.inv_currency, i.inv_total, i.inv_vat_amount,
                i.inv_total_thb, i.inv_paid_amount, ${INVOICE_DATE_COLUMNS}
         FROM tb_invoices i WHERE i.inv_id IN (?) ORDER BY i.inv_id FOR UPDATE`,
        [invoiceIds],
    );
    return new Map(rows.map((row) => [row.inv_id, row]));
}

/** ใบที่ตัดต้อง: มีอยู่ · ออกแล้ว · ยังค้าง · ลูกค้าเดียวกับใบเสร็จ · สกุลเดียวกันทุกใบ */
function assertInvoicesReceivable(invoiceIds, invoicesById, clientId) {
    if (invoiceIds.some((id) => !invoicesById.has(id))) {
        throw validationError({ allocations: "ไม่พบใบแจ้งหนี้บางใบ อาจถูกลบไปแล้ว — โหลดหน้าใหม่แล้วเลือกอีกครั้ง" });
    }
    const invoices = invoiceIds.map((id) => invoicesById.get(id));
    const currencyCode = invoices[0].inv_currency;
    const problems = [];
    for (const invoice of invoices) {
        const label = invoice.inv_number ?? "ใบแจ้งหนี้ร่าง";
        if (invoice.inv_status === "cancelled") problems.push(`${label} ถูกยกเลิกแล้ว`);
        else if (invoice.inv_status !== "issued") problems.push(`${label} ยังไม่ได้ออก`);
        else if (outstandingOf(invoice) <= 0n) problems.push(`${label} รับชำระครบแล้ว`);
        else if (invoice.inv_client_id !== clientId) problems.push(`${label} เป็นของลูกค้ารายอื่น`);
        else if (invoice.inv_currency !== currencyCode)
            problems.push(`${label} เป็นสกุล ${invoice.inv_currency} (ใบอื่นเป็น ${currencyCode})`);
    }
    if (problems.length > 0) {
        throw new AppError(
            409,
            "RECEIPT_INVOICE_UNAVAILABLE",
            `${problems.join(" · ")} — ใบเสร็จหนึ่งใบรับเงินได้เฉพาะใบแจ้งหนี้ที่ออกแล้ว ยังค้างชำระ ของลูกค้ารายเดียว สกุลเงินเดียว`,
            { allocations: problems.join("\n") },
        );
    }
    return invoices;
}

/** VAT / ยอดบาท ที่รับไปแล้วของแต่ละใบ (ใบเสร็จที่ไม่ยกเลิก) — ใช้ให้ครั้งที่ปิดใบรับเศษพอดี (R-C3) */
async function findPriorShares(conn, invoiceIds) {
    const [rows] = await conn.query(
        `SELECT a.rca_invoice_id, SUM(a.rca_vat_amount) AS vat, SUM(a.rca_amount_thb) AS thb
         FROM tb_receipt_allocations a JOIN tb_receipts r ON r.rc_id = a.rca_receipt_id
         WHERE r.rc_status = 'issued' AND a.rca_invoice_id IN (?)
         GROUP BY a.rca_invoice_id`,
        [invoiceIds],
    );
    return new Map(
        rows.map((row) => [
            row.rca_invoice_id,
            { vat: parseHundredths(row.vat, "VAT ที่รับแล้ว"), thb: parseHundredths(row.thb, "ยอดบาทที่รับแล้ว") },
        ]),
    );
}

/**
 * สาขา / บัญชีที่เงินเข้า / ใบวางบิลที่อ้าง / วันที่รับเงิน
 * @returns {Promise<Record<string, string>>} ช่องที่ผิด (ว่าง = ผ่าน)
 */
async function checkHeader(conn, input, invoices) {
    const fields = {};
    const today = todayBangkok();

    const [[branch]] = await conn.query("SELECT branch_status FROM tb_branches WHERE branch_id = ?", [
        input.rc_branch_id,
    ]);
    if (!branch) fields.rc_branch_id = "ไม่พบสาขานี้";
    else if (branch.branch_status !== "active") fields.rc_branch_id = "สาขานี้ถูกปิดใช้งานแล้ว";

    if (input.rc_bank_account_id) {
        const [[account]] = await conn.query("SELECT ba_status FROM tb_bank_accounts WHERE ba_id = ?", [
            input.rc_bank_account_id,
        ]);
        if (!account) fields.rc_bank_account_id = "ไม่พบบัญชีนี้";
        else if (account.ba_status !== "active") fields.rc_bank_account_id = "บัญชีนี้ถูกปิดใช้งานแล้ว";
    }

    if (input.rc_billing_note_id) {
        const [[note]] = await conn.query("SELECT bn_client_id, bn_status FROM tb_billing_notes WHERE bn_id = ?", [
            input.rc_billing_note_id,
        ]);
        if (!note) fields.rc_billing_note_id = "ไม่พบใบวางบิลนี้";
        else if (note.bn_client_id !== input.rc_client_id)
            fields.rc_billing_note_id = "ใบวางบิลนี้เป็นของลูกค้ารายอื่น";
        else if (note.bn_status !== "issued") fields.rc_billing_note_id = "อ้างได้เฉพาะใบวางบิลที่ออกแล้ว";
    }

    // วันที่รับเงิน (C2): ไม่ใช่อนาคต · ย้อนได้ไม่เกิน 30 วัน · ไม่ก่อนวันที่ออกใบแจ้งหนี้ที่ตัด (เทียบเวลาไทย R-C5)
    const receiptDate = input.rc_receipt_date;
    const latestIssueDate = invoices
        .map((invoice) => invoice.inv_issue_date)
        .sort()
        .pop();
    if (receiptDate > today) {
        fields.rc_receipt_date = "วันที่รับเงินต้องไม่เป็นวันในอนาคต";
    } else if (receiptDate < shiftDate(today, -MAX_RECEIPT_BACKDATE_DAYS)) {
        fields.rc_receipt_date = `ย้อนหลังได้ไม่เกิน ${MAX_RECEIPT_BACKDATE_DAYS} วัน`;
    } else if (latestIssueDate && receiptDate < latestIssueDate) {
        fields.rc_receipt_date = `ต้องไม่ก่อนวันที่ออกใบแจ้งหนี้ (${latestIssueDate})`;
    }
    return fields;
}

// ─── บันทึกรับเงิน (= ออกใบเสร็จ) ────────────────────────────────────────────────────────────────

async function insertRow(conn, table, values) {
    const columns = Object.keys(values);
    await conn.query(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`, [
        ...Object.values(values),
    ]);
}

async function buildSnapshots(conn, input) {
    const [[client]] = await conn.query(
        `SELECT client_id, client_name, client_company, client_contact_name, client_email, client_phone, client_type, client_country,
                client_tax_id, client_branch_code, client_address
         FROM tb_clients WHERE client_id = ?`,
        [input.rc_client_id],
    );
    const company = await companyService.findCompany(conn);
    const { cs_updated_at: _updatedAt, ...companySnapshot } = company;
    const [[branch]] = await conn.query(
        `SELECT branch_id, branch_code, branch_name_th, branch_name_en, branch_address_th, branch_address_en, branch_phone
         FROM tb_branches WHERE branch_id = ?`,
        [input.rc_branch_id],
    );
    const [[bankAccount]] = input.rc_bank_account_id
        ? await conn.query(
              `SELECT ba_id, ba_bank_name, ba_account_name, ba_account_no, ba_bank_branch, ba_swift_code, ba_currency
               FROM tb_bank_accounts WHERE ba_id = ?`,
              [input.rc_bank_account_id],
          )
        : [[null]];
    return {
        rc_client_snapshot: JSON.stringify(client),
        rc_company_snapshot: JSON.stringify({ ...companySnapshot, branch }),
        rc_bank_snapshot: bankAccount ? JSON.stringify(bankAccount) : null,
    };
}

/**
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {object} input ผ่าน receiptCreateSchema แล้ว
 * @param {{ user_id: string }} actor
 * @returns {Promise<{ rc_id: string, rc_number: string, rc_received_amount: string }>}
 */
async function createReceipt(conn, input, actor) {
    const invoiceIds = input.allocations.map((row) => row.rca_invoice_id);
    const invoicesById = await lockInvoices(conn, invoiceIds);
    const invoices = assertInvoicesReceivable(invoiceIds, invoicesById, input.rc_client_id);
    const currencyCode = invoices[0].inv_currency;
    const currency = await quotationService.findCurrency(conn, currencyCode);
    const isForeign = currencyCode !== BASE_CURRENCY;

    const fields = await checkHeader(conn, input, invoices);
    const prior = await findPriorShares(conn, invoiceIds);
    const calculation = calculateReceipt({
        allocations: input.allocations.map((row) => {
            const invoice = invoicesById.get(row.rca_invoice_id);
            const shares = prior.get(invoice.inv_id) ?? { vat: 0n, thb: 0n };
            return {
                invoiceId: invoice.inv_id,
                amount: parseHundredths(row.rca_amount, "ยอดรับ"),
                invoiceTotal: parseHundredths(invoice.inv_total, "ยอดรวม"),
                invoiceVat: parseHundredths(invoice.inv_vat_amount, "VAT"),
                invoiceTotalThb: parseHundredths(invoice.inv_total_thb, "ยอดบาท"),
                paidBefore: parseHundredths(invoice.inv_paid_amount, "ยอดรับแล้ว"),
                vatBefore: shares.vat,
                thbBefore: shares.thb,
            };
        }),
        withholding: parseHundredths(input.rc_wht_amount, "หัก ณ ที่จ่าย"),
        fee: parseHundredths(input.rc_fee_amount, "ค่าธรรมเนียม"),
        isForeign,
        receivedThb: isForeign && input.rc_received_thb ? parseHundredths(input.rc_received_thb, "ยอดบาท") : null,
        currencyDecimals: currency.cur_decimals,
    });
    Object.assign(fields, calculation.errors);
    if (Object.keys(fields).length > 0) throw validationError(fields);

    const [[creator]] = await conn.query(
        "SELECT CONCAT(user_fname, ' ', user_lname) AS full_name FROM tb_users WHERE user_id = ?",
        [actor.user_id],
    );
    const snapshots = await buildSnapshots(conn, input);
    const documentNumber = await issueDocumentNumber(conn, DOCUMENT_TYPE, input.rc_receipt_date);
    const receiptId = await generateDailyId("tb_receipts", "rc_id", "RCP");

    await insertRow(conn, "tb_receipts", {
        rc_id: receiptId,
        rc_number: documentNumber,
        rc_status: "issued",
        rc_version: 0,
        rc_client_id: input.rc_client_id,
        rc_branch_id: input.rc_branch_id,
        rc_currency: currencyCode,
        rc_language: input.rc_language,
        rc_receipt_date: input.rc_receipt_date,
        rc_method: input.rc_method,
        rc_bank_account_id: input.rc_bank_account_id,
        rc_reference: input.rc_reference,
        rc_cheque_no: input.rc_cheque_no,
        rc_cheque_bank: input.rc_cheque_bank,
        rc_cheque_date: input.rc_cheque_date,
        rc_allocated_total: toDecimalText(calculation.allocatedTotal),
        rc_wht_amount: input.rc_wht_amount,
        rc_fee_amount: input.rc_fee_amount,
        rc_received_amount: toDecimalText(calculation.received),
        rc_received_thb: toDecimalText(calculation.receivedThb),
        rc_actual_rate: calculation.actualRate,
        rc_allocated_thb: toDecimalText(calculation.allocatedThb),
        rc_fx_diff_thb: toDecimalText(calculation.fxDiffThb),
        rc_wht_certificate_no: input.rc_wht_certificate_no,
        rc_wht_certificate_date: input.rc_wht_certificate_date,
        rc_notes: input.rc_notes,
        rc_internal_note: input.rc_internal_note,
        rc_billing_note_id: input.rc_billing_note_id,
        ...snapshots,
        rc_created_by: actor.user_id,
        rc_created_by_name: creator?.full_name ?? null,
    });
    for (const [index, line] of calculation.lines.entries()) {
        await insertRow(conn, "tb_receipt_allocations", {
            rca_receipt_id: receiptId,
            rca_invoice_id: line.invoiceId,
            rca_order: index + 1,
            rca_amount: toDecimalText(line.amount),
            rca_vat_amount: toDecimalText(line.vat),
            rca_amount_thb: toDecimalText(line.amountThb),
        });
        await conn.query(
            "UPDATE tb_invoices SET inv_paid_amount = inv_paid_amount + ?, inv_version = inv_version + 1 WHERE inv_id = ?",
            [toDecimalText(line.amount), line.invoiceId],
        );
    }
    return { rc_id: receiptId, rc_number: documentNumber, rc_received_amount: toDecimalText(calculation.received) };
}

// ─── หลังออก ─────────────────────────────────────────────────────────────────────────────────

/** ยกเลิก — เลขยังอยู่ · ยอดรับแล้วของทุกใบที่ตัดลดกลับ (ใบกลับเป็นค้างชำระ) */
async function cancelReceipt(conn, receiptId, reason, expectedVersion, actor) {
    const receipt = await findForUpdate(conn, receiptId);
    if (receipt.rc_status !== "issued") throw wrongStatus("ใบเสร็จนี้ถูกยกเลิกไปแล้ว");
    assertVersion(receipt, expectedVersion);

    const [allocations] = await conn.query(
        "SELECT rca_invoice_id, rca_amount FROM tb_receipt_allocations WHERE rca_receipt_id = ? ORDER BY rca_invoice_id",
        [receiptId],
    );
    const invoicesById = await lockInvoices(
        conn,
        allocations.map((allocation) => allocation.rca_invoice_id),
    );
    for (const allocation of allocations) {
        const invoice = invoicesById.get(allocation.rca_invoice_id);
        const paid = parseHundredths(invoice.inv_paid_amount, "ยอดรับแล้ว");
        if (paid < parseHundredths(allocation.rca_amount, "ยอดตัด")) {
            // ไม่ควรเกิด (R-C2) — หยุดก่อนยอดติดลบ ให้ผู้ดูแลตรวจข้อมูล
            throw new AppError(
                500,
                "RECEIPT_PAID_MISMATCH",
                `ยอดรับแล้วของ ${invoice.inv_number} น้อยกว่ายอดในใบเสร็จนี้ — ข้อมูลไม่ตรงกัน แจ้งผู้ดูแลระบบ`,
            );
        }
        await conn.query(
            "UPDATE tb_invoices SET inv_paid_amount = inv_paid_amount - ?, inv_version = inv_version + 1 WHERE inv_id = ?",
            [allocation.rca_amount, allocation.rca_invoice_id],
        );
    }
    await conn.query(
        `UPDATE tb_receipts SET rc_status = 'cancelled', rc_cancelled_by = ?, rc_cancelled_at = NOW(), rc_cancel_reason = ?,
                rc_version = rc_version + 1
         WHERE rc_id = ?`,
        [actor.user_id, reason, receiptId],
    );
    return { rc_id: receiptId };
}

/** แก้หลังออก: เลขที่/วันที่ 50 ทวิ + บันทึกภายใน เท่านั้น */
async function updateDetails(conn, receiptId, input) {
    const receipt = await findForUpdate(conn, receiptId);
    if (receipt.rc_status !== "issued") throw wrongStatus("ใบเสร็จที่ยกเลิกแล้วแก้ไขไม่ได้");
    assertVersion(receipt, input.rc_version);
    await conn.query(
        `UPDATE tb_receipts SET rc_wht_certificate_no = ?, rc_wht_certificate_date = ?, rc_internal_note = ?, rc_version = rc_version + 1
         WHERE rc_id = ?`,
        [input.rc_wht_certificate_no, input.rc_wht_certificate_date, input.rc_internal_note, receiptId],
    );
    return { rc_id: receiptId };
}

/**
 * ผูกไฟล์ 50 ทวิ ที่บันทึกลงดิสก์แล้วกับใบเสร็จ (null = เอาไฟล์ออก)
 * @returns {Promise<{ oldPath: string | null }>} ไฟล์เดิม — ผู้เรียกลบหลัง commit สำเร็จ (R-C10)
 */
async function setWhtFile(conn, receiptId, storedPath, originalName) {
    const receipt = await findForUpdate(conn, receiptId);
    if (receipt.rc_status !== "issued") throw wrongStatus("ใบเสร็จที่ยกเลิกแล้วแนบหรือลบไฟล์ไม่ได้");
    if (!storedPath && !receipt.rc_wht_file_path) throw wrongStatus("ใบนี้ไม่มีไฟล์ 50 ทวิ ให้ลบ");
    await conn.query(
        `UPDATE tb_receipts SET rc_wht_file_path = ?, rc_wht_file_name = ?, rc_wht_file_uploaded_at = ?, rc_version = rc_version + 1
         WHERE rc_id = ?`,
        [storedPath, originalName, storedPath ? new Date() : null, receiptId],
    );
    return { oldPath: receipt.rc_wht_file_path };
}

/** ไฟล์ 50 ทวิ ของใบเสร็จ (สำหรับส่งให้ผู้มีสิทธิ์เปิด) */
async function findWhtFile(conn, receiptId) {
    const [[receipt]] = await conn.query("SELECT rc_wht_file_path, rc_wht_file_name FROM tb_receipts WHERE rc_id = ?", [
        receiptId,
    ]);
    if (!receipt) throw notFound();
    if (!receipt.rc_wht_file_path) throw new AppError(404, "WHT_FILE_NOT_FOUND", "ใบนี้ยังไม่ได้แนบไฟล์ 50 ทวิ");
    return { storedPath: receipt.rc_wht_file_path, fileName: receipt.rc_wht_file_name };
}

// ─── อ่าน ────────────────────────────────────────────────────────────────────────────────────

/**
 * ใบแจ้งหนี้ที่รับเงินได้ (ออกแล้ว ยังค้าง) + VAT/ยอดบาทที่รับไปแล้ว — หน้าบันทึกรับเงินใช้
 * @param {import("mysql2/promise").Pool} conn
 * @param {{ clientId?: string, billingNoteId?: string }} options billingNoteId = เฉพาะใบในใบวางบิลนั้น
 */
async function listReceivableInvoices(conn, { clientId, billingNoteId } = {}) {
    const today = todayBangkok();
    const conditions = ["i.inv_status = 'issued'", "i.inv_paid_amount < i.inv_total"];
    const params = [];
    let billingNote = null;
    if (billingNoteId) {
        const [[note]] = await conn.query(
            "SELECT bn_id, bn_number, bn_status, bn_client_id, bn_currency FROM tb_billing_notes WHERE bn_id = ?",
            [billingNoteId],
        );
        if (!note) throw new AppError(404, "BILLING_NOTE_NOT_FOUND", "ไม่พบใบวางบิลนี้ กรุณาโหลดหน้าใหม่");
        billingNote = note;
        conditions.push(
            "EXISTS (SELECT 1 FROM tb_billing_note_invoices bi WHERE bi.bni_invoice_id = i.inv_id AND bi.bni_billing_note_id = ?)",
        );
        params.push(billingNoteId);
    }
    if (clientId) {
        conditions.push("i.inv_client_id = ?");
        params.push(clientId);
    }
    const [rows] = await conn.query(
        `SELECT i.inv_id, i.inv_number, i.inv_title, i.inv_client_id, i.inv_branch_id, i.inv_language, i.inv_currency,
                i.inv_total, i.inv_vat_amount, i.inv_total_thb, i.inv_paid_amount, i.inv_wht_amount, ${INVOICE_DATE_COLUMNS},
                c.client_name, c.client_company,
                COALESCE(prior.vat, 0) AS vat_received, COALESCE(prior.thb, 0) AS thb_received
         FROM tb_invoices i
         JOIN tb_clients c ON c.client_id = i.inv_client_id
         LEFT JOIN (
             SELECT a.rca_invoice_id, SUM(a.rca_vat_amount) AS vat, SUM(a.rca_amount_thb) AS thb
             FROM tb_receipt_allocations a JOIN tb_receipts r ON r.rc_id = a.rca_receipt_id
             WHERE r.rc_status = 'issued'
             GROUP BY a.rca_invoice_id
         ) prior ON prior.rca_invoice_id = i.inv_id
         WHERE ${conditions.join(" AND ")}
         ORDER BY c.client_name, i.inv_currency, i.inv_issue_date, i.inv_number
         LIMIT ${MAX_RECEIVABLE_ROWS}`,
        params,
    );
    return {
        data: rows.map((row) => {
            const daysPastDue = row.inv_due_date ? invoiceService.daysBetween(row.inv_due_date, today) : 0;
            return {
                ...row,
                outstanding_amount: toDecimalText(outstandingOf(row)),
                is_overdue: daysPastDue > 0,
                days_overdue: Math.max(daysPastDue, 0),
            };
        }),
        billing_note: billingNote,
        today,
        earliest_receipt_date: shiftDate(today, -MAX_RECEIPT_BACKDATE_DAYS),
    };
}

const LIST_TABS = {
    all: "1 = 1",
    issued: "r.rc_status = 'issued'",
    missing_wht: "r.rc_status = 'issued' AND r.rc_wht_amount > 0 AND r.rc_wht_file_path IS NULL",
    cancelled: "r.rc_status = 'cancelled'",
};

/**
 * @param {import("mysql2/promise").Pool} conn
 * @param {{ tab?: string, search?: string, clientId?: string, invoiceId?: string, limit?: number, offset?: number }} options
 */
async function listReceipts(conn, { tab = "all", search = "", clientId, invoiceId, limit = 20, offset = 0 }) {
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), MAX_LIST_LIMIT);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const conditions = [LIST_TABS[tab] ?? LIST_TABS.all];
    const params = [];
    if (search) {
        const like = `%${search}%`;
        conditions.push(
            `(r.rc_number LIKE ? OR c.client_name LIKE ? OR c.client_company LIKE ? OR r.rc_cheque_no LIKE ? OR r.rc_reference LIKE ?
              OR EXISTS (SELECT 1 FROM tb_receipt_allocations a JOIN tb_invoices i ON i.inv_id = a.rca_invoice_id
                         WHERE a.rca_receipt_id = r.rc_id AND i.inv_number LIKE ?))`,
        );
        params.push(like, like, like, like, like, like);
    }
    if (clientId) {
        conditions.push("r.rc_client_id = ?");
        params.push(clientId);
    }
    if (invoiceId) {
        conditions.push(
            "EXISTS (SELECT 1 FROM tb_receipt_allocations a WHERE a.rca_receipt_id = r.rc_id AND a.rca_invoice_id = ?)",
        );
        params.push(invoiceId);
    }
    const where = conditions.join(" AND ");

    const [[{ total }]] = await conn.query(
        `SELECT COUNT(*) AS total FROM tb_receipts r JOIN tb_clients c ON c.client_id = r.rc_client_id WHERE ${where}`,
        params,
    );
    const [rows] = await conn.query(
        `SELECT r.rc_id, r.rc_number, r.rc_status, r.rc_method, r.rc_currency, r.rc_allocated_total, r.rc_received_amount,
                r.rc_wht_amount, r.rc_wht_file_path IS NOT NULL AS has_wht_file, r.rc_client_id, ${DATE_COLUMNS},
                c.client_name, c.client_company,
                (SELECT COUNT(*) FROM tb_receipt_allocations a WHERE a.rca_receipt_id = r.rc_id) AS invoice_count
         FROM tb_receipts r
         JOIN tb_clients c ON c.client_id = r.rc_client_id
         WHERE ${where}
         ORDER BY r.rc_receipt_date DESC, r.rc_number DESC
         LIMIT ? OFFSET ?`,
        [...params, safeLimit, safeOffset],
    );
    return {
        data: rows.map((row) => ({
            ...row,
            has_wht_file: Boolean(row.has_wht_file),
            invoice_count: Number(row.invoice_count),
        })),
        total: Number(total),
    };
}

/**
 * ใบเสร็จพร้อมทุกอย่างที่หน้าเอกสาร/หน้าพิมพ์ต้องใช้ — ไม่ส่ง path ของไฟล์ 50 ทวิ (เปิดผ่าน API ที่ตรวจสิทธิ์)
 * @param {import("mysql2/promise").Pool} conn
 * @param {string} receiptId
 * @param {{ role_permission: string }} actor
 */
async function getReceiptDetail(conn, receiptId, actor) {
    const [[receipt]] = await conn.query(
        `SELECT r.*, ${DATE_COLUMNS}, c.client_name, c.client_company, br.branch_code, br.branch_name_th,
                b.bn_number, b.bn_status, CONCAT(cu.user_fname, ' ', cu.user_lname) AS cancelled_by_name
         FROM tb_receipts r
         JOIN tb_clients c ON c.client_id = r.rc_client_id
         JOIN tb_branches br ON br.branch_id = r.rc_branch_id
         LEFT JOIN tb_billing_notes b ON b.bn_id = r.rc_billing_note_id
         LEFT JOIN tb_users cu ON cu.user_id = r.rc_cancelled_by
         WHERE r.rc_id = ?`,
        [receiptId],
    );
    if (!receipt) throw notFound();

    const [allocations] = await conn.query(
        `SELECT a.rca_order, a.rca_amount, a.rca_vat_amount, a.rca_amount_thb, i.inv_id, i.inv_number, i.inv_title, i.inv_status,
                i.inv_total, i.inv_paid_amount, ${INVOICE_DATE_COLUMNS}
         FROM tb_receipt_allocations a JOIN tb_invoices i ON i.inv_id = a.rca_invoice_id
         WHERE a.rca_receipt_id = ?
         ORDER BY a.rca_order`,
        [receiptId],
    );
    const receivedUpToThis = await receivedUpToReceipt(conn, receipt, allocations);
    const currency = await quotationService.findCurrency(conn, receipt.rc_currency);
    const { rc_wht_file_path: whtFilePath, ...publicFields } = receipt;
    const isIssued = receipt.rc_status === "issued";
    const canCreate = hasBit(actor.role_permission, "createReceipt");

    return {
        receipt: {
            ...publicFields,
            has_wht_file: Boolean(whtFilePath),
            rc_client_snapshot: quotationService.parseJson(receipt.rc_client_snapshot),
            rc_company_snapshot: quotationService.parseJson(receipt.rc_company_snapshot),
            rc_bank_snapshot: quotationService.parseJson(receipt.rc_bank_snapshot),
        },
        allocations: allocations.map((row) => ({
            ...row,
            outstanding_amount: toDecimalText(outstandingOf(row)),
            // คงค้าง ณ ใบเสร็จนี้ (ไม่ใช่วันนี้) — พิมพ์ซ้ำทีหลังได้ยอดเดิมเสมอ
            outstanding_after_receipt: toDecimalText(
                parseHundredths(row.inv_total, "ยอดใบแจ้งหนี้") - (receivedUpToThis.get(row.inv_id) ?? 0n),
            ),
        })),
        currency,
        actions: {
            can_cancel: hasBit(actor.role_permission, "cancelReceipt") && isIssued,
            can_edit_details: canCreate && isIssued,
            can_manage_file: canCreate && isIssued,
        },
    };
}

/**
 * ยอดที่ตัดแต่ละใบแจ้งหนี้แล้ว นับถึงใบเสร็จนี้ (เรียงวันที่รับ → เลขที่) — ไม่นับใบเสร็จที่ยกเลิก ยกเว้นใบนี้เอง
 * @returns {Promise<Map<string, bigint>>}
 */
async function receivedUpToReceipt(conn, receipt, allocations) {
    const invoiceIds = allocations.map((row) => row.inv_id);
    if (invoiceIds.length === 0) return new Map();
    const [rows] = await conn.query(
        `SELECT a.rca_invoice_id, SUM(a.rca_amount) AS received
         FROM tb_receipt_allocations a JOIN tb_receipts r ON r.rc_id = a.rca_receipt_id
         WHERE a.rca_invoice_id IN (?) AND (r.rc_status <> 'cancelled' OR r.rc_id = ?)
           AND (r.rc_receipt_date < ? OR (r.rc_receipt_date = ? AND r.rc_number <= ?))
         GROUP BY a.rca_invoice_id`,
        [invoiceIds, receipt.rc_id, receipt.rc_receipt_date, receipt.rc_receipt_date, receipt.rc_number],
    );
    return new Map(rows.map((row) => [row.rca_invoice_id, parseHundredths(row.received, "ยอดรับ")]));
}

module.exports = {
    createReceipt,
    cancelReceipt,
    updateDetails,
    setWhtFile,
    findWhtFile,
    listReceivableInvoices,
    listReceipts,
    getReceiptDetail,
};
