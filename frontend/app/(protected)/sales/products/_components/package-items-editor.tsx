"use client";

// ตัวแก้แถวในชุดรายการ — เพิ่มแถว (รายการ/หัวข้อ/หมายเหตุ) เลื่อนขึ้นลง ลบ · error ของแต่ละช่องมาจาก "items.<ลำดับ>.<ช่อง>"
import { ArrowDown, ArrowUp, Heading, ListPlus, StickyNote, Trash2 } from "lucide-react";
import FieldHint from "@/components/ui/guidance/field-hint";
import SearchableSelect, { type SelectOption } from "@/components/ui/SearchableSelect";
import { buttonClass } from "@/components/ui/button";
import { inputClass } from "@/components/ui/form-field";
import type { FieldErrors } from "@/lib/form-errors";
import { formatAmount } from "@/lib/shared/money.mjs";
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

// ข้อมูลสินค้าที่แถวต้องใช้ (ชื่อ หน่วย ราคาปัจจุบัน) — รวมสินค้าที่ปิดใช้งานแล้วที่แถวเดิมอ้างอยู่
export type ProductChoice = {
    product_id: string;
    product_name: string;
    product_code: string | null;
    product_unit: string | null;
    product_price: string;
    product_status: "active" | "inactive";
};

const TYPE_LABELS: Record<PackageItemType, string> = { item: "รายการ", heading: "หัวข้อ", note: "หมายเหตุ" };

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
                label: `${product.product_code ? `${product.product_code} · ` : ""}${product.product_name}${
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

            <ol className="grid gap-3">
                {items.map((item, index) => {
                    const isItemRow = item.pki_type === "item";
                    const product = item.pki_product_id ? productById.get(item.pki_product_id) : undefined;
                    const rowErrors = [
                        errorOf(index, "pki_product_id"),
                        errorOf(index, "pki_description"),
                        errorOf(index, "pki_quantity"),
                        errorOf(index, "pki_unit"),
                        errorOf(index, "pki_unit_price"),
                    ].filter(Boolean);

                    return (
                        <li
                            key={item.rowKey}
                            className={`grid gap-3 rounded-xl border p-3 ${
                                item.pki_type === "heading"
                                    ? "border-blue-100 bg-blue-50/40"
                                    : "border-gray-200 bg-white"
                            }`}
                        >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-400 tabular-nums">{index + 1}</span>
                                    <select
                                        aria-label={`ชนิดของแถวที่ ${index + 1}`}
                                        value={item.pki_type}
                                        onChange={(event) =>
                                            updateItem(index, { pki_type: event.target.value as PackageItemType })
                                        }
                                        className={`${inputClass()} w-32 py-1.5`}
                                    >
                                        {(Object.keys(TYPE_LABELS) as PackageItemType[]).map((type) => (
                                            <option key={type} value={type}>
                                                {TYPE_LABELS[type]}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex gap-1">
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
                                        className={buttonClass("ghost", "sm")}
                                        onClick={() => removeItem(index)}
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>

                            {isItemRow && (
                                <div className="grid gap-1">
                                    <SearchableSelect
                                        options={productOptions(item.pki_product_id)}
                                        value={item.pki_product_id}
                                        onChange={(productId) => selectProduct(index, productId)}
                                        placeholder="— ไม่เลือกสินค้า (กรอกราคาเอง) —"
                                        error={Boolean(errorOf(index, "pki_product_id"))}
                                    />
                                    {product?.product_status === "inactive" && (
                                        <p className="text-xs text-amber-700">
                                            สินค้านี้ปิดใช้งานแล้ว — ตอนใส่ใบเสนอราคาแถวนี้จะถูกข้าม
                                        </p>
                                    )}
                                </div>
                            )}

                            <textarea
                                aria-label={`รายละเอียดของแถวที่ ${index + 1}`}
                                rows={item.pki_type === "heading" ? 1 : 2}
                                placeholder={
                                    item.pki_type === "heading"
                                        ? "เช่น ค่าพัฒนาระบบ"
                                        : item.pki_type === "note"
                                          ? "เช่น ราคานี้ไม่รวมค่าเนื้อหา"
                                          : "รายละเอียดที่จะพิมพ์บนเอกสาร"
                                }
                                value={item.pki_description}
                                onChange={(event) => updateItem(index, { pki_description: event.target.value })}
                                className={inputClass(Boolean(errorOf(index, "pki_description")))}
                            />

                            {isItemRow && (
                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                                    <label className="grid gap-1 text-xs text-gray-600">
                                        จำนวน
                                        <input
                                            inputMode="decimal"
                                            value={item.pki_quantity}
                                            onChange={(event) =>
                                                updateItem(index, { pki_quantity: event.target.value })
                                            }
                                            className={inputClass(Boolean(errorOf(index, "pki_quantity")))}
                                        />
                                    </label>
                                    <label className="grid gap-1 text-xs text-gray-600">
                                        หน่วย
                                        <input
                                            value={item.pki_unit}
                                            onChange={(event) => updateItem(index, { pki_unit: event.target.value })}
                                            className={inputClass(Boolean(errorOf(index, "pki_unit")))}
                                        />
                                    </label>
                                    <label className="col-span-2 grid gap-1 text-xs text-gray-600 sm:col-span-1">
                                        ราคาต่อหน่วย (บาท)
                                        <input
                                            inputMode="decimal"
                                            value={item.pki_unit_price}
                                            disabled={Boolean(product)}
                                            placeholder={
                                                product
                                                    ? `ราคาสินค้าปัจจุบัน ${formatAmount(product.product_price)}`
                                                    : ""
                                            }
                                            onChange={(event) =>
                                                updateItem(index, { pki_unit_price: event.target.value })
                                            }
                                            className={inputClass(Boolean(errorOf(index, "pki_unit_price")))}
                                        />
                                    </label>
                                </div>
                            )}

                            {rowErrors.length > 0 && (
                                <p role="alert" className="text-xs text-red-600">
                                    {rowErrors.join(" · ")}
                                </p>
                            )}
                        </li>
                    );
                })}
            </ol>

            <p className="text-xs text-gray-500">{PRODUCT_MESSAGES.packages.itemProduct}</p>
            <div className="flex flex-wrap gap-2">
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
            </div>
            {isFull && (
                <p className="text-xs text-amber-700">
                    ชุดรายการมีได้ไม่เกิน {MAX_PACKAGE_ITEMS} แถว — แบ่งเป็นหลายชุดแทน
                </p>
            )}
        </div>
    );
}
