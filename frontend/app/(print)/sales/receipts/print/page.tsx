"use client";

// หน้าพิมพ์ใบเสร็จรับเงิน A4 (2026-10-15 ขั้น 1C-3) — โครงเดียวกับหน้าพิมพ์ใบวางบิล
// ใบเสร็จไม่มีร่าง (C1) จึงใช้ข้อมูลลูกค้า/บริษัท/บัญชี "ณ วันออก" (snapshot) เสมอ · ใบที่ยกเลิกมีตรายกเลิก
// ส่วนต่างอัตราแลกเปลี่ยน/บันทึกภายใน ไม่พิมพ์ (ข้อมูลภายใน)
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Printer } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { apiFetch, uploadedFileUrl } from "@/lib/api";
import { formatAmount, parseHundredths } from "@/lib/shared/money.mjs";
import { amountInWords } from "@/lib/shared/amount-in-words.mjs";
import type { ReceiptDetail } from "@/app/(protected)/sales/receipts/_types";
import { formatDocumentDate } from "../../quotations/print/labels";
import { RECEIPT_PRINT_LABELS, type ReceiptPrintLabels } from "./labels";

function branchLabel(code: string | null, name: string | null, labels: ReceiptPrintLabels) {
    if (!code) return "";
    return code === "00000" ? labels.headOffice : `${labels.branch} ${code}${name ? ` ${name}` : ""}`;
}

function paidByText(detail: ReceiptDetail, labels: ReceiptPrintLabels) {
    const { receipt } = detail;
    const bank = receipt.rc_bank_snapshot;
    const language = receipt.rc_language;
    switch (receipt.rc_method) {
        case "transfer":
            return `${labels.transfer} ${bank ? `${bank.ba_bank_name} ${bank.ba_account_no}` : ""}${
                receipt.rc_reference ? ` (${labels.reference} ${receipt.rc_reference})` : ""
            }`;
        case "cheque":
            return `${labels.cheque} ${receipt.rc_cheque_bank ?? ""} ${labels.chequeNo} ${receipt.rc_cheque_no ?? ""} ${
                labels.chequeDate
            } ${receipt.rc_cheque_date ? formatDocumentDate(receipt.rc_cheque_date, language) : ""}`;
        case "cash":
            return labels.cash;
        default:
            return `${labels.other}${receipt.rc_reference ? ` — ${receipt.rc_reference}` : ""}`;
    }
}

