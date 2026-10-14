"use client";

// ตารางรายการของใบเสนอราคา — แถว รายการ/หัวข้อ/หมายเหตุ · ยอดบรรทัดคำนวณสดด้วยสูตรเดียวกับ backend
// จอกว้างแสดงเป็นตาราง จอแคบเป็นการ์ดต่อแถว (ไม่ต้องเลื่อนแนวนอน)
import { ArrowDown, ArrowUp, Heading, ListPlus, PackagePlus, StickyNote, Trash2 } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { inputClass } from "@/components/ui/form-field";
import FieldHint from "@/components/ui/guidance/field-hint";
import { formatAmount } from "@/lib/shared/money.mjs";
import { QUOTATION_MESSAGES } from "../_messages";
import { emptyItem, type ItemForm } from "../_form-state";

type LineResult = { amount: bigint; belowListBy: bigint };

type ItemsEditorProps = {
    items: ItemForm[];
    lines: LineResult[];
    currencyDecimals: number;
    errors: Record<string, string>;
    onChange: (items: ItemForm[]) => void;
    onOpenPicker: () => void;
};

const TYPE_LABELS = { item: "รายการ", heading: "หัวข้อ", note: "หมายเหตุ" } as const;

// หัวแถว: การ์ดกว้าง = ป้าย | ช่องข้อความ | ปุ่ม อยู่บรรทัดเดียว
// การ์ดแคบ (มือถือ) = ป้ายกับปุ่มอยู่บรรทัดบน ช่องข้อความลงมาเต็มความกว้าง — ไม่งั้นช่องข้อความเหลือกว้างไม่ถึง 120px
const ROW_HEAD_CLASS = "flex flex-wrap items-start gap-2 @md:flex-nowrap";
const ROW_LABEL_CLASS = "w-16 shrink-0 self-center text-xs text-gray-500 @md:mt-2.5 @md:self-start";
const ROW_TEXT_CLASS = "order-last basis-full @md:order-none @md:min-w-0 @md:flex-1 @md:basis-auto";

