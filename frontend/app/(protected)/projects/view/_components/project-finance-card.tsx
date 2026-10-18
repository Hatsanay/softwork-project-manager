"use client";

// ส่วน "การเงิน" ในหน้าโปรเจกต์ (2026-10-15 ขั้น 1D-1 — docs/plans/2026-10-15-finance-1d.md หัวข้อ 3.1)
// เห็นเฉพาะผู้มีสิทธิ์ดูใบแจ้งหนี้ (D1 — backend ตรวจอีกชั้น) · ตัวเลขทั้งหมดคำนวณใน backend
// ยอดรวมเป็นบาท + แยกสกุล · งวดของใบเสนอราคาที่ตอบรับ · งานเสร็จเทียบออกบิล · ใบแจ้งหนี้สร้างเองของโปรเจกต์
// + ต้นทุนและกำไรขั้นต้น (เฟส 2 ขั้น 2-5 — P4): ค่าใช้จ่าย/ใบเบิกที่อนุมัติแล้วซึ่งผูกโปรเจกต์นี้
// + ค่าแรง (เฟส 4 ขั้น 4-2): ชั่วโมงที่อนุมัติ × ต้นทุนต่อชั่วโมง ยอดรวมเท่านั้น (ไม่แยกรายคน H3) · ประมาณการจนกว่าจะมีรอบเงินเดือน
import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText, Wallet } from "lucide-react";
import SectionCard from "@/components/ui/section-card";
import StatusBanner from "@/components/ui/guidance/status-banner";
import FieldHint from "@/components/ui/guidance/field-hint";
import StatusPill, { type PillTone } from "@/components/ui/status-pill";
import { buttonClass } from "@/components/ui/button";
import { usePermission, BITS } from "@/app/components/permission-provider";
import { apiFetch, type ApiError } from "@/lib/api";
import { formatAmount, parseHundredths } from "@/lib/shared/money.mjs";

type MilestoneState = "billed" | "draft" | "unbilled";

type FinanceQuotation = {
    qt_id: string;
    qt_number: string;
    qt_title: string;
    qt_currency: string;
    qt_total: string;
    milestones: {
        qtm_id: number;
        qtm_order: number;
        qtm_name: string;
        qtm_amount: string;
        state: MilestoneState;
        invoice: { inv_id: string; inv_number: string | null; inv_status: string } | null;
    }[];
    next_milestone: { qtm_id: number; qtm_order: number; qtm_name: string } | null;
    billed_percent: number | null;
    progress_percent: number | null;
    items_with_tasks: number;
    items_without_tasks: number;
    is_work_ahead_of_billing: boolean;
};

type FinanceInvoice = {
    inv_id: string;
    inv_number: string | null;
    inv_status: string;
    inv_source: "quotation" | "manual";
    inv_title: string;
    inv_currency: string;
    inv_total: string;
    outstanding_amount: string;
    is_overdue: boolean;
};

type CurrencyTotals = Record<
    "contract" | "billed" | "credited" | "received" | "outstanding" | "overdue" | "unbilled" | "in_draft",
    string
> & { currency: string };

type ProjectProfit = {
    billed_before_vat_thb: string;
    credited_before_vat_thb: string;
    revenue_thb: string;
    cost_thb: string;
    expense_cost_thb: string;
    labor_cost_thb: string;
    labor_hours: string;
    labor_pending_hours: string;
    labor_is_estimate: boolean;
    gross_profit_thb: string;
    gross_margin_percent: number | null;
    pending_cost_thb: string;
    by_category: { category_id: number; category_name: string; amount_thb: string }[];
    expenses: {
        ex_id: string;
        ex_number: string;
        ex_kind: "bill" | "claim";
        ex_title: string;
        ex_expense_date: string;
        payee_name: string | null;
        amount_thb: string;
    }[];
};

