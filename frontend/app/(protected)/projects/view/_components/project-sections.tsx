"use client";

// ส่วนบนของหน้าโปรเจกต์ (หน้าตาใหม่ U4 — 2026-10-14): หัวโปรเจกต์ · ลิงก์ลูกค้า · ภาพรวม Agile · ประวัติกิจกรรม
// เป็นส่วนแสดงผลล้วน — ข้อมูลและการกระทำทั้งหมดยังอยู่ที่ page.tsx ส่งผ่าน props (ไม่เปลี่ยนการทำงาน)
import {
    CalendarDays,
    Copy,
    History,
    Link2,
    ListChecks,
    Mail,
    MessageCircle,
    Pencil,
    Plus,
    RefreshCw,
    Trash2,
    Users,
    Zap,
} from "lucide-react";
import CircularProgress from "@/components/ui/CircularProgress";
import SectionCard from "@/components/ui/section-card";
import Segmented from "@/components/ui/segmented";
import StatusPill, { type PillTone } from "@/components/ui/status-pill";
import Switch from "@/components/ui/switch";
import { CARD_CLASS } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { inputClass } from "@/components/ui/form-field";
import formatDate, { formatDateOnly, toDateInputValue } from "@/app/function";

type ProjectStatus = "planning" | "in_progress" | "on_hold" | "completed" | "cancelled";
type TaskStatus = "todo" | "in_progress" | "review" | "done";

export const PROJECT_STATUS: Record<ProjectStatus, { label: string; tone: PillTone }> = {
    planning: { label: "วางแผน", tone: "neutral" },
    in_progress: { label: "กำลังทำ", tone: "info" },
    on_hold: { label: "พักไว้", tone: "wait" },
    completed: { label: "เสร็จแล้ว", tone: "success" },
    cancelled: { label: "ยกเลิก", tone: "danger" },
};

export const TASK_STATUS: Record<TaskStatus, { label: string; tone: PillTone }> = {
    todo: { label: "รอดำเนินการ", tone: "neutral" },
    in_progress: { label: "กำลังทำ", tone: "info" },
    review: { label: "ตรวจสอบ", tone: "wait" },
    done: { label: "เสร็จแล้ว", tone: "success" },
};

function isPastDue(dateText: string | null) {
    if (!dateText) return false;
    return toDateInputValue(dateText) < toDateInputValue(new Date());
}

// ─── หัวโปรเจกต์ ─────────────────────────────────────────────────────────────────────────

type ProjectHeaderProps = {
    project: {
        project_name: string;
        project_description: string | null;
        project_status: ProjectStatus;
        project_type: "waterfall" | "agile";
        project_start_date: string | null;
        project_due_date: string | null;
        project_progress_percent: string;
        client_name: string | null;
        unread_chat_count: number;
    };
    memberCount: number;
    canEdit: boolean;
    canDelete: boolean;
    onOpenChat: () => void;
    onEdit: () => void;
    onDelete: () => void;
};

