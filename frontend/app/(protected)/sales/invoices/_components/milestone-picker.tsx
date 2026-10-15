"use client";

// เลือกงวดของใบเสนอราคาที่จะเรียกเก็บ → สร้างร่างใบแจ้งหนี้ (เลือกหลายงวดรวมเป็นใบเดียวได้)
// งวดที่อยู่ในใบอื่นที่ยังไม่ยกเลิก (รวมร่าง) เลือกไม่ได้ พร้อมลิงก์ไปใบนั้น
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check } from "lucide-react";
import StatusBanner from "@/components/ui/guidance/status-banner";
import FieldHint from "@/components/ui/guidance/field-hint";
import SaveErrorBanner from "@/components/ui/save-error-banner";
import { CARD_CLASS } from "@/components/ui/card";
import { PageSkeleton } from "@/components/ui/skeleton";
import { buttonClass } from "@/components/ui/button";
import { apiFetch, type ApiError } from "@/lib/api";
import { formatAmount, parseHundredths } from "@/lib/shared/money.mjs";
import { INVOICE_MESSAGES, STATUS_LABELS } from "../_messages";
import { invoiceReferenceLabel } from "../_format";
import type { BillableMilestones } from "../_types";

export default function MilestonePicker({ quotationId }: { quotationId: string }) {
    const router = useRouter();
    const [billable, setBillable] = useState<BillableMilestones | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [saveError, setSaveError] = useState<ApiError | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        let isLeftPage = false;
        apiFetch<BillableMilestones>(`/quotations/${quotationId}/billable-milestones`).then(({ data, error }) => {
            if (isLeftPage) return;
            setBillable(data);
            setLoadError(error);
            // งวดที่ยังว่างงวดแรก เลือกไว้ให้ก่อน (กรณีส่วนใหญ่ออกทีละงวดตามลำดับ)
            const firstOpen = data?.milestones.find((milestone) => !milestone.billed_invoice);
            if (firstOpen) setSelectedIds([firstOpen.qtm_id]);
        });
        return () => {
            isLeftPage = true;
        };
    }, [quotationId]);

    if (loadError)
        return (
            <StatusBanner tone="error" title="โหลดงวดของใบเสนอราคาไม่สำเร็จ">
                {loadError.message}
            </StatusBanner>
        );
    if (!billable) return <PageSkeleton />;

    const currencyCode = billable.quotation.qt_currency;
    const openMilestones = billable.milestones.filter((milestone) => !milestone.billed_invoice);
    const selectedTotal = billable.milestones
        .filter((milestone) => selectedIds.includes(milestone.qtm_id))
        .reduce((sum, milestone) => sum + parseHundredths(milestone.qtm_amount, "ยอดงวด"), 0n);

    function toggle(milestoneId: number) {
        setSelectedIds((current) =>
            current.includes(milestoneId) ? current.filter((id) => id !== milestoneId) : [...current, milestoneId],
        );
    }

    async function createDraft() {
        setIsSaving(true);
        setSaveError(null);
        const { data, error } = await apiFetch<{ inv_id: string }>("/invoices", {
            method: "POST",
            body: { quotation_id: quotationId, milestone_ids: selectedIds },
        });
        setIsSaving(false);
        if (error) {
            setSaveError(error);
            return;
        }
        toast.success("สร้างร่างใบแจ้งหนี้แล้ว — ตรวจแล้วกดออกใบแจ้งหนี้");
        router.push(`/sales/invoices/view?id=${data.inv_id}`);
    }

    if (!billable.can_bill) {
        return (
            <StatusBanner tone="warn" title="ใบเสนอราคานี้ยังออกใบแจ้งหนี้ไม่ได้">
                ออกได้เฉพาะใบเสนอราคาที่ลูกค้าตอบรับแล้ว — บันทึกว่าลูกค้าตอบรับที่{" "}
                <Link href={`/sales/quotations/view?id=${quotationId}`} className="py-2 text-blue-600 hover:underline">
                    หน้าใบเสนอราคา
                </Link>{" "}
                ก่อน
            </StatusBanner>
        );
    }

    return (
        <div className="grid grid-cols-1 gap-5">
            <section className={`grid gap-4 p-5 sm:p-6 ${CARD_CLASS}`}>
                <div className="grid gap-0.5">
                    <h2 className="text-base font-medium text-gray-900">
                        งวดของใบเสนอราคา{" "}
                        <Link
                            href={`/sales/quotations/view?id=${quotationId}`}
                            className="py-2 text-blue-600 hover:underline"
                        >
                            {billable.quotation.qt_number}
                        </Link>
                    </h2>
                    <FieldHint>{INVOICE_MESSAGES.pickerDescription}</FieldHint>
                </div>

                <ul className="grid gap-2">
                    {billable.milestones.map((milestone) => {
                        const isBilled = Boolean(milestone.billed_invoice);
                        const isSelected = selectedIds.includes(milestone.qtm_id);
                        return (
                            <li key={milestone.qtm_id}>
                                <button
                                    type="button"
                                    disabled={isBilled}
                                    aria-pressed={isSelected}
                                    onClick={() => toggle(milestone.qtm_id)}
                                    className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left text-sm transition ${
                                        isSelected
                                            ? "border-blue-300 bg-blue-50"
                                            : "border-gray-200 bg-white hover:bg-gray-50"
                                    } disabled:cursor-default disabled:bg-gray-50`}
                                >
                                    <span
                                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                                            isSelected
                                                ? "border-blue-500 bg-blue-500 text-white"
                                                : "border-gray-300 bg-white"
                                        }`}
                                    >
                                        {isSelected && <Check size={14} />}
                                    </span>
                                    <span className="grid min-w-0 flex-1 gap-0.5">
                                        <span className="font-medium text-gray-900">
                                            งวดที่ {milestone.qtm_order} {milestone.qtm_name}
                                            {milestone.qtm_percent ? ` (${Number(milestone.qtm_percent)}%)` : ""}
                                        </span>
                                        {milestone.qtm_condition && (
                                            <span className="text-xs text-gray-500">{milestone.qtm_condition}</span>
                                        )}
                                        {milestone.billed_invoice && (
                                            <span className="text-xs text-gray-500">
                                                {milestone.billed_invoice.inv_number
                                                    ? `อยู่ใน ${milestone.billed_invoice.inv_number} (${STATUS_LABELS[milestone.billed_invoice.inv_status].label})`
                                                    : `อยู่ใน${invoiceReferenceLabel(milestone.billed_invoice)} (${STATUS_LABELS[milestone.billed_invoice.inv_status].label}) — ลบร่างนั้นก่อนถ้าจะเลือกงวดนี้`}
                                            </span>
                                        )}
                                    </span>
                                    <span className="grid shrink-0 justify-items-end gap-0.5 tabular-nums">
                                        <span className="font-medium text-gray-900">
                                            {formatAmount(milestone.qtm_amount)} {currencyCode}
                                        </span>
                                        {milestone.vat_amount && Number(milestone.vat_amount) > 0 && (
                                            <span className="text-xs text-gray-500">
                                                รวม VAT {formatAmount(milestone.vat_amount)}
                                            </span>
                                        )}
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
                {billable.milestones.some((milestone) => milestone.billed_invoice) && (
                    <FieldHint>{INVOICE_MESSAGES.milestoneBilled}</FieldHint>
                )}
            </section>

            {openMilestones.length === 0 ? (
                <StatusBanner tone="done" title="ออกบิลครบทุกงวดแล้ว">
                    ทุกงวดของใบเสนอราคานี้อยู่ในใบแจ้งหนี้แล้ว — เปิดดูได้จากลิงก์ในแต่ละงวด
                </StatusBanner>
            ) : (
                <>
                    <SaveErrorBanner error={saveError} />
                    <div className="sticky bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-10 flex items-center justify-end gap-3 rounded-2xl border border-gray-200 bg-white/95 p-3 shadow-float backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none sm:backdrop-blur-none">
                        <div className="mr-auto grid min-w-0">
                            <span className="text-xs text-gray-500">เรียกเก็บ {selectedIds.length} งวด</span>
                            <span className="truncate font-medium text-gray-900 tabular-nums">
                                {formatAmount(selectedTotal)} {currencyCode}
                            </span>
                        </div>
                        <button
                            type="button"
                            className={buttonClass("primary", "md")}
                            disabled={selectedIds.length === 0 || isSaving}
                            onClick={createDraft}
                        >
                            {isSaving ? "กำลังสร้าง..." : "สร้างร่างใบแจ้งหนี้"}
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
