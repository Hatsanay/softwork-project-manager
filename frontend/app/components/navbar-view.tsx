"use client";

// ส่วนแสดงผลของแถบบน (แยกจาก navbar.tsx 18 ต.ค. 2026 ให้เดโมหน้า login ใช้แถบบนตัวจริงได้)
// รับเส้นทางหน้า (breadcrumb) และ callback ผ่าน props — ห้ามเรียก API / router ในไฟล์นี้ (scripts/check-demo-imports.mjs)
import type { ReactNode, Ref } from "react";
import Image from "next/image";
import { ChevronDown, ChevronRight, Menu } from "lucide-react";

export type NavbarViewProps = {
    breadcrumbs: string[];
    firstName: string;
    avatarUrl: string | null;
    isMenuOpen: boolean;
    onToggleMenu: () => void;
    onOpenMobileMenu: () => void;
    menuRef?: Ref<HTMLDivElement>;
    // เมนูผู้ใช้ที่กางลงมา (โปรไฟล์ / ออกจากระบบ)
    userMenu?: ReactNode;
};

export default function NavbarView({
    breadcrumbs,
    firstName,
    avatarUrl,
    isMenuOpen,
    onToggleMenu,
    onOpenMobileMenu,
    menuRef,
    userMenu,
}: NavbarViewProps) {
    return (
        <header className="sticky top-0 z-30 px-4 pt-3.5 sm:px-6 lg:px-8">
            <div className="flex h-14 items-center gap-3 rounded-2xl border border-gray-200/80 bg-white/75 pl-3 pr-2 shadow-xs backdrop-blur-xl backdrop-saturate-150 sm:pl-4">
                <button
                    type="button"
                    onClick={onOpenMobileMenu}
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

                <div ref={menuRef} className="relative">
                    <button
                        type="button"
                        onClick={onToggleMenu}
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

                    {isMenuOpen && userMenu}
                </div>
            </div>
        </header>
    );
}
