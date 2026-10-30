// ใบแจ้งหนี้: การเปลี่ยนสถานะ (2026-10-14 ขั้น 1B-2 — docs/plans/2026-10-14-invoices-1b.md หัวข้อ 4)
//
// ทุกฟังก์ชันรับ conn ที่อยู่ใน transaction และล็อกแถวใบด้วย SELECT ... FOR UPDATE ก่อนตรวจสถานะ (กดซ้ำ/กดพร้อมกัน
// คนที่สองได้ 409 ไม่ทำซ้ำ) · ผิดสถานะตอบ 409 · ไม่มีสิทธิ์ตอบ 403 · ข้อความบอกเหตุผลและสิ่งที่ต้องทำต่อ
//
// ลำดับล็อก: ใบแจ้งหนี้ → ใบเสนอราคา เสมอ (ร่างใหม่ล็อกแค่ใบเสนอราคา) — ไม่มีทางล็อกไขว้กันจน deadlock
const { AppError } = require("../utils/app-error");
const { todayBangkok } = require("../utils/bangkok-time");
const { issueDocumentNumber } = require("../utils/document-number");
const { hasBit } = require("../utils/permissions");
const { buildApprovalPlan } = require("../shared/approval-flow.mjs");
const { convertToBaht, formatAmount, parseHundredths } = require("../shared/money.mjs");
const { toDecimalText } = require("../shared/quotation-totals.mjs");
const { BASE_CURRENCY } = require("../shared/schemas/quotation.mjs");
const invoiceService = require("./invoice.service");
const quotationService = require("./quotation.service");
const companyService = require("./company.service");
const approvalRulesService = require("./approval-rules.service");
const signatureService = require("./signature.service");
const exchangeRateService = require("./exchange-rate.service");

const DOCUMENT_TYPE = "IV";
// ใบเพิ่มหนี้ (ขั้น N-2) ได้เลขชุดของตัวเอง แต่ใช้กติกาอนุมัติเดียวกับใบแจ้งหนี้สร้างเอง (IV)
const DEBIT_NOTE_NUMBER_TYPE = "DN";

async function findUserLabel(conn, userId) {
    const [[user]] = await conn.query(
        `SELECT CONCAT(u.user_fname, ' ', u.user_lname) AS full_name, u.user_role_id, r.role_name
         FROM tb_users u LEFT JOIN tb_roles r ON r.role_id = u.user_role_id
         WHERE u.user_id = ?`,
        [userId],
    );
    return user ?? { full_name: "(ผู้ใช้ถูกลบ)", user_role_id: null, role_name: null };
}

// ─── อัตราแลกเปลี่ยน ณ วันออก ──────────────────────────────────────────────────────────────────

/**
 * อัตราของวันที่ออกใบ — เรียกนอก transaction (อาจรอ ธปท. ถึง 5 วินาที ไม่ควรถือล็อกไว้)
 * ใช้คิดยอดบาทภายในเท่านั้น (ยอดในสกุลของใบไม่เปลี่ยน) · ดึงไม่ได้ = ใช้อัตราของร่างเป็น "กรอกเอง" พร้อมเหตุผล
 * @param {import("mysql2/promise").Pool} pool
 * @param {string} invoiceId
 */
async function prepareIssueRate(pool, invoiceId) {
    const [[invoice]] = await pool.query(
        `SELECT inv_currency, inv_exchange_rate, inv_rate_source, DATE_FORMAT(inv_rate_date, '%Y-%m-%d') AS inv_rate_date,
                inv_rate_override_reason
         FROM tb_invoices WHERE inv_id = ?`,
        [invoiceId],
    );
    if (!invoice) return null;
    if (invoice.inv_currency === BASE_CURRENCY) return { rate: "1", source: null, date: null, bot: null, reason: null };

    const result = await exchangeRateService.findDocumentRate(pool, {
        currencyCode: invoice.inv_currency,
        requestedDate: todayBangkok(),
    });
    if (result.available) {
        return { rate: result.rate, source: "bot", date: result.rate_date, bot: result.rate, reason: null };
    }
    return {
        rate: invoice.inv_exchange_rate,
        source: "manual",
        date: invoice.inv_rate_date,
        bot: null,
        reason:
            invoice.inv_rate_override_reason ??
            `ใช้อัตราของร่าง เพราะดึงอัตรา ธปท. วันที่ออกไม่ได้ (${result.error?.message ?? "ไม่มีข้อมูล"})`,
    };
}

