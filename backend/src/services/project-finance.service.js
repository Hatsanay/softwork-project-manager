// การเงินโปรเจกต์ (2026-10-15 ขั้น 1D-1 — docs/plans/2026-10-15-finance-1d.md หัวข้อ 3.1)
//
// อ่านอย่างเดียว คำนวณตอนอ่านจากใบเสนอราคา/งวด/ใบแจ้งหนี้/ใบเสร็จที่ผูกโปรเจกต์ — ไม่มีตารางของตัวเอง
// - แยกตามสกุลเงิน + รวมเป็นบาท (ห้ามบวกต่างสกุลกันตรงๆ R-D1) · ยอดบาทใช้อัตราของเอกสารนั้น
// - มูลค่าสัญญานับเฉพาะใบเสนอราคาที่ลูกค้าตอบรับ (ใบที่ถูก revision แทนเป็น superseded ไม่นับ R-D5)
// - ออกบิล/รับแล้ว นับเฉพาะใบแจ้งหนี้ที่ออกแล้ว · ร่าง/รออนุมัติแสดงแยก "ร่างรอออก"
// - % งานเสร็จเทียบ % ออกบิล เป็นค่าประมาณช่วยตัดสินใจ (R-D6)
// - ต้นทุน (เฟส 2 ขั้น 2-5 — P4): บรรทัดค่าใช้จ่าย/ใบเบิกที่อนุมัติแล้ว (ไม่ยกเลิก) ที่ผูกโปรเจกต์นี้ เป็นบาทตามอัตราของรายการ
//   + VAT ส่วนของบรรทัดเมื่อขอคืนไม่ได้ (บริษัทยังไม่จด VAT → ภาษีซื้อเป็นต้นทุนจริง)
// - ค่าแรง (เฟส 4 ขั้น 4-2 — H2-ก): ชั่วโมงที่อนุมัติ × ต้นทุนต่อชั่วโมงของพนักงาน (services/labor-cost.service.js) ยอดรวมเท่านั้น (H3)
//   ตอนนี้เป็นประมาณการจากค่าจ้างปัจจุบัน — ขั้น 4-4 ใช้ตัวเลขจริงของรอบเงินเดือนที่อนุมัติแล้ว
//   กำไรขั้นต้น = ยอดออกบิลก่อน VAT เป็นบาท − ค่าใช้จ่าย − ค่าแรง (ห้ามบวกต่างสกุลตรงๆ R-P9)
const { AppError } = require("../utils/app-error");
const { todayBangkok } = require("../utils/bangkok-time");
const { convertToBaht, divideRoundHalfUp, parseHundredths } = require("../shared/money.mjs");
const { toDecimalText } = require("../shared/quotation-totals.mjs");
const { estimateProjectLabor } = require("./labor-cost.service");

// งานนำหน้าการออกบิลเกินกี่จุด (%) ถึงขึ้นข้อความเตือน
const PROGRESS_AHEAD_THRESHOLD = 10;

const money = (value) => parseHundredths(value ?? "0", "ยอดเงิน");

// ร้อยละทศนิยม 1 ตำแหน่ง (แสดงผลเท่านั้น) — ตัวหาร 0 = null
function percentOf(part, whole) {
    if (whole <= 0n) return null;
    return Number(divideRoundHalfUp(part * 1000n, whole)) / 10;
}

function emptyTotals() {
    return {
        contract: 0n,
        contract_thb: 0n,
        billed: 0n,
        billed_thb: 0n,
        billed_manual: 0n,
        received: 0n,
        received_thb: 0n,
        outstanding: 0n,
        outstanding_thb: 0n,
        overdue: 0n,
        overdue_thb: 0n,
        unbilled: 0n,
        unbilled_thb: 0n,
        in_draft: 0n,
    };
}

function toTextTotals(totals) {
    return Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, toDecimalText(value)]));
}

