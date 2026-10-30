"use client";

// บันทึกรับเงิน = ออกใบเสร็จทันที (C1) — ลูกค้า → (สกุลเงิน) → ติ๊กใบแจ้งหนี้ + ยอดรับต่อใบ → วิธีรับ/วันที่ → หัก ณ ที่จ่าย/ค่าธรรมเนียม
// คำนวณ "เงินเข้าจริง" ด้วยสูตรเดียวกับ backend (shared/receipt-totals.mjs) ให้เทียบกับสเตทเมนต์ก่อนกดยืนยัน
// backend ตรวจซ้ำทุกข้อหลังล็อกใบแจ้งหนี้ (ยอดค้างอาจเปลี่ยนระหว่างกรอก — มีคนรับเงินใบเดียวกันไปก่อน)
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Banknote, Check, FileText, Receipt, Users } from "lucide-react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import FormField, { inputClass } from "@/components/ui/form-field";
import SectionCard from "@/components/ui/section-card";
import Segmented from "@/components/ui/segmented";
import StatusBanner from "@/components/ui/guidance/status-banner";
import FieldHint from "@/components/ui/guidance/field-hint";
import SaveErrorBanner from "@/components/ui/save-error-banner";
import StatusPill from "@/components/ui/status-pill";
import { PageSkeleton } from "@/components/ui/skeleton";
import { buttonClass } from "@/components/ui/button";
import { formatDateOnly } from "@/app/function";
import { apiFetch, type ApiError } from "@/lib/api";
import { toFieldErrors, type FieldErrors } from "@/lib/form-errors";
import { formatAmount, formatHundredths, parseHundredths } from "@/lib/shared/money.mjs";
import { calculateReceipt, suggestWithholding } from "@/lib/shared/receipt-totals.mjs";
import { MAX_RECEIPT_BACKDATE_DAYS, receiptCreateSchema } from "@/lib/shared/schemas/receipt.mjs";
import type { InvoiceOptions } from "../../invoices/_hooks/use-invoice-options";
import { METHOD_LABELS, RECEIPT_MESSAGES } from "../_messages";
import type { ReceiptMethod, ReceivableInvoice, ReceivableInvoices } from "../_types";

type ReceiptFormProps = {
    options: InvoiceOptions;
    // เปิดจากหน้าใบแจ้งหนี้ / ใบวางบิล / ลูกค้า — เติมให้ล่วงหน้า
    initialInvoiceId?: string | null;
    billingNoteId?: string | null;
    initialClientId?: string | null;
};

type ClientOption = { clientId: string; name: string; currencies: string[]; invoiceCount: number };

const METHOD_OPTIONS: { value: ReceiptMethod; label: string }[] = (
    ["transfer", "cheque", "cash", "other"] as const
).map((value) => ({ value, label: METHOD_LABELS[value] }));

// ข้อความตัวเลขที่ผู้ใช้กรอก → ร้อยส่วน (กรอกผิด = null)
function toHundredths(text: string): bigint | null {
    if (!text.trim()) return 0n;
    try {
        return parseHundredths(text, "ยอด");
    } catch {
        return null;
    }
}

