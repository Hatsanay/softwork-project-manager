// ใบวางบิล (2026-10-15 ขั้น 1B-4 — docs/plans/2026-10-14-invoices-1b.md หัวข้อ 4.4)
//
// - รวมใบแจ้งหนี้ที่ออกแล้วและยังค้างชำระ ของลูกค้ารายเดียว สกุลเงินเดียว + วันนัดชำระ → พิมพ์ให้ลูกค้าเซ็นรับวางบิล
// - ร่าง → ออก (ได้เลข BN + วันที่ + snapshot ลูกค้า/บริษัท + ยอด ณ วันออก) → ยกเลิกพร้อมเหตุผล · ไม่ต้องอนุมัติ
// - ใบแจ้งหนี้หนึ่งใบอยู่ในใบวางบิลที่ไม่ยกเลิกได้ใบเดียว (รวมร่าง) · ใบแจ้งหนี้ที่อยู่ในใบวางบิลยกเลิกไม่ได้ (invoice-workflow)
//
// ลำดับล็อก: ใบวางบิล → ใบแจ้งหนี้ (ทุกใบในคำสั่งเดียว เรียงตาม id) · ยกเลิกใบแจ้งหนี้ล็อกแค่ใบแจ้งหนี้ → ไม่ล็อกไขว้กัน
// **ก่อนล็อกใบแจ้งหนี้ห้ามมี SELECT ธรรมดา** — MySQL จับภาพข้อมูล (snapshot) ตอน SELECT ธรรมดาครั้งแรกของ transaction
// ถ้าจับก่อนได้ล็อก จะมองไม่เห็นใบวางบิลอีกใบที่เพิ่งบันทึกใบแจ้งหนี้เดียวกันไป (สองคนเลือกใบเดียวกันพร้อมกันแล้วผ่านทั้งคู่)
const { AppError } = require("../utils/app-error");
const { generateDailyId } = require("../utils/generateDailyId");
const { todayBangkok } = require("../utils/bangkok-time");
const { issueDocumentNumber } = require("../utils/document-number");
const { hasBit } = require("../utils/permissions");
const { divideRoundHalfUp, parseHundredths } = require("../shared/money.mjs");
const { toDecimalText } = require("../shared/quotation-totals.mjs");
const companyService = require("./company.service");
const quotationService = require("./quotation.service");
const invoiceService = require("./invoice.service");

const DOCUMENT_TYPE = "BN";
const MAX_LIST_LIMIT = 200;
const MAX_BILLABLE_ROWS = 500;

const DATE_COLUMNS = `
    DATE_FORMAT(b.bn_issue_date, '%Y-%m-%d') AS bn_issue_date,
    DATE_FORMAT(b.bn_payment_date, '%Y-%m-%d') AS bn_payment_date`;

// ─── ข้อผิดพลาดที่ใช้บ่อย ───────────────────────────────────────────────────────────────────────

function notFound() {
    return new AppError(404, "BILLING_NOTE_NOT_FOUND", "ไม่พบใบวางบิลนี้ อาจถูกลบไปแล้ว กรุณาโหลดหน้าใหม่");
}

function wrongStatus(message) {
    return new AppError(409, "BILLING_NOTE_WRONG_STATUS", `${message} · กรุณาโหลดหน้าใหม่เพื่อดูสถานะล่าสุด`);
}

function validationError(fields) {
    return new AppError(400, "VALIDATION", "ข้อมูลบางอย่างใช้ไม่ได้ กรุณาแก้ตามข้อความใต้ช่อง", fields);
}

/**
 * เวอร์ชันที่หน้าเว็บส่งมาต้องตรงกับในฐานข้อมูล — ไม่ส่งมา = ไม่ตรวจ
 * @param {{ bn_version: number }} note
 * @param {number | null | undefined} expectedVersion
 */
function assertVersion(note, expectedVersion) {
    if (expectedVersion === null || expectedVersion === undefined) return;
    if (note.bn_version !== expectedVersion) {
        throw new AppError(
            409,
            "BILLING_NOTE_CHANGED",
            "มีคนแก้หรือเปลี่ยนสถานะใบนี้ไปก่อนแล้ว · โหลดหน้าใหม่เพื่อดูข้อมูลล่าสุด (สิ่งที่คุณแก้ยังไม่ถูกบันทึก)",
        );
    }
}

