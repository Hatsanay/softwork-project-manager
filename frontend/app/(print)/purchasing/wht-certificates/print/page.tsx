"use client";

// หน้าพิมพ์หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ) A4 (2026-10-16 ขั้น 2-4) — ตามแบบกรมสรรพากร
// พิมพ์ 2 ฉบับต่อเนื่อง: ฉบับที่ 1 ให้ผู้ถูกหัก (แนบแบบแสดงรายการภาษี) · ฉบับที่ 2 ผู้หักเก็บเป็นหลักฐาน
// ข้อมูลบริษัท/ผู้รับใช้ snapshot ณ วันจ่ายเสมอ · ฉบับที่ยกเลิกมีตรายกเลิก · แถวเงินได้ 1–6 ตามแบบ (แถวที่ไม่มีเว้นว่าง)
// รูปแบบเลขที่/เล่มที่ และไฟล์ยื่นออนไลน์ ต้องยืนยันกับนักบัญชี (คำถาม X5)
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Printer } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { formatAmount } from "@/lib/shared/money.mjs";
import { amountInWords } from "@/lib/shared/amount-in-words.mjs";
import type { Certificate } from "@/app/(protected)/purchasing/payments/_types";
import { formatDocumentDate } from "../../../sales/quotations/print/labels";
import { Checkbox, COPIES, FORM_ROWS, PENALTY_NOTE, THAI_BAHT_WORDS } from "../../../_components/wht-form-parts";

function addressOf(snapshot: { branch?: { branch_address_th: string | null } | null; cs_address_th?: string | null }) {
    return snapshot.branch?.branch_address_th || snapshot.cs_address_th || "";
}

