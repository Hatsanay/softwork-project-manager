// ชนิดข้อมูลใบแจ้งหนี้ — ตรงกับคำตอบของ backend/src/services/invoice.service.js
// ชื่อฟิลด์ = ชื่อคอลัมน์ · เงิน/จำนวน/อัตราเป็นข้อความทศนิยม · วันที่เป็น "YYYY-MM-DD"
import type {
    ApprovalEvaluation,
    ClientSnapshot,
    CompanySnapshot,
    CurrencyInfo,
    DiscountType,
    ItemType,
    PlanLevel,
} from "../quotations/_types";

export type InvoiceStatus = "draft" | "pending_approval" | "issued" | "cancelled";
export type InvoiceSource = "quotation" | "manual";

// สถานะการชำระของใบที่ออกแล้ว (ช่วง 1C — คำนวณตอนอ่าน) · null = ยังไม่ออก/ยกเลิก
export type PaymentState = "unpaid" | "partial" | "paid" | null;

// สถานะการชำระที่คำนวณตอนอ่าน (ไม่เก็บในฐานข้อมูล)
export type DueStatus = {
    is_outstanding: boolean;
    is_overdue: boolean;
    days_overdue: number;
    days_until_due: number | null;
};

export type InvoiceListRow = DueStatus & {
    payment_state: PaymentState;
    outstanding_amount: string;
    inv_id: string;
    inv_number: string | null;
    inv_status: InvoiceStatus;
    inv_source: InvoiceSource;
    inv_title: string;
    inv_currency: string;
    inv_total: string;
    inv_total_thb: string;
    inv_paid_amount: string;
    inv_wht_amount: string;
    client_name: string;
    client_company: string | null;
    inv_quotation_id: string | null;
    qt_number: string | null;
    created_by_name: string | null;
    inv_issue_date: string | null;
    inv_due_date: string | null;
    inv_sent_at: string | null;
    inv_approval_current_level: number | null;
    approval_level_count: number;
    waiting_for_me: boolean;
};

export type BankAccountSnapshot = {
    ba_id: string;
    ba_bank_name: string;
    ba_account_name: string;
    ba_account_no: string;
    ba_bank_branch: string | null;
    ba_swift_code: string | null;
    ba_currency: string;
};

export type Invoice = DueStatus & {
    payment_state: PaymentState;
    outstanding_amount: string;
    inv_id: string;
    inv_number: string | null;
    inv_status: InvoiceStatus;
    inv_version: number;
    inv_source: InvoiceSource;
    inv_quotation_id: string | null;
    inv_project_id: string | null;
    inv_client_id: string;
    inv_branch_id: string;
    inv_reissued_from_id: string | null;
    inv_title: string;
    inv_language: "th" | "en";
    inv_currency: string;
    inv_exchange_rate: string;
    inv_rate_source: "bot" | "manual" | null;
    inv_rate_date: string | null;
    inv_rate_bot: string | null;
    inv_rate_override_reason: string | null;
    inv_vat_treatment: "standard" | "zero";
    inv_credit_days: number;
    inv_issue_date: string | null;
    inv_due_date: string | null;
    inv_subtotal: string;
    inv_discount_type: DiscountType;
    inv_discount_value: string;
    inv_discount_amount: string;
    inv_after_discount: string;
    inv_vat_rate: string;
    inv_vat_amount: string;
    inv_total: string;
    inv_total_thb: string;
    inv_wht_rate: string | null;
    inv_wht_amount: string;
    inv_paid_amount: string;
    inv_notes: string | null;
    inv_internal_note: string | null;
    inv_bank_account_id: string | null;
    inv_client_snapshot: ClientSnapshot | null;
    inv_company_snapshot: CompanySnapshot | null;
    inv_approval_round: number;
    inv_approval_current_level: number | null;
    inv_approval_plan: PlanLevel[];
    inv_returned_reason: string | null;
    inv_created_by: string | null;
    inv_created_by_name: string | null;
    inv_issued_by_name: string | null;
    inv_issued_by_title: string | null;
    inv_issuer_signature_id: string | null;
    inv_issued_at: string | null;
    inv_sent_at: string | null;
    inv_cancelled_at: string | null;
    inv_cancel_reason: string | null;
    inv_created_at: string;
    client_name: string;
    client_company: string | null;
    branch_code: string;
    branch_name_th: string;
    project_name: string | null;
    qt_number: string | null;
    qt_revision: number | null;
    qt_title: string | null;
    reissued_from_number: string | null;
    created_by_current_name: string | null;
};

