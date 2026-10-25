// ลิงก์เลือกบริการ + คำขอบริการ ฝั่งพนักงาน (2026-10-25) — ตรงกับ backend/src/services/order-link.service.js และ service-request.service.js

export type OrderLinkKind = "personal" | "public" | "fastwork";
export type OrderLinkOpenState = "open" | "disabled" | "expired";

export type OrderLink = {
    ol_id: number;
    ol_token: string;
    ol_short_code: string;
    ol_kind: OrderLinkKind;
    ol_name: string | null;
    ol_client_id: string | null;
    ol_project_id: string | null;
    ol_buyer_name: string | null;
    ol_assignee_id: string;
    ol_expires_on: string | null;
    ol_status: "active" | "disabled";
    ol_created_at: string;
    client_name: string | null;
    project_name: string | null;
    assignee_name: string | null;
    request_count: number;
    category_ids: string[];
    // รายการที่ทีมเลือกให้ (ล็อก) · is_available = ยังใช้งานได้
    preset_items: { kind: "product" | "package"; id: string; name: string; quantity: number; is_available: boolean }[];
    ol_allow_more: boolean;
    has_preset_problem: boolean;
    open_state: OrderLinkOpenState;
};

export type ServiceRequestSettings = {
    cs_service_request_assignee_id: string | null;
    users: { user_id: string; full_name: string }[];
};

/** ค่าที่เติมให้ตอนรับงาน Fastwork (S-5) — ตรงกับ fastworkPlanOf ใน service-request.service.js */
export type FastworkPlan = {
    mode: "new" | "existing";
    can_take: boolean;
    blocked_reason: string | null;
    title: string;
    client_id: string | null;
    client_name: string | null;
    quotation: { qt_id: string; qt_number: string; qt_revision: number; qt_status: string } | null;
    milestones: { fwm_name: string; fwm_amount: string }[];
};

export type ServiceRequestStatus = "submitted" | "converted" | "rejected" | "closed";

export type ServiceRequestRow = {
    svr_id: string;
    svr_status: ServiceRequestStatus;
    svr_status_reason: string | null;
    svr_contact_name: string | null;
    svr_contact_phone: string | null;
    svr_contact_email: string | null;
    svr_contact_line: string | null;
    svr_company_name: string | null;
    svr_tax_id: string | null;
    svr_address: string | null;
    svr_note: string | null;
    svr_vat_rate: string | null;
    svr_client_id: string | null;
    svr_quotation_id: string | null;
    svr_project_id: string | null;
    svr_version: number;
    svr_submitted_at: string;
    svr_consent_at: string | null;
    svr_assignee_id: string;
    assignee_name: string | null;
    ol_id: number;
    ol_kind: OrderLinkKind;
    ol_name: string | null;
    ol_buyer_name: string | null;
    ol_project_id: string | null;
    link_project_name: string | null;
    client_name: string | null;
    qt_number: string | null;
    qt_status: string | null;
    project_name: string | null;
    item_count?: number;
    totals?: { subtotal: string; vat: string; total: string };
};

export type ServiceRequestItem = {
    svi_id: number;
    svi_order: number;
    svi_type: "item" | "heading";
    svi_product_id: string | null;
    svi_package_id: string | null;
    svi_name: string;
    svi_unit: string | null;
    svi_unit_price: string | null;
    svi_quantity: string | null;
    // S-3: ค่าที่ผู้รับผิดชอบปรับ (ว่าง = ตามที่ลูกค้าส่ง)
    svi_adjusted_quantity: string | null;
    svi_adjusted_unit_price: string | null;
    svi_is_removed: boolean;
    svi_added_by_staff: boolean;
    // ทีมเลือกให้ในลิงก์ (ล็อก) · งานเพิ่มแบบ %: อัตรา + ยอดตอนนี้ (คิดจากแถวอื่นหลังปรับ)
    svi_is_preset: boolean;
    svi_percent: string | null;
    percent_amount?: string | null;
};

export type ClientMatch = { client_id: string; client_name: string; client_company: string | null; client_phone: string | null; client_email: string | null };

export const LINK_KIND_LABEL: Record<OrderLinkKind, string> = {
    personal: "เฉพาะลูกค้า",
    public: "สาธารณะ",
    fastwork: "Fastwork",
};
