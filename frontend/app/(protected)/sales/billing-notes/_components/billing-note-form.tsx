"use client";

// ฟอร์มสร้าง/แก้ร่างใบวางบิล: เลือกลูกค้า → (สกุลเงิน ถ้าลูกค้ามีหลายสกุล) → ติ๊กใบแจ้งหนี้ → วันนัดชำระ/ภาษา/สาขา/หมายเหตุ
// รายชื่อลูกค้ามาจากใบแจ้งหนี้ที่วางบิลได้ (ไม่มีใบค้าง = ไม่อยู่ในรายการ) · backend ตรวจซ้ำทุกข้อหลังล็อกใบแจ้งหนี้
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, FileText, Users } from "lucide-react";
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
import { formatAmount, parseHundredths } from "@/lib/shared/money.mjs";
import { billingNoteDraftSchema } from "@/lib/shared/schemas/billing-note.mjs";
import type { InvoiceOptions } from "../../invoices/_hooks/use-invoice-options";
import { BILLING_NOTE_MESSAGES } from "../_messages";
import type { BillableInvoice, BillingNoteDetail } from "../_types";

type BillingNoteFormProps = {
    options: InvoiceOptions;
    // แก้ร่าง = ส่ง detail มา · สร้างใหม่ = ไม่ส่ง
    detail?: BillingNoteDetail;
};

type ClientOption = { clientId: string; name: string; currencies: string[]; invoiceCount: number };

