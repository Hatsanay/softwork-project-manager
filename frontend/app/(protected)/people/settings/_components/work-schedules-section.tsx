"use client";

// กะทำงาน (2026-10-23 ช่วง A-1) — ชุดเวลาให้เลือก แล้วกำหนดให้พนักงานในหน้าพนักงาน · ปิดใช้งานแทนการลบ
// เวลาเลิก <= เวลาเข้า = กะข้ามเที่ยงคืน (เลิกวันถัดไป) · แก้เวลา = มีผลกับวันที่ยังไม่ปิดรอบเงินเดือนด้วย (บอกใต้ฟอร์ม)
import { useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Plus } from "lucide-react";
import SectionCard from "@/components/ui/section-card";
import FormField, { inputClass } from "@/components/ui/form-field";
import FieldHint from "@/components/ui/guidance/field-hint";
import { ActiveStatusPill } from "@/components/ui/status-pill";
import { buttonClass } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { toFieldErrors, type FieldErrors } from "@/lib/form-errors";
import { WEEKDAY_LABELS } from "@/lib/shared/schemas/people.mjs";
import { workScheduleSchema } from "@/lib/shared/schemas/attendance.mjs";
import { crossesMidnight, scheduleWorkMinutes } from "@/lib/shared/attendance-math.mjs";
import { ATTENDANCE_MESSAGES } from "../../_messages";
import type { ActiveStatus, PeopleSetup, WorkSchedule } from "../../_types";

const SHORT_WEEKDAYS = ["จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส.", "อา."];

function weekdaysText(weekdays: string) {
    return SHORT_WEEKDAYS.filter((_, index) => weekdays[index] === "1").join(" ");
}

function hoursText(minutes: number) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest > 0 ? `${hours} ชม. ${rest} นาที` : `${hours} ชม.`;
}

function scheduleDetail(schedule: WorkSchedule) {
    const parts = [
        `${schedule.ws_start_time}-${schedule.ws_end_time}${crossesMidnight(schedule) ? " (เลิกวันถัดไป)" : ""}`,
        `ทำงาน ${hoursText(scheduleWorkMinutes(schedule))} พัก ${schedule.ws_break_minutes} นาที`,
        weekdaysText(schedule.ws_working_weekdays),
        schedule.ws_late_grace_minutes > 0 ? `ผ่อนผันสาย ${schedule.ws_late_grace_minutes} นาที` : "ไม่ผ่อนผันสาย",
    ];
    return parts.join(" · ");
}

