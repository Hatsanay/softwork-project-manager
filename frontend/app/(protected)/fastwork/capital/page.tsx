"use client";

// เงินทุนสะสม (2026-10-25 · P-3 · ขั้นที่ 10 ของหน้า Fastwork · docs/plans/2026-10-24-pre-incorporation.md ข้อ 12)
// บนลงล่าง: สถานะรูปแบบกิจการ → ยอดเงินทุน (เข้าจากโปรเจกต์ + ฝาก − ถอน) → เทียบเป้า + คาดการณ์ → เพดาน VAT → รายการ
// ยอดจากโปรเจกต์อ่านจากการปิดยอดส่วนแบ่ง (ไม่เก็บซ้ำ) · ฝาก/ถอนยกเลิกได้พร้อมเหตุผล
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Landmark, Minus, Plus, Receipt, Target } from "lucide-react";
import PageHeader from "@/components/ui/page-header";
import SectionCard from "@/components/ui/section-card";
import StatusBanner from "@/components/ui/guidance/status-banner";
import FieldHint from "@/components/ui/guidance/field-hint";
import ReasonDialog from "@/components/ui/reason-dialog";
import StatusPill from "@/components/ui/status-pill";
import { PageSkeleton } from "@/components/ui/skeleton";
import { buttonClass } from "@/components/ui/button";
import { usePermission, BITS } from "@/app/components/permission-provider";
import { apiFetch, type ApiError } from "@/lib/api";
import { formatAmount } from "@/lib/shared/money.mjs";
import { formatDateOnly } from "@/app/function";
import type { CapitalEntry, CapitalOverview } from "../_types";
import { CAPITAL_MESSAGES } from "../_messages";
import { TotalLine } from "../_components/profit-breakdown";
import { EntrySheet, GoalSheet } from "../_components/capital-sheets";

/** "2027-02" → "ก.พ. 2570" */
function monthLabel(yearMonth: string) {
    const [year, month] = yearMonth.split("-").map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString("th-TH", { month: "short", year: "numeric" });
}

