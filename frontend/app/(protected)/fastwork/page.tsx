"use client";

// หน้า Fastwork (2026-10-24 · P-1 · ปรับใหม่ 2026-11-01 · docs/plans/2026-11-01-fastwork-flow-simplify.md ข้อ 6)
// 4 ช่วงของทุกงาน: รับงาน → ส่งงวด → รับเงิน → ปิดงาน · งานทำจบในหน้าโปรเจกต์ หน้านี้รวมสิ่งที่ต้องทำ + งานแยกตามช่วง
// สิ่งที่ต้องทำ = กฎเดียวกับ "ต่อไปต้องทำ" ของโปรเจกต์ (backend ตัวเดียว) · เห็นเฉพาะเรื่องที่สิทธิ์ตัวเองกดได้
// ค่าใช้จ่าย เบิกล่วงหน้า เงินทุน = ทำเมื่อมี/รายงาน ไม่ใช่ขั้นของงาน → อยู่ในลิงก์รองด้านบน
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Calculator, ChevronDown, FilePlus2, Link2, ListPlus, Plus, Settings2, type LucideIcon } from "lucide-react";
import PageHeader from "@/components/ui/page-header";
import StatusBanner from "@/components/ui/guidance/status-banner";
import HowItWorks from "@/components/ui/guidance/how-it-works";
import EmptyState from "@/components/ui/empty-state";
import StatusPill from "@/components/ui/status-pill";
import Segmented from "@/components/ui/segmented";
import { PageSkeleton } from "@/components/ui/skeleton";
import { CARD_CLASS } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { usePermission, BITS } from "@/app/components/permission-provider";
import { apiFetch, type ApiError } from "@/lib/api";
import { formatAmount } from "@/lib/shared/money.mjs";
import { formatDateOnly } from "@/app/function";
import ProjectTodoCard from "@/app/(protected)/dashboard/_components/project-todo-card";
import type { FastworkNextStep, FastworkOverview } from "./_types";
import FastworkSettingsSheet from "./_components/settings-sheet";
import DocumentsBackfillCard from "./_components/documents-backfill-card";
import { FASTWORK_MESSAGES } from "./_messages";
import { NEXT_STEP } from "./_next-step";

type JobRow = FastworkOverview["projects"][number];
type Stage = "deliver" | "money" | "close" | "pay" | "done";

// ช่วงของงานจากขั้นถัดไป (ส่งงวด · รับเงิน · ปิดงาน · ค้างจ่ายส่วนแบ่ง · จบแล้ว)
const STAGE_OF: Record<FastworkNextStep, Stage> = {
    work: "deliver",
    record: "money",
    receive: "money",
    close: "close",
    pay: "pay",
    done: "done",
};

const STAGE_TABS: { value: Stage; label: string; empty: string }[] = [
    { value: "deliver", label: "กำลังทำ", empty: "ไม่มีงานที่กำลังทำ" },
    { value: "money", label: "รอเงิน", empty: "ไม่มีงานที่รอบันทึกเงินหรือรอโอน" },
    { value: "close", label: "พร้อมปิดงาน", empty: "ไม่มีงานที่เงินเข้าครบรอปิด" },
    { value: "pay", label: "ค้างจ่ายส่วนแบ่ง", empty: "ไม่มีส่วนแบ่งค้างจ่าย" },
    { value: "done", label: "จบแล้ว", empty: "ยังไม่มีงานที่จบ" },
];

const FLOW = [
    { number: 1, title: "รับงาน", body: "กรอกงวดตามที่ตกลง + ทีมและส่วนแบ่ง" },
    { number: 2, title: "ส่งงวด", body: 'ส่งงานบน Fastwork แล้วกด "ส่งงานแล้ว"' },
    { number: 3, title: "รับเงิน", body: "ลูกค้ายืนยันงวด → บันทึกเงิน (เงินเข้าแล้วติ๊กได้เลย)" },
    { number: 4, title: "ปิดงาน", body: "เงินเข้าครบ → ปิดงานและปิดยอด → จ่ายส่วนแบ่ง" },
];

