"use client";

// ลงเวลาพนักงาน (ลงเวลา A-2 · 2026-10-24) — ฝ่ายบุคคล/ผู้อนุมัติลงเวลา
// แท็บ "รายวัน": ใครเข้าแล้ว/สาย/ยังไม่เข้า/ขาด/ลา/นอกจุด (กดชิปกรอง) · แท็บ "สรุปเดือน": ตัวเลขต่อคน ใช้ตรวจก่อนปิดรอบเงินเดือน
// กดคน = หน้าพนักงานแท็บเวลาทำงาน (เห็นการกดทุกครั้งพร้อมตำแหน่ง) · ?tab=summary&month= / ?date= เปิดตรงๆ ได้
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, House, MapPin } from "lucide-react";
import PageHeader from "@/components/ui/page-header";
import Segmented from "@/components/ui/segmented";
import StatusPill from "@/components/ui/status-pill";
import StatusBanner from "@/components/ui/guidance/status-banner";
import { PageSkeleton } from "@/components/ui/skeleton";
import { CARD_CLASS } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { apiFetch, uploadedFileUrl, type ApiError } from "@/lib/api";
import { addDays } from "@/lib/shared/payroll-math.mjs";
import { isRealDateText } from "@/lib/shared/schemas/common.mjs";
import { ATTENDANCE_STATUS } from "../_messages";
import type { AttendanceBoard, AttendanceEmployee, AttendanceMonthSummary } from "../_types";
import { dayLabel } from "../timesheet/_components/week-lines";
import { nameInitial } from "../employees/_card-status";

type Tab = "day" | "summary";
type BoardFilter = "all" | "arrived" | "late" | "not_yet" | "absent" | "incomplete" | "leave" | "wfh" | "offsite";

const FILTER_LABEL: Record<BoardFilter, string> = {
    all: "ทั้งหมด",
    arrived: "เข้าแล้ว",
    late: "สาย",
    not_yet: "ยังไม่เข้า",
    absent: "ขาด",
    incomplete: "ไม่ครบ",
    leave: "ลา",
    wfh: "WFH",
    offsite: "นอกจุด",
};

const timeOf = (dateTimeText: string | null | undefined) => (dateTimeText ? dateTimeText.slice(11, 16) : "-");

function shiftMonth(yearMonth: string, offset: number) {
    const [year, month] = yearMonth.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 7);
}

function monthLabel(yearMonth: string) {
    return new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric", timeZone: "UTC" }).format(
        new Date(`${yearMonth}-01T00:00:00Z`),
    );
}

export default function AttendanceBoardPage() {
    return (
        <Suspense fallback={<PageSkeleton />}>
            <AttendanceBoardContent />
        </Suspense>
    );
}

function AttendanceBoardContent() {
    const router = useRouter();
    const params = useSearchParams();
    const tab: Tab = params.get("tab") === "summary" ? "summary" : "day";
    const requestedDate = params.get("date");
    const date = requestedDate && isRealDateText(requestedDate) ? requestedDate : null;
    const requestedMonth = params.get("month");
    const month = requestedMonth && /^\d{4}-\d{2}$/.test(requestedMonth) ? requestedMonth : null;

    function go(next: { tab?: Tab; date?: string | null; month?: string | null }) {
        const query = new URLSearchParams();
        const nextTab = next.tab ?? tab;
        query.set("tab", nextTab);
        const nextDate = next.date === undefined ? date : next.date;
        const nextMonth = next.month === undefined ? month : next.month;
        if (nextTab === "day" && nextDate) query.set("date", nextDate);
        if (nextTab === "summary" && nextMonth) query.set("month", nextMonth);
        router.replace(`/people/attendance-board?${query}`, { scroll: false });
    }

    return (
        <div className="grid w-full gap-5">
            <PageHeader eyebrow="บุคคล" title="ลงเวลาพนักงาน" description="ใครมาแล้ว สาย หรือยังไม่เข้า · สรุปเดือนใช้ตรวจก่อนปิดรอบเงินเดือน" />
            <Segmented<Tab>
                label="มุมมอง"
                role="tablist"
                value={tab}
                onChange={(value) => go({ tab: value })}
                options={[
                    { value: "day", label: "รายวัน" },
                    { value: "summary", label: "สรุปเดือน" },
                ]}
            />
            {tab === "day" ? (
                <DayBoard date={date} onDateChange={(value) => go({ date: value })} />
            ) : (
                <MonthBoard month={month} onMonthChange={(value) => go({ month: value })} />
            )}
        </div>
    );
}

