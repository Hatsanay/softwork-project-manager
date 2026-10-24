"use client";

// เวลาทำงาน/เงินเดือนของบริษัท — วันทำงานในสัปดาห์ · ชั่วโมงต่อวัน · วันจ่ายเงินเดือน · วิธีหักลาไม่รับค่าจ้าง · ลงเวลาย้อนหลัง · อายุบัตรพนักงาน
// + กะเริ่มต้น (พนักงานที่ยังไม่ได้กำหนดกะ) และสวิตช์ลงชั่วโมงต่อโปรเจกต์ (2026-10-23 · ปิดเป็นค่าเริ่มต้น)
import { useState } from "react";
import { toast } from "sonner";
import { Clock } from "lucide-react";
import SectionCard from "@/components/ui/section-card";
import FormField, { inputClass } from "@/components/ui/form-field";
import FieldHint from "@/components/ui/guidance/field-hint";
import { buttonClass } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { toFieldErrors, type FieldErrors } from "@/lib/form-errors";
import { payrollSettingsSchema, WEEKDAY_LABELS } from "@/lib/shared/schemas/people.mjs";
import { ATTENDANCE_MESSAGES, SETUP_MESSAGES } from "../../_messages";
import { scheduleLabel } from "../../_schedule-label";
import type { PayrollSettings, UnpaidLeaveDivisor, WorkSchedule } from "../../_types";

function toForm(settings: PayrollSettings) {
    return {
        ps_working_weekdays: settings.ps_working_weekdays,
        ps_hours_per_day: String(Number(settings.ps_hours_per_day)),
        ps_pay_day: String(settings.ps_pay_day),
        ps_unpaid_leave_divisor: settings.ps_unpaid_leave_divisor,
        ps_timesheet_backdate_days: String(settings.ps_timesheet_backdate_days),
        ps_card_valid_years: String(settings.ps_card_valid_years),
        ps_default_schedule_id: settings.ps_default_schedule_id ? String(settings.ps_default_schedule_id) : "",
        ps_timesheet_enabled: settings.ps_timesheet_enabled,
        ps_attendance_start_date: settings.ps_attendance_start_date ?? "",
        ps_ot_rate_workday: String(Number(settings.ps_ot_rate_workday)),
        ps_ot_rate_holiday_work: String(Number(settings.ps_ot_rate_holiday_work)),
        ps_ot_rate_holiday_ot: String(Number(settings.ps_ot_rate_holiday_ot)),
        ps_ot_weekly_cap_hours: String(settings.ps_ot_weekly_cap_hours),
        ps_ot_is_sso_wage: settings.ps_ot_is_sso_wage,
    };
}

