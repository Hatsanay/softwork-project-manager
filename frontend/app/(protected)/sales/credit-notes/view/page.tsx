"use client";

// หน้าเอกสารใบลดหนี้ (ขั้น N-1) — สถานะ + สิ่งที่ทำได้ตอนนี้ (ปุ่มที่ทำไม่ได้ซ่อน พร้อมเหตุผล — ไม่ใช้ tooltip)
// ยอด: มูลค่าตามใบเดิม → ลด → มูลค่าที่ถูกต้อง (อ่านบนลงล่าง — กติกาเงิน 3.8) · คืนเงินลูกค้า (N1-ก) · การอนุมัติ (N2-ก)
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
    Banknote,
    CheckCircle2,
    Circle,
    Clock,
    Pencil,
    Printer,
    Send,
    ShieldCheck,
    Trash2,
    Undo2,
    XCircle,
} from "lucide-react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import PageHeader from "@/components/ui/page-header";
import ReasonDialog from "@/components/ui/reason-dialog";
import StatusBanner from "@/components/ui/guidance/status-banner";
import FieldHint from "@/components/ui/guidance/field-hint";
import StatusPill from "@/components/ui/status-pill";
import FormField, { inputClass } from "@/components/ui/form-field";
import SaveErrorBanner from "@/components/ui/save-error-banner";
import { CARD_CLASS } from "@/components/ui/card";
import { PageSkeleton } from "@/components/ui/skeleton";
import { buttonClass } from "@/components/ui/button";
import formatDate, { formatDateOnly } from "@/app/function";
import { apiFetch, type ApiError } from "@/lib/api";
import { toFieldErrors, type FieldErrors } from "@/lib/form-errors";
import {
    divideRoundHalfUp,
    formatAmount,
    formatHundredths,
    parseHundredths,
    roundToCurrency,
} from "@/lib/shared/money.mjs";
import { amountInWords } from "@/lib/shared/amount-in-words.mjs";
import { creditNoteRefundSchema } from "@/lib/shared/schemas/credit-note.mjs";
import type { BankAccountOption } from "../../invoices/_hooks/use-invoice-options";
import { CREDIT_NOTE_MESSAGES, STATUS_LABELS, creditNoteNumberLabel } from "../_messages";
import type { CreditNoteDetail } from "../_types";

type ReasonAction = "return" | "cancel";
type ConfirmAction = "submit" | "approve" | "delete" | "cancelRefund";

const REASON_DIALOGS: Record<ReasonAction, { title: string; description: string; confirmLabel: string; hint: string }> =
    {
        return: {
            title: "ตีกลับให้ผู้สร้างแก้?",
            description: "ใบกลับเป็นร่าง ผู้สร้างแก้แล้วส่งใหม่ได้ · ส่งใหม่ต้องเริ่มอนุมัติชั้น 1 ใหม่",
            confirmLabel: "ตีกลับ",
            hint: "ผู้สร้างจะเห็นเหตุผลนี้ เช่น ยอดที่ลดไม่ตรงกับที่ตกลงกับลูกค้า",
        },
        cancel: {
            title: "ยกเลิกใบลดหนี้นี้?",
            description:
                "เลขที่ยังคงอยู่ (ไม่นำกลับมาใช้) · ยอดค้างของใบแจ้งหนี้กลับมาเท่าก่อนลดหนี้ · ยกเลิกแล้วกู้คืนไม่ได้",
            confirmLabel: "ยกเลิกใบลดหนี้",
            hint: "เหตุผลจะแสดงในประวัติ เช่น ลูกค้าตกลงจ่ายเต็มยอดตามเดิม",
        },
    };

