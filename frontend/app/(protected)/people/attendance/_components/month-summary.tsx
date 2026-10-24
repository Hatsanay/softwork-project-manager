"use client";

// สรุปเดือน (ลงเวลา A-1/A-2) — ตัวเลขรวม + รายวัน (ใหม่สุดก่อน · เฉพาะวันที่ผ่านมาแล้วและวันนี้)
// ใช้ทั้งหน้าของฉัน (มีปุ่ม "ขอแก้เวลา" ที่วันไม่ครบ/ขาด) และหน้าพนักงานของฝ่ายบุคคล (เห็นการกดทุกครั้ง + ตำแหน่ง)
// วันหยุดที่ไม่ได้มา/ก่อนเริ่มใช้/ไม่ใช่ช่วงทำงาน ย่อเป็นบรรทัดสั้น ไม่รกรายการ
import { ChevronLeft, ChevronRight, House, MapPin, PencilLine } from "lucide-react";
import StatusPill from "@/components/ui/status-pill";
import { CARD_CLASS } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { ATTENDANCE_STATUS } from "../../_messages";
import type { AttendanceDay, AttendanceTotals } from "../../_types";
import { dayLabel } from "../../timesheet/_components/week-lines";

const QUIET_STATUSES = ["off", "not_employed", "not_tracked", "not_required", "upcoming"];
const NEEDS_CORRECTION = ["incomplete", "absent"];

function shiftMonth(yearMonth: string, offset: number) {
    const [year, month] = yearMonth.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 7);
}

function monthLabel(yearMonth: string) {
    return new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric", timeZone: "UTC" }).format(
        new Date(`${yearMonth}-01T00:00:00Z`),
    );
}

const timeOf = (dateTimeText: string | null | undefined) => (dateTimeText ? dateTimeText.slice(11, 16) : "-");

function Stat({ label, value, tone = "text-gray-900" }: { label: string; value: string; tone?: string }) {
    return (
        <div className="grid gap-0.5 rounded-xl bg-gray-50 px-3 py-2.5">
            <span className="text-xs text-gray-500">{label}</span>
            <span className={`text-lg font-medium tabular-nums ${tone}`}>{value}</span>
        </div>
    );
}

type MonthSummaryProps = {
    month: string;
    today: string;
    days: AttendanceDay[];
    totals: AttendanceTotals | null;
    onMonthChange: (month: string) => void;
    // หน้าของฉัน: ปุ่มขอแก้เวลาที่วันไม่ครบ/ขาด
    onRequestCorrection?: (day: AttendanceDay) => void;
    // หน้าฝ่ายบุคคล: แสดงการกดทุกครั้งพร้อมตำแหน่ง
    showPunches?: boolean;
};

export default function MonthSummary({
    month,
    today,
    days,
    totals,
    onMonthChange,
    onRequestCorrection,
    showPunches = false,
}: MonthSummaryProps) {
    const currentMonth = today.slice(0, 7);
    const pastDays = days.filter((day) => day.work_date <= today).reverse();

    return (
        <section className={`grid gap-4 p-5 sm:p-6 ${CARD_CLASS}`} aria-label="สรุปเดือน">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-base font-medium text-gray-900">สรุปเดือน</h2>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        aria-label="เดือนก่อน"
                        className={buttonClass("secondary", "md")}
                        onClick={() => onMonthChange(shiftMonth(month, -1))}
                    >
                        <ChevronLeft size={16} />
                    </button>
                    <span className="min-w-28 text-center text-sm font-medium text-gray-900">{monthLabel(month)}</span>
                    <button
                        type="button"
                        aria-label="เดือนถัดไป"
                        disabled={month >= currentMonth}
                        className={buttonClass("secondary", "md")}
                        onClick={() => onMonthChange(shiftMonth(month, 1))}
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>
            </div>

            {totals && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Stat label="มาทำงาน" value={`${totals.present} วัน`} />
                    <Stat
                        label="สาย"
                        value={totals.late_days > 0 ? `${totals.late_days} ครั้ง · ${totals.late_minutes} นาที` : "-"}
                        tone={totals.late_days > 0 ? "text-red-600" : "text-gray-900"}
                    />
                    <Stat label="ขาดงาน" value={totals.absent > 0 ? `${totals.absent} วัน` : "-"} tone={totals.absent > 0 ? "text-red-600" : "text-gray-900"} />
                    <Stat
                        label="ไม่ครบ (ต้องขอแก้)"
                        value={totals.incomplete > 0 ? `${totals.incomplete} วัน` : "-"}
                        tone={totals.incomplete > 0 ? "text-amber-700" : "text-gray-900"}
                    />
                </div>
            )}

            {pastDays.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">ยังไม่มีข้อมูลเดือนนี้</p>
            ) : (
                <ul className="grid gap-1.5">
                    {pastDays.map((day) => (
                        <DayRow
                            key={day.work_date}
                            day={day}
                            isToday={day.work_date === today}
                            showPunches={showPunches}
                            onRequestCorrection={onRequestCorrection}
                        />
                    ))}
                </ul>
            )}
        </section>
    );
}

