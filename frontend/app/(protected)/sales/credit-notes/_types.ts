// ชนิดข้อมูลใบลดหนี้ — ตรงกับคำตอบของ backend/src/services/credit-note.service.js
// ชื่อฟิลด์ = ชื่อคอลัมน์ · เงินเป็นข้อความทศนิยม · วันที่เป็น "YYYY-MM-DD"
import type {
    ApprovalEvaluation,
    ClientSnapshot,
    CompanySnapshot,
    CurrencyInfo,
    PlanLevel,
} from "../quotations/_types";

export type CreditNoteStatus = "draft" | "pending_approval" | "issued" | "cancelled";
export type CreditNoteReasonCode = "price_reduction" | "scope_reduction" | "defect" | "error" | "other";

export type CreditNoteListRow = {
    cn_id: string;
    cn_number: string | null;
    cn_status: CreditNoteStatus;
    cn_currency: string;
    cn_total: string;
    cn_reason_code: CreditNoteReasonCode;
    cn_reason: string;
    cn_refund_required: string;
    is_refunded: boolean;
    is_refund_due: boolean;
    cn_created_by_name: string | null;
    cn_approval_current_level: number | null;
    approval_level_count: number;
    waiting_for_me: boolean;
    cn_issue_date: string | null;
    cn_invoice_id: string;
    inv_number: string | null;
    client_name: string;
    client_company: string | null;
};

export type CreditNote = {
    cn_id: string;
    cn_number: string | null;
    cn_status: CreditNoteStatus;
    cn_version: number;
    cn_invoice_id: string;
    cn_client_id: string;
    cn_currency: string;
    cn_language: "th" | "en";
    cn_reason_code: CreditNoteReasonCode;
    cn_reason: string;
    reason_label: string;
    cn_issue_date: string | null;
    cn_original_total: string;
    cn_subtotal: string;
    cn_vat_rate: string;
    cn_vat_amount: string;
    cn_total: string;
    cn_base_thb: string;
    cn_total_thb: string;
    cn_wht_amount: string;
    cn_outstanding_before: string;
    cn_refund_required: string;
    cn_refund_date: string | null;
    cn_refund_amount: string;
    cn_refund_wht: string;
    cn_refund_reference: string | null;
    cn_refund_note: string | null;
    cn_refunded_at: string | null;
    refunded_by_name: string | null;
    refund_bank_name: string | null;
    refund_account_no: string | null;
    is_refunded: boolean;
    is_refund_due: boolean;
    cn_notes: string | null;
    cn_internal_note: string | null;
    cn_client_snapshot: ClientSnapshot | null;
    cn_company_snapshot: CompanySnapshot | null;
    cn_approval_round: number;
    cn_approval_current_level: number | null;
    cn_approval_plan: PlanLevel[];
    cn_returned_reason: string | null;
    cn_created_by_name: string | null;
    cn_issued_by_name: string | null;
    cn_issued_by_title: string | null;
    cn_issuer_signature_id: string | null;
    cn_issued_at: string | null;
    cn_cancelled_at: string | null;
    cn_cancel_reason: string | null;
    cancelled_by_name: string | null;
    client_name: string;
    client_company: string | null;
    branch_code: string;
    branch_name_th: string;
    project_name: string | null;
};

export type CreditNoteLine = {
    cnl_id: number;
    cnl_order: number;
    cnl_description: string;
    cnl_amount: string;
};

export type CreditNoteApprovalRow = {
    cna_id: number;
    cna_round: number;
    cna_level: number;
    cna_action: "approve" | "return";
    cna_user_name: string;
    cna_reason: string | null;
    cna_created_at: string;
};

export type CreditNoteActions = {
    can_edit: boolean;
    can_delete: boolean;
    can_submit: boolean;
    can_approve: boolean;
    can_return: boolean;
    can_cancel: boolean;
    cancel_blocked_reason: string | null;
    can_refund: boolean;
    can_cancel_refund: boolean;
};

export type CreditNoteDetail = {
    credit_note: CreditNote;
    lines: CreditNoteLine[];
    invoice: {
        inv_id: string;
        inv_number: string | null;
        inv_status: string;
        inv_title: string;
        inv_issue_date: string | null;
        inv_due_date: string | null;
        inv_total: string;
        inv_after_discount: string;
        inv_vat_amount: string;
        inv_vat_rate: string;
        inv_wht_amount: string;
        inv_paid_amount: string;
        inv_credited_amount: string;
        inv_credited_base: string;
        inv_refunded_amount: string;
        outstanding_amount: string;
        refund_due_amount: string;
    };
    currency: CurrencyInfo;
    approval_history: CreditNoteApprovalRow[];
    approval: ApprovalEvaluation | null;
    credit_blocked_reason: string | null;
    actions: CreditNoteActions;
};
