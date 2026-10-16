"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/page-header";
import { PageSkeleton } from "@/components/ui/skeleton";
import StatusBanner from "@/components/ui/guidance/status-banner";
import { apiFetch, type ApiError } from "@/lib/api";
import { useExpenseOptions } from "../../expenses/_hooks/use-expense-options";
import type { ExpenseDetail } from "../../expenses/_types";
import ClaimForm from "../_components/claim-form";

export default function EditClaimPage() {
    const claimId = useSearchParams().get("id");
    const { options, loadError: optionsError } = useExpenseOptions();
    const [detail, setDetail] = useState<ExpenseDetail | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);

    useEffect(() => {
        if (!claimId) return;
        let isLeftPage = false;
        apiFetch<ExpenseDetail>(`/claims/${claimId}`).then(({ data, error }) => {
            if (isLeftPage) return;
            setDetail(data);
            setLoadError(error);
        });
        return () => {
            isLeftPage = true;
        };
    }, [claimId]);

    const error = loadError ?? optionsError;
    const isNotEditable = detail && !detail.actions.can_edit;

    return (
        <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-6">
            <PageHeader
                eyebrow="เบิกเงิน"
                title="แก้ไขใบเบิก"
                description="แก้ได้จนกว่าจะส่ง · ส่งแล้วแก้ไม่ได้ (ผู้อนุมัติตีกลับให้แก้ได้)"
            />
            {!claimId && (
                <StatusBanner tone="error" title="ไม่พบใบเบิกนี้">
                    กลับไปเลือกจากหน้ารายการ
                </StatusBanner>
            )}
            {error && (
                <StatusBanner tone="error" title="โหลดข้อมูลไม่สำเร็จ">
                    {error.message}
                </StatusBanner>
            )}
            {isNotEditable && (
                <StatusBanner tone="warn" title="ใบเบิกนี้แก้ไขไม่ได้">
                    แก้ได้เฉพาะร่างของคุณเอง — กลับไปที่หน้าใบเบิกเพื่อดูสถานะล่าสุด
                </StatusBanner>
            )}
            {claimId && !error && (!detail || !options) && <PageSkeleton />}
            {detail && options && !isNotEditable && <ClaimForm options={options} detail={detail} />}
        </div>
    );
}