export default function BillingNoteForm({ options, detail }: BillingNoteFormProps) {
    const router = useRouter();
    const note = detail?.billing_note;
    const [billable, setBillable] = useState<BillableInvoice[] | null>(null);
    const [today, setToday] = useState("");
    const [loadError, setLoadError] = useState<ApiError | null>(null);

    const [clientId, setClientId] = useState(note?.bn_client_id ?? "");
    const [currencyCode, setCurrencyCode] = useState(note?.bn_currency ?? "");
    const [selectedIds, setSelectedIds] = useState<string[]>(detail?.invoices.map((invoice) => invoice.inv_id) ?? []);
    const [branchId, setBranchId] = useState(note?.bn_branch_id ?? "");
    const [language, setLanguage] = useState<"th" | "en">(note?.bn_language ?? "th");
    const [paymentDate, setPaymentDate] = useState(note?.bn_payment_date ?? "");
    const [notes, setNotes] = useState(note?.bn_notes ?? "");
    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
    const [saveError, setSaveError] = useState<ApiError | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        let isLeftPage = false;
        const query = note ? `?billing_note_id=${note.bn_id}` : "";
        apiFetch<{ data: BillableInvoice[]; today: string }>(`/billing-notes/billable-invoices${query}`).then(
            ({ data, error }) => {
                if (isLeftPage) return;
                setBillable(data?.data ?? null);
                setToday(data?.today ?? "");
                setLoadError(error);
            },
        );
        return () => {
            isLeftPage = true;
        };
    }, [note]);

    const clients = useMemo<ClientOption[]>(() => {
        const byClient = new Map<string, ClientOption>();
        for (const invoice of billable ?? []) {
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
    }, [billable]);

    if (loadError)
        return (
            <StatusBanner tone="error" title="โหลดใบแจ้งหนี้ที่วางบิลได้ไม่สำเร็จ">
                {loadError.message}
            </StatusBanner>
        );
    if (!billable) return <PageSkeleton />;

    const selectedClient = clients.find((client) => client.clientId === clientId) ?? null;
    const clientInvoices = billable.filter(
        (invoice) => invoice.inv_client_id === clientId && invoice.inv_currency === currencyCode,
    );
    const selectedInvoices = clientInvoices.filter((invoice) => selectedIds.includes(invoice.inv_id));
    const selectedTotal = selectedInvoices.reduce(
        (sum, invoice) => sum + parseHundredths(invoice.outstanding_amount, "ยอดค้าง"),
        0n,
    );
    // ใบในร่างเดิมที่วางบิลไม่ได้แล้ว (เช่น รับชำระครบ) — บันทึกแล้วจะถูกเอาออก
    const droppedInvoices = (detail?.invoices ?? []).filter(
        (invoice) => !billable.some((item) => item.inv_id === invoice.inv_id),
    );
    const activeBranches = options.branches.filter(
        (branch) => branch.branch_status === "active" || branch.branch_id === branchId,
    );

    // เลือกลูกค้า = เริ่มใหม่: สกุลแรกของลูกค้า · ติ๊กทุกใบของสกุลนั้น · สาขา/ภาษาตามใบแจ้งหนี้ใบแรก
    function chooseClient(nextClientId: string) {
        setClientId(nextClientId);
        const client = clients.find((item) => item.clientId === nextClientId);
        const firstCurrency = client?.currencies[0] ?? "";
        chooseCurrency(nextClientId, firstCurrency);
    }

    function chooseCurrency(forClientId: string, nextCurrency: string) {
        setCurrencyCode(nextCurrency);
        const invoices = (billable ?? []).filter(
            (invoice) => invoice.inv_client_id === forClientId && invoice.inv_currency === nextCurrency,
        );
        setSelectedIds(invoices.map((invoice) => invoice.inv_id));
        if (invoices[0]) {
            setBranchId(invoices[0].inv_branch_id);
            setLanguage(invoices[0].inv_language);
        }
        setFieldErrors({});
    }

    function toggle(invoiceId: string) {
        setSelectedIds((current) =>
            current.includes(invoiceId) ? current.filter((id) => id !== invoiceId) : [...current, invoiceId],
        );
    }

    async function handleSave(event: React.FormEvent) {
        event.preventDefault();
        setSaveError(null);
        // ส่งตามลำดับที่แสดง (วันที่ออกเก่าก่อน) — ลำดับนี้คือลำดับบนหน้าพิมพ์
        const orderedIds = clientInvoices
            .filter((invoice) => selectedIds.includes(invoice.inv_id))
            .map((invoice) => invoice.inv_id);
        const checked = billingNoteDraftSchema.safeParse({
            bn_client_id: clientId,
            bn_branch_id: branchId,
            bn_language: language,
            bn_payment_date: paymentDate,
            bn_notes: notes,
            invoice_ids: orderedIds,
            bn_version: note?.bn_version,
        });
        if (!checked.success) {
            setFieldErrors(toFieldErrors(checked.error.issues));
            toast.error("ยังบันทึกไม่ได้ — แก้ช่องที่มีข้อความสีแดงก่อน");
            return;
        }
        if (paymentDate && today && paymentDate < today) {
            setFieldErrors({ bn_payment_date: "วันนัดชำระต้องไม่ก่อนวันนี้" });
            toast.error("ยังบันทึกไม่ได้ — แก้ช่องที่มีข้อความสีแดงก่อน");
            return;
        }
        setFieldErrors({});
        setIsSaving(true);
        const { data, error } = await apiFetch<{ bn_id: string }>(
            note ? `/billing-notes/${note.bn_id}` : "/billing-notes",
            { method: note ? "PUT" : "POST", body: checked.data },
        );
        setIsSaving(false);
        if (error) {
            setFieldErrors(error.fields);
            setSaveError(error);
            return;
        }
        toast.success(note ? "บันทึกร่างแล้ว" : "สร้างร่างใบวางบิลแล้ว — ตรวจแล้วกดออกใบวางบิล");
        router.push(`/sales/billing-notes/view?id=${data.bn_id}`);
    }

    if (clients.length === 0) {
        return (
            <StatusBanner tone="info" title="ยังไม่มีใบแจ้งหนี้ที่วางบิลได้">
                {BILLING_NOTE_MESSAGES.noBillableInvoices} ·{" "}
                <Link href="/sales/invoices" className="py-2 text-blue-600 hover:underline">
                    ไปหน้าใบแจ้งหนี้
                </Link>
            </StatusBanner>
        );
    }

    return (
        <form onSubmit={handleSave} noValidate className="grid grid-cols-1 gap-5">
            <SectionCard icon={Users} title="ลูกค้าและใบแจ้งหนี้" description={BILLING_NOTE_MESSAGES.pickInvoices}>
                <div className="grid gap-4">
                    <FormField label="ลูกค้า" htmlFor="bn_client_id" required error={fieldErrors.bn_client_id}>
                        <select
                            id="bn_client_id"
                            value={clientId}
                            onChange={(event) => chooseClient(event.target.value)}
                            className={inputClass(Boolean(fieldErrors.bn_client_id))}
                        >
                            <option value="">— เลือกลูกค้า —</option>
                            {clients.map((client) => (
                                <option key={client.clientId} value={client.clientId}>
                                    {client.name} ({client.invoiceCount} ใบ)
                                </option>
                            ))}
                        </select>
                    </FormField>

                    {selectedClient && selectedClient.currencies.length > 1 && (
                        <div className="grid gap-1.5">
                            <Segmented<string>
                                label="สกุลเงิน"
                                value={currencyCode}
                                onChange={(value) => chooseCurrency(clientId, value)}
                                options={selectedClient.currencies.map((code) => ({ value: code, label: code }))}
                            />
                            <FieldHint>ลูกค้ารายนี้มีใบแจ้งหนี้หลายสกุล — ใบวางบิลหนึ่งใบรวมได้สกุลเดียว</FieldHint>
                        </div>
                    )}

                    {selectedClient && (
                        <ul className="grid gap-2">
                            {clientInvoices.map((invoice) => {
                                const isSelected = selectedIds.includes(invoice.inv_id);
                                return (
                                    <li key={invoice.inv_id}>
                                        <button
                                            type="button"
                                            aria-pressed={isSelected}
                                            onClick={() => toggle(invoice.inv_id)}
                                            className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left text-sm transition ${
                                                isSelected
                                                    ? "border-blue-300 bg-blue-50"
                                                    : "border-gray-200 bg-white hover:bg-gray-50"
                                            }`}
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
                                                    <span>ออก {formatDateOnly(invoice.inv_issue_date)}</span>
                                                    <span>ครบกำหนด {formatDateOnly(invoice.inv_due_date)}</span>
                                                    {invoice.is_overdue && (
                                                        <StatusPill tone="danger">
                                                            เกินกำหนด {invoice.days_overdue} วัน
                                                        </StatusPill>
                                                    )}
                                                </span>
                                            </span>
                                            <span className="shrink-0 font-medium text-gray-900 tabular-nums">
                                                {formatAmount(invoice.outstanding_amount)}
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                    {droppedInvoices.length > 0 && (
                        <StatusBanner tone="warn" title="บางใบในร่างนี้วางบิลไม่ได้แล้ว">
                            {droppedInvoices
                                .map(
                                    (invoice) =>
                                        `${invoice.inv_number ?? "ใบแจ้งหนี้"}: ${invoice.problem ?? "ใช้ไม่ได้แล้ว"}`,
                                )
                                .join(" · ")}{" "}
                            — บันทึกร่างแล้วใบเหล่านี้จะถูกเอาออก
                        </StatusBanner>
                    )}
                    {fieldErrors.invoice_ids && (
                        <p className="text-xs whitespace-pre-line text-red-600">{fieldErrors.invoice_ids}</p>
                    )}
                    {selectedClient && <FieldHint>{BILLING_NOTE_MESSAGES.amounts}</FieldHint>}
                </div>
            </SectionCard>

            <SectionCard icon={FileText} title="รายละเอียดใบวางบิล" description={BILLING_NOTE_MESSAGES.dates}>
                <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                        label="วันนัดชำระ"
                        htmlFor="bn_payment_date"
                        hint={BILLING_NOTE_MESSAGES.paymentDate}
                        error={fieldErrors.bn_payment_date}
                    >
                        <input
                            id="bn_payment_date"
                            type="date"
                            min={today || undefined}
                            value={paymentDate}
                            onChange={(event) => setPaymentDate(event.target.value)}
                            className={inputClass(Boolean(fieldErrors.bn_payment_date))}
                        />
                    </FormField>
                    <FormField label="ภาษาเอกสาร" htmlFor="bn_language" required error={fieldErrors.bn_language}>
                        <select
                            id="bn_language"
                            value={language}
                            onChange={(event) => setLanguage(event.target.value === "en" ? "en" : "th")}
                            className={inputClass(Boolean(fieldErrors.bn_language))}
                        >
                            <option value="th">ไทย</option>
                            <option value="en">อังกฤษ</option>
                        </select>
                    </FormField>
                    <FormField
                        label="สาขาที่ออกเอกสาร"
                        htmlFor="bn_branch_id"
                        required
                        hint="ค่าเริ่มต้นตามใบแจ้งหนี้ใบแรก"
                        error={fieldErrors.bn_branch_id}
                    >
                        <select
                            id="bn_branch_id"
                            value={branchId}
                            onChange={(event) => setBranchId(event.target.value)}
                            className={inputClass(Boolean(fieldErrors.bn_branch_id))}
                        >
                            <option value="">— เลือกสาขา —</option>
                            {activeBranches.map((branch) => (
                                <option key={branch.branch_id} value={branch.branch_id}>
                                    {branch.branch_code} · {branch.branch_name_th}
                                </option>
                            ))}
                        </select>
                    </FormField>
                    <FormField
                        label="หมายเหตุ"
                        htmlFor="bn_notes"
                        hint={BILLING_NOTE_MESSAGES.notes}
                        error={fieldErrors.bn_notes}
                        className="sm:col-span-2"
                    >
                        <textarea
                            id="bn_notes"
                            rows={3}
                            value={notes}
                            onChange={(event) => setNotes(event.target.value)}
                            className={inputClass(Boolean(fieldErrors.bn_notes))}
                        />
                    </FormField>
                </div>
            </SectionCard>

            <SaveErrorBanner error={saveError} />
            <div className="sticky bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-10 flex items-center justify-end gap-3 rounded-2xl border border-gray-200 bg-white/95 p-3 shadow-float backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none sm:backdrop-blur-none">
                <div className="mr-auto grid min-w-0">
                    <span className="text-xs text-gray-500">{selectedInvoices.length} ใบแจ้งหนี้</span>
                    <span className="truncate font-medium text-gray-900 tabular-nums">
                        {formatAmount(selectedTotal)} {currencyCode}
                    </span>
                </div>
                <button
                    type="button"
                    className={`${buttonClass("secondary", "md")} max-sm:hidden`}
                    onClick={() =>
                        router.push(note ? `/sales/billing-notes/view?id=${note.bn_id}` : "/sales/billing-notes")
                    }
                >
                    ยกเลิก
                </button>
                <button
                    type="submit"
                    className={buttonClass("primary", "md")}
                    disabled={isSaving || selectedInvoices.length === 0}
                >
                    {isSaving ? "กำลังบันทึก..." : note ? "บันทึกร่าง" : "สร้างร่างใบวางบิล"}
                </button>
            </div>
        </form>
    );
}
