"use client";

// อัตราประกันสังคมตามวันที่มีผล — อัตราที่ใช้อยู่ + อัตราล่วงหน้า/ย้อนหลัง · เพิ่ม · ลบ (ต้องเหลืออย่างน้อย 1)
import { useState } from "react";
import { toast } from "sonner";
import { Plus, ShieldCheck, Trash2 } from "lucide-react";
import SectionCard from "@/components/ui/section-card";
import FormField, { inputClass } from "@/components/ui/form-field";
import StatusPill from "@/components/ui/status-pill";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { buttonClass } from "@/components/ui/button";
import { formatDateOnly } from "@/app/function";
import { apiFetch } from "@/lib/api";
import { toFieldErrors, type FieldErrors } from "@/lib/form-errors";
import { divideRoundHalfUp, formatAmount, parseHundredths } from "@/lib/shared/money.mjs";
import { ssoRateSchema } from "@/lib/shared/schemas/people.mjs";
import { SETUP_MESSAGES } from "../../_messages";
import type { PeopleSetup, SsoRate } from "../../_types";

// เงินสมทบสูงสุดต่อเดือน = เพดาน × อัตรา (แสดงให้เทียบกับประกาศได้ง่าย — ปัดตามกติกาจริงตอนคิดเงินเดือน)
// เพดานและอัตราเป็นสตางค์ (×100) ทั้งคู่ → ผลคูณหาร 10,000 ได้สตางค์
const HUNDREDTHS_SQUARED = 10_000n;

function maximumContribution(rate: SsoRate) {
    const ceiling = parseHundredths(rate.sr_wage_ceiling, "เพดาน");
    const percent = parseHundredths(rate.sr_employee_rate, "อัตรา");
    return formatAmount(divideRoundHalfUp(ceiling * percent, HUNDREDTHS_SQUARED));
}

