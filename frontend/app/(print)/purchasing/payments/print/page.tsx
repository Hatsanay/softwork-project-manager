"use client";

// หน้าพิมพ์ใบสำคัญจ่าย A4 (2026-10-16 ขั้น 2-4) — โครงเดียวกับหน้าพิมพ์ใบเสร็จ
// ข้อมูลบริษัท/ผู้รับ/บัญชี ใช้ snapshot ณ วันจ่ายเสมอ · ใบที่ยกเลิกมีตรายกเลิก · ส่วนต่างอัตรา (ข้อมูลภายใน) ไม่พิมพ์
// ช่องลงชื่อ 3 ช่อง: ผู้จัดทำ · ผู้อนุมัติจ่าย · ผู้รับเงิน (หลักควบคุมภายใน — แยกคนทำจ่ายกับผู้อนุมัติ P3)
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Printer } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { apiFetch, uploadedFileUrl } from "@/lib/api";
import { formatAmount, parseHundredths } from "@/lib/shared/money.mjs";
import { amountInWords } from "@/lib/shared/amount-in-words.mjs";
import type { PaymentDetail } from "@/app/(protected)/purchasing/payments/_types";
import { METHOD_LABELS } from "@/app/(protected)/purchasing/payments/_messages";
import { formatDocumentDate } from "../../../sales/quotations/print/labels";

function paidByText(detail: PaymentDetail) {
    const { payment } = detail;
    const bank = payment.pv_bank_snapshot;
    const from = bank ? ` จากบัญชี ${bank.ba_bank_name} ${bank.ba_account_no}` : "";
    switch (payment.pv_method) {
        case "transfer":
            return `${METHOD_LABELS.transfer}${from}${payment.pv_reference ? ` (อ้างอิง ${payment.pv_reference})` : ""}`;
        case "cheque":
            return `${METHOD_LABELS.cheque}${from} เลขที่ ${payment.pv_cheque_no ?? ""}${
                payment.pv_cheque_date ? ` ลงวันที่ ${formatDocumentDate(payment.pv_cheque_date, "th")}` : ""
            }`;
        case "cash":
            return METHOD_LABELS.cash;
        default:
            return `${METHOD_LABELS.other}${payment.pv_reference ? ` — ${payment.pv_reference}` : ""}`;
    }
}

