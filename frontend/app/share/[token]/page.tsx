"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/app/constans";
import formatDate, { formatDateOnly } from "@/app/function";
import ProgressBar from "@/components/ui/ProgressBar";

type ProjectStatus = "planning" | "in_progress" | "on_hold" | "completed" | "cancelled";
type TaskStatus = "todo" | "in_progress" | "review" | "done";

type SharedProject = {
    project_id: string;
    project_name: string;
    project_description: string | null;
    project_status: ProjectStatus;
    project_start_date: string | null;
    project_due_date: string | null;
    project_progress_percent: string;
    client_name: string | null;
};

type SharedTask = {
    task_id: string;
    task_title: string;
    task_status: TaskStatus;
    assignee_names: string | null;
    task_start_date: string | null;
    task_due_date: string | null;
};

// หน้า share (ลูกค้าดู) เห็นแค่ "สร้างงาน"/"เปลี่ยนสถานะ" และไม่มีชื่อพนักงานจริงติดมา (backend กรอง/ตัดออกให้แล้ว)
type TimelineEntry = {
    log_id: string;
    task_title: string;
    log_action: "created" | "status_changed";
    log_old_value: string | null;
    log_new_value: string | null;
    log_message: string | null;
    log_created_at: string;
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

const ACTION_LABEL: Record<TimelineEntry["log_action"], string> = {
    created: "สร้างงาน", status_changed: "เปลี่ยนสถานะงาน",
};

export default function SharedProjectPage() {
    const params = useParams<{ token: string }>();
    const token = params.token;

    const [project, setProject] = useState<SharedProject | null>(null);
    const [tasks, setTasks] = useState<SharedTask[]>([]);
    const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
    const [notFound, setNotFound] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!token) return;
        (async () => {
            const res = await fetch(`${api}/share/${token}`);
            if (!res.ok) { setNotFound(true); setLoading(false); return; }
            const data = await res.json();
            setProject(data.project);
            setTasks(data.tasks ?? []);
            setTimeline(data.timeline ?? []);
            setLoading(false);
        })();
    }, [token]);

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">กำลังโหลด...</div>;
    }

    if (notFound || !project) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <p className="text-gray-500 text-sm">ไม่พบโปรเจกต์นี้ หรือลิงก์ถูกปิดใช้งานแล้ว</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4">
                <p className="text-sm font-semibold text-blue-600">Softwork Project Manager</p>
            </header>

            <main className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h1 className="text-xl sm:text-2xl font-bold text-gray-800">{project.project_name}</h1>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full bg-gray-50 ${STATUS_COLOR[project.project_status]}`}>
                            {STATUS_LABEL[project.project_status]}
                        </span>
                    </div>
                    {project.client_name && <p className="text-sm text-gray-500">ลูกค้า: {project.client_name}</p>}
                    {project.project_description && (
                        <p className="text-sm text-gray-600 whitespace-pre-wrap">{project.project_description}</p>
                    )}

                    <ProgressBar percent={Number(project.project_progress_percent)} />

                    <div className="flex flex-wrap gap-x-8 gap-y-1 text-sm text-gray-500">
                        <span>วันเริ่ม: {formatDateOnly(project.project_start_date)}</span>
                        <span>ครบกำหนด: {formatDateOnly(project.project_due_date)}</span>
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
                    <h2 className="text-base font-semibold text-gray-800">รายการงาน</h2>
                    {tasks.length === 0 ? (
                        <p className="text-sm text-gray-400">ยังไม่มีงานในโปรเจกต์นี้</p>
                    ) : (
                        <ul className="divide-y divide-gray-100">
                            {tasks.map((t) => (
                                <li key={t.task_id} className="py-3 flex items-center justify-between gap-3 flex-wrap">
                                    <div>
                                        <p className="text-sm font-medium text-gray-800">{t.task_title}</p>
                                        <p className="text-xs text-gray-400">
                                            {t.assignee_names ?? "ยังไม่มอบหมาย"}
                                            {" · "}{formatDateOnly(t.task_start_date)} – {formatDateOnly(t.task_due_date)}
                                        </p>
                                    </div>
                                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full bg-gray-50 shrink-0 ${TASK_STATUS_COLOR[t.task_status]}`}>
                                        {TASK_STATUS_LABEL[t.task_status]}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
                    <h2 className="text-base font-semibold text-gray-800">ความเคลื่อนไหวล่าสุด</h2>
                    {timeline.length === 0 ? (
                        <p className="text-sm text-gray-400">ยังไม่มีความเคลื่อนไหว</p>
                    ) : (
                        <ul className="space-y-3 max-h-96 overflow-y-auto">
                            {timeline.map((entry) => (
                                <li key={entry.log_id} className="text-sm border-l-2 border-blue-100 pl-3">
                                    <p className="text-gray-700">
                                        <span className="font-medium">ทีมงาน</span>
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
            </main>
        </div>
    );
}