/**
 * ยอดบาทตามสัดส่วนของยอดในสกุลเดิม (เช่น งวดของใบเสนอราคา USD → บาทตามอัตราของใบเสนอราคา)
 * @param {bigint} amount
 * @param {bigint} total ยอดรวมในสกุลเดิมของเอกสาร
 * @param {bigint} totalThb ยอดรวมเป็นบาทของเอกสาร
 */
function proportionalThb(amount, total, totalThb) {
    if (total <= 0n) return 0n;
    return divideRoundHalfUp(amount * totalThb, total);
}

/**
 * ความคืบหน้างานถ่วงด้วยมูลค่ารายการ: Σ(ยอดรายการ × สัดส่วนน้ำหนักงานที่เสร็จ) ÷ Σ ยอดรายการที่มีงานผูก
 * @returns {{ progress_percent: number | null, items_with_tasks: number, items_without_tasks: number }}
 */
function itemProgress(items, tasksByItem) {
    let weightedDone = 0n;
    let trackedAmount = 0n;
    let itemsWithTasks = 0;
    let itemsWithoutTasks = 0;
    for (const item of items) {
        const tasks = tasksByItem.get(Number(item.qti_id)) ?? [];
        if (tasks.length === 0) {
            itemsWithoutTasks += 1;
            continue;
        }
        const totalWeight = tasks.reduce((sum, task) => sum + BigInt(Math.max(task.task_weight, 1)), 0n);
        const doneWeight = tasks
            .filter((task) => task.task_status === "done")
            .reduce((sum, task) => sum + BigInt(Math.max(task.task_weight, 1)), 0n);
        const amount = money(item.qti_amount);
        itemsWithTasks += 1;
        trackedAmount += amount;
        weightedDone += divideRoundHalfUp(amount * doneWeight, totalWeight);
    }
    return {
        progress_percent: percentOf(weightedDone, trackedAmount),
        items_with_tasks: itemsWithTasks,
        items_without_tasks: itemsWithoutTasks,
    };
}

/**
 * @param {import("mysql2/promise").Pool} conn
 * @param {string} projectId
 */
