"use client";

// ส่วนแบ่งของฉัน (2026-10-25 · P-2 · ทุกคนที่ login เห็นเฉพาะของตัวเอง)
// ทุกโปรเจกต์ที่ฉันมีส่วนแบ่ง: ที่มาของกำไรครบทุกบรรทัด → ส่วนของฉัน − เบิกล่วงหน้า = ต้องได้ → หัก ณ ที่จ่าย = ยอดโอน
// ยังไม่ปิดยอด = ประมาณการ ณ วันนี้ · ปิดยอดแล้ว = ตัวเลขที่ล็อก ณ วันปิดยอด · ไม่เห็นส่วนแบ่งของคนอื่น
import { useEffect, useState } from "react";
import PageHeader from "@/components/ui/page-header";
import StatusBanner from "@/components/ui/guidance/status-banner";
import HowItWorks from "@/components/ui/guidance/how-it-works";
import FieldHint from "@/components/ui/guidance/field-hint";
import EmptyState from "@/components/ui/empty-state";
import StatusPill, { type PillTone } from "@/components/ui/status-pill";
import { PageSkeleton } from "@/components/ui/skeleton";
import { CARD_CLASS } from "@/components/ui/card";
import { apiFetch, type ApiError } from "@/lib/api";
import { formatAmount, parseHundredths } from "@/lib/shared/money.mjs";
import { formatDateOnly } from "@/app/function";
import type { MyShare } from "../../fastwork/_types";
import { SHARE_MESSAGES } from "../../fastwork/_messages";
import ProfitBreakdown, { TotalLine } from "../../fastwork/_components/profit-breakdown";

const STATE: Record<MyShare["state"], { label: string; tone: PillTone }> = {
    estimate: { label: "ประมาณการ ยังไม่ปิดยอด", tone: "info" },
    settled: { label: "ปิดยอดแล้ว รอโอน", tone: "wait" },
    paid: { label: "ได้รับแล้ว", tone: "success" },
};

const sumOf = (values: string[]) => values.reduce((sum, value) => sum + parseHundredths(value, "จำนวนเงิน"), 0n);

export default function MySharesPage() {
    const [shares, setShares] = useState<MyShare[] | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);

    useEffect(() => {
        let isLeftPage = false;
        apiFetch<{ data: MyShare[] }>("/profit-shares/mine").then(({ data, error }) => {
            if (isLeftPage) return;
            setLoadError(error);
            if (data) setShares(data.data);
        });
        return () => {
            isLeftPage = true;
        };
    }, []);

    const header = <PageHeader eyebrow="บุคคล" title="ส่วนแบ่งของฉัน" description="ส่วนแบ่งกำไรรายโปรเจกต์ของคุณ พร้อมที่มาของตัวเลขทุกบรรทัด" />;
    if (loadError) {
        return (
            <div className="grid w-full grid-cols-1 gap-6">
                {header}
                <StatusBanner tone="error" title="โหลดส่วนแบ่งไม่สำเร็จ">
                    {loadError.message}
                </StatusBanner>
            </div>
        );
    }
    if (!shares) return <PageSkeleton />;

    // สรุปบนสุด: แยกตามสถานะ ไม่บวกประมาณการรวมกับยอดที่ได้จริง
    const estimateTotal = sumOf(shares.filter((share) => share.state === "estimate").map((share) => share.mine.due));
    const waitingTotal = sumOf(shares.filter((share) => share.state === "settled").map((share) => share.mine.due));
    const receivedTotal = sumOf(shares.filter((share) => share.state === "paid").map((share) => share.mine.transfer_amount ?? "0"));

    return (
        <div className="grid w-full grid-cols-1 gap-5">
            {header}
            <HowItWorks label="ส่วนแบ่งคิดอย่างไร">
                <p>{SHARE_MESSAGES.formula}</p>
                <p>{SHARE_MESSAGES.advance}</p>
                <p>{SHARE_MESSAGES.privacy}</p>
            </HowItWorks>

            {shares.length === 0 ? (
                <EmptyState title="ยังไม่มีส่วนแบ่ง" description="เมื่อผู้จัดการตั้งส่วนแบ่งของโปรเจกต์ที่คุณร่วมทำ ตัวเลขจะขึ้นที่นี่" />
            ) : (
                <>
                    <dl className="grid gap-3 sm:grid-cols-3">
                        <SummaryTile label="ได้รับแล้ว (ยอดโอน)" amount={receivedTotal} />
                        <SummaryTile label="ปิดยอดแล้ว รอโอน" amount={waitingTotal} />
                        <SummaryTile label="ประมาณการ (ยังไม่ปิดยอด)" amount={estimateTotal} hint="เปลี่ยนได้จนกว่าจะปิดยอด" />
                    </dl>
                    <ul className="grid gap-4 xl:grid-cols-2">
                        {shares.map((share) => (
                            <MyShareCard key={share.project.project_id} share={share} />
                        ))}
                    </ul>
                </>
            )}
        </div>
    );
}

