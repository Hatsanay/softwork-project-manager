"use client";

// แถบบน (UI ใหม่ 13 ต.ค. 2026) — การ์ดกระจกลอยเหนือเนื้อหา: ปุ่มเปิดเมนู (มือถือ) · เส้นทางหน้า · เมนูผู้ใช้
// หน้าตาอยู่ที่ navbar-view.tsx · ไฟล์นี้ = อ่านหน้าปัจจุบัน + เปิด/ปิดเมนูผู้ใช้ + ออกจากระบบ
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LogOut, UserRound } from "lucide-react";
import { logout } from "@/app/logout";
import { findBreadcrumbs } from "./bit";
import { useSidebar } from "./sidebar-context";
import NavbarView from "./navbar-view";

// หน้าที่ไม่ได้อยู่ในเมนูด้านข้าง
const EXTRA_BREADCRUMBS: Record<string, string[]> = {
    "/profile": ["โปรไฟล์"],
};

export default function Navbar({
    fullname = "",
    avatarUrl = null,
    roleName = "",
}: {
    fullname?: string;
    avatarUrl?: string | null;
    roleName?: string;
}) {
    const { setMobileOpen } = useSidebar();
    const pathname = usePathname();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const breadcrumbs = EXTRA_BREADCRUMBS[pathname] ?? findBreadcrumbs(pathname);
    const firstName = fullname.trim().split(/\s+/)[0] ?? "";

    // ปิดเมนูผู้ใช้เมื่อคลิกนอกเมนู หรือกด Esc
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setIsMenuOpen(false);
        }
        function handleEscape(event: KeyboardEvent) {
            if (event.key === "Escape") setIsMenuOpen(false);
        }
        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("keydown", handleEscape);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", handleEscape);
        };
    }, []);

    return (
        <NavbarView
            breadcrumbs={breadcrumbs}
            firstName={firstName}
            avatarUrl={avatarUrl}
            isMenuOpen={isMenuOpen}
            onToggleMenu={() => setIsMenuOpen((open) => !open)}
            onOpenMobileMenu={() => setMobileOpen(true)}
            menuRef={dropdownRef}
            userMenu={
                <div
                    role="menu"
                    className="absolute right-0 top-full z-50 mt-2 w-60 rounded-2xl border border-gray-200 bg-white p-1.5 shadow-float"
                >
                    <div className="mb-1 rounded-xl bg-gray-50 px-3 py-2.5">
                        <p className="text-xs text-gray-400">เข้าสู่ระบบเป็น</p>
                        <p className="truncate text-sm font-medium text-gray-900">{fullname}</p>
                        {roleName && <p className="truncate text-xs text-gray-500">{roleName}</p>}
                    </div>
                    <Link
                        href="/profile"
                        role="menuitem"
                        onClick={() => setIsMenuOpen(false)}
                        className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-50"
                    >
                        <UserRound size={16} className="text-gray-400" />
                        โปรไฟล์ของฉัน
                    </Link>
                    <form action={logout}>
                        <button
                            type="submit"
                            role="menuitem"
                            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-red-600 transition hover:bg-red-50"
                        >
                            <LogOut size={16} />
                            ออกจากระบบ
                        </button>
                    </form>
                </div>
            }
        />
    );
}
