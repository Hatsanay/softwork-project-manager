"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ProgressBar from "@/components/ui/ProgressBar";
import Button from "@/components/ui/Button/Button";
import { api } from "@/app/constans";
import formatDate, { formatDateOnly } from "@/app/function";
import { usePermission, BITS } from "@/app/components/permission-provider";

type ProjectStatus = "planning" | "in_progress" | "on_hold" | "completed" | "cancelled";
type TaskStatus = "todo" | "in_progress" | "review" | "done";

type SummaryProject = {
    project_id: string;
    project_name: string;
    project_status: ProjectStatus;
    project_progress_percent: string;
    project_due_date: string | null;
};

type SummaryTask = {
    task_id: string;
    task_title: string;
    task_status: TaskStatus;
    task_due_date: string | null;
    task_parent_id: string | null;
    project_id: string;
    project_name: string;
};

type ActivityEntry = {
    log_id: string;
    task_id: string;
    task_title: string;
    log_fullname: string | null;
    log_action: "created" | "status_changed" | "edited" | "assigned" | "comment";
    log_old_value: string | null;
    log_new_value: string | null;
    log_created_at: string;
    project_id: string;
    project_name: string;
};

type OpenIssue = {
    issue_id: string;
    issue_title: string;
    issue_created_at: string;
    task_id: string;
    task_title: string;
    project_id: string;
    project_name: string;
    is_subtask: boolean;
    is_direct_assignee: boolean;
};

type UnreadChat = {
    task_id: string;
    task_title: string;
    project_id: string;
    project_name: string;
    unread_count: number;
    last_message_at: string;
    last_message_text: string | null;
    last_message_sender: string;
    last_message_has_images: boolean;
};

type Summary = {
    activeProjectCount: number;
    projects: SummaryProject[];
    myTasks: SummaryTask[];
    openIssueCount: number;
    openIssueCountOwnOnly: number;
    openIssues: OpenIssue[];
    unreadChatCount: number;
    unreadChats: UnreadChat[];
    recentActivity: ActivityEntry[];
};

const ACTION_LABEL: Record<ActivityEntry["log_action"], string> = {
    created: "สร้างงาน", status_changed: "เปลี่ยนสถานะงาน", edited: "แก้ไขงาน",
    assigned: "มอบหมายงาน", comment: "แสดงความคิดเห็นใน",
};

const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
    planning: "วางแผน", in_progress: "กำลังทำ", on_hold: "พักไว้", completed: "เสร็จแล้ว", cancelled: "ยกเลิก",
};
const PROJECT_STATUS_COLOR: Record<ProjectStatus, string> = {
    planning: "text-gray-500", in_progress: "text-blue-600", on_hold: "text-amber-600",
    completed: "text-green-600", cancelled: "text-red-500",
};

const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
    todo: "รอดำเนินการ", in_progress: "กำลังทำ", review: "ตรวจสอบ", done: "เสร็จแล้ว",
};
const TASK_STATUS_COLOR: Record<TaskStatus, string> = {
    todo: "text-gray-500", in_progress: "text-blue-600", review: "text-amber-600", done: "text-green-600",
};

function authHeader() {
    return { Authorization: `Bearer ${localStorage.getItem("token")}` };
}

function isOverdue(dueDate: string | null) {
    if (!dueDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(dueDate) < today;
}

function StatTile({ label, value, sub, color }: { label: string; value: number; sub?: string; color: string }) {
    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <p className="text-sm text-gray-500">{label}</p>
            <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
            {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
        </div>
    );
}

function ChatCountBadge({ count }: { count: number }) {
    if (!count) return null;
    return (
        <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[11px] font-semibold text-white bg-red-500 rounded-full leading-none shrink-0">
            {count > 99 ? "99+" : count}
        </span>
    );
}

function IssueBadge() {
    return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.198 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003ZM12 8.25a.75.75 0 0 1 .75.75v3.75a.75.75 0 0 1-1.5 0V9a.75.75 0 0 1 .75-.75Zm0 8.25a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" clipRule="evenodd" />
            </svg>
            ปัญหา
        </span>
    );
}

