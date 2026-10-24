"use client";

// ลูกหนี้คงค้างรายใบของลูกค้าหนึ่งราย (2026-10-15 ขั้น 1C-4) — ยอดค้างสกุลของใบ + เทียบบาท · ช่วงอายุ · ทางลัดไปบันทึกรับเงิน
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Banknote } from "lucide-react";
import PageHeader from "@/components/ui/page-header";
import StatusBanner from "@/components/ui/guidance/status-banner";
import StatusPill from "@/components/ui/status-pill";
import { CARD_CLASS } from "@/components/ui/card";
import { PageSkeleton } from "@/components/ui/skeleton";
import { buttonClass } from "@/components/ui/button";
import { usePermission, BITS } from "@/app/components/permission-provider";
import { formatDateOnly } from "@/app/function";
import { apiFetch, type ApiError } from "@/lib/api";
import { formatAmount, parseHundredths } from "@/lib/shared/money.mjs";
import { BUCKET_TONES, RECEIVABLE_MESSAGES } from "../_messages";
import type { AgingInvoiceRow, AgingOfClient } from "../_types";

function overdueLabel(row: AgingInvoiceRow) {
    return row.days_overdue > 0 ? `เกินกำหนด ${row.days_overdue} วัน` : "ยังไม่ถึงกำหนด";
}

export default function ReceivableClientPage() {
    const clientId = useSearchParams().get("id");
    const hasBit = usePermission();
    const [aging, setAging] = useState<AgingOfClient | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);

    useEffect(() => {
        if (!clientId) return;
        let isLeftPage = false;
        apiFetch<AgingOfClient>(`/receivables/aging/${encodeURIComponent(clientId)}`).then(({ data, error }) => {
            if (isLeftPage) return;
            setAging(data);
            setLoadError(error);
        });
        return () => {
            isLeftPage = true;
        };
    }, [clientId]);

    if (!clientId)
        return (
            <StatusBanner tone="error" title="ไม่พบลูกค้านี้">
                กลับไปเลือกจากหน้าลูกหนี้คงค้าง
            </StatusBanner>
        );
    if (loadError)
        return (
            <StatusBanner tone="error" title="โหลดลูกหนี้ไม่สำเร็จ">
                {loadError.message}
            </StatusBanner>
        );
    if (!aging) return <PageSkeleton />;

    const clientName = aging.client ? aging.client.client_company || aging.client.client_name : "ลูกค้า";
    const totalThb = aging.invoices.reduce((sum, row) => sum + parseHundredths(row.outstanding_thb, "ยอด"), 0n);
    const bucketLabel = new Map(aging.buckets.map((bucket) => [bucket.key, bucket.label]));

    return (
        <div className="grid w-full grid-cols-1 gap-6">
            <PageHeader
                eyebrow="ขาย · ลูกหนี้คงค้าง"
                title={clientName}
                description={RECEIVABLE_MESSAGES.clientDescription}
                actions={
                    hasBit(BITS.createReceipt) &&
                    aging.invoices.length > 0 && (
                        <Link href={`/sales/receipts/new?client=${clientId}`} className={buttonClass("primary", "md")}>
                            <Banknote size={16} />
                            บันทึกรับเงิน
                        </Link>
                    )
                }
            />

            {aging.invoices.length === 0 ? (
                <StatusBanner tone="done" title="ลูกค้ารายนี้ไม่มียอดค้าง">
                    ใบแจ้งหนี้ที่ออกแล้วรับชำระครบทุกใบ
                </StatusBanner>
            ) : (
                <section className={`grid gap-4 p-5 sm:p-6 ${CARD_CLASS}`}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h2 className="text-base font-medium text-gray-900">{aging.invoices.length} ใบค้างชำระ</h2>
                        <span className="text-sm text-gray-600">
                            รวม <span className="font-medium text-gray-900 tabular-nums">{formatAmount(totalThb)}</span>{" "}
                            บาท · ณ {formatDateOnly(aging.today)}
                        </span>
                    </div>

                    <ul className="grid text-sm sm:hidden">
                        {aging.invoices.map((row) => (
                            <li key={row.inv_id} className="grid gap-1 border-b border-gray-100 py-2.5">
                                <div className="flex items-start justify-between gap-3">
                                    <Link
                                        href={`/sales/invoices/view?id=${row.inv_id}`}
                                        className="-my-2 py-2 font-medium text-blue-600 tabular-nums hover:underline"
                                    >
                                        {row.inv_number}
                                    </Link>
                                    <span className="shrink-0 font-medium text-gray-900 tabular-nums">
                                        {formatAmount(row.outstanding_amount, row.cur_decimals)} {row.inv_currency}
                                    </span>
                                </div>
                                <span className="wrap-break-word text-gray-700">{row.inv_title}</span>
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
                                    <span>ครบกำหนด {formatDateOnly(row.inv_due_date)}</span>
                                    <StatusPill tone={BUCKET_TONES[row.bucket]}>{overdueLabel(row)}</StatusPill>
                                    {row.inv_currency !== "THB" && (
                                        <span>≈ {formatAmount(row.outstanding_thb)} บาท</span>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>

                    <div className="hidden sm:block">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                                    <th className="py-2 pr-2 font-normal">ใบแจ้งหนี้</th>
                                    <th className="py-2 pr-2 font-normal">ครบกำหนด</th>
                                    <th className="py-2 pr-2 font-normal">ช่วงอายุ</th>
                                    <th className="py-2 pr-2 text-right font-normal">ยอดค้าง</th>
                                    <th className="py-2 text-right font-normal">เทียบบาท</th>
                                </tr>
                            </thead>
                            <tbody>
                                {aging.invoices.map((row) => (
                                    <tr key={row.inv_id} className="border-b border-gray-100 align-top">
                                        <td className="py-2 pr-2">
                                            <Link
                                                href={`/sales/invoices/view?id=${row.inv_id}`}
                                                className="text-blue-600 tabular-nums hover:underline"
                                            >
                                                {row.inv_number}
                                            </Link>
                                            <p className="text-xs text-gray-500">{row.inv_title}</p>
                                        </td>
                                        <td className="py-2 pr-2 tabular-nums">{formatDateOnly(row.inv_due_date)}</td>
                                        <td className="py-2 pr-2">
                                            <StatusPill tone={BUCKET_TONES[row.bucket]}>
                                                {row.days_overdue > 0 ? overdueLabel(row) : bucketLabel.get(row.bucket)}
                                            </StatusPill>
                                        </td>
                                        <td className="py-2 pr-2 text-right tabular-nums">
                                            {formatAmount(row.outstanding_amount, row.cur_decimals)} {row.inv_currency}
                                        </td>
                                        <td className="py-2 text-right tabular-nums">
                                            {formatAmount(row.outstanding_thb)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}
        </div>
    );
}
