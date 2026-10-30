// ค่าคงที่และตัวช่วยของหน้าโปรเจกต์ (แยกจาก page.tsx 2026-10-30 · ส่วน C) · สิทธิ์ในโปรเจกต์ แชท ป้ายจำนวน มุมมองงานที่จำไว้
import { api } from "@/app/constans";
import { PROJECT_PERMISSION_BITS } from "@/app/components/project-position-bits";
import type { TaskView } from "../_components/project-sections";
import type { TaskStatus, IssueStatus, IssueFormState, ActivityEntry, TaskFormState } from "../_types";

export const SERVER_BASE = new URL(api).origin;

// มุมมองงาน ตาราง/บอร์ด — จำไว้ต่อเครื่อง (K5) · อ่าน localStorage ไม่ได้ (โหมดส่วนตัว) = ตาราง
export const TASK_VIEW_STORAGE_KEY = "softwork.projectTaskView";

export function readTaskView(): TaskView {
    if (typeof window === "undefined") return "table";
    try {
        return window.localStorage.getItem(TASK_VIEW_STORAGE_KEY) === "board" ? "board" : "table";
    } catch {
        return "table";
    }
}

export function saveTaskView(view: TaskView) {
    try {
        window.localStorage.setItem(TASK_VIEW_STORAGE_KEY, view);
    } catch {
        // เก็บไม่ได้ก็ใช้ได้ปกติ แค่ไม่จำค่า
    }
}

export const MAX_ISSUE_IMAGES = 5;

export const MAX_CHAT_IMAGES = 5;

export const CHAT_POLL_INTERVAL_MS = 4000;

export const REPLY_PREVIEW_MAX_CHARS = 80;

// แชทไม่มีแก้ไข/ลบข้อความ — จำนวนเท่าเดิมและข้อความล่าสุดเป็นตัวเดิม = ไม่มีอะไรเปลี่ยน
export function sameMessageList(prev: { message_id: string }[], next: { message_id: string }[]): boolean {
    return prev.length === next.length && prev.at(-1)?.message_id === next.at(-1)?.message_id;
}

export function truncateReplyPreview(text: string): string {
    return text.length > REPLY_PREVIEW_MAX_CHARS ? `${text.slice(0, REPLY_PREVIEW_MAX_CHARS)}…` : text;
}

export function scrollToChatMessage(messageId: string) {
    const el = document.getElementById(`chat-msg-${messageId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("ring-2", "ring-blue-500");
    setTimeout(() => el.classList.remove("ring-2", "ring-blue-500"), 1200);
}

export const EMPTY_ISSUE_FORM: IssueFormState = { issue_title: "", issue_description: "", tagged_users: [] };

export const MAX_ISSUE_REPLY_IMAGES = 5;

export const EMPTY_TASK_FORM: TaskFormState = {
    task_title: "", task_description: "", assignee_ids: [],
    task_start_date: "", task_due_date: "", task_weight: "1",
};

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
    todo: "รอดำเนินการ", in_progress: "กำลังทำ", review: "ตรวจสอบ", done: "เสร็จแล้ว",
};

export const TASK_STATUS_OPTIONS: { value: TaskStatus; label: string }[] = (
    Object.keys(TASK_STATUS_LABEL) as TaskStatus[]
).map((value) => ({ value, label: TASK_STATUS_LABEL[value] }));

export const ISSUE_STATUS_LABEL: Record<IssueStatus, string> = { open: "เปิดอยู่", resolved: "แก้ไขแล้ว" };

export const ACTION_LABEL: Record<ActivityEntry["log_action"], string> = {
    created: "สร้างงาน", status_changed: "เปลี่ยนสถานะงาน", edited: "แก้ไขงาน",
    assigned: "มอบหมายงาน", comment: "แสดงความคิดเห็นใน",
};

export function authHeader() {
    return { Authorization: `Bearer ${localStorage.getItem("token")}` };
}

export function decodeToken(token: string): { user_id: string } {
    const payload = token.split(".")[1];
    return JSON.parse(atob(payload));
}

export function hasProjectBit(permission: string, key: string) {
    const index = PROJECT_PERMISSION_BITS.findIndex((b) => b.key === key);
    return index !== -1 && permission[index] === "1";
}

// แดง = ปัญหาของ task/subtask นั้นเอง, น้ำเงิน = ปัญหาที่รวมมาจาก subtask ของมัน (แสดงคู่กันแต่นับแยกกัน)
export function IssueCountBadge({ count, color }: { count: number; color: "red" | "blue" }) {
    if (!count) return null;
    const colorClass = color === "red" ? "text-red-600 bg-red-50" : "text-blue-600 bg-blue-50";
    return (
        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${colorClass}`}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.198 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003ZM12 8.25a.75.75 0 0 1 .75.75v3.75a.75.75 0 0 1-1.5 0V9a.75.75 0 0 1 .75-.75Zm0 8.25a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" clipRule="evenodd" />
            </svg>
            {count}
        </span>
    );
}

// badge จำนวนข้อความแชทที่ยังไม่ได้อ่าน — วงกลมสีแดงเล็กๆ แบบ notification ทั่วไป ไม่ใช้สีเดียวกับ IssueCountBadge เพื่อไม่ให้สับสนความหมาย
export function ChatUnreadBadge({ count }: { count: number }) {
    if (!count) return null;
    return (
        <span className="inline-flex items-center justify-center min-w-4.5 h-4.5 px-1 text-[11px] font-medium text-white bg-red-600 rounded-full leading-none">
            {count > 99 ? "99+" : count}
        </span>
    );
}

export async function loadUserOptions(search: string, excludeUserIds: string[]) {
    const res = await fetch(`${api}/users/for-select?${new URLSearchParams({ search })}`, { headers: authHeader() });
    if (!res.ok) return [];
    const rows = (await res.json()) as { user_id: string; user_fullname: string }[];
    return rows
        .filter((u) => !excludeUserIds.includes(u.user_id))
        .map((u) => ({ value: u.user_id, label: u.user_fullname }));
}
