"use client";

// ปฏิทินลาของทีม — รายการตามวัน (อ่านง่ายบนมือถือกว่าตารางเดือน) · เฉพาะวันทำงานที่มีคนลา
// แสดงชื่อ + ครึ่งวัน + รออนุมัติ เท่านั้น — ประเภท/เหตุผลไม่ส่งมาจาก backend
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import StatusBanner from "@/components/ui/guidance/status-banner";
import { PageSkeleton } from "@/components/ui/skeleton";
import { buttonClass } from "@/components/ui/button";
import { apiFetch, type ApiError } from "@/lib/api";
import { workingDatesBetween } from "@/lib/shared/payroll-math.mjs";
import { HALF_DAY_LABEL, LEAVE_MESSAGES } from "../../_messages";
import type { TeamCalendar as TeamCalendarData } from "../../_types";

function shiftMonth(yearMonth: string, offset: number) {
    const [year, month] = yearMonth.split("-").map(Number);
    const shifted = new Date(Date.UTC(year, month - 1 + offset, 1));
    return shifted.toISOString().slice(0, 7);
}

function monthLabel(yearMonth: string) {
    return new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric", timeZone: "UTC" }).format(
        new Date(`${yearMonth}-01T00:00:00Z`),
    );
}

function dayLabel(dateText: string) {
    return new Intl.DateTimeFormat("th-TH", {
        weekday: "short",
        day: "numeric",
        month: "short",
        timeZone: "UTC",
    }).format(new Date(`${dateText}T00:00:00Z`));
}

export default function TeamCalendar({ refreshKey }: { refreshKey: number }) {
    const [month, setMonth] = useState<string | null>(null);
    const [data, setData] = useState<TeamCalendarData | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);

    useEffect(() => {
        let isLeftPage = false;
        const query = month ? `?month=${month}` : "";
        apiFetch<TeamCalendarData>(`/leave/calendar${query}`).then(({ data: calendar, error }) => {
            if (isLeftPage) return;
            setLoadError(error);
            if (calendar) setData(calendar);
        });
        return () => {
            isLeftPage = true;
        };
    }, [month, refreshKey]);

    if (loadError)
        return (
            <StatusBanner tone="error" title="โหลดปฏิทินไม่สำเร็จ">
                {loadError.message}
            </StatusBanner>
        );
    if (!data || (month !== null && data.month !== month)) return <PageSkeleton />;

    const workingDates = workingDatesBetween(
        data.month_start,
        data.month_end,
        data.working_weekdays,
        new Set(data.holidays),
    );
    const days = workingDates
        .map((date) => ({
            date,
            leaves: data.leaves.filter((leave) => leave.lr_start_date <= date && leave.lr_end_date >= date),
        }))
        .filter((day) => day.leaves.length > 0);

    return (
        <div className="grid grid-cols-1 gap-4">
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    aria-label="เดือนก่อน"
                    className={buttonClass("secondary", "md")}
                    onClick={() => setMonth(shiftMonth(data.month, -1))}
                >
                    <ChevronLeft size={16} />
                </button>
                <span className="min-w-32 text-center text-sm font-medium text-gray-900">{monthLabel(data.month)}</span>
                <button
                    type="button"
                    aria-label="เดือนถัดไป"
                    className={buttonClass("secondary", "md")}
                    onClick={() => setMonth(shiftMonth(data.month, 1))}
                >
                    <ChevronRight size={16} />
                </button>
            </div>
            <p className="text-sm text-gray-500">{LEAVE_MESSAGES.calendarDescription}</p>
            {days.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
                    เดือนนี้ไม่มีใครลา
                </p>
            ) : (
                <ul className="grid gap-2">
                    {days.map((day) => (
                        <li
                            key={day.date}
                            className="grid gap-2 rounded-2xl border border-gray-200 bg-white p-3 sm:grid-cols-[8rem_1fr]"
                        >
                            <span className="text-sm font-medium text-gray-900">{dayLabel(day.date)}</span>
                            <ul className="flex flex-wrap gap-1.5">
                                {day.leaves.map((leave) => (
                                    <li
                                        key={leave.lr_id}
                                        className={`rounded-lg border px-2.5 py-1 text-sm ${
                                            leave.lr_status === "pending"
                                                ? "border-amber-600/20 bg-amber-50 text-amber-700"
                                                : "border-blue-100 bg-blue-50 text-blue-700"
                                        }`}
                                    >
                                        {leave.employee_name}
                                        {leave.lr_half_day !== "none" ? ` · ${HALF_DAY_LABEL[leave.lr_half_day]}` : ""}
                                        {leave.lr_status === "pending" ? " · รออนุมัติ" : ""}
                                    </li>
                                ))}
                            </ul>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
