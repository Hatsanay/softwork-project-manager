"use client";

// แท็บข้อมูลบริษัท: ชื่อ เลขผู้เสียภาษี ที่อยู่ ช่องทางติดต่อ + โลโก้
import { useState } from "react";
import { Building2, ImageIcon, MapPin } from "lucide-react";
import FormField, { inputClass } from "@/components/ui/form-field";
import UnsavedBar from "@/components/ui/unsaved-bar";
import { COMPANY_MESSAGES } from "../_messages";
import type { Company } from "../_types";
import { useSaveCompany } from "../_hooks/use-save-company";
import LogoUploader from "./logo-uploader";
import SaveErrorBanner from "@/components/ui/save-error-banner";
import SectionCard from "@/components/ui/section-card";

type CompanyInfoTabProps = {
    company: Company;
    canEdit: boolean;
    onSaved: () => Promise<void>;
};

function toForm(company: Company) {
    return {
        cs_name_th: company.cs_name_th,
        cs_name_en: company.cs_name_en ?? "",
        cs_tax_id: company.cs_tax_id ?? "",
        cs_address_th: company.cs_address_th ?? "",
        cs_address_en: company.cs_address_en ?? "",
        cs_phone: company.cs_phone ?? "",
        cs_email: company.cs_email ?? "",
        cs_website: company.cs_website ?? "",
    };
}

type InfoForm = ReturnType<typeof toForm>;

export default function CompanyInfoTab({ company, canEdit, onSaved }: CompanyInfoTabProps) {
    const [form, setForm] = useState<InfoForm>(() => toForm(company));
    const { save, fieldErrors, saveError, isSaving } = useSaveCompany(company, onSaved);
    const messages = COMPANY_MESSAGES.info;

    function updateField(field: keyof InfoForm, value: string) {
        setForm((current) => ({ ...current, [field]: value }));
    }

    // มีอะไรต่างจากที่บันทึกไว้ไหม — ใช้แสดงแถบ "ยังไม่บันทึก" (บันทึกแล้ว ค่าที่โหลดใหม่ตรงกับฟอร์ม แถบหายเอง)
    const isDirty = canEdit && JSON.stringify(form) !== JSON.stringify(toForm(company));

    async function handleSubmit(event?: React.FormEvent) {
        event?.preventDefault();
        await save(form);
    }

    function textInput(
        field: keyof InfoForm,
        options: { type?: string; inputMode?: "numeric" | "email" | "tel" | "url" } = {},
    ) {
        return (
            <input
                id={field}
                type={options.type ?? "text"}
                inputMode={options.inputMode}
                value={form[field]}
                onChange={(event) => updateField(field, event.target.value)}
                disabled={!canEdit}
                aria-describedby={`${field}-hint`}
                className={inputClass(Boolean(fieldErrors[field]))}
            />
        );
    }

    function textArea(field: keyof InfoForm) {
        return (
            <textarea
                id={field}
                rows={3}
                value={form[field]}
                onChange={(event) => updateField(field, event.target.value)}
                disabled={!canEdit}
                aria-describedby={`${field}-hint`}
                className={inputClass(Boolean(fieldErrors[field]))}
            />
        );
    }

    return (
        <form onSubmit={handleSubmit} className="grid gap-5" noValidate>
            <SectionCard icon={Building2} title="ชื่อและเลขผู้เสียภาษี" description={COMPANY_MESSAGES.snapshotNote}>
                <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                        label="ชื่อบริษัท (ภาษาไทย)"
                        htmlFor="cs_name_th"
                        required
                        hint={messages.nameTh}
                        error={fieldErrors.cs_name_th}
                    >
                        {textInput("cs_name_th")}
                    </FormField>
                    <FormField
                        label="ชื่อบริษัท (ภาษาอังกฤษ)"
                        htmlFor="cs_name_en"
                        hint={messages.nameEn}
                        error={fieldErrors.cs_name_en}
                    >
                        {textInput("cs_name_en")}
                    </FormField>
                    <FormField
                        label="เลขประจำตัวผู้เสียภาษี"
                        htmlFor="cs_tax_id"
                        hint={messages.taxId}
                        error={fieldErrors.cs_tax_id}
                    >
                        {textInput("cs_tax_id", { inputMode: "numeric" })}
                    </FormField>
                </div>
            </SectionCard>

            <SectionCard icon={ImageIcon} title="โลโก้" description={messages.logoKept}>
                <LogoUploader logoUrl={company.cs_logo_url} canEdit={canEdit} onSaved={onSaved} />
            </SectionCard>

            <SectionCard icon={MapPin} title="ที่อยู่และการติดต่อ">
                <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                        label="ที่อยู่ (ภาษาไทย)"
                        htmlFor="cs_address_th"
                        hint={messages.addressTh}
                        error={fieldErrors.cs_address_th}
                    >
                        {textArea("cs_address_th")}
                    </FormField>
                    <FormField
                        label="ที่อยู่ (ภาษาอังกฤษ)"
                        htmlFor="cs_address_en"
                        hint={messages.addressEn}
                        error={fieldErrors.cs_address_en}
                    >
                        {textArea("cs_address_en")}
                    </FormField>
                    <FormField label="เบอร์โทร" htmlFor="cs_phone" error={fieldErrors.cs_phone}>
                        {textInput("cs_phone", { type: "tel", inputMode: "tel" })}
                    </FormField>
                    <FormField label="อีเมล" htmlFor="cs_email" error={fieldErrors.cs_email}>
                        {textInput("cs_email", { type: "email", inputMode: "email" })}
                    </FormField>
                    <FormField label="เว็บไซต์" htmlFor="cs_website" error={fieldErrors.cs_website}>
                        {textInput("cs_website", { inputMode: "url" })}
                    </FormField>
                </div>
            </SectionCard>

            <SaveErrorBanner error={saveError} />
            <UnsavedBar
                isDirty={isDirty}
                isSaving={isSaving}
                saveLabel="บันทึกข้อมูลบริษัท"
                onSave={() => handleSubmit()}
                onDiscard={() => setForm(toForm(company))}
            />
        </form>
    );
}
