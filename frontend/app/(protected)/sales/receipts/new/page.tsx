"use client";

// บันทึกรับเงิน (= ออกใบเสร็จ) — เปิดจากเมนู / หน้าใบแจ้งหนี้ (?invoice=) / หน้าใบวางบิล (?billing_note=) / ลูกค้า (?client=)
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/page-header";
import { PageSkeleton } from "@/components/ui/skeleton";
import StatusBanner from "@/components/ui/guidance/status-banner";
import { useInvoiceOptions } from "../../invoices/_hooks/use-invoice-options";
import ReceiptForm from "../_components/receipt-form";
import { RECEIPT_MESSAGES } from "../_messages";

export default function NewReceiptPage() {
    const searchParams = useSearchParams();
    const { options, loadError } = useInvoiceOptions();

    return (
        <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-6">
            <PageHeader
                eyebrow="ขาย · ใบเสร็จรับเงิน"
                title="บันทึกรับเงิน"
                description={RECEIPT_MESSAGES.listDescription}
            />
            {loadError && (
                <StatusBanner tone="error" title="โหลดข้อมูลไม่สำเร็จ">
                    {loadError.message}
                </StatusBanner>
            )}
            {!loadError && !options && <PageSkeleton />}
            {options && (
                <ReceiptForm
                    options={options}
                    initialInvoiceId={searchParams.get("invoice")}
                    billingNoteId={searchParams.get("billing_note")}
                    initialClientId={searchParams.get("client")}
                />
            )}
        </div>
    );
}
