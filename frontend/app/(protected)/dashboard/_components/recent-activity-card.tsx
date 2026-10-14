"use client";

// กิจกรรมล่าสุดในโปรเจกต์ที่เห็นได้ — เส้นเวลาแนวตั้ง กดแล้วไปที่งานนั้น
import { useRouter } from "next/navigation";
import { History } from "lucide-react";
import formatDate from "@/app/function";
import { ACTION_LABEL, TASK_STATUS, taskLink } from "../_labels";
import type { ActivityEntry, TaskStatus } from "../_types";
import DashboardCard, { EmptyLine } from "./dashboard-card";

function statusLabel(value: string) {
    return TASK_STATUS[value as TaskStatus]?.label ?? value;
}

export default function RecentActivityCard({ activities }: { activities: ActivityEntry[] }) {
    const router = useRouter();
    return (
        <DashboardCard icon={History} iconTone="gray" title="กิจกรรมล่าสุด">
            {activities.length === 0 ? (
                <EmptyLine>ยังไม่มีกิจกรรม</EmptyLine>
            ) : (
                <ol className="relative ml-1 grid gap-1 border-l border-gray-200">
                    {activities.map((entry) => (
                        <li key={entry.log_id} className="relative pl-4">
                            <span
                                className="absolute top-3.5 left-[-4.5px] h-2 w-2 rounded-full bg-blue-500 ring-4 ring-white"
                                aria-hidden="true"
                            />
                            <button
                                type="button"
                                onClick={() => router.push(taskLink(entry.project_id, entry.task_id))}
                                className="grid w-full gap-0.5 rounded-xl px-2 py-2 text-left text-sm hover:bg-gray-50"
                            >
                                <span className="text-gray-700">
                                    <span className="text-gray-900">{entry.log_fullname ?? "ผู้ใช้งานที่ถูกลบ"}</span>{" "}
                                    {ACTION_LABEL[entry.log_action]}{" "}
                                    <span className="text-gray-900">{entry.task_title}</span>
                                    {entry.log_action === "status_changed" &&
                                        entry.log_old_value &&
                                        entry.log_new_value && (
                                            <>
                                                {" "}
                                                ({statusLabel(entry.log_old_value)} → {statusLabel(entry.log_new_value)}
                                                )
                                            </>
                                        )}
                                    <span className="text-gray-500"> · {entry.project_name}</span>
                                </span>
                                <span className="text-xs text-gray-400">{formatDate(entry.log_created_at)}</span>
                            </button>
                        </li>
                    ))}
                </ol>
            )}
        </DashboardCard>
    );
}