async function findForUpdate(conn, billingNoteId) {
    const [[note]] = await conn.query(
        `SELECT b.*, ${DATE_COLUMNS} FROM tb_billing_notes b WHERE b.bn_id = ? FOR UPDATE`,
        [billingNoteId],
    );
    if (!note) throw notFound();
    return note;
}

// ─── ใบแจ้งหนี้ที่รวมได้ ─────────────────────────────────────────────────────────────────────────

/** ยอดที่ยังค้าง (หลังลดหนี้ − รับสุทธิ — สูตรกลาง R-N2) · ใบวางบิลเรียกเก็บเฉพาะส่วนที่เหลือ */
function outstandingOf(invoice) {
    return invoiceService.balanceOf(invoice).outstanding;
}

// คอลัมน์ที่สูตรยอดค้างต้องใช้ (ขั้น N-1)
const BALANCE_COLUMNS = "i.inv_credited_amount, i.inv_credited_wht, i.inv_refunded_amount";

function invoiceLabel(invoice) {
    return invoice.inv_number ?? "ใบแจ้งหนี้ร่าง";
}

/**
 * ล็อกใบแจ้งหนี้ที่เลือก (คำสั่งเดียว เรียงตาม id) แล้วตรวจว่ารวมในใบวางบิลนี้ได้ทุกใบ
 * - ออกแล้ว · ยังค้างชำระ · ลูกค้าเดียวกับใบวางบิล · สกุลเงินเดียวกันทุกใบ · ไม่อยู่ในใบวางบิลอื่นที่ไม่ยกเลิก (รวมร่าง)
 * @param {string[]} invoiceIds ตามลำดับที่ผู้ใช้เลือก
 * @param {string} clientId ลูกค้าของใบวางบิล
 * @param {string | null} excludeBillingNoteId ใบวางบิลนี้เอง (ตอนแก้/ออก)
 * @returns {Promise<object[]>} แถวใบแจ้งหนี้ตามลำดับ invoiceIds
 */
async function lockBillableInvoices(conn, invoiceIds, clientId, excludeBillingNoteId) {
    const [rows] = await conn.query(
        `SELECT i.inv_id, i.inv_number, i.inv_status, i.inv_client_id, i.inv_currency, i.inv_total, i.inv_paid_amount,
                ${BALANCE_COLUMNS}
         FROM tb_invoices i WHERE i.inv_id IN (?) ORDER BY i.inv_id FOR UPDATE`,
        [invoiceIds],
    );
    const byId = new Map(rows.map((row) => [row.inv_id, row]));
    if (invoiceIds.some((id) => !byId.has(id))) {
        throw validationError({ invoice_ids: "ไม่พบใบแจ้งหนี้บางใบ อาจถูกลบไปแล้ว · โหลดหน้าใหม่แล้วเลือกอีกครั้ง" });
    }
    const invoices = invoiceIds.map((id) => byId.get(id));

    const [links] = await conn.query(
        `SELECT bi.bni_invoice_id, b.bn_number
         FROM tb_billing_note_invoices bi JOIN tb_billing_notes b ON b.bn_id = bi.bni_billing_note_id
         WHERE bi.bni_invoice_id IN (?) AND b.bn_status <> 'cancelled' AND b.bn_id <> ?`,
        [invoiceIds, excludeBillingNoteId ?? ""],
    );
    const otherNoteByInvoice = new Map(links.map((link) => [link.bni_invoice_id, link]));

    const currencyCode = invoices[0].inv_currency;
    const problems = [];
    for (const invoice of invoices) {
        const label = invoiceLabel(invoice);
        const otherNote = otherNoteByInvoice.get(invoice.inv_id);
        if (invoice.inv_status === "cancelled") problems.push(`${label} ถูกยกเลิกแล้ว`);
        else if (invoice.inv_status !== "issued") problems.push(`${label} ยังไม่ได้ออก`);
        else if (outstandingOf(invoice) <= 0n) problems.push(`${label} รับชำระครบแล้ว`);
        else if (invoice.inv_client_id !== clientId) problems.push(`${label} เป็นของลูกค้ารายอื่น`);
        else if (invoice.inv_currency !== currencyCode)
            problems.push(`${label} เป็นสกุล ${invoice.inv_currency} (ใบอื่นเป็น ${currencyCode})`);
        else if (otherNote) problems.push(`${label} อยู่ในใบวางบิล ${otherNote.bn_number ?? "ร่างอีกใบ"} แล้ว`);
    }
    if (problems.length > 0) {
        throw new AppError(
            409,
            "BILLING_NOTE_INVOICE_UNAVAILABLE",
            `${problems.join(" · ")} · ใบวางบิลรวมได้เฉพาะใบแจ้งหนี้ที่ออกแล้ว ยังค้างชำระ ของลูกค้ารายเดียว สกุลเงินเดียว ` +
                "และยังไม่อยู่ในใบวางบิลอื่น",
            { invoice_ids: problems.join("\n") },
        );
    }
    return invoices;
}