export default function DashboardPage() {
    const router = useRouter();
    const hasBit = usePermission();
    const [summary, setSummary] = useState<Summary | null>(null);
    const [loading, setLoading] = useState(true);
    const [issueTab, setIssueTab] = useState<"task" | "subtask">("task");
    const [subtaskOwnOnly, setSubtaskOwnOnly] = useState(false);

    useEffect(() => {
        (async () => {
            const res = await fetch(`${api}/dashboard/summary`, { headers: authHeader() });
            if (res.ok) setSummary(await res.json());
            setLoading(false);
        })();
    }, []);

    if (loading) return <p className="p-6 text-gray-400">กำลังโหลด...</p>;
    if (!summary) return <p className="p-6 text-gray-500">โหลดข้อมูลแดชบอร์ดไม่สำเร็จ</p>;

    const overdueCount = summary.myTasks.filter((t) => isOverdue(t.task_due_date)).length;

    return (
        <div className="p-4 sm:p-6 space-y-6">
            <div className="flex items-center justify-between gap-3">
                <h1 className="text-xl sm:text-2xl font-bold text-gray-800">แดชบอร์ด</h1>
                {hasBit(BITS.createProject) && (
                    <Button onClick={() => router.push("/projects/create")}>+ สร้างโปรเจกต์</Button>
                )}
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatTile label="โปรเจกต์ที่กำลังทำ" value={summary.activeProjectCount} color="text-gray-800" />
                <StatTile
                    label="งานของฉัน"
                    value={summary.myTasks.length}
                    sub={overdueCount > 0 ? `เลยกำหนด ${overdueCount} งาน` : undefined}
                    color={overdueCount > 0 ? "text-red-600" : "text-gray-800"}
                />
                <StatTile
                    label="ปัญหาที่เปิดอยู่"
                    value={subtaskOwnOnly ? summary.openIssueCountOwnOnly : summary.openIssueCount}
                    color={summary.openIssueCount > 0 ? "text-amber-600" : "text-gray-800"}
                />
                <StatTile
                    label="ข้อความที่ยังไม่อ่าน"
                    value={summary.unreadChatCount}
                    color={summary.unreadChatCount > 0 ? "text-blue-600" : "text-gray-800"}
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-3">
                    <h2 className="text-base font-semibold text-gray-800">งานของฉัน</h2>
                    {summary.myTasks.length === 0 ? (
                        <p className="text-sm text-gray-400">ไม่มีงานที่ต้องทำอยู่ตอนนี้</p>
                    ) : (
                        <ul className="divide-y divide-gray-50 rounded-lg border border-gray-100 overflow-hidden">
                            {summary.myTasks.map((t) => {
                                const overdue = isOverdue(t.task_due_date);
                                return (
                                    <li key={t.task_id}>
                                        <button
                                            type="button"
                                            onClick={() => router.push(`/projects/view?id=${t.project_id}&taskId=${t.task_id}`)}
                                            className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-blue-50"
                                        >
                                            <div className="min-w-0">
                                                <p className="text-sm text-gray-700 truncate">{t.task_title}</p>
                                                <p className="text-xs text-gray-400 truncate">{t.project_name}</p>
                                            </div>
                                            <div className="flex flex-col items-end gap-0.5 shrink-0">
                                                <span className={`text-xs ${TASK_STATUS_COLOR[t.task_status]}`}>
                                                    {TASK_STATUS_LABEL[t.task_status]}
                                                </span>
                                                <span className={`text-xs ${overdue ? "text-red-500 font-medium" : "text-gray-400"}`}>
                                                    {formatDateOnly(t.task_due_date)}
                                                </span>
                                            </div>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <h2 className="text-base font-semibold text-gray-800">ปัญหาที่เปิดอยู่</h2>
                        <div className="flex text-xs rounded-lg border border-gray-200 overflow-hidden shrink-0">
                            {(["task", "subtask"] as const).map((tab) => {
                                const tabCount = summary.openIssues.filter(
                                    (iss) => (tab === "subtask") === iss.is_subtask && (!subtaskOwnOnly || iss.is_direct_assignee)
                                ).length;
                                return (
                                    <button
                                        key={tab}
                                        type="button"
                                        onClick={() => setIssueTab(tab)}
                                        className={`px-3 py-1.5 font-medium transition-colors ${
                                            issueTab === tab ? "bg-amber-500 text-white" : "bg-white text-gray-500 hover:bg-gray-50"
                                        }`}
                                    >
                                        {tab === "task" ? "Task" : "Subtask"} ({tabCount})
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={subtaskOwnOnly}
                            onChange={(e) => setSubtaskOwnOnly(e.target.checked)}
                            className="w-3.5 h-3.5 accent-amber-500"
                        />
                        แสดงเฉพาะ subtask ของตัวเอง (ไม่รวมที่ได้มาจาก task แม่ที่รับผิดชอบ)
                    </label>
                    {(() => {
                        const filtered = summary.openIssues.filter(
                            (iss) => (issueTab === "subtask") === iss.is_subtask && (!subtaskOwnOnly || iss.is_direct_assignee)
                        );
                        if (filtered.length === 0) {
                            return <p className="text-sm text-gray-400">ไม่มีปัญหาที่เปิดอยู่ใน{issueTab === "subtask" ? "subtask" : "task"}ตอนนี้</p>;
                        }
                        return (
                            <ul className="divide-y divide-gray-50 rounded-lg border border-gray-100 overflow-hidden">
                                {filtered.map((iss) => (
                                    <li key={iss.issue_id}>
                                        <button
                                            type="button"
                                            onClick={() => router.push(`/projects/view?id=${iss.project_id}&taskId=${iss.task_id}`)}
                                            className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-blue-50"
                                        >
                                            <div className="min-w-0">
                                                <p className="text-sm text-gray-700 truncate">{iss.issue_title}</p>
                                                <p className="text-xs text-gray-400 truncate">{iss.task_title} · {iss.project_name}</p>
                                            </div>
                                            <div className="flex flex-col items-end gap-0.5 shrink-0">
                                                <IssueBadge />
                                                <span className="text-xs text-gray-400">{formatDate(iss.issue_created_at)}</span>
                                            </div>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        );
                    })()}
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-3">
                    <h2 className="text-base font-semibold text-gray-800">แชทที่ยังไม่ได้อ่าน</h2>
                    {summary.unreadChats.length === 0 ? (
                        <p className="text-sm text-gray-400">อ่านครบแล้วทุกแชท</p>
                    ) : (
                        <ul className="divide-y divide-gray-50 rounded-lg border border-gray-100 overflow-hidden">
                            {summary.unreadChats.map((c) => (
                                <li key={c.task_id}>
                                    <button
                                        type="button"
                                        onClick={() => router.push(`/projects/view?id=${c.project_id}&taskId=${c.task_id}&openChat=1`)}
                                        className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-blue-50"
                                    >
                                        <div className="min-w-0">
                                            <p className="text-sm text-gray-700 truncate">{c.task_title}</p>
                                            <p className="text-xs text-gray-400 truncate">{c.project_name}</p>
                                            <p className="text-xs text-gray-500 truncate mt-0.5">
                                                <span className="font-medium">{c.last_message_sender}:</span>{" "}
                                                {c.last_message_text || (c.last_message_has_images ? "[รูปภาพ]" : "")}
                                            </p>
                                        </div>
                                        <div className="flex flex-col items-end gap-0.5 shrink-0">
                                            <ChatCountBadge count={c.unread_count} />
                                            <span className="text-xs text-gray-400">{formatDate(c.last_message_at)}</span>
                                        </div>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-3">
                    <h2 className="text-base font-semibold text-gray-800">โปรเจกต์ที่กำลังทำ</h2>
                    {summary.projects.length === 0 ? (
                        <p className="text-sm text-gray-400">ไม่มีโปรเจกต์ที่กำลังทำอยู่ตอนนี้</p>
                    ) : (
                        <ul className="divide-y divide-gray-50 rounded-lg border border-gray-100 overflow-hidden">
                            {summary.projects.map((p) => (
                                <li key={p.project_id}>
                                    <button
                                        type="button"
                                        onClick={() => router.push(`/projects/view?id=${p.project_id}`)}
                                        className="w-full text-left px-4 py-2.5 hover:bg-blue-50 space-y-1.5"
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <p className="text-sm text-gray-700 truncate">{p.project_name}</p>
                                            <span className={`text-xs shrink-0 ${PROJECT_STATUS_COLOR[p.project_status]}`}>
                                                {PROJECT_STATUS_LABEL[p.project_status]}
                                            </span>
                                        </div>
                                        <ProgressBar percent={Number(p.project_progress_percent)} />
                                        <p className="text-xs text-gray-400">ครบกำหนด: {formatDateOnly(p.project_due_date)}</p>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-3">
                <h2 className="text-base font-semibold text-gray-800">กิจกรรมล่าสุด</h2>
                {summary.recentActivity.length === 0 ? (
                    <p className="text-sm text-gray-400">ยังไม่มีกิจกรรม</p>
                ) : (
                    <ul className="space-y-2">
                        {summary.recentActivity.map((entry) => (
                            <li key={entry.log_id} className="text-sm border-l-2 border-blue-100 pl-3">
                                <button
                                    type="button"
                                    onClick={() => router.push(`/projects/view?id=${entry.project_id}&taskId=${entry.task_id}`)}
                                    className="text-left w-full hover:text-blue-600"
                                >
                                    <p className="text-gray-700">
                                        <span className="font-medium">{entry.log_fullname ?? "ผู้ใช้งานที่ถูกลบ"}</span>
                                        {" "}{ACTION_LABEL[entry.log_action]}{" "}
                                        <span className="font-medium">{entry.task_title}</span>
                                        {entry.log_action === "status_changed" && entry.log_old_value && entry.log_new_value && (
                                            <>
                                                {" "}({TASK_STATUS_LABEL[entry.log_old_value as TaskStatus] ?? entry.log_old_value}
                                                {" → "}
                                                {TASK_STATUS_LABEL[entry.log_new_value as TaskStatus] ?? entry.log_new_value})
                                            </>
                                        )}
                                        <span className="text-gray-400"> · {entry.project_name}</span>
                                    </p>
                                    <p className="text-xs text-gray-400">{formatDate(entry.log_created_at)}</p>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
