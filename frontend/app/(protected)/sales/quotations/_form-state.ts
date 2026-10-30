// สถานะของฟอร์มใบเสนอราคา — ช่องตัวเลขเก็บเป็นข้อความตามที่ผู้ใช้พิมพ์ · แปลงเป็นรูปของ API ที่ toPayload เท่านั้น
import { trimQuantity } from "@/lib/shared/money.mjs";
import type { DiscountType, ItemType, QuotationDetail } from "./_types";

export type ItemForm = {
    rowKey: string;
    qti_type: ItemType;
    qti_product_id: string | null;
    qti_package_id: string | null;
    qti_description: string;
    qti_quantity: string;
    qti_unit: string;
    qti_unit_price: string;
    qti_list_price: string;
    qti_discount_type: DiscountType;
    qti_discount_value: string;
    // ราคาบาทของสินค้าตอนเพิ่ม (ไม่ส่งไป API) — ใช้แปลงราคาใหม่เมื่อเปลี่ยนอัตราแลกเปลี่ยน
    baht_price: string | null;
};

export type MilestoneForm = {
    rowKey: string;
    qtm_name: string;
    qtm_condition: string;
    mode: "percent" | "amount";
    value: string;
};

export type QuotationForm = {
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
    qt_rate_override_reason: string;
    qt_vat_treatment: "standard" | "zero";
    qt_valid_days: string;
    qt_payment_mode: "single" | "milestones";
    qt_discount_type: DiscountType;
    qt_discount_value: string;
    qt_terms: string;
    qt_internal_note: string;
    qt_version: number | null;
    items: ItemForm[];
    milestones: MilestoneForm[];
};

let rowNumber = 0;
export function newRowKey() {
    rowNumber += 1;
    return `row-${rowNumber}`;
}

export function emptyItem(type: ItemType): ItemForm {
    return {
        rowKey: newRowKey(),
        qti_type: type,
        qti_product_id: null,
        qti_package_id: null,
        qti_description: "",
        qti_quantity: type === "item" ? "1" : "",
        qti_unit: "",
        qti_unit_price: "",
        qti_list_price: "",
        qti_discount_type: "amount",
        qti_discount_value: "",
        baht_price: null,
    };
}

export function emptyMilestone(): MilestoneForm {
    return { rowKey: newRowKey(), qtm_name: "", qtm_condition: "", mode: "percent", value: "" };
}

export function emptyForm(defaults: { branchId: string; validDays: number; terms: string }): QuotationForm {
    return {
        qt_client_id: "",
        qt_branch_id: defaults.branchId,
        qt_project_id: null,
        qt_title: "",
        qt_language: "th",
        qt_currency: "THB",
        qt_exchange_rate: "1",
        qt_rate_source: null,
        qt_rate_date: null,
        qt_rate_bot: null,
        qt_rate_override_reason: "",
        qt_vat_treatment: "standard",
        qt_valid_days: String(defaults.validDays),
        qt_payment_mode: "single",
        qt_discount_type: "amount",
        qt_discount_value: "",
        qt_terms: defaults.terms,
        qt_internal_note: "",
        qt_version: null,
        items: [emptyItem("item")],
        milestones: [],
    };
}

// ค่าจากฐานข้อมูล "0.00" ในช่องที่ไม่บังคับ → แสดงเป็นช่องว่าง (ไม่ให้ผู้ใช้ต้องลบเลข 0 ก่อนพิมพ์)
function blankIfZero(value: string | null) {
    if (value === null) return "";
    return Number(value) === 0 ? "" : value;
}