// ─── ตรวจก่อนออก ───────────────────────────────────────────────────────────────────────────────

/**
 * ลูกค้า/สาขา/สกุลเงิน/บัญชีรับเงิน ต้องยังเปิดใช้งาน ณ ตอนออก (R-B6)
 * @returns {Promise<string[]>} ปัญหาที่พบ (ว่าง = ผ่าน)
 */
async function findIssueProblems(conn, invoice) {
    const problems = [];
    const [[client]] = await conn.query("SELECT client_status FROM tb_clients WHERE client_id = ?", [
        invoice.inv_client_id,
    ]);
    if (client?.client_status !== "active") problems.push("ลูกค้าถูกปิดใช้งาน · เปิดใช้งานลูกค้าก่อน");
    const [[branch]] = await conn.query("SELECT branch_status FROM tb_branches WHERE branch_id = ?", [
        invoice.inv_branch_id,
    ]);
    if (branch?.branch_status !== "active") problems.push("สาขาถูกปิดใช้งาน · เลือกสาขาอื่นในร่าง");
    const currency = await quotationService.findCurrency(conn, invoice.inv_currency);
    if (currency?.cur_status !== "active") problems.push(`สกุลเงิน ${invoice.inv_currency} ถูกปิดใช้งาน`);
    if (invoice.inv_bank_account_id) {
        const [[account]] = await conn.query("SELECT ba_status FROM tb_bank_accounts WHERE ba_id = ?", [
            invoice.inv_bank_account_id,
        ]);
        if (account?.ba_status !== "active") problems.push("บัญชีรับเงินที่เลือกถูกปิดใช้งาน · เลือกบัญชีอื่นในร่าง");
    }
    return problems;
}

function notReady(problems, verb) {
    return new AppError(400, "INVOICE_NOT_READY", `ยัง${verb}ไม่ได้: ${problems.join(" · ")}`, {
        _form: problems.join("\n"),
    });
}

// ─── ออกใบ (ได้เลข/วันที่/ครบกำหนด) ────────────────────────────────────────────────────────────

/**
 * ขั้นสุดท้ายของการออก: เลข IV (ใบเพิ่มหนี้ = DN + บันทึกมูลค่าเดิม) · วันที่ = วันนี้ (ย้อนไม่ได้) · ครบกำหนด · อัตรา ณ วันออก · snapshot ลูกค้า/บริษัท/บัญชี · ผู้ออก
 * @param {object} invoice แถวที่ล็อกแล้ว (ยอดสกุลของใบถูกต้องแล้ว)
 * @param {{ rate: string, source: string | null, date: string | null, bot: string | null, reason: string | null }} freshRate
 * @param {{ user_id: string }} issuer ผู้กดออก (ใบสร้างเอง = ผู้อนุมัติชั้นสุดท้าย)
 */
