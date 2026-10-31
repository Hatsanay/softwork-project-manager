"use client";

// หน้าเอกสารใบแจ้งหนี้ (2026-10-14 ขั้น 1B-3) — สถานะ + สิ่งที่ทำได้ตอนนี้ (ปุ่มที่ทำไม่ได้ซ่อน พร้อมเหตุผลในแถบสถานะ)
// เนื้อหาเอกสาร · ยอดหลังหัก ณ ที่จ่าย · บัญชีรับเงิน + QR พร้อมเพย์ · งวดที่เรียกเก็บ · การอนุมัติ (ใบสร้างเอง)
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
    CheckCircle2,
    Circle,
    Clock,
    Banknote,
    FileCheck2,
    FileMinus2,
    FilePlus2,
    Pencil,
    Printer,
    RefreshCcw,
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
import PromptPayQr from "@/components/ui/promptpay-qr";
import { CARD_CLASS } from "@/components/ui/card";
import { PageSkeleton } from "@/components/ui/skeleton";
import { buttonClass } from "@/components/ui/button";
import formatDate, { formatDateOnly } from "@/app/function";
import { apiFetch, type ApiError } from "@/lib/api";
import { formatAmount, formatQuantity, parseHundredths } from "@/lib/shared/money.mjs";
import { amountInWords } from "@/lib/shared/amount-in-words.mjs";
import { displayRate } from "../../quotations/_format";
import { INVOICE_MESSAGES, PAYMENT_STATE_PILLS, STATUS_LABELS } from "../_messages";
import { DEBIT_NOTE_REASONS } from "@/lib/shared/schemas/invoice.mjs";
import { dueLabel, invoiceNumberLabel, percentLabel } from "../_format";
import type { InvoiceDetail } from "../_types";
import { METHOD_LABELS } from "../../receipts/_messages";

type ReasonAction = "return" | "cancel" | "reissue";

const CREDIT_NOTE_STATUS_SHORT = {
    draft: "ร่าง",
    pending_approval: "รออนุมัติ",
    issued: "ออกแล้ว",
    cancelled: "ยกเลิก",
} as const;
type ConfirmAction = "issue" | "issueWithNewVat" | "submit" | "approve" | "send" | "delete";

const REASON_DIALOGS: Record<ReasonAction, { title: string; description: string; confirmLabel: string; hint: string }> =
    {
        return: {
            title: "ตีกลับให้ผู้สร้างแก้?",
            description: "ใบกลับเป็นร่าง ผู้สร้างแก้แล้วส่งใหม่ได้ · ส่งใหม่ต้องเริ่มอนุมัติชั้น 1 ใหม่",
            confirmLabel: "ตีกลับ",
            hint: "ผู้สร้างจะเห็นเหตุผลนี้บนใบ เช่น ราคาต่อหน่วยผิด",
        },
        cancel: {
            title: "ยกเลิกใบแจ้งหนี้นี้?",
            description: "เลขที่ยังคงอยู่ (ไม่นำกลับมาใช้) · งวดที่ผูกกลับมาออกบิลใหม่ได้ · ยกเลิกแล้วกู้คืนไม่ได้",
            confirmLabel: "ยกเลิกใบ",
            hint: "เหตุผลจะแสดงบนใบและในประวัติ เช่น ลูกค้าขอเปลี่ยนชื่อผู้ซื้อ",
        },
        reissue: {
            title: "ยกเลิกแล้วออกใบใหม่แทน?",
            description:
                "ใบนี้จะถูกยกเลิก (เลขยังอยู่) แล้วได้ร่างใหม่ที่คัดลอกข้อมูลมาให้ แก้แล้วออกใหม่ได้ · ใบใหม่อ้างกลับมาที่ใบนี้",
            confirmLabel: "ยกเลิกและสร้างร่างใหม่",
            hint: "เหตุผลจะแสดงบนใบที่ยกเลิก เช่น ลูกค้าขอแก้ชื่อเรื่อง",
        },
    };

