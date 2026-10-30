"use client";

// หน้าใบสำคัญจ่าย (ขั้น 2-4) — ผู้รับ ณ วันจ่าย · รายการที่ตัด · หัก ณ ที่จ่าย + 50 ทวิ · พิมพ์ใบสำคัญจ่าย/50 ทวิ · ยกเลิก
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { FileText, Printer, XCircle } from "lucide-react";
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
import { METHOD_LABELS, PAYMENT_MESSAGES, WHT_FORM_SHORT } from "../_messages";
import type { PaymentDetail } from "../_types";

export default function PaymentViewPage() {
    const paymentId = useSearchParams().get("id");
    const [detail, setDetail] = useState<PaymentDetail | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);
    const [isCancelOpen, setIsCancelOpen] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    const [isWorking, setIsWorking] = useState(false);

    const reload = useCallback(async () => {
        if (!paymentId) return;
        const { data, error } = await apiFetch<PaymentDetail>(`/payments/${paymentId}`);
        setDetail(data);
        setLoadError(error);
    }, [paymentId]);

    useEffect(() => {
        if (!paymentId) return;
        let isLeftPage = false;
        apiFetch<PaymentDetail>(`/payments/${paymentId}`).then(({ data, error }) => {
            if (isLeftPage) return;
            setDetail(data);
            setLoadError(error);
        });
        return () => {
            isLeftPage = true;
        };
    }, [paymentId]);

    async function cancelPayment(reason: string) {
        if (!detail) return;
        setIsWorking(true);
        setActionError(null);
        const { error } = await apiFetch(`/payments/${detail.payment.pv_id}/cancel`, {
            method: "POST",
            body: { reason, pv_version: detail.payment.pv_version },
        });
        setIsWorking(false);
        if (error) {
            setActionError(error.message);
            return;
        }
        toast.success("ยกเลิกใบสำคัญจ่ายแล้ว");
        setIsCancelOpen(false);
        await reload();
    }

    if (!paymentId)
        return (
            <StatusBanner tone="error" title="ไม่พบใบสำคัญจ่ายนี้">
                กลับไปเลือกจากหน้ารายการ
            </StatusBanner>
        );
    if (loadError)
        return (
            <StatusBanner tone="error" title="โหลดใบสำคัญจ่ายไม่สำเร็จ">
                {loadError.message}
            </StatusBanner>
        );
    if (!detail) return <PageSkeleton />;

    const { payment, allocations, certificate, currency, actions } = detail;
    const decimals = currency.cur_decimals;
    const code = currency.cur_code;
    const payee = payment.pv_payee_snapshot;
    const payeeName = payee.kind === "employee" ? payee.full_name : payee.vd_name;
    const isCancelled = payment.pv_status === "cancelled";
    const hasFee = parseHundredths(payment.pv_fee_amount, "ค่าธรรมเนียม") > 0n;
    const expensePath = (kind: "bill" | "claim") => (kind === "claim" ? "/purchasing/claims" : "/purchasing/expenses");

    return (
        <div className="grid w-full grid-cols-1 gap-6">
            <PageHeader
                eyebrow={`จัดซื้อ · ใบสำคัญจ่าย · ${payment.pv_number}`}
                title={`จ่าย ${payeeName ?? "-"}`}
                description={`${formatDateOnly(payment.pv_payment_date)} · ${METHOD_LABELS[payment.pv_method]} · สาขา ${payment.branch_code} ${payment.branch_name_th}`}
                actions={
                    <StatusPill tone={isCancelled ? "danger" : "success"}>
                        {isCancelled ? "ยกเลิก" : "จ่ายแล้ว"}
                    </StatusPill>
                }
            />

            {isCancelled ? (
                <StatusBanner tone="error" title="ยกเลิกแล้ว">
                    เหตุผล: {payment.pv_cancel_reason}
                    {payment.cancelled_by_name ? ` · โดย ${payment.cancelled_by_name}` : ""} · {PAYMENT_MESSAGES.cancel}
                </StatusBanner>
            ) : (
                <StatusBanner tone="done" title={`จ่ายแล้ว ${formatAmount(payment.pv_net_paid, decimals)} ${code}`}>
                    บันทึกโดย {payment.pv_created_by_name ?? "-"} · {formatDate(payment.pv_created_at)}
                    {certificate ? ` · ออก 50 ทวิ ${certificate.wt_number} แล้ว · พิมพ์ฉบับที่ 1 ส่งให้ผู้รับ` : ""}
                </StatusBanner>
            )}

            <div className="flex flex-wrap gap-2">
                <a
                    href={`/purchasing/payments/print?id=${payment.pv_id}`}
                    target="_blank"
                    rel="noopener"
                    className={buttonClass("secondary", "md")}
                >
                    <Printer size={16} />
                    พิมพ์ใบสำคัญจ่าย
                </a>
                {certificate && (
                    <a
                        href={`/purchasing/wht-certificates/print?id=${certificate.wt_id}`}
                        target="_blank"
                        rel="noopener"
                        className={buttonClass("secondary", "md")}
                    >
                        <FileText size={16} />
                        พิมพ์ 50 ทวิ
                    </a>
                )}
                {actions.can_cancel && (
                    <button type="button" className={buttonClass("ghost", "md")} onClick={() => setIsCancelOpen(true)}>
                        <XCircle size={16} />
                        ยกเลิกใบสำคัญจ่าย
                    </button>
                )}
            </div>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
                <section className={`grid gap-5 p-5 sm:p-6 ${CARD_CLASS}`}>
                    <ul className="grid divide-y divide-gray-100 border-y border-gray-100">
                        {allocations.map((row) => (
                            <li
                                key={row.pva_expense_id}
                                className="grid gap-1 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4"
                            >
                                <div className="grid min-w-0 gap-0.5">
                                    <Link
                                        href={`${expensePath(row.ex_kind)}/view?id=${row.pva_expense_id}`}
                                        className="-my-1 py-1 text-blue-600 hover:underline"
                                    >
                                        {row.ex_number} · {row.ex_title}
                                    </Link>
                                    <span className="text-xs text-gray-500">
                                        ยอดรวม {formatAmount(row.ex_total, decimals)} · ก่อน VAT ส่วนนี้{" "}
                                        {formatAmount(row.pva_base_amount, decimals)}
                                        {row.wht_income_type_name ? ` · ${row.wht_income_type_name}` : ""}
                                    </span>
                                </div>
                                <span className="text-right tabular-nums text-gray-900 max-sm:text-left">
                                    {formatAmount(row.pva_amount, decimals)}
                                </span>
                            </li>
                        ))}
                    </ul>
                    <dl className="ml-auto grid w-full max-w-sm grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
                        <dt className="text-gray-600">ตัดหนี้รวม</dt>
                        <dd className="text-right tabular-nums">
                            {formatAmount(payment.pv_allocated_total, decimals)}
                        </dd>
                        <dt className="text-gray-600">หัก ณ ที่จ่าย</dt>
                        <dd className="text-right tabular-nums">−{formatAmount(payment.pv_wht_amount, decimals)}</dd>
                        <dt className="border-t border-gray-100 pt-1.5 text-base font-medium text-gray-900">
                            จ่ายผู้รับสุทธิ ({code})
                        </dt>
                        <dd className="border-t border-gray-100 pt-1.5 text-right text-base font-medium tabular-nums text-gray-900">
                            {formatAmount(payment.pv_net_paid, decimals)}
                        </dd>
                        {hasFee && (
                            <>
                                <dt className="text-gray-600">ค่าธรรมเนียมโอน (บริษัทจ่าย)</dt>
                                <dd className="text-right tabular-nums">
                                    {formatAmount(payment.pv_fee_amount, decimals)}
                                </dd>
                            </>
                        )}
                        {code !== "THB" && (
                            <>
                                <dt className="text-gray-600">ออกจากบัญชีจริง</dt>
                                <dd className="text-right tabular-nums">{formatAmount(payment.pv_paid_thb)} บาท</dd>
                                <dt className="text-gray-600">ส่วนต่างอัตรา (บวก = กำไร)</dt>
                                <dd className="text-right tabular-nums">{formatAmount(payment.pv_fx_diff_thb)} บาท</dd>
                            </>
                        )}
                    </dl>
                    {payment.pv_notes && (
                        <div className="grid gap-1 rounded-lg bg-gray-50 p-3 text-sm">
                            <h3 className="text-xs text-gray-500">หมายเหตุ</h3>
                            <p className="whitespace-pre-line text-gray-700">{payment.pv_notes}</p>
                        </div>
                    )}
                </section>

                <div className="grid gap-5">
                    <section className={`grid gap-1 p-5 text-sm ${CARD_CLASS}`}>
                        <h2 className="text-base font-medium text-gray-900">ผู้รับ ณ วันจ่าย</h2>
                        <p className="text-gray-800">{payeeName}</p>
                        {payee.vd_tax_id && <p className="text-xs text-gray-500">เลขผู้เสียภาษี {payee.vd_tax_id}</p>}
                        {payee.vd_bank_account_no && (
                            <p className="text-xs text-gray-500">
                                บัญชีผู้รับ {payee.vd_bank_name} {payee.vd_bank_account_no} (
                                {payee.vd_bank_account_name})
                            </p>
                        )}
                        {payment.pv_bank_snapshot && (
                            <p className="mt-2 text-xs text-gray-500">
                                จ่ายจาก {payment.pv_bank_snapshot.ba_bank_name} {payment.pv_bank_snapshot.ba_account_no}
                                {payment.pv_reference ? ` · อ้างอิง ${payment.pv_reference}` : ""}
                                {payment.pv_cheque_no ? ` · เช็คเลขที่ ${payment.pv_cheque_no}` : ""}
                            </p>
                        )}
                    </section>
                    <section className={`grid gap-2 p-5 text-sm ${CARD_CLASS}`}>
                        <h2 className="text-base font-medium text-gray-900">หนังสือรับรองหัก ณ ที่จ่าย</h2>
                        {certificate ? (
                            <>
                                <p className="text-gray-800">
                                    {certificate.wt_number} · {WHT_FORM_SHORT[certificate.wt_form]}
                                    {certificate.wt_status === "cancelled" ? " (ยกเลิก)" : ""}
                                </p>
                                <ul className="grid gap-1 text-xs text-gray-600">
                                    {certificate.lines.map((line) => (
                                        <li key={line.wtl_id} className="flex justify-between gap-2 tabular-nums">
                                            <span>
                                                {line.wtl_form_label} {Number(line.wtl_rate)}%
                                            </span>
                                            <span>
                                                {formatAmount(line.wtl_paid_amount)} →{" "}
                                                {formatAmount(line.wtl_tax_amount)}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </>
                        ) : (
                            <FieldHint>ใบนี้ไม่มีการหัก ณ ที่จ่าย</FieldHint>
                        )}
                    </section>
                </div>
            </div>

            {isCancelOpen && (
                <ReasonDialog
                    open
                    title="ยกเลิกใบสำคัญจ่ายนี้?"
                    description={PAYMENT_MESSAGES.cancel}
                    reasonHint="เหตุผลจะแสดงบนใบและในประวัติ เช่น โอนผิดบัญชี / ยอดผิด"
                    confirmLabel="ยกเลิกใบสำคัญจ่าย"
                    tone="danger"
                    loading={isWorking}
                    errorMessage={actionError}
                    onConfirm={cancelPayment}
                    onCancel={() => {
                        setIsCancelOpen(false);
                        setActionError(null);
                    }}
                />
            )}
        </div>
    );
}
