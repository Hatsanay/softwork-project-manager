"use client";

// สลิปเงินเดือน (หน้าพิมพ์ — ขั้น 4-4) · เจ้าของเปิดได้หลังบันทึกจ่าย · ผู้มีสิทธิ์ดูรอบเงินเดือนเปิดได้ทุกคน (backend ตรวจ + บันทึกการเปิด)
// ตัวเลขทั้งหมดมาจาก snapshot ของรอบ (ไม่คิดใหม่)
import { attendanceDeductionText } from "@/app/(protected)/people/payroll/_attendance-text";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Printer } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { formatDateOnly } from "@/app/function";
import { apiFetch } from "@/lib/api";
import { formatAmount, formatHundredths, parseHundredths } from "@/lib/shared/money.mjs";
import type { Payslip } from "@/app/(protected)/people/_types";

function periodLabel(period: string) {
    return new Intl.DateTimeFormat("th-TH-u-ca-buddhist", { month: "long", year: "numeric", timeZone: "UTC" }).format(
        new Date(`${period}-01T00:00:00Z`),
    );
}

// รวมยอดเงินเป็นสตางค์ (ไม่ผ่าน float)
function sumAmounts(...amounts: string[]) {
    return formatHundredths(amounts.reduce((total, amount) => total + parseHundredths(amount, "ยอดเงิน"), 0n));
}

function maskedAccount(accountNo: string | null) {
    if (!accountNo) return "-";
    return `xxx-x-${accountNo.replace(/\D/g, "").slice(-5)}`;
}

export default function PayslipPrintPage() {
    return (
        <Suspense fallback={<p className="p-8 text-sm text-gray-500">กำลังเตรียมสลิป...</p>}>
            <PayslipContent />
        </Suspense>
    );
}

