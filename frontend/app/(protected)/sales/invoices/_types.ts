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
// ขั้น N-2: ใบเพิ่มหนี้ = ใบแจ้งหนี้สร้างเองชนิด debit_note ที่อ้างใบเดิม
export type InvoiceDocType = "invoice" | "debit_note";
export type DebitNoteReasonCode = "price_increase" | "scope_increase" | "error" | "other";

// สถานะการชำระของใบที่ออกแล้ว (คำนวณตอนอ่าน) · null = ยังไม่ออก/ยกเลิก
// credited = ลดหนี้จนไม่มียอดให้จ่าย · refund_due = ลูกค้าจ่ายเกินหลังลดหนี้ รอบันทึกคืนเงิน (ขั้น N-1)
export type PaymentState = "unpaid" | "partial" | "paid" | "credited" | "refund_due" | null;

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
    inv_doc_type: InvoiceDocType;
    reference_number: string | null;
    inv_title: string;
    inv_currency: string;
    inv_total: string;
    inv_total_thb: string;
    inv_paid_amount: string;
    inv_credited_amount: string;
    inv_refunded_amount: string;
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
    inv_doc_type: InvoiceDocType;
    inv_reference_invoice_id: string | null;
    inv_original_total: string | null;
    inv_adjust_reason_code: DebitNoteReasonCode | null;
    inv_adjust_reason: string | null;
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
    inv_after_discount_thb: string;
    inv_wht_rate: string | null;
    inv_wht_amount: string;
    inv_paid_amount: string;
    // ขั้น N-1: ผลรวมใบลดหนี้ที่ออกแล้ว · เงินที่คืนลูกค้าแล้ว
    inv_credited_amount: string;
    inv_credited_base: string;
    inv_credited_vat: string;
    inv_credited_base_thb: string;
    inv_credited_thb: string;
    inv_credited_wht: string;
    inv_refunded_amount: string;
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
    // ใบเพิ่มหนี้: ใบแจ้งหนี้ที่อ้างอิง
    reference_number: string | null;
    reference_issue_date: string | null;
    reference_total: string | null;
    reference_title: string | null;
    reference_vat_rate: string | null;
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
    can_credit: boolean;
    credit_blocked_reason: string | null;
    can_debit: boolean;
    debit_blocked_reason: string | null;
};

/** ใบเพิ่มหนี้ที่อ้างใบนี้ (รวมร่าง/ยกเลิก) เรียงตามเวลาออก */
export type InvoiceDebitNoteRow = {
    inv_id: string;
    inv_number: string | null;
    inv_status: InvoiceStatus;
    inv_total: string;
    inv_adjust_reason: string | null;
    inv_issue_date: string | null;
};

/** ใบเพิ่มหนี้: เทียบกับรายการขายเดิม (มาตรา 86/9) · ออกแล้ว = ค่าที่บันทึกตอนออก */
export type DebitComparison = {
    original_total: string;
    this_total: string;
    correct_total: string;
    is_snapshot: boolean;
};

/** ใบลดหนี้ของใบแจ้งหนี้นี้ (รวมร่าง/ยกเลิก) เรียงตามเวลาออก */
export type InvoiceCreditNoteRow = {
    cn_id: string;
    cn_number: string | null;
    cn_status: "draft" | "pending_approval" | "issued" | "cancelled";
    cn_total: string;
    cn_wht_amount: string;
    cn_reason: string;
    cn_refund_required: string;
    is_refunded: boolean;
    cn_issued_at: string | null;
    cn_issue_date: string | null;
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
    // ขั้น N-1: ยอดหลังลดหนี้ · ผลรวมใบลดหนี้ · ลูกค้าจ่ายเกินรอคืน
    effective_total: string;
    credited: string;
    refund_due: string;
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
    credit_notes: InvoiceCreditNoteRow[];
    debit_notes: InvoiceDebitNoteRow[];
    debit_comparison: DebitComparison | null;
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
