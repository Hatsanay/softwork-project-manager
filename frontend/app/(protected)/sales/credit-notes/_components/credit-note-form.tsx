"use client";

// ฟอร์มสร้าง/แก้ร่างใบลดหนี้ (ขั้น N-1) — กรอกรายการที่ลด (ก่อน VAT) + เหตุผล · ยอดคำนวณด้วยสูตรเดียวกับ backend
// (shared/credit-note-totals.mjs) แสดงก่อนกดบันทึก: มูลค่าเดิม → ลด → มูลค่าที่ถูกต้อง · ลดเกินยอดค้าง = ต้องคืนเงิน
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileMinus2, Plus, Trash2 } from "lucide-react";
import FormField, { inputClass } from "@/components/ui/form-field";
import SectionCard from "@/components/ui/section-card";
import StatusBanner from "@/components/ui/guidance/status-banner";
import FieldHint from "@/components/ui/guidance/field-hint";
import SaveErrorBanner from "@/components/ui/save-error-banner";
import { buttonClass } from "@/components/ui/button";
import { apiFetch, type ApiError } from "@/lib/api";
import { toFieldErrors, type FieldErrors } from "@/lib/form-errors";
import { formatAmount, formatHundredths, parseHundredths } from "@/lib/shared/money.mjs";
import { calculateCreditNote } from "@/lib/shared/credit-note-totals.mjs";
import { CREDIT_NOTE_REASONS, creditNoteDraftSchema } from "@/lib/shared/schemas/credit-note.mjs";
import type { InvoiceDetail } from "../../invoices/_types";
import { CREDIT_NOTE_MESSAGES } from "../_messages";
import type { CreditNoteDetail, CreditNoteReasonCode } from "../_types";

type LineDraft = { key: number; description: string; amount: string };

type CreditNoteFormProps = {
    invoiceDetail: InvoiceDetail;
    // แก้ร่าง = ส่ง detail มา · สร้างใหม่ = ไม่ส่ง
    detail?: CreditNoteDetail;
};

// ยอดที่ผู้ใช้พิมพ์อาจยังไม่ใช่ตัวเลข — ใช้ 0 ในการแสดงตัวอย่าง (ตรวจจริงตอนบันทึก)
function hundredthsOrZero(text: string) {
    try {
        return parseHundredths(text === "" ? "0" : text, "ยอด");
    } catch {
        return 0n;
    }
}

