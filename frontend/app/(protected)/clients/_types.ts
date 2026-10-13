// ชนิดข้อมูลลูกค้า — ตรงกับคำตอบของ GET /clients และ /clients/:id (backend/src/services/client.service.js)
// ชื่อฟิลด์ = ชื่อคอลัมน์ · อัตราหัก ณ ที่จ่ายเป็นข้อความทศนิยม ("3.00")

export type ClientType = "juristic" | "individual";
export type VatTreatment = "standard" | "zero";
export type DocumentLanguage = "th" | "en";
export type ActiveStatus = "active" | "inactive";

export type Client = {
    client_id: string;
    client_name: string;
    client_company: string | null;
    client_contact_name: string | null;
    client_email: string | null;
    client_phone: string | null;
    client_type: ClientType;
    client_country: string;
    client_tax_id: string | null;
    client_branch_code: string | null;
    client_address: string | null;
    client_credit_days: number | null;
    client_wht_rate: string | null;
    client_currency: string;
    client_language: DocumentLanguage;
    client_vat_treatment: VatTreatment;
    client_status: ActiveStatus;
    client_created_at: string;
    client_updated_at: string;
};

// สกุลเงินจาก GET /company — ใช้เฉพาะช่องที่ฟอร์มลูกค้าต้องการ
export type CurrencyChoice = {
    cur_code: string;
    cur_name_th: string;
    cur_status: ActiveStatus;
};
