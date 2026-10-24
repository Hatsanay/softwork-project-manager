"use client";

// แก้ร่างใบลดหนี้ — ใบที่ส่งขออนุมัติ/ออกแล้วแก้ไม่ได้ (ผู้อนุมัติตีกลับก่อน)
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/page-header";
import { PageSkeleton } from "@/components/ui/skeleton";
import StatusBanner from "@/components/ui/guidance/status-banner";
import { apiFetch, type ApiError } from "@/lib/api";
import type { InvoiceDetail } from "../../invoices/_types";
import CreditNoteForm from "../_components/credit-note-form";
import type { CreditNoteDetail } from "../_types";

export default function EditCreditNotePage() {
    const creditNoteId = useSearchParams().get("id");
    const [detail, setDetail] = useState<CreditNoteDetail | null>(null);
    const [invoiceDetail, setInvoiceDetail] = useState<InvoiceDetail | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);

    useEffect(() => {
        if (!creditNoteId) return;
        let isLeftPage = false;
        (async () => {
            const creditNote = await apiFetch<CreditNoteDetail>(`/credit-notes/${creditNoteId}`);
            if (isLeftPage) return;
            if (creditNote.error || !creditNote.data) {
                setLoadError(creditNote.error);
                return;
            }
            setDetail(creditNote.data);
            const invoice = await apiFetch<InvoiceDetail>(`/invoices/${creditNote.data.credit_note.cn_invoice_id}`);
            if (isLeftPage) return;
            setInvoiceDetail(invoice.data);
            setLoadError(invoice.error);
        })();
        return () => {
            isLeftPage = true;
        };
    }, [creditNoteId]);

    const isDraft = detail?.credit_note.cn_status === "draft";

    return (
        <div className="grid w-full grid-cols-1 gap-6">
            <PageHeader
                eyebrow="ขาย · ใบลดหนี้"
                title="แก้ร่างใบลดหนี้"
                description={detail ? `อ้างใบแจ้งหนี้ ${detail.invoice.inv_number ?? ""}` : undefined}
            />
            {!creditNoteId && (
                <StatusBanner tone="error" title="ไม่พบใบลดหนี้นี้">
                    กลับไปเลือกจากหน้ารายการ
                </StatusBanner>
            )}
            {loadError && (
                <StatusBanner tone="error" title="โหลดข้อมูลไม่สำเร็จ">
                    {loadError.message}
                </StatusBanner>
            )}
            {detail && !isDraft && (
                <StatusBanner tone="info" title="ใบนี้ไม่ได้เป็นร่างแล้ว แก้ไขไม่ได้">
                    ใบที่รออนุมัติให้ผู้อนุมัติตีกลับก่อน · ใบที่ออกแล้วแก้ไม่ได้ — ยกเลิกแล้วออกใบลดหนี้ใหม่
                </StatusBanner>
            )}
            {creditNoteId && !loadError && (!detail || !invoiceDetail) && <PageSkeleton />}
            {detail && invoiceDetail && isDraft && <CreditNoteForm invoiceDetail={invoiceDetail} detail={detail} />}
        </div>
    );
}
