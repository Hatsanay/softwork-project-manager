"use client";

// สลิปเงินเดือนของฉัน (ขั้น 4-4) — เฉพาะรอบที่บันทึกจ่ายแล้ว · ทุกคนที่ login (backend ตรวจเจ้าของ)
import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText, Printer } from "lucide-react";
import PageHeader from "@/components/ui/page-header";
import StatusBanner from "@/components/ui/guidance/status-banner";
import { PageSkeleton } from "@/components/ui/skeleton";
import { CARD_CLASS } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { apiFetch, type ApiError } from "@/lib/api";
import { formatAmount } from "@/lib/shared/money.mjs";
import { formatDateOnly } from "@/app/function";
import { PAYROLL_MESSAGES } from "../_messages";
import type { PayslipSummary } from "../_types";
import { periodLabel } from "../payroll/_lib";

// 50 ทวิ ประจำปีออกหลังจบปี — ลิงก์ของปีที่แล้ว (ปีนี้ยังไม่ครบ)
const lastYear =
    Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric" }).format(new Date())) - 1;

export default function MyPayslipsPage() {
    const [slips, setSlips] = useState<PayslipSummary[] | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);

    useEffect(() => {
        let isLeftPage = false;
        apiFetch<{ data: PayslipSummary[] }>("/payroll/payslips").then(({ data, error }) => {
            if (isLeftPage) return;
            setLoadError(error);
            setSlips(data?.data ?? null);
        });
        return () => {
            isLeftPage = true;
        };
    }, []);

    return (
        <div className="grid w-full grid-cols-1 gap-6">
            <PageHeader
                eyebrow="บุคคล"
                title="สลิปเงินเดือนของฉัน"
                description={PAYROLL_MESSAGES.payslip}
                actions={
                    <Link
                        href={`/people/payroll/certificates/print?mine=1&year=${lastYear}`}
                        target="_blank"
                        className={buttonClass("secondary", "md")}
                    >
                        <FileText size={16} />
                        50 ทวิ ปี {lastYear + 543}
                    </Link>
                }
            />
            {loadError && (
                <StatusBanner tone="error" title="โหลดสลิปไม่สำเร็จ">
                    {loadError.message}
                </StatusBanner>
            )}
            {!slips && !loadError && <PageSkeleton />}
            {slips && slips.length === 0 && (
                <p className="rounded-2xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
                    ยังไม่มีสลิป · สลิปขึ้นหลังฝ่ายบุคคลบันทึกจ่ายเงินเดือนของเดือนนั้น
                </p>
            )}
            {slips && slips.length > 0 && (
                <ul className="grid gap-2">
                    {slips.map((slip) => (
                        <li key={slip.pri_id}>
                            <Link
                                href={`/people/payslips/print?id=${slip.pri_id}`}
                                className={`grid gap-2 p-4 hover:border-blue-200 sm:grid-cols-[1fr_auto] sm:items-center ${CARD_CLASS}`}
                            >
                                <span className="grid gap-0.5">
                                    <span className="font-medium text-gray-900">{periodLabel(slip.pr_period)}</span>
                                    <span className="text-xs text-gray-500">
                                        จ่าย {slip.pr_paid_date ? formatDateOnly(slip.pr_paid_date) : "-"} · เงินได้{" "}
                                        {formatAmount(slip.pri_gross)} · ภาษี {formatAmount(slip.pri_tax)} · ประกันสังคม{" "}
                                        {formatAmount(slip.pri_sso_employee)}
                                    </span>
                                </span>
                                <span className="flex items-center gap-2 text-sm font-medium text-gray-900 tabular-nums">
                                    สุทธิ {formatAmount(slip.pri_net)}
                                    <Printer size={16} className="text-blue-600" />
                                </span>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
