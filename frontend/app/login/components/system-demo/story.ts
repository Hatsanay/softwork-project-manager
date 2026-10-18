// เรื่องเดียวของเดโมหน้า login (docs/plans/2026-10-18-login-demo-real-ui.md ข้อ 2)
// ลูกค้ารายเดียว "บริษัท โรงแรมริมน้ำ จำกัด" ตั้งแต่รับงานจนรู้กำไร · ข้อมูลทุกฉากมาจากไฟล์นี้ ตัวเลขและเลขเอกสารจึงต่อกัน
// วันที่ทุกตัวนับจาก "วันนี้" (ตามเวลาไทย) — เดโมดูเป็นงานปัจจุบันเสมอ และป้าย "เลยกำหนด" ของหน้าจริงไม่ขึ้นผิดเมื่อเวลาผ่านไป
// type มาจากหน้าจริง (_types.ts) — API เปลี่ยนเมื่อไหร่ tsc ฟ้องที่ไฟล์นี้ (R3)
import { toDateInputValue } from "@/app/function";
import { MENU_DEFS, getVisibleItems } from "@/app/components/bit";
import { FULL_PERMISSION } from "@/lib/shared/permissions.mjs";
import type { OpenIssue, SummaryProject, SummaryTask, UnreadChat } from "@/app/(protected)/dashboard/_types";
import type { BoardTask } from "@/app/(protected)/projects/view/_components/board/board-types";
import type { SharedProject, SharedTask, TimelineEntry } from "@/app/share/[token]/share-view";

const DAY_MS = 24 * 60 * 60 * 1000;
const TODAY = toDateInputValue(new Date());

/** วันที่ "YYYY-MM-DD" ห่างจากวันนี้ offset วัน (ลบ = ย้อนหลัง) */
export function storyDate(offset = 0) {
    const noonUtc = new Date(`${TODAY}T12:00:00Z`).getTime();
    return new Date(noonUtc + offset * DAY_MS).toISOString().slice(0, 10);
}

/** วันเวลาแบบที่ API ส่ง (ISO) — วันที่ห่างจากวันนี้ offset วัน เวลาไทย hh:mm */
export function storyDateTime(offset: number, time: string) {
    return new Date(`${storyDate(offset)}T${time}:00+07:00`).toISOString();
}

/** เลขที่เอกสารตามรูปแบบของระบบ: QT-YYYYMMDD-000004 (เลขรีเซ็ตรายวัน) */
export function storyNumber(prefix: string, offset: number, sequence: number) {
    return `${prefix}-${storyDate(offset).replaceAll("-", "")}-${String(sequence).padStart(6, "0")}`;
}

// ── คนและเมนู ─────────────────────────────────────────────────────────────────────────────────

export const DEMO_USER = { fullname: "สมชาย ใจดี", firstName: "สมชาย", roleName: "ผู้จัดการโปรเจกต์", avatarUrl: null };

// เมนูของคนที่มีสิทธิ์ครบ (เห็นทุกระบบ)
export const DEMO_MENU = getVisibleItems(MENU_DEFS, FULL_PERMISSION);

// ── ลูกค้าและโปรเจกต์ ────────────────────────────────────────────────────────────────────────────

export const CLIENT_NAME = "บริษัท โรงแรมริมน้ำ จำกัด";
export const PROJECT_ID = "PRJ-DEMO-HOTEL";
export const PROJECT_NAME = "ระบบจองห้องพักโรงแรม";
export const PROJECT_START = storyDate(-45);
export const PROJECT_DUE = storyDate(30);

// ความคืบหน้าก่อน/หลังย้ายการ์ด "เชื่อมระบบชำระเงิน" ไปเสร็จ (ถ่วงน้ำหนักงาน)
export const PROGRESS_BEFORE = 62;
export const PROGRESS_AFTER = 74;

// ── แดชบอร์ด ──────────────────────────────────────────────────────────────────────────────────

const OTHER_PROJECT_ID = "PRJ-DEMO-FOOD";

