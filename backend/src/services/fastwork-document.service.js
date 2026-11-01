// เอกสารของงาน Fastwork (2026-11-01 · docs/plans/2026-11-01-fastwork-documents.md)
//
// ระบบออกให้ (ไม่ต้องอนุมัติ · ยอดมาจากงวดที่ลูกค้ายืนยันบน Fastwork แล้ว) เก็บเป็นหลักฐาน · ส่งลูกค้าเมื่อขอ (ลิงก์ติดตามงาน)
//   รับงาน / เพิ่มงวด      → ใบเสนอราคา สถานะตอบรับแล้ว (รายการ = งวดงาน)
//   บันทึกเงินงวด          → ใบแจ้งหนี้ + ใบเสร็จ ราคาเต็มที่ลูกค้าจ่าย ลงวันที่ลูกค้ายืนยันงวด · ผูกรายการเงิน (inv/rc_fastwork_payout_id)
//   ยกเลิกรายการเงิน      → ยกเลิกใบเสร็จ + ใบแจ้งหนี้ของรายการนั้น
// รายได้ของงาน Fastwork ยังนับจากรายการเงินที่ Fastwork โอน · ใบแจ้งหนี้/ใบเสร็จที่ผูกรายการเงิน = เอกสารประกอบ ไม่นับซ้ำในรายงาน
const { AppError } = require("../utils/app-error");
const { todayBangkok } = require("../utils/bangkok-time");
const { validate } = require("../utils/validate");
const { formatHundredths, parseHundredths } = require("../shared/money.mjs");
const { quotationDraftSchema } = require("../shared/schemas/quotation.mjs");
const { invoiceManualDraftSchema } = require("../shared/schemas/invoice.mjs");
const { receiptCreateSchema } = require("../shared/schemas/receipt.mjs");
const quotationService = require("./quotation.service");
const quotationWorkflow = require("./quotation-workflow.service");
const invoiceService = require("./invoice.service");
const invoiceWorkflow = require("./invoice-workflow.service");
const receiptService = require("./receipt.service");

const AUTO_NOTE = "ระบบออกให้จากงาน Fastwork (เอกสารประกอบ · ลูกค้าจ่ายผ่าน Fastwork)";
const THB_RATE = { rate: "1", source: null, date: null, bot: null, reason: null };

async function headOfficeBranchId(conn) {
    const [[branch]] = await conn.query(
        "SELECT branch_id FROM tb_branches WHERE branch_status = 'active' ORDER BY branch_code = '00000' DESC, branch_code LIMIT 1",
    );
    if (!branch) throw new AppError(409, "NO_BRANCH", "ยังไม่มีสาขาที่ใช้งานในตั้งค่าบริษัท");
    return branch.branch_id;
}

/** วันที่เอกสารไม่เกินวันนี้ (วันเริ่มงานในอนาคต = ลงวันนี้) */
const notAfterToday = (dateText) => (dateText && dateText < todayBangkok() ? dateText : todayBangkok());

/**
 * ราคาก่อน VAT จากราคาที่ลูกค้าจ่าย (จด VAT แล้ว ราคาบน Fastwork = รวม VAT) · ยังไม่จด VAT = ราคาเดิม
 * ปัดครึ่งขึ้นที่สตางค์ · ยอดรวมในเอกสารอาจต่างจากราคาที่จ่าย 0.01 บาท (รอนักบัญชี Z6)
 */
async function priceBeforeVat(conn, amount, dateText) {
    const vatRate = await quotationService.vatRateFor(conn, dateText, "standard");
    if (Number(vatRate) === 0) return formatHundredths(parseHundredths(amount, "ราคา"));
    const rateHundredths = parseHundredths(vatRate, "อัตรา VAT");
    const gross = parseHundredths(amount, "ราคา");
    const divisor = 10000n + rateHundredths;
    return formatHundredths((gross * 10000n + divisor / 2n) / divisor);
}

