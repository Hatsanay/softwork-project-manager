"use client";

// หน้าพิมพ์ใบวางบิล A4 (2026-10-15 ขั้น 1B-4) — พิมพ์/บันทึก PDF จากเบราว์เซอร์ · โครงเดียวกับหน้าพิมพ์ใบแจ้งหนี้
// ตารางใบแจ้งหนี้ (เลขที่ วันที่ ครบกำหนด ยอด) + วันนัดชำระ + ช่องลูกค้าเซ็นรับวางบิล
// ใบที่ออกแล้วใช้ข้อมูลลูกค้า/บริษัท "ณ วันออก" (snapshot) · ร่างใช้ข้อมูลปัจจุบัน + ลายน้ำ
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Printer } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { apiFetch, uploadedFileUrl } from "@/lib/api";
import { formatAmount, parseHundredths } from "@/lib/shared/money.mjs";
import { amountInWords } from "@/lib/shared/amount-in-words.mjs";
import type { ClientSnapshot, CompanySnapshot } from "@/app/(protected)/sales/quotations/_types";
import type { BillingNoteDetail } from "@/app/(protected)/sales/billing-notes/_types";
import { formatDocumentDate } from "../../quotations/print/labels";
import { BILLING_NOTE_PRINT_LABELS, type BillingNotePrintLabels } from "./labels";

type CompanyResponse = {
    company: Omit<CompanySnapshot, "branch">;
    branches: (NonNullable<CompanySnapshot["branch"]> & { branch_id: string })[];
};

type PrintData = { detail: BillingNoteDetail; company: CompanySnapshot; client: ClientSnapshot };

async function loadPrintData(billingNoteId: string): Promise<{ data: PrintData | null; error: string | null }> {
    const { data: detail, error } = await apiFetch<BillingNoteDetail>(`/billing-notes/${billingNoteId}`);
    if (error || !detail) return { data: null, error: error?.message ?? "โหลดใบวางบิลไม่สำเร็จ" };
    const { bn_company_snapshot: companySnapshot, bn_client_snapshot: clientSnapshot } = detail.billing_note;
    if (companySnapshot && clientSnapshot)
        return { data: { detail, company: companySnapshot, client: clientSnapshot }, error: null };

    // ร่าง: ยังไม่มี snapshot ใช้ข้อมูลปัจจุบัน
    const [companyResult, clientResult] = await Promise.all([
        apiFetch<CompanyResponse>("/company"),
        apiFetch<ClientSnapshot>(`/clients/${detail.billing_note.bn_client_id}`),
    ]);
    if (!companyResult.data || !clientResult.data) return { data: null, error: "โหลดข้อมูลบริษัทหรือลูกค้าไม่สำเร็จ" };
    const branch =
        companyResult.data.branches.find((item) => item.branch_id === detail.billing_note.bn_branch_id) ?? null;
    return {
        data: { detail, company: { ...companyResult.data.company, branch }, client: clientResult.data },
        error: null,
    };
}

function branchLabel(code: string | null, name: string | null, labels: BillingNotePrintLabels) {
    if (!code) return "";
    return code === "00000" ? labels.headOffice : `${labels.branch} ${code}${name ? ` ${name}` : ""}`;
}

