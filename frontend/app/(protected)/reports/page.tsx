"use client";

// รายงานขาย (2026-10-15 ขั้น 1D-2 — docs/plans/2026-10-15-finance-1d.md หัวข้อ 3.2) · สิทธิ์ salesReports (D3)
// ยอดขาย = ยอดก่อน VAT ของใบแจ้งหนี้ที่ออก (D4) คู่กับเงินรับจริง · ทุกยอดเป็นบาท · ตัวเลขทั้งหมดคำนวณใน backend
// "วันนี้" ใช้ค่าจาก backend (เวลาไทย) ไม่ใช้นาฬิกาเครื่องผู้ใช้
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChartColumn, FileSpreadsheet, Trophy } from "lucide-react";
import PageHeader from "@/components/ui/page-header";
import SectionCard from "@/components/ui/section-card";
import Segmented from "@/components/ui/segmented";
import StatusBanner from "@/components/ui/guidance/status-banner";
import FieldHint from "@/components/ui/guidance/field-hint";
import FormField, { inputClass } from "@/components/ui/form-field";
import { CARD_CLASS } from "@/components/ui/card";
import { PageSkeleton } from "@/components/ui/skeleton";
import { formatDateOnly } from "@/app/function";
import { apiFetch, apiFetchBlob, type ApiError } from "@/lib/api";
import { buttonClass } from "@/components/ui/button";
import { formatAmount, parseHundredths } from "@/lib/shared/money.mjs";

type Preset = "this_month" | "last_month" | "this_quarter" | "this_year" | "custom";

type SalesSummary = {
    range: { from: string; to: string };
    billed: { invoice_count: number; amount_thb: string; amount_with_vat_thb: string };
    credited: { credit_note_count: number; amount_thb: string; amount_with_vat_thb: string };
    net_sales: { amount_thb: string; amount_with_vat_thb: string };
    refunds: { refund_count: number; refunded_thb: string };
    // งาน Fastwork (P-1): ราคางวดของเงินที่เข้าในช่วง · รายได้รวม = ยอดขายสุทธิ + ราคางวด Fastwork
    fastwork: { payout_count: number; gross_thb: string; fee_thb: string; wht_thb: string; net_thb: string };
    total_income: { amount_thb: string };
    received: {
        receipt_count: number;
        received_thb: string;
        withholding_thb: string;
        fee_thb: string;
        settled_thb: string;
    };
    quotations: {
        accepted_count: number;
        accepted_thb: string;
        declined_count: number;
        expired_count: number;
        win_rate_percent: number | null;
    };
    top_clients: {
        client_id: string;
        client_name: string;
        client_company: string | null;
        invoice_count: number;
        billed_thb: string;
        outstanding_thb: string;
    }[];
    outstanding_now: { outstanding_thb: string; overdue_thb: string };
};

type MonthlySales = { months: { month: string; billed_thb: string; received_thb: string }[]; today: string };

const PRESETS: { value: Preset; label: string }[] = [
    { value: "this_month", label: "เดือนนี้" },
    { value: "last_month", label: "เดือนก่อน" },
    { value: "this_quarter", label: "ไตรมาสนี้" },
    { value: "this_year", label: "ปีนี้" },
    { value: "custom", label: "กำหนดเอง" },
];

const THAI_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

function pad(value: number) {
    return String(value).padStart(2, "0");
}

