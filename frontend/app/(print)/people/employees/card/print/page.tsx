"use client";

// พิมพ์บัตรพนักงาน (2026-10-18 · docs/plans/2026-10-18-employee-department-codes.md ข้อ 3.4 · T4-ก)
// ขนาดบัตรมาตรฐาน CR80 (54 × 85.6 มม. แนวตั้ง) หน้า-หลัง ทีละใบ · ข้อมูลบนบัตรเป็น snapshot ตอนออก (พิมพ์ซ้ำได้หน้าตาเดิม)
// กดพิมพ์บัตรที่ใช้อยู่ครั้งแรก = บันทึกว่าพิมพ์แล้ว (ออกจากคิวรอพิมพ์) · บัตรที่ยกเลิกแล้วพิมพ์ได้แต่มีตรา "ยกเลิก"
// QR มีแค่รหัสพนักงาน (ไม่ใส่เลขบัตรประชาชน/ข้อมูลส่วนตัว)
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import { Printer } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import StatusBanner from "@/components/ui/guidance/status-banner";
import { formatDateOnly } from "@/app/function";
import { apiFetch, uploadedFileUrl } from "@/lib/api";
import type { Employee, EmployeeCard } from "@/app/(protected)/people/_types";
import { nameInitial } from "@/app/(protected)/people/employees/_card-status";
import { BLUE_MESH_CLASS, CardParticles, LIGHT_GLOW_CLASS } from "./card-art";

type Company = {
    cs_name_th: string;
    cs_name_en: string | null;
    cs_address_th: string | null;
    cs_phone: string | null;
    cs_logo_url: string | null;
};

export default function EmployeeCardPrintPage() {
    return (
        <Suspense fallback={<p className="p-8 text-sm text-gray-500">กำลังเตรียมบัตร...</p>}>
            <EmployeeCardPrint />
        </Suspense>
    );
}

