"use client";

import PageHeader from "@/components/ui/page-header";
import { PageSkeleton } from "@/components/ui/skeleton";
import StatusBanner from "@/components/ui/guidance/status-banner";
import { useExpenseOptions } from "../../expenses/_hooks/use-expense-options";
import ClaimForm from "../_components/claim-form";
import { CLAIM_MESSAGES } from "../_messages";

export default function NewClaimPage() {
    const { options, loadError } = useExpenseOptions();

    return (
        <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-6">
            <PageHeader eyebrow="เบิกเงิน" title="เบิกเงินคืน" description={CLAIM_MESSAGES.listDescription} />
            {loadError && (
                <StatusBanner tone="error" title="โหลดข้อมูลสำหรับฟอร์มไม่สำเร็จ">
                    {loadError.message}
                </StatusBanner>
            )}
            {!options && !loadError && <PageSkeleton />}
            {options && <ClaimForm options={options} />}
        </div>
    );
}
