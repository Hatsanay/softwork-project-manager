"use client";

// สรุปยอดสด + จำนวนเงินตัวอักษร + ป้ายบอกล่วงหน้าว่าต้องอนุมัติกี่ชั้น (คำนวณด้วยสูตรเดียวกับ backend — R3)
import { ShieldCheck } from "lucide-react";
import { CARD_CLASS } from "@/components/ui/card";
import { formatAmount } from "@/lib/shared/money.mjs";
import { amountInWords } from "@/lib/shared/amount-in-words.mjs";
import { buildApprovalPlan } from "@/lib/shared/approval-flow.mjs";
import { QUOTATION_MESSAGES } from "../_messages";
import type { FormOptions } from "../_hooks/use-form-options";

type Totals = {
    subtotal: bigint;
    discount: bigint;
    afterDiscount: bigint;
    vat: bigint;
    total: bigint;
    afterDiscountThb: bigint;
    totalThb: bigint;
    belowList: { lineCount: number; amount: bigint };
};

type SummaryPanelProps = {
    totals: Totals;
    vatRate: string;
    currency: FormOptions["currencies"][number] | undefined;
    language: "th" | "en";
    approvalLevels: FormOptions["approval"]["levels"];
};

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
    return (
        <div
            className={`flex items-baseline justify-between gap-3 ${strong ? "text-base font-medium text-gray-900" : "text-sm text-gray-600"}`}
        >
            <span>{label}</span>
            <span className="tabular-nums">{value}</span>
        </div>
    );
}

export default function SummaryPanel({ totals, vatRate, currency, language, approvalLevels }: SummaryPanelProps) {
    const decimals = currency?.cur_decimals ?? 2;
    const code = currency?.cur_code ?? "THB";
    const isForeign = code !== "THB";
    const plan = buildApprovalPlan(approvalLevels, totals.afterDiscountThb);
    const hasVat = Number(vatRate) > 0;

    return (
        <aside className={`grid gap-4 p-5 ${CARD_CLASS}`}>
            <h2 className="text-base font-medium text-gray-900">สรุปยอด ({code})</h2>
            <div className="grid gap-1.5">
                <Row label="รวมเป็นเงิน" value={formatAmount(totals.subtotal, decimals)} />
                {totals.discount > 0n && (
                    <Row label="ส่วนลดท้ายบิล" value={`−${formatAmount(totals.discount, decimals)}`} />
                )}
                <Row label="หลังหักส่วนลด" value={formatAmount(totals.afterDiscount, decimals)} />
                <Row
                    label={hasVat ? `VAT ${vatRate}%` : "VAT"}
                    value={hasVat ? formatAmount(totals.vat, decimals) : "ไม่คิด"}
                />
                <div className="my-1 border-t border-gray-100" />
                <Row label="รวมทั้งสิ้น" value={formatAmount(totals.total, decimals)} strong />
                {currency && <p className="text-xs text-gray-500">{amountInWords(totals.total, currency, language)}</p>}
                {isForeign && <Row label="เทียบเป็นบาท (ภายใน)" value={`${formatAmount(totals.totalThb)} บาท`} />}
            </div>

            {totals.belowList.lineCount > 0 && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-600">
                    {totals.belowList.lineCount} รายการต่ำกว่าราคาตั้งต้น รวม −
                    {formatAmount(totals.belowList.amount, decimals)} {code} · ผู้อนุมัติจะเห็น
                </p>
            )}

            <div className="grid gap-2 rounded-xl bg-blue-50/60 p-3">
                <p className="flex items-center gap-2 text-sm font-medium text-gray-800">
                    <ShieldCheck size={16} className="text-blue-600" />
                    ยอดนี้ต้องอนุมัติ {plan.length} ชั้น
                </p>
                <ol className="grid gap-1 text-xs text-gray-600">
                    {plan.map((level) => (
                        <li key={level.level}>
                            ชั้น {level.level}:{" "}
                            {level.roles.map((role) => role.role_name).join(", ") || "ยังไม่ได้กำหนด role"}
                            {level.require_distinct ? " (ต้องเป็นคนละคน)" : ""}
                        </li>
                    ))}
                </ol>
                <p className="text-xs text-gray-500">{QUOTATION_MESSAGES.approvalPreview}</p>
            </div>
        </aside>
    );
}
