"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/app/constans";
import formatDate, { formatDateOnly, toDateInputValue } from "@/app/function";
import DataTable, { Column } from "@/components/ui/datatable/datatable";
import ProgressBar from "@/components/ui/ProgressBar";
import CircularProgress from "@/components/ui/CircularProgress";
import EditButton from "@/components/ui/Button/EditButton";
import DeleteButton from "@/components/ui/Button/DeleteButton";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import ProjectFinanceCard from "./_components/project-finance-card";
import FastworkProjectCard from "./_components/fastwork-project-card";
import ProfitShareLinkCard from "./_components/profit-share-link-card";
import CustomerRequirementsCard from "./_components/customer-requirements-card";
import ShareEmailModal from "./_components/share-email-modal";
import ProjectChatModal from "./_components/project-chat-modal";
import MemberModal from "./_components/member-modal";
import TaskFormModal from "./_components/task-form-modal";
import TaskChatPanel from "./_components/task-chat-panel";
import TaskIssuesSection from "./_components/task-issues-section";
import TaskBoard from "./_components/board/task-board";
import TaskLabelsChecklist from "./_components/board/task-labels-checklist";
import { toast } from "sonner";
import { buttonClass } from "@/components/ui/button";
import { inputClass } from "@/components/ui/form-field";
import SectionCard from "@/components/ui/section-card";
import Switch from "@/components/ui/switch";
import StatusPill from "@/components/ui/status-pill";
import StatusBanner from "@/components/ui/guidance/status-banner";
import { PageSkeleton } from "@/components/ui/skeleton";
import { UserPlus, Users } from "lucide-react";
import {
    AgileOverviewCard,
    ProjectActivityCard,
    ProjectHeader,
    ShareLinkCard,
    TasksSectionCard,
    type TaskView,
    TASK_STATUS,
} from "./_components/project-sections";

