"use client";

// การ์ดงานของแดชบอร์ด — ส่วนแสดงผลล้วน (เดโมหน้า login ใช้ตัวเดียวกัน) · เปลี่ยนหน้าผ่าน onNavigate ที่ page.tsx ส่งมา
// ห้ามเรียก API / router / toast ในไฟล์นี้ (scripts/check-demo-imports.mjs)

// การ์ดรายการของแดชบอร์ด: งานของฉัน (+ วงแหวนสถานะ) · ปัญหาที่เปิดอยู่ · แชทที่ยังไม่อ่าน · โปรเจกต์ที่กำลังทำ
import { FolderKanban, ListTodo, MessageCircle, TriangleAlert } from "lucide-react";
import ProgressBar from "@/components/ui/ProgressBar";
import Segmented from "@/components/ui/segmented";
import StatusPill from "@/components/ui/status-pill";
import Switch from "@/components/ui/switch";
import formatDate, { formatDateOnly } from "@/app/function";
import { PROJECT_STATUS, TASK_STATUS, isOverdue, projectLink, taskLink } from "../_labels";
import type { OpenIssue, SummaryProject, SummaryTask, TaskStatus, UnreadChat } from "../_types";
import DashboardCard, { EmptyLine, ListRowButton, ListRows } from "./dashboard-card";

// ─── งานของฉัน ────────────────────────────────────────────────────────────────────────────

const RING_COLORS: Record<TaskStatus, string> = {
    todo: "#d1d5db", // gray-300
    in_progress: "#3b82f6", // blue-500
    review: "#d97706", // amber-600
    done: "#16a34a", // green-600
};

