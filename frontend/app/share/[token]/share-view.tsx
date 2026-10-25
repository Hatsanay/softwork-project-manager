"use client";

// ส่วนแสดงผลของหน้าที่ลูกค้าเปิดผ่านลิงก์ (แยกจาก page.tsx 18 ต.ค. 2026 ให้เดโมหน้า login ใช้หน้าตัวจริงได้)
// รับข้อมูลผ่าน props อย่างเดียว — ห้ามเรียก API / router ในไฟล์นี้ (scripts/check-demo-imports.mjs)
// ปรับ 25 ต.ค. 2026: ชื่อร้าน/โลโก้บนหัว · สถานะที่ลูกค้าอ่านเข้าใจ (ไม่ขัดกับ %) · งานย่อยเป็นเช็กลิสต์ · ไม่แสดงผู้รับผิดชอบ/วันที่ว่าง
import { CalendarDays, Check, ChevronDown } from "lucide-react";
import CustomerShell, { CustomerSection } from "@/components/customer/customer-shell";
import HeroEyebrow from "@/components/ui/hero-eyebrow";
import CircularProgress from "@/components/ui/CircularProgress";
import StatusPill, { type PillTone } from "@/components/ui/status-pill";
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

export type SharedSubtask = { task_id: string; task_title: string; task_status: TaskStatus };

