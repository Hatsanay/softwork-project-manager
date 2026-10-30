"use client";

// สรุปราคาของตัวคิดราคา Fastwork (ปรับหน้า 2026-10-30): รายการในตะกร้า · ราคาเสนอ → หักค่าธรรมเนียม → เงินเข้าจริง (บนลงล่าง ตัวเลขละความหมาย)
// ปุ่มสร้างงาน · คัดลอกคำถาม · คัดลอกขอบเขตงาน · มือถือมีแถบล่างบอกราคาเสนอ/เงินเข้าจริง กดไปดูสรุป
import { useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardCopy, FileText, Trash2, X } from "lucide-react";
import FieldHint from "@/components/ui/guidance/field-hint";
import { buttonClass } from "@/components/ui/button";
import { CARD_CLASS } from "@/components/ui/card";
import { formatAmount, formatHundredths } from "@/lib/shared/money.mjs";
import type { FastworkSettings } from "../../_types";

export const SUMMARY_ID = "price-summary";

export type SummaryLine = { key: string; name: string; quantity: number; amount: bigint };
export type Payout = { fee: string; fee_vat: string; wht: string; net: string };

const STEPS = [
    "เลือกแพ็กหรืองานที่ผู้ซื้อถาม",
    "ดูราคาเสนอและเงินเข้าจริง",
    "คัดลอกคำถามไปถามในแชต",
    "ผู้ซื้อจ่ายแล้ว กดสร้างงาน",
];

export default function PriceSummary({
    lines,
    vatRate,
    vat,
    offer,
    settings,
    payout,
    questionCount,
    newJobHref,
    onRemove,
    onClear,
    onCopyQuestions,
    onCopyOffer,
}: {
    lines: SummaryLine[];
    vatRate: string | null;
    vat: bigint;
    offer: string;
    settings: FastworkSettings;
    payout: Payout;
    questionCount: number;
    newJobHref: string;
    onRemove: (key: string) => void;
    onClear: () => void;
    onCopyQuestions: () => void;
    onCopyOffer: () => void;
}) {
    const isEmpty = lines.length === 0;
    return (
        <aside
            id={SUMMARY_ID}
            className={`grid scroll-mt-24 gap-4 p-5 lg:sticky lg:top-24 ${CARD_CLASS}`}
            aria-label="สรุปราคา"
        >
            <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-medium text-gray-900">สรุปราคา</h2>
                {!isEmpty && (
                    <button
                        type="button"
                        className="-my-2 inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                        onClick={onClear}
                    >
                        <Trash2 size={14} aria-hidden="true" />
                        ล้างทั้งหมด
                    </button>
                )}
            </div>

            {isEmpty ? (
                <ol className="grid gap-2 rounded-xl bg-gray-50 p-4 text-sm text-gray-600">
                    {STEPS.map((step, index) => (
                        <li key={step} className="flex items-center gap-2.5">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-xs font-medium text-blue-600 ring-1 ring-gray-200">
                                {index + 1}
                            </span>
                            {step}
                        </li>
                    ))}
                </ol>
            ) : (
                <div className="grid gap-1.5 text-sm">
                    <ul className="grid gap-1">
                        {lines.map((line) => (
                            <li
                                key={line.key}
                                className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 text-gray-700"
                            >
                                <span className="min-w-0 wrap-break-word">
                                    {line.name}
                                    {line.quantity > 1 && <span className="text-gray-500"> × {line.quantity}</span>}
                                </span>
                                <span className="tabular-nums">{formatAmount(formatHundredths(line.amount))}</span>
                                <button
                                    type="button"
                                    className="-mr-2 flex h-9 w-9 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                                    onClick={() => onRemove(line.key)}
                                    aria-label={`เอา ${line.name} ออก`}
                                >
                                    <X size={16} />
                                </button>
                            </li>
                        ))}
                    </ul>
                    {vatRate && (
                        <AmountRow label={`+ VAT ${Number(vatRate)}%`} value={formatHundredths(vat)} withLine />
                    )}
                    <div className="mt-1 flex items-baseline justify-between gap-3 rounded-xl bg-gray-50 px-3 py-2.5">
                        <span className="font-medium text-gray-900">ราคาเสนอบน Fastwork</span>
                        <span className="text-lg font-medium text-gray-900 tabular-nums">{formatAmount(offer)}</span>
                    </div>
                    <AmountRow label={`− ค่าธรรมเนียม ${Number(settings.cs_fastwork_fee_rate)}%`} value={payout.fee} />
                    {Number(payout.fee_vat) > 0 && (
                        <AmountRow
                            label={`− VAT ค่าธรรมเนียม ${Number(settings.cs_fastwork_fee_vat_rate)}%`}
                            value={payout.fee_vat}
                        />
                    )}
                    {Number(payout.wht) > 0 && (
                        <AmountRow
                            label={`− หัก ณ ที่จ่าย ${Number(settings.cs_fastwork_wht_rate)}%`}
                            value={payout.wht}
                        />
                    )}
                    <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-gray-200 pt-2.5">
                        <span className="font-medium text-gray-900">เงินเข้าบัญชีโดยประมาณ</span>
                        <span className="text-xl font-medium text-blue-700 tabular-nums">
                            {formatAmount(payout.net)} บาท
                        </span>
                    </div>
                </div>
            )}
            <FieldHint>
                อัตราหักจากตั้งค่าในหน้า Fastwork · ราคาขั้นต่ำของหมวดบน Fastwork ระบบไม่รู้ ตรวจเองก่อนส่งข้อเสนอ
            </FieldHint>

            <div className="grid gap-2">
                {isEmpty ? (
                    <button
                        type="button"
                        className={`${buttonClass("primary", "md")} min-h-11 justify-center`}
                        disabled
                    >
                        สร้างงาน Fastwork จากตะกร้านี้
                    </button>
                ) : (
                    <Link href={newJobHref} className={`${buttonClass("primary", "md")} min-h-11 justify-center`}>
                        สร้างงาน Fastwork จากตะกร้านี้
                    </Link>
                )}
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                    <button
                        type="button"
                        className={`${buttonClass("secondary", "md")} min-h-11 justify-center`}
                        disabled={questionCount === 0}
                        onClick={onCopyQuestions}
                    >
                        <ClipboardCopy size={16} aria-hidden="true" />
                        คัดลอกคำถาม ({questionCount} ข้อ)
                    </button>
                    <button
                        type="button"
                        className={`${buttonClass("secondary", "md")} min-h-11 justify-center`}
                        disabled={isEmpty}
                        onClick={onCopyOffer}
                    >
                        <FileText size={16} aria-hidden="true" />
                        คัดลอกขอบเขตงาน
                    </button>
                </div>
            </div>
            <FieldHint>
                คำถาม = ข้อที่ลิงก์ Fastwork ถามสำหรับรายการที่เลือก (ข้อที่ถามตามคำตอบ มีเงื่อนไขเขียนกำกับ) ·
                ขอบเขตงาน = รายการ รายการในแพ็ก และราคารวม สำหรับวางในข้อเสนอ ไม่มีค่าธรรมเนียม ·
                สร้างงานเมื่อผู้ซื้อจ่ายบน Fastwork แล้ว หน้ารับงานเติมชื่องานและงวดเดียวเท่าราคาเสนอ แบ่งงวดเพิ่มได้
            </FieldHint>
        </aside>
    );
}

