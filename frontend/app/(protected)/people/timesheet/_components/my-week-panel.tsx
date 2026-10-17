"use client";

// สัปดาห์ของฉัน — เลื่อนสัปดาห์ · ลงชั่วโมงรายวัน · บันทึกทั้งสัปดาห์ · ส่งให้อนุมัติ · คัดลอกสัปดาห์ก่อน
// ตรวจด้วย timesheetWeekSchema ชุดเดียวกับ backend ก่อนส่ง (ส่งค่าที่พิมพ์เป็นข้อความ — schema แปลงชั่วโมงเป็น BigInt ใช้ตรวจเท่านั้น)
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Copy, Send } from "lucide-react";
import StatusBanner from "@/components/ui/guidance/status-banner";
import FieldHint from "@/components/ui/guidance/field-hint";
import StatusPill from "@/components/ui/status-pill";
import { PageSkeleton } from "@/components/ui/skeleton";
import { buttonClass } from "@/components/ui/button";
import { apiFetch, type ApiError } from "@/lib/api";
import { toFieldErrors, type FieldErrors } from "@/lib/form-errors";
import { formatHundredths, parseHundredths } from "@/lib/shared/money.mjs";
import { addDays, weekStartOf } from "@/lib/shared/payroll-math.mjs";
import { timesheetWeekSchema } from "@/lib/shared/schemas/timesheet.mjs";
import { isRealDateText } from "@/lib/shared/schemas/common.mjs";
import { TIMESHEET_MESSAGES, TIMESHEET_STATUS } from "../../_messages";
import type { MyTimesheetWeek, TimesheetEntry } from "../../_types";
import DayCard, { dayLabel, type TimesheetRow } from "./day-card";

const EDITABLE_STATUSES = ["draft", "returned"];

let rowSequence = 0;
function newRowKey() {
    rowSequence += 1;
    return `row-${rowSequence}`;
}

function toRows(entries: TimesheetEntry[]): TimesheetRow[] {
    return entries.map((entry) => ({
        key: newRowKey(),
        tse_date: entry.tse_date,
        tse_project_id: entry.tse_project_id ?? "",
        tse_task_id: entry.tse_task_id ?? "",
        tse_hours: String(Number(entry.tse_hours)),
        tse_note: entry.tse_note ?? "",
    }));
}

function toPayloadEntries(rows: TimesheetRow[]) {
    return rows.map((row) => ({
        tse_date: row.tse_date,
        tse_project_id: row.tse_project_id,
        tse_task_id: row.tse_task_id,
        tse_hours: row.tse_hours,
        tse_note: row.tse_note,
    }));
}

// ชั่วโมงรวม (แสดงผล) — ช่องที่ยังพิมพ์ไม่ถูกไม่นับ
function sumHours(rows: TimesheetRow[]) {
    let total = 0n;
    for (const row of rows) {
        try {
            total += parseHundredths(row.tse_hours || "0", "ชั่วโมง");
        } catch {
            // ยังพิมพ์ไม่เสร็จ — ชุดตรวจจะบอกตอนบันทึก
        }
    }
    return String(Number(formatHundredths(total)));
}

