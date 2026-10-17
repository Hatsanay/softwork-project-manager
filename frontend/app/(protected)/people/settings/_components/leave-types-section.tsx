"use client";

// ประเภทลา + โควตาต่อปี — เพิ่ม/แก้ · ปิดใช้งานแทนการลบ (ใบลาเก่ายังอ้างอยู่)
import { useState } from "react";
import { toast } from "sonner";
import { Plane, Plus } from "lucide-react";
import SectionCard from "@/components/ui/section-card";
import FormField, { inputClass } from "@/components/ui/form-field";
import FieldHint from "@/components/ui/guidance/field-hint";
import StatusPill, { ActiveStatusPill } from "@/components/ui/status-pill";
import { buttonClass } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { toFieldErrors, type FieldErrors } from "@/lib/form-errors";
import { leaveTypeSchema } from "@/lib/shared/schemas/people.mjs";
import { SETUP_MESSAGES } from "../../_messages";
import type { ActiveStatus, LeaveType, PeopleSetup } from "../../_types";

function daysText(value: string | null) {
    if (value === null) return null;
    return `${Number(value)} วัน`;
}

function leaveTypeDetail(leaveType: LeaveType) {
    const parts = [
        leaveType.lt_days_per_year === null ? "ไม่จำกัดวัน" : `ปีละ ${daysText(leaveType.lt_days_per_year)}`,
        leaveType.lt_attachment_from_days !== null &&
            `แนบไฟล์เมื่อลาตั้งแต่ ${daysText(leaveType.lt_attachment_from_days)}`,
        leaveType.lt_min_service_days > 0 && `ใช้ได้เมื่อทำงานครบ ${leaveType.lt_min_service_days} วัน`,
        Number(leaveType.lt_carry_over_days) > 0 && `ยกไปปีถัดไปได้ ${daysText(leaveType.lt_carry_over_days)}`,
    ];
    return parts.filter(Boolean).join(" · ");
}

