// ค่าใช้จ่าย / บิลผู้ขาย: การเปลี่ยนสถานะ (2026-10-16 เฟส 2 ขั้น 2-2 — docs/plans/2026-10-16-purchasing-2.md หัวข้อ 4.1)
//
// ทุกฟังก์ชันรับ conn ที่อยู่ใน transaction และล็อกแถวด้วย SELECT ... FOR UPDATE ก่อนตรวจสถานะ (กดซ้ำ/กดพร้อมกัน
// คนที่สองได้ 409 ไม่ทำซ้ำ) · ผิดสถานะตอบ 409 · ไม่มีสิทธิ์ตอบ 403 · ข้อความบอกเหตุผลและสิ่งที่ต้องทำต่อ
//
// - ส่ง: ยอดก่อน VAT เป็นบาทต่ำกว่าชั้น 1 ของกติกา EX = อนุมัติทันที (P2) · ไม่งั้นรออนุมัติตามชั้น (แผนเก็บไว้ในใบ)
// - ได้เลข EX-… ตอนอนุมัติครบ (หรือผ่านอัตโนมัติ) — ร่าง/รออนุมัติไม่มีเลข ลบร่างได้โดยเลขไม่ข้าม
// - ยอดไม่คิดใหม่ตอนส่ง/อนุมัติ: ทุกอัตราที่ใช้ผูกกับวันที่ในเอกสาร (VAT ณ วันที่เอกสาร · หัก ณ ที่จ่าย ณ วันที่ค่าใช้จ่าย)
// ลำดับล็อก: ค่าใช้จ่าย → ผู้ขาย (บิล) / ผู้เบิก (ใบเบิก) เสมอ
// ใบเบิก (ขั้น 2-3): ส่ง = เจ้าของใบเท่านั้น · ผู้เบิกอนุมัติใบตัวเองไม่ได้เสมอ (R-P11) · ครบกำหนดจ่าย = วันที่อนุมัติ (คืนเงินพนักงานทันที)
const { AppError } = require("../utils/app-error");
const { todayBangkok } = require("../utils/bangkok-time");
const { issueDocumentNumber } = require("../utils/document-number");
const { hasBit } = require("../utils/permissions");
const { buildApprovalPlan } = require("../shared/approval-flow.mjs");
const { parseHundredths } = require("../shared/money.mjs");
const expenseService = require("./expense.service");
const companyService = require("./company.service");
const quotationService = require("./quotation.service");
const approvalRulesService = require("./approval-rules.service");

async function findUserLabel(conn, userId) {
    const [[user]] = await conn.query(
        `SELECT CONCAT(u.user_fname, ' ', u.user_lname) AS full_name, u.user_role_id, r.role_name
         FROM tb_users u LEFT JOIN tb_roles r ON r.role_id = u.user_role_id
         WHERE u.user_id = ?`,
        [userId],
    );
    return user ?? { full_name: "(ผู้ใช้ถูกลบ)", user_role_id: null, role_name: null };
}

/** อนุมัติครบ: ได้เลข (วันนี้ตามเวลาไทย) → รอจ่าย · ใบเบิกครบกำหนดจ่ายวันที่อนุมัติ */
async function finalizeApproval(conn, expense, { isAutomatic }) {
    const today = todayBangkok();
    const documentType = expenseService.DOCUMENT_TYPE_BY_KIND[expense.ex_kind];
    const documentNumber = await issueDocumentNumber(conn, documentType, today);
    const dueDate = expense.ex_kind === "claim" ? today : expense.ex_due_date;
    await conn.query(
        `UPDATE tb_expenses SET ex_status = 'approved', ex_number = ?, ex_approved_at = NOW(), ex_auto_approved = ?,
                ex_due_date = ?, ex_approval_current_level = NULL, ex_version = ex_version + 1
         WHERE ex_id = ?`,
        [documentNumber, isAutomatic ? 1 : 0, dueDate, expense.ex_id],
    );
    return documentNumber;
}

// ─── ส่ง ─────────────────────────────────────────────────────────────────────────────────────

/**
 * ตรวจครบ → ต่ำกว่าวงเงิน = อนุมัติทันที · ไม่งั้น snapshot แผนอนุมัติตามยอดก่อน VAT เป็นบาท → รอชั้นแรก
 */