function Avatar({ employee }: { employee: AttendanceEmployee }) {
    return (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-linear-to-br from-blue-50 to-blue-100 text-base font-medium text-blue-600">
            {employee.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={uploadedFileUrl(employee.photo_url)} alt="" className="h-full w-full object-cover" />
            ) : (
                nameInitial(employee.full_name)
            )}
        </span>
    );
}

function employeeHref(employeeId: string, monthText: string) {
    return `/people/employees/view?id=${employeeId}&tab=work&month=${monthText}`;
}

// ─── รายวัน ────────────────────────────────────────────────────────────────────────────────────

function DayBoard({ date, onDateChange }: { date: string | null; onDateChange: (date: string | null) => void }) {
    const [board, setBoard] = useState<AttendanceBoard | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);
    const [filter, setFilter] = useState<BoardFilter>("all");

    useEffect(() => {
        let isLeftPage = false;
        apiFetch<AttendanceBoard>(`/attendance/board${date ? `?date=${date}` : ""}`).then(({ data, error }) => {
            if (isLeftPage) return;
            setLoadError(error);
            if (data) setBoard(data);
        });
        return () => {
            isLeftPage = true;
        };
    }, [date]);

    if (loadError) return <StatusBanner tone="error" title="โหลดไม่สำเร็จ">{loadError.message}</StatusBanner>;
    if (!board || (date !== null && board.date !== date)) return <PageSkeleton />;

    const matches = (row: AttendanceBoard["rows"][number]) => {
        if (filter === "all") return true;
        if (filter === "arrived") return Boolean(row.day.first_in);
        if (filter === "late") return (row.day.late_minutes ?? 0) > 0;
        if (filter === "offsite") return row.has_offsite;
        // ตรงกับตัวนับ wfh ของ backend: วัน WFH ที่ไม่ได้ลาเต็มวันและไม่ใช่วันหยุด
        if (filter === "wfh") return row.day.is_wfh && row.day.status !== "leave" && row.day.status !== "off";
        return row.day.status === filter;
    };
    const rows = board.rows.filter(matches);
    // ชิปที่มีคนในกลุ่ม (ทั้งหมดแสดงเสมอ)
    const filters = (Object.keys(FILTER_LABEL) as BoardFilter[]).filter((key) => key === "all" || board.counts[key] > 0);

    return (
        <div className="grid gap-4">
            <div className="flex flex-wrap items-center gap-2">
                <button type="button" aria-label="วันก่อน" className={buttonClass("secondary", "md")} onClick={() => onDateChange(addDays(board.date, -1))}>
                    <ChevronLeft size={16} />
                </button>
                <span className="min-w-32 text-center text-sm font-medium text-gray-900">{dayLabel(board.date)}</span>
                <button
                    type="button"
                    aria-label="วันถัดไป"
                    disabled={board.date >= board.today}
                    className={buttonClass("secondary", "md")}
                    onClick={() => onDateChange(addDays(board.date, 1))}
                >
                    <ChevronRight size={16} />
                </button>
                {board.date !== board.today && (
                    <button type="button" className={buttonClass("ghost", "md")} onClick={() => onDateChange(null)}>
                        วันนี้
                    </button>
                )}
            </div>

            <div className="flex flex-wrap gap-2" role="group" aria-label="กรอง">
                {filters.map((key) => {
                    const count = key === "all" ? board.counts.total : board.counts[key];
                    const isSelected = filter === key;
                    return (
                        <button
                            key={key}
                            type="button"
                            aria-pressed={isSelected}
                            onClick={() => setFilter(key)}
                            className={`inline-flex min-h-9 items-center gap-1.5 rounded-xl border px-3 text-sm transition ${
                                isSelected ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-gray-700 hover:border-blue-200"
                            }`}
                        >
                            {FILTER_LABEL[key]}
                            <span className="font-medium tabular-nums">{count}</span>
                        </button>
                    );
                })}
            </div>

            {rows.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">ไม่มีพนักงานในกลุ่มนี้</p>
            ) : (
                <ul className={`grid divide-y divide-gray-100 ${CARD_CLASS}`}>
                    {rows.map((row) => {
                        const status = ATTENDANCE_STATUS[row.day.status];
                        return (
                            <li key={row.emp_id}>
                                <Link
                                    href={employeeHref(row.emp_id, board.date.slice(0, 7))}
                                    className="grid gap-2 px-4 py-3 hover:bg-blue-50/40 sm:grid-cols-[1fr_auto] sm:items-center"
                                >
                                    <span className="flex min-w-0 items-center gap-3">
                                        <Avatar employee={row} />
                                        <span className="grid min-w-0 gap-0.5">
                                            <span className="font-medium text-gray-900">
                                                {row.full_name}
                                                {row.emp_nickname && <span className="font-normal text-gray-500"> ({row.emp_nickname})</span>}
                                            </span>
                                            <span className="text-xs text-gray-500">
                                                {[row.department_name, row.day.schedule?.ws_name].filter(Boolean).join(" · ")}
                                            </span>
                                        </span>
                                    </span>
                                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-700 tabular-nums sm:justify-end">
                                        <span>เข้า {timeOf(row.day.first_in)}</span>
                                        <span>ออก {timeOf(row.day.last_out)}</span>
                                        {row.day.late_minutes ? <span className="text-red-600">สาย {row.day.late_minutes} นาที</span> : null}
                                        {row.day.is_wfh && (
                                            <span className="inline-flex items-center gap-0.5 text-blue-700">
                                                <House size={13} aria-hidden="true" />
                                                WFH
                                            </span>
                                        )}
                                        {row.has_offsite && (
                                            <span className="inline-flex items-center gap-0.5 text-amber-700">
                                                <MapPin size={13} aria-hidden="true" />
                                                นอกจุด
                                            </span>
                                        )}
                                        <StatusPill tone={status.tone}>{status.label}</StatusPill>
                                    </span>
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}

// ─── สรุปเดือน ─────────────────────────────────────────────────────────────────────────────────

function MonthBoard({ month, onMonthChange }: { month: string | null; onMonthChange: (month: string) => void }) {
    const [summary, setSummary] = useState<AttendanceMonthSummary | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);

    useEffect(() => {
        let isLeftPage = false;
        apiFetch<AttendanceMonthSummary>(`/attendance/summary${month ? `?month=${month}` : ""}`).then(({ data, error }) => {
            if (isLeftPage) return;
            setLoadError(error);
            if (data) setSummary(data);
        });
        return () => {
            isLeftPage = true;
        };
    }, [month]);

    if (loadError) return <StatusBanner tone="error" title="โหลดไม่สำเร็จ">{loadError.message}</StatusBanner>;
    if (!summary || (month !== null && summary.month !== month)) return <PageSkeleton />;

    const needsFix = summary.rows.filter((row) => row.totals.incomplete > 0);

    return (
        <div className="grid gap-4">
            <div className="flex items-center gap-2">
                <button type="button" aria-label="เดือนก่อน" className={buttonClass("secondary", "md")} onClick={() => onMonthChange(shiftMonth(summary.month, -1))}>
                    <ChevronLeft size={16} />
                </button>
                <span className="min-w-32 text-center text-sm font-medium text-gray-900">{monthLabel(summary.month)}</span>
                <button
                    type="button"
                    aria-label="เดือนถัดไป"
                    disabled={summary.month >= summary.today.slice(0, 7)}
                    className={buttonClass("secondary", "md")}
                    onClick={() => onMonthChange(shiftMonth(summary.month, 1))}
                >
                    <ChevronRight size={16} />
                </button>
            </div>
            {needsFix.length > 0 && (
                <StatusBanner tone="warn" title={`${needsFix.length} คนมีวันที่ข้อมูลไม่ครบ`}>
                    ให้พนักงานขอแก้เวลาก่อนปิดรอบเงินเดือน (ลืมกดเข้าหรือออก) · กดชื่อเพื่อดูวันที่
                </StatusBanner>
            )}

            {/* จอคอม: ตาราง */}
            <div className={`hidden md:block ${CARD_CLASS}`}>
                <table className="w-full border-collapse text-sm">
                    <thead>
                        <tr className="border-b border-gray-200 bg-gray-50">
                            <th scope="col" className="rounded-tl-2xl px-4 py-2.5 text-left font-medium text-gray-600">พนักงาน</th>
                            <th scope="col" className="px-3 py-2.5 text-right font-medium text-gray-600">มา (วัน)</th>
                            <th scope="col" className="px-3 py-2.5 text-right font-medium text-gray-600">สาย</th>
                            <th scope="col" className="px-3 py-2.5 text-right font-medium text-gray-600">ออกก่อน (นาที)</th>
                            <th scope="col" className="px-3 py-2.5 text-right font-medium text-gray-600">ขาด (วัน)</th>
                            <th scope="col" className="px-3 py-2.5 text-right font-medium text-gray-600">ลา (วัน)</th>
                            <th scope="col" className="rounded-tr-2xl px-4 py-2.5 text-right font-medium text-gray-600">ไม่ครบ</th>
                        </tr>
                    </thead>
                    <tbody>
                        {summary.rows.map((row) => (
                            <tr key={row.emp_id} className="border-b border-gray-100 last:border-0 hover:bg-blue-50/40">
                                <td className="px-4 py-2.5">
                                    <Link href={employeeHref(row.emp_id, summary.month)} className="grid hover:text-blue-600">
                                        <span className="font-medium text-gray-900">{row.full_name}</span>
                                        <span className="text-xs text-gray-500">
                                            {row.attendance_required ? row.emp_code : `${row.emp_code} · ไม่ต้องลงเวลา`}
                                        </span>
                                    </Link>
                                </td>
                                <td className="px-3 py-2.5 text-right tabular-nums">{row.totals.present}</td>
                                <td className={`px-3 py-2.5 text-right tabular-nums ${row.totals.late_days > 0 ? "text-red-600" : ""}`}>
                                    {row.totals.late_days > 0 ? `${row.totals.late_days} ครั้ง · ${row.totals.late_minutes} นาที` : "-"}
                                </td>
                                <td className="px-3 py-2.5 text-right tabular-nums">{row.totals.early_leave_minutes || "-"}</td>
                                <td className={`px-3 py-2.5 text-right tabular-nums ${row.totals.absent > 0 ? "text-red-600" : ""}`}>
                                    {row.totals.absent || "-"}
                                </td>
                                <td className="px-3 py-2.5 text-right tabular-nums">{row.totals.leave || "-"}</td>
                                <td className={`px-4 py-2.5 text-right tabular-nums ${row.totals.incomplete > 0 ? "font-medium text-amber-700" : ""}`}>
                                    {row.totals.incomplete || "-"}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* มือถือ: การ์ด */}
            <ul className="grid gap-2 md:hidden">
                {summary.rows.map((row) => (
                    <li key={row.emp_id}>
                        <Link href={employeeHref(row.emp_id, summary.month)} className={`grid gap-2 p-4 ${CARD_CLASS}`}>
                            <span className="flex items-center gap-3">
                                <Avatar employee={row} />
                                <span className="grid min-w-0">
                                    <span className="font-medium text-gray-900">{row.full_name}</span>
                                    <span className="text-xs text-gray-500">{row.emp_code}</span>
                                </span>
                            </span>
                            <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-gray-700 tabular-nums">
                                <span>มา {row.totals.present} วัน</span>
                                {row.totals.late_days > 0 && <span className="text-red-600">สาย {row.totals.late_days} ครั้ง</span>}
                                {row.totals.absent > 0 && <span className="text-red-600">ขาด {row.totals.absent} วัน</span>}
                                {row.totals.incomplete > 0 && <span className="text-amber-700">ไม่ครบ {row.totals.incomplete} วัน</span>}
                                {!row.attendance_required && <span className="text-gray-500">ไม่ต้องลงเวลา</span>}
                            </span>
                        </Link>
                    </li>
                ))}
            </ul>
        </div>
    );
}
