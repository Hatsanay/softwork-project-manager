// ที่มาของกำไรที่แบ่งได้ (2026-10-25 · P-2) — ใช้ทั้งหน้าจัดการส่วนแบ่งและหน้าส่วนแบ่งของฉัน
// เรียงบนลงล่างแบบบวกลบ (ข้อ finance clarity): รายได้ − ค่าธรรมเนียม − ค่าใช้จ่าย = กำไรที่แบ่งได้ − ส่วนตายตัว = ฐานของ %
// แต่ละบรรทัดกางดูรายการที่มาได้ (ไม่ใช้ tooltip)
import { formatAmount } from "@/lib/shared/money.mjs";
import { formatDateOnly } from "@/app/function";
import type { ProfitItem } from "../_types";
import { SHARE_MESSAGES } from "../_messages";

type ProfitBreakdownProps = {
    revenue: string;
    platformFee: string;
    expenseCost: string;
    distributable: string;
    // ไม่ส่ง = ไม่แสดงบรรทัดส่วนตายตัว (ยังไม่มีผู้รับแบบจำนวนเงิน)
    fixedTotal?: string;
    afterFixed?: string;
    revenueItems: ProfitItem[];
    expenseItems: ProfitItem[];
};

export default function ProfitBreakdown({
    revenue,
    platformFee,
    expenseCost,
    distributable,
    fixedTotal,
    afterFixed,
    revenueItems,
    expenseItems,
}: ProfitBreakdownProps) {
    const hasFixed = fixedTotal !== undefined && afterFixed !== undefined && Number(fixedTotal) !== 0;
    return (
        <div className="grid gap-1 rounded-xl bg-gray-50 p-3 text-sm">
            <ItemsLine label="รายได้ที่เข้าแล้ว" amount={revenue} items={revenueItems} hint={SHARE_MESSAGES.revenue} emptyText="ยังไม่มีเงินเข้า" />
            <AmountLine label="− ค่าธรรมเนียมแพลตฟอร์ม (รวม VAT)" amount={platformFee} />
            <ItemsLine
                label="− ค่าใช้จ่ายของโปรเจกต์"
                amount={expenseCost}
                items={expenseItems}
                hint={SHARE_MESSAGES.expense}
                emptyText="ไม่มีค่าใช้จ่ายที่อนุมัติแล้ว"
            />
            <TotalLine label="= กำไรที่แบ่งได้" amount={distributable} />
            {hasFixed && (
                <>
                    <AmountLine label="− ส่วนแบ่งแบบจำนวนเงิน (รวมทุกคน)" amount={fixedTotal} />
                    <TotalLine label="= กำไรหลังหักส่วนตายตัว (ฐานของ %)" amount={afterFixed} />
                </>
            )}
        </div>
    );
}

function AmountLine({ label, amount }: { label: string; amount: string }) {
    return (
        <div className="flex items-baseline justify-between gap-3 py-1 text-gray-700">
            <span>{label}</span>
            <span className="shrink-0 tabular-nums">{formatAmount(amount)}</span>
        </div>
    );
}

export function TotalLine({ label, amount }: { label: string; amount: string | bigint }) {
    const isNegative = typeof amount === "bigint" ? amount < 0n : amount.startsWith("-");
    return (
        <div className="flex items-baseline justify-between gap-3 border-t border-gray-200 py-1.5">
            <span className="font-medium text-gray-900">{label}</span>
            <span className={`shrink-0 text-base font-medium tabular-nums ${isNegative ? "text-red-600" : "text-gray-900"}`}>
                {formatAmount(amount)}
            </span>
        </div>
    );
}

function ItemsLine({
    label,
    amount,
    items,
    hint,
    emptyText,
}: {
    label: string;
    amount: string;
    items: ProfitItem[];
    hint: string;
    emptyText: string;
}) {
    return (
        <details className="group py-1">
            <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-3 text-gray-700 [&::-webkit-details-marker]:hidden">
                <span>
                    {label}
                    <span className="ml-1.5 text-xs text-blue-600 group-open:hidden">ดูที่มา ({items.length})</span>
                    <span className="ml-1.5 hidden text-xs text-blue-600 group-open:inline">ซ่อน</span>
                </span>
                <span className="shrink-0 tabular-nums">{formatAmount(amount)}</span>
            </summary>
            <div className="mt-1 grid gap-1 rounded-lg bg-white p-2.5">
                <p className="text-xs text-gray-500">{hint}</p>
                {items.length === 0 ? (
                    <p className="text-xs text-gray-400">{emptyText}</p>
                ) : (
                    <ul className="grid gap-1">
                        {items.map((item, index) => (
                            <li key={index} className="flex items-baseline justify-between gap-3 text-xs text-gray-600">
                                <span className="min-w-0 wrap-break-word">
                                    {item.date ? `${formatDateOnly(item.date)} · ` : ""}
                                    {item.label}
                                </span>
                                <span className="shrink-0 tabular-nums">{formatAmount(item.amount)}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </details>
    );
}
