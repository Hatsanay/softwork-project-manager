"use client";

// สร้างใบวางบิล — เลือกลูกค้า แล้วติ๊กใบแจ้งหนี้ที่ออกแล้วและยังค้างชำระ
import PageHeader from "@/components/ui/page-header";
import { PageSkeleton } from "@/components/ui/skeleton";
import StatusBanner from "@/components/ui/guidance/status-banner";
import { useInvoiceOptions } from "../../invoices/_hooks/use-invoice-options";
import BillingNoteForm from "../_components/billing-note-form";
import { BILLING_NOTE_MESSAGES } from "../_messages";

export default function NewBillingNotePage() {
    const { options, loadError } = useInvoiceOptions();

    return (
        <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-6">
            <PageHeader
                eyebrow="ขาย · ใบวางบิล"
                title="สร้างใบวางบิล"
                description={BILLING_NOTE_MESSAGES.listDescription}
            />
            {loadError && (
                <StatusBanner tone="error" title="โหลดข้อมูลไม่สำเร็จ">
                    {loadError.message}
                </StatusBanner>
            )}
            {!loadError && !options && <PageSkeleton />}
            {options && <BillingNoteForm options={options} />}
        </div>
    );
}
