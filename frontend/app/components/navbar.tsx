"use client";

// แถบบน (UI ใหม่ 13 ต.ค. 2026) — การ์ดกระจกลอยเหนือเนื้อหา: ปุ่มเปิดเมนู (มือถือ) · เส้นทางหน้า · เมนูผู้ใช้
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, LogOut, Menu, UserRound } from "lucide-react";
import { logout } from "@/app/logout";
import { findBreadcrumbs } from "./bit";
import { useSidebar } from "./sidebar-context";

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
        <header className="sticky top-0 z-30 px-4 pt-3.5 sm:px-6 lg:px-8">
            <div className="flex h-14 items-center gap-3 rounded-2xl border border-gray-200/80 bg-white/75 pl-3 pr-2 shadow-xs backdrop-blur-xl backdrop-saturate-150 sm:pl-4">
                <button
                    type="button"
                    onClick={() => setMobileOpen(true)}
                    className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 md:hidden"
                    aria-label="เปิดเมนู"
                >
                    <Menu size={20} />
                </button>

                <nav aria-label="ตำแหน่งปัจจุบัน" className="min-w-0 flex-1">
                    <ol className="flex min-w-0 items-center gap-1.5 text-sm">
                        {breadcrumbs.map((label, index) => {
                            const isLast = index === breadcrumbs.length - 1;
                            return (
                                <li
                                    key={`${label}-${index}`}
                                    className={`flex min-w-0 items-center gap-1.5 ${isLast ? "" : "hidden sm:flex"}`}
                                >
                                    {index > 0 && (
                                        <ChevronRight size={14} className="shrink-0 text-gray-300" aria-hidden="true" />
                                    )}
                                    <span
                                        className={`truncate ${isLast ? "text-gray-800" : "text-gray-400"}`}
                                        aria-current={isLast ? "page" : undefined}
                                    >
                                        {label}
                                    </span>
                                </li>
                            );
                        })}
                    </ol>
                </nav>

                <div ref={dropdownRef} className="relative">
                    <button
                        type="button"
                        onClick={() => setIsMenuOpen((open) => !open)}
                        aria-haspopup="menu"
                        aria-expanded={isMenuOpen}
                        className="flex items-center gap-2 rounded-full border border-gray-200 bg-white py-1 pl-1 pr-2.5 text-sm transition hover:border-gray-300"
                    >
                        <Image
                            src={avatarUrl ?? "/defult.png"}
                            alt=""
                            width={30}
                            height={30}
                            unoptimized={!!avatarUrl}
                            className="h-7.5 w-7.5 shrink-0 rounded-full object-cover"
                        />
                        <span className="hidden max-w-40 truncate text-gray-700 sm:inline">{firstName}</span>
                        <ChevronDown
                            size={14}
                            className={`text-gray-400 transition-transform ${isMenuOpen ? "rotate-180" : ""}`}
                        />
                    </button>

                    {isMenuOpen && (
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
                    )}
                </div>
            </div>
        </header>
    );
}
