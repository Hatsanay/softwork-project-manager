"use client";

// รายรับ/รายหักประจำทุกเดือน — เพิ่ม · หยุด (ตั้งวันสุดท้าย) · ลบที่บันทึกผิด
// เปลี่ยนยอด = หยุดรายการเดิม แล้วเพิ่มรายการใหม่ (ประวัติไม่หาย)
import { useState } from "react";
import { toast } from "sonner";
import { CalendarX, ListPlus, Plus, Trash2 } from "lucide-react";
import SectionCard from "@/components/ui/section-card";
import FormField, { inputClass } from "@/components/ui/form-field";
import FieldHint from "@/components/ui/guidance/field-hint";
import Segmented from "@/components/ui/segmented";
import StatusPill, { type PillTone } from "@/components/ui/status-pill";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { buttonClass } from "@/components/ui/button";
import { formatDateOnly } from "@/app/function";
import { apiFetch } from "@/lib/api";
import { toFieldErrors, type FieldErrors } from "@/lib/form-errors";
import { formatAmount } from "@/lib/shared/money.mjs";
import { recurringItemSchema, recurringItemEndSchema } from "@/lib/shared/schemas/people.mjs";
import { EMPLOYEE_MESSAGES } from "../../../_messages";
import type { Employee, RecurringItem, RecurringItemKind, RecurringItemStatus } from "../../../_types";

const ITEM_STATUS: Record<RecurringItemStatus, { label: string; tone: PillTone }> = {
    upcoming: { label: "เริ่มล่วงหน้า", tone: "info" },
    active: { label: "ใช้อยู่", tone: "success" },
    ended: { label: "หยุดแล้ว", tone: "neutral" },
};