function EmployeeCardPrint() {
    const searchParams = useSearchParams();
    const employeeId = searchParams.get("id") ?? "";
    const cardId = Number(searchParams.get("card"));
    const [card, setCard] = useState<EmployeeCard | null>(null);
    const [company, setCompany] = useState<Company | null>(null);
    const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [printError, setPrintError] = useState<string | null>(null);

    useEffect(() => {
        let isLeftPage = false;
        Promise.all([
            apiFetch<Employee>(`/employees/${encodeURIComponent(employeeId)}`),
            apiFetch<{ company: Company }>("/company"),
        ]).then(async ([employeeResult, companyResult]) => {
            if (isLeftPage) return;
            if (employeeResult.error) {
                setLoadError(employeeResult.error.message);
                return;
            }
            if (companyResult.error) {
                setLoadError(companyResult.error.message);
                return;
            }
            const found = employeeResult.data.cards.find((item) => item.ec_id === cardId);
            if (!found) {
                setLoadError("ไม่พบบัตรใบนี้ กลับไปเปิดจากหน้าพนักงาน");
                return;
            }
            const dataUrl = await QRCode.toDataURL(found.ec_emp_code, { errorCorrectionLevel: "M", margin: 0, width: 240 });
            if (isLeftPage) return;
            setCard(found);
            setCompany(companyResult.data.company);
            setQrDataUrl(dataUrl);
        });
        return () => {
            isLeftPage = true;
        };
    }, [employeeId, cardId]);

    if (loadError) return <p className="p-8 text-sm text-red-600">{loadError}</p>;
    if (!card || !company || !qrDataUrl) return <p className="p-8 text-sm text-gray-500">กำลังเตรียมบัตร...</p>;

    const isVoided = Boolean(card.ec_voided_at);
    const isFirstPrint = !isVoided && !card.ec_printed_at;

    async function print() {
        if (!card) return;
        setPrintError(null);
        if (isFirstPrint) {
            const { error } = await apiFetch(`/employees/${encodeURIComponent(employeeId)}/cards/${card.ec_id}/printed`, {
                method: "POST",
            });
            if (error) {
                setPrintError(error.message);
                return;
            }
            setCard({ ...card, ec_printed_at: new Date().toISOString() });
        }
        window.print();
    }

    return (
        <div className="min-h-screen bg-gray-100 py-6 print:bg-white print:py-0">
            <style>{`
                @page { size: 54mm 85.6mm; margin: 0; }
                @media print {
                    .no-print { display: none !important; }
                    body { background: white; }
                    .card-face { box-shadow: none !important; border-radius: 0 !important; break-after: page; }
                    .card-face:last-child { break-after: auto; }
                }
                .card-face { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            `}</style>

            <div className="no-print mx-auto mb-6 grid max-w-xl gap-3 px-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-gray-600">
                        บัตรใบที่ {card.ec_seq} · {card.ec_name_th}
                    </p>
                    <button type="button" className={buttonClass("primary", "md")} onClick={print}>
                        <Printer size={16} />
                        พิมพ์บัตร
                    </button>
                </div>
                {isVoided ? (
                    <StatusBanner tone="warn" title="บัตรใบนี้ยกเลิกแล้ว">
                        {card.ec_void_reason ?? "ออกบัตรใบใหม่แทน"} · พิมพ์ได้เพื่อเก็บเป็นหลักฐาน บนบัตรมีตรา &quot;ยกเลิก&quot;
                    </StatusBanner>
                ) : (
                    <StatusBanner tone="info" title="ตั้งค่าเครื่องพิมพ์">
                        ขนาดกระดาษ CR80 (54 × 85.6 มม.) · ขอบ 0 · ขนาดจริง 100% · พิมพ์ 2 หน้า (หน้า 1 = ด้านหน้า หน้า 2 = ด้านหลัง)
                        {isFirstPrint ? " · กดพิมพ์แล้วบัตรออกจากคิวรอพิมพ์" : ` · พิมพ์ครั้งแรกเมื่อ ${formatDateOnly(card.ec_printed_at)}`}
                    </StatusBanner>
                )}
                {printError && (
                    <StatusBanner tone="error" title="บันทึกการพิมพ์ไม่สำเร็จ">
                        {printError}
                    </StatusBanner>
                )}
            </div>

            <div className="flex flex-wrap justify-center gap-6 print:block">
                <CardFront card={card} company={company} qrDataUrl={qrDataUrl} isVoided={isVoided} />
                <CardBack card={card} company={company} isVoided={isVoided} />
            </div>
        </div>
    );
}

const FACE_CLASS =
    "card-face relative flex h-[85.6mm] w-[54mm] flex-col overflow-hidden rounded-[3.2mm] shadow-lg";

function VoidStamp({ isVoided }: { isVoided: boolean }) {
    if (!isVoided) return null;
    return (
        <span className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
            <span className="-rotate-30 rounded-[1.5mm] border-[0.6mm] border-red-600 px-[3mm] py-[0.5mm] text-[16pt] font-medium tracking-widest text-red-600/80">
                ยกเลิก
            </span>
        </span>
    );
}

// ลายน้ำโลโก้บริษัทจางๆ (อยู่หลังเนื้อหา — เนื้อหาเป็น relative และมาทีหลังจึงอยู่ข้างบน)
function LogoWatermark({ company, className }: { company: Company; className: string }) {
    if (!company.cs_logo_url) return null;
    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={uploadedFileUrl(company.cs_logo_url)}
            alt=""
            aria-hidden="true"
            className={`pointer-events-none absolute object-contain ${className}`}
        />
    );
}

