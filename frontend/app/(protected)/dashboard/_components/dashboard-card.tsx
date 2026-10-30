// กรอบการ์ดของแดชบอร์ด: ไอคอนหัวข้อ + ชื่อ + คำอธิบาย + ตัวกรองด้านขวา · แถวรายการแบบปุ่มกดได้ทั้งแถว
import type { LucideIcon } from "lucide-react";
import Image from "next/image";
import { CARD_CLASS } from "@/components/ui/card";
import { initialsOf } from "@/components/ui/person-cell";
import { uploadedFileUrl } from "@/lib/api";

type DashboardCardProps = {
    title: string;
    icon: LucideIcon;
    iconTone?: "blue" | "amber" | "green" | "red" | "gray";
    description?: React.ReactNode;
    actions?: React.ReactNode;
    className?: string;
    children: React.ReactNode;
};

const ICON_TONES = {
    blue: "bg-blue-50 text-blue-600",
    amber: "bg-amber-50 text-amber-600",
    green: "bg-green-50 text-green-600",
    red: "bg-red-50 text-red-600",
    gray: "bg-gray-100 text-gray-500",
};

export default function DashboardCard({
    title,
    icon: Icon,
    iconTone = "blue",
    description,
    actions,
    className = "",
    children,
}: DashboardCardProps) {
    return (
        <section className={`grid min-w-0 grid-cols-1 content-start gap-4 p-5 sm:p-6 ${CARD_CLASS} ${className}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                    <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${ICON_TONES[iconTone]}`}
                    >
                        <Icon size={18} />
                    </span>
                    <div className="grid gap-0.5">
                        <h2 className="text-base font-medium text-gray-900">{title}</h2>
                        {description && <p className="text-xs text-gray-500">{description}</p>}
                    </div>
                </div>
                {actions}
            </div>
            {children}
        </section>
    );
}

/** รายการแบบแถว — ทั้งแถวเป็นปุ่ม (มือถือกดง่าย) */
export function ListRows({ children }: { children: React.ReactNode }) {
    return <ul className="-mx-2 grid grid-cols-1 gap-0.5">{children}</ul>;
}

export function ListRowButton({
    onClick,
    highlight = false,
    children,
}: {
    onClick: () => void;
    highlight?: boolean;
    children: React.ReactNode;
}) {
    // min-w-0 ทุกชั้น: ข้อความที่ตัดเป็น "..." (truncate) ในแถวจะหดตามการ์ดได้ ไม่ดันแถวให้กว้างเท่าข้อความเต็ม
    return (
        <li className="min-w-0">
            <button
                type="button"
                onClick={onClick}
                className={`flex w-full min-w-0 items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/20 ${
                    highlight ? "bg-red-50/70 hover:bg-red-50" : "hover:bg-gray-50"
                }`}
            >
                {children}
            </button>
        </li>
    );
}

/** รูปโปรไฟล์กลม (ไม่มีรูป = อักษรย่อบนพื้นฟ้าอ่อน) */
export function Avatar({ name, avatarPath, size = 28 }: { name: string; avatarPath: string | null; size?: number }) {
    if (avatarPath) {
        return (
            <Image
                src={uploadedFileUrl(avatarPath)}
                alt=""
                width={size}
                height={size}
                unoptimized
                className="shrink-0 rounded-full object-cover ring-2 ring-white"
                style={{ width: size, height: size }}
            />
        );
    }
    return (
        <span
            className="flex shrink-0 items-center justify-center rounded-full bg-linear-to-br from-blue-50 to-blue-100 text-[10px] font-medium text-blue-600 ring-2 ring-white"
            style={{ width: size, height: size }}
        >
            {initialsOf(name)}
        </span>
    );
}

/** ข้อความตอนรายการว่าง (สั้นๆ ในการ์ด) */
export function EmptyLine({ children }: { children: React.ReactNode }) {
    return <p className="rounded-xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">{children}</p>;
}
