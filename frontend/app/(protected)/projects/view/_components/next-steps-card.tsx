"use client";

// ต่อไปต้องทำ (2026-10-31 · docs/plans/2026-10-31-project-next-steps.md · ขั้น N-1)
// เรื่องที่เร่งที่สุดเรื่องเดียวเด่นบนสุด พร้อมเหตุผลและปุ่มพาไปทำ · ที่เหลือพับไว้ "อีก N เรื่อง" · แถบขั้นของวงจรงาน
// กฎทั้งหมดอยู่ที่ backend (project-next-steps.service) · เรื่องเงินเห็นเฉพาะผู้มีสิทธิ์ · ทำไม่ได้ = บอกว่ารอใคร (ไม่มีปุ่ม)
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Compass } from "lucide-react";
import { CARD_CLASS } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

export type NextStepLevel = "urgent" | "todo" | "wait" | "info";

export type NextStepItem = {
    key: string;
    level: NextStepLevel;
    title: string;
    reason: string | null;
    action: { label: string; href: string } | null;
    waiting_for: string | null;
    count: number;
    sort_date: string | null;
};

// current = ขั้นแรกที่ยังไม่ครบ · is_complete ของแต่ละขั้นแยกกัน (เก็บเงินครบก่อนงานเสร็จได้)
export type ProjectStage = { steps: { key: string; label: string; is_complete: boolean }[]; current: number };

type NextSteps = { stage: ProjectStage | null; items: NextStepItem[] };

// สีตามความหมายเดิมของระบบ: แดง = เลยกำหนด · ฟ้า = ถึงคิวเรา · เทา = รอคนอื่น/ทำต่อได้
const LEVEL_STYLE: Record<NextStepLevel, { label: string; bar: string; text: string }> = {
    urgent: { label: "เร่ง", bar: "bg-red-500", text: "text-red-600" },
    todo: { label: "ถึงคิวเรา", bar: "bg-blue-500", text: "text-blue-600" },
    wait: { label: "รอคนอื่น", bar: "bg-gray-300", text: "text-gray-500" },
    info: { label: "ทำต่อได้", bar: "bg-gray-300", text: "text-gray-500" },
};

export default function NextStepsCard({ projectId, refreshKey }: { projectId: string; refreshKey: string }) {
    const [steps, setSteps] = useState<NextSteps | null>(null);

    // โหลดใหม่เมื่องานเปลี่ยน (refreshKey) · โหลดไม่ได้ = ไม่แสดงกล่อง (การ์ดอื่นในหน้ายังใช้งานได้)
    useEffect(() => {
        let isLeftPage = false;
        apiFetch<NextSteps>(`/projects/${encodeURIComponent(projectId)}/next-steps`).then(({ data }) => {
            if (!isLeftPage) setSteps(data);
        });
        return () => {
            isLeftPage = true;
        };
    }, [projectId, refreshKey]);

    if (!steps || (!steps.stage && steps.items.length === 0)) return null;
    const [first, ...others] = steps.items;
    const stage = steps.stage;

    return (
        <section aria-labelledby="next-steps-title" className={`grid gap-4 p-5 sm:p-6 ${CARD_CLASS}`}>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <h2 id="next-steps-title" className="flex items-center gap-2 text-base font-medium text-gray-900">
                    <Compass size={18} className="text-blue-600" aria-hidden="true" />
                    ต่อไปต้องทำ
                </h2>
                {stage && (
                    <span className="text-sm text-gray-500">
                        ขั้น {stage.current + 1}/{stage.steps.length} ·{" "}
                        <span className="font-medium text-gray-800">{stage.steps[stage.current].label}</span>
                    </span>
                )}
            </div>

            {first ? <StepRow entry={first} isMain /> : <p className="text-sm text-gray-600">ไม่มีเรื่องค้าง</p>}

            {others.length > 0 && (
                <details className="group rounded-xl bg-gray-50">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm text-gray-700 [&::-webkit-details-marker]:hidden">
                        <span className="shrink-0 text-blue-600 group-open:hidden">ดูอีก {others.length} เรื่อง</span>
                        <span className="hidden shrink-0 text-blue-600 group-open:inline">ซ่อน</span>
                        <span className="min-w-0 truncate text-gray-500 group-open:hidden">
                            {others.map((entry) => entry.title).join(" · ")}
                        </span>
                    </summary>
                    <ul className="grid gap-3 px-3 pt-1 pb-3">
                        {others.map((entry) => (
                            <li key={entry.key}>
                                <StepRow entry={entry} isMain={false} />
                            </li>
                        ))}
                    </ul>
                </details>
            )}

            {stage && <StageBar stage={stage} />}
        </section>
    );
}