export type SharedTask = {
    task_id: string;
    task_title: string;
    task_status: TaskStatus;
    assignee_names: string | null;
    task_start_date: string | null;
    task_due_date: string | null;
    subtasks?: SharedSubtask[];
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

export type ShareShop = { name: string | null; logo_url: string | null };

const TASK_STATUS: Record<TaskStatus, { label: string; tone: PillTone }> = {
    todo: { label: "รอเริ่ม", tone: "neutral" },
    in_progress: { label: "กำลังทำ", tone: "info" },
    review: { label: "กำลังตรวจ", tone: "wait" },
    done: { label: "เสร็จแล้ว", tone: "success" },
};

const ACTION_LABEL: Record<TimelineEntry["log_action"], string> = {
    created: "เพิ่มงาน",
    status_changed: "อัปเดตงาน",
};

// ข้อความที่ระบบเขียนให้ตอนเปิดโปรเจกต์อัตโนมัติ (ภาษาภายใน) ไม่แสดงให้ลูกค้า
const AUTO_DESCRIPTION = /^(สร้างจากใบเสนอราคา|จากคำขอบริการ|ขอบเขตงานตามคำขอบริการ)/;

/** งานหลักเสร็จแล้ว = ทุกรายการในงานนั้นเสร็จ (ทีมปิดงานหลักโดยไม่ได้ติ๊กงานย่อยทีละข้อ ไม่ให้ลูกค้าเห็นตัวเลขขัดกัน) */
function subtasksOf(task: SharedTask): SharedSubtask[] {
    const subtasks = task.subtasks ?? [];
    return task.task_status === "done"
        ? subtasks.map((subtask) => ({ ...subtask, task_status: "done" as const }))
        : subtasks;
}

function statusLabel(value: string) {
    return TASK_STATUS[value as TaskStatus]?.label ?? value;
}

/**
 * สถานะที่ลูกค้าเห็น: ใช้สถานะโปรเจกต์ แต่ไม่ให้ขัดกับความคืบหน้า
 * (เช่น งานเสร็จครบ 100% แต่ทีมยังไม่ปิดโปรเจกต์ = "งานเสร็จครบ รอส่งมอบ" ไม่ใช่ "วางแผน")
 */
function customerStatus(project: SharedProject): { label: string; tone: PillTone } {
    const percent = Number(project.project_progress_percent);
    if (project.project_status === "completed") return { label: "ส่งมอบแล้ว", tone: "success" };
    if (project.project_status === "cancelled") return { label: "ยกเลิก", tone: "danger" };
    if (project.project_status === "on_hold") return { label: "พักไว้ชั่วคราว", tone: "wait" };
    if (percent >= 100) return { label: "งานเสร็จครบ รอส่งมอบ", tone: "success" };
    if (percent > 0 || project.project_status === "in_progress") return { label: "กำลังทำ", tone: "info" };
    return { label: "เตรียมเริ่มงาน", tone: "neutral" };
}

/** กรอบหน้าติดตามงาน = กรอบหน้าลูกค้ากลาง (components/customer) */
export function ShareShell({ shop, children }: { shop?: ShareShop | null; children: React.ReactNode }) {
    return (
        <CustomerShell shop={shop} label="หน้าติดตามงาน">
            {children}
        </CustomerShell>
    );
}

export default function SharedProjectView({
    project,
    tasks,
    timeline,
    shop = null,
}: {
    project: SharedProject;
    tasks: SharedTask[];
    timeline: TimelineEntry[];
    shop?: ShareShop | null;
}) {
    const status = customerStatus(project);
    const percent = Number(project.project_progress_percent);
    // นับจากสิ่งที่ส่งมอบจริง: งานที่มีงานย่อยนับงานย่อย · งานที่ไม่มีนับตัวงานเอง
    const units = tasks.flatMap((task) => {
        const subtasks = subtasksOf(task);
        return subtasks.length > 0 ? subtasks : [task];
    });
    const doneCount = units.filter((task) => task.task_status === "done").length;
    const activeCount = units.filter(
        (task) => task.task_status === "in_progress" || task.task_status === "review",
    ).length;
    const hasDates = Boolean(project.project_start_date || project.project_due_date);
    const description =
        project.project_description && !AUTO_DESCRIPTION.test(project.project_description)
            ? project.project_description
            : null;

    return (
        <ShareShell shop={shop}>
            <section className="surface-hero p-[clamp(1.25rem,0.9rem+1.6vw,2.25rem)]">
                <div className="flex flex-wrap items-center justify-between gap-5">
                    <div className="grid min-w-0 gap-2">
                        {project.client_name && <HeroEyebrow>สำหรับ {project.client_name}</HeroEyebrow>}
                        <h1 className="text-fluid-display font-medium text-gray-900 wrap-break-word">
                            {project.project_name}
                        </h1>
                        <span className="w-fit">
                            <StatusPill tone={status.tone}>{status.label}</StatusPill>
                        </span>
                    </div>
                    <div className="hero-tile flex items-center gap-3 p-3 pr-5">
                        <CircularProgress percent={percent} size={60} strokeWidth={6} />
                        <span className="grid">
                            <span className="text-xs text-gray-500">ความคืบหน้า</span>
                            <span className="text-2xl font-medium text-gray-900 tabular-nums">
                                {percent.toFixed(0)}%
                            </span>
                            {units.length > 0 && (
                                <span className="text-xs text-gray-500 tabular-nums">
                                    เสร็จ {doneCount} จาก {units.length} รายการ
                                </span>
                            )}
                        </span>
                    </div>
                </div>
                {hasDates ? (
                    <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                        <DateBox label="วันเริ่ม" value={project.project_start_date} />
                        <DateBox label="กำหนดส่ง" value={project.project_due_date} />
                    </div>
                ) : (
                    <p className="mt-4 flex items-center gap-1.5 text-sm text-gray-500">
                        <CalendarDays size={15} aria-hidden="true" />
                        ทีมงานจะแจ้งวันส่งงานให้ทราบ
                    </p>
                )}
            </section>

            {description && (
                <section className={`p-fluid card-customer text-fluid-lead whitespace-pre-wrap text-gray-700`}>
                    {description}
                </section>
            )}

            <CustomerSection
                index={1}
                id="tasks"
                title="งานของคุณ"
                description={
                    units.length > 0
                        ? `เสร็จ ${doneCount} · กำลังทำ ${activeCount} · รอเริ่ม ${units.length - doneCount - activeCount}`
                        : undefined
                }
            >
                {units.length > 0 && (
                    <div className="h-2 overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
                        <div
                            className="h-full rounded-full bg-linear-to-r from-blue-500 to-blue-600"
                            style={{ width: `${Math.min(100, (doneCount / units.length) * 100)}%` }}
                        />
                    </div>
                )}
                {tasks.length === 0 ? (
                    <p className="rounded-xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                        ทีมงานกำลังเตรียมรายการงาน
                    </p>
                ) : (
                    <ul className="grid gap-3">
                        {tasks.map((task) => (
                            <TaskCard key={task.task_id} task={task} />
                        ))}
                    </ul>
                )}
            </CustomerSection>

            <CustomerSection
                index={2}
                id="timeline"
                title="ความเคลื่อนไหวล่าสุด"
                description="อัปเดตเมื่อทีมงานเปลี่ยนสถานะงาน"
            >
                {timeline.length === 0 ? (
                    <p className="rounded-xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                        ยังไม่มีความเคลื่อนไหว
                    </p>
                ) : (
                    // กล่องเลื่อนอยู่ชั้นนอกและเว้นซ้ายไว้ ไม่งั้น overflow ตัดจุดที่ยื่นออกนอกเส้นครึ่งวง
                    <div className="max-h-96 overflow-y-auto pl-1.5">
                        <ol className="relative grid gap-1 border-l border-gray-200">
                            {timeline.map((entry) => (
                                <li key={entry.log_id} className="relative py-1.5 pl-4 text-sm">
                                    <span
                                        className="absolute top-3 left-[-4.5px] h-2 w-2 rounded-full bg-blue-500 ring-4 ring-white"
                                        aria-hidden="true"
                                    />
                                    <p className="text-gray-700">
                                        ทีมงาน{ACTION_LABEL[entry.log_action]}{" "}
                                        <span className="text-gray-900">{entry.task_title}</span>
                                        {entry.log_action === "status_changed" && entry.log_new_value && (
                                            <span className="text-gray-500">
                                                {" "}
                                                เป็น &quot;{statusLabel(entry.log_new_value)}&quot;
                                            </span>
                                        )}
                                    </p>
                                    <p className="text-xs text-gray-400">{formatDate(entry.log_created_at)}</p>
                                </li>
                            ))}
                        </ol>
                    </div>
                )}
            </CustomerSection>

            <p className="text-center text-xs text-gray-400">
                ข้อมูลอัปเดตตามที่ทีมงานบันทึกในระบบ · รีเฟรชหน้าเพื่อดูล่าสุด
            </p>
        </ShareShell>
    );
}

function DateBox({ label, value }: { label: string; value: string | null }) {
    return (
        <div className="hero-tile p-3">
            <p className="flex items-center gap-1.5 text-xs text-gray-500">
                <CalendarDays size={14} className="text-blue-600" aria-hidden="true" />
                {label}
            </p>
            <p className="text-gray-900">{value ? formatDateOnly(value) : "ยังไม่กำหนด"}</p>
        </div>
    );
}

/** งานหนึ่งงาน: ชื่อ + สถานะ · มีงานย่อย = แถบความคืบหน้า + เช็กลิสต์ (ยาวเกิน 6 ข้อพับไว้) */
function TaskCard({ task }: { task: SharedTask }) {
    const status = TASK_STATUS[task.task_status];
    const subtasks = subtasksOf(task);
    const doneCount = subtasks.filter((subtask) => subtask.task_status === "done").length;
    const dueText = task.task_due_date ? `กำหนดส่ง ${formatDateOnly(task.task_due_date)}` : null;
    const checklist = (
        <ul className="grid gap-1.5 text-sm">
            {subtasks.map((subtask) => {
                const isDone = subtask.task_status === "done";
                const isActive = subtask.task_status === "in_progress" || subtask.task_status === "review";
                return (
                    <li key={subtask.task_id} className="flex items-start gap-2">
                        <span
                            className={`mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full ${
                                isDone
                                    ? "bg-green-500 text-white"
                                    : isActive
                                      ? "border-2 border-blue-500 bg-white"
                                      : "border-2 border-gray-200 bg-white"
                            }`}
                            aria-hidden="true"
                        >
                            {isDone && <Check size={11} strokeWidth={3} />}
                        </span>
                        <span
                            className={`min-w-0 flex-1 wrap-break-word ${isDone ? "text-gray-500" : "text-gray-800"}`}
                        >
                            {subtask.task_title}
                            <span className="sr-only"> ({statusLabel(subtask.task_status)})</span>
                        </span>
                        {isActive && (
                            <span className="shrink-0 text-xs text-blue-600">{statusLabel(subtask.task_status)}</span>
                        )}
                    </li>
                );
            })}
        </ul>
    );

    return (
        <li className="grid gap-3 rounded-2xl border border-gray-200 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <span className="grid min-w-0 gap-0.5">
                    <span className="text-sm font-medium wrap-break-word text-gray-900">{task.task_title}</span>
                    {(subtasks.length > 0 || dueText) && (
                        <span className="text-xs text-gray-500 tabular-nums">
                            {[subtasks.length > 0 ? `เสร็จ ${doneCount} จาก ${subtasks.length} รายการ` : null, dueText]
                                .filter(Boolean)
                                .join(" · ")}
                        </span>
                    )}
                </span>
                <StatusPill tone={status.tone}>{status.label}</StatusPill>
            </div>
            {subtasks.length > 0 && (
                <>
                    <div className="h-1.5 overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
                        <div
                            className="h-full rounded-full bg-green-500"
                            style={{ width: `${(doneCount / subtasks.length) * 100}%` }}
                        />
                    </div>
                    {subtasks.length > 6 ? (
                        <details className="group">
                            <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1 text-sm text-blue-600">
                                <ChevronDown
                                    size={16}
                                    className="transition group-open:rotate-180"
                                    aria-hidden="true"
                                />
                                <span className="group-open:hidden">ดูรายการทั้งหมด {subtasks.length} รายการ</span>
                                <span className="hidden group-open:inline">ซ่อนรายการ</span>
                            </summary>
                            <div className="mt-2">{checklist}</div>
                        </details>
                    ) : (
                        checklist
                    )}
                </>
            )}
        </li>
    );
}
