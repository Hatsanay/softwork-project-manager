"use client";

// ปฏิทินลาของทีม — จอคอม: ตารางเดือน (U-2 · 2026-10-19) · มือถือ: รายการตามวัน เฉพาะวันทำงานที่มีคนลา
// แสดงชื่อ + ครึ่งวัน + รออนุมัติ เท่านั้น — ประเภท/เหตุผลไม่ส่งมาจาก backend
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import StatusBanner from "@/components/ui/guidance/status-banner";
import { PageSkeleton } from "@/components/ui/skeleton";
import { buttonClass } from "@/components/ui/button";
import { apiFetch, type ApiError } from "@/lib/api";
import { addDays, weekdayIndex, workingDatesBetween } from "@/lib/shared/payroll-math.mjs";
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
            <div className="hidden sm:block">
                <MonthGrid data={data} />
            </div>
            {days.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500 sm:hidden">
                    เดือนนี้ไม่มีใครลา
                </p>
            ) : (
                <ul className="grid gap-2 sm:hidden">
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

const WEEKDAY_NAMES = ["จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส.", "อา."];
const MAX_NAMES_PER_DAY = 3;

// ตารางเดือน จันทร์→อาทิตย์ · วันหยุดพื้นเทา · ชื่อคนลา (รออนุมัติสีเหลือง) แสดงไม่เกิน 3 คนต่อวัน ที่เหลือเป็น "+N คน"
function MonthGrid({ data }: { data: TeamCalendarData }) {
    const holidays = new Set(data.holidays);
    const leadingBlanks = weekdayIndex(data.month_start);
    const dates: string[] = [];
    for (let date = data.month_start; date <= data.month_end; date = addDays(date, 1)) dates.push(date);
    const cells: (string | null)[] = [...Array<null>(leadingBlanks).fill(null), ...dates];
    while (cells.length % 7 !== 0) cells.push(null);

    return (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
            <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50/80">
                {WEEKDAY_NAMES.map((name) => (
                    <span key={name} className="py-2 text-center text-xs font-medium text-gray-600">
                        {name}
                    </span>
                ))}
            </div>
            <div className="grid grid-cols-7">
                {cells.map((date, index) => {
                    if (!date) return <div key={`blank-${index}`} className="min-h-24 border-b border-r border-gray-100 bg-gray-50/40" />;
                    const isWorkingDay = data.working_weekdays[weekdayIndex(date)] === "1" && !holidays.has(date);
                    const leaves = isWorkingDay
                        ? data.leaves.filter((leave) => leave.lr_start_date <= date && leave.lr_end_date >= date)
                        : [];
                    const hiddenCount = leaves.length - MAX_NAMES_PER_DAY;
                    return (
                        <div
                            key={date}
                            className={`grid min-h-24 content-start gap-1 border-b border-r border-gray-100 p-1.5 ${isWorkingDay ? "" : "bg-gray-50"}`}
                        >
                            <span className="flex items-baseline justify-between gap-1 text-xs">
                                <span className={isWorkingDay ? "font-medium text-gray-900" : "text-gray-400"}>
                                    {Number(date.slice(8))}
                                </span>
                                {holidays.has(date) && <span className="truncate text-[11px] text-gray-400">วันหยุด</span>}
                            </span>
                            {leaves.slice(0, MAX_NAMES_PER_DAY).map((leave) => (
                                <span
                                    key={leave.lr_id}
                                    className={`truncate rounded-md px-1.5 py-0.5 text-[11px] ${
                                        leave.lr_status === "pending" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"
                                    }`}
                                >
                                    {leave.employee_name}
                                    {leave.lr_half_day !== "none" ? ` (${leave.lr_half_day === "morning" ? "เช้า" : "บ่าย"})` : ""}
                                </span>
                            ))}
                            {hiddenCount > 0 && <span className="px-1.5 text-[11px] text-gray-500">+{hiddenCount} คน</span>}
                        </div>
                    );
                })}
            </div>
            <p className="flex flex-wrap gap-x-4 gap-y-1 px-3 py-2 text-xs text-gray-500">
                <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-blue-100" aria-hidden="true" /> อนุมัติแล้ว
                </span>
                <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-amber-100" aria-hidden="true" /> รออนุมัติ
                </span>
                <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-gray-100" aria-hidden="true" /> วันหยุด
                </span>
            </p>
        </div>
    );
}