export default function ReceiptPrintPage() {
    const receiptId = useSearchParams().get("id");
    const [detail, setDetail] = useState<ReceiptDetail | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        if (!receiptId) return;
        let isLeftPage = false;
        apiFetch<ReceiptDetail>(`/receipts/${receiptId}`).then(({ data, error }) => {
            if (isLeftPage) return;
            setDetail(data);
            setLoadError(error?.message ?? null);
        });
        return () => {
            isLeftPage = true;
        };
    }, [receiptId]);

    if (!receiptId || loadError) return <p className="p-8 text-sm text-red-600">{loadError ?? "ไม่พบใบเสร็จนี้"}</p>;
    if (!detail) return <p className="p-8 text-sm text-gray-500">กำลังเตรียมหน้าพิมพ์...</p>;

    const { receipt, allocations, currency } = detail;
    const company = receipt.rc_company_snapshot;
    const client = receipt.rc_client_snapshot;
    if (!company || !client)
        return <p className="p-8 text-sm text-red-600">ใบเสร็จนี้ไม่มีข้อมูล ณ วันออก — แจ้งผู้ดูแลระบบ</p>;

    const language = receipt.rc_language;
    const labels = RECEIPT_PRINT_LABELS[language];
    const decimals = currency.cur_decimals;
    const isEnglish = language === "en";
    const companyName = (isEnglish && company.cs_name_en) || company.cs_name_th;
    const branch = company.branch;
    const companyAddress =
        (isEnglish ? branch?.branch_address_en || company.cs_address_en : branch?.branch_address_th) ||
        (isEnglish ? company.cs_address_en : company.cs_address_th) ||
        company.cs_address_th;
    const clientName = client.client_company || client.client_name;
    const hasWithholding = parseHundredths(receipt.rc_wht_amount, "หัก ณ ที่จ่าย") > 0n;
    const hasFee = parseHundredths(receipt.rc_fee_amount, "ค่าธรรมเนียม") > 0n;

    return (
        <div className="min-h-screen bg-gray-100 py-6 print:bg-white print:py-0">
            <style>{`
                @page { size: A4; margin: 12mm 12mm 16mm; @bottom-right { content: "${labels.page} " counter(page) "/" counter(pages); font-size: 9pt; color: #6b7280; } }
                @media print { .no-print { display: none !important; } body { background: white; } }
                .print-row { break-inside: avoid; }
            `}</style>

            <div className="no-print mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-2 px-4">
                <p className="text-sm text-gray-600">
                    ตั้งค่าการพิมพ์: กระดาษ A4 · ปิด &quot;ส่วนหัวและส่วนท้าย&quot; ของเบราว์เซอร์ · บันทึกเป็น PDF
                    ได้จากหน้าต่างพิมพ์
                </p>
                <button type="button" className={buttonClass("primary", "md")} onClick={() => window.print()}>
                    <Printer size={16} />
                    พิมพ์ / บันทึก PDF
                </button>
            </div>

            {/* บนจอกว้างเท่า A4 เสมอ — จอมือถือเลื่อนซ้ายขวาดูแทนการบีบกระดาษ */}
            <article className="relative mx-auto w-[210mm] bg-white p-[12mm] text-[10.5pt] leading-relaxed text-gray-900 shadow-card print:w-auto print:p-0 print:shadow-none">
                {receipt.rc_status === "cancelled" && (
                    <div className="pointer-events-none absolute top-40 right-16 -rotate-12 rounded-lg border-4 border-red-600/70 px-6 py-2 text-[28pt] font-medium text-red-600/70">
                        {labels.cancelledStamp}
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
                            <p className="text-[12pt] font-medium">{companyName}</p>
                            {companyAddress && <p className="whitespace-pre-line text-gray-700">{companyAddress}</p>}
                            <p className="text-gray-700">
                                {company.cs_tax_id ? `${labels.taxId} ${company.cs_tax_id}` : ""}
                                {branch
                                    ? ` · ${branchLabel(branch.branch_code, isEnglish ? branch.branch_name_en : branch.branch_name_th, labels)}`
                                    : ""}
                            </p>
                            <p className="text-gray-700">
                                {[branch?.branch_phone || company.cs_phone, company.cs_email, company.cs_website]
                                    .filter(Boolean)
                                    .join(" · ")}
                            </p>
                        </div>
                    </div>
                    <div className="grid shrink-0 gap-1 text-right">
                        <p className="text-[16pt] font-medium text-blue-600">{labels.documentTitle}</p>
                        <dl className="grid grid-cols-[auto_auto] gap-x-3 text-[9.5pt]">
                            <dt className="text-gray-500">{labels.number}</dt>
                            <dd className="tabular-nums">{receipt.rc_number}</dd>
                            <dt className="text-gray-500">{labels.date}</dt>
                            <dd>{formatDocumentDate(receipt.rc_receipt_date, language)}</dd>
                        </dl>
                    </div>
                </header>

                <section className="mt-4 grid grid-cols-[1fr_auto] gap-6 text-[9.5pt]">
                    <div className="grid gap-0.5">
                        <p className="text-gray-500">{labels.customer}</p>
                        <p className="text-[11pt] font-medium">{clientName}</p>
                        {client.client_address && <p className="whitespace-pre-line">{client.client_address}</p>}
                        {client.client_tax_id && (
                            <p>
                                {labels.taxId} {client.client_tax_id}
                                {client.client_type === "juristic" && client.client_branch_code
                                    ? ` · ${branchLabel(client.client_branch_code, null, labels)}`
                                    : ""}
                            </p>
                        )}
                    </div>
                    <div className="grid content-start gap-0.5 text-right">
                        <p className="text-gray-500">{labels.currency}</p>
                        <p className="font-medium">{currency.cur_code}</p>
                    </div>
                </section>

                <table className="mt-4 w-full border-collapse text-[9.5pt]">
                    <thead className="table-header-group">
                        <tr className="border-y border-gray-400 bg-gray-50 text-left">
                            <th className="w-12 py-1.5 pl-1 font-medium">{labels.index}</th>
                            <th className="py-1.5 font-medium">{labels.invoiceNumber}</th>
                            <th className="w-32 py-1.5 font-medium">{labels.invoiceDate}</th>
                            <th className="w-32 py-1.5 text-right font-medium">{labels.invoiceTotal}</th>
                            <th className="w-32 py-1.5 pr-1 text-right font-medium">{labels.paidAmount}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {allocations.map((row, index) => (
                            <tr key={row.inv_id} className="print-row border-b border-gray-200 align-top">
                                <td className="py-1 pl-1 tabular-nums">{index + 1}</td>
                                <td className="py-1 pr-2">
                                    <p className="tabular-nums">{row.inv_number}</p>
                                    <p className="text-[8.5pt] text-gray-600">{row.inv_title}</p>
                                </td>
                                <td className="py-1">{formatDocumentDate(row.inv_issue_date, language)}</td>
                                <td className="py-1 text-right tabular-nums">
                                    {formatAmount(row.inv_total, decimals)}
                                </td>
                                <td className="py-1 pr-1 text-right tabular-nums">
                                    {formatAmount(row.rca_amount, decimals)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                <section className="print-row mt-3 grid grid-cols-[1fr_auto] gap-6 border-t border-gray-400 pt-2 text-[9.5pt]">
                    <p className="self-start rounded bg-gray-50 px-2 py-1">
                        ( {amountInWords(receipt.rc_allocated_total, currency, language)} )
                    </p>
                    <dl className="grid min-w-[70mm] grid-cols-[1fr_auto] gap-x-4 gap-y-0.5">
                        <dt className="font-medium">{labels.allocatedTotal}</dt>
                        <dd className="text-right font-medium tabular-nums">
                            {formatAmount(receipt.rc_allocated_total, decimals)} {currency.cur_code}
                        </dd>
                        {hasWithholding && (
                            <>
                                <dt className="text-gray-600">{labels.withholding}</dt>
                                <dd className="text-right tabular-nums text-gray-600">
                                    {formatAmount(receipt.rc_wht_amount, decimals)}
                                </dd>
                            </>
                        )}
                        {hasFee && (
                            <>
                                <dt className="text-gray-600">{labels.fee}</dt>
                                <dd className="text-right tabular-nums text-gray-600">
                                    {formatAmount(receipt.rc_fee_amount, decimals)}
                                </dd>
                            </>
                        )}
                        {(hasWithholding || hasFee) && (
                            <>
                                <dt className="border-t border-gray-300 pt-1 font-medium">{labels.received}</dt>
                                <dd className="border-t border-gray-300 pt-1 text-right font-medium tabular-nums">
                                    {formatAmount(receipt.rc_received_amount, decimals)} {currency.cur_code}
                                </dd>
                            </>
                        )}
                    </dl>
                </section>

                <section className="print-row mt-4 grid gap-0.5 rounded-lg border border-gray-300 p-3 text-[9.5pt]">
                    <p>
                        <span className="font-medium">{labels.paidBy}:</span> {paidByText(detail, labels)}
                    </p>
                    {receipt.rc_method === "cheque" && <p className="text-gray-600">{labels.chequeNote}</p>}
                </section>

                {receipt.rc_notes && (
                    <section className="print-row mt-4 text-[9.5pt]">
                        <p className="font-medium">{labels.notes}</p>
                        <p className="whitespace-pre-line text-gray-700">{receipt.rc_notes}</p>
                    </section>
                )}

                <section className="print-row mt-12 grid grid-cols-2 gap-10 text-center text-[9pt]">
                    <div />
                    <div className="grid gap-1">
                        <div className="h-14" />
                        <div className="border-t border-gray-400 pt-1">
                            <p>
                                {receipt.rc_created_by_name
                                    ? `( ${receipt.rc_created_by_name} )`
                                    : "( .................................................. )"}
                            </p>
                            <p className="font-medium">{labels.collector}</p>
                            <p className="text-gray-600">
                                {labels.signDate} {formatDocumentDate(receipt.rc_receipt_date, language)}
                            </p>
                        </div>
                    </div>
                </section>
            </article>
        </div>
    );
}