async function submit(conn, expenseId, expectedVersion, actor, kind) {
    const expense = await expenseService.findForUpdate(conn, expenseId);
    expenseService.assertCanWork(expense, actor, kind);
    if (expense.ex_status !== "draft") throw expenseService.wrongStatus("ส่งได้เฉพาะร่าง");
    expenseService.assertVersion(expense, expectedVersion);
    // ล็อกผู้ขาย/ผู้เบิกก่อน SELECT ธรรมดาคำสั่งแรก (เหตุผลเดียวกับ prepareBillDraft — ตรวจซ้ำต้องเห็นข้อมูลล่าสุด R-P2)
    if (expense.ex_vendor_id) {
        await conn.query("SELECT vd_id FROM tb_vendors WHERE vd_id = ? FOR UPDATE", [expense.ex_vendor_id]);
    }
    if (expense.ex_employee_id) {
        await conn.query("SELECT user_id FROM tb_users WHERE user_id = ? FOR UPDATE", [expense.ex_employee_id]);
    }

    const [[references]] = await conn.query(
        `SELECT v.vd_status, b.branch_status FROM tb_expenses e
         LEFT JOIN tb_vendors v ON v.vd_id = e.ex_vendor_id
         JOIN tb_branches b ON b.branch_id = e.ex_branch_id
         WHERE e.ex_id = ?`,
        [expenseId],
    );
    const lines = await expenseService.findLines(conn, expenseId);
    const currency = await quotationService.findCurrency(conn, expense.ex_currency);
    const [[{ attachmentCount }]] = await conn.query(
        "SELECT COUNT(*) AS attachmentCount FROM tb_expense_attachments WHERE exf_expense_id = ?",
        [expenseId],
    );
    const problems = expenseService
        .buildReadiness({ ...expense, ...references }, lines, currency, Number(attachmentCount))
        .filter((item) => !item.ok)
        .map((item) => item.message);

    // กันบิลซ้ำอีกชั้นตอนส่ง (R-P2)
    if (expense.ex_vendor_id && expense.ex_vendor_doc_no) {
        const duplicate = await expenseService.findDuplicateBill(
            conn,
            expense.ex_vendor_id,
            expense.ex_vendor_doc_no,
            expenseId,
        );
        if (duplicate) {
            problems.push(
                `เลขเอกสาร ${expense.ex_vendor_doc_no} ของผู้ขายนี้${expenseService.describeDuplicate(duplicate)}`,
            );
        }
    }
    if (expense.ex_kind === "claim" && expense.ex_vendor_doc_no) {
        const duplicate = await expenseService.findDuplicateClaim(
            conn,
            expense.ex_employee_id,
            expense.ex_vendor_doc_no,
            expense.ex_expense_date,
            expenseId,
        );
        if (duplicate) {
            problems.push(`ใบเสร็จเลข ${expense.ex_vendor_doc_no} ${expenseService.describeDuplicate(duplicate)}`);
        }
    }
    if (problems.length > 0) {
        throw new AppError(400, "EXPENSE_NOT_READY", `ยังส่งไม่ได้: ${problems.join(" · ")}`, {
            _form: problems.join("\n"),
        });
    }

    const documentType = expenseService.DOCUMENT_TYPE_BY_KIND[expense.ex_kind];
    const rules = await approvalRulesService.findApprovalRules(conn, documentType);
    if (rules.levels.length === 0) {
        throw new AppError(
            409,
            "APPROVAL_RULES_MISSING",
            `ยังไม่ได้ตั้งกติกาอนุมัติ${expense.ex_kind === "claim" ? "ใบเบิกเงิน" : "ค่าใช้จ่าย"} · ให้ผู้ดูแลตั้งที่ ตั้งค่าระบบ › ข้อมูลบริษัท › การอนุมัติ`,
        );
    }
    const plan = buildApprovalPlan(rules.levels, expense.ex_subtotal_thb);

    await conn.query(
        `UPDATE tb_expenses SET ex_approval_round = ex_approval_round + 1, ex_submitted_at = NOW(), ex_returned_reason = NULL
         WHERE ex_id = ?`,
        [expenseId],
    );
    // P2: ยอดต่ำกว่าวงเงินชั้น 1 — ไม่ต้องรอใคร
    if (plan.length === 0) {
        const documentNumber = await finalizeApproval(conn, expense, { isAutomatic: true });
        return { ex_id: expenseId, auto_approved: true, ex_number: documentNumber, approval_levels: [] };
    }

    await conn.query(
        `UPDATE tb_expenses SET ex_status = 'pending_approval', ex_approval_current_level = ?, ex_approval_plan = ?,
                ex_version = ex_version + 1
         WHERE ex_id = ?`,
        [plan[0].level, JSON.stringify(plan), expenseId],
    );
    return {
        ex_id: expenseId,
        auto_approved: false,
        ex_number: null,
        approval_levels: plan.map((level) => level.level),
    };
}

// ─── อนุมัติ / ตีกลับ ─────────────────────────────────────────────────────────────────────────

