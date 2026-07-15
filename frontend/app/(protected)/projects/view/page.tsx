"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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

type ProjectStatus = "planning" | "in_progress" | "on_hold" | "completed" | "cancelled";
type TaskStatus = "todo" | "in_progress" | "review" | "done";

type ProjectDetail = {
    project_id: string;
    project_name: string;
    project_description: string | null;
    project_status: ProjectStatus;
    project_start_date: string | null;
    project_due_date: string | null;
    project_progress_percent: string;
    project_share_token: string;
    project_share_enabled: number;
    project_use_task_weight: number;
    client_name: string | null;
    client_email: string | null;
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
};

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

    const [taskModalOpen, setTaskModalOpen] = useState(false);
    const [editingTask, setEditingTask] = useState<Task | null>(null);
    const [parentTask, setParentTask] = useState<Task | null>(null);
    const [taskForm, setTaskForm] = useState<TaskFormState>(EMPTY_TASK_FORM);
    const [taskFormError, setTaskFormError] = useState<string | null>(null);
    const [deleteTaskTarget, setDeleteTaskTarget] = useState<Task | null>(null);
    const [isDeletingTask, setIsDeletingTask] = useState(false);

    const [detailTask, setDetailTask] = useState<TaskDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);

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

        if (!projectRes.ok) { setNotFound(true); return; }

        const [projectData, permData, membersData, tasksData, activityData] = await Promise.all([
            projectRes.json(), permRes.json(), membersRes.json(), tasksRes.json(), activityRes.json(),
        ]);

        setProject(projectData);
        setPermission(permData.position_permission ?? "");
        setMembers(membersData);
        setTasks(tasksData.data ?? []);
        setActivity(activityData.data ?? []);
    }

    useEffect(() => {
        if (!id) return;
        startTransition(async () => {
            const token = localStorage.getItem("token");
            if (token) setCurrentUserId(decodeToken(token).user_id);
            await loadAll(id);
        });
    }, [id]);

    useEffect(() => {
        (async () => {
            const res = await fetch(`${api}/project-positions?status=active&limit=100`, { headers: authHeader() });
            if (!res.ok) return;
            const data = await res.json();
            setPositions(data.data ?? []);
        })();
    }, []);

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

    async function openTaskDetail(task: Task) {
        setDetailLoading(true);
        try {
            const res = await fetch(`${api}/projects/${id}/tasks/${task.task_id}`, { headers: authHeader() });
            if (!res.ok) { toast.error("โหลดข้อมูล task ไม่สำเร็จ"); return; }
            const data = await res.json();
            setDetailTask(data);
        } finally {
            setDetailLoading(false);
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
            key: "assignees",
            header: "ผู้รับผิดชอบ",
            render: (v) => {
                const list = v as TaskAssignee[];
                return list.length ? list.map((a) => a.user_fullname).join(", ") : "-";
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
                        </div>
                        {project.client_name && <p className="text-sm text-gray-500 mt-1">ลูกค้า: {project.client_name}</p>}
                        {project.project_description && (
                            <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">{project.project_description}</p>
                        )}
                    </div>
                    <div className="flex gap-2 shrink-0">
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
                    onClick={() => setDetailTask(null)}
                >
                    <div
                        className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6 space-y-4 max-h-[90vh] overflow-y-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {detailLoading || !detailTask ? (
                            <p className="text-sm text-gray-400">กำลังโหลด...</p>
                        ) : (
                            <>
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
                                            {canChangeThisTaskStatus(detailTask) ? (
                                                <select
                                                    value={detailTask.task_status}
                                                    onChange={async (e) => {
                                                        const task_status = e.target.value as TaskStatus;
                                                        await handleStatusChange(detailTask, task_status);
                                                        setDetailTask((prev) => (prev ? { ...prev, task_status } : prev));
                                                    }}
                                                    className="text-sm border border-gray-200 rounded px-2 py-1 bg-white shrink-0 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                                >
                                                    {TASK_STATUS_OPTIONS.map((opt) => (
                                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <span className={`text-xs font-medium px-2 py-0.5 rounded-full bg-gray-50 shrink-0 ${TASK_STATUS_COLOR[detailTask.task_status]}`}>
                                                    {TASK_STATUS_LABEL[detailTask.task_status]}
                                                </span>
                                            )}
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
                                                        onClick={() => { const parent = detailTask; setDetailTask(null); openCreateTask(parent); }}
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
                                                            <li key={c.task_id}>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => openTaskDetail(c)}
                                                                    className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left text-sm hover:bg-blue-50"
                                                                >
                                                                    <span className="text-gray-700">{c.task_title}</span>
                                                                    <span className={`text-xs shrink-0 ${TASK_STATUS_COLOR[c.task_status]}`}>
                                                                        {TASK_STATUS_LABEL[c.task_status]}
                                                                    </span>
                                                                </button>
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
                                            <EditButton onClick={() => { const t = detailTask; setDetailTask(null); openEditTask(t); }}>แก้ไข</EditButton>
                                        )}
                                        {canDeleteTask && (
                                            <DeleteButton onClick={() => { const t = detailTask; setDetailTask(null); setDeleteTaskTarget(t); }} />
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setDetailTask(null)}
                                        className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
                                    >
                                        ปิด
                                    </button>
                                </div>
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
        </div>
    );
}
