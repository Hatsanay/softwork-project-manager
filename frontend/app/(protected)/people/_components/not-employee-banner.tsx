"use client";

// บัญชียังไม่ผูกกับทะเบียนพนักงาน (usability U-3 · 2026-11-01)
// คนทั่วไป: ข้อความเดิมให้ติดต่อฝ่ายบุคคล · คนที่จัดการพนักงานได้ (มักเป็นเจ้าของหรือฝ่ายบุคคลเอง) มีปุ่มไปผูกเองเลย ไม่ติดทางตัน
import { useEffect, useState } from "react";
import Link from "next/link";
import { UserPlus } from "lucide-react";
import StatusBanner from "@/components/ui/guidance/status-banner";
import { buttonClass } from "@/components/ui/button";
import { usePermission, BITS } from "@/app/components/permission-provider";
import { apiFetch } from "@/lib/api";

type NotEmployeeBannerProps = {
    title: string;
    // ข้อความสำหรับคนที่ไม่มีสิทธิ์จัดการพนักงาน
    children: React.ReactNode;
};

export default function NotEmployeeBanner({ title, children }: NotEmployeeBannerProps) {
    const hasBit = usePermission();
    const canManageEmployees = hasBit(BITS.manageEmployees);
    const [myUserId, setMyUserId] = useState<string | null>(null);

    useEffect(() => {
        if (!canManageEmployees) return;
        let isLeftPage = false;
        apiFetch<{ user_id: string }>("/users/me").then(({ data }) => {
            if (isLeftPage || !data) return;
            setMyUserId(data.user_id);
        });
        return () => {
            isLeftPage = true;
        };
    }, [canManageEmployees]);

    if (!canManageEmployees) {
        return (
            <StatusBanner tone="info" title={title}>
                {children}
            </StatusBanner>
        );
    }

    // หน้าเพิ่มพนักงานรับ ?user= แล้วเลือกบัญชีนี้ + เติมชื่อให้
    const addSelfHref = myUserId
        ? `/people/employees/new?user=${encodeURIComponent(myUserId)}`
        : "/people/employees/new";
    return (
        <StatusBanner tone="info" title={title}>
            <p>บัญชีนี้ยังไม่ได้ผูกกับทะเบียนพนักงาน · คุณจัดการพนักงานได้ จึงผูกเองได้เลย</p>
            <p className="mt-1 text-gray-500">
                ยังไม่มีทะเบียนของคุณ: กด &quot;เพิ่มตัวเองเป็นพนักงาน&quot; ระบบเลือกบัญชีนี้ไว้ให้ ·
                มีทะเบียนอยู่แล้ว: เปิดพนักงานคนนั้นในหน้าพนักงาน กดแก้ แล้วเลือกบัญชีนี้ในช่อง &quot;บัญชีผู้ใช้&quot;
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
                <Link href={addSelfHref} className={buttonClass("primary", "sm")}>
                    <UserPlus size={14} />
                    เพิ่มตัวเองเป็นพนักงาน
                </Link>
                <Link href="/people/employees" className={buttonClass("secondary", "sm")}>
                    ไปหน้าพนักงาน
                </Link>
            </div>
        </StatusBanner>
    );
}
