"use client";

// ปรับรายการในคำขอ (2026-10-25 · S-3) — แก้จำนวน/ราคา เอาออก เพิ่มรายการ (จากสินค้าในระบบหรือพิมพ์เอง)
// แถวของลูกค้าเก็บค่าเดิมไว้เสมอ (เอาออก = ขีดฆ่า กดคืนได้) · ยอดคิดสดด้วยสูตรเดียวกับหน้าร้าน
import { useState } from "react";
import { toast } from "sonner";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { inputClass } from "@/components/ui/form-field";
import FieldHint from "@/components/ui/guidance/field-hint";
import StatusBanner from "@/components/ui/guidance/status-banner";
import SearchableSelect, { type SelectOption } from "@/components/ui/SearchableSelect";
import { buttonClass } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { formatAmount, trimQuantity } from "@/lib/shared/money.mjs";
import { cartTotals, fixedSubtotal, lineAmount, percentAmount } from "@/lib/shared/order-cart-math.mjs";
import { serviceRequestItemsSchema } from "@/lib/shared/schemas/service-request.mjs";
import type { ServiceRequestItem } from "../../order-links/_types";

type EditRow = {
    key: string;
    svi_id: number | null;
    product_id: string | null;
    name: string;
    unit: string;
    unit_price: string;
    quantity: string;
    is_removed: boolean;
    packageName: string | null;
    // งานเพิ่มแบบ %: ราคา/จำนวนแก้ไม่ได้ (คิดจากแถวอื่น) · เอาออก/คืนได้
    percent: string | null;
    isPreset: boolean;
};

type ProductChoice = { product_id: string; product_name: string; product_unit: string | null; product_price: string };

// ตัวเลขที่ยังพิมพ์ไม่ครบ → คิดเป็น 0 ระหว่างพิมพ์
function liveValue(value: string) {
    const text = value.trim().replace(/,/g, "");
    return /^\d+(\.\d{1,2})?$/.test(text) ? text : "0";
}

