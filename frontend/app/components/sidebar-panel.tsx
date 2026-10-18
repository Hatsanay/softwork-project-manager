"use client";

// ส่วนแสดงผลของแถบเมนูด้านข้าง (แยกจาก sidebar-client.tsx 18 ต.ค. 2026 ให้เดโมหน้า login ใช้แถบเมนูตัวจริงได้)
// รับเส้นทางหน้าปัจจุบัน สถานะเปิด/ย่อ และ callback ผ่าน props — ห้ามเรียก API / router ในไฟล์นี้ (scripts/check-demo-imports.mjs)
import Image from "next/image";
import ViewLink from "@/components/ui/view-link";
import { initialsOf } from "@/components/ui/person-cell";
import {
    Building2,
    ChartColumn,
    ChevronDown,
    ChevronsLeft,
    ChevronsRight,
    FolderKanban,
    IdCard,
    LayoutDashboard,
    Search,
    Settings2,
    ShoppingBag,
    UsersRound,
    Wallet,
    X,
    type LucideIcon,
} from "lucide-react";
import type { MenuItem } from "./bit";

const ICONS: Record<string, LucideIcon> = {
    "/dashboard": LayoutDashboard,
    "/users": UsersRound,
    "/projects": FolderKanban,
    "/settings": Settings2,
    "/clients": Building2,
    "/sales": ShoppingBag,
    "/reports": ChartColumn,
    "/purchasing": Wallet,
    "/people": IdCard,
};

// เมนูของผู้ดูแลระบบ (จัดกลุ่มบนหน้าจอเท่านั้น — ใครเห็นเมนูไหนยังขึ้นกับสิทธิ์เหมือนเดิม)
const ADMIN_MENU_HREFS = new Set(["/users", "/settings"]);

export type SidebarUser = {
    fullname: string;
    roleName: string;
    avatarUrl: string | null;
};

export function matchesChild(pathname: string, child: MenuItem, siblings: MenuItem[]): boolean {
    if (pathname === child.href) return true;
    if (!pathname.startsWith(child.href + "/")) return false;
    // เมนูพี่น้องที่เจาะจงกว่าตรงอยู่แล้ว ไม่นับเมนูนี้
    return !siblings.some((s) => s.href !== child.href && pathname.startsWith(s.href));
}

/** กลุ่มเมนูที่ต้องกางไว้ตอนเปิดหน้า = กลุ่มที่มีเมนูย่อยตรงกับหน้าปัจจุบัน */
export function getInitialOpen(items: MenuItem[], pathname: string): Set<string> {
    const open = new Set<string>();
    for (const item of items) {
        const children = item.children ?? [];
        if (children.some((c) => matchesChild(pathname, c, children))) open.add(item.href);
    }
    return open;
}

const ITEM_BASE =
    "group/item relative flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-sm transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/20";
const ITEM_ACTIVE = "bg-brand-gradient font-medium text-white shadow-brand";
const ITEM_IDLE = "font-normal text-gray-500 hover:bg-gray-100 hover:text-gray-900";

export type SidebarPanelProps = {
    items: MenuItem[];
    pathname: string;
    openItems: Set<string>;
    isCompact: boolean;
    isMobile: boolean;
    canSearch: boolean;
    user: SidebarUser;
    onToggleSubmenu: (href: string) => void;
    onToggleCollapsed: () => void;
    onOpenSearch: () => void;
    onCloseMobile: () => void;
    // กดเมนูแล้ว (มือถือ: ปิดลิ้นชัก)
    onNavigate: () => void;
};

