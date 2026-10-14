"use client";

// การ์ดต้อนรับ (ฟ้าไล่เฉด + ลายตารางจาง) — ทักทาย · ค้นหาโปรเจกต์/งาน · ตัวเลขสรุป 4 ช่องแบบกระจก
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FolderKanban, ListTodo, MessageCircle, Plus, Search, TriangleAlert } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { PROJECT_STATUS, projectLink, taskLink } from "../_labels";
import type { SearchResults } from "../_types";

type Counter = { label: string; value: number; note?: string; icon: typeof ListTodo; href?: string };

type WelcomeCardProps = {
    firstName: string | null;
    activeProjectCount: number;
    myTaskCount: number;
    overdueCount: number;
    openIssueCount: number;
    unreadChatCount: number;
    canCreateProject: boolean;
    // ไม่มีสิทธิ์ดูโปรเจกต์ = แสดงแค่คำทักทาย (เหมือนเดิมที่ซ่อนส่วนภาพรวมทั้งหมด)
    hasProjectAccess: boolean;
};

function greeting() {
    const hour = new Date().getHours();
    if (hour < 12) return "สวัสดีตอนเช้า";
    if (hour < 17) return "สวัสดีตอนบ่าย";
    return "สวัสดีตอนเย็น";
}

const SEARCH_DELAY_MS = 300;

export default function WelcomeCard(props: WelcomeCardProps) {
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
        <section
            className="relative overflow-hidden rounded-3xl bg-brand-grid p-5 text-white shadow-brand sm:p-7"
        >
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="grid gap-1">
                    <p className="text-sm text-blue-100">{greeting()}</p>
                    <h1 className="text-2xl font-medium">{props.firstName ? `คุณ${props.firstName}` : "แดชบอร์ด"}</h1>
                    <p className="text-sm text-blue-100">
                        ภาพรวมงานที่เกี่ยวกับคุณวันนี้ — กดที่รายการเพื่อไปยังงานนั้นได้ทันที
                    </p>
                </div>
                {props.canCreateProject && (
                    <Link
                        href="/projects/create"
                        className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-sm font-medium text-blue-600 shadow-sm transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40"
                    >
                        <Plus size={16} />
                        สร้างโปรเจกต์
                    </Link>
                )}
            </div>

            {props.hasProjectAccess && <DashboardSearch />}

            <div className={`mt-5 grid-cols-2 gap-3 lg:grid-cols-4 ${props.hasProjectAccess ? "grid" : "hidden"}`}>
                {counters.map((counter) => {
                    const Icon = counter.icon;
                    const content = (
                        <>
                            <span className="flex items-center gap-2 text-xs text-blue-50">
                                <Icon size={15} />
                                {counter.label}
                            </span>
                            <span className="text-3xl font-medium tabular-nums">{counter.value}</span>
                            <span className="text-xs text-blue-100">{counter.note ?? " "}</span>
                        </>
                    );
                    const className = "grid gap-1 rounded-2xl border border-white/20 bg-white/12 p-4 backdrop-blur-sm";
                    return counter.href ? (
                        <Link
                            key={counter.label}
                            href={counter.href}
                            className={`${className} transition hover:bg-white/20`}
                        >
                            {content}
                        </Link>
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

// ค้นหาโปรเจกต์/งาน (ค้นจากเซิร์ฟเวอร์ หน่วง 300ms กันยิงทุกตัวอักษร) — ทำงานเหมือนเดิม เปลี่ยนแค่หน้าตา
function DashboardSearch() {
    const router = useRouter();
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<SearchResults | null>(null);
    const [isOpen, setIsOpen] = useState(false);
    const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const trimmed = query.trim();
        const timer = setTimeout(async () => {
            if (!trimmed) {
                setResults(null);
                return;
            }
            const { data } = await apiFetch<SearchResults>(`/dashboard/search?q=${encodeURIComponent(trimmed)}`);
            if (data) setResults(data);
        }, SEARCH_DELAY_MS);
        return () => clearTimeout(timer);
    }, [query]);

    function go(url: string) {
        if (blurTimer.current) clearTimeout(blurTimer.current);
        setIsOpen(false);
        setQuery("");
        setResults(null);
        router.push(url);
    }

    return (
        <div className="relative mt-5 max-w-xl">
            <Search
                size={16}
                className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-gray-400"
            />
            <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onFocus={() => {
                    if (blurTimer.current) clearTimeout(blurTimer.current);
                    setIsOpen(true);
                }}
                onBlur={() => {
                    blurTimer.current = setTimeout(() => setIsOpen(false), 150);
                }}
                placeholder="ค้นหาโปรเจกต์หรืองาน..."
                aria-label="ค้นหาโปรเจกต์หรืองาน"
                className="h-11 w-full rounded-xl border border-white/30 bg-white pr-3 pl-10 text-sm text-gray-800 shadow-sm placeholder:text-gray-400 focus:ring-4 focus:ring-white/30 focus:outline-none"
            />
            {isOpen && query.trim() && (
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
                                    onClick={() => go(projectLink(project.project_id))}
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
                                    onClick={() => go(taskLink(task.project_id, task.task_id))}
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
