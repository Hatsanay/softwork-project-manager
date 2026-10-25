// ชนิดข้อมูลของหน้าตั้งค่าบริษัท — ตรงกับคำตอบของ GET /company (backend/src/services/company.service.js)
// ชื่อฟิลด์ = ชื่อคอลัมน์ในฐานข้อมูล · เงิน/อัตราเป็นข้อความทศนิยม ("7.00") · วันที่เป็น "YYYY-MM-DD"

export type Company = {
    cs_name_th: string;
    cs_name_en: string | null;
    cs_tax_id: string | null;
    cs_address_th: string | null;
    cs_address_en: string | null;
    cs_phone: string | null;
    cs_email: string | null;
    cs_website: string | null;
    cs_logo_url: string | null;
    cs_vat_registered_from: string | null;
    // ว่าง = ยังเป็นบุคคลธรรมดา (ช่วงก่อนจดบริษัท)
    cs_incorporated_on: string | null;
    cs_quotation_valid_days: number;
    cs_quotation_terms_th: string | null;
    cs_quotation_terms_en: string | null;
    cs_allow_self_approval: boolean;
    cs_default_credit_days: number;
    cs_promptpay_id: string | null;
    cs_invoice_notes_th: string | null;
    cs_invoice_notes_en: string | null;
    cs_updated_at: string;
};

export type VatRate = {
    vr_effective_from: string;
    vr_rate: string;
    vr_note: string | null;
    is_locked: boolean;
};

export type Branch = {
    branch_id: string;
    branch_code: string;
    branch_name_th: string;
    branch_name_en: string | null;
    branch_address_th: string | null;
    branch_address_en: string | null;
    branch_phone: string | null;
    branch_status: "active" | "inactive";
    user_count: number;
    is_head_office: boolean;
};

export type BankAccount = {
    ba_id: string;
    ba_bank_name: string;
    ba_account_name: string;
    ba_account_no: string;
    ba_bank_branch: string | null;
    ba_swift_code: string | null;
    ba_currency: string;
    ba_is_default: boolean;
    ba_status: "active" | "inactive";
};

export type Currency = {
    cur_code: string;
    cur_name_th: string;
    cur_name_en: string;
    cur_symbol: string | null;
    cur_decimals: number;
    cur_unit_th: string;
    cur_subunit_th: string | null;
    cur_unit_en: string;
    cur_subunit_en: string | null;
    cur_bot_unit: number;
    cur_sort_order: number;
    cur_status: "active" | "inactive";
    is_base_currency: boolean;
    is_used_in_documents: boolean;
};

export type ApprovalLevel = {
    al_level: number;
    al_min_amount_thb: string;
    al_require_distinct: boolean;
    roles: { role_id: string; role_name: string }[];
    eligible_users: { user_id: string; full_name: string }[];
};

export type ApprovalRules = {
    levels: ApprovalLevel[];
    warnings: string[];
};

export type RoleChoice = {
    role_id: string;
    role_name: string;
    is_system_role: boolean;
};

export type CompanySettings = {
    company: Company;
    vat_rates: VatRate[];
    vat_rate_today: string | null;
    today: string;
    branches: Branch[];
    bank_accounts: BankAccount[];
    currencies: Currency[];
    approval: ApprovalRules;
    invoice_approval: ApprovalRules;
    expense_approval: ApprovalRules;
    claim_approval: ApprovalRules;
    payroll_approval: ApprovalRules;
    credit_note_approval: ApprovalRules;
    roles: RoleChoice[];
    can_edit: boolean;
};

// ฟิลด์ที่ PUT /company ต้องส่งครบทุกช่อง — แต่ละแท็บแก้บางช่องแล้วส่งรวมกับค่าที่บันทึกไว้ล่าสุด
export type CompanyPayload = Omit<Company, "cs_logo_url" | "cs_updated_at">;

export function toCompanyPayload(company: Company): CompanyPayload {
    return {
        cs_name_th: company.cs_name_th,
        cs_name_en: company.cs_name_en,
        cs_tax_id: company.cs_tax_id,
        cs_address_th: company.cs_address_th,
        cs_address_en: company.cs_address_en,
        cs_phone: company.cs_phone,
        cs_email: company.cs_email,
        cs_website: company.cs_website,
        cs_vat_registered_from: company.cs_vat_registered_from,
        cs_incorporated_on: company.cs_incorporated_on,
        cs_quotation_valid_days: company.cs_quotation_valid_days,
        cs_quotation_terms_th: company.cs_quotation_terms_th,
        cs_quotation_terms_en: company.cs_quotation_terms_en,
        cs_allow_self_approval: company.cs_allow_self_approval,
        cs_default_credit_days: company.cs_default_credit_days,
        cs_promptpay_id: company.cs_promptpay_id,
        cs_invoice_notes_th: company.cs_invoice_notes_th,
        cs_invoice_notes_en: company.cs_invoice_notes_en,
    };
}
