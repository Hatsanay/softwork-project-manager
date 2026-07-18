"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { api } from "@/app/constans";
import formatDate, { formatDateOnly, toDateInputValue } from "@/app/function";
import DataTable, { Column } from "@/components/ui/datatable/datatable";
import ProgressBar from "@/components/ui/ProgressBar";
import CircularProgress from "@/components/ui/CircularProgress";
import Button from "@/components/ui/Button/Button";
import EditButton from "@/components/ui/Button/EditButton";
import DeleteButton from "@/components/ui/Button/DeleteButton";
import Input from "@/components/ui/Input/input";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { PROJECT_PERMISSION_BITS } from "@/app/components/project-position-bits";
import { toast } from "sonner";

const SERVER_BASE = new URL(api).origin;

type ProjectStatus = "planning" | "in_progress" | "on_hold" | "completed" | "cancelled";
type ProjectType = "waterfall" | "agile";
type TaskStatus = "todo" | "in_progress" | "review" | "done";

type ProjectDetail = {
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
    client_name: string | null;
    client_email: string | null;
    unread_chat_count: number;
};

type TaskAssignee = { user_id: string; user_fullname: string };

type Task = {
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
};

type IssueStatus = "open" | "resolved";
type IssueImage = { image_id: string; issue_id: string; image_url: string };
type IssueTag = { user_id: string; user_fullname: string };
type Issue = {
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

const MAX_ISSUE_IMAGES = 5;

type ChatImage = { image_id: string; message_id: string; image_url: string };
type ChatMessage = {
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

const MAX_CHAT_IMAGES = 5;
const CHAT_POLL_INTERVAL_MS = 4000;
const REPLY_PREVIEW_MAX_CHARS = 80;

type ProjectChatMessage = {
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

function truncateReplyPreview(text: string): string {
    return text.length > REPLY_PREVIEW_MAX_CHARS ? `${text.slice(0, REPLY_PREVIEW_MAX_CHARS)}…` : text;
}

function scrollToChatMessage(messageId: string) {
    const el = document.getElementById(`chat-msg-${messageId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("ring-2", "ring-amber-400");
    setTimeout(() => el.classList.remove("ring-2", "ring-amber-400"), 1200);
}

type IssueFormState = { issue_title: string; issue_description: string; tagged_users: IssueTag[] };
const EMPTY_ISSUE_FORM: IssueFormState = { issue_title: "", issue_description: "", tagged_users: [] };

type IssueReplyImage = { image_id: string; reply_id: string; image_url: string };
type IssueReply = {
    reply_id: string;
    issue_id: string;
    user_id: string | null;
    user_fullname: string | null;
    user_avatar_url: string | null;
    reply_text: string | null;
    reply_created_at: string;
    images: IssueReplyImage[];
};

const MAX_ISSUE_REPLY_IMAGES = 5;

type MemberPosition = { project_member_id: string; position_id: string; position_name: string };
type Member = {
    project_member_id: string;
    user_id: string;
    user_fullname: string;
    positions: MemberPosition[];
};

type ActivityEntry = {
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

type PositionOption = { position_id: string; position_name: string };
type TaskDetail = Task & { task_description: string | null };

type TaskFormState = {
    task_title: string;
    task_description: string;
    assignee_ids: string[];
    task_start_date: string;
    task_due_date: string;
    task_weight: string;
};

type MemberFormState = { user_id: string; position_ids: string[] };

const EMPTY_TASK_FORM: TaskFormState = {
    task_title: "", task_description: "", assignee_ids: [],
    task_start_date: "", task_due_date: "", task_weight: "1",
};

const STATUS_LABEL: Record<ProjectStatus, string> = {
    planning: "วางแผน", in_progress: "กำลังทำ", on_hold: "พักไว้", completed: "เสร็จแล้ว", cancelled: "ยกเลิก",
};
const STATUS_COLOR: Record<ProjectStatus, string> = {
    planning: "text-gray-500", in_progress: "text-blue-600", on_hold: "text-amber-600",
    completed: "text-green-600", cancelled: "text-red-500",
};

const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
    todo: "รอดำเนินการ", in_progress: "กำลังทำ", review: "ตรวจสอบ", done: "เสร็จแล้ว",
};
const TASK_STATUS_COLOR: Record<TaskStatus, string> = {
    todo: "text-gray-500", in_progress: "text-blue-600", review: "text-amber-600", done: "text-green-600",
};
const TASK_STATUS_OPTIONS: { value: TaskStatus; label: string }[] = (
    Object.keys(TASK_STATUS_LABEL) as TaskStatus[]
).map((value) => ({ value, label: TASK_STATUS_LABEL[value] }));

const ISSUE_STATUS_LABEL: Record<IssueStatus, string> = { open: "เปิดอยู่", resolved: "แก้ไขแล้ว" };
const ISSUE_STATUS_COLOR: Record<IssueStatus, string> = { open: "text-red-600 bg-red-50", resolved: "text-green-600 bg-green-50" };

const ACTION_LABEL: Record<ActivityEntry["log_action"], string> = {
    created: "สร้างงาน", status_changed: "เปลี่ยนสถานะงาน", edited: "แก้ไขงาน",
    assigned: "มอบหมายงาน", comment: "แสดงความคิดเห็นใน",
};

function authHeader() {
    return { Authorization: `Bearer ${localStorage.getItem("token")}` };
}

function decodeToken(token: string): { user_id: string } {
    const payload = token.split(".")[1];
    return JSON.parse(atob(payload));
}

function hasProjectBit(permission: string, key: string) {
    const index = PROJECT_PERMISSION_BITS.findIndex((b) => b.key === key);
    return index !== -1 && permission[index] === "1";
}

// แดง = ปัญหาของ task/subtask นั้นเอง, น้ำเงิน = ปัญหาที่รวมมาจาก subtask ของมัน (แสดงคู่กันแต่นับแยกกัน)
function IssueCountBadge({ count, color }: { count: number; color: "red" | "blue" }) {
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
function ChatUnreadBadge({ count }: { count: number }) {
    if (!count) return null;
    return (
        <span className="inline-flex items-center justify-center min-w-4.5 h-4.5 px-1 text-[11px] font-semibold text-white bg-red-500 rounded-full leading-none">
            {count > 99 ? "99+" : count}
        </span>
    );
}

async function loadUserOptions(search: string, excludeUserIds: string[]) {
    const res = await fetch(`${api}/users/for-select?${new URLSearchParams({ search })}`, { headers: authHeader() });
    if (!res.ok) return [];
    const rows = (await res.json()) as { user_id: string; user_fullname: string }[];
    return rows
        .filter((u) => !excludeUserIds.includes(u.user_id))
        .map((u) => ({ value: u.user_id, label: u.user_fullname }));
}

export default function ViewProjectPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const id = searchParams.get("id");
    const [isPending, startTransition] = useTransition();

    const [currentUserId, setCurrentUserId] = useState("");
    const [project, setProject] = useState<ProjectDetail | null>(null);
    const [permission, setPermission] = useState("");
    const [tasks, setTasks] = useState<Task[]>([]);
    const [members, setMembers] = useState<Member[]>([]);
    const [activity, setActivity] = useState<ActivityEntry[]>([]);
    const [positions, setPositions] = useState<PositionOption[]>([]);
    const [notFound, setNotFound] = useState(false);
    const [copyFeedback, setCopyFeedback] = useState(false);
    const [isRegeneratingLink, setIsRegeneratingLink] = useState(false);

    const [shareEmailModalOpen, setShareEmailModalOpen] = useState(false);
    const [shareEmailForm, setShareEmailForm] = useState({ to: "", message: "" });
    const [shareEmailError, setShareEmailError] = useState<string | null>(null);
    const [isSendingShareEmail, setIsSendingShareEmail] = useState(false);
    const [showOnlyMyTasks, setShowOnlyMyTasks] = useState(false);
    const [agileOverviewTab, setAgileOverviewTab] = useState<"all" | "task" | "subtask">("all");

    const [taskModalOpen, setTaskModalOpen] = useState(false);
    const [editingTask, setEditingTask] = useState<Task | null>(null);
    const [parentTask, setParentTask] = useState<Task | null>(null);
    const [taskForm, setTaskForm] = useState<TaskFormState>(EMPTY_TASK_FORM);
    const [taskFormError, setTaskFormError] = useState<string | null>(null);
    const [deleteTaskTarget, setDeleteTaskTarget] = useState<Task | null>(null);
    const [isDeletingTask, setIsDeletingTask] = useState(false);

    const [detailTask, setDetailTask] = useState<TaskDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);

    const [detailIssues, setDetailIssues] = useState<Issue[]>([]);
    const [issueFormOpen, setIssueFormOpen] = useState(false);
    const [editingIssue, setEditingIssue] = useState<Issue | null>(null);
    const [issueForm, setIssueForm] = useState<IssueFormState>(EMPTY_ISSUE_FORM);
    const [issueFormError, setIssueFormError] = useState<string | null>(null);
    const [issueKeepImageIds, setIssueKeepImageIds] = useState<string[]>([]);
    const [issueNewImages, setIssueNewImages] = useState<File[]>([]);
    const [issueTagQuery, setIssueTagQuery] = useState("");
    const [issueTagResults, setIssueTagResults] = useState<IssueTag[]>([]);
    const [issueTagDropdownOpen, setIssueTagDropdownOpen] = useState(false);
    const issueTagBlurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [issueRepliesByIssue, setIssueRepliesByIssue] = useState<Record<string, IssueReply[]>>({});
    const [issueRepliesLoading, setIssueRepliesLoading] = useState(false);
    const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
    const [replyNewImagesByIssue, setReplyNewImagesByIssue] = useState<Record<string, File[]>>({});
    const [isSendingReply, setIsSendingReply] = useState(false);
    const [isSavingIssue, setIsSavingIssue] = useState(false);
    const [deleteIssueTarget, setDeleteIssueTarget] = useState<Issue | null>(null);
    const [isDeletingIssue, setIsDeletingIssue] = useState(false);

    const [chatOpen, setChatOpen] = useState(false);
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [chatText, setChatText] = useState("");
    const [chatNewImages, setChatNewImages] = useState<File[]>([]);
    const [isSendingChat, setIsSendingChat] = useState(false);
    const [replyingToChat, setReplyingToChat] = useState<ChatMessage | null>(null);
    const chatListRef = useRef<HTMLDivElement | null>(null);

    const [projectChatOpen, setProjectChatOpen] = useState(false);
    const [projectChatMessages, setProjectChatMessages] = useState<ProjectChatMessage[]>([]);
    const [projectChatText, setProjectChatText] = useState("");
    const [projectChatNewImages, setProjectChatNewImages] = useState<File[]>([]);
    const [isSendingProjectChat, setIsSendingProjectChat] = useState(false);
    const [replyingToProjectChat, setReplyingToProjectChat] = useState<ProjectChatMessage | null>(null);
    const projectChatListRef = useRef<HTMLDivElement | null>(null);

    const [memberModalOpen, setMemberModalOpen] = useState(false);
    const [editingMember, setEditingMember] = useState<Member | null>(null);
    const [memberForm, setMemberForm] = useState<MemberFormState>({ user_id: "", position_ids: [] });
    const [memberFormError, setMemberFormError] = useState<string | null>(null);
    const [removeMemberTarget, setRemoveMemberTarget] = useState<Member | null>(null);
    const [isRemovingMember, setIsRemovingMember] = useState(false);

    const [deleteProjectConfirm, setDeleteProjectConfirm] = useState(false);
    const [isDeletingProject, setIsDeletingProject] = useState(false);

    async function loadAll(projectId: string) {
        const headers = authHeader();
        const [projectRes, permRes, membersRes, tasksRes, activityRes] = await Promise.all([
            fetch(`${api}/projects/${projectId}`, { headers }),
            fetch(`${api}/projects/${projectId}/my-permissions`, { headers }),
            fetch(`${api}/projects/${projectId}/members`, { headers }),
            fetch(`${api}/projects/${projectId}/tasks`, { headers }),
            fetch(`${api}/projects/${projectId}/activity`, { headers }),
        ]);

        if (!projectRes.ok) { setNotFound(true); return []; }

        const [projectData, permData, membersData, tasksData, activityData] = await Promise.all([
            projectRes.json(), permRes.json(), membersRes.json(), tasksRes.json(), activityRes.json(),
        ]);

        setProject(projectData);
        setPermission(permData.position_permission ?? "");
        setMembers(membersData);
        const loadedTasks: Task[] = tasksData.data ?? [];
        setTasks(loadedTasks);
        setActivity(activityData.data ?? []);
        return loadedTasks;
    }

    useEffect(() => {
        if (!id) return;
        startTransition(async () => {
            const token = localStorage.getItem("token");
            if (token) setCurrentUserId(decodeToken(token).user_id);
            const loadedTasks = await loadAll(id);
            // ลิงก์ deep-link มาจากแดชบอร์ด/กิจกรรม — เจาะเปิด task/subtask นั้นให้เลยแทนที่จะแค่เปิดหน้าโปรเจกต์เฉยๆ
            const targetTaskId = searchParams.get("taskId");
            if (targetTaskId) {
                const target = loadedTasks.find((t) => t.task_id === targetTaskId);
                if (target) {
                    await openTaskDetail(target);
                    // มาจาก widget "แชทที่ยังไม่ได้อ่าน" — เปิดแผงแชทให้เลยไม่ต้องกดปุ่มแชทเอง
                    if (searchParams.get("openChat")) setChatOpen(true);
                }
            } else if (searchParams.get("openProjectChat")) {
                // มาจาก widget "แชทที่ยังไม่ได้อ่าน" ฝั่งแชทรวมของโปรเจกต์ (ไม่ผูก task) — เปิด modal แชทโปรเจกต์ให้เลย
                setProjectChatOpen(true);
            }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    useEffect(() => {
        (async () => {
            const res = await fetch(`${api}/project-positions?status=active&limit=100`, { headers: authHeader() });
            if (!res.ok) return;
            const data = await res.json();
            setPositions(data.data ?? []);
        })();
    }, []);

    // แชทเปิดอยู่ระหว่างดู task ไหน ก็ poll ข้อความใหม่ของ task นั้นเป็นระยะ (ไม่มี websocket ใช้ polling แทน)
    useEffect(() => {
        if (!chatOpen || !detailTask) return;
        loadChatMessages(detailTask.task_id);
        const timer = setInterval(() => loadChatMessages(detailTask.task_id), CHAT_POLL_INTERVAL_MS);
        return () => clearInterval(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chatOpen, detailTask?.task_id]);

    // เลื่อนไปข้อความล่าสุดเสมอเมื่อมีข้อความใหม่หรือเพิ่งเปิดแชท
    useEffect(() => {
        if (!chatListRef.current) return;
        chatListRef.current.scrollTop = chatListRef.current.scrollHeight;
    }, [chatMessages]);

    // แชทรวมของโปรเจกต์เปิดอยู่ ก็ poll ข้อความใหม่เป็นระยะเหมือนแชทของ task
    useEffect(() => {
        if (!projectChatOpen || !id) return;
        loadProjectChatMessages();
        const timer = setInterval(() => loadProjectChatMessages(), CHAT_POLL_INTERVAL_MS);
        return () => clearInterval(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectChatOpen, id]);

    useEffect(() => {
        if (!projectChatListRef.current) return;
        projectChatListRef.current.scrollTop = projectChatListRef.current.scrollHeight;
    }, [projectChatMessages]);

    // ค้นหาคนไว้แท็ก (@) ในฟอร์มปัญหา — debounce เหมือน dashboard search, ตัด "@" นำหน้าออกก่อนค้นหา
    useEffect(() => {
        if (!issueFormOpen) return;
        const q = issueTagQuery.trim().replace(/^@/, "");
        const timer = setTimeout(async () => {
            if (!q) { setIssueTagResults([]); return; }
            const res = await fetch(`${api}/users/for-select?${new URLSearchParams({ search: q })}`, { headers: authHeader() });
            if (!res.ok) return;
            const rows = (await res.json()) as IssueTag[];
            const excludeIds = issueForm.tagged_users.map((u) => u.user_id);
            setIssueTagResults(rows.filter((u) => !excludeIds.includes(u.user_id)));
        }, 300);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [issueTagQuery, issueFormOpen]);

    const canAddTask = hasProjectBit(permission, "addTask");
    const canEditTask = hasProjectBit(permission, "editTask");
    const canDeleteTask = hasProjectBit(permission, "deleteTask");
    const canManageMembers = hasProjectBit(permission, "manageMembers");
    const canEditProjectInfo = hasProjectBit(permission, "editProjectInfo");
    const canManageShareLink = hasProjectBit(permission, "manageShareLink");
    const canDeleteProject = hasProjectBit(permission, "deleteProject");
    const canEditOwnTask = hasProjectBit(permission, "editOwnTask");
    const canAddOwnSubtask = hasProjectBit(permission, "addOwnSubtask");
    const canChangeTaskStatus = hasProjectBit(permission, "changeTaskStatus");
    const canChangeOwnTaskStatus = hasProjectBit(permission, "changeOwnTaskStatus");
    const canChangeSubtaskStatus = hasProjectBit(permission, "changeSubtaskStatus");
    const canChangeOwnSubtaskStatus = hasProjectBit(permission, "changeOwnSubtaskStatus");

    const canAddIssueTask = hasProjectBit(permission, "addIssueTask");
    const canAddOwnIssueTask = hasProjectBit(permission, "addOwnIssueTask");
    const canAddIssueSubtask = hasProjectBit(permission, "addIssueSubtask");
    const canAddOwnIssueSubtask = hasProjectBit(permission, "addOwnIssueSubtask");
    const canEditIssueTask = hasProjectBit(permission, "editIssueTask");
    const canEditOwnIssueTask = hasProjectBit(permission, "editOwnIssueTask");
    const canEditIssueSubtask = hasProjectBit(permission, "editIssueSubtask");
    const canEditOwnIssueSubtask = hasProjectBit(permission, "editOwnIssueSubtask");
    const canDeleteIssueTask = hasProjectBit(permission, "deleteIssueTask");
    const canDeleteOwnIssueTask = hasProjectBit(permission, "deleteOwnIssueTask");
    const canDeleteIssueSubtask = hasProjectBit(permission, "deleteIssueSubtask");
    const canDeleteOwnIssueSubtask = hasProjectBit(permission, "deleteOwnIssueSubtask");
    const canChangeIssueStatusTask = hasProjectBit(permission, "changeIssueStatusTask");
    const canChangeOwnIssueStatusTask = hasProjectBit(permission, "changeOwnIssueStatusTask");
    const canChangeIssueStatusSubtask = hasProjectBit(permission, "changeIssueStatusSubtask");
    const canChangeOwnIssueStatusSubtask = hasProjectBit(permission, "changeOwnIssueStatusSubtask");

    function isAssigneeOf(task: Task, userId: string) {
        return task.assignees.some((a) => a.user_id === userId);
    }

    // ความคืบหน้าของ task เดี่ยวๆ คำนวณจาก subtask ของมัน — ทุก subtask นับน้ำหนักเท่ากันหมด (1) ไม่สนใจ task_weight
    // ถ้าไม่มี subtask เลย ใช้สถานะของ task เองแทน (เสร็จ = 100%, อย่างอื่น = 0%)
    function getTaskProgress(task: Task) {
        const children = tasks.filter((t) => t.task_parent_id === task.task_id);
        if (children.length === 0) {
            return { percent: task.task_status === "done" ? 100 : 0, done: 0, total: 0 };
        }
        const done = children.filter((c) => c.task_status === "done").length;
        return { percent: (done / children.length) * 100, done, total: children.length };
    }

    // เพิ่ม subtask ให้ task นี้ได้ถ้ามีสิทธิ์ addTask (เพิ่มได้ทุก task) หรือมีสิทธิ์ addOwnSubtask "และ" เป็นผู้รับผิดชอบของ task นี้เอง
    function canAddSubtaskTo(task: Task) {
        return canAddTask || (canAddOwnSubtask && isAssigneeOf(task, currentUserId));
    }

    // แก้ไขข้อมูล task (full edit) ได้ถ้ามีสิทธิ์ editTask (แก้ไขได้ทุก task) หรือมีสิทธิ์ editOwnTask "และ" เป็นผู้รับผิดชอบของ task นั้นเอง
    // ถ้าไม่มีทั้งสองสิทธิ์นี้เลย แก้ไขข้อมูลไม่ได้แม้เป็นผู้รับผิดชอบ — ความรับผิดชอบต่อ task แม่ ไม่นับต่อมาถึง subtask
    function canEditThisTask(task: Task) {
        return canEditTask || (canEditOwnTask && isAssigneeOf(task, currentUserId));
    }

    // เปลี่ยนสถานะต้องมีสิทธิ์ชัดเจนเสมอ ไม่มี bypass อัตโนมัติแบบเดิมอีกต่อไป
    // task กับ subtask ใช้บิตคนละคู่กัน — ความรับผิดชอบต่อ task แม่ ไม่นับต่อมาถึง subtask
    function canChangeThisTaskStatus(task: Task) {
        const isSubtask = !!task.task_parent_id;
        const canAll = isSubtask ? canChangeSubtaskStatus : canChangeTaskStatus;
        const canOwn = isSubtask ? canChangeOwnSubtaskStatus : canChangeOwnTaskStatus;
        return canAll || (canOwn && isAssigneeOf(task, currentUserId));
    }

    // สิทธิ์ปัญหาแยกบิต task/subtask กันเต็มรูปแบบ ไม่ใช้ร่วมกัน (ต่างจาก task/subtask ปกติ) — "ของตัวเอง" คือเป็นผู้รับผิดชอบของ task/subtask นั้น
    function canAddIssueTo(task: Task) {
        const isSubtask = !!task.task_parent_id;
        const canAll = isSubtask ? canAddIssueSubtask : canAddIssueTask;
        const canOwn = isSubtask ? canAddOwnIssueSubtask : canAddOwnIssueTask;
        return canAll || (canOwn && isAssigneeOf(task, currentUserId));
    }

    function canEditIssuesOf(task: Task) {
        const isSubtask = !!task.task_parent_id;
        const canAll = isSubtask ? canEditIssueSubtask : canEditIssueTask;
        const canOwn = isSubtask ? canEditOwnIssueSubtask : canEditOwnIssueTask;
        return canAll || (canOwn && isAssigneeOf(task, currentUserId));
    }

    function canDeleteIssuesOf(task: Task) {
        const isSubtask = !!task.task_parent_id;
        const canAll = isSubtask ? canDeleteIssueSubtask : canDeleteIssueTask;
        const canOwn = isSubtask ? canDeleteOwnIssueSubtask : canDeleteOwnIssueTask;
        return canAll || (canOwn && isAssigneeOf(task, currentUserId));
    }

    function canChangeIssueStatusOf(task: Task) {
        const isSubtask = !!task.task_parent_id;
        const canAll = isSubtask ? canChangeIssueStatusSubtask : canChangeIssueStatusTask;
        const canOwn = isSubtask ? canChangeOwnIssueStatusSubtask : canChangeOwnIssueStatusTask;
        return canAll || (canOwn && isAssigneeOf(task, currentUserId));
    }

    async function handleStatusChange(task: Task, task_status: TaskStatus) {
        const res = await fetch(`${api}/projects/${id}/tasks/${task.task_id}/status`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", ...authHeader() },
            body: JSON.stringify({ task_status }),
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            toast.error(data.message ?? "เปลี่ยนสถานะไม่สำเร็จ");
            return;
        }
        toast.success("อัปเดตสถานะสำเร็จ");
        await loadAll(id as string);
    }

    // รับ task/subtask เอง (เฉพาะโปรเจกต์ agile) — ใครก็รับได้ ไม่ต้องมีสิทธิ์ assign เช็คแค่ยังไม่มีคนรับ (ทำที่ backend อีกชั้น)
    async function handleClaimTask(task: Task) {
        const res = await fetch(`${api}/projects/${id}/tasks/${task.task_id}/claim`, {
            method: "POST",
            headers: authHeader(),
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            toast.error(data.message ?? "รับงานไม่สำเร็จ");
            return;
        }
        toast.success("รับงานสำเร็จ");
        await loadAll(id as string);
    }

    function openCreateTask(parent?: Task) {
        setEditingTask(null);
        setParentTask(parent ?? null);
        setTaskForm(EMPTY_TASK_FORM);
        setTaskFormError(null);
        setTaskModalOpen(true);
    }

    async function openEditTask(task: Task) {
        const res = await fetch(`${api}/projects/${id}/tasks/${task.task_id}`, { headers: authHeader() });
        if (!res.ok) { toast.error("โหลดข้อมูล task ไม่สำเร็จ"); return; }
        const data = await res.json();
        setEditingTask(task);
        setParentTask(null);
        setTaskForm({
            task_title: data.task_title ?? "",
            task_description: data.task_description ?? "",
            assignee_ids: (data.assignees as TaskAssignee[] ?? []).map((a) => a.user_id),
            task_start_date: toDateInputValue(data.task_start_date),
            task_due_date: toDateInputValue(data.task_due_date),
            task_weight: String(data.task_weight ?? 1),
        });
        setTaskFormError(null);
        setTaskModalOpen(true);
    }

    function closeTaskDetail() {
        setDetailTask(null);
        setIssueFormOpen(false);
        setEditingIssue(null);
        setChatOpen(false);
        setChatMessages([]);
        setChatText("");
        setChatNewImages([]);
        setReplyingToChat(null);
        setIssueRepliesByIssue({});
        setReplyNewImagesByIssue({});
    }

    async function loadIssues(taskId: string) {
        const res = await fetch(`${api}/projects/${id}/tasks/${taskId}/issues`, { headers: authHeader() });
        if (!res.ok) return;
        const data = await res.json();
        setDetailIssues(data.data ?? []);
    }

    // โหลดเธรดตอบกลับของทุกปัญหาใน task นี้พร้อมกันทีเดียว (เธรดแสดงตลอดไม่ต้องกดขยายทีละปัญหา) — endpoint นี้ mark-read ให้ทุกปัญหาในคราวเดียว
    async function loadAllIssueReplies(taskId: string) {
        const res = await fetch(`${api}/projects/${id}/tasks/${taskId}/issues/replies`, { headers: authHeader() });
        if (!res.ok) return;
        const data = await res.json();
        setIssueRepliesByIssue(data.data ?? {});
    }

    // รีโหลดเธรดของปัญหาเดียว (ใช้หลังส่งข้อความตอบกลับใหม่) ไม่ใช้ตัว batch เพราะแค่ต้องการรีเฟรชปัญหาเดียวที่เพิ่งตอบไป
    async function loadIssueReplies(issueId: string) {
        const res = await fetch(`${api}/projects/${id}/issues/${issueId}/replies`, { headers: authHeader() });
        if (!res.ok) return;
        const data = await res.json();
        setIssueRepliesByIssue((prev) => ({ ...prev, [issueId]: data.data ?? [] }));
    }

    function handlePickReplyImages(issueId: string, files: FileList | null) {
        if (!files) return;
        const picked = Array.from(files);
        const current = replyNewImagesByIssue[issueId] ?? [];
        const remaining = MAX_ISSUE_REPLY_IMAGES - current.length;
        if (remaining <= 0) {
            toast.error(`แนบรูปได้สูงสุด ${MAX_ISSUE_REPLY_IMAGES} รูปต่อการตอบกลับ`);
            return;
        }
        setReplyNewImagesByIssue((prev) => ({ ...prev, [issueId]: [...current, ...picked.slice(0, remaining)] }));
    }

    async function handleSendReply(e: React.FormEvent<HTMLFormElement>, issueId: string) {
        e.preventDefault();
        const text = (replyDrafts[issueId] ?? "").trim();
        const images = replyNewImagesByIssue[issueId] ?? [];
        if (!text && images.length === 0) return;

        setIsSendingReply(true);
        try {
            const fd = new FormData();
            if (text) fd.append("reply_text", text);
            for (const file of images) fd.append("images", file);

            const res = await fetch(`${api}/projects/${id}/issues/${issueId}/replies`, {
                method: "POST",
                headers: authHeader(),
                body: fd,
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                toast.error(data.message ?? "ส่งข้อความตอบกลับไม่สำเร็จ");
                return;
            }
            setReplyDrafts((prev) => ({ ...prev, [issueId]: "" }));
            setReplyNewImagesByIssue((prev) => ({ ...prev, [issueId]: [] }));
            await loadIssueReplies(issueId);
        } finally {
            setIsSendingReply(false);
        }
    }

    async function loadChatMessages(taskId: string) {
        const res = await fetch(`${api}/projects/${id}/tasks/${taskId}/chat`, { headers: authHeader() });
        if (!res.ok) return;
        const data = await res.json();
        setChatMessages(data.data ?? []);
        // ดึงข้อความสำเร็จ = backend mark-read ให้แล้ว เคลียร์ badge ฝั่ง state ทันทีแบบ optimistic ไม่ต้องรอ loadAll
        setTasks((prev) => prev.map((t) => (t.task_id === taskId ? { ...t, unread_chat_count: 0 } : t)));
    }

    async function openTaskDetail(task: Task) {
        setDetailLoading(true);
        setChatOpen(false);
        setChatMessages([]);
        setChatText("");
        setChatNewImages([]);
        setReplyingToChat(null);
        setIssueRepliesLoading(true);
        try {
            const [res] = await Promise.all([
                fetch(`${api}/projects/${id}/tasks/${task.task_id}`, { headers: authHeader() }),
                loadIssues(task.task_id),
                loadAllIssueReplies(task.task_id),
            ]);
            if (!res.ok) { toast.error("โหลดข้อมูล task ไม่สำเร็จ"); return; }
            const data = await res.json();
            setDetailTask(data);
        } finally {
            setDetailLoading(false);
            setIssueRepliesLoading(false);
        }
    }

    function openAddIssue() {
        setEditingIssue(null);
        setIssueForm(EMPTY_ISSUE_FORM);
        setIssueFormError(null);
        setIssueKeepImageIds([]);
        setIssueNewImages([]);
        setIssueTagQuery("");
        setIssueTagResults([]);
        setIssueFormOpen(true);
    }

    function openEditIssue(issue: Issue) {
        setEditingIssue(issue);
        setIssueForm({ issue_title: issue.issue_title, issue_description: issue.issue_description ?? "", tagged_users: issue.tags });
        setIssueFormError(null);
        setIssueKeepImageIds(issue.images.map((img) => img.image_id));
        setIssueNewImages([]);
        setIssueTagQuery("");
        setIssueTagResults([]);
        setIssueFormOpen(true);
    }

    function totalIssueImageCount() {
        return issueKeepImageIds.length + issueNewImages.length;
    }

    function handlePickIssueImages(files: FileList | null) {
        if (!files) return;
        // ต้องแปลงเป็น array ตรงนี้ทันที (ไม่ใช่ในตัว updater ของ setState) เพราะ caller จะเคลียร์
        // e.target.value = "" ทันทีหลังเรียกฟังก์ชันนี้ ถ้ายังอ้าง FileList เดิมอยู่ตอน React ค่อยรัน
        // updater จริง จะได้ FileList ว่างเปล่าไปแทน (input ถูกเคลียร์ไปแล้ว)
        const picked = Array.from(files);
        const remaining = MAX_ISSUE_IMAGES - totalIssueImageCount();
        if (remaining <= 0) {
            toast.error(`แนบรูปได้สูงสุด ${MAX_ISSUE_IMAGES} รูปต่อปัญหา`);
            return;
        }
        setIssueNewImages((prev) => [...prev, ...picked.slice(0, remaining)]);
    }

    async function handleIssueSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!issueForm.issue_title.trim()) { setIssueFormError("กรุณากรอกชื่อปัญหา"); return; }
        if (!detailTask) return;

        setIsSavingIssue(true);
        try {
            const url = editingIssue
                ? `${api}/projects/${id}/issues/${editingIssue.issue_id}`
                : `${api}/projects/${id}/tasks/${detailTask.task_id}/issues`;
            const fd = new FormData();
            fd.append("issue_title", issueForm.issue_title.trim());
            fd.append("issue_description", issueForm.issue_description.trim());
            fd.append("tagged_user_ids", JSON.stringify(issueForm.tagged_users.map((u) => u.user_id)));
            if (editingIssue) fd.append("keep_image_ids", JSON.stringify(issueKeepImageIds));
            for (const file of issueNewImages) fd.append("images", file);

            const res = await fetch(url, {
                method: editingIssue ? "PUT" : "POST",
                headers: authHeader(),
                body: fd,
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setIssueFormError(data.message ?? "บันทึกไม่สำเร็จ");
                return;
            }
            toast.success(editingIssue ? "แก้ไขปัญหาสำเร็จ" : "เพิ่มปัญหาสำเร็จ");
            setIssueFormOpen(false);
            await loadIssues(detailTask.task_id);
        } finally {
            setIsSavingIssue(false);
        }
    }

    async function handleToggleIssueStatus(issue: Issue) {
        if (!detailTask) return;
        const issue_status: IssueStatus = issue.issue_status === "open" ? "resolved" : "open";
        const res = await fetch(`${api}/projects/${id}/issues/${issue.issue_id}/status`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", ...authHeader() },
            body: JSON.stringify({ issue_status }),
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            toast.error(data.message ?? "เปลี่ยนสถานะไม่สำเร็จ");
            return;
        }
        await loadIssues(detailTask.task_id);
        // ใช้ loadAll แทนการ patch tasks state เอง เพราะถ้า detailTask เป็น subtask ต้องอัปเดต
        // subtask_open_issue_count ของ task แม่ในตารางหลักด้วย ไม่ใช่แค่ open_issue_count ของตัวมันเอง
        await loadAll(id as string);
    }

    async function handleDeleteIssue() {
        if (!detailTask || !deleteIssueTarget) return;
        setIsDeletingIssue(true);
        try {
            const res = await fetch(`${api}/projects/${id}/issues/${deleteIssueTarget.issue_id}`, {
                method: "DELETE",
                headers: authHeader(),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                toast.error(data.message ?? "ลบไม่สำเร็จ");
                return;
            }
            toast.success("ลบปัญหาสำเร็จ");
            await loadIssues(detailTask.task_id);
            // เหมือน handleToggleIssueStatus — ใช้ loadAll เพราะอาจต้องอัปเดต subtask_open_issue_count ของ task แม่ด้วย
            if (deleteIssueTarget.issue_status === "open") await loadAll(id as string);
        } finally {
            setIsDeletingIssue(false);
            setDeleteIssueTarget(null);
        }
    }

    function handlePickChatImages(files: FileList | null) {
        if (!files) return;
        // แปลงเป็น array ทันทีเหมือน handlePickIssueImages — กัน FileList ถูกเคลียร์ก่อน setState updater ทำงานจริง
        const picked = Array.from(files);
        const remaining = MAX_CHAT_IMAGES - chatNewImages.length;
        if (remaining <= 0) {
            toast.error(`แนบรูปได้สูงสุด ${MAX_CHAT_IMAGES} รูปต่อข้อความ`);
            return;
        }
        setChatNewImages((prev) => [...prev, ...picked.slice(0, remaining)]);
    }

    async function handleSendChat(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!detailTask) return;
        if (!chatText.trim() && chatNewImages.length === 0) return;

        setIsSendingChat(true);
        try {
            const fd = new FormData();
            fd.append("message_text", chatText.trim());
            if (replyingToChat) fd.append("reply_to_message_id", replyingToChat.message_id);
            for (const file of chatNewImages) fd.append("images", file);

            const res = await fetch(`${api}/projects/${id}/tasks/${detailTask.task_id}/chat`, {
                method: "POST",
                headers: authHeader(),
                body: fd,
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                toast.error(data.message ?? "ส่งข้อความไม่สำเร็จ");
                return;
            }
            setChatText("");
            setChatNewImages([]);
            setReplyingToChat(null);
            await loadChatMessages(detailTask.task_id);
        } finally {
            setIsSendingChat(false);
        }
    }

    function handleChatComposerKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
        }
    }

    function closeProjectChat() {
        setProjectChatOpen(false);
        setProjectChatMessages([]);
        setProjectChatText("");
        setProjectChatNewImages([]);
        setReplyingToProjectChat(null);
    }

    async function loadProjectChatMessages() {
        if (!id) return;
        const res = await fetch(`${api}/projects/${id}/chat`, { headers: authHeader() });
        if (!res.ok) return;
        const data = await res.json();
        setProjectChatMessages(data.data ?? []);
        // ดึงข้อความสำเร็จ = backend mark-read ให้แล้ว เคลียร์ badge ฝั่ง state ทันทีแบบ optimistic เหมือน loadChatMessages
        setProject((prev) => (prev ? { ...prev, unread_chat_count: 0 } : prev));
    }

    function handlePickProjectChatImages(files: FileList | null) {
        if (!files) return;
        const picked = Array.from(files);
        const remaining = MAX_CHAT_IMAGES - projectChatNewImages.length;
        if (remaining <= 0) {
            toast.error(`แนบรูปได้สูงสุด ${MAX_CHAT_IMAGES} รูปต่อข้อความ`);
            return;
        }
        setProjectChatNewImages((prev) => [...prev, ...picked.slice(0, remaining)]);
    }

    async function handleSendProjectChat(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!id) return;
        if (!projectChatText.trim() && projectChatNewImages.length === 0) return;

        setIsSendingProjectChat(true);
        try {
            const fd = new FormData();
            fd.append("message_text", projectChatText.trim());
            if (replyingToProjectChat) fd.append("reply_to_message_id", replyingToProjectChat.message_id);
            for (const file of projectChatNewImages) fd.append("images", file);

            const res = await fetch(`${api}/projects/${id}/chat`, {
                method: "POST",
                headers: authHeader(),
                body: fd,
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                toast.error(data.message ?? "ส่งข้อความไม่สำเร็จ");
                return;
            }
            setProjectChatText("");
            setProjectChatNewImages([]);
            setReplyingToProjectChat(null);
            await loadProjectChatMessages();
        } finally {
            setIsSendingProjectChat(false);
        }
    }

    function handleProjectChatComposerKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
        }
    }

    function handleTaskSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!taskForm.task_title.trim()) { setTaskFormError("กรุณากรอกชื่องาน"); return; }
        setTaskFormError(null);

        startTransition(async () => {
            const url = editingTask
                ? `${api}/projects/${id}/tasks/${editingTask.task_id}`
                : `${api}/projects/${id}/tasks`;
            const task_weight = project?.project_use_task_weight ? (Number(taskForm.task_weight) || 1) : 1;
            const body = editingTask
                ? { ...taskForm, task_weight }
                : { ...taskForm, task_weight, task_parent_id: parentTask?.task_id ?? null };
            const res = await fetch(url, {
                method: editingTask ? "PUT" : "POST",
                headers: { "Content-Type": "application/json", ...authHeader() },
                body: JSON.stringify(body),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) { setTaskFormError(data.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่"); return; }

            toast.success(editingTask ? "แก้ไข task สำเร็จ" : "เพิ่ม task สำเร็จ");
            setTaskModalOpen(false);
            await loadAll(id as string);
        });
    }

    async function handleDeleteTask() {
        if (!deleteTaskTarget) return;
        setIsDeletingTask(true);
        try {
            const res = await fetch(`${api}/projects/${id}/tasks/${deleteTaskTarget.task_id}`, {
                method: "DELETE", headers: authHeader(),
            });
            if (res.ok) {
                toast.success("ลบ task สำเร็จ");
                await loadAll(id as string);
            } else {
                const data = await res.json().catch(() => ({}));
                toast.error(data.message ?? "ลบไม่สำเร็จ กรุณาลองใหม่");
            }
        } finally {
            setIsDeletingTask(false);
            setDeleteTaskTarget(null);
        }
    }

    function openAddMember() {
        setEditingMember(null);
        setMemberForm({ user_id: "", position_ids: [] });
        setMemberFormError(null);
        setMemberModalOpen(true);
    }

    function openEditMemberPositions(member: Member) {
        setEditingMember(member);
        setMemberForm({ user_id: member.user_id, position_ids: member.positions.map((p) => p.position_id) });
        setMemberFormError(null);
        setMemberModalOpen(true);
    }

    function toggleMemberPosition(positionId: string) {
        setMemberForm((prev) => ({
            ...prev,
            position_ids: prev.position_ids.includes(positionId)
                ? prev.position_ids.filter((p) => p !== positionId)
                : [...prev.position_ids, positionId],
        }));
    }

    function handleMemberSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!editingMember && !memberForm.user_id) { setMemberFormError("กรุณาเลือกผู้ใช้งาน"); return; }
        setMemberFormError(null);

        startTransition(async () => {
            const res = editingMember
                ? await fetch(`${api}/projects/${id}/members/${editingMember.project_member_id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json", ...authHeader() },
                    body: JSON.stringify({ position_ids: memberForm.position_ids }),
                })
                : await fetch(`${api}/projects/${id}/members`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", ...authHeader() },
                    body: JSON.stringify(memberForm),
                });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) { setMemberFormError(data.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่"); return; }

            toast.success(editingMember ? "แก้ไขตำแหน่งสำเร็จ" : "เพิ่มสมาชิกสำเร็จ");
            setMemberModalOpen(false);
            await loadAll(id as string);
        });
    }

    async function handleRemoveMember() {
        if (!removeMemberTarget) return;
        setIsRemovingMember(true);
        try {
            const res = await fetch(`${api}/projects/${id}/members/${removeMemberTarget.project_member_id}`, {
                method: "DELETE", headers: authHeader(),
            });
            if (res.ok) {
                toast.success("นำสมาชิกออกสำเร็จ");
                await loadAll(id as string);
            } else {
                const data = await res.json().catch(() => ({}));
                toast.error(data.message ?? "ดำเนินการไม่สำเร็จ");
            }
        } finally {
            setIsRemovingMember(false);
            setRemoveMemberTarget(null);
        }
    }

    async function handleDeleteProject() {
        setIsDeletingProject(true);
        try {
            const res = await fetch(`${api}/projects/${id}`, { method: "DELETE", headers: authHeader() });
            if (res.ok) {
                toast.success("ลบโปรเจกต์สำเร็จ");
                router.push("/projects");
                return;
            }
            const data = await res.json().catch(() => ({}));
            toast.error(data.message ?? "ลบไม่สำเร็จ");
        } finally {
            setIsDeletingProject(false);
            setDeleteProjectConfirm(false);
        }
    }

    async function handleToggleShare() {
        if (!project) return;
        const next = !project.project_share_enabled;
        const res = await fetch(`${api}/projects/${id}/share/toggle`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", ...authHeader() },
            body: JSON.stringify({ project_share_enabled: next }),
        });
        if (res.ok) {
            setProject({ ...project, project_share_enabled: next ? 1 : 0 });
            toast.success(next ? "เปิดใช้งานลิงก์แล้ว" : "ปิดใช้งานลิงก์แล้ว");
        } else {
            toast.error("อัปเดตไม่สำเร็จ กรุณาลองใหม่");
        }
    }

    async function handleToggleTaskWeight() {
        if (!project) return;
        const next = !project.project_use_task_weight;
        const res = await fetch(`${api}/projects/${id}/task-weight/toggle`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", ...authHeader() },
            body: JSON.stringify({ project_use_task_weight: next }),
        });
        if (res.ok) {
            setProject({ ...project, project_use_task_weight: next ? 1 : 0 });
            toast.success(next ? "เปิดใช้งานระบบถ่วงน้ำหนักแล้ว" : "ปิดใช้งานระบบถ่วงน้ำหนักแล้ว");
        } else {
            toast.error("อัปเดตไม่สำเร็จ กรุณาลองใหม่");
        }
    }

    async function handleRegenerateLink() {
        setIsRegeneratingLink(true);
        try {
            const res = await fetch(`${api}/projects/${id}/share/regenerate`, { method: "PUT", headers: authHeader() });
            const data = await res.json().catch(() => ({}));
            if (res.ok && project) {
                setProject({ ...project, project_share_token: data.project_share_token });
                toast.success("สร้างลิงก์ใหม่สำเร็จ");
            } else {
                toast.error(data.message ?? "สร้างลิงก์ใหม่ไม่สำเร็จ");
            }
        } finally {
            setIsRegeneratingLink(false);
        }
    }

    function handleCopyLink() {
        if (!project) return;
        const url = `${window.location.origin}/share/${project.project_share_token}`;
        navigator.clipboard.writeText(url);
        setCopyFeedback(true);
        setTimeout(() => setCopyFeedback(false), 1500);
    }

    function openShareEmailModal() {
        if (!project) return;
        if (!project.project_share_enabled) {
            toast.error("กรุณาเปิดใช้งานลิงก์สำหรับลูกค้าก่อนส่งอีเมล");
            return;
        }
        setShareEmailForm({ to: project.client_email ?? "", message: "" });
        setShareEmailError(null);
        setShareEmailModalOpen(true);
    }

    async function handleSendShareEmail(e: React.FormEvent) {
        e.preventDefault();
        setShareEmailError(null);
        if (!shareEmailForm.to.trim()) {
            setShareEmailError("กรุณากรอกอีเมลผู้รับ");
            return;
        }
        setIsSendingShareEmail(true);
        try {
            const res = await fetch(`${api}/projects/${id}/share/send-email`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...authHeader() },
                body: JSON.stringify({ to: shareEmailForm.to.trim(), message: shareEmailForm.message.trim() }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                toast.success("ส่งลิงก์ให้ลูกค้าทางอีเมลแล้ว");
                setShareEmailModalOpen(false);
            } else {
                setShareEmailError(data.message ?? "ส่งอีเมลไม่สำเร็จ กรุณาลองใหม่");
            }
        } catch {
            setShareEmailError("เกิดข้อผิดพลาด กรุณาลองใหม่");
        } finally {
            setIsSendingShareEmail(false);
        }
    }

    if (!id || notFound) return <p className="p-6 text-gray-500">ไม่พบโปรเจกต์นี้</p>;
    if (!project) return <p className="p-6 text-gray-400">กำลังโหลด...</p>;

    const shareUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/share/${project.project_share_token}`;

    // ตารางหลักโชว์แค่ task ระดับบนสุด — ต้องกดเข้าไปดูรายละเอียดถึงจะเห็น subtask
    const topLevelTasks = tasks.filter((t) => t.task_parent_id === null);
    const visibleTasks = showOnlyMyTasks
        ? topLevelTasks.filter((t) => t.assignees.some((a) => a.user_id === currentUserId))
        : topLevelTasks;

    // ภาพรวม Agile — นับจาก tasks ที่โหลดมาแล้วในหน้านี้เลย ไม่ต้องยิง request แยก
    const agileSubtasks = tasks.filter((t) => t.task_parent_id !== null);
    const agileClaimedTaskCount = topLevelTasks.filter((t) => t.assignees.length > 0).length;
    const agileUnclaimedTaskCount = topLevelTasks.length - agileClaimedTaskCount;
    const agileClaimedSubtaskCount = agileSubtasks.filter((t) => t.assignees.length > 0).length;
    const agileUnclaimedSubtaskCount = agileSubtasks.length - agileClaimedSubtaskCount;
    const agileOverviewList = agileOverviewTab === "task" ? topLevelTasks
        : agileOverviewTab === "subtask" ? agileSubtasks
        : tasks;
    const agileParentNameById = Object.fromEntries(topLevelTasks.map((t) => [t.task_id, t.task_title]));

    const taskColumns: Column<Task>[] = [
        {
            key: "task_title",
            header: "ชื่องาน",
            render: (v, row) => (
                <button
                    type="button"
                    onClick={() => openTaskDetail(row)}
                    className="text-left hover:text-blue-600 hover:underline"
                >
                    {v as string}
                </button>
            ),
        },
        {
            key: "open_issue_count",
            header: "ปัญหา",
            render: (_v, row) => {
                if (!row.open_issue_count && !row.subtask_open_issue_count) return <span className="text-gray-300">-</span>;
                return (
                    <div className="flex items-center gap-1">
                        <IssueCountBadge count={row.open_issue_count} color="red" />
                        <IssueCountBadge count={row.subtask_open_issue_count} color="blue" />
                    </div>
                );
            },
        },
        {
            key: "unread_chat_count",
            header: "แชท",
            render: (_v, row) => {
                if (!row.unread_chat_count) return <span className="text-gray-300">-</span>;
                return <ChatUnreadBadge count={row.unread_chat_count} />;
            },
        },
        {
            key: "assignees",
            header: "ผู้รับผิดชอบ",
            render: (v, row) => {
                const list = v as TaskAssignee[];
                if (list.length) return list.map((a) => a.user_fullname).join(", ");
                if (project.project_type === "agile") {
                    return (
                        <button
                            type="button"
                            onClick={() => handleClaimTask(row)}
                            className="text-xs font-medium text-blue-600 border border-blue-200 rounded-full px-2.5 py-1 hover:bg-blue-50"
                        >
                            รับงาน
                        </button>
                    );
                }
                return "-";
            },
        },
        {
            key: "task_status",
            header: "สถานะ",
            render: (v, row) => {
                const status = v as TaskStatus;
                const canChange = canChangeThisTaskStatus(row);
                if (!canChange) {
                    return <span className={TASK_STATUS_COLOR[status]}>{TASK_STATUS_LABEL[status]}</span>;
                }
                return (
                    <select
                        value={status}
                        onChange={(e) => handleStatusChange(row, e.target.value as TaskStatus)}
                        className="text-sm border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    >
                        {TASK_STATUS_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                );
            },
        },
        {
            key: "task_id",
            header: "ความคืบหน้า",
            className: "min-w-[140px]",
            render: (_v, row) => <ProgressBar percent={getTaskProgress(row).percent} />,
        },
        ...(project.project_use_task_weight ? [{ key: "task_weight", header: "น้ำหนัก" } as Column<Task>] : []),
        { key: "task_start_date", header: "วันเริ่ม", render: (v) => formatDateOnly(v) },
        { key: "task_due_date", header: "ครบกำหนด", render: (v) => formatDateOnly(v) },
    ];

    const memberColumns: Column<Member>[] = [
        { key: "user_fullname", header: "ชื่อ" },
        {
            key: "positions",
            header: "ตำแหน่ง",
            render: (v) => {
                const list = v as MemberPosition[];
                if (!list.length) return <span className="text-gray-400">-</span>;
                return (
                    <div className="flex flex-wrap gap-1">
                        {list.map((p) => (
                            <span key={p.position_id} className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
                                {p.position_name}
                            </span>
                        ))}
                    </div>
                );
            },
        },
    ];

    return (
        <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
            {/* หัวข้อ + ข้อมูลโปรเจกต์ */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <h1 className="text-xl sm:text-2xl font-bold text-gray-800">{project.project_name}</h1>
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full bg-gray-50 ${STATUS_COLOR[project.project_status]}`}>
                                {STATUS_LABEL[project.project_status]}
                            </span>
                            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-50 text-gray-500">
                                {project.project_type === "agile" ? "Agile" : "Waterfall"}
                            </span>
                        </div>
                        {project.client_name && <p className="text-sm text-gray-500 mt-1">ลูกค้า: {project.client_name}</p>}
                        {project.project_description && (
                            <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">{project.project_description}</p>
                        )}
                    </div>
                    <div className="flex gap-2 shrink-0">
                        <button
                            type="button"
                            onClick={() => setProjectChatOpen(true)}
                            className="flex items-center gap-1.5 px-4 py-2 text-sm text-blue-600 border border-blue-200 rounded hover:bg-blue-50"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-3.75 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 12c0 4.556-4.365 8.25-9.75 8.25a10.4 10.4 0 0 1-2.573-.317c-.478.457-1.68 1.457-3.328 1.827-.244.055-.443-.187-.351-.42.198-.501.556-1.396.669-2.293C4.276 17.641 3 15.03 3 12c0-4.556 4.365-8.25 9.75-8.25S21.75 7.444 21.75 12Z" />
                            </svg>
                            แชทโปรเจกต์
                            <ChatUnreadBadge count={project.unread_chat_count} />
                        </button>
                        {canEditProjectInfo && (
                            <EditButton onClick={() => router.push(`/projects/edit?id=${id}`)}>แก้ไข</EditButton>
                        )}
                        {canDeleteProject && (
                            <DeleteButton onClick={() => setDeleteProjectConfirm(true)}>ลบ</DeleteButton>
                        )}
                    </div>
                </div>

                <ProgressBar percent={Number(project.project_progress_percent)} />

                <div className="flex flex-wrap gap-x-8 gap-y-1 text-sm text-gray-500">
                    <span>วันเริ่ม: {formatDateOnly(project.project_start_date)}</span>
                    <span>ครบกำหนด: {formatDateOnly(project.project_due_date)}</span>
                    <span>สมาชิก: {members.length} คน</span>
                </div>
            </div>

            {/* ลิงก์สำหรับลูกค้า */}
            {canManageShareLink && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-3">
                    <div className="flex items-center justify-between">
                        <h2 className="text-base font-semibold text-gray-800">ลิงก์สำหรับลูกค้า</h2>
                        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={!!project.project_share_enabled}
                                onChange={handleToggleShare}
                                className="w-4 h-4 accent-blue-500"
                            />
                            เปิดใช้งาน
                        </label>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                        <Input readOnly value={shareUrl} className="flex-1 bg-gray-50 text-gray-500" />
                        <div className="flex gap-2 shrink-0">
                            <Button type="button" onClick={handleCopyLink}>{copyFeedback ? "คัดลอกแล้ว" : "คัดลอก"}</Button>
                            <button
                                type="button"
                                onClick={openShareEmailModal}
                                className="px-4 py-2 text-sm text-blue-600 border border-blue-200 rounded hover:bg-blue-50"
                            >
                                ส่งให้ลูกค้าทางอีเมล
                            </button>
                            <button
                                type="button"
                                onClick={handleRegenerateLink}
                                disabled={isRegeneratingLink}
                                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
                            >
                                {isRegeneratingLink ? "กำลังสร้าง..." : "สร้างลิงก์ใหม่"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ภาพรวม Agile — เฉพาะโปรเจกต์ agile: สรุปว่ามีงานทั้งหมดกี่ชิ้น รับไปแล้ว/ยังไม่มีคนรับกี่ชิ้น แยก task/subtask */}
            {project.project_type === "agile" && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
                    <h2 className="text-base font-semibold text-gray-800">ภาพรวม Agile</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="rounded-lg border border-gray-100 p-3">
                            <p className="text-xs text-gray-400">ทั้งหมด (Task + Subtask)</p>
                            <p className="text-xl font-semibold text-gray-800">{topLevelTasks.length + agileSubtasks.length}</p>
                        </div>
                        <div className="rounded-lg border border-gray-100 p-3">
                            <p className="text-xs text-gray-400">Task ทั้งหมด</p>
                            <p className="text-xl font-semibold text-gray-800">{topLevelTasks.length}</p>
                        </div>
                        <div className="rounded-lg border border-gray-100 p-3">
                            <p className="text-xs text-gray-400">Subtask ทั้งหมด</p>
                            <p className="text-xl font-semibold text-gray-800">{agileSubtasks.length}</p>
                        </div>
                        <div />
                        <div className="rounded-lg border border-green-100 bg-green-50/50 p-3">
                            <p className="text-xs text-green-600">Task ที่รับแล้ว</p>
                            <p className="text-xl font-semibold text-green-700">{agileClaimedTaskCount}</p>
                        </div>
                        <div className="rounded-lg border border-green-100 bg-green-50/50 p-3">
                            <p className="text-xs text-green-600">Subtask ที่รับแล้ว</p>
                            <p className="text-xl font-semibold text-green-700">{agileClaimedSubtaskCount}</p>
                        </div>
                        <div className="rounded-lg border border-amber-100 bg-amber-50/50 p-3">
                            <p className="text-xs text-amber-600">Task ที่ยังไม่มีคนรับ</p>
                            <p className="text-xl font-semibold text-amber-700">{agileUnclaimedTaskCount}</p>
                        </div>
                        <div className="rounded-lg border border-amber-100 bg-amber-50/50 p-3">
                            <p className="text-xs text-amber-600">Subtask ที่ยังไม่มีคนรับ</p>
                            <p className="text-xl font-semibold text-amber-700">{agileUnclaimedSubtaskCount}</p>
                        </div>
                    </div>

                    <div className="flex text-xs rounded-lg border border-gray-200 overflow-hidden w-fit">
                        {(["all", "task", "subtask"] as const).map((t) => (
                            <button
                                key={t}
                                type="button"
                                onClick={() => setAgileOverviewTab(t)}
                                className={`px-3 py-1.5 font-medium transition-colors ${
                                    agileOverviewTab === t ? "bg-blue-500 text-white" : "bg-white text-gray-500 hover:bg-gray-50"
                                }`}
                            >
                                {t === "all" ? "ทั้งหมด" : t === "task" ? "Task" : "Subtask"}
                            </button>
                        ))}
                    </div>

                    {agileOverviewList.length === 0 ? (
                        <p className="text-sm text-gray-400">ยังไม่มีรายการ</p>
                    ) : (
                        <ul className="divide-y divide-gray-50 rounded-lg border border-gray-100 overflow-hidden max-h-96 overflow-y-auto">
                            {agileOverviewList.map((t) => {
                                const isSubtask = !!t.task_parent_id;
                                const isClaimed = t.assignees.length > 0;
                                return (
                                    <li key={t.task_id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                                        <button
                                            type="button"
                                            onClick={() => openTaskDetail(t)}
                                            className="flex-1 min-w-0 text-left"
                                        >
                                            <p className="text-sm text-gray-700 hover:underline truncate">
                                                {t.task_title}
                                                {isSubtask && t.task_parent_id && agileParentNameById[t.task_parent_id] && (
                                                    <span className="text-gray-400"> — subtask ของ {agileParentNameById[t.task_parent_id]}</span>
                                                )}
                                            </p>
                                        </button>
                                        <span className="flex items-center gap-2 shrink-0">
                                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${isSubtask ? "bg-blue-50 text-blue-600" : "bg-gray-100 text-gray-500"}`}>
                                                {isSubtask ? "Subtask" : "Task"}
                                            </span>
                                            {isClaimed ? (
                                                <span className="text-xs text-green-600 truncate max-w-[140px]">
                                                    {t.assignees.map((a) => a.user_fullname).join(", ")}
                                                </span>
                                            ) : (
                                                <span className="text-xs font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">
                                                    ยังไม่มีคนรับ
                                                </span>
                                            )}
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            )}

            {/* งาน */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                    <h2 className="text-base font-semibold text-gray-800">งาน (Task)</h2>
                    <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={showOnlyMyTasks}
                                onChange={(e) => setShowOnlyMyTasks(e.target.checked)}
                                className="w-4 h-4 accent-blue-500"
                            />
                            แสดงเฉพาะ task ที่ตัวเองรับผิดชอบ
                        </label>
                        {canEditProjectInfo && (
                            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={!!project.project_use_task_weight}
                                    onChange={handleToggleTaskWeight}
                                    className="w-4 h-4 accent-blue-500"
                                />
                                ถ่วงน้ำหนัก task
                            </label>
                        )}
                        {canAddTask && <Button onClick={() => openCreateTask()}>เพิ่ม Task</Button>}
                    </div>
                </div>
                <DataTable
                    columns={taskColumns}
                    data={visibleTasks}
                    rowKey="task_id"
                    pageSize={-1}
                    loading={isPending && tasks.length === 0}
                    emptyMessage={showOnlyMyTasks ? "ไม่มี task ที่คุณรับผิดชอบ" : "ยังไม่มี task ในโปรเจกต์นี้"}
                    actions={(row) => (
                        <div className="flex items-center gap-2 justify-end">
                            {canEditThisTask(row) && <EditButton onClick={() => openEditTask(row)} />}
                            {canDeleteTask && <DeleteButton onClick={() => setDeleteTaskTarget(row)} />}
                        </div>
                    )}
                />
            </div>

            {/* สมาชิก */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold text-gray-800">สมาชิกโปรเจกต์</h2>
                    {canManageMembers && <Button onClick={openAddMember}>เพิ่มสมาชิก</Button>}
                </div>
                <DataTable
                    columns={memberColumns}
                    data={members}
                    rowKey="project_member_id"
                    emptyMessage="ยังไม่มีสมาชิกในโปรเจกต์นี้"
                    actions={(row) => (
                        <div className="flex items-center gap-2 justify-end">
                            {canManageMembers && <EditButton onClick={() => openEditMemberPositions(row)}>ตำแหน่ง</EditButton>}
                            {canManageMembers && <DeleteButton onClick={() => setRemoveMemberTarget(row)} />}
                        </div>
                    )}
                />
            </div>

            {/* ประวัติกิจกรรม */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
                <h2 className="text-base font-semibold text-gray-800">ประวัติกิจกรรม</h2>
                {activity.length === 0 ? (
                    <p className="text-sm text-gray-400">ยังไม่มีกิจกรรม</p>
                ) : (
                    <ul className="space-y-3 max-h-96 overflow-y-auto">
                        {activity.map((entry) => (
                            <li key={entry.log_id} className="text-sm border-l-2 border-blue-100 pl-3">
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
                                </p>
                                <p className="text-xs text-gray-400">{formatDate(entry.log_created_at)}</p>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {/* Modal เพิ่ม/แก้ไข Task */}
            {taskModalOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
                    onClick={() => setTaskModalOpen(false)}
                >
                    <div
                        className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6 space-y-4 max-h-[90vh] overflow-y-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h2 className="text-lg font-semibold text-gray-800">
                            {editingTask ? "แก้ไข Task" : parentTask ? "เพิ่ม Subtask" : "เพิ่ม Task"}
                        </h2>
                        {parentTask && (
                            <p className="text-sm text-gray-500 -mt-2">
                                ของ Task: <span className="font-medium">{parentTask.task_title}</span>
                            </p>
                        )}
                        <form onSubmit={handleTaskSubmit} className="space-y-4">
                            <div className="flex flex-col gap-1">
                                <label className="text-sm font-medium text-gray-700">ชื่องาน</label>
                                <Input
                                    value={taskForm.task_title}
                                    onChange={(e) => setTaskForm((p) => ({ ...p, task_title: e.target.value }))}
                                    required
                                />
                            </div>

                            <div className="flex flex-col gap-1">
                                <label className="text-sm font-medium text-gray-700">รายละเอียด</label>
                                <textarea
                                    value={taskForm.task_description}
                                    onChange={(e) => setTaskForm((p) => ({ ...p, task_description: e.target.value }))}
                                    rows={3}
                                    className="px-4 py-2 border rounded focus:outline-none focus:ring-2 border-gray-300 focus:border-blue-400 focus:ring-blue-500/20"
                                />
                            </div>

                            <div className="flex flex-col gap-1">
                                <label className="text-sm font-medium text-gray-700 mb-2">ผู้รับผิดชอบ (เลือกได้หลายคน)</label>
                                <div className="rounded-lg border border-gray-100 divide-y divide-gray-50 overflow-hidden max-h-40 overflow-y-auto">
                                    {members.length === 0 ? (
                                        <p className="px-4 py-2.5 text-sm text-gray-400">ยังไม่มีสมาชิกในโปรเจกต์นี้</p>
                                    ) : (
                                        members.map((m) => (
                                            <label
                                                key={m.user_id}
                                                className="flex items-center gap-3 cursor-pointer px-4 py-2.5 hover:bg-blue-50"
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={taskForm.assignee_ids.includes(m.user_id)}
                                                    onChange={() => setTaskForm((p) => ({
                                                        ...p,
                                                        assignee_ids: p.assignee_ids.includes(m.user_id)
                                                            ? p.assignee_ids.filter((uid) => uid !== m.user_id)
                                                            : [...p.assignee_ids, m.user_id],
                                                    }))}
                                                    className="w-4 h-4 accent-blue-500"
                                                />
                                                <span className="text-sm text-gray-700">{m.user_fullname}</span>
                                            </label>
                                        ))
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="flex flex-col gap-1">
                                    <label className="text-sm font-medium text-gray-700">วันเริ่ม</label>
                                    <Input
                                        type="date"
                                        value={taskForm.task_start_date}
                                        onChange={(e) => setTaskForm((p) => ({ ...p, task_start_date: e.target.value }))}
                                    />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-sm font-medium text-gray-700">วันครบกำหนด</label>
                                    <Input
                                        type="date"
                                        value={taskForm.task_due_date}
                                        onChange={(e) => setTaskForm((p) => ({ ...p, task_due_date: e.target.value }))}
                                    />
                                </div>
                            </div>

                            {!!project.project_use_task_weight && (
                                <div className="flex flex-col gap-1">
                                    <label className="text-sm font-medium text-gray-700">น้ำหนัก (ถ่วง % ความคืบหน้า)</label>
                                    <Input
                                        type="number"
                                        min={1}
                                        value={taskForm.task_weight}
                                        onChange={(e) => setTaskForm((p) => ({ ...p, task_weight: e.target.value }))}
                                    />
                                </div>
                            )}

                            {taskFormError && <p className="text-sm text-red-600">{taskFormError}</p>}

                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setTaskModalOpen(false)}
                                    className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
                                >
                                    ยกเลิก
                                </button>
                                <Button type="submit" disabled={isPending}>
                                    {isPending ? "กำลังบันทึก..." : "บันทึก"}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal รายละเอียด Task */}
            {(detailTask || detailLoading) && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
                    onClick={closeTaskDetail}
                >
                    <div
                        className={`bg-white rounded-2xl shadow-xl w-full mx-4 max-h-[90vh] flex overflow-hidden ${chatOpen ? "max-w-4xl" : "max-w-lg"}`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {detailLoading || !detailTask ? (
                            <p className="text-sm text-gray-400 p-6">กำลังโหลด...</p>
                        ) : (
                            <>
                            <div className="flex-1 min-w-0 p-6 space-y-4 overflow-y-auto">
                                <div className="flex items-start gap-4">
                                    {!detailTask.task_parent_id && (() => {
                                        const progress = getTaskProgress(detailTask);
                                        return (
                                            <div className="flex flex-col items-center gap-1 shrink-0">
                                                <CircularProgress percent={progress.percent} />
                                                {progress.total > 0 && (
                                                    <span className="text-[11px] text-gray-400 whitespace-nowrap">
                                                        {progress.done}/{progress.total} subtasks
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    })()}

                                    <div className="flex-1 min-w-0 space-y-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <h2 className="text-lg font-semibold text-gray-800">{detailTask.task_title}</h2>
                                            <div className="flex items-center gap-2 shrink-0">
                                                {canChangeThisTaskStatus(detailTask) ? (
                                                    <select
                                                        value={detailTask.task_status}
                                                        onChange={async (e) => {
                                                            const task_status = e.target.value as TaskStatus;
                                                            await handleStatusChange(detailTask, task_status);
                                                            setDetailTask((prev) => (prev ? { ...prev, task_status } : prev));
                                                        }}
                                                        className="text-sm border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                                    >
                                                        {TASK_STATUS_OPTIONS.map((opt) => (
                                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full bg-gray-50 ${TASK_STATUS_COLOR[detailTask.task_status]}`}>
                                                        {TASK_STATUS_LABEL[detailTask.task_status]}
                                                    </span>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => setChatOpen((v) => !v)}
                                                    className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-full border transition-colors ${
                                                        chatOpen
                                                            ? "bg-blue-500 border-blue-500 text-white"
                                                            : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                                                    }`}
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-3.5 h-3.5">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8-1.06 0-2.077-.162-3.02-.46L3 21l1.532-4.083C3.564 15.66 3 13.887 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8Z" />
                                                    </svg>
                                                    แชท
                                                    <ChatUnreadBadge count={tasks.find((t) => t.task_id === detailTask.task_id)?.unread_chat_count ?? 0} />
                                                </button>
                                            </div>
                                        </div>

                                        {detailTask.task_description && (
                                            <p className="text-sm text-gray-600 whitespace-pre-wrap">{detailTask.task_description}</p>
                                        )}

                                        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm text-gray-600">
                                            <span>ผู้รับผิดชอบ: {detailTask.assignees.length ? detailTask.assignees.map((a) => a.user_fullname).join(", ") : "-"}</span>
                                            {!!project.project_use_task_weight && <span>น้ำหนัก: {detailTask.task_weight}</span>}
                                            <span>วันเริ่ม: {formatDateOnly(detailTask.task_start_date)}</span>
                                            <span>ครบกำหนด: {formatDateOnly(detailTask.task_due_date)}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* subtask ไม่มี subtask ของตัวเองได้อีก (จำกัดไว้แค่ 1 ชั้น) เลยไม่ต้องโชว์ section นี้เลยตอนดูรายละเอียด subtask */}
                                {!detailTask.task_parent_id && (
                                    <>
                                        <hr className="border-gray-100" />

                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <h3 className="text-sm font-semibold text-gray-700">Subtasks</h3>
                                                {canAddSubtaskTo(detailTask) && (
                                                    <button
                                                        type="button"
                                                        onClick={() => { const parent = detailTask; closeTaskDetail(); openCreateTask(parent); }}
                                                        className="text-xs text-blue-600 hover:underline"
                                                    >
                                                        + เพิ่ม Subtask
                                                    </button>
                                                )}
                                            </div>
                                            {(() => {
                                                const children = tasks.filter((t) => t.task_parent_id === detailTask.task_id);
                                                if (children.length === 0) {
                                                    return <p className="text-sm text-gray-400">ยังไม่มี subtask</p>;
                                                }
                                                return (
                                                    <ul className="divide-y divide-gray-50 rounded-lg border border-gray-100 overflow-hidden">
                                                        {children.map((c) => (
                                                            <li key={c.task_id} className="flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-blue-50">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => openTaskDetail(c)}
                                                                    className="flex-1 min-w-0 text-left text-sm text-gray-700 hover:underline truncate"
                                                                >
                                                                    {c.task_title}
                                                                </button>
                                                                <span className="flex items-center gap-2 shrink-0">
                                                                    <IssueCountBadge count={c.open_issue_count} color="blue" />
                                                                    <ChatUnreadBadge count={c.unread_chat_count} />
                                                                    {c.assignees.length === 0 && project.project_type === "agile" ? (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleClaimTask(c)}
                                                                            className="text-xs font-medium text-blue-600 border border-blue-200 rounded-full px-2 py-0.5 hover:bg-blue-50"
                                                                        >
                                                                            รับงาน
                                                                        </button>
                                                                    ) : c.assignees.length > 0 ? (
                                                                        <span className="text-xs text-gray-400 truncate max-w-[100px]">
                                                                            {c.assignees.map((a) => a.user_fullname).join(", ")}
                                                                        </span>
                                                                    ) : null}
                                                                    <span className={`text-xs ${TASK_STATUS_COLOR[c.task_status]}`}>
                                                                        {TASK_STATUS_LABEL[c.task_status]}
                                                                    </span>
                                                                </span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                );
                                            })()}
                                        </div>
                                    </>
                                )}

                                <hr className="border-gray-100" />

                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-sm font-semibold text-gray-700">ปัญหา</h3>
                                        {canAddIssueTo(detailTask) && !issueFormOpen && (
                                            <button type="button" onClick={openAddIssue} className="text-xs text-blue-600 hover:underline">
                                                + แจ้งปัญหา
                                            </button>
                                        )}
                                    </div>

                                    {issueFormOpen && (
                                        <form onSubmit={handleIssueSubmit} className="space-y-2 bg-gray-50 border border-gray-100 rounded-lg p-3">
                                            <Input
                                                value={issueForm.issue_title}
                                                onChange={(e) => setIssueForm((p) => ({ ...p, issue_title: e.target.value }))}
                                                placeholder="ชื่อปัญหา"
                                                required
                                            />
                                            <textarea
                                                value={issueForm.issue_description}
                                                onChange={(e) => setIssueForm((p) => ({ ...p, issue_description: e.target.value }))}
                                                rows={2}
                                                placeholder="รายละเอียด (ไม่บังคับ)"
                                                className="w-full px-3 py-2 text-sm border rounded focus:outline-none focus:ring-2 border-gray-300 focus:border-blue-400 focus:ring-blue-500/20"
                                            />

                                            <div className="space-y-1">
                                                <label className="text-xs font-medium text-gray-600">แท็กคน (@)</label>
                                                {issueForm.tagged_users.length > 0 && (
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {issueForm.tagged_users.map((u) => (
                                                            <span
                                                                key={u.user_id}
                                                                className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full"
                                                            >
                                                                @{u.user_fullname}
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setIssueForm((p) => ({
                                                                        ...p,
                                                                        tagged_users: p.tagged_users.filter((t) => t.user_id !== u.user_id),
                                                                    }))}
                                                                    className="text-blue-400 hover:text-red-600"
                                                                >
                                                                    ×
                                                                </button>
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                                <div className="relative">
                                                    <input
                                                        type="text"
                                                        value={issueTagQuery}
                                                        onChange={(e) => { setIssueTagQuery(e.target.value); setIssueTagDropdownOpen(true); }}
                                                        onFocus={() => { if (issueTagBlurTimer.current) clearTimeout(issueTagBlurTimer.current); setIssueTagDropdownOpen(true); }}
                                                        onBlur={() => { issueTagBlurTimer.current = setTimeout(() => setIssueTagDropdownOpen(false), 150); }}
                                                        placeholder="พิมพ์ @ ตามด้วยชื่อเพื่อแท็กคน..."
                                                        className="w-full px-3 py-2 text-sm border rounded focus:outline-none focus:ring-2 border-gray-300 focus:border-blue-400 focus:ring-blue-500/20"
                                                    />
                                                    {issueTagDropdownOpen && issueTagQuery.trim() && (
                                                        <div className="absolute z-10 mt-1 w-full bg-white rounded-lg shadow-lg border border-gray-100 max-h-40 overflow-y-auto">
                                                            {issueTagResults.length === 0 ? (
                                                                <p className="px-3 py-2 text-xs text-gray-400">ไม่พบผู้ใช้งาน</p>
                                                            ) : (
                                                                issueTagResults.map((u) => (
                                                                    <button
                                                                        key={u.user_id}
                                                                        type="button"
                                                                        onClick={() => {
                                                                            if (issueTagBlurTimer.current) clearTimeout(issueTagBlurTimer.current);
                                                                            setIssueForm((p) => ({ ...p, tagged_users: [...p.tagged_users, u] }));
                                                                            setIssueTagQuery("");
                                                                            setIssueTagResults([]);
                                                                            setIssueTagDropdownOpen(false);
                                                                        }}
                                                                        className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                                                                    >
                                                                        @{u.user_fullname}
                                                                    </button>
                                                                ))
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="space-y-1.5">
                                                <div className="flex items-center justify-between">
                                                    <label className="text-xs font-medium text-gray-600">รูปแนบ</label>
                                                    <span className="text-[11px] text-gray-400">{totalIssueImageCount()}/{MAX_ISSUE_IMAGES}</span>
                                                </div>
                                                {(editingIssue?.images.some((img) => issueKeepImageIds.includes(img.image_id)) || issueNewImages.length > 0) && (
                                                    <div className="flex flex-wrap gap-2">
                                                        {editingIssue?.images
                                                            .filter((img) => issueKeepImageIds.includes(img.image_id))
                                                            .map((img) => (
                                                                <div key={img.image_id} className="relative w-16 h-16 shrink-0">
                                                                    <Image
                                                                        src={`${SERVER_BASE}${img.image_url}`}
                                                                        alt=""
                                                                        width={64}
                                                                        height={64}
                                                                        unoptimized
                                                                        className="w-16 h-16 object-cover rounded border border-gray-200"
                                                                    />
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setIssueKeepImageIds((prev) => prev.filter((i) => i !== img.image_id))}
                                                                        className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center rounded-full bg-gray-700 text-white text-[10px] leading-none hover:bg-red-600"
                                                                    >
                                                                        ×
                                                                    </button>
                                                                </div>
                                                            ))}
                                                        {issueNewImages.map((file, idx) => (
                                                            <div key={idx} className="relative w-16 h-16 shrink-0">
                                                                <Image
                                                                    src={URL.createObjectURL(file)}
                                                                    alt=""
                                                                    width={64}
                                                                    height={64}
                                                                    unoptimized
                                                                    className="w-16 h-16 object-cover rounded border border-gray-200"
                                                                />
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setIssueNewImages((prev) => prev.filter((_, i) => i !== idx))}
                                                                    className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center rounded-full bg-gray-700 text-white text-[10px] leading-none hover:bg-red-600"
                                                                >
                                                                    ×
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                {totalIssueImageCount() < MAX_ISSUE_IMAGES && (
                                                    <input
                                                        type="file"
                                                        accept="image/*"
                                                        multiple
                                                        onChange={(e) => { handlePickIssueImages(e.target.files); e.target.value = ""; }}
                                                        className="text-xs text-gray-500 file:mr-2 file:px-2 file:py-1 file:rounded file:border-0 file:bg-blue-50 file:text-blue-600 file:text-xs hover:file:bg-blue-100"
                                                    />
                                                )}
                                            </div>

                                            {issueFormError && <p className="text-xs text-red-600">{issueFormError}</p>}
                                            <div className="flex justify-end gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setIssueFormOpen(false)}
                                                    className="px-3 py-1.5 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
                                                >
                                                    ยกเลิก
                                                </button>
                                                <Button type="submit" disabled={isSavingIssue}>
                                                    {isSavingIssue ? "กำลังบันทึก..." : editingIssue ? "บันทึก" : "แจ้งปัญหา"}
                                                </Button>
                                            </div>
                                        </form>
                                    )}

                                    {detailIssues.length === 0 ? (
                                        <p className="text-sm text-gray-400">ยังไม่มีปัญหาที่แจ้งไว้</p>
                                    ) : (
                                        <ul className="divide-y divide-gray-50 rounded-lg border border-gray-100 overflow-hidden">
                                            {detailIssues.map((issue) => (
                                                <li key={issue.issue_id} className="px-4 py-2.5 space-y-1">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-medium text-gray-700">{issue.issue_title}</p>
                                                            {issue.issue_description && (
                                                                <p className="text-xs text-gray-500 whitespace-pre-wrap mt-0.5">{issue.issue_description}</p>
                                                            )}
                                                            {issue.images.length > 0 && (
                                                                <div className="flex flex-wrap gap-1.5 mt-1.5">
                                                                    {issue.images.map((img) => (
                                                                        <button
                                                                            key={img.image_id}
                                                                            type="button"
                                                                            onClick={() => window.open(`${SERVER_BASE}${img.image_url}`, "_blank")}
                                                                        >
                                                                            <Image
                                                                                src={`${SERVER_BASE}${img.image_url}`}
                                                                                alt=""
                                                                                width={48}
                                                                                height={48}
                                                                                unoptimized
                                                                                className="w-12 h-12 object-cover rounded border border-gray-200 hover:opacity-80"
                                                                            />
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            )}
                                                            {issue.tags.length > 0 && (
                                                                <div className="flex flex-wrap gap-1 mt-1.5">
                                                                    {issue.tags.map((t) => (
                                                                        <span
                                                                            key={t.user_id}
                                                                            className="text-[11px] font-medium text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded-full"
                                                                        >
                                                                            @{t.user_fullname}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                            <p className="text-[11px] text-gray-400 mt-1">
                                                                {issue.created_by_name ?? "ผู้ใช้งานที่ถูกลบ"} · {formatDate(issue.issue_created_at)}
                                                            </p>
                                                        </div>
                                                        <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${ISSUE_STATUS_COLOR[issue.issue_status]}`}>
                                                            {ISSUE_STATUS_LABEL[issue.issue_status]}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-3 pt-1">
                                                        {canChangeIssueStatusOf(detailTask) && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleToggleIssueStatus(issue)}
                                                                className="text-xs text-blue-600 hover:underline"
                                                            >
                                                                {issue.issue_status === "open" ? "ทำเครื่องหมายว่าแก้ไขแล้ว" : "เปิดใหม่"}
                                                            </button>
                                                        )}
                                                        {canEditIssuesOf(detailTask) && (
                                                            <button
                                                                type="button"
                                                                onClick={() => openEditIssue(issue)}
                                                                className="text-xs text-gray-500 hover:underline"
                                                            >
                                                                แก้ไข
                                                            </button>
                                                        )}
                                                        {canDeleteIssuesOf(detailTask) && (
                                                            <button
                                                                type="button"
                                                                onClick={() => setDeleteIssueTarget(issue)}
                                                                className="text-xs text-red-500 hover:underline"
                                                            >
                                                                ลบ
                                                            </button>
                                                        )}
                                                    </div>

                                                    {(() => {
                                                        const replies = issueRepliesByIssue[issue.issue_id] ?? [];
                                                        const newImages = replyNewImagesByIssue[issue.issue_id] ?? [];
                                                        return (
                                                        <div className="mt-2 pl-3 border-l-2 border-gray-100 space-y-2">
                                                            {issueRepliesLoading ? (
                                                                <p className="text-xs text-gray-400">กำลังโหลด...</p>
                                                            ) : replies.length === 0 ? (
                                                                <p className="text-xs text-gray-400">ยังไม่มีการตอบกลับ</p>
                                                            ) : (
                                                                replies.map((reply) => (
                                                                    <div key={reply.reply_id} className="flex items-start gap-2">
                                                                        <Image
                                                                            src={reply.user_avatar_url ? `${SERVER_BASE}${reply.user_avatar_url}` : "/defult.png"}
                                                                            alt=""
                                                                            width={20}
                                                                            height={20}
                                                                            unoptimized={!!reply.user_avatar_url}
                                                                            className="w-5 h-5 rounded-full object-cover border border-gray-200 shrink-0 mt-0.5"
                                                                        />
                                                                        <div className="min-w-0">
                                                                            <p className="text-xs text-gray-700">
                                                                                <span className="font-medium">{reply.user_fullname ?? "ผู้ใช้งานที่ถูกลบ"}</span>{" "}
                                                                                <span className="text-gray-400">{formatDate(reply.reply_created_at)}</span>
                                                                            </p>
                                                                            {reply.reply_text && (
                                                                                <p className="text-xs text-gray-600 whitespace-pre-wrap">{reply.reply_text}</p>
                                                                            )}
                                                                            {reply.images.length > 0 && (
                                                                                <div className="flex flex-wrap gap-1.5 mt-1">
                                                                                    {reply.images.map((img) => (
                                                                                        <button
                                                                                            key={img.image_id}
                                                                                            type="button"
                                                                                            onClick={() => window.open(`${SERVER_BASE}${img.image_url}`, "_blank")}
                                                                                        >
                                                                                            <Image
                                                                                                src={`${SERVER_BASE}${img.image_url}`}
                                                                                                alt=""
                                                                                                width={40}
                                                                                                height={40}
                                                                                                unoptimized
                                                                                                className="w-10 h-10 object-cover rounded border border-gray-200 hover:opacity-80"
                                                                                            />
                                                                                        </button>
                                                                                    ))}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                ))
                                                            )}
                                                            <form
                                                                onSubmit={(e) => handleSendReply(e, issue.issue_id)}
                                                                className="space-y-1.5 pt-1"
                                                            >
                                                                {newImages.length > 0 && (
                                                                    <div className="flex flex-wrap gap-1.5">
                                                                        {newImages.map((file, idx) => (
                                                                            <div key={idx} className="relative w-10 h-10">
                                                                                <Image
                                                                                    src={URL.createObjectURL(file)}
                                                                                    alt=""
                                                                                    width={40}
                                                                                    height={40}
                                                                                    unoptimized
                                                                                    className="w-10 h-10 object-cover rounded border border-gray-200"
                                                                                />
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => setReplyNewImagesByIssue((prev) => ({
                                                                                        ...prev,
                                                                                        [issue.issue_id]: (prev[issue.issue_id] ?? []).filter((_, i) => i !== idx),
                                                                                    }))}
                                                                                    className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] leading-none"
                                                                                >
                                                                                    ×
                                                                                </button>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                                <div className="flex items-center gap-2">
                                                                    <label className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg border border-gray-300 text-gray-400 hover:text-blue-500 hover:border-blue-400 cursor-pointer">
                                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                                                                        </svg>
                                                                        <input
                                                                            type="file"
                                                                            accept="image/*"
                                                                            multiple
                                                                            className="hidden"
                                                                            onChange={(e) => { handlePickReplyImages(issue.issue_id, e.target.files); e.target.value = ""; }}
                                                                        />
                                                                    </label>
                                                                    <input
                                                                        type="text"
                                                                        value={replyDrafts[issue.issue_id] ?? ""}
                                                                        onChange={(e) =>
                                                                            setReplyDrafts((prev) => ({ ...prev, [issue.issue_id]: e.target.value }))
                                                                        }
                                                                        placeholder="พิมพ์ข้อความตอบกลับ..."
                                                                        className="flex-1 px-2.5 py-1.5 text-xs border rounded focus:outline-none focus:ring-2 border-gray-300 focus:border-blue-400 focus:ring-blue-500/20"
                                                                    />
                                                                    <button
                                                                        type="submit"
                                                                        disabled={isSendingReply || (!(replyDrafts[issue.issue_id] ?? "").trim() && newImages.length === 0)}
                                                                        className="shrink-0 px-3 py-1.5 text-xs font-medium text-white bg-blue-500 rounded hover:bg-blue-600 disabled:opacity-40"
                                                                    >
                                                                        ส่ง
                                                                    </button>
                                                                </div>
                                                            </form>
                                                        </div>
                                                        );
                                                    })()}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>

                                <hr className="border-gray-100" />

                                <div className="space-y-2">
                                    <h3 className="text-sm font-semibold text-gray-700">ประวัติ</h3>
                                    {(() => {
                                        const taskActivity = activity.filter((e) => e.task_id === detailTask.task_id);
                                        if (taskActivity.length === 0) {
                                            return <p className="text-sm text-gray-400">ยังไม่มีประวัติ</p>;
                                        }
                                        return (
                                            <ul className="space-y-2 max-h-40 overflow-y-auto">
                                                {taskActivity.map((entry) => (
                                                    <li key={entry.log_id} className="text-sm border-l-2 border-blue-100 pl-3">
                                                        <p className="text-gray-700">
                                                            <span className="font-medium">{entry.log_fullname ?? "ผู้ใช้งานที่ถูกลบ"}</span>
                                                            {" "}{ACTION_LABEL[entry.log_action]}
                                                            {entry.log_action === "status_changed" && entry.log_old_value && entry.log_new_value && (
                                                                <>
                                                                    {" "}({TASK_STATUS_LABEL[entry.log_old_value as TaskStatus] ?? entry.log_old_value}
                                                                    {" → "}
                                                                    {TASK_STATUS_LABEL[entry.log_new_value as TaskStatus] ?? entry.log_new_value})
                                                                </>
                                                            )}
                                                        </p>
                                                        <p className="text-xs text-gray-400">{formatDate(entry.log_created_at)}</p>
                                                    </li>
                                                ))}
                                            </ul>
                                        );
                                    })()}
                                </div>

                                <div className="flex items-center justify-between pt-2">
                                    <div className="flex items-center gap-2">
                                        {canEditThisTask(detailTask) && (
                                            <EditButton onClick={() => { const t = detailTask; closeTaskDetail(); openEditTask(t); }}>แก้ไข</EditButton>
                                        )}
                                        {canDeleteTask && (
                                            <DeleteButton onClick={() => { const t = detailTask; closeTaskDetail(); setDeleteTaskTarget(t); }} />
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={closeTaskDetail}
                                        className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
                                    >
                                        ปิด
                                    </button>
                                </div>
                            </div>

                            {chatOpen && (
                                <div className="w-[320px] shrink-0 border-l border-gray-100 flex flex-col">
                                    <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between shrink-0">
                                        <h3 className="text-sm font-semibold text-gray-700">แชท</h3>
                                        <button
                                            type="button"
                                            onClick={() => setChatOpen(false)}
                                            className="text-gray-400 hover:text-gray-600"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>

                                    <div ref={chatListRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                                        {chatMessages.length === 0 ? (
                                            <p className="text-sm text-gray-400 text-center pt-6">ยังไม่มีข้อความ</p>
                                        ) : (
                                            chatMessages.map((msg) => {
                                                const isOwn = msg.user_id === currentUserId;
                                                const avatarSrc = msg.user_avatar_url ? `${SERVER_BASE}${msg.user_avatar_url}` : "/defult.png";
                                                const avatar = (
                                                    <Image
                                                        src={avatarSrc}
                                                        alt=""
                                                        width={28}
                                                        height={28}
                                                        unoptimized={!!msg.user_avatar_url}
                                                        className="w-7 h-7 rounded-full object-cover border border-gray-200 shrink-0"
                                                    />
                                                );
                                                const bubble = (
                                                    <div className={`max-w-[75%] rounded-2xl px-3 py-2 ${isOwn ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-800"}`}>
                                                        {!isOwn && (
                                                            <p className="text-[11px] font-medium text-gray-500 mb-0.5">
                                                                {msg.user_fullname ?? "ผู้ใช้งานที่ถูกลบ"}
                                                            </p>
                                                        )}
                                                        {msg.reply_to_message_id && (
                                                            <button
                                                                type="button"
                                                                onClick={() => scrollToChatMessage(msg.reply_to_message_id!)}
                                                                className={`block w-full text-left mb-1 pl-2 border-l-2 rounded ${
                                                                    isOwn ? "border-blue-200 bg-blue-400/30" : "border-gray-300 bg-white/60"
                                                                }`}
                                                            >
                                                                <p className={`text-[11px] font-medium ${isOwn ? "text-blue-50" : "text-gray-600"}`}>
                                                                    {msg.reply_to_user_fullname ?? "ผู้ใช้งานที่ถูกลบ"}
                                                                </p>
                                                                <p className={`text-[11px] truncate ${isOwn ? "text-blue-100" : "text-gray-500"}`}>
                                                                    {msg.reply_to_text ? truncateReplyPreview(msg.reply_to_text) : msg.reply_to_image_count > 0 ? "[รูปภาพ]" : ""}
                                                                </p>
                                                            </button>
                                                        )}
                                                        {msg.message_text && (
                                                            <p className="text-sm whitespace-pre-wrap wrap-break-word">{msg.message_text}</p>
                                                        )}
                                                        {msg.images.length > 0 && (
                                                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                                                                {msg.images.map((img) => (
                                                                    <button
                                                                        key={img.image_id}
                                                                        type="button"
                                                                        onClick={() => window.open(`${SERVER_BASE}${img.image_url}`, "_blank")}
                                                                    >
                                                                        <Image
                                                                            src={`${SERVER_BASE}${img.image_url}`}
                                                                            alt=""
                                                                            width={96}
                                                                            height={96}
                                                                            unoptimized
                                                                            className="w-20 h-20 object-cover rounded-lg"
                                                                        />
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        )}
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <p className={`text-[10px] ${isOwn ? "text-blue-100" : "text-gray-400"}`}>
                                                                {formatDate(msg.message_created_at)}
                                                            </p>
                                                            <button
                                                                type="button"
                                                                onClick={() => setReplyingToChat(msg)}
                                                                className={`text-[10px] font-medium hover:underline ${isOwn ? "text-blue-100" : "text-gray-400"}`}
                                                            >
                                                                ตอบกลับ
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                                return (
                                                    <div
                                                        key={msg.message_id}
                                                        id={`chat-msg-${msg.message_id}`}
                                                        className={`flex items-end gap-2 rounded-lg transition-shadow ${isOwn ? "justify-end" : "justify-start"}`}
                                                    >
                                                        {isOwn ? (<>{bubble}{avatar}</>) : (<>{avatar}{bubble}</>)}
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>

                                    <form onSubmit={handleSendChat} className="border-t border-gray-100 p-3 space-y-2 shrink-0">
                                        {replyingToChat && (
                                            <div className="flex items-start justify-between gap-2 pl-2 border-l-2 border-blue-400 bg-blue-50 rounded px-2 py-1.5">
                                                <div className="min-w-0">
                                                    <p className="text-[11px] font-medium text-blue-600">
                                                        ตอบกลับ {replyingToChat.user_fullname ?? "ผู้ใช้งานที่ถูกลบ"}
                                                    </p>
                                                    <p className="text-xs text-gray-500 truncate">
                                                        {replyingToChat.message_text
                                                            ? truncateReplyPreview(replyingToChat.message_text)
                                                            : replyingToChat.images.length > 0 ? "[รูปภาพ]" : ""}
                                                    </p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setReplyingToChat(null)}
                                                    className="shrink-0 text-gray-400 hover:text-gray-600"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-3.5 h-3.5">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                                                    </svg>
                                                </button>
                                            </div>
                                        )}
                                        {chatNewImages.length > 0 && (
                                            <div className="flex flex-wrap gap-2">
                                                {chatNewImages.map((file, idx) => (
                                                    <div key={idx} className="relative w-12 h-12 shrink-0">
                                                        <Image
                                                            src={URL.createObjectURL(file)}
                                                            alt=""
                                                            width={48}
                                                            height={48}
                                                            unoptimized
                                                            className="w-12 h-12 object-cover rounded border border-gray-200"
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => setChatNewImages((prev) => prev.filter((_, i) => i !== idx))}
                                                            className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center rounded-full bg-gray-700 text-white text-[10px] leading-none hover:bg-red-600"
                                                        >
                                                            ×
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        <div className="flex items-end gap-2">
                                            <textarea
                                                value={chatText}
                                                onChange={(e) => setChatText(e.target.value)}
                                                onKeyDown={handleChatComposerKeyDown}
                                                rows={1}
                                                placeholder="พิมพ์ข้อความ..."
                                                className="flex-1 resize-none px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 border-gray-300 focus:border-blue-400 focus:ring-blue-500/20"
                                            />
                                            <label className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50 cursor-pointer">
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                                                </svg>
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    multiple
                                                    className="hidden"
                                                    onChange={(e) => { handlePickChatImages(e.target.files); e.target.value = ""; }}
                                                />
                                            </label>
                                            <button
                                                type="submit"
                                                disabled={isSendingChat || (!chatText.trim() && chatNewImages.length === 0)}
                                                className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-40"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                                                    <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
                                                </svg>
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            )}
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Modal เพิ่ม/แก้ไขสมาชิก */}
            {memberModalOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
                    onClick={() => setMemberModalOpen(false)}
                >
                    <div
                        className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4 max-h-[90vh] overflow-y-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h2 className="text-lg font-semibold text-gray-800">
                            {editingMember ? "แก้ไขตำแหน่งสมาชิก" : "เพิ่มสมาชิก"}
                        </h2>
                        <form onSubmit={handleMemberSubmit} className="space-y-4">
                            {editingMember ? (
                                <p className="text-sm text-gray-600">
                                    ผู้ใช้งาน: <span className="font-medium">{editingMember.user_fullname}</span>
                                </p>
                            ) : (
                                <div className="flex flex-col gap-1">
                                    <label className="text-sm font-medium text-gray-700 mb-1">ผู้ใช้งาน</label>
                                    <SearchableSelect
                                        loadOptions={(search) => loadUserOptions(search, members.map((m) => m.user_id))}
                                        value={memberForm.user_id}
                                        onChange={(v) => setMemberForm((p) => ({ ...p, user_id: v }))}
                                        placeholder="— เลือกผู้ใช้งาน —"
                                    />
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">ตำแหน่งในโปรเจกต์นี้</label>
                                <div className="rounded-lg border border-gray-100 divide-y divide-gray-50 overflow-hidden">
                                    {positions.map((pos) => (
                                        <label
                                            key={pos.position_id}
                                            className="flex items-center gap-3 cursor-pointer px-4 py-2.5 hover:bg-blue-50"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={memberForm.position_ids.includes(pos.position_id)}
                                                onChange={() => toggleMemberPosition(pos.position_id)}
                                                className="w-4 h-4 accent-blue-500"
                                            />
                                            <span className="text-sm text-gray-700">{pos.position_name}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {memberFormError && <p className="text-sm text-red-600">{memberFormError}</p>}

                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setMemberModalOpen(false)}
                                    className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
                                >
                                    ยกเลิก
                                </button>
                                <Button type="submit" disabled={isPending}>
                                    {isPending ? "กำลังบันทึก..." : "บันทึก"}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal ส่งลิงก์ให้ลูกค้าทางอีเมล */}
            {shareEmailModalOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
                    onClick={() => setShareEmailModalOpen(false)}
                >
                    <div
                        className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4 max-h-[90vh] overflow-y-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 0 0 2.22 0L21 8M5 19h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2Z" />
                                </svg>
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold text-gray-800">ส่งลิงก์ให้ลูกค้าทางอีเมล</h2>
                                <p className="text-sm text-gray-500">ลูกค้าจะได้รับลิงก์ติดตามความคืบหน้าของ &ldquo;{project.project_name}&rdquo; แบบดูอย่างเดียว ไม่ต้องเข้าสู่ระบบ</p>
                            </div>
                        </div>

                        <form onSubmit={handleSendShareEmail} className="space-y-4">
                            <div className="flex flex-col gap-1">
                                <label className="text-sm font-medium text-gray-700">อีเมลผู้รับ</label>
                                <Input
                                    type="email"
                                    value={shareEmailForm.to}
                                    onChange={(e) => setShareEmailForm((p) => ({ ...p, to: e.target.value }))}
                                    placeholder="client@example.com"
                                    required
                                />
                                {!project.client_email && (
                                    <p className="text-xs text-amber-600">ยังไม่มีอีเมลลูกค้าในระบบ กรุณากรอกอีเมลเอง</p>
                                )}
                            </div>

                            <div className="flex flex-col gap-1">
                                <label className="text-sm font-medium text-gray-700">ข้อความถึงลูกค้า (ไม่บังคับ)</label>
                                <textarea
                                    value={shareEmailForm.message}
                                    onChange={(e) => setShareEmailForm((p) => ({ ...p, message: e.target.value }))}
                                    rows={3}
                                    placeholder="เช่น อัปเดตความคืบหน้าล่าสุดของโปรเจกต์ให้ทราบครับ"
                                    className="px-4 py-2 border rounded focus:outline-none focus:ring-2 border-gray-300 focus:border-blue-400 focus:ring-blue-500/20"
                                />
                            </div>

                            <div className="rounded-lg bg-gray-50 border border-gray-100 p-3 space-y-1.5">
                                <p className="text-xs font-medium text-gray-500">ข้อมูลที่จะแนบไปในอีเมล</p>
                                <div className="flex items-center justify-between text-sm text-gray-600">
                                    <span>ความคืบหน้าปัจจุบัน</span>
                                    <span className="font-medium text-gray-800">{Number(project.project_progress_percent)}%</span>
                                </div>
                                <div className="flex items-center justify-between text-sm text-gray-600">
                                    <span>วันครบกำหนด</span>
                                    <span className="font-medium text-gray-800">{formatDateOnly(project.project_due_date)}</span>
                                </div>
                                <div className="pt-1 text-xs text-gray-400 break-all">{shareUrl}</div>
                            </div>

                            {shareEmailError && <p className="text-sm text-red-600">{shareEmailError}</p>}

                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShareEmailModalOpen(false)}
                                    className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
                                >
                                    ยกเลิก
                                </button>
                                <Button type="submit" disabled={isSendingShareEmail}>
                                    {isSendingShareEmail ? "กำลังส่ง..." : "ส่งอีเมล"}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {projectChatOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
                    onClick={closeProjectChat}
                >
                    <div
                        className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 h-[80vh] max-h-150 flex flex-col overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between shrink-0">
                            <h3 className="text-sm font-semibold text-gray-700 truncate">แชทโปรเจกต์ · {project.project_name}</h3>
                            <button
                                type="button"
                                onClick={closeProjectChat}
                                className="text-gray-400 hover:text-gray-600 shrink-0"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div ref={projectChatListRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                            {projectChatMessages.length === 0 ? (
                                <p className="text-sm text-gray-400 text-center pt-6">ยังไม่มีข้อความ</p>
                            ) : (
                                projectChatMessages.map((msg) => {
                                    const isOwn = msg.user_id === currentUserId;
                                    const avatarSrc = msg.user_avatar_url ? `${SERVER_BASE}${msg.user_avatar_url}` : "/defult.png";
                                    const avatar = (
                                        <Image
                                            src={avatarSrc}
                                            alt=""
                                            width={28}
                                            height={28}
                                            unoptimized={!!msg.user_avatar_url}
                                            className="w-7 h-7 rounded-full object-cover border border-gray-200 shrink-0"
                                        />
                                    );
                                    const bubble = (
                                        <div className={`max-w-[75%] rounded-2xl px-3 py-2 ${isOwn ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-800"}`}>
                                            {!isOwn && (
                                                <p className="text-[11px] font-medium text-gray-500 mb-0.5">
                                                    {msg.user_fullname ?? "ผู้ใช้งานที่ถูกลบ"}
                                                </p>
                                            )}
                                            {msg.reply_to_message_id && (
                                                <button
                                                    type="button"
                                                    onClick={() => scrollToChatMessage(msg.reply_to_message_id!)}
                                                    className={`block w-full text-left mb-1 pl-2 border-l-2 rounded ${
                                                        isOwn ? "border-blue-200 bg-blue-400/30" : "border-gray-300 bg-white/60"
                                                    }`}
                                                >
                                                    <p className={`text-[11px] font-medium ${isOwn ? "text-blue-50" : "text-gray-600"}`}>
                                                        {msg.reply_to_user_fullname ?? "ผู้ใช้งานที่ถูกลบ"}
                                                    </p>
                                                    <p className={`text-[11px] truncate ${isOwn ? "text-blue-100" : "text-gray-500"}`}>
                                                        {msg.reply_to_text ? truncateReplyPreview(msg.reply_to_text) : msg.reply_to_image_count > 0 ? "[รูปภาพ]" : ""}
                                                    </p>
                                                </button>
                                            )}
                                            {msg.message_text && (
                                                <p className="text-sm whitespace-pre-wrap wrap-break-word">{msg.message_text}</p>
                                            )}
                                            {msg.images.length > 0 && (
                                                <div className="flex flex-wrap gap-1.5 mt-1.5">
                                                    {msg.images.map((img) => (
                                                        <button
                                                            key={img.image_id}
                                                            type="button"
                                                            onClick={() => window.open(`${SERVER_BASE}${img.image_url}`, "_blank")}
                                                        >
                                                            <Image
                                                                src={`${SERVER_BASE}${img.image_url}`}
                                                                alt=""
                                                                width={96}
                                                                height={96}
                                                                unoptimized
                                                                className="w-20 h-20 object-cover rounded-lg"
                                                            />
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                            <div className="flex items-center gap-2 mt-1">
                                                <p className={`text-[10px] ${isOwn ? "text-blue-100" : "text-gray-400"}`}>
                                                    {formatDate(msg.message_created_at)}
                                                </p>
                                                <button
                                                    type="button"
                                                    onClick={() => setReplyingToProjectChat(msg)}
                                                    className={`text-[10px] font-medium hover:underline ${isOwn ? "text-blue-100" : "text-gray-400"}`}
                                                >
                                                    ตอบกลับ
                                                </button>
                                            </div>
                                        </div>
                                    );
                                    return (
                                        <div
                                            key={msg.message_id}
                                            id={`chat-msg-${msg.message_id}`}
                                            className={`flex items-end gap-2 rounded-lg transition-shadow ${isOwn ? "justify-end" : "justify-start"}`}
                                        >
                                            {isOwn ? (<>{bubble}{avatar}</>) : (<>{avatar}{bubble}</>)}
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        <form onSubmit={handleSendProjectChat} className="border-t border-gray-100 p-3 space-y-2 shrink-0">
                            {replyingToProjectChat && (
                                <div className="flex items-start justify-between gap-2 pl-2 border-l-2 border-blue-400 bg-blue-50 rounded px-2 py-1.5">
                                    <div className="min-w-0">
                                        <p className="text-[11px] font-medium text-blue-600">
                                            ตอบกลับ {replyingToProjectChat.user_fullname ?? "ผู้ใช้งานที่ถูกลบ"}
                                        </p>
                                        <p className="text-xs text-gray-500 truncate">
                                            {replyingToProjectChat.message_text
                                                ? truncateReplyPreview(replyingToProjectChat.message_text)
                                                : replyingToProjectChat.images.length > 0 ? "[รูปภาพ]" : ""}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setReplyingToProjectChat(null)}
                                        className="shrink-0 text-gray-400 hover:text-gray-600"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-3.5 h-3.5">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            )}
                            {projectChatNewImages.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                    {projectChatNewImages.map((file, idx) => (
                                        <div key={idx} className="relative w-12 h-12 shrink-0">
                                            <Image
                                                src={URL.createObjectURL(file)}
                                                alt=""
                                                width={48}
                                                height={48}
                                                unoptimized
                                                className="w-12 h-12 object-cover rounded border border-gray-200"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setProjectChatNewImages((prev) => prev.filter((_, i) => i !== idx))}
                                                className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center rounded-full bg-gray-700 text-white text-[10px] leading-none hover:bg-red-600"
                                            >
                                                ×
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <div className="flex items-end gap-2">
                                <textarea
                                    value={projectChatText}
                                    onChange={(e) => setProjectChatText(e.target.value)}
                                    onKeyDown={handleProjectChatComposerKeyDown}
                                    rows={1}
                                    placeholder="พิมพ์ข้อความ..."
                                    className="flex-1 resize-none px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 border-gray-300 focus:border-blue-400 focus:ring-blue-500/20"
                                />
                                <label className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50 cursor-pointer">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                                    </svg>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        className="hidden"
                                        onChange={(e) => { handlePickProjectChatImages(e.target.files); e.target.value = ""; }}
                                    />
                                </label>
                                <button
                                    type="submit"
                                    disabled={isSendingProjectChat || (!projectChatText.trim() && projectChatNewImages.length === 0)}
                                    className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-40"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                                        <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
                                    </svg>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <ConfirmDialog
                open={deleteProjectConfirm}
                title="ลบโปรเจกต์นี้?"
                description={`"${project.project_name}" และข้อมูล task/สมาชิกทั้งหมดจะถูกลบและไม่สามารถกู้คืนได้`}
                confirmLabel="ลบ"
                loading={isDeletingProject}
                onConfirm={handleDeleteProject}
                onCancel={() => setDeleteProjectConfirm(false)}
            />

            <ConfirmDialog
                open={!!deleteTaskTarget}
                title="ลบ Task นี้?"
                description={
                    deleteTaskTarget
                        ? tasks.some((t) => t.task_parent_id === deleteTaskTarget.task_id)
                            ? `"${deleteTaskTarget.task_title}" และ subtask ทั้งหมดของมันจะถูกลบและไม่สามารถกู้คืนได้`
                            : `"${deleteTaskTarget.task_title}" จะถูกลบและไม่สามารถกู้คืนได้`
                        : undefined
                }
                confirmLabel="ลบ"
                loading={isDeletingTask}
                onConfirm={handleDeleteTask}
                onCancel={() => setDeleteTaskTarget(null)}
            />

            <ConfirmDialog
                open={!!removeMemberTarget}
                title="นำสมาชิกออกจากโปรเจกต์นี้?"
                description={removeMemberTarget ? `"${removeMemberTarget.user_fullname}" จะถูกนำออกจากโปรเจกต์นี้` : undefined}
                confirmLabel="นำออก"
                loading={isRemovingMember}
                onConfirm={handleRemoveMember}
                onCancel={() => setRemoveMemberTarget(null)}
            />

            <ConfirmDialog
                open={!!deleteIssueTarget}
                title="ลบปัญหานี้?"
                description={deleteIssueTarget ? `"${deleteIssueTarget.issue_title}" จะถูกลบและไม่สามารถกู้คืนได้` : undefined}
                confirmLabel="ลบ"
                loading={isDeletingIssue}
                onConfirm={handleDeleteIssue}
                onCancel={() => setDeleteIssueTarget(null)}
            />
        </div>
    );
}