function CompanyMark({ company, isOnBlue }: { company: Company; isOnBlue: boolean }) {
    return (
        <span className="flex min-w-0 items-center gap-[1.6mm]">
            {company.cs_logo_url && (
                <span className="flex h-[6.5mm] w-[6.5mm] shrink-0 items-center justify-center rounded-[1.6mm] bg-white p-[0.6mm] shadow-sm">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={uploadedFileUrl(company.cs_logo_url)} alt="" className="max-h-full max-w-full object-contain" />
                </span>
            )}
            <span className="grid min-w-0 leading-tight">
                <span className="truncate text-[5.5pt] font-medium">{company.cs_name_th}</span>
                {company.cs_name_en && (
                    <span className={`truncate text-[4pt] tracking-wide ${isOnBlue ? "text-white/75" : "text-gray-500"}`}>
                        {company.cs_name_en}
                    </span>
                )}
            </span>
        </span>
    );
}

function CardFront({
    card,
    company,
    qrDataUrl,
    isVoided,
}: {
    card: EmployeeCard;
    company: Company;
    qrDataUrl: string;
    isVoided: boolean;
}) {
    return (
        <section className={`${FACE_CLASS} bg-white text-gray-900`} aria-label="ด้านหน้าบัตร">
            {/* แถบไล่สีฟ้าด้านบน (หลังโลโก้และครึ่งบนของรูป) */}
            <div className={`pointer-events-none absolute inset-x-0 top-0 h-[44mm] rounded-b-[7mm] ${BLUE_MESH_CLASS}`}>
                <CardParticles seed={`${card.ec_emp_code}-${card.ec_seq}-front`} width={54} height={44} count={26} intensity={0.75} />
            </div>
            <LogoWatermark company={company} className="-right-[13mm] bottom-[11mm] h-[38mm] w-[38mm] opacity-[0.045]" />

            <header className="relative flex items-center justify-between gap-[2mm] px-[3.5mm] pt-[3.5mm] text-white">
                <CompanyMark company={company} isOnBlue />
                <span className="shrink-0 rounded-full bg-white/15 px-[1.8mm] py-[0.4mm] text-[4pt] font-medium tracking-[0.2em] ring-[0.15mm] ring-white/35">
                    STAFF
                </span>
            </header>

            {/* รูปยืดเต็มที่ที่เหลือ — ชื่อยาวสองบรรทัดรูปเตี้ยลงเอง ไม่ดันส่วนอื่นตกขอบ */}
            <div className="relative mx-[3.5mm] mt-[3mm] min-h-0 flex-1 overflow-hidden rounded-[3mm] bg-blue-50 [background-image:radial-gradient(circle_at_30%_25%,rgba(59,130,246,0.3),transparent_70%)] shadow-lg ring-[0.7mm] ring-white">
                {card.ec_photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={uploadedFileUrl(card.ec_photo_url)}
                        alt=""
                        className="h-full w-full object-cover object-[50%_30%]"
                    />
                ) : (
                    <>
                        <CardParticles seed={`${card.ec_emp_code}-photo`} width={47} height={36} count={14} color="#2563eb" intensity={0.5} />
                        <span className="relative flex h-full items-center justify-center text-[30pt] font-medium text-blue-600">
                            {nameInitial(card.ec_name_th)}
                        </span>
                    </>
                )}
            </div>

            <div className="relative px-[3.5mm] pt-[2.5mm]">
                <p className="text-[9.5pt] leading-[1.15] font-medium">{card.ec_name_th}</p>
                {card.ec_name_en && <p className="text-[4.8pt] tracking-wide text-gray-500">{card.ec_name_en}</p>}
                {card.ec_position && (
                    <p className="mt-[1.2mm] flex items-center gap-[1mm] text-[5.3pt] font-medium text-blue-600">
                        <span className="h-[1.1mm] w-[1.1mm] shrink-0 rounded-full bg-blue-500" aria-hidden="true" />
                        {card.ec_position}
                    </p>
                )}
                <p className="text-[4.8pt] text-gray-500">
                    {card.ec_department_name ?? "-"}
                    {card.ec_branch_name ? ` · ${card.ec_branch_name}` : ""}
                </p>
            </div>

            <footer className="relative m-[3mm] mt-[2.5mm] flex items-center gap-[2mm] rounded-[2.5mm] bg-blue-50 p-[1.8mm] ring-[0.15mm] ring-blue-100">
                <span className="grid min-w-0 flex-1 gap-[0.4mm] leading-tight">
                    <span className="text-[4pt] text-gray-500">รหัสพนักงาน</span>
                    <span className="text-[6.5pt] font-medium text-gray-900 tabular-nums">{card.ec_emp_code}</span>
                    <span className="mt-[0.6mm] text-[4.5pt] text-gray-500">
                        ใช้ได้ถึง <span className="font-medium text-blue-600">{formatDateOnly(card.ec_expires_on)}</span>
                    </span>
                </span>
                <span className="shrink-0 rounded-[1.5mm] bg-white p-[0.8mm] shadow-sm">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qrDataUrl} alt={`QR รหัส ${card.ec_emp_code}`} className="h-[11mm] w-[11mm]" />
                </span>
            </footer>
            <VoidStamp isVoided={isVoided} />
        </section>
    );
}

