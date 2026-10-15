"use client";

// สร้างใบแจ้งหนี้: มี ?quotation= = เลือกงวดของใบเสนอราคา · ไม่มี = สร้างเอง (ต้องอนุมัติ)
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/page-header";
import { PageSkeleton } from "@/components/ui/skeleton";
import StatusBanner from "@/components/ui/guidance/status-banner";
import ManualInvoiceForm from "../_components/manual-invoice-form";
import MilestonePicker from "../_components/milestone-picker";
import { useInvoiceOptions } from "../_hooks/use-invoice-options";
import { INVOICE_MESSAGES } from "../_messages";

export default function NewInvoicePage() {
    const quotationId = useSearchParams().get("quotation");
    return quotationId ? <FromQuotation quotationId={quotationId} /> : <Manual />;
}

function FromQuotation({ quotationId }: { quotationId: string }) {
    return (
        <div className="mx-auto grid max-w-3xl grid-cols-1 gap-6">
            <PageHeader
                eyebrow="ขาย · ใบแจ้งหนี้"
                title="ออกใบแจ้งหนี้จากงวด"
                description="เลือกงวดแล้วสร้างร่าง — ตรวจเครดิตเทอม หัก ณ ที่จ่าย และบัญชีรับเงินในร่าง แล้วกดออกใบแจ้งหนี้"
            />
            <MilestonePicker quotationId={quotationId} />
        </div>
    );
}

function Manual() {
    const { options, loadError } = useInvoiceOptions();
    return (
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6">
            <PageHeader
                eyebrow="ขาย · ใบแจ้งหนี้"
                title="สร้างใบแจ้งหนี้เอง"
                description={INVOICE_MESSAGES.manualApproval}
            />
            {loadError && (
                <StatusBanner tone="error" title="โหลดข้อมูลไม่สำเร็จ">
                    {loadError.message}
                </StatusBanner>
            )}
            {!options && !loadError && <PageSkeleton />}
            {options && <ManualInvoiceForm options={options} />}
        </div>
    );
}