/**
 * ลูกค้า/สาขา ต้องมีอยู่จริง · ที่เลือกใหม่ต้องเปิดใช้งาน · วันนัดชำระไม่ย้อนหลัง
 * @returns {Promise<Record<string, string>>} ช่องที่ผิด (ว่าง = ผ่าน)
 */
async function checkHeader(conn, draft, existing) {
    const fields = {};
    const isChanged = (column) => !existing || existing[column] !== draft[column];

    const [[client]] = await conn.query("SELECT client_status FROM tb_clients WHERE client_id = ?", [
        draft.bn_client_id,
    ]);
    if (!client) fields.bn_client_id = "ไม่พบลูกค้านี้ อาจถูกลบไปแล้ว";

    const [[branch]] = await conn.query("SELECT branch_status FROM tb_branches WHERE branch_id = ?", [
        draft.bn_branch_id,
    ]);
    if (!branch) fields.bn_branch_id = "ไม่พบสาขานี้";
    else if (branch.branch_status !== "active" && isChanged("bn_branch_id"))
        fields.bn_branch_id = "สาขานี้ถูกปิดใช้งานแล้ว";

    if (draft.bn_payment_date && draft.bn_payment_date < todayBangkok()) {
        fields.bn_payment_date = "วันนัดชำระต้องไม่ก่อนวันนี้";
    }
    return fields;
}

/**
 * เขียนรายการใบแจ้งหนี้ใหม่ทั้งชุด (ลบของเดิมก่อน) + ยอดรวม — ยอดแต่ละใบ = ยอดค้าง ณ ตอนบันทึก
 * @returns {Promise<bigint>} ยอดรวม
 */
async function replaceInvoices(conn, billingNoteId, invoices) {
    await conn.query("DELETE FROM tb_billing_note_invoices WHERE bni_billing_note_id = ?", [billingNoteId]);
    let total = 0n;
    for (const [index, invoice] of invoices.entries()) {
        const amount = outstandingOf(invoice);
        total += amount;
        await conn.query(
            `INSERT INTO tb_billing_note_invoices (bni_billing_note_id, bni_invoice_id, bni_order, bni_amount)
             VALUES (?, ?, ?, ?)`,
            [billingNoteId, invoice.inv_id, index + 1, toDecimalText(amount)],
        );
    }
    await conn.query("UPDATE tb_billing_notes SET bn_total = ? WHERE bn_id = ?", [toDecimalText(total), billingNoteId]);
    return total;
}

// ─── ร่าง ────────────────────────────────────────────────────────────────────────────────────

/**
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {object} draft ผ่าน billingNoteDraftSchema แล้ว
 * @param {{ user_id: string }} actor
 */
async function createDraft(conn, draft, actor) {
    const invoices = await lockBillableInvoices(conn, draft.invoice_ids, draft.bn_client_id, null);
    const fields = await checkHeader(conn, draft, null);
    if (Object.keys(fields).length > 0) throw validationError(fields);

    const billingNoteId = await generateDailyId("tb_billing_notes", "bn_id", "BLN");
    await conn.query(
        `INSERT INTO tb_billing_notes
            (bn_id, bn_status, bn_version, bn_client_id, bn_branch_id, bn_currency, bn_language, bn_payment_date, bn_notes, bn_created_by)
         VALUES (?, 'draft', 0, ?, ?, ?, ?, ?, ?, ?)`,
        [
            billingNoteId,
            draft.bn_client_id,
            draft.bn_branch_id,
            invoices[0].inv_currency,
            draft.bn_language,
            draft.bn_payment_date,
            draft.bn_notes,
            actor.user_id,
        ],
    );
    await replaceInvoices(conn, billingNoteId, invoices);
    return { bn_id: billingNoteId };
}

