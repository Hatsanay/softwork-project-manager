// ชนิดข้อมูลฝั่งจัดซื้อ — ตรงกับคำตอบของ backend/src/services/vendor.service.js และ purchasing-setup.service.js
// ชื่อฟิลด์ = ชื่อคอลัมน์ · เงิน/อัตราเป็นข้อความทศนิยม · วันที่เป็น "YYYY-MM-DD"
export type ActiveStatus = "active" | "inactive";
export type VendorType = "juristic" | "individual";
// แบบยื่นภาษีหัก ณ ที่จ่าย — null = ต่างประเทศ ไม่ออก 50 ทวิ
export type WhtForm = "PND3" | "PND53" | null;

export type Vendor = {
    vd_id: string;
    vd_code: string | null;
    vd_type: VendorType;
    vd_country: string;
    vd_name: string;
    vd_tax_id: string | null;
    vd_branch_code: string | null;
    vd_address: string | null;
    vd_contact_name: string | null;
    vd_email: string | null;
    vd_phone: string | null;
    vd_bank_name: string | null;
    vd_bank_account_no: string | null;
    vd_bank_account_name: string | null;
    vd_promptpay_id: string | null;
    vd_credit_days: number | null;
    vd_currency: string;
    vd_default_income_type: string | null;
    vd_default_category_id: number | null;
    vd_notes: string | null;
    vd_status: ActiveStatus;
    wht_form: WhtForm;
    income_type_name?: string | null;
    category_name?: string | null;
};

export type WhtRate = {
    wr_effective_from: string;
    wr_rate: string;
    wr_min_payment: string;
    wr_note: string | null;
    is_locked: boolean;
};

export type WhtIncomeType = {
    wit_code: string;
    wit_name_th: string;
    wit_name_en: string | null;
    wit_form_row: number;
    wit_form_label: string;
    wit_status: ActiveStatus;
    wit_sort_order: number;
    current_rate: WhtRate | null;
    rates: WhtRate[];
};

export type ExpenseCategory = {
    ec_id: number;
    ec_name_th: string;
    ec_name_en: string | null;
    ec_account_code: string | null;
    ec_default_income_type: string | null;
    income_type_name: string | null;
    ec_is_asset: boolean;
    ec_status: ActiveStatus;
    ec_sort_order: number;
};

export type PurchasingSetup = {
    categories: ExpenseCategory[];
    income_types: WhtIncomeType[];
    today: string;
};