async function finalizeIssue(conn, invoice, freshRate, issuer) {
    const today = todayBangkok();
    const isDebitNote = invoice.inv_doc_type === "debit_note";
    // ใบเพิ่มหนี้: ล็อกใบเดิม (ลำดับล็อก ใบเพิ่มหนี้ → ใบเดิม) ตรวจว่ายังออกอยู่ แล้วบันทึกมูลค่าเดิม ณ ตอนนี้ไว้พิมพ์ (มาตรา 86/9)
    let originalTotal = null;
    if (isDebitNote) {
        await invoiceService.findDebitReference(conn, invoice.inv_reference_invoice_id, { forUpdate: true });
        originalTotal = await invoiceService.debitOriginalTotal(conn, invoice.inv_reference_invoice_id, invoice.inv_id);
    }
    const documentNumber = await issueDocumentNumber(conn, isDebitNote ? DEBIT_NOTE_NUMBER_TYPE : DOCUMENT_TYPE, today);
    const dueDate = exchangeRateService.shiftDate(today, invoice.inv_credit_days);

    const [[client]] = await conn.query(
        `SELECT client_id, client_name, client_company, client_contact_name, client_email, client_phone, client_type, client_country,
                client_tax_id, client_branch_code, client_address
         FROM tb_clients WHERE client_id = ?`,
        [invoice.inv_client_id],
    );
    const company = await companyService.findCompany(conn);
    const { cs_updated_at: _updatedAt, ...companySnapshot } = company;
    const [[branch]] = await conn.query(
        `SELECT branch_id, branch_code, branch_name_th, branch_name_en, branch_address_th, branch_address_en, branch_phone
         FROM tb_branches WHERE branch_id = ?`,
        [invoice.inv_branch_id],
    );
    const [[bankAccount]] = invoice.inv_bank_account_id
        ? await conn.query(
              `SELECT ba_id, ba_bank_name, ba_account_name, ba_account_no, ba_bank_branch, ba_swift_code, ba_currency
               FROM tb_bank_accounts WHERE ba_id = ?`,
              [invoice.inv_bank_account_id],
          )
        : [[null]];
    const issuerLabel = await findUserLabel(conn, issuer.user_id);
    const issuerSignature = await signatureService.findActiveSignature(conn, issuer.user_id);

    // ยอดบาทภายในคิดใหม่ด้วยอัตราของวันออก (ยอดในสกุลของใบไม่เปลี่ยน)
    const afterDiscountThb = convertToBaht(parseHundredths(invoice.inv_after_discount, "ยอดก่อน VAT"), freshRate.rate);
    const totalThb = convertToBaht(parseHundredths(invoice.inv_total, "ยอดรวม"), freshRate.rate);

    await conn.query(
        `UPDATE tb_invoices SET inv_status = 'issued', inv_number = ?, inv_issue_date = ?, inv_due_date = ?,
                inv_exchange_rate = ?, inv_rate_source = ?, inv_rate_date = ?, inv_rate_bot = ?, inv_rate_override_reason = ?,
                inv_after_discount_thb = ?, inv_total_thb = ?,
                inv_client_snapshot = ?, inv_company_snapshot = ?, inv_bank_snapshot = ?, inv_approval_current_level = NULL,
                inv_issued_by = ?, inv_issued_by_name = ?, inv_issued_by_title = ?, inv_issuer_signature_id = ?,
                inv_original_total = ?, inv_issued_at = NOW(), inv_version = inv_version + 1
         WHERE inv_id = ?`,
        [
            documentNumber,
            today,
            dueDate,
            freshRate.rate,
            freshRate.source,
            freshRate.date,
            freshRate.bot,
            freshRate.source === "manual" ? freshRate.reason : null,
            toDecimalText(afterDiscountThb),
            toDecimalText(totalThb),
            JSON.stringify(client),
            JSON.stringify({ ...companySnapshot, branch }),
            JSON.stringify({ bank_account: bankAccount ?? null, promptpay_id: company.cs_promptpay_id }),
            issuer.user_id,
            issuerLabel.full_name,
            issuerLabel.role_name,
            issuerSignature?.sig_id ?? null,
            originalTotal === null ? null : toDecimalText(originalTotal),
            invoice.inv_id,
        ],
    );
    return { inv_number: documentNumber, inv_issue_date: today, inv_due_date: dueDate };
}

/**
 * ออกใบจากงวดของใบเสนอราคา (ไม่ต้องอนุมัติ — I1)
 * - งวดต้องยังไม่ถูกเรียกเก็บในใบอื่น (ตรวจซ้ำหลังล็อกใบเสนอราคา R-B1) · ผลรวมทุกใบไม่เกินใบเสนอราคา (R-B3)
 * - VAT คิดด้วยวันนี้ · ต่างจากใบเสนอราคา = ต้องส่ง confirm_vat_change มายืนยัน (R-B4)
 */
