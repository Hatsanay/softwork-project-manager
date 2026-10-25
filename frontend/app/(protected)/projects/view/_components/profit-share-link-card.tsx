"use client";

// ทางเข้าหน้าส่วนแบ่งกำไรของโปรเจกต์ (2026-10-25 · P-2) — เฉพาะผู้มีสิทธิ์จัดการส่วนแบ่ง · ใช้ได้ทั้งงาน Fastwork และลูกค้าตรง
import Link from "next/link";
import { HandCoins } from "lucide-react";
import { CARD_CLASS } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { usePermission, BITS } from "@/app/components/permission-provider";

export default function ProfitShareLinkCard({ projectId }: { projectId: string }) {
    const hasBit = usePermission();
    if (!hasBit(BITS.manageProfitShares)) return null;
    return (
        <section className={`flex flex-wrap items-center justify-between gap-3 p-4 sm:px-6 ${CARD_CLASS}`}>
            <div className="flex min-w-0 flex-1 basis-64 items-start gap-3.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                    <HandCoins size={19} />
                </span>
                <div className="grid gap-0.5">
                    <h2 className="text-base font-medium text-gray-900">ส่วนแบ่งกำไร</h2>
                    <p className="text-sm text-gray-500">ตั้งส่วนแบ่งของทีม เบิกล่วงหน้า ปิดยอดเมื่อเงินเข้าครบ และบันทึกการจ่าย</p>
                </div>
            </div>
            <Link href={`/fastwork/shares/project?id=${projectId}`} className={buttonClass("secondary", "md")}>
                เปิดส่วนแบ่ง
            </Link>
        </section>
    );
}
