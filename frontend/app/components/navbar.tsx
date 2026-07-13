"use client";

import Link from "next/link";
import Image from "next/image";
import { Menu, ChevronDown, LogOut, UserRound } from "lucide-react";
import { logout } from "@/app/logout";
import { theme } from "@/app/constans";
import { useSidebar } from "./sidebar-context";
import { useState, useRef, useEffect } from "react";

export default function Navbar({
    fullname = "", avatarUrl = null, roleName = "",
}: { fullname?: string; avatarUrl?: string | null; roleName?: string }) {
    const { setMobileOpen } = useSidebar();
    const [open, setOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // ปิด dropdown เมื่อคลิกนอก
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <header className={`h-16 ${theme.navbar.bg} flex items-center justify-between px-4 md:px-6`}>
            {/* Left */}
            <div className="flex items-center gap-2 sm:gap-3">
                <button
                    onClick={() => setMobileOpen(true)}
                    className="md:hidden flex h-8 w-8 items-center justify-center rounded-lg text-blue-500 hover:bg-blue-50 transition-colors"
                    aria-label="เปิดเมนู"
                >
                    <Menu size={20} />
                </button>
                {/* <Link href="/dashboard" className={`text-xl font-bold ${theme.navbar.brandText}`}>
                    Softwork Development
                </Link> */}
            </div>

            {/* Right */}
            <div className="flex items-center gap-2 sm:gap-3">
                {/* Profile dropdown */}
                <div ref={dropdownRef} className="relative">
                    <button
                        onClick={() => setOpen((v) => !v)}
                        className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-100 transition-colors"
                    >
                        <Image
                            src={avatarUrl ?? "/defult.png"}
                            alt={fullname}
                            width={32}
                            height={32}
                            unoptimized={!!avatarUrl}
                            className="rounded-full object-cover border border-gray-200 shrink-0"
                        />
                        <span className="hidden sm:flex flex-col items-start leading-tight">
                            <span className={`text-sm ${theme.navbar.userText}`}>{fullname}</span>
                            {roleName && (
                                <span className="text-xs text-gray-400">{roleName}</span>
                            )}
                        </span>
                        <ChevronDown
                            size={14}
                            className={`text-gray-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
                        />
                    </button>

                    {open && (
                        <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-gray-100 rounded-xl shadow-lg py-1 z-50">
                            {/* Profile info */}
                            <div className="px-4 py-2.5 border-b border-gray-100">
                                <p className="text-xs text-gray-400">ล็อกอินเป็น</p>
                                <p className="text-sm font-medium text-gray-700 truncate">{fullname}</p>
                                {roleName && (
                                    <p className="text-xs text-gray-400 truncate">{roleName}</p>
                                )}
                            </div>

                            {/* Menu items */}
                            <Link
                                href="/profile"
                                onClick={() => setOpen(false)}
                                className="flex items-center gap-2.5 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                            >
                                <UserRound size={15} />
                                โปรไฟล์
                            </Link>

                            {/* Logout */}
                            <form action={logout}>
                                <button
                                    type="submit"
                                    className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors"
                                >
                                    <LogOut size={15} />
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
