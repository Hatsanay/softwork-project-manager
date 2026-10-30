"use client";

// 50 ทวิ ประจำปีของพนักงาน (แบบ ภ.ง.ด.1ก — ขั้น 4-5) · 2 ฉบับต่อคน
// ?year=&employee_id= (ฝ่ายบุคคล — คนเดียว) · ?year= (ทุกคนที่มีเงินได้) · ?year=&mine=1 (ของตัวเอง)
// ตัวเลขจากรอบที่จ่ายแล้ว + ยอดยกมาของบริษัทนี้ · เลขอ้างอิง = ปี/รหัสพนักงาน
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { formatAmount } from "@/lib/shared/money.mjs";
import { amountInWords } from "@/lib/shared/amount-in-words.mjs";
import type { AnnualCertificates } from "@/app/(protected)/people/_types";
import { Checkbox, COPIES, FORM_ROWS, PENALTY_NOTE, THAI_BAHT_WORDS } from "../../../../_components/wht-form-parts";
import PrintShell from "../../_print-shell";

type Certificate = AnnualCertificates["certificates"][number];

function CertificateCopy({
    certificate,
    company,
    year,
    copy,
}: {
    certificate: Certificate;
    company: AnnualCertificates["company"];
    year: number;
    copy: (typeof COPIES)[number];
}) {
    const taxYear = `ปีภาษี ${year + 543}`;
    return (
        <article className="mx-auto mb-6 w-full max-w-[210mm] break-after-page bg-white p-[10mm] text-[9pt] leading-snug text-gray-900 shadow-card print:mb-0 print:max-w-none print:p-0 print:shadow-none">
            <header className="flex items-start justify-between gap-4">
                <div>
                    <p className="font-medium">{copy.title}</p>
                    <p className="text-[8pt] text-gray-600">{copy.note}</p>
                </div>
                <p className="text-right">
                    เลขที่ <span className="tabular-nums">{certificate.reference}</span>
                </p>
            </header>
            <h1 className="mt-2 text-center text-[12pt] font-medium">หนังสือรับรองการหักภาษี ณ ที่จ่าย</h1>
            <p className="text-center">ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร</p>

            <section className="mt-2 rounded border border-gray-500 p-2">
                <p className="font-medium">ผู้มีหน้าที่หักภาษี ณ ที่จ่าย</p>
                <p className="flex flex-wrap justify-between gap-x-4">
                    <span>ชื่อ {company.name}</span>
                    <span>เลขประจำตัวผู้เสียภาษีอากร {company.tax_id ?? "-"}</span>
                </p>
                <p>ที่อยู่ {company.address ?? ""}</p>
            </section>

            <section className="mt-2 rounded border border-gray-500 p-2">
                <p className="font-medium">ผู้ถูกหักภาษี ณ ที่จ่าย</p>
                <p className="flex flex-wrap justify-between gap-x-4">
                    <span>ชื่อ {certificate.full_name}</span>
                    <span>เลขประจำตัวผู้เสียภาษีอากร {certificate.national_id ?? "-"}</span>
                </p>
                <p>ที่อยู่ {certificate.address ?? ""}</p>
                <p className="mt-1 flex flex-wrap gap-x-5 gap-y-1">
                    <span>ลำดับที่ในแบบ</span>
                    <Checkbox checked label="(1) ภ.ง.ด.1ก" />
                    <Checkbox checked={false} label="(2) ภ.ง.ด.1ก พิเศษ" />
                    <Checkbox checked={false} label="(3) ภ.ง.ด.2" />
                    <Checkbox checked={false} label="(4) ภ.ง.ด.3" />
                    <Checkbox checked={false} label="(5) ภ.ง.ด.2ก" />
                    <Checkbox checked={false} label="(6) ภ.ง.ด.3ก" />
                    <Checkbox checked={false} label="(7) ภ.ง.ด.53" />
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
                    {FORM_ROWS.map(({ row, label }) => (
                        <tr key={row} className="align-top">
                            <td className="border border-gray-500 p-1">{label}</td>
                            <td className="border border-gray-500 p-1 text-center">{row === 1 ? taxYear : ""}</td>
                            <td className="border border-gray-500 p-1 text-right tabular-nums">
                                {row === 1 ? formatAmount(certificate.income) : ""}
                            </td>
                            <td className="border border-gray-500 p-1 text-right tabular-nums">
                                {row === 1 ? formatAmount(certificate.tax) : ""}
                            </td>
                        </tr>
                    ))}
                    <tr className="font-medium">
                        <td className="border border-gray-500 p-1 text-right" colSpan={2}>
                            รวมเงินที่จ่ายและภาษีที่หักนำส่ง
                        </td>
                        <td className="border border-gray-500 p-1 text-right tabular-nums">
                            {formatAmount(certificate.income)}
                        </td>
                        <td className="border border-gray-500 p-1 text-right tabular-nums">
                            {formatAmount(certificate.tax)}
                        </td>
                    </tr>
                    <tr>
                        <td className="border border-gray-500 p-1" colSpan={4}>
                            รวมเงินภาษีที่หักนำส่ง (ตัวอักษร){" "}
                            <span className="font-medium">
                                ( {amountInWords(certificate.tax, THAI_BAHT_WORDS, "th")} )
                            </span>
                        </td>
                    </tr>
                </tbody>
            </table>

            <p className="mt-2 rounded border border-gray-500 p-2">
                เงินที่จ่ายเข้า กองทุนประกันสังคม{" "}
                <span className="font-medium tabular-nums">{formatAmount(certificate.sso)}</span> บาท
            </p>

            <section className="mt-2 flex flex-wrap gap-x-6 gap-y-1 rounded border border-gray-500 p-2">
                <span>ผู้จ่ายเงิน</span>
                <Checkbox checked label="(1) หัก ณ ที่จ่าย" />
                <Checkbox checked={false} label="(2) ออกให้ตลอดไป" />
                <Checkbox checked={false} label="(3) ออกให้ครั้งเดียว" />
                <Checkbox checked={false} label="(4) อื่นๆ" />
            </section>

            <section className="mt-2 grid grid-cols-[1fr_auto] gap-6 rounded border border-gray-500 p-3">
                <p className="text-[8.5pt] text-gray-700">{PENALTY_NOTE}</p>
                <div className="grid min-w-[75mm] gap-1 text-center">
                    <p>ขอรับรองว่าข้อความและตัวเลขดังกล่าวข้างต้นถูกต้องตรงกับความจริงทุกประการ</p>
                    <div className="h-10" />
                    <p>ลงชื่อ ................................................ ผู้จ่ายเงิน</p>
                    <p>......../......../........</p>
                    <p className="text-[8pt] text-gray-600">
                        (วัน เดือน ปี ที่ออกหนังสือรับรอง) · ประทับตรานิติบุคคล (ถ้ามี)
                    </p>
                </div>
            </section>
        </article>
    );
}

