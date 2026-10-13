"use client";

// แท็บค่าเริ่มต้นใบเสนอราคา: อายุยืนราคา เงื่อนไขท้ายเอกสาร (ไทย/อังกฤษ) และการอนุมัติใบของตัวเอง
import { useState } from "react";
import { FileText, ShieldCheck } from "lucide-react";
import FormField, { inputClass } from "@/components/ui/form-field";
import FieldHint from "@/components/ui/guidance/field-hint";
import Switch from "@/components/ui/switch";
import UnsavedBar from "@/components/ui/unsaved-bar";
import { COMPANY_MESSAGES } from "../_messages";
import type { Company } from "../_types";
import { useSaveCompany } from "../_hooks/use-save-company";
import SaveErrorBanner from "@/components/ui/save-error-banner";
import SectionCard from "@/components/ui/section-card";

type QuotationDefaultsTabProps = {
    company: Company;
    canEdit: boolean;
    onSaved: () => Promise<void>;
};

function toForm(company: Company) {
    return {
        validDays: String(company.cs_quotation_valid_days),
        termsTh: company.cs_quotation_terms_th ?? "",
        termsEn: company.cs_quotation_terms_en ?? "",
        allowSelfApproval: company.cs_allow_self_approval,
    };
}

type DefaultsForm = ReturnType<typeof toForm>;

export default function QuotationDefaultsTab({ company, canEdit, onSaved }: QuotationDefaultsTabProps) {
    const messages = COMPANY_MESSAGES.quotation;
    const [form, setForm] = useState<DefaultsForm>(() => toForm(company));
    const { save, fieldErrors, saveError, isSaving } = useSaveCompany(company, onSaved);

    const isDirty = canEdit && JSON.stringify(form) !== JSON.stringify(toForm(company));

    function updateField<Field extends keyof DefaultsForm>(field: Field, value: DefaultsForm[Field]) {
        setForm((current) => ({ ...current, [field]: value }));
    }

    async function handleSubmit(event?: React.FormEvent) {
        event?.preventDefault();
        // ช่องว่าง/ไม่ใช่ตัวเลข ส่ง NaN ให้ชุดตรวจบอกว่า "ต้องเป็นตัวเลข" แทนการแปลงเป็น 0 เงียบๆ
        const validDaysNumber = form.validDays.trim() === "" ? Number.NaN : Number(form.validDays);
        await save({
            cs_quotation_valid_days: validDaysNumber,
            cs_quotation_terms_th: form.termsTh,
            cs_quotation_terms_en: form.termsEn,
            cs_allow_self_approval: form.allowSelfApproval,
        });
    }

    return (
        <form onSubmit={handleSubmit} className="grid gap-5" noValidate>
            <SectionCard
                icon={FileText}
                title={COMPANY_MESSAGES.tabs.quotation}
                description="ค่าที่เติมให้ตอนสร้างใบเสนอราคาใหม่ แก้ในแต่ละใบได้ · เปลี่ยนค่าที่นี่ไม่กระทบใบที่สร้างไปแล้ว"
            >
                <FormField
                    label="อายุยืนราคา (วัน)"
                    htmlFor="cs_quotation_valid_days"
                    required
                    hint={messages.validDays}
                    error={fieldErrors.cs_quotation_valid_days}
                    className="max-w-xs"
                >
                    <input
                        id="cs_quotation_valid_days"
                        inputMode="numeric"
                        value={form.validDays}
                        onChange={(event) => updateField("validDays", event.target.value)}
                        disabled={!canEdit}
                        className={inputClass(Boolean(fieldErrors.cs_quotation_valid_days))}
                    />
                </FormField>

                <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                        label="เงื่อนไขท้ายเอกสาร (ภาษาไทย)"
                        htmlFor="cs_quotation_terms_th"
                        hint={messages.termsTh}
                        error={fieldErrors.cs_quotation_terms_th}
                    >
                        <textarea
                            id="cs_quotation_terms_th"
                            rows={6}
                            value={form.termsTh}
                            onChange={(event) => updateField("termsTh", event.target.value)}
                            disabled={!canEdit}
                            className={inputClass(Boolean(fieldErrors.cs_quotation_terms_th))}
                        />
                    </FormField>
                    <FormField
                        label="เงื่อนไขท้ายเอกสาร (ภาษาอังกฤษ)"
                        htmlFor="cs_quotation_terms_en"
                        hint={messages.termsEn}
                        error={fieldErrors.cs_quotation_terms_en}
                    >
                        <textarea
                            id="cs_quotation_terms_en"
                            rows={6}
                            value={form.termsEn}
                            onChange={(event) => updateField("termsEn", event.target.value)}
                            disabled={!canEdit}
                            className={inputClass(Boolean(fieldErrors.cs_quotation_terms_en))}
                        />
                    </FormField>
                </div>
            </SectionCard>

            <SectionCard icon={ShieldCheck} title="การอนุมัติใบของตัวเอง">
                <Switch
                    id="cs_allow_self_approval"
                    label="อนุญาตให้ผู้สร้างอนุมัติใบเสนอราคาของตัวเอง"
                    description={messages.selfApproval}
                    checked={form.allowSelfApproval}
                    disabled={!canEdit}
                    onChange={(checked) => updateField("allowSelfApproval", checked)}
                />
                <FieldHint error={fieldErrors.cs_allow_self_approval} />
            </SectionCard>

            <SaveErrorBanner error={saveError} />
            <UnsavedBar
                isDirty={isDirty}
                isSaving={isSaving}
                saveLabel="บันทึกค่าเริ่มต้น"
                onSave={() => handleSubmit()}
                onDiscard={() => setForm(toForm(company))}
            />
        </form>
    );
}
