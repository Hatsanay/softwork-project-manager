"use client";

// ภาพรวมธุรกิจบนแดชบอร์ด (2026-10-31 · docs/plans/2026-10-31-dashboard-business.md)
// แถบ "ต้องจัดการ" · เงินเข้าเดือนนี้ (กราฟ 6 เดือน) · เป้าเงินทุน · งาน Fastwork ที่กำลังทำ
// ทุกส่วนขึ้นเมื่อ backend ส่งมา (ตามสิทธิ์) · ตัวเลขเงินเรียงบนลงล่าง หนึ่งความหมายหนึ่งตัวเลข
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CircleCheck, PiggyBank, Rocket, Wallet, type LucideIcon } from "lucide-react";
import StatusPill from "@/components/ui/status-pill";
import { formatDateOnly } from "@/app/function";
import { formatAmount, parseHundredths } from "@/lib/shared/money.mjs";
import { NEXT_STEP } from "../../fastwork/_next-step";
import type { BusinessCashMonth, BusinessSummary } from "../_types";
import DashboardCard, { ListRows } from "./dashboard-card";

// สีกราฟ (ผ่านตัวตรวจสีกราฟ: แยกได้แม้ตาบอดสี) · ลูกค้าตรง = blue-700 · Fastwork = blue-400 (อ่อน ตัดพื้นไม่ถึง 3:1 จึงมีตัวเลข + ตาราง)
const DIRECT_COLOR = "#1d4ed8";
const FASTWORK_COLOR = "#60a5fa";
const CHART_HEIGHT_PX = 150;
const THAI_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

const toNumber = (amount: string) => Number(parseHundredths(amount, "ยอด")) / 100;
const monthLabel = (month: string) => THAI_MONTHS[Number(month.slice(5, 7)) - 1];
const monthFullLabel = (month: string) => `${monthLabel(month)} ${Number(month.slice(0, 4)) + 543}`;
// ตัวเลขย่อบนแท่ง: 12,500 → 12.5K · 1,250,000 → 1.25M
function compactAmount(amount: number) {
    if (amount >= 1_000_000) return `${Number((amount / 1_000_000).toFixed(2))}M`;
    if (amount >= 1_000) return `${Number((amount / 1_000).toFixed(1))}K`;
    return String(Math.round(amount));
}

// ─── แถบ "ต้องจัดการ" ───────────────────────────────────────────────────────────────────────

export type ActionItem = {
    key: string;
    value: string;
    label: string;
    note?: string;
    href: string;
    icon: LucideIcon;
    // urgent = เลยกำหนด/ต้องรีบ (แดง) · wait = รอคนอื่น/รอเงิน (เหลือง) · normal = ฟ้า
    tone: "urgent" | "wait" | "normal";
};

const TONE_CLASS: Record<ActionItem["tone"], { chip: string; ring: string }> = {
    urgent: { chip: "bg-red-50 text-red-600", ring: "hover:border-red-200" },
    wait: { chip: "bg-amber-50 text-amber-600", ring: "hover:border-amber-200" },
    normal: { chip: "bg-blue-50 text-blue-600", ring: "hover:border-blue-200" },
};