type ProjectFinance = {
    profit: ProjectProfit;
    currencies: CurrencyTotals[];
    totals_thb: Record<"contract" | "billed" | "credited" | "received" | "outstanding" | "overdue" | "unbilled", string>;
    quotations: FinanceQuotation[];
    invoices: FinanceInvoice[];
    progress_ahead_threshold: number;
};

const MILESTONE_STATES: Record<MilestoneState, { label: string; tone: PillTone }> = {
    billed: { label: "ออกบิลแล้ว", tone: "success" },
    draft: { label: "ร่างรอออก", tone: "wait" },
    unbilled: { label: "ยังไม่ออกบิล", tone: "neutral" },
};

const isZero = (value: string) => parseHundredths(value, "ยอด") === 0n;

function Stat({
    label,
    value,
    note,
    tone = "text-gray-900",
}: {
    label: string;
    value: string;
    note?: string;
    tone?: string;
}) {
    return (
        <div className="grid content-start gap-0.5 rounded-xl bg-gray-50 p-3">
            <span className="text-xs text-gray-500">{label}</span>
            <span className={`text-base font-medium tabular-nums ${tone}`}>{formatAmount(value)}</span>
            {note && <span className="text-xs text-red-600">{note}</span>}
        </div>
    );
}

// ต้นทุน + กำไรขั้นต้น (เป็นบาท) — แสดงเมื่อมีออกบิลหรือมีต้นทุน
function ProfitSection({ profit }: { profit: ProjectProfit }) {
    const isLoss = parseHundredths(profit.gross_profit_thb, "กำไร") < 0n;
    const hasLabor = !isZero(profit.labor_hours) || !isZero(profit.labor_pending_hours);
    return (
        <div className="grid gap-3 rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-medium text-gray-900">ต้นทุนและกำไรขั้นต้น (บาท)</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {isZero(profit.credited_before_vat_thb) ? (
                    <Stat label="ออกบิลแล้ว (ก่อน VAT)" value={profit.billed_before_vat_thb} />
                ) : (
                    // มีใบลดหนี้: รายได้ = ออกบิล − ลดหนี้ (แสดงสูตรให้เห็น ไม่หักเงียบ — กติกาเงิน 3.8)
                    <div className="grid content-start gap-0.5 rounded-xl bg-gray-50 p-3">
                        <span className="text-xs text-gray-500">รายได้หลังลดหนี้ (ก่อน VAT)</span>
                        <span className="text-base font-medium tabular-nums">{formatAmount(profit.revenue_thb)}</span>
                        <span className="text-xs text-gray-500 tabular-nums">
                            ออกบิล {formatAmount(profit.billed_before_vat_thb)} − ลดหนี้{" "}
                            {formatAmount(profit.credited_before_vat_thb)}
                        </span>
                    </div>
                )}
                <Stat label="ต้นทุน" value={profit.cost_thb} />
                <div className="col-span-2 grid content-start gap-0.5 rounded-xl bg-gray-50 p-3 sm:col-span-1">
                    <span className="text-xs text-gray-500">กำไรขั้นต้น</span>
                    <span
                        className={`text-base font-medium tabular-nums ${isLoss ? "text-red-600" : "text-green-600"}`}
                    >
                        {formatAmount(profit.gross_profit_thb)}
                        {profit.gross_margin_percent !== null ? ` (${profit.gross_margin_percent}%)` : ""}
                    </span>
                </div>
            </div>
            <ul className="grid gap-1 text-sm">
                <li className="flex justify-between gap-3 text-gray-700">
                    <span>ค่าใช้จ่าย/ใบเบิก</span>
                    <span className="tabular-nums">{formatAmount(profit.expense_cost_thb)}</span>
                </li>
                <li className="flex justify-between gap-3 text-gray-700">
                    <span>
                        ค่าแรง{profit.labor_is_estimate ? " (ประมาณการ)" : ""} · {Number(profit.labor_hours)} ชม.
                    </span>
                    <span className="tabular-nums">{formatAmount(profit.labor_cost_thb)}</span>
                </li>
            </ul>
            {profit.by_category.length > 0 && (
                <ul className="grid gap-1 text-sm">
                    {profit.by_category.map((category) => (
                        <li key={category.category_id} className="flex justify-between gap-3 text-gray-700">
                            <span className="min-w-0 wrap-break-word">{category.category_name}</span>
                            <span className="tabular-nums">{formatAmount(category.amount_thb)}</span>
                        </li>
                    ))}
                </ul>
            )}
            {profit.expenses.length > 0 && (
                <details className="text-sm">
                    <summary className="-my-2 cursor-pointer py-2 text-blue-600">
                        รายการค่าใช้จ่ายของโปรเจกต์ ({profit.expenses.length})
                    </summary>
                    <ul className="mt-2 grid gap-1.5">
                        {profit.expenses.map((expense) => (
                            <li key={expense.ex_id} className="grid grid-cols-[1fr_auto] gap-x-3">
                                <Link
                                    href={`${expense.ex_kind === "claim" ? "/purchasing/claims" : "/purchasing/expenses"}/view?id=${expense.ex_id}`}
                                    className="-my-2 py-2 text-blue-600 tabular-nums hover:underline"
                                >
                                    {expense.ex_number} · {expense.ex_title}
                                </Link>
                                <span className="tabular-nums">{formatAmount(expense.amount_thb)}</span>
                                <span className="col-span-2 text-xs text-gray-500">{expense.payee_name ?? ""}</span>
                            </li>
                        ))}
                    </ul>
                </details>
            )}
            <FieldHint>
                ต้นทุน = ค่าใช้จ่ายและใบเบิกที่อนุมัติแล้วซึ่งผูกโปรเจกต์นี้ (รวม VAT ที่ขอคืนไม่ได้) + ค่าแรง ·
                ค่าแรง = ชั่วโมงที่อนุมัติ × ต้นทุนต่อชั่วโมงของแต่ละคน (เงินเดือน + ประกันสังคมส่วนบริษัท) ไม่แสดงรายคน
                {profit.labor_is_estimate ? " · เดือนที่ยังไม่ปิดรอบเงินเดือนคิดจากค่าจ้างปัจจุบัน (ประมาณการ)" : " · ค่าจริงจากรอบเงินเดือนที่อนุมัติแล้ว"}
                {isZero(profit.pending_cost_thb)
                    ? ""
                    : ` · ค่าใช้จ่ายรออนุมัติอีก ${formatAmount(profit.pending_cost_thb)} บาท (ยังไม่นับ)`}
                {isZero(profit.labor_pending_hours)
                    ? ""
                    : ` · ชั่วโมงรออนุมัติอีก ${Number(profit.labor_pending_hours)} ชม. (ยังไม่นับ)`}
                {hasLabor ? "" : " · ยังไม่มีชั่วโมงทำงานที่อนุมัติ"}
            </FieldHint>
        </div>
    );
}

