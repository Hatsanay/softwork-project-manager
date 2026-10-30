"use client";

// รายงานภาษีหัก ณ ที่จ่าย ภ.ง.ด.3 / ภ.ง.ด.53 รายเดือน (2026-10-17 ขั้น 2-5) — ใช้กรอกแบบยื่นภาษี
// เฉพาะ 50 ทวิ ที่ไม่ยกเลิก ตามเดือนที่จ่าย · ผู้รับใช้ข้อมูล ณ วันจ่าย · ไฟล์นำเข้า e-filing รอคำตอบนักบัญชี (X5)
import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import PageHeader from "@/components/ui/page-header";
import Segmented from "@/components/ui/segmented";
import StatusBanner from "@/components/ui/guidance/status-banner";
import FieldHint from "@/components/ui/guidance/field-hint";
import FormField, { inputClass } from "@/components/ui/form-field";
import { CARD_CLASS } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { formatDateOnly } from "@/app/function";
import { apiFetch, type ApiError } from "@/lib/api";
import { formatAmount } from "@/lib/shared/money.mjs";
import { WHT_FORM_SHORT } from "../payments/_messages";
import type { WithholdingReport } from "../payments/_types";

type Form = "PND3" | "PND53";

// เดือนก่อนหน้าตามเวลาไทย — เดือนที่มักต้องยื่น
function previousMonth() {
    const now = new Date(Date.now() + 7 * 3_600_000);
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    return date.toISOString().slice(0, 7);
}

