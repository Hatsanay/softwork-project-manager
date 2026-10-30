"use client";

// หน้า Fastwork (2026-10-24 · P-1 · docs/plans/2026-10-24-pre-incorporation.md ข้อ 5.1)
// การ์ดขั้นตอนเรียงตามงานจริง ตั้งแต่รับงานจนแบ่งกำไร · เลขขั้น = ลำดับที่ต้องทำ · ตัวเลขบนการ์ด = งานที่ค้างในขั้นนั้น
// กดการ์ดแล้วไปหน้าที่ต้องทำโดยเลือกตัวกรองให้แล้ว · ขั้นที่ยังไม่มีระบบขึ้น "เร็วๆ นี้"
// ไม่มีสิทธิ์ทำขั้นไหน การ์ดเป็นสีเทา บอกว่าต้องให้ผู้มีสิทธิ์ทำ (ยังเห็นขั้นตอนครบ)
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Calculator, Link2, Plus, Settings2 } from "lucide-react";
import PageHeader from "@/components/ui/page-header";
import StatusBanner from "@/components/ui/guidance/status-banner";
import HowItWorks from "@/components/ui/guidance/how-it-works";
import EmptyState from "@/components/ui/empty-state";
import StatusPill, { type PillTone } from "@/components/ui/status-pill";
import { PageSkeleton } from "@/components/ui/skeleton";
import { CARD_CLASS } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { usePermission, BITS } from "@/app/components/permission-provider";
import { apiFetch, type ApiError } from "@/lib/api";
import { formatAmount } from "@/lib/shared/money.mjs";
import { formatDateOnly } from "@/app/function";
import type { FastworkNextStep, FastworkOverview } from "./_types";
import FastworkSettingsSheet from "./_components/settings-sheet";
import { FASTWORK_MESSAGES } from "./_messages";

type Step = {
    number: number;
    title: string;
    description: string;
    href: string | null;
    // ตัวเลขงานค้าง (null = ขั้นนี้ไม่มีตัวนับ)
    pending: number | null;
    pendingLabel?: string;
    canDo: boolean;
    // ข้อความเมื่อไม่มีสิทธิ์ทำขั้นนี้
    whoCanDo?: string;
    isComingSoon?: boolean;
};

const MANAGE_FASTWORK = "ต้องให้ผู้มีสิทธิ์จัดการ Fastwork ทำ";
const MANAGE_SHARES = "ต้องให้ผู้มีสิทธิ์จัดการส่วนแบ่งกำไรทำ · ส่วนแบ่งของคุณดูได้ที่หน้าส่วนแบ่งของฉัน";

const NEXT_STEP: Record<FastworkNextStep, { label: string; tone: PillTone }> = {
    work: { label: "กำลังทำงาน", tone: "info" },
    record: { label: "รอบันทึกเงิน", tone: "wait" },
    receive: { label: "รอเงินเข้า", tone: "wait" },
    close: { label: "เงินเข้าครบ พร้อมปิดยอด", tone: "success" },
    pay: { label: "ปิดยอดแล้ว ค้างจ่ายส่วนแบ่ง", tone: "wait" },
    done: { label: "จ่ายส่วนแบ่งครบแล้ว", tone: "success" },
};

const NEXT_STEP_BUTTON: Record<FastworkNextStep, string> = {
    work: "เปิดงาน",
    record: "บันทึกเงิน",
    receive: "ยืนยันเงินเข้า",
    close: "ปิดยอด",
    pay: "จ่ายส่วนแบ่ง",
    done: "เปิดงาน",
};

function nextStepHref(row: FastworkOverview["projects"][number], canManageShares: boolean) {
    if (row.next_step === "record") return `/fastwork/payouts?new=1&project=${row.project_id}`;
    if (row.next_step === "receive") return `/fastwork/payouts?status=pending&project=${row.project_id}`;
    if (canManageShares && (row.next_step === "close" || row.next_step === "pay")) return `/fastwork/shares/project?id=${row.project_id}`;
    return `/projects/view?id=${row.project_id}`;
}

