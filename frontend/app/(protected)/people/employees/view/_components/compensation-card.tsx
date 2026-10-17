"use client";

// ค่าจ้างตามวันที่มีผล — เงินเดือนปัจจุบัน + ประวัติ · เพิ่มอัตราใหม่ · แก้ยอดที่พิมพ์ผิด · ลบอัตราที่ตั้งผิด (ยกเว้นแถวเริ่มงาน)
import { useState } from "react";
import { toast } from "sonner";
import { Banknote, Pencil, Plus, Trash2 } from "lucide-react";
import SectionCard from "@/components/ui/section-card";
import FormField, { inputClass } from "@/components/ui/form-field";
import StatusPill from "@/components/ui/status-pill";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { buttonClass } from "@/components/ui/button";
import { formatDateOnly } from "@/app/function";
import { apiFetch } from "@/lib/api";
import { toFieldErrors, type FieldErrors } from "@/lib/form-errors";
import { formatAmount } from "@/lib/shared/money.mjs";
import { compensationSchema, compensationUpdateSchema } from "@/lib/shared/schemas/people.mjs";
import { EMPLOYEE_MESSAGES } from "../../../_messages";
import type { Compensation, Employee } from "../../../_types";

type Editing = { mode: "new" } | { mode: "edit"; compensation: Compensation } | null;

export default function CompensationCard({
    employee,
    onChanged,
}: {
    employee: Employee;
    onChanged: () => Promise<void>;
}) {
    const [editing, setEditing] = useState<Editing>(null);
    const [deleteTarget, setDeleteTarget] = useState<Compensation | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const current = employee.current_compensation;

    async function confirmDelete() {
        if (!deleteTarget) return;
        const { error } = await apiFetch(
            `/employees/${employee.emp_id}/compensations/${deleteTarget.ecm_effective_from}`,
            { method: "DELETE" },
        );
        if (error) {
            setDeleteError(error.message);
            return;
        }
        toast.success("ลบอัตราแล้ว");
        setDeleteTarget(null);
        setDeleteError(null);
        await onChanged();
    }

    return (
        <SectionCard
            icon={Banknote}
            title="เงินเดือน"
            description={EMPLOYEE_MESSAGES.compensation}
            actions={
                <button
                    type="button"
                    className={buttonClass("secondary", "md")}
                    onClick={() => setEditing({ mode: "new" })}
                >
                    <Plus size={16} />
                    เพิ่มอัตราใหม่
                </button>
            }
        >
            <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl bg-blue-50 p-4">
                <span className="text-sm text-gray-600">
                    {employee.employment_status === "upcoming" ? "เงินเดือนเริ่มงาน" : "เงินเดือนปัจจุบัน"}
                </span>
                <span className="text-2xl font-medium text-gray-900 tabular-nums">
                    {current ? formatAmount(current.ecm_base_salary) : "—"}
                    <span className="ml-1 text-sm font-normal text-gray-500">บาท/เดือน</span>
                </span>
            </div>

            {editing && (
                <CompensationForm
                    employee={employee}
                    compensation={editing.mode === "edit" ? editing.compensation : null}
                    onDone={async (saved) => {
                        setEditing(null);
                        if (saved) await onChanged();
                    }}
                />
            )}

            <ul className="grid divide-y divide-gray-100 text-sm">
                {employee.compensations.map((compensation) => {
                    const isFirst = compensation.ecm_effective_from === employee.emp_hire_date;
                    const isCurrent = compensation === current;
                    const isUpcoming = compensation.ecm_effective_from > employee.today;
                    return (
                        <li key={compensation.ecm_effective_from} className="grid gap-1 py-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="flex flex-wrap items-center gap-2">
                                    <span className="font-medium text-gray-900 tabular-nums">
                                        {formatAmount(compensation.ecm_base_salary)} บาท
                                    </span>
                                    {isCurrent && <StatusPill tone="success">ใช้อยู่</StatusPill>}
                                    {isUpcoming && !isCurrent && <StatusPill tone="info">มีผลล่วงหน้า</StatusPill>}
                                </span>
                                <span className="flex items-center gap-1">
                                    <button
                                        type="button"
                                        className="-my-3 flex items-center gap-1 px-2 py-3 text-xs text-blue-600 hover:underline"
                                        onClick={() => setEditing({ mode: "edit", compensation })}
                                    >
                                        <Pencil size={14} />
                                        แก้ยอด
                                    </button>
                                    {!isFirst && (
                                        <button
                                            type="button"
                                            className="-my-3 flex items-center gap-1 px-2 py-3 text-xs text-red-600 hover:underline"
                                            onClick={() => setDeleteTarget(compensation)}
                                        >
                                            <Trash2 size={14} />
                                            ลบ
                                        </button>
                                    )}
                                </span>
                            </div>
                            <span className="text-xs text-gray-500">
                                มีผล {formatDateOnly(compensation.ecm_effective_from)}
                                {isFirst ? " (วันเริ่มงาน)" : ""}
                                {compensation.ecm_note ? ` · ${compensation.ecm_note}` : ""}
                                {compensation.created_by_name ? ` · บันทึกโดย ${compensation.created_by_name}` : ""}
                            </span>
                        </li>
                    );
                })}
            </ul>

            <ConfirmDialog
                open={Boolean(deleteTarget)}
                title="ลบอัตราเงินเดือนนี้?"
                description={
                    deleteTarget
                        ? `อัตรา ${formatAmount(deleteTarget.ecm_base_salary)} บาท ที่มีผล ${formatDateOnly(deleteTarget.ecm_effective_from)} จะถูกลบ · ช่วงนั้นระบบใช้อัตราก่อนหน้าแทน`
                        : undefined
                }
                confirmLabel="ลบอัตรา"
                errorMessage={deleteError}
                onConfirm={confirmDelete}
                onCancel={() => {
                    setDeleteTarget(null);
                    setDeleteError(null);
                }}
            />
        </SectionCard>
    );
}