/** การ์ดแถบเมนู (ใช้ทั้งลิ้นชักมือถือและแถบข้างจอคอม) */
export default function SidebarPanel(props: SidebarPanelProps) {
    const { items, pathname, openItems, isCompact, isMobile, canSearch, user } = props;
    const mainItems = items.filter((item) => !ADMIN_MENU_HREFS.has(item.href));
    const adminItems = items.filter((item) => ADMIN_MENU_HREFS.has(item.href));

    function renderItem(item: MenuItem) {
        const Icon = ICONS[item.href] ?? LayoutDashboard;
        const children = item.children ?? [];
        const hasChildren = children.length > 0;
        const isOpen = openItems.has(item.href);
        const isChildActive = children.some((child) => matchesChild(pathname, child, children));
        const isActive = !hasChildren && (pathname === item.href || pathname.startsWith(item.href + "/"));
        const isHighlighted = isActive || (hasChildren && isChildActive && isCompact);

        return (
            <div key={item.href} className="relative">
                {hasChildren ? (
                    <button
                        type="button"
                        onClick={() => (isCompact ? props.onToggleCollapsed() : props.onToggleSubmenu(item.href))}
                        aria-expanded={isCompact ? undefined : isOpen}
                        aria-label={isCompact ? item.label : undefined}
                        className={`${ITEM_BASE} ${isHighlighted ? ITEM_ACTIVE : ITEM_IDLE} ${isCompact ? "justify-center" : ""}`}
                    >
                        <Icon size={18} className="shrink-0" />
                        {!isCompact && (
                            <>
                                <span className="flex-1 truncate text-left">{item.label}</span>
                                <ChevronDown
                                    size={15}
                                    className={`shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                                />
                            </>
                        )}
                        {isCompact && <CompactLabel label={item.label} />}
                    </button>
                ) : (
                    <ViewLink
                        href={item.href}
                        onClick={props.onNavigate}
                        aria-current={isActive ? "page" : undefined}
                        aria-label={isCompact ? item.label : undefined}
                        className={`${ITEM_BASE} ${isHighlighted ? ITEM_ACTIVE : ITEM_IDLE} ${isCompact ? "justify-center" : ""}`}
                    >
                        <Icon size={18} className="shrink-0" />
                        {!isCompact && <span className="truncate">{item.label}</span>}
                        {isCompact && <CompactLabel label={item.label} />}
                    </ViewLink>
                )}

                {hasChildren && !isCompact && isOpen && (
                    <div className="ml-5 mt-0.5 grid gap-0.5 border-l border-gray-200 pl-3">
                        {item.children!.map((child) => {
                            const isChildItemActive = matchesChild(pathname, child, item.children!);
                            return (
                                <ViewLink
                                    key={child.href}
                                    href={child.href}
                                    onClick={props.onNavigate}
                                    aria-current={isChildItemActive ? "page" : undefined}
                                    className={`${ITEM_BASE} py-1.5 ${isChildItemActive ? ITEM_ACTIVE : ITEM_IDLE}`}
                                >
                                    <span className="truncate">{child.label}</span>
                                </ViewLink>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    }

    return (
        // ตอนย่อไม่ซ่อนส่วนเกิน — ชื่อเมนูที่ลอยออกด้านขวาจะได้ไม่ถูกตัด
        <div
            className={`flex h-full flex-col rounded-3xl border border-gray-200 bg-white/90 shadow-card backdrop-blur-xl ${isCompact ? "" : "overflow-hidden"}`}
        >
            <div className={`flex items-center gap-3 px-4 pb-3 pt-4 ${isCompact ? "justify-center px-2" : ""}`}>
                <Image
                    src="/logo1.png"
                    alt="Softwork Development"
                    width={36}
                    height={36}
                    className="h-9 w-9 shrink-0 rounded-xl bg-white object-contain ring-1 ring-gray-200"
                />
                {!isCompact && (
                    <div className="min-w-0 flex-1 leading-tight">
                        <p className="truncate text-[0.8rem] font-semibold tracking-[0.16em] text-gray-700">SOFTWORK</p>
                        <p className="truncate text-xs text-gray-400">Project Manager</p>
                    </div>
                )}
                {isMobile && (
                    <button
                        type="button"
                        onClick={props.onCloseMobile}
                        aria-label="ปิดเมนู"
                        className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                    >
                        <X size={16} />
                    </button>
                )}
            </div>

            {canSearch && !isCompact && (
                <button
                    type="button"
                    onClick={props.onOpenSearch}
                    className="mx-3.5 mb-2 flex h-10 items-center gap-2 rounded-xl border border-transparent bg-gray-100 pl-3 pr-2 text-sm text-gray-400 transition hover:border-gray-200 hover:bg-white"
                >
                    <Search size={16} />
                    <span className="flex-1 truncate text-left">ค้นหาโปรเจกต์ งาน</span>
                    <kbd className="hidden rounded-md border border-b-2 border-gray-200 bg-white px-1.5 text-[0.7rem] text-gray-500 md:inline">
                        Ctrl K
                    </kbd>
                </button>
            )}
            {canSearch && isCompact && (
                <div className="relative mx-2 mb-2">
                    <button
                        type="button"
                        onClick={props.onOpenSearch}
                        aria-label="ค้นหาโปรเจกต์ งาน"
                        className={`${ITEM_BASE} ${ITEM_IDLE} justify-center`}
                    >
                        <Search size={18} />
                        <CompactLabel label="ค้นหา (Ctrl K)" />
                    </button>
                </div>
            )}

            <nav
                className={`flex flex-1 flex-col gap-5 pb-3 ${isCompact ? "overflow-visible px-2" : "overflow-y-auto px-3"}`}
                aria-label="เมนูหลัก"
            >
                <MenuGroup label="เมนูหลัก" isCompact={isCompact}>
                    {mainItems.map((item) => renderItem(item))}
                </MenuGroup>
                {adminItems.length > 0 && (
                    <MenuGroup label="ผู้ดูแลระบบ" isCompact={isCompact}>
                        {adminItems.map((item) => renderItem(item))}
                    </MenuGroup>
                )}
            </nav>

            <div
                className={`m-2.5 flex items-center gap-2.5 rounded-2xl bg-gray-50 p-2.5 ${isCompact ? "justify-center" : ""}`}
            >
                {user.avatarUrl ? (
                    <Image
                        src={user.avatarUrl}
                        alt=""
                        width={36}
                        height={36}
                        unoptimized
                        className="h-9 w-9 shrink-0 rounded-full object-cover ring-2 ring-white"
                    />
                ) : (
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-gray-600 to-gray-800 text-xs font-medium text-white">
                        {initialsOf(user.fullname)}
                    </span>
                )}
                {!isCompact && (
                    <div className="min-w-0 flex-1 leading-tight">
                        <p className="truncate text-sm font-medium text-gray-900">{user.fullname}</p>
                        {user.roleName && <p className="truncate text-xs text-gray-400">{user.roleName}</p>}
                    </div>
                )}
                {!isMobile && (
                    <button
                        type="button"
                        onClick={props.onToggleCollapsed}
                        aria-label={isCompact ? "ขยายแถบเมนู" : "ย่อแถบเมนู"}
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition hover:bg-white hover:text-gray-700 ${isCompact ? "hidden" : ""}`}
                    >
                        <ChevronsLeft size={16} />
                    </button>
                )}
            </div>
            {isCompact && !isMobile && (
                <button
                    type="button"
                    onClick={props.onToggleCollapsed}
                    aria-label="ขยายแถบเมนู"
                    className="mx-auto mb-3 flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                >
                    <ChevronsRight size={16} />
                </button>
            )}
        </div>
    );
}

function MenuGroup({ label, isCompact, children }: { label: string; isCompact: boolean; children: React.ReactNode }) {
    return (
        <div className="grid gap-0.5">
            {isCompact ? (
                <span className="mx-auto mb-1 h-px w-6 bg-gray-200" aria-hidden="true" />
            ) : (
                <p className="px-2.5 pb-1.5 text-[0.7rem] tracking-[0.06em] text-gray-400">{label}</p>
            )}
            {children}
        </div>
    );
}

// ชื่อเมนูตอนแถบย่อ — แสดงเมื่อชี้/โฟกัสไอคอน (ข้อยกเว้นเดียวของกติกาห้าม tooltip: เป็นแค่ชื่อเมนู กางแถบก็เห็น)
function CompactLabel({ label }: { label: string }) {
    return (
        <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs font-normal text-white opacity-0 shadow-float transition-opacity group-hover/item:opacity-100 group-focus-visible/item:opacity-100">
            {label}
        </span>
    );
}
