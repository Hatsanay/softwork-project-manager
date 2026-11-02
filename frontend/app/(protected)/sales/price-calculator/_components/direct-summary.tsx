"use client";

// สรุปยอดโหมดลูกค้าตรงของตัวคิดราคา (2026-11-01 · docs/plans/2026-11-01-calculator-direct-quotation.md ข้อ 2.2)
// ยอดเดียวต่อความหมาย: รวม → VAT (ถ้าจด VAT วันนี้) → ยอดในใบเสนอราคา · ไม่มีค่าธรรมเนียม
// ปุ่ม: ออกใบเสนอราคาจากตะกร้า (ร่าง · ตรวจก่อนส่งอนุมัติ) · คัดลอกรายการและราคา (ส่ง LINE) · คัดลอกคำถาม
import { ClipboardCopy, FilePlus2, FileText, Trash2 } from "lucide-react";
import FieldHint from "@/components/ui/guidance/field-hint";
import { CARD_CLASS } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { formatAmount } from "@/lib/shared/money.mjs";
import { SUMMARY_ID } from "../../../fastwork/price/_components/price-summary";

export type DirectSummaryLine = { key: string; name: string; quantity: number; amount: bigint };

export default function DirectSummary({
    lines,
    vatRate,
    subtotal,
    vat,
    total,
    questionCount,
    isEstimate,
    onCreateQuotation,
    onCopyPrices,
    onCopyQuestions,
    onRemove,
    onClear,
}: {
    lines: DirectSummaryLine[];
    vatRate: string | null;
    subtotal: bigint;
    vat: bigint;
    total: bigint;
    questionCount: number;
    // มีราคาเริ่มต้นที่ยังไม่ได้กรอก
    isEstimate: boolean;
    onCreateQuotation: () => void;
    onCopyPrices: () => void;
    onCopyQuestions: () => void;
    onRemove: (key: string) => void;
    onClear: () => void;
}) {
    const isEmpty = lines.length === 0;
    return (
        <section
            id={SUMMARY_ID}
            className={`grid scroll-mt-24 gap-4 p-4 sm:p-5 lg:sticky lg:top-24 ${CARD_CLASS}`}
            aria-label="สรุปยอดลูกค้าตรง"
        >
            <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-medium text-gray-900">ตะกร้า</h2>
                {!isEmpty && (
                    <button
                        type="button"
                        className="min-h-10 text-sm text-gray-500 hover:text-red-600"
                        onClick={onClear}
                    >
                        ล้างตะกร้า
                    </button>
                )}
            </div>
            {isEmpty ? (
                <p className="rounded-xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                    เลือกสินค้าหรือชุดจากรายการ (กด +)
                </p>
            ) : (
                <ul className="grid gap-1.5">
                    {lines.map((line) => (
                        <li key={line.key} className="flex items-center justify-between gap-2 text-sm">
                            <span className="min-w-0 wrap-break-word text-gray-800">
                                {line.name}
                                {line.quantity > 1 && <span className="text-gray-500"> × {line.quantity}</span>}
                            </span>
                            <span className="flex shrink-0 items-center gap-1">
                                <span className="text-gray-900 tabular-nums">{formatAmount(line.amount)}</span>
                                <button
                                    type="button"
                                    aria-label={`เอา ${line.name} ออก`}
                                    className={buttonClass("ghost", "sm")}
                                    onClick={() => onRemove(line.key)}
                                >
                                    <Trash2 size={14} />
                                </button>
                            </span>
                        </li>
                    ))}
                </ul>
            )}
            <div className="grid gap-1 rounded-xl bg-gray-50 p-3 text-sm">
                <div className="flex justify-between gap-3 text-gray-700">
                    <span>รวมก่อน VAT</span>
                    <span className="tabular-nums">{formatAmount(subtotal)}</span>
                </div>
                {vatRate && (
                    <div className="flex justify-between gap-3 text-gray-700">
                        <span>+ VAT {Number(vatRate)}%</span>
                        <span className="tabular-nums">{formatAmount(vat)}</span>
                    </div>
                )}
                <div className="flex justify-between gap-3 border-t border-gray-200 pt-1.5">
                    <span className="font-medium text-gray-900">
                        = {isEstimate ? "ยอดเบื้องต้น" : "ยอดในใบเสนอราคา"}
                    </span>
                    <span className="text-base font-medium text-blue-700 tabular-nums">{formatAmount(total)} บาท</span>
                </div>
                <FieldHint>
                    {vatRate ? `VAT ตามอัตราวันนี้ · ` : "ยังไม่จด VAT · "}ยอดสุดท้ายตามใบเสนอราคา (คิดใหม่ตอนบันทึก) ·
                    งานเพิ่มแบบ % เป็นรายการราคาคงที่ในใบ
                </FieldHint>
            </div>
            <div className="grid gap-2">
                <button
                    type="button"
                    className={`${buttonClass("primary", "md")} min-h-11 justify-center`}
                    disabled={isEmpty}
                    onClick={onCreateQuotation}
                >
                    <FilePlus2 size={16} aria-hidden="true" />
                    ออกใบเสนอราคาจากตะกร้านี้
                </button>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                    <button
                        type="button"
                        className={`${buttonClass("secondary", "md")} min-h-11 justify-center`}
                        disabled={isEmpty}
                        onClick={onCopyPrices}
                    >
                        <FileText size={16} aria-hidden="true" />
                        คัดลอกรายการและราคา
                    </button>
                    <button
                        type="button"
                        className={`${buttonClass("secondary", "md")} min-h-11 justify-center`}
                        disabled={questionCount === 0}
                        onClick={onCopyQuestions}
                    >
                        <ClipboardCopy size={16} aria-hidden="true" />
                        คัดลอกคำถาม ({questionCount} ข้อ)
                    </button>
                </div>
            </div>
            <FieldHint>
                ออกใบ = ร่างใบเสนอราคา (จ่ายครั้งเดียว · เงื่อนไขและอายุใบตามค่าเริ่มต้น) เปิดให้ตรวจก่อนส่งอนุมัติ ·
                คัดลอกรายการและราคา = ข้อความส่ง LINE ก่อนออกใบ
            </FieldHint>
        </section>
    );
}
