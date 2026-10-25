// ใบเสนอราคาในหน้าสถานะของลูกค้า (2026-10-25 · S-4) — รายการ ยอดเรียงบนลงล่าง งวดชำระ และเงื่อนไข
// ยอดทุกตัวมาจากใบเสนอราคา (คำนวณแล้วที่ backend) ไม่คิดใหม่ที่หน้านี้ · ชุดแสดงเป็นกล่อง (ชื่อชุด + ยอดชุด + เช็กลิสต์)
import { formatAmount } from "@/lib/shared/money.mjs";
import type { CustomerQuotation } from "../_types";
import ItemGroupList, { quotationGroups } from "./item-groups";

const hasValue = (amount: string | null | undefined) => Number(amount ?? 0) !== 0;

export default function QuotationSummary({ quotation }: { quotation: CustomerQuotation }) {
    const currency = quotation.currency === "THB" ? "บาท" : quotation.currency;
    const groups = quotationGroups(quotation.items);
    // ชื่อใบซ้ำกับชื่อชุดเดียวในใบ (เช่น "🌱 เว็บหน้าเดียว") = ไม่แสดงซ้ำ
    const isTitleRepeated = groups.length === 1 && groups[0].title === quotation.title;
    return (
        <div className="grid gap-3">
            <div className="grid gap-0.5">
                {!isTitleRepeated && <p className="text-sm font-medium text-gray-900 wrap-break-word">{quotation.title}</p>}
                <p className="text-xs text-gray-500">
                    เลขที่ {quotation.number} · ออกวันที่ {quotation.issue_date}
                    {quotation.valid_until ? ` · ยืนราคาถึง ${quotation.valid_until}` : ""}
                </p>
            </div>
            <ItemGroupList groups={groups} />
            <div className="grid gap-1 border-t border-gray-100 pt-3 text-sm">
                <div className="flex justify-between gap-3 text-gray-700">
                    <span>รวม</span>
                    <span className="tabular-nums">{formatAmount(quotation.subtotal)}</span>
                </div>
                {hasValue(quotation.discount) && (
                    <>
                        <div className="flex justify-between gap-3 text-gray-700">
                            <span>- ส่วนลด</span>
                            <span className="tabular-nums">{formatAmount(quotation.discount)}</span>
                        </div>
                        <div className="flex justify-between gap-3 text-gray-700">
                            <span>= หลังส่วนลด</span>
                            <span className="tabular-nums">{formatAmount(quotation.after_discount)}</span>
                        </div>
                    </>
                )}
                {hasValue(quotation.vat_rate) && (
                    <div className="flex justify-between gap-3 text-gray-700">
                        <span>+ VAT {Number(quotation.vat_rate)}%</span>
                        <span className="tabular-nums">{formatAmount(quotation.vat)}</span>
                    </div>
                )}
                <div className="flex justify-between gap-3 border-t border-gray-100 pt-1.5">
                    <span className="font-medium text-gray-900">= ยอดตามใบเสนอราคา</span>
                    <span className="text-base font-medium text-gray-900 tabular-nums">
                        {formatAmount(quotation.total)} {currency}
                    </span>
                </div>
            </div>
            {quotation.milestones.length > 0 && (
                <div className="grid gap-1.5 rounded-xl bg-gray-50 p-3 text-sm">
                    <p className="text-xs font-medium text-gray-600">งวดชำระ</p>
                    <ol className="grid gap-1">
                        {quotation.milestones.map((milestone, index) => (
                            <li key={index} className="flex items-baseline justify-between gap-3 text-gray-700">
                                <span className="min-w-0 wrap-break-word">
                                    {index + 1}. {milestone.name}
                                    {milestone.percent ? ` (${Number(milestone.percent)}%)` : ""}
                                </span>
                                <span className="shrink-0 tabular-nums">{formatAmount(milestone.amount)}</span>
                            </li>
                        ))}
                    </ol>
                </div>
            )}
            {quotation.terms && (
                <div className="grid gap-1 text-sm">
                    <p className="text-xs font-medium text-gray-600">เงื่อนไข</p>
                    <p className="whitespace-pre-line wrap-break-word text-gray-700">{quotation.terms}</p>
                </div>
            )}
        </div>
    );
}