function CompensationForm({
    employee,
    compensation,
    onDone,
}: {
    employee: Employee;
    compensation: Compensation | null;
    onDone: (saved: boolean) => Promise<void>;
}) {
    const isEditing = compensation !== null;
    const [form, setForm] = useState({
        ecm_effective_from: compensation?.ecm_effective_from ?? "",
        ecm_base_salary: compensation?.ecm_base_salary ?? "",
        ecm_note: compensation?.ecm_note ?? "",
    });
    const [errors, setErrors] = useState<FieldErrors>({});
    const [isSaving, setIsSaving] = useState(false);
    const update = (field: keyof typeof form, value: string) => setForm((current) => ({ ...current, [field]: value }));

    async function save(event: React.FormEvent) {
        event.preventDefault();
        const checked = isEditing ? compensationUpdateSchema.safeParse(form) : compensationSchema.safeParse(form);
        if (!checked.success) {
            setErrors(toFieldErrors(checked.error.issues));
            return;
        }
        setIsSaving(true);
        const baseUrl = `/employees/${employee.emp_id}/compensations`;
        const { error } = isEditing
            ? await apiFetch(`${baseUrl}/${compensation.ecm_effective_from}`, { method: "PUT", body: checked.data })
            : await apiFetch(baseUrl, { method: "POST", body: checked.data });
        setIsSaving(false);
        if (error) {
            setErrors(error.fields);
            toast.error(error.message);
            return;
        }
        toast.success(isEditing ? "แก้อัตราแล้ว" : "เพิ่มอัตราใหม่แล้ว");
        await onDone(true);
    }

    return (
        <form onSubmit={save} noValidate className="grid gap-3 rounded-xl bg-gray-50 p-4 sm:grid-cols-2">
            <FormField
                label="มีผลตั้งแต่"
                htmlFor="ecm_effective_from"
                required
                hint={isEditing ? EMPLOYEE_MESSAGES.compensationEdit : "ต้องหลังวันเริ่มงาน · ย้อนหลังหรือล่วงหน้าได้"}
                error={errors.ecm_effective_from}
            >
                <input
                    id="ecm_effective_from"
                    type="date"
                    disabled={isEditing}
                    value={form.ecm_effective_from}
                    min={employee.emp_hire_date}
                    max={employee.emp_termination_date ?? undefined}
                    onChange={(event) => update("ecm_effective_from", event.target.value)}
                    className={inputClass(Boolean(errors.ecm_effective_from))}
                />
            </FormField>
            <FormField label="เงินเดือน (บาท)" htmlFor="ecm_base_salary" required error={errors.ecm_base_salary}>
                <input
                    id="ecm_base_salary"
                    inputMode="decimal"
                    value={form.ecm_base_salary}
                    onChange={(event) => update("ecm_base_salary", event.target.value)}
                    className={inputClass(Boolean(errors.ecm_base_salary))}
                />
            </FormField>
            <FormField label="เหตุผล" htmlFor="ecm_note" error={errors.ecm_note} className="sm:col-span-2">
                <input
                    id="ecm_note"
                    placeholder="เช่น ปรับประจำปี / ผ่านทดลองงาน"
                    value={form.ecm_note}
                    onChange={(event) => update("ecm_note", event.target.value)}
                    className={inputClass(Boolean(errors.ecm_note))}
                />
            </FormField>
            <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
                <button type="button" className={buttonClass("secondary", "md")} onClick={() => onDone(false)}>
                    ยกเลิก
                </button>
                <button type="submit" className={buttonClass("primary", "md")} disabled={isSaving}>
                    {isEditing ? "บันทึกยอด" : "เพิ่มอัตรา"}
                </button>
            </div>
        </form>
    );
}