/**
 * ใบเสนอราคาของงานที่ตกลงบน Fastwork แล้ว: ร่าง → ออกเลข (วันที่ตามเหตุการณ์) → ตอบรับแล้ว ผูกโปรเจกต์
 * @param {{ projectId: string, title: string, milestones: { fwm_name: string, fwm_amount: string }[], documentDate: string }} input
 */
async function issueQuotation(conn, actor, { projectId, title, milestones, documentDate }) {
    if (milestones.length === 0) return null;
    const [[project]] = await conn.query("SELECT client_id FROM tb_projects WHERE project_id = ?", [projectId]);
    const items = [];
    for (const milestone of milestones) {
        items.push({
            qti_type: "item",
            qti_description: milestone.fwm_name,
            qti_quantity: "1",
            qti_unit: "งวด",
            qti_unit_price: await priceBeforeVat(conn, milestone.fwm_amount, documentDate),
        });
    }
    // จด VAT แล้ว: งวดในใบคิดจากราคาก่อน VAT อาจปัดเศษไม่ตรงราคางวด → ใช้เก็บครั้งเดียว (รายการยังแยกตามงวด)
    const vatRate = await quotationService.vatRateFor(conn, documentDate, "standard");
    const isMilestones = milestones.length > 1 && Number(vatRate) === 0;
    const draft = validate(quotationDraftSchema, {
        qt_client_id: project.client_id,
        qt_branch_id: await headOfficeBranchId(conn),
        qt_project_id: projectId,
        qt_title: title.slice(0, 200),
        qt_payment_mode: isMilestones ? "milestones" : "single",
        milestones: isMilestones
            ? milestones.map((milestone) => ({ qtm_name: milestone.fwm_name, qtm_condition: null, qtm_percent: null, qtm_amount: milestone.fwm_amount }))
            : [],
        qt_internal_note: AUTO_NOTE,
        items,
    });
    const { qt_id: quotationId } = await quotationService.createDraft(conn, draft, actor);
    const quotation = await quotationService.findForUpdate(conn, quotationId);
    const approver = await quotationWorkflow.findUserLabel(conn, actor.user_id);
    await quotationWorkflow.finalizeApproval(conn, quotation, actor, approver, { documentDate });
    await conn.query(
        `UPDATE tb_quotations SET qt_status = 'accepted', qt_responded_at = NOW(), qt_project_id = ?, qt_version = qt_version + 1
         WHERE qt_id = ?`,
        [projectId, quotationId],
    );
    return quotationId;
}

/** โปรเจกต์มีใบเสนอราคาที่ตอบรับแล้วอยู่แล้วไหม (ใบภายในจากคำขอที่รับงานแล้ว · ใบที่ระบบออก) */
async function hasAcceptedQuotation(conn, projectId) {
    const [[row]] = await conn.query("SELECT qt_id FROM tb_quotations WHERE qt_project_id = ? AND qt_status = 'accepted' LIMIT 1", [projectId]);
    return Boolean(row);
}

/** รับงาน: ใบเสนอราคาของงวดทั้งหมด (ข้ามถ้ารับงานผ่านใบภายในที่อนุมัติแล้ว) */
async function issueForNewJob(conn, actor, projectId, startDate) {
    if (await hasAcceptedQuotation(conn, projectId)) return null;
    const [[project]] = await conn.query("SELECT project_name FROM tb_projects WHERE project_id = ?", [projectId]);
    const [milestones] = await conn.query(
        "SELECT fwm_name, fwm_amount FROM tb_fastwork_milestones WHERE fwm_project_id = ? ORDER BY fwm_order",
        [projectId],
    );
    return issueQuotation(conn, actor, { projectId, title: project.project_name, milestones, documentDate: notAfterToday(startDate) });
}

/** จ้างเพิ่มในงานเดิม: ใบเสนอราคาของงวดที่เพิ่ม */
async function issueForAddedMilestones(conn, actor, projectId, milestones) {
    const [[project]] = await conn.query("SELECT project_name FROM tb_projects WHERE project_id = ?", [projectId]);
    return issueQuotation(conn, actor, { projectId, title: `งานเพิ่ม: ${project.project_name}`, milestones, documentDate: todayBangkok() });
}

