// ชนิดข้อมูลของหน้าโปรเจกต์ (แยกจาก page.tsx 2026-10-30 · docs/plans/2026-10-30-quote-pdf-mobile-refactor.md ส่วน C)
import type { ChecklistItem } from "./_components/board/task-labels-checklist";
import type { BoardLabel } from "./_components/board/board-types";

export type ProjectStatus = "planning" | "in_progress" | "on_hold" | "completed" | "cancelled";

export type ProjectType = "waterfall" | "agile";

export type TaskStatus = "todo" | "in_progress" | "review" | "done";

export type ProjectDetail = {
    project_id: string;
    project_name: string;
    project_description: string | null;
    project_status: ProjectStatus;
    project_type: ProjectType;
    project_start_date: string | null;
    project_due_date: string | null;
    project_progress_percent: string;
    project_share_token: string;
    project_share_enabled: number;
    project_use_task_weight: number;
    // ช่องทางงาน (2026-10-24 · P-1): fastwork = รับงานผ่าน fastwork.com (การ์ดงวดงาน + เงินจากแพลตฟอร์ม)
    project_channel: "direct" | "fastwork";
    client_name: string | null;
    client_email: string | null;
    unread_chat_count: number;
};

export type TaskAssignee = { user_id: string; user_fullname: string };

export type Task = {
    task_id: string;
    task_parent_id: string | null;
    task_status: TaskStatus;
    task_title: string;
    assignees: TaskAssignee[];
    task_start_date: string | null;
    task_due_date: string | null;
    task_weight: number;
    open_issue_count: number;
    subtask_open_issue_count: number;
    unread_chat_count: number;
    // บอร์ดงาน (2026-10-17)
    task_sort_order?: number;
    task_completed_at?: string | null;
    labels?: BoardLabel[];
    checklist_done?: number;
    checklist_total?: number;
    subtask_done?: number;
    subtask_total?: number;
};

export type IssueStatus = "open" | "resolved";

export type IssueImage = { image_id: string; issue_id: string; image_url: string };

export type IssueTag = { user_id: string; user_fullname: string };

export type Issue = {
    issue_id: string;
    task_id: string;
    issue_title: string;
    issue_description: string | null;
    issue_status: IssueStatus;
    created_by: string | null;
    created_by_name: string | null;
    issue_created_at: string;
    images: IssueImage[];
    tags: IssueTag[];
};

export type ChatImage = { image_id: string; message_id: string; image_url: string };

export type ChatMessage = {
    message_id: string;
    task_id: string;
    user_id: string | null;
    user_fullname: string | null;
    user_avatar_url: string | null;
    message_text: string | null;
    message_created_at: string;
    reply_to_message_id: string | null;
    reply_to_text: string | null;
    reply_to_user_fullname: string | null;
    reply_to_image_count: number;
    images: ChatImage[];
};

export type ProjectChatMessage = {
    message_id: string;
    project_id: string;
    user_id: string | null;
    user_fullname: string | null;
    user_avatar_url: string | null;
    message_text: string | null;
    message_created_at: string;
    reply_to_message_id: string | null;
    reply_to_text: string | null;
    reply_to_user_fullname: string | null;
    reply_to_image_count: number;
    images: ChatImage[];
};

export type IssueFormState = { issue_title: string; issue_description: string; tagged_users: IssueTag[] };

export type IssueReplyImage = { image_id: string; reply_id: string; image_url: string };

export type IssueReply = {
    reply_id: string;
    issue_id: string;
    user_id: string | null;
    user_fullname: string | null;
    user_avatar_url: string | null;
    reply_text: string | null;
    reply_created_at: string;
    images: IssueReplyImage[];
};

export type MemberPosition = { project_member_id: string; position_id: string; position_name: string };

export type Member = {
    project_member_id: string;
    user_id: string;
    user_fullname: string;
    positions: MemberPosition[];
};

export type ActivityEntry = {
    log_id: string;
    task_id: string;
    task_title: string;
    log_fullname: string | null;
    log_action: "created" | "status_changed" | "edited" | "assigned" | "comment";
    log_old_value: string | null;
    log_new_value: string | null;
    log_message: string | null;
    log_created_at: string;
};

export type PositionOption = { position_id: string; position_name: string };

export type TaskDetail = Task & { task_description: string | null; checklist?: ChecklistItem[] };

export type TaskFormState = {
    task_title: string;
    task_description: string;
    assignee_ids: string[];
    task_start_date: string;
    task_due_date: string;
    task_weight: string;
};

export type MemberFormState = { user_id: string; position_ids: string[] };
