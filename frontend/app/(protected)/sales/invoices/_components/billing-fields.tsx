"use client";

// ช่องที่ใบแจ้งหนี้ทั้งสองแบบแก้ได้: เครดิตเทอม · หัก ณ ที่จ่าย · บัญชีรับเงิน · หมายเหตุ · บันทึกภายใน
// (ใบจากงวดใบเสนอราคาแก้ได้แค่ส่วนนี้ + ชื่อเรื่อง/สาขา — ยอดล็อกตามใบเสนอราคา)
import { Landmark, NotebookPen } from "lucide-react";
import FormField, { inputClass } from "@/components/ui/form-field";
import FieldHint from "@/components/ui/guidance/field-hint";
import SectionCard from "@/components/ui/section-card";
import type { FieldErrors } from "@/lib/form-errors";
import { INVOICE_MESSAGES } from "../_messages";
import { bankAccountsFor, type InvoiceOptions } from "../_hooks/use-invoice-options";

export type BillingValues = {
    inv_credit_days: string;
    inv_wht_rate: string;
    inv_bank_account_id: string | null;
    inv_notes: string;
    inv_internal_note: string;
};

type BillingFieldsProps = {
    values: BillingValues;
    currencyCode: string;
    options: InvoiceOptions;
    errors: FieldErrors;
    // ยอดหักโดยประมาณ (แสดงใต้ช่องอัตรา) — ว่าง = ไม่แสดง
    withholdingPreview: string | null;
    onChange: (changes: Partial<BillingValues>) => void;
};

export default function BillingFields({
    values,
    currencyCode,
    options,
    errors,
    withholdingPreview,
    onChange,
}: BillingFieldsProps) {
    const accounts = bankAccountsFor(options, currencyCode, values.inv_bank_account_id);
    const creditDays = Number(values.inv_credit_days);

    return (
        <>
            <SectionCard
                icon={Landmark}
                title="การเรียกเก็บเงิน"
                description={INVOICE_MESSAGES.dates(Number.isInteger(creditDays) ? creditDays : 0)}
            >
                <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                        label="เครดิตเทอม (วัน)"
                        htmlFor="inv_credit_days"
                        required
                        hint={INVOICE_MESSAGES.creditDays}
                        error={errors.inv_credit_days}
                    >
                        <input
                            id="inv_credit_days"
                            inputMode="numeric"
                            value={values.inv_credit_days}
                            onChange={(event) => onChange({ inv_credit_days: event.target.value })}
                            className={inputClass(Boolean(errors.inv_credit_days))}
                        />
                    </FormField>
                    <FormField
                        label="หัก ณ ที่จ่ายที่แสดงบนใบ (%)"
                        htmlFor="inv_wht_rate"
                        hint={INVOICE_MESSAGES.withholding}
                        error={errors.inv_wht_rate}
                    >
                        <input
                            id="inv_wht_rate"
                            inputMode="decimal"
                            placeholder="ไม่แสดง"
                            value={values.inv_wht_rate}
                            onChange={(event) => onChange({ inv_wht_rate: event.target.value })}
                            className={inputClass(Boolean(errors.inv_wht_rate))}
                        />
                        {withholdingPreview && <p className="text-xs text-gray-600">{withholdingPreview}</p>}
                    </FormField>
                    <FormField
                        label="บัญชีรับเงินที่พิมพ์บนใบ"
                        htmlFor="inv_bank_account_id"
                        error={errors.inv_bank_account_id}
                        className="sm:col-span-2"
                        hint={INVOICE_MESSAGES.bankAccount}
                    >
                        {accounts.length > 0 ? (
                            <select
                                id="inv_bank_account_id"
                                value={values.inv_bank_account_id ?? ""}
                                onChange={(event) => onChange({ inv_bank_account_id: event.target.value || null })}
                                className={inputClass(Boolean(errors.inv_bank_account_id))}
                            >
                                <option value="">ไม่พิมพ์บัญชี</option>
                                {accounts.map((account) => (
                                    <option key={account.ba_id} value={account.ba_id}>
                                        {account.ba_bank_name} · {account.ba_account_no}
                                        {account.ba_is_default ? " (บัญชีหลัก)" : ""}
                                    </option>
                                ))}
                            </select>
                        ) : (
                            <FieldHint>{INVOICE_MESSAGES.noBankAccount}</FieldHint>
                        )}
                    </FormField>
                </div>
            </SectionCard>

            <SectionCard icon={NotebookPen} title="หมายเหตุและบันทึกภายใน">
                <div className="grid gap-4">
                    <FormField
                        label="หมายเหตุ (พิมพ์บนเอกสาร)"
                        htmlFor="inv_notes"
                        error={errors.inv_notes}
                        hint={INVOICE_MESSAGES.notes}
                    >
                        <textarea
                            id="inv_notes"
                            rows={3}
                            value={values.inv_notes}
                            onChange={(event) => onChange({ inv_notes: event.target.value })}
                            className={inputClass(Boolean(errors.inv_notes))}
                        />
                    </FormField>
                    <FormField
                        label="บันทึกภายใน"
                        htmlFor="inv_internal_note"
                        error={errors.inv_internal_note}
                        hint={INVOICE_MESSAGES.internalNote}
                    >
                        <textarea
                            id="inv_internal_note"
                            rows={2}
                            value={values.inv_internal_note}
                            onChange={(event) => onChange({ inv_internal_note: event.target.value })}
                            className={inputClass()}
                        />
                    </FormField>
                </div>
            </SectionCard>
        </>
    );
}

function textOrNull(value: string) {
    return value.trim() === "" ? null : value.trim();
}

/** ฟอร์ม → ส่วนของ body ที่ทั้งสองแบบใช้ร่วมกัน (เครดิตว่าง → NaN ให้ชุดตรวจบอก "ต้องเป็นตัวเลข") */
export function billingPayload(values: BillingValues) {
    return {
        inv_credit_days: values.inv_credit_days.trim() === "" ? Number.NaN : Number(values.inv_credit_days),
        inv_wht_rate: textOrNull(values.inv_wht_rate),
        inv_bank_account_id: values.inv_bank_account_id,
        inv_notes: textOrNull(values.inv_notes),
        inv_internal_note: textOrNull(values.inv_internal_note),
    };
}