function DayRow({
    day,
    isToday,
    showPunches,
    onRequestCorrection,
}: {
    day: AttendanceDay;
    isToday: boolean;
    showPunches: boolean;
    onRequestCorrection?: (day: AttendanceDay) => void;
}) {
    const status = ATTENDANCE_STATUS[day.status];
    const isQuiet = QUIET_STATUSES.includes(day.status) && day.punches.length === 0;
    const hasOffsite = day.punches.some((punch) => punch.ap_is_offsite);
    const canRequest = onRequestCorrection && NEEDS_CORRECTION.includes(day.status);

    if (isQuiet) {
        return (
            <li className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm text-gray-400">
                <span>{dayLabel(day.work_date)}</span>
                <span className="text-xs">{day.holiday_name ?? status.label}</span>
            </li>
        );
    }

    return (
        <li
            className={`grid gap-1.5 rounded-xl border px-3 py-2.5 sm:grid-cols-[9rem_1fr_auto] sm:items-center ${
                isToday ? "border-blue-200 bg-blue-50/40" : "border-gray-100 bg-white"
            }`}
        >
            <span className="text-sm font-medium text-gray-900">
                {dayLabel(day.work_date)}
                {isToday && <span className="ml-1.5 text-xs font-normal text-blue-600">วันนี้</span>}
            </span>
            <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-gray-700 tabular-nums">
                <span>เข้า {timeOf(day.first_in)}</span>
                <span>ออก {timeOf(day.last_out)}</span>
                {day.late_minutes ? <span className="text-red-600">สาย {day.late_minutes} นาที</span> : null}
                {day.early_leave_minutes ? <span className="text-red-600">ออกก่อน {day.early_leave_minutes} นาที</span> : null}
                {day.leave && day.leave !== "full" && (
                    <span className="text-gray-500">{day.leave === "morning" ? "ลาครึ่งเช้า" : "ลาครึ่งบ่าย"}</span>
                )}
                {day.is_wfh && (
                    <span className="inline-flex items-center gap-0.5 text-blue-700">
                        <House size={13} aria-hidden="true" />
                        WFH
                    </span>
                )}
                {hasOffsite && (
                    <span className="inline-flex items-center gap-0.5 text-amber-700">
                        <MapPin size={13} aria-hidden="true" />
                        นอกจุด
                    </span>
                )}
            </span>
            <span className="flex flex-wrap items-center gap-2 sm:justify-end">
                <StatusPill tone={status.tone}>
                    {day.holiday_name && day.status === "off_worked" ? `มาวันหยุด (${day.holiday_name})` : status.label}
                </StatusPill>
                {canRequest && (
                    <button
                        type="button"
                        className={buttonClass("secondary", "sm")}
                        onClick={() => onRequestCorrection(day)}
                    >
                        <PencilLine size={14} />
                        ขอแก้เวลา
                    </button>
                )}
            </span>
            {showPunches && day.punches.length > 0 && (
                <ul className="grid gap-0.5 text-xs text-gray-500 sm:col-span-3">
                    {day.punches.map((punch) => (
                        <li key={punch.ap_id}>
                            {punch.ap_type === "in" ? "เข้า" : "ออก"} {timeOf(punch.ap_at)}
                            {punch.ap_source === "correction" ? " · ขอแก้เวลา (อนุมัติแล้ว)" : ""}
                            {punch.ap_location_name ? ` · ${punch.ap_location_name}` : ""}
                            {punch.ap_distance_m !== null && punch.ap_source === "mobile" ? ` ${punch.ap_distance_m} ม.` : ""}
                            {punch.ap_is_offsite ? " · นอกจุด" : ""}
                            {punch.ap_is_wfh ? " · WFH" : ""}
                            {punch.ap_note ? ` · ${punch.ap_note}` : ""}
                        </li>
                    ))}
                </ul>
            )}
        </li>
    );
}
