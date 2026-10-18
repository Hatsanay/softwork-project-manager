"use client";

// แถบเมนูด้านข้าง (UI ใหม่ 13 ต.ค. 2026 — docs/plans/2026-10-13-ui-refresh.md) · หน้าตาอยู่ที่ sidebar-panel.tsx (ไฟล์นี้ = สถานะ ย่อ/กาง ลิ้นชักมือถือ ค้นหา)
// การ์ดลอยมุมโค้งใหญ่ · แบ่งหัวกลุ่ม "เมนูหลัก / ผู้ดูแลระบบ" (แค่การจัดหน้า ไม่ได้เปลี่ยนเมนูหรือสิทธิ์) · เมนูที่เลือกเป็นแคปซูลฟ้าไล่เฉด
// ย่อแถบได้บนจอคอม (จำไว้ใน cookie) — ตอนย่อแสดงชื่อเมนูเมื่อชี้ไอคอน (ข้อยกเว้นเดียวของกติกาห้าม tooltip)
// มือถือ: เปิดเป็นลิ้นชักจากซ้าย ปิดด้วยปุ่ม ×, Esc, แตะนอกเมนู หรือเลือกเมนู
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { MenuItem } from "./bit";
import { useSidebar } from "./sidebar-context";
import CommandSearch from "./command-search";
import SidebarPanel, { getInitialOpen, type SidebarUser } from "./sidebar-panel";

type SidebarClientProps = {
    items: MenuItem[];
    initialCollapsed: boolean;
    canSearch: boolean;
    user: SidebarUser;
};

export default function SidebarClient({ items, initialCollapsed, canSearch, user }: SidebarClientProps) {
    const [collapsed, setCollapsed] = useState(initialCollapsed);
    const pathname = usePathname();
    const [openItems, setOpenItems] = useState<Set<string>>(() => getInitialOpen(items, pathname));
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const { mobileOpen, setMobileOpen } = useSidebar();

    // Ctrl+K / ⌘K เปิดช่องค้นหา · Esc ปิดลิ้นชักบนมือถือ
    useEffect(() => {
        function handleKeyDown(event: KeyboardEvent) {
            const isSearchShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k";
            if (isSearchShortcut && canSearch) {
                event.preventDefault();
                setIsSearchOpen(true);
            }
            if (event.key === "Escape") setMobileOpen(false);
        }
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [canSearch, setMobileOpen]);

    function toggleCollapsed() {
        setCollapsed((previous) => {
            const next = !previous;
            document.cookie = `sidebar-collapsed=${next}; path=/; max-age=31536000`;
            return next;
        });
    }

    function toggleSubmenu(href: string) {
        setOpenItems((previous) => {
            const next = new Set(previous);
            if (next.has(href)) next.delete(href);
            else next.add(href);
            return next;
        });
    }

    function closeMobile() {
        if (mobileOpen) setMobileOpen(false);
    }

    function renderPanel(isCompact: boolean, isMobile: boolean) {
        return (
            <SidebarPanel
                items={items}
                pathname={pathname}
                openItems={openItems}
                isCompact={isCompact}
                isMobile={isMobile}
                canSearch={canSearch}
                user={user}
                onToggleSubmenu={toggleSubmenu}
                onToggleCollapsed={toggleCollapsed}
                onOpenSearch={() => setIsSearchOpen(true)}
                onCloseMobile={() => setMobileOpen(false)}
                onNavigate={closeMobile}
            />
        );
    }

    return (
        <>
            {/* มือถือ: ลิ้นชัก */}
            {mobileOpen && (
                <div
                    className="fixed inset-0 z-40 bg-gray-900/30 backdrop-blur-[2px] md:hidden"
                    onClick={() => setMobileOpen(false)}
                />
            )}
            <aside
                className={`fixed inset-y-0 left-0 z-50 w-[17.5rem] p-2.5 transition-transform duration-300 ease-out md:hidden ${
                    mobileOpen ? "translate-x-0" : "-translate-x-full"
                }`}
                inert={!mobileOpen}
            >
                {renderPanel(false, true)}
            </aside>

            {/* จอคอม: การ์ดลอยติดจอ */}
            <aside
                className={`sticky top-0 hidden h-screen shrink-0 py-3.5 pl-3.5 transition-[width] duration-300 ease-out md:block ${
                    collapsed ? "w-[5.75rem]" : "w-[17rem]"
                }`}
            >
                {renderPanel(collapsed, false)}
            </aside>

            {canSearch && <CommandSearch open={isSearchOpen} onClose={() => setIsSearchOpen(false)} />}
        </>
    );
}
