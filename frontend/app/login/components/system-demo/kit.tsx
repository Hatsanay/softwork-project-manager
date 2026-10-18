"use client";

// ชิ้นส่วนหน้าจอที่ฉากของเดโมใช้ร่วมกัน — แถบเมนูซ้าย + แถบบน เขียนตาม app/components/sidebar-client.tsx และ navbar.tsx
// แถบเมนูไม่มีการ์ดผู้ใช้ด้านล่าง (ชื่อผู้ใช้อยู่แถบบนแล้ว) เพื่อให้กลุ่มเมนูที่ยาวแสดงครบในจอสูง 640px
// ⚠ หน้าตาต้องตรงกับหน้าจริง (สี ขอบ ตัวอักษร) · ห้ามใช้ class ที่มี breakpoint (หน้าจอเสมือนกว้าง 1024px เสมอ)
import type { ReactNode } from "react";
import type { Waypoint } from "./desktop-screen";
import Image from "next/image";
import { buttonClass } from "@/components/ui/button";
import {
    ChartColumn,
    CheckCircle2,
    ChevronRight,
    Circle,
    Clock,
    FolderKanban,
    IdCard,
    LayoutDashboard,
    Search,
    Settings,
    ShoppingBag,
    Users,
    Wallet,
    type LucideIcon,
} from "lucide-react";

export type MenuKey = "dashboard" | "projects" | "sales" | "purchasing" | "people" | "reports" | "clients" | "settings";