export function ProjectHeader({
    project,
    memberCount,
    canEdit,
    canDelete,
    onOpenChat,
    onEdit,
    onDelete,
}: ProjectHeaderProps) {
    const status = PROJECT_STATUS[project.project_status];
    const isOverdue = project.project_status !== "completed" && isPastDue(project.project_due_date);
    const meta = [
        {
            icon: CalendarDays,
            label: "วันเริ่ม",
            value: project.project_start_date ? formatDateOnly(project.project_start_date) : "ยังไม่กำหนด",
        },
        {
            icon: CalendarDays,
            label: "ครบกำหนด",
            value: project.project_due_date ? formatDateOnly(project.project_due_date) : "ยังไม่กำหนด",
            danger: isOverdue,
        },
        { icon: Users, label: "สมาชิก", value: `${memberCount} คน` },
    ];

    return (
        <section className={`grid gap-5 p-5 sm:p-6 ${CARD_CLASS}`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="grid min-w-0 gap-2">
                    <p className="text-xs text-gray-500">
                        โปรเจกต์{project.client_name ? ` · ลูกค้า ${project.client_name}` : ""}
                    </p>
                    <h1 className="text-2xl font-medium wrap-break-word text-gray-900">{project.project_name}</h1>
                    <div className="flex flex-wrap gap-1.5">
                        <StatusPill tone={status.tone}>{status.label}</StatusPill>
                        <StatusPill tone="neutral">
                            {project.project_type === "agile"
                                ? "Agile · สมาชิกกดรับงานเองได้"
                                : "Waterfall · PM มอบหมายงาน"}
                        </StatusPill>
                        {isOverdue && <StatusPill tone="danger">เลยกำหนดส่ง</StatusPill>}
                    </div>
                    {project.project_description && (
                        <p className="text-sm whitespace-pre-wrap text-gray-600">{project.project_description}</p>
                    )}
                </div>
                <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={onOpenChat} className={buttonClass("secondary", "md")}>
                        <MessageCircle size={16} />
                        แชทโปรเจกต์
                        {project.unread_chat_count > 0 && (
                            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] text-white">
                                {project.unread_chat_count > 99 ? "99+" : project.unread_chat_count}
                            </span>
                        )}
                    </button>
                    {canEdit && (
                        <button type="button" onClick={onEdit} className={buttonClass("secondary", "md")}>
                            <Pencil size={16} />
                            แก้ไข
                        </button>
                    )}
                    {canDelete && (
                        <button type="button" onClick={onDelete} className={buttonClass("ghost", "md")}>
                            <Trash2 size={16} />
                            ลบ
                        </button>
                    )}
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-5 rounded-2xl bg-gray-50 p-4">
                <div className="flex items-center gap-3">
                    <CircularProgress percent={Number(project.project_progress_percent)} size={64} strokeWidth={6} />
                    <div className="grid">
                        <span className="text-xs text-gray-500">ความคืบหน้า</span>
                        <span className="text-xl font-medium tabular-nums text-gray-900">
                            {Number(project.project_progress_percent).toFixed(0)}%
                        </span>
                    </div>
                </div>
                <dl className="grid flex-1 grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                    {meta.map((item) => (
                        <div key={item.label} className="grid gap-0.5">
                            <dt className="flex items-center gap-1.5 text-xs text-gray-500">
                                <item.icon size={14} />
                                {item.label}
                            </dt>
                            <dd className={item.danger ? "text-red-600" : "text-gray-800"}>{item.value}</dd>
                        </div>
                    ))}
                </dl>
            </div>
        </section>
    );
}

// ─── ลิงก์สำหรับลูกค้า ──────────────────────────────────────────────────────────────────────

type ShareLinkCardProps = {
    isEnabled: boolean;
    shareUrl: string;
    copied: boolean;
    isRegenerating: boolean;
    onToggle: () => void;
    onCopy: () => void;
    onEmail: () => void;
    onRegenerate: () => void;
};

export function ShareLinkCard({
    isEnabled,
    shareUrl,
    copied,
    isRegenerating,
    onToggle,
    onCopy,
    onEmail,
    onRegenerate,
}: ShareLinkCardProps) {
    return (
        <SectionCard
            icon={Link2}
            title="ลิงก์สำหรับลูกค้า"
            description="ลูกค้าดูความคืบหน้าผ่านลิงก์นี้ได้โดยไม่ต้องเข้าระบบ · สร้างลิงก์ใหม่แล้วลิงก์เดิมใช้ไม่ได้ทันที"
            actions={
                <Switch
                    id="share-enabled"
                    label={isEnabled ? "เปิดใช้งาน" : "ปิดอยู่"}
                    checked={isEnabled}
                    onChange={onToggle}
                />
            }
        >
            <div className="flex flex-col gap-2 sm:flex-row">
                <input
                    readOnly
                    value={shareUrl}
                    aria-label="ลิงก์สำหรับลูกค้า"
                    className={`${inputClass()} flex-1 bg-gray-50 text-gray-500`}
                />
                <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={onCopy} className={buttonClass("primary", "md")}>
                        <Copy size={16} />
                        {copied ? "คัดลอกแล้ว" : "คัดลอก"}
                    </button>
                    <button type="button" onClick={onEmail} className={buttonClass("secondary", "md")}>
                        <Mail size={16} />
                        ส่งทางอีเมล
                    </button>
                    <button
                        type="button"
                        onClick={onRegenerate}
                        disabled={isRegenerating}
                        className={buttonClass("ghost", "md")}
                    >
                        <RefreshCw size={16} className={isRegenerating ? "animate-spin" : ""} />
                        {isRegenerating ? "กำลังสร้าง..." : "สร้างลิงก์ใหม่"}
                    </button>
                </div>
            </div>
            {!isEnabled && (
                <p className="text-xs text-amber-600">
                    ปิดอยู่ · ลูกค้าที่เปิดลิงก์จะเห็นว่าลิงก์ถูกปิด จนกว่าจะเปิดใช้งานอีกครั้ง
                </p>
            )}
        </SectionCard>
    );
}