function SummaryTile({ label, amount, hint }: { label: string; amount: bigint; hint?: string }) {
    return (
        <div className={`grid gap-1 p-4 ${CARD_CLASS}`}>
            <dt className="text-sm text-gray-500">{label}</dt>
            <dd className={`text-xl font-medium tabular-nums ${amount < 0n ? "text-red-600" : "text-gray-900"}`}>{formatAmount(amount)}</dd>
            {hint && <dd className="text-xs text-gray-400">{hint}</dd>}
        </div>
    );
}

function MyShareCard({ share }: { share: MyShare }) {
    const state = STATE[share.state];
    const { mine, numbers } = share;
    const isRefund = mine.due.startsWith("-");
    const hasWht = mine.wht !== null && Number(mine.wht) > 0;
    return (
        <li className={`grid content-start gap-4 p-4 sm:p-5 ${CARD_CLASS}`}>
            <div className="grid gap-1">
                <div className="flex flex-wrap items-center gap-2">
                    <StatusPill tone={state.tone}>{state.label}</StatusPill>
                    {share.settled_date && <span className="text-xs text-gray-500">ปิดยอด {formatDateOnly(share.settled_date)}</span>}
                </div>
                <h2 className="font-medium wrap-break-word text-gray-900">{share.project.project_name}</h2>
                <span className="text-xs text-gray-500">
                    {[share.project.project_channel === "fastwork" ? "งาน Fastwork" : "ลูกค้าตรง", share.project.client_name].filter(Boolean).join(" · ")}
                </span>
            </div>

            {share.state === "estimate" && (share.pending_payouts ?? 0) > 0 && (
                <FieldHint>ยังมีเงินรอโอนจาก Fastwork {share.pending_payouts} รายการ ยังไม่นับในตัวเลขนี้</FieldHint>
            )}

            <ProfitBreakdown
                revenue={numbers.revenue}
                platformFee={numbers.platform_fee}
                expenseCost={numbers.expense_cost}
                distributable={numbers.distributable}
                fixedTotal={numbers.fixed_total}
                afterFixed={numbers.after_fixed}
                revenueItems={share.revenue_items}
                expenseItems={share.expense_items}
            />

            {/* ส่วนของฉัน: ต่อจากบรรทัดสุดท้ายของที่มาของกำไร */}
            <div className="grid gap-1 rounded-xl border border-blue-100 bg-blue-50/40 p-3 text-sm">
                <div className="flex items-baseline justify-between gap-3 text-gray-700">
                    <span>
                        ส่วนของฉัน
                        {mine.kind === "percent"
                            ? ` ${Number(mine.percent)}% × ${formatAmount(numbers.after_fixed)}`
                            : " (จำนวนเงินตายตัวตามที่ตกลง)"}
                    </span>
                    <span className="shrink-0 tabular-nums">{formatAmount(mine.amount)}</span>
                </div>
                <div className="flex items-baseline justify-between gap-3 text-gray-700">
                    <span>− เบิกล่วงหน้าแล้ว</span>
                    <span className="shrink-0 tabular-nums">{formatAmount(mine.advanced)}</span>
                </div>
                <TotalLine label={isRefund ? "= เบิกเกิน ต้องคืน" : share.state === "estimate" ? "= คงเหลือ (ประมาณ)" : "= ต้องได้รับ"} amount={mine.due} />
                {share.state === "paid" && mine.transfer_amount !== null && Number(mine.due) !== 0 && (
                    <>
                        {hasWht && (
                            <div className="flex items-baseline justify-between gap-3 text-gray-700">
                                <span>− หัก ณ ที่จ่าย</span>
                                <span className="shrink-0 tabular-nums">{formatAmount(mine.wht ?? "0")}</span>
                            </div>
                        )}
                        <TotalLine label={isRefund ? "= คืนแล้ว" : "= ยอดโอนเข้าบัญชีคุณ"} amount={mine.transfer_amount} />
                        <span className="text-xs text-gray-500">
                            {[mine.paid_date ? formatDateOnly(mine.paid_date) : null, mine.reference ? `อ้างอิง ${mine.reference}` : null]
                                .filter(Boolean)
                                .join(" · ")}
                        </span>
                    </>
                )}
                {mine.kind === "percent" && numbers.after_fixed.startsWith("-") && (
                    <FieldHint>กำไรหลังหักส่วนตายตัวติดลบ ส่วนแบ่งแบบ % จึงเป็น 0</FieldHint>
                )}
            </div>

            {share.advances.length > 0 && (
                <div className="grid gap-1">
                    <span className="text-sm text-gray-800">ที่เบิกไปแล้ว</span>
                    <ul className="grid gap-1">
                        {share.advances.map((advance) => (
                            <li key={advance.sha_id} className="flex justify-between gap-3 text-xs text-gray-600">
                                <span className="min-w-0 wrap-break-word">
                                    {[formatDateOnly(advance.sha_paid_date), advance.sha_reference, advance.sha_note].filter(Boolean).join(" · ")}
                                </span>
                                <span className="shrink-0 tabular-nums">{formatAmount(advance.sha_amount)}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </li>
    );
}
