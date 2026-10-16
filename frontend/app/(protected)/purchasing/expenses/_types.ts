// ชนิดข้อมูลค่าใช้จ่าย / บิลผู้ขาย — ตรงกับคำตอบของ backend/src/services/expense.service.js
// ชื่อฟิลด์ = ชื่อคอลัมน์ · เงิน/อัตราเป็นข้อความทศนิยม · วันที่เป็น "YYYY-MM-DD"
import type { WhtForm } from "../_types";

export type ExpenseStatus = "draft" | "pending_approval" | "approved" | "cancelled";
export type ExpenseDocType =
    "tax_invoice" | "abbreviated_tax_invoice" | "receipt" | "invoice" | "substitute_receipt" | "none";
export type PaymentState = "unpaid" | "partial" | "paid" | null;

export type ExpenseDueStatus = {
    outstanding_amount: string;
    is_outstanding: boolean;
    is_overdue: boolean;
    days_overdue: number;
    days_until_due: number | null;
};

export type ExpenseListRow = ExpenseDueStatus & {
    ex_id: string;
    ex_number: string | null;
    ex_status: ExpenseStatus;
    ex_title: string;
    ex_vendor_id: string | null;
    vd_name: string | null;
    ex_vendor_doc_no: string | null;
    ex_doc_type: ExpenseDocType;
    ex_currency: string;
    ex_total: string;
    ex_total_thb: string;
    ex_paid_amount: string;
    ex_wht_amount: string;
    ex_created_by_name: string | null;
    ex_employee_id: string | null;
    employee_name: string | null;
    ex_merchant_name: string | null;
    ex_auto_approved: boolean;
    ex_approval_current_level: number | null;
    ex_returned_reason: string | null;
    ex_expense_date: string;
    ex_due_date: string;
    attachment_count: number;
    payment_state: PaymentState;
    waiting_for_me: boolean;
    approval_level_count: number;
};

export type PlanLevel = {
    level: number;
    min_amount_thb: string;
    require_distinct: boolean;
    roles: { role_id: string; role_name: string }[];
};

export type Expense = ExpenseDueStatus & {
    ex_id: string;
    ex_number: string | null;
    ex_kind: "bill" | "claim";
    ex_status: ExpenseStatus;
    ex_version: number;
    ex_vendor_id: string | null;
    ex_employee_id: string | null;
    employee_name: string | null;
    ex_merchant_name: string | null;
    vd_name: string | null;
    vd_code: string | null;
    vd_tax_id: string | null;
    vd_branch_code: string | null;
    vd_status: "active" | "inactive" | null;
    ex_branch_id: string;
    branch_code: string;
    branch_name_th: string;
    ex_title: string;
    ex_vendor_doc_no: string | null;
    ex_vendor_doc_date: string | null;
    ex_doc_type: ExpenseDocType;
    ex_expense_date: string;
    ex_credit_days: number;
    ex_due_date: string;
    ex_currency: string;
    ex_exchange_rate: string;
    ex_rate_source: "bot" | "manual" | null;
    ex_rate_date: string | null;
    ex_rate_override_reason: string | null;
    ex_subtotal: string;
    ex_vat_rate: string;
    ex_vat_amount: string;
    ex_vat_claimable: boolean;
    ex_total: string;
    ex_subtotal_thb: string;
    ex_total_thb: string;
    ex_wht_income_type: string | null;
    wht_income_type_name: string | null;
    ex_wht_rate: string | null;
    ex_wht_amount: string;
    ex_paid_amount: string;
    ex_notes: string | null;
    ex_approval_plan: PlanLevel[];
    ex_approval_round: number;
    ex_approval_current_level: number | null;
    ex_auto_approved: boolean;
    ex_submitted_at: string | null;
    ex_returned_reason: string | null;
    ex_approved_at: string | null;
    ex_created_by_name: string | null;
    ex_cancelled_at: string | null;
    cancelled_by_name: string | null;
    ex_cancel_reason: string | null;
    ex_created_at: string;
    wht_form: WhtForm;
    payment_state: PaymentState;
};

export type ExpenseLine = {
    exl_id: number;
    exl_category_id: number;
    category_name: string;
    ec_is_asset: boolean;
    exl_project_id: string | null;
    project_name: string | null;
    exl_description: string;
    exl_quantity: string;
    exl_unit_price: string;
    exl_amount: string;
};

export type ExpenseAttachment = {
    exf_id: number;
    exf_file_name: string;
    exf_file_size: number;
    exf_uploaded_at: string;
    uploaded_by_name: string | null;
};

export type ExpenseApprovalRow = {
    expa_id: number;
    expa_round: number;
    expa_level: number;
    expa_action: "approve" | "return";
    expa_user_name: string | null;
    expa_reason: string | null;
    expa_created_at: string;
};

export type ApprovalEvaluation = {
    canApprove: boolean;
    reason: string | null;
    levels: number[];
    isFinal: boolean;
    stopReason: string | null;
};

export type ExpenseDetail = {
    expense: Expense;
    currency: { cur_code: string; cur_decimals: number; cur_name_th: string };
    lines: ExpenseLine[];
    attachments: ExpenseAttachment[];
    approval_history: ExpenseApprovalRow[];
    approval: ApprovalEvaluation | null;
    checks: {
        official_vat_rate: string;
        suggested_vat: string;
        is_vat_different: boolean;
        wht_min_payment: string | null;
        is_below_wht_minimum: boolean;
        net_payable: string;
    };
    possible_duplicates: { ex_id: string; ex_number: string | null; ex_status: ExpenseStatus; ex_title: string }[];
    actions: {
        can_edit: boolean;
        can_delete: boolean;
        can_submit: boolean;
        can_approve: boolean;
        can_return: boolean;
        can_cancel: boolean;
        cancel_blocked_reason: string | null;
        can_copy: boolean;
        can_attach: boolean;
        can_remove_attachment: boolean;
        can_pay: boolean;
    };
    readiness: { key: string; ok: boolean; message: string }[];
    // ใบสำคัญจ่ายที่ตัดรายการนี้ (รวมที่ยกเลิก)
    payments: {
        pv_id: string;
        pv_number: string;
        pv_status: "issued" | "cancelled";
        pv_payment_date: string;
        pv_method: "transfer" | "cheque" | "cash" | "other";
        pva_amount: string;
        wt_id: string | null;
        wt_number: string | null;
    }[];
    today: string;
};

export type ProjectOption = {
    project_id: string;
    project_name: string;
    project_status: string;
    client_name: string | null;
};