export default function WorkSettingsSection({
    settings,
    schedules,
    canEdit,
    onChanged,
}: {
    settings: PayrollSettings;
    schedules: WorkSchedule[];
    canEdit: boolean;
    onChanged: () => Promise<void>;
}) {
    const [form, setForm] = useState(() => toForm(settings));
    const [errors, setErrors] = useState<FieldErrors>({});
    const [isSaving, setIsSaving] = useState(false);
    const isChanged = JSON.stringify(form) !== JSON.stringify(toForm(settings));

    function toggleWeekday(index: number) {
        const days = form.ps_working_weekdays.split("");
        days[index] = days[index] === "1" ? "0" : "1";
        setForm((current) => ({ ...current, ps_working_weekdays: days.join("") }));
    }

    async function save(event: React.FormEvent) {
        event.preventDefault();
        const checked = payrollSettingsSchema.safeParse({
            ...form,
            ps_pay_day: Number(form.ps_pay_day),
            ps_timesheet_backdate_days: Number(form.ps_timesheet_backdate_days),
            ps_card_valid_years: Number(form.ps_card_valid_years),
            ps_default_schedule_id: form.ps_default_schedule_id ? Number(form.ps_default_schedule_id) : null,
            ps_ot_weekly_cap_hours: Number(form.ps_ot_weekly_cap_hours),
        });
        if (!checked.success) {
            setErrors(toFieldErrors(checked.error.issues));
            return;
        }
        setErrors({});
        setIsSaving(true);
        const { error } = await apiFetch("/people/settings", { method: "PUT", body: checked.data });
        setIsSaving(false);
        if (error) {
            setErrors(error.fields);
            toast.error(error.message);
            return;
        }
        toast.success("บันทึกตั้งค่าเวลาทำงานแล้ว");
        await onChanged();
    }

    return (
        <SectionCard icon={Clock} title="เวลาทำงานและเงินเดือน" description={SETUP_MESSAGES.workSettings}>
            <form onSubmit={save} noValidate className="grid gap-4 sm:grid-cols-2">
                <fieldset className="grid gap-2 sm:col-span-2" disabled={!canEdit}>
                    <legend className="mb-1 text-sm text-gray-800">วันทำงานในสัปดาห์</legend>
                    <div className="flex flex-wrap gap-2">
                        {WEEKDAY_LABELS.map((label, index) => {
                            const isWorking = form.ps_working_weekdays[index] === "1";
                            return (
                                <button
                                    key={label}
                                    type="button"
                                    aria-pressed={isWorking}
                                    onClick={() => toggleWeekday(index)}
                                    className={`min-h-10 rounded-xl border px-3 text-sm ${
                                        isWorking
                                            ? "border-blue-200 bg-blue-50 text-blue-600"
                                            : "border-gray-200 bg-white text-gray-500"
                                    }`}
                                >
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                    <FieldHint error={errors.ps_working_weekdays}>วันที่ไม่ได้เลือก = วันหยุดประจำสัปดาห์</FieldHint>
                </fieldset>
                <FormField
                    label="ชั่วโมงทำงานต่อวัน"
                    htmlFor="ps_hours_per_day"
                    required
                    error={errors.ps_hours_per_day}
                >
                    <input
                        id="ps_hours_per_day"
                        inputMode="decimal"
                        disabled={!canEdit}
                        value={form.ps_hours_per_day}
                        onChange={(event) =>
                            setForm((current) => ({ ...current, ps_hours_per_day: event.target.value }))
                        }
                        className={inputClass(Boolean(errors.ps_hours_per_day))}
                    />
                </FormField>
                <FormField
                    label="วันจ่ายเงินเดือน (วันที่)"
                    htmlFor="ps_pay_day"
                    required
                    hint={SETUP_MESSAGES.payDay}
                    error={errors.ps_pay_day}
                >
                    <input
                        id="ps_pay_day"
                        inputMode="numeric"
                        disabled={!canEdit}
                        value={form.ps_pay_day}
                        onChange={(event) => setForm((current) => ({ ...current, ps_pay_day: event.target.value }))}
                        className={inputClass(Boolean(errors.ps_pay_day))}
                    />
                </FormField>
                <FormField
                    label="หักลาไม่รับค่าจ้างต่อวัน"
                    htmlFor="ps_unpaid_leave_divisor"
                    hint={SETUP_MESSAGES.unpaidLeaveDivisor}
                    error={errors.ps_unpaid_leave_divisor}
                >
                    <select
                        id="ps_unpaid_leave_divisor"
                        disabled={!canEdit}
                        value={form.ps_unpaid_leave_divisor}
                        onChange={(event) =>
                            setForm((current) => ({
                                ...current,
                                ps_unpaid_leave_divisor: event.target.value as UnpaidLeaveDivisor,
                            }))
                        }
                        className={inputClass(Boolean(errors.ps_unpaid_leave_divisor))}
                    >
                        <option value="days_30">เงินเดือน ÷ 30</option>
                        <option value="working_days">เงินเดือน ÷ วันทำงานของเดือน</option>
                    </select>
                </FormField>
                <FormField
                    label="ลงชั่วโมงย้อนหลังได้ (วัน)"
                    htmlFor="ps_timesheet_backdate_days"
                    hint={SETUP_MESSAGES.backdate}
                    error={errors.ps_timesheet_backdate_days}
                >
                    <input
                        id="ps_timesheet_backdate_days"
                        inputMode="numeric"
                        disabled={!canEdit}
                        value={form.ps_timesheet_backdate_days}
                        onChange={(event) =>
                            setForm((current) => ({ ...current, ps_timesheet_backdate_days: event.target.value }))
                        }
                        className={inputClass(Boolean(errors.ps_timesheet_backdate_days))}
                    />
                </FormField>
                <FormField
                    label="อายุบัตรพนักงาน (ปี)"
                    htmlFor="ps_card_valid_years"
                    hint={SETUP_MESSAGES.cardValidYears}
                    error={errors.ps_card_valid_years}
                >
                    <input
                        id="ps_card_valid_years"
                        inputMode="numeric"
                        disabled={!canEdit}
                        value={form.ps_card_valid_years}
                        onChange={(event) => setForm((current) => ({ ...current, ps_card_valid_years: event.target.value }))}
                        className={inputClass(Boolean(errors.ps_card_valid_years))}
                    />
                </FormField>
                <FormField
                    label="กะเริ่มต้น"
                    htmlFor="ps_default_schedule_id"
                    hint="ใช้กับพนักงานที่ยังไม่ได้กำหนดกะในหน้าพนักงาน · สร้าง/แก้กะที่หมวด กะทำงาน"
                    error={errors.ps_default_schedule_id}
                >
                    <select
                        id="ps_default_schedule_id"
                        disabled={!canEdit}
                        value={form.ps_default_schedule_id}
                        onChange={(event) => setForm((current) => ({ ...current, ps_default_schedule_id: event.target.value }))}
                        className={inputClass(Boolean(errors.ps_default_schedule_id))}
                    >
                        <option value="">ยังไม่ได้ตั้ง (ลงเวลาไม่ได้)</option>
                        {schedules
                            .filter((schedule) => schedule.ws_status === "active" || String(schedule.ws_id) === form.ps_default_schedule_id)
                            .map((schedule) => (
                                <option key={schedule.ws_id} value={schedule.ws_id}>
                                    {scheduleLabel(schedule)}
                                </option>
                            ))}
                    </select>
                </FormField>
                <FormField
                    label="เริ่มใช้ลงเวลาตั้งแต่"
                    htmlFor="ps_attendance_start_date"
                    hint="วันก่อนหน้านี้ไม่นับสาย/ขาด (ยังไม่ได้ใช้ระบบ) · ว่าง = นับทุกวัน"
                    error={errors.ps_attendance_start_date}
                >
                    <input
                        id="ps_attendance_start_date"
                        type="date"
                        disabled={!canEdit}
                        value={form.ps_attendance_start_date}
                        onChange={(event) => setForm((current) => ({ ...current, ps_attendance_start_date: event.target.value }))}
                        className={inputClass(Boolean(errors.ps_attendance_start_date))}
                    />
                </FormField>
                <fieldset className="grid gap-3 rounded-xl border border-gray-200 p-4 sm:col-span-2 sm:grid-cols-4" disabled={!canEdit}>
                    <legend className="px-1 text-sm text-gray-800">OT (เท่าของค่าจ้างต่อชั่วโมง · รอนักบัญชียืนยัน)</legend>
                    {(
                        [
                            ["ps_ot_rate_workday", "วันทำงาน", "ม.61 ขั้นต่ำ 1.5"],
                            ["ps_ot_rate_holiday_work", "ทำงานวันหยุด (จ่ายเพิ่ม)", "ม.62 รายเดือน 1"],
                            ["ps_ot_rate_holiday_ot", "OT วันหยุด", "ม.63 ขั้นต่ำ 3"],
                            ["ps_ot_weekly_cap_hours", "เพดาน (ชม./สัปดาห์)", "กฎกระทรวง 36"],
                        ] as const
                    ).map(([field, label, hint]) => (
                        <FormField key={field} label={label} htmlFor={field} hint={hint} error={errors[field]}>
                            <input
                                id={field}
                                inputMode="decimal"
                                value={form[field]}
                                onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.value }))}
                                className={inputClass(Boolean(errors[field]))}
                            />
                        </FormField>
                    ))}
                    <label className="flex items-start gap-2 text-sm sm:col-span-4">
                        <input
                            type="checkbox"
                            className="mt-1 h-4 w-4"
                            checked={form.ps_ot_is_sso_wage}
                            onChange={(event) => setForm((current) => ({ ...current, ps_ot_is_sso_wage: event.target.checked }))}
                        />
                        <span className="grid gap-0.5">
                            <span>OT นับเป็นค่าจ้างคิดประกันสังคม</span>
                            <FieldHint>รอนักบัญชียืนยัน (Y5) · ฐานประกันสังคมมีเพดานอยู่แล้ว คนที่เงินเดือนถึงเพดานไม่เปลี่ยน</FieldHint>
                        </span>
                    </label>
                </fieldset>
                <label className="flex items-start gap-2 text-sm sm:col-span-2">
                    <input
                        type="checkbox"
                        className="mt-1 h-4 w-4"
                        disabled={!canEdit}
                        checked={form.ps_timesheet_enabled}
                        onChange={(event) => setForm((current) => ({ ...current, ps_timesheet_enabled: event.target.checked }))}
                    />
                    <span className="grid gap-0.5">
                        <span>เปิดลงชั่วโมงต่อโปรเจกต์</span>
                        <FieldHint>{ATTENDANCE_MESSAGES.timesheetSwitch}</FieldHint>
                    </span>
                </label>
                {canEdit && (
                    <div className="flex justify-end sm:col-span-2">
                        <button
                            type="submit"
                            className={buttonClass("primary", "md")}
                            disabled={isSaving || !isChanged}
                        >
                            {isSaving ? "กำลังบันทึก..." : "บันทึกตั้งค่า"}
                        </button>
                    </div>
                )}
            </form>
        </SectionCard>
    );
}
