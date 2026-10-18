// ชนิดข้อมูลใบวางบิล — ตรงกับคำตอบของ backend/src/services/billing-note.service.js
// ชื่อฟิลด์ = ชื่อคอลัมน์ · เงินเป็นข้อความทศนิยม · วันที่เป็น "YYYY-MM-DD"
import type { ClientSnapshot, CompanySnapshot, CurrencyInfo } from "../quotations/_types";

export type BillingNoteStatus = "draft" | "issued" | "cancelled";

export type BillingNoteListRow = {
    bn_id: string;
    bn_number: string | null;
    bn_status: BillingNoteStatus;
    bn_currency: string;
    bn_total: string;
    bn_client_id: string;
    bn_issue_date: string | null;
    bn_payment_date: string | null;
    client_name: string;
    client_company: string | null;
    invoice_count: number;
    created_by_name: string | null;
};

/** ใบแจ้งหนี้ที่รวมในใบวางบิลได้ (GET /billing-notes/billable-invoices) */
export type BillableInvoice = {
    inv_id: string;
    inv_number: string;
    inv_title: string;
    inv_client_id: string;
    inv_branch_id: string;
    inv_language: "th" | "en";
    inv_currency: string;
    inv_total: string;
    inv_paid_amount: string;
    inv_wht_amount: string;
    inv_issue_date: string;
    inv_due_date: string;
    outstanding_amount: string;
    is_overdue: boolean;
    days_overdue: number;
    client_name: string;
    client_company: string | null;
    client_status: "active" | "inactive";
};

export type BillingNote = {
    bn_id: string;
    bn_number: string | null;
    bn_status: BillingNoteStatus;
    bn_version: number;
    bn_client_id: string;
    bn_branch_id: string;
    bn_currency: string;
    bn_language: "th" | "en";
    bn_issue_date: string | null;
    bn_payment_date: string | null;
    bn_total: string;
    bn_notes: string | null;
    bn_client_snapshot: ClientSnapshot | null;
    bn_company_snapshot: CompanySnapshot | null;
    bn_created_by_name: string | null;
    bn_issued_at: string | null;
    bn_cancelled_at: string | null;
    bn_cancel_reason: string | null;
    client_name: string;
    client_company: string | null;
    branch_code: string;
    branch_name_th: string;
    created_by_current_name: string | null;
    cancelled_by_name: string | null;
};

export type BillingNoteInvoice = {
    bni_order: number;
    bni_amount: string;
    inv_id: string;
    inv_number: string | null;
    inv_title: string;
    inv_status: "draft" | "pending_approval" | "issued" | "cancelled";
    inv_currency: string;
    inv_total: string;
    // ขั้น N-1: ยอดตามใบแจ้งหนี้หลังลดหนี้ (= inv_total ถ้าไม่มีใบลดหนี้)
    effective_total: string;
    inv_paid_amount: string;
    inv_wht_amount: string;
    inv_issue_date: string | null;
    inv_due_date: string | null;
    is_overdue: boolean;
    days_overdue: number;
    // ร่าง: ปัญหาที่ทำให้ออกไม่ได้ (null = ใช้ได้)
    problem: string | null;
};

export type BillingNoteActions = {
    can_edit: boolean;
    can_delete: boolean;
    can_issue: boolean;
    can_cancel: boolean;
    can_receive: boolean;
};

export type BillingNoteDetail = {
    billing_note: BillingNote;
    invoices: BillingNoteInvoice[];
    withholding_total: string;
    // ยอดรวม − หัก ณ ที่จ่าย (ประมาณ) ตามสัดส่วนยอดที่วางบิล
    net_payable: string;
    currency: CurrencyInfo;
    actions: BillingNoteActions;
    readiness: { key: string; ok: boolean; message: string }[];
    today: string;
};
