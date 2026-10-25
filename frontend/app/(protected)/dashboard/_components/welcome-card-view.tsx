"use client";

// ส่วนแสดงผลของการ์ดต้อนรับ + ช่องค้นหา (แยกจาก welcome-card.tsx 18 ต.ค. 2026 ให้เดโมหน้า login ใช้หน้าตัวจริงได้)
// รับข้อมูลและ callback ผ่าน props อย่างเดียว — ห้ามเรียก API / router / toast ในไฟล์นี้ (scripts/check-demo-imports.mjs)
import type { ReactNode } from "react";
import { FolderKanban, ListTodo, MessageCircle, Plus, Search, TriangleAlert } from "lucide-react";
import ViewLink from "@/components/ui/view-link";
import HeroEyebrow from "@/components/ui/hero-eyebrow";
import { buttonClass } from "@/components/ui/button";
import { PROJECT_STATUS } from "../_labels";
import type { SearchResults } from "../_types";

type Counter = { label: string; value: number; note?: string; icon: typeof ListTodo; href?: string };

export type WelcomeCardViewProps = {
    firstName: string | null;
    // ชั่วโมงตอนนี้ (0–23) ใช้เลือกคำทักทาย — หน้าจริงส่งเวลาเครื่อง เดโมส่งค่าคงที่
    hour: number;
    activeProjectCount: number;
    myTaskCount: number;
    overdueCount: number;
    openIssueCount: number;
    unreadChatCount: number;
    canCreateProject: boolean;
    // ไม่มีสิทธิ์ดูโปรเจกต์ = แสดงแค่คำทักทาย (เหมือนเดิมที่ซ่อนส่วนภาพรวมทั้งหมด)
    hasProjectAccess: boolean;
    // ช่องค้นหา (DashboardSearchView ที่ต่อข้อมูลแล้ว)
    search: ReactNode;
};

function greetingOf(hour: number) {
    if (hour < 12) return "สวัสดีตอนเช้า";
    if (hour < 17) return "สวัสดีตอนบ่าย";
    return "สวัสดีตอนเย็น";
}

export default function WelcomeCardView(props: WelcomeCardViewProps) {
    const counters: Counter[] = [
        { label: "โปรเจกต์ที่กำลังทำ", value: props.activeProjectCount, icon: FolderKanban, href: "/projects" },
        {
            label: "งานของฉัน",
            value: props.myTaskCount,
            note: props.overdueCount > 0 ? `เลยกำหนด ${props.overdueCount} งาน` : undefined,
            icon: ListTodo,
        },
        { label: "ปัญหาที่เปิดอยู่", value: props.openIssueCount, icon: TriangleAlert },
        { label: "ข้อความที่ยังไม่อ่าน", value: props.unreadChatCount, icon: MessageCircle },
    ];

    return (
        <section className="surface-hero p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="grid min-w-0 gap-1.5">
                    <HeroEyebrow>{greetingOf(props.hour)}</HeroEyebrow>
                    <h1 className="text-2xl font-medium text-gray-900 sm:text-3xl">{props.firstName ? `คุณ${props.firstName}` : "แดชบอร์ด"}</h1>
                    <p className="text-sm text-gray-500">ภาพรวมงานที่เกี่ยวกับคุณวันนี้ · กดที่รายการเพื่อไปยังงานนั้นได้ทันที</p>
                </div>
                {props.canCreateProject && (
                    <ViewLink href="/projects/create" className={buttonClass("primary")}>
                        <Plus size={16} />
                        สร้างโปรเจกต์
                    </ViewLink>
                )}
            </div>

            {props.hasProjectAccess && props.search}

            <div className={`mt-5 grid-cols-2 gap-3 lg:grid-cols-4 ${props.hasProjectAccess ? "grid" : "hidden"}`}>
                {counters.map((counter) => {
                    const Icon = counter.icon;
                    const content = (
                        <>
                            <span className="flex items-center gap-2 text-xs text-gray-500">
                                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                                    <Icon size={15} />
                                </span>
                                {counter.label}
                            </span>
                            <span className="text-3xl font-medium text-gray-900 tabular-nums">{counter.value}</span>
                            <span className={`text-xs ${counter.note ? "text-red-600" : "text-gray-400"}`}>{counter.note ?? " "}</span>
                        </>
                    );
                    const className = "hero-tile grid gap-1.5 p-4";
                    return counter.href ? (
                        <ViewLink key={counter.label} href={counter.href} className={`${className} hover:-translate-y-0.5 hover:border-blue-200 hover:bg-white hover:shadow-card`}>
                            {content}
                        </ViewLink>
                    ) : (
                        <div key={counter.label} className={className}>
                            {content}
                        </div>
                    );
                })}
            </div>
        </section>
    );
}