function StepRow({ entry, isMain }: { entry: NextStepItem; isMain: boolean }) {
    const style = LEVEL_STYLE[entry.level];
    return (
        <div className="flex gap-3">
            <span className={`w-1 shrink-0 rounded-full ${style.bar}`} aria-hidden="true" />
            <div className="grid min-w-0 flex-1 gap-2 sm:flex sm:items-center sm:justify-between sm:gap-4">
                <div className="grid min-w-0 gap-0.5">
                    <span className={`text-xs ${style.text}`}>{style.label}</span>
                    <span className={`wrap-break-word text-gray-900 ${isMain ? "text-base font-medium" : "text-sm"}`}>
                        {entry.title}
                    </span>
                    {entry.reason && <span className="wrap-break-word text-sm text-gray-500">{entry.reason}</span>}
                </div>
                <div className="shrink-0">
                    {entry.action ? (
                        <ActionLink action={entry.action} isMain={isMain} />
                    ) : (
                        entry.waiting_for && <span className="text-sm text-gray-500">รอ: {entry.waiting_for}</span>
                    )}
                </div>
            </div>
        </div>
    );
}

// ลิงก์ไปการ์ดในหน้าเดียวกัน (#project-tasks ฯลฯ) ใช้ <a> ธรรมดาให้เบราว์เซอร์เลื่อนเอง · หน้าอื่นใช้ Link
function ActionLink({ action, isMain }: { action: { label: string; href: string }; isMain: boolean }) {
    const className = isMain
        ? buttonClass("primary", "md", "w-full justify-center sm:w-auto")
        : buttonClass("secondary", "sm", "w-full justify-center sm:w-auto");
    const content = (
        <>
            {action.label}
            <ArrowRight size={15} aria-hidden="true" />
        </>
    );
    const hashIndex = action.href.indexOf("#");
    if (action.href.startsWith("/projects/view?") && hashIndex !== -1) {
        return (
            <a href={action.href.slice(hashIndex)} className={className}>
                {content}
            </a>
        );
    }
    return (
        <Link href={action.href} className={className}>
            {content}
        </Link>
    );
}

// จอกว้าง: ขั้นทั้งหมดเรียงแถว · มือถือ: แถบเส้นแบ่งตามขั้น (ชื่อขั้นอยู่หัวกล่องแล้ว ไม่ล้น 360px)
function StageBar({ stage }: { stage: ProjectStage }) {
    return (
        <div className="border-t border-gray-100 pt-3">
            <div className="flex gap-1 sm:hidden" aria-hidden="true">
                {stage.steps.map((step, index) => (
                    <span
                        key={step.key}
                        className={`h-1.5 flex-1 rounded-full ${index === stage.current ? "bg-blue-600" : step.is_complete ? "bg-blue-300" : "bg-gray-200"}`}
                    />
                ))}
            </div>
            <ol className="hidden flex-wrap items-center gap-x-2 gap-y-1 text-sm sm:flex" aria-label="ขั้นของงาน">
                {stage.steps.map((step, index) => {
                    const isDone = step.is_complete && index !== stage.current;
                    const isCurrent = index === stage.current;
                    return (
                        <li key={step.key} className="flex items-center gap-2">
                            {index > 0 && (
                                <span className="text-gray-300" aria-hidden="true">
                                    ›
                                </span>
                            )}
                            <span
                                className={`flex items-center gap-1 ${isCurrent ? "font-medium text-blue-600" : isDone ? "text-gray-700" : "text-gray-400"}`}
                                aria-current={isCurrent ? "step" : undefined}
                            >
                                {isDone && <Check size={14} aria-hidden="true" />}
                                {isCurrent && <span className="h-2 w-2 rounded-full bg-blue-600" aria-hidden="true" />}
                                {step.label}
                            </span>
                        </li>
                    );
                })}
            </ol>
        </div>
    );
}
