"use client";

// ใบแนบ ภ.ง.ด.1 รายเดือน (ขั้น 4-5) — เงินได้ตามมาตรา 40(1) ที่จ่ายและภาษีที่หัก รายคน จากรอบเงินเดือนที่จ่ายแล้ว
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { formatAmount } from "@/lib/shared/money.mjs";
import type { Pnd1Report } from "@/app/(protected)/people/_types";
import { formatDocumentDate } from "../../../../sales/quotations/print/labels";
import PrintShell, { monthLabel } from "../../_print-shell";

export default function Pnd1PrintPage() {
    return (
        <Suspense fallback={<p className="p-8 text-sm text-gray-500">กำลังเตรียมหน้าพิมพ์...</p>}>
            <Pnd1Content />
        </Suspense>
    );
}

function Pnd1Content() {
    const month = useSearchParams().get("month") ?? "";
    const [report, setReport] = useState<Pnd1Report | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        let isLeftPage = false;
        apiFetch<Pnd1Report>(`/payroll/reports/pnd1?month=${encodeURIComponent(month)}`).then(({ data, error }) => {
            if (isLeftPage) return;
            setReport(data);
            setLoadError(error?.message ?? null);
        });
        return () => {
            isLeftPage = true;
        };
    }, [month]);

    if (loadError) return <p className="p-8 text-sm text-red-600">{loadError}</p>;
    if (!report) return <p className="p-8 text-sm text-gray-500">กำลังเตรียมหน้าพิมพ์...</p>;

    const warnings = [
        ...(report.notice ? [report.notice] : []),
        ...(report.missing_national_id.length > 0
            ? [`ไม่มีเลขประจำตัวประชาชน: ${report.missing_national_id.join(", ")} — กรอกที่หน้าพนักงานก่อนยื่น`]
            : []),
    ];

    return (
        <PrintShell
            landscape
            hint="กระดาษ A4 แนวนอน · ใช้แนบแบบ ภ.ง.ด.1 หรือกรอกยื่นออนไลน์ · ปิด ส่วนหัวและส่วนท้าย ของเบราว์เซอร์"
            warnings={warnings}
        >
            <article className="mx-auto w-[297mm] bg-white p-[10mm] text-[9.5pt] leading-snug text-gray-900 shadow-card print:w-auto print:p-0 print:shadow-none">
                <header className="flex items-start justify-between gap-6 border-b border-gray-300 pb-3">
                    <div>
                        <p className="text-[13pt] font-medium">
                            ใบแนบ ภ.ง.ด.1 — เงินได้ตามมาตรา 40 (1) เดือน{monthLabel(report.period)}
                        </p>
                        <p>
                            ผู้มีหน้าที่หักภาษี: {report.company.name} · เลขประจำตัวผู้เสียภาษี{" "}
                            {report.company.tax_id ?? "-"}
                        </p>
                    </div>
                    <div className="text-right text-gray-600">
                        <p>ยื่นภายใน {formatDocumentDate(report.due_date, "th")}</p>
                        <p>(ยื่นออนไลน์ภายใน {formatDocumentDate(report.due_date_online, "th")})</p>
                    </div>
                </header>
                <table className="mt-3 w-full border-collapse">
                    <thead className="table-header-group">
                        <tr className="border-y border-gray-400 bg-gray-50 text-left">
                            <th className="w-12 py-1.5 pl-1 font-medium">ลำดับ</th>
                            <th className="w-40 py-1.5 font-medium">เลขประจำตัวผู้เสียภาษี</th>
                            <th className="py-1.5 font-medium">ชื่อผู้มีเงินได้</th>
                            <th className="w-32 py-1.5 font-medium">วันที่จ่าย</th>
                            <th className="w-36 py-1.5 text-right font-medium">เงินได้ที่จ่าย</th>
                            <th className="w-32 py-1.5 text-right font-medium">ภาษีที่หัก</th>
                            <th className="w-28 py-1.5 pr-1 text-center font-medium">เงื่อนไข</th>
                        </tr>
                    </thead>
                    <tbody>
                        {report.rows.map((row, index) => (
                            <tr key={row.emp_code} className="print-row border-b border-gray-200">
                                <td className="py-1 pl-1 tabular-nums">{index + 1}</td>
                                <td className="py-1 tabular-nums">{row.national_id ?? "—"}</td>
                                <td className="py-1">{row.full_name}</td>
                                <td className="py-1">
                                    {report.paid_date ? formatDocumentDate(report.paid_date, "th") : ""}
                                </td>
                                <td className="py-1 text-right tabular-nums">{formatAmount(row.income)}</td>
                                <td className="py-1 text-right tabular-nums">{formatAmount(row.tax)}</td>
                                <td className="py-1 pr-1 text-center">1 (หัก ณ ที่จ่าย)</td>
                            </tr>
                        ))}
                        <tr className="print-row border-b border-gray-400 font-medium">
                            <td className="py-1.5 pl-1" colSpan={4}>
                                รวม {report.rows.length} ราย
                            </td>
                            <td className="py-1.5 text-right tabular-nums">{formatAmount(report.total_income)}</td>
                            <td className="py-1.5 text-right tabular-nums">{formatAmount(report.total_tax)}</td>
                            <td />
                        </tr>
                    </tbody>
                </table>
                {report.rows.length === 0 && (
                    <p className="mt-3 text-gray-600">
                        ไม่มีเงินได้ที่จ่ายในเดือนนี้ (ยื่นแบบไม่มีเงินได้ หรือไม่ต้องยื่นตามที่นักบัญชีแนะนำ)
                    </p>
                )}
            </article>
        </PrintShell>
    );
}
