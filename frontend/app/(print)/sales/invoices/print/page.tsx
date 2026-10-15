"use client";

// หน้าพิมพ์ใบแจ้งหนี้ A4 (2026-10-14 ขั้น 1B-3) — พิมพ์/บันทึก PDF จากเบราว์เซอร์ · โครงเดียวกับหน้าพิมพ์ใบเสนอราคา
// ใบที่ออกแล้วใช้ข้อมูลลูกค้า/บริษัท/บัญชี "ณ วันออก" (snapshot) เสมอ · ร่าง/รออนุมัติใช้ข้อมูลปัจจุบัน + ลายน้ำ ไม่แสดงลายเซ็น
// บัญชีรับเงิน + QR พร้อมเพย์ (ยอดหลังหัก ณ ที่จ่าย, เงินบาทเท่านั้น) มาจาก backend ใน detail.payment
import { Fragment, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Printer } from "lucide-react";
import SignatureImage from "@/components/signature/signature-image";
import PromptPayQr from "@/components/ui/promptpay-qr";
import { buttonClass } from "@/components/ui/button";
import { apiFetch, uploadedFileUrl } from "@/lib/api";
import { formatAmount, parseHundredths } from "@/lib/shared/money.mjs";
import { amountInWords } from "@/lib/shared/amount-in-words.mjs";
import type { ClientSnapshot, CompanySnapshot } from "@/app/(protected)/sales/quotations/_types";
import type { InvoiceDetail } from "@/app/(protected)/sales/invoices/_types";
import { formatDocumentDate } from "../../quotations/print/labels";
import { INVOICE_PRINT_LABELS, type InvoicePrintLabels } from "./labels";
import { percentLabel } from "@/app/(protected)/sales/invoices/_format";

type CompanyResponse = {
    company: Omit<CompanySnapshot, "branch">;
    branches: (NonNullable<CompanySnapshot["branch"]> & { branch_id: string })[];
};

type PrintData = { detail: InvoiceDetail; company: CompanySnapshot; client: ClientSnapshot };

async function loadPrintData(invoiceId: string): Promise<{ data: PrintData | null; error: string | null }> {
    const { data: detail, error } = await apiFetch<InvoiceDetail>(`/invoices/${invoiceId}`);
    if (error || !detail) return { data: null, error: error?.message ?? "โหลดใบแจ้งหนี้ไม่สำเร็จ" };
    const { inv_company_snapshot: companySnapshot, inv_client_snapshot: clientSnapshot } = detail.invoice;
    if (companySnapshot && clientSnapshot)
        return { data: { detail, company: companySnapshot, client: clientSnapshot }, error: null };

    // ร่าง/รออนุมัติ: ยังไม่มี snapshot ใช้ข้อมูลปัจจุบัน
    const [companyResult, clientResult] = await Promise.all([
        apiFetch<CompanyResponse>("/company"),
        apiFetch<ClientSnapshot>(`/clients/${detail.invoice.inv_client_id}`),
    ]);
    if (!companyResult.data || !clientResult.data) return { data: null, error: "โหลดข้อมูลบริษัทหรือลูกค้าไม่สำเร็จ" };
    const branch = companyResult.data.branches.find((item) => item.branch_id === detail.invoice.inv_branch_id) ?? null;
    return {
        data: { detail, company: { ...companyResult.data.company, branch }, client: clientResult.data },
        error: null,
    };
}

function branchLabel(code: string | null, name: string | null, labels: InvoicePrintLabels) {
    if (!code) return "";
    return code === "00000" ? labels.headOffice : `${labels.branch} ${code}${name ? ` ${name}` : ""}`;
}