export default function ReceiptForm({ options, initialInvoiceId, billingNoteId, initialClientId }: ReceiptFormProps) {
    const router = useRouter();
    const [receivable, setReceivable] = useState<ReceivableInvoices | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);

    const [clientId, setClientId] = useState("");
    const [currencyCode, setCurrencyCode] = useState("");
    // ใบที่ติ๊ก → ยอดรับ (ข้อความที่กรอก) — ลำดับ key = ลำดับที่แสดง
    const [amounts, setAmounts] = useState<Record<string, string>>({});
    const [receiptDate, setReceiptDate] = useState("");
    const [method, setMethod] = useState<ReceiptMethod>("transfer");
    const [bankAccountId, setBankAccountId] = useState("");
    const [reference, setReference] = useState("");
    const [chequeNo, setChequeNo] = useState("");
    const [chequeBank, setChequeBank] = useState("");
    const [chequeDate, setChequeDate] = useState("");
    const [whtText, setWhtText] = useState("0.00");
    const [isWhtEdited, setIsWhtEdited] = useState(false);
    const [feeText, setFeeText] = useState("0");
    const [receivedThbText, setReceivedThbText] = useState("");
    const [certificateNo, setCertificateNo] = useState("");
    const [certificateDate, setCertificateDate] = useState("");
    const [branchId, setBranchId] = useState("");
    const [language, setLanguage] = useState<"th" | "en">("th");
    const [notes, setNotes] = useState("");
    const [internalNote, setInternalNote] = useState("");

    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
    const [saveError, setSaveError] = useState<ApiError | null>(null);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        let isLeftPage = false;
        const query = billingNoteId ? `?billing_note_id=${encodeURIComponent(billingNoteId)}` : "";
        apiFetch<ReceivableInvoices>(`/receipts/receivable-invoices${query}`).then(({ data, error }) => {
            if (isLeftPage) return;
            setReceivable(data);
            setLoadError(error);
            if (!data) return;
            setReceiptDate(data.today);
            // เติมล่วงหน้า: ใบวางบิล = ทุกใบที่ยังค้าง · ใบแจ้งหนี้ = ใบนั้น · ลูกค้า = เลือกลูกค้าไว้ให้
            let preset: ReceivableInvoice[] = [];
            if (billingNoteId) preset = data.data;
            else if (initialInvoiceId) preset = data.data.filter((invoice) => invoice.inv_id === initialInvoiceId);
            const first = preset[0] ?? data.data.find((invoice) => invoice.inv_client_id === initialClientId);
            if (!first) return;
            applyClient(data.data, first.inv_client_id, first.inv_currency, preset);
        });
        return () => {
            isLeftPage = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- โหลดครั้งเดียวตามลิงก์ที่เปิดหน้า
    }, [billingNoteId, initialInvoiceId, initialClientId]);

    const clients = useMemo<ClientOption[]>(() => {
        const byClient = new Map<string, ClientOption>();
        for (const invoice of receivable?.data ?? []) {
            const client = byClient.get(invoice.inv_client_id) ?? {
                clientId: invoice.inv_client_id,
                name: invoice.client_company || invoice.client_name,
                currencies: [],
                invoiceCount: 0,
            };
            if (!client.currencies.includes(invoice.inv_currency)) client.currencies.push(invoice.inv_currency);
            client.invoiceCount += 1;
            byClient.set(invoice.inv_client_id, client);
        }
        return [...byClient.values()].sort((left, right) => left.name.localeCompare(right.name, "th"));
    }, [receivable]);

    // เปลี่ยนลูกค้า/สกุล = เริ่มเลือกใหม่ · ติ๊กใบที่ส่งมา (เต็มยอดค้าง) · สาขา/ภาษา/บัญชีตามใบแรก
    function applyClient(
        invoices: ReceivableInvoice[],
        nextClientId: string,
        nextCurrency: string,
        preset: ReceivableInvoice[],
    ) {
        setClientId(nextClientId);
        setCurrencyCode(nextCurrency);
        const selected = preset.filter(
            (invoice) => invoice.inv_client_id === nextClientId && invoice.inv_currency === nextCurrency,
        );
        setAmounts(Object.fromEntries(selected.map((invoice) => [invoice.inv_id, invoice.outstanding_amount])));
        const first = selected[0] ?? invoices.find((invoice) => invoice.inv_client_id === nextClientId);
        if (first) {
            setBranchId(first.inv_branch_id);
            setLanguage(first.inv_language);
        }
        const defaultAccount =
            options.bank_accounts.find(
                (account) =>
                    account.ba_status === "active" && account.ba_is_default && account.ba_currency === nextCurrency,
            ) ??
            options.bank_accounts.find(
                (account) => account.ba_status === "active" && account.ba_is_default && account.ba_currency === "THB",
            );
        setBankAccountId(defaultAccount?.ba_id ?? "");
        setIsWhtEdited(false);
        setReceivedThbText("");
        setFieldErrors({});
    }

    if (loadError)
        return (
            <StatusBanner tone="error" title="โหลดใบแจ้งหนี้ที่ค้างชำระไม่สำเร็จ">
                {loadError.message}
            </StatusBanner>
        );
    if (!receivable) return <PageSkeleton />;

    if (clients.length === 0) {
        return (
            <StatusBanner tone="info" title="ไม่มีใบแจ้งหนี้ที่ค้างชำระ">
                {RECEIPT_MESSAGES.noReceivable} ·{" "}
                <Link href="/sales/invoices" className="py-2 text-blue-600 hover:underline">
                    ไปหน้าใบแจ้งหนี้
                </Link>
            </StatusBanner>
        );
    }

    const { today, earliest_receipt_date: earliestReceiptDate } = receivable;
    const currency = options.currencies.find((item) => item.cur_code === currencyCode);
    const decimals = currency?.cur_decimals ?? 2;
    const isForeign = Boolean(currencyCode) && currencyCode !== "THB";
    const selectedClient = clients.find((client) => client.clientId === clientId) ?? null;
    const clientInvoices = receivable.data.filter(
        (invoice) => invoice.inv_client_id === clientId && invoice.inv_currency === currencyCode,
    );
    const selectedInvoices = clientInvoices.filter((invoice) => invoice.inv_id in amounts);

    // คำนวณสด — ช่องที่พิมพ์ไม่เป็นตัวเลขแสดง error ของตัวเอง ไม่ทำให้ทั้งหน้าพัง
    const liveErrors: FieldErrors = {};
    const allocationInputs = selectedInvoices.map((invoice, index) => {
        const amount = toHundredths(amounts[invoice.inv_id] ?? "");
        if (amount === null) liveErrors[`allocations.${index}.rca_amount`] = "กรอกเป็นตัวเลข";
        return {
            invoiceId: invoice.inv_id,
            amount: amount ?? 0n,
            // ขั้น N-1: ยอดหลังลดหนี้ (backend คิดให้) · รับแล้วสุทธิ = ยอดหลังลดหนี้ − คงค้าง · VAT/บาทเป็นค่าแสดงผล (backend คิดจริง)
            invoiceTotal: parseHundredths(invoice.effective_total, "ยอดหลังลดหนี้"),
            invoiceVat: parseHundredths(invoice.inv_vat_amount, "VAT"),
            invoiceTotalThb: parseHundredths(invoice.inv_total_thb, "ยอดบาท"),
            invoiceWithholding: parseHundredths(invoice.effective_wht_amount, "หัก ณ ที่จ่าย"),
            paidBefore:
                parseHundredths(invoice.effective_total, "ยอดหลังลดหนี้") -
                parseHundredths(invoice.outstanding_amount, "คงค้าง"),
            vatBefore: parseHundredths(invoice.vat_received, "VAT ที่รับแล้ว"),
            thbBefore: parseHundredths(invoice.thb_received, "ยอดบาทที่รับแล้ว"),
        };
    });
    const suggestedWithholding = suggestWithholding(allocationInputs, decimals);
    const effectiveWhtText = isWhtEdited ? whtText : formatHundredths(suggestedWithholding);
    const withholding = toHundredths(effectiveWhtText);
    const fee = toHundredths(feeText);
    const receivedThb = toHundredths(receivedThbText);
    if (withholding === null) liveErrors.rc_wht_amount = "กรอกเป็นตัวเลข";
    if (fee === null) liveErrors.rc_fee_amount = "กรอกเป็นตัวเลข";
    if (isForeign && receivedThb === null) liveErrors.rc_received_thb = "กรอกเป็นตัวเลข";
    const calculation = calculateReceipt({
        allocations: allocationInputs,
        withholding: withholding ?? 0n,
        fee: fee ?? 0n,
        isForeign,
        receivedThb: isForeign && receivedThb ? receivedThb : null,
        currencyDecimals: decimals,
    });
    const allErrors: FieldErrors = { ...fieldErrors };
    const errorOf = (field: string) => liveErrors[field] ?? allErrors[field];
    const activeAccounts = options.bank_accounts.filter(
        (account) => account.ba_status === "active" || account.ba_id === bankAccountId,
    );
    const activeBranches = options.branches.filter(
        (branch) => branch.branch_status === "active" || branch.branch_id === branchId,
    );
    const bankLabel = (id: string) => {
        const account = options.bank_accounts.find((item) => item.ba_id === id);
        return account ? `${account.ba_bank_name} ${account.ba_account_no}` : "";
    };

    function toggle(invoice: ReceivableInvoice) {
        setAmounts((current) => {
            if (invoice.inv_id in current) {
                return Object.fromEntries(
                    Object.entries(current).filter(([invoiceId]) => invoiceId !== invoice.inv_id),
                );
            }
            return { ...current, [invoice.inv_id]: invoice.outstanding_amount };
        });
    }

    function buildPayload() {
        return {
            rc_client_id: clientId,
            rc_branch_id: branchId,
            rc_language: language,
            rc_receipt_date: receiptDate,
            rc_method: method,
            rc_bank_account_id: method === "transfer" || method === "cheque" ? bankAccountId || null : null,
            rc_reference: method === "transfer" || method === "other" ? reference : null,
            rc_cheque_no: chequeNo,
            rc_cheque_bank: chequeBank,
            rc_cheque_date: chequeDate,
            allocations: selectedInvoices.map((invoice) => ({
                rca_invoice_id: invoice.inv_id,
                rca_amount: amounts[invoice.inv_id] ?? "",
            })),
            rc_wht_amount: effectiveWhtText || "0",
            rc_fee_amount: feeText || "0",
            rc_received_thb: isForeign ? receivedThbText : null,
            rc_wht_certificate_no: certificateNo,
            rc_wht_certificate_date: certificateDate,
            rc_notes: notes,
            rc_internal_note: internalNote,
            rc_billing_note_id: billingNoteId ?? null,
        };
    }

    // ตรวจในหน้าก่อน (schema + สมการยอด + วันที่) แล้วเปิดหน้าต่างสรุป
    function openConfirm(event: React.FormEvent) {
        event.preventDefault();
        setSaveError(null);
        const checked = receiptCreateSchema.safeParse(buildPayload());
        const errors: FieldErrors = checked.success ? {} : toFieldErrors(checked.error.issues);
        Object.assign(errors, liveErrors, calculation.errors);
        if (receiptDate && receiptDate > today) errors.rc_receipt_date = "วันที่รับเงินต้องไม่เป็นวันในอนาคต";
        if (receiptDate && receiptDate < earliestReceiptDate)
            errors.rc_receipt_date = `ย้อนหลังได้ไม่เกิน ${MAX_RECEIPT_BACKDATE_DAYS} วัน`;
        if (Object.keys(errors).length > 0) {
            setFieldErrors(errors);
            toast.error("ยังบันทึกไม่ได้ · แก้ช่องที่มีข้อความสีแดงก่อน");
            return;
        }
        setFieldErrors({});
        setIsConfirmOpen(true);
    }

    async function save() {
        const checked = receiptCreateSchema.safeParse(buildPayload());
        if (!checked.success) return;
        setIsSaving(true);
        setSaveError(null);
        const { data, error } = await apiFetch<{ rc_id: string; rc_number: string }>("/receipts", {
            method: "POST",
            body: checked.data,
        });
        setIsSaving(false);
        if (error) {
            setIsConfirmOpen(false);
            setFieldErrors(error.fields);
            setSaveError(error);
            return;
        }
        toast.success(`ออกใบเสร็จ ${data.rc_number} แล้ว`);
        router.push(`/sales/receipts/view?id=${data.rc_id}`);
    }

    const receivedLabel = `${formatAmount(calculation.received, decimals)} ${currencyCode}`;

    return (
        <form onSubmit={openConfirm} noValidate className="grid grid-cols-1 gap-5">
            {receivable.billing_note && (
                <StatusBanner tone="info" title={`รับเงินตามใบวางบิล ${receivable.billing_note.bn_number ?? ""}`}>
                    เติมใบแจ้งหนี้ในใบวางบิลที่ยังค้างให้แล้ว · เอาติ๊กออกหรือแก้ยอดได้ถ้าลูกค้าจ่ายไม่ครบ
                </StatusBanner>
            )}

            <SectionCard icon={Users} title="ลูกค้าและใบแจ้งหนี้" description={RECEIPT_MESSAGES.pickInvoices}>
                <div className="grid gap-4">
                    <FormField label="ลูกค้า" htmlFor="rc_client_id" required error={errorOf("rc_client_id")}>
                        <select
                            id="rc_client_id"
                            value={clientId}
                            onChange={(event) => {
                                const client = clients.find((item) => item.clientId === event.target.value);
                                applyClient(receivable.data, event.target.value, client?.currencies[0] ?? "", []);
                            }}
                            className={inputClass(Boolean(errorOf("rc_client_id")))}
                        >
                            <option value="">เลือกลูกค้า</option>
                            {clients.map((client) => (
                                <option key={client.clientId} value={client.clientId}>
                                    {client.name} (ค้าง {client.invoiceCount} ใบ)
                                </option>
                            ))}
                        </select>
                    </FormField>

                    {selectedClient && selectedClient.currencies.length > 1 && (
                        <div className="grid gap-1.5">
                            <Segmented<string>
                                label="สกุลเงิน"
                                value={currencyCode}
                                onChange={(value) => applyClient(receivable.data, clientId, value, [])}
                                options={selectedClient.currencies.map((code) => ({ value: code, label: code }))}
                            />
                            <FieldHint>ลูกค้ารายนี้มีใบแจ้งหนี้หลายสกุล · ใบเสร็จหนึ่งใบรับได้สกุลเดียว</FieldHint>
                        </div>
                    )}

                    {selectedClient && (
                        <ul className="grid gap-2">
                            {clientInvoices.map((invoice) => {
                                const isSelected = invoice.inv_id in amounts;
                                const index = selectedInvoices.findIndex((item) => item.inv_id === invoice.inv_id);
                                const amountError = index >= 0 ? errorOf(`allocations.${index}.rca_amount`) : undefined;
                                const hasPaid = parseHundredths(invoice.inv_paid_amount, "ยอดรับแล้ว") > 0n;
                                return (
                                    <li
                                        key={invoice.inv_id}
                                        className={`grid gap-2 rounded-xl border p-3 text-sm transition ${
                                            isSelected ? "border-blue-300 bg-blue-50" : "border-gray-200 bg-white"
                                        }`}
                                    >
                                        <button
                                            type="button"
                                            aria-pressed={isSelected}
                                            onClick={() => toggle(invoice)}
                                            className="flex w-full items-start gap-3 text-left"
                                        >
                                            <span
                                                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                                                    isSelected
                                                        ? "border-blue-500 bg-blue-500 text-white"
                                                        : "border-gray-300 bg-white"
                                                }`}
                                            >
                                                {isSelected && <Check size={14} />}
                                            </span>
                                            <span className="grid min-w-0 flex-1 gap-0.5">
                                                <span className="font-medium text-gray-900 tabular-nums">
                                                    {invoice.inv_number}
                                                </span>
                                                <span className="wrap-break-word text-gray-700">
                                                    {invoice.inv_title}
                                                </span>
                                                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
                                                    <span>ครบกำหนด {formatDateOnly(invoice.inv_due_date)}</span>
                                                    {hasPaid && (
                                                        <span>
                                                            รับแล้ว {formatAmount(invoice.inv_paid_amount, decimals)}
                                                        </span>
                                                    )}
                                                    {invoice.is_overdue && (
                                                        <StatusPill tone="danger">
                                                            เกินกำหนด {invoice.days_overdue} วัน
                                                        </StatusPill>
                                                    )}
                                                </span>
                                            </span>
                                            <span className="grid shrink-0 justify-items-end gap-0.5 tabular-nums">
                                                <span className="text-xs text-gray-500">ค้าง</span>
                                                <span className="font-medium text-gray-900">
                                                    {formatAmount(invoice.outstanding_amount, decimals)}
                                                </span>
                                            </span>
                                        </button>
                                        {isSelected && (
                                            <FormField
                                                label="ยอดรับครั้งนี้"
                                                htmlFor={`amount-${invoice.inv_id}`}
                                                hint={RECEIPT_MESSAGES.allocationAmount}
                                                error={amountError}
                                            >
                                                <input
                                                    id={`amount-${invoice.inv_id}`}
                                                    inputMode="decimal"
                                                    value={amounts[invoice.inv_id]}
                                                    onChange={(event) =>
                                                        setAmounts((current) => ({
                                                            ...current,
                                                            [invoice.inv_id]: event.target.value,
                                                        }))
                                                    }
                                                    className={`${inputClass(Boolean(amountError))} text-right tabular-nums`}
                                                />
                                            </FormField>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                    {errorOf("allocations") && (
                        <p className="text-xs whitespace-pre-line text-red-600">{errorOf("allocations")}</p>
                    )}
                </div>
            </SectionCard>

            <SectionCard icon={Banknote} title="การรับเงิน" description={RECEIPT_MESSAGES.received}>
                <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                        label="วันที่รับเงิน"
                        htmlFor="rc_receipt_date"
                        required
                        hint={RECEIPT_MESSAGES.receiptDate(MAX_RECEIPT_BACKDATE_DAYS)}
                        error={errorOf("rc_receipt_date")}
                    >
                        <input
                            id="rc_receipt_date"
                            type="date"
                            min={earliestReceiptDate}
                            max={today}
                            value={receiptDate}
                            onChange={(event) => setReceiptDate(event.target.value)}
                            className={inputClass(Boolean(errorOf("rc_receipt_date")))}
                        />
                    </FormField>
                    <div className="grid content-start gap-1.5">
                        <Segmented<ReceiptMethod>
                            label="วิธีรับเงิน"
                            value={method}
                            onChange={setMethod}
                            options={METHOD_OPTIONS}
                        />
                        {method === "cheque" && <FieldHint>{RECEIPT_MESSAGES.cheque}</FieldHint>}
                    </div>
                    {(method === "transfer" || method === "cheque") && (
                        <FormField
                            label={method === "transfer" ? "บัญชีที่เงินเข้า" : "บัญชีที่จะนำเช็คเข้า"}
                            htmlFor="rc_bank_account_id"
                            required={method === "transfer"}
                            hint={RECEIPT_MESSAGES.bankAccount}
                            error={errorOf("rc_bank_account_id")}
                        >
                            <select
                                id="rc_bank_account_id"
                                value={bankAccountId}
                                onChange={(event) => setBankAccountId(event.target.value)}
                                className={inputClass(Boolean(errorOf("rc_bank_account_id")))}
                            >
                                <option value="">{method === "transfer" ? "เลือกบัญชี" : "ยังไม่ระบุ"}</option>
                                {activeAccounts.map((account) => (
                                    <option key={account.ba_id} value={account.ba_id}>
                                        {account.ba_bank_name} · {account.ba_account_no} ({account.ba_currency})
                                    </option>
                                ))}
                            </select>
                        </FormField>
                    )}
                    {(method === "transfer" || method === "other") && (
                        <FormField
                            label={method === "transfer" ? "เลขอ้างอิงการโอน" : "รายละเอียดการรับเงิน"}
                            htmlFor="rc_reference"
                            error={errorOf("rc_reference")}
                        >
                            <input
                                id="rc_reference"
                                value={reference}
                                onChange={(event) => setReference(event.target.value)}
                                className={inputClass(Boolean(errorOf("rc_reference")))}
                            />
                        </FormField>
                    )}
                    {method === "cheque" && (
                        <>
                            <FormField
                                label="เลขที่เช็ค"
                                htmlFor="rc_cheque_no"
                                required
                                error={errorOf("rc_cheque_no")}
                            >
                                <input
                                    id="rc_cheque_no"
                                    inputMode="numeric"
                                    value={chequeNo}
                                    onChange={(event) => setChequeNo(event.target.value)}
                                    className={inputClass(Boolean(errorOf("rc_cheque_no")))}
                                />
                            </FormField>
                            <FormField
                                label="ธนาคารของเช็ค"
                                htmlFor="rc_cheque_bank"
                                required
                                error={errorOf("rc_cheque_bank")}
                            >
                                <input
                                    id="rc_cheque_bank"
                                    value={chequeBank}
                                    onChange={(event) => setChequeBank(event.target.value)}
                                    className={inputClass(Boolean(errorOf("rc_cheque_bank")))}
                                />
                            </FormField>
                            <FormField
                                label="วันที่หน้าเช็ค"
                                htmlFor="rc_cheque_date"
                                required
                                hint="เช็คลงวันที่ล่วงหน้าได้"
                                error={errorOf("rc_cheque_date")}
                            >
                                <input
                                    id="rc_cheque_date"
                                    type="date"
                                    value={chequeDate}
                                    onChange={(event) => setChequeDate(event.target.value)}
                                    className={inputClass(Boolean(errorOf("rc_cheque_date")))}
                                />
                            </FormField>
                        </>
                    )}
                </div>
            </SectionCard>

            <SectionCard icon={Receipt} title="หัก ณ ที่จ่าย และค่าธรรมเนียม">
                <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                        label={`หัก ณ ที่จ่าย (${currencyCode || "-"})`}
                        htmlFor="rc_wht_amount"
                        hint={RECEIPT_MESSAGES.withholding}
                        error={errorOf("rc_wht_amount")}
                    >
                        <input
                            id="rc_wht_amount"
                            inputMode="decimal"
                            value={effectiveWhtText}
                            onChange={(event) => {
                                setIsWhtEdited(true);
                                setWhtText(event.target.value);
                            }}
                            className={`${inputClass(Boolean(errorOf("rc_wht_amount")))} text-right tabular-nums`}
                        />
                        {isWhtEdited && withholding !== suggestedWithholding && (
                            <button
                                type="button"
                                className="-my-2 justify-self-start py-2 text-xs text-blue-600 hover:underline"
                                onClick={() => setIsWhtEdited(false)}
                            >
                                ใช้ยอดที่ระบบเสนอ {formatAmount(suggestedWithholding, decimals)}
                            </button>
                        )}
                    </FormField>
                    <FormField
                        label={`ค่าธรรมเนียม (${currencyCode || "-"})`}
                        htmlFor="rc_fee_amount"
                        hint={RECEIPT_MESSAGES.fee}
                        error={errorOf("rc_fee_amount")}
                    >
                        <input
                            id="rc_fee_amount"
                            inputMode="decimal"
                            value={feeText}
                            onChange={(event) => setFeeText(event.target.value)}
                            className={`${inputClass(Boolean(errorOf("rc_fee_amount")))} text-right tabular-nums`}
                        />
                    </FormField>
                    {isForeign && (
                        <FormField
                            label="ยอดบาทที่เข้าบัญชีจริง"
                            htmlFor="rc_received_thb"
                            required
                            hint={RECEIPT_MESSAGES.receivedThb}
                            error={errorOf("rc_received_thb")}
                            className="sm:col-span-2"
                        >
                            <input
                                id="rc_received_thb"
                                inputMode="decimal"
                                value={receivedThbText}
                                onChange={(event) => setReceivedThbText(event.target.value)}
                                className={`${inputClass(Boolean(errorOf("rc_received_thb")))} text-right tabular-nums`}
                            />
                            {calculation.actualRate && (
                                <p className="text-xs text-gray-600">
                                    อัตราจริง {Number(calculation.actualRate).toFixed(4)} บาท/{currencyCode} ·
                                    ส่วนต่างอัตรา {formatAmount(calculation.fxDiffThb)} บาท
                                </p>
                            )}
                        </FormField>
                    )}
                    <FormField
                        label="เลขที่ใน 50 ทวิ"
                        htmlFor="rc_wht_certificate_no"
                        hint={RECEIPT_MESSAGES.whtCertificate}
                        error={errorOf("rc_wht_certificate_no")}
                    >
                        <input
                            id="rc_wht_certificate_no"
                            value={certificateNo}
                            onChange={(event) => setCertificateNo(event.target.value)}
                            className={inputClass(Boolean(errorOf("rc_wht_certificate_no")))}
                        />
                    </FormField>
                    <FormField
                        label="วันที่ใน 50 ทวิ"
                        htmlFor="rc_wht_certificate_date"
                        error={errorOf("rc_wht_certificate_date")}
                    >
                        <input
                            id="rc_wht_certificate_date"
                            type="date"
                            value={certificateDate}
                            onChange={(event) => setCertificateDate(event.target.value)}
                            className={inputClass(Boolean(errorOf("rc_wht_certificate_date")))}
                        />
                    </FormField>
                </div>
            </SectionCard>

            <SectionCard icon={FileText} title="เอกสาร">
                <div className="grid gap-4 sm:grid-cols-2">
                    <FormField label="สาขาที่ออกเอกสาร" htmlFor="rc_branch_id" required error={errorOf("rc_branch_id")}>
                        <select
                            id="rc_branch_id"
                            value={branchId}
                            onChange={(event) => setBranchId(event.target.value)}
                            className={inputClass(Boolean(errorOf("rc_branch_id")))}
                        >
                            <option value="">เลือกสาขา</option>
                            {activeBranches.map((branch) => (
                                <option key={branch.branch_id} value={branch.branch_id}>
                                    {branch.branch_code} · {branch.branch_name_th}
                                </option>
                            ))}
                        </select>
                    </FormField>
                    <FormField label="ภาษาเอกสาร" htmlFor="rc_language" required>
                        <select
                            id="rc_language"
                            value={language}
                            onChange={(event) => setLanguage(event.target.value === "en" ? "en" : "th")}
                            className={inputClass(false)}
                        >
                            <option value="th">ไทย</option>
                            <option value="en">อังกฤษ</option>
                        </select>
                    </FormField>
                    <FormField
                        label="หมายเหตุ"
                        htmlFor="rc_notes"
                        hint={RECEIPT_MESSAGES.notes}
                        error={errorOf("rc_notes")}
                    >
                        <textarea
                            id="rc_notes"
                            rows={2}
                            value={notes}
                            onChange={(event) => setNotes(event.target.value)}
                            className={inputClass(Boolean(errorOf("rc_notes")))}
                        />
                    </FormField>
                    <FormField
                        label="บันทึกภายใน"
                        htmlFor="rc_internal_note"
                        hint={RECEIPT_MESSAGES.internalNote}
                        error={errorOf("rc_internal_note")}
                    >
                        <textarea
                            id="rc_internal_note"
                            rows={2}
                            value={internalNote}
                            onChange={(event) => setInternalNote(event.target.value)}
                            className={inputClass(Boolean(errorOf("rc_internal_note")))}
                        />
                    </FormField>
                </div>
            </SectionCard>

            <SaveErrorBanner error={saveError} />
            <div className="sticky bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-10 flex items-center justify-end gap-3 rounded-2xl border border-gray-200 bg-white/95 p-3 shadow-float backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none sm:backdrop-blur-none">
                <div className="mr-auto grid min-w-0">
                    <span className="text-xs text-gray-500">เงินเข้าจริง · {selectedInvoices.length} ใบ</span>
                    <span
                        className={`truncate text-lg font-medium tabular-nums ${
                            calculation.received < 0n ? "text-red-600" : "text-gray-900"
                        }`}
                    >
                        {receivedLabel}
                    </span>
                </div>
                <button
                    type="submit"
                    className={buttonClass("primary", "md")}
                    disabled={isSaving || selectedInvoices.length === 0}
                >
                    ตรวจและออกใบเสร็จ
                </button>
            </div>

            <ConfirmDialog
                open={isConfirmOpen}
                variant="info"
                title="ออกใบเสร็จรับเงิน?"
                description={`${selectedClient?.name ?? ""} · วันที่ ${receiptDate ? formatDateOnly(receiptDate) : ""} · ${METHOD_LABELS[method]}${
                    method === "transfer" && bankAccountId ? ` เข้า ${bankLabel(bankAccountId)}` : ""
                }`}
                consequences={[
                    `ตัดหนี้ ${selectedInvoices.length} ใบ รวม ${formatAmount(calculation.allocatedTotal, decimals)} ${currencyCode}`,
                    `หัก ณ ที่จ่าย ${formatAmount(withholding ?? 0n, decimals)} · ค่าธรรมเนียม ${formatAmount(fee ?? 0n, decimals)}`,
                    `เงินเข้าจริง ${receivedLabel}${isForeign && receivedThb ? ` (= ${formatAmount(receivedThb)} บาท)` : ""} · ตรงกับสเตทเมนต์แล้ว`,
                    "ได้เลขที่ใบเสร็จทันที ออกแล้วแก้ตัวเลขไม่ได้ (ผิดให้ยกเลิกแล้วบันทึกใหม่)",
                ]}
                confirmLabel="ออกใบเสร็จ"
                loading={isSaving}
                onConfirm={save}
                onCancel={() => setIsConfirmOpen(false)}
            />
        </form>
    );
}
