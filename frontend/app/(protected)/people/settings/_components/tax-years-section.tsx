"use client";

// ปีภาษีเงินได้ + ขั้นภาษีทั้งชุด — ปีที่ไม่มีชุดของตัวเองใช้ปีล่าสุดก่อนหน้า · เพิ่ม/แก้ทั้งปี · ลบ (ต้องเหลืออย่างน้อย 1 ปี)
import { useState } from "react";
import { toast } from "sonner";
import { Landmark, Pencil, Plus, Trash2, X } from "lucide-react";
import SectionCard from "@/components/ui/section-card";
import FormField, { inputClass } from "@/components/ui/form-field";
import FieldHint from "@/components/ui/guidance/field-hint";
import StatusPill from "@/components/ui/status-pill";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { buttonClass } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { toFieldErrors, type FieldErrors } from "@/lib/form-errors";
import { formatAmount } from "@/lib/shared/money.mjs";
import { taxYearSchema } from "@/lib/shared/schemas/people.mjs";
import { SETUP_MESSAGES } from "../../_messages";
import type { PeopleSetup, TaxBracket, TaxYear } from "../../_types";

type Editing = { mode: "new" } | { mode: "edit"; taxYear: TaxYear } | null;

// ปีที่ระบบใช้คิดภาษีของปีปัจจุบัน = ปีล่าสุดที่ไม่เกินปีปัจจุบัน
function yearInUse(setup: PeopleSetup) {
    return setup.tax_years.find((year) => year.ity_tax_year <= setup.current_tax_year)?.ity_tax_year ?? null;
}

function bracketRangeText(brackets: TaxBracket[], index: number) {
    const from = formatAmount(brackets[index].itb_from_amount);
    const next = brackets[index + 1];
    return next ? `${from} – ${formatAmount(next.itb_from_amount)}` : `เกิน ${from}`;
}