export default function InvoicePrintPage() {
    const invoiceId = useSearchParams().get("id");
    const [printData, setPrintData] = useState<PrintData | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        if (!invoiceId) return;
        let isLeftPage = false;
        loadPrintData(invoiceId).then(({ data, error }) => {
            if (isLeftPage) return;
            setPrintData(data);
            setLoadError(error);
        });
        return () => {
            isLeftPage = true;
        };
    }, [invoiceId]);

    if (!invoiceId || loadError) return <p className="p-8 text-sm text-red-600">{loadError ?? "ไม่พบใบแจ้งหนี้นี้"}</p>;
    if (!printData) return <p className="p-8 text-sm text-gray-500">กำลังเตรียมหน้าพิมพ์...</p>;

    const { detail, company, client } = printData;
    const { invoice, currency, items, payment } = detail;
    const language = invoice.inv_language;
    const labels = INVOICE_PRINT_LABELS[language];
    const decimals = currency.cur_decimals;
    const isIssued = invoice.inv_status === "issued" || invoice.inv_status === "cancelled";
    const isEnglish = language === "en";
    const companyName = (isEnglish && company.cs_name_en) || company.cs_name_th;
    const branch = company.branch;
    const companyAddress =
        (isEnglish ? branch?.branch_address_en || company.cs_address_en : branch?.branch_address_th) ||
        (isEnglish ? company.cs_address_en : company.cs_address_th) ||
        company.cs_address_th;
    const clientName = client.client_company || client.client_name;
    const hasVat = parseHundredths(invoice.inv_vat_rate, "VAT") > 0n;
    const isVatZero = invoice.inv_vat_treatment === "zero";
    const hasWithholding = parseHundredths(invoice.inv_wht_amount, "หัก ณ ที่จ่าย") > 0n;
    const account = payment.bank_account;
    // ร่าง/รออนุมัติไม่พิมพ์ QR — กันลูกค้าสแกนจ่ายจากเอกสารที่ยังไม่ออก (ไม่มีเลขที่)
    const qrPayload = invoice.inv_status === "issued" ? payment.qr_payload : null;

    // ยอดรวมย่อยท้ายแต่ละหัวข้อ (หัวข้อถึงหัวข้อถัดไป) — แบบเดียวกับหน้าพิมพ์ใบเสนอราคา
    let itemNumber = 0;
    const rows: {
        kind: "heading" | "note" | "item" | "subtotal";
        key: string;
        item?: (typeof items)[number];
        number?: number;
        amount?: bigint;
        title?: string;
    }[] = [];
    let currentHeading: { title: string; sum: bigint; count: number } | null = null;
    const closeHeading = () => {
        if (currentHeading && currentHeading.count > 0) {
            rows.push({
                kind: "subtotal",
                key: `subtotal-${rows.length}`,
                amount: currentHeading.sum,
                title: currentHeading.title,
            });
        }
    };
    for (const item of items) {
        if (item.invi_type === "heading") {
            closeHeading();
            currentHeading = { title: item.invi_description, sum: 0n, count: 0 };
            rows.push({ kind: "heading", key: String(item.invi_id), item });
        } else if (item.invi_type === "note") {
            rows.push({ kind: "note", key: String(item.invi_id), item });
        } else {
            itemNumber += 1;
            if (currentHeading) {
                currentHeading.sum += parseHundredths(item.invi_amount, "ยอด");
                currentHeading.count += 1;
            }
            rows.push({ kind: "item", key: String(item.invi_id), item, number: itemNumber });
        }
    }
    closeHeading();

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
                {invoice.inv_status === "cancelled" && (
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
                            <dd className="tabular-nums">{invoice.inv_number ?? labels.notIssued}</dd>
                            <dt className="text-gray-500">{labels.date}</dt>
                            <dd>
                                {invoice.inv_issue_date
                                    ? formatDocumentDate(invoice.inv_issue_date, language)
                                    : labels.notIssuedDate}
                            </dd>
                            <dt className="text-gray-500">{labels.dueDate}</dt>
                            <dd>
                                {invoice.inv_due_date
                                    ? formatDocumentDate(invoice.inv_due_date, language)
                                    : labels.notIssuedDate}
                            </dd>
                            {invoice.qt_number && (
                                <>
                                    <dt className="text-gray-500">{labels.reference}</dt>
                                    <dd className="tabular-nums">{invoice.qt_number}</dd>
                                </>
                            )}
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
                    <span className="text-gray-500">{labels.subject}:</span> {invoice.inv_title}
                </p>

                <table className="mt-3 w-full border-collapse text-[9.5pt]">
                    <thead className="table-header-group">
                        <tr className="border-y border-gray-400 bg-gray-50 text-left">
                            <th className="w-10 py-1.5 pl-1 font-medium">{labels.index}</th>
                            <th className="py-1.5 font-medium">{labels.description}</th>
                            <th className="w-20 py-1.5 text-right font-medium">{labels.quantity}</th>
                            <th className="w-24 py-1.5 text-right font-medium">{labels.unitPrice}</th>
                            <th className="w-20 py-1.5 text-right font-medium">{labels.discount}</th>
                            <th className="w-28 py-1.5 pr-1 text-right font-medium">{labels.amount}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => (
                            <Fragment key={row.key}>
                                {row.kind === "heading" && row.item && (
                                    <tr className="print-row">
                                        <td />
                                        <td colSpan={5} className="pt-2 pb-0.5 font-medium whitespace-pre-line">
                                            {row.item.invi_description}
                                        </td>
                                    </tr>
                                )}
                                {row.kind === "note" && row.item && (
                                    <tr className="print-row">
                                        <td />
                                        <td colSpan={5} className="py-0.5 whitespace-pre-line text-gray-600 italic">
                                            {row.item.invi_description}
                                        </td>
                                    </tr>
                                )}
                                {row.kind === "item" && row.item && (
                                    <tr className="print-row align-top">
                                        <td className="py-1 pl-1 tabular-nums">{row.number}</td>
                                        <td className="py-1 pr-2 whitespace-pre-line">{row.item.invi_description}</td>
                                        <td className="py-1 text-right tabular-nums">
                                            {formatAmount(row.item.invi_quantity ?? "0")} {row.item.invi_unit ?? ""}
                                        </td>
                                        <td className="py-1 text-right tabular-nums">
                                            {formatAmount(row.item.invi_unit_price ?? "0", decimals)}
                                        </td>
                                        <td className="py-1 text-right tabular-nums">
                                            {parseHundredths(row.item.invi_discount_amount, "ส่วนลด") > 0n
                                                ? formatAmount(row.item.invi_discount_amount, decimals)
                                                : ""}
                                        </td>
                                        <td className="py-1 pr-1 text-right tabular-nums">
                                            {formatAmount(row.item.invi_amount, decimals)}
                                        </td>
                                    </tr>
                                )}
                                {row.kind === "subtotal" && (
                                    <tr className="print-row border-b border-dashed border-gray-300">
                                        <td />
                                        <td colSpan={4} className="py-1 text-right text-gray-600">
                                            {labels.headingSubtotal} {row.title}
                                        </td>
                                        <td className="py-1 pr-1 text-right tabular-nums">
                                            {formatAmount(row.amount ?? 0n, decimals)}
                                        </td>
                                    </tr>
                                )}
                            </Fragment>
                        ))}
                    </tbody>
                </table>

                <section className="print-row mt-3 grid grid-cols-[1fr_auto] gap-6 border-t border-gray-400 pt-2 text-[9.5pt]">
                    <p className="self-end rounded bg-gray-50 px-2 py-1">
                        ( {amountInWords(invoice.inv_total, currency, language)} )
                    </p>
                    <dl className="grid min-w-[70mm] grid-cols-[1fr_auto] gap-x-4 gap-y-0.5">
                        <dt>{labels.subtotal}</dt>
                        <dd className="text-right tabular-nums">{formatAmount(invoice.inv_subtotal, decimals)}</dd>
                        {parseHundredths(invoice.inv_discount_amount, "ส่วนลด") > 0n && (
                            <>
                                <dt>{labels.billDiscount}</dt>
                                <dd className="text-right tabular-nums">
                                    {formatAmount(invoice.inv_discount_amount, decimals)}
                                </dd>
                                <dt>{labels.afterDiscount}</dt>
                                <dd className="text-right tabular-nums">
                                    {formatAmount(invoice.inv_after_discount, decimals)}
                                </dd>
                            </>
                        )}
                        {(hasVat || isVatZero) && (
                            <>
                                <dt>{isVatZero ? labels.vatZero : `${labels.vat} ${invoice.inv_vat_rate}%`}</dt>
                                <dd className="text-right tabular-nums">
                                    {formatAmount(invoice.inv_vat_amount, decimals)}
                                </dd>
                            </>
                        )}
                        <dt className="border-t border-gray-300 pt-1 font-medium">{labels.total}</dt>
                        <dd className="border-t border-gray-300 pt-1 text-right font-medium tabular-nums">
                            {formatAmount(invoice.inv_total, decimals)} {currency.cur_code}
                        </dd>
                        {hasWithholding && (
                            <>
                                <dt className="text-gray-600">
                                    {labels.withholding} {percentLabel(invoice.inv_wht_rate)}% {labels.withholdingNote}
                                </dt>
                                <dd className="text-right tabular-nums text-gray-600">
                                    {formatAmount(invoice.inv_wht_amount, decimals)}
                                </dd>
                                <dt className="font-medium">{labels.netPayable}</dt>
                                <dd className="text-right font-medium tabular-nums">
                                    {formatAmount(payment.net_payable, decimals)} {currency.cur_code}
                                </dd>
                            </>
                        )}
                    </dl>
                </section>

                {(account || qrPayload) && (
                    <section className="print-row mt-4 flex items-start justify-between gap-6 rounded-lg border border-gray-300 p-3 text-[9.5pt]">
                        {account ? (
                            <div className="grid gap-0.5">
                                <p className="font-medium">{labels.payTo}</p>
                                <p>
                                    {account.ba_bank_name}
                                    {account.ba_bank_branch ? ` · ${labels.bankBranch} ${account.ba_bank_branch}` : ""}
                                </p>
                                <p>
                                    {labels.accountNo}{" "}
                                    <span className="font-medium tabular-nums">{account.ba_account_no}</span>
                                </p>
                                <p>
                                    {labels.accountName} {account.ba_account_name}
                                </p>
                                {account.ba_swift_code && <p>SWIFT {account.ba_swift_code}</p>}
                            </div>
                        ) : (
                            <div />
                        )}
                        {qrPayload && (
                            <div className="grid shrink-0 justify-items-center gap-0.5 text-center">
                                <PromptPayQr payload={qrPayload} size={96} />
                                <p className="text-[8.5pt] text-gray-600">{labels.promptPay}</p>
                                <p className="text-[8.5pt] text-gray-600 tabular-nums">
                                    {labels.promptPayAmount} {formatAmount(payment.net_payable, decimals)}{" "}
                                    {currency.cur_code}
                                </p>
                            </div>
                        )}
                    </section>
                )}

                {invoice.inv_notes && (
                    <section className="print-row mt-4 text-[9.5pt]">
                        <p className="font-medium">{labels.notes}</p>
                        <p className="whitespace-pre-line text-gray-700">{invoice.inv_notes}</p>
                    </section>
                )}

                <section className="print-row mt-10 grid grid-cols-2 gap-10 text-center text-[9pt]">
                    <SignatureBox
                        title={labels.issuer}
                        name={isIssued ? invoice.inv_issued_by_name : null}
                        role={isIssued ? invoice.inv_issued_by_title : null}
                        signatureId={isIssued ? invoice.inv_issuer_signature_id : null}
                        dateLabel={labels.signDate}
                        date={isIssued ? formatDocumentDate(invoice.inv_issue_date, language) : null}
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
