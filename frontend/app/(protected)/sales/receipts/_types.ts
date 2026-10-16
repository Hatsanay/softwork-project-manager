// ชนิดข้อมูลใบเสร็จรับเงิน — ตรงกับคำตอบของ backend/src/services/receipt.service.js
// ชื่อฟิลด์ = ชื่อคอลัมน์ · เงินเป็นข้อความทศนิยม · วันที่เป็น "YYYY-MM-DD"
import type { ClientSnapshot, CompanySnapshot, CurrencyInfo } from "../quotations/_types";
import type { BankAccountSnapshot } from "../invoices/_types";

export type ReceiptStatus = "issued" | "cancelled";
export type ReceiptMethod = "transfer" | "cheque" | "cash" | "other";

export type ReceiptListRow = {
    rc_id: string;
    rc_number: string;
    rc_status: ReceiptStatus;
    rc_method: ReceiptMethod;
    rc_currency: string;
    rc_allocated_total: string;
    rc_received_amount: string;
    rc_wht_amount: string;
    has_wht_file: boolean;
    rc_receipt_date: string;
    client_name: string;
    client_company: string | null;
    invoice_count: number;
};

/** ใบแจ้งหนี้ที่รับเงินได้ (GET /receipts/receivable-invoices) */
export type ReceivableInvoice = {
    inv_id: string;
    inv_number: string;
    inv_title: string;
    inv_client_id: string;
    inv_branch_id: string;
    inv_language: "th" | "en";
    inv_currency: string;
    inv_total: string;
    inv_vat_amount: string;
    inv_total_thb: string;
    inv_paid_amount: string;
    inv_wht_amount: string;
    inv_issue_date: string;
    inv_due_date: string;
    vat_received: string;
    thb_received: string;
    outstanding_amount: string;
    is_overdue: boolean;
    days_overdue: number;
    client_name: string;
    client_company: string | null;
};

export type ReceivableInvoices = {
    data: ReceivableInvoice[];
    billing_note: {
        bn_id: string;
        bn_number: string | null;
        bn_status: string;
        bn_client_id: string;
        bn_currency: string;
    } | null;
    today: string;
    earliest_receipt_date: string;
};

export type Receipt = {
    rc_id: string;
    rc_number: string;
    rc_status: ReceiptStatus;
    rc_version: number;
    rc_client_id: string;
    rc_branch_id: string;
    rc_currency: string;
    rc_language: "th" | "en";
    rc_receipt_date: string;
    rc_method: ReceiptMethod;
    rc_bank_account_id: string | null;
    rc_reference: string | null;
    rc_cheque_no: string | null;
    rc_cheque_bank: string | null;
    rc_cheque_date: string | null;
    rc_allocated_total: string;
    rc_wht_amount: string;
    rc_fee_amount: string;
    rc_received_amount: string;
    rc_received_thb: string;
    rc_actual_rate: string | null;
    rc_allocated_thb: string;
    rc_fx_diff_thb: string;
    rc_wht_certificate_no: string | null;
    rc_wht_certificate_date: string | null;
    rc_wht_file_name: string | null;
    rc_wht_file_uploaded_at: string | null;
    has_wht_file: boolean;
    rc_notes: string | null;
    rc_internal_note: string | null;
    rc_billing_note_id: string | null;
    bn_number: string | null;
    bn_status: string | null;
    rc_client_snapshot: ClientSnapshot | null;
    rc_company_snapshot: CompanySnapshot | null;
    rc_bank_snapshot: BankAccountSnapshot | null;
    rc_created_by_name: string | null;
    rc_created_at: string;
    rc_cancelled_at: string | null;
    rc_cancel_reason: string | null;
    cancelled_by_name: string | null;
    client_name: string;
    client_company: string | null;
    branch_code: string;
    branch_name_th: string;
};

export type ReceiptAllocation = {
    rca_order: number;
    rca_amount: string;
    rca_vat_amount: string;
    rca_amount_thb: string;
    inv_id: string;
    inv_number: string;
    inv_title: string;
    inv_status: string;
    inv_total: string;
    inv_paid_amount: string;
    inv_issue_date: string;
    inv_due_date: string;
    outstanding_amount: string;
};

export type ReceiptDetail = {
    receipt: Receipt;
    allocations: ReceiptAllocation[];
    currency: CurrencyInfo;
    actions: { can_cancel: boolean; can_edit_details: boolean; can_manage_file: boolean };
};
