"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import ProgressBar from "@/components/ui/ProgressBar";
import Button from "@/components/ui/Button/Button";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { api } from "@/app/constans";
import formatDate, { formatDateOnly } from "@/app/function";
import { usePermission, BITS } from "@/app/components/permission-provider";

const SERVER_BASE = new URL(api).origin;

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
    issue_status: "open" | "resolved";
    issue_created_at: string;
    task_id: string;
    task_title: string;
    project_id: string;
    project_name: string;
    is_subtask: boolean;
    is_direct_assignee: boolean;
    is_tagged: boolean;
    is_unread_reply: boolean;
};

type UnreadChat = {
    chat_type: "task" | "project";
    task_id: string | null;
    task_title: string | null;
    project_id: string;
    project_name: string;
    unread_count: number;
    last_message_at: string;
    last_message_text: string | null;
    last_message_sender: string;
    last_message_has_images: boolean;
};

type TeamWorkloadEntry = {
    user_id: string;
    user_fullname: string;
    user_avatar_url: string | null;
    overdue_task_count: number;
    pending_task_count: number;
    done_task_count: number;
};

type TeamProjectOption = { project_id: string; project_name: string };
type TeamTaskTypeFilter = "all" | "task" | "subtask";

type MemberTask = {
    task_id: string;
    task_title: string;
    task_status: TaskStatus;
    task_due_date: string | null;
    task_parent_id: string | null;
    project_id: string;
    project_name: string;
};

type MemberTasksDetail = {
    user_fullname: string;
    done: MemberTask[];
    pending: MemberTask[];
    overdue: MemberTask[];
};

type Summary = {
    hasProjectAccess: boolean;
    activeProjectCount: number;
    projects: SummaryProject[];
    myTasks: SummaryTask[];
    openIssueCount: number;
    openIssueCountOwnOnly: number;
    openIssues: OpenIssue[];
    unreadChatCount: number;
    unreadChats: UnreadChat[];
    canViewTeamWorkload: boolean;
    recentActivity: ActivityEntry[];
};

type KpiTaskType = "task" | "subtask" | "all";
type KpiProjectTypeFilter = "all" | "waterfall" | "agile";

type Kpis = {
    period: string;
    taskType: KpiTaskType;
    projectOnTimeRate: number | null;
    projectOnTimeEligible: number;
    taskOnTimeRate: number | null;
    taskOnTimeEligible: number;
    avgTaskCycleHours: number | null;
    avgIssueResolveHours: number | null;
};

type MemberKpiRow = {
    user_id: string;
    user_fullname: string;
    user_avatar_url: string | null;
    tasksCompleted: number;
    avgTaskCycleHours: number | null;
    taskOnTimeRate: number | null;
    tasksAssigned: number;
    issuesResolved: number;
    avgIssueResolveHours: number | null;
};

type KpiProjectOption = { project_id: string; project_name: string };

type SearchProject = { project_id: string; project_name: string; project_status: ProjectStatus };
type SearchTask = { task_id: string; task_title: string; task_parent_id: string | null; project_id: string; project_name: string };
type SearchResults = { projects: SearchProject[]; tasks: SearchTask[] };

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

function formatRate(rate: number | null) {
    return rate === null ? "-" : `${rate}%`;
}

function rateColor(rate: number | null) {
    if (rate === null) return "text-gray-400";
    if (rate >= 80) return "text-green-600";
    if (rate >= 50) return "text-amber-600";
    return "text-red-600";
}

function formatHours(hours: number | null) {
    if (hours === null) return "-";
    return hours < 24 ? `${hours.toFixed(1)} ชม.` : `${(hours / 24).toFixed(1)} วัน`;
}

function KpiTile({ label, display, sub, color }: { label: string; display: string; sub: string; color: string }) {
    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <p className="text-sm text-gray-500">{label}</p>
            <p className={`text-3xl font-bold mt-1 ${color}`}>{display}</p>
            <p className="text-xs text-gray-400 mt-1">{sub}</p>
        </div>
    );
}

