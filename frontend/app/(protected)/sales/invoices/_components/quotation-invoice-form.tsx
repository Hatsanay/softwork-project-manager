"use client";

// แก้ร่างใบแจ้งหนี้ที่ออกจากงวดของใบเสนอราคา — ยอด/รายการ/ลูกค้า/สกุลเงินล็อกตามใบเสนอราคา แก้ได้แค่ข้อมูลประกอบ
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText } from "lucide-react";
import FormField, { inputClass } from "@/components/ui/form-field";
import SectionCard from "@/components/ui/section-card";
import SaveErrorBanner from "@/components/ui/save-error-banner";
import { buttonClass } from "@/components/ui/button";
import { apiFetch, type ApiError } from "@/lib/api";
import { toFieldErrors, type FieldErrors } from "@/lib/form-errors";
import { formatAmount, parseHundredths } from "@/lib/shared/money.mjs";
import { calculateWithholding } from "@/lib/shared/invoice-totals.mjs";
import { invoiceQuotationDraftSchema } from "@/lib/shared/schemas/invoice.mjs";
import { INVOICE_MESSAGES } from "../_messages";
import type { InvoiceDetail } from "../_types";
import type { InvoiceOptions } from "../_hooks/use-invoice-options";
import BillingFields, { billingPayload, type BillingValues } from "./billing-fields";

type QuotationInvoiceFormProps = {
    options: InvoiceOptions;
    detail: InvoiceDetail;
};

export default function QuotationInvoiceForm({ options, detail }: QuotationInvoiceFormProps) {
    const router = useRouter();
    const { invoice, currency } = detail;
    const decimals = currency.cur_decimals;
    const [title, setTitle] = useState(invoice.inv_title);
    const [branchId, setBranchId] = useState(invoice.inv_branch_id);
    const [billing, setBilling] = useState<BillingValues>({
        inv_credit_days: String(invoice.inv_credit_days),
        inv_wht_rate: invoice.inv_wht_rate ?? "",
        inv_bank_account_id: invoice.inv_bank_account_id,
        inv_notes: invoice.inv_notes ?? "",
        inv_internal_note: invoice.inv_internal_note ?? "",
    });
    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
    const [saveError, setSaveError] = useState<ApiError | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    let withholdingPreview: string | null = null;
    try {
        const withholding = calculateWithholding(
            parseHundredths(invoice.inv_after_discount, "ยอดก่อน VAT"),
            billing.inv_wht_rate.trim() || null,
            decimals,
        );
        if (withholding > 0n) {
            const net = parseHundredths(invoice.inv_total, "ยอดรวม") - withholding;
            withholdingPreview = `หักประมาณ ${formatAmount(withholding, decimals)} · ลูกค้าโอน ${formatAmount(net, decimals)} ${invoice.inv_currency}`;
        }
    } catch {
        withholdingPreview = null;
    }

    async function handleSave(event: React.FormEvent) {
        event.preventDefault();
        setSaveError(null);
        const checked = invoiceQuotationDraftSchema.safeParse({
            inv_title: title,
            inv_branch_id: branchId,
            inv_version: invoice.inv_version,
            ...billingPayload(billing),
        });
        if (!checked.success) {
            setFieldErrors(toFieldErrors(checked.error.issues));
            toast.error("ยังบันทึกไม่ได้ · แก้ช่องที่มีข้อความสีแดงก่อน");
            return;
        }
        setFieldErrors({});
        setIsSaving(true);
        const { error } = await apiFetch(`/invoices/${invoice.inv_id}`, { method: "PUT", body: checked.data });
        setIsSaving(false);
        if (error) {
            setFieldErrors(error.fields);
            setSaveError(error);
            return;
        }
        toast.success("บันทึกร่างแล้ว");
        router.push(`/sales/invoices/view?id=${invoice.inv_id}`);
    }

    return (
        <form onSubmit={handleSave} noValidate className="grid grid-cols-1 gap-5">
            <SectionCard
                icon={FileText}
                title="เอกสาร"
                description={INVOICE_MESSAGES.lockedAmount(invoice.qt_number ?? "")}
            >
                <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                        label="ชื่อเรื่อง"
                        htmlFor="inv_title"
                        required
                        error={fieldErrors.inv_title}
                        className="sm:col-span-2"
                    >
                        <input
                            id="inv_title"
                            value={title}
                            onChange={(event) => setTitle(event.target.value)}
                            className={inputClass(Boolean(fieldErrors.inv_title))}
                        />
                    </FormField>
                    <FormField
                        label="สาขาที่ออกเอกสาร"
                        htmlFor="inv_branch_id"
                        required
                        error={fieldErrors.inv_branch_id}
                    >
                        <select
                            id="inv_branch_id"
                            value={branchId}
                            onChange={(event) => setBranchId(event.target.value)}
                            className={inputClass(Boolean(fieldErrors.inv_branch_id))}
                        >
                            {options.branches
                                .filter((branch) => branch.branch_status === "active" || branch.branch_id === branchId)
                                .map((branch) => (
                                    <option key={branch.branch_id} value={branch.branch_id}>
                                        {branch.branch_code} · {branch.branch_name_th}
                                    </option>
                                ))}
                        </select>
                    </FormField>
                    <div className="grid content-start gap-1 rounded-xl bg-gray-50 p-3 text-sm">
                        <span className="text-xs text-gray-500">ยอดรวมทั้งสิ้น (ล็อกตามใบเสนอราคา)</span>
                        <span className="font-medium text-gray-900 tabular-nums">
                            {formatAmount(invoice.inv_total, decimals)} {invoice.inv_currency}
                        </span>
                    </div>
                </div>
            </SectionCard>

            <BillingFields
                values={billing}
                currencyCode={invoice.inv_currency}
                options={options}
                errors={fieldErrors}
                withholdingPreview={withholdingPreview}
                onChange={(changes) => setBilling((current) => ({ ...current, ...changes }))}
            />

            <SaveErrorBanner error={saveError} />
            <div className="flex flex-wrap justify-end gap-3">
                <button
                    type="button"
                    className={buttonClass("secondary", "md")}
                    onClick={() => router.push(`/sales/invoices/view?id=${invoice.inv_id}`)}
                >
                    ยกเลิก
                </button>
                <button type="submit" className={buttonClass("primary", "md")} disabled={isSaving}>
                    {isSaving ? "กำลังบันทึก..." : "บันทึกร่าง"}
                </button>
            </div>
        </form>
    );
}