/** ปุ่มขั้นถัดไปของงาน · บันทึกเงิน/ยืนยันเงินเข้าทำในการ์ดงวดของหน้าโปรเจกต์ · ปิดงาน/จ่ายส่วนแบ่งทำในหน้าส่วนแบ่ง */
function nextAction(row: JobRow, canManageShares: boolean) {
    const projectHref = `/projects/view?id=${encodeURIComponent(row.project_id)}`;
    if (row.next_step === "record") return { label: "บันทึกเงิน", href: `${projectHref}#project-fastwork` };
    if (row.next_step === "receive") return { label: "ยืนยันเงินเข้า", href: `${projectHref}#project-fastwork` };
    if (canManageShares && row.next_step === "close") return { label: "ปิดงาน", href: `/fastwork/shares/project?id=${encodeURIComponent(row.project_id)}` };
    if (canManageShares && row.next_step === "pay") return { label: "จ่ายส่วนแบ่ง", href: `/fastwork/shares/project?id=${encodeURIComponent(row.project_id)}` };
    return { label: "เปิดงาน", href: projectHref };
}

export default function FastworkPage() {
    const hasBit = usePermission();
    const canManage = hasBit(BITS.manageFastwork);
    const canManageShares = hasBit(BITS.manageProfitShares);
    const [overview, setOverview] = useState<FastworkOverview | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isStartOpen, setIsStartOpen] = useState(false);
    // null = เลือกแท็บแรกที่มีงานให้เอง
    const [pickedStage, setPickedStage] = useState<Stage | null>(null);

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
                        <button
                            type="button"
                            aria-expanded={isStartOpen}
                            aria-controls="start-job-panel"
                            className={buttonClass("primary", "md")}
                            onClick={() => setIsStartOpen((isOpen) => !isOpen)}
                        >
                            <Plus size={16} />
                            รับงานใหม่
                            <ChevronDown size={16} className={`transition ${isStartOpen ? "rotate-180" : ""}`} aria-hidden="true" />
                        </button>
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

    const jobsByStage = new Map<Stage, JobRow[]>(STAGE_TABS.map((tab) => [tab.value, []]));
    for (const row of overview.projects) jobsByStage.get(STAGE_OF[row.next_step])?.push(row);
    const countOf = (stage: Stage) => jobsByStage.get(stage)?.length ?? 0;
    const firstBusyStage = STAGE_TABS.find((tab) => tab.value !== "done" && countOf(tab.value) > 0)?.value ?? "deliver";
    const stage = pickedStage ?? firstBusyStage;
    const stageTab = STAGE_TABS.find((tab) => tab.value === stage) ?? STAGE_TABS[0];
    const stageJobs = jobsByStage.get(stage) ?? [];
    // ตัวเลขบนแถบ 4 ช่วง: งานที่อยู่ในช่วงนั้นตอนนี้ (รับงาน = ทางเข้า ไม่มีตัวเลข)
    const flowCounts = [null, countOf("deliver"), countOf("money"), countOf("close") + countOf("pay")];

    const secondaryLinks = [
        { href: "/fastwork/payouts", label: "เงินจาก Fastwork", isAllowed: canManage },
        { href: "/fastwork/shares", label: "ส่วนแบ่งกำไร", isAllowed: canManageShares },
        { href: "/fastwork/capital", label: "เงินทุนสะสม", isAllowed: hasBit(BITS.manageCapitalFund) },
        { href: "/purchasing/expenses", label: "ค่าใช้จ่ายของงาน", isAllowed: hasBit(BITS.createExpense) || hasBit(BITS.viewExpenses) },
    ].filter((link) => link.isAllowed);

    return (
        <div className="grid w-full grid-cols-1 gap-6">
            {header}

            {/* รับงานใหม่: เลือกทางตามสถานการณ์ · ทุกทางจบที่ผู้ซื้อจ่ายบน Fastwork แล้วค่อยบันทึกงานในระบบ */}
            {isStartOpen && canManage && (
                <section id="start-job-panel" aria-label="เลือกทางรับงานใหม่" className={`grid gap-3 p-4 sm:p-5 ${CARD_CLASS}`}>
                    <p className="text-sm text-gray-600">
                        ทุกทางจบที่ผู้ซื้อจ่ายบน Fastwork แล้วค่อยบันทึกงานในระบบ · ระบบออกใบเสนอราคา ใบแจ้งหนี้ ใบเสร็จ ให้เองเป็นหลักฐาน
                    </p>
                    <ul className="grid gap-3 sm:grid-cols-2">
                        <StartPath
                            title="ผู้ซื้อจ่ายแล้ว กรอกงานเลย"
                            body="ใส่ชื่องาน ลูกค้า งวดตามที่ตกลง และทีมกับส่วนแบ่ง"
                            href="/fastwork/new"
                            label="กรอกงานใหม่"
                            icon={FilePlus2}
                            isPrimary
                        />
                        {hasBit(BITS.manageServiceRequests) && (
                            <StartPath
                                title="ผู้ซื้อยังไม่ชัดว่าต้องการอะไร"
                                body="ส่งลิงก์ให้เลือกแพ็กและตอบคำถามเอง · จ่ายแล้วรับงานจากหน้าคำขอ"
                                href="/sales/order-links?kind=fastwork"
                                label="ลิงก์ให้ผู้ซื้อ"
                                icon={Link2}
                            />
                        )}
                        <StartPath
                            title="ผู้ซื้อบอกชัดแล้ว อยากตอบราคาเร็ว"
                            body="คิดราคาเสนอและเงินเข้าจริง · คัดลอกขอบเขตไปวางในแชต · จ่ายแล้วกดสร้างงาน"
                            href="/sales/price-calculator?mode=fastwork"
                            label="ตัวคิดราคา"
                            icon={Calculator}
                        />
                        <StartPath
                            title="ลูกค้าจ้างเพิ่มในงานที่ยังไม่จบ"
                            body='คิดราคาแล้วกด "เพิ่มเป็นงวดของงานเดิม" · งานจบแล้ว = รับเป็นงานใหม่'
                            href="/sales/price-calculator?mode=fastwork"
                            label="ตัวคิดราคา"
                            icon={ListPlus}
                        />
                    </ul>
                </section>
            )}

            {/* แถบ 4 ช่วงของทุกงาน · ตัวเลข = งานที่อยู่ในช่วงนั้นตอนนี้ */}
            <section aria-label="ขั้นตอนงาน Fastwork" className="grid gap-3">
                <ol className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                    {FLOW.map((step, index) => (
                        <li key={step.number} className={`grid content-start gap-1 p-3 ${CARD_CLASS}`}>
                            <span className="flex items-center justify-between gap-2">
                                <span className="flex items-center gap-2 text-sm font-medium text-gray-900">
                                    <span
                                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-medium text-blue-600 tabular-nums"
                                        aria-hidden="true"
                                    >
                                        {step.number}
                                    </span>
                                    {step.title}
                                </span>
                                {flowCounts[index] !== null && (
                                    <span className={`text-sm tabular-nums ${flowCounts[index] ? "font-medium text-blue-700" : "text-gray-400"}`}>
                                        {flowCounts[index]} งาน
                                    </span>
                                )}
                            </span>
                            <span className="text-xs leading-relaxed text-gray-500">{step.body}</span>
                        </li>
                    ))}
                </ol>
                {secondaryLinks.length > 0 && (
                    <nav aria-label="หน้าที่เกี่ยวข้อง" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                        <span className="text-gray-500">ดูรวม:</span>
                        {secondaryLinks.map((link) => (
                            <Link key={link.href} href={link.href} className="-my-1 inline-flex min-h-9 items-center text-blue-600 hover:underline">
                                {link.label}
                            </Link>
                        ))}
                    </nav>
                )}
                <HowItWorks label="เงินจาก Fastwork คิดอย่างไร">
                    <p>{FASTWORK_MESSAGES.moneyFlow}</p>
                    <p>{FASTWORK_MESSAGES.profit}</p>
                </HowItWorks>
            </section>

            {/* เอกสารงาน Fastwork (2026-11-01): ออกย้อนหลังให้งานเดิม · ขึ้นเฉพาะตอนมีงานที่ขาดเอกสาร */}
            {canManage && <DocumentsBackfillCard onDone={load} />}

            <ProjectTodoCard todo={overview.todo} title="สิ่งที่ต้องทำตอนนี้" />

            <section id="active-jobs" className="grid scroll-mt-24 gap-3" aria-labelledby="jobs-title">
                <h2 id="jobs-title" className="text-base font-medium text-gray-900">
                    งาน Fastwork
                </h2>
                <Segmented<Stage>
                    label="ช่วงของงาน"
                    role="tablist"
                    idPrefix="fastwork-stage"
                    value={stage}
                    onChange={setPickedStage}
                    options={STAGE_TABS.map((tab) => ({ value: tab.value, label: tab.label, count: countOf(tab.value) }))}
                />
                <div role="tabpanel" id={`fastwork-stage-panel-${stage}`} aria-labelledby={`fastwork-stage-tab-${stage}`}>
                    {stageJobs.length === 0 ? (
                        <EmptyState
                            title={stageTab.empty}
                            description={stage === "deliver" && canManage ? 'รับงานบน Fastwork แล้วกด "รับงานใหม่" ด้านบน' : "งานจะย้ายมาช่วงนี้เองเมื่อถึงขั้น"}
                        />
                    ) : (
                        <ul className="grid gap-2">
                            {stageJobs.map((row) => (
                                <JobCard key={row.project_id} row={row} action={nextAction(row, canManageShares)} />
                            ))}
                        </ul>
                    )}
                    {stage === "done" && stageJobs.length > 0 && <p className="mt-2 text-xs text-gray-500">แสดงงานที่จบล่าสุด 20 งาน · งานทั้งหมดดูได้ที่หน้าโปรเจกต์</p>}
                </div>
            </section>

            {isSettingsOpen && <FastworkSettingsSheet onClose={() => setIsSettingsOpen(false)} onSaved={load} />}
        </div>
    );
}