export default function WorkSchedulesSection({
    setup,
    canEdit,
    onChanged,
}: {
    setup: PeopleSetup;
    canEdit: boolean;
    onChanged: () => Promise<void>;
}) {
    const [editing, setEditing] = useState<WorkSchedule | "new" | null>(null);
    const defaultId = setup.settings?.ps_default_schedule_id ?? null;

    return (
        <SectionCard
            icon={CalendarClock}
            title="กะทำงาน"
            description="ชุดเวลาทำงานให้เลือก แล้วกำหนดให้แต่ละคนในหน้าพนักงาน"
            actions={
                canEdit && (
                    <button type="button" className={buttonClass("secondary", "md")} onClick={() => setEditing("new")}>
                        <Plus size={16} />
                        เพิ่มกะ
                    </button>
                )
            }
        >
            {editing && (
                <ScheduleForm
                    schedule={editing === "new" ? null : editing}
                    onDone={async (saved) => {
                        setEditing(null);
                        if (saved) await onChanged();
                    }}
                />
            )}
            <ul className="grid gap-2 text-sm">
                {setup.work_schedules.map((schedule) => (
                    <li
                        key={schedule.ws_id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 p-3"
                    >
                        <div className="grid min-w-0 gap-0.5">
                            <span className="flex flex-wrap items-center gap-2 font-medium text-gray-900">
                                {schedule.ws_name}
                                {schedule.ws_id === defaultId && (
                                    <span className="rounded-md bg-blue-50 px-1.5 py-0.5 text-xs font-normal text-blue-700">กะเริ่มต้น</span>
                                )}
                            </span>
                            <span className="text-xs text-gray-500">{scheduleDetail(schedule)}</span>
                            {schedule.employee_count > 0 && (
                                <span className="text-xs text-gray-500">กำหนดให้พนักงานแล้ว {schedule.employee_count} คน</span>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <ActiveStatusPill isActive={schedule.ws_status === "active"} />
                            {canEdit && (
                                <button type="button" className={buttonClass("secondary", "sm")} onClick={() => setEditing(schedule)}>
                                    แก้ไข
                                </button>
                            )}
                        </div>
                    </li>
                ))}
            </ul>
        </SectionCard>
    );
}

type ScheduleForm = {
    ws_name: string;
    ws_start_time: string;
    ws_end_time: string;
    ws_break_minutes: string;
    ws_working_weekdays: string;
    ws_late_grace_minutes: string;
    ws_checkin_open_minutes: string;
    ws_status: ActiveStatus;
};

function toForm(schedule: WorkSchedule | null): ScheduleForm {
    return {
        ws_name: schedule?.ws_name ?? "",
        ws_start_time: schedule?.ws_start_time ?? "09:00",
        ws_end_time: schedule?.ws_end_time ?? "18:00",
        ws_break_minutes: String(schedule?.ws_break_minutes ?? 60),
        ws_working_weekdays: schedule?.ws_working_weekdays ?? "1111100",
        ws_late_grace_minutes: String(schedule?.ws_late_grace_minutes ?? 0),
        ws_checkin_open_minutes: String(schedule?.ws_checkin_open_minutes ?? 120),
        ws_status: schedule?.ws_status ?? "active",
    };
}

function ScheduleForm({ schedule, onDone }: { schedule: WorkSchedule | null; onDone: (saved: boolean) => Promise<void> }) {
    const [form, setForm] = useState(() => toForm(schedule));
    const [errors, setErrors] = useState<FieldErrors>({});
    const [isSaving, setIsSaving] = useState(false);

    function update<Field extends keyof ScheduleForm>(field: Field, value: ScheduleForm[Field]) {
        setForm((current) => ({ ...current, [field]: value }));
    }

    function toggleWeekday(index: number) {
        const days = form.ws_working_weekdays.split("");
        days[index] = days[index] === "1" ? "0" : "1";
        update("ws_working_weekdays", days.join(""));
    }

    async function save(event: React.FormEvent) {
        event.preventDefault();
        const checked = workScheduleSchema.safeParse({
            ...form,
            ws_break_minutes: Number(form.ws_break_minutes),
            ws_late_grace_minutes: Number(form.ws_late_grace_minutes),
            ws_checkin_open_minutes: Number(form.ws_checkin_open_minutes),
        });
        if (!checked.success) {
            setErrors(toFieldErrors(checked.error.issues));
            return;
        }
        setErrors({});
        setIsSaving(true);
        const { error } = schedule
            ? await apiFetch(`/people/work-schedules/${schedule.ws_id}`, { method: "PUT", body: checked.data })
            : await apiFetch("/people/work-schedules", { method: "POST", body: checked.data });
        setIsSaving(false);
        if (error) {
            setErrors(error.fields);
            toast.error(error.message);
            return;
        }
        toast.success(schedule ? "บันทึกกะแล้ว" : "เพิ่มกะแล้ว");
        await onDone(true);
    }

    const isOvernight = form.ws_end_time <= form.ws_start_time;

    return (
        <form onSubmit={save} noValidate className="grid gap-4 rounded-xl border border-blue-100 bg-blue-50/40 p-4 sm:grid-cols-2">
            <FormField label="ชื่อกะ" htmlFor="ws_name" required error={errors.ws_name} className="sm:col-span-2">
                <input
                    id="ws_name"
                    value={form.ws_name}
                    placeholder="เช่น ออฟฟิศ 09:00-18:00"
                    onChange={(event) => update("ws_name", event.target.value)}
                    className={inputClass(Boolean(errors.ws_name))}
                />
            </FormField>
            <FormField label="เวลาเข้างาน" htmlFor="ws_start_time" required error={errors.ws_start_time}>
                <input
                    id="ws_start_time"
                    type="time"
                    value={form.ws_start_time}
                    onChange={(event) => update("ws_start_time", event.target.value)}
                    className={inputClass(Boolean(errors.ws_start_time))}
                />
            </FormField>
            <FormField
                label="เวลาเลิกงาน"
                htmlFor="ws_end_time"
                required
                hint={isOvernight ? "เลิกวันถัดไป (กะข้ามเที่ยงคืน)" : undefined}
                error={errors.ws_end_time}
            >
                <input
                    id="ws_end_time"
                    type="time"
                    value={form.ws_end_time}
                    onChange={(event) => update("ws_end_time", event.target.value)}
                    className={inputClass(Boolean(errors.ws_end_time))}
                />
            </FormField>
            <FormField label="พัก (นาที)" htmlFor="ws_break_minutes" hint="ไม่นับเป็นเวลาทำงาน" error={errors.ws_break_minutes}>
                <input
                    id="ws_break_minutes"
                    inputMode="numeric"
                    value={form.ws_break_minutes}
                    onChange={(event) => update("ws_break_minutes", event.target.value)}
                    className={inputClass(Boolean(errors.ws_break_minutes))}
                />
            </FormField>
            <FormField
                label="ผ่อนผันสาย (นาที)"
                htmlFor="ws_late_grace_minutes"
                hint="เกินแล้วนับสายตั้งแต่เวลาเข้างาน เช่น ผ่อนผัน 10 มา 9:15 = สาย 15 นาที"
                error={errors.ws_late_grace_minutes}
            >
                <input
                    id="ws_late_grace_minutes"
                    inputMode="numeric"
                    value={form.ws_late_grace_minutes}
                    onChange={(event) => update("ws_late_grace_minutes", event.target.value)}
                    className={inputClass(Boolean(errors.ws_late_grace_minutes))}
                />
            </FormField>
            <fieldset className="grid gap-2 sm:col-span-2">
                <legend className="mb-1 text-sm text-gray-800">วันทำงาน</legend>
                <div className="flex flex-wrap gap-2">
                    {WEEKDAY_LABELS.map((label, index) => {
                        const isWorking = form.ws_working_weekdays[index] === "1";
                        return (
                            <button
                                key={label}
                                type="button"
                                aria-pressed={isWorking}
                                onClick={() => toggleWeekday(index)}
                                className={`min-h-10 rounded-xl border px-3 text-sm ${
                                    isWorking ? "border-blue-200 bg-blue-50 text-blue-600" : "border-gray-200 bg-white text-gray-500"
                                }`}
                            >
                                {label}
                            </button>
                        );
                    })}
                </div>
                <FieldHint error={errors.ws_working_weekdays}>วันที่ไม่ได้เลือก = วันหยุดของกะนี้ (วันหยุดบริษัทหยุดทุกกะ)</FieldHint>
            </fieldset>
            {schedule && (
                <FormField label="สถานะ" htmlFor="ws_status" error={errors.ws_status}>
                    <select
                        id="ws_status"
                        value={form.ws_status}
                        onChange={(event) => update("ws_status", event.target.value as ActiveStatus)}
                        className={inputClass(Boolean(errors.ws_status))}
                    >
                        <option value="active">ใช้งาน</option>
                        <option value="inactive">ปิดใช้งาน (เลือกให้พนักงานใหม่ไม่ได้)</option>
                    </select>
                </FormField>
            )}
            {schedule && <FieldHint>{ATTENDANCE_MESSAGES.scheduleEdit}</FieldHint>}
            <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
                <button type="button" className={buttonClass("secondary", "md")} onClick={() => onDone(false)}>
                    ยกเลิก
                </button>
                <button type="submit" className={buttonClass("primary", "md")} disabled={isSaving}>
                    {isSaving ? "กำลังบันทึก..." : schedule ? "บันทึกกะ" : "เพิ่มกะ"}
                </button>
            </div>
        </form>
    );
}
