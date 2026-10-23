"use client";

// ลงเวลารายวัน (มือถือ/จอแคบ · U-2 2026-10-19) — ข้อมูลชุดเดียวกับตารางสัปดาห์ (week-lines)
// วันนี้เด่นสุด · วันที่ยังไม่มีชั่วโมงย่อเหลือบรรทัดเดียว · วันที่ยังไม่ถึงที่ติดกันรวมเป็นบรรทัดเดียว
import { CalendarCheck, Plus, Trash2 } from "lucide-react";
import FieldHint from "@/components/ui/guidance/field-hint";
import { inputClass } from "@/components/ui/form-field";
import { buttonClass } from "@/components/ui/button";
import type { TimesheetDay, TimesheetProjectOption } from "../../_types";
import { LineFields } from "./week-grid";
import {
    dayHours,
    dayLabel,
    dayNoteOf,
    type CellErrors,
    type LineErrors,
    type WeekCell,
    type WeekLine,
} from "./week-lines";

// หน้าอนุมัติลงเวลาใช้ชื่อวันชุดเดียวกัน
export { dayLabel } from "./week-lines";


type DayListProps = {
    days: TimesheetDay[];
    today: string;
    lines: WeekLine[];
    projects: TimesheetProjectOption[];
    isEditable: boolean;
    cellErrors: Map<string, CellErrors>;
    lineErrors: Map<string, LineErrors>;
    fillLabel: string | null;
    onCellChange: (lineKey: string, date: string, patch: Partial<WeekCell>) => void;
    onEntryLineChange: (lineKey: string, date: string, field: "project_id" | "task_id", value: string) => void;
    onAddEntry: (date: string) => void;
    onRemoveEntry: (lineKey: string, date: string) => void;
    onFillLine: (lineKey: string) => void;
};

type DayBlock = { kind: "day"; day: TimesheetDay } | { kind: "future"; days: TimesheetDay[] };

export default function DayList(props: DayListProps) {
    const { days, today, lines } = props;
    // วันที่ยังไม่ถึงและยังว่าง ที่อยู่ติดกัน → บรรทัดเดียว
    const blocks: DayBlock[] = [];
    for (const day of days) {
        const isEmptyFuture = day.date > today && !lines.some((line) => line.cells[day.date]);
        const previous = blocks[blocks.length - 1];
        if (isEmptyFuture && previous?.kind === "future") {
            previous.days.push(day);
            continue;
        }
        blocks.push(isEmptyFuture ? { kind: "future", days: [day] } : { kind: "day", day });
    }

    return (
        <div className="grid gap-2">
            {blocks.map((block) =>
                block.kind === "future" ? (
                    <FutureDays key={block.days[0].date} days={block.days} />
                ) : (
                    <DayCard key={block.day.date} {...props} day={block.day} />
                ),
            )}
        </div>
    );
}

function FutureDays({ days }: { days: TimesheetDay[] }) {
    const first = dayLabel(days[0].date);
    const range = days.length === 1 ? first : `${first} - ${dayLabel(days[days.length - 1].date)}`;
    return (
        <p className="flex flex-wrap items-baseline justify-between gap-x-3 rounded-xl border border-dashed border-gray-200 px-4 py-2.5 text-sm text-gray-500">
            <span>{range}</span>
            <span className="text-xs">ยังไม่ถึงวัน ลงล่วงหน้าไม่ได้</span>
        </p>
    );
}