async function issue(conn, invoiceId, { inv_version: expectedVersion, confirm_vat_change: confirmVatChange }, freshRate, actor) {
    const invoice = await invoiceService.findForUpdate(conn, invoiceId);
    if (invoice.inv_status !== "draft") throw invoiceService.wrongStatus("ออกได้เฉพาะใบที่เป็นร่าง");
    invoiceService.assertVersion(invoice, expectedVersion);
    if (invoice.inv_source !== "quotation") {
        throw invoiceService.wrongStatus('ใบที่สร้างเองต้อง "ส่งขออนุมัติ"อนุมัติครบแล้วระบบออกให้อัตโนมัติ');
    }

    const quotation = await invoiceService.lockBillableQuotation(conn, invoice.inv_quotation_id);
    const [links] = await conn.query("SELECT ivm_milestone_id FROM tb_invoice_milestones WHERE ivm_invoice_id = ?", [
        invoiceId,
    ]);
    const milestoneIds = links.map((link) => Number(link.ivm_milestone_id));
    const milestones = await invoiceService.assertMilestonesAvailable(conn, quotation.qt_id, milestoneIds, invoiceId);

    const problems = await findIssueProblems(conn, invoice);
    if (problems.length > 0) throw notReady(problems, "ออกใบแจ้งหนี้");

    const currency = await quotationService.findCurrency(conn, invoice.inv_currency);
    const vatRate = await quotationService.vatRateFor(conn, todayBangkok(), invoice.inv_vat_treatment);
    const calculation = await invoiceService.calculateForQuotation(conn, quotation, milestones, milestoneIds, {
        vatRate,
        exchangeRate: freshRate.rate,
        whtRate: invoice.inv_wht_rate,
        currencyDecimals: currency.cur_decimals,
    });
    if (calculation.vatChanged && !confirmVatChange) {
        const decimals = currency.cur_decimals;
        throw new AppError(
            409,
            "INVOICE_VAT_CHANGED",
            `ใบเสนอราคาคิด VAT ${quotation.qt_vat_rate}% แต่วันนี้ต้องคิด ${vatRate}% · ยอดจะเป็น ${formatAmount(calculation.total, decimals)} ` +
                `${invoice.inv_currency} ไม่ใช่ ${formatAmount(calculation.agreedTotal, decimals)} ตามที่ลูกค้าตกลง ` +
                "ตรวจกับลูกค้าและนักบัญชีก่อน แล้วกดยืนยันออกด้วยยอดใหม่",
            { vat_rate_quotation: quotation.qt_vat_rate, vat_rate_today: vatRate },
        );
    }

    // R-B3: ยอดตามที่ตกลงของทุกใบที่ไม่ยกเลิก (รวมใบนี้) ต้องไม่เกินยอดใบเสนอราคา
    const [[billed]] = await conn.query(
        `SELECT COALESCE(SUM(m.ivm_amount), 0) AS total
         FROM tb_invoice_milestones m JOIN tb_invoices i ON i.inv_id = m.ivm_invoice_id
         JOIN tb_quotation_milestones qm ON qm.qtm_id = m.ivm_milestone_id
         WHERE qm.qtm_quotation_id = ? AND i.inv_status <> 'cancelled' AND i.inv_id <> ?`,
        [quotation.qt_id, invoiceId],
    );
    const billedTotal = parseHundredths(billed.total, "ยอดที่ออกบิลแล้ว") + calculation.agreedTotal;
    if (billedTotal > parseHundredths(quotation.qt_total, "ยอดใบเสนอราคา")) {
        throw new AppError(409, "INVOICE_EXCEEDS_QUOTATION", "ยอดที่ออกบิลรวมจะเกินยอดใบเสนอราคา · ตรวจใบแจ้งหนี้อื่นของใบเสนอราคานี้");
    }

    await conn.query(
        `UPDATE tb_invoices SET ${Object.keys(invoiceService.totalsValues(calculation, vatRate))
            .map((column) => `${column} = ?`)
            .join(", ")} WHERE inv_id = ?`,
        [...Object.values(invoiceService.totalsValues(calculation, vatRate)), invoiceId],
    );
    await invoiceService.replaceChildren(conn, invoiceId, calculation);
    const [[updated]] = await conn.query("SELECT * FROM tb_invoices WHERE inv_id = ?", [invoiceId]);
    const issued = await finalizeIssue(conn, updated, freshRate, actor);
    return { inv_id: invoiceId, ...issued };
}

// ─── ใบสร้างเอง: ส่งขออนุมัติ / อนุมัติ / ตีกลับ ──────────────────────────────────────────────────

/**
 * ตรวจครบ → คิดยอดใหม่ด้วย VAT วันนี้ → snapshot แผนอนุมัติตามยอดก่อน VAT เป็นบาท (กติกา IV) → รอชั้นแรก
 */