/**
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {string} billingNoteId
 * @param {object} draft ผ่าน billingNoteDraftSchema แล้ว
 */
async function updateDraft(conn, billingNoteId, draft) {
    const existing = await findForUpdate(conn, billingNoteId);
    if (existing.bn_status !== "draft") throw wrongStatus("ใบนี้ไม่ได้เป็นร่างแล้ว แก้ไขไม่ได้");
    if (draft.bn_version === null || draft.bn_version === undefined) {
        throw new AppError(400, "VALIDATION", "หน้าเว็บเป็นเวอร์ชันเก่า กรุณารีเฟรชแล้วลองใหม่", {
            bn_version: "ไม่มีเวอร์ชัน",
        });
    }
    assertVersion(existing, draft.bn_version);

    const invoices = await lockBillableInvoices(conn, draft.invoice_ids, draft.bn_client_id, billingNoteId);
    const fields = await checkHeader(conn, draft, existing);
    if (Object.keys(fields).length > 0) throw validationError(fields);

    await conn.query(
        `UPDATE tb_billing_notes SET bn_client_id = ?, bn_branch_id = ?, bn_currency = ?, bn_language = ?, bn_payment_date = ?,
                bn_notes = ?, bn_version = bn_version + 1
         WHERE bn_id = ?`,
        [
            draft.bn_client_id,
            draft.bn_branch_id,
            invoices[0].inv_currency,
            draft.bn_language,
            draft.bn_payment_date,
            draft.bn_notes,
            billingNoteId,
        ],
    );
    await replaceInvoices(conn, billingNoteId, invoices);
    return { bn_id: billingNoteId };
}

/** ลบร่างจริง (รายการใบแจ้งหนี้ตามไปด้วย) — ใบแจ้งหนี้กลับมาเลือกใหม่ได้ */
async function deleteDraft(conn, billingNoteId, expectedVersion) {
    const existing = await findForUpdate(conn, billingNoteId);
    if (existing.bn_status !== "draft") throw wrongStatus('ลบได้เฉพาะร่าง · ใบที่ออกแล้วให้ใช้ "ยกเลิก" แทน');
    assertVersion(existing, expectedVersion);
    await conn.query("DELETE FROM tb_billing_notes WHERE bn_id = ?", [billingNoteId]);
}

// ─── ออก / ยกเลิก ─────────────────────────────────────────────────────────────────────────────

/**
 * ออกใบวางบิล: ตรวจใบแจ้งหนี้ทุกใบอีกครั้งหลังล็อก · ยอด ณ วันออก · เลข BN · วันที่ = วันนี้ · snapshot ลูกค้า/บริษัท
 */