export default function ItemsEditor({
    requestId,
    version,
    items,
    vatRate,
    onSaved,
    onCancel,
}: {
    requestId: string;
    version: number;
    items: ServiceRequestItem[];
    vatRate: string | null;
    onSaved: () => Promise<void>;
    onCancel: () => void;
}) {
    const packageNames = new Map(items.filter((row) => row.svi_type === "heading").map((row) => [row.svi_package_id, row.svi_name]));
    const [rows, setRows] = useState<EditRow[]>(() =>
        items
            .filter((row) => row.svi_type === "item")
            .map((row) => ({
                key: String(row.svi_id),
                svi_id: row.svi_added_by_staff ? null : row.svi_id,
                product_id: row.svi_product_id,
                name: row.svi_name,
                unit: row.svi_unit ?? "",
                unit_price: row.svi_adjusted_unit_price ?? row.svi_unit_price ?? "0",
                quantity: trimQuantity(row.svi_adjusted_quantity ?? row.svi_quantity ?? "1"),
                is_removed: row.svi_is_removed,
                packageName: row.svi_package_id ? packageNames.get(row.svi_package_id) ?? null : null,
                percent: row.svi_percent,
                isPreset: row.svi_is_preset,
            })),
    );
    const [productChoice, setProductChoice] = useState("");
    const [choices, setChoices] = useState<Map<string, ProductChoice>>(new Map());
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    function update(key: string, changes: Partial<EditRow>) {
        setRows((current) => current.map((row) => (row.key === key ? { ...row, ...changes } : row)));
    }

    async function loadProducts(search: string): Promise<SelectOption[]> {
        const query = new URLSearchParams({ limit: "20", offset: "0", search, status: "active" });
        const { data } = await apiFetch<{ data: ProductChoice[] }>(`/products?${query}`);
        const list = data?.data ?? [];
        setChoices((current) => new Map([...current, ...list.map((product) => [product.product_id, product] as const)]));
        return list.map((product) => ({ value: product.product_id, label: `${product.product_name} · ${formatAmount(product.product_price)}` }));
    }

    function addProduct(productId: string) {
        const product = choices.get(productId);
        if (!product) return;
        setRows((current) => [
            ...current,
            { key: `new-${Date.now()}`, svi_id: null, product_id: product.product_id, name: product.product_name, unit: product.product_unit ?? "", unit_price: product.product_price, quantity: "1", is_removed: false, packageName: null, percent: null, isPreset: false },
        ]);
        setProductChoice("");
    }

    function addBlank() {
        setRows((current) => [...current, { key: `new-${Date.now()}`, svi_id: null, product_id: null, name: "", unit: "", unit_price: "0", quantity: "1", is_removed: false, packageName: null, percent: null, isPreset: false }]);
    }

    async function save() {
        setError(null);
        const body = {
            svr_version: version,
            items: rows.map((row) => ({ svi_id: row.svi_id, product_id: row.product_id, name: row.name, unit: row.unit, unit_price: row.unit_price, quantity: row.quantity, is_removed: row.is_removed })),
        };
        const checked = serviceRequestItemsSchema.safeParse(body);
        if (!checked.success) {
            setError(checked.error.issues[0]?.message ?? "ตรวจข้อมูลในตารางอีกครั้ง");
            return;
        }
        setIsSaving(true);
        const { error: saveError } = await apiFetch(`/service-requests/${encodeURIComponent(requestId)}/items`, { method: "PUT", body: checked.data });
        setIsSaving(false);
        if (saveError) {
            setError(Object.values(saveError.fields)[0] ?? saveError.message);
            return;
        }
        toast.success("บันทึกรายการแล้ว");
        await onSaved();
    }

    // แถว %: คิดจากแถวราคาตายตัวที่เหลือ (สูตรเดียวกับ backend)
    const pricedLines = rows
        .filter((row) => !row.is_removed)
        .map((row) => (row.percent ? { percent: row.percent } : { unitPrice: liveValue(row.unit_price), quantity: liveValue(row.quantity) }));
    const totals = cartTotals({ lines: pricedLines, vatRate });
    const fixedBase = fixedSubtotal(pricedLines);
    const amountOf = (row: EditRow) => (row.percent ? percentAmount(fixedBase, row.percent) : lineAmount(liveValue(row.unit_price), liveValue(row.quantity)));

    return (
        <div className="grid gap-3">
            {error && (
                <StatusBanner tone="error" title="บันทึกไม่สำเร็จ">
                    {error}
                </StatusBanner>
            )}
            <ul className="grid gap-2">
                {rows.map((row) => (
                    <li key={row.key} className={`grid gap-2 rounded-xl border p-3 sm:grid-cols-[minmax(0,1fr)_7rem_8rem_auto] sm:items-center ${row.is_removed ? "border-gray-100 bg-gray-50" : "border-gray-200"}`}>
                        <div className="grid min-w-0 gap-1">
                            {row.svi_id === null && !row.product_id ? (
                                <input aria-label="ชื่อรายการ" value={row.name} maxLength={200} placeholder="ชื่อรายการ" onChange={(event) => update(row.key, { name: event.target.value })} className={inputClass(false, "sm")} />
                            ) : (
                                <span className={`text-sm wrap-break-word ${row.is_removed ? "text-gray-400 line-through" : "text-gray-900"}`}>{row.name}</span>
                            )}
                            <span className="text-xs text-gray-500">
                                {[row.packageName ? `ในชุด ${row.packageName}` : null, row.svi_id === null ? "เพิ่มโดยทีมงาน" : null, row.isPreset ? "ทีมงานเลือกให้ในลิงก์" : null, row.percent ? `+${Number(row.percent)}% ของยอด (แก้ราคา/จำนวนไม่ได้)` : null].filter(Boolean).join(" · ")}
                            </span>
                        </div>
                        <label className="grid gap-0.5 text-xs text-gray-500">
                            จำนวน
                            <input inputMode="decimal" disabled={row.is_removed || Boolean(row.percent)} value={row.percent ? "1" : row.quantity} onChange={(event) => update(row.key, { quantity: event.target.value })} className={inputClass(false, "sm")} />
                        </label>
                        <label className="grid gap-0.5 text-xs text-gray-500">
                            ราคาต่อหน่วย
                            <input inputMode="decimal" disabled={row.is_removed || Boolean(row.percent)} value={row.percent ? `${Number(row.percent)}%` : row.unit_price} onChange={(event) => update(row.key, { unit_price: event.target.value })} className={inputClass(false, "sm")} />
                        </label>
                        <div className="flex items-center justify-between gap-2 sm:justify-end">
                            <span className="text-sm text-gray-700 tabular-nums">{row.is_removed ? "-" : formatAmount(amountOf(row))}</span>
                            {row.svi_id === null ? (
                                <button type="button" aria-label="เอาแถวนี้ออก" className={buttonClass("ghost", "sm")} onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}>
                                    <Trash2 size={15} />
                                </button>
                            ) : (
                                <button type="button" aria-label={row.is_removed ? "คืนรายการ" : "เอารายการนี้ออก"} className={buttonClass("ghost", "sm")} onClick={() => update(row.key, { is_removed: !row.is_removed })}>
                                    {row.is_removed ? <RotateCcw size={15} /> : <Trash2 size={15} />}
                                </button>
                            )}
                        </div>
                    </li>
                ))}
            </ul>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <SearchableSelect loadOptions={loadProducts} value={productChoice} onChange={addProduct} placeholder="+ เพิ่มจากสินค้า/บริการ" />
                <button type="button" className={buttonClass("secondary", "md")} onClick={addBlank}>
                    <Plus size={16} />
                    พิมพ์รายการเอง
                </button>
            </div>
            <div className="grid gap-1 rounded-xl bg-gray-50 p-3 text-sm">
                <div className="flex justify-between gap-3 text-gray-700">
                    <span>รวม</span>
                    <span className="tabular-nums">{formatAmount(totals.subtotal)}</span>
                </div>
                {vatRate && (
                    <div className="flex justify-between gap-3 text-gray-700">
                        <span>+ VAT {Number(vatRate)}%</span>
                        <span className="tabular-nums">{formatAmount(totals.vat)}</span>
                    </div>
                )}
                <div className="flex justify-between gap-3 border-t border-gray-200 pt-1.5 font-medium text-gray-900">
                    <span>= ยอดหลังปรับ</span>
                    <span className="tabular-nums">{formatAmount(totals.total)}</span>
                </div>
                <FieldHint>ลูกค้ายังเห็นยอดที่ตัวเองส่ง · ยอดหลังปรับใช้ออกใบเสนอราคา/เปิดโปรเจกต์</FieldHint>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
                <button type="button" className={buttonClass("secondary", "md")} onClick={onCancel}>
                    ยกเลิก
                </button>
                <button type="button" className={buttonClass("primary", "md")} disabled={isSaving} onClick={save}>
                    {isSaving ? "กำลังบันทึก..." : "บันทึกรายการ"}
                </button>
            </div>
        </div>
    );
}