// สัปดาห์แรกที่เปิด = สัปดาห์นี้ตามเวลาไทยของ backend (ไม่ใช้นาฬิกาเครื่องผู้ใช้)
export default function MyWeekPanel() {
    // ?week=YYYY-MM-DD เปิดสัปดาห์นั้นตรงๆ (backend ปัดเป็นวันจันทร์เอง)
    const weekParam = useSearchParams().get("week");
    const [requestedWeek, setRequestedWeek] = useState<string | null>(
        weekParam && isRealDateText(weekParam) ? weekStartOf(weekParam) : null,
    );
    const [data, setData] = useState<MyTimesheetWeek | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);
    const [rows, setRows] = useState<TimesheetRow[]>([]);
    const [savedRows, setSavedRows] = useState<TimesheetRow[]>([]);
    const [errors, setErrors] = useState<FieldErrors>({});
    const [actionError, setActionError] = useState<string | null>(null);
    const [isWorking, setIsWorking] = useState(false);

    const applyWeek = useCallback((week: MyTimesheetWeek) => {
        const loadedRows = toRows(week.entries);
        setData(week);
        setRows(loadedRows);
        setSavedRows(loadedRows);
        setErrors({});
    }, []);

    useEffect(() => {
        let isLeftPage = false;
        const query = requestedWeek ? `?week=${requestedWeek}` : "";
        apiFetch<MyTimesheetWeek>(`/timesheet/me${query}`).then(({ data: week, error }) => {
            if (isLeftPage) return;
            setLoadError(error);
            if (week) applyWeek(week);
        });
        return () => {
            isLeftPage = true;
        };
    }, [requestedWeek, applyWeek]);

    const isDirty = useMemo(
        () => JSON.stringify(toPayloadEntries(rows)) !== JSON.stringify(toPayloadEntries(savedRows)),
        [rows, savedRows],
    );

    if (loadError)
        return (
            <StatusBanner tone="error" title="โหลดลงเวลาไม่สำเร็จ">
                {loadError.message}
            </StatusBanner>
        );
    if (!data || (requestedWeek !== null && data.week_start !== requestedWeek)) return <PageSkeleton />;
    if (!data.employee || !data.week)
        return (
            <StatusBanner tone="info" title="ยังลงเวลาไม่ได้">
                {TIMESHEET_MESSAGES.notEmployee}
            </StatusBanner>
        );

    const week = data.week;
    const weekStart = data.week_start;
    const setWeekStart = setRequestedWeek;
    const isEditable = EDITABLE_STATUSES.includes(week.tsw_status);
    const status = TIMESHEET_STATUS[week.tsw_status];
    const thisWeekStart = weekStartOf(data.today);

    function changeRow(key: string, field: keyof TimesheetRow, value: string) {
        setRows((current) =>
            current.map((row) => {
                if (row.key !== key) return row;
                // เปลี่ยนโปรเจกต์ → งานเดิมไม่อยู่ในโปรเจกต์ใหม่ ล้างทิ้ง
                if (field === "tse_project_id") return { ...row, tse_project_id: value, tse_task_id: "" };
                return { ...row, [field]: value };
            }),
        );
    }

    function addRow(date: string) {
        setRows((current) => [
            ...current,
            { key: newRowKey(), tse_date: date, tse_project_id: "", tse_task_id: "", tse_hours: "", tse_note: "" },
        ]);
    }

    async function save(): Promise<MyTimesheetWeek | null> {
        if (!data?.week) return null;
        setActionError(null);
        const payload = { week_start: weekStart, tsw_version: data.week.tsw_version, entries: toPayloadEntries(rows) };
        const checked = timesheetWeekSchema.safeParse(payload);
        if (!checked.success) {
            setErrors(toFieldErrors(checked.error.issues));
            toast.error("ยังบันทึกไม่ได้ — แก้แถวที่มีข้อความสีแดงก่อน");
            return null;
        }
        setIsWorking(true);
        const { data: saved, error } = await apiFetch<MyTimesheetWeek>("/timesheet/me", {
            method: "PUT",
            body: payload,
        });
        setIsWorking(false);
        if (error) {
            setErrors(error.fields);
            setActionError(error.message);
            return null;
        }
        applyWeek(saved);
        return saved;
    }

    async function handleSave() {
        if (await save()) toast.success("บันทึกลงเวลาแล้ว");
    }

    async function handleSubmit() {
        const current = isDirty ? await save() : data;
        if (!current?.week) return;
        setIsWorking(true);
        const { data: submitted, error } = await apiFetch<MyTimesheetWeek>("/timesheet/me/submit", {
            method: "POST",
            body: { week_start: weekStart, tsw_version: current.week.tsw_version },
        });
        setIsWorking(false);
        if (error) {
            setActionError(error.message);
            return;
        }
        applyWeek(submitted);
        toast.success("ส่งลงเวลาให้ผู้อนุมัติแล้ว");
    }

    async function copyPreviousWeek() {
        setActionError(null);
        const { data: previous, error } = await apiFetch<MyTimesheetWeek>(
            `/timesheet/me?week=${addDays(weekStart, -7)}`,
        );
        if (error || !previous || !data) {
            setActionError(error?.message ?? "โหลดสัปดาห์ก่อนไม่สำเร็จ");
            return;
        }
        const allowedDates = new Set(data.days.filter((day) => day.blocked_reason === null).map((day) => day.date));
        const existingKeys = new Set(rows.map((row) => `${row.tse_date}|${row.tse_project_id}|${row.tse_task_id}`));
        const copied = toRows(previous.entries)
            .map((row) => ({ ...row, tse_date: addDays(row.tse_date, 7) }))
            .filter((row) => allowedDates.has(row.tse_date))
            .filter((row) => !existingKeys.has(`${row.tse_date}|${row.tse_project_id}|${row.tse_task_id}`));
        if (copied.length === 0) {
            toast.info("ไม่มีแถวที่คัดลอกได้ (สัปดาห์ก่อนว่าง หรือวันนั้นลงไม่ได้)");
            return;
        }
        setRows((current) => [...current, ...copied]);
        toast.success(`คัดลอก ${copied.length} แถว — ตรวจชั่วโมงแล้วกดบันทึก`);
    }

    const workingDayCount = data.days.filter((day) => day.is_working_day).length;

    return (
        <div className="grid grid-cols-1 gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        aria-label="สัปดาห์ก่อน"
                        disabled={isDirty}
                        className={buttonClass("secondary", "md")}
                        onClick={() => setWeekStart(addDays(weekStart, -7))}
                    >
                        <ChevronLeft size={16} />
                    </button>
                    <span className="min-w-36 text-center text-sm font-medium text-gray-900">
                        {dayLabel(weekStart)} – {dayLabel(addDays(weekStart, 6))}
                    </span>
                    <button
                        type="button"
                        aria-label="สัปดาห์ถัดไป"
                        disabled={isDirty || weekStart >= thisWeekStart}
                        className={buttonClass("secondary", "md")}
                        onClick={() => setWeekStart(addDays(weekStart, 7))}
                    >
                        <ChevronRight size={16} />
                    </button>
                    {weekStart !== thisWeekStart && (
                        <button
                            type="button"
                            disabled={isDirty}
                            className={buttonClass("ghost", "md")}
                            onClick={() => setWeekStart(thisWeekStart)}
                        >
                            สัปดาห์นี้
                        </button>
                    )}
                </div>
                <StatusPill tone={status.tone}>{status.label}</StatusPill>
            </div>
            {isDirty && <FieldHint>มีการแก้ที่ยังไม่บันทึก — บันทึกก่อนเปลี่ยนสัปดาห์</FieldHint>}

            {week.tsw_status === "returned" && (
                <StatusBanner tone="error" title="ถูกตีกลับ — แก้แล้วส่งใหม่">
                    {week.tsw_return_reason}
                </StatusBanner>
            )}
            {week.tsw_status === "submitted" && <StatusBanner tone="warn" title={TIMESHEET_MESSAGES.submitted} />}
            {week.tsw_status === "approved" && <StatusBanner tone="done" title={TIMESHEET_MESSAGES.approved} />}
            {isEditable && (
                <FieldHint>
                    {TIMESHEET_MESSAGES.rules(data.backdate_days)} · {TIMESHEET_MESSAGES.internalWork}
                </FieldHint>
            )}

            {data.days.map((day) => {
                const dayRows = rows.filter((row) => row.tse_date === day.date);
                return (
                    <DayCard
                        key={day.date}
                        day={day}
                        rows={dayRows}
                        rowIndexes={dayRows.map((row) => rows.indexOf(row))}
                        projects={data.projects}
                        isEditable={isEditable}
                        dayTotal={sumHours(dayRows)}
                        errors={errors}
                        onAdd={() => addRow(day.date)}
                        onChange={changeRow}
                        onRemove={(key) => setRows((current) => current.filter((row) => row.key !== key))}
                    />
                );
            })}

            {isEditable && (
                <div className="sticky bottom-3 z-10 grid gap-2 rounded-2xl border border-gray-200 bg-white/95 p-3 shadow-float backdrop-blur">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm text-gray-700">
                            รวม <span className="font-medium text-gray-900 tabular-nums">{sumHours(rows)}</span> ชม. ·
                            วันทำงาน {workingDayCount} วัน
                        </span>
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                className={buttonClass("ghost", "md")}
                                onClick={copyPreviousWeek}
                                disabled={isWorking}
                            >
                                <Copy size={16} />
                                คัดลอกสัปดาห์ก่อน
                            </button>
                            <button
                                type="button"
                                className={buttonClass("secondary", "md")}
                                onClick={handleSave}
                                disabled={isWorking || !isDirty}
                            >
                                บันทึก
                            </button>
                            <button
                                type="button"
                                className={buttonClass("primary", "md")}
                                onClick={handleSubmit}
                                disabled={isWorking || rows.length === 0}
                            >
                                <Send size={16} />
                                ส่งให้อนุมัติ
                            </button>
                        </div>
                    </div>
                    <FieldHint error={actionError}>{TIMESHEET_MESSAGES.copyPrevious}</FieldHint>
                </div>
            )}
        </div>
    );
}