export type InvoiceItem = {
    invi_id: number;
    invi_type: ItemType;
    invi_product_id: string | null;
    invi_description: string;
    invi_quantity: string | null;
    invi_unit: string | null;
    invi_unit_price: string | null;
    invi_list_price: string | null;
    invi_discount_type: DiscountType;
    invi_discount_value: string;
    invi_discount_amount: string;
    invi_amount: string;
};

export type InvoiceMilestoneLink = {
    ivm_milestone_id: number;
    ivm_amount: string;
    ivm_base: string;
    ivm_vat: string;
    qtm_order: number;
    qtm_name: string;
    qtm_percent: string | null;
};

export type InvoiceApprovalRow = {
    inva_id: number;
    inva_round: number;
    inva_level: number;
    inva_action: "approve" | "return";
    inva_user_name: string;
    inva_role_name: string | null;
    inva_reason: string | null;
    inva_created_at: string;
};

export type InvoiceActions = {
    can_edit: boolean;
    can_delete: boolean;
    can_issue: boolean;
    can_submit: boolean;
    can_approve: boolean;
    can_return: boolean;
    can_send: boolean;
    can_cancel: boolean;
    can_reissue: boolean;
    cancel_blocked_reason: string | null;
    can_receive: boolean;
};

/** ใบเสร็จที่ตัดใบแจ้งหนี้นี้ (รวมที่ยกเลิก) */
export type InvoiceReceiptRow = {
    rc_id: string;
    rc_number: string;
    rc_status: "issued" | "cancelled";
    rc_receipt_date: string;
    rc_method: "transfer" | "cheque" | "cash" | "other";
    rca_amount: string;
};

export type InvoicePayment = {
    bank_account: BankAccountSnapshot | null;
    promptpay_id: string | null;
    net_payable: string;
    // ยอดที่ฝังใน QR = ยอดค้างหลังหัก ณ ที่จ่าย (รับเงินบางส่วนแล้วจะน้อยกว่า net_payable)
    qr_amount: string;
    // รับเงินบางส่วนแล้ว: ยอดคงค้าง (ก่อนหัก) · หัก ณ ที่จ่ายของยอดคงค้าง · คงค้างสุทธิ (= qr_amount)
    outstanding: string;
    outstanding_withholding: string;
    outstanding_net: string;
    qr_payload: string | null;
};

export type InvoiceDetail = {
    invoice: Invoice;
    currency: CurrencyInfo;
    items: InvoiceItem[];
    milestones: InvoiceMilestoneLink[];
    approval_history: InvoiceApprovalRow[];
    approval: ApprovalEvaluation | null;
    billing_note: { bn_id: string; bn_number: string | null; bn_status: string } | null;
    receipts: InvoiceReceiptRow[];
    reissued_to: { inv_id: string; inv_number: string | null; inv_status: InvoiceStatus } | null;
    payment: InvoicePayment;
    actions: InvoiceActions;
    readiness: { key: string; ok: boolean; message: string }[];
    today: string;
};

// GET /quotations/:id/billable-milestones
export type BillableMilestones = {
    quotation: {
        qt_id: string;
        qt_number: string | null;
        qt_status: string;
        qt_payment_mode: "single" | "milestones";
        qt_currency: string;
        qt_total: string;
    };
    can_bill: boolean;
    milestones: {
        qtm_id: number;
        qtm_order: number;
        qtm_name: string;
        qtm_condition: string | null;
        qtm_percent: string | null;
        qtm_amount: string;
        base_amount: string | null;
        vat_amount: string | null;
        billed_invoice: { inv_id: string; inv_number: string | null; inv_status: InvoiceStatus } | null;
    }[];
};