export default function SsoRatesSection({
    setup,
    canEdit,
    onChanged,
}: {
    setup: PeopleSetup;
    canEdit: boolean;
    onChanged: () => Promise<void>;
}) {
    const [isAdding, setIsAdding] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<SsoRate | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    async function confirmDelete() {
        if (!deleteTarget) return;
        const { error } = await apiFetch(`/people/sso-rates/${deleteTarget.sr_effective_from}`, { method: "DELETE" });
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
            icon={ShieldCheck}
            title="ประกันสังคม"
            description={SETUP_MESSAGES.ssoRate}
            actions={
                canEdit && (
                    <button type="button" className={buttonClass("secondary", "md")} onClick={() => setIsAdding(true)}>
                        <Plus size={16} />
                        เพิ่มอัตรา
                    </button>
                )
            }
        >
            {isAdding && (
                <SsoRateForm
                    onDone={async (saved) => {
                        setIsAdding(false);
                        if (saved) await onChanged();
                    }}
                />
            )}
            <ul className="grid gap-3">
                {setup.sso_rates.map((rate) => (
                    <li
                        key={rate.sr_effective_from}
                        className="grid gap-2 rounded-xl border border-gray-200 p-4 text-sm"
                    >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="flex flex-wrap items-center gap-2">
                                <span className="font-medium text-gray-900">
                                    มีผล {formatDateOnly(rate.sr_effective_from)}
                                </span>
                                {rate.is_current && <StatusPill tone="success">ใช้อยู่</StatusPill>}
                                {rate.sr_effective_from > setup.today && (
                                    <StatusPill tone="info">มีผลล่วงหน้า</StatusPill>
                                )}
                            </span>
                            {canEdit && (
                                <button
                                    type="button"
                                    className="-my-3 flex items-center gap-1 px-2 py-3 text-xs text-red-600 hover:underline"
                                    onClick={() => setDeleteTarget(rate)}
                                >
                                    <Trash2 size={14} />
                                    ลบ
                                </button>
                            )}
                        </div>
                        <p className="text-gray-700">
                            พนักงาน {Number(rate.sr_employee_rate)}% · บริษัท {Number(rate.sr_employer_rate)}% ·
                            ฐานค่าจ้าง{" "}
                            <span className="tabular-nums">
                                {formatAmount(rate.sr_wage_floor)}–{formatAmount(rate.sr_wage_ceiling)}
                            </span>{" "}
                            บาท
                        </p>
                        <p className="text-xs text-gray-500">
                            หักพนักงานสูงสุดเดือนละ {maximumContribution(rate)} บาท
                            {rate.sr_note ? ` · ${rate.sr_note}` : ""}
                        </p>
                    </li>
                ))}
            </ul>
            <ConfirmDialog
                open={Boolean(deleteTarget)}
                title="ลบอัตราประกันสังคมนี้?"
                description="ช่วงเวลาของอัตรานี้จะใช้อัตราก่อนหน้าแทน · ระบบต้องเหลืออัตราอย่างน้อย 1 แถว"
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

function SsoRateForm({ onDone }: { onDone: (saved: boolean) => Promise<void> }) {
    const [form, setForm] = useState({
        sr_effective_from: "",
        sr_employee_rate: "5",
        sr_employer_rate: "5",
        sr_wage_floor: "1650",
        sr_wage_ceiling: "",
        sr_note: "",
    });
    const [errors, setErrors] = useState<FieldErrors>({});
    const [isSaving, setIsSaving] = useState(false);
    const update = (field: keyof typeof form, value: string) => setForm((current) => ({ ...current, [field]: value }));

    async function save(event: React.FormEvent) {
        event.preventDefault();
        const checked = ssoRateSchema.safeParse(form);
        if (!checked.success) {
            setErrors(toFieldErrors(checked.error.issues));
            return;
        }
        setIsSaving(true);
        const { error } = await apiFetch("/people/sso-rates", { method: "POST", body: checked.data });
        setIsSaving(false);
        if (error) {
            setErrors(error.fields);
            toast.error(error.message);
            return;
        }
        toast.success("เพิ่มอัตราประกันสังคมแล้ว");
        await onDone(true);
    }

    function input(field: keyof typeof form, label: string, options: { type?: string; required?: boolean } = {}) {
        return (
            <FormField label={label} htmlFor={`sso-${field}`} required={options.required} error={errors[field]}>
                <input
                    id={`sso-${field}`}
                    type={options.type ?? "text"}
                    inputMode={options.type ? undefined : "decimal"}
                    value={form[field]}
                    onChange={(event) => update(field, event.target.value)}
                    className={inputClass(Boolean(errors[field]))}
                />
            </FormField>
        );
    }

    return (
        <form onSubmit={save} noValidate className="grid gap-3 rounded-xl bg-gray-50 p-4 sm:grid-cols-2">
            {input("sr_effective_from", "มีผลตั้งแต่", { type: "date", required: true })}
            {input("sr_wage_ceiling", "ฐานค่าจ้างสูงสุด (บาท/เดือน)", { required: true })}
            {input("sr_employee_rate", "อัตราพนักงาน (%)", { required: true })}
            {input("sr_employer_rate", "อัตราบริษัท (%)", { required: true })}
            {input("sr_wage_floor", "ฐานค่าจ้างขั้นต่ำ (บาท/เดือน)", { required: true })}
            <FormField label="ที่มา/หมายเหตุ" htmlFor="sso-sr_note" error={errors.sr_note}>
                <input
                    id="sso-sr_note"
                    placeholder="เช่น กฎกระทรวง พ.ศ. ..."
                    value={form.sr_note}
                    onChange={(event) => update("sr_note", event.target.value)}
                    className={inputClass(Boolean(errors.sr_note))}
                />
            </FormField>
            <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
                <button type="button" className={buttonClass("secondary", "md")} onClick={() => onDone(false)}>
                    ยกเลิก
                </button>
                <button type="submit" className={buttonClass("primary", "md")} disabled={isSaving}>
                    เพิ่มอัตรา
                </button>
            </div>
        </form>
    );
}