export function ActionStrip({ items }: { items: ActionItem[] }) {
    if (items.length === 0) {
        return (
            <p className="flex items-center gap-2 rounded-2xl border border-green-100 bg-green-50/60 px-4 py-3 text-sm text-green-700">
                <CircleCheck size={18} aria-hidden="true" />
                ไม่มีอะไรค้าง · งาน เงิน และคำขอของลูกค้าเรียบร้อยหมดแล้ว
            </p>
        );
    }
    return (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {items.map((item) => {
                const Icon = item.icon;
                const tone = TONE_CLASS[item.tone];
                return (
                    <li key={item.key} className="min-w-0">
                        <Link
                            href={item.href}
                            className={`group grid h-full content-start gap-2 rounded-2xl border border-gray-200 bg-white p-4 shadow-card transition ${tone.ring} focus-visible:ring-4 focus-visible:ring-blue-500/20 focus-visible:outline-none`}
                        >
                            <span className="flex items-center justify-between gap-2">
                                <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${tone.chip}`}>
                                    <Icon size={16} aria-hidden="true" />
                                </span>
                                <ArrowRight
                                    size={16}
                                    className="text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-gray-500"
                                    aria-hidden="true"
                                />
                            </span>
                            <span className="text-2xl font-medium text-gray-900 tabular-nums">{item.value}</span>
                            <span className="grid gap-0.5">
                                <span className="text-sm text-gray-700">{item.label}</span>
                                {item.note && <span className="text-xs text-gray-500">{item.note}</span>}
                            </span>
                        </Link>
                    </li>
                );
            })}
        </ul>
    );
}

// ─── เงินเข้าเดือนนี้ ───────────────────────────────────────────────────────────────────────

export function CashCard({
    months,
    receivables,
    fastworkPending,
}: {
    months: BusinessCashMonth[];
    receivables?: BusinessSummary["receivables"];
    // งวด Fastwork ที่ลูกค้ายืนยันแล้ว รอ Fastwork โอน (ยอดสุทธิ · null = ไม่มีสิทธิ์เห็นยอด)
    fastworkPending?: { count: number; net: string | null };
}) {
    const [activeIndex, setActiveIndex] = useState<number | null>(null);
    const thisMonth = months.at(-1) as BusinessCashMonth;
    const lastMonth = months.at(-2);
    const thisTotal = toNumber(thisMonth.total);
    const lastTotal = lastMonth ? toNumber(lastMonth.total) : 0;
    const change = lastTotal > 0 ? Math.round(((thisTotal - lastTotal) / lastTotal) * 100) : null;
    const maxTotal = Math.max(...months.map((month) => toNumber(month.total)), 1);
    const shown = activeIndex === null ? null : months[activeIndex];
    const hasPending = Boolean(receivables) || Boolean(fastworkPending && fastworkPending.count > 0);

    return (
        <DashboardCard
            icon={Wallet}
            title="เงินเข้าเดือนนี้"
            description="เงินเข้าบัญชีจริง: ใบเสร็จ (ยอดรับจริง) + เงิน Fastwork ที่โอนเข้าแล้ว (หลังหักค่าธรรมเนียม)"
            className="lg:col-span-2"
        >
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
                <div className="grid gap-0.5">
                    <p className="text-3xl font-medium text-gray-900 tabular-nums">
                        {formatAmount(thisMonth.total)}
                        <span className="ml-1.5 text-base font-normal text-gray-500">บาท</span>
                    </p>
                    <p className="text-sm text-gray-500">
                        {monthFullLabel(thisMonth.month)}
                        {change === null
                            ? lastMonth
                                ? " · เดือนก่อนไม่มีเงินเข้า"
                                : ""
                            : ` · ${change >= 0 ? "มากกว่า" : "น้อยกว่า"}เดือนก่อน ${Math.abs(change)}%`}
                    </p>
                </div>
                <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600" aria-label="สีในกราฟ">
                    <li className="flex items-center gap-1.5">
                        <span
                            className="h-2.5 w-2.5 rounded-sm"
                            style={{ background: DIRECT_COLOR }}
                            aria-hidden="true"
                        />
                        ลูกค้าตรง
                    </li>
                    <li className="flex items-center gap-1.5">
                        <span
                            className="h-2.5 w-2.5 rounded-sm"
                            style={{ background: FASTWORK_COLOR }}
                            aria-hidden="true"
                        />
                        Fastwork
                    </li>
                </ul>
            </div>

            {/* กราฟแท่งซ้อน 6 เดือน · ตัวเลขบนแท่งเฉพาะเดือนนี้ · แตะ/ชี้แท่งอื่นดูตัวเลข */}
            <div className="grid gap-2">
                <p className="min-h-5 text-xs text-gray-600" aria-live="polite">
                    {shown
                        ? `${monthFullLabel(shown.month)} · ลูกค้าตรง ${formatAmount(shown.direct)} · Fastwork ${formatAmount(shown.fastwork)} · รวม ${formatAmount(shown.total)} บาท`
                        : "แตะแท่งเพื่อดูตัวเลขของเดือนนั้น"}
                </p>
                <div
                    className="grid grid-cols-6 items-end gap-2 border-b border-gray-200"
                    style={{ height: CHART_HEIGHT_PX + 24 }}
                >
                    {months.map((month, index) => {
                        const direct = toNumber(month.direct);
                        const fastwork = toNumber(month.fastwork);
                        const total = direct + fastwork;
                        const isThisMonth = index === months.length - 1;
                        const directHeight = (direct / maxTotal) * CHART_HEIGHT_PX;
                        const fastworkHeight = (fastwork / maxTotal) * CHART_HEIGHT_PX;
                        return (
                            <button
                                key={month.month}
                                type="button"
                                aria-label={`${monthFullLabel(month.month)} รวม ${formatAmount(month.total)} บาท`}
                                aria-pressed={activeIndex === index}
                                onMouseEnter={() => setActiveIndex(index)}
                                onMouseLeave={() => setActiveIndex(null)}
                                onFocus={() => setActiveIndex(index)}
                                onBlur={() => setActiveIndex(null)}
                                onClick={() => setActiveIndex((current) => (current === index ? null : index))}
                                className={`flex h-full flex-col items-center justify-end rounded-t-lg pb-px transition focus-visible:outline-none ${
                                    activeIndex === index ? "bg-gray-50" : ""
                                }`}
                            >
                                {isThisMonth && total > 0 && (
                                    <span className="mb-1 text-[11px] font-medium text-gray-700 tabular-nums">
                                        {compactAmount(total)}
                                    </span>
                                )}
                                {fastworkHeight > 0 && (
                                    <span
                                        className="w-full max-w-6 rounded-t-[4px]"
                                        style={{ height: Math.max(fastworkHeight, 2), background: FASTWORK_COLOR }}
                                    />
                                )}
                                {fastworkHeight > 0 && directHeight > 0 && (
                                    <span className="h-0.5 w-full shrink-0" aria-hidden="true" />
                                )}
                                {directHeight > 0 && (
                                    <span
                                        className={`w-full max-w-6 ${fastworkHeight > 0 ? "" : "rounded-t-[4px]"}`}
                                        style={{ height: Math.max(directHeight, 2), background: DIRECT_COLOR }}
                                    />
                                )}
                            </button>
                        );
                    })}
                </div>
                <div className="grid grid-cols-6 gap-2 text-center text-xs text-gray-500">
                    {months.map((month, index) => (
                        <span
                            key={month.month}
                            className={index === months.length - 1 ? "font-medium text-gray-900" : ""}
                        >
                            {monthLabel(month.month)}
                        </span>
                    ))}
                </div>
            </div>

            <details className="group text-sm">
                <summary className="inline-flex min-h-10 cursor-pointer items-center text-blue-600 hover:underline">
                    ดูเป็นตาราง
                </summary>
                <div className="overflow-x-auto">
                    <table className="mt-1 w-full text-right tabular-nums">
                        <thead className="text-xs text-gray-500">
                            <tr>
                                <th className="py-1.5 text-left font-normal">เดือน</th>
                                <th className="py-1.5 font-normal">ลูกค้าตรง</th>
                                <th className="py-1.5 font-normal">Fastwork</th>
                                <th className="py-1.5 font-normal">รวม</th>
                            </tr>
                        </thead>
                        <tbody className="text-gray-700">
                            {months.map((month) => (
                                <tr key={month.month} className="border-t border-gray-100">
                                    <td className="py-1.5 text-left">{monthFullLabel(month.month)}</td>
                                    <td className="py-1.5">{formatAmount(month.direct)}</td>
                                    <td className="py-1.5">{formatAmount(month.fastwork)}</td>
                                    <td className="py-1.5 font-medium text-gray-900">{formatAmount(month.total)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </details>

            {hasPending && (
                <div className="grid gap-1.5 rounded-xl bg-gray-50 p-3 text-sm">
                    <p className="text-xs font-medium text-gray-500">ยังรอเข้า (ยังไม่นับในเงินเข้าด้านบน)</p>
                    {receivables && (
                        <Link
                            href="/sales/receivables"
                            className="flex min-h-9 items-center justify-between gap-3 text-gray-700 hover:text-blue-600"
                        >
                            <span>ลูกค้ายังไม่จ่าย (ลูกหนี้คงค้าง)</span>
                            <span className="tabular-nums">{formatAmount(receivables.outstanding)}</span>
                        </Link>
                    )}
                    {fastworkPending && fastworkPending.count > 0 && (
                        <Link
                            href="/fastwork/payouts?status=pending"
                            className="flex min-h-9 items-center justify-between gap-3 text-gray-700 hover:text-blue-600"
                        >
                            <span>รอ Fastwork โอน ({fastworkPending.count} งวด)</span>
                            <span className="tabular-nums">
                                {fastworkPending.net === null ? "-" : formatAmount(fastworkPending.net)}
                            </span>
                        </Link>
                    )}
                </div>
            )}
        </DashboardCard>
    );
}

// ─── เป้าเงินทุนเปิดบริษัท ─────────────────────────────────────────────────────────────────

export function CapitalCard({ capital }: { capital: NonNullable<BusinessSummary["capital"]> }) {
    const balance = parseHundredths(capital.balance, "เงินทุน");
    const goal = capital.goal === null ? null : parseHundredths(capital.goal, "เป้า");
    const remaining = goal !== null && goal > balance ? goal - balance : 0n;
    const percent = Math.min(capital.percent ?? 0, 100);
    return (
        <DashboardCard
            icon={PiggyBank}
            iconTone="green"
            title="เงินทุนเปิดบริษัท"
            description="เงินที่กันไว้จากกำไรแต่ละงาน + ฝากเพิ่ม · หักที่ถอนออก"
        >
            <p className="text-3xl font-medium text-gray-900 tabular-nums">
                {formatAmount(capital.balance)}
                <span className="ml-1.5 text-base font-normal text-gray-500">บาท</span>
            </p>
            {goal === null ? (
                <p className="text-sm text-gray-500">
                    ยังไม่ได้ตั้งเป้า ·{" "}
                    <Link
                        href="/fastwork/capital"
                        className="inline-flex min-h-10 items-center text-blue-600 hover:underline"
                    >
                        ตั้งเป้าที่หน้าเงินทุน
                    </Link>
                </p>
            ) : (
                <div className="grid gap-2">
                    <div
                        className="h-2.5 overflow-hidden rounded-full bg-gray-100"
                        role="progressbar"
                        aria-valuenow={percent}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label="ความคืบหน้าเงินทุน"
                    >
                        <div className="h-full rounded-full bg-green-500" style={{ width: `${percent}%` }} />
                    </div>
                    <p className="flex flex-wrap justify-between gap-x-3 text-sm text-gray-600">
                        <span className="tabular-nums">
                            {capital.percent ?? 0}% ของเป้า {formatAmount(capital.goal as string)}
                        </span>
                        <span className="tabular-nums">
                            {remaining > 0n ? `เหลือ ${formatAmount(remaining)}` : "ถึงเป้าแล้ว"}
                        </span>
                    </p>
                    {capital.target_date && (
                        <p className="text-xs text-gray-500">
                            ตั้งใจเปิดบริษัทภายใน {formatDateOnly(capital.target_date)}
                        </p>
                    )}
                </div>
            )}
            <Link
                href="/fastwork/capital"
                className="inline-flex min-h-10 items-center gap-1 justify-self-start text-sm text-blue-600 hover:underline"
            >
                ดูที่มาของเงินทุน
                <ArrowRight size={14} aria-hidden="true" />
            </Link>
        </DashboardCard>
    );
}

// ─── งาน Fastwork ที่กำลังทำ ───────────────────────────────────────────────────────────────

export function FastworkJobsCard({ fastwork }: { fastwork: NonNullable<BusinessSummary["fastwork"]> }) {
    return (
        <DashboardCard
            icon={Rocket}
            title="งาน Fastwork ที่กำลังทำ"
            description="ขั้นถัดไปของแต่ละงาน · กดเพื่อเปิดงาน"
            actions={
                <Link
                    href="/fastwork"
                    className="inline-flex min-h-10 items-center gap-1 text-sm text-blue-600 hover:underline"
                >
                    ดูทั้งหมด ({fastwork.project_count})
                    <ArrowRight size={14} aria-hidden="true" />
                </Link>
            }
        >
            {fastwork.projects.length === 0 ? (
                <p className="rounded-xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                    ยังไม่มีงาน Fastwork ที่กำลังทำ
                </p>
            ) : (
                <ListRows>
                    {fastwork.projects.map((project) => {
                        const nextStep = NEXT_STEP[project.next_step];
                        return (
                            <li key={project.project_id} className="min-w-0">
                                <Link
                                    href={`/projects/view?id=${project.project_id}`}
                                    className="flex w-full min-w-0 items-center justify-between gap-3 rounded-xl px-3 py-2.5 hover:bg-gray-50"
                                >
                                    <span className="grid min-w-0 gap-0.5">
                                        <span className="truncate text-sm text-gray-800">{project.project_name}</span>
                                        <span className="truncate text-xs text-gray-500">
                                            {[
                                                project.client_name,
                                                project.milestone_count > 0
                                                    ? `ได้เงินแล้ว ${project.received_count}/${project.milestone_count} งวด`
                                                    : null,
                                            ]
                                                .filter(Boolean)
                                                .join(" · ")}
                                        </span>
                                    </span>
                                    <StatusPill tone={nextStep.tone}>{nextStep.label}</StatusPill>
                                </Link>
                            </li>
                        );
                    })}
                </ListRows>
            )}
        </DashboardCard>
    );
}