import type { TaskStatus, ProjectDetail, TaskAssignee, Task, MemberPosition, Member, ActivityEntry, PositionOption, TaskDetail, TaskFormState } from "./_types";
import { readTaskView, saveTaskView, EMPTY_TASK_FORM, TASK_STATUS_LABEL, TASK_STATUS_OPTIONS, ACTION_LABEL, authHeader, decodeToken, hasProjectBit, IssueCountBadge, ChatUnreadBadge } from "./_lib/view-helpers";


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
    const [showOnlyMyTasks, setShowOnlyMyTasks] = useState(false);
    const [taskView, setTaskView] = useState<TaskView>(readTaskView);
    const [agileOverviewTab, setAgileOverviewTab] = useState<"all" | "task" | "subtask">("all");

    const [taskModalOpen, setTaskModalOpen] = useState(false);
    const [editingTask, setEditingTask] = useState<Task | null>(null);
    const [parentTask, setParentTask] = useState<Task | null>(null);
    // ค่าเริ่มของฟอร์มตอนเปิด (ว่าง หรือค่าของงานที่แก้)
    const [taskFormStart, setTaskFormStart] = useState<TaskFormState>(EMPTY_TASK_FORM);
    const [deleteTaskTarget, setDeleteTaskTarget] = useState<Task | null>(null);
    const [isDeletingTask, setIsDeletingTask] = useState(false);

    const [detailTask, setDetailTask] = useState<TaskDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);


    const [chatOpen, setChatOpen] = useState(false);

    const [projectChatOpen, setProjectChatOpen] = useState(false);

    const [memberModalOpen, setMemberModalOpen] = useState(false);
    const [editingMember, setEditingMember] = useState<Member | null>(null);
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
        setTaskFormStart(EMPTY_TASK_FORM);
        setTaskModalOpen(true);
    }

    async function openEditTask(task: Task) {
        const res = await fetch(`${api}/projects/${id}/tasks/${task.task_id}`, { headers: authHeader() });
        if (!res.ok) { toast.error("โหลดข้อมูล task ไม่สำเร็จ"); return; }
        const data = await res.json();
        setEditingTask(task);
        setParentTask(null);
        setTaskFormStart({
            task_title: data.task_title ?? "",
            task_description: data.task_description ?? "",
            assignee_ids: (data.assignees as TaskAssignee[] ?? []).map((a) => a.user_id),
            task_start_date: toDateInputValue(data.task_start_date),
            task_due_date: toDateInputValue(data.task_due_date),
            task_weight: String(data.task_weight ?? 1),
        });
        setTaskModalOpen(true);
    }

    function closeTaskDetail() {
        setDetailTask(null);
        setChatOpen(false);
    }

    // โหลดเธรดตอบกลับของทุกปัญหาใน task นี้พร้อมกันทีเดียว (เธรดแสดงตลอดไม่ต้องกดขยายทีละปัญหา) — endpoint นี้ mark-read ให้ทุกปัญหาในคราวเดียว
    // รีโหลดเธรดของปัญหาเดียว (ใช้หลังส่งข้อความตอบกลับใหม่) ไม่ใช้ตัว batch เพราะแค่ต้องการรีเฟรชปัญหาเดียวที่เพิ่งตอบไป
    async function openTaskDetail(task: Task) {
        setDetailLoading(true);
        setChatOpen(false);
        try {
            const [res] = await Promise.all([
                fetch(`${api}/projects/${id}/tasks/${task.task_id}`, { headers: authHeader() }),
            ]);
            if (!res.ok) { toast.error("โหลดข้อมูล task ไม่สำเร็จ"); return; }
            const data = await res.json();
            setDetailTask(data);
        } finally {
            setDetailLoading(false);
        }
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
        setMemberModalOpen(true);
    }

    function openEditMemberPositions(member: Member) {
        setEditingMember(member);
        setMemberModalOpen(true);
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
        setShareEmailModalOpen(true);
    }

    if (!id || notFound) {
        return (
            <StatusBanner tone="error" title="ไม่พบโปรเจกต์นี้">
                โปรเจกต์อาจถูกลบไปแล้ว หรือคุณไม่ได้เป็นสมาชิก · กลับไปเลือกจากหน้ารายการโปรเจกต์
            </StatusBanner>
        );
    }
    if (!project) return <PageSkeleton />;

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
                    className="-my-2 py-2 text-left hover:text-blue-600 hover:underline"
                >
                    {v as string}
                </button>
            ),
        },
        {
            key: "open_issue_count",
            mobile: "badge",
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
            mobile: "badge",
            header: "แชท",
            render: (_v, row) => {
                if (!row.unread_chat_count) return <span className="text-gray-300">-</span>;
                return <ChatUnreadBadge count={row.unread_chat_count} />;
            },
        },
        {
            key: "assignees",
            mobile: "meta",
            header: "ผู้รับผิดชอบ",
            render: (v, row) => {
                const list = v as TaskAssignee[];
                if (list.length) return list.map((a) => a.user_fullname).join(", ");
                if (project.project_type === "agile") {
                    return (
                        <button
                            type="button"
                            onClick={() => handleClaimTask(row)}
                            className={buttonClass("secondary", "sm")}
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
            mobile: "badge",
            header: "สถานะ",
            render: (v, row) => {
                const status = v as TaskStatus;
                const canChange = canChangeThisTaskStatus(row);
                if (!canChange) {
                    return <StatusPill tone={TASK_STATUS[status].tone}>{TASK_STATUS[status].label}</StatusPill>;
                }
                return (
                    <select
                        value={status}
                        aria-label={`สถานะของ ${row.task_title}`}
                        onChange={(e) => handleStatusChange(row, e.target.value as TaskStatus)}
                        className={`${inputClass(false, "sm")} w-36`}
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
            mobile: "trailing",
            header: "ความคืบหน้า",
            className: "min-w-[140px]",
            render: (_v, row) => <ProgressBar percent={getTaskProgress(row).percent} />,
        },
        ...(project.project_use_task_weight ? [{ key: "task_weight", header: "น้ำหนัก" } as Column<Task>] : []),
        { key: "task_start_date", mobile: "meta", mobileLabel: "เริ่ม", header: "วันเริ่ม", render: (v) => formatDateOnly(v) },
        { key: "task_due_date", mobile: "meta", mobileLabel: "ครบ", header: "ครบกำหนด", render: (v) => formatDateOnly(v) },
    ];

    const memberColumns: Column<Member>[] = [
        { key: "user_fullname", header: "ชื่อ" },
        {
            key: "positions",
            mobile: "meta",
            header: "ตำแหน่ง",
            render: (v) => {
                const list = v as MemberPosition[];
                if (!list.length) return <span className="text-gray-400">-</span>;
                return (
                    <div className="flex flex-wrap gap-1">
                        {list.map((p) => (
                            <StatusPill key={p.position_id} tone="info">
                                {p.position_name}
                            </StatusPill>
                        ))}
                    </div>
                );
            },
        },
    ];

    return (
        <div className="grid w-full gap-6">
            {/* หัวข้อ + ข้อมูลโปรเจกต์ (ส่วนแสดงผลอยู่ที่ _components/project-sections.tsx) */}
            <ProjectHeader
                project={project}
                memberCount={members.length}
                canEdit={canEditProjectInfo}
                canDelete={canDeleteProject}
                onOpenChat={() => setProjectChatOpen(true)}
                onEdit={() => router.push(`/projects/edit?id=${id}`)}
                onDelete={() => setDeleteProjectConfirm(true)}
            />

            {/* ลิงก์สำหรับลูกค้า */}
            {canManageShareLink && (
                <ShareLinkCard
                    isEnabled={Boolean(project.project_share_enabled)}
                    shareUrl={shareUrl}
                    copied={Boolean(copyFeedback)}
                    isRegenerating={isRegeneratingLink}
                    onToggle={handleToggleShare}
                    onCopy={handleCopyLink}
                    onEmail={openShareEmailModal}
                    onRegenerate={handleRegenerateLink}
                />
            )}

            {/* งาน Fastwork (P-1) — งวดงานและการส่งงาน · สมาชิกตัวจริงกดส่งงานได้ */}
            {project.project_channel === "fastwork" && <FastworkProjectCard projectId={id} isMember={Boolean(permission)} />}

            {/* ความต้องการจากลูกค้า (S-4) — จากลิงก์เลือกบริการ · ไม่มีคำขอ = ไม่แสดง */}
            <CustomerRequirementsCard projectId={id} />

            {/* การเงิน — เฉพาะผู้มีสิทธิ์ดูใบแจ้งหนี้ (ช่วง 1D) */}
            <ProjectFinanceCard projectId={id} />

            {/* ส่วนแบ่งกำไร (P-2) — เฉพาะผู้จัดการส่วนแบ่ง */}
            <ProfitShareLinkCard projectId={id} />

            {/* ภาพรวม Agile — เฉพาะโปรเจกต์ agile */}
            {project.project_type === "agile" && (
                <AgileOverviewCard
                    tasks={tasks}
                    tab={agileOverviewTab}
                    onTabChange={setAgileOverviewTab}
                    onOpenTask={(task) => openTaskDetail(task as Task)}
                />
            )}

            {/* งาน */}
            <TasksSectionCard
                canAddTask={canAddTask}
                onAddTask={() => openCreateTask()}
                taskView={taskView}
                onTaskViewChange={(view) => {
                    setTaskView(view);
                    saveTaskView(view);
                }}
            >
                {taskView === "board" ? (
                    <TaskBoard
                        projectId={id as string}
                        tasks={tasks}
                        currentUserId={currentUserId}
                        isAgile={project.project_type === "agile"}
                        canReorder={canEditTask}
                        canAddTask={canAddTask}
                        canChangeStatus={(task) => canChangeThisTaskStatus(task as Task)}
                        onOpenTask={(task) => openTaskDetail(task as Task)}
                        onClaimTask={(task) => handleClaimTask(task as Task)}
                        onAddTask={() => openCreateTask()}
                        onChanged={async () => {
                            await loadAll(id as string);
                        }}
                    />
                ) : (
                <>
                <div className="flex flex-wrap gap-x-8 gap-y-3">
                    <Switch
                        id="show-only-my-tasks"
                        label="เฉพาะงานที่ฉันรับผิดชอบ"
                        checked={showOnlyMyTasks}
                        onChange={setShowOnlyMyTasks}
                    />
                    {canEditProjectInfo && (
                        <Switch
                            id="use-task-weight"
                            label="ถ่วงน้ำหนักงาน"
                            description="เปิด = ความคืบหน้าโปรเจกต์คิดตามน้ำหนักของแต่ละงาน · ปิด = ทุกงานนับเท่ากัน"
                            checked={Boolean(project.project_use_task_weight)}
                            onChange={handleToggleTaskWeight}
                        />
                    )}
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
                </>
                )}
            </TasksSectionCard>

            {/* สมาชิก */}
            <SectionCard
                icon={Users}
                title="สมาชิกโปรเจกต์"
                description="ตำแหน่งในโปรเจกต์กำหนดว่าแต่ละคนทำอะไรได้บ้าง (ตั้งตำแหน่งได้ที่ ตั้งค่าระบบ › ตำแหน่งในโปรเจกต์)"
                actions={
                    canManageMembers && (
                        <button type="button" onClick={openAddMember} className={buttonClass("primary", "md")}>
                            <UserPlus size={16} />
                            เพิ่มสมาชิก
                        </button>
                    )
                }
            >
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
            </SectionCard>

            {/* ประวัติกิจกรรม */}
            <ProjectActivityCard activity={activity} />

            {/* Modal เพิ่ม/แก้ไข Task */}
            {taskModalOpen && project && id && (
                <TaskFormModal
                    projectId={id}
                    editingTask={editingTask}
                    parentTask={parentTask}
                    initialForm={taskFormStart}
                    members={members}
                    useTaskWeight={Boolean(project.project_use_task_weight)}
                    onSaved={() => loadAll(id)}
                    onClose={() => setTaskModalOpen(false)}
                />
            )}

            {/* Modal รายละเอียด Task */}
            {(detailTask || detailLoading) && (
                <div
                    className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/40 backdrop-blur-sm sm:items-center sm:p-4"
                    onClick={closeTaskDetail}
                >
                    <div
                        className={`bg-white rounded-t-2xl sm:rounded-2xl shadow-float w-full max-h-[90dvh] flex overflow-hidden ${chatOpen ? "max-w-7xl" : "max-w-5xl"}`}
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
                                            <h2 className="text-base font-medium text-gray-900">{detailTask.task_title}</h2>
                                            <div className="flex items-center gap-2 shrink-0">
                                                {canChangeThisTaskStatus(detailTask) ? (
                                                    <select
                                                        value={detailTask.task_status}
                                                        onChange={async (e) => {
                                                            const task_status = e.target.value as TaskStatus;
                                                            await handleStatusChange(detailTask, task_status);
                                                            setDetailTask((prev) => (prev ? { ...prev, task_status } : prev));
                                                        }}
                                                        className={inputClass(false, "sm")}
                                                    >
                                                        {TASK_STATUS_OPTIONS.map((opt) => (
                                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <StatusPill tone={TASK_STATUS[detailTask.task_status].tone}>
                                                        {TASK_STATUS[detailTask.task_status].label}
                                                    </StatusPill>
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

                                <hr className="border-gray-100" />
                                {/* ป้ายสี + checklist (บอร์ดงาน 2026-10-17) — key = งาน ให้สถานะในส่วนนี้เริ่มใหม่เมื่อเปิดงานอื่น */}
                                <TaskLabelsChecklist
                                    key={detailTask.task_id}
                                    projectId={id as string}
                                    taskId={detailTask.task_id}
                                    initialLabels={detailTask.labels ?? []}
                                    initialChecklist={detailTask.checklist ?? []}
                                    canEdit={canEditThisTask(detailTask)}
                                    canTick={canChangeThisTaskStatus(detailTask)}
                                    canManageLabels={canEditProjectInfo}
                                    onChanged={async () => {
                                        await loadAll(id as string);
                                    }}
                                />

                                {/* subtask ไม่มี subtask ของตัวเองได้อีก (จำกัดไว้แค่ 1 ชั้น) เลยไม่ต้องโชว์ section นี้เลยตอนดูรายละเอียด subtask */}
                                {!detailTask.task_parent_id && (
                                    <>
                                        <hr className="border-gray-100" />

                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <h3 className="text-sm font-medium text-gray-900">Subtasks</h3>
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
                                                                        <span className="text-xs text-gray-400 truncate max-w-25">
                                                                            {c.assignees.map((a) => a.user_fullname).join(", ")}
                                                                        </span>
                                                                    ) : null}
                                                                    <StatusPill tone={TASK_STATUS[c.task_status].tone}>
                                                                        {TASK_STATUS[c.task_status].label}
                                                                    </StatusPill>
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

                                <TaskIssuesSection
                                    key={`issues-${detailTask.task_id}`}
                                    projectId={id ?? ""}
                                    task={detailTask}
                                    canAdd={canAddIssueTo(detailTask)}
                                    canEdit={canEditIssuesOf(detailTask)}
                                    canDelete={canDeleteIssuesOf(detailTask)}
                                    canChangeStatus={canChangeIssueStatusOf(detailTask)}
                                    onCountsChanged={() => loadAll(id as string)}
                                />

                                <hr className="border-gray-100" />

                                <div className="space-y-2">
                                    <h3 className="text-sm font-medium text-gray-900">ประวัติ</h3>
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
                                                            {entry.log_action === "edited" && entry.log_message && (
                                                                <span className="text-gray-500"> · {entry.log_message}</span>
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
                                        className={buttonClass("secondary", "md")}
                                    >
                                        ปิด
                                    </button>
                                </div>
                            </div>

                            {chatOpen && detailTask && id && (
                                <TaskChatPanel
                                    key={`chat-${detailTask.task_id}`}
                                    projectId={id}
                                    taskId={detailTask.task_id}
                                    currentUserId={currentUserId}
                                    onRead={(taskId) =>
                                        setTasks((prev) =>
                                            prev.some((t) => t.task_id === taskId && t.unread_chat_count)
                                                ? prev.map((t) => (t.task_id === taskId ? { ...t, unread_chat_count: 0 } : t))
                                                : prev,
                                        )
                                    }
                                    onClose={() => setChatOpen(false)}
                                />
                            )}
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Modal เพิ่ม/แก้ไขสมาชิก */}
            {memberModalOpen && id && (
                <MemberModal
                    projectId={id}
                    member={editingMember}
                    members={members}
                    positions={positions}
                    onSaved={() => loadAll(id)}
                    onClose={() => setMemberModalOpen(false)}
                />
            )}

            {/* Modal ส่งลิงก์ให้ลูกค้าทางอีเมล */}
            {shareEmailModalOpen && project && (
                <ShareEmailModal project={project} shareUrl={shareUrl} onClose={() => setShareEmailModalOpen(false)} />
            )}

            {projectChatOpen && project && (
                <ProjectChatModal
                    projectId={project.project_id}
                    projectName={project.project_name}
                    currentUserId={currentUserId}
                    onRead={() => setProject((prev) => (prev?.unread_chat_count ? { ...prev, unread_chat_count: 0 } : prev))}
                    onClose={() => setProjectChatOpen(false)}
                />
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