/**
 * ใบแจ้งหนี้ + ใบเสร็จของรายการเงินงวด (ราคาเต็มที่ลูกค้าจ่าย · ลงวันที่ลูกค้ายืนยันงวด)
 * ออกแล้ว (ยังไม่ยกเลิก) = ไม่ออกซ้ำ · รายการที่ยกเลิกแล้ว = ไม่ออก
 */
async function issueForPayout(conn, actor, payoutId) {
    const [[payout]] = await conn.query(
        `SELECT p.fwp_id, p.fwp_status, p.fwp_gross, DATE_FORMAT(p.fwp_approved_date, '%Y-%m-%d') AS approved_date,
                m.fwm_name, pr.project_id, pr.project_name, pr.client_id, pr.project_fastwork_order_no
         FROM tb_fastwork_payouts p
         JOIN tb_projects pr ON pr.project_id = p.fwp_project_id
         LEFT JOIN tb_fastwork_milestones m ON m.fwm_id = p.fwp_milestone_id
         WHERE p.fwp_id = ?`,
        [payoutId],
    );
    if (!payout || payout.fwp_status === "cancelled") return null;
    const [[existing]] = await conn.query(
        "SELECT inv_id FROM tb_invoices WHERE inv_fastwork_payout_id = ? AND inv_status <> 'cancelled' LIMIT 1",
        [payoutId],
    );
    if (existing) return null;

    const documentDate = payout.approved_date;
    const branchId = await headOfficeBranchId(conn);
    const paidVia = `ชำระผ่าน Fastwork${payout.project_fastwork_order_no ? ` คำสั่งซื้อ ${payout.project_fastwork_order_no}` : ""}`;
    const draft = validate(invoiceManualDraftSchema, {
        inv_client_id: payout.client_id,
        inv_project_id: payout.project_id,
        inv_title: `${payout.project_name} · ${payout.fwm_name ?? "งวดงาน"}`.slice(0, 200),
        inv_branch_id: branchId,
        inv_credit_days: 0,
        inv_wht_rate: null,
        inv_notes: paidVia,
        inv_internal_note: AUTO_NOTE,
        inv_bank_account_id: null,
        items: [
            {
                invi_type: "item",
                invi_description: payout.fwm_name ?? payout.project_name,
                invi_quantity: "1",
                invi_unit: "งวด",
                invi_unit_price: await priceBeforeVat(conn, payout.fwp_gross, documentDate),
            },
        ],
    });
    const { inv_id: invoiceId } = await invoiceService.createManual(conn, draft, actor);
    await conn.query("UPDATE tb_invoices SET inv_fastwork_payout_id = ? WHERE inv_id = ?", [payoutId, invoiceId]);
    const invoice = await invoiceService.findForUpdate(conn, invoiceId);
    await invoiceWorkflow.finalizeIssue(conn, invoice, THB_RATE, actor, { documentDate });

    const [[issued]] = await conn.query("SELECT inv_total, inv_language FROM tb_invoices WHERE inv_id = ?", [invoiceId]);
    const receiptInput = validate(receiptCreateSchema, {
        rc_client_id: payout.client_id,
        rc_branch_id: branchId,
        rc_language: issued.inv_language,
        rc_receipt_date: documentDate,
        rc_method: "other",
        rc_reference: payout.project_fastwork_order_no,
        allocations: [{ rca_invoice_id: invoiceId, rca_amount: issued.inv_total }],
        rc_notes: paidVia,
        rc_internal_note: AUTO_NOTE,
    });
    const receipt = await receiptService.createReceipt(conn, receiptInput, actor, { allowBackdate: true });
    await conn.query("UPDATE tb_receipts SET rc_fastwork_payout_id = ? WHERE rc_id = ?", [payoutId, receipt.rc_id]);
    return { inv_id: invoiceId, rc_id: receipt.rc_id };
}