// แถบเปรียบเทียบ % (งานเสร็จ / ออกบิล)
function PercentBar({ label, percent, tone }: { label: string; percent: number | null; tone: string }) {
    return (
        <div className="grid gap-1">
            <div className="flex justify-between text-xs text-gray-600">
                <span>{label}</span>
                <span className="tabular-nums">{percent === null ? "—" : `${percent}%`}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.min(percent ?? 0, 100)}%` }} />
            </div>
        </div>
    );
}

export default function ProjectFinanceCard({ projectId }: { projectId: string }) {
    const hasBit = usePermission();
    const canView = hasBit(BITS.viewInvoices);
    const canCreateInvoice = hasBit(BITS.createInvoice);
    const [finance, setFinance] = useState<ProjectFinance | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);

    useEffect(() => {
        if (!canView) return;
        let isLeftPage = false;
        apiFetch<ProjectFinance>(`/projects/${projectId}/finance`).then(({ data, error }) => {
            if (isLeftPage) return;
            setFinance(data);
            setLoadError(error);
        });
        return () => {
            isLeftPage = true;
        };
    }, [canView, projectId]);

    if (!canView) return null;

    const description =
        "เห็นเฉพาะผู้มีสิทธิ์ดูใบแจ้งหนี้ · ยอดรวมเป็นบาท (สกุลต่างประเทศคิดตามอัตราของเอกสาร) · ออกบิล = ใบแจ้งหนี้ที่ออกแล้ว ไม่นับร่าง/ยกเลิก";

    return (
        <SectionCard icon={Wallet} title="การเงิน" description={description}>
            {loadError && (
                <StatusBanner tone="error" title="โหลดข้อมูลการเงินไม่สำเร็จ">
                    {loadError.message}
                </StatusBanner>
            )}
            {!finance && !loadError && <p className="text-sm text-gray-500">กำลังโหลด...</p>}
            {finance && (!isZero(finance.profit.cost_thb) || !isZero(finance.profit.billed_before_vat_thb)) && (
                <ProfitSection profit={finance.profit} />
            )}
            {finance && finance.quotations.length === 0 && finance.invoices.length === 0 && (
                <p className="text-sm text-gray-500">
                    โปรเจกต์นี้ยังไม่มีใบเสนอราคาที่ลูกค้าตอบรับหรือใบแจ้งหนี้ —
                    ผูกได้ตอนบันทึกว่าลูกค้าตอบรับใบเสนอราคา
                </p>
            )}
            {finance && (finance.quotations.length > 0 || finance.invoices.length > 0) && (
                <div className="grid gap-5">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                        <Stat label="มูลค่าตามสัญญา" value={finance.totals_thb.contract} />
                        <Stat label="ออกบิลแล้ว" value={finance.totals_thb.billed} />
                        {!isZero(finance.totals_thb.credited) && (
                            <Stat label="ลดหนี้" value={finance.totals_thb.credited} />
                        )}
                        <Stat label="รับแล้ว" value={finance.totals_thb.received} tone="text-green-600" />
                        <Stat
                            label="ค้างรับ"
                            value={finance.totals_thb.outstanding}
                            note={
                                isZero(finance.totals_thb.overdue)
                                    ? undefined
                                    : `เกินกำหนด ${formatAmount(finance.totals_thb.overdue)}`
                            }
                        />
                        <Stat label="ยังไม่ออกบิล" value={finance.totals_thb.unbilled} />
                    </div>

                    {finance.currencies.some((row) => row.currency !== "THB") && (
                        <ul className="grid gap-1 text-xs text-gray-600">
                            {finance.currencies.map((row) => (
                                <li key={row.currency} className="tabular-nums">
                                    {row.currency}: สัญญา {formatAmount(row.contract)} · ออกบิล{" "}
                                    {formatAmount(row.billed)} · รับแล้ว {formatAmount(row.received)} · ค้าง{" "}
                                    {formatAmount(row.outstanding)} · ยังไม่ออกบิล {formatAmount(row.unbilled)}
                                </li>
                            ))}
                        </ul>
                    )}

                    {finance.quotations.map((quotation) => (
                        <div key={quotation.qt_id} className="grid gap-3 rounded-xl border border-gray-200 p-4">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="grid min-w-0 gap-0.5">
                                    <Link
                                        href={`/sales/quotations/view?id=${quotation.qt_id}`}
                                        className="-my-2 py-2 text-sm font-medium text-blue-600 tabular-nums hover:underline"
                                    >
                                        {quotation.qt_number}
                                    </Link>
                                    <span className="wrap-break-word text-sm text-gray-700">{quotation.qt_title}</span>
                                </div>
                                <span className="text-sm font-medium text-gray-900 tabular-nums">
                                    {formatAmount(quotation.qt_total)} {quotation.qt_currency}
                                </span>
                            </div>

                            <div className="grid gap-2 sm:grid-cols-2">
                                <PercentBar
                                    label="งานเสร็จ (ประมาณ ตามมูลค่ารายการ)"
                                    percent={quotation.progress_percent}
                                    tone="bg-blue-500"
                                />
                                <PercentBar
                                    label="ออกบิลไปแล้ว"
                                    percent={quotation.billed_percent}
                                    tone="bg-green-500"
                                />
                            </div>
                            {quotation.items_without_tasks > 0 && (
                                <FieldHint>
                                    {quotation.items_without_tasks} รายการไม่มีงานผูกไว้ — ไม่นับในความคืบหน้า
                                </FieldHint>
                            )}
                            {quotation.is_work_ahead_of_billing && quotation.next_milestone && (
                                <StatusBanner tone="warn" title="งานเดินหน้ากว่าการเก็บเงิน">
                                    งานเสร็จนำหน้าการออกบิลเกิน {finance.progress_ahead_threshold} จุด —
                                    ตรวจว่าถึงงวดที่ {quotation.next_milestone.qtm_order} (
                                    {quotation.next_milestone.qtm_name}) หรือยัง
                                </StatusBanner>
                            )}

                            <ul className="grid gap-1.5 text-sm">
                                {quotation.milestones.map((milestone) => {
                                    const state = MILESTONE_STATES[milestone.state];
                                    return (
                                        <li
                                            key={milestone.qtm_id}
                                            className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5"
                                        >
                                            <span className="min-w-0 wrap-break-word text-gray-800">
                                                งวดที่ {milestone.qtm_order} {milestone.qtm_name}
                                            </span>
                                            <span className="tabular-nums text-gray-900">
                                                {formatAmount(milestone.qtm_amount)}
                                            </span>
                                            <span className="col-span-2 flex flex-wrap items-center gap-2 text-xs">
                                                <StatusPill tone={state.tone}>{state.label}</StatusPill>
                                                {milestone.invoice && (
                                                    <Link
                                                        href={`/sales/invoices/view?id=${milestone.invoice.inv_id}`}
                                                        className="-my-2.5 py-2.5 text-blue-600 tabular-nums hover:underline"
                                                    >
                                                        {milestone.invoice.inv_number ?? "เปิดร่าง"}
                                                    </Link>
                                                )}
                                            </span>
                                        </li>
                                    );
                                })}
                            </ul>
                            {canCreateInvoice && quotation.next_milestone && (
                                <Link
                                    href={`/sales/invoices/new?quotation=${quotation.qt_id}`}
                                    className={`${buttonClass("secondary", "sm")} justify-self-start`}
                                >
                                    <FileText size={14} />
                                    ออกใบแจ้งหนี้งวดถัดไป
                                </Link>
                            )}
                        </div>
                    ))}

                    {finance.invoices.some((invoice) => invoice.inv_source === "manual") && (
                        <div className="grid gap-2">
                            <h3 className="text-sm font-medium text-gray-900">ใบแจ้งหนี้นอกใบเสนอราคา (สร้างเอง)</h3>
                            <ul className="grid gap-1.5 text-sm">
                                {finance.invoices
                                    .filter((invoice) => invoice.inv_source === "manual")
                                    .map((invoice) => (
                                        <li key={invoice.inv_id} className="grid grid-cols-[1fr_auto] gap-x-3">
                                            <Link
                                                href={`/sales/invoices/view?id=${invoice.inv_id}`}
                                                className="-my-2 py-2 text-blue-600 tabular-nums hover:underline"
                                            >
                                                {invoice.inv_number ?? "ร่าง"} · {invoice.inv_title}
                                            </Link>
                                            <span className="tabular-nums">
                                                {formatAmount(invoice.inv_total)} {invoice.inv_currency}
                                            </span>
                                            {invoice.inv_status === "issued" && !isZero(invoice.outstanding_amount) && (
                                                <span
                                                    className={`col-span-2 text-xs ${invoice.is_overdue ? "text-red-600" : "text-gray-500"}`}
                                                >
                                                    ค้าง {formatAmount(invoice.outstanding_amount)}
                                                    {invoice.is_overdue ? " · เกินกำหนด" : ""}
                                                </span>
                                            )}
                                        </li>
                                    ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}
        </SectionCard>
    );
}