async function issue(conn, billingNoteId, expectedVersion, actor) {
    const note = await findForUpdate(conn, billingNoteId);
    if (note.bn_status !== "draft") throw wrongStatus("ออกได้เฉพาะใบที่เป็นร่าง");
    assertVersion(note, expectedVersion);

    // อ่านรายการใบแจ้งหนี้ด้วย FOR UPDATE (ยังห้าม SELECT ธรรมดาก่อนล็อกใบแจ้งหนี้ — ดูหัวไฟล์)
    const [links] = await conn.query(
        "SELECT bni_invoice_id FROM tb_billing_note_invoices WHERE bni_billing_note_id = ? ORDER BY bni_order FOR UPDATE",
        [billingNoteId],
    );
    if (links.length === 0)
        throw validationError({ invoice_ids: "ยังไม่ได้เลือกใบแจ้งหนี้ · แก้ร่างแล้วเลือกอย่างน้อย 1 ใบ" });
    const invoices = await lockBillableInvoices(
        conn,
        links.map((link) => link.bni_invoice_id),
        note.bn_client_id,
        billingNoteId,
    );

    const today = todayBangkok();
    const problems = [];
    const [[branch]] = await conn.query(
        `SELECT branch_id, branch_code, branch_name_th, branch_name_en, branch_address_th, branch_address_en, branch_phone, branch_status
         FROM tb_branches WHERE branch_id = ?`,
        [note.bn_branch_id],
    );
    if (branch?.branch_status !== "active") problems.push("สาขาถูกปิดใช้งาน · เลือกสาขาอื่นในร่าง");
    if (note.bn_payment_date && note.bn_payment_date < today) {
        problems.push(`วันนัดชำระ (${note.bn_payment_date}) ผ่านมาแล้ว · แก้ร่างให้เป็นวันนี้หรือหลังจากนี้`);
    }
    if (problems.length > 0) {
        throw new AppError(400, "BILLING_NOTE_NOT_READY", `ยังออกใบวางบิลไม่ได้: ${problems.join(" · ")}`, {
            _form: problems.join("\n"),
        });
    }

    const [[client]] = await conn.query(
        `SELECT client_id, client_name, client_company, client_contact_name, client_email, client_phone, client_type, client_country,
                client_tax_id, client_branch_code, client_address
         FROM tb_clients WHERE client_id = ?`,
        [note.bn_client_id],
    );
    const company = await companyService.findCompany(conn);
    const { cs_updated_at: _updatedAt, ...companySnapshot } = company;
    const { branch_status: _branchStatus, ...branchSnapshot } = branch;
    const [[creator]] = await conn.query(
        "SELECT CONCAT(user_fname, ' ', user_lname) AS full_name FROM tb_users WHERE user_id = ?",
        [actor.user_id],
    );

    await replaceInvoices(conn, billingNoteId, invoices);
    const documentNumber = await issueDocumentNumber(conn, DOCUMENT_TYPE, today);
    await conn.query(
        `UPDATE tb_billing_notes SET bn_status = 'issued', bn_number = ?, bn_issue_date = ?, bn_client_snapshot = ?,
                bn_company_snapshot = ?, bn_created_by_name = ?, bn_issued_at = NOW(), bn_version = bn_version + 1
         WHERE bn_id = ?`,
        [
            documentNumber,
            today,
            JSON.stringify(client),
            JSON.stringify({ ...companySnapshot, branch: branchSnapshot }),
            creator?.full_name ?? null,
            billingNoteId,
        ],
    );
    return { bn_id: billingNoteId, bn_number: documentNumber, bn_issue_date: today };
}

/** ยกเลิกใบที่ออกแล้ว — เลขยังอยู่ · ใบแจ้งหนี้ในใบนี้กลับมาเลือกใหม่/ยกเลิกได้ */
async function cancel(conn, billingNoteId, reason, expectedVersion, actor) {
    const note = await findForUpdate(conn, billingNoteId);
    if (note.bn_status === "draft") throw wrongStatus('ร่างใช้ "ลบ" แทนการยกเลิก');
    if (note.bn_status !== "issued") throw wrongStatus("ใบนี้ถูกยกเลิกไปแล้ว");
    assertVersion(note, expectedVersion);
    await conn.query(
        `UPDATE tb_billing_notes SET bn_status = 'cancelled', bn_cancelled_by = ?, bn_cancelled_at = NOW(), bn_cancel_reason = ?,
                bn_version = bn_version + 1
         WHERE bn_id = ?`,
        [actor.user_id, reason, billingNoteId],
    );
    return { bn_id: billingNoteId };
}

// ─── อ่าน ────────────────────────────────────────────────────────────────────────────────────

const INVOICE_DATE_COLUMNS = `
    DATE_FORMAT(i.inv_issue_date, '%Y-%m-%d') AS inv_issue_date,
    DATE_FORMAT(i.inv_due_date, '%Y-%m-%d') AS inv_due_date`;

/**
 * ใบแจ้งหนี้ที่รวมในใบวางบิลได้ (ออกแล้ว ค้างชำระ ไม่อยู่ในใบวางบิลอื่น) — หน้าสร้าง/แก้ใบวางบิลใช้
 * @param {import("mysql2/promise").Pool} conn
 * @param {{ clientId?: string, billingNoteId?: string }} options billingNoteId = นับใบที่อยู่ในร่างนี้ว่าเลือกได้ (หน้าแก้)
 */