async function getProjectFinance(conn, projectId) {
    const today = todayBangkok();
    const [[project]] = await conn.query("SELECT project_id FROM tb_projects WHERE project_id = ?", [projectId]);
    if (!project) throw new AppError(404, "PROJECT_NOT_FOUND", "ไม่พบโปรเจกต์นี้");

    const [quotations] = await conn.query(
        `SELECT qt_id, qt_number, qt_title, qt_currency, qt_total, qt_total_thb, DATE_FORMAT(qt_responded_at, '%Y-%m-%d') AS qt_accepted_date
         FROM tb_quotations WHERE qt_project_id = ? AND qt_status = 'accepted'
         ORDER BY qt_responded_at, qt_number`,
        [projectId],
    );
    const [invoices] = await conn.query(
        `SELECT i.inv_id, i.inv_number, i.inv_status, i.inv_source, i.inv_quotation_id, i.inv_title, i.inv_currency, i.inv_total,
                i.inv_total_thb, i.inv_after_discount_thb, i.inv_paid_amount, DATE_FORMAT(i.inv_due_date, '%Y-%m-%d') AS inv_due_date,
                DATE_FORMAT(i.inv_issue_date, '%Y-%m-%d') AS inv_issue_date,
                COALESCE((SELECT SUM(a.rca_amount_thb) FROM tb_receipt_allocations a JOIN tb_receipts r ON r.rc_id = a.rca_receipt_id
                          WHERE a.rca_invoice_id = i.inv_id AND r.rc_status = 'issued'), 0) AS received_thb
         FROM tb_invoices i
         WHERE i.inv_project_id = ? AND i.inv_status <> 'cancelled'
         ORDER BY i.inv_issue_date IS NULL, i.inv_issue_date, i.inv_number`,
        [projectId],
    );

    const quotationIds = quotations.map((quotation) => quotation.qt_id);
    const [milestones] = quotationIds.length
        ? await conn.query(
              `SELECT qtm_id, qtm_quotation_id, qtm_order, qtm_name, qtm_percent, qtm_amount
               FROM tb_quotation_milestones WHERE qtm_quotation_id IN (?) ORDER BY qtm_quotation_id, qtm_order`,
              [quotationIds],
          )
        : [[]];
    const [billedLinks] = quotationIds.length
        ? await conn.query(
              `SELECT m.ivm_milestone_id, m.ivm_amount, i.inv_id, i.inv_number, i.inv_status
               FROM tb_invoice_milestones m JOIN tb_invoices i ON i.inv_id = m.ivm_invoice_id
               JOIN tb_quotation_milestones qm ON qm.qtm_id = m.ivm_milestone_id
               WHERE qm.qtm_quotation_id IN (?) AND i.inv_status <> 'cancelled'`,
              [quotationIds],
          )
        : [[]];
    const [items] = quotationIds.length
        ? await conn.query(
              `SELECT qti_id, qti_quotation_id, qti_amount FROM tb_quotation_items
               WHERE qti_quotation_id IN (?) AND qti_type = 'item'`,
              [quotationIds],
          )
        : [[]];
    const itemIds = items.map((item) => item.qti_id);
    const [tasks] = itemIds.length
        ? await conn.query(
              `SELECT task_quotation_item_id, task_status, task_weight FROM tb_tasks
               WHERE project_id = ? AND task_quotation_item_id IN (?)`,
              [projectId, itemIds],
          )
        : [[]];

    const tasksByItem = new Map();
    for (const task of tasks) {
        const key = Number(task.task_quotation_item_id);
        tasksByItem.set(key, [...(tasksByItem.get(key) ?? []), task]);
    }
    const linkByMilestone = new Map(billedLinks.map((link) => [Number(link.ivm_milestone_id), link]));

    const byCurrency = new Map();
    const totalsFor = (currencyCode) => {
        if (!byCurrency.has(currencyCode)) byCurrency.set(currencyCode, emptyTotals());
        return byCurrency.get(currencyCode);
    };

    // ใบเสนอราคาที่ตอบรับ: มูลค่าสัญญา + งวด (ออกบิลแล้ว/ร่าง/ยังไม่ออก) + ความคืบหน้า
    const quotationRows = quotations.map((quotation) => {
        const totals = totalsFor(quotation.qt_currency);
        const total = money(quotation.qt_total);
        const totalThb = money(quotation.qt_total_thb);
        totals.contract += total;
        totals.contract_thb += totalThb;

        let billedOfQuotation = 0n;
        let nextMilestone = null;
        const milestoneRows = milestones
            .filter((milestone) => milestone.qtm_quotation_id === quotation.qt_id)
            .map((milestone) => {
                const link = linkByMilestone.get(Number(milestone.qtm_id)) ?? null;
                const amount = money(milestone.qtm_amount);
                let state = "unbilled";
                if (link?.inv_status === "issued") {
                    state = "billed";
                    billedOfQuotation += money(link.ivm_amount);
                } else if (link) {
                    state = "draft";
                    totals.in_draft += amount;
                }
                if (state === "unbilled") {
                    totals.unbilled += amount;
                    totals.unbilled_thb += proportionalThb(amount, total, totalThb);
                    nextMilestone ??= {
                        qtm_id: Number(milestone.qtm_id),
                        qtm_order: milestone.qtm_order,
                        qtm_name: milestone.qtm_name,
                    };
                }
                return {
                    qtm_id: Number(milestone.qtm_id),
                    qtm_order: milestone.qtm_order,
                    qtm_name: milestone.qtm_name,
                    qtm_percent: milestone.qtm_percent,
                    qtm_amount: milestone.qtm_amount,
                    state,
                    invoice: link
                        ? { inv_id: link.inv_id, inv_number: link.inv_number, inv_status: link.inv_status }
                        : null,
                };
            });

        const progress = itemProgress(
            items.filter((item) => item.qti_quotation_id === quotation.qt_id),
            tasksByItem,
        );
        const billedPercent = percentOf(billedOfQuotation, total);
        const isWorkAhead =
            progress.progress_percent !== null &&
            billedPercent !== null &&
            progress.progress_percent - billedPercent > PROGRESS_AHEAD_THRESHOLD &&
            nextMilestone !== null;
        return {
            ...quotation,
            milestones: milestoneRows,
            next_milestone: nextMilestone,
            billed_percent: billedPercent,
            ...progress,
            is_work_ahead_of_billing: isWorkAhead,
        };
    });

    // ใบแจ้งหนี้ที่ออกแล้ว: ออกบิล/รับแล้ว/ค้าง/เกินกำหนด
    let billedBeforeVatThb = 0n;
    const invoiceRows = invoices.map((invoice) => {
        const isIssued = invoice.inv_status === "issued";
        const total = money(invoice.inv_total);
        const paid = money(invoice.inv_paid_amount);
        const outstanding = isIssued ? total - paid : 0n;
        const isOverdue = isIssued && outstanding > 0n && invoice.inv_due_date !== null && invoice.inv_due_date < today;
        if (isIssued) {
            const totals = totalsFor(invoice.inv_currency);
            const totalThb = money(invoice.inv_total_thb);
            const receivedThb = money(invoice.received_thb);
            totals.billed += total;
            totals.billed_thb += totalThb;
            billedBeforeVatThb += money(invoice.inv_after_discount_thb);
            if (invoice.inv_source === "manual") totals.billed_manual += total;
            totals.received += paid;
            totals.received_thb += receivedThb;
            totals.outstanding += outstanding;
            totals.outstanding_thb += totalThb - receivedThb;
            if (isOverdue) {
                totals.overdue += outstanding;
                totals.overdue_thb += totalThb - receivedThb;
            }
        } else if (invoice.inv_source === "manual") {
            totalsFor(invoice.inv_currency).in_draft += total;
        }
        const { received_thb: _receivedThb, inv_after_discount_thb: _beforeVatThb, ...rest } = invoice;
        return { ...rest, outstanding_amount: toDecimalText(outstanding), is_overdue: isOverdue };
    });

    const allThb = emptyTotals();
    for (const totals of byCurrency.values()) {
        for (const key of [
            "contract_thb",
            "billed_thb",
            "received_thb",
            "outstanding_thb",
            "overdue_thb",
            "unbilled_thb",
        ]) {
            allThb[key] += totals[key];
        }
    }

    const cost = await findProjectCost(conn, projectId);
    const labor = await estimateProjectLabor(conn, projectId);
    const totalCostThb = cost.totalThb + labor.costThb;
    const grossProfitThb = billedBeforeVatThb - totalCostThb;

    return {
        // ต้นทุน + กำไรขั้นต้น (ขั้น 2-5 · ค่าแรงขั้น 4-2) — เป็นบาทเสมอ · cost_thb = ค่าใช้จ่าย + ค่าแรง
        profit: {
            billed_before_vat_thb: toDecimalText(billedBeforeVatThb),
            cost_thb: toDecimalText(totalCostThb),
            expense_cost_thb: toDecimalText(cost.totalThb),
            labor_cost_thb: toDecimalText(labor.costThb),
            labor_hours: toDecimalText(labor.approvedHours),
            labor_pending_hours: toDecimalText(labor.pendingHours),
            labor_by_month: labor.byMonth,
            labor_is_estimate: true,
            gross_profit_thb: toDecimalText(grossProfitThb),
            gross_margin_percent: percentOf(grossProfitThb, billedBeforeVatThb),
            pending_cost_thb: toDecimalText(cost.pendingThb),
            by_category: cost.byCategory,
            expenses: cost.expenses,
        },
        currencies: [...byCurrency.entries()].map(([currencyCode, totals]) => ({
            currency: currencyCode,
            ...toTextTotals(totals),
        })),
        totals_thb: {
            contract: toDecimalText(allThb.contract_thb),
            billed: toDecimalText(allThb.billed_thb),
            received: toDecimalText(allThb.received_thb),
            outstanding: toDecimalText(allThb.outstanding_thb),
            overdue: toDecimalText(allThb.overdue_thb),
            unbilled: toDecimalText(allThb.unbilled_thb),
        },
        quotations: quotationRows,
        invoices: invoiceRows,
        today,
        progress_ahead_threshold: PROGRESS_AHEAD_THRESHOLD,
    };
}