export default function CreditNoteForm({ invoiceDetail, detail }: CreditNoteFormProps) {
    const router = useRouter();
    const { invoice, currency } = invoiceDetail;
    const creditNote = detail?.credit_note;
    const decimals = currency.cur_decimals;
    const code = currency.cur_code;

    const [reasonCode, setReasonCode] = useState<CreditNoteReasonCode>(creditNote?.cn_reason_code ?? "price_reduction");
    const [reason, setReason] = useState(creditNote?.cn_reason ?? "");
    const [notes, setNotes] = useState(creditNote?.cn_notes ?? "");
    const [internalNote, setInternalNote] = useState(creditNote?.cn_internal_note ?? "");
    const [lines, setLines] = useState<LineDraft[]>(
        detail?.lines.map((line, index) => ({
            key: index,
            description: line.cnl_description,
            amount: line.cnl_amount,
        })) ?? [{ key: 0, description: "", amount: "" }],
    );
    const [nextKey, setNextKey] = useState(lines.length);
    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
    const [saveError, setSaveError] = useState<ApiError | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const remainingBase =
        parseHundredths(invoice.inv_after_discount, "ยอดก่อน VAT") -
        parseHundredths(invoice.inv_credited_base, "ลดแล้ว");

    const preview = useMemo(
        () =>
            calculateCreditNote({
                invoice: {
                    afterDiscount: parseHundredths(invoice.inv_after_discount, "ยอดก่อน VAT"),
                    vat: parseHundredths(invoice.inv_vat_amount, "VAT"),
                    total: parseHundredths(invoice.inv_total, "ยอดรวม"),
                    afterDiscountThb: parseHundredths(invoice.inv_after_discount_thb, "ยอดก่อน VAT บาท"),
                    totalThb: parseHundredths(invoice.inv_total_thb, "ยอดบาท"),
                    withholding: parseHundredths(invoice.inv_wht_amount, "หัก ณ ที่จ่าย"),
                    vatRate: invoice.inv_vat_rate,
                },
                credited: {
                    base: parseHundredths(invoice.inv_credited_base, "ลดแล้ว"),
                    vat: parseHundredths(invoice.inv_credited_vat, "ลดแล้ว"),
                    total: parseHundredths(invoice.inv_credited_amount, "ลดแล้ว"),
                    baseThb: parseHundredths(invoice.inv_credited_base_thb, "ลดแล้ว"),
                    totalThb: parseHundredths(invoice.inv_credited_thb, "ลดแล้ว"),
                    withholding: parseHundredths(invoice.inv_credited_wht, "ลดแล้ว"),
                },
                paid: parseHundredths(invoice.inv_paid_amount, "รับแล้ว"),
                refunded: parseHundredths(invoice.inv_refunded_amount, "คืนแล้ว"),
                lineAmounts: lines.map((line) => hundredthsOrZero(line.amount)),
                currencyDecimals: decimals,
            }),
        [invoice, lines, decimals],
    );
    const hasVat = Number(invoice.inv_vat_rate) > 0;

    function updateLine(key: number, patch: Partial<LineDraft>) {
        setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
    }

    function creditWholeInvoice() {
        setLines([
            {
                key: nextKey,
                description: `ลดหนี้ทั้งใบตาม ${invoice.inv_number}`,
                amount: formatHundredths(remainingBase),
            },
        ]);
        setNextKey(nextKey + 1);
    }

    async function handleSave(event: React.FormEvent) {
        event.preventDefault();
        setSaveError(null);
        const checked = creditNoteDraftSchema.safeParse({
            cn_invoice_id: creditNote ? undefined : invoice.inv_id,
            cn_reason_code: reasonCode,
            cn_reason: reason,
            cn_notes: notes,
            cn_internal_note: internalNote,
            lines: lines.map((line) => ({ cnl_description: line.description, cnl_amount: line.amount })),
            cn_version: creditNote?.cn_version,
        });
        if (!checked.success) {
            setFieldErrors(toFieldErrors(checked.error.issues));
            toast.error("ยังบันทึกไม่ได้ · แก้ช่องที่มีข้อความสีแดงก่อน");
            return;
        }
        if (Object.keys(preview.errors).length > 0) {
            setFieldErrors(preview.errors);
            toast.error("ยังบันทึกไม่ได้ · แก้ช่องที่มีข้อความสีแดงก่อน");
            return;
        }
        setFieldErrors({});
        setIsSaving(true);
        const { data, error } = await apiFetch<{ cn_id: string }>(
            creditNote ? `/credit-notes/${creditNote.cn_id}` : "/credit-notes",
            { method: creditNote ? "PUT" : "POST", body: checked.data },
        );
        setIsSaving(false);
        if (error) {
            setFieldErrors(error.fields);
            setSaveError(error);
            return;
        }
        toast.success(creditNote ? "บันทึกร่างแล้ว" : "สร้างร่างใบลดหนี้แล้ว · ตรวจแล้วกดส่งขออนุมัติ");
        router.push(`/sales/credit-notes/view?id=${data.cn_id}`);
    }

    return (
        <form onSubmit={handleSave} noValidate className="grid grid-cols-1 gap-5">
            <StatusBanner
                tone="info"
                title={`ลดหนี้ ${invoice.inv_number} · ${invoice.client_company || invoice.client_name}`}
            >
                {CREDIT_NOTE_MESSAGES.formIntro(invoice.inv_number ?? "")}
            </StatusBanner>

            <SectionCard icon={FileMinus2} title="รายการที่ลด" description={CREDIT_NOTE_MESSAGES.lines}>
                <div className="grid gap-3">
                    {lines.map((line, index) => (
                        // มือถือ: รายละเอียดเต็มแถว แล้วยอด + ปุ่มลบในแถวถัดไป
                        <div
                            key={line.key}
                            className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 sm:grid-cols-[minmax(0,1fr)_8.5rem_auto]"
                        >
                            <FormField
                                label={`รายการที่ ${index + 1}`}
                                htmlFor={`cnl_description_${line.key}`}
                                error={fieldErrors[`lines.${index}.cnl_description`]}
                                className="col-span-2 sm:col-span-1"
                            >
                                <input
                                    id={`cnl_description_${line.key}`}
                                    value={line.description}
                                    maxLength={500}
                                    onChange={(event) => updateLine(line.key, { description: event.target.value })}
                                    className={inputClass(Boolean(fieldErrors[`lines.${index}.cnl_description`]))}
                                />
                            </FormField>
                            <FormField
                                label={hasVat ? "ลด (ก่อน VAT)" : "ยอดที่ลด"}
                                htmlFor={`cnl_amount_${line.key}`}
                                error={fieldErrors[`lines.${index}.cnl_amount`]}
                            >
                                <input
                                    id={`cnl_amount_${line.key}`}
                                    inputMode="decimal"
                                    value={line.amount}
                                    onChange={(event) => updateLine(line.key, { amount: event.target.value })}
                                    className={`${inputClass(Boolean(fieldErrors[`lines.${index}.cnl_amount`]))} text-right tabular-nums`}
                                />
                            </FormField>
                            <button
                                type="button"
                                aria-label={`ลบรายการที่ ${index + 1}`}
                                disabled={lines.length === 1}
                                className={`${buttonClass("ghost", "md")} mt-7`}
                                onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    ))}
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            className={buttonClass("secondary", "md")}
                            onClick={() => {
                                setLines((current) => [...current, { key: nextKey, description: "", amount: "" }]);
                                setNextKey(nextKey + 1);
                            }}
                        >
                            <Plus size={16} />
                            เพิ่มรายการ
                        </button>
                        <button type="button" className={buttonClass("ghost", "md")} onClick={creditWholeInvoice}>
                            ลดทั้งใบ ({formatAmount(remainingBase, decimals)})
                        </button>
                    </div>
                    <FieldHint error={fieldErrors.lines}>
                        ลดได้สูงสุด {formatAmount(remainingBase, decimals)} {code}
                        {hasVat ? " (ก่อน VAT)" : ""} · ยอดใบ {formatAmount(invoice.inv_after_discount, decimals)} −
                        ลดหนี้แล้ว {formatAmount(invoice.inv_credited_base, decimals)}
                    </FieldHint>

                    {/* อ่านบนลงล่างเป็นการคำนวณ (กติกาเงิน 3.8): มูลค่าเดิม − ลด = ที่ถูกต้อง */}
                    <div className="ml-auto grid w-full max-w-sm gap-1.5 rounded-xl bg-gray-50 p-3 text-sm">
                        <PreviewRow label="มูลค่าตามใบเดิม" value={formatAmount(preview.originalTotal, decimals)} />
                        {hasVat && (
                            <>
                                <PreviewRow label="ลด (ก่อน VAT)" value={`−${formatAmount(preview.base, decimals)}`} />
                                <PreviewRow
                                    label={`VAT ${invoice.inv_vat_rate}% ของส่วนที่ลด`}
                                    value={`−${formatAmount(preview.vat, decimals)}`}
                                />
                            </>
                        )}
                        <div className="flex justify-between gap-3 font-medium text-gray-900">
                            <span>รวมลดหนี้</span>
                            <span className="tabular-nums">
                                {preview.total > 0n ? "−" : ""}
                                {formatAmount(preview.total, decimals)} {code}
                            </span>
                        </div>
                        <div className="flex justify-between gap-3 border-t border-gray-200 pt-1.5 font-medium text-gray-900">
                            <span>มูลค่าที่ถูกต้อง</span>
                            <span className="tabular-nums">
                                {formatAmount(preview.correctTotal, decimals)} {code}
                            </span>
                        </div>
                    </div>
                    {preview.refundRequired > 0n && (
                        <StatusBanner tone="warn" title="ลดหนี้นี้ทำให้บริษัทต้องคืนเงินลูกค้า">
                            ยอดค้างก่อนลด {formatAmount(preview.outstandingBefore, decimals)} · ลด{" "}
                            {formatAmount(preview.total, decimals)} → ลูกค้าจ่ายเกิน{" "}
                            {formatAmount(preview.refundRequired, decimals)} {code} (ในนี้เป็นหัก ณ ที่จ่ายประมาณ{" "}
                            {formatAmount(preview.suggestedRefundWithholding, decimals)}) ·
                            บันทึกการคืนเงินที่หน้าใบลดหนี้หลังอนุมัติ
                        </StatusBanner>
                    )}
                </div>
            </SectionCard>

            <SectionCard icon={FileMinus2} title="เหตุผลและหมายเหตุ" description={CREDIT_NOTE_MESSAGES.approval}>
                <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                        label="ประเภทเหตุผล"
                        htmlFor="cn_reason_code"
                        required
                        error={fieldErrors.cn_reason_code}
                    >
                        <select
                            id="cn_reason_code"
                            value={reasonCode}
                            onChange={(event) => setReasonCode(event.target.value as CreditNoteReasonCode)}
                            className={inputClass(Boolean(fieldErrors.cn_reason_code))}
                        >
                            {Object.entries(CREDIT_NOTE_REASONS).map(([value, label]) => (
                                <option key={value} value={value}>
                                    {label}
                                </option>
                            ))}
                        </select>
                    </FormField>
                    <FormField
                        label="รายละเอียดเหตุผล"
                        htmlFor="cn_reason"
                        required
                        hint={CREDIT_NOTE_MESSAGES.reason}
                        error={fieldErrors.cn_reason}
                        className="sm:col-span-2"
                    >
                        <input
                            id="cn_reason"
                            value={reason}
                            maxLength={500}
                            onChange={(event) => setReason(event.target.value)}
                            className={inputClass(Boolean(fieldErrors.cn_reason))}
                        />
                    </FormField>
                    <FormField
                        label="หมายเหตุบนเอกสาร"
                        htmlFor="cn_notes"
                        hint={CREDIT_NOTE_MESSAGES.notes}
                        error={fieldErrors.cn_notes}
                        className="sm:col-span-2"
                    >
                        <textarea
                            id="cn_notes"
                            rows={2}
                            value={notes}
                            onChange={(event) => setNotes(event.target.value)}
                            className={inputClass(Boolean(fieldErrors.cn_notes))}
                        />
                    </FormField>
                    <FormField
                        label="บันทึกภายใน"
                        htmlFor="cn_internal_note"
                        hint={CREDIT_NOTE_MESSAGES.internalNote}
                        error={fieldErrors.cn_internal_note}
                        className="sm:col-span-2"
                    >
                        <textarea
                            id="cn_internal_note"
                            rows={2}
                            value={internalNote}
                            onChange={(event) => setInternalNote(event.target.value)}
                            className={inputClass(Boolean(fieldErrors.cn_internal_note))}
                        />
                    </FormField>
                </div>
            </SectionCard>

            <SaveErrorBanner error={saveError} />
            <div className="sticky bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-10 flex items-center justify-end gap-3 rounded-2xl border border-gray-200 bg-white/95 p-3 shadow-float backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none sm:backdrop-blur-none">
                <div className="mr-auto grid min-w-0">
                    <span className="text-xs text-gray-500">รวมลดหนี้</span>
                    <span className="truncate font-medium text-gray-900 tabular-nums">
                        {formatAmount(preview.total, decimals)} {code}
                    </span>
                </div>
                <button
                    type="button"
                    className={`${buttonClass("secondary", "md")} max-sm:hidden`}
                    onClick={() =>
                        router.push(
                            creditNote
                                ? `/sales/credit-notes/view?id=${creditNote.cn_id}`
                                : `/sales/invoices/view?id=${invoice.inv_id}`,
                        )
                    }
                >
                    ยกเลิก
                </button>
                <button type="submit" className={buttonClass("primary", "md")} disabled={isSaving}>
                    {isSaving ? "กำลังบันทึก..." : creditNote ? "บันทึกร่าง" : "สร้างร่างใบลดหนี้"}
                </button>
            </div>
        </form>
    );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between gap-3 text-gray-600">
            <span>{label}</span>
            <span className="tabular-nums">{value}</span>
        </div>
    );
}
