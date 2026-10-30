// ใบลดหนี้ (2026-10-18 ขั้น N-1 — docs/plans/2026-10-18-adjustments-po.md หัวข้อ 3.1, 4.1)
//
// - ลดยอดที่ลูกค้าต้องจ่ายของใบแจ้งหนี้ที่ออกแล้ว โดยไม่ยกเลิกใบเดิม · ยอดคำนวณใน backend (shared/credit-note-totals.mjs)
// - ทุกใบต้องอนุมัติตามกติกา 'CN' (N2-ก) · อนุมัติครบ = ออกเลข CN + เพิ่มยอดใน tb_invoices.inv_credited_* (transaction เดียว)
// - ลดเกินยอดค้าง (ลูกค้าจ่ายมาแล้ว) = ต้องบันทึกคืนเงิน (N1-ก) → tb_invoices.inv_refunded_amount
// - ใบเดิมอยู่ในใบวางบิลที่ยังไม่ยกเลิก → ออกไม่ได้ (R-N5) · ยกเลิกใบลดหนี้ที่คืนเงินแล้ว → ยกเลิกการคืนเงินก่อน (R-N8)
//
// ลำดับล็อก: ใบลดหนี้ → ใบแจ้งหนี้ เสมอ · ทุกฟังก์ชันที่เปลี่ยนยอดล็อกด้วย SELECT ... FOR UPDATE ก่อนอ่านอย่างอื่น (R-N1)
const { AppError } = require("../utils/app-error");
const { generateDailyId } = require("../utils/generateDailyId");
const { todayBangkok } = require("../utils/bangkok-time");
const { issueDocumentNumber } = require("../utils/document-number");
const { hasBit } = require("../utils/permissions");
const { buildApprovalPlan, evaluateApproval } = require("../shared/approval-flow.mjs");
const { parseHundredths } = require("../shared/money.mjs");
const { toDecimalText } = require("../shared/quotation-totals.mjs");
const { calculateCreditNote, checkRefund, invoiceBalance } = require("../shared/credit-note-totals.mjs");
const { CREDIT_NOTE_REASONS, MAX_REFUND_BACKDATE_DAYS } = require("../shared/schemas/credit-note.mjs");
const { shiftDate } = require("./exchange-rate.service");
const companyService = require("./company.service");
const quotationService = require("./quotation.service");
const invoiceService = require("./invoice.service");
const approvalRulesService = require("./approval-rules.service");
const signatureService = require("./signature.service");

const DOCUMENT_TYPE = "CN";
const DOCUMENT_NAME = "ใบลดหนี้";
const MAX_LIST_LIMIT = 200;

const DATE_COLUMNS = `
    DATE_FORMAT(cn.cn_issue_date, '%Y-%m-%d') AS cn_issue_date,
    DATE_FORMAT(cn.cn_refund_date, '%Y-%m-%d') AS cn_refund_date`;

// ─── ข้อผิดพลาดที่ใช้บ่อย ───────────────────────────────────────────────────────────────────────

function notFound() {
    return new AppError(404, "CREDIT_NOTE_NOT_FOUND", "ไม่พบใบลดหนี้นี้ อาจถูกลบไปแล้ว กรุณาโหลดหน้าใหม่");
}

function wrongStatus(message) {
    return new AppError(409, "CREDIT_NOTE_WRONG_STATUS", `${message} · กรุณาโหลดหน้าใหม่เพื่อดูสถานะล่าสุด`);
}

function validationError(fields) {
    return new AppError(400, "VALIDATION", "ข้อมูลบางอย่างใช้ไม่ได้ กรุณาแก้ตามข้อความใต้ช่อง", fields);
}

/**
 * เวอร์ชันที่หน้าเว็บส่งมาต้องตรงกับในฐานข้อมูล — ไม่ส่งมา = ไม่ตรวจ
 * @param {{ cn_version: number }} creditNote
 * @param {number | null | undefined} expectedVersion
 */
function assertVersion(creditNote, expectedVersion) {
    if (expectedVersion === null || expectedVersion === undefined) return;
    if (creditNote.cn_version !== expectedVersion) {
        throw new AppError(
            409,
            "CREDIT_NOTE_CHANGED",
            "มีคนแก้หรือเปลี่ยนสถานะใบนี้ไปก่อนแล้ว · โหลดหน้าใหม่เพื่อดูข้อมูลล่าสุด (สิ่งที่คุณแก้ยังไม่ถูกบันทึก)",
        );
    }
}

async function findForUpdate(conn, creditNoteId) {
    const [[creditNote]] = await conn.query(
        `SELECT cn.*, ${DATE_COLUMNS} FROM tb_credit_notes cn WHERE cn.cn_id = ? FOR UPDATE`,
        [creditNoteId],
    );
    if (!creditNote) throw notFound();
    return creditNote;
}

async function lockInvoice(conn, invoiceId) {
    const [[invoice]] = await conn.query(
        `SELECT i.*, DATE_FORMAT(i.inv_issue_date, '%Y-%m-%d') AS inv_issue_date_text
         FROM tb_invoices i WHERE i.inv_id = ? FOR UPDATE`,
        [invoiceId],
    );
    if (!invoice) throw new AppError(404, "INVOICE_NOT_FOUND", "ไม่พบใบแจ้งหนี้ที่อ้าง กรุณาโหลดหน้าใหม่");
    return invoice;
}

