"use client";

// ลงเวลารายวันของพนักงาน (ลงเวลา A-2 · หน้าพนักงาน แท็บเวลาทำงาน) — ฝ่ายบุคคล/ผู้อนุมัติลงเวลา
// เห็นการกดทุกครั้งพร้อมตำแหน่ง/ระยะ/เหตุผลนอกจุด และคำขอแก้เวลา · ?month= จากหน้าลงเวลาพนักงานเปิดเดือนนั้นตรงๆ
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import StatusBanner from "@/components/ui/guidance/status-banner";
import StatusPill from "@/components/ui/status-pill";
import { PageSkeleton } from "@/components/ui/skeleton";
import { apiFetch, type ApiError } from "@/lib/api";
import { CORRECTION_STATUS } from "../../../_messages";
import type { EmployeeAttendanceMonth } from "../../../_types";
import MonthSummary from "../../../attendance/_components/month-summary";
import { correctionText } from "../../../attendance/_components/my-corrections";
import { dayLabel } from "../../../timesheet/_components/week-lines";
import OvertimeList from "../../../attendance/_components/overtime-list";

export default function EmployeeAttendanceCard({ employeeId }: { employeeId: string }) {
    const requestedMonth = useSearchParams().get("month");
    const [month, setMonth] = useState<string | null>(requestedMonth && /^\d{4}-\d{2}$/.test(requestedMonth) ? requestedMonth : null);
    const [data, setData] = useState<EmployeeAttendanceMonth | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);

    useEffect(() => {
        let isLeftPage = false;
        apiFetch<EmployeeAttendanceMonth>(`/attendance/employees/${employeeId}${month ? `?month=${month}` : ""}`).then(
            ({ data: loaded, error }) => {
                if (isLeftPage) return;
                setLoadError(error);
                if (loaded) setData(loaded);
            },
        );
        return () => {
            isLeftPage = true;
        };
    }, [employeeId, month]);

    // ไม่มีสิทธิ์ดูลงเวลา (จัดการพนักงานได้แต่ backend ปฏิเสธ) — ไม่ต้องแสดงอะไร
    if (loadError?.status === 403) return null;
    if (loadError) return <StatusBanner tone="error" title="โหลดลงเวลาไม่สำเร็จ">{loadError.message}</StatusBanner>;
    if (!data || (month !== null && data.month !== month)) return <PageSkeleton />;

    const recentCorrections = data.corrections.filter((correction) => correction.ac_work_date.startsWith(data.month));
    const monthOvertime = data.overtime.filter((item) => item.ot_work_date.startsWith(data.month));

    return (
        <div className="grid gap-4">
            <MonthSummary
                month={data.month}
                today={data.today}
                days={data.days}
                totals={data.totals}
                onMonthChange={setMonth}
                showPunches
            />
            <OvertimeList overtime={monthOvertime} now={`${data.today} 00:00:00`} title="OT เดือนนี้" />
            {recentCorrections.length > 0 && (
                <section className="grid gap-2 text-sm" aria-label="คำขอแก้เวลาเดือนนี้">
                    <h3 className="font-medium text-gray-900">คำขอแก้เวลาเดือนนี้</h3>
                    <ul className="grid gap-1.5">
                        {recentCorrections.map((correction) => {
                            const status = CORRECTION_STATUS[correction.ac_status];
                            return (
                                <li key={correction.ac_id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-100 px-3 py-2">
                                    <span className="grid gap-0.5">
                                        <span className="text-gray-900">
                                            {dayLabel(correction.ac_work_date)} · {correctionText(correction)}
                                        </span>
                                        <span className="text-xs text-gray-500">
                                            {correction.ac_reason}
                                            {correction.decided_by_name ? ` · โดย ${correction.decided_by_name}` : ""}
                                        </span>
                                    </span>
                                    <StatusPill tone={status.tone}>{status.label}</StatusPill>
                                </li>
                            );
                        })}
                    </ul>
                </section>
            )}
        </div>
    );
}