async function approvalsThisRound(conn, expense) {
    const [rows] = await conn.query(
        `SELECT expa_level, expa_user_id FROM tb_expense_approvals
         WHERE expa_expense_id = ? AND expa_round = ? AND expa_action = 'approve'`,
        [expense.ex_id, expense.ex_approval_round],
    );
    return rows.map((row) => ({ level: row.expa_level, user_id: row.expa_user_id }));
}

/**
 * อนุมัติชั้นปัจจุบัน และชั้นถัดไปต่อเนื่องที่ผู้กดมีสิทธิ์ · ครบชั้นสุดท้าย = ได้เลข รอจ่าย
 */
async function approve(conn, expenseId, expectedVersion, actor, kind) {
    const expense = await expenseService.findForUpdate(conn, expenseId);
    expenseService.assertCanSee(expense, actor, kind);
    if (expense.ex_status !== "pending_approval") throw expenseService.wrongStatus("รายการนี้ไม่ได้รออนุมัติแล้ว");
    expenseService.assertVersion(expense, expectedVersion);

    const company = await companyService.findCompany(conn);
    const evaluation = expenseService.evaluateFor(
        expense,
        await approvalsThisRound(conn, expense),
        actor,
        company.cs_allow_self_approval,
    );
    if (!evaluation.canApprove) throw new AppError(403, "APPROVAL_NOT_ALLOWED", evaluation.reason);

    const approver = await findUserLabel(conn, actor.user_id);
    for (const level of evaluation.levels) {
        await conn.query(
            `INSERT INTO tb_expense_approvals
                (expa_expense_id, expa_round, expa_level, expa_action, expa_user_id, expa_user_name, expa_role_id, expa_role_name)
             VALUES (?, ?, ?, 'approve', ?, ?, ?, ?)`,
            [
                expenseId,
                expense.ex_approval_round,
                level,
                actor.user_id,
                approver.full_name,
                approver.user_role_id,
                approver.role_name,
            ],
        );
    }

    if (evaluation.isFinal) {
        const documentNumber = await finalizeApproval(conn, expense, { isAutomatic: false });
        return { ex_id: expenseId, approved_levels: evaluation.levels, is_final: true, ex_number: documentNumber };
    }
    await conn.query(
        "UPDATE tb_expenses SET ex_approval_current_level = ?, ex_version = ex_version + 1 WHERE ex_id = ?",
        [evaluation.nextLevel.level, expenseId],
    );
    return {
        ex_id: expenseId,
        approved_levels: evaluation.levels,
        is_final: false,
        next_level: evaluation.nextLevel.level,
    };
}

/** ตีกลับ = กลับเป็นร่าง รอบหน้าเริ่มชั้น 1 ใหม่ · ทำได้โดยผู้มีสิทธิ์อนุมัติที่ role อยู่ในชั้นที่รออยู่ */
async function returnToDraft(conn, expenseId, reason, expectedVersion, actor, kind) {
    const expense = await expenseService.findForUpdate(conn, expenseId);
    expenseService.assertCanSee(expense, actor, kind);
    if (expense.ex_status !== "pending_approval") throw expenseService.wrongStatus("รายการนี้ไม่ได้รออนุมัติแล้ว");
    expenseService.assertVersion(expense, expectedVersion);

    const plan = quotationService.parseJson(expense.ex_approval_plan) ?? [];
    const currentLevel = plan.find((level) => level.level === expense.ex_approval_current_level);
    const isInCurrentLevel = Boolean(currentLevel?.roles.some((role) => role.role_id === actor.user_role_id));
    if (!hasBit(actor.role_permission, "approveExpense") || !isInCurrentLevel) {
        throw new AppError(403, "RETURN_NOT_ALLOWED", "ตีกลับได้เฉพาะผู้อนุมัติของชั้นที่รออยู่");
    }

    const user = await findUserLabel(conn, actor.user_id);
    await conn.query(
        `INSERT INTO tb_expense_approvals
            (expa_expense_id, expa_round, expa_level, expa_action, expa_user_id, expa_user_name, expa_role_id, expa_role_name, expa_reason)
         VALUES (?, ?, ?, 'return', ?, ?, ?, ?, ?)`,
        [
            expenseId,
            expense.ex_approval_round,
            expense.ex_approval_current_level,
            actor.user_id,
            user.full_name,
            user.user_role_id,
            user.role_name,
            reason,
        ],
    );
    await conn.query(
        `UPDATE tb_expenses SET ex_status = 'draft', ex_approval_current_level = NULL, ex_returned_reason = ?, ex_version = ex_version + 1
         WHERE ex_id = ?`,
        [reason, expenseId],
    );
    return { ex_id: expenseId };
}

// ─── ยกเลิก / คัดลอก ─────────────────────────────────────────────────────────────────────────