export function formFromDetail(detail: QuotationDetail): QuotationForm {
    const quotation = detail.quotation;
    return {
        qt_client_id: quotation.qt_client_id,
        qt_branch_id: quotation.qt_branch_id,
        qt_project_id: quotation.qt_project_id,
        qt_title: quotation.qt_title,
        qt_language: quotation.qt_language,
        qt_currency: quotation.qt_currency,
        qt_exchange_rate: quotation.qt_exchange_rate,
        qt_rate_source: quotation.qt_rate_source,
        qt_rate_date: quotation.qt_rate_date,
        qt_rate_bot: quotation.qt_rate_bot,
        qt_rate_override_reason: quotation.qt_rate_override_reason ?? "",
        qt_vat_treatment: quotation.qt_vat_treatment,
        qt_valid_days: String(quotation.qt_valid_days),
        qt_payment_mode: quotation.qt_payment_mode,
        qt_discount_type: quotation.qt_discount_type,
        qt_discount_value: blankIfZero(quotation.qt_discount_value),
        qt_terms: quotation.qt_terms ?? "",
        qt_internal_note: quotation.qt_internal_note ?? "",
        qt_version: quotation.qt_version,
        items: detail.items.map((item) => ({
            rowKey: newRowKey(),
            qti_type: item.qti_type,
            qti_product_id: item.qti_product_id,
            qti_package_id: item.qti_package_id,
            qti_description: item.qti_description,
            qti_quantity: trimQuantity(item.qti_quantity),
            qti_unit: item.qti_unit ?? "",
            qti_unit_price: item.qti_unit_price ?? "",
            qti_list_price: item.qti_list_price ?? "",
            qti_discount_type: item.qti_discount_type,
            qti_discount_value: blankIfZero(item.qti_discount_value),
            baht_price: item.product_price,
        })),
        // เก็บเงินครั้งเดียว: backend เก็บงวด "ชำระเต็มจำนวน 100%" ไว้ให้ใบแจ้งหนี้อ้าง — ไม่ใช่งวดที่ผู้ใช้กรอก จึงไม่โหลดเข้าฟอร์ม
        milestones: (detail.quotation.qt_payment_mode === "milestones" ? detail.milestones : []).map((milestone) => ({
            rowKey: newRowKey(),
            qtm_name: milestone.qtm_name,
            qtm_condition: milestone.qtm_condition ?? "",
            mode: milestone.qtm_percent !== null ? "percent" : "amount",
            value: milestone.qtm_percent ?? milestone.qtm_amount,
        })),
    };
}

function textOrNull(value: string) {
    return value.trim() === "" ? null : value.trim();
}

/** ฟอร์ม → body ของ POST/PUT /quotations (ตรวจซ้ำด้วย quotationDraftSchema ก่อนส่ง) */
export function toPayload(form: QuotationForm) {
    const validDays = form.qt_valid_days.trim() === "" ? Number.NaN : Number(form.qt_valid_days);
    return {
        qt_client_id: form.qt_client_id,
        qt_branch_id: form.qt_branch_id,
        qt_project_id: form.qt_project_id,
        qt_title: form.qt_title,
        qt_language: form.qt_language,
        qt_currency: form.qt_currency,
        qt_exchange_rate: form.qt_exchange_rate,
        qt_rate_source: form.qt_currency === "THB" ? null : form.qt_rate_source,
        qt_rate_date: form.qt_rate_date,
        qt_rate_override_reason: textOrNull(form.qt_rate_override_reason),
        qt_vat_treatment: form.qt_vat_treatment,
        qt_valid_days: validDays,
        qt_payment_mode: form.qt_payment_mode,
        qt_discount_type: form.qt_discount_type,
        qt_discount_value: form.qt_discount_value.trim() || "0",
        qt_terms: textOrNull(form.qt_terms),
        qt_internal_note: textOrNull(form.qt_internal_note),
        qt_version: form.qt_version,
        items: form.items.map((item) => ({
            qti_type: item.qti_type,
            qti_product_id: item.qti_product_id,
            qti_package_id: item.qti_package_id,
            qti_description: item.qti_description,
            qti_quantity: textOrNull(item.qti_quantity),
            qti_unit: textOrNull(item.qti_unit),
            qti_unit_price: textOrNull(item.qti_unit_price),
            qti_list_price: textOrNull(item.qti_list_price),
            qti_discount_type: item.qti_discount_type,
            qti_discount_value: item.qti_discount_value.trim() || "0",
        })),
        milestones: form.milestones.map((milestone) => ({
            qtm_name: milestone.qtm_name,
            qtm_condition: textOrNull(milestone.qtm_condition),
            qtm_percent: milestone.mode === "percent" ? textOrNull(milestone.value) : null,
            qtm_amount: milestone.mode === "amount" ? textOrNull(milestone.value) : null,
        })),
    };
}