export default function TaxYearsSection({
    setup,
    canEdit,
    onChanged,
}: {
    setup: PeopleSetup;
    canEdit: boolean;
    onChanged: () => Promise<void>;
}) {
    const [editing, setEditing] = useState<Editing>(null);
    const [deleteTarget, setDeleteTarget] = useState<TaxYear | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const usedYear = yearInUse(setup);

    async function confirmDelete() {
        if (!deleteTarget) return;
        const { error } = await apiFetch(`/people/tax-years/${deleteTarget.ity_tax_year}`, { method: "DELETE" });
        if (error) {
            setDeleteError(error.message);
            return;
        }
        toast.success("ลบปีภาษีแล้ว");
        setDeleteTarget(null);
        setDeleteError(null);
        await onChanged();
    }

    return (
        <SectionCard
            icon={Landmark}
            title="ภาษีเงินได้ (หัก ณ ที่จ่ายเงินเดือน)"
            description={SETUP_MESSAGES.taxYear}
            actions={
                canEdit && (
                    <button
                        type="button"
                        className={buttonClass("secondary", "md")}
                        onClick={() => setEditing({ mode: "new" })}
                    >
                        <Plus size={16} />
                        เพิ่มปีภาษี
                    </button>
                )
            }
        >
            {editing && (
                <TaxYearForm
                    taxYear={editing.mode === "edit" ? editing.taxYear : null}
                    suggestedYear={(setup.tax_years[0]?.ity_tax_year ?? setup.current_tax_year) + 1}
                    template={setup.tax_years[0] ?? null}
                    onDone={async (saved) => {
                        setEditing(null);
                        if (saved) await onChanged();
                    }}
                />
            )}
            <ul className="grid gap-3">
                {setup.tax_years.map((taxYear) => (
                    <li key={taxYear.ity_tax_year} className="grid gap-3 rounded-xl border border-gray-200 p-4 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="flex flex-wrap items-center gap-2">
                                <span className="font-medium text-gray-900">
                                    ปีภาษี {taxYear.ity_tax_year} (พ.ศ. {taxYear.ity_tax_year + 543})
                                </span>
                                {taxYear.ity_tax_year === usedYear && (
                                    <StatusPill tone="success">ใช้กับปีนี้</StatusPill>
                                )}
                            </span>
                            {canEdit && (
                                <span className="flex items-center gap-1">
                                    <button
                                        type="button"
                                        className="-my-3 flex items-center gap-1 px-2 py-3 text-xs text-blue-600 hover:underline"
                                        onClick={() => setEditing({ mode: "edit", taxYear })}
                                    >
                                        <Pencil size={14} />
                                        แก้ไข
                                    </button>
                                    <button
                                        type="button"
                                        className="-my-3 flex items-center gap-1 px-2 py-3 text-xs text-red-600 hover:underline"
                                        onClick={() => setDeleteTarget(taxYear)}
                                    >
                                        <Trash2 size={14} />
                                        ลบ
                                    </button>
                                </span>
                            )}
                        </div>
                        <p className="text-gray-700">
                            หักค่าใช้จ่าย {Number(taxYear.ity_expense_rate)}% ไม่เกิน{" "}
                            {formatAmount(taxYear.ity_expense_cap)} บาท · ลดหย่อนส่วนตัว{" "}
                            {formatAmount(taxYear.ity_personal_allowance)} บาท
                            {taxYear.ity_note ? ` · ${taxYear.ity_note}` : ""}
                        </p>
                        <ul className="grid gap-x-10 gap-y-1 rounded-lg bg-gray-50 p-3 text-xs text-gray-700 sm:grid-cols-2">
                            {taxYear.brackets.map((bracket, index) => (
                                <li key={bracket.itb_from_amount} className="flex justify-between gap-3 tabular-nums">
                                    <span>{bracketRangeText(taxYear.brackets, index)}</span>
                                    <span className="font-medium">{Number(bracket.itb_rate)}%</span>
                                </li>
                            ))}
                        </ul>
                    </li>
                ))}
            </ul>
            <ConfirmDialog
                open={Boolean(deleteTarget)}
                title={`ลบปีภาษี ${deleteTarget?.ity_tax_year ?? ""}?`}
                description="ปีนั้นจะใช้ชุดของปีก่อนหน้าแทน · ระบบต้องเหลือปีภาษีอย่างน้อย 1 ปี"
                confirmLabel="ลบปีภาษี"
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

function TaxYearForm({
    taxYear,
    suggestedYear,
    template,
    onDone,
}: {
    taxYear: TaxYear | null;
    suggestedYear: number;
    template: TaxYear | null;
    onDone: (saved: boolean) => Promise<void>;
}) {
    const isEditing = taxYear !== null;
    // ปีใหม่เริ่มจากชุดล่าสุด (ส่วนใหญ่กฎหมายเปลี่ยนแค่บางช่อง)
    const source = taxYear ?? template;
    const [form, setForm] = useState({
        ity_tax_year: String(taxYear?.ity_tax_year ?? suggestedYear),
        ity_expense_rate: source ? String(Number(source.ity_expense_rate)) : "50",
        ity_expense_cap: source?.ity_expense_cap ?? "100000",
        ity_personal_allowance: source?.ity_personal_allowance ?? "60000",
        ity_note: taxYear?.ity_note ?? "",
    });
    const [brackets, setBrackets] = useState<TaxBracket[]>(
        source?.brackets.map((bracket) => ({ ...bracket })) ?? [{ itb_from_amount: "0", itb_rate: "0" }],
    );
    const [errors, setErrors] = useState<FieldErrors>({});
    const [isSaving, setIsSaving] = useState(false);
    const update = (field: keyof typeof form, value: string) => setForm((current) => ({ ...current, [field]: value }));

    function updateBracket(index: number, field: keyof TaxBracket, value: string) {
        setBrackets((current) => current.map((bracket, i) => (i === index ? { ...bracket, [field]: value } : bracket)));
    }

    async function save(event: React.FormEvent) {
        event.preventDefault();
        const checked = taxYearSchema.safeParse({ ...form, ity_tax_year: Number(form.ity_tax_year), brackets });
        if (!checked.success) {
            setErrors(toFieldErrors(checked.error.issues));
            return;
        }
        setIsSaving(true);
        const { ity_tax_year: year, ...body } = checked.data;
        const { error } = await apiFetch(`/people/tax-years/${year}`, { method: "PUT", body });
        setIsSaving(false);
        if (error) {
            setErrors(error.fields);
            toast.error(error.message);
            return;
        }
        toast.success(`บันทึกปีภาษี ${year} แล้ว`);
        await onDone(true);
    }

    return (
        <form onSubmit={save} noValidate className="grid gap-3 rounded-xl bg-gray-50 p-4 sm:grid-cols-2">
            <FormField
                label="ปีภาษี (ค.ศ.)"
                htmlFor="ity_tax_year"
                required
                hint={isEditing ? undefined : "บันทึกปีที่มีอยู่แล้ว = แทนที่ชุดเดิมของปีนั้น"}
                error={errors.ity_tax_year}
            >
                <input
                    id="ity_tax_year"
                    inputMode="numeric"
                    disabled={isEditing}
                    value={form.ity_tax_year}
                    onChange={(event) => update("ity_tax_year", event.target.value)}
                    className={inputClass(Boolean(errors.ity_tax_year))}
                />
            </FormField>
            <FormField label="หักค่าใช้จ่าย (%)" htmlFor="ity_expense_rate" required error={errors.ity_expense_rate}>
                <input
                    id="ity_expense_rate"
                    inputMode="decimal"
                    value={form.ity_expense_rate}
                    onChange={(event) => update("ity_expense_rate", event.target.value)}
                    className={inputClass(Boolean(errors.ity_expense_rate))}
                />
            </FormField>
            <FormField
                label="หักค่าใช้จ่ายสูงสุด (บาท)"
                htmlFor="ity_expense_cap"
                required
                error={errors.ity_expense_cap}
            >
                <input
                    id="ity_expense_cap"
                    inputMode="decimal"
                    value={form.ity_expense_cap}
                    onChange={(event) => update("ity_expense_cap", event.target.value)}
                    className={inputClass(Boolean(errors.ity_expense_cap))}
                />
            </FormField>
            <FormField
                label="ลดหย่อนส่วนตัว (บาท)"
                htmlFor="ity_personal_allowance"
                required
                error={errors.ity_personal_allowance}
            >
                <input
                    id="ity_personal_allowance"
                    inputMode="decimal"
                    value={form.ity_personal_allowance}
                    onChange={(event) => update("ity_personal_allowance", event.target.value)}
                    className={inputClass(Boolean(errors.ity_personal_allowance))}
                />
            </FormField>
            <fieldset className="grid gap-2 sm:col-span-2">
                <legend className="mb-1 text-sm text-gray-800">ขั้นภาษี (เงินได้สุทธิตั้งแต่ → อัตรา)</legend>
                {brackets.map((bracket, index) => (
                    <div key={index} className="grid grid-cols-[1fr_6rem_auto] items-start gap-2">
                        <div className="grid gap-1">
                            <input
                                aria-label={`ขั้นที่ ${index + 1} เงินได้สุทธิตั้งแต่`}
                                inputMode="decimal"
                                value={bracket.itb_from_amount}
                                disabled={index === 0}
                                onChange={(event) => updateBracket(index, "itb_from_amount", event.target.value)}
                                className={inputClass(Boolean(errors[`brackets.${index}.itb_from_amount`]))}
                            />
                            <FieldHint error={errors[`brackets.${index}.itb_from_amount`]} />
                        </div>
                        <div className="grid gap-1">
                            <input
                                aria-label={`ขั้นที่ ${index + 1} อัตรา (%)`}
                                inputMode="decimal"
                                value={bracket.itb_rate}
                                onChange={(event) => updateBracket(index, "itb_rate", event.target.value)}
                                className={inputClass(Boolean(errors[`brackets.${index}.itb_rate`]))}
                            />
                            <FieldHint error={errors[`brackets.${index}.itb_rate`]} />
                        </div>
                        <button
                            type="button"
                            aria-label={`ลบขั้นที่ ${index + 1}`}
                            disabled={index === 0}
                            className={`${buttonClass("ghost", "md")} disabled:invisible`}
                            onClick={() => setBrackets((current) => current.filter((_, i) => i !== index))}
                        >
                            <X size={16} />
                        </button>
                    </div>
                ))}
                <FieldHint error={errors.brackets}>
                    ขั้นแรกเริ่มที่ 0 เสมอ · ยอดเริ่มของขั้นถัดไปต้องมากขึ้นเรื่อยๆ
                </FieldHint>
                <button
                    type="button"
                    className={`${buttonClass("secondary", "sm")} justify-self-start`}
                    onClick={() => setBrackets((current) => [...current, { itb_from_amount: "", itb_rate: "" }])}
                >
                    <Plus size={14} />
                    เพิ่มขั้น
                </button>
            </fieldset>
            <FormField label="ที่มา/หมายเหตุ" htmlFor="ity_note" error={errors.ity_note} className="sm:col-span-2">
                <input
                    id="ity_note"
                    value={form.ity_note}
                    onChange={(event) => update("ity_note", event.target.value)}
                    className={inputClass(Boolean(errors.ity_note))}
                />
            </FormField>
            <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
                <button type="button" className={buttonClass("secondary", "md")} onClick={() => onDone(false)}>
                    ยกเลิก
                </button>
                <button type="submit" className={buttonClass("primary", "md")} disabled={isSaving}>
                    บันทึกปีภาษี
                </button>
            </div>
        </form>
    );
}
