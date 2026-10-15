"use client";

// การ์ด "การเรียกเก็บเงิน" บนหน้าใบเสนอราคาที่ลูกค้าตอบรับแล้ว — แต่ละงวดออกบิลแล้วหรือยัง (ลิงก์ไปใบแจ้งหนี้) + ปุ่มออกใบแจ้งหนี้
// แสดงเฉพาะผู้ที่ดูใบแจ้งหนี้ได้ · ปุ่มออกบิลเฉพาะผู้ที่สร้างใบแจ้งหนี้ได้
import { useEffect, useState } from "react";
import Link from "next/link";
import { ReceiptText } from "lucide-react";
import FieldHint from "@/components/ui/guidance/field-hint";
import StatusPill from "@/components/ui/status-pill";
import { CARD_CLASS } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { usePermission, BITS } from "@/app/components/permission-provider";
import { apiFetch } from "@/lib/api";
import { formatAmount } from "@/lib/shared/money.mjs";
import { STATUS_LABELS } from "../_messages";
import { invoiceReferenceLabel } from "../_format";
import type { BillableMilestones } from "../_types";

export default function QuotationBillingCard({
    quotationId,
    currencyDecimals,
}: {
    quotationId: string;
    currencyDecimals: number;
}) {
    const hasBit = usePermission();
    const canView = hasBit(BITS.viewInvoices);
    const canCreate = hasBit(BITS.createInvoice);
    const [billable, setBillable] = useState<BillableMilestones | null>(null);

    useEffect(() => {
        if (!canView) return;
        let isLeftPage = false;
        apiFetch<BillableMilestones>(`/quotations/${quotationId}/billable-milestones`).then(({ data }) => {
            if (!isLeftPage) setBillable(data);
        });
        return () => {
            isLeftPage = true;
        };
    }, [quotationId, canView]);

    if (!canView || !billable) return null;
    const openCount = billable.milestones.filter((milestone) => !milestone.billed_invoice).length;
    const currencyCode = billable.quotation.qt_currency;

    return (
        <section className={`grid gap-3 p-5 text-sm ${CARD_CLASS}`}>
            <div className="flex items-center gap-2">
                <ReceiptText size={18} className="text-blue-600" />
                <h2 className="text-base font-medium text-gray-900">การเรียกเก็บเงิน</h2>
            </div>
            <ul className="grid gap-2">
                {billable.milestones.map((milestone) => (
                    <li key={milestone.qtm_id} className="grid gap-1 rounded-lg bg-gray-50 p-2.5">
                        <div className="flex items-start justify-between gap-2">
                            <span className="text-gray-800">
                                งวดที่ {milestone.qtm_order} {milestone.qtm_name}
                            </span>
                            <span className="shrink-0 tabular-nums text-gray-900">
                                {formatAmount(milestone.qtm_amount, currencyDecimals)} {currencyCode}
                            </span>
                        </div>
                        {milestone.billed_invoice ? (
                            <span className="flex flex-wrap items-center gap-1.5 text-xs">
                                <Link
                                    href={`/sales/invoices/view?id=${milestone.billed_invoice.inv_id}`}
                                    className="-my-1 py-2.5 text-blue-600 hover:underline"
                                >
                                    {invoiceReferenceLabel(milestone.billed_invoice)}
                                </Link>
                                <StatusPill tone={STATUS_LABELS[milestone.billed_invoice.inv_status].tone}>
                                    {STATUS_LABELS[milestone.billed_invoice.inv_status].label}
                                </StatusPill>
                            </span>
                        ) : (
                            <span className="text-xs text-gray-500">ยังไม่ออกบิล</span>
                        )}
                    </li>
                ))}
            </ul>
            {canCreate && openCount > 0 && (
                <Link href={`/sales/invoices/new?quotation=${quotationId}`} className={buttonClass("primary", "md")}>
                    <ReceiptText size={16} />
                    ออกใบแจ้งหนี้
                </Link>
            )}
            <FieldHint>
                {openCount === 0
                    ? "ออกบิลครบทุกงวดแล้ว"
                    : "เลือกได้หลายงวดรวมเป็นใบเดียว · ยอดตามที่ลูกค้าตอบรับ · ไม่ต้องอนุมัติซ้ำ"}
            </FieldHint>
        </section>
    );
}
