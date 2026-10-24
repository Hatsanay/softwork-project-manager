"use client";

// เจ้าหนี้คงค้างรายรายการของผู้รับหนึ่งราย (2026-10-17 ขั้น 2-5) — ยอดค้างสกุลเดิม + เทียบบาท · ช่วงอายุ · ทางลัดไปทำจ่าย
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
import { BUCKET_TONES } from "../../../sales/receivables/_messages";
import { PAYABLE_MESSAGES } from "../_messages";
import type { AgingExpenseRow, PayablesOfPayee } from "../_types";

function overdueLabel(row: AgingExpenseRow) {
    return row.days_overdue > 0 ? `เกินกำหนด ${row.days_overdue} วัน` : "ยังไม่ถึงกำหนด";
}

function expenseHref(row: AgingExpenseRow) {
    return `${row.ex_kind === "claim" ? "/purchasing/claims" : "/purchasing/expenses"}/view?id=${row.ex_id}`;
}

export default function PayablePayeePage() {
    const searchParams = useSearchParams();
    const payeeKind = searchParams.get("kind") === "employee" ? "employee" : "vendor";
    const payeeId = searchParams.get("id");
    const hasBit = usePermission();
    const [aging, setAging] = useState<PayablesOfPayee | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);

    useEffect(() => {
        if (!payeeId) return;
        let isLeftPage = false;
        apiFetch<PayablesOfPayee>(`/payables/aging/${payeeKind}/${encodeURIComponent(payeeId)}`).then(
            ({ data, error }) => {
                if (isLeftPage) return;
                setAging(data);
                setLoadError(error);
            },
        );
        return () => {
            isLeftPage = true;
        };
    }, [payeeKind, payeeId]);

    if (!payeeId)
        return (
            <StatusBanner tone="error" title="ไม่พบผู้รับนี้">
                กลับไปเลือกจากหน้าเจ้าหนี้คงค้าง
            </StatusBanner>
        );
    if (loadError)
        return (
            <StatusBanner tone="error" title="โหลดเจ้าหนี้ไม่สำเร็จ">
                {loadError.message}
            </StatusBanner>
        );
    if (!aging) return <PageSkeleton />;

    const totalThb = aging.expenses.reduce((sum, row) => sum + parseHundredths(row.outstanding_thb, "ยอด"), 0n);
    const bucketLabel = new Map(aging.buckets.map((bucket) => [bucket.key, bucket.label]));

    return (
        <div className="grid w-full grid-cols-1 gap-6">
            <PageHeader
                eyebrow={`จัดซื้อ · เจ้าหนี้คงค้าง · ${payeeKind === "employee" ? "พนักงาน" : "ผู้ขาย"}`}
                title={aging.payee?.payee_name ?? "ผู้รับเงิน"}
                description={PAYABLE_MESSAGES.payeeDescription}
                actions={
                    hasBit(BITS.makePayment) &&
                    aging.expenses.length > 0 && (
                        <Link
                            href={`/purchasing/payments/new?payee_kind=${payeeKind}&payee_id=${encodeURIComponent(payeeId)}`}
                            className={buttonClass("primary", "md")}
                        >
                            <Banknote size={16} />
                            ทำจ่าย
                        </Link>
                    )
                }
            />

            {aging.expenses.length === 0 ? (
                <StatusBanner tone="done" title="ผู้รับรายนี้ไม่มียอดค้าง">
                    รายการที่อนุมัติแล้วจ่ายครบทุกรายการ
                </StatusBanner>
            ) : (
                <section className={`grid gap-4 p-5 sm:p-6 ${CARD_CLASS}`}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h2 className="text-base font-medium text-gray-900">{aging.expenses.length} รายการค้างจ่าย</h2>
                        <span className="text-sm text-gray-600">
                            รวม <span className="font-medium text-gray-900 tabular-nums">{formatAmount(totalThb)}</span>{" "}
                            บาท · ณ {formatDateOnly(aging.today)}
                        </span>
                    </div>

                    <ul className="grid text-sm sm:hidden">
                        {aging.expenses.map((row) => (
                            <li key={row.ex_id} className="grid gap-1 border-b border-gray-100 py-2.5">
                                <div className="flex items-start justify-between gap-3">
                                    <Link
                                        href={expenseHref(row)}
                                        className="-my-2 py-2 font-medium text-blue-600 tabular-nums hover:underline"
                                    >
                                        {row.ex_number}
                                    </Link>
                                    <span className="shrink-0 font-medium text-gray-900 tabular-nums">
                                        {formatAmount(row.outstanding_amount, row.cur_decimals)} {row.ex_currency}
                                    </span>
                                </div>
                                <span className="wrap-break-word text-gray-700">{row.ex_title}</span>
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
                                    <span>ครบกำหนด {formatDateOnly(row.ex_due_date)}</span>
                                    <StatusPill tone={BUCKET_TONES[row.bucket]}>{overdueLabel(row)}</StatusPill>
                                    {row.ex_currency !== "THB" && (
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
                                    <th className="py-2 pr-2 font-normal">รายการ</th>
                                    <th className="py-2 pr-2 font-normal">ครบกำหนด</th>
                                    <th className="py-2 pr-2 font-normal">ช่วงอายุ</th>
                                    <th className="py-2 pr-2 text-right font-normal">ยอดค้าง</th>
                                    <th className="py-2 text-right font-normal">เทียบบาท</th>
                                </tr>
                            </thead>
                            <tbody>
                                {aging.expenses.map((row) => (
                                    <tr key={row.ex_id} className="border-b border-gray-100 align-top">
                                        <td className="py-2 pr-2">
                                            <Link
                                                href={expenseHref(row)}
                                                className="text-blue-600 tabular-nums hover:underline"
                                            >
                                                {row.ex_number}
                                            </Link>
                                            <p className="text-xs text-gray-500">{row.ex_title}</p>
                                        </td>
                                        <td className="py-2 pr-2 tabular-nums">{formatDateOnly(row.ex_due_date)}</td>
                                        <td className="py-2 pr-2">
                                            <StatusPill tone={BUCKET_TONES[row.bucket]}>
                                                {row.days_overdue > 0 ? overdueLabel(row) : bucketLabel.get(row.bucket)}
                                            </StatusPill>
                                        </td>
                                        <td className="py-2 pr-2 text-right tabular-nums">
                                            {formatAmount(row.outstanding_amount, row.cur_decimals)} {row.ex_currency}
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