/** การ์ดงาน: ชื่อ · ลูกค้า · แถบงวด (ส่งแล้ว / เงินเข้า) · ราคางาน · ปุ่มขั้นถัดไป */
function JobCard({ row, action }: { row: JobRow; action: { label: string; href: string } }) {
    const nextStep = NEXT_STEP[row.next_step];
    const total = Math.max(row.milestone_count, 1);
    const receivedPercent = (row.received_count / total) * 100;
    const deliveredPercent = (row.delivered_count / total) * 100;
    return (
        <li className={`grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center ${CARD_CLASS}`}>
            <div className="grid min-w-0 gap-1.5">
                <Link
                    href={`/projects/view?id=${encodeURIComponent(row.project_id)}`}
                    className="-my-2 inline-flex min-h-10 items-center font-medium wrap-break-word text-gray-900 hover:text-blue-600"
                >
                    {row.project_name}
                </Link>
                <span className="text-xs text-gray-500">
                    {[row.client_name, row.project_fastwork_order_no ? `คำสั่งซื้อ ${row.project_fastwork_order_no}` : null, row.contract_amount ? `ราคางาน ${formatAmount(row.contract_amount)} บาท` : null]
                        .filter(Boolean)
                        .join(" · ")}
                </span>
                {/* แถบงวด: เขียว = เงินเข้าแล้ว · ฟ้า = ส่งงานแล้วรอเงิน · เทา = ยังไม่ส่ง */}
                <div className="grid gap-1">
                    <div
                        className="relative h-1.5 overflow-hidden rounded-full bg-gray-100"
                        role="img"
                        aria-label={`ส่งงานแล้ว ${row.delivered_count} จาก ${row.milestone_count} งวด · เงินเข้าแล้ว ${row.received_count} งวด`}
                    >
                        <span className="absolute inset-y-0 left-0 bg-blue-200" style={{ width: `${deliveredPercent}%` }} />
                        <span className="absolute inset-y-0 left-0 bg-green-500" style={{ width: `${receivedPercent}%` }} />
                    </div>
                    <span className="text-xs text-gray-600 tabular-nums">
                        ส่งแล้ว {row.delivered_count}/{row.milestone_count} งวด · เงินเข้า {row.received_count}/{row.milestone_count} งวด
                        {row.next_milestone
                            ? ` · งวดถัดไป ${row.next_milestone.fwm_name}${row.next_milestone.fwm_due_date ? ` ครบ ${formatDateOnly(row.next_milestone.fwm_due_date)}` : ""}`
                            : ""}
                    </span>
                </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <StatusPill tone={nextStep.tone}>{nextStep.label}</StatusPill>
                <Link href={action.href} className={buttonClass(action.label === "เปิดงาน" ? "secondary" : "primary", "sm")}>
                    {action.label}
                </Link>
            </div>
        </li>
    );
}

/** ทางเริ่มรับงาน: สถานการณ์ · ทำอย่างไร · ปุ่มไปหน้านั้น */
function StartPath({
    title,
    body,
    href,
    label,
    icon: Icon,
    isPrimary = false,
}: {
    title: string;
    body: string;
    href: string;
    label: string;
    icon: LucideIcon;
    isPrimary?: boolean;
}) {
    return (
        <li className="grid content-start gap-2 rounded-xl bg-gray-50 p-3">
            <span className="text-sm font-medium text-gray-900">{title}</span>
            <span className="text-xs leading-relaxed text-gray-600">{body}</span>
            <Link href={href} className={buttonClass(isPrimary ? "primary" : "secondary", "sm", "justify-self-start")}>
                <Icon size={15} aria-hidden="true" />
                {label}
            </Link>
        </li>
    );
}
