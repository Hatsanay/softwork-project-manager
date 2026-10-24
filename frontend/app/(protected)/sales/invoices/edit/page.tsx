"use client";

// แก้ร่างใบแจ้งหนี้: ใบจากงวดแก้ได้แค่ข้อมูลประกอบ (ยอดล็อก) · ใบสร้างเองแก้ได้ทุกช่อง · ใบเพิ่มหนี้แก้ได้ทุกช่องยกเว้นหัวเอกสาร
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/page-header";
import { PageSkeleton } from "@/components/ui/skeleton";
import StatusBanner from "@/components/ui/guidance/status-banner";
import { apiFetch, type ApiError } from "@/lib/api";
import ManualInvoiceForm from "../_components/manual-invoice-form";
import QuotationInvoiceForm from "../_components/quotation-invoice-form";
import { useInvoiceOptions } from "../_hooks/use-invoice-options";
import type { InvoiceDetail } from "../_types";

export default function EditInvoicePage() {
    const invoiceId = useSearchParams().get("id");
    const { options, loadError: optionsError } = useInvoiceOptions();
    const [detail, setDetail] = useState<InvoiceDetail | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);

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

    const error = loadError ?? optionsError;
    const isDraft = detail?.invoice.inv_status === "draft";
    const isManual = detail?.invoice.inv_source === "manual";
    const isDebitNote = detail?.invoice.inv_doc_type === "debit_note";

    return (
        <div className="grid w-full grid-cols-1 gap-6">
            <PageHeader
                eyebrow="ขาย · ใบแจ้งหนี้"
                title={
                    detail
                        ? `แก้ร่าง${isDebitNote ? "ใบเพิ่มหนี้" : ""}: ${detail.invoice.inv_title}`
                        : "แก้ร่างใบแจ้งหนี้"
                }
                description={
                    detail && !isManual
                        ? `ออกจากใบเสนอราคา ${detail.invoice.qt_number ?? ""} — ยอดล็อกตามใบเสนอราคา`
                        : undefined
                }
            />
            {!invoiceId && (
                <StatusBanner tone="error" title="ไม่พบใบแจ้งหนี้นี้">
                    กลับไปเลือกจากหน้ารายการ
                </StatusBanner>
            )}
            {error && (
                <StatusBanner tone="error" title="โหลดข้อมูลไม่สำเร็จ">
                    {error.message}
                </StatusBanner>
            )}
            {detail && !isDraft && (
                <StatusBanner tone="info" title="ใบนี้ไม่ได้เป็นร่างแล้ว แก้ไขไม่ได้">
                    ใบที่ออกแล้วแก้ไม่ได้ — ใช้ &quot;ยกเลิกแล้วออกใหม่แทน&quot; จากหน้าเอกสาร
                </StatusBanner>
            )}
            {invoiceId && !error && (!detail || !options) && <PageSkeleton />}
            {detail && options && isDraft && isManual && <ManualInvoiceForm options={options} detail={detail} />}
            {detail && options && isDraft && !isManual && <QuotationInvoiceForm options={options} detail={detail} />}
        </div>
    );
}