async function listBillableInvoices(conn, { clientId, billingNoteId } = {}) {
    const today = todayBangkok();
    const conditions = [
        "i.inv_status = 'issued'",
        `${invoiceService.outstandingSql("i")} > 0`,
        `NOT EXISTS (
            SELECT 1 FROM tb_billing_note_invoices bi JOIN tb_billing_notes b ON b.bn_id = bi.bni_billing_note_id
            WHERE bi.bni_invoice_id = i.inv_id AND b.bn_status <> 'cancelled' AND b.bn_id <> ?
        )`,
    ];
    const params = [billingNoteId ?? ""];
    if (clientId) {
        conditions.push("i.inv_client_id = ?");
        params.push(clientId);
    }
    const [rows] = await conn.query(
        `SELECT i.inv_id, i.inv_number, i.inv_title, i.inv_status, i.inv_client_id, i.inv_branch_id, i.inv_language, i.inv_currency,
                i.inv_total, i.inv_paid_amount, i.inv_wht_amount, ${BALANCE_COLUMNS}, ${INVOICE_DATE_COLUMNS},
                c.client_name, c.client_company, c.client_status
         FROM tb_invoices i JOIN tb_clients c ON c.client_id = i.inv_client_id
         WHERE ${conditions.join(" AND ")}
         ORDER BY c.client_name, i.inv_currency, i.inv_issue_date, i.inv_number
         LIMIT ${MAX_BILLABLE_ROWS}`,
        params,
    );
    return {
        data: rows.map((row) => ({
            ...row,
            outstanding_amount: toDecimalText(outstandingOf(row)),
            ...dueOf(row, today),
        })),
        today,
    };
}

/** เกินกำหนดกี่วัน (ใช้กติกาเดียวกับหน้าใบแจ้งหนี้ — เทียบวันที่ไทย) */
function dueOf(invoice, today) {
    if (!invoice.inv_due_date) return { is_overdue: false, days_overdue: 0 };
    const daysPastDue = invoiceService.daysBetween(invoice.inv_due_date, today);
    return { is_overdue: daysPastDue > 0, days_overdue: Math.max(daysPastDue, 0) };
}

const LIST_TABS = {
    all: "1 = 1",
    draft: "b.bn_status = 'draft'",
    issued: "b.bn_status = 'issued'",
    cancelled: "b.bn_status = 'cancelled'",
};

/**
 * @param {import("mysql2/promise").Pool} conn
 * @param {{ tab?: string, search?: string, clientId?: string, limit?: number, offset?: number }} options
 */
async function listBillingNotes(conn, { tab = "all", search = "", clientId, limit = 20, offset = 0 }) {
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), MAX_LIST_LIMIT);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const conditions = [LIST_TABS[tab] ?? LIST_TABS.all];
    const params = [];
    if (search) {
        const like = `%${search}%`;
        conditions.push(
            `(b.bn_number LIKE ? OR c.client_name LIKE ? OR c.client_company LIKE ? OR EXISTS (
                SELECT 1 FROM tb_billing_note_invoices bi JOIN tb_invoices i ON i.inv_id = bi.bni_invoice_id
                WHERE bi.bni_billing_note_id = b.bn_id AND i.inv_number LIKE ?
            ))`,
        );
        params.push(like, like, like, like);
    }
    if (clientId) {
        conditions.push("b.bn_client_id = ?");
        params.push(clientId);
    }
    const where = conditions.join(" AND ");

    const [[{ total }]] = await conn.query(
        `SELECT COUNT(*) AS total FROM tb_billing_notes b JOIN tb_clients c ON c.client_id = b.bn_client_id WHERE ${where}`,
        params,
    );
    const [rows] = await conn.query(
        `SELECT b.bn_id, b.bn_number, b.bn_status, b.bn_currency, b.bn_total, b.bn_client_id, b.bn_updated_at, ${DATE_COLUMNS},
                c.client_name, c.client_company,
                (SELECT COUNT(*) FROM tb_billing_note_invoices bi WHERE bi.bni_billing_note_id = b.bn_id) AS invoice_count,
                CONCAT(u.user_fname, ' ', u.user_lname) AS created_by_name
         FROM tb_billing_notes b
         JOIN tb_clients c ON c.client_id = b.bn_client_id
         LEFT JOIN tb_users u ON u.user_id = b.bn_created_by
         WHERE ${where}
         ORDER BY b.bn_updated_at DESC, b.bn_id DESC
         LIMIT ? OFFSET ?`,
        [...params, safeLimit, safeOffset],
    );
    return { data: rows.map((row) => ({ ...row, invoice_count: Number(row.invoice_count) })), total: Number(total) };
}