export default function CreditNoteViewPage() {
    const router = useRouter();
    const creditNoteId = useSearchParams().get("id");
    const [detail, setDetail] = useState<CreditNoteDetail | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);
    const [reasonAction, setReasonAction] = useState<ReasonAction | null>(null);
    const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [isWorking, setIsWorking] = useState(false);

    const reload = useCallback(async () => {
        if (!creditNoteId) return;
        const { data, error } = await apiFetch<CreditNoteDetail>(`/credit-notes/${creditNoteId}`);
        setDetail(data);
        setLoadError(error);
    }, [creditNoteId]);

    useEffect(() => {
        if (!creditNoteId) return;
        let isLeftPage = false;
        apiFetch<CreditNoteDetail>(`/credit-notes/${creditNoteId}`).then(({ data, error }) => {
            if (isLeftPage) return;
            setDetail(data);
            setLoadError(error);
        });
        return () => {
            isLeftPage = true;
        };
    }, [creditNoteId]);

    function closeDialogs() {
        setReasonAction(null);
        setConfirmAction(null);
        setActionError(null);
    }

    async function runAction(
        path: string,
        body: object,
        successMessage: string,
        options: { method?: "POST" | "DELETE"; navigateTo?: string } = {},
    ) {
        if (!detail) return;
        setIsWorking(true);
        setActionError(null);
        const { error } = await apiFetch(path, {
            method: options.method ?? "POST",
            body: { ...body, cn_version: detail.credit_note.cn_version },
        });
        setIsWorking(false);
        if (error) {
            setActionError(error.message);
            return;
        }
        toast.success(successMessage);
        closeDialogs();
        if (options.navigateTo) {
            router.push(options.navigateTo);
            return;
        }
        await reload();
    }

    if (!creditNoteId)
        return (
            <StatusBanner tone="error" title="ไม่พบใบลดหนี้นี้">
                กลับไปเลือกจากหน้ารายการ
            </StatusBanner>
        );
    if (loadError)
        return (
            <StatusBanner tone="error" title="โหลดใบลดหนี้ไม่สำเร็จ">
                {loadError.message}
            </StatusBanner>
        );
    if (!detail) return <PageSkeleton />;

    const { credit_note: creditNote, lines, invoice, currency, actions, approval } = detail;
    const decimals = currency.cur_decimals;
    const code = currency.cur_code;
    const status = STATUS_LABELS[creditNote.cn_status];
    const base = `/credit-notes/${creditNote.cn_id}`;
    const hasVat = Number(creditNote.cn_vat_rate) > 0;
    const correctTotal =
        parseHundredths(creditNote.cn_original_total, "มูลค่าเดิม") - parseHundredths(creditNote.cn_total, "ลดหนี้");
    const needsRefund = parseHundredths(creditNote.cn_refund_required, "ต้องคืน") > 0n;

    return (
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6">
            <PageHeader
                eyebrow={`ขาย · ใบลดหนี้ · ${creditNoteNumberLabel(creditNote)}`}
                title={`ลดหนี้ ${invoice.inv_number ?? ""}`}
                description={`${creditNote.client_company || creditNote.client_name} · สาขา ${creditNote.branch_code} ${creditNote.branch_name_th}`}
                actions={
                    <div className="flex flex-wrap items-center gap-1.5">
                        <StatusPill tone={status.tone}>{status.label}</StatusPill>
                        {creditNote.is_refund_due && <StatusPill tone="danger">รอคืนเงิน</StatusPill>}
                        {creditNote.is_refunded && <StatusPill tone="success">คืนเงินแล้ว</StatusPill>}
                    </div>
                }
            />

            <StatusGuide detail={detail} />

            <div className="flex flex-wrap gap-2">
                <a
                    href={`/sales/credit-notes/print?id=${creditNote.cn_id}`}
                    target="_blank"
                    rel="noopener"
                    className={buttonClass("secondary", "md")}
                >
                    <Printer size={16} />
                    {creditNote.cn_status === "issued" ? "พิมพ์ / บันทึก PDF" : "ดูตัวอย่างหน้าพิมพ์"}
                </a>
                {actions.can_edit && (
                    <Link
                        href={`/sales/credit-notes/edit?id=${creditNote.cn_id}`}
                        className={buttonClass("secondary", "md")}
                    >
                        <Pencil size={16} />
                        แก้ไขร่าง
                    </Link>
                )}
                {actions.can_submit && (
                    <button
                        type="button"
                        className={buttonClass("primary", "md")}
                        disabled={Boolean(detail.credit_blocked_reason)}
                        onClick={() => setConfirmAction("submit")}
                    >
                        <Send size={16} />
                        ส่งขออนุมัติ
                    </button>
                )}
                {actions.can_approve && (
                    <button
                        type="button"
                        className={buttonClass("primary", "md")}
                        onClick={() => setConfirmAction("approve")}
                    >
                        <ShieldCheck size={16} />
                        อนุมัติ
                    </button>
                )}
                {actions.can_return && (
                    <button
                        type="button"
                        className={buttonClass("secondary", "md")}
                        onClick={() => setReasonAction("return")}
                    >
                        <Undo2 size={16} />
                        ตีกลับ
                    </button>
                )}
                {actions.can_cancel_refund && (
                    <button
                        type="button"
                        className={buttonClass("ghost", "md")}
                        onClick={() => setConfirmAction("cancelRefund")}
                    >
                        <Undo2 size={16} />
                        ยกเลิกการคืนเงิน
                    </button>
                )}
                {actions.can_cancel && (
                    <button
                        type="button"
                        className={buttonClass("ghost", "md")}
                        onClick={() => setReasonAction("cancel")}
                    >
                        <XCircle size={16} />
                        ยกเลิกใบลดหนี้
                    </button>
                )}
                {actions.can_delete && (
                    <button
                        type="button"
                        className={buttonClass("ghost", "md")}
                        onClick={() => setConfirmAction("delete")}
                    >
                        <Trash2 size={16} />
                        ลบร่าง
                    </button>
                )}
            </div>
            {actions.cancel_blocked_reason && <FieldHint>{actions.cancel_blocked_reason}</FieldHint>}
            {detail.credit_blocked_reason &&
                (creditNote.cn_status === "draft" || creditNote.cn_status === "pending_approval") && (
                    <StatusBanner tone="warn" title="ตอนนี้ออกใบลดหนี้นี้ไม่ได้">
                        {detail.credit_blocked_reason}
                    </StatusBanner>
                )}

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
                <section className={`grid gap-5 p-5 sm:p-6 ${CARD_CLASS}`}>
                    <dl className="grid gap-3 text-sm sm:grid-cols-3">
                        <div>
                            <dt className="text-xs text-gray-500">วันที่</dt>
                            <dd>
                                {creditNote.cn_issue_date
                                    ? formatDateOnly(creditNote.cn_issue_date)
                                    : "ได้ตอนอนุมัติครบ"}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-xs text-gray-500">อ้างใบแจ้งหนี้</dt>
                            <dd>
                                <Link
                                    href={`/sales/invoices/view?id=${invoice.inv_id}`}
                                    className="-my-2.5 inline-block py-2.5 text-blue-600 tabular-nums hover:underline"
                                >
                                    {invoice.inv_number}
                                </Link>
                                {invoice.inv_issue_date ? ` · ${formatDateOnly(invoice.inv_issue_date)}` : ""}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-xs text-gray-500">เหตุผล</dt>
                            <dd>{creditNote.reason_label}</dd>
                        </div>
                        <div className="sm:col-span-3">
                            <dt className="text-xs text-gray-500">รายละเอียดเหตุผล (พิมพ์บนเอกสาร)</dt>
                            <dd className="whitespace-pre-line">{creditNote.cn_reason}</dd>
                        </div>
                    </dl>

                    <ul className="grid text-sm">
                        {lines.map((line) => (
                            <li
                                key={line.cnl_id}
                                className="flex items-start justify-between gap-3 border-b border-gray-100 py-2.5"
                            >
                                <span className="whitespace-pre-line text-gray-800">{line.cnl_description}</span>
                                <span className="shrink-0 tabular-nums">{formatAmount(line.cnl_amount, decimals)}</span>
                            </li>
                        ))}
                    </ul>

                    <div className="ml-auto grid w-full max-w-sm gap-1.5 text-sm">
                        <TotalRow
                            label="มูลค่าตามใบเดิม"
                            value={formatAmount(creditNote.cn_original_total, decimals)}
                        />
                        {hasVat && (
                            <>
                                <TotalRow
                                    label="ลด (ก่อน VAT)"
                                    value={`−${formatAmount(creditNote.cn_subtotal, decimals)}`}
                                />
                                <TotalRow
                                    label={`VAT ${creditNote.cn_vat_rate}% ของส่วนที่ลด`}
                                    value={`−${formatAmount(creditNote.cn_vat_amount, decimals)}`}
                                />
                            </>
                        )}
                        <div className="flex justify-between gap-3 font-medium text-gray-900">
                            <span>รวมลดหนี้ ({code})</span>
                            <span className="tabular-nums">{formatAmount(creditNote.cn_total, decimals)}</span>
                        </div>
                        <p className="text-xs text-gray-500">
                            {amountInWords(creditNote.cn_total, currency, creditNote.cn_language)}
                        </p>
                        <div className="flex justify-between gap-3 border-t border-gray-100 pt-1.5 font-medium text-gray-900">
                            <span>มูลค่าที่ถูกต้อง</span>
                            <span className="tabular-nums">
                                {formatAmount(formatHundredths(correctTotal), decimals)}
                            </span>
                        </div>
                        {creditNote.cn_status !== "issued" && creditNote.cn_status !== "cancelled" && (
                            <FieldHint>
                                ยอดคิดจากยอดของใบเดิม ณ ตอนบันทึกร่าง — ระบบคิดใหม่อีกครั้งตอนส่งขออนุมัติและตอนอนุมัติ
                            </FieldHint>
                        )}
                    </div>

                    {creditNote.cn_notes && (
                        <div className="grid gap-1 text-sm">
                            <h3 className="font-medium text-gray-900">หมายเหตุ</h3>
                            <p className="whitespace-pre-line text-gray-700">{creditNote.cn_notes}</p>
                        </div>
                    )}
                    {creditNote.cn_internal_note && (
                        <div className="grid gap-1 rounded-lg bg-gray-50 p-3 text-sm">
                            <h3 className="text-xs text-gray-500">บันทึกภายใน (ไม่พิมพ์บนเอกสาร)</h3>
                            <p className="whitespace-pre-line text-gray-700">{creditNote.cn_internal_note}</p>
                        </div>
                    )}
                </section>

                <div className="grid gap-5">
                    {creditNote.cn_status === "issued" && needsRefund && (
                        <RefundCard detail={detail} onSaved={reload} />
                    )}
                    <InvoiceBalanceCard detail={detail} />
                    <ApprovalProgress detail={detail} />
                </div>
            </div>

            <ConfirmDialog
                open={confirmAction === "submit"}
                variant="info"
                title="ส่งขออนุมัติ?"
                description={CREDIT_NOTE_MESSAGES.approval}
                consequences={[
                    "ระบบคิดยอดใหม่จากยอดล่าสุดของใบแจ้งหนี้",
                    "ระหว่างรออนุมัติแก้ไขไม่ได้ (ผู้อนุมัติตีกลับให้แก้ได้)",
                ]}
                confirmLabel="ส่งขออนุมัติ"
                loading={isWorking}
                errorMessage={actionError}
                onConfirm={() => runAction(`${base}/submit`, {}, "ส่งขออนุมัติแล้ว")}
                onCancel={closeDialogs}
            />
            <ConfirmDialog
                open={confirmAction === "approve"}
                variant="info"
                title="ยืนยันการอนุมัติ"
                description={
                    approval?.canApprove
                        ? `คุณกำลังอนุมัติชั้น ${approval.levels.join(" และชั้น ")}${approval.isFinal ? " (ชั้นสุดท้าย)" : ""}`
                        : ""
                }
                consequences={
                    approval?.isFinal
                        ? [
                              `ออกใบลดหนี้ทันที ได้เลขที่และวันที่ · ยอดค้างของ ${invoice.inv_number} ลด ${formatAmount(creditNote.cn_total, decimals)} ${code}`,
                              ...(needsRefund
                                  ? [
                                        `ลูกค้าจ่ายมาแล้ว — บริษัทต้องคืนเงิน ${formatAmount(creditNote.cn_refund_required, decimals)} ${code}`,
                                    ]
                                  : []),
                          ]
                        : [approval?.stopReason ?? "ยังมีชั้นถัดไปต้องอนุมัติต่อ"]
                }
                confirmLabel="อนุมัติ"
                loading={isWorking}
                errorMessage={actionError}
                onConfirm={() => runAction(`${base}/approve`, {}, "อนุมัติแล้ว")}
                onCancel={closeDialogs}
            />
            <ConfirmDialog
                open={confirmAction === "delete"}
                title="ลบร่างนี้?"
                description="ร่างจะถูกลบถาวร (รายการด้วย) · ใบแจ้งหนี้ไม่เปลี่ยน"
                confirmLabel="ลบ"
                loading={isWorking}
                errorMessage={actionError}
                onConfirm={() =>
                    runAction(base, {}, "ลบร่างแล้ว", {
                        method: "DELETE",
                        navigateTo: `/sales/invoices/view?id=${invoice.inv_id}`,
                    })
                }
                onCancel={closeDialogs}
            />
            <ConfirmDialog
                open={confirmAction === "cancelRefund"}
                variant="warning"
                title="ยกเลิกการคืนเงิน?"
                description={CREDIT_NOTE_MESSAGES.cancelRefund}
                consequences={["ถ้าโอนเงินไปแล้วจริง ต้องตกลงกับลูกค้าให้โอนกลับก่อน แล้วค่อยยกเลิกในระบบ"]}
                confirmLabel="ยกเลิกการคืนเงิน"
                loading={isWorking}
                errorMessage={actionError}
                onConfirm={() => runAction(`${base}/refund/cancel`, {}, "ยกเลิกการคืนเงินแล้ว")}
                onCancel={closeDialogs}
            />
            {reasonAction && (
                <ReasonDialog
                    open
                    title={REASON_DIALOGS[reasonAction].title}
                    description={REASON_DIALOGS[reasonAction].description}
                    reasonHint={REASON_DIALOGS[reasonAction].hint}
                    confirmLabel={REASON_DIALOGS[reasonAction].confirmLabel}
                    tone={reasonAction === "return" ? "primary" : "danger"}
                    loading={isWorking}
                    errorMessage={actionError}
                    onConfirm={(reason) => runAction(`${base}/${reasonAction}`, { reason }, "บันทึกแล้ว")}
                    onCancel={closeDialogs}
                />
            )}
        </div>
    );
}

function TotalRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between gap-3 text-gray-600">
            <span>{label}</span>
            <span className="tabular-nums">{value}</span>
        </div>
    );
}

// ยอดของใบแจ้งหนี้ตอนนี้ (หลังใบลดหนี้ทุกใบที่ออกแล้ว) — ให้เห็นผลของใบนี้ต่อยอดค้าง
function InvoiceBalanceCard({ detail }: { detail: CreditNoteDetail }) {
    const { invoice, currency } = detail;
    const decimals = currency.cur_decimals;
    const effectiveTotal =
        parseHundredths(invoice.inv_total, "ยอดรวม") - parseHundredths(invoice.inv_credited_amount, "ลดแล้ว");
    return (
        <section className={`grid gap-2 p-5 text-sm ${CARD_CLASS}`}>
            <h2 className="text-base font-medium text-gray-900">ใบแจ้งหนี้ {invoice.inv_number} ตอนนี้</h2>
            <TotalRow label="ยอดตามใบแจ้งหนี้" value={formatAmount(invoice.inv_total, decimals)} />
            <TotalRow
                label="ลดหนี้แล้ว (ใบที่ออกแล้วทุกใบ)"
                value={`−${formatAmount(invoice.inv_credited_amount, decimals)}`}
            />
            <TotalRow label="ยอดหลังลดหนี้" value={formatAmount(formatHundredths(effectiveTotal), decimals)} />
            <TotalRow label="รับแล้ว" value={formatAmount(invoice.inv_paid_amount, decimals)} />
            {parseHundredths(invoice.inv_refunded_amount, "คืนแล้ว") > 0n && (
                <TotalRow label="คืนเงินลูกค้าแล้ว" value={`−${formatAmount(invoice.inv_refunded_amount, decimals)}`} />
            )}
            <div className="flex justify-between gap-3 font-medium text-gray-900">
                <span>ค้างชำระ</span>
                <span className="tabular-nums">
                    {formatAmount(invoice.outstanding_amount, decimals)} {currency.cur_code}
                </span>
            </div>
            {parseHundredths(invoice.refund_due_amount, "ต้องคืน") > 0n && (
                <div className="flex justify-between gap-3 font-medium text-red-600">
                    <span>ลูกค้าจ่ายเกิน รอคืนเงิน</span>
                    <span className="tabular-nums">{formatAmount(invoice.refund_due_amount, decimals)}</span>
                </div>
            )}
        </section>
    );
}

