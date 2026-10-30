"use client";

// เจ้าหนี้คงค้างแยกอายุ (2026-10-17 ขั้น 2-5) — สรุปรวม + รายผู้รับ (ผู้ขาย/พนักงานที่เบิก) · กดผู้รับดูรายการ
// แบบเดียวกับลูกหนี้คงค้าง (sales/receivables) · คำนวณใน backend ทั้งหมด
import { useEffect, useState } from "react";
import Link from "next/link";
import DataTable, { type Column } from "@/components/ui/datatable/datatable";
import PageHeader from "@/components/ui/page-header";
import StatusBanner from "@/components/ui/guidance/status-banner";
import { CARD_CLASS } from "@/components/ui/card";
import { PageSkeleton } from "@/components/ui/skeleton";
import { formatDateOnly } from "@/app/function";
import { apiFetch, type ApiError } from "@/lib/api";
import { formatAmount, parseHundredths } from "@/lib/shared/money.mjs";
import type { AgingBucketKey } from "../../sales/receivables/_types";
import { PAYABLE_MESSAGES } from "./_messages";
import type { AgingPayeeRow, PayablesSummary } from "./_types";

// แถวในตาราง: ผู้รับคนเดียวกันอาจเป็นทั้งผู้ขายและพนักงาน (คนละ id อยู่แล้ว) — key รวมชนิดกันไว้
type PayeeTableRow = AgingPayeeRow & { row_key: string };

// สีตัวเลขของช่วงอายุ (0 = เทาจาง ไม่แย่งสายตา)
const AMOUNT_TONES: Record<AgingBucketKey, string> = {
    current: "text-gray-700",
    days_1_30: "text-amber-600",
    days_31_60: "text-amber-600",
    days_61_90: "text-red-600",
    days_over_90: "text-red-600",
};

function AmountCell({ value, tone }: { value: string; tone: string }) {
    const isZero = parseHundredths(value, "ยอด") === 0n;
    return (
        <span className={`tabular-nums ${isZero ? "text-gray-300" : tone}`}>{isZero ? "–" : formatAmount(value)}</span>
    );
}

export default function PayablesPage() {
    const [summary, setSummary] = useState<PayablesSummary | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);

    useEffect(() => {
        let isLeftPage = false;
        apiFetch<PayablesSummary>("/payables/aging").then(({ data, error }) => {
            if (isLeftPage) return;
            setSummary(data);
            setLoadError(error);
        });
        return () => {
            isLeftPage = true;
        };
    }, []);

    if (loadError)
        return (
            <StatusBanner tone="error" title="โหลดเจ้าหนี้คงค้างไม่สำเร็จ">
                {loadError.message}
            </StatusBanner>
        );
    if (!summary) return <PageSkeleton />;

    const columns: Column<PayeeTableRow>[] = [
        {
            key: "payee_name",
            header: "ผู้รับเงิน",
            render: (_, row) => (
                <Link
                    href={`/purchasing/payables/payee?kind=${row.payee_kind}&id=${row.payee_id}`}
                    className="-my-2 grid min-w-0 gap-0.5 py-2 text-left"
                >
                    <span className="font-medium text-gray-800 hover:text-blue-600">{row.payee_name ?? "-"}</span>
                    <span className="text-xs text-gray-500">
                        {row.payee_kind === "employee" ? "พนักงาน (เบิกเงิน)" : "ผู้ขาย"} · {row.expense_count} รายการ
                        {row.oldest_days_overdue > 0 ? ` · เกินนานสุด ${row.oldest_days_overdue} วัน` : ""}
                    </span>
                </Link>
            ),
        },
        ...summary.buckets.map((bucket): Column<PayeeTableRow> => ({
            key: bucket.key,
            header: bucket.label,
            className: "text-right",
            render: (_, row) => <AmountCell value={row[bucket.key]} tone={AMOUNT_TONES[bucket.key]} />,
        })),
        {
            key: "total",
            mobile: "trailing",
            header: "รวม (บาท)",
            className: "text-right",
            render: (_, row) => (
                <span className="font-medium text-gray-900 tabular-nums">{formatAmount(row.total)}</span>
            ),
        },
    ];

    const overdueTotal = summary.buckets
        .filter((bucket) => bucket.key !== "current")
        .reduce((sum, bucket) => sum + parseHundredths(summary.totals[bucket.key], "ยอด"), 0n);

    return (
        <div className="grid grid-cols-1 gap-6">
            <PageHeader eyebrow="จัดซื้อ" title="เจ้าหนี้คงค้าง" description={PAYABLE_MESSAGES.description} />

            <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <div className={`col-span-2 grid gap-1 p-4 sm:col-span-3 lg:col-span-1 ${CARD_CLASS}`}>
                    <span className="text-xs text-gray-500">ค้างจ่ายทั้งหมด (บาท)</span>
                    <span className="text-xl font-medium text-gray-900 tabular-nums">
                        {formatAmount(summary.totals.total)}
                    </span>
                    <span className="text-xs text-gray-500">
                        เกินกำหนดแล้ว{" "}
                        <span className={`tabular-nums ${overdueTotal > 0n ? "text-red-600" : ""}`}>
                            {formatAmount(overdueTotal)}
                        </span>{" "}
                        · ณ {formatDateOnly(summary.today)}
                    </span>
                </div>
                {summary.buckets.map((bucket) => (
                    <div key={bucket.key} className={`grid gap-1 p-4 ${CARD_CLASS}`}>
                        <span className="text-xs text-gray-500">{bucket.label}</span>
                        <AmountCell
                            value={summary.totals[bucket.key]}
                            tone={`text-base font-medium ${AMOUNT_TONES[bucket.key]}`}
                        />
                    </div>
                ))}
            </section>

            {summary.payees.length === 0 ? (
                <StatusBanner tone="done" title="ไม่มีเจ้าหนี้คงค้าง">
                    {PAYABLE_MESSAGES.empty}
                </StatusBanner>
            ) : (
                <DataTable
                    columns={columns}
                    data={summary.payees.map((row) => ({ ...row, row_key: `${row.payee_kind}:${row.payee_id}` }))}
                    rowKey="row_key"
                    pageSize={25}
                    searchable
                    searchPlaceholder="ค้นหาผู้รับเงิน..."
                    emptyMessage="ไม่พบผู้รับที่ค้นหา"
                />
            )}
        </div>
    );
}