export const MY_TASKS: SummaryTask[] = [
    {
        task_id: "T-PAY",
        task_title: "เชื่อมระบบชำระเงิน",
        task_status: "review",
        task_due_date: storyDate(1),
        task_parent_id: null,
        project_id: PROJECT_ID,
        project_name: PROJECT_NAME,
    },
    {
        task_id: "T-ROOM",
        task_title: "หน้าจัดการห้องพักและราคา",
        task_status: "in_progress",
        task_due_date: storyDate(-1),
        task_parent_id: null,
        project_id: PROJECT_ID,
        project_name: PROJECT_NAME,
    },
    {
        task_id: "T-MENU",
        task_title: "ตรวจหน้าจอเมนูอาหาร",
        task_status: "todo",
        task_due_date: storyDate(6),
        task_parent_id: null,
        project_id: OTHER_PROJECT_ID,
        project_name: "แอปส่งอาหาร",
    },
];

export const ACTIVE_PROJECTS: SummaryProject[] = [
    {
        project_id: PROJECT_ID,
        project_name: PROJECT_NAME,
        project_status: "in_progress",
        project_progress_percent: String(PROGRESS_BEFORE),
        project_due_date: PROJECT_DUE,
    },
    {
        project_id: OTHER_PROJECT_ID,
        project_name: "แอปส่งอาหาร",
        project_status: "in_progress",
        project_progress_percent: "41",
        project_due_date: storyDate(60),
    },
    {
        project_id: "PRJ-DEMO-CAFE",
        project_name: "เว็บไซต์ร้านคาเฟ่ดี",
        project_status: "in_progress",
        project_progress_percent: "90",
        project_due_date: storyDate(9),
    },
];

export const OPEN_ISSUES: OpenIssue[] = [
    {
        issue_id: "I-1",
        issue_title: "ลูกค้าขอเพิ่มช่องทางชำระผ่านพร้อมเพย์",
        issue_status: "open",
        issue_created_at: storyDateTime(-1, "16:20"),
        task_id: "T-PAY",
        task_title: "เชื่อมระบบชำระเงิน",
        project_id: PROJECT_ID,
        project_name: PROJECT_NAME,
        is_subtask: false,
        is_direct_assignee: true,
        is_tagged: true,
        is_unread_reply: false,
    },
];

export const UNREAD_CHATS: UnreadChat[] = [
    {
        chat_type: "project",
        task_id: null,
        task_title: null,
        project_id: PROJECT_ID,
        project_name: PROJECT_NAME,
        unread_count: 3,
        last_message_at: storyDateTime(0, "08:42"),
        last_message_text: "ส่งหน้าจอรอบสองให้ลูกค้าดูแล้วนะครับ",
        last_message_sender: "เอกชัย วงศ์ใหญ่",
        last_message_has_images: false,
    },
];

// ── บอร์ดงาน ──────────────────────────────────────────────────────────────────────────────────

const ASSIGNEES = {
    som: { user_id: "U-SOM", user_fullname: "สมชาย ใจดี" },
    ek: { user_id: "U-EK", user_fullname: "เอกชัย วงศ์ใหญ่" },
    mani: { user_id: "U-MANI", user_fullname: "มณีรัตน์ ทองดี" },
    poom: { user_id: "U-POOM", user_fullname: "ภูมิ ศรีสุข" },
};

function boardTask(task: Partial<BoardTask> & Pick<BoardTask, "task_id" | "task_title" | "task_status">): BoardTask {
    return {
        task_parent_id: null,
        task_due_date: null,
        task_weight: 1,
        assignees: [],
        open_issue_count: 0,
        subtask_open_issue_count: 0,
        unread_chat_count: 0,
        ...task,
    };
}

// การ์ดที่ลากในฉากบอร์ด: "รอตรวจ" → "เสร็จ"
export const MOVING_TASK_ID = "T-PAY";