/** แถบล่างจอมือถือ: ราคาเสนอ + เงินเข้าจริง · กดดูสรุปเต็ม (จอใหญ่ใช้แผงขวาที่ติดจอแทน) */
export function PriceMobileBar({ itemCount, offer, net }: { itemCount: number; offer: string; net: string }) {
    // เลื่อนถึงแผงสรุปแล้ว ซ่อนแถบ (ตัวเลขซ้ำกัน และไม่บังปุ่ม/ท้ายหน้า)
    const [isSummaryInView, setIsSummaryInView] = useState(false);
    useEffect(() => {
        const summary = document.getElementById(SUMMARY_ID);
        if (!summary) return;
        const observer = new IntersectionObserver(([entry]) => setIsSummaryInView(entry.isIntersecting), {
            threshold: 0.15,
        });
        observer.observe(summary);
        return () => observer.disconnect();
    }, []);
    if (isSummaryInView) return null;
    return (
        <div
            className={`fixed inset-x-4 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 flex items-center gap-3 p-3 shadow-float lg:hidden ${CARD_CLASS}`}
        >
            <div className="grid min-w-0 flex-1 text-sm">
                <span className="truncate text-gray-600">
                    {itemCount} รายการ · เสนอ <span className="text-gray-900 tabular-nums">{formatAmount(offer)}</span>
                </span>
                <span className="truncate font-medium text-gray-900">
                    เข้าจริง <span className="text-blue-700 tabular-nums">{formatAmount(net)}</span> บาท
                </span>
            </div>
            <a href={`#${SUMMARY_ID}`} className={`${buttonClass("primary", "md")} min-h-11 shrink-0`}>
                ดูสรุป
            </a>
        </div>
    );
}

function AmountRow({ label, value, withLine = false }: { label: string; value: string; withLine?: boolean }) {
    return (
        <div
            className={`flex justify-between gap-3 text-gray-700 ${withLine ? "border-t border-gray-100 pt-1.5" : ""}`}
        >
            <span>{label}</span>
            <span className="tabular-nums">{formatAmount(value)}</span>
        </div>
    );
}
