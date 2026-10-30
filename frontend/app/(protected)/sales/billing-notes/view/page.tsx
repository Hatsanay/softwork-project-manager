"use client";

// หน้าเอกสารใบวางบิล (2026-10-15 ขั้น 1B-4) — สถานะ + สิ่งที่ทำได้ตอนนี้ (ปุ่มที่ทำไม่ได้ซ่อน)
// ใบแจ้งหนี้ที่รวม (ร่าง: ยอดค้างปัจจุบัน + ปัญหาของแต่ละใบ · ออกแล้ว: ยอด ณ วันออก) · วันนัดชำระ · หมายเหตุ
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Banknote, CheckCircle2, Circle, FileCheck2, Pencil, Printer, Trash2, XCircle } from "lucide-react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import PageHeader from "@/components/ui/page-header";
import ReasonDialog from "@/components/ui/reason-dialog";
import StatusBanner from "@/components/ui/guidance/status-banner";
import FieldHint from "@/components/ui/guidance/field-hint";
import StatusPill from "@/components/ui/status-pill";
import { CARD_CLASS } from "@/components/ui/card";
import { PageSkeleton } from "@/components/ui/skeleton";
import { buttonClass } from "@/components/ui/button";
import formatDate, { formatDateOnly } from "@/app/function";
import { apiFetch, type ApiError } from "@/lib/api";
import { formatAmount, parseHundredths } from "@/lib/shared/money.mjs";
import { amountInWords } from "@/lib/shared/amount-in-words.mjs";
import { BILLING_NOTE_MESSAGES, STATUS_LABELS, billingNoteNumberLabel } from "../_messages";
import type { BillingNoteDetail } from "../_types";

type ConfirmAction = "issue" | "delete";