function CardBack({ card, company, isVoided }: { card: EmployeeCard; company: Company; isVoided: boolean }) {
    return (
        <section className={`${FACE_CLASS} ${LIGHT_GLOW_CLASS} text-gray-900`} aria-label="ด้านหลังบัตร">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-[32mm]">
                <CardParticles
                    seed={`${card.ec_emp_code}-${card.ec_seq}-back`}
                    width={54}
                    height={32}
                    count={16}
                    color="#2563eb"
                    intensity={0.5}
                />
            </div>

            <LogoWatermark company={company} className="top-[46mm] left-1/2 h-[30mm] w-[30mm] -translate-x-1/2 opacity-[0.07]" />
            <div className="relative flex flex-1 flex-col px-[4mm] pt-[3.5mm]">
                <CompanyMark company={company} isOnBlue={false} />
                <p className="mt-[5mm] text-[4pt] font-medium tracking-[0.25em] text-blue-600">EMPLOYEE ID CARD</p>
                <p className="text-[9pt] leading-tight font-medium">บัตรพนักงาน</p>
                <p className="mt-[1.5mm] text-[5pt] leading-snug text-gray-600">
                    บัตรนี้เป็นทรัพย์สินของบริษัท ใช้แสดงตัวระหว่างปฏิบัติงานเท่านั้น ห้ามให้ผู้อื่นใช้แทน · พ้นสภาพพนักงานหรือได้บัตรใหม่{" "}
                    <span className="whitespace-nowrap">ต้องคืนบัตรนี้</span>
                </p>
                <div className="mt-[3mm] grid gap-[0.5mm] rounded-[2.5mm] bg-gray-50 p-[2.5mm] text-[5pt] leading-snug text-gray-600 ring-[0.15mm] ring-gray-200">
                    <p className="font-medium text-gray-900">หากพบบัตรนี้ โปรดส่งคืน</p>
                    <p>{company.cs_name_th}</p>
                    {company.cs_address_th && <p className="whitespace-pre-line">{company.cs_address_th}</p>}
                    {company.cs_phone && <p className="tabular-nums">โทร {company.cs_phone}</p>}
                </div>
                <div className="mt-auto mb-[3mm] grid gap-[0.6mm]">
                    <span className="h-[7mm] border-b-[0.2mm] border-gray-300" />
                    <span className="text-[4.5pt] text-gray-500">ลายมือชื่อผู้ถือบัตร</span>
                </div>
            </div>

            <footer
                className={`relative flex items-center justify-between gap-[2mm] px-[4mm] py-[2.2mm] text-[4.5pt] text-white/90 tabular-nums ${BLUE_MESH_CLASS}`}
            >
                <span>บัตรใบที่ {card.ec_seq}</span>
                <span className="tracking-wide">{card.ec_emp_code}</span>
                <span>ออก {formatDateOnly(card.ec_issued_at)}</span>
            </footer>
            <VoidStamp isVoided={isVoided} />
        </section>
    );
}