export type DashboardSearchViewProps = {
    query: string;
    // null = กำลังค้นหา
    results: SearchResults | null;
    isOpen: boolean;
    onQueryChange: (query: string) => void;
    onFocus: () => void;
    onBlur: () => void;
    onSelectProject: (projectId: string) => void;
    onSelectTask: (projectId: string, taskId: string) => void;
};

/** ช่องค้นหาโปรเจกต์/งาน + รายการผลลัพธ์ */
export function DashboardSearchView(props: DashboardSearchViewProps) {
    const { query, results } = props;
    return (
        <div className="relative mt-5 max-w-xl">
            <Search
                size={16}
                className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-gray-400"
            />
            <input
                type="text"
                value={query}
                onChange={(event) => props.onQueryChange(event.target.value)}
                onFocus={props.onFocus}
                onBlur={props.onBlur}
                placeholder="ค้นหาโปรเจกต์หรืองาน..."
                aria-label="ค้นหาโปรเจกต์หรืองาน"
                className="h-11 w-full rounded-xl border border-gray-200 bg-white pr-3 pl-10 text-sm text-gray-800 shadow-xs placeholder:text-gray-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-500/15 focus:outline-none"
            />
            {props.isOpen && query.trim() && (
                <div className="absolute z-20 mt-2 max-h-80 w-full overflow-y-auto rounded-2xl border border-gray-200 bg-white p-1.5 text-gray-800 shadow-float">
                    {!results ? (
                        <p className="px-3 py-3 text-sm text-gray-500">กำลังค้นหา...</p>
                    ) : results.projects.length === 0 && results.tasks.length === 0 ? (
                        <p className="px-3 py-3 text-sm text-gray-500">
                            ไม่พบโปรเจกต์หรืองานที่ตรงกับ &quot;{query.trim()}&quot;
                        </p>
                    ) : (
                        <>
                            {results.projects.length > 0 && (
                                <p className="px-3 pt-2 pb-1 text-xs text-gray-400">โปรเจกต์</p>
                            )}
                            {results.projects.map((project) => (
                                <button
                                    key={project.project_id}
                                    type="button"
                                    onClick={() => props.onSelectProject(project.project_id)}
                                    className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-blue-50"
                                >
                                    <span className="truncate">{project.project_name}</span>
                                    <span className="shrink-0 text-xs text-gray-500">
                                        {PROJECT_STATUS[project.project_status].label}
                                    </span>
                                </button>
                            ))}
                            {results.tasks.length > 0 && <p className="px-3 pt-2 pb-1 text-xs text-gray-400">งาน</p>}
                            {results.tasks.map((task) => (
                                <button
                                    key={task.task_id}
                                    type="button"
                                    onClick={() => props.onSelectTask(task.project_id, task.task_id)}
                                    className="grid w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-blue-50"
                                >
                                    <span className="truncate">{task.task_title}</span>
                                    <span className="truncate text-xs text-gray-500">{task.project_name}</span>
                                </button>
                            ))}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