// คืนเงินลูกค้า (N1-ก): แสดงยอดที่ต้องคืน · บันทึกคืน (ผู้มีสิทธิ์ refundCustomer) · คืนแล้วแสดงรายละเอียด
function RefundCard({ detail, onSaved }: { detail: CreditNoteDetail; onSaved: () => Promise<void> }) {
    const { credit_note: creditNote, currency, actions } = detail;
    const decimals = currency.cur_decimals;
    const required = parseHundredths(creditNote.cn_refund_required, "ต้องคืน");
    // ส่วนหัก ณ ที่จ่ายที่เสนอ = ยอดต้องคืน × หักประมาณของใบ ÷ ยอดใบ (สูตรเดียวกับ backend)
    const invoiceTotal = parseHundredths(detail.invoice.inv_total, "ยอดรวม");
    const proportionalWithholding =
        invoiceTotal > 0n
            ? roundToCurrency(
                  divideRoundHalfUp(required * parseHundredths(detail.invoice.inv_wht_amount, "หัก"), invoiceTotal),
                  decimals,
              )
            : 0n;
    const suggestedWithholding = proportionalWithholding > required ? required : proportionalWithholding;

    const [isOpen, setIsOpen] = useState(false);
    const [banks, setBanks] = useState<BankAccountOption[]>([]);
    const [refundDate, setRefundDate] = useState("");
    const [bankId, setBankId] = useState("");
    const [withholding, setWithholding] = useState(formatHundredths(suggestedWithholding));
    const [amount, setAmount] = useState(formatHundredths(required - suggestedWithholding));
    const [reference, setReference] = useState("");
    const [note, setNote] = useState("");
    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
    const [saveError, setSaveError] = useState<ApiError | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        let isLeftPage = false;
        apiFetch<{ bank_accounts: BankAccountOption[] }>("/company").then(({ data }) => {
            if (isLeftPage) return;
            const usable = (data?.bank_accounts ?? []).filter(
                (account) => account.ba_status === "active" && account.ba_currency === currency.cur_code,
            );
            setBanks(usable);
            setBankId(
                (current) => current || (usable.find((account) => account.ba_is_default) ?? usable[0])?.ba_id || "",
            );
        });
        return () => {
            isLeftPage = true;
        };
    }, [isOpen, currency.cur_code]);

    async function save(event: React.FormEvent) {
        event.preventDefault();
        const checked = creditNoteRefundSchema.safeParse({
            cn_refund_date: refundDate,
            cn_refund_bank_account_id: bankId,
            cn_refund_amount: amount,
            cn_refund_wht: withholding,
            cn_refund_reference: reference,
            cn_refund_note: note,
            cn_version: creditNote.cn_version,
        });
        if (!checked.success) {
            setFieldErrors(toFieldErrors(checked.error.issues));
            return;
        }
        setFieldErrors({});
        setIsSaving(true);
        const { error } = await apiFetch(`/credit-notes/${creditNote.cn_id}/refund`, {
            method: "POST",
            body: checked.data,
        });
        setIsSaving(false);
        if (error) {
            setFieldErrors(error.fields);
            setSaveError(error);
            return;
        }
        toast.success("บันทึกคืนเงินลูกค้าแล้ว");
        setIsOpen(false);
        await onSaved();
    }

    return (
        <section className={`grid gap-3 p-5 text-sm ${CARD_CLASS}`}>
            <h2 className="text-base font-medium text-gray-900">คืนเงินลูกค้า</h2>
            <div className="grid gap-1.5 rounded-xl bg-gray-50 p-3">
                <TotalRow
                    label="ยอดค้างก่อนลดหนี้ (ณ ตอนออก)"
                    value={formatAmount(creditNote.cn_outstanding_before, decimals)}
                />
                <TotalRow label="รวมลดหนี้" value={formatAmount(creditNote.cn_total, decimals)} />
                <div className="flex justify-between gap-3 font-medium text-gray-900">
                    <span>ลูกค้าจ่ายเกิน = ต้องคืน</span>
                    <span className="tabular-nums">
                        {formatAmount(creditNote.cn_refund_required, decimals)} {currency.cur_code}
                    </span>
                </div>
            </div>
            {creditNote.is_refunded ? (
                <div className="grid gap-1.5 rounded-xl bg-gray-50 p-3">
                    <TotalRow label="โอนคืน" value={formatAmount(creditNote.cn_refund_amount, decimals)} />
                    <TotalRow
                        label="หัก ณ ที่จ่ายที่ไม่ต้องคืน"
                        value={formatAmount(creditNote.cn_refund_wht, decimals)}
                    />
                    <p className="text-xs text-gray-600">
                        {creditNote.cn_refund_date ? formatDateOnly(creditNote.cn_refund_date) : ""} · จาก{" "}
                        {creditNote.refund_bank_name} {creditNote.refund_account_no}
                        {creditNote.cn_refund_reference ? ` · อ้างอิง ${creditNote.cn_refund_reference}` : ""}
                    </p>
                    <p className="text-xs text-gray-500">
                        บันทึกโดย {creditNote.refunded_by_name} · {formatDate(creditNote.cn_refunded_at ?? "")}
                    </p>
                </div>
            ) : (
                <>
                    <FieldHint>{CREDIT_NOTE_MESSAGES.refund}</FieldHint>
                    {actions.can_refund && !isOpen && (
                        <button
                            type="button"
                            className={`${buttonClass("primary", "md")} justify-self-start`}
                            onClick={() => setIsOpen(true)}
                        >
                            <Banknote size={16} />
                            บันทึกคืนเงิน
                        </button>
                    )}
                    {!actions.can_refund && (
                        <FieldHint>
                            ผู้ที่มีสิทธิ์ &quot;บันทึกคืนเงินลูกค้า&quot; เป็นผู้บันทึกเมื่อโอนคืนแล้ว
                        </FieldHint>
                    )}
                    {isOpen && (
                        <form onSubmit={save} noValidate className="grid gap-3">
                            <FormField
                                label="วันที่โอนคืน"
                                htmlFor="cn_refund_date"
                                required
                                error={fieldErrors.cn_refund_date}
                            >
                                <input
                                    id="cn_refund_date"
                                    type="date"
                                    value={refundDate}
                                    onChange={(event) => setRefundDate(event.target.value)}
                                    className={inputClass(Boolean(fieldErrors.cn_refund_date))}
                                />
                            </FormField>
                            <FormField
                                label="โอนออกจากบัญชี"
                                htmlFor="cn_refund_bank_account_id"
                                required
                                error={fieldErrors.cn_refund_bank_account_id}
                            >
                                <select
                                    id="cn_refund_bank_account_id"
                                    value={bankId}
                                    onChange={(event) => setBankId(event.target.value)}
                                    className={inputClass(Boolean(fieldErrors.cn_refund_bank_account_id))}
                                >
                                    <option value="">— เลือกบัญชี —</option>
                                    {banks.map((account) => (
                                        <option key={account.ba_id} value={account.ba_id}>
                                            {account.ba_bank_name} {account.ba_account_no}
                                        </option>
                                    ))}
                                </select>
                            </FormField>
                            <FormField
                                label="หัก ณ ที่จ่ายที่ไม่ต้องคืน"
                                htmlFor="cn_refund_wht"
                                hint={CREDIT_NOTE_MESSAGES.refundWithholding}
                                error={fieldErrors.cn_refund_wht}
                            >
                                <input
                                    id="cn_refund_wht"
                                    inputMode="decimal"
                                    value={withholding}
                                    onChange={(event) => setWithholding(event.target.value)}
                                    className={`${inputClass(Boolean(fieldErrors.cn_refund_wht))} text-right tabular-nums`}
                                />
                            </FormField>
                            <FormField
                                label="ยอดโอนคืน"
                                htmlFor="cn_refund_amount"
                                required
                                hint={`โอนคืน + หัก ณ ที่จ่าย ต้องเท่ากับ ${formatAmount(creditNote.cn_refund_required, decimals)}`}
                                error={fieldErrors.cn_refund_amount}
                            >
                                <input
                                    id="cn_refund_amount"
                                    inputMode="decimal"
                                    value={amount}
                                    onChange={(event) => setAmount(event.target.value)}
                                    className={`${inputClass(Boolean(fieldErrors.cn_refund_amount))} text-right tabular-nums`}
                                />
                            </FormField>
                            <FormField
                                label="เลขอ้างอิงการโอน"
                                htmlFor="cn_refund_reference"
                                error={fieldErrors.cn_refund_reference}
                            >
                                <input
                                    id="cn_refund_reference"
                                    maxLength={100}
                                    value={reference}
                                    onChange={(event) => setReference(event.target.value)}
                                    className={inputClass(Boolean(fieldErrors.cn_refund_reference))}
                                />
                            </FormField>
                            <FormField label="หมายเหตุ" htmlFor="cn_refund_note" error={fieldErrors.cn_refund_note}>
                                <input
                                    id="cn_refund_note"
                                    maxLength={500}
                                    value={note}
                                    onChange={(event) => setNote(event.target.value)}
                                    className={inputClass(Boolean(fieldErrors.cn_refund_note))}
                                />
                            </FormField>
                            <SaveErrorBanner error={saveError} />
                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    className={buttonClass("secondary", "md")}
                                    onClick={() => setIsOpen(false)}
                                >
                                    ปิด
                                </button>
                                <button type="submit" className={buttonClass("primary", "md")} disabled={isSaving}>
                                    {isSaving ? "กำลังบันทึก..." : "บันทึกคืนเงิน"}
                                </button>
                            </div>
                        </form>
                    )}
                </>
            )}
        </section>
    );
}