export const BOARD_TASKS: BoardTask[] = [
    boardTask({
        task_id: "T-TEST",
        task_title: "ทดสอบบนมือถือทุกหน้า",
        task_status: "todo",
        task_due_date: storyDate(20),
        labels: [{ pl_id: 3, pl_name: "ทดสอบ", pl_color: "yellow" }],
        checklist_done: 0,
        checklist_total: 6,
        assignees: [ASSIGNEES.mani],
        task_sort_order: 1,
    }),
    boardTask({
        task_id: "T-MANUAL",
        task_title: "คู่มือการใช้งานสำหรับพนักงานโรงแรม",
        task_status: "todo",
        task_due_date: storyDate(28),
        labels: [{ pl_id: 4, pl_name: "เอกสาร", pl_color: "sky" }],
        assignees: [ASSIGNEES.som],
        task_sort_order: 2,
    }),
    boardTask({
        task_id: "T-ROOM",
        task_title: "หน้าจัดการห้องพักและราคา",
        task_status: "in_progress",
        task_due_date: storyDate(-1),
        labels: [{ pl_id: 1, pl_name: "หน้าจอ", pl_color: "green" }],
        checklist_done: 5,
        checklist_total: 8,
        unread_chat_count: 2,
        assignees: [ASSIGNEES.ek],
        task_sort_order: 1,
    }),
    boardTask({
        task_id: "T-PAY",
        task_title: "เชื่อมระบบชำระเงิน",
        task_status: "review",
        task_due_date: storyDate(1),
        labels: [{ pl_id: 2, pl_name: "ระบบหลังบ้าน", pl_color: "purple" }],
        checklist_done: 4,
        checklist_total: 4,
        open_issue_count: 1,
        assignees: [ASSIGNEES.poom, ASSIGNEES.som],
        task_weight: 3,
        task_sort_order: 1,
    }),
    boardTask({
        task_id: "T-DESIGN",
        task_title: "ออกแบบหน้าแรกและหน้าจอง",
        task_status: "done",
        task_due_date: storyDate(-20),
        task_completed_at: storyDateTime(-21, "17:10"),
        labels: [{ pl_id: 1, pl_name: "หน้าจอ", pl_color: "green" }],
        checklist_done: 6,
        checklist_total: 6,
        assignees: [ASSIGNEES.mani],
    }),
    boardTask({
        task_id: "T-DB",
        task_title: "ฐานข้อมูลห้องและการจอง",
        task_status: "done",
        task_due_date: storyDate(-12),
        task_completed_at: storyDateTime(-13, "15:40"),
        labels: [{ pl_id: 2, pl_name: "ระบบหลังบ้าน", pl_color: "purple" }],
        checklist_done: 4,
        checklist_total: 4,
        assignees: [ASSIGNEES.ek],
    }),
];

// ── ลิงก์ให้ลูกค้า ─────────────────────────────────────────────────────────────────────────────

export const SHARE_PATH = "/share/k7Qm2xR9vT";

export const SHARED_PROJECT: SharedProject = {
    project_id: PROJECT_ID,
    project_name: PROJECT_NAME,
    project_description: "ระบบจองห้องพักออนไลน์ พร้อมหน้าจัดการห้องและราคาสำหรับพนักงาน และชำระเงินผ่านพร้อมเพย์",
    project_status: "in_progress",
    project_start_date: PROJECT_START,
    project_due_date: PROJECT_DUE,
    project_progress_percent: String(PROGRESS_AFTER),
    client_name: CLIENT_NAME,
};

export const SHARED_TASKS: SharedTask[] = BOARD_TASKS.map((task) => ({
    task_id: task.task_id,
    task_title: task.task_title,
    // ลูกค้าเห็นหลังย้ายการ์ด "เชื่อมระบบชำระเงิน" ไปเสร็จแล้ว
    task_status: task.task_id === MOVING_TASK_ID ? "done" : task.task_status,
    assignee_names: task.assignees.map((assignee) => assignee.user_fullname).join(", ") || null,
    task_start_date: PROJECT_START,
    task_due_date: task.task_due_date,
}));

export const SHARED_TIMELINE: TimelineEntry[] = [
    {
        log_id: "L-3",
        task_title: "เชื่อมระบบชำระเงิน",
        log_action: "status_changed",
        log_old_value: "review",
        log_new_value: "done",
        log_message: null,
        log_created_at: storyDateTime(0, "09:05"),
    },
    {
        log_id: "L-2",
        task_title: "หน้าจัดการห้องพักและราคา",
        log_action: "status_changed",
        log_old_value: "todo",
        log_new_value: "in_progress",
        log_message: null,
        log_created_at: storyDateTime(-3, "10:30"),
    },
    {
        log_id: "L-1",
        task_title: "ทดสอบบนมือถือทุกหน้า",
        log_action: "created",
        log_old_value: null,
        log_new_value: null,
        log_message: null,
        log_created_at: storyDateTime(-5, "14:00"),
    },
];