export default function ItemsEditor({
    items,
    lines,
    currencyDecimals,
    errors,
    onChange,
    onOpenPicker,
}: ItemsEditorProps) {
    function update(index: number, changes: Partial<ItemForm>) {
        onChange(items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...changes } : item)));
    }

    function move(index: number, offset: -1 | 1) {
        const target = index + offset;
        if (target < 0 || target >= items.length) return;
        const reordered = [...items];
        [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
        onChange(reordered);
    }

    function remove(index: number) {
        onChange(items.filter((_, itemIndex) => itemIndex !== index));
    }

    function errorOf(index: number, field: string) {
        return errors[`items.${index}.${field}`];
    }

    return (
        <div className="grid gap-3">
            <ol className="grid gap-2">
                {items.map((item, index) => {
                    const line = lines[index];
                    const rowErrors = [
                        "qti_description",
                        "qti_quantity",
                        "qti_unit_price",
                        "qti_discount_value",
                        "qti_product_id",
                    ]
                        .map((field) => errorOf(index, field))
                        .filter(Boolean);
                    const controls = (
                        <div className="ml-auto flex shrink-0 gap-0.5">
                            <button
                                type="button"
                                aria-label={`เลื่อนแถวที่ ${index + 1} ขึ้น`}
                                className={buttonClass("ghost", "sm")}
                                onClick={() => move(index, -1)}
                                disabled={index === 0}
                            >
                                <ArrowUp size={15} />
                            </button>
                            <button
                                type="button"
                                aria-label={`เลื่อนแถวที่ ${index + 1} ลง`}
                                className={buttonClass("ghost", "sm")}
                                onClick={() => move(index, 1)}
                                disabled={index === items.length - 1}
                            >
                                <ArrowDown size={15} />
                            </button>
                            <button
                                type="button"
                                aria-label={`ลบแถวที่ ${index + 1}`}
                                className={buttonClass("ghost", "sm")}
                                onClick={() => remove(index)}
                            >
                                <Trash2 size={15} />
                            </button>
                        </div>
                    );

                    if (item.qti_type !== "item") {
                        return (
                            <li
                                key={item.rowKey}
                                className={`@container grid gap-1 rounded-xl border p-3 ${item.qti_type === "heading" ? "border-blue-100 bg-blue-50/50" : "border-gray-200 bg-white"}`}
                            >
                                <div className={ROW_HEAD_CLASS}>
                                    <span className={ROW_LABEL_CLASS}>
                                        {TYPE_LABELS[item.qti_type]}
                                    </span>
                                    <textarea
                                        aria-label={`${TYPE_LABELS[item.qti_type]}แถวที่ ${index + 1}`}
                                        rows={1}
                                        value={item.qti_description}
                                        placeholder={
                                            item.qti_type === "heading"
                                                ? "เช่น ระบบหลังบ้าน"
                                                : "เช่น ราคานี้ไม่รวมค่าเซิร์ฟเวอร์"
                                        }
                                        onChange={(event) => update(index, { qti_description: event.target.value })}
                                        className={`${inputClass(Boolean(errorOf(index, "qti_description")))} ${ROW_TEXT_CLASS} ${item.qti_type === "heading" ? "font-medium" : "italic"}`}
                                    />
                                    {controls}
                                </div>
                                {rowErrors.length > 0 && (
                                    <p role="alert" className="text-xs text-red-600">
                                        {rowErrors.join(" · ")}
                                    </p>
                                )}
                            </li>
                        );
                    }

                    return (
                        <li key={item.rowKey} className="@container grid gap-2 rounded-xl border border-gray-200 bg-white p-3">
                            <div className={ROW_HEAD_CLASS}>
                                <span className={ROW_LABEL_CLASS}>รายการ {index + 1}</span>
                                <textarea
                                    aria-label={`รายละเอียดแถวที่ ${index + 1}`}
                                    rows={2}
                                    value={item.qti_description}
                                    placeholder="รายละเอียดที่จะพิมพ์บนเอกสาร"
                                    onChange={(event) => update(index, { qti_description: event.target.value })}
                                    className={`${inputClass(Boolean(errorOf(index, "qti_description")))} ${ROW_TEXT_CLASS}`}
                                />
                                {controls}
                            </div>
                            <div className="grid grid-cols-2 gap-2 @2xl:ml-[4.5rem] @2xl:grid-cols-[5rem_6rem_minmax(7rem,1fr)_minmax(9rem,1fr)_8rem]">
                                <label className="grid gap-1 text-xs text-gray-600">
                                    จำนวน
                                    <input
                                        inputMode="decimal"
                                        value={item.qti_quantity}
                                        onChange={(event) => update(index, { qti_quantity: event.target.value })}
                                        className={inputClass(Boolean(errorOf(index, "qti_quantity")))}
                                    />
                                </label>
                                <label className="grid gap-1 text-xs text-gray-600">
                                    หน่วย
                                    <input
                                        value={item.qti_unit}
                                        onChange={(event) => update(index, { qti_unit: event.target.value })}
                                        className={inputClass()}
                                    />
                                </label>
                                <label className="grid gap-1 text-xs text-gray-600">
                                    ราคาต่อหน่วย
                                    <input
                                        inputMode="decimal"
                                        value={item.qti_unit_price}
                                        onChange={(event) => update(index, { qti_unit_price: event.target.value })}
                                        className={inputClass(Boolean(errorOf(index, "qti_unit_price")))}
                                    />
                                </label>
                                <label className="grid gap-1 text-xs text-gray-600">
                                    ส่วนลด
                                    <div className="flex gap-1">
                                        <input
                                            inputMode="decimal"
                                            value={item.qti_discount_value}
                                            placeholder="0"
                                            onChange={(event) =>
                                                update(index, { qti_discount_value: event.target.value })
                                            }
                                            className={inputClass(Boolean(errorOf(index, "qti_discount_value")))}
                                        />
                                        <select
                                            aria-label="ชนิดส่วนลด"
                                            value={item.qti_discount_type}
                                            onChange={(event) =>
                                                update(index, {
                                                    qti_discount_type: event.target
                                                        .value as ItemForm["qti_discount_type"],
                                                })
                                            }
                                            className={`${inputClass(false, "tight")} w-20`}
                                        >
                                            <option value="amount">฿</option>
                                            <option value="percent">%</option>
                                        </select>
                                    </div>
                                </label>
                                <div className="col-span-2 grid gap-1 text-xs text-gray-600 @2xl:col-span-1">
                                    ยอดบรรทัด
                                    <p className="py-2.5 text-right text-sm font-medium text-gray-900 tabular-nums">
                                        {formatAmount(line?.amount ?? 0n, currencyDecimals)}
                                    </p>
                                </div>
                            </div>
                            {line && line.belowListBy > 0n && (
                                <p className="text-xs text-amber-600 sm:ml-[4.5rem]">
                                    {QUOTATION_MESSAGES.belowList(formatAmount(line.belowListBy, currencyDecimals))}{" "}
                                    (ราคาตั้งต้น {formatAmount(item.qti_list_price || "0", currencyDecimals)}) —
                                    ผู้อนุมัติจะเห็น
                                </p>
                            )}
                            {rowErrors.length > 0 && (
                                <p role="alert" className="text-xs text-red-600 sm:ml-[4.5rem]">
                                    {rowErrors.join(" · ")}
                                </p>
                            )}
                        </li>
                    );
                })}
            </ol>
            {items.length === 0 && (
                <FieldHint>ยังไม่มีรายการ — เพิ่มจากรายการสินค้า หรือพิมพ์เองด้วยปุ่มด้านล่าง</FieldHint>
            )}

            <div className="flex flex-wrap gap-2">
                <button type="button" className={buttonClass("primary", "sm")} onClick={onOpenPicker}>
                    <PackagePlus size={16} />
                    เพิ่มจากรายการสินค้า
                </button>
                <button
                    type="button"
                    className={buttonClass("secondary", "sm")}
                    onClick={() => onChange([...items, emptyItem("item")])}
                >
                    <ListPlus size={16} />
                    พิมพ์รายการเอง
                </button>
                <button
                    type="button"
                    className={buttonClass("secondary", "sm")}
                    onClick={() => onChange([...items, emptyItem("heading")])}
                >
                    <Heading size={16} />
                    หัวข้อ
                </button>
                <button
                    type="button"
                    className={buttonClass("secondary", "sm")}
                    onClick={() => onChange([...items, emptyItem("note")])}
                >
                    <StickyNote size={16} />
                    หมายเหตุ
                </button>
            </div>
            <FieldHint>{QUOTATION_MESSAGES.discount}</FieldHint>
        </div>
    );
}
