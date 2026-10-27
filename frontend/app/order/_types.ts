// หน้าร้านของลิงก์เลือกบริการ (2026-10-25) — ตรงกับคำตอบของ backend/src/services/order-public.service.js

export type LinkKind = "personal" | "public" | "fastwork";
// unavailable = รายการที่ทีมเลือกให้ถูกปิดใช้งาน (ส่งคำขอไม่ได้จนทีมแก้ลิงก์)
export type LinkState = "open" | "disabled" | "expired" | "unavailable";

export type ShopInfo = { name: string; logo_url: string | null };

export type CatalogProduct = {
    product_id: string;
    product_name: string;
    product_description: string | null;
    product_unit: string | null;
    product_price: string;
    product_image_url: string | null;
    product_category_id: string | null;
    // percent = งานเพิ่มคิดเป็น % ของยอดรายการอื่น (เช่น งานด่วน +30%) · ไม่ใช้ product_price
    product_price_mode: "fixed" | "percent";
    product_percent: string | null;
};

export type CatalogPackage = {
    pkg_id: string;
    pkg_name: string;
    pkg_description: string | null;
    pkg_image_url: string | null;
    pkg_category_id: string | null;
    items: { product_id: string | null; name: string; unit: string | null; quantity: string; unit_price: string }[];
    // included = งานเพิ่มนี้มีในแพ็กแล้ว · not_available = ใช้กับแพ็กนี้ไม่ได้
    addon_rules: { product_id: string; rule: "included" | "not_available" }[];
};

/** รายการที่ทีมเลือกให้ในลิงก์ (ล็อก) */
export type PresetItem = { kind: "product"; quantity: number; product: CatalogProduct } | { kind: "package"; quantity: number; package: CatalogPackage };

export type Catalog = {
    categories: { pc_id: string; pc_name: string; pc_is_single_choice: boolean }[];
    products: CatalogProduct[];
    packages: CatalogPackage[];
};

export type ContactPrefill = {
    contact_name: string;
    contact_phone: string;
    contact_email: string;
    company_name: string;
    wants_tax_invoice: boolean;
    tax_id: string;
    address: string;
};

// คำถามความต้องการ (2026-10-26 Q-1 · docs/plans/2026-10-26-customer-questions.md) · ชื่อฟิลด์ตามคอลัมน์ฐานข้อมูล
export type RequirementQuestion = {
    rqq_id: number;
    rqq_group_id: number;
    rqq_text: string;
    rqq_help: string | null;
    rqq_placeholder: string | null;
    rqq_type: "short_text" | "long_text" | "single" | "multi" | "yes_no" | "number" | "date" | "url" | "file";
    rqq_options: string[] | null;
    rqq_allow_other: boolean;
    rqq_unit: string | null;
    rqq_min: string | null;
    rqq_max: string | null;
    rqq_future_only: boolean;
    rqq_file_kind: "document" | "design";
    rqq_is_required: boolean;
    rqq_parent_id: number | null;
    rqq_parent_values: string[];
    rqq_audience: "group" | "direct" | "fastwork";
    rqq_skip_when_preset: boolean;
    rqq_prefill: boolean;
    rqq_sort_order: number;
    rqq_status: "active" | "inactive";
    // หน้าตั้งค่าเท่านั้น: มีคนตอบข้อนี้แล้วกี่คำขอ
    answer_count?: number;
};

export type RequirementGroup = {
    rqg_id: number;
    rqg_name: string;
    rqg_customer_intro: string | null;
    rqg_description: string | null;
    rqg_trigger: "always" | "selection" | "link_only";
    rqg_audience: "all" | "direct" | "fastwork";
    rqg_sort_order: number;
    rqg_status: "active" | "inactive";
    category_ids: string[];
    package_ids: string[];
    product_ids: string[];
    questions: RequirementQuestion[];
};

/** กลุ่มที่ลูกค้าเห็น (ผล visibleQuestionnaire) · matched = รายการที่ทำให้กลุ่มนี้ขึ้น */
export type VisibleRequirementGroup = RequirementGroup & {
    matched: { category_ids: string[]; package_ids: string[]; product_ids: string[] };
};

/** กลุ่มที่ลิงก์นี้ถามเพิ่ม / ไม่ถาม (Q-3) */
export type QuestionRules = { include_group_ids: number[]; exclude_group_ids: number[] };

export type RequestAnswer = {
    group_name: string;
    question: string;
    type: string;
    answer: string | null;
    // is_viewable = เปิดในแท็บได้ (รูป/PDF) · ไฟล์งานออกแบบต้องดาวน์โหลด
    files: { id: number; name: string; size: number; is_viewable: boolean }[];
};

export type ShopResponse = {
    shop: ShopInfo;
    link: { kind: LinkKind; state: LinkState };
    submitted_token?: string;
    buyer_name?: string | null;
    vat_rate?: string | null;
    catalog?: Catalog;
    preset?: PresetItem[];
    allow_more?: boolean;
    prefill?: ContactPrefill | null;
    questionnaire?: RequirementGroup[];
    question_rules?: QuestionRules;
    // ลิงก์เฉพาะลูกค้า: คำตอบล่าสุดของลูกค้าคนนี้ สำหรับข้อที่เปิด "เติมคำตอบเดิม" (Q-4)
    answer_prefill?: Record<number, { value: string | string[]; other_text: string | null }>;
};

// ตะกร้า: รหัส → จำนวน (สินค้าใช้ "p:<id>" · ชุดใช้ "k:<id>")
export type Cart = Record<string, number>;

// ขั้นที่ลูกค้าเห็น (S-4) — ดูความหมายที่ progressOf ใน order-public.service.js
export type RequestStage = "submitted" | "preparing" | "quotation" | "accepted" | "started" | "expired" | "contact" | "closed" | "fastwork_confirmed";

export type CustomerQuotation = {
    number: string;
    title: string;
    currency: string;
    issue_date: string;
    valid_until: string | null;
    subtotal: string;
    discount: string;
    after_discount: string;
    vat_rate: string | null;
    vat: string;
    total: string;
    terms: string | null;
    items: { type: "heading" | "item" | "note"; description: string; quantity: string | null; unit: string | null; unit_price: string | null; discount: string | null; amount: string | null }[];
    milestones: { name: string; percent: string | null; amount: string }[];
};

export type RequestProgress = {
    stage: RequestStage;
    quotation?: CustomerQuotation;
    share_token?: string | null;
    accepted_name?: string | null;
    accepted_at?: string | null;
};

export type RequestStatusResponse = {
    shop: ShopInfo;
    request: {
        number: string;
        kind: LinkKind;
        contact_name: string | null;
        note: string | null;
        submitted_at: string;
        vat_rate: string | null;
    };
    items: {
        type: "item" | "heading";
        package_id: string | null;
        name: string;
        unit: string | null;
        unit_price: string | null;
        quantity: string;
        percent: string | null;
        is_preset: boolean;
    }[];
    totals: { subtotal: string; vat: string; total: string };
    answers: RequestAnswer[];
    progress: RequestProgress;
};
