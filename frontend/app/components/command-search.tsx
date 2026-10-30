"use client";

// หน้าต่างค้นหาโปรเจกต์และงาน (เปิดจากแถบข้าง หรือกด Ctrl K / ⌘K) — ใช้ API ค้นหาของแดชบอร์ดที่มีอยู่แล้ว (/dashboard/search)
// ผลลัพธ์อยู่ในขอบเขตสิทธิ์ของผู้ใช้ (backend กรองให้: เห็นทุกโปรเจกต์ หรือเฉพาะที่เป็นสมาชิก)
// คีย์บอร์ด: พิมพ์ได้ทันที · ↑↓ เลือก · Enter เปิด · Esc ปิด
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, FolderKanban, ListChecks, Search } from "lucide-react";
import { apiFetch } from "@/lib/api";

type SearchResponse = {
    projects: { project_id: string; project_name: string; project_status: string }[];
    tasks: {
        task_id: string;
        task_title: string;
        task_parent_id: string | null;
        project_id: string;
        project_name: string;
    }[];
};

type ResultItem = {
    key: string;
    kind: "project" | "task";
    title: string;
    subtitle: string;
    href: string;
};

const SEARCH_DELAY_MS = 250;

function toResultItems(response: SearchResponse): ResultItem[] {
    const projects: ResultItem[] = response.projects.map((project) => ({
        key: `project-${project.project_id}`,
        kind: "project",
        title: project.project_name,
        subtitle: "โปรเจกต์",
        href: `/projects/view?id=${project.project_id}`,
    }));
    const tasks: ResultItem[] = response.tasks.map((task) => ({
        key: `task-${task.task_id}`,
        kind: "task",
        title: task.task_title,
        subtitle: `${task.task_parent_id ? "งานย่อย" : "งาน"} ใน ${task.project_name}`,
        href: `/projects/view?id=${task.project_id}&taskId=${task.task_id}`,
    }));
    return [...projects, ...tasks];
}

export default function CommandSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
    const router = useRouter();
    const inputRef = useRef<HTMLInputElement>(null);
    const listId = useId();
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<ResultItem[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [activeIndex, setActiveIndex] = useState(0);

    const trimmedQuery = query.trim();

    // หน่วงก่อนค้นหา ไม่ยิงทุกตัวอักษร · คำค้นเปลี่ยนระหว่างรอ = ทิ้งผลของคำค้นเก่า
    useEffect(() => {
        if (!open || !trimmedQuery) return;
        let isOutdated = false;
        const timer = setTimeout(async () => {
            setIsSearching(true);
            const { data, error } = await apiFetch<SearchResponse>(
                `/dashboard/search?q=${encodeURIComponent(trimmedQuery)}`,
            );
            if (isOutdated) return;
            setIsSearching(false);
            setErrorMessage(error ? error.message : null);
            setResults(data ? toResultItems(data) : []);
            setActiveIndex(0);
        }, SEARCH_DELAY_MS);
        return () => {
            isOutdated = true;
            clearTimeout(timer);
        };
    }, [open, trimmedQuery]);

    useEffect(() => {
        if (open) inputRef.current?.focus();
    }, [open]);

    const visibleResults = useMemo(() => (trimmedQuery ? results : []), [results, trimmedQuery]);

    function close() {
        setQuery("");
        setResults([]);
        setErrorMessage(null);
        onClose();
    }

    function openResult(item: ResultItem) {
        close();
        router.push(item.href);
    }

    function handleKeyDown(event: React.KeyboardEvent) {
        if (event.key === "Escape") {
            close();
            return;
        }
        if (visibleResults.length === 0) return;
        if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((index) => (index + 1) % visibleResults.length);
        }
        if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((index) => (index - 1 + visibleResults.length) % visibleResults.length);
        }
        if (event.key === "Enter") {
            event.preventDefault();
            openResult(visibleResults[activeIndex]);
        }
    }

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-[60] flex items-start justify-center bg-gray-900/35 px-4 pt-[12dvh] backdrop-blur-sm"
            onClick={close}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label="ค้นหาโปรเจกต์และงาน"
                className="w-full max-w-2xl overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-float"
                onClick={(event) => event.stopPropagation()}
                onKeyDown={handleKeyDown}
            >
                <div className="flex items-center gap-3 border-b border-gray-100 px-5">
                    <Search size={18} className="shrink-0 text-gray-400" />
                    <input
                        ref={inputRef}
                        type="search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="ค้นหาชื่อโปรเจกต์ หรือชื่องาน"
                        role="combobox"
                        aria-expanded={visibleResults.length > 0}
                        aria-controls={listId}
                        aria-activedescendant={visibleResults[activeIndex] ? `${listId}-${activeIndex}` : undefined}
                        className="h-14 flex-1 bg-transparent text-base font-light text-gray-900 outline-none placeholder:text-gray-400"
                    />
                    <kbd className="rounded-md border border-b-2 border-gray-200 px-1.5 text-[0.7rem] text-gray-500">
                        Esc
                    </kbd>
                </div>

                <div className="max-h-[55dvh] overflow-y-auto p-2">
                    {!trimmedQuery && (
                        <p className="px-3 py-6 text-center text-sm text-gray-400">
                            พิมพ์ชื่อโปรเจกต์หรืองานที่ต้องการ (เห็นเฉพาะโปรเจกต์ที่คุณมีสิทธิ์ดู)
                        </p>
                    )}
                    {trimmedQuery && isSearching && visibleResults.length === 0 && (
                        <p className="px-3 py-6 text-center text-sm text-gray-400">กำลังค้นหา...</p>
                    )}
                    {trimmedQuery && errorMessage && (
                        <p className="px-3 py-6 text-center text-sm text-red-600">{errorMessage}</p>
                    )}
                    {trimmedQuery && !isSearching && !errorMessage && visibleResults.length === 0 && (
                        <p className="px-3 py-6 text-center text-sm text-gray-400">
                            ไม่พบโปรเจกต์หรืองานที่ชื่อมีคำว่า &quot;{trimmedQuery}&quot;
                        </p>
                    )}
                    <ul id={listId} role="listbox" className="grid gap-0.5">
                        {visibleResults.map((item, index) => {
                            const Icon = item.kind === "project" ? FolderKanban : ListChecks;
                            const isActive = index === activeIndex;
                            return (
                                <li
                                    key={item.key}
                                    id={`${listId}-${index}`}
                                    role="option"
                                    aria-selected={isActive}
                                    onMouseEnter={() => setActiveIndex(index)}
                                    onClick={() => openResult(item)}
                                    className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 ${isActive ? "bg-blue-50" : ""}`}
                                >
                                    <span
                                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${isActive ? "bg-white text-blue-600" : "bg-gray-100 text-gray-500"}`}
                                    >
                                        <Icon size={17} />
                                    </span>
                                    <span className="grid min-w-0 flex-1">
                                        <span className="truncate text-sm text-gray-900">{item.title}</span>
                                        <span className="truncate text-xs text-gray-400">{item.subtitle}</span>
                                    </span>
                                    {isActive && <CornerDownLeft size={15} className="shrink-0 text-blue-500" />}
                                </li>
                            );
                        })}
                    </ul>
                </div>
            </div>
        </div>
    );
}