export default function WithholdingReportPage() {
    const [month, setMonth] = useState(previousMonth);
    const [form, setForm] = useState<Form>("PND53");
    const [report, setReport] = useState<WithholdingReport | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);

    useEffect(() => {
        if (!month) return;
        let isLeftPage = false;
        apiFetch<WithholdingReport>(`/reports/withholding?${new URLSearchParams({ month, form })}`).then(
            ({ data, error }) => {
                if (isLeftPage) return;
                setReport(data);
                setLoadError(error);
            },
        );
        return () => {
            isLeftPage = true;
        };
    }, [month, form]);

    return (
        <div className="grid grid-cols-1 gap-6">
            <PageHeader
                eyebrow="จัดซื้อ"
                title="รายงานภาษีหัก ณ ที่จ่าย"
                description="สรุป 50 ทวิ ที่บริษัทออกในเดือน แยก ภ.ง.ด.3 (บุคคลธรรมดา) และ ภ.ง.ด.53 (นิติบุคคล) · ใช้กรอกแบบยื่นและนำส่งภาษี"
                actions={
                    report &&
                    report.rows.length > 0 && (
                        <a
                            href={`/purchasing/wht-report/print?${new URLSearchParams({ month, form })}`}
                            target="_blank"
                            rel="noopener"
                            className={buttonClass("secondary", "md")}
                        >
                            <Printer size={16} />
                            พิมพ์รายงาน
                        </a>
                    )
                }
            />
            <div className="grid gap-4 sm:grid-cols-[auto_12rem] sm:items-end">
                <Segmented<Form>
                    label="แบบยื่น"
                    value={form}
                    onChange={setForm}
                    options={[
                        { value: "PND53", label: "ภ.ง.ด.53" },
                        { value: "PND3", label: "ภ.ง.ด.3" },
                    ]}
                />
                <FormField label="เดือนที่จ่าย" htmlFor="month">
                    <input
                        id="month"
                        type="month"
                        value={month}
                        onChange={(event) => setMonth(event.target.value)}
                        className={inputClass()}
                    />
                </FormField>
            </div>

            {loadError && (
                <StatusBanner tone="error" title="โหลดรายงานไม่สำเร็จ">
                    {loadError.message}
                </StatusBanner>
            )}
            {report && (
                <>
                    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <Stat label="จำนวนผู้ถูกหัก" value={`${report.totals.payee_count} ราย`} />
                        <Stat label="หนังสือรับรอง" value={`${report.totals.certificate_count} ฉบับ`} />
                        <Stat label="เงินได้ที่จ่ายรวม (บาท)" value={formatAmount(report.totals.paid_amount)} />
                        <Stat label="ภาษีที่ต้องนำส่ง (บาท)" value={formatAmount(report.totals.tax_amount)} strong />
                    </section>
                    <FieldHint>
                        ยื่น {WHT_FORM_SHORT[report.form]} เดือนนี้ภายใน {formatDateOnly(report.due_dates.paper)}{" "}
                        (แบบกระดาษ) หรือ {formatDateOnly(report.due_dates.online)} (ยื่นออนไลน์) ·
                        ใบที่ยกเลิกไม่อยู่ในรายงาน · ตรวจกับนักบัญชีก่อนยื่น
                    </FieldHint>

                    {report.rows.length === 0 ? (
                        <StatusBanner tone="info" title={`ไม่มี ${WHT_FORM_SHORT[report.form]} ในเดือนนี้`}>
                            ไม่มีการหัก ณ ที่จ่ายของแบบนี้ · ถ้าเคยยื่นทุกเดือน ตรวจกับนักบัญชีว่าต้องยื่นแบบ
                            &quot;ไม่มีเงินได้&quot; ไหม
                        </StatusBanner>
                    ) : (
                        <section className={`overflow-hidden ${CARD_CLASS}`}>
                            <ul className="grid divide-y divide-gray-100 text-sm sm:hidden">
                                {report.rows.map((row) => (
                                    <li key={`${row.wt_id}-${row.sequence}`} className="grid gap-1 p-4">
                                        <span className="flex justify-between gap-2">
                                            <span className="font-medium text-gray-900">
                                                {row.sequence}. {row.payee_name}
                                            </span>
                                            <span className="shrink-0 tabular-nums">
                                                {formatAmount(row.wtl_tax_amount)}
                                            </span>
                                        </span>
                                        <span className="text-xs text-gray-500">
                                            {row.payee_tax_id} · {formatDateOnly(row.wt_payment_date)} ·{" "}
                                            {row.wtl_form_label} {Number(row.wtl_rate)}% ของ{" "}
                                            {formatAmount(row.wtl_paid_amount)}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                            <table className="hidden w-full text-sm sm:table">
                                <thead className="bg-gray-50 text-left text-xs text-gray-500">
                                    <tr>
                                        <th className="px-4 py-2 font-normal">ลำดับ</th>
                                        <th className="px-2 py-2 font-normal">ผู้ถูกหัก / เลขผู้เสียภาษี</th>
                                        <th className="px-2 py-2 font-normal">วันที่จ่าย</th>
                                        <th className="px-2 py-2 font-normal">ประเภทเงินได้</th>
                                        <th className="px-2 py-2 text-right font-normal">อัตรา</th>
                                        <th className="px-2 py-2 text-right font-normal">เงินได้ที่จ่าย</th>
                                        <th className="px-4 py-2 text-right font-normal">ภาษีที่หัก</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {report.rows.map((row) => (
                                        <tr
                                            key={`${row.wt_id}-${row.sequence}`}
                                            className="border-t border-gray-100 align-top"
                                        >
                                            <td className="px-4 py-2 tabular-nums">{row.sequence}</td>
                                            <td className="px-2 py-2">
                                                <p className="text-gray-900">{row.payee_name}</p>
                                                <p className="text-xs text-gray-500 tabular-nums">
                                                    {row.payee_tax_id}
                                                    {row.payee_branch_code
                                                        ? ` · สาขา ${row.payee_branch_code}`
                                                        : ""} · {row.wt_number}
                                                </p>
                                            </td>
                                            <td className="px-2 py-2 tabular-nums">
                                                {formatDateOnly(row.wt_payment_date)}
                                            </td>
                                            <td className="px-2 py-2">{row.wtl_form_label}</td>
                                            <td className="px-2 py-2 text-right tabular-nums">
                                                {Number(row.wtl_rate)}%
                                            </td>
                                            <td className="px-2 py-2 text-right tabular-nums">
                                                {formatAmount(row.wtl_paid_amount)}
                                            </td>
                                            <td className="px-4 py-2 text-right tabular-nums">
                                                {formatAmount(row.wtl_tax_amount)}
                                            </td>
                                        </tr>
                                    ))}
                                    <tr className="border-t border-gray-300 font-medium text-gray-900">
                                        <td className="px-4 py-2" colSpan={5}>
                                            รวม
                                        </td>
                                        <td className="px-2 py-2 text-right tabular-nums">
                                            {formatAmount(report.totals.paid_amount)}
                                        </td>
                                        <td className="px-4 py-2 text-right tabular-nums">
                                            {formatAmount(report.totals.tax_amount)}
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </section>
                    )}
                </>
            )}
        </div>
    );
}

function Stat({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
    return (
        <div className={`grid gap-1 p-4 ${CARD_CLASS}`}>
            <span className="text-xs text-gray-500">{label}</span>
            <span
                className={`tabular-nums ${strong ? "text-xl font-medium text-gray-900" : "text-base text-gray-800"}`}
            >
                {value}
            </span>
        </div>
    );
}