function CertificateCopy({ certificate, copy }: { certificate: Certificate; copy: (typeof COPIES)[number] }) {
    const payer = certificate.wt_payer_snapshot;
    const payee = certificate.wt_payee_snapshot;
    const paymentDate = formatDocumentDate(certificate.wt_payment_date, "th");
    const linesByRow = new Map<number, Certificate["lines"]>();
    for (const line of certificate.lines) {
        linesByRow.set(line.wtl_form_row, [...(linesByRow.get(line.wtl_form_row) ?? []), line]);
    }

    return (
        <article className="relative mx-auto w-[210mm] break-after-page bg-white p-[12mm] text-[9.5pt] leading-snug text-gray-900 shadow-card print:w-auto print:p-0 print:shadow-none [&:not(:first-child)]:mt-6 print:[&:not(:first-child)]:mt-0">
            {certificate.wt_status === "cancelled" && (
                <div className="pointer-events-none absolute top-48 right-16 -rotate-12 rounded-lg border-4 border-red-600/70 px-6 py-2 text-[28pt] font-medium text-red-600/70">
                    ยกเลิก
                </div>
            )}
            <header className="flex items-start justify-between gap-4">
                <div className="text-[8.5pt] text-gray-700">
                    <p className="font-medium">{copy.title}</p>
                    <p>{copy.note}</p>
                </div>
                <div className="text-right text-[9pt]">
                    <p>
                        เล่มที่ <span className="tabular-nums">{certificate.wt_book_no}</span>
                    </p>
                    <p>
                        เลขที่ <span className="tabular-nums">{certificate.wt_sequence}</span>
                    </p>
                </div>
            </header>
            <div className="mt-2 text-center">
                <p className="text-[13pt] font-medium">หนังสือรับรองการหักภาษี ณ ที่จ่าย</p>
                <p>ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร</p>
            </div>

            <section className="mt-3 grid gap-1 rounded border border-gray-500 p-2">
                <p className="font-medium">ผู้มีหน้าที่หักภาษี ณ ที่จ่าย</p>
                <p>
                    ชื่อ {payer.cs_name_th}
                    <span className="float-right">เลขประจำตัวผู้เสียภาษีอากร {payer.cs_tax_id ?? "-"}</span>
                </p>
                <p>ที่อยู่ {addressOf(payer)}</p>
            </section>

            <section className="mt-2 grid gap-1 rounded border border-gray-500 p-2">
                <p className="font-medium">ผู้ถูกหักภาษี ณ ที่จ่าย</p>
                <p>
                    ชื่อ {payee.vd_name}
                    <span className="float-right">เลขประจำตัวผู้เสียภาษีอากร {payee.vd_tax_id ?? "-"}</span>
                </p>
                <p>
                    ที่อยู่ {payee.vd_address ?? "-"}
                    {payee.vd_type === "juristic" && payee.vd_branch_code
                        ? ` (${payee.vd_branch_code === "00000" ? "สำนักงานใหญ่" : `สาขา ${payee.vd_branch_code}`})`
                        : ""}
                </p>
                <p className="mt-1 flex flex-wrap gap-x-5 gap-y-1">
                    <span>ลำดับที่ในแบบ</span>
                    <Checkbox checked={false} label="(1) ภ.ง.ด.1ก" />
                    <Checkbox checked={false} label="(2) ภ.ง.ด.1ก พิเศษ" />
                    <Checkbox checked={false} label="(3) ภ.ง.ด.2" />
                    <Checkbox checked={certificate.wt_form === "PND3"} label="(4) ภ.ง.ด.3" />
                    <Checkbox checked={false} label="(5) ภ.ง.ด.2ก" />
                    <Checkbox checked={false} label="(6) ภ.ง.ด.3ก" />
                    <Checkbox checked={certificate.wt_form === "PND53"} label="(7) ภ.ง.ด.53" />
                </p>
            </section>

            <table className="mt-2 w-full border-collapse border border-gray-500 text-[8.5pt]">
                <thead>
                    <tr className="bg-gray-50">
                        <th className="border border-gray-500 p-1 text-left font-medium">
                            ประเภทเงินได้พึงประเมินที่จ่าย
                        </th>
                        <th className="w-28 border border-gray-500 p-1 font-medium">วัน เดือน หรือปีภาษี ที่จ่าย</th>
                        <th className="w-28 border border-gray-500 p-1 font-medium">จำนวนเงินที่จ่าย</th>
                        <th className="w-28 border border-gray-500 p-1 font-medium">ภาษีที่หักและนำส่งไว้</th>
                    </tr>
                </thead>
                <tbody>
                    {FORM_ROWS.map(({ row, label }) => {
                        const lines = linesByRow.get(row) ?? [];
                        return (
                            <tr key={row} className="align-top">
                                <td className="border border-gray-500 p-1">
                                    <p>{label}</p>
                                    {lines.map((line) => (
                                        <p key={line.wtl_id} className="pl-3 text-gray-700">
                                            ({line.wtl_form_label} อัตรา {Number(line.wtl_rate)}%)
                                        </p>
                                    ))}
                                </td>
                                <td className="border border-gray-500 p-1 text-center">
                                    {lines.length > 0 ? paymentDate : ""}
                                </td>
                                <td className="border border-gray-500 p-1 text-right tabular-nums">
                                    {lines.map((line) => (
                                        <p key={line.wtl_id}>{formatAmount(line.wtl_paid_amount)}</p>
                                    ))}
                                </td>
                                <td className="border border-gray-500 p-1 text-right tabular-nums">
                                    {lines.map((line) => (
                                        <p key={line.wtl_id}>{formatAmount(line.wtl_tax_amount)}</p>
                                    ))}
                                </td>
                            </tr>
                        );
                    })}
                    <tr className="font-medium">
                        <td className="border border-gray-500 p-1 text-right" colSpan={2}>
                            รวมเงินที่จ่ายและภาษีที่หักนำส่ง
                        </td>
                        <td className="border border-gray-500 p-1 text-right tabular-nums">
                            {formatAmount(certificate.wt_total_paid)}
                        </td>
                        <td className="border border-gray-500 p-1 text-right tabular-nums">
                            {formatAmount(certificate.wt_total_tax)}
                        </td>
                    </tr>
                    <tr>
                        <td className="border border-gray-500 p-1" colSpan={4}>
                            รวมเงินภาษีที่หักนำส่ง (ตัวอักษร){" "}
                            <span className="font-medium">
                                ( {amountInWords(certificate.wt_total_tax, THAI_BAHT_WORDS, "th")} )
                            </span>
                        </td>
                    </tr>
                </tbody>
            </table>

            <section className="mt-2 flex flex-wrap gap-x-6 gap-y-1 rounded border border-gray-500 p-2">
                <span>ผู้จ่ายเงิน</span>
                <Checkbox checked label="(1) หัก ณ ที่จ่าย" />
                <Checkbox checked={false} label="(2) ออกให้ตลอดไป" />
                <Checkbox checked={false} label="(3) ออกให้ครั้งเดียว" />
                <Checkbox checked={false} label="(4) อื่นๆ" />
            </section>

            <section className="mt-2 grid grid-cols-[1fr_auto] gap-6 rounded border border-gray-500 p-3">
                <div className="grid gap-1 text-[8.5pt] text-gray-700">
                    <p>
                        อ้างอิงใบสำคัญจ่าย {certificate.pv_number} · หนังสือรับรองเลขที่ {certificate.wt_number}
                    </p>
                    <p>{PENALTY_NOTE}</p>
                </div>
                <div className="grid min-w-[75mm] gap-1 text-center">
                    <p>ขอรับรองว่าข้อความและตัวเลขดังกล่าวข้างต้นถูกต้องตรงกับความจริงทุกประการ</p>
                    <div className="h-10" />
                    <p>ลงชื่อ ................................................ ผู้จ่ายเงิน</p>
                    <p>{paymentDate}</p>
                    <p className="text-[8pt] text-gray-600">
                        (วัน เดือน ปี ที่ออกหนังสือรับรอง) · ประทับตรานิติบุคคล (ถ้ามี)
                    </p>
                </div>
            </section>
        </article>
    );
}

