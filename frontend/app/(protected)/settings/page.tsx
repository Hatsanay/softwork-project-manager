"use client";

// ตั้งค่าระบบ — หน้ารวมทางไปการตั้งค่าแต่ละส่วน แสดงเฉพาะส่วนที่ผู้ใช้มีสิทธิ์เข้า (backend ตรวจสิทธิ์จริงอีกชั้น)
import Link from "next/link";
import { Building2, ChevronRight, History, KeyRound, Network, UsersRound, type LucideIcon } from "lucide-react";
import { BITS, usePermission } from "@/app/components/permission-provider";
import EmptyState from "@/components/ui/empty-state";
import PageHeader from "@/components/ui/page-header";

type SettingsLink = {
    href: string;
    permissionKey: string;
    title: string;
    description: string;
    icon: LucideIcon;
};

const SETTINGS_LINKS: SettingsLink[] = [
    {
        href: "/settings/company",
        permissionKey: "companySettings",
        title: "ข้อมูลบริษัท",
        description: "ชื่อ ที่อยู่ โลโก้ VAT สาขา บัญชีธนาคาร สกุลเงิน และกติกาอนุมัติเอกสารขาย",
        icon: Building2,
    },
    {
        href: "/settings/roles",
        permissionKey: "roleManagement",
        title: "จัดการสิทธิ์",
        description: "กำหนดว่าผู้ใช้แต่ละกลุ่มเข้าเมนูและทำอะไรได้บ้าง",
        icon: KeyRound,
    },
    {
        href: "/settings/departments",
        permissionKey: "departmentManagement",
        title: "แผนก",
        description: "แผนกของบริษัท ใช้จัดกลุ่มสิทธิ์",
        icon: Network,
    },
    {
        href: "/settings/project-positions",
        permissionKey: "projectPositionManagement",
        title: "ตำแหน่งในโปรเจกต์",
        description: "ตำแหน่งของสมาชิกในโปรเจกต์ และสิ่งที่แต่ละตำแหน่งทำได้",
        icon: UsersRound,
    },
    {
        href: "/settings/logs",
        permissionKey: "loginLogs",
        title: "Log ข้อมูล",
        description: "ประวัติการใช้งาน ข้อผิดพลาดของระบบ และการเข้าสู่ระบบ",
        icon: History,
    },
];

export default function SettingsPage() {
    const hasBit = usePermission();
    const visibleLinks = SETTINGS_LINKS.filter((link) => hasBit(BITS[link.permissionKey]));

    return (
        <div className="grid gap-6">
            <PageHeader
                eyebrow="ผู้ดูแลระบบ"
                title="ตั้งค่าระบบ"
                description="เลือกส่วนที่ต้องการตั้งค่า · แสดงเฉพาะส่วนที่คุณมีสิทธิ์"
            />

            {visibleLinks.length === 0 ? (
                <EmptyState title="คุณยังไม่มีสิทธิ์ตั้งค่าส่วนไหน" description="ติดต่อผู้ดูแลระบบถ้าต้องตั้งค่าระบบ" />
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {visibleLinks.map((link) => {
                        const Icon = link.icon;
                        return (
                            <Link
                                key={link.href}
                                href={link.href}
                                className="group flex items-start gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-card transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-float focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/20"
                            >
                                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 transition group-hover:bg-brand-gradient group-hover:text-white">
                                    <Icon size={20} />
                                </span>
                                <span className="grid min-w-0 flex-1 gap-1">
                                    <span className="font-medium text-gray-900">{link.title}</span>
                                    <span className="text-sm text-gray-500">{link.description}</span>
                                </span>
                                <ChevronRight
                                    size={18}
                                    className="mt-0.5 shrink-0 text-gray-300 transition group-hover:text-blue-500"
                                />
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
