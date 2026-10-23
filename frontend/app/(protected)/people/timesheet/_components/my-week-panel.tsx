"use client";

// สัปดาห์ของฉัน — เลื่อนสัปดาห์ · ลงชั่วโมง · บันทึกทั้งสัปดาห์ · ส่งให้อนุมัติ · คัดลอกสัปดาห์ก่อน · เติมวันว่าง
// U-2 (2026-10-19): จอคอม = ตารางสัปดาห์ (week-grid) · จอแคบ = รายวัน (day-card) · ข้อมูลชุดเดียวกัน (week-lines)
// ตรวจด้วย timesheetWeekSchema ชุดเดียวกับ backend ก่อนส่ง (ส่งค่าที่พิมพ์เป็นข้อความ — schema แปลงชั่วโมงเป็น BigInt ใช้ตรวจเท่านั้น)
// error เก็บตาม "แถว|วัน" (ไม่ใช่ลำดับรายการ) แก้ช่องอื่นแล้ว error ไม่ย้ายไปผิดช่อง
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Copy, Send } from "lucide-react";
import StatusBanner from "@/components/ui/guidance/status-banner";
import FieldHint from "@/components/ui/guidance/field-hint";
import HowItWorks from "@/components/ui/guidance/how-it-works";
import StatusPill from "@/components/ui/status-pill";
import { useLeaveWarning } from "@/components/ui/unsaved-bar";
import { PageSkeleton } from "@/components/ui/skeleton";
import { buttonClass } from "@/components/ui/button";
import { apiFetch, type ApiError } from "@/lib/api";
import { toFieldErrors, type FieldErrors } from "@/lib/form-errors";
import { addDays, weekStartOf } from "@/lib/shared/payroll-math.mjs";
import { timesheetWeekSchema } from "@/lib/shared/schemas/timesheet.mjs";
import { isRealDateText } from "@/lib/shared/schemas/common.mjs";
import { TIMESHEET_MESSAGES, TIMESHEET_STATUS } from "../../_messages";
import { usePeopleSetup } from "../../_hooks/use-people-setup";
import type { MyTimesheetWeek } from "../../_types";
import DayList from "./day-card";
import WeekGrid from "./week-grid";
import {
    dayLabel,
    emptyLine,
    entriesFromLines,
    errorsByPosition,
    fillHoursFor,
    isFillableDay,
    linesFromEntries,
    sumHours,
    type CellErrors,
    type LineErrors,
    type WeekCell,
    type WeekLine,
} from "./week-lines";

const EDITABLE_STATUSES = ["draft", "returned"];

type GridErrors = { cellErrors: Map<string, CellErrors>; lineErrors: Map<string, LineErrors> };
const NO_ERRORS: GridErrors = { cellErrors: new Map(), lineErrors: new Map() };

