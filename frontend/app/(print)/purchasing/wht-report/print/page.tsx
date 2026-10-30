"use client";

// หน้าพิมพ์รายงานภาษีหัก ณ ที่จ่ายรายเดือน (ใบแนบ ภ.ง.ด.3 / 53) A4 แนวนอน (2026-10-17 ขั้น 2-5)
// ใช้กรอก/แนบแบบยื่น — รูปแบบไฟล์นำเข้า e-filing รอคำตอบนักบัญชี (X5) · เฉพาะ 50 ทวิ ที่ไม่ยกเลิก
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Printer } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { formatAmount } from "@/lib/shared/money.mjs";
import type { WithholdingReport } from "@/app/(protected)/purchasing/payments/_types";
import { WHT_FORM_SHORT } from "@/app/(protected)/purchasing/payments/_messages";
import { formatDocumentDate } from "../../../sales/quotations/print/labels";

function monthLabel(month: string) {
    return new Intl.DateTimeFormat("th-TH-u-ca-buddhist", { month: "long", year: "numeric", timeZone: "UTC" }).format(
        new Date(`${month}-01T00:00:00Z`),
    );
}

export default function WithholdingReportPrintPage() {
    const searchParams = useSearchParams();
    const month = searchParams.get("month") ?? "";
    const form = searchParams.get("form") ?? "";
    const [report, setReport] = useState<WithholdingReport | null>(null);
    const [company, setCompany] = useState<{ cs_name_th: string; cs_tax_id: string | null } | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        let isLeftPage = false;
        Promise.all([
            apiFetch<WithholdingReport>(`/reports/withholding?${new URLSearchParams({ month, form })}`),
            apiFetch<{ company: { cs_name_th: string; cs_tax_id: string | null } }>("/company"),
        ]).then(([reportResult, companyResult]) => {
            if (isLeftPage) return;
            setReport(reportResult.data);
            setCompany(companyResult.data?.company ?? null);
            setLoadError(reportResult.error?.message ?? null);
        });
        return () => {
            isLeftPage = true;
        };
    }, [month, form]);

    if (loadError) return <p className="p-8 text-sm text-red-600">{loadError}</p>;
    if (!report) return <p className="p-8 text-sm text-gray-500">กำลังเตรียมหน้าพิมพ์...</p>;

    return (
        <div className="min-h-screen bg-gray-100 py-6 print:bg-white print:py-0">
            <style>{`
                @page { size: A4 landscape; margin: 10mm 10mm 14mm; @bottom-right { content: "หน้า " counter(page) "/" counter(pages); font-size: 9pt; color: #6b7280; } }
                @media print { .no-print { display: none !important; } body { background: white; } }
                .print-row { break-inside: avoid; }
            `}</style>
            <div className="no-print mx-auto mb-4 flex max-w-[297mm] flex-wrap items-center justify-between gap-2 px-4">
                <p className="text-sm text-gray-600">
                    กระดาษ A4 แนวนอน · ปิด &quot;ส่วนหัวและส่วนท้าย&quot; ของเบราว์เซอร์
                </p>
                <button type="button" className={buttonClass("primary", "md")} onClick={() => window.print()}>
                    <Printer size={16} />
                    พิมพ์ / บันทึก PDF
                </button>
            </div>
            <article className="mx-auto w-[297mm] bg-white p-[10mm] text-[9.5pt] leading-snug text-gray-900 shadow-card print:w-auto print:p-0 print:shadow-none">
                <header className="flex items-start justify-between gap-6 border-b border-gray-300 pb-3">
                    <div>
                        <p className="text-[13pt] font-medium">
                            ใบแนบ {WHT_FORM_SHORT[report.form]} · รายการภาษีหัก ณ ที่จ่าย เดือน
                            {monthLabel(report.month)}
                        </p>
                        <p>
                            ผู้มีหน้าที่หักภาษี: {company?.cs_name_th ?? ""} · เลขประจำตัวผู้เสียภาษี{" "}
                            {company?.cs_tax_id ?? "-"}
                        </p>
                    </div>
                    <div className="text-right text-[9pt] text-gray-700">
                        <p>ยื่นภายใน {formatDocumentDate(report.due_dates.paper, "th")}</p>
                        <p>(ยื่นออนไลน์ภายใน {formatDocumentDate(report.due_dates.online, "th")})</p>
                    </div>
                </header>
                <table className="mt-3 w-full border-collapse text-[9pt]">
                    <thead className="table-header-group">
                        <tr className="border-y border-gray-400 bg-gray-50 text-left">
                            <th className="w-10 py-1.5 pl-1 font-medium">ลำดับ</th>
                            <th className="w-32 py-1.5 font-medium">เลขประจำตัวผู้เสียภาษี</th>
                            <th className="w-12 py-1.5 font-medium">สาขา</th>
                            <th className="py-1.5 font-medium">ชื่อ / ที่อยู่ผู้มีเงินได้</th>
                            <th className="w-24 py-1.5 font-medium">วันที่จ่าย</th>
                            <th className="w-32 py-1.5 font-medium">ประเภทเงินได้</th>
                            <th className="w-12 py-1.5 text-right font-medium">อัตรา</th>
                            <th className="w-28 py-1.5 text-right font-medium">เงินได้ที่จ่าย</th>
                            <th className="w-24 py-1.5 pr-1 text-right font-medium">ภาษีที่หัก</th>
                        </tr>
                    </thead>
                    <tbody>
                        {report.rows.map((row) => (
                            <tr
                                key={`${row.wt_id}-${row.sequence}`}
                                className="print-row border-b border-gray-200 align-top"
                            >
                                <td className="py-1 pl-1 tabular-nums">{row.sequence}</td>
                                <td className="py-1 tabular-nums">{row.payee_tax_id}</td>
                                <td className="py-1 tabular-nums">{row.payee_branch_code ?? ""}</td>
                                <td className="py-1 pr-2">
                                    <p>{row.payee_name}</p>
                                    <p className="text-[8pt] text-gray-600">{row.payee_address}</p>
                                </td>
                                <td className="py-1">{formatDocumentDate(row.wt_payment_date, "th")}</td>
                                <td className="py-1">{row.wtl_form_label}</td>
                                <td className="py-1 text-right tabular-nums">{Number(row.wtl_rate)}%</td>
                                <td className="py-1 text-right tabular-nums">{formatAmount(row.wtl_paid_amount)}</td>
                                <td className="py-1 pr-1 text-right tabular-nums">
                                    {formatAmount(row.wtl_tax_amount)}
                                </td>
                            </tr>
                        ))}
                        <tr className="print-row border-y border-gray-400 font-medium">
                            <td className="py-1.5 pl-1" colSpan={7}>
                                รวม {report.totals.payee_count} ราย · {report.totals.certificate_count} ฉบับ
                            </td>
                            <td className="py-1.5 text-right tabular-nums">
                                {formatAmount(report.totals.paid_amount)}
                            </td>
                            <td className="py-1.5 pr-1 text-right tabular-nums">
                                {formatAmount(report.totals.tax_amount)}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </article>
        </div>
    );
}
