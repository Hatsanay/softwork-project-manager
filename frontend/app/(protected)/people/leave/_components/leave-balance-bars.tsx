"use client";

// วันลาคงเหลือแบบแถบ (U-2 · 2026-10-19) — เห็นทันทีว่าใช้ไปเท่าไร รออนุมัติเท่าไร เหลือเท่าไร
// แถบ: น้ำเงินเข้ม = อนุมัติแล้ว · น้ำเงินอ่อน = รออนุมัติ · เทา = ยังเหลือ · ทั้งแถบ = โควตาปีนี้ + ยกยอด
import type { LeaveBalance } from "../../_types";

function percentOf(part: number, whole: number) {
    if (whole <= 0) return 0;
    return Math.min(100, Math.max(0, (part / whole) * 100));
}

export default function LeaveBalanceBars({ balances }: { balances: LeaveBalance[] }) {
    return (
        <section aria-label="วันลาคงเหลือ" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {balances.map((balance) => (
                <BalanceCard key={balance.lt_id} balance={balance} />
            ))}
        </section>
    );
}

function BalanceCard({ balance }: { balance: LeaveBalance }) {
    const used = Number(balance.used);
    const pending = Number(balance.pending);
    const carried = Number(balance.carried);
    const isUnlimited = balance.quota === null || balance.remaining === null;
    const total = isUnlimited ? 0 : Number(balance.quota) + carried;
    const remaining = isUnlimited ? 0 : Number(balance.remaining);
    const isOverQuota = !isUnlimited && remaining < 0;
    const usedPercent = percentOf(used, total);
    const pendingPercent = Math.min(100 - usedPercent, percentOf(pending, total));

    return (
        <div className="grid content-start gap-2 rounded-2xl border border-gray-200 bg-white p-4">
            <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm text-gray-700">
                    {balance.lt_name_th}
                    {!balance.lt_is_paid && !balance.lt_name_th.includes("ไม่รับค่าจ้าง") && (
                        <span className="text-xs text-gray-500"> · ไม่รับค่าจ้าง</span>
                    )}
                </span>
                <span className={`text-lg font-medium tabular-nums ${isOverQuota ? "text-red-600" : "text-gray-900"}`}>
                    {isUnlimited ? "ไม่จำกัด" : isOverQuota ? `เกิน ${-remaining} วัน` : `เหลือ ${remaining} วัน`}
                </span>
            </div>
            {!isUnlimited && (
                <div
                    className="flex h-2 overflow-hidden rounded-full bg-gray-100"
                    role="img"
                    aria-label={`ใช้ ${used} รออนุมัติ ${pending} จาก ${total} วัน`}
                >
                    <span className={isOverQuota ? "bg-red-500" : "bg-blue-600"} style={{ width: `${usedPercent}%` }} />
                    <span className="bg-blue-300" style={{ width: `${pendingPercent}%` }} />
                </div>
            )}
            <span className="text-xs text-gray-500 tabular-nums">
                ใช้ {used}
                {pending > 0 ? ` · รออนุมัติ ${pending}` : ""}
                {isUnlimited ? " วัน" : ` จาก ${total} วัน`}
                {carried > 0 ? ` (รวมยกยอด ${carried})` : ""}
            </span>
        </div>
    );
}