// สัปดาห์แรกที่เปิด = สัปดาห์นี้ตามเวลาไทยของ backend (ไม่ใช้นาฬิกาเครื่องผู้ใช้)
export default function MyWeekPanel() {
    // ?week=YYYY-MM-DD เปิดสัปดาห์นั้นตรงๆ (backend ปัดเป็นวันจันทร์เอง)
    const weekParam = useSearchParams().get("week");
    const [requestedWeek, setRequestedWeek] = useState<string | null>(
        weekParam && isRealDateText(weekParam) ? weekStartOf(weekParam) : null,
    );
    const [data, setData] = useState<MyTimesheetWeek | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);
    const [lines, setLines] = useState<WeekLine[]>([]);
    const [savedLines, setSavedLines] = useState<WeekLine[]>([]);
    const [gridErrors, setGridErrors] = useState<GridErrors>(NO_ERRORS);
    const [actionError, setActionError] = useState<string | null>(null);
    const [isWorking, setIsWorking] = useState(false);
    const { setup } = usePeopleSetup();

    // starterLines = แถวงานตั้งต้นของสัปดาห์ที่ยังว่าง (ไม่มีชั่วโมง จึงไม่นับว่าแก้ค้าง)
    const applyWeek = useCallback((week: MyTimesheetWeek, starterLines: WeekLine[] = []) => {
        const savedEntries = linesFromEntries(week.entries);
        const loadedLines = savedEntries.length > 0 ? savedEntries : starterLines;
        setData(week);
        setLines(loadedLines);
        setSavedLines(loadedLines);
        setGridErrors(NO_ERRORS);
    }, []);

    useEffect(() => {
        let isLeftPage = false;
        const query = requestedWeek ? `?week=${requestedWeek}` : "";
        async function load() {
            const { data: week, error } = await apiFetch<MyTimesheetWeek>(`/timesheet/me${query}`);
            if (isLeftPage) return;
            setLoadError(error);
            if (!week) return;
            // สัปดาห์ที่ยังว่างและแก้ได้: ตั้งแถวงานจากโปรเจกต์/งานของสัปดาห์ก่อนไว้ให้ พิมพ์แค่ชั่วโมง
            const isEmptyEditable =
                week.entries.length === 0 && week.week !== null && EDITABLE_STATUSES.includes(week.week.tsw_status);
            if (!isEmptyEditable) {
                applyWeek(week);
                return;
            }
            const { data: previous } = await apiFetch<MyTimesheetWeek>(
                `/timesheet/me?week=${addDays(week.week_start, -7)}`,
            );
            if (isLeftPage) return;
            applyWeek(week, starterLinesFrom(week, previous));
        }
        void load();
        return () => {
            isLeftPage = true;
        };
    }, [requestedWeek, applyWeek]);

    const dates = useMemo(() => data?.days.map((day) => day.date) ?? [], [data]);
    const isDirty = useMemo(
        () =>
            JSON.stringify(entriesFromLines(lines, dates).entries) !==
            JSON.stringify(entriesFromLines(savedLines, dates).entries),
        [lines, savedLines, dates],
    );
    useLeaveWarning(isDirty);

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
    const isEditable = EDITABLE_STATUSES.includes(week.tsw_status);
    const status = TIMESHEET_STATUS[week.tsw_status];
    const thisWeekStart = weekStartOf(data.today);
    const hoursPerDay = setup?.settings?.ps_hours_per_day ?? null;
    const fillLabel = hoursPerDay ? `เติม ${Number(hoursPerDay)} ชม. ทุกวันที่ยังว่าง` : null;
    const totalHours = sumHours(lines.flatMap((line) => Object.values(line.cells).map((cell) => cell.hours)));

    // ─── แก้ข้อมูล ─────────────────────────────────────────────────────────────────

    // แก้ช่องไหน error ของช่องนั้นหาย (ช่องอื่นยังแสดงอยู่)
    function clearCellError(lineKey: string, date: string) {
        setGridErrors((current) => {
            const cellKey = `${lineKey}|${date}`;
            if (!current.cellErrors.has(cellKey)) return current;
            const cellErrors = new Map(current.cellErrors);
            cellErrors.delete(cellKey);
            return { ...current, cellErrors };
        });
    }

    /** แก้ชั่วโมง/รายละเอียดของช่อง · ตาราง: ลบจนว่างทั้งคู่ = ไม่ลงวันนั้น · รายวัน: แถวยังอยู่จนกดลบ */
    function changeCell(lineKey: string, date: string, patch: Partial<WeekCell>, removeWhenEmpty: boolean) {
        setLines((current) =>
            current.map((line) => {
                if (line.key !== lineKey) return line;
                const cell = { ...(line.cells[date] ?? { hours: "", note: "" }), ...patch };
                const cells = { ...line.cells };
                const isEmpty = cell.hours.trim() === "" && cell.note.trim() === "";
                if (removeWhenEmpty && isEmpty) delete cells[date];
                else cells[date] = cell;
                return { ...line, cells };
            }),
        );
        clearCellError(lineKey, date);
    }

    // เปลี่ยนโปรเจกต์ → งานเดิมไม่อยู่ในโปรเจกต์ใหม่ ล้างทิ้ง
    function comboChange(field: "project_id" | "task_id", value: string) {
        return field === "project_id" ? { project_id: value, task_id: "" } : { task_id: value };
    }

    /** ตาราง: เปลี่ยนโปรเจกต์/งานของทั้งแถว */
    function changeLine(lineKey: string, field: "project_id" | "task_id", value: string) {
        setLines((current) => current.map((line) => (line.key === lineKey ? { ...line, ...comboChange(field, value) } : line)));
    }

    /** รายวัน: เปลี่ยนโปรเจกต์/งานของวันเดียว — แถวนั้นมีวันอื่นด้วย ให้แยกวันนี้ออกเป็นแถวใหม่ (วันอื่นไม่เปลี่ยนตาม) */
    function changeEntryLine(lineKey: string, date: string, field: "project_id" | "task_id", value: string) {
        setLines((current) => {
            const line = current.find((item) => item.key === lineKey);
            if (!line) return current;
            const hasOtherDays = Object.keys(line.cells).some((cellDate) => cellDate !== date);
            if (!hasOtherDays) {
                return current.map((item) => (item.key === lineKey ? { ...item, ...comboChange(field, value) } : item));
            }
            const { [date]: movedCell, ...otherCells } = line.cells;
            const changed = comboChange(field, value);
            const projectId = "project_id" in changed ? changed.project_id : line.project_id;
            const movedLine = emptyLine(projectId, changed.task_id, { [date]: movedCell });
            return current.flatMap((item) => (item.key === lineKey ? [{ ...item, cells: otherCells }, movedLine] : [item]));
        });
    }

    /** รายวัน: เพิ่มแถว — ใช้แถวงานที่มีอยู่ (เช่น โปรเจกต์ของสัปดาห์ก่อน) ที่วันนี้ยังไม่ได้ลงก่อน ไม่ต้องเลือกโปรเจกต์ใหม่ */
    function addEntry(date: string) {
        const blankCell = { hours: "", note: "" };
        setLines((current) => {
            const unusedLine = current.find((line) => !line.cells[date]);
            if (!unusedLine) return [...current, emptyLine("", "", { [date]: blankCell })];
            return current.map((line) =>
                line.key === unusedLine.key ? { ...line, cells: { ...line.cells, [date]: blankCell } } : line,
            );
        });
    }

    // รายวัน: ลบเฉพาะวันนี้ · แถวงานยังอยู่ (ว่างก็ไม่ถูกส่ง) ให้ "ลงเวลา" วันอื่นใช้โปรเจกต์เดิมต่อได้
    function removeEntry(lineKey: string, date: string) {
        setLines((current) =>
            current.map((line) => {
                if (line.key !== lineKey) return line;
                const cells = { ...line.cells };
                delete cells[date];
                return { ...line, cells };
            }),
        );
        clearCellError(lineKey, date);
    }

    /** เติมชั่วโมงทำงานต่อวันให้แถวนี้ ทุกวันทำงานที่ลงได้และยังไม่มีชั่วโมงเลย (ลาครึ่งวัน = ครึ่งหนึ่ง) */
    function fillLine(lineKey: string) {
        if (!data || !hoursPerDay) return;
        const fillableDays = data.days.filter((day) => isFillableDay(day, lines));
        if (fillableDays.length === 0) {
            toast.info("ไม่มีวันทำงานที่ยังว่าง (วันที่ยังไม่ถึง วันหยุด และวันลาเต็มวันไม่เติมให้)");
            return;
        }
        setLines((current) =>
            current.map((line) => {
                if (line.key !== lineKey) return line;
                const cells = { ...line.cells };
                for (const day of fillableDays) {
                    cells[day.date] = { hours: fillHoursFor(day, hoursPerDay), note: cells[day.date]?.note ?? "" };
                }
                return { ...line, cells };
            }),
        );
        toast.success(`เติม ${fillableDays.length} วันแล้ว ตรวจแล้วกดบันทึก`);
    }

    // ─── บันทึก / ส่ง ─────────────────────────────────────────────────────────────

    function showErrors(errors: FieldErrors, positions: { lineKey: string; date: string }[]) {
        setGridErrors(errorsByPosition(errors, positions));
    }

    async function save(): Promise<MyTimesheetWeek | null> {
        if (!data?.week) return null;
        setActionError(null);
        const { entries, positions } = entriesFromLines(lines, dates);
        const payload = { week_start: weekStart, tsw_version: data.week.tsw_version, entries };
        const checked = timesheetWeekSchema.safeParse(payload);
        if (!checked.success) {
            showErrors(toFieldErrors(checked.error.issues), positions);
            toast.error("ยังบันทึกไม่ได้ แก้ช่องที่มีข้อความสีแดงก่อน");
            return null;
        }
        setIsWorking(true);
        const { data: saved, error } = await apiFetch<MyTimesheetWeek>("/timesheet/me", { method: "PUT", body: payload });
        setIsWorking(false);
        if (error) {
            showErrors(error.fields, positions);
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
        const { data: previous, error } = await apiFetch<MyTimesheetWeek>(`/timesheet/me?week=${addDays(weekStart, -7)}`);
        if (error || !previous || !data) {
            setActionError(error?.message ?? "โหลดสัปดาห์ก่อนไม่สำเร็จ");
            return;
        }
        const allowedDates = new Set(data.days.filter((day) => day.blocked_reason === null).map((day) => day.date));
        const copied = previous.entries
            .map((entry) => ({ ...entry, tse_date: addDays(entry.tse_date, 7) }))
            .filter((entry) => allowedDates.has(entry.tse_date));
        const isTaken = (current: WeekLine[], entry: (typeof copied)[number]) =>
            current.some(
                (line) =>
                    line.cells[entry.tse_date] &&
                    line.project_id === (entry.tse_project_id ?? "") &&
                    line.task_id === (entry.tse_task_id ?? ""),
            );
        const addable = copied.filter((entry) => !isTaken(lines, entry));
        if (addable.length === 0) {
            toast.info("ไม่มีแถวที่คัดลอกได้ (สัปดาห์ก่อนว่าง หรือวันนั้นลงไม่ได้)");
            return;
        }
        setLines((current) => {
            const next = current.map((line) => ({ ...line, cells: { ...line.cells } }));
            for (const entry of copied) {
                if (isTaken(next, entry)) continue;
                const projectId = entry.tse_project_id ?? "";
                const taskId = entry.tse_task_id ?? "";
                const cell = { hours: String(Number(entry.tse_hours)), note: entry.tse_note ?? "" };
                const line = next.find((item) => item.project_id === projectId && item.task_id === taskId);
                if (line) line.cells[entry.tse_date] = cell;
                else next.push(emptyLine(projectId, taskId, { [entry.tse_date]: cell }));
            }
            return next;
        });
        toast.success(`คัดลอก ${addable.length} ช่อง ตรวจชั่วโมงแล้วกดบันทึก`);
    }

    const shared = {
        days: data.days,
        today: data.today,
        lines,
        projects: data.projects,
        isEditable,
        cellErrors: gridErrors.cellErrors,
        lineErrors: gridErrors.lineErrors,
        fillLabel,
        onFillLine: fillLine,
    };

    return (
        <div className="grid grid-cols-1 gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        aria-label="สัปดาห์ก่อน"
                        disabled={isDirty}
                        className={buttonClass("secondary", "md")}
                        onClick={() => setRequestedWeek(addDays(weekStart, -7))}
                    >
                        <ChevronLeft size={16} />
                    </button>
                    <span className="min-w-36 text-center text-sm font-medium text-gray-900">
                        {dayLabel(weekStart)} - {dayLabel(addDays(weekStart, 6))}
                    </span>
                    <button
                        type="button"
                        aria-label="สัปดาห์ถัดไป"
                        disabled={isDirty || weekStart >= thisWeekStart}
                        className={buttonClass("secondary", "md")}
                        onClick={() => setRequestedWeek(addDays(weekStart, 7))}
                    >
                        <ChevronRight size={16} />
                    </button>
                    {weekStart !== thisWeekStart && (
                        <button
                            type="button"
                            disabled={isDirty}
                            className={buttonClass("ghost", "md")}
                            onClick={() => setRequestedWeek(thisWeekStart)}
                        >
                            สัปดาห์นี้
                        </button>
                    )}
                </div>
                <StatusPill tone={status.tone}>{status.label}</StatusPill>
            </div>
            {isDirty && <FieldHint>มีการแก้ที่ยังไม่บันทึก · บันทึกก่อนเปลี่ยนสัปดาห์</FieldHint>}

            {week.tsw_status === "returned" && (
                <StatusBanner tone="error" title="ถูกตีกลับ แก้แล้วส่งใหม่">
                    {week.tsw_return_reason}
                </StatusBanner>
            )}
            {week.tsw_status === "submitted" && <StatusBanner tone="warn" title={TIMESHEET_MESSAGES.submitted} />}
            {week.tsw_status === "approved" && <StatusBanner tone="done" title={TIMESHEET_MESSAGES.approved} />}
            {isEditable && (
                <div className="grid gap-1">
                    <FieldHint>{TIMESHEET_MESSAGES.shortRules(data.backdate_days)}</FieldHint>
                    <HowItWorks label="กติกาลงเวลา">
                        <p>{TIMESHEET_MESSAGES.rules(data.backdate_days)}</p>
                        <p>{TIMESHEET_MESSAGES.internalWork}</p>
                        <p>{TIMESHEET_MESSAGES.copyPrevious}</p>
                        {hoursPerDay && <p>{TIMESHEET_MESSAGES.fillEmpty(Number(hoursPerDay))}</p>}
                    </HowItWorks>
                </div>
            )}

            <div className="hidden lg:block">
                <WeekGrid
                    {...shared}
                    onCellChange={(lineKey, date, patch) => changeCell(lineKey, date, patch, true)}
                    onLineChange={changeLine}
                    onRemoveLine={(lineKey) => setLines((current) => current.filter((line) => line.key !== lineKey))}
                    onAddLine={() => setLines((current) => [...current, emptyLine()])}
                />
            </div>
            <div className="lg:hidden">
                <DayList
                    {...shared}
                    onCellChange={(lineKey, date, patch) => changeCell(lineKey, date, patch, false)}
                    onEntryLineChange={changeEntryLine}
                    onAddEntry={addEntry}
                    onRemoveEntry={removeEntry}
                />
            </div>

            {isEditable && (
                <div className="sticky bottom-3 z-10 grid gap-2 rounded-2xl border border-gray-200 bg-white/95 p-3 shadow-float backdrop-blur">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm text-gray-700">
                            รวม <span className="font-medium text-gray-900 tabular-nums">{totalHours}</span> ชม.
                        </span>
                        <div className="flex flex-wrap gap-2">
                            {isDirty && (
                                <button
                                    type="button"
                                    className={buttonClass("ghost", "md")}
                                    onClick={() => {
                                        setLines(savedLines);
                                        setGridErrors(NO_ERRORS);
                                    }}
                                    disabled={isWorking}
                                >
                                    ยกเลิกที่แก้
                                </button>
                            )}
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
                                disabled={isWorking || lines.every((line) => Object.keys(line.cells).length === 0)}
                            >
                                <Send size={16} />
                                ส่งให้อนุมัติ
                            </button>
                        </div>
                    </div>
                    {actionError && <FieldHint error={actionError} />}
                </div>
            )}
        </div>
    );
}

/**
 * แถวงานตั้งต้นของสัปดาห์ที่ยังว่าง: โปรเจกต์/งานของสัปดาห์ก่อน (เฉพาะที่ยังลงได้) ไม่มีชั่วโมง
 * สัปดาห์ก่อนว่างด้วย = แถวว่าง 1 แถว (ตารางพิมพ์ได้ทันที ไม่ต้องกดเพิ่มแถว)
 */
function starterLinesFrom(week: MyTimesheetWeek, previous: MyTimesheetWeek | null): WeekLine[] {
    const canLog = (projectId: string) =>
        projectId === "" || week.projects.some((project) => project.project_id === projectId && project.can_log);
    const combos = linesFromEntries(previous?.entries ?? []).filter((line) => canLog(line.project_id));
    if (combos.length === 0) return [emptyLine()];
    return combos.map((line) => emptyLine(line.project_id, line.task_id));
}