async function findUserLabel(conn, userId) {
    const [[user]] = await conn.query(
        `SELECT CONCAT(u.user_fname, ' ', u.user_lname) AS full_name, u.user_role_id, r.role_name
         FROM tb_users u LEFT JOIN tb_roles r ON r.role_id = u.user_role_id
         WHERE u.user_id = ?`,
        [userId],
    );
    return user ?? { full_name: "(ผู้ใช้ถูกลบ)", user_role_id: null, role_name: null };
}

// ─── ยอดของใบเดิม ───────────────────────────────────────────────────────────────────────────────

/** ยอดของใบแจ้งหนี้ในรูปที่ calculateCreditNote ต้องการ (BigInt ร้อยส่วน) */
function invoiceFigures(invoice) {
    return {
        invoice: {
            afterDiscount: parseHundredths(invoice.inv_after_discount, "ยอดก่อน VAT"),
            vat: parseHundredths(invoice.inv_vat_amount, "VAT"),
            total: parseHundredths(invoice.inv_total, "ยอดรวม"),
            afterDiscountThb: parseHundredths(invoice.inv_after_discount_thb, "ยอดก่อน VAT บาท"),
            totalThb: parseHundredths(invoice.inv_total_thb, "ยอดบาท"),
            withholding: parseHundredths(invoice.inv_wht_amount, "หัก ณ ที่จ่าย"),
            vatRate: invoice.inv_vat_rate,
        },
        credited: {
            base: parseHundredths(invoice.inv_credited_base, "ลดหนี้ก่อน VAT"),
            vat: parseHundredths(invoice.inv_credited_vat, "ลดหนี้ VAT"),
            total: parseHundredths(invoice.inv_credited_amount, "ลดหนี้แล้ว"),
            baseThb: parseHundredths(invoice.inv_credited_base_thb, "ลดหนี้ก่อน VAT บาท"),
            totalThb: parseHundredths(invoice.inv_credited_thb, "ลดหนี้บาท"),
            withholding: parseHundredths(invoice.inv_credited_wht, "ลดหนี้หัก ณ ที่จ่าย"),
        },
        paid: parseHundredths(invoice.inv_paid_amount, "ยอดรับแล้ว"),
        refunded: parseHundredths(invoice.inv_refunded_amount, "คืนเงินแล้ว"),
    };
}

async function calculateFor(conn, invoice, lines) {
    const currency = await quotationService.findCurrency(conn, invoice.inv_currency);
    return calculateCreditNote({
        ...invoiceFigures(invoice),
        lineAmounts: lines.map((line) => parseHundredths(line.cnl_amount, "ยอดที่ลด")),
        currencyDecimals: currency.cur_decimals,
    });
}

/**
 * ใบแจ้งหนี้ต้องออกแล้ว ไม่ยกเลิก และไม่อยู่ในใบวางบิลที่ยังไม่ยกเลิก (R-N5)
 * @returns {Promise<string | null>} เหตุผลที่ลดหนี้ไม่ได้ (null = ได้)
 */
async function findCreditBlocker(conn, invoice) {
    if (invoice.inv_status === "cancelled") return "ใบแจ้งหนี้นี้ถูกยกเลิกแล้ว · ลดหนี้ใบที่ยกเลิกไม่ได้";
    if (invoice.inv_status !== "issued") return "ลดหนี้ได้เฉพาะใบแจ้งหนี้ที่ออกแล้ว";
    const billingNote = await invoiceService.findActiveBillingNote(conn, invoice.inv_id);
    if (billingNote) {
        return (
            `ใบนี้อยู่ในใบวางบิล ${billingNote.bn_number ?? "(ร่าง)"} · ยกเลิกหรือลบใบวางบิลก่อน ` +
            "แล้วออกใบวางบิลใหม่ด้วยยอดหลังลดหนี้ (ลูกค้าจะได้ไม่ถือใบวางบิลยอดเก่า)"
        );
    }
    return null;
}

async function assertCreditable(conn, invoice) {
    const blocker = await findCreditBlocker(conn, invoice);
    if (blocker) throw new AppError(409, "INVOICE_NOT_CREDITABLE", blocker);
}

function totalsValues(calculation, invoice) {
    return {
        cn_original_total: toDecimalText(calculation.originalTotal),
        cn_subtotal: toDecimalText(calculation.base),
        cn_vat_rate: invoice.inv_vat_rate,
        cn_vat_amount: toDecimalText(calculation.vat),
        cn_total: toDecimalText(calculation.total),
        cn_base_thb: toDecimalText(calculation.baseThb),
        cn_total_thb: toDecimalText(calculation.totalThb),
        cn_wht_amount: toDecimalText(calculation.withholding),
        cn_outstanding_before: toDecimalText(calculation.outstandingBefore),
        cn_refund_required: toDecimalText(calculation.refundRequired),
    };
}

async function updateColumns(conn, creditNoteId, values, extraSql = "") {
    const columns = Object.keys(values);
    await conn.query(
        `UPDATE tb_credit_notes SET ${columns.map((column) => `${column} = ?`).join(", ")}${extraSql}
         WHERE cn_id = ?`,
        [...Object.values(values), creditNoteId],
    );
}

async function replaceLines(conn, creditNoteId, lines) {
    await conn.query("DELETE FROM tb_credit_note_lines WHERE cnl_credit_note_id = ?", [creditNoteId]);
    for (const [index, line] of lines.entries()) {
        await conn.query(
            "INSERT INTO tb_credit_note_lines (cnl_credit_note_id, cnl_order, cnl_description, cnl_amount) VALUES (?, ?, ?, ?)",
            [creditNoteId, index + 1, line.cnl_description, line.cnl_amount],
        );
    }
}