export default function FastworkPage() {
    const hasBit = usePermission();
    const canManage = hasBit(BITS.manageFastwork);
    const canManageShares = hasBit(BITS.manageProfitShares);
    const [overview, setOverview] = useState<FastworkOverview | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    const load = useCallback(async () => {
        const { data, error } = await apiFetch<FastworkOverview>("/fastwork/overview");
        setLoadError(error);
        if (data) setOverview(data);
    }, []);

    useEffect(() => {
        let isLeftPage = false;
        apiFetch<FastworkOverview>("/fastwork/overview").then(({ data, error }) => {
            if (isLeftPage) return;
            setLoadError(error);
            if (data) setOverview(data);
        });
        return () => {
            isLeftPage = true;
        };
    }, []);

    const header = (
        <PageHeader
            eyebrow="ช่วงก่อนจดบริษัท"
            title="งาน Fastwork"
            description={FASTWORK_MESSAGES.description}
            actions={
                canManage && (
                    <>
                        <button type="button" className={buttonClass("secondary", "md")} onClick={() => setIsSettingsOpen(true)}>
                            <Settings2 size={16} />
                            ค่าธรรมเนียม
                        </button>
                        <Link href="/fastwork/new" className={buttonClass("primary", "md")}>
                            <Plus size={16} />
                            รับงานใหม่
                        </Link>
                    </>
                )
            }
        />
    );

    if (loadError) {
        return (
            <div className="grid w-full grid-cols-1 gap-6">
                {header}
                <StatusBanner tone="error" title="โหลดหน้า Fastwork ไม่สำเร็จ">
                    {loadError.message}
                </StatusBanner>
            </div>
        );
    }
    if (!overview) return <PageSkeleton />;

    const { steps } = overview;
    const stepCards: Step[] = [
        {
            number: 1,
            title: "รับงานจาก Fastwork → สร้างโปรเจกต์",
            description: "กรอกราคางานแยกงวดตามที่ตกลงบน Fastwork · ลูกค้าใหม่พิมพ์แค่ชื่อที่แสดงบน Fastwork",
            href: "/fastwork/new",
            pending: null,
            canDo: canManage,
            whoCanDo: MANAGE_FASTWORK,
        },
        {
            number: 2,
            title: "ตั้งทีมและส่วนแบ่ง",
            description: "เพิ่มสมาชิกในหน้าโปรเจกต์ แล้วตั้งส่วนแบ่งกำไรของแต่ละคน (% หรือจำนวนเงิน) · ที่เหลือเข้าเงินทุน",
            href: "/fastwork/shares?state=unset",
            pending: steps.projects_without_shares,
            pendingLabel: "งานยังไม่ตั้งส่วนแบ่ง",
            canDo: canManageShares,
            whoCanDo: MANAGE_SHARES,
        },
        {
            number: 3,
            title: "ทำงานและส่งงานตามงวด",
            description: `ส่งงานบน Fastwork แล้วกด "ส่งงานแล้ว" ที่งวดในหน้าโปรเจกต์`,
            href: "#active-jobs",
            pending: steps.milestones_due_soon,
            pendingLabel: `งวดครบกำหนดใน ${overview.due_soon_days} วัน`,
            canDo: true,
        },
        {
            number: 4,
            title: "ลูกค้ายืนยันงวด → บันทึกเงินรอโอน",
            description: "เลือกงวด ระบบเติมราคางวดและค่าธรรมเนียมให้ แก้ได้ก่อนบันทึก",
            href: "/fastwork/payouts?new=1",
            pending: steps.milestones_awaiting_record,
            pendingLabel: "งวดส่งแล้วยังไม่บันทึกเงิน",
            canDo: canManage,
            whoCanDo: MANAGE_FASTWORK,
        },
        {
            number: 5,
            title: "เงินเข้าบัญชี → ยืนยันเงินเข้า",
            description: "ตรวจยอดกับสมุดบัญชี แก้ค่าธรรมเนียมให้ตรงกับที่โอนจริงได้",
            href: "/fastwork/payouts?status=pending",
            pending: steps.payouts_pending,
            pendingLabel:
                steps.payouts_pending_net === null
                    ? "รายการรอโอน"
                    : `รายการรอโอน · ยอดเข้า ${formatAmount(steps.payouts_pending_net)} บาท`,
            canDo: canManage,
            whoCanDo: MANAGE_FASTWORK,
        },
        {
            number: 6,
            title: "ค่าใช้จ่ายของโปรเจกต์",
            description: "ซื้อของ/จ้างคนนอกเพื่องานนี้ บันทึกค่าใช้จ่ายแล้วผูกโปรเจกต์ (เป็นต้นทุน หักก่อนแบ่งกำไร)",
            href: "/purchasing/expenses",
            pending: null,
            canDo: hasBit(BITS.createExpense) || hasBit(BITS.viewExpenses),
            whoCanDo: "ต้องให้ผู้มีสิทธิ์บันทึกค่าใช้จ่ายทำ",
        },
        {
            number: 7,
            title: "เบิกส่วนแบ่งล่วงหน้า",
            description: "ระหว่างทำงาน เบิกส่วนแบ่งบางส่วนได้ หักคืนตอนปิดยอด",
            href: "/fastwork/shares?state=open",
            pending: null,
            canDo: canManageShares,
            whoCanDo: MANAGE_SHARES,
        },
        {
            number: 8,
            title: "ปิดโปรเจกต์ → ปิดยอดส่วนแบ่ง",
            description: "เงินเข้าครบแล้ว คิดกำไรและส่วนแบ่งของแต่ละคน แล้วล็อกตัวเลข",
            href: "/fastwork/shares?state=ready",
            pending: steps.projects_ready_to_close,
            pendingLabel: "โปรเจกต์เงินเข้าครบแล้ว",
            canDo: canManageShares,
            whoCanDo: MANAGE_SHARES,
        },
        {
            number: 9,
            title: "จ่ายส่วนแบ่ง",
            description: "บันทึกการโอนให้แต่ละคน · แต่ละคนเห็นที่มาของยอดตัวเองในหน้าส่วนแบ่งของฉัน",
            href: "/fastwork/shares?state=unpaid",
            pending: steps.share_lines_unpaid,
            pendingLabel: "คนที่ยังไม่ได้จ่ายส่วนแบ่ง",
            canDo: canManageShares,
            whoCanDo: MANAGE_SHARES,
        },
        {
            number: 10,
            title: "เงินทุนสะสม",
            description: "ส่วนที่เก็บเข้าทุนของทุกโปรเจกต์ เทียบเป้าทุนเปิดบริษัท และเพดาน VAT 1.8 ล้านบาท/ปี",
            href: "/fastwork/capital",
            pending: null,
            canDo: hasBit(BITS.manageCapitalFund),
            whoCanDo: "ต้องให้ผู้มีสิทธิ์จัดการเงินทุนสะสมดู",
        },
    ];

    return (
        <div className="grid w-full grid-cols-1 gap-6">
            {header}
            <HowItWorks label="เงินจาก Fastwork คิดอย่างไร">
                <p>{FASTWORK_MESSAGES.moneyFlow}</p>
                <p>{FASTWORK_MESSAGES.profit}</p>
            </HowItWorks>

            {/* ก่อนรับงาน (S-5): คิดราคาในระบบ หรือส่งลิงก์ให้ผู้ซื้อเลือกขอบเขตเอง · ราคาและการจ่ายเงินอยู่บน Fastwork */}
            {(canManage || hasBit(BITS.manageServiceRequests)) && (
                <section aria-labelledby="before-hire-title" className={`grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center ${CARD_CLASS}`}>
                    <div className="grid gap-0.5">
                        <h2 id="before-hire-title" className="text-base font-medium text-gray-900">
                            ก่อนรับงาน (ยังคุยในแชต)
                        </h2>
                        <p className="text-sm text-gray-500">คิดราคาจากสินค้าในระบบพร้อมเงินเข้าจริงหลังหักค่าธรรมเนียม หรือส่งลิงก์ให้ผู้ซื้อเลือกขอบเขตและตอบคำถามเอง</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {canManage && (
                            <Link href="/fastwork/price" className={buttonClass("secondary", "md")}>
                                <Calculator size={16} />
                                ตัวคิดราคา
                            </Link>
                        )}
                        {hasBit(BITS.manageServiceRequests) && (
                            <Link href="/sales/order-links?kind=fastwork" className={buttonClass("secondary", "md")}>
                                <Link2 size={16} />
                                ลิงก์ให้ผู้ซื้อ
                            </Link>
                        )}
                    </div>
                </section>
            )}

            <section aria-label="ขั้นตอนงาน Fastwork">
                <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {stepCards.map((step) => (
                        <StepCard key={step.number} step={step} />
                    ))}
                </ol>
            </section>

            <section id="active-jobs" className="grid scroll-mt-24 gap-3" aria-label="งาน Fastwork ที่กำลังทำ">
                <h2 className="text-base font-medium text-gray-900">งาน Fastwork ที่กำลังทำ ({overview.projects.length})</h2>
                {overview.projects.length === 0 ? (
                    <EmptyState
                        title="ยังไม่มีงาน Fastwork ที่กำลังทำ"
                        description={canManage ? 'รับงานบน Fastwork แล้วกด "รับงานใหม่" ด้านบน' : "ผู้มีสิทธิ์จัดการ Fastwork เป็นคนสร้างงาน"}
                    />
                ) : (
                    <ul className="grid gap-2">
                        {overview.projects.map((row) => {
                            const nextStep = NEXT_STEP[row.next_step];
                            return (
                                <li key={row.project_id} className={`grid gap-2 p-4 sm:grid-cols-[1fr_auto] sm:items-center ${CARD_CLASS}`}>
                                    <div className="grid min-w-0 gap-0.5">
                                        <Link
                                            href={`/projects/view?id=${row.project_id}`}
                                            className="-my-2 inline-flex min-h-10 min-w-10 items-center font-medium wrap-break-word text-gray-900 hover:text-blue-600"
                                        >
                                            {row.project_name}
                                        </Link>
                                        <span className="text-xs text-gray-500">
                                            {[
                                                row.client_name,
                                                row.project_fastwork_order_no ? `คำสั่งซื้อ ${row.project_fastwork_order_no}` : null,
                                                `เงินเข้าแล้ว ${row.received_count}/${row.milestone_count} งวด`,
                                                row.contract_amount ? `ราคางาน ${formatAmount(row.contract_amount)} บาท` : null,
                                            ]
                                                .filter(Boolean)
                                                .join(" · ")}
                                        </span>
                                        {row.next_milestone && (
                                            <span className="text-xs text-gray-600">
                                                งวดถัดไป: {row.next_milestone.fwm_name}
                                                {row.next_milestone.fwm_due_date
                                                    ? ` · ครบกำหนด ${formatDateOnly(row.next_milestone.fwm_due_date)}`
                                                    : ""}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                                        <StatusPill tone={nextStep.tone}>{nextStep.label}</StatusPill>
                                        <Link href={nextStepHref(row, canManageShares)} className={buttonClass("secondary", "sm")}>
                                            {nextStepHref(row, canManageShares).startsWith("/projects/") ? "เปิดงาน" : NEXT_STEP_BUTTON[row.next_step]}
                                        </Link>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>

            {isSettingsOpen && <FastworkSettingsSheet onClose={() => setIsSettingsOpen(false)} onSaved={load} />}
        </div>
    );
}

function StepCard({ step }: { step: Step }) {
    const hasPending = (step.pending ?? 0) > 0;
    const isDisabled = !step.canDo || step.href === null;
    const tone = hasPending && step.canDo ? "border-blue-300 ring-1 ring-blue-100" : "";
    const body = (
        <>
            <span className="flex items-start justify-between gap-3">
                <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium tabular-nums ${
                        isDisabled ? "bg-gray-100 text-gray-400" : "bg-blue-50 text-blue-600"
                    }`}
                    aria-hidden="true"
                >
                    {step.number}
                </span>
                {step.isComingSoon && <StatusPill tone="neutral">เร็วๆ นี้</StatusPill>}
            </span>
            <span className={`font-medium ${isDisabled ? "text-gray-500" : "text-gray-900"}`}>
                <span className="sr-only">ขั้นที่ {step.number}: </span>
                {step.title}
            </span>
            <span className="text-sm text-gray-500">{step.description}</span>
            {step.pending !== null && (
                <span className={`text-sm ${hasPending ? "font-medium text-blue-700" : "text-gray-400"}`}>
                    {hasPending ? `${step.pending} ${step.pendingLabel}` : "ไม่มีค้าง"}
                </span>
            )}
            {!step.canDo && step.whoCanDo && <span className="text-xs text-gray-500">{step.whoCanDo}</span>}
        </>
    );
    const className = `grid content-start gap-2 p-4 ${CARD_CLASS} ${tone}`;
    return (
        <li className="grid">
            {isDisabled ? (
                <div className={`${className} bg-gray-50/60`}>{body}</div>
            ) : (
                <Link href={step.href ?? "#"} className={`${className} transition hover:border-blue-300 hover:shadow-float`}>
                    {body}
                </Link>
            )}
        </li>
    );
}