function ProgressBar({ percent, label }: { percent: number; label: string }) {
    const width = Math.max(0, Math.min(100, percent));
    return (
        <div role="progressbar" aria-label={label} aria-valuenow={Math.round(width)} aria-valuemin={0} aria-valuemax={100} className="h-3 overflow-hidden rounded-full bg-gray-100">
            <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${width}%` }} />
        </div>
    );
}

function AmountLine({ label, amount }: { label: string; amount: string }) {
    return (
        <div className="flex items-baseline justify-between gap-3 py-1 text-gray-700">
            <span>{label}</span>
            <span className="shrink-0 tabular-nums">{formatAmount(amount)}</span>
        </div>
    );
}

export default function CapitalPage() {
    const hasBit = usePermission();
    const canManage = hasBit(BITS.manageCapitalFund);
    const [overview, setOverview] = useState<CapitalOverview | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);
    const [entryKind, setEntryKind] = useState<"deposit" | "withdraw" | null>(null);
    const [isEditingGoal, setIsEditingGoal] = useState(false);
    const [cancelling, setCancelling] = useState<CapitalEntry | null>(null);
    const [cancelError, setCancelError] = useState<string | null>(null);
    const [isCancelling, setIsCancelling] = useState(false);

    const load = useCallback(async () => {
        const { data, error } = await apiFetch<CapitalOverview>("/capital");
        setLoadError(error);
        if (data) setOverview(data);
    }, []);

    useEffect(() => {
        if (!canManage) return;
        let isLeftPage = false;
        apiFetch<CapitalOverview>("/capital").then(({ data, error }) => {
            if (isLeftPage) return;
            setLoadError(error);
            if (data) setOverview(data);
        });
        return () => {
            isLeftPage = true;
        };
    }, [canManage]);

    async function cancelEntry(reason: string) {
        if (!cancelling) return;
        setIsCancelling(true);
        const { error } = await apiFetch(`/capital/entries/${cancelling.cpe_id}/cancel`, { method: "POST", body: { reason } });
        setIsCancelling(false);
        if (error) {
            setCancelError(error.message);
            return;
        }
        setCancelling(null);
        setCancelError(null);
        toast.success("ยกเลิกรายการแล้ว");
        await load();
    }

    const header = (
        <PageHeader
            eyebrow="Fastwork · ขั้นที่ 10"
            title="เงินทุนสะสม"
            description={CAPITAL_MESSAGES.description}
            actions={
                canManage &&
                overview && (
                    <div className="flex flex-wrap gap-2">
                        <button type="button" className={buttonClass("secondary", "md")} onClick={() => setEntryKind("withdraw")}>
                            <Minus size={16} />
                            ถอนออก
                        </button>
                        <button type="button" className={buttonClass("primary", "md")} onClick={() => setEntryKind("deposit")}>
                            <Plus size={16} />
                            ฝากเพิ่ม
                        </button>
                    </div>
                )
            }
        />
    );

    if (!canManage) {
        return (
            <div className="grid w-full grid-cols-1 gap-6">
                {header}
                <StatusBanner tone="info" title="ต้องมีสิทธิ์จัดการเงินทุนสะสม">
                    ยอดเงินทุนเห็นได้เฉพาะผู้มีสิทธิ์ &quot;จัดการเงินทุนสะสม&quot;
                </StatusBanner>
            </div>
        );
    }
    if (loadError) {
        return (
            <div className="grid w-full grid-cols-1 gap-6">
                {header}
                <StatusBanner tone="error" title="โหลดเงินทุนไม่สำเร็จ">
                    {loadError.message}
                </StatusBanner>
            </div>
        );
    }
    if (!overview) return <PageSkeleton />;

    const { totals, goal, forecast, business, vat_ceiling: vat } = overview;

    return (
        <div className="grid w-full grid-cols-1 gap-5">
            {header}

            {business.incorporated_on ? (
                <StatusBanner tone="done" title={`จดบริษัทแล้วเมื่อ ${formatDateOnly(business.incorporated_on)}`}>
                    ถอนเงินทุนที่นำไปเป็นทุนจดทะเบียน ใส่เหตุผลว่า &quot;นำไปจดบริษัท&quot; เพื่อปิดยอดช่วงก่อนจด
                </StatusBanner>
            ) : (
                <StatusBanner tone="info" title="ตอนนี้: บุคคลธรรมดา (ยังไม่จดบริษัท)">
                    จดบริษัทแล้ว ใส่วันที่จดใน{" "}
                    <Link href="/settings/company" className="-my-2.5 inline-block py-2.5 text-blue-600 hover:underline">
                        ตั้งค่าบริษัท
                    </Link>{" "}
                    แล้วเปลี่ยนชื่อและเลขผู้เสียภาษีเป็นของบริษัท
                </StatusBanner>
            )}

            <div className="grid gap-5 xl:grid-cols-2">
                <SectionCard title="ยอดเงินทุน" icon={Landmark} description={CAPITAL_MESSAGES.balance}>
                    <div className="grid gap-1 rounded-xl bg-gray-50 p-3 text-sm">
                        <AmountLine label={`เข้าจากโปรเจกต์ (${overview.project_inflows.length} โปรเจกต์)`} amount={totals.from_projects} />
                        <AmountLine label="+ ฝากเพิ่มเอง" amount={totals.deposits} />
                        <AmountLine label="− ถอนออก" amount={totals.withdrawals} />
                        <TotalLine label="= ยอดเงินทุนสะสม" amount={totals.balance} />
                    </div>
                </SectionCard>

                <SectionCard
                    title="เทียบเป้า"
                    icon={Target}
                    description={CAPITAL_MESSAGES.forecast}
                    actions={
                        <button type="button" className={buttonClass("secondary", "sm")} onClick={() => setIsEditingGoal(true)}>
                            {goal.amount ? "แก้เป้า" : "ตั้งเป้า"}
                        </button>
                    }
                >
                    {goal.amount === null ? (
                        <p className="text-sm text-gray-500">ยังไม่ได้ตั้งเป้า · ตั้งเป้าเงินทุนที่อยากมีก่อนจดบริษัท ระบบจะคาดให้ว่าถึงเป้าเดือนไหน</p>
                    ) : (
                        <div className="grid gap-3">
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                                <span className="text-sm text-gray-700">
                                    {formatAmount(totals.balance)} / {formatAmount(goal.amount)} บาท
                                </span>
                                <span className="text-base font-medium text-gray-900 tabular-nums">{goal.percent ?? 0}%</span>
                            </div>
                            <ProgressBar percent={goal.percent ?? 0} label="ความคืบหน้าเงินทุน" />
                            <div className="grid gap-1 rounded-xl bg-gray-50 p-3 text-sm">
                                <AmountLine label="ขาดอีก" amount={forecast.remaining ?? "0"} />
                                <AmountLine label="เงินเข้าสุทธิเฉลี่ยต่อเดือน" amount={forecast.monthly_average} />
                                <div className="flex items-baseline justify-between gap-3 border-t border-gray-200 pt-1.5">
                                    <span className="font-medium text-gray-900">คาดว่าถึงเป้า</span>
                                    <span className="font-medium text-gray-900">
                                        {forecast.remaining === "0.00"
                                            ? "ถึงเป้าแล้ว"
                                            : forecast.reach_month
                                              ? monthLabel(forecast.reach_month)
                                              : "ยังคาดไม่ได้ (เฉลี่ยยังไม่เป็นบวก)"}
                                    </span>
                                </div>
                                {goal.target_date && <FieldHint>ตั้งใจจดบริษัท {formatDateOnly(goal.target_date)}</FieldHint>}
                            </div>
                        </div>
                    )}
                </SectionCard>
            </div>

            {vat && (
                <SectionCard title={`รายได้ปี ${vat.year + 543} เทียบเพดาน VAT`} icon={Receipt} description={CAPITAL_MESSAGES.vat}>
                    {vat.state === "over" && (
                        <StatusBanner tone="error" title="รายได้เกิน 1.8 ล้านบาทแล้ว">
                            ต้องยื่นจดทะเบียน VAT ภายใน 30 วันนับจากวันที่รายได้เกิน · ปรึกษานักบัญชี แล้วใส่วันที่จด VAT ในตั้งค่าบริษัท
                        </StatusBanner>
                    )}
                    {vat.state === "near" && (
                        <StatusBanner tone="warn" title={`ใกล้เพดานแล้ว (${vat.percent}%)`}>
                            เหลืออีก {formatAmount(vat.remaining)} บาท · เตรียมเอกสารจด VAT และคุยกับนักบัญชีไว้ก่อน
                        </StatusBanner>
                    )}
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-sm text-gray-700">
                            {formatAmount(vat.income)} / {formatAmount(vat.ceiling)} บาท
                        </span>
                        <span className="text-base font-medium text-gray-900 tabular-nums">{vat.percent}%</span>
                    </div>
                    <ProgressBar percent={vat.percent} label="รายได้เทียบเพดาน VAT" />
                    <div className="grid gap-1 rounded-xl bg-gray-50 p-3 text-sm">
                        <AmountLine label="ยอดขายลูกค้าตรง (ก่อน VAT หักใบลดหนี้)" amount={vat.direct_sales} />
                        <AmountLine label="+ ราคางวด Fastwork ที่เงินเข้าแล้ว" amount={vat.fastwork_gross} />
                        <TotalLine label="= รายได้ปีนี้" amount={vat.income} />
                        <AmountLine label="เหลือก่อนถึงเพดาน" amount={vat.remaining} />
                    </div>
                    {Number(vat.fastwork_fee) > 0 && (
                        <FieldHint>
                            {CAPITAL_MESSAGES.vatPending} · ถ้านับหลังหักค่าธรรมเนียม Fastwork ({formatAmount(vat.fastwork_fee)}) จะเป็น{" "}
                            {formatAmount(vat.income_after_fastwork_fee)} บาท
                        </FieldHint>
                    )}
                </SectionCard>
            )}

            <div className="grid gap-5 xl:grid-cols-2">
                <SectionCard title="เข้าจากโปรเจกต์" description={CAPITAL_MESSAGES.fromProjects}>
                    {overview.project_inflows.length === 0 ? (
                        <p className="text-sm text-gray-500">ยังไม่มีโปรเจกต์ที่ปิดยอดส่วนแบ่ง</p>
                    ) : (
                        <ul className="grid gap-2">
                            {overview.project_inflows.map((row) => (
                                <li key={row.sst_id} className="flex items-baseline justify-between gap-3 rounded-xl border border-gray-100 p-3">
                                    <div className="grid min-w-0 gap-0.5">
                                        <Link
                                            href={`/fastwork/shares/project?id=${row.project_id}`}
                                            className="-my-2 inline-flex min-h-10 min-w-10 items-center text-sm font-medium wrap-break-word text-gray-900 hover:text-blue-600"
                                        >
                                            {row.project_name}
                                        </Link>
                                        <span className="text-xs text-gray-500">
                                            ปิดยอด {formatDateOnly(row.settled_date)} · {row.project_channel === "fastwork" ? "Fastwork" : "ลูกค้าตรง"}
                                        </span>
                                    </div>
                                    <span className={`shrink-0 text-sm tabular-nums ${row.amount.startsWith("-") ? "text-red-600" : "text-gray-900"}`}>
                                        {formatAmount(row.amount)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </SectionCard>

                <SectionCard title="ฝากเพิ่ม / ถอนออก" description={CAPITAL_MESSAGES.cancel}>
                    {overview.entries.length === 0 ? (
                        <p className="text-sm text-gray-500">ยังไม่มีรายการ</p>
                    ) : (
                        <ul className="grid gap-2">
                            {overview.entries.map((entry) => {
                                const isCancelled = entry.cpe_status === "cancelled";
                                const isWithdraw = entry.cpe_kind === "withdraw";
                                return (
                                    <li key={entry.cpe_id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-100 p-3">
                                        <div className="grid min-w-0 gap-0.5">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <StatusPill tone={isCancelled ? "neutral" : isWithdraw ? "wait" : "info"}>
                                                    {isCancelled ? "ยกเลิก" : isWithdraw ? "ถอนออก" : "ฝากเพิ่ม"}
                                                </StatusPill>
                                                <span className={`text-sm tabular-nums ${isCancelled ? "text-gray-400 line-through" : "text-gray-900"}`}>
                                                    {isWithdraw ? "−" : "+"}
                                                    {formatAmount(entry.cpe_amount)}
                                                </span>
                                            </div>
                                            <span className="text-xs text-gray-500">
                                                {[formatDateOnly(entry.cpe_entry_date), entry.cpe_note, entry.created_by_name].filter(Boolean).join(" · ")}
                                            </span>
                                            {isCancelled && entry.cpe_cancel_reason && (
                                                <span className="text-xs text-red-600">ยกเลิก: {entry.cpe_cancel_reason}</span>
                                            )}
                                        </div>
                                        {!isCancelled && (
                                            <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setCancelling(entry)}>
                                                ยกเลิก
                                            </button>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </SectionCard>
            </div>

            {entryKind && <EntrySheet kind={entryKind} balance={totals.balance} onClose={() => setEntryKind(null)} onSaved={load} />}
            {isEditingGoal && <GoalSheet overview={overview} onClose={() => setIsEditingGoal(false)} onSaved={load} />}
            <ReasonDialog
                open={Boolean(cancelling)}
                title="ยกเลิกรายการนี้?"
                description={
                    cancelling
                        ? `${cancelling.cpe_kind === "withdraw" ? "ถอนออก" : "ฝากเพิ่ม"} ${formatAmount(cancelling.cpe_amount)} บาท · ${CAPITAL_MESSAGES.cancel}`
                        : undefined
                }
                reasonLabel="เหตุผล (เช่น บันทึกซ้ำ ใส่ยอดผิด)"
                confirmLabel="ยกเลิกรายการ"
                tone="danger"
                loading={isCancelling}
                errorMessage={cancelError}
                onConfirm={cancelEntry}
                onCancel={() => {
                    setCancelling(null);
                    setCancelError(null);
                }}
            />
        </div>
    );
}
