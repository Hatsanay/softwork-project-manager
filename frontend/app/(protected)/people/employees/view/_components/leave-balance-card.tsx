"use client";

// วันลาคงเหลือของพนักงาน (ฝ่ายบุคคล — ขั้น 4-3) · เลือกปีได้ · คำขอลารายใบดู/อนุมัติที่หน้า "การลา"
import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import SectionCard from "@/components/ui/section-card";
import FieldHint from "@/components/ui/guidance/field-hint";
import { buttonClass } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { usePermission, BITS } from "@/app/components/permission-provider";
import { LEAVE_MESSAGES } from "../../../_messages";
import type { LeaveBalance } from "../../../_types";

export default function LeaveBalanceCard({ employeeId, currentYear }: { employeeId: string; currentYear: number }) {
    const hasBit = usePermission();
    const [year, setYear] = useState(currentYear);
    const [balances, setBalances] = useState<LeaveBalance[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let isLeftPage = false;
        apiFetch<{ balances: LeaveBalance[] }>(`/leave/balances/${employeeId}?year=${year}`).then(
            ({ data, error: loadError }) => {
                if (isLeftPage) return;
                setBalances(data?.balances ?? null);
                setError(loadError?.message ?? null);
            },
        );
        return () => {
            isLeftPage = true;
        };
    }, [employeeId, year]);

    return (
        <SectionCard
            icon={CalendarDays}
            title="วันลาคงเหลือ"
            description={LEAVE_MESSAGES.balanceHint}
            actions={
                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        aria-label="ปีก่อน"
                        className={buttonClass("secondary", "md")}
                        onClick={() => setYear(year - 1)}
                    >
                        <ChevronLeft size={16} />
                    </button>
                    <span className="min-w-16 text-center text-sm text-gray-900">ปี {year + 543}</span>
                    <button
                        type="button"
                        aria-label="ปีถัดไป"
                        disabled={year >= currentYear + 1}
                        className={buttonClass("secondary", "md")}
                        onClick={() => setYear(year + 1)}
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>
            }
        >
            <FieldHint error={error} />
            {balances && (
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {balances.map((balance) => (
                        <li key={balance.lt_id} className="grid content-start gap-0.5 rounded-xl bg-gray-50 p-3">
                            <span className="text-xs text-gray-500">{balance.lt_name_th}</span>
                            <span className="text-base font-medium text-gray-900 tabular-nums">
                                {balance.remaining === null ? "ไม่จำกัด" : `เหลือ ${Number(balance.remaining)}`}
                            </span>
                            <span className="text-xs text-gray-500 tabular-nums">
                                ใช้ {Number(balance.used)}
                                {balance.quota !== null ? ` / ${Number(balance.quota)}` : ""} วัน
                                {Number(balance.pending) > 0 ? ` · รออนุมัติ ${Number(balance.pending)}` : ""}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
            {hasBit(BITS.approveLeave) && (
                <Link href="/people/leave?tab=approvals" className="-my-2 py-2 text-sm text-blue-600 hover:underline">
                    ดูคำขอลาที่รออนุมัติ
                </Link>
            )}
        </SectionCard>
    );
}
