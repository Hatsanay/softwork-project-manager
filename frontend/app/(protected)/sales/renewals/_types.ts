// ชนิดข้อมูลของหน้าต่ออายุบริการ (2026-10-31) · ตรงกับ backend/src/services/renewal.service.js

export type RenewalChannel = "direct" | "fastwork";
export type RenewalStatus = "active" | "paused" | "cancelled";
export type RenewalTab = "due_soon" | "overdue" | "paused" | "all";

export type Renewal = {
    rnw_id: string;
    rnw_client_id: string;
    rnw_project_id: string | null;
    rnw_product_id: string;
    rnw_label: string | null;
    rnw_price: string;
    rnw_cycle_months: number;
    rnw_anchor_day: number;
    rnw_next_due_date: string;
    rnw_channel: RenewalChannel;
    rnw_status: RenewalStatus;
    rnw_paused_on: string | null;
    rnw_end_reason: string | null;
    rnw_source: "quotation" | "fastwork" | "manual";
    rnw_source_id: string | null;
    rnw_notes: string | null;
    rnw_version: number;
    rnw_created_at: string;
    client_name: string;
    client_status: string;
    product_name: string;
    product_unit: string | null;
    product_status: string;
    project_name: string | null;
    next_period: { start: string; end: string };
    // ติดลบ = เลยกำหนด
    days_left: number;
};

export type RenewalCycle = {
    rnc_id: number;
    rnc_period_start: string;
    rnc_period_end: string;
    rnc_amount: string;
    rnc_status: "billed" | "void";
    rnc_invoice_id: string | null;
    inv_number: string | null;
    inv_status: string | null;
    rnc_project_id: string | null;
    project_name: string | null;
    rnc_created_at: string;
};

export type RenewalList = {
    data: Renewal[];
    total: number;
    counts: Record<RenewalTab, number>;
    channels: RenewalChannel[];
    today: string;
    due_soon_days: number;
};

export type RenewalFormOptions = {
    products: {
        product_id: string;
        product_name: string;
        product_unit: string | null;
        product_price: string;
        product_renewal_months: number;
    }[];
    projects: { project_id: string; project_name: string; project_channel: RenewalChannel; project_status: string }[];
};