export default function RecurringItemsCard({
    employee,
    onChanged,
}: {
    employee: Employee;
    onChanged: () => Promise<void>;
}) {
    const [isAdding, setIsAdding] = useState(false);
    const [endTarget, setEndTarget] = useState<RecurringItem | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<RecurringItem | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const baseUrl = `/employees/${employee.emp_id}/recurring-items`;

    async function confirmDelete() {
        if (!deleteTarget) return;
        const { error } = await apiFetch(`${baseUrl}/${deleteTarget.eri_id}`, { method: "DELETE" });
        if (error) {
            setDeleteError(error.message);
            return;
        }
        toast.success("ลบรายการแล้ว");
        setDeleteTarget(null);
        setDeleteError(null);
        await onChanged();
    }

    return (
        <SectionCard
            icon={ListPlus}
            title="รายรับ / รายหักประจำ"
            description={EMPLOYEE_MESSAGES.recurring}
            actions={
                <button type="button" className={buttonClass("secondary", "md")} onClick={() => setIsAdding(true)}>
                    <Plus size={16} />
                    เพิ่มรายการ
                </button>
            }
        >
            {isAdding && (
                <RecurringItemForm
                    employee={employee}
                    onDone={async (saved) => {
                        setIsAdding(false);
                        if (saved) await onChanged();
                    }}
                />
            )}
            {employee.recurring_items.length === 0 && !isAdding && (
                <p className="text-sm text-gray-500">ยังไม่มีรายการประจำ — เงินเดือนฐานอย่างเดียว</p>
            )}
            <ul className="grid divide-y divide-gray-100 text-sm">
                {employee.recurring_items.map((item) => (
                    <li key={item.eri_id} className="grid gap-1 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="flex flex-wrap items-center gap-2">
                                <span className="font-medium text-gray-900">{item.eri_label}</span>
                                <StatusPill tone={ITEM_STATUS[item.item_status].tone}>
                                    {ITEM_STATUS[item.item_status].label}
                                </StatusPill>
                            </span>
                            <span
                                className={`font-medium tabular-nums ${item.eri_kind === "deduction" ? "text-red-600" : "text-gray-900"}`}
                            >
                                {item.eri_kind === "deduction" ? "−" : "+"}
                                {formatAmount(item.eri_amount)} บาท
                            </span>
                        </div>
                        <span className="text-xs text-gray-500">
                            {formatDateOnly(item.eri_effective_from)} –{" "}
                            {item.eri_effective_to ? formatDateOnly(item.eri_effective_to) : "ไม่มีกำหนด"}
                            {item.eri_kind === "earning" &&
                                ` · ${item.eri_is_taxable ? "คิดภาษี" : "ไม่คิดภาษี"} · ${item.eri_is_sso_wage ? "นับค่าจ้างประกันสังคม" : "ไม่นับค่าจ้างประกันสังคม"}`}
                            {item.eri_note ? ` · ${item.eri_note}` : ""}
                        </span>
                        <span className="flex flex-wrap gap-1">
                            {item.item_status !== "ended" && (
                                <button
                                    type="button"
                                    className="-my-1 flex items-center gap-1 px-2 py-3 text-xs text-blue-600 hover:underline"
                                    onClick={() => setEndTarget(item)}
                                >
                                    <CalendarX size={14} />
                                    หยุดรายการ
                                </button>
                            )}
                            <button
                                type="button"
                                className="-my-1 flex items-center gap-1 px-2 py-3 text-xs text-red-600 hover:underline"
                                onClick={() => setDeleteTarget(item)}
                            >
                                <Trash2 size={14} />
                                ลบ
                            </button>
                        </span>
                        {endTarget?.eri_id === item.eri_id && (
                            <EndItemForm
                                url={`${baseUrl}/${item.eri_id}/end`}
                                item={item}
                                today={employee.today}
                                onDone={async (saved) => {
                                    setEndTarget(null);
                                    if (saved) await onChanged();
                                }}
                            />
                        )}
                    </li>
                ))}
            </ul>
            <ConfirmDialog
                open={Boolean(deleteTarget)}
                title="ลบรายการนี้?"
                description={
                    deleteTarget
                        ? `"${deleteTarget.eri_label}" จะถูกลบทั้งประวัติ · ถ้าแค่ไม่จ่าย/ไม่หักแล้ว ให้ใช้ "หยุดรายการ" แทน`
                        : undefined
                }
                confirmLabel="ลบรายการ"
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

const EMPTY_ITEM = {
    eri_kind: "earning" as RecurringItemKind,
    eri_label: "",
    eri_amount: "",
    eri_is_taxable: true,
    eri_is_sso_wage: false,
    eri_effective_from: "",
    eri_effective_to: "",
    eri_note: "",
};

function RecurringItemForm({ employee, onDone }: { employee: Employee; onDone: (saved: boolean) => Promise<void> }) {
    const [form, setForm] = useState(EMPTY_ITEM);
    const [errors, setErrors] = useState<FieldErrors>({});
    const [isSaving, setIsSaving] = useState(false);
    const isEarning = form.eri_kind === "earning";

    function update<Field extends keyof typeof EMPTY_ITEM>(field: Field, value: (typeof EMPTY_ITEM)[Field]) {
        setForm((current) => ({ ...current, [field]: value }));
    }

    async function save(event: React.FormEvent) {
        event.preventDefault();
        const checked = recurringItemSchema.safeParse(form);
        if (!checked.success) {
            setErrors(toFieldErrors(checked.error.issues));
            return;
        }
        setIsSaving(true);
        const { error } = await apiFetch(`/employees/${employee.emp_id}/recurring-items`, {
            method: "POST",
            body: checked.data,
        });
        setIsSaving(false);
        if (error) {
            setErrors(error.fields);
            toast.error(error.message);
            return;
        }
        toast.success("เพิ่มรายการแล้ว");
        await onDone(true);
    }

    return (
        <form onSubmit={save} noValidate className="grid gap-3 rounded-xl bg-gray-50 p-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
                <Segmented<RecurringItemKind>
                    label="ชนิดรายการ"
                    value={form.eri_kind}
                    onChange={(value) => update("eri_kind", value)}
                    options={[
                        { value: "earning", label: "รายรับ (+)" },
                        { value: "deduction", label: "รายหัก (−)" },
                    ]}
                />
            </div>
            <FormField label="ชื่อรายการ (พิมพ์บนสลิป)" htmlFor="eri_label" required error={errors.eri_label}>
                <input
                    id="eri_label"
                    placeholder={isEarning ? "เช่น ค่าตำแหน่ง" : "เช่น ผ่อนเงินกู้สวัสดิการ"}
                    value={form.eri_label}
                    onChange={(event) => update("eri_label", event.target.value)}
                    className={inputClass(Boolean(errors.eri_label))}
                />
            </FormField>
            <FormField label="ยอดต่อเดือน (บาท)" htmlFor="eri_amount" required error={errors.eri_amount}>
                <input
                    id="eri_amount"
                    inputMode="decimal"
                    value={form.eri_amount}
                    onChange={(event) => update("eri_amount", event.target.value)}
                    className={inputClass(Boolean(errors.eri_amount))}
                />
            </FormField>
            <FormField
                label="เริ่มตั้งแต่"
                htmlFor="eri_effective_from"
                required
                hint="ต้องไม่ก่อนวันเริ่มงาน"
                error={errors.eri_effective_from}
            >
                <input
                    id="eri_effective_from"
                    type="date"
                    min={employee.emp_hire_date}
                    value={form.eri_effective_from}
                    onChange={(event) => update("eri_effective_from", event.target.value)}
                    className={inputClass(Boolean(errors.eri_effective_from))}
                />
            </FormField>
            <FormField
                label="ถึงวันที่"
                htmlFor="eri_effective_to"
                hint="ว่าง = ไม่มีกำหนด"
                error={errors.eri_effective_to}
            >
                <input
                    id="eri_effective_to"
                    type="date"
                    min={form.eri_effective_from || employee.emp_hire_date}
                    value={form.eri_effective_to}
                    onChange={(event) => update("eri_effective_to", event.target.value)}
                    className={inputClass(Boolean(errors.eri_effective_to))}
                />
            </FormField>
            {isEarning && (
                <>
                    <label className="flex items-start gap-2 text-sm">
                        <input
                            type="checkbox"
                            className="mt-1 h-4 w-4"
                            checked={form.eri_is_taxable}
                            onChange={(event) => update("eri_is_taxable", event.target.checked)}
                        />
                        <span className="grid gap-0.5">
                            <span>คิดภาษี</span>
                            <FieldHint>{EMPLOYEE_MESSAGES.recurringTaxable}</FieldHint>
                        </span>
                    </label>
                    <label className="flex items-start gap-2 text-sm">
                        <input
                            type="checkbox"
                            className="mt-1 h-4 w-4"
                            checked={form.eri_is_sso_wage}
                            onChange={(event) => update("eri_is_sso_wage", event.target.checked)}
                        />
                        <span className="grid gap-0.5">
                            <span>นับเป็นค่าจ้างประกันสังคม</span>
                            <FieldHint>{EMPLOYEE_MESSAGES.recurringSsoWage}</FieldHint>
                        </span>
                    </label>
                </>
            )}
            <FormField label="หมายเหตุ" htmlFor="eri_note" error={errors.eri_note} className="sm:col-span-2">
                <input
                    id="eri_note"
                    value={form.eri_note}
                    onChange={(event) => update("eri_note", event.target.value)}
                    className={inputClass(Boolean(errors.eri_note))}
                />
            </FormField>
            <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
                <button type="button" className={buttonClass("secondary", "md")} onClick={() => onDone(false)}>
                    ยกเลิก
                </button>
                <button type="submit" className={buttonClass("primary", "md")} disabled={isSaving}>
                    เพิ่มรายการ
                </button>
            </div>
        </form>
    );
}

function EndItemForm({
    url,
    item,
    today,
    onDone,
}: {
    url: string;
    item: RecurringItem;
    today: string;
    onDone: (saved: boolean) => Promise<void>;
}) {
    const [effectiveTo, setEffectiveTo] = useState(item.eri_effective_to ?? today);
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const fieldId = `end-${item.eri_id}`;

    async function save(event: React.FormEvent) {
        event.preventDefault();
        const checked = recurringItemEndSchema.safeParse({ eri_effective_to: effectiveTo });
        if (!checked.success) {
            setError(toFieldErrors(checked.error.issues).eri_effective_to ?? null);
            return;
        }
        setIsSaving(true);
        const { error: saveError } = await apiFetch(url, { method: "POST", body: checked.data });
        setIsSaving(false);
        if (saveError) {
            setError(saveError.fields.eri_effective_to ?? saveError.message);
            return;
        }
        toast.success("หยุดรายการแล้ว");
        await onDone(true);
    }

    return (
        <form
            onSubmit={save}
            noValidate
            className="mt-1 grid gap-3 rounded-xl bg-gray-50 p-3 sm:grid-cols-[1fr_auto] sm:items-end"
        >
            <FormField
                label="วันสุดท้ายที่มีผล"
                htmlFor={fieldId}
                hint="รอบเงินเดือนหลังวันนี้จะไม่มีรายการนี้"
                error={error}
            >
                <input
                    id={fieldId}
                    type="date"
                    min={item.eri_effective_from}
                    value={effectiveTo}
                    onChange={(event) => setEffectiveTo(event.target.value)}
                    className={inputClass(Boolean(error))}
                />
            </FormField>
            <div className="flex flex-wrap justify-end gap-2">
                <button type="button" className={buttonClass("secondary", "md")} onClick={() => onDone(false)}>
                    ยกเลิก
                </button>
                <button type="submit" className={buttonClass("primary", "md")} disabled={isSaving}>
                    หยุดรายการ
                </button>
            </div>
        </form>
    );
}