/**
 * ยกเลิกรายการที่อนุมัติแล้ว — เลขยังอยู่ · ห้ามเมื่อจ่ายเงินแล้ว (ใบสำคัญจ่ายที่ไม่ยกเลิก — ขั้น 2-4)
 * สิทธิ์: อนุมัติค่าใช้จ่าย · หรือสิทธิ์บันทึก เมื่อรายการผ่านอัตโนมัติ (ยอดต่ำกว่าวงเงิน ไม่มีผู้อนุมัติให้ขอ)
 */
async function cancel(conn, expenseId, reason, expectedVersion, actor, kind) {
    const expense = await expenseService.findForUpdate(conn, expenseId);
    expenseService.assertCanSee(expense, actor, kind);
    if (expense.ex_status === "draft") throw expenseService.wrongStatus('ร่างใช้ "ลบ" แทนการยกเลิก');
    if (expense.ex_status === "pending_approval") {
        throw expenseService.wrongStatus("รายการที่รออนุมัติยกเลิกไม่ได้ · ให้ผู้อนุมัติตีกลับ แล้วลบร่าง");
    }
    if (expense.ex_status !== "approved") throw expenseService.wrongStatus("รายการนี้ถูกยกเลิกไปแล้ว");
    expenseService.assertVersion(expense, expectedVersion);

    const canApprove = hasBit(actor.role_permission, "approveExpense");
    const canCancelAutoApproved = expenseService.canWorkAsCreator(expense, actor) && expense.ex_auto_approved === 1;
    if (!canApprove && !canCancelAutoApproved) {
        throw new AppError(
            403,
            "CANCEL_NOT_ALLOWED",
            "ยกเลิกรายการที่ผ่านการอนุมัติแล้วต้องให้ผู้มีสิทธิ์อนุมัติค่าใช้จ่ายเป็นคนยกเลิก",
        );
    }
    if (parseHundredths(expense.ex_paid_amount, "ยอดจ่ายแล้ว") > 0n) {
        throw new AppError(
            409,
            "EXPENSE_HAS_PAYMENT",
            "รายการนี้จ่ายเงินแล้ว · ยกเลิกใบสำคัญจ่ายก่อน แล้วค่อยยกเลิกรายการนี้",
        );
    }

    await conn.query(
        `UPDATE tb_expenses SET ex_status = 'cancelled', ex_cancelled_by = ?, ex_cancelled_at = NOW(), ex_cancel_reason = ?,
                ex_version = ex_version + 1
         WHERE ex_id = ?`,
        [actor.user_id, reason, expenseId],
    );
    return { ex_id: expenseId };
}

/**
 * คัดลอกเป็นร่างใหม่ (รายจ่ายประจำ — P6): ผู้ขาย/เรื่อง/บรรทัด/สกุลเงิน/หัก ณ ที่จ่าย เหมือนเดิม
 * วันที่ค่าใช้จ่าย = วันนี้ · ไม่คัดลอกเลข/วันที่เอกสารผู้ขาย (บิลใหม่มีเลขใหม่) และไฟล์แนบ
 * ตรวจเหมือนสร้างใหม่ — ผู้ขาย/หมวดที่ถูกปิดใช้งานไปแล้วต้องเลือกใหม่
 */
async function copyBill(conn, expenseId, actor) {
    const [[source]] = await conn.query(
        "SELECT *, DATE_FORMAT(ex_rate_date, '%Y-%m-%d') AS ex_rate_date_text FROM tb_expenses WHERE ex_id = ?",
        [expenseId],
    );
    if (!source || source.ex_kind !== "bill") throw expenseService.notFound();
    const lines = await expenseService.findLines(conn, expenseId);
    return expenseService.createBillDraft(
        conn,
        {
            ex_vendor_id: source.ex_vendor_id,
            ex_title: source.ex_title,
            ex_branch_id: source.ex_branch_id,
            ex_vendor_doc_no: null,
            ex_vendor_doc_date: null,
            ex_doc_type: source.ex_doc_type,
            ex_expense_date: todayBangkok(),
            ex_credit_days: source.ex_credit_days,
            ex_currency: source.ex_currency,
            ex_exchange_rate: source.ex_exchange_rate,
            ex_rate_source: source.ex_rate_source,
            ex_rate_date: source.ex_rate_date_text,
            ex_rate_override_reason: source.ex_rate_override_reason,
            ex_vat_amount: source.ex_vat_amount,
            ex_wht_income_type: source.ex_wht_income_type,
            ex_notes: source.ex_notes,
            lines: lines.map((line) => ({
                exl_category_id: Number(line.exl_category_id),
                exl_project_id: line.exl_project_id,
                exl_description: line.exl_description,
                exl_quantity: line.exl_quantity,
                exl_unit_price: line.exl_unit_price,
            })),
        },
        actor,
    );
}

module.exports = { submit, approve, returnToDraft, cancel, copyBill };
