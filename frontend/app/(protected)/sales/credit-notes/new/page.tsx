"use client";

// สร้างใบลดหนี้จากใบแจ้งหนี้ที่ออกแล้ว (?invoice=) — ปุ่ม "ออกใบลดหนี้" ที่หน้าใบแจ้งหนี้พามาที่นี่
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/page-header";
import { PageSkeleton } from "@/components/ui/skeleton";
import StatusBanner from "@/components/ui/guidance/status-banner";
import { apiFetch, type ApiError } from "@/lib/api";
import type { InvoiceDetail } from "../../invoices/_types";
import CreditNoteForm from "../_components/credit-note-form";

export default function NewCreditNotePage() {
    const invoiceId = useSearchParams().get("invoice");
    const [invoiceDetail, setInvoiceDetail] = useState<InvoiceDetail | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);

    useEffect(() => {
        if (!invoiceId) return;
        let isLeftPage = false;
        apiFetch<InvoiceDetail>(`/invoices/${invoiceId}`).then(({ data, error }) => {
            if (isLeftPage) return;
            setInvoiceDetail(data);
            setLoadError(error);
        });
        return () => {
            isLeftPage = true;
        };
    }, [invoiceId]);

    const blockedReason =
        invoiceDetail && !invoiceDetail.actions.can_credit ? invoiceDetail.actions.credit_blocked_reason : null;

    return (
        <div className="grid w-full grid-cols-1 gap-6">
            <PageHeader eyebrow="ขาย · ใบลดหนี้" title="ออกใบลดหนี้" description={invoiceDetail?.invoice.inv_title} />
            {!invoiceId && (
                <StatusBanner tone="info" title="เลือกใบแจ้งหนี้ก่อน">
                    ใบลดหนี้ออกจากหน้าใบแจ้งหนี้ที่ออกแล้ว — เปิดใบแจ้งหนี้ แล้วกด &quot;ออกใบลดหนี้&quot; ·{" "}
                    <Link href="/sales/invoices" className="py-2 text-blue-600 hover:underline">
                        ไปหน้าใบแจ้งหนี้
                    </Link>
                </StatusBanner>
            )}
            {loadError && (
                <StatusBanner tone="error" title="โหลดใบแจ้งหนี้ไม่สำเร็จ">
                    {loadError.message}
                </StatusBanner>
            )}
            {invoiceDetail && !invoiceDetail.actions.can_credit && (
                <StatusBanner tone="warn" title="ออกใบลดหนี้ของใบนี้ไม่ได้">
                    {blockedReason ?? "ต้องเป็นใบแจ้งหนี้ที่ออกแล้ว และคุณต้องมีสิทธิ์สร้างใบแจ้งหนี้"}
                </StatusBanner>
            )}
            {invoiceId && !loadError && !invoiceDetail && <PageSkeleton />}
            {invoiceDetail?.actions.can_credit && <CreditNoteForm invoiceDetail={invoiceDetail} />}
        </div>
    );
}
