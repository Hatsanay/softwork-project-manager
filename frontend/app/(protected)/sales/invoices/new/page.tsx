"use client";

// สร้างใบแจ้งหนี้: มี ?quotation= = เลือกงวดของใบเสนอราคา · มี ?debit_for= = ใบเพิ่มหนี้จากใบนั้น (ขั้น N-2)
// ไม่มีทั้งคู่ = สร้างเอง (ต้องอนุมัติ)
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiFetch, type ApiError } from "@/lib/api";
import { buttonClass } from "@/components/ui/button";
import PageHeader from "@/components/ui/page-header";
import { PageSkeleton } from "@/components/ui/skeleton";
import StatusBanner from "@/components/ui/guidance/status-banner";
import ManualInvoiceForm from "../_components/manual-invoice-form";
import MilestonePicker from "../_components/milestone-picker";
import { useInvoiceOptions } from "../_hooks/use-invoice-options";
import { INVOICE_MESSAGES } from "../_messages";
import type { InvoiceDetail } from "../_types";

export default function NewInvoicePage() {
    const searchParams = useSearchParams();
    const quotationId = searchParams.get("quotation");
    const debitForId = searchParams.get("debit_for");
    if (quotationId) return <FromQuotation quotationId={quotationId} />;
    if (debitForId) return <DebitNote referenceId={debitForId} />;
    return <Manual />;
}

function DebitNote({ referenceId }: { referenceId: string }) {
    const { options, loadError: optionsError } = useInvoiceOptions();
    const [reference, setReference] = useState<InvoiceDetail | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);

    useEffect(() => {
        let isLeftPage = false;
        apiFetch<InvoiceDetail>(`/invoices/${referenceId}`).then(({ data, error }) => {
            if (isLeftPage) return;
            setReference(data);
            setLoadError(error);
        });
        return () => {
            isLeftPage = true;
        };
    }, [referenceId]);

    const error = loadError ?? optionsError;
    const blockedReason =
        reference && !reference.actions.can_debit
            ? (reference.actions.debit_blocked_reason ??
              "ใบนี้ออกใบเพิ่มหนี้ไม่ได้ — ต้องเป็นใบแจ้งหนี้ที่ออกแล้ว และคุณต้องมีสิทธิ์สร้างใบแจ้งหนี้")
            : null;
    return (
        <div className="grid w-full grid-cols-1 gap-6">
            <PageHeader
                eyebrow="ขาย · ใบแจ้งหนี้"
                title={reference ? `ออกใบเพิ่มหนี้ · ${reference.invoice.inv_number ?? ""}` : "ออกใบเพิ่มหนี้"}
                description={INVOICE_MESSAGES.debitNote}
            />
            {error && (
                <StatusBanner tone="error" title="โหลดข้อมูลไม่สำเร็จ">
                    {error.message}
                </StatusBanner>
            )}
            {!error && (!reference || !options) && <PageSkeleton />}
            {blockedReason && (
                <StatusBanner tone="info" title="ออกใบเพิ่มหนี้จากใบนี้ไม่ได้">
                    <p>{blockedReason}</p>
                    <Link
                        href={`/sales/invoices/view?id=${referenceId}`}
                        className={`${buttonClass("secondary", "sm")} mt-2`}
                    >
                        กลับไปหน้าใบแจ้งหนี้
                    </Link>
                </StatusBanner>
            )}
            {reference && options && !blockedReason && (
                <ManualInvoiceForm options={options} debitReference={reference} />
            )}
        </div>
    );
}

function FromQuotation({ quotationId }: { quotationId: string }) {
    return (
        <div className="grid w-full grid-cols-1 gap-6">
            <PageHeader
                eyebrow="ขาย · ใบแจ้งหนี้"
                title="ออกใบแจ้งหนี้จากงวด"
                description="เลือกงวดแล้วสร้างร่าง — ตรวจเครดิตเทอม หัก ณ ที่จ่าย และบัญชีรับเงินในร่าง แล้วกดออกใบแจ้งหนี้"
            />
            <MilestonePicker quotationId={quotationId} />
        </div>
    );
}

function Manual() {
    const { options, loadError } = useInvoiceOptions();
    return (
        <div className="grid w-full grid-cols-1 gap-6">
            <PageHeader
                eyebrow="ขาย · ใบแจ้งหนี้"
                title="สร้างใบแจ้งหนี้เอง"
                description={INVOICE_MESSAGES.manualApproval}
            />
            {loadError && (
                <StatusBanner tone="error" title="โหลดข้อมูลไม่สำเร็จ">
                    {loadError.message}
                </StatusBanner>
            )}
            {!options && !loadError && <PageSkeleton />}
            {options && <ManualInvoiceForm options={options} />}
        </div>
    );
}