// ความคืบหน้าอนุมัติ (รอบปัจจุบัน) + ประวัติทุกรอบ
function ApprovalProgress({ detail }: { detail: CreditNoteDetail }) {
    const { credit_note: creditNote, approval_history: history } = detail;
    const plan = creditNote.cn_approval_plan ?? [];
    const thisRound = history.filter(
        (row) => row.cna_round === creditNote.cn_approval_round && row.cna_action === "approve",
    );
    const showPlan = plan.length > 0 && creditNote.cn_status !== "draft";

    return (
        <section className={`grid gap-4 p-5 ${CARD_CLASS}`}>
            <h2 className="text-base font-medium text-gray-900">การอนุมัติ</h2>
            {!showPlan && history.length === 0 && (
                <p className="text-sm text-gray-500">{CREDIT_NOTE_MESSAGES.approval}</p>
            )}
            {showPlan && (
                <ol className="grid gap-2">
                    {plan.map((level) => {
                        const approved = thisRound.find((row) => row.cna_level === level.level);
                        const isWaiting =
                            creditNote.cn_status === "pending_approval" &&
                            creditNote.cn_approval_current_level === level.level;
                        const Icon = approved ? CheckCircle2 : isWaiting ? Clock : Circle;
                        const tone = approved ? "text-green-600" : isWaiting ? "text-amber-600" : "text-gray-300";
                        return (
                            <li key={level.level} className="flex items-start gap-3">
                                <Icon size={18} className={`mt-0.5 shrink-0 ${tone}`} />
                                <div className="grid gap-0.5 text-sm">
                                    <span className="text-gray-800">
                                        ชั้น {level.level} · {level.roles.map((role) => role.role_name).join(", ")}
                                    </span>
                                    <span className="text-xs text-gray-500">
                                        {approved
                                            ? `อนุมัติโดย ${approved.cna_user_name} · ${formatDate(approved.cna_created_at)}`
                                            : isWaiting
                                              ? "รออนุมัติชั้นนี้"
                                              : "—"}
                                    </span>
                                </div>
                            </li>
                        );
                    })}
                </ol>
            )}
            {history.length > 0 && (
                <details className="text-sm">
                    <summary className="-my-2 cursor-pointer py-2 text-blue-600">
                        ประวัติการอนุมัติทุกรอบ ({history.length})
                    </summary>
                    <ul className="mt-2 grid gap-2">
                        {history.map((row) => (
                            <li key={row.cna_id} className="grid gap-0.5 rounded-lg bg-gray-50 p-2">
                                <span className="text-gray-800">
                                    รอบ {row.cna_round} · ชั้น {row.cna_level} ·{" "}
                                    {row.cna_action === "approve" ? "อนุมัติ" : "ตีกลับ"} โดย {row.cna_user_name}
                                </span>
                                {row.cna_reason && (
                                    <span className="text-xs text-gray-600">เหตุผล: {row.cna_reason}</span>
                                )}
                                <span className="text-xs text-gray-500">{formatDate(row.cna_created_at)}</span>
                            </li>
                        ))}
                    </ul>
                </details>
            )}
        </section>
    );
}