export default function AnnualCertificatesPrintPage() {
    return (
        <Suspense fallback={<p className="p-8 text-sm text-gray-500">กำลังเตรียมหน้าพิมพ์...</p>}>
            <CertificatesContent />
        </Suspense>
    );
}

function CertificatesContent() {
    const searchParams = useSearchParams();
    const year = searchParams.get("year") ?? "";
    const employeeId = searchParams.get("employee_id");
    const isMine = searchParams.get("mine") === "1";
    const [data, setData] = useState<AnnualCertificates | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        let isLeftPage = false;
        const query = new URLSearchParams({ year });
        if (employeeId) query.set("employee_id", employeeId);
        const path = isMine ? `/payroll/my-certificates?${query}` : `/payroll/reports/certificates?${query}`;
        apiFetch<AnnualCertificates>(path).then(({ data: result, error }) => {
            if (isLeftPage) return;
            setData(result);
            setLoadError(error?.message ?? null);
        });
        return () => {
            isLeftPage = true;
        };
    }, [year, employeeId, isMine]);

    if (loadError) return <p className="p-8 text-sm text-red-600">{loadError}</p>;
    if (!data) return <p className="p-8 text-sm text-gray-500">กำลังเตรียมหน้าพิมพ์...</p>;
    if (data.certificates.length === 0) {
        return <p className="p-8 text-sm text-gray-600">ยังไม่มีเงินได้ที่จ่ายแล้วในปีนี้ · ยังออก 50 ทวิ ไม่ได้</p>;
    }

    const warnings = [
        ...(data.unpaid_runs.length > 0 ? [`รอบที่ยังไม่บันทึกจ่าย (ไม่นับ): ${data.unpaid_runs.join(", ")}`] : []),
        ...data.certificates
            .filter((certificate) => !certificate.national_id)
            .map((certificate) => `${certificate.emp_code} ไม่มีเลขประจำตัวประชาชน`),
    ];

    return (
        <PrintShell
            hint={`พิมพ์ 2 ฉบับต่อคน (${data.certificates.length} คน) · ออกหลังจ่ายเงินเดือนเดือนสุดท้ายของปี · กระดาษ A4`}
            warnings={warnings}
        >
            {data.certificates.flatMap((certificate) =>
                COPIES.map((copy) => (
                    <CertificateCopy
                        key={`${certificate.reference}-${copy.title}`}
                        certificate={certificate}
                        company={data.company}
                        year={data.year}
                        copy={copy}
                    />
                )),
            )}
        </PrintShell>
    );
}