function DayCard({
    day,
    today,
    lines,
    projects,
    isEditable,
    cellErrors,
    lineErrors,
    fillLabel,
    onCellChange,
    onEntryLineChange,
    onAddEntry,
    onRemoveEntry,
    onFillLine,
}: DayListProps & { day: TimesheetDay }) {
    const entries = lines.filter((line) => line.cells[day.date]);
    const canAdd = isEditable && day.blocked_reason === null;
    const isToday = day.date === today;
    const note = [dayNoteOf(day), day.blocked_reason && `ลงไม่ได้: ${day.blocked_reason}`].filter(Boolean).join(" · ");
    const total = dayHours(lines, day.date);

    // วันที่ยังว่าง: บรรทัดเดียว + ปุ่มเพิ่ม (ถ้าลงได้)
    if (entries.length === 0) {
        return (
            <section
                aria-label={dayLabel(day.date)}
                className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-2 ${
                    isToday ? "border-blue-500 bg-blue-50/40" : "border-gray-200 bg-white"
                }`}
            >
                <span className="grid gap-0.5 py-0.5">
                    <span className="text-sm font-medium text-gray-900">
                        {dayLabel(day.date)}
                        {isToday && <span className="ml-1.5 text-xs font-normal text-blue-600">วันนี้</span>}
                    </span>
                    {note && <span className="text-xs text-gray-500">{note}</span>}
                </span>
                {canAdd && (
                    <button type="button" className={buttonClass("secondary", "sm")} onClick={() => onAddEntry(day.date)}>
                        <Plus size={14} />
                        ลงเวลา
                    </button>
                )}
            </section>
        );
    }

    return (
        <section
            aria-label={dayLabel(day.date)}
            className={`grid gap-3 rounded-2xl border p-4 ${isToday ? "border-blue-500 bg-white shadow-sm" : "border-gray-200 bg-white"}`}
        >
            <header className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="grid gap-0.5">
                    <span className="text-sm font-medium text-gray-900">
                        {dayLabel(day.date)}
                        {isToday && <span className="ml-1.5 text-xs font-normal text-blue-600">วันนี้</span>}
                    </span>
                    {note && <span className="text-xs text-gray-500">{note}</span>}
                </span>
                <span className="text-sm font-medium text-gray-900 tabular-nums">{total} ชม.</span>
            </header>

            {entries.map((line) => {
                const cell = line.cells[day.date];
                const errorsOfCell = cellErrors.get(`${line.key}|${day.date}`) ?? {};
                const isLocked = !isEditable || day.blocked_reason !== null;
                return (
                    <div key={line.key} className="grid grid-cols-[1fr_5.5rem_auto] items-start gap-2 rounded-xl bg-gray-50 p-3">
                        <LineFields
                            line={line}
                            projects={projects}
                            isEditable={!isLocked}
                            errors={lineErrors.get(line.key) ?? {}}
                            onChange={(field, value) => onEntryLineChange(line.key, day.date, field, value)}
                        />
                        <div className="grid gap-1">
                            <input
                                aria-label="ชั่วโมง"
                                inputMode="decimal"
                                placeholder="ชม."
                                disabled={isLocked}
                                value={cell.hours}
                                onChange={(event) => onCellChange(line.key, day.date, { hours: event.target.value })}
                                className={`${inputClass(Boolean(errorsOfCell.hours))} text-center tabular-nums`}
                            />
                        </div>
                        {isLocked ? (
                            <span />
                        ) : (
                            <button
                                type="button"
                                aria-label="ลบแถวนี้"
                                className={buttonClass("ghost", "md")}
                                onClick={() => onRemoveEntry(line.key, day.date)}
                            >
                                <Trash2 size={16} />
                            </button>
                        )}
                        {(errorsOfCell.hours ?? errorsOfCell.date) && (
                            <div className="col-span-3">
                                <FieldHint error={errorsOfCell.hours ?? errorsOfCell.date} />
                            </div>
                        )}
                        <input
                            aria-label="รายละเอียดงาน"
                            placeholder="รายละเอียด (ไม่บังคับ)"
                            disabled={isLocked}
                            maxLength={255}
                            value={cell.note}
                            onChange={(event) => onCellChange(line.key, day.date, { note: event.target.value })}
                            className={`${inputClass(Boolean(errorsOfCell.note))} col-span-3`}
                        />
                        {errorsOfCell.note && (
                            <div className="col-span-3">
                                <FieldHint error={errorsOfCell.note} />
                            </div>
                        )}
                        {!isLocked && fillLabel && (
                            <button
                                type="button"
                                className="col-span-3 inline-flex min-h-9 w-fit items-center gap-1 text-xs text-blue-600"
                                onClick={() => onFillLine(line.key)}
                            >
                                <CalendarCheck size={14} />
                                {fillLabel}
                            </button>
                        )}
                    </div>
                );
            })}

            {canAdd && (
                <button
                    type="button"
                    className={`${buttonClass("secondary", "sm")} justify-self-start`}
                    onClick={() => onAddEntry(day.date)}
                >
                    <Plus size={14} />
                    เพิ่มแถว
                </button>
            )}
        </section>
    );
}