export default function BillingNoteViewPage() {
    const router = useRouter();
    const billingNoteId = useSearchParams().get("id");
    const [detail, setDetail] = useState<BillingNoteDetail | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);
    const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
    const [isCancelOpen, setIsCancelOpen] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    const [isWorking, setIsWorking] = useState(false);

    const reload = useCallback(async () => {
        if (!billingNoteId) return;
        const { data, error } = await apiFetch<BillingNoteDetail>(`/billing-notes/${billingNoteId}`);
        setDetail(data);
        setLoadError(error);
    }, [billingNoteId]);

    useEffect(() => {
        if (!billingNoteId) return;
        let isLeftPage = false;
        apiFetch<BillingNoteDetail>(`/billing-notes/${billingNoteId}`).then(({ data, error }) => {
            if (isLeftPage) return;
            setDetail(data);
            setLoadError(error);
        });
        return () => {
            isLeftPage = true;
        };
    }, [billingNoteId]);

    function closeDialogs() {
        setConfirmAction(null);
        setIsCancelOpen(false);
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
            body: { ...body, bn_version: detail.billing_note.bn_version },
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

    if (!billingNoteId)
        return (
            <StatusBanner tone="error" title="ไม่พบใบวางบิลนี้">
                กลับไปเลือกจากหน้ารายการ
            </StatusBanner>
        );
    if (loadError)
        return (
            <StatusBanner tone="error" title="โหลดใบวางบิลไม่สำเร็จ">
                {loadError.message}
            </StatusBanner>
        );
    if (!detail) return <PageSkeleton />;

    const { billing_note: note, invoices, currency, actions, readiness } = detail;
    const decimals = currency.cur_decimals;
    const code = currency.cur_code;
    const status = STATUS_LABELS[note.bn_status];
    const base = `/billing-notes/${note.bn_id}`;
    const isReady = readiness.every((check) => check.ok);
    const hasWithholding = parseHundredths(detail.withholding_total, "หัก ณ ที่จ่าย") > 0n;
    const clientName = note.client_company || note.client_name;
    const totalLabel = `${formatAmount(note.bn_total, decimals)} ${code}`;

    return (
        <div className={`grid w-full grid-cols-1 gap-6 ${actions.can_issue ? "max-sm:pb-32" : ""}`}>
            <PageHeader
                eyebrow={`ขาย · ใบวางบิล · ${billingNoteNumberLabel(note)}`}
                title={clientName}
                description={`${invoices.length} ใบแจ้งหนี้ · สาขา ${note.branch_code} ${note.branch_name_th}`}
                actions={<StatusPill tone={status.tone}>{status.label}</StatusPill>}
            />

            <StatusGuide detail={detail} />

            {note.bn_status === "draft" && (
                <section className={`grid gap-3 p-5 ${CARD_CLASS}`}>
                    <h2 className="text-base font-medium text-gray-900">ก่อนออกใบวางบิล</h2>
                    <ul className="grid gap-1.5 text-sm">
                        {readiness.map((check) => (
                            <li key={check.key} className="flex items-center gap-2">
                                {check.ok ? (
                                    <CheckCircle2 size={16} className="shrink-0 text-green-600" />
                                ) : (
                                    <Circle size={16} className="shrink-0 text-amber-600" />
                                )}
                                <span className={check.ok ? "text-gray-700" : "text-amber-600"}>{check.message}</span>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            <div className="flex flex-wrap gap-2">
                <a
                    href={`/sales/billing-notes/print?id=${note.bn_id}`}
                    target="_blank"
                    rel="noopener"
                    className={buttonClass("secondary", "md")}
                >
                    <Printer size={16} />
                    {note.bn_status === "issued" ? "พิมพ์ / บันทึก PDF" : "ดูตัวอย่างหน้าพิมพ์"}
                </a>
                {actions.can_edit && (
                    <Link
                        href={`/sales/billing-notes/edit?id=${note.bn_id}`}
                        className={buttonClass("secondary", "md")}
                    >
                        <Pencil size={16} />
                        แก้ไขร่าง
                    </Link>
                )}
                {actions.can_issue && (
                    <button
                        type="button"
                        className={`${buttonClass("primary", "md")} max-sm:hidden`}
                        disabled={!isReady}
                        onClick={() => setConfirmAction("issue")}
                    >
                        <FileCheck2 size={16} />
                        ออกใบวางบิล
                    </button>
                )}
                {actions.can_receive && (
                    <Link
                        href={`/sales/receipts/new?billing_note=${note.bn_id}`}
                        className={buttonClass("primary", "md")}
                    >
                        <Banknote size={16} />
                        บันทึกรับเงินตามใบวางบิลนี้
                    </Link>
                )}
                {actions.can_cancel && (
                    <button type="button" className={buttonClass("ghost", "md")} onClick={() => setIsCancelOpen(true)}>
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
            {actions.can_issue && !isReady && (
                <p className="text-xs text-amber-600">
                    ออกได้เมื่อผ่านทุกข้อในรายการ &quot;ก่อนออกใบวางบิล&quot; · กดแก้ไขร่างเพื่อแก้
                </p>
            )}

            {actions.can_issue && (
                <div className="fixed inset-x-4 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 grid gap-2 rounded-2xl border border-gray-200 bg-white/95 p-3 shadow-float backdrop-blur sm:hidden">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="text-gray-500">รวม {invoices.length} ใบ</span>
                        <span className="font-medium text-gray-900 tabular-nums">{totalLabel}</span>
                    </div>
                    <button
                        type="button"
                        className={buttonClass("primary", "md")}
                        disabled={!isReady}
                        onClick={() => setConfirmAction("issue")}
                    >
                        <FileCheck2 size={16} />
                        ออกใบวางบิล
                    </button>
                </div>
            )}

            <section className={`grid gap-5 p-5 sm:p-6 ${CARD_CLASS}`}>
                <dl className="grid gap-3 text-sm sm:grid-cols-3">
                    <div>
                        <dt className="text-xs text-gray-500">วันที่</dt>
                        <dd>{note.bn_issue_date ? formatDateOnly(note.bn_issue_date) : "ได้ตอนออกใบ"}</dd>
                    </div>
                    <div>
                        <dt className="text-xs text-gray-500">วันนัดชำระ</dt>
                        <dd>
                            {note.bn_payment_date ? formatDateOnly(note.bn_payment_date) : "ยังไม่นัด (เว้นช่องบนใบ)"}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-xs text-gray-500">สกุลเงิน / ภาษา</dt>
                        <dd>
                            {code} · {note.bn_language === "th" ? "ไทย" : "อังกฤษ"}
                        </dd>
                    </div>
                </dl>

                <InvoiceList detail={detail} />

                <div className="ml-auto grid w-full max-w-sm gap-1.5 text-sm">
                    <div className="flex justify-between border-t border-gray-100 pt-1.5 text-base font-medium text-gray-900">
                        <span>รวมทั้งสิ้น ({code})</span>
                        <span className="tabular-nums">{formatAmount(note.bn_total, decimals)}</span>
                    </div>
                    <p className="text-xs text-gray-500">{amountInWords(note.bn_total, currency, note.bn_language)}</p>
                    {hasWithholding && (
                        <>
                            <div className="flex justify-between text-gray-600">
                                <span>หัก ณ ที่จ่าย (ประมาณ)</span>
                                <span className="tabular-nums">{formatAmount(detail.withholding_total, decimals)}</span>
                            </div>
                            <div className="flex justify-between font-medium text-gray-900">
                                <span>ยอดชำระสุทธิ ({code})</span>
                                <span className="tabular-nums">{formatAmount(detail.net_payable, decimals)}</span>
                            </div>
                            <FieldHint>{BILLING_NOTE_MESSAGES.withholding}</FieldHint>
                        </>
                    )}
                </div>

                {note.bn_notes && (
                    <div className="grid gap-1 text-sm">
                        <h3 className="font-medium text-gray-900">หมายเหตุ</h3>
                        <p className="whitespace-pre-line text-gray-700">{note.bn_notes}</p>
                    </div>
                )}
            </section>

            <ConfirmDialog
                open={confirmAction === "issue"}
                variant="info"
                title="ออกใบวางบิล?"
                description="ได้เลขที่และวันที่เป็นวันนี้ · ออกแล้วแก้ไขไม่ได้ (ถ้าผิดให้ยกเลิกแล้วสร้างใหม่)"
                consequences={[
                    `รวม ${invoices.length} ใบแจ้งหนี้ ยอด ${totalLabel}`,
                    "บันทึกข้อมูลลูกค้าและบริษัท ณ วันนี้ไว้ในใบ (แก้ต้นทางทีหลังใบไม่เปลี่ยน)",
                    BILLING_NOTE_MESSAGES.inBillingNote,
                ]}
                confirmLabel="ออกใบวางบิล"
                loading={isWorking}
                errorMessage={actionError}
                onConfirm={() => runAction(`${base}/issue`, {}, "ออกใบวางบิลแล้ว")}
                onCancel={closeDialogs}
            />
            <ConfirmDialog
                open={confirmAction === "delete"}
                title="ลบร่างนี้?"
                description="ร่างจะถูกลบถาวร · ใบแจ้งหนี้ที่เลือกไว้กลับมาวางบิลใหม่ได้"
                confirmLabel="ลบ"
                loading={isWorking}
                errorMessage={actionError}
                onConfirm={() =>
                    runAction(base, {}, "ลบร่างแล้ว", { method: "DELETE", navigateTo: "/sales/billing-notes" })
                }
                onCancel={closeDialogs}
            />
            {isCancelOpen && (
                <ReasonDialog
                    open
                    title="ยกเลิกใบวางบิลนี้?"
                    description="เลขที่ยังคงอยู่ (ไม่นำกลับมาใช้) · ใบแจ้งหนี้ในใบนี้กลับมาวางบิลใหม่หรือยกเลิกได้ · ยกเลิกแล้วกู้คืนไม่ได้"
                    reasonHint="เหตุผลจะแสดงบนใบและในประวัติ เช่น ลูกค้าขอรวมกับบิลเดือนหน้า"
                    confirmLabel="ยกเลิกใบ"
                    tone="danger"
                    loading={isWorking}
                    errorMessage={actionError}
                    onConfirm={(reason) => runAction(`${base}/cancel`, { reason }, "ยกเลิกใบวางบิลแล้ว")}
                    onCancel={closeDialogs}
                />
            )}
        </div>
    );
}

// ใบแจ้งหนี้ในใบวางบิล: มือถือเป็นก้อนต่อใบ · จอใหญ่เป็นตาราง · ร่างแสดงปัญหาของแต่ละใบ (ถ้ามี)
function InvoiceList({ detail }: { detail: BillingNoteDetail }) {
    const { invoices, currency } = detail;
    const decimals = currency.cur_decimals;
    return (
        <>
            <ul className="grid text-sm sm:hidden">
                {invoices.map((invoice, index) => (
                    <li key={invoice.inv_id} className="grid gap-1 border-b border-gray-100 py-2.5">
                        <div className="flex items-start justify-between gap-3">
                            <Link
                                href={`/sales/invoices/view?id=${invoice.inv_id}`}
                                className="-my-2 py-2 font-medium text-blue-600 tabular-nums hover:underline"
                            >
                                {index + 1}. {invoice.inv_number}
                            </Link>
                            <span className="shrink-0 font-medium text-gray-900 tabular-nums">
                                {formatAmount(invoice.bni_amount, decimals)}
                            </span>
                        </div>
                        <span className="wrap-break-word text-gray-700">{invoice.inv_title}</span>
                        <span className="text-xs text-gray-500">
                            ออก {formatDateOnly(invoice.inv_issue_date)} · ครบกำหนด{" "}
                            <span className={invoice.is_overdue ? "text-red-600" : undefined}>
                                {formatDateOnly(invoice.inv_due_date)}
                            </span>
                        </span>
                        {invoice.problem && <span className="text-xs text-amber-600">{invoice.problem}</span>}
                    </li>
                ))}
            </ul>
            <div className="hidden sm:block">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                            <th className="w-10 py-2 pr-2 font-normal">#</th>
                            <th className="py-2 pr-2 font-normal">ใบแจ้งหนี้</th>
                            <th className="py-2 pr-2 font-normal">วันที่</th>
                            <th className="py-2 pr-2 font-normal">ครบกำหนด</th>
                            <th className="py-2 text-right font-normal">ยอดเรียกเก็บ</th>
                        </tr>
                    </thead>
                    <tbody>
                        {invoices.map((invoice, index) => (
                            <tr key={invoice.inv_id} className="border-b border-gray-100 align-top">
                                <td className="py-2 pr-2 text-gray-500 tabular-nums">{index + 1}</td>
                                <td className="py-2 pr-2">
                                    <Link
                                        href={`/sales/invoices/view?id=${invoice.inv_id}`}
                                        className="text-blue-600 tabular-nums hover:underline"
                                    >
                                        {invoice.inv_number}
                                    </Link>
                                    <p className="text-xs text-gray-500">{invoice.inv_title}</p>
                                    {invoice.problem && <p className="text-xs text-amber-600">{invoice.problem}</p>}
                                </td>
                                <td className="py-2 pr-2 tabular-nums">{formatDateOnly(invoice.inv_issue_date)}</td>
                                <td className={`py-2 pr-2 tabular-nums ${invoice.is_overdue ? "text-red-600" : ""}`}>
                                    {formatDateOnly(invoice.inv_due_date)}
                                </td>
                                <td className="py-2 text-right tabular-nums">
                                    {formatAmount(invoice.bni_amount, decimals)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
}

// แถบสถานะ: ตอนนี้เป็นอย่างไร · ต้องทำอะไรต่อ (แบบที่ 3 ของ ui-guidance)
function StatusGuide({ detail }: { detail: BillingNoteDetail }) {
    const { billing_note: note } = detail;
    switch (note.bn_status) {
        case "draft":
            return (
                <StatusBanner tone="info" title="ร่าง · ยังไม่มีเลขที่">
                    {BILLING_NOTE_MESSAGES.dates} · ไม่ต้องอนุมัติ · {BILLING_NOTE_MESSAGES.amounts}
                </StatusBanner>
            );
        case "issued":
            return (
                <StatusBanner
                    tone="done"
                    title={
                        note.bn_payment_date
                            ? `ออกแล้ว · ลูกค้านัดชำระ ${formatDateOnly(note.bn_payment_date)}`
                            : "ออกแล้ว"
                    }
                >
                    กด &quot;พิมพ์ / บันทึก PDF&quot; ไปวางบิล ให้ลูกค้าเซ็นรับในช่องท้ายใบ ·{" "}
                    {BILLING_NOTE_MESSAGES.inBillingNote}
                    {note.bn_created_by_name ? ` · ผู้ออก ${note.bn_created_by_name}` : ""}
                </StatusBanner>
            );
        case "cancelled":
            return (
                <StatusBanner tone="error" title="ยกเลิกแล้ว">
                    เหตุผล: {note.bn_cancel_reason}
                    {note.cancelled_by_name ? ` · โดย ${note.cancelled_by_name}` : ""}
                    {note.bn_cancelled_at ? ` · ${formatDate(note.bn_cancelled_at)}` : ""} · เลขที่ยังคงอยู่
                    ไม่นำกลับมาใช้
                </StatusBanner>
            );
        default:
            return null;
    }
}
