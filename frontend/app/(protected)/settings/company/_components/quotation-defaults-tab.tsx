"use client";

// แท็บค่าเริ่มต้นเอกสารขาย: ใบเสนอราคา (อายุยืนราคา เงื่อนไขท้ายเอกสาร) · ใบแจ้งหนี้ (เครดิตเทอม พร้อมเพย์ หมายเหตุ)
// และการอนุมัติใบของตัวเอง
import { useState } from "react";
import { FileText, ReceiptText, ShieldCheck } from "lucide-react";
import FormField, { inputClass } from "@/components/ui/form-field";
import FieldHint from "@/components/ui/guidance/field-hint";
import Switch from "@/components/ui/switch";
import UnsavedBar from "@/components/ui/unsaved-bar";
import { normalizePromptPayId } from "@/lib/shared/promptpay.mjs";
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

const PROMPTPAY_KIND_NAMES = { phone: "เบอร์มือถือ", taxId: "เลขประจำตัว 13 หลัก", eWallet: "e-Wallet" } as const;

function toForm(company: Company) {
    return {
        validDays: String(company.cs_quotation_valid_days),
        termsTh: company.cs_quotation_terms_th ?? "",
        termsEn: company.cs_quotation_terms_en ?? "",
        allowSelfApproval: company.cs_allow_self_approval,
        creditDays: String(company.cs_default_credit_days),
        promptPayId: company.cs_promptpay_id ?? "",
        invoiceNotesTh: company.cs_invoice_notes_th ?? "",
        invoiceNotesEn: company.cs_invoice_notes_en ?? "",
    };
}

type DefaultsForm = ReturnType<typeof toForm>;

// ช่องว่าง/ไม่ใช่ตัวเลข ส่ง NaN ให้ชุดตรวจบอกว่า "ต้องเป็นตัวเลข" แทนการแปลงเป็น 0 เงียบๆ
function toWholeNumber(text: string): number {
    return text.trim() === "" ? Number.NaN : Number(text);
}

export default function QuotationDefaultsTab({ company, canEdit, onSaved }: QuotationDefaultsTabProps) {
    const messages = COMPANY_MESSAGES.quotation;
    const invoiceMessages = COMPANY_MESSAGES.invoice;
    const [form, setForm] = useState<DefaultsForm>(() => toForm(company));
    const { save, fieldErrors, saveError, isSaving } = useSaveCompany(company, onSaved);

    const isDirty = canEdit && JSON.stringify(form) !== JSON.stringify(toForm(company));
    const promptPayAccount = form.promptPayId.trim() === "" ? null : normalizePromptPayId(form.promptPayId);

    function updateField<Field extends keyof DefaultsForm>(field: Field, value: DefaultsForm[Field]) {
        setForm((current) => ({ ...current, [field]: value }));
    }

    async function handleSubmit(event?: React.FormEvent) {
        event?.preventDefault();
        await save({
            cs_quotation_valid_days: toWholeNumber(form.validDays),
            cs_quotation_terms_th: form.termsTh,
            cs_quotation_terms_en: form.termsEn,
            cs_allow_self_approval: form.allowSelfApproval,
            cs_default_credit_days: toWholeNumber(form.creditDays),
            cs_promptpay_id: form.promptPayId,
            cs_invoice_notes_th: form.invoiceNotesTh,
            cs_invoice_notes_en: form.invoiceNotesEn,
        });
    }

    return (
        <form onSubmit={handleSubmit} className="grid gap-5" noValidate>
            <SectionCard
                icon={FileText}
                title="ใบเสนอราคา"
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

            <SectionCard icon={ReceiptText} title="ใบแจ้งหนี้" description={invoiceMessages.sectionDescription}>
                <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                        label="เครดิตเทอมเริ่มต้น (วัน)"
                        htmlFor="cs_default_credit_days"
                        required
                        hint={invoiceMessages.creditDays}
                        error={fieldErrors.cs_default_credit_days}
                    >
                        <input
                            id="cs_default_credit_days"
                            inputMode="numeric"
                            value={form.creditDays}
                            onChange={(event) => updateField("creditDays", event.target.value)}
                            disabled={!canEdit}
                            className={inputClass(Boolean(fieldErrors.cs_default_credit_days))}
                        />
                    </FormField>
                    <FormField
                        label="เลขพร้อมเพย์รับเงิน"
                        htmlFor="cs_promptpay_id"
                        hint={invoiceMessages.promptPay}
                        error={fieldErrors.cs_promptpay_id}
                    >
                        <input
                            id="cs_promptpay_id"
                            inputMode="numeric"
                            value={form.promptPayId}
                            placeholder="เช่น 0812345678"
                            onChange={(event) => updateField("promptPayId", event.target.value)}
                            disabled={!canEdit}
                            className={inputClass(Boolean(fieldErrors.cs_promptpay_id))}
                        />
                        {promptPayAccount && (
                            <p className="text-xs text-green-600">
                                {invoiceMessages.promptPayKind(PROMPTPAY_KIND_NAMES[promptPayAccount.kind])}
                            </p>
                        )}
                    </FormField>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                        label="หมายเหตุท้ายใบแจ้งหนี้ (ภาษาไทย)"
                        htmlFor="cs_invoice_notes_th"
                        hint={invoiceMessages.notesTh}
                        error={fieldErrors.cs_invoice_notes_th}
                    >
                        <textarea
                            id="cs_invoice_notes_th"
                            rows={4}
                            value={form.invoiceNotesTh}
                            onChange={(event) => updateField("invoiceNotesTh", event.target.value)}
                            disabled={!canEdit}
                            className={inputClass(Boolean(fieldErrors.cs_invoice_notes_th))}
                        />
                    </FormField>
                    <FormField
                        label="หมายเหตุท้ายใบแจ้งหนี้ (ภาษาอังกฤษ)"
                        htmlFor="cs_invoice_notes_en"
                        hint={invoiceMessages.notesEn}
                        error={fieldErrors.cs_invoice_notes_en}
                    >
                        <textarea
                            id="cs_invoice_notes_en"
                            rows={4}
                            value={form.invoiceNotesEn}
                            onChange={(event) => updateField("invoiceNotesEn", event.target.value)}
                            disabled={!canEdit}
                            className={inputClass(Boolean(fieldErrors.cs_invoice_notes_en))}
                        />
                    </FormField>
                </div>
            </SectionCard>

            <SectionCard icon={ShieldCheck} title="การอนุมัติเอกสารของตัวเอง">
                <Switch
                    id="cs_allow_self_approval"
                    label="อนุญาตให้ผู้สร้างอนุมัติเอกสารของตัวเอง (ใบเสนอราคา และใบแจ้งหนี้ที่สร้างเอง)"
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
