// ชนิดข้อมูลลูกหนี้คงค้าง — ตรงกับคำตอบของ backend/src/services/receivable.service.js
export type AgingBucketKey = "current" | "days_1_30" | "days_31_60" | "days_61_90" | "days_over_90";

export type AgingBucket = { key: AgingBucketKey; label: string };

/** ยอดเป็นบาท (ข้อความทศนิยม) แยกช่วงอายุ */
export type AgingAmounts = Record<AgingBucketKey, string> & { total: string };

export type AgingClientRow = AgingAmounts & {
    client_id: string;
    client_name: string;
    client_company: string | null;
    invoice_count: number;
    oldest_days_overdue: number;
};

export type AgingSummary = {
    buckets: AgingBucket[];
    clients: AgingClientRow[];
    totals: AgingAmounts;
    today: string;
};

export type AgingInvoiceRow = {
    inv_id: string;
    inv_number: string;
    inv_title: string;
    inv_client_id: string;
    inv_currency: string;
    inv_total: string;
    inv_paid_amount: string;
    inv_issue_date: string;
    inv_due_date: string;
    outstanding_amount: string;
    outstanding_thb: string;
    days_overdue: number;
    cur_decimals: number;
    bucket: AgingBucketKey;
};

export type AgingOfClient = {
    client: { client_id: string; client_name: string; client_company: string | null } | null;
    buckets: AgingBucket[];
    invoices: AgingInvoiceRow[];
    today: string;
};
