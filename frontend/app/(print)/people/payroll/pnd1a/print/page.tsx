"use client";

// ใบแนบ ภ.ง.ด.1ก ประจำปี (ขั้น 4-5) — เงินได้ 40(1) ทั้งปีและภาษีที่หักรายคน (รอบที่จ่ายแล้ว + ยอดยกมาของบริษัทนี้)
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { formatAmount } from "@/lib/shared/money.mjs";
import type { Pnd1aReport } from "@/app/(protected)/people/_types";
import { formatDocumentDate } from "../../../../sales/quotations/print/labels";
import PrintShell from "../../_print-shell";

export default function Pnd1aPrintPage() {
    return (
        <Suspense fallback={<p className="p-8 text-sm text-gray-500">กำลังเตรียมหน้าพิมพ์...</p>}>
            <Pnd1aContent />
        </Suspense>
    );
}

function Pnd1aContent() {
    const year = useSearchParams().get("year") ?? "";
    const [report, setReport] = useState<Pnd1aReport | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        let isLeftPage = false;
        apiFetch<Pnd1aReport>(`/payroll/reports/pnd1a?year=${encodeURIComponent(year)}`).then(({ data, error }) => {
            if (isLeftPage) return;
            setReport(data);
            setLoadError(error?.message ?? null);
        });
        return () => {
            isLeftPage = true;
        };
    }, [year]);

    if (loadError) return <p className="p-8 text-sm text-red-600">{loadError}</p>;
    if (!report) return <p className="p-8 text-sm text-gray-500">กำลังเตรียมหน้าพิมพ์...</p>;

    const warnings = [
        ...(report.unpaid_runs.length > 0
            ? [`รอบที่ยังไม่บันทึกจ่าย (ไม่นับในแบบ): ${report.unpaid_runs.join(", ")}`]
            : []),
        ...(report.missing_national_id.length > 0
            ? [`ไม่มีเลขประจำตัวประชาชน: ${report.missing_national_id.join(", ")} — กรอกที่หน้าพนักงานก่อนยื่น`]
            : []),
    ];

    return (
        <PrintShell
            landscape
            hint='กระดาษ A4 แนวนอน · ใช้แนบแบบ ภ.ง.ด.1ก หรือกรอกยื่นออนไลน์ · ปิด "ส่วนหัวและส่วนท้าย" ของเบราว์เซอร์'
            warnings={warnings}
        >
            <article className="mx-auto w-[297mm] bg-white p-[10mm] text-[9.5pt] leading-snug text-gray-900 shadow-card print:w-auto print:p-0 print:shadow-none">
                <header className="flex items-start justify-between gap-6 border-b border-gray-300 pb-3">
                    <div>
                        <p className="text-[13pt] font-medium">
                            ใบแนบ ภ.ง.ด.1ก — เงินได้ตามมาตรา 40 (1) ประจำปีภาษี {report.year + 543}
                        </p>
                        <p>
                            ผู้มีหน้าที่หักภาษี: {report.company.name} · เลขประจำตัวผู้เสียภาษี{" "}
                            {report.company.tax_id ?? "-"}
                        </p>
                    </div>
                    <p className="text-right text-gray-600">ยื่นภายใน {formatDocumentDate(report.due_date, "th")}</p>
                </header>
                <table className="mt-3 w-full border-collapse">
                    <thead className="table-header-group">
                        <tr className="border-y border-gray-400 bg-gray-50 text-left">
                            <th className="w-12 py-1.5 pl-1 font-medium">ลำดับ</th>
                            <th className="w-40 py-1.5 font-medium">เลขประจำตัวผู้เสียภาษี</th>
                            <th className="py-1.5 font-medium">ชื่อ / ที่อยู่ผู้มีเงินได้</th>
                            <th className="w-36 py-1.5 text-right font-medium">เงินได้ทั้งปี</th>
                            <th className="w-32 py-1.5 text-right font-medium">ภาษีที่หักทั้งปี</th>
                            <th className="w-28 py-1.5 pr-1 text-center font-medium">เงื่อนไข</th>
                        </tr>
                    </thead>
                    <tbody>
                        {report.rows.map((row, index) => (
                            <tr key={row.emp_id} className="print-row border-b border-gray-200 align-top">
                                <td className="py-1 pl-1 tabular-nums">{index + 1}</td>
                                <td className="py-1 tabular-nums">{row.national_id ?? "—"}</td>
                                <td className="py-1">
                                    <p>{row.full_name}</p>
                                    <p className="text-[8.5pt] text-gray-600">{row.address ?? "(ยังไม่มีที่อยู่)"}</p>
                                </td>
                                <td className="py-1 text-right tabular-nums">{formatAmount(row.income)}</td>
                                <td className="py-1 text-right tabular-nums">{formatAmount(row.tax)}</td>
                                <td className="py-1 pr-1 text-center">1 (หัก ณ ที่จ่าย)</td>
                            </tr>
                        ))}
                        <tr className="print-row border-b border-gray-400 font-medium">
                            <td className="py-1.5 pl-1" colSpan={3}>
                                รวม {report.rows.length} ราย
                            </td>
                            <td className="py-1.5 text-right tabular-nums">{formatAmount(report.total_income)}</td>
                            <td className="py-1.5 text-right tabular-nums">{formatAmount(report.total_tax)}</td>
                            <td />
                        </tr>
                    </tbody>
                </table>
            </article>
        </PrintShell>
    );
}
