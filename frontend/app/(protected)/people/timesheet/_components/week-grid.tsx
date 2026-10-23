"use client";

// ตารางสัปดาห์ (จอคอม · U-2 2026-10-19) — แถว = โปรเจกต์/งาน · คอลัมน์ = จันทร์–อาทิตย์ · รวมต่อวันและต่อแถว
// พิมพ์ชั่วโมงในช่องได้เลย · ลบเลขออกจนว่าง (และไม่มีรายละเอียด) = ไม่ลงวันนั้น · รายละเอียดรายวันกาง "รายละเอียด" ใต้แถว
import { Fragment, useState } from "react";
import { CalendarCheck, ChevronDown, Plus, Trash2 } from "lucide-react";
import FieldHint from "@/components/ui/guidance/field-hint";
import { inputClass } from "@/components/ui/form-field";
import { buttonClass } from "@/components/ui/button";
import type { TimesheetDay, TimesheetProjectOption } from "../../_types";
import {
    dayHours,
    dayNoteOf,
    lineHours,
    shortDayLabel,
    sumHours,
    type CellErrors,
    type LineErrors,
    type WeekCell,
    type WeekLine,
} from "./week-lines";

type WeekGridProps = {
    days: TimesheetDay[];
    today: string;
    lines: WeekLine[];
    projects: TimesheetProjectOption[];
    isEditable: boolean;
    cellErrors: Map<string, CellErrors>;
    lineErrors: Map<string, LineErrors>;
    fillLabel: string | null;
    onCellChange: (lineKey: string, date: string, patch: Partial<WeekCell>) => void;
    onLineChange: (lineKey: string, field: "project_id" | "task_id", value: string) => void;
    onRemoveLine: (lineKey: string) => void;
    onAddLine: () => void;
    onFillLine: (lineKey: string) => void;
};