async function submitForApproval(conn, invoiceId, expectedVersion) {
    const invoice = await invoiceService.findForUpdate(conn, invoiceId);
    if (invoice.inv_status !== "draft") throw invoiceService.wrongStatus("ส่งขออนุมัติได้เฉพาะร่าง");
    invoiceService.assertVersion(invoice, expectedVersion);
    if (invoice.inv_source !== "manual") {
        throw invoiceService.wrongStatus("ใบที่ออกจากงวดของใบเสนอราคาไม่ต้องอนุมัติ · กดออกใบแจ้งหนี้ได้เลย");
    }

    const problems = await findIssueProblems(conn, invoice);
    if (invoice.inv_currency !== BASE_CURRENCY && !invoice.inv_rate_source) problems.push("ยังไม่มีอัตราแลกเปลี่ยน");
    const [items] = await conn.query(
        "SELECT * FROM tb_invoice_items WHERE invi_invoice_id = ? ORDER BY invi_order, invi_id",
        [invoiceId],
    );
    if (!items.some((item) => item.invi_type === "item")) problems.push("ยังไม่มีแถวรายการที่มีราคา");

    const currency = await quotationService.findCurrency(conn, invoice.inv_currency);
    let calculation = null;
    let vatRate = null;
    if (currency) {
        ({ calculation, vatRate } = await invoiceService.calculateManual(
            conn,
            {
                items,
                inv_discount_type: invoice.inv_discount_type,
                inv_discount_value: invoice.inv_discount_value,
                inv_vat_treatment: invoice.inv_vat_treatment,
                inv_exchange_rate: invoice.inv_exchange_rate,
                inv_wht_rate: invoice.inv_wht_rate,
            },
            currency,
        ));
        if (calculation.total <= 0n) problems.push("ยอดรวมทั้งสิ้นต้องมากกว่า 0");
    }
    if (problems.length > 0) throw notReady(problems, "ส่งขออนุมัติ");

    const rules = await approvalRulesService.findApprovalRules(conn, DOCUMENT_TYPE);
    const plan = buildApprovalPlan(rules.levels, calculation.afterDiscountThb);
    if (plan.length === 0) {
        throw new AppError(
            409,
            "APPROVAL_RULES_MISSING",
            "ยังไม่ได้ตั้งกติกาอนุมัติใบแจ้งหนี้ · ให้ผู้ดูแลตั้งที่ ตั้งค่าระบบ › ข้อมูลบริษัท › การอนุมัติ › ใบแจ้งหนี้ที่สร้างเอง",
        );
    }

    const creator = await findUserLabel(conn, invoice.inv_created_by);
    const totals = invoiceService.totalsValues(calculation, vatRate);
    await conn.query(
        `UPDATE tb_invoices SET ${Object.keys(totals)
            .map((column) => `${column} = ?`)
            .join(", ")},
                inv_status = 'pending_approval', inv_approval_round = inv_approval_round + 1, inv_approval_current_level = ?,
                inv_approval_plan = ?, inv_submitted_at = NOW(), inv_returned_reason = NULL, inv_created_by_name = ?,
                inv_version = inv_version + 1
         WHERE inv_id = ?`,
        [...Object.values(totals), plan[0].level, JSON.stringify(plan), creator.full_name, invoiceId],
    );
    await invoiceService.replaceChildren(conn, invoiceId, calculation);
    return { inv_id: invoiceId, approval_levels: plan.map((level) => level.level) };
}

async function approvalsThisRound(conn, invoice) {
    const [rows] = await conn.query(
        `SELECT inva_level, inva_user_id FROM tb_invoice_approvals
         WHERE inva_invoice_id = ? AND inva_round = ? AND inva_action = 'approve'`,
        [invoice.inv_id, invoice.inv_approval_round],
    );
    return rows.map((row) => ({ level: row.inva_level, user_id: row.inva_user_id }));
}

/**
 * อนุมัติชั้นปัจจุบัน และชั้นถัดไปต่อเนื่องที่ผู้กดมีสิทธิ์ · ครบชั้นสุดท้าย = ออกใบอัตโนมัติ (ผู้อนุมัติเป็นผู้ออก)
 */
