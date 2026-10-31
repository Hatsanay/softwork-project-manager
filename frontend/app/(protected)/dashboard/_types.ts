// ชนิดข้อมูลของแดชบอร์ด — ตรงกับคำตอบของ backend/src/controllers/dashboard.controller.js (ไม่เปลี่ยน API ในขั้น U3)

import type { FastworkOverview } from "../fastwork/_types";
export type ProjectStatus = "planning" | "in_progress" | "on_hold" | "completed" | "cancelled";
export type TaskStatus = "todo" | "in_progress" | "review" | "done";

export type SummaryProject = {
    project_id: string;
    project_name: string;
    project_status: ProjectStatus;
    project_progress_percent: string;
    project_due_date: string | null;
};

export type SummaryTask = {
    task_id: string;
    task_title: string;
    task_status: TaskStatus;
    task_due_date: string | null;
    task_parent_id: string | null;
    project_id: string;
    project_name: string;
};

export type ActivityEntry = {
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

export type OpenIssue = {
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

export type UnreadChat = {
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

export type TeamWorkloadEntry = {
    user_id: string;
    user_fullname: string;
    user_avatar_url: string | null;
    overdue_task_count: number;
    pending_task_count: number;
    done_task_count: number;
};

export type ProjectOption = { project_id: string; project_name: string };
export type TaskTypeFilter = "all" | "task" | "subtask";
export type ProjectTypeFilter = "all" | "waterfall" | "agile";

export type MemberTask = {
    task_id: string;
    task_title: string;
    task_status: TaskStatus;
    task_due_date: string | null;
    task_parent_id: string | null;
    project_id: string;
    project_name: string;
};

export type MemberTasksDetail = {
    user_fullname: string;
    done: MemberTask[];
    pending: MemberTask[];
    overdue: MemberTask[];
};

export type Summary = {
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

export type Kpis = {
    period: string;
    taskType: TaskTypeFilter;
    projectOnTimeRate: number | null;
    projectOnTimeEligible: number;
    taskOnTimeRate: number | null;
    taskOnTimeEligible: number;
    avgTaskCycleHours: number | null;
    avgIssueResolveHours: number | null;
};

export type MemberKpiRow = {
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

export type SearchResults = {
    projects: { project_id: string; project_name: string; project_status: ProjectStatus }[];
    tasks: {
        task_id: string;
        task_title: string;
        task_parent_id: string | null;
        project_id: string;
        project_name: string;
    }[];
};

// ภาพรวมธุรกิจ (2026-10-31 · GET /dashboard/business) · ส่วนที่ไม่มีสิทธิ์ = ไม่มีในคำตอบ
export type BusinessCashMonth = { month: string; direct: string; fastwork: string; total: string };

export type BusinessSummary = {
    today: string;
    requests?: { submitted: number };
    quotations?: { waiting: number; expiring_soon: number; expiring_days: number };
    receivables?: { outstanding: string; overdue: string; overdue_clients: number };
    fastwork?: {
        steps: FastworkOverview["steps"];
        projects: FastworkOverview["projects"];
        project_count: number;
    };
    cash?: { months: BusinessCashMonth[] };
    capital?: { goal: string | null; target_date: string | null; percent: number | null; balance: string };
};
