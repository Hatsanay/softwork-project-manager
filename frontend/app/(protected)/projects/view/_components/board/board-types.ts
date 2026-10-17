// ชนิดข้อมูลของบอร์ดงาน — ตรงกับ GET /projects/:id/tasks (ช่องเพิ่มของบอร์ด: labels · checklist · subtask)
import type { LabelColor } from "./label-colors";

export type BoardStatus = "todo" | "in_progress" | "review" | "done";

export type BoardLabel = { pl_id: number; pl_name: string; pl_color: LabelColor };

export type ProjectLabel = BoardLabel & { pl_sort_order: number; task_count: number };

export type BoardTask = {
    task_id: string;
    task_parent_id: string | null;
    task_status: BoardStatus;
    task_title: string;
    task_due_date: string | null;
    task_completed_at?: string | null;
    task_sort_order?: number;
    task_weight: number;
    assignees: { user_id: string; user_fullname: string }[];
    open_issue_count: number;
    subtask_open_issue_count: number;
    unread_chat_count: number;
    labels?: BoardLabel[];
    checklist_done?: number;
    checklist_total?: number;
    subtask_done?: number;
    subtask_total?: number;
};

export const BOARD_COLUMNS: { status: BoardStatus; label: string }[] = [
    { status: "todo", label: "รอทำ" },
    { status: "in_progress", label: "กำลังทำ" },
    { status: "review", label: "รอตรวจ" },
    { status: "done", label: "เสร็จ" },
];

export const STATUS_LABELS: Record<BoardStatus, string> = {
    todo: "รอทำ",
    in_progress: "กำลังทำ",
    review: "รอตรวจ",
    done: "เสร็จ",
};

// คอลัมน์ "เสร็จ" แสดงล่าสุดกี่ใบก่อนกด "ดูทั้งหมด" (K6)
export const DONE_COLUMN_LIMIT = 20;