async function approve(conn, invoiceId, expectedVersion, freshRate, actor) {
    const invoice = await invoiceService.findForUpdate(conn, invoiceId);
    if (invoice.inv_status !== "pending_approval") throw invoiceService.wrongStatus("ใบนี้ไม่ได้รออนุมัติแล้ว");
    invoiceService.assertVersion(invoice, expectedVersion);

    const company = await companyService.findCompany(conn);
    const evaluation = invoiceService.evaluateFor(
        invoice,
        await approvalsThisRound(conn, invoice),
        actor,
        company.cs_allow_self_approval,
    );
    if (!evaluation.canApprove) throw new AppError(403, "APPROVAL_NOT_ALLOWED", evaluation.reason);

    if (evaluation.isFinal) {
        // R19: VAT วันนี้ต้องเท่ากับตอนส่ง ไม่งั้นยอดที่ผู้อนุมัติก่อนหน้าเห็นไม่ใช่ยอดที่จะลงเอกสาร
        const vatRateToday = await quotationService.vatRateFor(conn, todayBangkok(), invoice.inv_vat_treatment);
        if (parseHundredths(vatRateToday, "VAT") !== parseHundredths(invoice.inv_vat_rate, "VAT")) {
            throw new AppError(
                409,
                "VAT_CHANGED",
                `อัตรา VAT เปลี่ยนจาก ${invoice.inv_vat_rate}% เป็น ${vatRateToday}% ตั้งแต่ส่งขออนุมัติ · กรุณาตีกลับให้ผู้สร้างบันทึกใหม่เพื่อคำนวณยอดใหม่`,
            );
        }
        const problems = await findIssueProblems(conn, invoice);
        if (problems.length > 0) throw notReady(problems, "ออกใบแจ้งหนี้");
    }

    const approver = await findUserLabel(conn, actor.user_id);
    for (const level of evaluation.levels) {
        await conn.query(
            `INSERT INTO tb_invoice_approvals
                (inva_invoice_id, inva_round, inva_level, inva_action, inva_user_id, inva_user_name, inva_role_id, inva_role_name)
             VALUES (?, ?, ?, 'approve', ?, ?, ?, ?)`,
            [
                invoiceId,
                invoice.inv_approval_round,
                level,
                actor.user_id,
                approver.full_name,
                approver.user_role_id,
                approver.role_name,
            ],
        );
    }

    if (evaluation.isFinal) {
        const issued = await finalizeIssue(conn, invoice, freshRate, actor);
        return { inv_id: invoiceId, approved_levels: evaluation.levels, is_final: true, ...issued };
    }
    await conn.query(
        "UPDATE tb_invoices SET inv_approval_current_level = ?, inv_version = inv_version + 1 WHERE inv_id = ?",
        [evaluation.nextLevel.level, invoiceId],
    );
    return { inv_id: invoiceId, approved_levels: evaluation.levels, is_final: false, next_level: evaluation.nextLevel.level };
}

/** ตีกลับ = กลับเป็นร่าง รอบหน้าเริ่มชั้น 1 ใหม่ · ทำได้โดยผู้มีสิทธิ์อนุมัติที่ role อยู่ในชั้นที่รออยู่ */
async function returnToDraft(conn, invoiceId, reason, expectedVersion, actor) {
    const invoice = await invoiceService.findForUpdate(conn, invoiceId);
    if (invoice.inv_status !== "pending_approval") throw invoiceService.wrongStatus("ใบนี้ไม่ได้รออนุมัติแล้ว");
    invoiceService.assertVersion(invoice, expectedVersion);

    const plan = quotationService.parseJson(invoice.inv_approval_plan) ?? [];
    const currentLevel = plan.find((level) => level.level === invoice.inv_approval_current_level);
    const isInCurrentLevel = Boolean(currentLevel?.roles.some((role) => role.role_id === actor.user_role_id));
    if (!hasBit(actor.role_permission, "approveInvoice") || !isInCurrentLevel) {
        throw new AppError(403, "RETURN_NOT_ALLOWED", "ตีกลับได้เฉพาะผู้อนุมัติของชั้นที่รออยู่");
    }

    const user = await findUserLabel(conn, actor.user_id);
    await conn.query(
        `INSERT INTO tb_invoice_approvals
            (inva_invoice_id, inva_round, inva_level, inva_action, inva_user_id, inva_user_name, inva_role_id, inva_role_name, inva_reason)
         VALUES (?, ?, ?, 'return', ?, ?, ?, ?, ?)`,
        [
            invoiceId,
            invoice.inv_approval_round,
            invoice.inv_approval_current_level,
            actor.user_id,
            user.full_name,
            user.user_role_id,
            user.role_name,
            reason,
        ],
    );
    await conn.query(
        `UPDATE tb_invoices SET inv_status = 'draft', inv_approval_current_level = NULL, inv_returned_reason = ?, inv_version = inv_version + 1
         WHERE inv_id = ?`,
        [reason, invoiceId],
    );
    return { inv_id: invoiceId };
}

