// ป้ายสถานะ ตัวช่วยแสดงตัวเลข และลิงก์ของแดชบอร์ด — ที่เดียวของหน้า
import type { PillTone } from "@/components/ui/status-pill";
import { toDateInputValue } from "@/app/function";
import type { ActivityEntry, ProjectStatus, TaskStatus } from "./_types";

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

export const ACTION_LABEL: Record<ActivityEntry["log_action"], string> = {
    created: "สร้างงาน",
    status_changed: "เปลี่ยนสถานะงาน",
    edited: "แก้ไขงาน",
    assigned: "มอบหมายงาน",
    comment: "แสดงความคิดเห็นใน",
};

export const TASK_TYPE_OPTIONS = [
    { value: "all" as const, label: "ทั้งหมด" },
    { value: "task" as const, label: "Task" },
    { value: "subtask" as const, label: "Subtask" },
];

export const PROJECT_TYPE_OPTIONS = [
    { value: "all" as const, label: "ทุกรูปแบบ" },
    { value: "waterfall" as const, label: "Waterfall" },
    { value: "agile" as const, label: "Agile" },
];

// เทียบเป็นวันที่ตามเวลาไทยทั้งสองฝั่ง ("YYYY-MM-DD" เทียบแบบสตริงได้ตรงลำดับเวลา) — เดิมใช้เวลาเครื่องของผู้ดู
// คนที่เปิดจากต่างประเทศจะเห็น "เลยกำหนด" เพี้ยนไปได้ 1 วัน (2026-10-12, risk-fixes R22)
export function isOverdue(dueDate: string | null) {
    if (!dueDate) return false;
    return toDateInputValue(dueDate) < toDateInputValue(new Date());
}

export function formatRate(rate: number | null) {
    return rate === null ? "-" : `${rate}%`;
}

/** สีตัวเลขอัตราตรงเวลา: ≥80% เขียว · ≥50% เหลือง · ต่ำกว่านั้นแดง · ไม่มีข้อมูลเทา */
export function rateTextColor(rate: number | null) {
    if (rate === null) return "text-gray-400";
    if (rate >= 80) return "text-green-600";
    if (rate >= 50) return "text-amber-600";
    return "text-red-600";
}

export function formatHours(hours: number | null) {
    if (hours === null) return "-";
    // ทำเสร็จภายในไม่กี่นาที (เช่น ปิดงานทันทีที่เริ่ม) แสดง "0.0 ชม." แล้วดูเหมือนข้อมูลผิด
    if (hours < 1) return "ไม่ถึง 1 ชม.";
    return hours < 24 ? `${hours.toFixed(1)} ชม.` : `${(hours / 24).toFixed(1)} วัน`;
}

export const taskLink = (projectId: string, taskId: string) => `/projects/view?id=${projectId}&taskId=${taskId}`;
export const projectLink = (projectId: string) => `/projects/view?id=${projectId}`;
