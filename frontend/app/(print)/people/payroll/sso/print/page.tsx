"use client";

// แบบรายการเงินสมทบประกันสังคม (สปส.1-10 ส่วนที่ 2) รายเดือน (ขั้น 4-5) — ผู้ประกันตนในรอบเงินเดือนที่จ่ายแล้ว
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { formatAmount } from "@/lib/shared/money.mjs";
import type { SsoReport } from "@/app/(protected)/people/_types";
import { formatDocumentDate } from "../../../../sales/quotations/print/labels";
import PrintShell, { monthLabel } from "../../_print-shell";

export default function SsoPrintPage() {
    return (
        <Suspense fallback={<p className="p-8 text-sm text-gray-500">กำลังเตรียมหน้าพิมพ์...</p>}>
            <SsoContent />
        </Suspense>
    );
}

function SsoContent() {
    const month = useSearchParams().get("month") ?? "";
    const [report, setReport] = useState<SsoReport | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        let isLeftPage = false;
        apiFetch<SsoReport>(`/payroll/reports/sso?month=${encodeURIComponent(month)}`).then(({ data, error }) => {
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
        ...(report.missing_sso_number.length > 0
            ? [`ไม่มีเลขประกันสังคม/เลขประจำตัวประชาชน: ${report.missing_sso_number.join(", ")}`]
            : []),
    ];

    return (
        <PrintShell
            hint="กระดาษ A4 · ใช้ประกอบแบบ สปส.1-10 หรือกรอกยื่นออนไลน์ · ปิด ส่วนหัวและส่วนท้าย ของเบราว์เซอร์"
            warnings={warnings}
        >
            <article className="mx-auto w-full max-w-[210mm] bg-white p-[10mm] text-[9.5pt] leading-snug text-gray-900 shadow-card print:max-w-none print:p-0 print:shadow-none">
                <header className="flex flex-wrap items-start justify-between gap-6 border-b border-gray-300 pb-3">
                    <div>
                        <p className="text-[13pt] font-medium">
                            รายการเงินสมทบประกันสังคม (สปส.1-10 ส่วนที่ 2) เดือน{monthLabel(report.period)}
                        </p>
                        <p>
                            นายจ้าง: {report.company.name} · เลขประจำตัวผู้เสียภาษี {report.company.tax_id ?? "-"}
                        </p>
                    </div>
                    <p className="text-gray-600">นำส่งภายใน {formatDocumentDate(report.due_date, "th")}</p>
                </header>
                <table className="mt-3 w-full border-collapse">
                    <thead className="table-header-group">
                        <tr className="border-y border-gray-400 bg-gray-50 text-left">
                            <th className="w-12 py-1.5 pl-1 font-medium">ลำดับ</th>
                            <th className="w-40 py-1.5 font-medium">เลขประจำตัวผู้ประกันตน</th>
                            <th className="py-1.5 font-medium">ชื่อ-สกุล</th>
                            <th className="w-32 py-1.5 text-right font-medium">ค่าจ้างที่จ่ายจริง</th>
                            <th className="w-32 py-1.5 pr-1 text-right font-medium">เงินสมทบผู้ประกันตน</th>
                        </tr>
                    </thead>
                    <tbody>
                        {report.rows.map((row, index) => (
                            <tr key={row.emp_code} className="print-row border-b border-gray-200">
                                <td className="py-1 pl-1 tabular-nums">{index + 1}</td>
                                <td className="py-1 tabular-nums">{row.sso_number ?? "-"}</td>
                                <td className="py-1">{row.full_name}</td>
                                <td className="py-1 text-right tabular-nums">{formatAmount(row.wage)}</td>
                                <td className="py-1 pr-1 text-right tabular-nums">
                                    {formatAmount(row.employee_contribution)}
                                </td>
                            </tr>
                        ))}
                        <tr className="print-row border-b border-gray-400 font-medium">
                            <td className="py-1.5 pl-1" colSpan={3}>
                                รวม {report.rows.length} คน
                            </td>
                            <td className="py-1.5 text-right tabular-nums">{formatAmount(report.total_wage)}</td>
                            <td className="py-1.5 pr-1 text-right tabular-nums">
                                {formatAmount(report.total_employee)}
                            </td>
                        </tr>
                    </tbody>
                </table>
                <dl className="print-row ml-auto mt-3 grid max-w-[90mm] grid-cols-[1fr_auto] gap-x-4 gap-y-0.5">
                    <dt>เงินสมทบผู้ประกันตน</dt>
                    <dd className="text-right tabular-nums">{formatAmount(report.total_employee)}</dd>
                    <dt>เงินสมทบนายจ้าง</dt>
                    <dd className="text-right tabular-nums">{formatAmount(report.total_employer)}</dd>
                    <dt className="border-t border-gray-300 pt-1 font-medium">รวมเงินสมทบที่นำส่ง</dt>
                    <dd className="border-t border-gray-300 pt-1 text-right font-medium tabular-nums">
                        {formatAmount(report.total_remit)} บาท
                    </dd>
                </dl>
            </article>
        </PrintShell>
    );
}
