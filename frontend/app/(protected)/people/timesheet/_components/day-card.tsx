"use client";

// การ์ดหนึ่งวันในสัปดาห์ — แถวชั่วโมง (โปรเจกต์ · งาน · ชั่วโมง · รายละเอียด) · มือถือเรียงเป็นแนวตั้ง
import { Plus, Trash2 } from "lucide-react";
import FieldHint from "@/components/ui/guidance/field-hint";
import { inputClass } from "@/components/ui/form-field";
import { buttonClass } from "@/components/ui/button";
import type { FieldErrors } from "@/lib/form-errors";
import type { TimesheetDay, TimesheetProjectOption } from "../../_types";

export type TimesheetRow = {
    key: string;
    tse_date: string;
    tse_project_id: string;
    tse_task_id: string;
    tse_hours: string;
    tse_note: string;
};

// "2026-10-19" → "จ. 19 ต.ค." (วันที่ล้วน ไม่ผ่านเขตเวลาเครื่อง)
const HALF_DAY_LEAVE_NOTE = { morning: "ลาครึ่งวันเช้า", afternoon: "ลาครึ่งวันบ่าย" };

export function dayLabel(dateText: string) {
    return new Intl.DateTimeFormat("th-TH", {
        weekday: "short",
        day: "numeric",
        month: "short",
        timeZone: "UTC",
    }).format(new Date(`${dateText}T00:00:00Z`));
}

export default function DayCard({
    day,
    rows,
    rowIndexes,
    projects,
    isEditable,
    dayTotal,
    errors,
    onAdd,
    onChange,
    onRemove,
}: {
    day: TimesheetDay;
    rows: TimesheetRow[];
    rowIndexes: number[];
    projects: TimesheetProjectOption[];
    isEditable: boolean;
    dayTotal: string;
    errors: FieldErrors;
    onAdd: () => void;
    onChange: (key: string, field: keyof TimesheetRow, value: string) => void;
    onRemove: (key: string) => void;
}) {
    const canAdd = isEditable && day.blocked_reason === null;
    const leaveNote = day.leave && day.leave !== "full" ? HALF_DAY_LEAVE_NOTE[day.leave] : null;
    const dayNote = day.holiday_name ?? (day.is_working_day ? leaveNote : "วันหยุดประจำสัปดาห์");

    return (
        <section
            className={`grid gap-3 rounded-2xl border p-4 ${day.is_working_day ? "border-gray-200 bg-white" : "border-gray-200 bg-gray-50"}`}
            aria-label={dayLabel(day.date)}
        >
            <header className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="grid gap-0.5">
                    <span className="text-sm font-medium text-gray-900">{dayLabel(day.date)}</span>
                    {(dayNote || day.blocked_reason) && (
                        <span className="text-xs text-gray-500">
                            {[dayNote, day.blocked_reason && `ลงไม่ได้: ${day.blocked_reason}`]
                                .filter(Boolean)
                                .join(" · ")}
                        </span>
                    )}
                </span>
                <span className="text-sm text-gray-600 tabular-nums">{dayTotal} ชม.</span>
            </header>

            {rows.map((row, position) => {
                const index = rowIndexes[position];
                const project = projects.find((option) => option.project_id === row.tse_project_id);
                const projectChoices = projects.filter(
                    (option) => option.can_log || option.project_id === row.tse_project_id,
                );
                const fieldError = (field: string) => errors[`entries.${index}.${field}`];
                return (
                    <div
                        key={row.key}
                        className="grid grid-cols-[1fr_auto] gap-2 rounded-xl bg-gray-50 p-3 sm:grid-cols-[1fr_1fr_6rem_auto]"
                    >
                        <div className="col-span-2 grid gap-1 sm:col-span-1">
                            <select
                                aria-label="โปรเจกต์"
                                disabled={!isEditable}
                                value={row.tse_project_id}
                                onChange={(event) => onChange(row.key, "tse_project_id", event.target.value)}
                                className={inputClass(Boolean(fieldError("tse_project_id")))}
                            >
                                <option value="">งานภายใน (ไม่ใช่โปรเจกต์)</option>
                                {projectChoices.map((option) => (
                                    <option key={option.project_id} value={option.project_id}>
                                        {option.project_name}
                                    </option>
                                ))}
                            </select>
                            <FieldHint error={fieldError("tse_project_id") ?? fieldError("tse_date")} />
                        </div>
                        <div className="col-span-2 grid gap-1 sm:col-span-1">
                            <select
                                aria-label="งาน"
                                disabled={!isEditable || !project}
                                value={row.tse_task_id}
                                onChange={(event) => onChange(row.key, "tse_task_id", event.target.value)}
                                className={inputClass(Boolean(fieldError("tse_task_id")))}
                            >
                                <option value="">{project ? "— ไม่ระบุงาน —" : "— เลือกโปรเจกต์ก่อน —"}</option>
                                {project?.tasks.map((task) => (
                                    <option key={task.task_id} value={task.task_id}>
                                        {task.task_parent_id ? "↳ " : ""}
                                        {task.task_title}
                                    </option>
                                ))}
                            </select>
                            <FieldHint error={fieldError("tse_task_id")} />
                        </div>
                        <div className="grid gap-1">
                            <input
                                aria-label="ชั่วโมง"
                                inputMode="decimal"
                                placeholder="ชม."
                                disabled={!isEditable}
                                value={row.tse_hours}
                                onChange={(event) => onChange(row.key, "tse_hours", event.target.value)}
                                className={inputClass(Boolean(fieldError("tse_hours")))}
                            />
                            <FieldHint error={fieldError("tse_hours")} />
                        </div>
                        {isEditable && (
                            <button
                                type="button"
                                aria-label="ลบแถวนี้"
                                className={`${buttonClass("ghost", "md")} justify-self-end`}
                                onClick={() => onRemove(row.key)}
                            >
                                <Trash2 size={16} />
                            </button>
                        )}
                        <input
                            aria-label="รายละเอียดงาน"
                            placeholder="รายละเอียด (ไม่บังคับ)"
                            disabled={!isEditable}
                            value={row.tse_note}
                            onChange={(event) => onChange(row.key, "tse_note", event.target.value)}
                            className={`${inputClass(Boolean(fieldError("tse_note")))} col-span-2 sm:col-span-4`}
                        />
                    </div>
                );
            })}

            {canAdd && (
                <button
                    type="button"
                    className={`${buttonClass("secondary", "sm")} justify-self-start`}
                    onClick={onAdd}
                >
                    <Plus size={14} />
                    เพิ่มแถว
                </button>
            )}
        </section>
    );
}