/**
 * ใบวางบิลพร้อมทุกอย่างที่หน้าเอกสาร/หน้าพิมพ์ต้องใช้
 * ร่าง: ยอดแต่ละใบเป็นยอดค้างปัจจุบัน + ปัญหาของแต่ละใบ (ถ้ามี) · ออกแล้ว/ยกเลิก: ยอด ณ วันออก
 * @param {import("mysql2/promise").Pool} conn
 * @param {string} billingNoteId
 * @param {{ role_permission: string }} actor
 */
async function getBillingNoteDetail(conn, billingNoteId, actor) {
    const today = todayBangkok();
    const [[note]] = await conn.query(
        `SELECT b.*, ${DATE_COLUMNS}, c.client_name, c.client_company, c.client_status, br.branch_code, br.branch_name_th,
                br.branch_status, CONCAT(u.user_fname, ' ', u.user_lname) AS created_by_current_name,
                CONCAT(cu.user_fname, ' ', cu.user_lname) AS cancelled_by_name
         FROM tb_billing_notes b
         JOIN tb_clients c ON c.client_id = b.bn_client_id
         JOIN tb_branches br ON br.branch_id = b.bn_branch_id
         LEFT JOIN tb_users u ON u.user_id = b.bn_created_by
         LEFT JOIN tb_users cu ON cu.user_id = b.bn_cancelled_by
         WHERE b.bn_id = ?`,
        [billingNoteId],
    );
    if (!note) throw notFound();

    const [invoiceRows] = await conn.query(
        `SELECT bi.bni_order, bi.bni_amount, i.inv_id, i.inv_number, i.inv_title, i.inv_status, i.inv_client_id, i.inv_currency,
                i.inv_total, i.inv_paid_amount, i.inv_wht_amount, ${BALANCE_COLUMNS}, ${INVOICE_DATE_COLUMNS}
         FROM tb_billing_note_invoices bi JOIN tb_invoices i ON i.inv_id = bi.bni_invoice_id
         WHERE bi.bni_billing_note_id = ?
         ORDER BY bi.bni_order`,
        [billingNoteId],
    );
    const isDraft = note.bn_status === "draft";
    const otherNotes = isDraft ? await findOtherActiveNotes(conn, invoiceRows, billingNoteId) : new Map();
    const invoices = invoiceRows.map((row) => {
        const amount = isDraft ? outstandingOf(row) : parseHundredths(row.bni_amount, "ยอด");
        return {
            ...row,
            bni_amount: toDecimalText(amount),
            // ยอดตามใบแจ้งหนี้หลังลดหนี้ (หน้าพิมพ์แสดงเมื่อวางบิลไม่เต็มใบ)
            effective_total: toDecimalText(invoiceService.balanceOf(row).effectiveTotal),
            ...dueOf(row, today),
            problem: isDraft ? describeInvoiceProblem(row, note, otherNotes.get(row.inv_id)) : null,
        };
    });
    const total = invoices.reduce((sum, row) => sum + parseHundredths(row.bni_amount, "ยอด"), 0n);
    // หัก ณ ที่จ่าย (ประมาณ) ของยอดที่วางบิล = ยอดหักของใบแจ้งหนี้ × ยอดวางบิล ÷ ยอดใบแจ้งหนี้
    // (ใบที่รับเงินบางส่วนก่อนวางบิล หักเฉพาะส่วนที่เหลือ — ตรงกับ "ยอดชำระสุทธิ" ในหน้าพิมพ์ใบแจ้งหนี้)
    // ขั้น N-1: ฐานคือยอดหลังลดหนี้ และหัก ณ ที่จ่ายหลังลดหนี้
    const withholdingTotal = invoices.reduce((sum, row) => {
        const invoiceTotal = invoiceService.balanceOf(row).effectiveTotal;
        if (invoiceTotal <= 0n) return sum;
        const billed = parseHundredths(row.bni_amount, "ยอดวางบิล");
        const withholding =
            parseHundredths(row.inv_wht_amount, "หัก ณ ที่จ่าย") - parseHundredths(row.inv_credited_wht, "หักที่ลด");
        return sum + divideRoundHalfUp(withholding * billed, invoiceTotal);
    }, 0n);
    const currency = await quotationService.findCurrency(conn, note.bn_currency);

    return {
        billing_note: {
            ...note,
            bn_total: toDecimalText(total),
            bn_client_snapshot: quotationService.parseJson(note.bn_client_snapshot),
            bn_company_snapshot: quotationService.parseJson(note.bn_company_snapshot),
        },
        invoices,
        withholding_total: toDecimalText(withholdingTotal),
        net_payable: toDecimalText(total - withholdingTotal),
        currency,
        actions: buildActions(note, actor, invoices),
        readiness: isDraft ? buildReadiness(note, invoices, today) : [],
        today,
    };
}

