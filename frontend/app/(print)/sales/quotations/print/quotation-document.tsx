"use client";

// ตัวเอกสารใบเสนอราคา A4 (แยกจากหน้าพิมพ์ 2026-10-30 · docs/plans/2026-10-30-quote-pdf-mobile-refactor.md ส่วน A)
// ใช้ 2 ที่: หน้าพิมพ์ภายใน (login · ลายเซ็นโหลดจาก /signatures) และหน้าเอกสารของลูกค้า /order/r/[token]/quotation (ลายเซ็นฝังมากับข้อมูล)
// ใบที่อนุมัติแล้วใช้ข้อมูลลูกค้า/บริษัท "ณ วันอนุมัติ" · ร่าง/รออนุมัติมีลายน้ำ ไม่แสดงลายเซ็น
import { Fragment, useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { uploadedFileUrl } from "@/lib/api";
import { formatAmount, formatQuantity, parseHundredths } from "@/lib/shared/money.mjs";
import { amountInWords } from "@/lib/shared/amount-in-words.mjs";
import type {
    ClientSnapshot,
    CompanySnapshot,
    CurrencyInfo,
    Quotation,
    QuotationItem,
    QuotationMilestone,
} from "@/app/(protected)/sales/quotations/_types";
import { formatDocumentDate, PRINT_LABELS, type PrintLabels } from "./labels";

/** ข้อมูลที่พิมพ์บนใบ (หน้าลูกค้าได้จาก backend เท่านี้พอดี ไม่มีข้อมูลภายใน) */
export type QuotationDocumentData = {
    quotation: Pick<
        Quotation,
        | "qt_number"
        | "qt_revision"
        | "qt_status"
        | "qt_title"
        | "qt_language"
        | "qt_payment_mode"
        | "qt_terms"
        | "qt_issue_date"
        | "qt_valid_until"
        | "qt_subtotal"
        | "qt_discount_amount"
        | "qt_after_discount"
        | "qt_vat_treatment"
        | "qt_vat_rate"
        | "qt_vat_amount"
        | "qt_total"
        | "qt_created_by_name"
        | "qt_created_by_title"
        | "qt_approved_by_name"
        | "qt_approved_by_title"
    >;
    currency: Pick<
        CurrencyInfo,
        "cur_code" | "cur_decimals" | "cur_unit_th" | "cur_subunit_th" | "cur_unit_en" | "cur_subunit_en"
    >;
    items: Pick<
        QuotationItem,
        | "qti_id"
        | "qti_type"
        | "qti_description"
        | "qti_quantity"
        | "qti_unit"
        | "qti_unit_price"
        | "qti_discount_amount"
        | "qti_amount"
    >[];
    milestones: Pick<QuotationMilestone, "qtm_id" | "qtm_name" | "qtm_percent" | "qtm_amount" | "qtm_condition">[];
    company: CompanySnapshot;
    client: Omit<ClientSnapshot, "client_id" | "client_country">;
    // ใบภายในของงาน Fastwork (S-5): พิมพ์ได้ แต่ไม่ใช่ใบที่ส่งลูกค้า (หน้าลูกค้าไม่มีใบแบบนี้)
    isFastworkInternal: boolean;
};

// กว้าง A4 บนจอ (210mm ที่ 96dpi) · จอแคบกว่านี้ย่อทั้งใบให้พอดีจอ
const A4_SCREEN_WIDTH_PX = 794;
const SCREEN_GUTTER_PX = 16;

// สถานะที่เป็นเอกสารทางการแล้ว (แสดงลายเซ็น ไม่มีลายน้ำร่าง)
const ISSUED_STATUSES = ["approved", "sent", "accepted", "declined", "expired", "cancelled", "superseded"];

function branchLabel(code: string | null, name: string | null, labels: PrintLabels) {
    if (!code) return "";
    return code === "00000" ? labels.headOffice : `${labels.branch} ${code}${name ? ` ${name}` : ""}`;
}

export default function QuotationDocument({
    data,
    renderSignature,
    toolbarNote,
}: {
    data: QuotationDocumentData;
    // รูปลายเซ็นของผู้เสนอ/ผู้อนุมัติ · null = เว้นช่องให้เซ็นมือ
    renderSignature: (signer: "creator" | "approver") => React.ReactNode;
    toolbarNote: React.ReactNode;
}) {
    const { quotation, currency, items, milestones, company, client, isFastworkInternal } = data;
    const [screenZoom, setScreenZoom] = useState(1);

    // ทั้งระบบตัดส่วนที่ล้นแนวนอน (overflow-x-clip) มือถือจึงเลื่อนดู A4 ไม่ได้ · ย่อทั้งใบให้พอดีจอแทน (ถ่างนิ้วซูมได้) · ตอนพิมพ์ใช้ขนาดจริง
    useEffect(() => {
        function fitScreen() {
            setScreenZoom(Math.min(1, (window.innerWidth - SCREEN_GUTTER_PX) / A4_SCREEN_WIDTH_PX));
        }
        fitScreen();
        window.addEventListener("resize", fitScreen);
        return () => window.removeEventListener("resize", fitScreen);
    }, []);
    const language = quotation.qt_language;
    const labels = PRINT_LABELS[language];
    const decimals = currency.cur_decimals;
    const isIssued = ISSUED_STATUSES.includes(quotation.qt_status);
    const isEnglish = language === "en";
    const companyName = (isEnglish && company.cs_name_en) || company.cs_name_th;
    const branch = company.branch;
    const companyAddress =
        (isEnglish ? branch?.branch_address_en || company.cs_address_en : branch?.branch_address_th) ||
        (isEnglish ? company.cs_address_en : company.cs_address_th) ||
        company.cs_address_th;
    const clientName = client.client_company || client.client_name;
    const hasVat = parseHundredths(quotation.qt_vat_rate, "VAT") > 0n;
    const isVatZero = quotation.qt_vat_treatment === "zero";
    const hasVatLine = hasVat || isVatZero;
    const hasDiscount = parseHundredths(quotation.qt_discount_amount, "ส่วนลด") > 0n;
    const numberText = quotation.qt_number
        ? `${quotation.qt_number}${quotation.qt_revision > 0 ? ` Rev.${quotation.qt_revision}` : ""}`
        : labels.notIssued;

    // ยอดรวมย่อยท้ายแต่ละหัวข้อ (หัวข้อถึงหัวข้อถัดไป) · พิมพ์เมื่อหัวข้อมีหลายแถวที่มีราคา (แถวเดียว = ยอดเท่ากับแถวนั้น ไม่พิมพ์ซ้ำ)
    // แถวในหัวข้อที่ราคา 0 = สิ่งที่รวมในชุด (เช่น "ดูแลบั๊ก 30 วัน") → ✓ ไม่มีเลขลำดับ ไม่พิมพ์ 0.00
    let itemNumber = 0;
    const rows: {
        kind: "heading" | "note" | "item" | "included" | "subtotal";
        key: string;
        item?: (typeof items)[number];
        number?: number;
        amount?: bigint;
        title?: string;
    }[] = [];
    let currentHeading: { title: string; sum: bigint; count: number } | null = null;
    const closeHeading = () => {
        if (currentHeading && currentHeading.count > 1) {
            rows.push({
                kind: "subtotal",
                key: `subtotal-${rows.length}`,
                amount: currentHeading.sum,
                title: currentHeading.title,
            });
        }
    };
    for (const item of items) {
        if (item.qti_type === "heading") {
            closeHeading();
            currentHeading = { title: item.qti_description, sum: 0n, count: 0 };
            rows.push({ kind: "heading", key: String(item.qti_id), item });
        } else if (item.qti_type === "note") {
            rows.push({ kind: "note", key: String(item.qti_id), item });
        } else if (
            currentHeading &&
            parseHundredths(item.qti_amount, "ยอด") === 0n &&
            parseHundredths(item.qti_unit_price ?? "0", "ราคา") === 0n
        ) {
            rows.push({ kind: "included", key: String(item.qti_id), item });
        } else {
            itemNumber += 1;
            if (currentHeading) {
                currentHeading.sum += parseHundredths(item.qti_amount, "ยอด");
                currentHeading.count += 1;
            }
            rows.push({ kind: "item", key: String(item.qti_id), item, number: itemNumber });
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
                <p className="text-sm text-gray-600">{toolbarNote}</p>
                <button type="button" className={buttonClass("primary", "md")} onClick={() => window.print()}>
                    <Printer size={16} />
                    พิมพ์ / บันทึก PDF
                </button>
            </div>

            {/* บนจอกว้างเท่า A4 เสมอ (บีบกระดาษแล้วหัวเอกสารล้น คำตัดกลางคำ) · จอแคบย่อทั้งใบด้วย zoom */}
            <div
                style={{ "--document-zoom": screenZoom } as React.CSSProperties}
                className="[zoom:var(--document-zoom)] print:[zoom:1]"
            >
                <article className="relative mx-auto w-[210mm] bg-white p-[12mm] text-[10.5pt] leading-relaxed text-gray-900 shadow-card print:w-auto print:p-0 print:shadow-none">
                    {!isIssued && (
                        <div className="pointer-events-none fixed inset-0 flex items-center justify-center print:fixed">
                            <span className="-rotate-30 text-[42pt] font-medium text-gray-300/60">
                                {labels.draftWatermark}
                            </span>
                        </div>
                    )}
                    {/* ใบภายในของงาน Fastwork (S-5): พิมพ์ได้ แต่ไม่ใช่ใบที่ส่งลูกค้า */}
                    {isFastworkInternal && (
                        <div className="pointer-events-none absolute top-40 right-16 -rotate-12 rounded-lg border-4 border-gray-500/70 px-6 py-2 text-center text-[20pt] font-medium text-gray-500/80">
                            เอกสารภายใน
                            <span className="block text-[10pt]">งาน Fastwork · ไม่ส่งลูกค้า</span>
                        </div>
                    )}
                    {quotation.qt_status === "cancelled" && (
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
                                {companyAddress && (
                                    <p className="whitespace-pre-line text-gray-700">{companyAddress}</p>
                                )}
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
                                <dd className="tabular-nums">{numberText}</dd>
                                <dt className="text-gray-500">{labels.date}</dt>
                                <dd>
                                    {quotation.qt_issue_date
                                        ? formatDocumentDate(quotation.qt_issue_date, language)
                                        : labels.notIssued}
                                </dd>
                                <dt className="text-gray-500">{labels.validUntil}</dt>
                                <dd>
                                    {quotation.qt_valid_until
                                        ? formatDocumentDate(quotation.qt_valid_until, language)
                                        : "-"}
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
                            <p className="text-gray-700">
                                {[
                                    client.client_phone && `${labels.phone} ${client.client_phone}`,
                                    client.client_email && `${labels.email} ${client.client_email}`,
                                ]
                                    .filter(Boolean)
                                    .join(" · ")}
                            </p>
                        </div>
                        <div className="grid content-start gap-0.5 text-right">
                            <p className="text-gray-500">{labels.currency}</p>
                            <p className="font-medium">{currency.cur_code}</p>
                        </div>
                    </section>
                    <p className="mt-3 text-[10pt]">
                        <span className="text-gray-500">{labels.subject}:</span> {quotation.qt_title}
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
                                                {row.item.qti_description}
                                            </td>
                                        </tr>
                                    )}
                                    {row.kind === "note" && row.item && (
                                        <tr className="print-row">
                                            <td />
                                            <td colSpan={5} className="py-0.5 whitespace-pre-line text-gray-600 italic">
                                                {row.item.qti_description}
                                            </td>
                                        </tr>
                                    )}
                                    {row.kind === "item" && row.item && (
                                        <tr className="print-row align-top">
                                            <td className="py-1 pl-1 tabular-nums">{row.number}</td>
                                            <td className="py-1 pr-2 whitespace-pre-line">
                                                {row.item.qti_description}
                                            </td>
                                            <td className="py-1 text-right tabular-nums">
                                                {formatQuantity(row.item.qti_quantity ?? "0")} {row.item.qti_unit ?? ""}
                                            </td>
                                            <td className="py-1 text-right tabular-nums">
                                                {formatAmount(row.item.qti_unit_price ?? "0", decimals)}
                                            </td>
                                            <td className="py-1 text-right tabular-nums">
                                                {parseHundredths(row.item.qti_discount_amount, "ส่วนลด") > 0n
                                                    ? formatAmount(row.item.qti_discount_amount, decimals)
                                                    : ""}
                                            </td>
                                            <td className="py-1 pr-1 text-right tabular-nums">
                                                {formatAmount(row.item.qti_amount, decimals)}
                                            </td>
                                        </tr>
                                    )}
                                    {row.kind === "included" && row.item && (
                                        <tr className="print-row align-top">
                                            <td />
                                            <td colSpan={5} className="py-0.5 pr-2 whitespace-pre-line text-gray-700">
                                                ✓ {row.item.qti_description}
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
                            ( {amountInWords(quotation.qt_total, currency, language)} )
                        </p>
                        <dl className="grid min-w-[70mm] grid-cols-[1fr_auto] gap-x-4 gap-y-0.5">
                            {/* ยอดที่เท่ารวมทั้งสิ้นไม่พิมพ์ซ้ำ: รวมเป็นเงิน (มีส่วนลด/VAT ตามมา) · หลังหักส่วนลด (มี VAT ตามมา) */}
                            {(hasDiscount || hasVatLine) && (
                                <>
                                    <dt>{labels.subtotal}</dt>
                                    <dd className="text-right tabular-nums">
                                        {formatAmount(quotation.qt_subtotal, decimals)}
                                    </dd>
                                </>
                            )}
                            {hasDiscount && (
                                <>
                                    <dt>{labels.billDiscount}</dt>
                                    <dd className="text-right tabular-nums">
                                        {formatAmount(quotation.qt_discount_amount, decimals)}
                                    </dd>
                                </>
                            )}
                            {hasDiscount && hasVatLine && (
                                <>
                                    <dt>{labels.afterDiscount}</dt>
                                    <dd className="text-right tabular-nums">
                                        {formatAmount(quotation.qt_after_discount, decimals)}
                                    </dd>
                                </>
                            )}
                            {hasVatLine && (
                                <>
                                    <dt>{isVatZero ? labels.vatZero : `${labels.vat} ${quotation.qt_vat_rate}%`}</dt>
                                    <dd className="text-right tabular-nums">
                                        {formatAmount(quotation.qt_vat_amount, decimals)}
                                    </dd>
                                </>
                            )}
                            <dt className="border-t border-gray-300 pt-1 font-medium">{labels.total}</dt>
                            <dd className="border-t border-gray-300 pt-1 text-right font-medium tabular-nums">
                                {formatAmount(quotation.qt_total, decimals)} {currency.cur_code}
                            </dd>
                        </dl>
                    </section>

                    {quotation.qt_payment_mode === "milestones" && milestones.length > 0 && (
                        <section className="print-row mt-4 text-[9.5pt]">
                            <p className="font-medium">{labels.milestones}</p>
                            <table className="mt-1 w-full">
                                <tbody>
                                    {milestones.map((milestone, index) => (
                                        <tr key={milestone.qtm_id}>
                                            <td className="py-0.5">
                                                {labels.milestone} {index + 1} {milestone.qtm_name}
                                                {milestone.qtm_percent ? ` (${milestone.qtm_percent}%)` : ""}
                                                {milestone.qtm_condition ? ` · ${milestone.qtm_condition}` : ""}
                                            </td>
                                            <td className="py-0.5 text-right tabular-nums">
                                                {formatAmount(milestone.qtm_amount, decimals)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </section>
                    )}

                    {quotation.qt_terms && (
                        <section className="print-row mt-4 text-[9.5pt]">
                            <p className="font-medium">{labels.terms}</p>
                            <p className="whitespace-pre-line text-gray-700">{quotation.qt_terms}</p>
                        </section>
                    )}

                    <section className="print-row mt-10 grid grid-cols-3 gap-6 text-center text-[9pt]">
                        <SignatureBox
                            title={labels.proposer}
                            name={quotation.qt_created_by_name}
                            role={quotation.qt_created_by_title}
                            signature={isIssued ? renderSignature("creator") : null}
                            dateLabel={labels.signDate}
                        />
                        <SignatureBox
                            title={labels.approver}
                            name={isIssued ? quotation.qt_approved_by_name : null}
                            role={isIssued ? quotation.qt_approved_by_title : null}
                            signature={isIssued ? renderSignature("approver") : null}
                            dateLabel={labels.signDate}
                            date={isIssued ? formatDocumentDate(quotation.qt_issue_date, language) : null}
                        />
                        <SignatureBox
                            title={labels.customerAccept}
                            name={null}
                            role={null}
                            signature={null}
                            dateLabel={labels.signDate}
                        />
                    </section>
                </article>
            </div>
        </div>
    );
}

// ช่องเซ็น: มีลายเซ็น (ฉบับที่บันทึกไว้ตอนส่ง/อนุมัติ) = แสดงรูปที่หน้าส่งมา · ไม่มี = เว้นช่องให้เซ็นมือ (ไม่บล็อกการอนุมัติ)
function SignatureBox({
    title,
    name,
    role,
    signature,
    dateLabel,
    date = null,
}: {
    title: string;
    name: string | null;
    role: string | null;
    signature: React.ReactNode;
    dateLabel: string;
    date?: string | null;
}) {
    return (
        <div className="grid gap-1">
            <div className="flex h-16 items-end justify-center">{signature}</div>
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
