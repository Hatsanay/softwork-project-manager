"use client";

// ตัวแก้แถวในชุดรายการ (ปรับหน้า 2026-10-30): จอกว้างเป็นตาราง (รายการ · จำนวน · หน่วย · ราคา/หน่วย · รวม) · มือถือเรียงลงทีละแถว
// ชนิดแถวเปลี่ยนได้ที่ช่องหน้าสุด · เลื่อนขึ้นลง ลบ · error ของแต่ละช่องมาจาก "items.<ลำดับ>.<ช่อง>"
import { ArrowDown, ArrowUp, Heading, ListPlus, StickyNote, Trash2 } from "lucide-react";
import FieldHint from "@/components/ui/guidance/field-hint";
import SearchableSelect, { type SelectOption } from "@/components/ui/SearchableSelect";
import { buttonClass } from "@/components/ui/button";
import { inputClass } from "@/components/ui/form-field";
import type { FieldErrors } from "@/lib/form-errors";
import { formatAmount, formatHundredths } from "@/lib/shared/money.mjs";
import { lineAmount } from "@/lib/shared/order-cart-math.mjs";
import { MAX_PACKAGE_ITEMS } from "@/lib/shared/schemas/product.mjs";
import { PRODUCT_MESSAGES } from "../_messages";
import type { PackageItemType } from "../_types";

export type PackageItemForm = {
    rowKey: string;
    pki_type: PackageItemType;
    pki_product_id: string;
    pki_description: string;
    pki_quantity: string;
    pki_unit: string;
    pki_unit_price: string;
};

// ข้อมูลสินค้าที่แถวต้องใช้ (ชื่อ หน่วย ราคาปัจจุบัน) · รวมสินค้าที่ปิดใช้งานแล้วที่แถวเดิมอ้างอยู่
export type ProductChoice = {
    product_id: string;
    product_name: string;
    product_code: string | null;
    product_unit: string | null;
    product_price: string;
    product_status: "active" | "inactive";
};

const TYPE_LABELS: Record<PackageItemType, string> = { item: "รายการ", heading: "หัวข้อ", note: "หมายเหตุ" };

// คอลัมน์ของจอกว้าง: # · รายการ · จำนวน · หน่วย · ราคา/หน่วย · รวม · ปุ่ม (หัวตารางกับแถวใช้ชุดเดียวกัน)
const ROW_COLUMNS = "md:grid-cols-[1.5rem_minmax(0,1fr)_5rem_5.5rem_7rem_7rem_6.5rem]";

let nextRowNumber = 0;
export function newRowKey() {
    nextRowNumber += 1;
    return `row-${nextRowNumber}`;
}

export function emptyItem(type: PackageItemType): PackageItemForm {
    return {
        rowKey: newRowKey(),
        pki_type: type,
        pki_product_id: "",
        pki_description: "",
        pki_quantity: type === "item" ? "1" : "",
        pki_unit: "",
        pki_unit_price: "",
    };
}

/**
 * ยอดของแถวรายการ · แถวที่อ้างสินค้าใช้ราคาปัจจุบันของสินค้า
 * null = ยังคิดไม่ได้ (จำนวน/ราคาว่างหรือไม่ใช่ตัวเลข) · "skipped" = สินค้าปิดใช้งาน ใส่ใบแล้วจะถูกข้าม
 */
function rowAmount(item: PackageItemForm, product: ProductChoice | undefined): bigint | null | "skipped" {
    if (item.pki_type !== "item") return null;
    if (product?.product_status === "inactive") return "skipped";
    const unitPrice = product ? product.product_price : item.pki_unit_price;
    try {
        return lineAmount(unitPrice, item.pki_quantity);
    } catch {
        return null;
    }
}

/** ราคาชุดตอนนี้ (ผลรวมแถวรายการที่คิดได้) และจำนวนแถวรายการที่ยังคิดไม่ได้ · สูตรเดียวกับรายการชุดในหน้าสินค้า */
export function packageTotalOf(items: PackageItemForm[], products: ProductChoice[]) {
    const productById = new Map(products.map((product) => [product.product_id, product]));
    let total = 0n;
    let incompleteCount = 0;
    for (const item of items) {
        if (item.pki_type !== "item") continue;
        const amount = rowAmount(item, item.pki_product_id ? productById.get(item.pki_product_id) : undefined);
        if (amount === "skipped") continue;
        if (amount === null) incompleteCount += 1;
        else total += amount;
    }
    return { total, incompleteCount };
}