/** ยกเลิกรายการเงิน (คืนเงินลูกค้า/ข้อพิพาท/บันทึกผิด) → ยกเลิกใบเสร็จแล้วใบแจ้งหนี้ของรายการนั้น · เอกสารเดิมยังอยู่ */
async function cancelForPayout(conn, actor, payoutId, reason) {
    const [receipts] = await conn.query(
        "SELECT rc_id, rc_version FROM tb_receipts WHERE rc_fastwork_payout_id = ? AND rc_status = 'issued'",
        [payoutId],
    );
    for (const receipt of receipts) {
        await receiptService.cancelReceipt(conn, receipt.rc_id, reason, receipt.rc_version, actor, { isFastworkSync: true });
    }
    const [invoices] = await conn.query(
        "SELECT inv_id, inv_version FROM tb_invoices WHERE inv_fastwork_payout_id = ? AND inv_status = 'issued'",
        [payoutId],
    );
    for (const invoice of invoices) {
        await invoiceWorkflow.cancel(conn, invoice.inv_id, reason, invoice.inv_version, actor, { isFastworkSync: true });
    }
}

/**
 * ออกเอกสารย้อนหลังของงานเดิม 1 งาน (Q5 ข): ใบเสนอราคา (ยังไม่มีใบที่ตอบรับ) + ใบแจ้งหนี้/ใบเสร็จของรายการเงินที่ยังไม่มีใบ
 * @returns {Promise<{ quotations: number, payouts: number }>}
 */
async function backfillProject(conn, actor, projectId) {
    const [[project]] = await conn.query(
        "SELECT project_id, DATE_FORMAT(COALESCE(project_start_date, project_created_at), '%Y-%m-%d') AS start_date FROM tb_projects WHERE project_id = ? AND project_channel = 'fastwork' FOR UPDATE",
        [projectId],
    );
    if (!project) return { quotations: 0, payouts: 0 };
    const quotationId = await issueForNewJob(conn, actor, projectId, project.start_date);
    const [payouts] = await conn.query(
        `SELECT p.fwp_id FROM tb_fastwork_payouts p
         WHERE p.fwp_project_id = ? AND p.fwp_status <> 'cancelled'
           AND NOT EXISTS (SELECT 1 FROM tb_invoices i WHERE i.inv_fastwork_payout_id = p.fwp_id AND i.inv_status <> 'cancelled')
         ORDER BY p.fwp_approved_date, p.fwp_id`,
        [projectId],
    );
    for (const payout of payouts) await issueForPayout(conn, actor, payout.fwp_id);
    return { quotations: quotationId ? 1 : 0, payouts: payouts.length };
}

/** งาน Fastwork ที่ยังขาดเอกสาร (หน้า Fastwork บอกจำนวนก่อนกดออกย้อนหลัง) */
async function listMissing(conn) {
    const [rows] = await conn.query(
        `SELECT p.project_id,
                NOT EXISTS (SELECT 1 FROM tb_quotations q WHERE q.qt_project_id = p.project_id AND q.qt_status = 'accepted') AS needs_quotation,
                (SELECT COUNT(*) FROM tb_fastwork_payouts f
                 WHERE f.fwp_project_id = p.project_id AND f.fwp_status <> 'cancelled'
                   AND NOT EXISTS (SELECT 1 FROM tb_invoices i WHERE i.inv_fastwork_payout_id = f.fwp_id AND i.inv_status <> 'cancelled')) AS missing_payouts
         FROM tb_projects p
         WHERE p.project_channel = 'fastwork' AND p.project_status <> 'cancelled'
           AND EXISTS (SELECT 1 FROM tb_fastwork_milestones m WHERE m.fwm_project_id = p.project_id)`,
    );
    return rows
        .map((row) => ({ project_id: row.project_id, needs_quotation: Boolean(row.needs_quotation), missing_payouts: Number(row.missing_payouts) }))
        .filter((row) => row.needs_quotation || row.missing_payouts > 0);
}

module.exports = { issueForNewJob, issueForAddedMilestones, issueForPayout, cancelForPayout, backfillProject, listMissing };
