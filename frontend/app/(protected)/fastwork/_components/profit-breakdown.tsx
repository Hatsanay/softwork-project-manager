// ที่มาของกำไรที่แบ่งได้ (2026-10-25 · P-2 · คอลัมน์ "ถ้าเงินเข้าครบ" 2026-10-31) · ใช้ทั้งหน้าจัดการส่วนแบ่งและหน้าส่วนแบ่งของฉัน
// เรียงบนลงล่างแบบบวกลบ (ข้อ finance clarity): รายได้ − ค่าธรรมเนียม − ค่าใช้จ่าย = กำไรที่แบ่งได้ − ส่วนตายตัว = ฐานของ %
// ส่ง expected = มี 2 คอลัมน์ "ได้ตอนนี้" กับ "ถ้าเงินเข้าครบ" (คนละความหมาย มีหัวคอลัมน์กำกับเสมอ) · แต่ละบรรทัดกางดูรายการที่มาได้ (ไม่ใช้ tooltip)
import { formatAmount } from "@/lib/shared/money.mjs";
import { formatDateOnly } from "@/app/function";
import type { ProfitItem } from "../_types";
import { SHARE_MESSAGES } from "../_messages";

export type ProfitFigures = {
    revenue: string;
    platformFee: string;
    expenseCost: string;
    distributable: string;
    // ไม่ส่ง = ไม่แสดงบรรทัดส่วนตายตัว (ยังไม่มีผู้รับแบบจำนวนเงิน)
    fixedTotal?: string;
    afterFixed?: string;
};

type ProfitBreakdownProps = ProfitFigures & {
    revenueItems: ProfitItem[];
    expenseItems: ProfitItem[];
    // ถ้าเงินเข้าครบ (คาดการณ์) · ไม่ส่ง = คอลัมน์เดียว
    expected?: ProfitFigures;
};

// ความกว้างคอลัมน์ตัวเลข (2 คอลัมน์ตรงกันทุกบรรทัด)
const AMOUNT_COLUMN = "w-24 shrink-0 text-right tabular-nums sm:w-32";

export default function ProfitBreakdown({ expected, revenueItems, expenseItems, ...now }: ProfitBreakdownProps) {
    const hasFixed = now.fixedTotal !== undefined && now.afterFixed !== undefined && Number(now.fixedTotal) !== 0;
    return (
        <div className="grid gap-1 rounded-xl bg-gray-50 p-3 text-sm">
            {expected && (
                <div className="flex justify-end gap-3 border-b border-gray-200 pb-1.5 text-xs text-gray-500">
                    <span className={AMOUNT_COLUMN}>ได้ตอนนี้</span>
                    <span className={AMOUNT_COLUMN}>ถ้าเงินเข้าครบ</span>
                </div>
            )}
            <ItemsLine
                label={expected ? "รายได้" : "รายได้ที่เข้าแล้ว"}
                amount={now.revenue}
                expectedAmount={expected?.revenue}
                items={revenueItems}
                hint={SHARE_MESSAGES.revenue}
                emptyText="ยังไม่มีเงินเข้า"
            />
            <AmountLine
                label="− ค่าธรรมเนียมแพลตฟอร์ม (รวม VAT)"
                amount={now.platformFee}
                expectedAmount={expected?.platformFee}
            />
            <ItemsLine
                label="− ค่าใช้จ่ายของโปรเจกต์"
                amount={now.expenseCost}
                expectedAmount={expected?.expenseCost}
                items={expenseItems}
                hint={SHARE_MESSAGES.expense}
                emptyText="ไม่มีค่าใช้จ่ายที่อนุมัติแล้ว"
            />
            <TotalLine label="= กำไรที่แบ่งได้" amount={now.distributable} expectedAmount={expected?.distributable} />
            {hasFixed && (
                <>
                    <AmountLine
                        label="− ส่วนแบ่งแบบจำนวนเงิน (รวม)"
                        amount={now.fixedTotal as string}
                        expectedAmount={expected?.fixedTotal}
                    />
                    <TotalLine
                        label="= ฐานของ %"
                        amount={now.afterFixed as string}
                        expectedAmount={expected?.afterFixed}
                    />
                </>
            )}
        </div>
    );
}

function Amounts({
    amount,
    expectedAmount,
    strong = false,
}: {
    amount: string | bigint;
    expectedAmount?: string | bigint;
    strong?: boolean;
}) {
    const tone = (value: string | bigint) => {
        const isNegative = typeof value === "bigint" ? value < 0n : value.startsWith("-");
        if (isNegative) return "text-red-600";
        return strong ? "text-gray-900" : "";
    };
    return (
        <span className="flex shrink-0 gap-3">
            <span className={`${AMOUNT_COLUMN} ${tone(amount)}`}>{formatAmount(amount)}</span>
            {expectedAmount !== undefined && (
                <span className={`${AMOUNT_COLUMN} ${tone(expectedAmount)}`}>{formatAmount(expectedAmount)}</span>
            )}
        </span>
    );
}

function AmountLine({ label, amount, expectedAmount }: { label: string; amount: string; expectedAmount?: string }) {
    return (
        <div className="flex items-baseline justify-between gap-3 py-1 text-gray-700">
            <span className="min-w-0">{label}</span>
            <Amounts amount={amount} expectedAmount={expectedAmount} />
        </div>
    );
}

export function TotalLine({
    label,
    amount,
    expectedAmount,
}: {
    label: string;
    amount: string | bigint;
    expectedAmount?: string | bigint;
}) {
    return (
        <div className="flex items-baseline justify-between gap-3 border-t border-gray-200 py-1.5 font-medium text-gray-900">
            <span className="min-w-0">{label}</span>
            <span className="text-base">
                <Amounts amount={amount} expectedAmount={expectedAmount} strong />
            </span>
        </div>
    );
}

function ItemsLine({
    label,
    amount,
    expectedAmount,
    items,
    hint,
    emptyText,
}: {
    label: string;
    amount: string;
    expectedAmount?: string;
    items: ProfitItem[];
    hint: string;
    emptyText: string;
}) {
    return (
        <details className="group py-1">
            <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-3 text-gray-700 [&::-webkit-details-marker]:hidden">
                <span className="min-w-0">
                    {label}
                    <span className="ml-1.5 text-xs text-blue-600 group-open:hidden">ดูที่มา ({items.length})</span>
                    <span className="ml-1.5 hidden text-xs text-blue-600 group-open:inline">ซ่อน</span>
                </span>
                <Amounts amount={amount} expectedAmount={expectedAmount} />
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