/**
 * ต้นทุนโปรเจกต์จากบรรทัดค่าใช้จ่าย/ใบเบิก — อนุมัติแล้ว = ต้นทุน · ร่าง/รออนุมัติ = "รออนุมัติ" (แสดงแยก ไม่นับ)
 * ต่อบรรทัด: ยอดก่อน VAT เป็นบาท + VAT ตามสัดส่วนของบรรทัด (เฉพาะรายการที่ขอคืน VAT ไม่ได้) เป็นบาท
 * @returns {Promise<{ totalThb: bigint, pendingThb: bigint, byCategory: object[], expenses: object[] }>}
 */
async function findProjectCost(conn, projectId) {
    const [lines] = await conn.query(
        `SELECT l.exl_amount, l.exl_category_id, c.ec_name_th AS category_name,
                e.ex_id, e.ex_number, e.ex_kind, e.ex_status, e.ex_title, e.ex_subtotal, e.ex_vat_amount, e.ex_vat_claimable,
                e.ex_exchange_rate, DATE_FORMAT(e.ex_expense_date, '%Y-%m-%d') AS ex_expense_date,
                IF(e.ex_kind = 'claim', CONCAT(u.user_fname, ' ', u.user_lname), v.vd_name) AS payee_name
         FROM tb_expense_lines l
         JOIN tb_expenses e ON e.ex_id = l.exl_expense_id
         JOIN tb_expense_categories c ON c.ec_id = l.exl_category_id
         LEFT JOIN tb_vendors v ON v.vd_id = e.ex_vendor_id
         LEFT JOIN tb_users u ON u.user_id = e.ex_employee_id
         WHERE l.exl_project_id = ? AND e.ex_status IN ('draft', 'pending_approval', 'approved')
         ORDER BY e.ex_expense_date, e.ex_number, l.exl_order`,
        [projectId],
    );

    let totalThb = 0n;
    let pendingThb = 0n;
    const categories = new Map();
    const expenses = new Map();
    for (const line of lines) {
        const amount = money(line.exl_amount);
        const subtotal = money(line.ex_subtotal);
        const vatShare =
            line.ex_vat_claimable === 1 || subtotal <= 0n
                ? 0n
                : divideRoundHalfUp(amount * money(line.ex_vat_amount), subtotal);
        const costThb = convertToBaht(amount + vatShare, line.ex_exchange_rate);
        if (line.ex_status !== "approved") {
            pendingThb += costThb;
            continue;
        }
        totalThb += costThb;

        const category = categories.get(line.exl_category_id) ?? {
            category_id: Number(line.exl_category_id),
            category_name: line.category_name,
            amount: 0n,
        };
        category.amount += costThb;
        categories.set(line.exl_category_id, category);

        const expense = expenses.get(line.ex_id) ?? {
            ex_id: line.ex_id,
            ex_number: line.ex_number,
            ex_kind: line.ex_kind,
            ex_title: line.ex_title,
            ex_expense_date: line.ex_expense_date,
            payee_name: line.payee_name,
            amount: 0n,
        };
        expense.amount += costThb;
        expenses.set(line.ex_id, expense);
    }
    return {
        totalThb,
        pendingThb,
        byCategory: [...categories.values()]
            .sort((first, second) => (second.amount > first.amount ? 1 : second.amount < first.amount ? -1 : 0))
            .map(({ amount, ...category }) => ({ ...category, amount_thb: toDecimalText(amount) })),
        expenses: [...expenses.values()].map(({ amount, ...expense }) => ({
            ...expense,
            amount_thb: toDecimalText(amount),
        })),
    };
}

module.exports = { getProjectFinance };