export default function WeekGrid({
    days,
    today,
    lines,
    projects,
    isEditable,
    cellErrors,
    lineErrors,
    fillLabel,
    onCellChange,
    onLineChange,
    onRemoveLine,
    onAddLine,
    onFillLine,
}: WeekGridProps) {
    const [openNotes, setOpenNotes] = useState<Set<string>>(new Set());
    const allHours = lines.flatMap((line) => Object.values(line.cells).map((cell) => cell.hours));

    function toggleNotes(lineKey: string) {
        setOpenNotes((current) => {
            const next = new Set(current);
            if (next.has(lineKey)) next.delete(lineKey);
            else next.add(lineKey);
            return next;
        });
    }

    return (
        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
            <table className="w-full min-w-184 table-fixed border-collapse text-sm">
                <thead>
                    <tr className="border-b border-gray-200 bg-gray-50/80">
                        <th scope="col" className="w-[30%] px-3 py-2.5 text-left font-medium text-gray-600">
                            โปรเจกต์ / งาน
                        </th>
                        {days.map((day) => (
                            <DayHeader key={day.date} day={day} today={today} />
                        ))}
                        <th scope="col" className="w-16 px-2 py-2.5 text-right font-medium text-gray-600">
                            รวม
                        </th>
                        {isEditable && <th scope="col" className="w-12" aria-label="ลบแถว" />}
                    </tr>
                </thead>
                <tbody>
                    {lines.length === 0 && (
                        <tr>
                            <td colSpan={days.length + 3} className="px-3 py-6 text-center text-gray-500">
                                {isEditable
                                    ? "ยังไม่มีชั่วโมงในสัปดาห์นี้ · กด เพิ่มแถวงาน แล้วพิมพ์ชั่วโมงในช่องวัน"
                                    : "ไม่มีชั่วโมงในสัปดาห์นี้"}
                            </td>
                        </tr>
                    )}
                    {lines.map((line) => {
                        const errorsOfLine = lineErrors.get(line.key) ?? {};
                        const isNotesOpen = openNotes.has(line.key);
                        const noteCount = Object.values(line.cells).filter((cell) => cell.note).length;
                        return (
                            <Fragment key={line.key}>
                                <tr className="border-b border-gray-100 align-top">
                                    <td className="px-3 py-2">
                                        <LineFields
                                            line={line}
                                            projects={projects}
                                            isEditable={isEditable}
                                            errors={errorsOfLine}
                                            onChange={(field, value) => onLineChange(line.key, field, value)}
                                        />
                                        <div className="mt-1 flex flex-wrap gap-x-3">
                                            <button
                                                type="button"
                                                aria-expanded={isNotesOpen}
                                                className="inline-flex min-h-8 items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                                                onClick={() => toggleNotes(line.key)}
                                            >
                                                <ChevronDown
                                                    size={14}
                                                    className={`transition-transform ${isNotesOpen ? "rotate-180" : ""}`}
                                                />
                                                รายละเอียด{noteCount > 0 ? ` (${noteCount})` : ""}
                                            </button>
                                            {isEditable && fillLabel && (
                                                <button
                                                    type="button"
                                                    className="inline-flex min-h-8 items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                                                    onClick={() => onFillLine(line.key)}
                                                >
                                                    <CalendarCheck size={14} />
                                                    {fillLabel}
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                    {days.map((day) => {
                                        const cell = line.cells[day.date];
                                        const errorsOfCell = cellErrors.get(`${line.key}|${day.date}`) ?? {};
                                        const cellError = errorsOfCell.hours ?? errorsOfCell.date;
                                        const isLocked = !isEditable || day.blocked_reason !== null;
                                        return (
                                            <td key={day.date} className={`px-1 py-2 ${dayTint(day)}`}>
                                                <input
                                                    aria-label={`ชั่วโมง ${shortDayLabel(day.date)}`}
                                                    inputMode="decimal"
                                                    disabled={isLocked}
                                                    value={cell?.hours ?? ""}
                                                    placeholder={isLocked ? "" : "-"}
                                                    onChange={(event) =>
                                                        onCellChange(line.key, day.date, { hours: event.target.value })
                                                    }
                                                    className={`${inputClass(Boolean(cellError))} px-1 text-center tabular-nums`}
                                                />
                                                {cell?.note && !isNotesOpen && (
                                                    <span className="mx-auto mt-1 block h-1.5 w-1.5 rounded-full bg-blue-500" />
                                                )}
                                                {cellError && (
                                                    <span className="mt-1 block text-xs leading-tight text-red-600">
                                                        {cellError}
                                                    </span>
                                                )}
                                            </td>
                                        );
                                    })}
                                    <td className="px-2 py-4 text-right font-medium text-gray-900 tabular-nums">
                                        {lineHours(line)}
                                    </td>
                                    {isEditable && (
                                        <td className="py-2 pr-2 text-right">
                                            <button
                                                type="button"
                                                aria-label="ลบแถวนี้"
                                                className={buttonClass("ghost", "md")}
                                                onClick={() => onRemoveLine(line.key)}
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </td>
                                    )}
                                </tr>
                                {isNotesOpen && (
                                    <tr className="border-b border-gray-100 bg-gray-50/60 align-top">
                                        <td className="px-3 py-2 text-xs text-gray-500">
                                            รายละเอียดรายวัน (ไม่บังคับ) · ผู้อนุมัติเห็น
                                        </td>
                                        {days.map((day) => {
                                            const cell = line.cells[day.date];
                                            const noteError = cellErrors.get(`${line.key}|${day.date}`)?.note;
                                            const isLocked = !isEditable || day.blocked_reason !== null;
                                            return (
                                                <td key={day.date} className="px-1 py-2">
                                                    <textarea
                                                        aria-label={`รายละเอียด ${shortDayLabel(day.date)}`}
                                                        rows={3}
                                                        maxLength={255}
                                                        disabled={isLocked}
                                                        value={cell?.note ?? ""}
                                                        onChange={(event) =>
                                                            onCellChange(line.key, day.date, { note: event.target.value })
                                                        }
                                                        className={`${inputClass(Boolean(noteError))} px-1.5 text-xs`}
                                                    />
                                                    <FieldHint error={noteError} />
                                                </td>
                                            );
                                        })}
                                        <td colSpan={isEditable ? 2 : 1} />
                                    </tr>
                                )}
                            </Fragment>
                        );
                    })}
                </tbody>
                <tfoot>
                    <tr className="bg-gray-50/80">
                        <th scope="row" className="px-3 py-2.5 text-left font-medium text-gray-600">
                            รวมต่อวัน
                        </th>
                        {days.map((day) => (
                            <td key={day.date} className="px-1 py-2.5 text-center font-medium text-gray-900 tabular-nums">
                                {dayHours(lines, day.date)}
                            </td>
                        ))}
                        <td className="px-2 py-2.5 text-right font-medium text-blue-600 tabular-nums">
                            {sumHours(allHours)}
                        </td>
                        {isEditable && <td />}
                    </tr>
                </tfoot>
            </table>
            {isEditable && (
                <div className="border-t border-gray-100 p-3">
                    <button type="button" className={buttonClass("secondary", "sm")} onClick={onAddLine}>
                        <Plus size={14} />
                        เพิ่มแถวงาน
                    </button>
                </div>
            )}
        </div>
    );
}

// หัวคอลัมน์วัน: วันที่ + เหตุที่ลงไม่ได้/วันหยุด/ลา (สั้นๆ)
function DayHeader({ day, today }: { day: TimesheetDay; today: string }) {
    const isToday = day.date === today;
    const blockedNote = day.date > today ? "ยังไม่ถึง" : "ลงไม่ได้";
    const note = day.blocked_reason ? blockedNote : dayNoteOf(day);
    return (
        <th scope="col" className={`px-1 py-2 text-center font-medium ${dayTint(day)}`}>
            <span className={`block ${isToday ? "text-blue-600" : "text-gray-700"}`}>{shortDayLabel(day.date)}</span>
            {isToday && <span className="block text-[11px] font-normal text-blue-600">วันนี้</span>}
            {!isToday && note && <span className="block truncate text-[11px] font-normal text-gray-500">{note}</span>}
        </th>
    );
}

function dayTint(day: TimesheetDay) {
    if (day.blocked_reason !== null || !day.is_working_day) return "bg-gray-50";
    return "";
}

// โปรเจกต์ + งานของแถว — โปรเจกต์ที่ปิดลงเวลาแล้วยังแสดงถ้าแถวเดิมใช้อยู่
export function LineFields({
    line,
    projects,
    isEditable,
    errors,
    onChange,
}: {
    line: Pick<WeekLine, "project_id" | "task_id">;
    projects: TimesheetProjectOption[];
    isEditable: boolean;
    errors: LineErrors;
    onChange: (field: "project_id" | "task_id", value: string) => void;
}) {
    const project = projects.find((option) => option.project_id === line.project_id);
    const projectChoices = projects.filter((option) => option.can_log || option.project_id === line.project_id);
    return (
        <div className="grid gap-1.5">
            <select
                aria-label="โปรเจกต์"
                disabled={!isEditable}
                value={line.project_id}
                onChange={(event) => onChange("project_id", event.target.value)}
                className={inputClass(Boolean(errors.project))}
            >
                <option value="">งานภายใน (ไม่ใช่โปรเจกต์)</option>
                {projectChoices.map((option) => (
                    <option key={option.project_id} value={option.project_id}>
                        {option.project_name}
                    </option>
                ))}
            </select>
            <FieldHint error={errors.project} />
            {project && (
                <select
                    aria-label="งาน"
                    disabled={!isEditable}
                    value={line.task_id}
                    onChange={(event) => onChange("task_id", event.target.value)}
                    className={inputClass(Boolean(errors.task))}
                >
                    <option value="">ไม่ระบุงาน</option>
                    {project.tasks.map((task) => (
                        <option key={task.task_id} value={task.task_id}>
                            {task.task_parent_id ? "↳ " : ""}
                            {task.task_title}
                        </option>
                    ))}
                </select>
            )}
            <FieldHint error={errors.task} />
        </div>
    );
}