// ─── ภาพรวม Agile ──────────────────────────────────────────────────────────────────────────

type AgileTask = {
    task_id: string;
    task_parent_id: string | null;
    task_title: string;
    assignees: { user_id: string; user_fullname: string }[];
};

type AgileOverviewCardProps = {
    tasks: AgileTask[];
    tab: "all" | "task" | "subtask";
    onTabChange: (tab: "all" | "task" | "subtask") => void;
    onOpenTask: (task: AgileTask) => void;
};

export function AgileOverviewCard({ tasks, tab, onTabChange, onOpenTask }: AgileOverviewCardProps) {
    const topLevel = tasks.filter((task) => task.task_parent_id === null);
    const subtasks = tasks.filter((task) => task.task_parent_id !== null);
    const claimed = (list: AgileTask[]) => list.filter((task) => task.assignees.length > 0).length;
    const parentNameById = Object.fromEntries(topLevel.map((task) => [task.task_id, task.task_title]));
    const list = tab === "task" ? topLevel : tab === "subtask" ? subtasks : tasks;

    const tiles = [
        { label: "Task ที่รับแล้ว", value: claimed(topLevel), total: topLevel.length, tone: "text-green-600" },
        { label: "Subtask ที่รับแล้ว", value: claimed(subtasks), total: subtasks.length, tone: "text-green-600" },
        {
            label: "Task ที่ยังไม่มีคนรับ",
            value: topLevel.length - claimed(topLevel),
            total: topLevel.length,
            tone: "text-amber-600",
        },
        {
            label: "Subtask ที่ยังไม่มีคนรับ",
            value: subtasks.length - claimed(subtasks),
            total: subtasks.length,
            tone: "text-amber-600",
        },
    ];

    return (
        <SectionCard
            icon={Zap}
            title="ภาพรวม Agile"
            description={`งานทั้งหมด ${tasks.length} รายการ (Task ${topLevel.length} · Subtask ${subtasks.length}) · สมาชิกกดรับงานที่ยังไม่มีคนรับได้เอง`}
            actions={
                <Segmented
                    label="ชนิดงาน"
                    value={tab}
                    onChange={onTabChange}
                    options={[
                        { value: "all", label: "ทั้งหมด", count: tasks.length },
                        { value: "task", label: "Task", count: topLevel.length },
                        { value: "subtask", label: "Subtask", count: subtasks.length },
                    ]}
                />
            }
        >
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {tiles.map((tile) => (
                    <div key={tile.label} className="grid gap-0.5 rounded-xl border border-gray-200 p-3">
                        <span className="text-xs text-gray-500">{tile.label}</span>
                        <span className={`text-xl font-medium tabular-nums ${tile.tone}`}>
                            {tile.value}
                            <span className="text-sm text-gray-400"> / {tile.total}</span>
                        </span>
                    </div>
                ))}
            </div>
            {list.length === 0 ? (
                <p className="rounded-xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">ยังไม่มีรายการ</p>
            ) : (
                <ul className="-mx-2 grid max-h-96 gap-0.5 overflow-y-auto">
                    {list.map((task) => {
                        const isSubtask = Boolean(task.task_parent_id);
                        const isClaimed = task.assignees.length > 0;
                        return (
                            <li key={task.task_id}>
                                <button
                                    type="button"
                                    onClick={() => onOpenTask(task)}
                                    className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-2 text-left hover:bg-gray-50"
                                >
                                    <span className="grid min-w-0">
                                        <span className="truncate text-sm text-gray-800">{task.task_title}</span>
                                        {isSubtask && task.task_parent_id && parentNameById[task.task_parent_id] && (
                                            <span className="truncate text-xs text-gray-500">
                                                subtask ของ {parentNameById[task.task_parent_id]}
                                            </span>
                                        )}
                                    </span>
                                    <span className="flex shrink-0 items-center gap-1.5">
                                        <StatusPill tone={isSubtask ? "info" : "neutral"}>
                                            {isSubtask ? "Subtask" : "Task"}
                                        </StatusPill>
                                        {isClaimed ? (
                                            <span className="max-w-[140px] truncate text-xs text-green-600">
                                                {task.assignees.map((assignee) => assignee.user_fullname).join(", ")}
                                            </span>
                                        ) : (
                                            <StatusPill tone="wait">ยังไม่มีคนรับ</StatusPill>
                                        )}
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </SectionCard>
    );
}

// ─── ประวัติกิจกรรม ─────────────────────────────────────────────────────────────────────────

const ACTION_LABEL: Record<string, string> = {
    created: "สร้างงาน",
    status_changed: "เปลี่ยนสถานะงาน",
    edited: "แก้ไขงาน",
    assigned: "มอบหมายงาน",
    comment: "แสดงความคิดเห็นใน",
};

type ActivityEntry = {
    log_id: string;
    task_title: string;
    log_fullname: string | null;
    log_action: string;
    log_old_value: string | null;
    log_new_value: string | null;
    log_message?: string | null;
    log_created_at: string;
};

function statusLabel(value: string) {
    return TASK_STATUS[value as TaskStatus]?.label ?? value;
}

export function ProjectActivityCard({ activity }: { activity: ActivityEntry[] }) {
    return (
        <SectionCard
            icon={History}
            title="ประวัติกิจกรรม"
            description="การสร้าง แก้ไข มอบหมาย และเปลี่ยนสถานะงานในโปรเจกต์นี้"
        >
            {activity.length === 0 ? (
                <p className="rounded-xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">ยังไม่มีกิจกรรม</p>
            ) : (
                <ol className="relative ml-1 grid max-h-96 gap-1 overflow-y-auto border-l border-gray-200">
                    {activity.map((entry) => (
                        <li key={entry.log_id} className="relative py-1.5 pl-4 text-sm">
                            <span
                                className="absolute top-3 left-[-4.5px] h-2 w-2 rounded-full bg-blue-500 ring-4 ring-white"
                                aria-hidden="true"
                            />
                            <p className="text-gray-700">
                                <span className="text-gray-900">{entry.log_fullname ?? "ผู้ใช้งานที่ถูกลบ"}</span>{" "}
                                {ACTION_LABEL[entry.log_action] ?? entry.log_action}{" "}
                                <span className="text-gray-900">{entry.task_title}</span>
                                {entry.log_action === "status_changed" &&
                                    entry.log_old_value &&
                                    entry.log_new_value && (
                                        <>
                                            {" "}
                                            ({statusLabel(entry.log_old_value)} → {statusLabel(entry.log_new_value)})
                                        </>
                                    )}
                                {entry.log_action === "edited" && entry.log_message && (
                                    <span className="text-gray-500"> · {entry.log_message}</span>
                                )}
                            </p>
                            <p className="text-xs text-gray-400">{formatDate(entry.log_created_at)}</p>
                        </li>
                    ))}
                </ol>
            )}
        </SectionCard>
    );
}

// ─── การ์ด "งาน (Task)" ─────────────────────────────────────────────────────────────────────
// หัวการ์ด + ปุ่มเพิ่มงาน + สลับมุมมองตาราง/บอร์ด · เนื้อหา (ตารางหรือบอร์ด) มาเป็น children

export type TaskView = "table" | "board";

export function TasksSectionCard({
    canAddTask,
    onAddTask,
    taskView,
    onTaskViewChange,
    children,
}: {
    canAddTask: boolean;
    onAddTask: () => void;
    taskView: TaskView;
    onTaskViewChange: (view: TaskView) => void;
    children: React.ReactNode;
}) {
    return (
        <SectionCard
            icon={ListChecks}
            title="งาน (Task)"
            description="แสดงเฉพาะงานหลัก · กดชื่องานเพื่อดู subtask ปัญหา แชท และประวัติ · ป้ายแดง = ปัญหาของงานนั้น ป้ายฟ้า = ปัญหาใน subtask"
            actions={
                canAddTask && (
                    <button type="button" onClick={onAddTask} className={buttonClass("primary", "md")}>
                        <Plus size={16} />
                        เพิ่ม Task
                    </button>
                )
            }
        >
            <Segmented<TaskView>
                label="มุมมองงาน"
                value={taskView}
                onChange={onTaskViewChange}
                options={[
                    { value: "table", label: "ตาราง" },
                    { value: "board", label: "บอร์ด" },
                ]}
            />
            {children}
        </SectionCard>
    );
}
