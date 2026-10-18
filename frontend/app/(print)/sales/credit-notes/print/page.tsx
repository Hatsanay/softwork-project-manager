"use client";

// หน้าพิมพ์ใบลดหนี้ A4 (ขั้น N-1) — โครงเดียวกับหน้าพิมพ์ใบแจ้งหนี้ · ใบที่ออกแล้วใช้ข้อมูลลูกค้า/บริษัท ณ วันออก (snapshot)
// ยอด (กติกาเงิน 3.8): รายการที่ลด → ผลต่างก่อน VAT → VAT → รวมลดหนี้ (ตัวหนา + ตัวอักษร) · กล่องเทียบใบเดิม: เดิม − ใบนี้ = ที่ถูกต้อง
// ไม่มี QR / บัญชีรับเงิน (ใบนี้ไม่ใช่เอกสารเรียกเก็บเงิน)
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Printer } from "lucide-react";
import SignatureImage from "@/components/signature/signature-image";
import { buttonClass } from "@/components/ui/button";
import { apiFetch, uploadedFileUrl } from "@/lib/api";
import { formatAmount, parseHundredths } from "@/lib/shared/money.mjs";
import { amountInWords } from "@/lib/shared/amount-in-words.mjs";
import type { ClientSnapshot, CompanySnapshot } from "@/app/(protected)/sales/quotations/_types";
import type { CreditNoteDetail } from "@/app/(protected)/sales/credit-notes/_types";
import { formatDocumentDate } from "../../quotations/print/labels";
import { CREDIT_NOTE_PRINT_LABELS, type CreditNotePrintLabels } from "./labels";

type CompanyResponse = {
    company: Omit<CompanySnapshot, "branch">;
    branches: (NonNullable<CompanySnapshot["branch"]> & { branch_id: string })[];
};

type PrintData = { detail: CreditNoteDetail; company: CompanySnapshot; client: ClientSnapshot };

async function loadPrintData(creditNoteId: string): Promise<{ data: PrintData | null; error: string | null }> {
    const { data: detail, error } = await apiFetch<CreditNoteDetail>(`/credit-notes/${creditNoteId}`);
    if (error || !detail) return { data: null, error: error?.message ?? "โหลดใบลดหนี้ไม่สำเร็จ" };
    const { cn_company_snapshot: companySnapshot, cn_client_snapshot: clientSnapshot } = detail.credit_note;
    if (companySnapshot && clientSnapshot)
        return { data: { detail, company: companySnapshot, client: clientSnapshot }, error: null };

    // ร่าง/รออนุมัติ: ยังไม่มี snapshot ใช้ข้อมูลปัจจุบัน
    const [companyResult, clientResult, invoiceResult] = await Promise.all([
        apiFetch<CompanyResponse>("/company"),
        apiFetch<ClientSnapshot>(`/clients/${detail.credit_note.cn_client_id}`),
        apiFetch<{ invoice: { inv_branch_id: string } }>(`/invoices/${detail.credit_note.cn_invoice_id}`),
    ]);
    if (!companyResult.data || !clientResult.data) return { data: null, error: "โหลดข้อมูลบริษัทหรือลูกค้าไม่สำเร็จ" };
    const branchId = invoiceResult.data?.invoice.inv_branch_id;
    const branch = companyResult.data.branches.find((item) => item.branch_id === branchId) ?? null;
    return {
        data: { detail, company: { ...companyResult.data.company, branch }, client: clientResult.data },
        error: null,
    };
}

function branchLabel(code: string | null, name: string | null, labels: CreditNotePrintLabels) {
    if (!code) return "";
    return code === "00000" ? labels.headOffice : `${labels.branch} ${code}${name ? ` ${name}` : ""}`;
}

