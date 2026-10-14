"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/page-header";
import { PageSkeleton } from "@/components/ui/skeleton";
import StatusBanner from "@/components/ui/guidance/status-banner";
import { apiFetch, type ApiError } from "@/lib/api";
import QuotationForm from "../_components/quotation-form";
import { useFormOptions } from "../_hooks/use-form-options";
import { documentNumberLabel } from "../_format";
import type { QuotationDetail } from "../_types";

export default function EditQuotationPage() {
    const quotationId = useSearchParams().get("id");
    const { options, loadError: optionsError } = useFormOptions();
    const [detail, setDetail] = useState<QuotationDetail | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);

    useEffect(() => {
        if (!quotationId) return;
        let isLeftPage = false;
        apiFetch<QuotationDetail>(`/quotations/${quotationId}`).then(({ data, error }) => {
            if (isLeftPage) return;
            setDetail(data);
            setLoadError(error);
        });
        return () => {
            isLeftPage = true;
        };
    }, [quotationId]);

    const error = loadError ?? optionsError;
    const isDraft = detail?.quotation.qt_status === "draft";

    return (
        <div className="mx-auto grid max-w-6xl gap-6">
            <PageHeader
                eyebrow="ขาย · ใบเสนอราคา"
                title={detail ? `แก้ร่าง: ${detail.quotation.qt_title}` : "แก้ร่างใบเสนอราคา"}
                description={detail ? documentNumberLabel(detail.quotation) : undefined}
            />
            {!quotationId && (
                <StatusBanner tone="error" title="ไม่พบใบเสนอราคานี้">
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
                    ใบที่ส่งขออนุมัติแล้วแก้ไม่ได้ — ถ้าอนุมัติแล้วต้องการแก้ ให้ออก revision จากหน้าเอกสาร
                </StatusBanner>
            )}
            {quotationId && !error && (!detail || !options) && <PageSkeleton />}
            {detail && options && isDraft && <QuotationForm options={options} detail={detail} />}
        </div>
    );
}
