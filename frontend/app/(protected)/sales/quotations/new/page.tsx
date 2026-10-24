"use client";

import PageHeader from "@/components/ui/page-header";
import { PageSkeleton } from "@/components/ui/skeleton";
import StatusBanner from "@/components/ui/guidance/status-banner";
import QuotationForm from "../_components/quotation-form";
import { useFormOptions } from "../_hooks/use-form-options";

export default function NewQuotationPage() {
    const { options, loadError } = useFormOptions();

    return (
        <div className="grid w-full gap-6">
            <PageHeader
                eyebrow="ขาย · ใบเสนอราคา"
                title="สร้างใบเสนอราคา"
                description="บันทึกเป็นร่างก่อน แล้วส่งขออนุมัติจากหน้าเอกสาร"
            />
            {loadError && (
                <StatusBanner tone="error" title="โหลดข้อมูลไม่สำเร็จ">
                    {loadError.message}
                </StatusBanner>
            )}
            {!options && !loadError && <PageSkeleton />}
            {options && <QuotationForm options={options} />}
        </div>
    );
}