// เมนูตาม app/components/bit.tsx (เฉพาะที่แสดงในแถบเมนู)
const MENU: { key: MenuKey; label: string; icon: LucideIcon; children?: string[] }[] = [
    { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { key: "projects", label: "โปรเจกต์", icon: FolderKanban },
    {
        key: "sales",
        label: "ขาย",
        icon: ShoppingBag,
        children: [
            "ใบเสนอราคา",
            "ใบแจ้งหนี้",
            "ใบวางบิล",
            "ใบลดหนี้",
            "ใบเสร็จรับเงิน",
            "ลูกหนี้คงค้าง",
            "สินค้า/บริการ",
        ],
    },
    {
        key: "purchasing",
        label: "จัดซื้อ",
        icon: Wallet,
        children: ["ค่าใช้จ่าย", "เบิกเงิน", "ใบสำคัญจ่าย", "50 ทวิ", "เจ้าหนี้คงค้าง", "รายงาน ภ.ง.ด.3/53", "ผู้ขาย"],
    },
    {
        key: "people",
        label: "บุคคล",
        icon: IdCard,
        children: ["ลงเวลาทำงาน", "การลา", "สลิปเงินเดือน", "พนักงาน", "รอบเงินเดือน", "ตั้งค่าบุคคล"],
    },
    { key: "reports", label: "รายงาน", icon: ChartColumn },
    { key: "clients", label: "จัดการลูกค้า", icon: Users },
    {
        key: "settings",
        label: "ตั้งค่าระบบ",
        icon: Settings,
        children: ["จัดการสิทธิ์", "จัดการแผนก", "ตำแหน่งในโปรเจกต์", "ข้อมูลบริษัท", "Log ข้อมูล"],
    },
];

const ITEM_BASE = "flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-sm";
const ITEM_ACTIVE = "bg-brand-gradient font-medium text-white shadow-brand";
const ITEM_IDLE = "font-normal text-gray-500";

/** หน้าจอของระบบ: แถบเมนูซ้าย (เปิดกลุ่มที่ใช้อยู่) + แถบบน (breadcrumb) + เนื้อหา */
export function DemoShell({
    menu,
    subMenu,
    crumbs,
    overlay,
    children,
}: {
    menu: MenuKey;
    subMenu?: string;
    crumbs: string[];
    // หน้าต่างยืนยันที่บังทั้งจอ (แบบ ConfirmDialog จริง)
    overlay?: ReactNode;
    children: ReactNode;
}) {
    return (
        <div className="absolute inset-0 flex gap-0 bg-gray-50 text-gray-700">
            <aside className="w-[13.5rem] shrink-0 py-3 pl-3">
                <div className="flex h-full flex-col rounded-3xl border border-gray-200 bg-white/90 shadow-card">
                    <div className="flex items-center gap-2.5 px-4 pb-3 pt-4">
                        <Image
                            src="/logo1.png"
                            alt=""
                            width={32}
                            height={32}
                            className="h-8 w-8 rounded-xl bg-white object-contain ring-1 ring-gray-200"
                        />
                        <div className="min-w-0 leading-tight">
                            <p className="text-[0.75rem] font-semibold tracking-[0.16em] text-gray-700">SOFTWORK</p>
                            <p className="text-[0.7rem] text-gray-400">Project Manager</p>
                        </div>
                    </div>
                    <div className="mx-3 mb-2 flex h-9 items-center gap-2 rounded-xl bg-gray-100 px-3 text-xs text-gray-400">
                        <Search size={14} />
                        ค้นหาโปรเจกต์ งาน
                    </div>
                    <nav className="grid min-h-0 content-start gap-0.5 overflow-hidden px-3">
                        {MENU.map((item) => {
                            const isActive = item.key === menu;
                            const Icon = item.icon;
                            const isGroupOpen = isActive && item.children && subMenu;
                            return (
                                <div key={item.key}>
                                    <div
                                        className={`${ITEM_BASE} ${isActive && !isGroupOpen ? ITEM_ACTIVE : isActive ? "font-medium text-gray-900" : ITEM_IDLE}`}
                                    >
                                        <Icon size={16} className="shrink-0" />
                                        <span className="truncate">{item.label}</span>
                                    </div>
                                    {isGroupOpen && (
                                        <div className="ml-5 mt-0.5 grid gap-0.5 border-l border-gray-200 pl-3">
                                            {item.children!.map((child) => (
                                                <div
                                                    key={child}
                                                    data-demo={`menu-${child}`}
                                                    className={`${ITEM_BASE} py-1.5 ${child === subMenu ? ITEM_ACTIVE : ITEM_IDLE}`}
                                                >
                                                    <span className="truncate">{child}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </nav>
                </div>
            </aside>
            <div className="flex min-w-0 flex-1 flex-col">
                <header className="px-5 pt-3">
                    <div className="flex h-12 items-center gap-2 rounded-2xl border border-gray-200/80 bg-white/75 px-4 shadow-xs">
                        <ol className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
                            {crumbs.map((crumb, index) => (
                                <li key={crumb} className="flex items-center gap-1.5">
                                    {index > 0 && <ChevronRight size={13} className="text-gray-300" />}
                                    <span className={index === crumbs.length - 1 ? "text-gray-800" : "text-gray-400"}>
                                        {crumb}
                                    </span>
                                </li>
                            ))}
                        </ol>
                        <span className="flex items-center gap-2 rounded-full border border-gray-200 bg-white py-0.5 pl-0.5 pr-2.5 text-xs text-gray-700">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-linear-to-br from-gray-600 to-gray-800 text-[0.6rem] text-white">
                                สม
                            </span>
                            สมชาย
                        </span>
                    </div>
                </header>
                <main className="relative min-h-0 flex-1 overflow-hidden px-5 py-4">{children}</main>
            </div>
            {overlay}
        </div>
    );
}

/** เนื้อหา 1 หน้า: ค่อยๆ ขึ้นตอนเปลี่ยนหน้า (key เปลี่ยน = เล่นใหม่) */
export function DemoPage({ pageKey, children }: { pageKey: string; children: ReactNode }) {
    return (
        <div key={pageKey} className="demo-page-in grid content-start gap-4">
            {children}
        </div>
    );
}

/** หัวหน้า: eyebrow + ชื่อ + ป้ายสถานะ (ตาม components/ui/page-header.tsx) */
export function DemoHeader({
    eyebrow,
    title,
    description,
    pills,
}: {
    eyebrow: string;
    title: string;
    description?: string;
    pills?: ReactNode;
}) {
    return (
        <div className="flex items-end justify-between gap-4">
            <div className="grid gap-0.5">
                <p className="text-[0.7rem] font-medium text-blue-600">{eyebrow}</p>
                <p className="text-xl font-medium text-gray-900">{title}</p>
                {description && <p className="text-xs text-gray-500">{description}</p>}
            </div>
            {pills && <div className="flex items-center gap-1.5">{pills}</div>}
        </div>
    );
}

/** แจ้งเตือนมุมบน (แบบ sonner ที่หน้าเว็บใช้) */
export function DemoToast({ show, children }: { show: boolean; children: ReactNode }) {
    return (
        <div
            className={`absolute right-5 top-3 z-20 flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-xs text-gray-800 shadow-float transition-all duration-300 ${
                show ? "translate-y-0 opacity-100" : "-translate-y-3 opacity-0"
            }`}
        >
            <CheckCircle2 size={15} className="shrink-0 text-green-600" />
            {children}
        </div>
    );
}

/** บรรทัด ป้าย — ยอด (ใช้ในบล็อกยอดรวม) */
export function AmountRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
    return (
        <div className={`flex justify-between gap-3 ${strong ? "font-medium text-gray-900" : "text-gray-600"}`}>
            <span>{label}</span>
            <span className="tabular-nums">{value}</span>
        </div>
    );
}

// ── ชนิดของฉากและช่วงของเรื่อง ──────────────────────────────────────────────────────────────────────────

/** ช่วงของงานในเรื่องที่เดโมเล่า (รับงาน → ทำงาน → เก็บเงิน → จ่ายเงิน → เงินเดือน → สรุป) แสดงหน้าคำอธิบายฉาก */
export const STORY_PHASES = {
    start: "เริ่มวันทำงาน",
    deal: "รับงาน",
    work: "ทำงาน",
    collect: "เก็บเงิน",
    pay: "จ่ายเงิน",
    payroll: "เงินเดือน",
    summary: "สรุปกำไร",
    control: "ควบคุม",
} as const;

export type StoryPhase = keyof typeof STORY_PHASES;

export type Scene = {
    key: string;
    phase: StoryPhase;
    title: string;
    caption: string;
    // ที่อยู่บนแถบเบราว์เซอร์ — ฟังก์ชันเมื่อฉากเปลี่ยนหน้า (เช่น เปิดลิงก์ของลูกค้า)
    url: string | ((t: number) => string);
    duration: number;
    waypoints: Waypoint[];
    render: (t: number) => ReactNode;
};

// ── ชิ้นส่วนในฟอร์ม/หน้ารายละเอียด ──────────────────────────────────────────────────────────────────────

/** ปุ่มที่เพิ่งถูกกด ยุบลงนิดหนึ่ง (เหมือนกดจริง) */
export function pressed(t: number, at: number) {
    return t >= at && t < at + 220 ? "scale-[0.96]" : "";
}

/** ช่องกรอกแบบ FormField + inputClass · isTyping = กรอบฟ้าและเคอร์เซอร์กะพริบ */
export function Field({
    label,
    value,
    isTyping = false,
    align = "left",
}: {
    label: string;
    value: string;
    isTyping?: boolean;
    align?: "left" | "right";
}) {
    return (
        <div className="grid gap-1">
            <span className="text-gray-800">{label}</span>
            <span
                className={`flex h-9 items-center rounded-xl border bg-white px-3 tabular-nums ${align === "right" ? "justify-end" : ""} ${isTyping ? "border-blue-500 ring-4 ring-blue-500/15" : "border-gray-200"}`}
            >
                {value}
                {isTyping && <span className="demo-caret ml-px h-4 w-px bg-gray-800" />}
            </span>
        </div>
    );
}

/** ชั้นการอนุมัติ 1 ชั้น (ตาม ApprovalProgress ของหน้าเอกสาร) */
export function ApprovalLevel({
    done = false,
    waiting = false,
    label,
    note,
}: {
    done?: boolean;
    waiting?: boolean;
    label: string;
    note: string;
}) {
    const Icon = done ? CheckCircle2 : waiting ? Clock : Circle;
    const tone = done ? "text-green-600" : waiting ? "text-amber-600" : "text-gray-300";
    return (
        <div className="flex items-start gap-2.5">
            <Icon size={16} className={`mt-0.5 shrink-0 ${tone}`} />
            <div className="grid">
                <span className="text-gray-800">{label}</span>
                <span className="text-[0.7rem] text-gray-500">{note}</span>
            </div>
        </div>
    );
}

/** แท็บแบบ Segmented (components/ui/segmented.tsx) · demo = ค่า data-demo ของแต่ละตัวเลือก (ให้เมาส์ชี้) */
export function DemoSegmented({
    options,
    value,
    demo,
}: {
    options: string[];
    value: string;
    demo?: Record<string, string>;
}) {
    return (
        <div className="inline-flex gap-0.5 justify-self-start rounded-2xl bg-gray-100 p-1 text-xs">
            {options.map((option) => (
                <span
                    key={option}
                    data-demo={demo?.[option]}
                    className={`whitespace-nowrap rounded-xl px-3 py-1.5 transition ${
                        option === value ? "bg-white font-medium text-gray-900 shadow-xs" : "text-gray-500"
                    }`}
                >
                    {option}
                </span>
            ))}
        </div>
    );
}

/** ช่องติ๊ก (ติ๊กแล้ว = พื้นฟ้า) */
export function DemoCheckbox({ checked }: { checked: boolean }) {
    return (
        <span
            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                checked ? "border-blue-600 bg-blue-600 text-white" : "border-gray-300 bg-white"
            }`}
        >
            {checked && (
                <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden="true">
                    <path d="M2.5 6.2 5 8.6l4.5-5" fill="none" stroke="currentColor" strokeWidth="1.8" />
                </svg>
            )}
        </span>
    );
}

/** หน้าต่างยืนยัน (ConfirmDialog) ที่บังทั้งจอ — ใส่ใน DemoShell overlay */
export function DemoConfirm({
    title,
    children,
    confirmLabel,
    confirmDemo,
    pressClass,
}: {
    title: string;
    children: ReactNode;
    confirmLabel: string;
    confirmDemo: string;
    pressClass: string;
}) {
    return (
        <div className="demo-page-in absolute inset-0 z-10 flex items-center justify-center bg-gray-900/20">
            <div className="grid w-80 gap-3 rounded-2xl border border-gray-200 bg-white p-5 text-xs shadow-float">
                <p className="text-sm font-medium text-gray-900">{title}</p>
                {children}
                <div className="flex justify-end gap-2">
                    <span className={buttonClass("secondary", "sm")}>ยกเลิก</span>
                    <span
                        data-demo={confirmDemo}
                        className={`${buttonClass("primary", "sm")} transition ${pressClass}`}
                    >
                        {confirmLabel}
                    </span>
                </div>
            </div>
        </div>
    );
}