export default function PaymentPrintPage() {
    const paymentId = useSearchParams().get("id");
    const [detail, setDetail] = useState<PaymentDetail | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        if (!paymentId) return;
        let isLeftPage = false;
        apiFetch<PaymentDetail>(`/payments/${paymentId}`).then(({ data, error }) => {
            if (isLeftPage) return;
            setDetail(data);
            setLoadError(error?.message ?? null);
        });
        return () => {
            isLeftPage = true;
        };
    }, [paymentId]);

    if (!paymentId || loadError)
        return <p className="p-8 text-sm text-red-600">{loadError ?? "ไม่พบใบสำคัญจ่ายนี้"}</p>;
    if (!detail) return <p className="p-8 text-sm text-gray-500">กำลังเตรียมหน้าพิมพ์...</p>;

    const { payment, allocations, currency, certificate } = detail;
    const company = payment.pv_company_snapshot;
    const payee = payment.pv_payee_snapshot;
    const decimals = currency.cur_decimals;
    const payeeName = payee.kind === "employee" ? payee.full_name : payee.vd_name;
    const branch = company.branch;
    const hasWithholding = parseHundredths(payment.pv_wht_amount, "หัก") > 0n;

    return (
        <div className="min-h-screen bg-gray-100 py-6 print:bg-white print:py-0">
            <style>{`
                @page { size: A4; margin: 12mm 12mm 16mm; @bottom-right { content: "หน้า " counter(page) "/" counter(pages); font-size: 9pt; color: #6b7280; } }
                @media print { .no-print { display: none !important; } body { background: white; } }
                .print-row { break-inside: avoid; }
            `}</style>
            <div className="no-print mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-2 px-4">
                <p className="text-sm text-gray-600">
                    ตั้งค่าการพิมพ์: กระดาษ A4 · ปิด &quot;ส่วนหัวและส่วนท้าย&quot; ของเบราว์เซอร์
                </p>
                <button type="button" className={buttonClass("primary", "md")} onClick={() => window.print()}>
                    <Printer size={16} />
                    พิมพ์ / บันทึก PDF
                </button>
            </div>

            <article className="relative mx-auto w-[210mm] bg-white p-[12mm] text-[10.5pt] leading-relaxed text-gray-900 shadow-card print:w-auto print:p-0 print:shadow-none">
                {payment.pv_status === "cancelled" && (
                    <div className="pointer-events-none absolute top-40 right-16 -rotate-12 rounded-lg border-4 border-red-600/70 px-6 py-2 text-[28pt] font-medium text-red-600/70">
                        ยกเลิก
                    </div>
                )}
                <header className="flex items-start justify-between gap-6 border-b border-gray-300 pb-4">
                    <div className="flex items-start gap-4">
                        {company.cs_logo_url && (
                            // eslint-disable-next-line @next/next/no-img-element -- โลโก้จาก backend ต่างโดเมน พิมพ์ได้ทันทีโดยไม่ผ่าน image optimizer
                            <img
                                src={uploadedFileUrl(company.cs_logo_url)}
                                alt=""
                                className="h-16 w-auto max-w-[45mm] object-contain"
                            />
                        )}
                        <div className="grid gap-0.5 text-[9.5pt]">
                            <p className="text-[12pt] font-medium">{company.cs_name_th}</p>
                            <p className="whitespace-pre-line text-gray-700">
                                {branch?.branch_address_th || company.cs_address_th}
                            </p>
                            {company.cs_tax_id && (
                                <p className="text-gray-700">
                                    เลขประจำตัวผู้เสียภาษี {company.cs_tax_id}
                                    {branch
                                        ? ` · ${branch.branch_code === "00000" ? "สำนักงานใหญ่" : `สาขา ${branch.branch_code}`}`
                                        : ""}
                                </p>
                            )}
                        </div>
                    </div>
                    <div className="grid shrink-0 gap-1 text-right">
                        <p className="text-[16pt] font-medium text-blue-600">ใบสำคัญจ่าย</p>
                        <dl className="grid grid-cols-[auto_auto] gap-x-3 text-[9.5pt]">
                            <dt className="text-gray-500">เลขที่</dt>
                            <dd className="tabular-nums">{payment.pv_number}</dd>
                            <dt className="text-gray-500">วันที่</dt>
                            <dd>{formatDocumentDate(payment.pv_payment_date, "th")}</dd>
                        </dl>
                    </div>
                </header>

                <section className="mt-4 grid gap-0.5 text-[9.5pt]">
                    <p className="text-gray-500">จ่ายให้</p>
                    <p className="text-[11pt] font-medium">{payeeName}</p>
                    {payee.vd_address && <p className="whitespace-pre-line">{payee.vd_address}</p>}
                    {payee.vd_tax_id && <p>เลขประจำตัวผู้เสียภาษี {payee.vd_tax_id}</p>}
                    {payee.kind === "employee" && (
                        <p className="text-gray-600">คืนเงินที่พนักงานสำรองจ่าย (ใบเบิกเงิน)</p>
                    )}
                </section>

                <table className="mt-4 w-full border-collapse text-[9.5pt]">
                    <thead className="table-header-group">
                        <tr className="border-y border-gray-400 bg-gray-50 text-left">
                            <th className="w-12 py-1.5 pl-1 font-medium">ลำดับ</th>
                            <th className="py-1.5 font-medium">รายการ</th>
                            <th className="w-32 py-1.5 text-right font-medium">ยอดรวมรายการ</th>
                            <th className="w-32 py-1.5 pr-1 text-right font-medium">จ่ายครั้งนี้</th>
                        </tr>
                    </thead>
                    <tbody>
                        {allocations.map((row, index) => (
                            <tr key={row.pva_expense_id} className="print-row border-b border-gray-200 align-top">
                                <td className="py-1 pl-1 tabular-nums">{index + 1}</td>
                                <td className="py-1 pr-2">
                                    <p className="tabular-nums">
                                        {row.ex_number}
                                        {row.ex_vendor_doc_no ? ` · เอกสารผู้ขาย ${row.ex_vendor_doc_no}` : ""}
                                    </p>
                                    <p className="text-[8.5pt] text-gray-600">{row.ex_title}</p>
                                </td>
                                <td className="py-1 text-right tabular-nums">{formatAmount(row.ex_total, decimals)}</td>
                                <td className="py-1 pr-1 text-right tabular-nums">
                                    {formatAmount(row.pva_amount, decimals)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                <section className="print-row mt-3 grid grid-cols-[1fr_auto] gap-6 border-t border-gray-400 pt-2 text-[9.5pt]">
                    <p className="self-start rounded bg-gray-50 px-2 py-1">
                        ( {amountInWords(payment.pv_net_paid, currency, "th")} )
                    </p>
                    <dl className="grid min-w-[70mm] grid-cols-[1fr_auto] gap-x-4 gap-y-0.5">
                        <dt>ยอดตัดหนี้รวม</dt>
                        <dd className="text-right tabular-nums">
                            {formatAmount(payment.pv_allocated_total, decimals)}
                        </dd>
                        {hasWithholding && (
                            <>
                                <dt className="text-gray-600">
                                    หัก ณ ที่จ่าย{certificate ? ` (50 ทวิ ${certificate.wt_number})` : ""}
                                </dt>
                                <dd className="text-right tabular-nums text-gray-600">
                                    {formatAmount(payment.pv_wht_amount, decimals)}
                                </dd>
                            </>
                        )}
                        <dt className="border-t border-gray-300 pt-1 font-medium">จ่ายสุทธิ</dt>
                        <dd className="border-t border-gray-300 pt-1 text-right font-medium tabular-nums">
                            {formatAmount(payment.pv_net_paid, decimals)} {currency.cur_code}
                        </dd>
                    </dl>
                </section>

                <section className="print-row mt-4 grid gap-0.5 rounded-lg border border-gray-300 p-3 text-[9.5pt]">
                    <p>
                        <span className="font-medium">จ่ายโดย:</span> {paidByText(detail)}
                    </p>
                    {payee.vd_bank_account_no && (
                        <p>
                            <span className="font-medium">เข้าบัญชีผู้รับ:</span> {payee.vd_bank_name}{" "}
                            {payee.vd_bank_account_no} ({payee.vd_bank_account_name})
                        </p>
                    )}
                    {payment.pv_notes && (
                        <p className="whitespace-pre-line text-gray-700">หมายเหตุ: {payment.pv_notes}</p>
                    )}
                </section>

                <section className="print-row mt-12 grid grid-cols-3 gap-6 text-center text-[9pt]">
                    {[
                        { role: "ผู้จัดทำ", name: payment.pv_created_by_name },
                        { role: "ผู้อนุมัติจ่าย", name: null },
                        { role: "ผู้รับเงิน", name: payeeName ?? null },
                    ].map((signer) => (
                        <div key={signer.role} className="grid gap-1">
                            <div className="h-14" />
                            <div className="border-t border-gray-400 pt-1">
                                <p>
                                    {signer.name
                                        ? `( ${signer.name} )`
                                        : "( ........................................ )"}
                                </p>
                                <p className="font-medium">{signer.role}</p>
                                <p className="text-gray-600">วันที่ ......../......../........</p>
                            </div>
                        </div>
                    ))}
                </section>
            </article>
        </div>
    );
}
