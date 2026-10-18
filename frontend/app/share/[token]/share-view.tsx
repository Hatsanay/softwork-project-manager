"use client";

// ส่วนแสดงผลของหน้าที่ลูกค้าเปิดผ่านลิงก์ (แยกจาก page.tsx 18 ต.ค. 2026 ให้เดโมหน้า login ใช้หน้าตัวจริงได้)
// รับข้อมูลผ่าน props อย่างเดียว — ห้ามเรียก API / router ในไฟล์นี้ (scripts/check-demo-imports.mjs)
import { CalendarDays, CircleCheck, Clock, History, ListChecks, LinkIcon } from "lucide-react";
import CircularProgress from "@/components/ui/CircularProgress";
import StatusPill, { type PillTone } from "@/components/ui/status-pill";
import { CARD_CLASS } from "@/components/ui/card";
import formatDate, { formatDateOnly } from "@/app/function";

type ProjectStatus = "planning" | "in_progress" | "on_hold" | "completed" | "cancelled";
type TaskStatus = "todo" | "in_progress" | "review" | "done";

export type SharedProject = {
    project_id: string;
    project_name: string;
    project_description: string | null;
    project_status: ProjectStatus;
    project_start_date: string | null;
    project_due_date: string | null;
    project_progress_percent: string;
    client_name: string | null;
};

export type SharedTask = {
    task_id: string;
    task_title: string;
    task_status: TaskStatus;
    assignee_names: string | null;
    task_start_date: string | null;
    task_due_date: string | null;
};

export type TimelineEntry = {
    log_id: string;
    task_title: string;
    log_action: "created" | "status_changed";
    log_old_value: string | null;
    log_new_value: string | null;
    log_message: string | null;
    log_created_at: string;
};

const PROJECT_STATUS: Record<ProjectStatus, { label: string; tone: PillTone }> = {
    planning: { label: "วางแผน", tone: "neutral" },
    in_progress: { label: "กำลังทำ", tone: "info" },
    on_hold: { label: "พักไว้", tone: "wait" },
    completed: { label: "เสร็จแล้ว", tone: "success" },
    cancelled: { label: "ยกเลิก", tone: "danger" },
};

const TASK_STATUS: Record<TaskStatus, { label: string; tone: PillTone }> = {
    todo: { label: "รอดำเนินการ", tone: "neutral" },
    in_progress: { label: "กำลังทำ", tone: "info" },
    review: { label: "ตรวจสอบ", tone: "wait" },
    done: { label: "เสร็จแล้ว", tone: "success" },
};

const ACTION_LABEL: Record<TimelineEntry["log_action"], string> = {
    created: "สร้างงาน",
    status_changed: "เปลี่ยนสถานะงาน",
};

function statusLabel(value: string) {
    return TASK_STATUS[value as TaskStatus]?.label ?? value;
}

export function ShareShell({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen bg-gray-50">
            <header className="border-b border-gray-200 bg-white/80 backdrop-blur">
                <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
                    <span className="text-sm font-semibold tracking-wide text-gray-700">SOFTWORK</span>
                    <span className="flex items-center gap-1.5 text-xs text-gray-500">
                        <LinkIcon size={13} />
                        หน้าติดตามงานสำหรับลูกค้า
                    </span>
                </div>
            </header>
            <main className="mx-auto grid max-w-3xl gap-5 px-4 py-6 sm:px-6">{children}</main>
        </div>
    );
}