// ─── หลังออก ─────────────────────────────────────────────────────────────────────────────────

async function markSent(conn, invoiceId, expectedVersion) {
    const invoice = await invoiceService.findForUpdate(conn, invoiceId);
    if (invoice.inv_status !== "issued") throw invoiceService.wrongStatus("บันทึกว่าส่งลูกค้าได้เฉพาะใบที่ออกแล้ว");
    invoiceService.assertVersion(invoice, expectedVersion);
    if (invoice.inv_sent_at) throw invoiceService.wrongStatus("ใบนี้บันทึกว่าส่งลูกค้าไปแล้ว");
    await conn.query("UPDATE tb_invoices SET inv_sent_at = NOW(), inv_version = inv_version + 1 WHERE inv_id = ?", [
        invoiceId,
    ]);
    return { inv_id: invoiceId };
}

/**
 * ยกเลิกใบที่ออกแล้ว — เลขยังอยู่ · งวดที่ผูกกลับมาออกบิลใหม่ได้
 * ห้ามเมื่ออยู่ในใบวางบิลที่ยังไม่ยกเลิก หรือรับเงินแล้ว (1C)
 */
async function cancel(conn, invoiceId, reason, expectedVersion, actor) {
    const invoice = await invoiceService.findForUpdate(conn, invoiceId);
    if (invoice.inv_status === "draft") throw invoiceService.wrongStatus('ร่างใช้ "ลบ" แทนการยกเลิก');
    if (invoice.inv_status === "pending_approval") {
        throw invoiceService.wrongStatus("ใบที่รออนุมัติยกเลิกไม่ได้ · ให้ผู้อนุมัติตีกลับ แล้วลบร่าง");
    }
    if (invoice.inv_status !== "issued") throw invoiceService.wrongStatus("ใบนี้ถูกยกเลิกไปแล้ว");
    invoiceService.assertVersion(invoice, expectedVersion);

    const billingNote = await invoiceService.findActiveBillingNote(conn, invoiceId);
    if (billingNote) {
        throw new AppError(
            409,
            "INVOICE_IN_BILLING_NOTE",
            `ใบนี้อยู่ในใบวางบิล ${billingNote.bn_number ?? "(ร่าง)"} · ยกเลิกหรือลบใบวางบิลก่อน แล้วค่อยยกเลิกใบนี้`,
        );
    }
    if (parseHundredths(invoice.inv_paid_amount, "ยอดรับแล้ว") > 0n) {
        throw new AppError(409, "INVOICE_HAS_PAYMENT", "ใบนี้รับชำระเงินแล้ว · ยกเลิกใบเสร็จก่อน แล้วค่อยยกเลิกใบนี้");
    }
    // ขั้น N-1: ใบลดหนี้ที่ยังไม่ยกเลิก (รวมร่าง/รออนุมัติ) ผูกกับใบนี้อยู่ → ยกเลิกใบเดิมไม่ได้ (R-N6)
    const activeCreditNote = (await invoiceService.listCreditNotesOf(conn, invoiceId)).find(
        (creditNote) => creditNote.cn_status !== "cancelled",
    );
    if (activeCreditNote) {
        throw new AppError(
            409,
            "INVOICE_HAS_CREDIT_NOTE",
            `ใบนี้มีใบลดหนี้ ${activeCreditNote.cn_number ?? "(ร่าง/รออนุมัติ)"} · ยกเลิกหรือลบใบลดหนี้ก่อน แล้วค่อยยกเลิกใบนี้`,
        );
    }
    // ขั้น N-2: ใบเพิ่มหนี้ที่ยังไม่ยกเลิก (รวมร่าง/รออนุมัติ) อ้างใบนี้อยู่ → ยกเลิกใบเดิมไม่ได้ (R-N6)
    const activeDebitNote = (await invoiceService.listDebitNotesOf(conn, invoiceId)).find(
        (debitNote) => debitNote.inv_status !== "cancelled",
    );
    if (activeDebitNote) {
        throw new AppError(
            409,
            "INVOICE_HAS_DEBIT_NOTE",
            `ใบนี้มีใบเพิ่มหนี้ ${activeDebitNote.inv_number ?? "(ร่าง/รออนุมัติ)"} · ยกเลิกหรือลบใบเพิ่มหนี้ก่อน แล้วค่อยยกเลิกใบนี้`,
        );
    }

    await conn.query(
        `UPDATE tb_invoices SET inv_status = 'cancelled', inv_cancelled_by = ?, inv_cancelled_at = NOW(), inv_cancel_reason = ?,
                inv_version = inv_version + 1
         WHERE inv_id = ?`,
        [actor.user_id, reason, invoiceId],
    );
    return { inv_id: invoiceId };
}