// วงแหวนสัดส่วนสถานะงาน (SVG เขียนเอง ไม่ใช้ไลบรารีกราฟ)
function StatusRing({ tasks }: { tasks: SummaryTask[] }) {
    const radius = 26;
    const circumference = 2 * Math.PI * radius;
    const counts = (Object.keys(RING_COLORS) as TaskStatus[]).map((status) => ({
        status,
        count: tasks.filter((task) => task.task_status === status).length,
    }));
    let offset = 0;
    return (
        <div className="flex items-center gap-4">
            <svg
                width="68"
                height="68"
                viewBox="0 0 68 68"
                role="img"
                aria-label="สัดส่วนสถานะงานของฉัน"
                className="shrink-0 -rotate-90"
            >
                <circle cx="34" cy="34" r={radius} fill="none" stroke="#f3f4f6" strokeWidth="8" />
                {counts.map(({ status, count }) => {
                    if (count === 0) return null;
                    const length = (count / tasks.length) * circumference;
                    const segment = (
                        <circle
                            key={status}
                            cx="34"
                            cy="34"
                            r={radius}
                            fill="none"
                            stroke={RING_COLORS[status]}
                            strokeWidth="8"
                            strokeDasharray={`${length} ${circumference - length}`}
                            strokeDashoffset={-offset}
                        />
                    );
                    offset += length;
                    return segment;
                })}
            </svg>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600">
                {counts.map(({ status, count }) => (
                    <li key={status} className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: RING_COLORS[status] }} />
                        {TASK_STATUS[status].label} <span className="tabular-nums text-gray-900">{count}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

export function MyTasksCard({ tasks, onNavigate }: { tasks: SummaryTask[]; onNavigate: (url: string) => void }) {
    return (
        <DashboardCard
            icon={ListTodo}
            title="งานของฉัน"
            description="งานที่คุณรับผิดชอบและยังไม่เสร็จ · สีแดงคือเลยกำหนดแล้ว"
        >
            {tasks.length === 0 ? (
                <EmptyLine>ไม่มีงานที่ต้องทำอยู่ตอนนี้</EmptyLine>
            ) : (
                <>
                    <StatusRing tasks={tasks} />
                    <ListRows>
                        {tasks.map((task) => {
                            const overdue = isOverdue(task.task_due_date);
                            return (
                                <ListRowButton
                                    key={task.task_id}
                                    onClick={() => onNavigate(taskLink(task.project_id, task.task_id))}
                                >
                                    <span className="flex min-w-0 items-start gap-2.5">
                                        <span
                                            className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${overdue ? "bg-red-600" : "bg-gray-300"}`}
                                            aria-hidden="true"
                                        />
                                        <span className="grid min-w-0">
                                            <span className="truncate text-sm text-gray-800">{task.task_title}</span>
                                            <span className="truncate text-xs text-gray-500">{task.project_name}</span>
                                        </span>
                                    </span>
                                    <span className="grid shrink-0 justify-items-end gap-1">
                                        <StatusPill tone={TASK_STATUS[task.task_status].tone}>
                                            {TASK_STATUS[task.task_status].label}
                                        </StatusPill>
                                        <span
                                            className={`text-xs ${overdue ? "font-medium text-red-600" : "text-gray-500"}`}
                                        >
                                            {task.task_due_date ? formatDateOnly(task.task_due_date) : "ไม่มีกำหนด"}
                                        </span>
                                    </span>
                                </ListRowButton>
                            );
                        })}
                    </ListRows>
                </>
            )}
        </DashboardCard>
    );
}

// ─── ปัญหาที่เปิดอยู่ ───────────────────────────────────────────────────────────────────────

// ไม่ติ๊ก "เฉพาะของตัวเอง" = รวม subtask ที่ได้มาจาก task แม่ที่คุณรับผิดชอบ
function isVisibleIssue(issue: OpenIssue, ownOnly: boolean) {
    return !ownOnly || issue.is_direct_assignee || issue.is_tagged || issue.is_unread_reply;
}

type OpenIssuesCardProps = {
    issues: OpenIssue[];
    issueTab: "task" | "subtask";
    onIssueTabChange: (tab: "task" | "subtask") => void;
    ownOnly: boolean;
    onOwnOnlyChange: (ownOnly: boolean) => void;
    // เปิดปัญหา (หน้าแดชบอร์ด: ทำเครื่องหมายว่าอ่านคำตอบแล้ว + ไปที่งาน)
    onOpenIssue: (issue: OpenIssue) => void;
};

export function OpenIssuesCard({
    issues,
    issueTab,
    onIssueTabChange,
    ownOnly,
    onOwnOnlyChange,
    onOpenIssue,
}: OpenIssuesCardProps) {
    const countOf = (tab: "task" | "subtask") =>
        issues.filter((issue) => (tab === "subtask") === issue.is_subtask && isVisibleIssue(issue, ownOnly)).length;
    const visible = issues.filter(
        (issue) => (issueTab === "subtask") === issue.is_subtask && isVisibleIssue(issue, ownOnly),
    );

    return (
        <DashboardCard
            icon={TriangleAlert}
            iconTone="amber"
            title="ปัญหาที่เปิดอยู่"
            description="แถวสีแดง = คุณถูกแท็ก หรือมีคนตอบกลับที่คุณยังไม่ได้อ่าน"
            actions={
                <Segmented
                    label="ชนิดงานของปัญหา"
                    value={issueTab}
                    onChange={onIssueTabChange}
                    options={[
                        { value: "task", label: "Task", count: countOf("task") },
                        { value: "subtask", label: "Subtask", count: countOf("subtask") },
                    ]}
                />
            }
        >
            <Switch
                id="issues-own-only"
                label="เฉพาะ subtask ของตัวเอง"
                description="ไม่รวม subtask ที่เห็นเพราะคุณรับผิดชอบ task แม่"
                checked={ownOnly}
                onChange={onOwnOnlyChange}
            />
            {visible.length === 0 ? (
                <EmptyLine>ไม่มีปัญหาที่เปิดอยู่ใน{issueTab === "subtask" ? " subtask" : " task"}ตอนนี้</EmptyLine>
            ) : (
                <ListRows>
                    {visible.map((issue) => (
                        <ListRowButton
                            key={issue.issue_id}
                            onClick={() => onOpenIssue(issue)}
                            highlight={issue.is_tagged || issue.is_unread_reply}
                        >
                            <span className="grid min-w-0 gap-0.5">
                                <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm text-gray-800">
                                    <span className="truncate">{issue.issue_title}</span>
                                    {issue.is_tagged && <StatusPill tone="danger">คุณถูกแท็ก</StatusPill>}
                                    {issue.is_unread_reply && <StatusPill tone="danger">มีการตอบกลับใหม่</StatusPill>}
                                    {issue.issue_status === "resolved" && (
                                        <StatusPill tone="success">แก้ไขแล้ว</StatusPill>
                                    )}
                                </span>
                                <span className="truncate text-xs text-gray-500">
                                    {issue.task_title} · {issue.project_name}
                                </span>
                            </span>
                            <span className="shrink-0 text-xs text-gray-500">{formatDate(issue.issue_created_at)}</span>
                        </ListRowButton>
                    ))}
                </ListRows>
            )}
        </DashboardCard>
    );
}

// ─── แชทที่ยังไม่อ่าน ──────────────────────────────────────────────────────────────────────

export function UnreadChatsCard({ chats, onNavigate }: { chats: UnreadChat[]; onNavigate: (url: string) => void }) {
    return (
        <DashboardCard
            icon={MessageCircle}
            title="แชทที่ยังไม่ได้อ่าน"
            description="แชทของงานและแชทรวมของโปรเจกต์ที่คุณเป็นสมาชิก"
        >
            {chats.length === 0 ? (
                <EmptyLine>อ่านครบแล้วทุกแชท</EmptyLine>
            ) : (
                <ListRows>
                    {chats.map((chat) => (
                        <ListRowButton
                            key={`${chat.chat_type}-${chat.task_id ?? chat.project_id}`}
                            onClick={() =>
                                onNavigate(
                                    chat.chat_type === "task"
                                        ? `${taskLink(chat.project_id, chat.task_id ?? "")}&openChat=1`
                                        : `${projectLink(chat.project_id)}&openProjectChat=1`,
                                )
                            }
                        >
                            <span className="grid min-w-0 gap-0.5">
                                <span className="flex min-w-0 items-center gap-1.5 text-sm text-gray-800">
                                    <span className="truncate">
                                        {chat.chat_type === "task" ? chat.task_title : chat.project_name}
                                    </span>
                                    {chat.chat_type === "project" && <StatusPill tone="info">โปรเจกต์</StatusPill>}
                                </span>
                                {chat.chat_type === "task" && (
                                    <span className="truncate text-xs text-gray-500">{chat.project_name}</span>
                                )}
                                <span className="truncate text-xs text-gray-600">
                                    <span className="text-gray-800">{chat.last_message_sender}:</span>{" "}
                                    {chat.last_message_text || (chat.last_message_has_images ? "[รูปภาพ]" : "")}
                                </span>
                            </span>
                            <span className="grid shrink-0 justify-items-end gap-1">
                                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-medium text-white">
                                    {chat.unread_count > 99 ? "99+" : chat.unread_count}
                                </span>
                                <span className="text-xs text-gray-500">{formatDate(chat.last_message_at)}</span>
                            </span>
                        </ListRowButton>
                    ))}
                </ListRows>
            )}
        </DashboardCard>
    );
}

// ─── โปรเจกต์ที่กำลังทำ ─────────────────────────────────────────────────────────────────────

export function ActiveProjectsCard({
    projects,
    onNavigate,
}: {
    projects: SummaryProject[];
    onNavigate: (url: string) => void;
}) {
    return (
        <DashboardCard
            icon={FolderKanban}
            title="โปรเจกต์ที่กำลังทำ"
            description="ความคืบหน้าคิดจากน้ำหนักของงานหลักที่เสร็จแล้ว"
        >
            {projects.length === 0 ? (
                <EmptyLine>ไม่มีโปรเจกต์ที่กำลังทำอยู่ตอนนี้</EmptyLine>
            ) : (
                <ListRows>
                    {projects.map((project) => (
                        <ListRowButton
                            key={project.project_id}
                            onClick={() => onNavigate(projectLink(project.project_id))}
                        >
                            <span className="grid min-w-0 flex-1 gap-1.5">
                                <span className="flex items-center justify-between gap-3">
                                    <span className="truncate text-sm text-gray-800">{project.project_name}</span>
                                    <StatusPill tone={PROJECT_STATUS[project.project_status].tone}>
                                        {PROJECT_STATUS[project.project_status].label}
                                    </StatusPill>
                                </span>
                                <ProgressBar percent={Number(project.project_progress_percent)} />
                                <span
                                    className={`text-xs ${isOverdue(project.project_due_date) ? "text-red-600" : "text-gray-500"}`}
                                >
                                    ครบกำหนด{" "}
                                    {project.project_due_date
                                        ? formatDateOnly(project.project_due_date)
                                        : "- (ยังไม่กำหนด)"}
                                </span>
                            </span>
                        </ListRowButton>
                    ))}
                </ListRows>
            )}
        </DashboardCard>
    );
}