// แถบสถานะ: ตอนนี้เป็นอย่างไร · รออะไร/ใคร · ต้องทำอะไรต่อ
function StatusGuide({ detail }: { detail: CreditNoteDetail }) {
    const { credit_note: creditNote, approval, currency } = detail;
    const plan = creditNote.cn_approval_plan ?? [];
    const currentLevel = plan.find((level) => level.level === creditNote.cn_approval_current_level);

    switch (creditNote.cn_status) {
        case "draft":
            if (creditNote.cn_returned_reason) {
                return (
                    <StatusBanner tone="warn" title="ถูกตีกลับ — แก้แล้วส่งขออนุมัติใหม่">
                        เหตุผล: {creditNote.cn_returned_reason}
                    </StatusBanner>
                );
            }
            return (
                <StatusBanner tone="info" title="ร่าง — ยังไม่มีเลขที่ และยังไม่ลดยอดของใบแจ้งหนี้">
                    {CREDIT_NOTE_MESSAGES.approval}
                </StatusBanner>
            );
        case "pending_approval":
            if (approval?.canApprove) {
                return (
                    <StatusBanner tone="wait" title={`รอคุณอนุมัติชั้น ${creditNote.cn_approval_current_level}`}>
                        กดอนุมัติแล้วจะผ่านชั้น {approval.levels.join(", ")}
                        {approval.isFinal
                            ? " ซึ่งเป็นชั้นสุดท้าย — ระบบออกใบลดหนี้ให้ทันที"
                            : ` · ${approval.stopReason ?? ""}`}
                    </StatusBanner>
                );
            }
            return (
                <StatusBanner
                    tone="wait"
                    title={`รออนุมัติชั้น ${creditNote.cn_approval_current_level}/${plan.length}`}
                >
                    ผู้อนุมัติชั้นนี้: {currentLevel?.roles.map((role) => role.role_name).join(", ")}
                    {approval?.reason ? ` · คุณอนุมัติไม่ได้: ${approval.reason}` : ""}
                </StatusBanner>
            );
        case "issued":
            if (creditNote.is_refund_due) {
                return (
                    <StatusBanner tone="error" title="ออกแล้ว — รอคืนเงินลูกค้า">
                        ลูกค้าจ่ายเกินยอดหลังลดหนี้ {formatAmount(creditNote.cn_refund_required, currency.cur_decimals)}{" "}
                        {currency.cur_code} · โอนคืนแล้วบันทึกในส่วน &quot;คืนเงินลูกค้า&quot;
                    </StatusBanner>
                );
            }
            return (
                <StatusBanner
                    tone="done"
                    title={`ออกแล้ว ${creditNote.cn_issue_date ? formatDateOnly(creditNote.cn_issue_date) : ""}`}
                >
                    ยอดค้างของใบแจ้งหนี้ลดแล้ว · พิมพ์ส่งลูกค้าได้
                    {creditNote.cn_issued_by_name ? ` · ผู้อนุมัติ ${creditNote.cn_issued_by_name}` : ""}
                </StatusBanner>
            );
        case "cancelled":
            return (
                <StatusBanner tone="error" title="ยกเลิกแล้ว">
                    เหตุผล: {creditNote.cn_cancel_reason} · เลขที่ยังคงอยู่ ไม่นำกลับมาใช้ ·
                    ยอดค้างของใบแจ้งหนี้กลับเป็นเหมือนก่อนลดหนี้
                </StatusBanner>
            );
        default:
            return null;
    }
}