export default function InvoiceViewPage() {
    const router = useRouter();
    const invoiceId = useSearchParams().get("id");
    const [detail, setDetail] = useState<InvoiceDetail | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);
    const [reasonAction, setReasonAction] = useState<ReasonAction | null>(null);
    const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [vatChangeMessage, setVatChangeMessage] = useState<string | null>(null);
    const [isWorking, setIsWorking] = useState(false);

    const reload = useCallback(async () => {
        if (!invoiceId) return;
        const { data, error } = await apiFetch<InvoiceDetail>(`/invoices/${invoiceId}`);
        setDetail(data);
        setLoadError(error);
    }, [invoiceId]);

    useEffect(() => {
        if (!invoiceId) return;
        let isLeftPage = false;
        apiFetch<InvoiceDetail>(`/invoices/${invoiceId}`).then(({ data, error }) => {
            if (isLeftPage) return;
            setDetail(data);
            setLoadError(error);
        });
        return () => {
            isLeftPage = true;
        };
    }, [invoiceId]);

    function closeDialogs() {
        setReasonAction(null);
        setConfirmAction(null);
        setActionError(null);
    }

    async function runAction(
        path: string,
        body: object,
        successMessage: string,
        options: { method?: "POST" | "DELETE"; navigateTo?: (data: { inv_id?: string }) => string } = {},
    ) {
        if (!detail) return;
        setIsWorking(true);
        setActionError(null);
        const { data, error } = await apiFetch<{ inv_id?: string }>(path, {
            method: options.method ?? "POST",
            body: { ...body, inv_version: detail.invoice.inv_version },
        });
        setIsWorking(false);
        if (error) {
            // VAT วันนี้ต่างจากใบเสนอราคา — เปลี่ยนเป็นหน้าต่างยืนยันยอดใหม่ (R-B4)
            if (error.code === "INVOICE_VAT_CHANGED") {
                setVatChangeMessage(error.message);
                setConfirmAction("issueWithNewVat");
                return;
            }
            setActionError(error.message);
            return;
        }
        toast.success(successMessage);
        closeDialogs();
        if (options.navigateTo) {
            router.push(options.navigateTo(data ?? {}));
            return;
        }
        await reload();
    }

    if (!invoiceId)
        return (
            <StatusBanner tone="error" title="ไม่พบใบแจ้งหนี้นี้">
                กลับไปเลือกจากหน้ารายการ
            </StatusBanner>
        );
    if (loadError)
        return (
            <StatusBanner tone="error" title="โหลดใบแจ้งหนี้ไม่สำเร็จ">
                {loadError.message}
            </StatusBanner>
        );
    if (!detail) return <PageSkeleton />;

    const { invoice, currency, actions, approval, readiness, payment } = detail;
    const decimals = currency.cur_decimals;
    const code = currency.cur_code;
    const status = STATUS_LABELS[invoice.inv_status];
    const base = `/invoices/${invoice.inv_id}`;
    const isReady = readiness.every((check) => check.ok);
    const hasWithholding = parseHundredths(invoice.inv_wht_amount, "หัก ณ ที่จ่าย") > 0n;
    const hasCredits = detail.credit_notes.some((creditNote) => creditNote.cn_status === "issued");
    const due = dueLabel(invoice);

    const approveConsequences = approval?.canApprove
        ? [
              approval.isFinal
                  ? "อนุมัติชั้นสุดท้าย = ออกใบแจ้งหนี้ทันที ได้เลขที่ วันที่ และวันครบกำหนด แก้ไขไม่ได้อีก"
                  : (approval.stopReason ?? "ยังมีชั้นถัดไปต้องอนุมัติต่อ"),
          ]
        : [];

    const hasDecisionBar =
        actions.can_issue ||
        actions.can_submit ||
        actions.can_approve ||
        actions.can_return ||
        actions.can_send ||
        actions.can_receive;
    // แถบปุ่มลอยบนมือถือ: ปุ่มเกิน 1 ปุ่มขึ้นสองแถว (ข้อความไม่ถูกตัด) — เว้นที่ท้ายหน้ามากขึ้นตาม
    const decisionCount = [
        actions.can_issue,
        actions.can_submit,
        actions.can_approve,
        actions.can_return,
        actions.can_send,
        actions.can_receive,
    ].filter(Boolean).length;
    const isDebitNote = invoice.inv_doc_type === "debit_note";
    const paymentPill =
        invoice.payment_state && invoice.payment_state !== "unpaid" ? PAYMENT_STATE_PILLS[invoice.payment_state] : null;

    return (
        <div
            className={`grid w-full grid-cols-1 gap-6 ${decisionCount > 1 ? "max-sm:pb-48" : hasDecisionBar ? "max-sm:pb-32" : ""}`}
        >
            <PageHeader
                eyebrow={`ขาย · ${isDebitNote ? "ใบเพิ่มหนี้" : "ใบแจ้งหนี้"} · ${invoiceNumberLabel(invoice)}`}
                title={invoice.inv_title}
                description={`${invoice.client_name} · สาขา ${invoice.branch_code} ${invoice.branch_name_th}`}
                actions={
                    <div className="flex flex-wrap items-center gap-1.5">
                        {isDebitNote && <StatusPill tone="info">ใบเพิ่มหนี้</StatusPill>}
                        <StatusPill tone={status.tone}>{status.label}</StatusPill>
                        {paymentPill && <StatusPill tone={paymentPill.tone}>{paymentPill.label}</StatusPill>}
                        {due && <StatusPill tone={invoice.is_overdue ? "danger" : "neutral"}>{due}</StatusPill>}
                    </div>
                }
            />

            <StatusGuide detail={detail} />

            {invoice.inv_status === "draft" && invoice.inv_source === "manual" && (
                <section className={`grid gap-3 p-5 ${CARD_CLASS}`}>
                    <h2 className="text-base font-medium text-gray-900">ก่อนส่งขออนุมัติ</h2>
                    <ul className="grid gap-1.5 text-sm">
                        {readiness.map((check) => (
                            <li key={check.key} className="flex items-center gap-2">
                                {check.ok ? (
                                    <CheckCircle2 size={16} className="text-green-600" />
                                ) : (
                                    <Circle size={16} className="text-amber-600" />
                                )}
                                <span className={check.ok ? "text-gray-700" : "text-amber-600"}>{check.message}</span>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            <div className="flex flex-wrap gap-2">
                <a
                    href={`/sales/invoices/print?id=${invoice.inv_id}`}
                    target="_blank"
                    rel="noopener"
                    className={buttonClass("secondary", "md")}
                >
                    <Printer size={16} />
                    {invoice.inv_status === "issued" ? "พิมพ์ / บันทึก PDF" : "ดูตัวอย่างหน้าพิมพ์"}
                </a>
                {actions.can_edit && (
                    <Link href={`/sales/invoices/edit?id=${invoice.inv_id}`} className={buttonClass("secondary", "md")}>
                        <Pencil size={16} />
                        แก้ไขร่าง
                    </Link>
                )}
                {actions.can_issue && (
                    <button
                        type="button"
                        className={`${buttonClass("primary", "md")} max-sm:hidden`}
                        onClick={() => setConfirmAction("issue")}
                    >
                        <FileCheck2 size={16} />
                        ออกใบแจ้งหนี้
                    </button>
                )}
                {actions.can_submit && (
                    <button
                        type="button"
                        className={`${buttonClass("primary", "md")} max-sm:hidden`}
                        disabled={!isReady}
                        onClick={() => setConfirmAction("submit")}
                    >
                        <Send size={16} />
                        ส่งขออนุมัติ
                    </button>
                )}
                {actions.can_approve && (
                    <button
                        type="button"
                        className={`${buttonClass("primary", "md")} max-sm:hidden`}
                        onClick={() => setConfirmAction("approve")}
                    >
                        <ShieldCheck size={16} />
                        อนุมัติ
                    </button>
                )}
                {actions.can_return && (
                    <button
                        type="button"
                        className={`${buttonClass("secondary", "md")} max-sm:hidden`}
                        onClick={() => setReasonAction("return")}
                    >
                        <Undo2 size={16} />
                        ตีกลับ
                    </button>
                )}
                {actions.can_send && (
                    <button
                        type="button"
                        className={`${buttonClass("primary", "md")} max-sm:hidden`}
                        onClick={() => setConfirmAction("send")}
                    >
                        <Send size={16} />
                        บันทึกว่าส่งลูกค้าแล้ว
                    </button>
                )}
                {actions.can_receive && (
                    <Link
                        href={`/sales/receipts/new?invoice=${invoice.inv_id}`}
                        className={`${buttonClass("primary", "md")} max-sm:hidden`}
                    >
                        <Banknote size={16} />
                        บันทึกรับเงิน
                    </Link>
                )}
                {actions.can_credit && (
                    <Link
                        href={`/sales/credit-notes/new?invoice=${invoice.inv_id}`}
                        className={buttonClass("secondary", "md")}
                    >
                        <FileMinus2 size={16} />
                        ออกใบลดหนี้
                    </Link>
                )}
                {actions.can_debit && (
                    <Link
                        href={`/sales/invoices/new?debit_for=${invoice.inv_id}`}
                        className={buttonClass("secondary", "md")}
                    >
                        <FilePlus2 size={16} />
                        ออกใบเพิ่มหนี้
                    </Link>
                )}
                {actions.can_reissue && (
                    <button
                        type="button"
                        className={buttonClass("ghost", "md")}
                        onClick={() => setReasonAction("reissue")}
                    >
                        <RefreshCcw size={16} />
                        ยกเลิกแล้วออกใหม่แทน
                    </button>
                )}
                {actions.can_cancel && (
                    <button
                        type="button"
                        className={buttonClass("ghost", "md")}
                        onClick={() => setReasonAction("cancel")}
                    >
                        <XCircle size={16} />
                        ยกเลิกใบ
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
            {actions.credit_blocked_reason && <FieldHint>ออกใบลดหนี้ไม่ได้: {actions.credit_blocked_reason}</FieldHint>}
            {actions.debit_blocked_reason && (
                <FieldHint>ออกใบเพิ่มหนี้ไม่ได้: {actions.debit_blocked_reason}</FieldHint>
            )}
            {actions.can_submit && !isReady && (
                <p className="text-xs text-amber-600">
                    ส่งขออนุมัติได้เมื่อผ่านทุกข้อในรายการ &quot;ก่อนส่งขออนุมัติ&quot;
                </p>
            )}

            {hasDecisionBar && (
                <DecisionBar
                    label={invoice.inv_status === "issued" ? "ค้างชำระ" : "รวมทั้งสิ้น"}
                    total={`${formatAmount(invoice.inv_status === "issued" ? invoice.outstanding_amount : invoice.inv_total, decimals)} ${code}`}
                >
                    {actions.can_issue && (
                        <button
                            type="button"
                            className={`${buttonClass("primary", "md")} flex-1`}
                            onClick={() => setConfirmAction("issue")}
                        >
                            <FileCheck2 size={16} />
                            ออกใบแจ้งหนี้
                        </button>
                    )}
                    {actions.can_submit && (
                        <button
                            type="button"
                            className={`${buttonClass("primary", "md")} flex-1`}
                            disabled={!isReady}
                            onClick={() => setConfirmAction("submit")}
                        >
                            <Send size={16} />
                            ส่งขออนุมัติ
                        </button>
                    )}
                    {actions.can_return && (
                        <button
                            type="button"
                            className={`${buttonClass("secondary", "md")} flex-1`}
                            onClick={() => setReasonAction("return")}
                        >
                            <Undo2 size={16} />
                            ตีกลับ
                        </button>
                    )}
                    {actions.can_approve && (
                        <button
                            type="button"
                            className={`${buttonClass("primary", "md")} flex-1`}
                            onClick={() => setConfirmAction("approve")}
                        >
                            <ShieldCheck size={16} />
                            อนุมัติ
                        </button>
                    )}
                    {actions.can_send && (
                        <button
                            type="button"
                            className={`${buttonClass("primary", "md")} flex-1`}
                            onClick={() => setConfirmAction("send")}
                        >
                            <Send size={16} />
                            บันทึกว่าส่งลูกค้าแล้ว
                        </button>
                    )}
                    {actions.can_receive && (
                        <Link
                            href={`/sales/receipts/new?invoice=${invoice.inv_id}`}
                            className={`${buttonClass("primary", "md")} flex-1`}
                        >
                            <Banknote size={16} />
                            บันทึกรับเงิน
                        </Link>
                    )}
                </DecisionBar>
            )}

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
                <section className={`grid gap-5 p-5 sm:p-6 ${CARD_CLASS}`}>
                    <dl className="grid gap-3 text-sm sm:grid-cols-3">
                        <div>
                            <dt className="text-xs text-gray-500">วันที่</dt>
                            <dd>{invoice.inv_issue_date ? formatDateOnly(invoice.inv_issue_date) : "ได้ตอนออกใบ"}</dd>
                        </div>
                        <div>
                            <dt className="text-xs text-gray-500">ครบกำหนด</dt>
                            <dd className={invoice.is_overdue ? "text-red-600" : undefined}>
                                {invoice.inv_due_date
                                    ? formatDateOnly(invoice.inv_due_date)
                                    : `${invoice.inv_credit_days} วันนับจากวันที่ออก`}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-xs text-gray-500">สกุลเงิน / ภาษา</dt>
                            <dd>
                                {code} · {invoice.inv_language === "th" ? "ไทย" : "อังกฤษ"}
                            </dd>
                        </div>
                        {invoice.inv_currency !== "THB" && (
                            <div className="sm:col-span-3">
                                <dt className="text-xs text-gray-500">อัตราแลกเปลี่ยน (ใช้คิดยอดบาทภายใน)</dt>
                                <dd>
                                    {displayRate(invoice.inv_exchange_rate)} บาท/{code} (
                                    {invoice.inv_rate_source === "bot"
                                        ? `ธปท. ${formatDateOnly(invoice.inv_rate_date)}`
                                        : `กรอกเอง · ${invoice.inv_rate_override_reason ?? ""}`}
                                    )
                                </dd>
                            </div>
                        )}
                    </dl>

                    <ItemsList detail={detail} />

                    <div className="ml-auto grid w-full max-w-sm gap-1.5 text-sm">
                        <TotalRow label="รวมเป็นเงิน" value={formatAmount(invoice.inv_subtotal, decimals)} />
                        {parseHundredths(invoice.inv_discount_amount, "ส่วนลด") > 0n && (
                            <TotalRow
                                label="ส่วนลดท้ายบิล"
                                value={`−${formatAmount(invoice.inv_discount_amount, decimals)}`}
                            />
                        )}
                        <TotalRow
                            label={`VAT ${Number(invoice.inv_vat_rate) > 0 ? `${invoice.inv_vat_rate}%` : ""}`}
                            value={
                                Number(invoice.inv_vat_rate) > 0
                                    ? formatAmount(invoice.inv_vat_amount, decimals)
                                    : "ไม่คิด"
                            }
                        />
                        <div className="flex justify-between border-t border-gray-100 pt-1.5 text-base font-medium text-gray-900">
                            <span>รวมทั้งสิ้น ({code})</span>
                            <span className="tabular-nums">{formatAmount(invoice.inv_total, decimals)}</span>
                        </div>
                        <p className="text-xs text-gray-500">
                            {amountInWords(invoice.inv_total, currency, invoice.inv_language)}
                        </p>
                        {hasCredits && (
                            // มีใบลดหนี้: ยอดหลังหัก ณ ที่จ่ายของใบเดิมใช้ไม่ได้แล้ว — ไม่พิมพ์ซ้ำที่นี่ (กติกาเงิน 3.8)
                            <FieldHint>
                                ใบนี้มีใบลดหนี้ · ยอดหลังลดหนี้และยอดที่ลูกค้าต้องโอนดูในส่วน &quot;การชำระเงิน&quot;
                            </FieldHint>
                        )}
                        {hasWithholding && !hasCredits && (
                            <>
                                <TotalRow
                                    label={`หัก ณ ที่จ่าย ${percentLabel(invoice.inv_wht_rate)}% (ประมาณ)`}
                                    value={`−${formatAmount(invoice.inv_wht_amount, decimals)}`}
                                />
                                <div className="flex justify-between font-medium text-gray-900">
                                    <span>ยอดชำระหลังหัก ณ ที่จ่าย</span>
                                    <span className="tabular-nums">{formatAmount(payment.net_payable, decimals)}</span>
                                </div>
                                <FieldHint>{INVOICE_MESSAGES.withholding}</FieldHint>
                            </>
                        )}
                        {invoice.inv_currency !== "THB" && (
                            <p className="text-xs text-gray-500">
                                เทียบเป็นบาท (ภายใน): {formatAmount(invoice.inv_total_thb)} บาท
                            </p>
                        )}
                    </div>

                    {invoice.inv_notes && (
                        <div className="grid gap-1 text-sm">
                            <h3 className="font-medium text-gray-900">หมายเหตุ</h3>
                            <p className="whitespace-pre-line text-gray-700">{invoice.inv_notes}</p>
                        </div>
                    )}
                    {invoice.inv_internal_note && (
                        <div className="grid gap-1 rounded-lg bg-gray-50 p-3 text-sm">
                            <h3 className="text-xs text-gray-500">บันทึกภายใน (ไม่พิมพ์บนเอกสาร)</h3>
                            <p className="whitespace-pre-line text-gray-700">{invoice.inv_internal_note}</p>
                        </div>
                    )}
                </section>

                <div className="grid gap-5">
                    <DebitComparisonCard detail={detail} />
                    <PaymentCard detail={detail} />
                    <InvoiceApprovalProgress detail={detail} />
                    <RelatedCard detail={detail} />
                </div>
            </div>

            <ConfirmDialog
                open={confirmAction === "issue"}
                variant="info"
                title="ออกใบแจ้งหนี้?"
                description={`ได้เลขที่และวันที่เป็นวันนี้ · ครบกำหนดอีก ${invoice.inv_credit_days} วัน · ออกแล้วแก้ไขไม่ได้ (แก้ได้ด้วย "ยกเลิกแล้วออกใหม่แทน")`}
                consequences={[
                    `ยอดรวม ${formatAmount(invoice.inv_total, decimals)} ${code}${hasWithholding ? ` · ลูกค้าโอนหลังหัก ณ ที่จ่าย ${formatAmount(payment.net_payable, decimals)}` : ""}`,
                    "บันทึกข้อมูลลูกค้า บริษัท และบัญชีรับเงิน ณ วันนี้ไว้ในใบ (แก้ต้นทางทีหลังใบไม่เปลี่ยน)",
                ]}
                confirmLabel="ออกใบแจ้งหนี้"
                loading={isWorking}
                errorMessage={actionError}
                onConfirm={() => runAction(`${base}/issue`, {}, "ออกใบแจ้งหนี้แล้ว")}
                onCancel={closeDialogs}
            />
            <ConfirmDialog
                open={confirmAction === "issueWithNewVat"}
                variant="warning"
                title={INVOICE_MESSAGES.vatChangedTitle}
                description={vatChangeMessage ?? ""}
                confirmLabel="ยืนยัน ออกด้วยยอดใหม่"
                loading={isWorking}
                errorMessage={actionError}
                onConfirm={() =>
                    runAction(`${base}/issue`, { confirm_vat_change: true }, "ออกใบแจ้งหนี้แล้ว (ยอดตาม VAT ใหม่)")
                }
                onCancel={closeDialogs}
            />
            <ConfirmDialog
                open={confirmAction === "submit"}
                variant="info"
                title="ส่งขออนุมัติ?"
                description={INVOICE_MESSAGES.manualApproval}
                consequences={["คิด VAT ตามวันนี้", "ระหว่างรออนุมัติแก้ไขไม่ได้ (ผู้อนุมัติตีกลับให้แก้ได้)"]}
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
                consequences={approveConsequences}
                confirmLabel="อนุมัติ"
                loading={isWorking}
                errorMessage={actionError}
                onConfirm={() => runAction(`${base}/approve`, {}, "อนุมัติแล้ว")}
                onCancel={closeDialogs}
            />
            <ConfirmDialog
                open={confirmAction === "send"}
                variant="info"
                title="บันทึกว่าส่งให้ลูกค้าแล้ว?"
                description="ใช้หลังจากส่งเอกสาร (พิมพ์/PDF) ให้ลูกค้าเอง · ระบบบันทึกวันเวลาที่ส่ง"
                confirmLabel="บันทึก"
                loading={isWorking}
                errorMessage={actionError}
                onConfirm={() => runAction(`${base}/send`, {}, "บันทึกว่าส่งลูกค้าแล้ว")}
                onCancel={closeDialogs}
            />
            <ConfirmDialog
                open={confirmAction === "delete"}
                title="ลบร่างนี้?"
                description={
                    invoice.inv_source === "quotation"
                        ? "ร่างจะถูกลบถาวร · งวดที่เลือกไว้กลับมาออกบิลใหม่ได้"
                        : "ร่างจะถูกลบถาวร (รายการด้วย)"
                }
                confirmLabel="ลบ"
                loading={isWorking}
                errorMessage={actionError}
                onConfirm={() =>
                    runAction(base, {}, "ลบร่างแล้ว", { method: "DELETE", navigateTo: () => "/sales/invoices" })
                }
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
                    onConfirm={(reason) =>
                        runAction(
                            `${base}/${reasonAction}`,
                            { reason },
                            reasonAction === "reissue" ? "ยกเลิกแล้ว · สร้างร่างใหม่ให้แล้ว" : "บันทึกแล้ว",
                            reasonAction === "reissue"
                                ? { navigateTo: (data) => `/sales/invoices/view?id=${data.inv_id}` }
                                : {},
                        )
                    }
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

// รายการ: มือถือเป็นก้อนต่อแถว · จอใหญ่เป็นตาราง (แบบเดียวกับหน้าใบเสนอราคา)
function ItemsList({ detail }: { detail: InvoiceDetail }) {
    const { items, currency } = detail;
    const decimals = currency.cur_decimals;
    return (
        <>
            <ul className="grid text-sm sm:hidden">
                {items.map((item) =>
                    item.invi_type === "item" ? (
                        <li key={item.invi_id} className="grid gap-1 border-b border-gray-100 py-2.5">
                            <span className="whitespace-pre-line text-gray-800">{item.invi_description}</span>
                            <div className="flex items-end justify-between gap-3">
                                <span className="text-xs text-gray-500 tabular-nums">
                                    {formatQuantity(item.invi_quantity ?? "0")} {item.invi_unit ?? ""} ×{" "}
                                    {formatAmount(item.invi_unit_price ?? "0", decimals)}
                                    {Number(item.invi_discount_amount) > 0 &&
                                        ` · ส่วนลด −${formatAmount(item.invi_discount_amount, decimals)}`}
                                </span>
                                <span className="shrink-0 font-medium text-gray-900 tabular-nums">
                                    {formatAmount(item.invi_amount, decimals)}
                                </span>
                            </div>
                        </li>
                    ) : (
                        <li
                            key={item.invi_id}
                            className={`border-b border-gray-100 py-2.5 whitespace-pre-line ${item.invi_type === "heading" ? "font-medium text-gray-900" : "text-gray-500 italic"}`}
                        >
                            {item.invi_description}
                        </li>
                    ),
                )}
            </ul>
            <div className="hidden sm:block">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                            <th className="py-2 pr-2 font-normal">รายการ</th>
                            <th className="py-2 pr-2 text-right font-normal">จำนวน</th>
                            <th className="py-2 pr-2 text-right font-normal">ราคาต่อหน่วย</th>
                            <th className="py-2 pr-2 text-right font-normal">ส่วนลด</th>
                            <th className="py-2 text-right font-normal">ยอด</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((item) =>
                            item.invi_type === "item" ? (
                                <tr key={item.invi_id} className="border-b border-gray-100 align-top">
                                    <td className="py-2 pr-2 whitespace-pre-line">{item.invi_description}</td>
                                    <td className="py-2 pr-2 text-right tabular-nums">
                                        {formatQuantity(item.invi_quantity ?? "0")} {item.invi_unit ?? ""}
                                    </td>
                                    <td className="py-2 pr-2 text-right tabular-nums">
                                        {formatAmount(item.invi_unit_price ?? "0", decimals)}
                                    </td>
                                    <td className="py-2 pr-2 text-right tabular-nums">
                                        {Number(item.invi_discount_amount) > 0
                                            ? `−${formatAmount(item.invi_discount_amount, decimals)}`
                                            : ""}
                                    </td>
                                    <td className="py-2 text-right tabular-nums">
                                        {formatAmount(item.invi_amount, decimals)}
                                    </td>
                                </tr>
                            ) : (
                                <tr key={item.invi_id} className="border-b border-gray-100">
                                    <td
                                        colSpan={5}
                                        className={`py-2 whitespace-pre-line ${item.invi_type === "heading" ? "font-medium text-gray-900" : "text-gray-500 italic"}`}
                                    >
                                        {item.invi_description}
                                    </td>
                                </tr>
                            ),
                        )}
                    </tbody>
                </table>
            </div>
        </>
    );
}

// บัญชีรับเงิน + QR พร้อมเพย์ (ใบที่ออกแล้วใช้ข้อมูล ณ วันออก · ร่างใช้ค่าปัจจุบัน)
function PaymentCard({ detail }: { detail: InvoiceDetail }) {
    const { payment, invoice, currency, receipts, credit_notes: creditNotes } = detail;
    const issuedCreditNotes = creditNotes.filter((creditNote) => creditNote.cn_status === "issued");
    const account = payment.bank_account;
    const decimals = currency.cur_decimals;
    return (
        <section className={`grid gap-3 p-5 text-sm ${CARD_CLASS}`}>
            <h2 className="text-base font-medium text-gray-900">การชำระเงิน</h2>
            {invoice.inv_status === "issued" && (
                <div className="grid gap-1.5 rounded-xl bg-gray-50 p-3">
                    {/* มีใบลดหนี้: ยอดใบ → ลดหนี้ทีละใบ → ยอดหลังลดหนี้ → รับแล้ว → ค้าง (อ่านบนลงล่างเป็นการคำนวณ — กติกา 3.8) */}
                    {issuedCreditNotes.length > 0 && (
                        <>
                            <TotalRow label="ยอดตามใบแจ้งหนี้" value={formatAmount(invoice.inv_total, decimals)} />
                            {issuedCreditNotes.map((creditNote) => (
                                <div key={creditNote.cn_id} className="flex justify-between gap-3 text-gray-600">
                                    <Link
                                        href={`/sales/credit-notes/view?id=${creditNote.cn_id}`}
                                        className="-my-2.5 py-2.5 text-blue-600 tabular-nums hover:underline"
                                    >
                                        ลดหนี้ {creditNote.cn_number}
                                    </Link>
                                    <span className="tabular-nums">−{formatAmount(creditNote.cn_total, decimals)}</span>
                                </div>
                            ))}
                            <TotalRow label="ยอดหลังลดหนี้" value={formatAmount(payment.effective_total, decimals)} />
                        </>
                    )}
                    <TotalRow label="รับแล้ว" value={formatAmount(invoice.inv_paid_amount, decimals)} />
                    {parseHundredths(invoice.inv_refunded_amount, "คืนเงิน") > 0n && (
                        <TotalRow
                            label="คืนเงินลูกค้าแล้ว (รวมหัก ณ ที่จ่ายที่ไม่ต้องคืน)"
                            value={`−${formatAmount(invoice.inv_refunded_amount, decimals)}`}
                        />
                    )}
                    {parseHundredths(payment.refund_due, "ต้องคืน") > 0n && (
                        <div className="flex justify-between gap-3 font-medium text-red-600">
                            <span>ลูกค้าจ่ายเกิน รอคืนเงิน</span>
                            <span className="tabular-nums">
                                {formatAmount(payment.refund_due, decimals)} {currency.cur_code}
                            </span>
                        </div>
                    )}
                    <div className="flex justify-between gap-3 font-medium text-gray-900">
                        <span>ค้างชำระ</span>
                        <span className="tabular-nums">
                            {formatAmount(invoice.outstanding_amount, decimals)} {currency.cur_code}
                        </span>
                    </div>
                    {/* มีหัก ณ ที่จ่าย: ยอดค้างที่ลูกค้าโอนจริง = ค้างชำระ − หัก ณ ที่จ่ายของยอดค้าง (= ยอดในคิวอาร์ · หน้าพิมพ์) */}
                    {parseHundredths(payment.outstanding_withholding, "หัก ณ ที่จ่าย") > 0n && (
                        <>
                            <TotalRow
                                label={`หัก ณ ที่จ่าย ${percentLabel(invoice.inv_wht_rate)}% ของยอดค้าง (ประมาณ)`}
                                value={formatAmount(payment.outstanding_withholding, decimals)}
                            />
                            <div className="flex justify-between gap-3 font-medium text-gray-900">
                                <span>ลูกค้าโอนสุทธิ</span>
                                <span className="tabular-nums">
                                    {formatAmount(payment.outstanding_net, decimals)} {currency.cur_code}
                                </span>
                            </div>
                        </>
                    )}
                    {receipts.length > 0 && (
                        <ul className="grid gap-1 border-t border-gray-200 pt-1.5 text-xs">
                            {receipts.map((row) => (
                                <li key={row.rc_id} className="grid grid-cols-[1fr_auto] items-center gap-x-2">
                                    <Link
                                        href={`/sales/receipts/view?id=${row.rc_id}`}
                                        className={`-my-2.5 justify-self-start py-2.5 tabular-nums hover:underline ${row.rc_status === "cancelled" ? "text-gray-400 line-through" : "text-blue-600"}`}
                                    >
                                        {row.rc_number}
                                    </Link>
                                    <span className="tabular-nums">{formatAmount(row.rca_amount, decimals)}</span>
                                    <span className="col-span-2 text-gray-500">
                                        {formatDateOnly(row.rc_receipt_date)} · {METHOD_LABELS[row.rc_method]}
                                        {row.rc_status === "cancelled" ? " · ยกเลิกแล้ว" : ""}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                    {detail.actions.can_receive && (
                        <Link
                            href={`/sales/receipts/new?invoice=${invoice.inv_id}`}
                            className={`${buttonClass("secondary", "sm")} justify-self-start`}
                        >
                            <Banknote size={14} />
                            บันทึกรับเงิน
                        </Link>
                    )}
                </div>
            )}
            {account ? (
                <dl className="grid gap-0.5">
                    <dt className="text-xs text-gray-500">โอนเข้าบัญชี</dt>
                    <dd className="font-medium text-gray-900">{account.ba_bank_name}</dd>
                    <dd className="tabular-nums">{account.ba_account_no}</dd>
                    <dd className="text-gray-600">{account.ba_account_name}</dd>
                    {account.ba_swift_code && <dd className="text-gray-600">SWIFT {account.ba_swift_code}</dd>}
                </dl>
            ) : (
                <FieldHint>
                    {invoice.inv_status === "draft"
                        ? INVOICE_MESSAGES.noBankSelectedDraft
                        : INVOICE_MESSAGES.noBankSelected}
                </FieldHint>
            )}
            {payment.qr_payload ? (
                <div className="grid justify-items-center gap-1.5 rounded-xl bg-gray-50 p-3">
                    <PromptPayQr payload={payment.qr_payload} size={150} />
                    <p className="text-center text-xs text-gray-600">
                        พร้อมเพย์ {payment.promptpay_id} · {formatAmount(payment.qr_amount, currency.cur_decimals)} บาท
                    </p>
                    <FieldHint>
                        {INVOICE_MESSAGES.qrHint(parseHundredths(invoice.inv_wht_amount, "หัก ณ ที่จ่าย") > 0n)}
                    </FieldHint>
                </div>
            ) : (
                invoice.inv_currency === "THB" &&
                !payment.promptpay_id && <FieldHint>{INVOICE_MESSAGES.qrMissing}</FieldHint>
            )}
        </section>
    );
}

// ความคืบหน้าอนุมัติของใบสร้างเอง (รอบปัจจุบัน) + ประวัติทุกรอบ
function InvoiceApprovalProgress({ detail }: { detail: InvoiceDetail }) {
    const { invoice, approval_history: history } = detail;
    if (invoice.inv_source !== "manual") return null;
    const plan = invoice.inv_approval_plan ?? [];
    const thisRound = history.filter(
        (row) => row.inva_round === invoice.inv_approval_round && row.inva_action === "approve",
    );
    const showPlan = plan.length > 0 && invoice.inv_status !== "draft";

    if (!showPlan && history.length === 0) {
        return (
            <section className={`grid gap-2 p-5 ${CARD_CLASS}`}>
                <h2 className="text-base font-medium text-gray-900">การอนุมัติ</h2>
                <p className="text-sm text-gray-500">{INVOICE_MESSAGES.manualApproval}</p>
            </section>
        );
    }

    return (
        <section className={`grid gap-4 p-5 ${CARD_CLASS}`}>
            <h2 className="text-base font-medium text-gray-900">การอนุมัติ</h2>
            {showPlan && (
                <ol className="grid gap-2">
                    {plan.map((level) => {
                        const approved = thisRound.find((row) => row.inva_level === level.level);
                        const isWaiting =
                            invoice.inv_status === "pending_approval" &&
                            invoice.inv_approval_current_level === level.level;
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
                                            ? `อนุมัติโดย ${approved.inva_user_name} · ${formatDate(approved.inva_created_at)}`
                                            : isWaiting
                                              ? "รออนุมัติชั้นนี้"
                                              : "-"}
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
                            <li key={row.inva_id} className="grid gap-0.5 rounded-lg bg-gray-50 p-2">
                                <span className="text-gray-800">
                                    รอบ {row.inva_round} · ชั้น {row.inva_level} ·{" "}
                                    {row.inva_action === "approve" ? "อนุมัติ" : "ตีกลับ"} โดย {row.inva_user_name}
                                </span>
                                {row.inva_reason && (
                                    <span className="text-xs text-gray-600">เหตุผล: {row.inva_reason}</span>
                                )}
                                <span className="text-xs text-gray-500">{formatDate(row.inva_created_at)}</span>
                            </li>
                        ))}
                    </ul>
                </details>
            )}
        </section>
    );
}

// เอกสารที่เกี่ยวข้อง: ใบเสนอราคา + งวดที่เรียกเก็บ · โปรเจกต์ · ใบวางบิล · ออกใหม่แทน/แทนใบไหน
/** ใบเพิ่มหนี้: เหตุผล + เทียบกับรายการขายเดิม (มูลค่าเดิม → บวกใบนี้ → มูลค่าที่ถูกต้อง) — ตัวเลขชุดเดียวกับหน้าพิมพ์ */
function DebitComparisonCard({ detail }: { detail: InvoiceDetail }) {
    const { invoice, currency, debit_comparison: comparison } = detail;
    if (invoice.inv_doc_type !== "debit_note" || !comparison) return null;
    const decimals = currency.cur_decimals;
    const reasonCode = invoice.inv_adjust_reason_code;
    return (
        <section className={`grid gap-3 p-5 text-sm ${CARD_CLASS}`}>
            <h2 className="text-base font-medium text-gray-900">เทียบกับใบแจ้งหนี้เดิม</h2>
            <div className="grid gap-1 rounded-lg bg-gray-50 p-3">
                <p className="text-xs text-gray-500">เหตุผลที่เพิ่มหนี้</p>
                <p className="text-gray-800">
                    {reasonCode ? `${DEBIT_NOTE_REASONS[reasonCode]} · ` : ""}
                    {invoice.inv_adjust_reason}
                </p>
            </div>
            <div className="grid gap-1">
                <TotalRow
                    label={`มูลค่าตาม ${invoice.reference_number ?? "ใบเดิม"}`}
                    value={formatAmount(comparison.original_total, decimals)}
                />
                <TotalRow label="บวก ใบเพิ่มหนี้ฉบับนี้" value={`+${formatAmount(comparison.this_total, decimals)}`} />
                <div className="flex justify-between gap-3 border-t border-gray-200 pt-1 font-medium text-gray-900">
                    <span>มูลค่าที่ถูกต้อง</span>
                    <span className="tabular-nums">
                        {formatAmount(comparison.correct_total, decimals)} {currency.cur_code}
                    </span>
                </div>
            </div>
            <FieldHint>
                {comparison.is_snapshot
                    ? INVOICE_MESSAGES.debitComparisonIssued
                    : INVOICE_MESSAGES.debitComparisonDraft}
            </FieldHint>
        </section>
    );
}

function RelatedCard({ detail }: { detail: InvoiceDetail }) {
    const {
        invoice,
        milestones,
        billing_note: billingNote,
        reissued_to: reissuedTo,
        currency,
        credit_notes: creditNotes,
        debit_notes: debitNotes,
        renewal_cycles: renewalCycles,
    } = detail;
    const hasAnything =
        renewalCycles.length > 0 ||
        invoice.inv_quotation_id ||
        invoice.inv_project_id ||
        billingNote ||
        reissuedTo ||
        invoice.inv_reissued_from_id ||
        invoice.inv_reference_invoice_id ||
        creditNotes.length > 0 ||
        debitNotes.length > 0;
    if (!hasAnything) return null;
    return (
        <section className={`grid gap-2 p-5 text-sm ${CARD_CLASS}`}>
            <h2 className="text-base font-medium text-gray-900">เอกสารที่เกี่ยวข้อง</h2>
            {renewalCycles.length > 0 && (
                <div className="grid gap-1">
                    <p>
                        จาก{" "}
                        <Link href="/sales/renewals?tab=all" className="py-2 text-blue-600 hover:underline">
                            รายการต่ออายุบริการ
                        </Link>{" "}
                        {renewalCycles.length} รายการ
                    </p>
                    <ul className="grid gap-0.5 text-xs text-gray-600">
                        {renewalCycles.map((cycle) => (
                            <li key={`${cycle.rnw_id}-${cycle.rnc_period_start}`} className={cycle.rnc_status === "void" ? "line-through" : ""}>
                                {cycle.rnw_label || cycle.product_name} · {formatDateOnly(cycle.rnc_period_start)} - {formatDateOnly(cycle.rnc_period_end)}
                            </li>
                        ))}
                    </ul>
                    <FieldHint>
                        ยกเลิกใบหรือลบร่างแล้ว รอบนั้นกลับเป็นยังไม่ออก · ออกใหม่จากหน้าต่ออายุบริการ (ปุ่มออกใหม่แทนไม่ผูกรอบให้)
                    </FieldHint>
                </div>
            )}
            {invoice.inv_reference_invoice_id && (
                <p>
                    เพิ่มหนี้จากใบแจ้งหนี้{" "}
                    <Link
                        href={`/sales/invoices/view?id=${invoice.inv_reference_invoice_id}`}
                        className="py-2 text-blue-600 hover:underline"
                    >
                        {invoice.reference_number}
                    </Link>
                    {invoice.reference_issue_date ? ` ลงวันที่ ${formatDateOnly(invoice.reference_issue_date)}` : ""}
                </p>
            )}
            {invoice.inv_quotation_id && (
                <div className="grid gap-1">
                    <p>
                        ใบเสนอราคา{" "}
                        <Link
                            href={`/sales/quotations/view?id=${invoice.inv_quotation_id}`}
                            className="py-2 text-blue-600 hover:underline"
                        >
                            {invoice.qt_number}
                        </Link>
                    </p>
                    {milestones.length > 0 && (
                        <ul className="grid gap-0.5 text-xs text-gray-600">
                            {milestones.map((milestone) => (
                                <li key={milestone.ivm_milestone_id} className="flex justify-between gap-2">
                                    <span>
                                        งวดที่ {milestone.qtm_order} {milestone.qtm_name}
                                    </span>
                                    <span className="tabular-nums">
                                        {formatAmount(milestone.ivm_amount, currency.cur_decimals)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                    <FieldHint>{INVOICE_MESSAGES.lockedAmount(invoice.qt_number ?? "")}</FieldHint>
                </div>
            )}
            {invoice.inv_project_id && (
                <p>
                    โปรเจกต์{" "}
                    <Link
                        href={`/projects/view?id=${invoice.inv_project_id}`}
                        className="py-2 text-blue-600 hover:underline"
                    >
                        {invoice.project_name}
                    </Link>
                </p>
            )}
            {billingNote && (
                <p>
                    อยู่ในใบวางบิล{" "}
                    <Link
                        href={`/sales/billing-notes/view?id=${billingNote.bn_id}`}
                        className="py-2 text-blue-600 hover:underline"
                    >
                        {billingNote.bn_number ?? "ร่าง"}
                    </Link>
                </p>
            )}
            {creditNotes.length > 0 && (
                <div className="grid gap-1">
                    <p>ใบลดหนี้</p>
                    <ul className="grid gap-0.5 text-xs">
                        {creditNotes.map((creditNote) => (
                            <li key={creditNote.cn_id} className="flex justify-between gap-2">
                                <Link
                                    href={`/sales/credit-notes/view?id=${creditNote.cn_id}`}
                                    className={`-my-2.5 py-2.5 tabular-nums hover:underline ${creditNote.cn_status === "cancelled" ? "text-gray-400 line-through" : "text-blue-600"}`}
                                >
                                    {creditNote.cn_number ?? "ร่าง"}
                                </Link>
                                <span className="text-gray-600 tabular-nums">
                                    {CREDIT_NOTE_STATUS_SHORT[creditNote.cn_status]} ·{" "}
                                    {formatAmount(creditNote.cn_total, currency.cur_decimals)}
                                </span>
                            </li>
                        ))}
                    </ul>
                    <FieldHint>{INVOICE_MESSAGES.creditNote}</FieldHint>
                </div>
            )}
            {debitNotes.length > 0 && (
                <div className="grid gap-1">
                    <p>ใบเพิ่มหนี้</p>
                    <ul className="grid gap-0.5 text-xs">
                        {debitNotes.map((debitNote) => (
                            <li key={debitNote.inv_id} className="flex justify-between gap-2">
                                <Link
                                    href={`/sales/invoices/view?id=${debitNote.inv_id}`}
                                    className={`-my-2.5 py-2.5 tabular-nums hover:underline ${debitNote.inv_status === "cancelled" ? "text-gray-400 line-through" : "text-blue-600"}`}
                                >
                                    {debitNote.inv_number ?? "ร่าง"}
                                </Link>
                                <span className="text-gray-600 tabular-nums">
                                    {STATUS_LABELS[debitNote.inv_status].label} ·{" "}
                                    {formatAmount(debitNote.inv_total, currency.cur_decimals)}
                                </span>
                            </li>
                        ))}
                    </ul>
                    <FieldHint>{INVOICE_MESSAGES.debitNote}</FieldHint>
                </div>
            )}
            {invoice.inv_reissued_from_id && (
                <p>
                    ออกแทนใบ{" "}
                    <Link
                        href={`/sales/invoices/view?id=${invoice.inv_reissued_from_id}`}
                        className="py-2 text-blue-600 hover:underline"
                    >
                        {invoice.reissued_from_number}
                    </Link>{" "}
                    ที่ยกเลิก
                </p>
            )}
            {reissuedTo && (
                <p>
                    ออกใหม่แทนแล้วเป็น{" "}
                    <Link
                        href={`/sales/invoices/view?id=${reissuedTo.inv_id}`}
                        className="py-2 text-blue-600 hover:underline"
                    >
                        {invoiceNumberLabel(reissuedTo)}
                    </Link>
                </p>
            )}
        </section>
    );
}

// มือถือ: ปุ่มตัดสินใจหลักลอยติดล่างจอพร้อมยอดรวม (แบบเดียวกับหน้าใบเสนอราคา)
function DecisionBar({ label, total, children }: { label: string; total: string; children: React.ReactNode }) {
    return (
        <div className="fixed inset-x-4 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 grid gap-2 rounded-2xl border border-gray-200 bg-white/95 p-3 shadow-float backdrop-blur sm:hidden">
            <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-gray-500">{label}</span>
                <span className="font-medium text-gray-900 tabular-nums">{total}</span>
            </div>
            <div className="flex flex-wrap gap-2 *:basis-44">{children}</div>
        </div>
    );
}

// แถบสถานะ: ตอนนี้เป็นอย่างไร · รออะไร/ใคร · ต้องทำอะไรต่อ (แบบที่ 3 ของ ui-guidance)
function StatusGuide({ detail }: { detail: InvoiceDetail }) {
    const { invoice, approval } = detail;
    const plan = invoice.inv_approval_plan ?? [];
    const currentLevel = plan.find((level) => level.level === invoice.inv_approval_current_level);

    switch (invoice.inv_status) {
        case "draft":
            if (invoice.inv_returned_reason) {
                return (
                    <StatusBanner tone="warn" title="ถูกตีกลับ · แก้แล้วส่งขออนุมัติใหม่">
                        เหตุผล: {invoice.inv_returned_reason}
                    </StatusBanner>
                );
            }
            return (
                <StatusBanner tone="info" title="ร่าง · ยังไม่มีเลขที่">
                    {invoice.inv_source === "quotation"
                        ? `${INVOICE_MESSAGES.dates(invoice.inv_credit_days)} · ไม่ต้องอนุมัติ (ยอดผ่านการอนุมัติในใบเสนอราคาแล้ว)`
                        : `แก้ได้ทุกช่อง · ${INVOICE_MESSAGES.manualApproval}`}
                </StatusBanner>
            );
        case "pending_approval":
            if (approval?.canApprove) {
                return (
                    <StatusBanner tone="wait" title={`รอคุณอนุมัติชั้น ${invoice.inv_approval_current_level}`}>
                        กดอนุมัติแล้วจะผ่านชั้น {approval.levels.join(", ")}
                        {approval.isFinal
                            ? " ซึ่งเป็นชั้นสุดท้าย · ระบบออกใบให้ทันที"
                            : ` · ${approval.stopReason ?? ""}`}
                    </StatusBanner>
                );
            }
            return (
                <StatusBanner tone="wait" title={`รออนุมัติชั้น ${invoice.inv_approval_current_level}/${plan.length}`}>
                    ผู้อนุมัติชั้นนี้: {currentLevel?.roles.map((role) => role.role_name).join(", ")}
                    {approval?.reason ? ` · คุณอนุมัติไม่ได้: ${approval.reason}` : ""}
                </StatusBanner>
            );
        case "issued":
            if (invoice.payment_state === "refund_due") {
                return (
                    <StatusBanner tone="error" title="ลูกค้าจ่ายเกินหลังลดหนี้ · รอคืนเงิน">
                        {INVOICE_MESSAGES.refundDue(
                            `${formatAmount(detail.payment.refund_due, detail.currency.cur_decimals)} ${invoice.inv_currency}`,
                        )}
                    </StatusBanner>
                );
            }
            if (invoice.payment_state === "credited") {
                return (
                    <StatusBanner tone="done" title="ปิดยอดด้วยใบลดหนี้">
                        ใบลดหนี้ลดยอดจนลูกค้าไม่ต้องจ่ายแล้ว · ยกเลิกใบนี้ไม่ได้จนกว่าจะยกเลิกใบลดหนี้
                    </StatusBanner>
                );
            }
            if (invoice.payment_state === "paid") {
                return (
                    <StatusBanner tone="done" title="ชำระครบแล้ว">
                        รับเงินครบตามใบเสร็จในส่วน &quot;การชำระเงิน&quot; · ยกเลิกใบนี้ไม่ได้จนกว่าจะยกเลิกใบเสร็จ
                    </StatusBanner>
                );
            }
            if (invoice.is_overdue) {
                return (
                    <StatusBanner tone="error" title={`เกินกำหนดชำระ ${invoice.days_overdue} วัน`}>
                        ครบกำหนดวันที่ {formatDateOnly(invoice.inv_due_date)} · ติดตามกับลูกค้า · ค้างอยู่{" "}
                        {formatAmount(invoice.outstanding_amount, detail.currency.cur_decimals)} {invoice.inv_currency}
                    </StatusBanner>
                );
            }
            return (
                <StatusBanner tone="done" title={`ออกแล้ว · ครบกำหนด ${formatDateOnly(invoice.inv_due_date)}`}>
                    {invoice.inv_sent_at
                        ? `บันทึกว่าส่งลูกค้าแล้ว ${formatDate(invoice.inv_sent_at)}`
                        : 'กด "พิมพ์ / บันทึก PDF" ส่งให้ลูกค้า แล้วกด "บันทึกว่าส่งลูกค้าแล้ว"'}
                    {invoice.inv_issued_by_name ? ` · ผู้ออก ${invoice.inv_issued_by_name}` : ""}
                </StatusBanner>
            );
        case "cancelled":
            return (
                <StatusBanner tone="error" title="ยกเลิกแล้ว">
                    เหตุผล: {invoice.inv_cancel_reason} · เลขที่ยังคงอยู่ ไม่นำกลับมาใช้
                </StatusBanner>
            );
        default:
            return null;
    }
}