export default function SharedProjectView({
    project,
    tasks,
    timeline,
}: {
    project: SharedProject;
    tasks: SharedTask[];
    timeline: TimelineEntry[];
}) {
    const status = PROJECT_STATUS[project.project_status];
    const doneCount = tasks.filter((task) => task.task_status === "done").length;
    const activeCount = tasks.filter(
        (task) => task.task_status === "in_progress" || task.task_status === "review",
    ).length;
    const waitingCount = tasks.filter((task) => task.task_status === "todo").length;

    return (
        <ShareShell>
            <section className="relative overflow-hidden rounded-3xl bg-brand-grid p-5 text-white shadow-brand sm:p-7">
                <div className="flex flex-wrap items-center justify-between gap-5">
                    <div className="grid min-w-0 gap-1.5">
                        {project.client_name && <p className="text-sm text-blue-100">สำหรับ {project.client_name}</p>}
                        <h1 className="text-2xl font-medium wrap-break-word">{project.project_name}</h1>
                        <span className="w-fit rounded-full bg-white/90 px-0.5">
                            <StatusPill tone={status.tone}>{status.label}</StatusPill>
                        </span>
                    </div>
                    <div className="flex items-center gap-3 rounded-2xl border border-white/20 bg-white/12 p-3 backdrop-blur-sm">
                        <span className="rounded-full bg-white p-1">
                            <CircularProgress
                                percent={Number(project.project_progress_percent)}
                                size={60}
                                strokeWidth={6}
                            />
                        </span>
                        <span className="grid">
                            <span className="text-xs text-blue-100">ความคืบหน้า</span>
                            <span className="text-2xl font-medium tabular-nums">
                                {Number(project.project_progress_percent).toFixed(0)}%
                            </span>
                        </span>
                    </div>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-2xl border border-white/20 bg-white/12 p-3 backdrop-blur-sm">
                        <p className="flex items-center gap-1.5 text-xs text-blue-100">
                            <CalendarDays size={14} />
                            วันเริ่ม
                        </p>
                        <p>{project.project_start_date ? formatDateOnly(project.project_start_date) : "ยังไม่กำหนด"}</p>
                    </div>
                    <div className="rounded-2xl border border-white/20 bg-white/12 p-3 backdrop-blur-sm">
                        <p className="flex items-center gap-1.5 text-xs text-blue-100">
                            <CalendarDays size={14} />
                            กำหนดส่ง
                        </p>
                        <p>{project.project_due_date ? formatDateOnly(project.project_due_date) : "ยังไม่กำหนด"}</p>
                    </div>
                </div>
            </section>

            {project.project_description && (
                <section className={`p-5 text-sm whitespace-pre-wrap text-gray-700 ${CARD_CLASS}`}>
                    {project.project_description}
                </section>
            )}

            <section className="grid grid-cols-3 gap-3">
                {[
                    { label: "เสร็จแล้ว", value: doneCount, icon: CircleCheck, tone: "text-green-600 bg-green-50" },
                    { label: "กำลังทำ", value: activeCount, icon: Clock, tone: "text-blue-600 bg-blue-50" },
                    { label: "รอดำเนินการ", value: waitingCount, icon: ListChecks, tone: "text-gray-500 bg-gray-100" },
                ].map((item) => (
                    <div key={item.label} className={`grid gap-1 p-4 ${CARD_CLASS}`}>
                        <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${item.tone}`}>
                            <item.icon size={16} />
                        </span>
                        <span className="text-2xl font-medium tabular-nums text-gray-900">{item.value}</span>
                        <span className="text-xs text-gray-500">{item.label}</span>
                    </div>
                ))}
            </section>

            <section className={`grid gap-3 p-5 sm:p-6 ${CARD_CLASS}`}>
                <h2 className="text-base font-medium text-gray-900">รายการงาน</h2>
                {tasks.length === 0 ? (
                    <p className="rounded-xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                        ยังไม่มีงานในโปรเจกต์นี้
                    </p>
                ) : (
                    <ul className="grid gap-1">
                        {tasks.map((task) => (
                            <li
                                key={task.task_id}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2.5 odd:bg-gray-50/70"
                            >
                                <span className="grid min-w-0">
                                    <span className="text-sm text-gray-800">{task.task_title}</span>
                                    <span className="text-xs text-gray-500">
                                        {task.assignee_names ?? "ยังไม่มอบหมาย"} ·{" "}
                                        {formatDateOnly(task.task_start_date)} – {formatDateOnly(task.task_due_date)}
                                    </span>
                                </span>
                                <StatusPill tone={TASK_STATUS[task.task_status].tone}>
                                    {TASK_STATUS[task.task_status].label}
                                </StatusPill>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <section className={`grid gap-3 p-5 sm:p-6 ${CARD_CLASS}`}>
                <h2 className="flex items-center gap-2 text-base font-medium text-gray-900">
                    <History size={18} className="text-gray-400" />
                    ความเคลื่อนไหวล่าสุด
                </h2>
                {timeline.length === 0 ? (
                    <p className="rounded-xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                        ยังไม่มีความเคลื่อนไหว
                    </p>
                ) : (
                    <ol className="relative ml-1 grid max-h-96 gap-1 overflow-y-auto border-l border-gray-200">
                        {timeline.map((entry) => (
                            <li key={entry.log_id} className="relative py-1.5 pl-4 text-sm">
                                <span
                                    className="absolute top-3 left-[-4.5px] h-2 w-2 rounded-full bg-blue-500 ring-4 ring-white"
                                    aria-hidden="true"
                                />
                                <p className="text-gray-700">
                                    ทีมงาน{ACTION_LABEL[entry.log_action]}{" "}
                                    <span className="text-gray-900">{entry.task_title}</span>
                                    {entry.log_action === "status_changed" &&
                                        entry.log_old_value &&
                                        entry.log_new_value && (
                                            <>
                                                {" "}
                                                ({statusLabel(entry.log_old_value)} → {statusLabel(entry.log_new_value)}
                                                )
                                            </>
                                        )}
                                </p>
                                <p className="text-xs text-gray-400">{formatDate(entry.log_created_at)}</p>
                            </li>
                        ))}
                    </ol>
                )}
            </section>

            <p className="pb-4 text-center text-xs text-gray-400">
                ข้อมูลอัปเดตตามที่ทีมงานบันทึกในระบบ — รีเฟรชหน้าเพื่อดูล่าสุด
            </p>
        </ShareShell>
    );
}
