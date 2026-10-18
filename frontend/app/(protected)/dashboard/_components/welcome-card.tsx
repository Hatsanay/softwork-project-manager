"use client";

// การ์ดต้อนรับ (ฟ้าไล่เฉด + ลายตารางจาง) — ทักทาย · ค้นหาโปรเจกต์/งาน · ตัวเลขสรุป 4 ช่องแบบกระจก
// หน้าตาอยู่ที่ welcome-card-view.tsx (เดโมหน้า login ใช้ตัวเดียวกัน) · ไฟล์นี้ = เวลาเครื่อง + ค้นหาผ่าน API + เปลี่ยนหน้า
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { projectLink, taskLink } from "../_labels";
import type { SearchResults } from "../_types";
import WelcomeCardView, { DashboardSearchView, type WelcomeCardViewProps } from "./welcome-card-view";

const SEARCH_DELAY_MS = 300;

export default function WelcomeCard(props: Omit<WelcomeCardViewProps, "hour" | "search">) {
    return <WelcomeCardView {...props} hour={new Date().getHours()} search={<DashboardSearch />} />;
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
        <DashboardSearchView
            query={query}
            results={results}
            isOpen={isOpen}
            onQueryChange={setQuery}
            onFocus={() => {
                if (blurTimer.current) clearTimeout(blurTimer.current);
                setIsOpen(true);
            }}
            onBlur={() => {
                blurTimer.current = setTimeout(() => setIsOpen(false), 150);
            }}
            onSelectProject={(projectId) => go(projectLink(projectId))}
            onSelectTask={(projectId, taskId) => go(taskLink(projectId, taskId))}
        />
    );
}
