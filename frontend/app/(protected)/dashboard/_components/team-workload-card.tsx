"use client";

// ภาพรวมทีม — ภาระงานรายคน (เสร็จ/ค้าง/เลยกำหนด) กรองชนิดงานและโปรเจกต์ได้ · กดชื่อดูงานของคนนั้น
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Users, X } from "lucide-react";
import Segmented from "@/components/ui/segmented";
import StatusPill from "@/components/ui/status-pill";
import { buttonClass } from "@/components/ui/button";
import { inputClass } from "@/components/ui/form-field";
import { formatDateOnly } from "@/app/function";
import { apiFetch } from "@/lib/api";
import { TASK_TYPE_OPTIONS, taskLink } from "../_labels";
import type { MemberTasksDetail, ProjectOption, TaskTypeFilter, TeamWorkloadEntry } from "../_types";
import DashboardCard, { Avatar, EmptyLine } from "./dashboard-card";

const totalOf = (member: TeamWorkloadEntry) =>
    member.done_task_count + member.pending_task_count + member.overdue_task_count;

export default function TeamWorkloadCard() {
    const [members, setMembers] = useState<TeamWorkloadEntry[]>([]);
    const [projectOptions, setProjectOptions] = useState<ProjectOption[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [taskType, setTaskType] = useState<TaskTypeFilter>("all");
    const [projectId, setProjectId] = useState("all");
    const [selectedMember, setSelectedMember] = useState<TeamWorkloadEntry | null>(null);

    useEffect(() => {
        let isStale = false;
        const params = new URLSearchParams({ taskType, projectId });
        apiFetch<{ teamWorkload: TeamWorkloadEntry[]; projectOptions: ProjectOption[] }>(
            `/dashboard/team-workload?${params}`,
        ).then(({ data }) => {
            if (isStale) return;
            if (data) {
                setMembers(data.teamWorkload);
                setProjectOptions(data.projectOptions);
            }
            setIsLoading(false);
        });
        return () => {
            isStale = true;
        };
    }, [taskType, projectId]);

    const maxTotal = Math.max(...members.map(totalOf), 1);

    return (
        <DashboardCard
            icon={Users}
            title="ภาพรวมทีม"
            description="แถบยาวตามจำนวนงานทั้งหมดของแต่ละคน · กดชื่อเพื่อดูรายการงาน"
            actions={
                <div className="flex flex-wrap items-center gap-2">
                    <Segmented label="ชนิดงาน" value={taskType} onChange={setTaskType} options={TASK_TYPE_OPTIONS} />
                    <select
                        aria-label="โปรเจกต์"
                        value={projectId}
                        onChange={(event) => setProjectId(event.target.value)}
                        className={`${inputClass(false, "sm")} w-48`}
                    >
                        <option value="all">ทุกโปรเจกต์</option>
                        {projectOptions.map((project) => (
                            <option key={project.project_id} value={project.project_id}>
                                {project.project_name}
                            </option>
                        ))}
                    </select>
                </div>
            }
        >
            <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-green-600" />
                    เสร็จแล้ว
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-blue-500" />
                    ค้างอยู่
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-red-600" />
                    เลยกำหนด
                </span>
            </div>
            {isLoading ? (
                <EmptyLine>กำลังโหลด...</EmptyLine>
            ) : members.length === 0 ? (
                <EmptyLine>ยังไม่มีใครมีงานอยู่ตอนนี้</EmptyLine>
            ) : (
                <ul className="-mx-2 grid gap-1">
                    {members.map((member) => {
                        const total = totalOf(member) || 1;
                        return (
                            <li key={member.user_id}>
                                <button
                                    type="button"
                                    onClick={() => setSelectedMember(member)}
                                    className="grid w-full grid-cols-[auto_minmax(0,9rem)_1fr] items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-gray-50 sm:grid-cols-[auto_minmax(0,10rem)_1fr_auto]"
                                >
                                    <Avatar name={member.user_fullname} avatarPath={member.user_avatar_url} />
                                    <span className="truncate text-sm text-gray-800">{member.user_fullname}</span>
                                    <span className="h-2 overflow-hidden rounded-full bg-gray-100">
                                        <span
                                            className="flex h-full"
                                            style={{ width: `${(totalOf(member) / maxTotal) * 100}%` }}
                                        >
                                            <span
                                                className="h-full bg-green-600"
                                                style={{ width: `${(member.done_task_count / total) * 100}%` }}
                                            />
                                            <span
                                                className="h-full bg-blue-500"
                                                style={{ width: `${(member.pending_task_count / total) * 100}%` }}
                                            />
                                            <span
                                                className="h-full bg-red-600"
                                                style={{ width: `${(member.overdue_task_count / total) * 100}%` }}
                                            />
                                        </span>
                                    </span>
                                    <span className="col-span-3 flex flex-wrap justify-end gap-1.5 text-xs text-gray-600 sm:col-span-1">
                                        <span className="tabular-nums">ค้าง {member.pending_task_count}</span>
                                        {member.done_task_count > 0 && (
                                            <StatusPill tone="success">เสร็จ {member.done_task_count}</StatusPill>
                                        )}
                                        {member.overdue_task_count > 0 && (
                                            <StatusPill tone="danger">เลยกำหนด {member.overdue_task_count}</StatusPill>
                                        )}
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
            {selectedMember && <MemberTasksDialog member={selectedMember} onClose={() => setSelectedMember(null)} />}
        </DashboardCard>
    );
}

function MemberTasksDialog({ member, onClose }: { member: TeamWorkloadEntry; onClose: () => void }) {
    const router = useRouter();
    const [detail, setDetail] = useState<MemberTasksDetail | null>(null);

    useEffect(() => {
        let isStale = false;
        apiFetch<MemberTasksDetail>(`/dashboard/team/${member.user_id}/tasks`).then(({ data }) => {
            if (!isStale) setDetail(data);
        });
        return () => {
            isStale = true;
        };
    }, [member.user_id]);

    useEffect(() => {
        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") onClose();
        }
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [onClose]);

    const sections = detail
        ? [
              { key: "overdue", label: "เลยกำหนด", tone: "text-red-600", list: detail.overdue },
              { key: "pending", label: "ค้างอยู่", tone: "text-gray-800", list: detail.pending },
              { key: "done", label: "เสร็จแล้ว", tone: "text-green-600", list: detail.done },
          ]
        : [];

    return (
        <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/40 backdrop-blur-sm sm:items-center sm:p-4"
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label={`งานของ ${member.user_fullname}`}
                onClick={(event) => event.stopPropagation()}
                className="grid max-h-[85dvh] w-full max-w-lg content-start gap-4 overflow-y-auto rounded-t-2xl bg-white p-5 shadow-float sm:rounded-2xl sm:p-6"
            >
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <Avatar name={member.user_fullname} avatarPath={member.user_avatar_url} size={36} />
                        <h2 className="text-base font-medium text-gray-900">{member.user_fullname}</h2>
                    </div>
                    <button type="button" aria-label="ปิด" className={buttonClass("ghost", "sm")} onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>
                {!detail ? (
                    <EmptyLine>กำลังโหลด...</EmptyLine>
                ) : (
                    sections.map((section) => (
                        <div key={section.key} className="grid gap-1.5">
                            <h3 className={`text-sm font-medium ${section.tone}`}>
                                {section.label} ({section.list.length})
                            </h3>
                            {section.list.length === 0 ? (
                                <p className="text-sm text-gray-400">ไม่มี</p>
                            ) : (
                                <ul className="-mx-2 grid gap-0.5">
                                    {section.list.map((task) => (
                                        <li key={task.task_id}>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    onClose();
                                                    router.push(taskLink(task.project_id, task.task_id));
                                                }}
                                                className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-2 text-left hover:bg-gray-50"
                                            >
                                                <span className="grid min-w-0">
                                                    <span className="flex min-w-0 items-center gap-1.5 text-sm text-gray-800">
                                                        <span className="truncate">{task.task_title}</span>
                                                        {task.task_parent_id && (
                                                            <StatusPill tone="neutral">Subtask</StatusPill>
                                                        )}
                                                    </span>
                                                    <span className="truncate text-xs text-gray-500">
                                                        {task.project_name}
                                                    </span>
                                                </span>
                                                <span className="shrink-0 text-xs text-gray-500">
                                                    {formatDateOnly(task.task_due_date)}
                                                </span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
