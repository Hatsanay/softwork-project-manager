"use client";

// แก้ร่างใบวางบิล — ใบที่ออกแล้วแก้ไม่ได้ (ยกเลิกแล้วสร้างใหม่)
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/page-header";
import { PageSkeleton } from "@/components/ui/skeleton";
import StatusBanner from "@/components/ui/guidance/status-banner";
import { apiFetch, type ApiError } from "@/lib/api";
import { useInvoiceOptions } from "../../invoices/_hooks/use-invoice-options";
import BillingNoteForm from "../_components/billing-note-form";
import type { BillingNoteDetail } from "../_types";

export default function EditBillingNotePage() {
    const billingNoteId = useSearchParams().get("id");
    const { options, loadError: optionsError } = useInvoiceOptions();
    const [detail, setDetail] = useState<BillingNoteDetail | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);

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

    const error = loadError ?? optionsError;
    const isDraft = detail?.billing_note.bn_status === "draft";

    return (
        <div className="grid w-full grid-cols-1 gap-6">
            <PageHeader
                eyebrow="ขาย · ใบวางบิล"
                title="แก้ร่างใบวางบิล"
                description={detail ? detail.billing_note.client_company || detail.billing_note.client_name : undefined}
            />
            {!billingNoteId && (
                <StatusBanner tone="error" title="ไม่พบใบวางบิลนี้">
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
                    ใบที่ออกแล้วแก้ไม่ได้ · ยกเลิกใบนี้แล้วสร้างใบวางบิลใหม่
                </StatusBanner>
            )}
            {billingNoteId && !error && (!detail || !options) && <PageSkeleton />}
            {detail && options && isDraft && <BillingNoteForm options={options} detail={detail} />}
        </div>
    );
}
