// ชนิดข้อมูลใบเสนอราคา — ตรงกับคำตอบของ backend/src/services/quotation.service.js
// ชื่อฟิลด์ = ชื่อคอลัมน์ · เงิน/จำนวน/อัตราเป็นข้อความทศนิยม · วันที่เป็น "YYYY-MM-DD"

export type QuotationStatus =
    | "draft"
    | "pending_approval"
    | "approved"
    | "sent"
    | "accepted"
    | "declined"
    | "expired"
    | "cancelled"
    | "superseded";

export type ItemType = "item" | "heading" | "note";
export type DiscountType = "amount" | "percent";

export type QuotationListRow = {
    qt_id: string;
    qt_number: string | null;
    qt_revision: number;
    qt_status: QuotationStatus;
    qt_title: string;
    qt_currency: string;
    qt_total: string;
    qt_total_thb: string;
    client_name: string;
    client_company: string | null;
    branch_name_th: string;
    created_by_name: string | null;
    qt_issue_date: string | null;
    qt_valid_until: string | null;
    qt_approval_current_level: number | null;
    approval_level_count: number;
    waiting_for_me: boolean;
    qt_updated_at: string;
};

export type PlanLevel = {
    level: number;
    min_amount_thb: string;
    require_distinct: boolean;
    roles: { role_id: string; role_name: string }[];
};

export type Quotation = {
    qt_id: string;
    qt_number: string | null;
    qt_revision: number;
    qt_root_id: string;
    qt_previous_id: string | null;
    qt_status: QuotationStatus;
    qt_version: number;
    qt_client_id: string;
    qt_branch_id: string;
    qt_project_id: string | null;
    qt_title: string;
    qt_language: "th" | "en";
    qt_currency: string;
    qt_exchange_rate: string;
    qt_rate_source: "bot" | "manual" | null;
    qt_rate_date: string | null;
    qt_rate_bot: string | null;
    qt_rate_override_reason: string | null;
    qt_vat_treatment: "standard" | "zero";
    qt_valid_days: number;
    qt_issue_date: string | null;
    qt_valid_until: string | null;
    qt_payment_mode: "single" | "milestones";
    qt_subtotal: string;
    qt_discount_type: DiscountType;
    qt_discount_value: string;
    qt_discount_amount: string;
    qt_after_discount: string;
    qt_vat_rate: string;
    qt_vat_amount: string;
    qt_total: string;
    qt_after_discount_thb: string;
    qt_total_thb: string;
    qt_terms: string | null;
    qt_internal_note: string | null;
    qt_approval_round: number;
    qt_approval_current_level: number | null;
    qt_approval_plan: PlanLevel[];
    qt_created_by: string | null;
    qt_created_by_name: string | null;
    qt_created_by_title: string | null;
    qt_approved_by_title: string | null;
    qt_creator_signature_id: string | null;
    qt_approver_signature_id: string | null;
    qt_responded_at: string | null;
    qt_client_snapshot: ClientSnapshot | null;
    qt_company_snapshot: CompanySnapshot | null;
    qt_approved_by_name: string | null;
    qt_approved_at: string | null;
    qt_submitted_at: string | null;
    qt_returned_reason: string | null;
    qt_sent_at: string | null;
    qt_decline_reason: string | null;
    qt_expired_at: string | null;
    qt_cancelled_at: string | null;
    qt_cancel_reason: string | null;
    qt_created_at: string;
    qt_updated_at: string;
    client_name: string;
    client_company: string | null;
    branch_code: string;
    branch_name_th: string;
    project_name: string | null;
    created_by_current_name: string | null;
};

export type QuotationItem = {
    qti_id: number;
    qti_type: ItemType;
    qti_product_id: string | null;
    qti_package_id: string | null;
    qti_description: string;
    qti_quantity: string | null;
    qti_unit: string | null;
    qti_unit_price: string | null;
    qti_list_price: string | null;
    qti_discount_type: DiscountType;
    qti_discount_value: string;
    qti_discount_amount: string;
    qti_amount: string;
    product_name: string | null;
    product_price: string | null;
    product_status: "active" | "inactive" | null;
};

export type QuotationMilestone = {
    qtm_id: number;
    qtm_name: string;
    qtm_condition: string | null;
    qtm_percent: string | null;
    qtm_amount: string;
};

export type ApprovalHistoryRow = {
    qta_id: number;
    qta_round: number;
    qta_level: number;
    qta_action: "approve" | "return";
    qta_user_name: string;
    qta_role_name: string | null;
    qta_reason: string | null;
    qta_created_at: string;
};

export type CurrencyInfo = {
    cur_code: string;
    cur_name_th: string;
    cur_symbol: string | null;
    cur_decimals: number;
    cur_unit_th: string;
    cur_subunit_th: string | null;
    cur_unit_en: string;
    cur_subunit_en: string | null;
    cur_status: "active" | "inactive";
};

export type ApprovalEvaluation = {
    canApprove: boolean;
    reason: string | null;
    levels: number[];
    isFinal: boolean;
    nextLevel: PlanLevel | null;
    stopReason: string | null;
};

export type QuotationActions = {
    can_edit: boolean;
    can_delete: boolean;
    can_submit: boolean;
    can_approve: boolean;
    can_return: boolean;
    can_send: boolean;
    can_decline: boolean;
    can_accept: boolean;
    can_revise: boolean;
    revise_blocked_reason: string | null;
    can_copy: boolean;
    can_cancel: boolean;
};

export type QuotationDetail = {
    quotation: Quotation;
    currency: CurrencyInfo;
    items: QuotationItem[];
    milestones: QuotationMilestone[];
    approval_history: ApprovalHistoryRow[];
    approvals_this_round: { level: number; user_id: string }[];
    chain: {
        qt_id: string;
        qt_number: string | null;
        qt_revision: number;
        qt_status: QuotationStatus;
        qt_issue_date: string | null;
        qt_total: string;
    }[];
    copied_from: { qt_id: string; qt_number: string | null; qt_revision: number; qt_title: string } | null;
    approval: ApprovalEvaluation | null;
    actions: QuotationActions;
    readiness: { key: string; ok: boolean; message: string }[];
};

// ข้อมูลลูกค้า/บริษัท ณ วันอนุมัติชั้นสุดท้าย (เอกสารที่อนุมัติแล้วพิมพ์จากตรงนี้เสมอ)
export type ClientSnapshot = {
    client_id: string;
    client_name: string;
    client_company: string | null;
    client_contact_name: string | null;
    client_email: string | null;
    client_phone: string | null;
    client_type: "juristic" | "individual";
    client_country: string;
    client_tax_id: string | null;
    client_branch_code: string | null;
    client_address: string | null;
};

export type CompanySnapshot = {
    cs_name_th: string;
    cs_name_en: string | null;
    cs_tax_id: string | null;
    cs_address_th: string | null;
    cs_address_en: string | null;
    cs_phone: string | null;
    cs_email: string | null;
    cs_website: string | null;
    cs_logo_url: string | null;
    branch: {
        branch_code: string;
        branch_name_th: string;
        branch_name_en: string | null;
        branch_address_th: string | null;
        branch_address_en: string | null;
        branch_phone: string | null;
    } | null;
};