/**
 * เพิ่ม/ลดยอดรวมใบลดหนี้ของใบแจ้งหนี้ (sign = 1 ตอนออก · -1 ตอนยกเลิก) — เรียกหลังล็อกใบแจ้งหนี้แล้วเท่านั้น
 */
async function applyToInvoice(conn, creditNote, sign) {
    const signed = (column) => toDecimalText(parseHundredths(creditNote[column], column) * BigInt(sign));
    await conn.query(
        `UPDATE tb_invoices SET inv_credited_amount = inv_credited_amount + ?, inv_credited_base = inv_credited_base + ?,
                inv_credited_vat = inv_credited_vat + ?, inv_credited_base_thb = inv_credited_base_thb + ?,
                inv_credited_thb = inv_credited_thb + ?, inv_credited_wht = inv_credited_wht + ?,
                inv_version = inv_version + 1
         WHERE inv_id = ?`,
        [
            signed("cn_total"),
            signed("cn_subtotal"),
            signed("cn_vat_amount"),
            signed("cn_base_thb"),
            signed("cn_total_thb"),
            signed("cn_wht_amount"),
            creditNote.cn_invoice_id,
        ],
    );
}

// ─── ร่าง ────────────────────────────────────────────────────────────────────────────────────

/**
 * สร้างร่างจากใบแจ้งหนี้ที่ออกแล้ว — ลูกค้า/สาขา/สกุล/โปรเจกต์มาจากใบเดิม
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {object} input ผ่าน creditNoteDraftSchema แล้ว (ต้องมี cn_invoice_id)
 * @param {{ user_id: string }} actor
 */