function PayslipContent() {
    const itemId = useSearchParams().get("id") ?? "";
    const [slip, setSlip] = useState<Payslip | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        let isLeftPage = false;
        apiFetch<Payslip>(`/payroll/payslips/${encodeURIComponent(itemId)}`).then(({ data, error }) => {
            if (isLeftPage) return;
            setSlip(data);
            setLoadError(error?.message ?? null);
        });
        return () => {
            isLeftPage = true;
        };
    }, [itemId]);

    if (loadError) return <p className="p-8 text-sm text-red-600">{loadError}</p>;
    if (!slip) return <p className="p-8 text-sm text-gray-500">กำลังเตรียมสลิป...</p>;

    const { item, run, company } = slip;
    const earnings: [string, string][] = [["เงินเดือน", item.pri_salary_amount]];
    for (const line of item.lines.filter((entry) => entry.pil_kind === "earning")) {
        earnings.push([line.pil_label, line.pil_amount]);
    }
    const deductions: [string, string][] = [];
    if (Number(item.pri_unpaid_leave_amount) > 0) {
        deductions.push([`ลาไม่รับค่าจ้าง ${Number(item.pri_unpaid_leave_days)} วัน`, item.pri_unpaid_leave_amount]);
    }
    if (Number(item.pri_attendance_deduction) > 0) {
        deductions.push([`หัก${attendanceDeductionText(item)}`, item.pri_attendance_deduction]);
    }
    deductions.push(["ประกันสังคม", item.pri_sso_employee], ["ภาษีหัก ณ ที่จ่าย", item.pri_tax]);
    for (const line of item.lines.filter((entry) => entry.pil_kind === "deduction")) {
        deductions.push([line.pil_label, line.pil_amount]);
    }
    const totalDeductions = sumAmounts(
        item.pri_unpaid_leave_amount,
        item.pri_attendance_deduction,
        item.pri_sso_employee,
        item.pri_tax,
        item.pri_other_deductions,
    );
    const totalEarnings = sumAmounts(item.pri_salary_amount, item.pri_other_earnings);
    const ytdIncome = sumAmounts(item.pri_ytd_income_before, item.pri_taxable_income);
    const ytdTax = sumAmounts(item.pri_ytd_tax_before, item.pri_tax);
    const ytdSso = sumAmounts(item.pri_ytd_sso_before, item.pri_sso_employee);

    const column = (title: string, rows: [string, string][], total: string) => (
        <div className="grid content-start">
            <p className="border-b border-gray-300 pb-1 font-medium">{title}</p>
            {rows.map(([label, amount]) => (
                <p key={label} className="flex justify-between gap-4 py-0.5">
                    <span>{label}</span>
                    <span className="tabular-nums">{formatAmount(amount)}</span>
                </p>
            ))}
            <p className="mt-1 flex justify-between gap-4 border-t border-gray-300 pt-1 font-medium">
                <span>รวม</span>
                <span className="tabular-nums">{formatAmount(total)}</span>
            </p>
        </div>
    );

    return (
        <div className="min-h-screen bg-gray-100 py-6 print:bg-white print:py-0">
            <style>{`
                @page { size: A4 portrait; margin: 12mm; }
                @media print { .no-print { display: none !important; } body { background: white; } }
            `}</style>
            <div className="no-print mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-2 px-4">
                <p className="text-sm text-gray-600">สลิปนี้เป็นข้อมูลส่วนบุคคล · เก็บเป็นความลับ</p>
                <button type="button" className={buttonClass("primary", "md")} onClick={() => window.print()}>
                    <Printer size={16} />
                    พิมพ์ / บันทึก PDF
                </button>
            </div>
            <article className="mx-auto grid w-full max-w-[210mm] gap-4 bg-white p-6 text-[10pt] leading-snug text-gray-900 shadow-card print:max-w-none print:p-0 print:shadow-none sm:p-[12mm]">
                <header className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-300 pb-3">
                    <div>
                        <p className="text-[13pt] font-medium">{company.name}</p>
                        {company.tax_id && <p className="text-gray-600">เลขประจำตัวผู้เสียภาษี {company.tax_id}</p>}
                    </div>
                    <div className="text-right">
                        <p className="text-[13pt] font-medium">สลิปเงินเดือน</p>
                        <p className="text-gray-600">
                            ประจำเดือน{periodLabel(run.pr_period)} · จ่ายวันที่ {formatDateOnly(run.pr_pay_date)}
                        </p>
                    </div>
                </header>
                <section className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
                    <p>
                        ชื่อ: <span className="font-medium">{item.pri_full_name}</span> ({item.pri_emp_code})
                    </p>
                    <p>ตำแหน่ง: {item.pri_position ?? "-"}</p>
                    <p>แผนก: {item.pri_department_name ?? "-"}</p>
                    <p>
                        บัญชีรับเงิน: {item.pri_bank_name ?? "-"} {maskedAccount(item.pri_bank_account_no)}
                    </p>
                </section>
                <section className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                    {column("รายได้", earnings, totalEarnings)}
                    {column("รายการหัก", deductions, totalDeductions)}
                </section>
                <p className="flex justify-between rounded-lg bg-gray-100 px-4 py-3 text-[12pt] font-medium">
                    <span>รับสุทธิ</span>
                    <span className="tabular-nums">{formatAmount(item.pri_net)} บาท</span>
                </p>
                <section className="grid grid-cols-1 gap-1 text-gray-600 sm:grid-cols-3">
                    <p>เงินได้สะสมทั้งปี {formatAmount(ytdIncome)}</p>
                    <p>ภาษีสะสมทั้งปี {formatAmount(ytdTax)}</p>
                    <p>ประกันสังคมสะสม {formatAmount(ytdSso)}</p>
                </section>
                {run.pr_status !== "paid" && (
                    <p className="text-red-600">ตัวอย่าง · รอบนี้ยังไม่ได้บันทึกจ่าย ตัวเลขอาจเปลี่ยน</p>
                )}
            </article>
        </div>
    );
}