/**
 * ออกใหม่แทน = ยกเลิกใบนี้ + สร้างร่างใหม่คัดลอกข้อมูล (transaction เดียว) · ร่างใหม่อ้างกลับใบเดิม
 * ใบจากงวด: ร่างใหม่เรียกเก็บงวดเดิม (ยอดตามใบเสนอราคา) · ใบสร้างเอง: คัดลอกรายการ ต้องส่งขออนุมัติใหม่
 */
async function reissue(conn, invoiceId, reason, expectedVersion, actor) {
    await cancel(conn, invoiceId, reason, expectedVersion, actor);
    const [[source]] = await conn.query(
        "SELECT *, DATE_FORMAT(inv_rate_date, '%Y-%m-%d') AS inv_rate_date_text FROM tb_invoices WHERE inv_id = ?",
        [invoiceId],
    );
    const carryOver = {
        inv_title: source.inv_title,
        inv_branch_id: source.inv_branch_id,
        inv_credit_days: source.inv_credit_days,
        inv_wht_rate: source.inv_wht_rate,
        inv_notes: source.inv_notes,
        inv_internal_note: source.inv_internal_note,
        inv_bank_account_id: source.inv_bank_account_id,
    };

    if (source.inv_source === "quotation") {
        const [links] = await conn.query("SELECT ivm_milestone_id FROM tb_invoice_milestones WHERE ivm_invoice_id = ?", [
            invoiceId,
        ]);
        return invoiceService.createFromQuotation(
            conn,
            { quotation_id: source.inv_quotation_id, milestone_ids: links.map((link) => Number(link.ivm_milestone_id)) },
            actor,
            { carryOver, reissuedFromId: invoiceId },
        );
    }

    const [items] = await conn.query(
        "SELECT * FROM tb_invoice_items WHERE invi_invoice_id = ? ORDER BY invi_order, invi_id",
        [invoiceId],
    );
    const copiedItems = items.map((item) => ({
        invi_type: item.invi_type,
        invi_product_id: item.invi_product_id,
        invi_description: item.invi_description,
        invi_quantity: item.invi_quantity,
        invi_unit: item.invi_unit,
        invi_unit_price: item.invi_unit_price,
        invi_list_price: item.invi_list_price,
        invi_discount_type: item.invi_discount_type,
        invi_discount_value: item.invi_discount_value,
    }));

    // ใบเพิ่มหนี้: ร่างใหม่อ้างใบเดิมใบเดียวกัน (หัวเอกสารคัดลอกจากใบเดิมอีกครั้ง)
    if (source.inv_doc_type === "debit_note") {
        return invoiceService.createDebitNote(
            conn,
            {
                ...carryOver,
                inv_reference_invoice_id: source.inv_reference_invoice_id,
                inv_adjust_reason_code: source.inv_adjust_reason_code,
                inv_adjust_reason: source.inv_adjust_reason,
                inv_discount_type: source.inv_discount_type,
                inv_discount_value: source.inv_discount_value,
                items: copiedItems,
            },
            actor,
            { reissuedFromId: invoiceId },
        );
    }

    return invoiceService.createManual(
        conn,
        {
            ...carryOver,
            inv_client_id: source.inv_client_id,
            inv_project_id: source.inv_project_id,
            inv_language: source.inv_language,
            inv_currency: source.inv_currency,
            inv_exchange_rate: source.inv_exchange_rate,
            inv_rate_source: source.inv_rate_source,
            inv_rate_date: source.inv_rate_date_text,
            inv_rate_override_reason: source.inv_rate_override_reason,
            inv_vat_treatment: source.inv_vat_treatment,
            inv_discount_type: source.inv_discount_type,
            inv_discount_value: source.inv_discount_value,
            items: copiedItems,
        },
        actor,
        { reissuedFromId: invoiceId },
    );
}

module.exports = {
    prepareIssueRate,
    issue,
    submitForApproval,
    approve,
    returnToDraft,
    markSent,
    cancel,
    reissue,
};