// ใบวางบิลอื่นที่ไม่ยกเลิกซึ่งมีใบแจ้งหนี้ของร่างนี้อยู่ (กรณีข้อมูลเก่า/แก้มือ — ปกติบันทึกร่างไม่ผ่าน)
async function findOtherActiveNotes(conn, invoiceRows, billingNoteId) {
    if (invoiceRows.length === 0) return new Map();
    const [rows] = await conn.query(
        `SELECT bi.bni_invoice_id, b.bn_number
         FROM tb_billing_note_invoices bi JOIN tb_billing_notes b ON b.bn_id = bi.bni_billing_note_id
         WHERE bi.bni_invoice_id IN (?) AND b.bn_status <> 'cancelled' AND b.bn_id <> ?`,
        [invoiceRows.map((row) => row.inv_id), billingNoteId],
    );
    return new Map(rows.map((row) => [row.bni_invoice_id, row]));
}

function describeInvoiceProblem(invoice, note, otherNote) {
    if (invoice.inv_status === "cancelled") return "ใบนี้ถูกยกเลิกแล้ว · เอาออกจากร่าง";
    if (invoice.inv_status !== "issued") return "ใบนี้ยังไม่ได้ออก · เอาออกจากร่าง";
    if (outstandingOf(invoice) <= 0n) return "รับชำระครบแล้ว · เอาออกจากร่าง";
    if (invoice.inv_client_id !== note.bn_client_id) return "เป็นของลูกค้ารายอื่น · เอาออกจากร่าง";
    if (invoice.inv_currency !== note.bn_currency) return `เป็นสกุล ${invoice.inv_currency} · เอาออกจากร่าง`;
    if (otherNote) return `อยู่ในใบวางบิล ${otherNote.bn_number ?? "ร่างอีกใบ"} แล้ว · เอาออกจากร่าง`;
    return null;
}

/** ปุ่มที่ผู้ใช้คนนี้กดได้ตอนนี้ (หน้าเว็บซ่อนปุ่มที่กดไม่ได้ — ห้าม tooltip) */
function buildActions(note, actor, invoices) {
    const canCreate = hasBit(actor.role_permission, "createInvoice");
    const isDraft = note.bn_status === "draft";
    return {
        can_edit: canCreate && isDraft,
        can_delete: canCreate && isDraft,
        can_issue: canCreate && isDraft,
        can_cancel: hasBit(actor.role_permission, "cancelInvoice") && note.bn_status === "issued",
        // บันทึกรับเงินตามใบวางบิล (ช่วง 1C) — ต้องยังมีใบที่ค้างชำระอยู่ในใบนี้
        can_receive:
            hasBit(actor.role_permission, "createReceipt") &&
            note.bn_status === "issued" &&
            invoices.some((invoice) => invoice.inv_status === "issued" && outstandingOf(invoice) > 0n),
    };
}

/** รายการตรวจก่อนออก — ข้อที่ไม่ผ่านบอกวิธีแก้ */
function buildReadiness(note, invoices, today) {
    return [
        { key: "invoices", ok: invoices.length > 0, message: "มีใบแจ้งหนี้อย่างน้อย 1 ใบ" },
        {
            key: "invoice_problems",
            ok: invoices.every((invoice) => invoice.problem === null),
            message: "ใบแจ้งหนี้ทุกใบยังออกแล้ว ค้างชำระ และไม่อยู่ในใบวางบิลอื่น",
        },
        { key: "branch", ok: note.branch_status === "active", message: "สาขายังเปิดใช้งานอยู่" },
        {
            key: "payment_date",
            ok: !note.bn_payment_date || note.bn_payment_date >= today,
            message: "วันนัดชำระไม่ใช่วันที่ผ่านมาแล้ว",
        },
    ];
}

module.exports = {
    createDraft,
    updateDraft,
    deleteDraft,
    issue,
    cancel,
    listBillableInvoices,
    listBillingNotes,
    getBillingNoteDetail,
};