export default function BillingNotePrintPage() {
    const billingNoteId = useSearchParams().get("id");
    const [printData, setPrintData] = useState<PrintData | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        if (!billingNoteId) return;
        let isLeftPage = false;
        loadPrintData(billingNoteId).then(({ data, error }) => {
            if (isLeftPage) return;
            setPrintData(data);
            setLoadError(error);
        });
        return () => {
            isLeftPage = true;
        };
    }, [billingNoteId]);

    if (!billingNoteId || loadError)
        return <p className="p-8 text-sm text-red-600">{loadError ?? "ไม่พบใบวางบิลนี้"}</p>;
    if (!printData) return <p className="p-8 text-sm text-gray-500">กำลังเตรียมหน้าพิมพ์...</p>;

    const { detail, company, client } = printData;
    const { billing_note: note, invoices, currency } = detail;
    const language = note.bn_language;
    const labels = BILLING_NOTE_PRINT_LABELS[language];
    const decimals = currency.cur_decimals;
    const isIssued = note.bn_status === "issued" || note.bn_status === "cancelled";
    const isEnglish = language === "en";
    const companyName = (isEnglish && company.cs_name_en) || company.cs_name_th;
    const branch = company.branch;
    const companyAddress =
        (isEnglish ? branch?.branch_address_en || company.cs_address_en : branch?.branch_address_th) ||
        (isEnglish ? company.cs_address_en : company.cs_address_th) ||
        company.cs_address_th;
    const clientName = client.client_company || client.client_name;
    const hasWithholding = parseHundredths(detail.withholding_total, "หัก ณ ที่จ่าย") > 0n;
    // ใบที่รับเงินบางส่วนก่อนวางบิล: ยอดวางบิล ≠ ยอดใบแจ้งหนี้ → แสดงทั้งสองคอลัมน์ (ใบปกติแสดงคอลัมน์เดียว ไม่ซ้ำ)
    const hasPartialInvoice = detail.invoices.some((invoice) => invoice.bni_amount !== invoice.inv_total);

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
                {!isIssued && (
                    <div className="pointer-events-none fixed inset-0 flex items-center justify-center print:fixed">
                        <span className="-rotate-30 text-[42pt] font-medium text-gray-300/60">
                            {labels.draftWatermark}
                        </span>
                    </div>
                )}
                {note.bn_status === "cancelled" && (
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
                            <dd className="tabular-nums">{note.bn_number ?? labels.notIssued}</dd>
                            <dt className="text-gray-500">{labels.date}</dt>
                            <dd>
                                {note.bn_issue_date
                                    ? formatDocumentDate(note.bn_issue_date, language)
                                    : labels.notIssuedDate}
                            </dd>
                            <dt className="text-gray-500">{labels.paymentDate}</dt>
                            <dd>
                                {note.bn_payment_date
                                    ? formatDocumentDate(note.bn_payment_date, language)
                                    : labels.blankDate}
                            </dd>
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
                        {client.client_contact_name && (
                            <p>
                                {labels.contact} {client.client_contact_name}
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
                            <th className="w-28 py-1.5 font-medium">{labels.invoiceDate}</th>
                            <th className="w-28 py-1.5 font-medium">{labels.dueDate}</th>
                            {hasPartialInvoice && (
                                <th className="w-32 py-1.5 text-right font-medium">{labels.invoiceTotal}</th>
                            )}
                            <th className="w-32 py-1.5 pr-1 text-right font-medium">{labels.billedAmount}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {invoices.map((invoice, index) => (
                            <tr key={invoice.inv_id} className="print-row border-b border-gray-200 align-top">
                                <td className="py-1 pl-1 tabular-nums">{index + 1}</td>
                                <td className="py-1 pr-2">
                                    <p className="tabular-nums">{invoice.inv_number}</p>
                                    <p className="text-[8.5pt] text-gray-600">{invoice.inv_title}</p>
                                </td>
                                <td className="py-1">
                                    {invoice.inv_issue_date ? formatDocumentDate(invoice.inv_issue_date, language) : ""}
                                </td>
                                <td className="py-1">
                                    {invoice.inv_due_date ? formatDocumentDate(invoice.inv_due_date, language) : ""}
                                </td>
                                {hasPartialInvoice && (
                                    <td className="py-1 text-right tabular-nums">
                                        {formatAmount(invoice.inv_total, decimals)}
                                    </td>
                                )}
                                <td className="py-1 pr-1 text-right tabular-nums">
                                    {formatAmount(invoice.bni_amount, decimals)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                <section className="print-row mt-3 grid grid-cols-[1fr_auto] gap-6 border-t border-gray-400 pt-2 text-[9.5pt]">
                    <p className="self-end rounded bg-gray-50 px-2 py-1">
                        ( {amountInWords(note.bn_total, currency, language)} )
                    </p>
                    <dl className="grid min-w-[70mm] grid-cols-[1fr_auto] gap-x-4 gap-y-0.5">
                        <dt className="font-medium">{labels.total}</dt>
                        <dd className="text-right font-medium tabular-nums">
                            {formatAmount(note.bn_total, decimals)} {currency.cur_code}
                        </dd>
                        {hasWithholding && (
                            <>
                                <dt className="text-gray-600">{labels.withholdingEstimate}</dt>
                                <dd className="text-right tabular-nums text-gray-600">
                                    {formatAmount(detail.withholding_total, decimals)}
                                </dd>
                                <dt className="font-medium">{labels.netPayable}</dt>
                                <dd className="text-right font-medium tabular-nums">
                                    {formatAmount(detail.net_payable, decimals)} {currency.cur_code}
                                </dd>
                            </>
                        )}
                    </dl>
                </section>

                {note.bn_notes && (
                    <section className="print-row mt-4 text-[9.5pt]">
                        <p className="font-medium">{labels.notes}</p>
                        <p className="whitespace-pre-line text-gray-700">{note.bn_notes}</p>
                    </section>
                )}

                <section className="print-row mt-12 grid grid-cols-2 gap-10 text-center text-[9pt]">
                    <SignatureLine
                        title={labels.biller}
                        name={isIssued ? note.bn_created_by_name : null}
                        dateLabel={labels.signDate}
                        date={isIssued && note.bn_issue_date ? formatDocumentDate(note.bn_issue_date, language) : null}
                        blankDate={labels.blankDate}
                    />
                    <SignatureLine
                        title={labels.receiver}
                        name={null}
                        dateLabel={labels.signDate}
                        date={null}
                        blankDate={labels.blankDate}
                    />
                </section>
            </article>
        </div>
    );
}

// ช่องเซ็นมือ: ชื่อ (ถ้ารู้) + วันที่ (ว่าง = เว้นให้เขียน)
function SignatureLine({
    title,
    name,
    dateLabel,
    date,
    blankDate,
}: {
    title: string;
    name: string | null;
    dateLabel: string;
    date: string | null;
    blankDate: string;
}) {
    return (
        <div className="grid gap-1">
            <div className="h-14" />
            <div className="border-t border-gray-400 pt-1">
                <p>{name ? `( ${name} )` : "( .................................................. )"}</p>
                <p className="font-medium">{title}</p>
                <p className="text-gray-600">
                    {dateLabel} {date ?? blankDate}
                </p>
            </div>
        </div>
    );
}