// วันสุดท้ายของเดือน (month 1–12) — คิดจากปฏิทิน UTC ไม่ขึ้นกับเขตเวลาเครื่อง
function lastDayOf(year: number, month: number) {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** ช่วงวันที่ของตัวเลือก โดยยึด "วันนี้" ของ backend */
function rangeOf(preset: Exclude<Preset, "custom">, today: string) {
    const [year, month] = today.split("-").map(Number);
    switch (preset) {
        case "this_month":
            return { from: `${year}-${pad(month)}-01`, to: today };
        case "last_month": {
            const lastYear = month === 1 ? year - 1 : year;
            const lastMonth = month === 1 ? 12 : month - 1;
            return {
                from: `${lastYear}-${pad(lastMonth)}-01`,
                to: `${lastYear}-${pad(lastMonth)}-${pad(lastDayOf(lastYear, lastMonth))}`,
            };
        }
        case "this_quarter": {
            const quarterStart = Math.floor((month - 1) / 3) * 3 + 1;
            return { from: `${year}-${pad(quarterStart)}-01`, to: today };
        }
        default:
            return { from: `${year}-01-01`, to: today };
    }
}

function monthLabel(month: string) {
    const [year, monthNumber] = month.split("-").map(Number);
    return `${THAI_MONTHS[monthNumber - 1]} ${String(year + 543).slice(2)}`;
}

function SummaryCard({
    label,
    value,
    detail,
    href,
}: {
    label: string;
    value: string;
    detail?: React.ReactNode;
    href?: string;
}) {
    const content = (
        <>
            <span className="text-xs text-gray-500">{label}</span>
            <span className="text-xl font-medium text-gray-900 tabular-nums">{value}</span>
            {detail && <span className="text-xs text-gray-500">{detail}</span>}
        </>
    );
    return href ? (
        <Link href={href} className={`grid content-start gap-1 p-4 hover:border-blue-300 ${CARD_CLASS}`}>
            {content}
        </Link>
    ) : (
        <div className={`grid content-start gap-1 p-4 ${CARD_CLASS}`}>{content}</div>
    );
}

// กราฟแท่ง 12 เดือน (ออกบิล vs รับชำระ) วาดด้วย CSS — มือถือเลื่อนซ้ายขวาในกรอบ
function MonthlyChart({ months }: { months: MonthlySales["months"] }) {
    // จอแคบ: เปิดมาที่เดือนล่าสุด (ขวาสุด) ไม่ใช่เดือนเก่าสุด
    const scroller = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth;
    }, [months]);
    const values = months.flatMap((row) => [
        parseHundredths(row.billed_thb, "ยอด"),
        parseHundredths(row.received_thb, "ยอด"),
    ]);
    const maximum = values.reduce((max, value) => (value > max ? value : max), 0n);
    const heightOf = (value: string) => {
        if (maximum === 0n) return 0;
        return Number((parseHundredths(value, "ยอด") * 1000n) / maximum) / 10;
    };
    return (
        <div className="grid gap-3">
            <div className="flex flex-wrap gap-4 text-xs text-gray-600">
                <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-blue-500" /> ออกบิลสุทธิ (ก่อน VAT หักใบลดหนี้แล้ว)
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-green-500" /> รับชำระ
                </span>
            </div>
            <div ref={scroller} className="overflow-x-auto">
                <div className="flex h-48 min-w-160 items-end gap-2 border-b border-gray-200">
                    {months.map((row) => (
                        <div key={row.month} className="flex h-full flex-1 items-end justify-center gap-0.5">
                            <div
                                className="w-3 rounded-t bg-blue-500"
                                style={{ height: `${heightOf(row.billed_thb)}%` }}
                                aria-label={`ออกบิลสุทธิ ${formatAmount(row.billed_thb)} บาท`}
                            />
                            <div
                                className="w-3 rounded-t bg-green-500"
                                style={{ height: `${heightOf(row.received_thb)}%` }}
                                aria-label={`รับชำระ ${formatAmount(row.received_thb)} บาท`}
                            />
                        </div>
                    ))}
                </div>
                <div className="flex min-w-160 gap-2 pt-1.5">
                    {months.map((row) => (
                        <span key={row.month} className="flex-1 text-center text-[11px] text-gray-500">
                            {monthLabel(row.month)}
                        </span>
                    ))}
                </div>
            </div>
            <details className="text-sm">
                <summary className="-my-2 cursor-pointer py-2 text-blue-600">ดูตัวเลขรายเดือน</summary>
                <table className="mt-2 w-full text-sm">
                    <thead>
                        <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                            <th className="py-1.5 font-normal">เดือน</th>
                            <th className="py-1.5 text-right font-normal">ออกบิลสุทธิ</th>
                            <th className="py-1.5 text-right font-normal">รับชำระ</th>
                        </tr>
                    </thead>
                    <tbody>
                        {months.map((row) => (
                            <tr key={row.month} className="border-b border-gray-100">
                                <td className="py-1.5">{monthLabel(row.month)}</td>
                                <td className="py-1.5 text-right tabular-nums">{formatAmount(row.billed_thb)}</td>
                                <td className="py-1.5 text-right tabular-nums">{formatAmount(row.received_thb)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </details>
        </div>
    );
}

// ไฟล์ Excel ส่งนักบัญชีรายเดือน (1D-3) — โหลดด้วย token แล้วบันทึกเป็นไฟล์ (ลิงก์ตรงแนบ token ไม่ได้)
function AccountingExportCard({ today }: { today: string }) {
    const [year, month] = today.split("-").map(Number);
    const previous = month === 1 ? `${year - 1}-12` : `${year}-${pad(month - 1)}`;
    const [exportMonth, setExportMonth] = useState(previous);
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadError, setDownloadError] = useState<string | null>(null);

    async function download() {
        setDownloadError(null);
        setIsDownloading(true);
        const blob = await apiFetchBlob(`/reports/accounting-export?month=${encodeURIComponent(exportMonth)}`);
        setIsDownloading(false);
        if (!blob) {
            setDownloadError("ดาวน์โหลดไม่สำเร็จ — ตรวจเดือนที่เลือก แล้วลองใหม่ (ถ้ายังไม่ได้ ให้แจ้งผู้ดูแลระบบ)");
            return;
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `softwork-บัญชี-${exportMonth}.xlsx`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }

    return (
        <SectionCard
            icon={FileSpreadsheet}
            title="ไฟล์ส่งนักบัญชี"
            description="Excel 10 ชีต: สรุป · ใบแจ้งหนี้ · ใบลดหนี้ · ใบเสร็จ · หัก ณ ที่จ่าย · ลูกหนี้ ณ สิ้นเดือน · เอกสารที่ยกเลิกในเดือน · ค่าใช้จ่าย · ใบสำคัญจ่าย · หัก ณ ที่จ่าย (บริษัทหัก)"
        >
            <div className="flex flex-wrap items-end gap-3">
                <FormField label="เดือน" htmlFor="export_month">
                    <input
                        id="export_month"
                        type="month"
                        max={`${year}-${pad(month)}`}
                        value={exportMonth}
                        onChange={(event) => setExportMonth(event.target.value)}
                        className={inputClass(false)}
                    />
                </FormField>
                <button
                    type="button"
                    className={buttonClass("primary", "md")}
                    disabled={!exportMonth || isDownloading}
                    onClick={download}
                >
                    <FileSpreadsheet size={16} />
                    {isDownloading ? "กำลังสร้างไฟล์..." : "ดาวน์โหลด Excel"}
                </button>
            </div>
            {downloadError && <p className="text-xs text-red-600">{downloadError}</p>}
            <FieldHint>
                ใบเสร็จย้อนวันที่ได้ 30 วัน และยกเลิกเอกสารทีหลังได้ — ตัวเลขของเดือนก่อนอาจเปลี่ยนได้จนถึงวันที่ 30
                ของเดือนถัดไป ถ้าแก้ย้อนหลังให้ส่งออกใหม่ · ไฟล์มีเลขผู้เสียภาษีของลูกค้า ระบบบันทึกทุกครั้งที่ดาวน์โหลด
            </FieldHint>
        </SectionCard>
    );
}

export default function ReportsPage() {
    const [monthly, setMonthly] = useState<MonthlySales | null>(null);
    const [summary, setSummary] = useState<SalesSummary | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);
    const [preset, setPreset] = useState<Preset>("this_month");
    const [customFrom, setCustomFrom] = useState("");
    const [customTo, setCustomTo] = useState("");
    const [rangeError, setRangeError] = useState<Record<string, string>>({});

    useEffect(() => {
        let isLeftPage = false;
        apiFetch<MonthlySales>("/reports/sales/monthly?months=12").then(({ data, error }) => {
            if (isLeftPage) return;
            setMonthly(data);
            setLoadError(error);
            if (data) {
                const thisMonth = rangeOf("this_month", data.today);
                setCustomFrom(thisMonth.from);
                setCustomTo(thisMonth.to);
            }
        });
        return () => {
            isLeftPage = true;
        };
    }, []);

    const range = monthly
        ? preset === "custom"
            ? { from: customFrom, to: customTo }
            : rangeOf(preset, monthly.today)
        : null;
    const rangeFrom = range?.from ?? "";
    const rangeTo = range?.to ?? "";

    useEffect(() => {
        if (!rangeFrom || !rangeTo) return;
        let isLeftPage = false;
        const query = new URLSearchParams({ from: rangeFrom, to: rangeTo });
        apiFetch<SalesSummary>(`/reports/sales?${query}`).then(({ data, error }) => {
            if (isLeftPage) return;
            if (error?.status === 400) {
                setRangeError(error.fields);
                return;
            }
            setRangeError({});
            setSummary(data);
            if (error) setLoadError(error);
        });
        return () => {
            isLeftPage = true;
        };
    }, [rangeFrom, rangeTo]);

    if (loadError)
        return (
            <StatusBanner tone="error" title="โหลดรายงานไม่สำเร็จ">
                {loadError.message}
            </StatusBanner>
        );
    if (!monthly) return <PageSkeleton />;

    return (
        <div className="grid grid-cols-1 gap-6">
            <PageHeader
                title="รายงานขาย"
                description="ยอดขาย = ยอดก่อน VAT ของใบแจ้งหนี้ที่ออกในช่วง (ไม่นับใบที่ยกเลิก) · รับชำระ = ตามวันที่ในใบเสร็จ · ทุกยอดเป็นบาท — สกุลต่างประเทศคิดตามอัตราของเอกสาร"
            />

            <div className="grid gap-3">
                <Segmented<Preset> label="ช่วงเวลา" value={preset} onChange={setPreset} options={PRESETS} />
                {preset === "custom" && (
                    <div className="grid grid-cols-2 gap-3 sm:max-w-md">
                        <FormField label="ตั้งแต่" htmlFor="report_from" error={rangeError.from}>
                            <input
                                id="report_from"
                                type="date"
                                value={customFrom}
                                onChange={(event) => setCustomFrom(event.target.value)}
                                className={inputClass(Boolean(rangeError.from))}
                            />
                        </FormField>
                        <FormField label="ถึง" htmlFor="report_to" error={rangeError.to}>
                            <input
                                id="report_to"
                                type="date"
                                value={customTo}
                                onChange={(event) => setCustomTo(event.target.value)}
                                className={inputClass(Boolean(rangeError.to))}
                            />
                        </FormField>
                    </div>
                )}
                {range && (
                    <FieldHint>
                        {formatDateOnly(range.from)} – {formatDateOnly(range.to)} · ช่วงยาวได้ไม่เกิน 24 เดือน
                    </FieldHint>
                )}
            </div>

            {summary && (
                <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {summary.credited.credit_note_count === 0 ? (
                        <SummaryCard
                            label="ยอดขาย (ออกบิล ก่อน VAT)"
                            value={formatAmount(summary.billed.amount_thb)}
                            detail={`${summary.billed.invoice_count} ใบ · รวม VAT ${formatAmount(summary.billed.amount_with_vat_thb)}`}
                        />
                    ) : (
                        // มีใบลดหนี้ในช่วง: ยอดขายสุทธิ = ออกบิล − ลดหนี้ (แสดงทั้งสองตัวในรายละเอียด)
                        <SummaryCard
                            label="ยอดขายสุทธิ (ก่อน VAT)"
                            value={formatAmount(summary.net_sales.amount_thb)}
                            detail={`ออกบิล ${formatAmount(summary.billed.amount_thb)} (${summary.billed.invoice_count} ใบ) − ลดหนี้ ${formatAmount(summary.credited.amount_thb)} (${summary.credited.credit_note_count} ใบ)`}
                        />
                    )}
                    {summary.fastwork.payout_count > 0 && (
                        <>
                            <SummaryCard
                                label="รายได้ Fastwork (ราคางวดที่เงินเข้า)"
                                value={formatAmount(summary.fastwork.gross_thb)}
                                detail={`${summary.fastwork.payout_count} งวด · ค่าธรรมเนียม ${formatAmount(summary.fastwork.fee_thb)} · หัก ณ ที่จ่าย ${formatAmount(summary.fastwork.wht_thb)} · เข้าบัญชี ${formatAmount(summary.fastwork.net_thb)}`}
                            />
                            <SummaryCard
                                label="รายได้รวม (ลูกค้าตรง + Fastwork)"
                                value={formatAmount(summary.total_income.amount_thb)}
                                detail={`ยอดขายสุทธิ ${formatAmount(summary.net_sales.amount_thb)} + Fastwork ${formatAmount(summary.fastwork.gross_thb)}`}
                            />
                        </>
                    )}
                    <SummaryCard
                        label="รับชำระ"
                        value={formatAmount(summary.received.settled_thb)}
                        detail={`เงินเข้า ${formatAmount(summary.received.received_thb)} · หัก ณ ที่จ่าย ${formatAmount(summary.received.withholding_thb)} · ค่าธรรมเนียม ${formatAmount(summary.received.fee_thb)}${summary.refunds.refund_count > 0 ? ` · คืนเงินลูกค้า ${formatAmount(summary.refunds.refunded_thb)}` : ""}`}
                    />
                    <SummaryCard
                        label="ใบเสนอราคาที่ลูกค้าตอบรับ"
                        value={formatAmount(summary.quotations.accepted_thb)}
                        detail={`${summary.quotations.accepted_count} ใบ · ปิดการขายได้ ${
                            summary.quotations.win_rate_percent === null
                                ? "—"
                                : `${summary.quotations.win_rate_percent}%`
                        } (ปฏิเสธ ${summary.quotations.declined_count} · หมดอายุ ${summary.quotations.expired_count})`}
                    />
                    <SummaryCard
                        label="ค้างรับตอนนี้"
                        value={formatAmount(summary.outstanding_now.outstanding_thb)}
                        detail={
                            <>
                                เกินกำหนด{" "}
                                <span
                                    className={
                                        parseHundredths(summary.outstanding_now.overdue_thb, "ยอด") > 0n
                                            ? "text-red-600"
                                            : ""
                                    }
                                >
                                    {formatAmount(summary.outstanding_now.overdue_thb)}
                                </span>{" "}
                                · กดดูลูกหนี้คงค้าง
                            </>
                        }
                        href="/sales/receivables"
                    />
                </section>
            )}

            <SectionCard
                icon={ChartColumn}
                title="12 เดือนล่าสุด"
                description="ออกบิลสุทธิ (ก่อน VAT หักใบลดหนี้ของเดือนนั้น) เทียบรับชำระ รายเดือน เป็นบาท"
            >
                <MonthlyChart months={monthly.months} />
            </SectionCard>

            <AccountingExportCard today={monthly.today} />

            {summary && (
                <SectionCard
                    icon={Trophy}
                    title="ลูกค้ายอดสูงสุด"
                    description="10 อันดับตามยอดออกบิลในช่วงที่เลือก · ค้างรับเป็นยอดปัจจุบันทั้งหมดของลูกค้า"
                >
                    {summary.top_clients.length === 0 ? (
                        <p className="text-sm text-gray-500">ไม่มีใบแจ้งหนี้ที่ออกในช่วงนี้</p>
                    ) : (
                        <ol className="grid gap-2 text-sm">
                            {summary.top_clients.map((client, index) => (
                                <li
                                    key={client.client_id}
                                    className="grid grid-cols-[1.5rem_1fr_auto] items-start gap-x-2 gap-y-0.5"
                                >
                                    <span className="text-gray-400 tabular-nums">{index + 1}</span>
                                    <span className="min-w-0 wrap-break-word font-medium text-gray-800">
                                        {client.client_company || client.client_name}
                                    </span>
                                    <span className="font-medium text-gray-900 tabular-nums">
                                        {formatAmount(client.billed_thb)}
                                    </span>
                                    <span />
                                    <span className="col-span-2 text-xs text-gray-500">
                                        {client.invoice_count} ใบ · ค้างรับ {formatAmount(client.outstanding_thb)}
                                    </span>
                                </li>
                            ))}
                        </ol>
                    )}
                </SectionCard>
            )}
        </div>
    );
}