export default function CertificatePrintPage() {
    const certificateId = useSearchParams().get("id");
    const [certificate, setCertificate] = useState<Certificate | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        if (!certificateId) return;
        let isLeftPage = false;
        apiFetch<Certificate>(`/wht-certificates/${certificateId}`).then(({ data, error }) => {
            if (isLeftPage) return;
            setCertificate(data);
            setLoadError(error?.message ?? null);
        });
        return () => {
            isLeftPage = true;
        };
    }, [certificateId]);

    if (!certificateId || loadError)
        return <p className="p-8 text-sm text-red-600">{loadError ?? "ไม่พบหนังสือรับรองนี้"}</p>;
    if (!certificate) return <p className="p-8 text-sm text-gray-500">กำลังเตรียมหน้าพิมพ์...</p>;

    return (
        <div className="min-h-screen bg-gray-100 py-6 print:bg-white print:py-0">
            <style>{`
                @page { size: A4; margin: 10mm 12mm; }
                @media print { .no-print { display: none !important; } body { background: white; } }
            `}</style>
            <div className="no-print mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-2 px-4">
                <p className="text-sm text-gray-600">
                    พิมพ์ 2 ฉบับ (ฉบับที่ 1 ส่งผู้รับ · ฉบับที่ 2 เก็บไว้) · กระดาษ A4 · ปิด
                    &quot;ส่วนหัวและส่วนท้าย&quot; ของเบราว์เซอร์
                </p>
                <button type="button" className={buttonClass("primary", "md")} onClick={() => window.print()}>
                    <Printer size={16} />
                    พิมพ์ / บันทึก PDF
                </button>
            </div>
            {COPIES.map((copy) => (
                <CertificateCopy key={copy.title} certificate={certificate} copy={copy} />
            ))}
        </div>
    );
}
