// ชนิดข้อมูลทำจ่าย / ใบสำคัญจ่าย / 50 ทวิ — ตรงกับคำตอบของ backend/src/services/payment.service.js
// ชื่อฟิลด์ = ชื่อคอลัมน์ · เงิน/อัตราเป็นข้อความทศนิยม · วันที่เป็น "YYYY-MM-DD"
import type { WhtForm } from "../_types";

export type PaymentMethod = "transfer" | "cheque" | "cash" | "other";
export type PayeeKind = "vendor" | "employee";

export type Payee = {
    payee_kind: PayeeKind;
    payee_id: string;
    payee_name: string;
    wht_form: WhtForm;
    currency: string;
    expense_count: number;
    outstanding: string;
    earliest_due_date: string;
};

export type PayableExpense = {
    ex_id: string;
    ex_number: string;
    ex_title: string;
    ex_vendor_doc_no: string | null;
    ex_currency: string;
    ex_subtotal: string;
    ex_vat_amount: string;
    ex_total: string;
    ex_total_thb: string;
    ex_paid_amount: string;
    ex_wht_income_type: string | null;
    wht_income_type_name: string | null;
    ex_branch_id: string;
    ex_expense_date: string;
    ex_due_date: string;
    outstanding_amount: string;
    base_paid_before: string;
    thb_paid_before: string;
};

export type PayableResponse = {
    wht_form: WhtForm;
    today: string;
    rates: Record<string, { rate: string; min_payment: string }>;
    data: PayableExpense[];
};

export type PaymentListRow = {
    pv_id: string;
    pv_number: string;
    pv_status: "issued" | "cancelled";
    pv_payee_kind: PayeeKind;
    pv_currency: string;
    pv_method: PaymentMethod;
    pv_payment_date: string;
    pv_allocated_total: string;
    pv_wht_amount: string;
    pv_net_paid: string;
    pv_fee_amount: string;
    payee_name: string | null;
    wt_id: string | null;
    wt_number: string | null;
    expense_count: number;
};

export type PayeeSnapshot = {
    kind: PayeeKind;
    vd_id?: string;
    vd_name?: string;
    vd_type?: "juristic" | "individual";
    vd_country?: string;
    vd_tax_id?: string | null;
    vd_branch_code?: string | null;
    vd_address?: string | null;
    vd_bank_name?: string | null;
    vd_bank_account_no?: string | null;
    vd_bank_account_name?: string | null;
    user_id?: string;
    full_name?: string;
};

export type CompanySnapshot = {
    cs_name_th: string;
    cs_name_en: string | null;
    cs_tax_id: string | null;
    cs_address_th: string | null;
    cs_phone: string | null;
    cs_email: string | null;
    cs_logo_url: string | null;
    branch: {
        branch_code: string;
        branch_name_th: string;
        branch_address_th: string | null;
        branch_phone: string | null;
    } | null;
};

export type CertificateLine = {
    wtl_id: number;
    wtl_income_type: string;
    wtl_form_row: number;
    wtl_form_label: string;
    wtl_rate: string;
    wtl_paid_amount: string;
    wtl_tax_amount: string;
};

export type Certificate = {
    wt_id: string;
    wt_number: string;
    wt_book_no: string;
    wt_sequence: number;
    wt_payment_id: string;
    wt_form: "PND3" | "PND53";
    wt_payment_date: string;
    wt_status: "issued" | "cancelled";
    wt_total_paid: string;
    wt_total_tax: string;
    wt_payer_snapshot: CompanySnapshot;
    wt_payee_snapshot: PayeeSnapshot;
    pv_number: string;
    pv_status: "issued" | "cancelled";
    lines: CertificateLine[];
};

export type PaymentDetail = {
    payment: {
        pv_id: string;
        pv_number: string;
        pv_status: "issued" | "cancelled";
        pv_version: number;
        pv_payee_kind: PayeeKind;
        pv_currency: string;
        pv_payment_date: string;
        pv_method: PaymentMethod;
        pv_reference: string | null;
        pv_cheque_no: string | null;
        pv_cheque_date: string | null;
        pv_allocated_total: string;
        pv_wht_amount: string;
        pv_net_paid: string;
        pv_fee_amount: string;
        pv_allocated_thb: string;
        pv_paid_thb: string;
        pv_actual_rate: string | null;
        pv_fx_diff_thb: string;
        pv_notes: string | null;
        pv_payee_snapshot: PayeeSnapshot;
        pv_company_snapshot: CompanySnapshot;
        pv_bank_snapshot: { ba_bank_name: string; ba_account_name: string; ba_account_no: string } | null;
        pv_created_by_name: string | null;
        pv_created_at: string;
        pv_cancel_reason: string | null;
        pv_cancelled_at: string | null;
        cancelled_by_name: string | null;
        branch_code: string;
        branch_name_th: string;
    };
    // คำอ่านหน่วยเงินใช้พิมพ์จำนวนเงินเป็นตัวอักษร
    currency: {
        cur_code: string;
        cur_decimals: number;
        cur_name_th: string;
        cur_unit_th: string;
        cur_subunit_th: string | null;
        cur_unit_en: string;
        cur_subunit_en: string | null;
    };
    allocations: {
        pva_expense_id: string;
        pva_amount: string;
        pva_base_amount: string;
        pva_amount_thb: string;
        pva_wht_income_type: string | null;
        wht_income_type_name: string | null;
        ex_number: string;
        ex_kind: "bill" | "claim";
        ex_title: string;
        ex_vendor_doc_no: string | null;
        ex_total: string;
    }[];
    certificate: Certificate | null;
    actions: { can_cancel: boolean };
};

export type CertificateListRow = {
    wt_id: string;
    wt_number: string;
    wt_form: "PND3" | "PND53";
    wt_status: "issued" | "cancelled";
    wt_payment_date: string;
    wt_total_paid: string;
    wt_total_tax: string;
    pv_id: string;
    pv_number: string;
    payee_name: string | null;
    payee_tax_id: string | null;
};

// รายงานภาษีหัก ณ ที่จ่ายรายเดือน (ขั้น 2-5) — backend/src/services/payable.service.js withholdingReport
export type WithholdingReport = {
    month: string;
    form: "PND3" | "PND53";
    rows: {
        sequence: number;
        wt_id: string;
        wt_number: string;
        wt_payment_date: string;
        pv_number: string;
        payee_name: string | null;
        payee_tax_id: string | null;
        payee_branch_code: string | null;
        payee_address: string | null;
        wtl_income_type: string;
        wtl_form_label: string;
        wtl_rate: string;
        wtl_paid_amount: string;
        wtl_tax_amount: string;
    }[];
    totals: { certificate_count: number; payee_count: number; paid_amount: string; tax_amount: string };
    due_dates: { paper: string; online: string };
};
