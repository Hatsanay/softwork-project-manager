"use client";

// กะทำงานของพนักงาน (2026-10-23 ช่วง A-1) — กะตามวันที่มีผล (ประวัติไม่หาย) · ไม่ได้กำหนด = ใช้กะเริ่มต้นในตั้งค่าบุคคล
// วันเดียวกันซ้ำ = แทนของเดิม · ก่อนวันเริ่มงาน/ในเดือนที่ปิดรอบเงินเดือนแล้วไม่ได้ (backend ตรวจ)
import { useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Trash2 } from "lucide-react";
import SectionCard from "@/components/ui/section-card";
import FormField, { inputClass } from "@/components/ui/form-field";
import FieldHint from "@/components/ui/guidance/field-hint";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { buttonClass } from "@/components/ui/button";
import { formatDateOnly } from "@/app/function";
import { apiFetch } from "@/lib/api";
import { toFieldErrors, type FieldErrors } from "@/lib/form-errors";
import { employeeScheduleSchema } from "@/lib/shared/schemas/attendance.mjs";
import { usePeopleSetup } from "../../../_hooks/use-people-setup";
import { scheduleLabel } from "../../../_schedule-label";
import type { Employee, EmployeeSchedule } from "../../../_types";

export default function WorkScheduleCard({ employee, onChanged }: { employee: Employee; onChanged: () => Promise<void> }) {
    const { setup } = usePeopleSetup();
    const [scheduleId, setScheduleId] = useState("");
    const [effectiveFrom, setEffectiveFrom] = useState(employee.today);
    const [errors, setErrors] = useState<FieldErrors>({});
    const [isSaving, setIsSaving] = useState(false);
    const [removing, setRemoving] = useState<EmployeeSchedule | null>(null);

    const schedules = setup?.work_schedules ?? [];
    const defaultSchedule = schedules.find((schedule) => schedule.ws_id === setup?.settings?.ps_default_schedule_id);
    const current = employee.schedules.find((row) => row.es_effective_from <= employee.today) ?? null;

    async function assign(event: React.FormEvent) {
        event.preventDefault();
        const checked = employeeScheduleSchema.safeParse({
            es_schedule_id: Number(scheduleId) || 0,
            es_effective_from: effectiveFrom,
        });
        if (!checked.success) {
            setErrors(toFieldErrors(checked.error.issues));
            return;
        }
        setErrors({});
        setIsSaving(true);
        const { error } = await apiFetch(`/employees/${employee.emp_id}/schedules`, { method: "POST", body: checked.data });
        setIsSaving(false);
        if (error) {
            setErrors(error.fields);
            toast.error(error.message);
            return;
        }
        toast.success("กำหนดกะแล้ว");
        setScheduleId("");
        await onChanged();
    }

    async function remove() {
        if (!removing) return;
        setIsSaving(true);
        const { error } = await apiFetch(`/employees/${employee.emp_id}/schedules/${removing.es_id}`, { method: "DELETE" });
        setIsSaving(false);
        setRemoving(null);
        if (error) {
            toast.error(error.message);
            return;
        }
        toast.success("ลบแถวกะแล้ว");
        await onChanged();
    }

    return (
        <SectionCard icon={CalendarClock} title="กะทำงาน" description="เวลาเข้า-เลิกงานที่ใช้คิดสาย/ขาดของคนนี้ ตามวันที่มีผล">
            <div className="grid gap-1 rounded-xl bg-gray-50 p-4">
                <span className="text-xs text-gray-500">กะวันนี้</span>
                <span className="text-base font-medium text-gray-900">
                    {current
                        ? scheduleLabel(current)
                        : defaultSchedule
                          ? `${scheduleLabel(defaultSchedule)} · กะเริ่มต้น`
                          : "ยังไม่มีกะ (ตั้งกะเริ่มต้นในตั้งค่าบุคคล)"}
                </span>
                <span className="text-xs text-gray-500">
                    {employee.emp_attendance_required
                        ? "ต้องลงเวลาเข้า-ออกงาน"
                        : "ไม่ต้องลงเวลา (ไม่นับสาย/ขาด) · เปลี่ยนได้ที่ แก้ไขข้อมูลพนักงาน"}
                </span>
            </div>

            <form onSubmit={assign} noValidate className="grid gap-4 sm:grid-cols-[1fr_12rem_auto] sm:items-start">
                <FormField label="เปลี่ยนเป็นกะ" htmlFor="es_schedule_id" error={errors.es_schedule_id}>
                    <select
                        id="es_schedule_id"
                        value={scheduleId}
                        onChange={(event) => setScheduleId(event.target.value)}
                        className={inputClass(Boolean(errors.es_schedule_id))}
                    >
                        <option value="">เลือกกะ</option>
                        {schedules
                            .filter((schedule) => schedule.ws_status === "active")
                            .map((schedule) => (
                                <option key={schedule.ws_id} value={schedule.ws_id}>
                                    {scheduleLabel(schedule)}
                                </option>
                            ))}
                    </select>
                </FormField>
                <FormField label="มีผลตั้งแต่" htmlFor="es_effective_from" error={errors.es_effective_from}>
                    <input
                        id="es_effective_from"
                        type="date"
                        min={employee.emp_hire_date}
                        value={effectiveFrom}
                        onChange={(event) => setEffectiveFrom(event.target.value)}
                        className={inputClass(Boolean(errors.es_effective_from))}
                    />
                </FormField>
                <button type="submit" disabled={isSaving} className={`${buttonClass("primary", "md")} sm:mt-6`}>
                    กำหนดกะ
                </button>
            </form>
            <FieldHint>วันเดียวกันซ้ำ = แทนของเดิม · ย้อนไปในเดือนที่ปิดรอบเงินเดือนแล้วไม่ได้</FieldHint>

            {employee.schedules.length > 0 && (
                <ul className="grid gap-2 text-sm">
                    {employee.schedules.map((row) => (
                        <li
                            key={row.es_id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 px-3 py-2"
                        >
                            <span className="grid gap-0.5">
                                <span className="text-gray-900">
                                    {scheduleLabel(row)}
                                </span>
                                <span className="text-xs text-gray-500">ตั้งแต่ {formatDateOnly(row.es_effective_from)}</span>
                            </span>
                            <button
                                type="button"
                                aria-label={`ลบกะที่มีผล ${row.es_effective_from}`}
                                className={buttonClass("ghost", "md")}
                                onClick={() => setRemoving(row)}
                            >
                                <Trash2 size={16} />
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            <ConfirmDialog
                open={Boolean(removing)}
                title="ลบแถวกะนี้?"
                description="วันตั้งแต่วันที่มีผลของแถวนี้จะกลับไปใช้กะก่อนหน้า (หรือกะเริ่มต้น)"
                confirmLabel="ลบ"
                loading={isSaving}
                onConfirm={remove}
                onCancel={() => setRemoving(null)}
            />
        </SectionCard>
    );
}
