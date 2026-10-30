"use client";

// ค่าลดหย่อนรายปี (ล.ย.01) + ยอดยกมาของปี (ขั้น 4-4) — ฝ่ายบุคคลกรอก · แก้แล้วมีผลในรอบเงินเดือนถัดไป
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Receipt } from "lucide-react";
import SectionCard from "@/components/ui/section-card";
import FormField, { inputClass } from "@/components/ui/form-field";
import FieldHint from "@/components/ui/guidance/field-hint";
import Switch from "@/components/ui/switch";
import { buttonClass } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { toFieldErrors, type FieldErrors } from "@/lib/form-errors";
import { taxProfileSchema } from "@/lib/shared/schemas/payroll.mjs";
import { PAYROLL_MESSAGES } from "../../../_messages";
import type { TaxProfile } from "../../../_types";

const ALLOWANCE_FIELDS: [string, string][] = [
    ["etp_spouse_allowance", "คู่สมรส"],
    ["etp_child_allowance", "บุตร"],
    ["etp_parent_allowance", "บิดามารดา"],
    ["etp_insurance_allowance", "เบี้ยประกันชีวิต/สุขภาพ"],
    ["etp_fund_allowance", "กองทุน (PVD/RMF/SSF ฯลฯ)"],
    ["etp_home_loan_interest", "ดอกเบี้ยเงินกู้บ้าน"],
    ["etp_other_allowance", "ลดหย่อนอื่น"],
];
const PRIOR_FIELDS: [string, string][] = [
    ["etp_prior_income", "เงินได้ยกมา"],
    ["etp_prior_tax", "ภาษีที่หักแล้วยกมา"],
    ["etp_prior_sso", "ประกันสังคมยกมา"],
];

export default function TaxProfileCard({ employeeId, currentYear }: { employeeId: string; currentYear: number }) {
    const [year, setYear] = useState(currentYear);
    const [form, setForm] = useState<Record<string, string> | null>(null);
    const [isPriorFromOtherEmployer, setIsPriorFromOtherEmployer] = useState(false);
    const [isSaved, setIsSaved] = useState(false);
    const [errors, setErrors] = useState<FieldErrors>({});
    const [saveError, setSaveError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        let isLeftPage = false;
        apiFetch<TaxProfile>(`/employees/${employeeId}/tax-profiles/${year}`).then(({ data, error }) => {
            if (isLeftPage) return;
            setSaveError(error?.message ?? null);
            if (!data) return;
            setIsSaved(data.is_saved);
            setIsPriorFromOtherEmployer(data.profile.etp_prior_from_other_employer === true);
            setForm(
                Object.fromEntries(
                    Object.entries(data.profile)
                        .filter(([key]) => key !== "etp_prior_from_other_employer")
                        .map(([key, value]) => [key, typeof value === "string" ? value : ""]),
                ),
            );
        });
        return () => {
            isLeftPage = true;
        };
    }, [employeeId, year]);

    async function save(event: React.FormEvent) {
        event.preventDefault();
        if (!form) return;
        const checked = taxProfileSchema.safeParse({
            ...form,
            etp_prior_from_other_employer: isPriorFromOtherEmployer,
        });
        if (!checked.success) {
            setErrors(toFieldErrors(checked.error.issues));
            return;
        }
        setErrors({});
        setIsSaving(true);
        const { error } = await apiFetch(`/employees/${employeeId}/tax-profiles/${year}`, {
            method: "PUT",
            body: checked.data,
        });
        setIsSaving(false);
        if (error) {
            setErrors(error.fields);
            setSaveError(error.message);
            return;
        }
        setSaveError(null);
        setIsSaved(true);
        toast.success(`บันทึกค่าลดหย่อนปี ${year + 543} แล้ว`);
    }

    const field = ([name, label]: [string, string]) => (
        <FormField key={name} label={label} htmlFor={name} error={errors[name]}>
            <input
                id={name}
                inputMode="decimal"
                value={form?.[name] ?? ""}
                onChange={(event) => setForm((current) => ({ ...(current ?? {}), [name]: event.target.value }))}
                className={inputClass(Boolean(errors[name]))}
            />
        </FormField>
    );

    return (
        <SectionCard
            icon={Receipt}
            title="ค่าลดหย่อนภาษีรายปี"
            description={PAYROLL_MESSAGES.taxProfile}
            actions={
                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        aria-label="ปีก่อน"
                        className={buttonClass("secondary", "md")}
                        onClick={() => setYear(year - 1)}
                    >
                        <ChevronLeft size={16} />
                    </button>
                    <span className="min-w-16 text-center text-sm text-gray-900">ปี {year + 543}</span>
                    <button
                        type="button"
                        aria-label="ปีถัดไป"
                        disabled={year >= currentYear + 1}
                        className={buttonClass("secondary", "md")}
                        onClick={() => setYear(year + 1)}
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>
            }
        >
            {form && (
                <form onSubmit={save} noValidate className="grid gap-4">
                    {!isSaved && <FieldHint>ยังไม่ได้กรอกของปีนี้ · คิดภาษีด้วยลดหย่อนส่วนตัวอย่างเดียว</FieldHint>}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{ALLOWANCE_FIELDS.map(field)}</div>
                    <p className="text-sm font-medium text-gray-900">ยอดยกมาของปี</p>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">{PRIOR_FIELDS.map(field)}</div>
                    <Switch
                        id="etp_prior_from_other_employer"
                        label="ยอดยกมาเป็นของที่ทำงานเดิม"
                        description="เปิด = ใช้คิดภาษีทั้งปีเท่านั้น ไม่รวมใน ภ.ง.ด.1ก / 50 ทวิ ของบริษัท (ที่ทำงานเดิมออก 50 ทวิ เอง) · ปิด = เงินที่บริษัทนี้จ่ายก่อนเริ่มใช้ระบบ"
                        checked={isPriorFromOtherEmployer}
                        onChange={setIsPriorFromOtherEmployer}
                    />
                    <FormField label="หมายเหตุ" htmlFor="etp_note" error={errors.etp_note}>
                        <input
                            id="etp_note"
                            maxLength={255}
                            value={form.etp_note ?? ""}
                            onChange={(event) =>
                                setForm((current) => ({ ...(current ?? {}), etp_note: event.target.value }))
                            }
                            className={inputClass(Boolean(errors.etp_note))}
                        />
                    </FormField>
                    <FieldHint error={saveError} />
                    <button
                        type="submit"
                        className={`${buttonClass("primary", "md")} justify-self-end`}
                        disabled={isSaving}
                    >
                        บันทึกค่าลดหย่อน
                    </button>
                </form>
            )}
        </SectionCard>
    );
}
