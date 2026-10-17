"use client";

// เวลาทำงาน/เงินเดือนของบริษัท — วันทำงานในสัปดาห์ · ชั่วโมงต่อวัน · วันจ่ายเงินเดือน · วิธีหักลาไม่รับค่าจ้าง · ลงเวลาย้อนหลัง
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
import { SETUP_MESSAGES } from "../../_messages";
import type { PayrollSettings, UnpaidLeaveDivisor } from "../../_types";

function toForm(settings: PayrollSettings) {
    return {
        ps_working_weekdays: settings.ps_working_weekdays,
        ps_hours_per_day: String(Number(settings.ps_hours_per_day)),
        ps_pay_day: String(settings.ps_pay_day),
        ps_unpaid_leave_divisor: settings.ps_unpaid_leave_divisor,
        ps_timesheet_backdate_days: String(settings.ps_timesheet_backdate_days),
    };
}

export default function WorkSettingsSection({
    settings,
    canEdit,
    onChanged,
}: {
    settings: PayrollSettings;
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
                    label="ลงเวลาย้อนหลังได้ (วัน)"
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