type PackageItemsEditorProps = {
    items: PackageItemForm[];
    onChange: (items: PackageItemForm[]) => void;
    products: ProductChoice[];
    fieldErrors: FieldErrors;
};

export default function PackageItemsEditor({ items, onChange, products, fieldErrors }: PackageItemsEditorProps) {
    const productById = new Map(products.map((product) => [product.product_id, product]));
    const isFull = items.length >= MAX_PACKAGE_ITEMS;

    function productOptions(currentProductId: string): SelectOption[] {
        return products
            .filter((product) => product.product_status === "active" || product.product_id === currentProductId)
            .map((product) => ({
                value: product.product_id,
                label: `${product.product_code ? `${product.product_code} · ` : ""}${product.product_name} · ${formatAmount(product.product_price)}${
                    product.product_status === "active" ? "" : " (ปิดใช้งาน)"
                }`,
            }));
    }

    function updateItem(index: number, changes: Partial<PackageItemForm>) {
        onChange(items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...changes } : item)));
    }

    // เลือกสินค้า: เติมชื่อและหน่วยให้ (แก้ต่อได้) · ราคาใช้ของสินค้าตอนกดใส่ใบ จึงล้างราคาในแถว
    function selectProduct(index: number, productId: string) {
        const product = productById.get(productId);
        if (!product) {
            updateItem(index, { pki_product_id: "" });
            return;
        }
        const current = items[index];
        updateItem(index, {
            pki_product_id: productId,
            pki_description: current.pki_description.trim() ? current.pki_description : product.product_name,
            pki_unit: current.pki_unit.trim() ? current.pki_unit : (product.product_unit ?? ""),
            pki_unit_price: "",
        });
    }

    function moveItem(index: number, offset: -1 | 1) {
        const targetIndex = index + offset;
        if (targetIndex < 0 || targetIndex >= items.length) return;
        const reordered = [...items];
        [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
        onChange(reordered);
    }

    function removeItem(index: number) {
        onChange(items.filter((_, itemIndex) => itemIndex !== index));
    }

    function addItem(type: PackageItemType) {
        if (isFull) return;
        onChange([...items, emptyItem(type)]);
    }

    function errorOf(index: number, field: keyof PackageItemForm) {
        return fieldErrors[`items.${index}.${field}`];
    }

    return (
        <div className="grid gap-3">
            <FieldHint id="items-hint" error={fieldErrors.items}>
                {PRODUCT_MESSAGES.packages.items}
            </FieldHint>

            <div
                className={`hidden gap-x-2 border border-transparent px-3 text-xs text-gray-500 md:grid ${ROW_COLUMNS}`}
                aria-hidden="true"
            >
                <span>#</span>
                <span>รายการ</span>
                <span>จำนวน</span>
                <span>หน่วย</span>
                <span className="text-right">ราคา/หน่วย</span>
                <span className="text-right">รวม (บาท)</span>
                <span />
            </div>

            <ol className="grid gap-2">
                {items.map((item, index) => {
                    const isItemRow = item.pki_type === "item";
                    const product = item.pki_product_id ? productById.get(item.pki_product_id) : undefined;
                    const amount = rowAmount(item, product);
                    const rowErrors = [
                        errorOf(index, "pki_product_id"),
                        errorOf(index, "pki_description"),
                        errorOf(index, "pki_quantity"),
                        errorOf(index, "pki_unit"),
                        errorOf(index, "pki_unit_price"),
                    ].filter(Boolean);
                    const descriptionRows = Math.min(6, Math.max(1, item.pki_description.split("\n").length));

                    return (
                        <li
                            key={item.rowKey}
                            className={`grid gap-2 rounded-xl border p-3 ${
                                item.pki_type === "heading"
                                    ? "border-blue-100 bg-blue-50/60"
                                    : item.pki_type === "note"
                                      ? "border-gray-200 bg-gray-50"
                                      : "border-gray-200 bg-white"
                            }`}
                        >
                            <div className={`grid gap-2 md:items-start md:gap-x-2 ${ROW_COLUMNS}`}>
                                <span className="hidden pt-2.5 text-xs text-gray-400 tabular-nums md:block">
                                    {index + 1}
                                </span>

                                <div className={`grid min-w-0 gap-2 ${isItemRow ? "" : "md:col-span-5"}`}>
                                    <div className="flex min-w-0 gap-2">
                                        <span className="pt-2.5 text-xs text-gray-400 tabular-nums md:hidden">
                                            {index + 1}
                                        </span>
                                        <select
                                            aria-label={`ชนิดของแถวที่ ${index + 1}`}
                                            value={item.pki_type}
                                            onChange={(event) =>
                                                updateItem(index, { pki_type: event.target.value as PackageItemType })
                                            }
                                            className={`${inputClass(false, "tight")} w-24! shrink-0`}
                                        >
                                            {(Object.keys(TYPE_LABELS) as PackageItemType[]).map((type) => (
                                                <option key={type} value={type}>
                                                    {TYPE_LABELS[type]}
                                                </option>
                                            ))}
                                        </select>
                                        <div className="min-w-0 flex-1">
                                            {isItemRow ? (
                                                <SearchableSelect
                                                    options={productOptions(item.pki_product_id)}
                                                    value={item.pki_product_id}
                                                    onChange={(productId) => selectProduct(index, productId)}
                                                    placeholder="ไม่เลือกสินค้า (กรอกราคาเอง)"
                                                    error={Boolean(errorOf(index, "pki_product_id"))}
                                                />
                                            ) : (
                                                <textarea
                                                    aria-label={`ข้อความของแถวที่ ${index + 1}`}
                                                    rows={descriptionRows}
                                                    placeholder={
                                                        item.pki_type === "heading"
                                                            ? "เช่น ค่าพัฒนาระบบ"
                                                            : "เช่น ราคานี้ไม่รวมค่าเนื้อหา"
                                                    }
                                                    value={item.pki_description}
                                                    onChange={(event) =>
                                                        updateItem(index, { pki_description: event.target.value })
                                                    }
                                                    className={`${inputClass(Boolean(errorOf(index, "pki_description")))} field-sizing-content resize-none ${
                                                        item.pki_type === "heading" ? "font-medium!" : ""
                                                    }`}
                                                />
                                            )}
                                        </div>
                                    </div>
                                    {isItemRow && (
                                        <textarea
                                            aria-label={`รายละเอียดของแถวที่ ${index + 1}`}
                                            rows={descriptionRows}
                                            placeholder="รายละเอียดที่จะพิมพ์บนเอกสาร"
                                            value={item.pki_description}
                                            onChange={(event) =>
                                                updateItem(index, { pki_description: event.target.value })
                                            }
                                            className={`${inputClass(Boolean(errorOf(index, "pki_description")))} field-sizing-content resize-none`}
                                        />
                                    )}
                                    {product?.product_status === "inactive" && (
                                        <p className="text-xs text-amber-600">
                                            สินค้านี้ปิดใช้งานแล้ว ตอนใส่ใบเสนอราคาแถวนี้จะถูกข้าม
                                        </p>
                                    )}
                                </div>

                                {isItemRow && (
                                    <div className="grid grid-cols-3 gap-2 md:contents">
                                        <label className="grid min-w-0 gap-1 text-xs text-gray-600 md:block">
                                            <span className="md:sr-only">จำนวน</span>
                                            <input
                                                inputMode="decimal"
                                                value={item.pki_quantity}
                                                onChange={(event) =>
                                                    updateItem(index, { pki_quantity: event.target.value })
                                                }
                                                className={`${inputClass(Boolean(errorOf(index, "pki_quantity")), "tight")} text-right tabular-nums`}
                                            />
                                        </label>
                                        <label className="grid min-w-0 gap-1 text-xs text-gray-600 md:block">
                                            <span className="md:sr-only">หน่วย</span>
                                            <input
                                                value={item.pki_unit}
                                                onChange={(event) =>
                                                    updateItem(index, { pki_unit: event.target.value })
                                                }
                                                className={inputClass(Boolean(errorOf(index, "pki_unit")), "tight")}
                                            />
                                        </label>
                                        <label className="grid min-w-0 gap-1 text-xs text-gray-600 md:block">
                                            <span className="md:sr-only">ราคา/หน่วย</span>
                                            <input
                                                inputMode="decimal"
                                                value={
                                                    product ? formatAmount(product.product_price) : item.pki_unit_price
                                                }
                                                disabled={Boolean(product)}
                                                aria-label={
                                                    product ? "ราคาปัจจุบันของสินค้า (แก้ที่สินค้า)" : undefined
                                                }
                                                onChange={(event) =>
                                                    updateItem(index, { pki_unit_price: event.target.value })
                                                }
                                                className={`${inputClass(Boolean(errorOf(index, "pki_unit_price")), "tight")} text-right tabular-nums`}
                                            />
                                        </label>
                                    </div>
                                )}

                                <div className="flex items-center justify-between gap-2 md:contents">
                                    {isItemRow ? (
                                        <span className="text-sm text-gray-900 tabular-nums md:pt-2.5 md:pr-2 md:text-right">
                                            <span className="text-gray-500 md:hidden">รวม </span>
                                            {amount === "skipped" ? (
                                                <span className="text-amber-600">ข้าม</span>
                                            ) : amount === null ? (
                                                "-"
                                            ) : (
                                                formatAmount(formatHundredths(amount))
                                            )}
                                        </span>
                                    ) : (
                                        <span className="md:hidden" />
                                    )}
                                    <div className="flex justify-end gap-0.5">
                                        <button
                                            type="button"
                                            aria-label={`เลื่อนแถวที่ ${index + 1} ขึ้น`}
                                            className={buttonClass("ghost", "sm")}
                                            onClick={() => moveItem(index, -1)}
                                            disabled={index === 0}
                                        >
                                            <ArrowUp size={16} />
                                        </button>
                                        <button
                                            type="button"
                                            aria-label={`เลื่อนแถวที่ ${index + 1} ลง`}
                                            className={buttonClass("ghost", "sm")}
                                            onClick={() => moveItem(index, 1)}
                                            disabled={index === items.length - 1}
                                        >
                                            <ArrowDown size={16} />
                                        </button>
                                        <button
                                            type="button"
                                            aria-label={`ลบแถวที่ ${index + 1}`}
                                            className={`${buttonClass("ghost", "sm")} hover:text-red-600`}
                                            onClick={() => removeItem(index)}
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {rowErrors.length > 0 && (
                                <p role="alert" className="text-xs text-red-600 md:pl-8">
                                    {rowErrors.join(" · ")}
                                </p>
                            )}
                        </li>
                    );
                })}
            </ol>

            <div className="flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    className={buttonClass("secondary", "sm")}
                    onClick={() => addItem("item")}
                    disabled={isFull}
                >
                    <ListPlus size={16} />
                    เพิ่มรายการ
                </button>
                <button
                    type="button"
                    className={buttonClass("secondary", "sm")}
                    onClick={() => addItem("heading")}
                    disabled={isFull}
                >
                    <Heading size={16} />
                    เพิ่มหัวข้อ
                </button>
                <button
                    type="button"
                    className={buttonClass("secondary", "sm")}
                    onClick={() => addItem("note")}
                    disabled={isFull}
                >
                    <StickyNote size={16} />
                    เพิ่มหมายเหตุ
                </button>
                <span className="ml-auto text-xs text-gray-500 tabular-nums">
                    {items.length}/{MAX_PACKAGE_ITEMS} แถว
                </span>
            </div>
            <FieldHint>{PRODUCT_MESSAGES.packages.itemProduct}</FieldHint>
            {isFull && (
                <p className="text-xs text-amber-600">
                    ชุดรายการมีได้ไม่เกิน {MAX_PACKAGE_ITEMS} แถว แบ่งเป็นหลายชุดแทน
                </p>
            )}
        </div>
    );
}