export default function CreditNotePrintPage() {
    const creditNoteId = useSearchParams().get("id");
    const [printData, setPrintData] = useState<PrintData | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        if (!creditNoteId) return;
        let isLeftPage = false;
        loadPrintData(creditNoteId).then(({ data, error }) => {
            if (isLeftPage) return;
            setPrintData(data);
            setLoadError(error);
        });
        return () => {
            isLeftPage = true;
        };
    }, [creditNoteId]);

    if (!creditNoteId || loadError)
        return <p className="p-8 text-sm text-red-600">{loadError ?? "ไม่พบใบลดหนี้นี้"}</p>;
    if (!printData) return <p className="p-8 text-sm text-gray-500">กำลังเตรียมหน้าพิมพ์...</p>;

    const { detail, company, client } = printData;
    const { credit_note: creditNote, lines, invoice, currency } = detail;
    const language = creditNote.cn_language;
    const labels = CREDIT_NOTE_PRINT_LABELS[language];
    const decimals = currency.cur_decimals;
    const isIssued = creditNote.cn_status === "issued" || creditNote.cn_status === "cancelled";
    const isEnglish = language === "en";
    const companyName = (isEnglish && company.cs_name_en) || company.cs_name_th;
    const branch = company.branch;
    const companyAddress =
        (isEnglish ? branch?.branch_address_en || company.cs_address_en : branch?.branch_address_th) ||
        (isEnglish ? company.cs_address_en : company.cs_address_th) ||
        company.cs_address_th;
    const clientName = client.client_company || client.client_name;
    const hasVat = parseHundredths(creditNote.cn_vat_rate, "VAT") > 0n;
    const correctTotal =
        parseHundredths(creditNote.cn_original_total, "มูลค่าเดิม") - parseHundredths(creditNote.cn_total, "ลดหนี้");

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

            <article className="relative mx-auto w-[210mm] bg-white p-[12mm] text-[10.5pt] leading-relaxed text-gray-900 shadow-card print:w-auto print:p-0 print:shadow-none">
                {!isIssued && (
                    <div className="pointer-events-none fixed inset-0 flex items-center justify-center print:fixed">
                        <span className="-rotate-30 text-[42pt] font-medium text-gray-300/60">
                            {labels.draftWatermark}
                        </span>
                    </div>
                )}
                {creditNote.cn_status === "cancelled" && (
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
                        </div>
                    </div>
                    <div className="grid shrink-0 gap-1 text-right">
                        <p className="text-[16pt] font-medium text-blue-600">{labels.documentTitle}</p>
                        <dl className="grid grid-cols-[auto_auto] gap-x-3 text-[9.5pt]">
                            <dt className="text-gray-500">{labels.number}</dt>
                            <dd className="tabular-nums">{creditNote.cn_number ?? labels.notIssued}</dd>
                            <dt className="text-gray-500">{labels.date}</dt>
                            <dd>
                                {creditNote.cn_issue_date
                                    ? formatDocumentDate(creditNote.cn_issue_date, language)
                                    : labels.notIssuedDate}
                            </dd>
                            <dt className="text-gray-500">{labels.reference}</dt>
                            <dd className="tabular-nums">{invoice.inv_number}</dd>
                            <dt className="text-gray-500">{labels.referenceDate}</dt>
                            <dd>{formatDocumentDate(invoice.inv_issue_date, language)}</dd>
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
                <p className="mt-3 text-[10pt]">
                    <span className="text-gray-500">{labels.reason}:</span> {creditNote.cn_reason}
                </p>

                <table className="mt-3 w-full border-collapse text-[9.5pt]">
                    <thead className="table-header-group">
                        <tr className="border-y border-gray-400 bg-gray-50 text-left">
                            <th className="w-10 py-1.5 pl-1 font-medium">{labels.index}</th>
                            <th className="py-1.5 font-medium">{labels.description}</th>
                            <th className="w-32 py-1.5 pr-1 text-right font-medium">{labels.amount}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {lines.map((line, index) => (
                            <tr key={line.cnl_id} className="print-row align-top">
                                <td className="py-1 pl-1 tabular-nums">{index + 1}</td>
                                <td className="py-1 pr-2 whitespace-pre-line">{line.cnl_description}</td>
                                <td className="py-1 pr-1 text-right tabular-nums">
                                    {formatAmount(line.cnl_amount, decimals)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                <section className="print-row mt-3 grid grid-cols-[1fr_auto] gap-6 border-t border-gray-400 pt-2 text-[9.5pt]">
                    <p className="self-end rounded bg-gray-50 px-2 py-1">
                        ( {amountInWords(creditNote.cn_total, currency, language)} )
                    </p>
                    <dl className="grid min-w-[70mm] grid-cols-[1fr_auto] gap-x-4 gap-y-0.5">
                        {/* ไม่มี VAT: ผลต่าง = รวมลดหนี้ → พิมพ์บรรทัดเดียว (ห้ามซ้ำ — กติกา 3.8) */}
                        {hasVat && (
                            <>
                                <dt>{labels.differenceBeforeVat}</dt>
                                <dd className="text-right tabular-nums">
                                    {formatAmount(creditNote.cn_subtotal, decimals)}
                                </dd>
                                <dt>
                                    {labels.vat} {creditNote.cn_vat_rate}%
                                </dt>
                                <dd className="text-right tabular-nums">
                                    {formatAmount(creditNote.cn_vat_amount, decimals)}
                                </dd>
                            </>
                        )}
                        <dt className="border-t border-gray-300 pt-1 font-medium">
                            {hasVat ? labels.total : labels.difference}
                        </dt>
                        <dd className="border-t border-gray-300 pt-1 text-right font-medium tabular-nums">
                            {formatAmount(creditNote.cn_total, decimals)} {currency.cur_code}
                        </dd>
                    </dl>
                </section>

                <section className="print-row mt-4 ml-auto grid w-[90mm] gap-0.5 rounded-lg border border-gray-300 p-3 text-[9.5pt]">
                    <p className="font-medium">{labels.originalTitle}</p>
                    <div className="flex justify-between gap-4">
                        <span>{labels.originalValue}</span>
                        <span className="tabular-nums">{formatAmount(creditNote.cn_original_total, decimals)}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                        <span>{labels.lessThisNote}</span>
                        <span className="tabular-nums">−{formatAmount(creditNote.cn_total, decimals)}</span>
                    </div>
                    <div className="flex justify-between gap-4 border-t border-gray-300 pt-0.5 font-medium">
                        <span>{labels.correctValue}</span>
                        <span className="tabular-nums">
                            {formatAmount(correctTotal, decimals)} {currency.cur_code}
                        </span>
                    </div>
                </section>

                {creditNote.is_refunded && (
                    <section className="print-row mt-4 grid gap-0.5 rounded-lg border border-gray-300 p-3 text-[9.5pt]">
                        <p className="font-medium">
                            {labels.refunded} {formatDocumentDate(creditNote.cn_refund_date, language)}
                        </p>
                        <p>
                            {labels.refundTransfer} {formatAmount(creditNote.cn_refund_amount, decimals)}{" "}
                            {currency.cur_code}
                            {parseHundredths(creditNote.cn_refund_wht, "หัก") > 0n
                                ? ` · ${labels.refundWithholding} ${formatAmount(creditNote.cn_refund_wht, decimals)}`
                                : ""}
                            {creditNote.cn_refund_reference ? ` · ${creditNote.cn_refund_reference}` : ""}
                        </p>
                    </section>
                )}

                {creditNote.cn_notes && (
                    <section className="print-row mt-4 text-[9.5pt]">
                        <p className="font-medium">{labels.notes}</p>
                        <p className="whitespace-pre-line text-gray-700">{creditNote.cn_notes}</p>
                    </section>
                )}

                <section className="print-row mt-10 grid grid-cols-2 gap-10 text-center text-[9pt]">
                    <SignatureBox
                        title={labels.issuer}
                        name={isIssued ? creditNote.cn_issued_by_name : null}
                        role={isIssued ? creditNote.cn_issued_by_title : null}
                        signatureId={isIssued ? creditNote.cn_issuer_signature_id : null}
                        dateLabel={labels.signDate}
                        date={isIssued ? formatDocumentDate(creditNote.cn_issue_date, language) : null}
                    />
                    <SignatureBox
                        title={labels.receiver}
                        name={null}
                        role={null}
                        signatureId={null}
                        dateLabel={labels.signDate}
                    />
                </section>
            </article>
        </div>
    );
}

// ช่องเซ็น: มีลายเซ็น (ฉบับที่บันทึกไว้ตอนออก) = แสดงรูป · ไม่มี = เว้นช่องให้เซ็นมือ
function SignatureBox({
    title,
    name,
    role,
    signatureId,
    dateLabel,
    date = null,
}: {
    title: string;
    name: string | null;
    role: string | null;
    signatureId: string | null;
    dateLabel: string;
    date?: string | null;
}) {
    return (
        <div className="grid gap-1">
            <div className="flex h-16 items-end justify-center">
                {signatureId && <SignatureImage signatureId={signatureId} alt="" className="h-14 w-40" />}
            </div>
            <div className="border-t border-gray-400 pt-1">
                <p>{name ? `( ${name} )` : "( .................................................. )"}</p>
                {role && <p className="text-gray-600">{role}</p>}
                <p className="font-medium">{title}</p>
                <p className="text-gray-600">
                    {dateLabel} {date ?? "......../......../........"}
                </p>
            </div>
        </div>
    );
}
