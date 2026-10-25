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

export type RequirementQuestion = {
    rqq_id: number;
    rqq_text: string;
    rqq_help: string | null;
    rqq_type: "short_text" | "long_text" | "single" | "multi" | "yes_no" | "number" | "date" | "url" | "file";
    rqq_options: string[] | null;
    rqq_is_required: boolean;
};

export type RequirementGroup = {
    rqg_id: number;
    rqg_name: string;
    rqg_is_general: boolean;
    category_ids: string[];
    package_ids: string[];
    questions: RequirementQuestion[];
};

export type RequestAnswer = {
    group_name: string;
    question: string;
    type: string;
    answer: string | null;
    files: { id: number; name: string; size: number }[];
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