function ChatCountBadge({ count }: { count: number }) {
    if (!count) return null;
    return (
        <span className="inline-flex items-center justify-center min-w-4.5 h-4.5 px-1 text-[11px] font-semibold text-white bg-red-500 rounded-full leading-none shrink-0">
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

    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
    const [searchOpen, setSearchOpen] = useState(false);
    const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [selectedMember, setSelectedMember] = useState<TeamWorkloadEntry | null>(null);
    const [memberTasks, setMemberTasks] = useState<MemberTasksDetail | null>(null);
    const [memberTasksLoading, setMemberTasksLoading] = useState(false);

    const [teamWorkload, setTeamWorkload] = useState<TeamWorkloadEntry[]>([]);
    const [teamProjectOptions, setTeamProjectOptions] = useState<TeamProjectOption[]>([]);
    const [teamWorkloadLoading, setTeamWorkloadLoading] = useState(false);
    const [teamTaskTypeFilter, setTeamTaskTypeFilter] = useState<TeamTaskTypeFilter>("all");
    const [teamProjectFilter, setTeamProjectFilter] = useState("all");

    const [kpiPeriodMode, setKpiPeriodMode] = useState<"month" | "year">("month");
    const [kpiMonth, setKpiMonth] = useState(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    });
    const [kpiYear, setKpiYear] = useState(() => String(new Date().getFullYear()));
    const kpiPeriod = kpiPeriodMode === "year" ? kpiYear : kpiMonth;
    const [myKpiTaskTypeFilter, setMyKpiTaskTypeFilter] = useState<KpiTaskType>("all");
    const [myKpiProjectTypeFilter, setMyKpiProjectTypeFilter] = useState<KpiProjectTypeFilter>("all");
    const [kpis, setKpis] = useState<Kpis | null>(null);
    const [kpiLoading, setKpiLoading] = useState(false);
    const [kpiProjectFilter, setKpiProjectFilter] = useState("all");
    const [kpiTaskTypeFilter, setKpiTaskTypeFilter] = useState<KpiTaskType>("all");
    const [kpiProjectTypeFilter, setKpiProjectTypeFilter] = useState<KpiProjectTypeFilter>("all");
    const [kpiMembers, setKpiMembers] = useState<MemberKpiRow[]>([]);
    const [kpiProjectOptions, setKpiProjectOptions] = useState<KpiProjectOption[]>([]);
    const [kpiMembersLoading, setKpiMembersLoading] = useState(false);

    useEffect(() => {
        (async () => {
            const res = await fetch(`${api}/dashboard/summary`, { headers: authHeader() });
            if (res.ok) setSummary(await res.json());
            setLoading(false);
        })();
    }, []);

    // ดึง "ภาพรวมทีม" แยกจาก summary หลัก เพื่อให้เปลี่ยนฟิลเตอร์ (task/subtask, โปรเจกต์) ได้โดยไม่ต้องโหลดทั้งหน้าใหม่
    useEffect(() => {
        if (!summary?.canViewTeamWorkload) return;
        (async () => {
            setTeamWorkloadLoading(true);
            try {
                const params = new URLSearchParams({ taskType: teamTaskTypeFilter, projectId: teamProjectFilter });
                const res = await fetch(`${api}/dashboard/team-workload?${params}`, { headers: authHeader() });
                if (res.ok) {
                    const data = await res.json();
                    setTeamWorkload(data.teamWorkload);
                    setTeamProjectOptions(data.projectOptions);
                }
            } finally {
                setTeamWorkloadLoading(false);
            }
        })();
    }, [summary?.canViewTeamWorkload, teamTaskTypeFilter, teamProjectFilter]);

    // KPI ภาพรวม (ทุกโปรเจกต์ในสโคปที่เห็นได้) — แยก endpoint จาก summary หลักเพื่อสลับเดือนได้โดยไม่โหลดทั้งหน้าใหม่
    useEffect(() => {
        (async () => {
            setKpiLoading(true);
            try {
                const params = new URLSearchParams({ month: kpiPeriod, taskType: myKpiTaskTypeFilter, projectType: myKpiProjectTypeFilter });
                const res = await fetch(`${api}/dashboard/kpis?${params}`, { headers: authHeader() });
                if (res.ok) setKpis(await res.json());
            } finally {
                setKpiLoading(false);
            }
        })();
    }, [kpiPeriod, myKpiTaskTypeFilter, myKpiProjectTypeFilter]);

    // KPI รายคน — ใช้เดือนเดียวกับข้างบน แต่กรองรายโปรเจกต์ได้เพิ่ม ต้องมีสิทธิ์ viewMemberKpi ถึงจะเห็น (ข้อมูลรายคนของคนอื่น)
    useEffect(() => {
        if (!hasBit(BITS.viewMemberKpi)) return;
        (async () => {
            setKpiMembersLoading(true);
            try {
                const params = new URLSearchParams({ month: kpiPeriod, projectId: kpiProjectFilter, taskType: kpiTaskTypeFilter, projectType: kpiProjectTypeFilter });
                const res = await fetch(`${api}/dashboard/kpis/by-member?${params}`, { headers: authHeader() });
                if (res.ok) {
                    const data = await res.json();
                    setKpiMembers(data.members);
                    setKpiProjectOptions(data.projectOptions);
                }
            } finally {
                setKpiMembersLoading(false);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [kpiPeriod, kpiProjectFilter, kpiTaskTypeFilter, kpiProjectTypeFilter]);

    // ค้นหาแบบ debounce — พิมพ์แล้วรอ 300ms ก่อนยิง request กันสแปม request ทุกตัวอักษร
    // เคลียร์ผลลัพธ์ผ่าน timer เดียวกันเสมอ (ไม่ setState ตรงๆ ใน effect body) กัน cascading render
    useEffect(() => {
        const q = searchQuery.trim();
        const timer = setTimeout(async () => {
            if (!q) { setSearchResults(null); return; }
            const res = await fetch(`${api}/dashboard/search?q=${encodeURIComponent(q)}`, { headers: authHeader() });
            if (res.ok) setSearchResults(await res.json());
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    function goToSearchResult(url: string) {
        if (blurTimer.current) clearTimeout(blurTimer.current);
        setSearchOpen(false);
        setSearchQuery("");
        setSearchResults(null);
        router.push(url);
    }

    // เปิดปัญหาที่มีการตอบกลับใหม่จากแดชบอร์ด = ถือว่าอ่านแล้ว (ยิง GET replies เพื่อ mark-read ฝั่ง backend เหมือนตอนเปิดเธรดใน
    // หน้า project) ไม่ต้องรอ response ก่อนค่อยพาไปหน้า project เพราะแค่ mark-read เฉยๆ ไม่ต้องใช้ผลลัพธ์อะไรต่อ
    // ปัญหาจะหายไปจากรายการ "ปัญหาที่เปิดอยู่" ตอนโหลดแดชบอร์ดครั้งถัดไป (ถ้าไม่ได้โผล่มาด้วยเหตุผลอื่น เช่น รับผิดชอบตรง/ถูกแท็ก)
    function openIssueFromDashboard(iss: OpenIssue) {
        if (iss.is_unread_reply) {
            fetch(`${api}/projects/${iss.project_id}/issues/${iss.issue_id}/replies`, { headers: authHeader() }).catch(() => {});
        }
        router.push(`/projects/view?id=${iss.project_id}&taskId=${iss.task_id}`);
    }

    async function openMemberTasks(member: TeamWorkloadEntry) {
        setSelectedMember(member);
        setMemberTasksLoading(true);
        try {
            const res = await fetch(`${api}/dashboard/team/${member.user_id}/tasks`, { headers: authHeader() });
            if (res.ok) setMemberTasks(await res.json());
        } finally {
            setMemberTasksLoading(false);
        }
    }

    function closeMemberTasks() {
        setSelectedMember(null);
        setMemberTasks(null);
    }

    if (loading) return <p className="p-6 text-gray-400">กำลังโหลด...</p>;
    if (!summary) return <p className="p-6 text-gray-500">โหลดข้อมูลแดชบอร์ดไม่สำเร็จ</p>;

    const overdueCount = summary.myTasks.filter((t) => isOverdue(t.task_due_date)).length;

    return (
        <div className="p-4 sm:p-6 space-y-6">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold text-gray-800">แดชบอร์ด</h1>
                {hasBit(BITS.createProject) && (
                    <Button onClick={() => router.push("/projects/create")}>+ สร้างโปรเจกต์</Button>
                )}
            </div>

            {!summary.hasProjectAccess ? null : (
            <>
            <div className="relative max-w-md">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => { if (blurTimer.current) clearTimeout(blurTimer.current); setSearchOpen(true); }}
                    onBlur={() => { blurTimer.current = setTimeout(() => setSearchOpen(false), 150); }}
                    placeholder="ค้นหาโปรเจกต์หรืองาน..."
                    className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 border-gray-300 focus:border-blue-400 focus:ring-blue-500/20"
                />
                {searchOpen && searchQuery.trim() && (
                    <div className="absolute z-10 mt-1 w-full bg-white rounded-lg shadow-lg border border-gray-100 max-h-80 overflow-y-auto">
                        {!searchResults ? (
                            <p className="px-4 py-3 text-sm text-gray-400">กำลังค้นหา...</p>
                        ) : searchResults.projects.length === 0 && searchResults.tasks.length === 0 ? (
                            <p className="px-4 py-3 text-sm text-gray-400">ไม่พบผลลัพธ์</p>
                        ) : (
                            <>
                                {searchResults.projects.length > 0 && (
                                    <div>
                                        <p className="px-4 pt-2.5 pb-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">โปรเจกต์</p>
                                        {searchResults.projects.map((p) => (
                                            <button
                                                key={p.project_id}
                                                type="button"
                                                onClick={() => goToSearchResult(`/projects/view?id=${p.project_id}`)}
                                                className="w-full flex items-center justify-between gap-2 px-4 py-2 text-left text-sm hover:bg-blue-50"
                                            >
                                                <span className="text-gray-700 truncate">{p.project_name}</span>
                                                <span className={`text-xs shrink-0 ${PROJECT_STATUS_COLOR[p.project_status]}`}>
                                                    {PROJECT_STATUS_LABEL[p.project_status]}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {searchResults.tasks.length > 0 && (
                                    <div>
                                        <p className="px-4 pt-2.5 pb-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">งาน</p>
                                        {searchResults.tasks.map((t) => (
                                            <button
                                                key={t.task_id}
                                                type="button"
                                                onClick={() => goToSearchResult(`/projects/view?id=${t.project_id}&taskId=${t.task_id}`)}
                                                className="w-full text-left px-4 py-2 text-sm hover:bg-blue-50"
                                            >
                                                <p className="text-gray-700 truncate">{t.task_title}</p>
                                                <p className="text-xs text-gray-400 truncate">{t.project_name}</p>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
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
                                    (iss) => (tab === "subtask") === iss.is_subtask && (!subtaskOwnOnly || iss.is_direct_assignee || iss.is_tagged || iss.is_unread_reply)
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
                            (iss) => (issueTab === "subtask") === iss.is_subtask && (!subtaskOwnOnly || iss.is_direct_assignee || iss.is_tagged || iss.is_unread_reply)
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
                                            onClick={() => openIssueFromDashboard(iss)}
                                            className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left ${
                                                iss.is_tagged || iss.is_unread_reply ? "bg-red-50 hover:bg-red-100" : "hover:bg-blue-50"
                                            }`}
                                        >
                                            <div className="min-w-0">
                                                <p className="text-sm text-gray-700 truncate flex items-center gap-1.5">
                                                    <span className="truncate">{iss.issue_title}</span>
                                                    {iss.is_tagged && (
                                                        <span className="shrink-0 text-[10px] font-medium text-red-600 bg-red-100 px-1.5 py-0.5 rounded">
                                                            @คุณถูกแท็ก
                                                        </span>
                                                    )}
                                                    {iss.is_unread_reply && (
                                                        <span className="shrink-0 text-[10px] font-medium text-red-600 bg-red-100 px-1.5 py-0.5 rounded">
                                                            มีการตอบกลับใหม่
                                                        </span>
                                                    )}
                                                    {iss.issue_status === "resolved" && (
                                                        <span className="shrink-0 text-[10px] font-medium text-green-600 bg-green-100 px-1.5 py-0.5 rounded">
                                                            แก้ไขแล้ว
                                                        </span>
                                                    )}
                                                </p>
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
                                <li key={`${c.chat_type}-${c.task_id ?? c.project_id}`}>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            router.push(
                                                c.chat_type === "task"
                                                    ? `/projects/view?id=${c.project_id}&taskId=${c.task_id}&openChat=1`
                                                    : `/projects/view?id=${c.project_id}&openProjectChat=1`
                                            )
                                        }
                                        className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-blue-50"
                                    >
                                        <div className="min-w-0">
                                            <p className="text-sm text-gray-700 truncate flex items-center gap-1.5">
                                                <span className="truncate">{c.chat_type === "task" ? c.task_title : c.project_name}</span>
                                                {c.chat_type === "project" && (
                                                    <span className="shrink-0 text-[10px] font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                                                        โปรเจกต์
                                                    </span>
                                                )}
                                            </p>
                                            {c.chat_type === "task" && (
                                                <p className="text-xs text-gray-400 truncate">{c.project_name}</p>
                                            )}
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

            {summary.canViewTeamWorkload && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <h2 className="text-base font-semibold text-gray-800">ภาพรวมทีม</h2>
                        <div className="flex items-center gap-3 text-[11px] text-gray-500">
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" />เสร็จแล้ว</span>
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" />ค้างอยู่</span>
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" />เลยกำหนด</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex text-xs rounded-lg border border-gray-200 overflow-hidden shrink-0">
                            {([
                                { key: "all", label: "ทั้งหมด" },
                                { key: "task", label: "Task" },
                                { key: "subtask", label: "Subtask" },
                            ] as const).map((opt) => (
                                <button
                                    key={opt.key}
                                    type="button"
                                    onClick={() => setTeamTaskTypeFilter(opt.key)}
                                    className={`px-3 py-1.5 font-medium transition-colors ${
                                        teamTaskTypeFilter === opt.key ? "bg-blue-500 text-white" : "bg-white text-gray-500 hover:bg-gray-50"
                                    }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                        <select
                            value={teamProjectFilter}
                            onChange={(e) => setTeamProjectFilter(e.target.value)}
                            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        >
                            <option value="all">ทุกโปรเจค</option>
                            {teamProjectOptions.map((p) => (
                                <option key={p.project_id} value={p.project_id}>{p.project_name}</option>
                            ))}
                        </select>
                    </div>
                    {teamWorkloadLoading ? (
                        <p className="text-sm text-gray-400">กำลังโหลด...</p>
                    ) : teamWorkload.length === 0 ? (
                        <p className="text-sm text-gray-400">ยังไม่มีใครมีงานอยู่ตอนนี้</p>
                    ) : (
                        (() => {
                            const totalOf = (m: TeamWorkloadEntry) => m.done_task_count + m.pending_task_count + m.overdue_task_count;
                            const maxTotal = Math.max(...teamWorkload.map(totalOf), 1);
                            return (
                                <ul className="space-y-2.5">
                                    {teamWorkload.map((m) => {
                                        const total = totalOf(m) || 1;
                                        return (
                                            <li key={m.user_id}>
                                                <button
                                                    type="button"
                                                    onClick={() => openMemberTasks(m)}
                                                    className="w-full flex items-center gap-3 -mx-2 px-2 py-1 rounded-lg hover:bg-blue-50 text-left"
                                                >
                                                    <Image
                                                        src={m.user_avatar_url ? `${SERVER_BASE}${m.user_avatar_url}` : "/defult.png"}
                                                        alt=""
                                                        width={28}
                                                        height={28}
                                                        unoptimized={!!m.user_avatar_url}
                                                        className="w-7 h-7 rounded-full object-cover border border-gray-200 shrink-0"
                                                    />
                                                    <span className="text-sm text-gray-700 w-32 shrink-0 truncate">{m.user_fullname}</span>
                                                    <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                                                        <div className="h-full flex" style={{ width: `${(totalOf(m) / maxTotal) * 100}%` }}>
                                                            <div className="h-full bg-green-500" style={{ width: `${(m.done_task_count / total) * 100}%` }} />
                                                            <div className="h-full bg-blue-500" style={{ width: `${(m.pending_task_count / total) * 100}%` }} />
                                                            <div className="h-full bg-red-500" style={{ width: `${(m.overdue_task_count / total) * 100}%` }} />
                                                        </div>
                                                    </div>
                                                    <span className="text-xs text-gray-500 w-16 shrink-0 text-right">{m.pending_task_count} ค้าง</span>
                                                    {m.done_task_count > 0 && (
                                                        <span className="text-[11px] font-medium text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full shrink-0">
                                                            เสร็จแล้ว {m.done_task_count}
                                                        </span>
                                                    )}
                                                    {m.overdue_task_count > 0 && (
                                                        <span className="text-[11px] font-medium text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full shrink-0">
                                                            เลยกำหนด {m.overdue_task_count}
                                                        </span>
                                                    )}
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            );
                        })()
                    )}
                </div>
            )}

            <div className="space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <h2 className="text-base font-semibold text-gray-800">KPI ของฉัน</h2>
                    <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex text-xs rounded-lg border border-gray-200 overflow-hidden shrink-0">
                            {(["all", "task", "subtask"] as const).map((t) => (
                                <button
                                    key={t}
                                    type="button"
                                    onClick={() => setMyKpiTaskTypeFilter(t)}
                                    className={`px-3 py-1.5 font-medium transition-colors ${
                                        myKpiTaskTypeFilter === t ? "bg-blue-500 text-white" : "bg-white text-gray-500 hover:bg-gray-50"
                                    }`}
                                >
                                    {t === "all" ? "ทั้งหมด" : t === "task" ? "Task" : "Subtask"}
                                </button>
                            ))}
                        </div>
                        <div className="flex text-xs rounded-lg border border-gray-200 overflow-hidden shrink-0">
                            {(["all", "waterfall", "agile"] as const).map((pt) => (
                                <button
                                    key={pt}
                                    type="button"
                                    onClick={() => setMyKpiProjectTypeFilter(pt)}
                                    className={`px-3 py-1.5 font-medium transition-colors ${
                                        myKpiProjectTypeFilter === pt ? "bg-indigo-500 text-white" : "bg-white text-gray-500 hover:bg-gray-50"
                                    }`}
                                >
                                    {pt === "all" ? "ทุกรูปแบบ" : pt === "waterfall" ? "Waterfall" : "Agile"}
                                </button>
                            ))}
                        </div>
                        <div className="flex text-xs rounded-lg border border-gray-200 overflow-hidden shrink-0">
                            {(["month", "year"] as const).map((mode) => (
                                <button
                                    key={mode}
                                    type="button"
                                    onClick={() => setKpiPeriodMode(mode)}
                                    className={`px-3 py-1.5 font-medium transition-colors ${
                                        kpiPeriodMode === mode ? "bg-blue-500 text-white" : "bg-white text-gray-500 hover:bg-gray-50"
                                    }`}
                                >
                                    {mode === "month" ? "รายเดือน" : "รายปี"}
                                </button>
                            ))}
                        </div>
                        {kpiPeriodMode === "month" ? (
                            <input
                                type="month"
                                value={kpiMonth}
                                onChange={(e) => setKpiMonth(e.target.value)}
                                className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:border-blue-400 focus:ring-blue-500/20"
                            />
                        ) : (
                            <input
                                type="number"
                                value={kpiYear}
                                onChange={(e) => setKpiYear(e.target.value)}
                                min={2000}
                                max={2100}
                                className="w-24 px-2 py-1.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:border-blue-400 focus:ring-blue-500/20"
                            />
                        )}
                    </div>
                </div>
                <p className="text-xs text-gray-400">
                    &quot;ตรงเวลา&quot; นับเฉพาะรายการที่ครบกำหนดในช่วงนี้และครบกำหนดไปแล้ว — ที่เลยกำหนดแต่ยังไม่เสร็จก็นับว่าสายทันที ไม่ต้องรอปิดงานก่อน
                </p>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <KpiTile
                        label="อัตราส่งโปรเจกต์ตรงเวลา"
                        display={kpiLoading || !kpis ? "…" : formatRate(kpis.projectOnTimeRate)}
                        sub={!kpiLoading && kpis && kpis.projectOnTimeEligible > 0 ? `จาก ${kpis.projectOnTimeEligible} โปรเจกต์ที่ครบกำหนด` : "ยังไม่มีข้อมูล"}
                        color={kpiLoading || !kpis ? "text-gray-400" : rateColor(kpis.projectOnTimeRate)}
                    />
                    <KpiTile
                        label={`อัตรา${myKpiTaskTypeFilter === "all" ? "งาน" : myKpiTaskTypeFilter === "task" ? " Task หลัก" : " Subtask"}ตรงเวลา`}
                        display={kpiLoading || !kpis ? "…" : formatRate(kpis.taskOnTimeRate)}
                        sub={!kpiLoading && kpis && kpis.taskOnTimeEligible > 0 ? `จาก ${kpis.taskOnTimeEligible} งานที่ครบกำหนด` : "ยังไม่มีข้อมูล"}
                        color={kpiLoading || !kpis ? "text-gray-400" : rateColor(kpis.taskOnTimeRate)}
                    />
                    <KpiTile
                        label={`เวลาเฉลี่ยทำงาน${myKpiTaskTypeFilter === "all" ? "" : myKpiTaskTypeFilter === "task" ? " (Task หลัก)" : " (Subtask)"}`}
                        display={kpiLoading || !kpis ? "…" : formatHours(kpis.avgTaskCycleHours)}
                        sub="ตั้งแต่เริ่มลงมือทำ (in progress) จนเสร็จ"
                        color={kpiLoading || !kpis || kpis.avgTaskCycleHours === null ? "text-gray-400" : "text-gray-800"}
                    />
                    <KpiTile
                        label="เวลาเฉลี่ยแก้ปัญหา"
                        display={kpiLoading || !kpis ? "…" : formatHours(kpis.avgIssueResolveHours)}
                        sub="ตั้งแต่เปิดจนแก้ไขแล้ว"
                        color={kpiLoading || !kpis || kpis.avgIssueResolveHours === null ? "text-gray-400" : "text-gray-800"}
                    />
                </div>
            </div>

            {hasBit(BITS.viewMemberKpi) && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <h2 className="text-base font-semibold text-gray-800">KPI รายคน</h2>
                        <div className="flex items-center gap-2 flex-wrap">
                            <div className="flex text-xs rounded-lg border border-gray-200 overflow-hidden shrink-0">
                                {(["all", "task", "subtask"] as const).map((t) => (
                                    <button
                                        key={t}
                                        type="button"
                                        onClick={() => setKpiTaskTypeFilter(t)}
                                        className={`px-3 py-1.5 font-medium transition-colors ${
                                            kpiTaskTypeFilter === t ? "bg-blue-500 text-white" : "bg-white text-gray-500 hover:bg-gray-50"
                                        }`}
                                    >
                                        {t === "all" ? "ทั้งหมด" : t === "task" ? "Task" : "Subtask"}
                                    </button>
                                ))}
                            </div>
                            <div className="flex text-xs rounded-lg border border-gray-200 overflow-hidden shrink-0">
                                {(["all", "waterfall", "agile"] as const).map((pt) => (
                                    <button
                                        key={pt}
                                        type="button"
                                        onClick={() => { setKpiProjectTypeFilter(pt); setKpiProjectFilter("all"); }}
                                        className={`px-3 py-1.5 font-medium transition-colors ${
                                            kpiProjectTypeFilter === pt ? "bg-indigo-500 text-white" : "bg-white text-gray-500 hover:bg-gray-50"
                                        }`}
                                    >
                                        {pt === "all" ? "ทุกรูปแบบ" : pt === "waterfall" ? "Waterfall" : "Agile"}
                                    </button>
                                ))}
                            </div>
                            <SearchableSelect
                                value={kpiProjectFilter}
                                onChange={(v) => setKpiProjectFilter(v || "all")}
                                options={[
                                    { value: "all", label: "ทุกโปรเจค" },
                                    ...kpiProjectOptions.map((p) => ({ value: p.project_id, label: p.project_name })),
                                ]}
                                placeholder="ทุกโปรเจค"
                                className="w-56 text-xs"
                            />
                        </div>
                    </div>
                    {kpiMembersLoading ? (
                        <p className="text-sm text-gray-400">กำลังโหลด...</p>
                    ) : kpiMembers.length === 0 ? (
                        <p className="text-sm text-gray-400">ไม่มีข้อมูลในช่วงนี้</p>
                    ) : (
                        <div className="overflow-x-auto">
                            {(() => {
                                const maxAssigned = Math.max(...kpiMembers.map((m) => m.tasksAssigned), 1);
                                return (
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                                                <th className="py-2 pr-3 font-medium">ชื่อ</th>
                                                <th className="py-2 px-3 font-medium text-right">ได้รับมอบหมาย</th>
                                                <th className="py-2 px-3 font-medium text-right">
                                                    {kpiTaskTypeFilter === "all" ? "งาน" : kpiTaskTypeFilter === "task" ? "Task" : "Subtask"} ที่เสร็จ
                                                </th>
                                                <th className="py-2 px-3 font-medium text-right">ตรงเวลา</th>
                                                <th className="py-2 px-3 font-medium text-right">เวลาเฉลี่ยทำงาน</th>
                                                <th className="py-2 px-3 font-medium text-right">ปัญหาที่แก้ไข</th>
                                                <th className="py-2 pl-3 font-medium text-right">เวลาเฉลี่ยแก้ปัญหา</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {kpiMembers.map((m) => (
                                                <tr key={m.user_id}>
                                                    <td className="py-2 pr-3">
                                                        <div className="flex items-center gap-2">
                                                            <Image
                                                                src={m.user_avatar_url ? `${SERVER_BASE}${m.user_avatar_url}` : "/defult.png"}
                                                                alt=""
                                                                width={24}
                                                                height={24}
                                                                unoptimized={!!m.user_avatar_url}
                                                                className="w-6 h-6 rounded-full object-cover border border-gray-200 shrink-0"
                                                            />
                                                            <span className="text-gray-700 truncate">{m.user_fullname}</span>
                                                        </div>
                                                    </td>
                                                    <td className="py-2 px-3 text-right">
                                                        <div className="flex items-center justify-end gap-2">
                                                            <div className="w-14 h-1.5 rounded-full bg-gray-100 overflow-hidden shrink-0">
                                                                <div
                                                                    className="h-full bg-indigo-400"
                                                                    style={{ width: `${(m.tasksAssigned / maxAssigned) * 100}%` }}
                                                                />
                                                            </div>
                                                            <span className="text-gray-700 w-4 text-right">{m.tasksAssigned}</span>
                                                        </div>
                                                    </td>
                                                    <td className="py-2 px-3 text-right text-gray-700">{m.tasksCompleted}</td>
                                                    <td className={`py-2 px-3 text-right font-medium ${rateColor(m.taskOnTimeRate)}`}>{formatRate(m.taskOnTimeRate)}</td>
                                                    <td className="py-2 px-3 text-right text-gray-500">{formatHours(m.avgTaskCycleHours)}</td>
                                                    <td className="py-2 px-3 text-right text-gray-700">{m.issuesResolved}</td>
                                                    <td className="py-2 pl-3 text-right text-gray-500">{formatHours(m.avgIssueResolveHours)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                );
                            })()}
                        </div>
                    )}
                </div>
            )}

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
            </>
            )}

            {selectedMember && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
                    onClick={closeMemberTasks}
                >
                    <div
                        className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6 space-y-4 max-h-[85vh] overflow-y-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center gap-3">
                            <Image
                                src={selectedMember.user_avatar_url ? `${SERVER_BASE}${selectedMember.user_avatar_url}` : "/defult.png"}
                                alt=""
                                width={36}
                                height={36}
                                unoptimized={!!selectedMember.user_avatar_url}
                                className="w-9 h-9 rounded-full object-cover border border-gray-200 shrink-0"
                            />
                            <h2 className="text-lg font-semibold text-gray-800">{selectedMember.user_fullname}</h2>
                        </div>

                        {memberTasksLoading || !memberTasks ? (
                            <p className="text-sm text-gray-400">กำลังโหลด...</p>
                        ) : (
                            <>
                                {([
                                    { key: "overdue", label: "เลยกำหนด", color: "text-red-600", list: memberTasks.overdue },
                                    { key: "pending", label: "ค้างอยู่", color: "text-gray-700", list: memberTasks.pending },
                                    { key: "done", label: "เสร็จแล้ว", color: "text-green-600", list: memberTasks.done },
                                ] as const).map((section) => (
                                    <div key={section.key} className="space-y-2">
                                        <h3 className={`text-sm font-semibold ${section.color}`}>
                                            {section.label} ({section.list.length})
                                        </h3>
                                        {section.list.length === 0 ? (
                                            <p className="text-sm text-gray-400">ไม่มี</p>
                                        ) : (
                                            <ul className="divide-y divide-gray-50 rounded-lg border border-gray-100 overflow-hidden">
                                                {section.list.map((t) => (
                                                    <li key={t.task_id}>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                closeMemberTasks();
                                                                router.push(`/projects/view?id=${t.project_id}&taskId=${t.task_id}`);
                                                            }}
                                                            className="w-full flex items-center justify-between gap-3 px-4 py-2 text-left hover:bg-blue-50"
                                                        >
                                                            <div className="min-w-0">
                                                                <p className="text-sm text-gray-700 truncate flex items-center gap-1.5">
                                                                    <span className="truncate">{t.task_title}</span>
                                                                    {t.task_parent_id && (
                                                                        <span className="shrink-0 text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                                                                            Subtask
                                                                        </span>
                                                                    )}
                                                                </p>
                                                                <p className="text-xs text-gray-400 truncate">{t.project_name}</p>
                                                            </div>
                                                            <span className="text-xs text-gray-400 shrink-0">{formatDateOnly(t.task_due_date)}</span>
                                                        </button>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                ))}
                            </>
                        )}

                        <div className="flex justify-end pt-2">
                            <button
                                type="button"
                                onClick={closeMemberTasks}
                                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
                            >
                                ปิด
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