export default function LeaveTypesSection({
    setup,
    canEdit,
    onChanged,
}: {
    setup: PeopleSetup;
    canEdit: boolean;
    onChanged: () => Promise<void>;
}) {
    const [editing, setEditing] = useState<LeaveType | "new" | null>(null);

    return (
        <SectionCard
            icon={Plane}
            title="ประเภทลา"
            description={SETUP_MESSAGES.leaveTypes}
            actions={
                canEdit && (
                    <button type="button" className={buttonClass("secondary", "md")} onClick={() => setEditing("new")}>
                        <Plus size={16} />
                        เพิ่มประเภทลา
                    </button>
                )
            }
        >
            {editing && (
                <LeaveTypeForm
                    leaveType={editing === "new" ? null : editing}
                    onDone={async (saved) => {
                        setEditing(null);
                        if (saved) await onChanged();
                    }}
                />
            )}
            <ul className="grid gap-2 text-sm">
                {setup.leave_types.map((leaveType) => (
                    <li
                        key={leaveType.lt_id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 p-3"
                    >
                        <div className="grid min-w-0 gap-0.5">
                            <span className="flex flex-wrap items-center gap-2 font-medium text-gray-900">
                                {leaveType.lt_name_th}
                                {!leaveType.lt_is_paid && <StatusPill tone="wait">ไม่ได้รับค่าจ้าง</StatusPill>}
                            </span>
                            <span className="text-xs text-gray-500">{leaveTypeDetail(leaveType)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <ActiveStatusPill isActive={leaveType.lt_status === "active"} />
                            {canEdit && (
                                <button
                                    type="button"
                                    className={buttonClass("secondary", "sm")}
                                    onClick={() => setEditing(leaveType)}
                                >
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

function LeaveTypeForm({
    leaveType,
    onDone,
}: {
    leaveType: LeaveType | null;
    onDone: (saved: boolean) => Promise<void>;
}) {
    const [form, setForm] = useState({
        lt_name_th: leaveType?.lt_name_th ?? "",
        lt_name_en: leaveType?.lt_name_en ?? "",
        lt_days_per_year: leaveType?.lt_days_per_year ? String(Number(leaveType.lt_days_per_year)) : "",
        lt_is_paid: leaveType?.lt_is_paid ?? true,
        lt_attachment_from_days: leaveType?.lt_attachment_from_days
            ? String(Number(leaveType.lt_attachment_from_days))
            : "",
        lt_min_service_days: String(leaveType?.lt_min_service_days ?? 0),
        lt_carry_over_days: leaveType ? String(Number(leaveType.lt_carry_over_days)) : "0",
        lt_status: leaveType?.lt_status ?? ("active" as ActiveStatus),
        lt_sort_order: String(leaveType?.lt_sort_order ?? 0),
    });
    const [errors, setErrors] = useState<FieldErrors>({});
    const [isSaving, setIsSaving] = useState(false);
    const update = (field: keyof typeof form, value: string | boolean) =>
        setForm((current) => ({ ...current, [field]: value }));

    async function save(event: React.FormEvent) {
        event.preventDefault();
        const checked = leaveTypeSchema.safeParse({
            ...form,
            lt_min_service_days: Number(form.lt_min_service_days || 0),
            lt_sort_order: Number(form.lt_sort_order || 0),
        });
        if (!checked.success) {
            setErrors(toFieldErrors(checked.error.issues));
            return;
        }
        setIsSaving(true);
        const { error } = leaveType
            ? await apiFetch(`/people/leave-types/${leaveType.lt_id}`, { method: "PUT", body: checked.data })
            : await apiFetch("/people/leave-types", { method: "POST", body: checked.data });
        setIsSaving(false);
        if (error) {
            setErrors(error.fields);
            toast.error(error.message);
            return;
        }
        toast.success("บันทึกประเภทลาแล้ว");
        await onDone(true);
    }

    function textInput(field: Exclude<keyof typeof form, "lt_is_paid">, inputMode?: "decimal" | "numeric") {
        return (
            <input
                id={field}
                inputMode={inputMode}
                value={form[field]}
                onChange={(event) => update(field, event.target.value)}
                className={inputClass(Boolean(errors[field]))}
            />
        );
    }

    return (
        <form onSubmit={save} noValidate className="grid gap-3 rounded-xl bg-gray-50 p-4 sm:grid-cols-2">
            <FormField label="ชื่อประเภทลา" htmlFor="lt_name_th" required error={errors.lt_name_th}>
                {textInput("lt_name_th")}
            </FormField>
            <FormField label="ชื่อ (อังกฤษ)" htmlFor="lt_name_en" error={errors.lt_name_en}>
                {textInput("lt_name_en")}
            </FormField>
            <FormField
                label="โควตาต่อปี (วัน)"
                htmlFor="lt_days_per_year"
                hint="ว่าง = ไม่จำกัด · ทีละครึ่งวันได้"
                error={errors.lt_days_per_year}
            >
                {textInput("lt_days_per_year", "decimal")}
            </FormField>
            <FormField
                label="ต้องแนบไฟล์เมื่อลาตั้งแต่ (วัน)"
                htmlFor="lt_attachment_from_days"
                hint="เช่น ลาป่วย 3 วันขึ้นไปต้องมีใบรับรองแพทย์ · ว่าง = ไม่ต้องแนบ"
                error={errors.lt_attachment_from_days}
            >
                {textInput("lt_attachment_from_days", "decimal")}
            </FormField>
            <FormField
                label="ใช้ได้เมื่อทำงานครบ (วัน)"
                htmlFor="lt_min_service_days"
                hint="เช่น พักร้อนหลังทำงานครบ 1 ปี = 365 · 0 = ใช้ได้ตั้งแต่วันแรก"
                error={errors.lt_min_service_days}
            >
                {textInput("lt_min_service_days", "numeric")}
            </FormField>
            <FormField
                label="ยกไปปีถัดไปได้สูงสุด (วัน)"
                htmlFor="lt_carry_over_days"
                hint="0 = ไม่ยกยอด (วันที่เหลือหมดอายุสิ้นปี)"
                error={errors.lt_carry_over_days}
            >
                {textInput("lt_carry_over_days", "decimal")}
            </FormField>
            <FormField label="สถานะ" htmlFor="lt_status" error={errors.lt_status}>
                <select
                    id="lt_status"
                    value={form.lt_status}
                    onChange={(event) => update("lt_status", event.target.value)}
                    className={inputClass(false)}
                >
                    <option value="active">ใช้งาน</option>
                    <option value="inactive">ปิดใช้งาน</option>
                </select>
            </FormField>
            <FormField label="ลำดับ" htmlFor="lt_sort_order" error={errors.lt_sort_order}>
                {textInput("lt_sort_order", "numeric")}
            </FormField>
            <label className="flex items-start gap-2 text-sm sm:col-span-2">
                <input
                    type="checkbox"
                    className="mt-1 h-4 w-4"
                    checked={form.lt_is_paid}
                    onChange={(event) => update("lt_is_paid", event.target.checked)}
                />
                <span className="grid gap-0.5">
                    <span>ได้รับค่าจ้างระหว่างลา</span>
                    <FieldHint>
                        ไม่ติ๊ก = หักเงินเดือนตามจำนวนวันลา (วิธีหักตั้งที่ &quot;เวลาทำงานและเงินเดือน&quot;)
                    </FieldHint>
                </span>
            </label>
            <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
                <button type="button" className={buttonClass("secondary", "md")} onClick={() => onDone(false)}>
                    ยกเลิก
                </button>
                <button type="submit" className={buttonClass("primary", "md")} disabled={isSaving}>
                    บันทึก
                </button>
            </div>
        </form>
    );
}