async function createDraft(conn, input, actor) {
    if (!input.cn_invoice_id) throw validationError({ cn_invoice_id: "เลือกใบแจ้งหนี้ที่จะลดหนี้" });
    const invoice = await lockInvoice(conn, input.cn_invoice_id);
    await assertCreditable(conn, invoice);
    const calculation = await calculateFor(conn, invoice, input.lines);
    if (Object.keys(calculation.errors).length > 0) throw validationError(calculation.errors);

    const creator = await findUserLabel(conn, actor.user_id);
    const creditNoteId = await generateDailyId("tb_credit_notes", "cn_id", "CRN");
    const values = {
        cn_id: creditNoteId,
        cn_status: "draft",
        cn_version: 0,
        cn_invoice_id: invoice.inv_id,
        cn_client_id: invoice.inv_client_id,
        cn_branch_id: invoice.inv_branch_id,
        cn_project_id: invoice.inv_project_id,
        cn_currency: invoice.inv_currency,
        cn_language: invoice.inv_language,
        cn_reason_code: input.cn_reason_code,
        cn_reason: input.cn_reason,
        cn_notes: input.cn_notes,
        cn_internal_note: input.cn_internal_note,
        ...totalsValues(calculation, invoice),
        cn_created_by: actor.user_id,
        cn_created_by_name: creator.full_name,
    };
    const columns = Object.keys(values);
    await conn.query(
        `INSERT INTO tb_credit_notes (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
        Object.values(values),
    );
    await replaceLines(conn, creditNoteId, input.lines);
    return { cn_id: creditNoteId };
}

async function updateDraft(conn, creditNoteId, input) {
    const creditNote = await findForUpdate(conn, creditNoteId);
    if (creditNote.cn_status !== "draft") throw wrongStatus("แก้ได้เฉพาะร่าง");
    assertVersion(creditNote, input.cn_version);
    const invoice = await lockInvoice(conn, creditNote.cn_invoice_id);
    const calculation = await calculateFor(conn, invoice, input.lines);
    if (Object.keys(calculation.errors).length > 0) throw validationError(calculation.errors);

    await updateColumns(
        conn,
        creditNoteId,
        {
            cn_reason_code: input.cn_reason_code,
            cn_reason: input.cn_reason,
            cn_notes: input.cn_notes,
            cn_internal_note: input.cn_internal_note,
            ...totalsValues(calculation, invoice),
        },
        ", cn_version = cn_version + 1",
    );
    await replaceLines(conn, creditNoteId, input.lines);
    return { cn_id: creditNoteId };
}

async function deleteDraft(conn, creditNoteId, expectedVersion) {
    const creditNote = await findForUpdate(conn, creditNoteId);
    if (creditNote.cn_status !== "draft") throw wrongStatus('ลบได้เฉพาะร่าง · ใบที่ออกแล้วใช้ "ยกเลิก"');
    assertVersion(creditNote, expectedVersion);
    await conn.query("DELETE FROM tb_credit_notes WHERE cn_id = ?", [creditNoteId]);
}

// ─── อนุมัติ ──────────────────────────────────────────────────────────────────────────────────

async function readLines(conn, creditNoteId) {
    const [lines] = await conn.query(
        "SELECT * FROM tb_credit_note_lines WHERE cnl_credit_note_id = ? ORDER BY cnl_order, cnl_id",
        [creditNoteId],
    );
    return lines;
}

/** ตรวจครบ → คิดยอดใหม่จากยอดล่าสุดของใบเดิม → snapshot แผนอนุมัติตามยอดก่อน VAT เป็นบาท (กติกา CN) */
async function submitForApproval(conn, creditNoteId, expectedVersion) {
    const creditNote = await findForUpdate(conn, creditNoteId);
    if (creditNote.cn_status !== "draft") throw wrongStatus("ส่งขออนุมัติได้เฉพาะร่าง");
    assertVersion(creditNote, expectedVersion);
    const invoice = await lockInvoice(conn, creditNote.cn_invoice_id);
    await assertCreditable(conn, invoice);
    const calculation = await calculateFor(conn, invoice, await readLines(conn, creditNoteId));
    if (Object.keys(calculation.errors).length > 0) throw validationError(calculation.errors);

    const rules = await approvalRulesService.findApprovalRules(conn, DOCUMENT_TYPE);
    const plan = buildApprovalPlan(rules.levels, calculation.baseThb);
    if (plan.length === 0) {
        throw new AppError(
            409,
            "APPROVAL_RULES_MISSING",
            "ยังไม่ได้ตั้งกติกาอนุมัติใบลดหนี้ · ให้ผู้ดูแลตั้งที่ ตั้งค่าระบบ › ข้อมูลบริษัท › การอนุมัติ › ใบลดหนี้",
        );
    }

    await updateColumns(
        conn,
        creditNoteId,
        {
            ...totalsValues(calculation, invoice),
            cn_status: "pending_approval",
            cn_approval_current_level: plan[0].level,
            cn_approval_plan: JSON.stringify(plan),
            cn_returned_reason: null,
        },
        ", cn_approval_round = cn_approval_round + 1, cn_submitted_at = NOW(), cn_version = cn_version + 1",
    );
    return { cn_id: creditNoteId, approval_levels: plan.map((level) => level.level) };
}

async function approvalsThisRound(conn, creditNote) {
    const [rows] = await conn.query(
        `SELECT cna_level, cna_user_id FROM tb_credit_note_approvals
         WHERE cna_credit_note_id = ? AND cna_round = ? AND cna_action = 'approve'`,
        [creditNote.cn_id, creditNote.cn_approval_round],
    );
    return rows.map((row) => ({ level: row.cna_level, user_id: row.cna_user_id }));
}

function evaluateFor(creditNote, approvals, actor, allowSelfApproval) {
    return evaluateApproval({
        plan: quotationService.parseJson(creditNote.cn_approval_plan) ?? [],
        currentLevel: creditNote.cn_approval_current_level,
        approvalsThisRound: approvals,
        actor: {
            user_id: actor.user_id,
            role_id: actor.user_role_id,
            can_approve: hasBit(actor.role_permission, "approveInvoice"),
        },
        creatorId: creditNote.cn_created_by,
        allowSelfApproval,
        documentName: DOCUMENT_NAME,
    });
}

/**
 * ขั้นสุดท้าย: ล็อกใบเดิม → คิดยอดใหม่ ต้องเท่ากับที่ผู้อนุมัติเห็น → เลข CN · วันที่ · snapshot · เพิ่มยอดในใบเดิม
 */
async function finalizeIssue(conn, creditNote, actor) {
    const invoice = await lockInvoice(conn, creditNote.cn_invoice_id);
    await assertCreditable(conn, invoice);
    const calculation = await calculateFor(conn, invoice, await readLines(conn, creditNote.cn_id));
    if (Object.keys(calculation.errors).length > 0) {
        throw new AppError(
            409,
            "CREDIT_NOTE_EXCEEDS_INVOICE",
            `${Object.values(calculation.errors)[0]} · ยอดของใบเดิมเปลี่ยนตั้งแต่ส่งขออนุมัติ ตีกลับให้ผู้สร้างแก้ยอดใหม่`,
        );
    }
    const isSameTotal = toDecimalText(calculation.total) === toDecimalText(parseHundredths(creditNote.cn_total, "ยอด"));
    if (!isSameTotal) {
        throw new AppError(
            409,
            "CREDIT_NOTE_TOTAL_CHANGED",
            "ยอดรวมลดหนี้เปลี่ยนจากตอนส่งขออนุมัติ (มีใบลดหนี้อื่นของใบเดิมออกไปก่อน) · ตีกลับให้ผู้สร้างบันทึกใหม่เพื่อดูยอดล่าสุด",
        );
    }

    const today = todayBangkok();
    const documentNumber = await issueDocumentNumber(conn, DOCUMENT_TYPE, today);
    const [[client]] = await conn.query(
        `SELECT client_id, client_name, client_company, client_contact_name, client_email, client_phone, client_type, client_country,
                client_tax_id, client_branch_code, client_address
         FROM tb_clients WHERE client_id = ?`,
        [creditNote.cn_client_id],
    );
    const company = await companyService.findCompany(conn);
    const { cs_updated_at: _updatedAt, ...companySnapshot } = company;
    const [[branch]] = await conn.query(
        `SELECT branch_id, branch_code, branch_name_th, branch_name_en, branch_address_th, branch_address_en, branch_phone
         FROM tb_branches WHERE branch_id = ?`,
        [creditNote.cn_branch_id],
    );
    const issuer = await findUserLabel(conn, actor.user_id);
    const issuerSignature = await signatureService.findActiveSignature(conn, actor.user_id);

    const issuedValues = {
        ...totalsValues(calculation, invoice),
        cn_status: "issued",
        cn_number: documentNumber,
        cn_issue_date: today,
        cn_client_snapshot: JSON.stringify(client),
        cn_company_snapshot: JSON.stringify({ ...companySnapshot, branch }),
        cn_approval_current_level: null,
        cn_issued_by: actor.user_id,
        cn_issued_by_name: issuer.full_name,
        cn_issued_by_title: issuer.role_name,
        cn_issuer_signature_id: issuerSignature?.sig_id ?? null,
    };
    await updateColumns(conn, creditNote.cn_id, issuedValues, ", cn_issued_at = NOW(), cn_version = cn_version + 1");
    await applyToInvoice(conn, { ...creditNote, ...issuedValues }, 1);
    return { cn_number: documentNumber, cn_issue_date: today, cn_refund_required: issuedValues.cn_refund_required };
}

/** อนุมัติชั้นปัจจุบัน และชั้นถัดไปต่อเนื่องที่ผู้กดมีสิทธิ์ · ครบชั้นสุดท้าย = ออกใบ (ผู้อนุมัติเป็นผู้ออก) */
async function approve(conn, creditNoteId, expectedVersion, actor) {
    const creditNote = await findForUpdate(conn, creditNoteId);
    if (creditNote.cn_status !== "pending_approval") throw wrongStatus("ใบนี้ไม่ได้รออนุมัติแล้ว");
    assertVersion(creditNote, expectedVersion);

    const company = await companyService.findCompany(conn);
    const evaluation = evaluateFor(
        creditNote,
        await approvalsThisRound(conn, creditNote),
        actor,
        company.cs_allow_self_approval,
    );
    if (!evaluation.canApprove) throw new AppError(403, "APPROVAL_NOT_ALLOWED", evaluation.reason);

    const approver = await findUserLabel(conn, actor.user_id);
    for (const level of evaluation.levels) {
        await conn.query(
            `INSERT INTO tb_credit_note_approvals
                (cna_credit_note_id, cna_round, cna_level, cna_action, cna_user_id, cna_user_name, cna_role_id, cna_role_name)
             VALUES (?, ?, ?, 'approve', ?, ?, ?, ?)`,
            [
                creditNoteId,
                creditNote.cn_approval_round,
                level,
                actor.user_id,
                approver.full_name,
                approver.user_role_id,
                approver.role_name,
            ],
        );
    }

    if (evaluation.isFinal) {
        const issued = await finalizeIssue(conn, creditNote, actor);
        return { cn_id: creditNoteId, approved_levels: evaluation.levels, is_final: true, ...issued };
    }
    await updateColumns(
        conn,
        creditNoteId,
        { cn_approval_current_level: evaluation.nextLevel.level },
        ", cn_version = cn_version + 1",
    );
    return {
        cn_id: creditNoteId,
        approved_levels: evaluation.levels,
        is_final: false,
        next_level: evaluation.nextLevel.level,
    };
}

function isInCurrentLevel(creditNote, actor) {
    const plan = quotationService.parseJson(creditNote.cn_approval_plan) ?? [];
    const currentLevel = plan.find((level) => level.level === creditNote.cn_approval_current_level);
    return Boolean(currentLevel?.roles.some((role) => role.role_id === actor.user_role_id));
}

/** ตีกลับ = กลับเป็นร่าง รอบหน้าเริ่มชั้น 1 ใหม่ · ทำได้โดยผู้มีสิทธิ์อนุมัติที่ role อยู่ในชั้นที่รออยู่ */
async function returnToDraft(conn, creditNoteId, reason, expectedVersion, actor) {
    const creditNote = await findForUpdate(conn, creditNoteId);
    if (creditNote.cn_status !== "pending_approval") throw wrongStatus("ใบนี้ไม่ได้รออนุมัติแล้ว");
    assertVersion(creditNote, expectedVersion);
    if (!hasBit(actor.role_permission, "approveInvoice") || !isInCurrentLevel(creditNote, actor)) {
        throw new AppError(403, "RETURN_NOT_ALLOWED", "ตีกลับได้เฉพาะผู้อนุมัติของชั้นที่รออยู่");
    }

    const user = await findUserLabel(conn, actor.user_id);
    await conn.query(
        `INSERT INTO tb_credit_note_approvals
            (cna_credit_note_id, cna_round, cna_level, cna_action, cna_user_id, cna_user_name, cna_role_id, cna_role_name, cna_reason)
         VALUES (?, ?, ?, 'return', ?, ?, ?, ?, ?)`,
        [
            creditNoteId,
            creditNote.cn_approval_round,
            creditNote.cn_approval_current_level,
            actor.user_id,
            user.full_name,
            user.user_role_id,
            user.role_name,
            reason,
        ],
    );
    await updateColumns(
        conn,
        creditNoteId,
        { cn_status: "draft", cn_approval_current_level: null, cn_returned_reason: reason },
        ", cn_version = cn_version + 1",
    );
    return { cn_id: creditNoteId };
}

// ─── หลังออก: ยกเลิก / คืนเงิน ─────────────────────────────────────────────────────────────────

/** ยกเลิกใบที่ออกแล้ว — เลขยังอยู่ · ยอดค้างของใบเดิมกลับมา · คืนเงินแล้วต้องยกเลิกการคืนเงินก่อน (R-N8) */
async function cancel(conn, creditNoteId, reason, expectedVersion, actor) {
    const creditNote = await findForUpdate(conn, creditNoteId);
    if (creditNote.cn_status === "draft") throw wrongStatus('ร่างใช้ "ลบ" แทนการยกเลิก');
    if (creditNote.cn_status === "pending_approval") {
        throw wrongStatus("ใบที่รออนุมัติยกเลิกไม่ได้ · ให้ผู้อนุมัติตีกลับ แล้วลบร่าง");
    }
    if (creditNote.cn_status !== "issued") throw wrongStatus("ใบนี้ถูกยกเลิกไปแล้ว");
    assertVersion(creditNote, expectedVersion);
    if (creditNote.cn_refunded_at) {
        throw new AppError(
            409,
            "CREDIT_NOTE_REFUNDED",
            "ใบนี้บันทึกคืนเงินลูกค้าแล้ว · ยกเลิกการคืนเงินก่อน (ถ้าโอนไปจริงแล้ว ต้องตกลงกับลูกค้าให้โอนกลับก่อน) แล้วค่อยยกเลิกใบนี้",
        );
    }

    await lockInvoice(conn, creditNote.cn_invoice_id);
    await applyToInvoice(conn, creditNote, -1);
    await updateColumns(
        conn,
        creditNoteId,
        { cn_status: "cancelled", cn_cancelled_by: actor.user_id, cn_cancel_reason: reason },
        ", cn_cancelled_at = NOW(), cn_version = cn_version + 1",
    );
    return { cn_id: creditNoteId };
}

/**
 * บันทึกคืนเงินลูกค้า (N1-ก): โอนคืน + หัก ณ ที่จ่ายที่ไม่ต้องคืน = ส่วนที่ลูกค้าจ่ายเกิน ณ ตอนออกใบ
 * วันที่คืน: ไม่ใช่อนาคต · ไม่ก่อนวันที่ออกใบลดหนี้ · ย้อนได้ไม่เกิน 30 วัน (แบบวันที่รับเงิน)
 */
async function recordRefund(conn, creditNoteId, input, actor) {
    const creditNote = await findForUpdate(conn, creditNoteId);
    if (creditNote.cn_status !== "issued") throw wrongStatus("บันทึกคืนเงินได้เฉพาะใบลดหนี้ที่ออกแล้ว");
    assertVersion(creditNote, input.cn_version);
    const required = parseHundredths(creditNote.cn_refund_required, "ยอดที่ต้องคืน");
    if (required <= 0n) throw wrongStatus("ใบนี้ไม่มียอดที่ต้องคืนเงินลูกค้า");
    if (creditNote.cn_refunded_at) throw wrongStatus("ใบนี้บันทึกคืนเงินไปแล้ว");
    await lockInvoice(conn, creditNote.cn_invoice_id);

    const currency = await quotationService.findCurrency(conn, creditNote.cn_currency);
    const fields = checkRefund({
        required,
        amount: parseHundredths(input.cn_refund_amount, "ยอดโอนคืน"),
        withholding: parseHundredths(input.cn_refund_wht, "หัก ณ ที่จ่าย"),
        currencyDecimals: currency.cur_decimals,
    });

    const today = todayBangkok();
    if (input.cn_refund_date > today) fields.cn_refund_date = "วันที่คืนเงินต้องไม่เป็นวันในอนาคต";
    else if (input.cn_refund_date < creditNote.cn_issue_date)
        fields.cn_refund_date = `ต้องไม่ก่อนวันที่ออกใบลดหนี้ (${creditNote.cn_issue_date})`;
    else if (input.cn_refund_date < shiftDate(today, -MAX_REFUND_BACKDATE_DAYS))
        fields.cn_refund_date = `ย้อนหลังได้ไม่เกิน ${MAX_REFUND_BACKDATE_DAYS} วัน`;

    const [[account]] = await conn.query("SELECT ba_currency, ba_status FROM tb_bank_accounts WHERE ba_id = ?", [
        input.cn_refund_bank_account_id,
    ]);
    if (!account) fields.cn_refund_bank_account_id = "ไม่พบบัญชีนี้";
    else if (account.ba_status !== "active") fields.cn_refund_bank_account_id = "บัญชีนี้ถูกปิดใช้งานแล้ว";
    else if (account.ba_currency !== creditNote.cn_currency)
        fields.cn_refund_bank_account_id = `บัญชีนี้เป็นสกุล ${account.ba_currency} · เลือกบัญชีสกุล ${creditNote.cn_currency}`;
    if (Object.keys(fields).length > 0) throw validationError(fields);

    await updateColumns(
        conn,
        creditNoteId,
        {
            cn_refund_date: input.cn_refund_date,
            cn_refund_bank_account_id: input.cn_refund_bank_account_id,
            cn_refund_amount: input.cn_refund_amount,
            cn_refund_wht: input.cn_refund_wht,
            cn_refund_reference: input.cn_refund_reference,
            cn_refund_note: input.cn_refund_note,
            cn_refunded_by: actor.user_id,
        },
        ", cn_refunded_at = NOW(), cn_version = cn_version + 1",
    );
    await conn.query(
        "UPDATE tb_invoices SET inv_refunded_amount = inv_refunded_amount + ?, inv_version = inv_version + 1 WHERE inv_id = ?",
        [creditNote.cn_refund_required, creditNote.cn_invoice_id],
    );
    return { cn_id: creditNoteId };
}

/** ยกเลิกการคืนเงิน (บันทึกผิด) — ใบลดหนี้กลับเป็น "รอคืนเงิน" */
async function cancelRefund(conn, creditNoteId, expectedVersion) {
    const creditNote = await findForUpdate(conn, creditNoteId);
    if (creditNote.cn_status !== "issued" || !creditNote.cn_refunded_at) {
        throw wrongStatus("ใบนี้ยังไม่ได้บันทึกคืนเงิน");
    }
    assertVersion(creditNote, expectedVersion);
    await lockInvoice(conn, creditNote.cn_invoice_id);
    await updateColumns(
        conn,
        creditNoteId,
        {
            cn_refund_date: null,
            cn_refund_bank_account_id: null,
            cn_refund_amount: "0.00",
            cn_refund_wht: "0.00",
            cn_refund_reference: null,
            cn_refund_note: null,
            cn_refunded_by: null,
            cn_refunded_at: null,
        },
        ", cn_version = cn_version + 1",
    );
    await conn.query(
        "UPDATE tb_invoices SET inv_refunded_amount = inv_refunded_amount - ?, inv_version = inv_version + 1 WHERE inv_id = ?",
        [creditNote.cn_refund_required, creditNote.cn_invoice_id],
    );
    return { cn_id: creditNoteId };
}

// ─── อ่าน ────────────────────────────────────────────────────────────────────────────────────

/** ใบลดหนี้ที่ออกแล้วต้องคืนเงิน และยังไม่บันทึกคืน */
const REFUND_DUE_SQL = "cn.cn_status = 'issued' AND cn.cn_refund_required > 0 AND cn.cn_refunded_at IS NULL";

const LIST_TABS = {
    all: "1 = 1",
    draft: "cn.cn_status = 'draft'",
    pending_approval: "cn.cn_status = 'pending_approval'",
    waiting_me: "cn.cn_status = 'pending_approval'",
    refund_due: REFUND_DUE_SQL,
    issued: "cn.cn_status = 'issued'",
    cancelled: "cn.cn_status = 'cancelled'",
};

/**
 * @param {import("mysql2/promise").Pool} conn
 * @param {{ tab?: string, search?: string, invoiceId?: string, limit?: number, offset?: number }} options
 * @param {{ user_id: string, user_role_id: string | null, role_permission: string }} actor
 */
async function listCreditNotes(conn, { tab = "all", search = "", invoiceId, limit = 20, offset = 0 }, actor) {
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), MAX_LIST_LIMIT);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const conditions = [LIST_TABS[tab] ?? LIST_TABS.all];
    const params = [];
    if (search) {
        const like = `%${search}%`;
        conditions.push(
            "(cn.cn_number LIKE ? OR i.inv_number LIKE ? OR c.client_name LIKE ? OR c.client_company LIKE ?)",
        );
        params.push(like, like, like, like);
    }
    if (invoiceId) {
        conditions.push("cn.cn_invoice_id = ?");
        params.push(invoiceId);
    }

    const [rows] = await conn.query(
        `SELECT cn.cn_id, cn.cn_number, cn.cn_status, cn.cn_currency, cn.cn_total, cn.cn_reason_code, cn.cn_reason,
                cn.cn_refund_required, cn.cn_refunded_at IS NOT NULL AS is_refunded, cn.cn_created_by, cn.cn_created_by_name,
                cn.cn_approval_current_level, cn.cn_approval_plan, cn.cn_approval_round, cn.cn_updated_at, ${DATE_COLUMNS},
                cn.cn_invoice_id, i.inv_number, cn.cn_client_id, c.client_name, c.client_company
         FROM tb_credit_notes cn
         JOIN tb_invoices i ON i.inv_id = cn.cn_invoice_id
         JOIN tb_clients c ON c.client_id = cn.cn_client_id
         WHERE ${conditions.join(" AND ")}
         ORDER BY cn.cn_updated_at DESC, cn.cn_id DESC`,
        params,
    );

    const company = await companyService.findCompany(conn);
    const pending = rows.filter((row) => row.cn_status === "pending_approval");
    const approvalsById = new Map();
    for (const row of pending) approvalsById.set(row.cn_id, await approvalsThisRound(conn, row));
    const withFlags = rows.map((row) => {
        const waitingForMe =
            row.cn_status === "pending_approval" &&
            evaluateFor(row, approvalsById.get(row.cn_id) ?? [], actor, company.cs_allow_self_approval).canApprove;
        const plan = quotationService.parseJson(row.cn_approval_plan) ?? [];
        const { cn_approval_plan: _plan, ...rest } = row;
        const isRefunded = Boolean(row.is_refunded);
        return {
            ...rest,
            is_refunded: isRefunded,
            is_refund_due:
                row.cn_status === "issued" && parseHundredths(row.cn_refund_required, "ยอดคืน") > 0n && !isRefunded,
            waiting_for_me: waitingForMe,
            approval_level_count: plan.length,
        };
    });
    const filtered = tab === "waiting_me" ? withFlags.filter((row) => row.waiting_for_me) : withFlags;
    return { data: filtered.slice(safeOffset, safeOffset + safeLimit), total: filtered.length };
}

/**
 * ใบลดหนี้พร้อมทุกอย่างที่หน้าเอกสาร/หน้าพิมพ์ต้องใช้
 * @param {import("mysql2/promise").Pool} conn
 * @param {string} creditNoteId
 * @param {{ user_id: string, user_role_id: string | null, role_permission: string }} actor
 */
async function getCreditNoteDetail(conn, creditNoteId, actor) {
    const [[creditNote]] = await conn.query(
        `SELECT cn.*, ${DATE_COLUMNS}, c.client_name, c.client_company, b.branch_code, b.branch_name_th, p.project_name,
                ba.ba_bank_name AS refund_bank_name, ba.ba_account_no AS refund_account_no,
                CONCAT(ru.user_fname, ' ', ru.user_lname) AS refunded_by_name,
                CONCAT(cu.user_fname, ' ', cu.user_lname) AS cancelled_by_name
         FROM tb_credit_notes cn
         JOIN tb_clients c ON c.client_id = cn.cn_client_id
         JOIN tb_branches b ON b.branch_id = cn.cn_branch_id
         LEFT JOIN tb_projects p ON p.project_id = cn.cn_project_id
         LEFT JOIN tb_bank_accounts ba ON ba.ba_id = cn.cn_refund_bank_account_id
         LEFT JOIN tb_users ru ON ru.user_id = cn.cn_refunded_by
         LEFT JOIN tb_users cu ON cu.user_id = cn.cn_cancelled_by
         WHERE cn.cn_id = ?`,
        [creditNoteId],
    );
    if (!creditNote) throw notFound();

    const lines = await readLines(conn, creditNoteId);
    const [approvalHistory] = await conn.query(
        "SELECT * FROM tb_credit_note_approvals WHERE cna_credit_note_id = ? ORDER BY cna_id",
        [creditNoteId],
    );
    const [[invoice]] = await conn.query(
        `SELECT i.*, DATE_FORMAT(i.inv_issue_date, '%Y-%m-%d') AS inv_issue_date,
                DATE_FORMAT(i.inv_due_date, '%Y-%m-%d') AS inv_due_date
         FROM tb_invoices i WHERE i.inv_id = ?`,
        [creditNote.cn_invoice_id],
    );
    const currency = await quotationService.findCurrency(conn, creditNote.cn_currency);
    const company = await companyService.findCompany(conn);

    const approvals = approvalHistory
        .filter((row) => row.cna_round === creditNote.cn_approval_round && row.cna_action === "approve")
        .map((row) => ({ level: row.cna_level, user_id: row.cna_user_id }));
    const approval =
        creditNote.cn_status === "pending_approval"
            ? evaluateFor(creditNote, approvals, actor, company.cs_allow_self_approval)
            : null;
    // ร่าง/รออนุมัติ: ยอดล่าสุดของใบเดิม (อาจเปลี่ยนตั้งแต่บันทึก) · ออกแล้ว: ใช้ค่าที่บันทึก ณ ตอนออก
    const isOpen = creditNote.cn_status === "draft" || creditNote.cn_status === "pending_approval";
    const blocker = isOpen ? await findCreditBlocker(conn, invoice) : null;
    const balance = invoiceBalance({
        total: parseHundredths(invoice.inv_total, "ยอดรวม"),
        credited: parseHundredths(invoice.inv_credited_amount, "ลดหนี้แล้ว"),
        paid: parseHundredths(invoice.inv_paid_amount, "ยอดรับแล้ว"),
        refunded: parseHundredths(invoice.inv_refunded_amount, "คืนเงินแล้ว"),
    });

    return {
        credit_note: {
            ...creditNote,
            cn_approval_plan: quotationService.parseJson(creditNote.cn_approval_plan) ?? [],
            cn_client_snapshot: quotationService.parseJson(creditNote.cn_client_snapshot),
            cn_company_snapshot: quotationService.parseJson(creditNote.cn_company_snapshot),
            reason_label: CREDIT_NOTE_REASONS[creditNote.cn_reason_code] ?? creditNote.cn_reason_code,
            is_refunded: Boolean(creditNote.cn_refunded_at),
            is_refund_due:
                creditNote.cn_status === "issued" &&
                parseHundredths(creditNote.cn_refund_required, "ยอดคืน") > 0n &&
                !creditNote.cn_refunded_at,
        },
        lines,
        invoice: {
            inv_id: invoice.inv_id,
            inv_number: invoice.inv_number,
            inv_status: invoice.inv_status,
            inv_title: invoice.inv_title,
            inv_issue_date: invoice.inv_issue_date,
            inv_due_date: invoice.inv_due_date,
            inv_total: invoice.inv_total,
            inv_after_discount: invoice.inv_after_discount,
            inv_vat_amount: invoice.inv_vat_amount,
            inv_vat_rate: invoice.inv_vat_rate,
            inv_wht_amount: invoice.inv_wht_amount,
            inv_paid_amount: invoice.inv_paid_amount,
            inv_credited_amount: invoice.inv_credited_amount,
            inv_credited_base: invoice.inv_credited_base,
            inv_refunded_amount: invoice.inv_refunded_amount,
            outstanding_amount: toDecimalText(balance.outstanding),
            refund_due_amount: toDecimalText(balance.refundDue),
        },
        currency,
        approval_history: approvalHistory,
        approval,
        credit_blocked_reason: blocker,
        actions: buildActions(creditNote, actor, approval),
    };
}

/** ปุ่มที่ผู้ใช้คนนี้กดได้ตอนนี้ + เหตุผลถ้ากดไม่ได้ (หน้าเว็บแสดงในแถบสถานะ — ห้าม tooltip) */
function buildActions(creditNote, actor, approval) {
    const canCreate = hasBit(actor.role_permission, "createInvoice");
    const canCancelPermission = hasBit(actor.role_permission, "cancelInvoice");
    const canRefundPermission = hasBit(actor.role_permission, "refundCustomer");
    const status = creditNote.cn_status;
    const isRefunded = Boolean(creditNote.cn_refunded_at);
    const needsRefund = parseHundredths(creditNote.cn_refund_required, "ยอดคืน") > 0n;

    let cancelBlockedReason = null;
    if (status === "issued" && isRefunded) {
        cancelBlockedReason = "ใบนี้บันทึกคืนเงินลูกค้าแล้ว · ยกเลิกการคืนเงินก่อน แล้วค่อยยกเลิกใบนี้";
    }
    return {
        can_edit: canCreate && status === "draft",
        can_delete: canCreate && status === "draft",
        can_submit: canCreate && status === "draft",
        can_approve: Boolean(approval?.canApprove),
        can_return:
            status === "pending_approval" &&
            hasBit(actor.role_permission, "approveInvoice") &&
            isInCurrentLevel(creditNote, actor),
        can_cancel: canCancelPermission && status === "issued" && cancelBlockedReason === null,
        cancel_blocked_reason: canCancelPermission ? cancelBlockedReason : null,
        can_refund: canRefundPermission && status === "issued" && needsRefund && !isRefunded,
        can_cancel_refund: canRefundPermission && status === "issued" && isRefunded,
    };
}

module.exports = {
    createDraft,
    updateDraft,
    deleteDraft,
    submitForApproval,
    approve,
    returnToDraft,
    cancel,
    recordRefund,
    cancelRefund,
    listCreditNotes,
    getCreditNoteDetail,
    findCreditBlocker,
};
