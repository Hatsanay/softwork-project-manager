"use client";

// ส่วนแบ่งกำไรของโปรเจกต์ (2026-10-25 · P-2 · ?id=<project_id>)
// บนลงล่าง: ที่มาของกำไร → ส่วนแบ่งของแต่ละคน (ประมาณการ หรือยอดที่ปิดแล้ว) → เบิกล่วงหน้า
// ยังไม่ปิดยอด: แก้ส่วนแบ่ง · เบิก · ปิดยอด | ปิดยอดแล้ว: บันทึกจ่ายรายคน · ยกเลิกการปิดยอด (เมื่อยังไม่ได้จ่ายใคร)
import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Coins, HandCoins, Lock, Users } from "lucide-react";
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
import { formatAmount, parseHundredths } from "@/lib/shared/money.mjs";
import { formatDateOnly } from "@/app/function";
import type { ProjectSharesDetail, ShareAdvance, SettlementLine } from "../../_types";
import { SHARE_MESSAGES } from "../../_messages";
import ProfitBreakdown, { TotalLine } from "../../_components/profit-breakdown";
import SharesEditor from "../../_components/shares-editor";
import { AdvanceSheet, PayLineSheet, SettleSheet } from "../../_components/share-sheets";

export default function ProjectSharesPage() {
    return (
        <Suspense fallback={<PageSkeleton />}>
            <ProjectSharesContent />
        </Suspense>
    );
}

function shareLabel(kind: "percent" | "fixed", percent: string | null) {
    return kind === "percent" ? `${Number(percent)}% ของกำไรหลังหักส่วนตายตัว` : "จำนวนเงินตายตัว";
}

function ProjectSharesContent() {
    const searchParams = useSearchParams();
    const projectId = searchParams.get("id") ?? "";
    const hasBit = usePermission();
    const canManage = hasBit(BITS.manageProfitShares);
    const canPickVendors = [BITS.manageVendors, BITS.viewExpenses, BITS.createExpense, BITS.makePayment].some((bit) => hasBit(bit));
    const [detail, setDetail] = useState<ProjectSharesDetail | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [isAdvancing, setIsAdvancing] = useState(false);
    const [isSettling, setIsSettling] = useState(false);
    const [payingLine, setPayingLine] = useState<SettlementLine | null>(null);
    const [cancellingAdvance, setCancellingAdvance] = useState<ShareAdvance | null>(null);
    const [isCancellingSettlement, setIsCancellingSettlement] = useState(false);
    const [cancelError, setCancelError] = useState<string | null>(null);
    const [isCancelling, setIsCancelling] = useState(false);

    const load = useCallback(async () => {
        const { data, error } = await apiFetch<ProjectSharesDetail>(`/profit-shares/projects/${encodeURIComponent(projectId)}`);
        setLoadError(error);
        if (data) setDetail(data);
    }, [projectId]);

    useEffect(() => {
        if (!canManage || !projectId) return;
        let isLeftPage = false;
        apiFetch<ProjectSharesDetail>(`/profit-shares/projects/${encodeURIComponent(projectId)}`).then(({ data, error }) => {
            if (isLeftPage) return;
            setLoadError(error);
            if (data) setDetail(data);
        });
        return () => {
            isLeftPage = true;
        };
    }, [canManage, projectId]);

    async function afterSharesSaved() {
        setIsEditing(false);
        await load();
    }

    async function cancelAdvance(reason: string) {
        if (!cancellingAdvance) return;
        setIsCancelling(true);
        const { error } = await apiFetch(`/profit-shares/advances/${cancellingAdvance.sha_id}/cancel`, { method: "POST", body: { reason } });
        setIsCancelling(false);
        if (error) {
            setCancelError(error.message);
            return;
        }
        setCancellingAdvance(null);
        setCancelError(null);
        toast.success("ยกเลิกการเบิกแล้ว");
        await load();
    }

    async function cancelSettlement(reason: string) {
        if (!detail?.settlement) return;
        setIsCancelling(true);
        const { error } = await apiFetch(`/profit-shares/settlements/${detail.settlement.sst_id}/cancel`, {
            method: "POST",
            body: { reason, sst_version: detail.settlement.sst_version },
        });
        setIsCancelling(false);
        if (error) {
            setCancelError(error.message);
            return;
        }
        setIsCancellingSettlement(false);
        setCancelError(null);
        toast.success("ยกเลิกการปิดยอดแล้ว แก้ส่วนแบ่งแล้วปิดยอดใหม่ได้");
        await load();
    }

    const header = (
        <PageHeader
            eyebrow="ส่วนแบ่งกำไร"
            title={detail?.project.project_name ?? "ส่วนแบ่งของโปรเจกต์"}
            description={
                detail
                    ? [detail.project.project_channel === "fastwork" ? "งาน Fastwork" : "ลูกค้าตรง", detail.project.client_name].filter(Boolean).join(" · ")
                    : undefined
            }
            actions={
                <div className="flex flex-wrap gap-2">
                    <Link href="/fastwork/shares" className={buttonClass("secondary", "md")}>
                        ทุกโปรเจกต์
                    </Link>
                    {projectId && (
                        <Link href={`/projects/view?id=${projectId}`} className={buttonClass("secondary", "md")}>
                            เปิดโปรเจกต์
                        </Link>
                    )}
                </div>
            }
        />
    );

    if (!canManage) {
        return (
            <div className="grid w-full grid-cols-1 gap-6">
                {header}
                <StatusBanner tone="info" title="ต้องมีสิทธิ์จัดการส่วนแบ่งกำไร">
                    ส่วนแบ่งของคุณเองดูได้ที่{" "}
                    <Link href="/people/my-shares" className="-my-2.5 inline-block py-2.5 text-blue-600 hover:underline">
                        ส่วนแบ่งของฉัน
                    </Link>
                </StatusBanner>
            </div>
        );
    }
    if (!projectId || loadError) {
        return (
            <div className="grid w-full grid-cols-1 gap-6">
                {header}
                <StatusBanner tone="error" title="โหลดส่วนแบ่งไม่สำเร็จ">
                    {loadError?.message ?? "ไม่ได้ระบุโปรเจกต์ · กลับไปเลือกจากรายการ"}
                </StatusBanner>
            </div>
        );
    }
    if (!detail) return <PageSkeleton />;

    const { profit, estimate, settlement, expected } = detail;
    const isSettled = settlement !== null;
    // ยังมีงวด/ใบที่ยังไม่ได้รับเงิน = แสดงคอลัมน์ "ถ้าเงินเข้าครบ" (ปิดยอดแล้วไม่แสดง ตัวเลขล็อกแล้ว)
    const showExpected = !isSettled && Number(expected.remaining_revenue) > 0;
    const hasShares = detail.shares.length > 0;
    const showEditor = !isSettled && (isEditing || !hasShares);
    const paidAdvances = detail.advances.filter((advance) => advance.sha_status === "paid");
    const hasPayments = settlement?.lines.some((line) => line.ssl_status === "paid" && Number(line.ssl_due) !== 0) ?? false;

    return (
        <div className="grid w-full grid-cols-1 gap-5">
            {header}

            {isSettled && detail.changed_since_settlement && (
                <StatusBanner tone="warn" title="ตัวเลขตอนนี้ต่างจากตอนปิดยอด">
                    กำไรที่แบ่งได้ตอนนี้ {formatAmount(profit.distributable)} บาท แต่ปิดยอดไว้ที่ {formatAmount(settlement.sst_distributable)} บาท (เช่น
                    มีค่าใช้จ่ายมาทีหลัง) ·{" "}
                    {hasPayments ? "จ่ายไปแล้วบางคน ยกเลิกการปิดยอดไม่ได้ ให้ปรับในโปรเจกต์ถัดไป" : "ยกเลิกการปิดยอดแล้วปิดใหม่ เพื่อให้ตัวเลขตรง"}
                </StatusBanner>
            )}
            {!isSettled && profit.pending_payouts > 0 && (
                <StatusBanner tone="wait" title={`เงิน Fastwork รอโอน ${profit.pending_payouts} รายการ`}>
                    ยังไม่นับเป็นรายได้จนกว่าจะยืนยันเงินเข้า ·{" "}
                    <Link href={`/fastwork/payouts?status=pending&project=${projectId}`} className="-my-2.5 inline-block py-2.5 text-blue-600 hover:underline">
                        ไปยืนยันเงินเข้า
                    </Link>
                </StatusBanner>
            )}

            <SectionCard
                title="ที่มาของกำไร"
                icon={Coins}
                description={
                    isSettled
                        ? `ตัวเลข ณ วันปิดยอด ${formatDateOnly(settlement.sst_settled_date)} (ล็อกแล้ว)`
                        : showExpected
                          ? SHARE_MESSAGES.expected
                          : SHARE_MESSAGES.estimate
                }
            >
                <ProfitBreakdown
                    revenue={isSettled ? settlement.sst_revenue : profit.revenue}
                    platformFee={isSettled ? settlement.sst_platform_fee : profit.platform_fee}
                    expenseCost={isSettled ? settlement.sst_expense_cost : profit.expense_cost}
                    distributable={isSettled ? settlement.sst_distributable : profit.distributable}
                    fixedTotal={isSettled ? settlement.sst_fixed_total : estimate.fixed_total}
                    afterFixed={isSettled ? settlement.sst_after_fixed : estimate.after_fixed}
                    revenueItems={profit.revenue_items}
                    expenseItems={profit.expense_items}
                    expected={
                        showExpected
                            ? {
                                  revenue: expected.revenue,
                                  platformFee: expected.platform_fee,
                                  expenseCost: expected.expense_cost,
                                  distributable: expected.distributable,
                                  fixedTotal: expected.fixed_total,
                                  afterFixed: expected.after_fixed,
                              }
                            : undefined
                    }
                />
                {!isSettled && Number(profit.pending_expense) > 0 && (
                    <FieldHint>มีค่าใช้จ่ายที่ยังไม่อนุมัติ {formatAmount(profit.pending_expense)} บาท ยังไม่หักในตัวเลขนี้</FieldHint>
                )}
            </SectionCard>

            <SectionCard
                title={isSettled ? "ส่วนแบ่งที่ปิดยอดแล้ว" : "ส่วนแบ่งของแต่ละคน"}
                icon={Users}
                description={SHARE_MESSAGES.formula}
                actions={
                    !isSettled &&
                    hasShares &&
                    !isEditing && (
                        <div className="flex flex-wrap gap-2">
                            <button type="button" className={buttonClass("secondary", "md")} onClick={() => setIsEditing(true)}>
                                แก้ส่วนแบ่ง
                            </button>
                            <button type="button" className={buttonClass("primary", "md")} onClick={() => setIsSettling(true)}>
                                <Lock size={16} />
                                ปิดยอด
                            </button>
                        </div>
                    )
                }
            >
                {showEditor ? (
                    <SharesEditor
                        key={detail.shares.map((share) => share.shr_id).join(",")}
                        detail={detail}
                        canPickVendors={canPickVendors}
                        onCancel={hasShares ? () => setIsEditing(false) : null}
                        onSaved={afterSharesSaved}
                    />
                ) : isSettled ? (
                    <SettlementTable
                        lines={settlement.lines}
                        companyAmount={settlement.sst_company_amount}
                        distributable={settlement.sst_distributable}
                        onPay={setPayingLine}
                    />
                ) : (
                    <EstimateTable detail={detail} showExpected={showExpected} />
                )}
                {isSettled && (
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
                        <FieldHint>
                            {hasPayments
                                ? "จ่าย/รับคืนไปแล้วบางคน จึงยกเลิกการปิดยอดไม่ได้"
                                : "ยกเลิกการปิดยอดได้เพราะยังไม่ได้จ่ายใคร · ยกเลิกแล้วแก้ส่วนแบ่งและปิดใหม่ได้"}
                        </FieldHint>
                        {!hasPayments && (
                            <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setIsCancellingSettlement(true)}>
                                ยกเลิกการปิดยอด
                            </button>
                        )}
                    </div>
                )}
            </SectionCard>

            <SectionCard
                title="เบิกล่วงหน้า"
                icon={HandCoins}
                description={SHARE_MESSAGES.advance}
                actions={
                    !isSettled &&
                    hasShares && (
                        <button type="button" className={buttonClass("secondary", "md")} onClick={() => setIsAdvancing(true)}>
                            บันทึกการเบิก
                        </button>
                    )
                }
            >
                {!hasShares && !isSettled && <FieldHint>ตั้งส่วนแบ่งก่อน แล้วจึงเบิกล่วงหน้าได้ (ผู้เบิกต้องอยู่ในรายชื่อส่วนแบ่ง)</FieldHint>}
                {detail.advances.length === 0 ? (
                    <p className="text-sm text-gray-500">ยังไม่มีการเบิก</p>
                ) : (
                    <ul className="grid gap-2">
                        {detail.advances.map((advance) => (
                            <li key={advance.sha_id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-100 p-3">
                                <div className="grid min-w-0 gap-0.5">
                                    <span className={`text-sm ${advance.sha_status === "cancelled" ? "text-gray-400 line-through" : "text-gray-900"}`}>
                                        {advance.sha_recipient_name} · <span className="tabular-nums">{formatAmount(advance.sha_amount)}</span> บาท
                                    </span>
                                    <span className="text-xs text-gray-500">
                                        {[formatDateOnly(advance.sha_paid_date), advance.bank_account_label, advance.sha_reference, advance.sha_note]
                                            .filter(Boolean)
                                            .join(" · ")}
                                    </span>
                                    {advance.sha_status === "cancelled" && advance.sha_cancel_reason && (
                                        <span className="text-xs text-red-600">ยกเลิก: {advance.sha_cancel_reason}</span>
                                    )}
                                </div>
                                {advance.sha_status === "paid" && !isSettled && (
                                    <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setCancellingAdvance(advance)}>
                                        ยกเลิก
                                    </button>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
                {paidAdvances.length > 0 && (
                    <p className="text-sm text-gray-700">
                        รวมเบิกแล้ว{" "}
                        <span className="font-medium tabular-nums">
                            {formatAmount(paidAdvances.reduce((sum, advance) => sum + parseHundredths(advance.sha_amount, "ยอดเบิก"), 0n))}
                        </span>{" "}
                        บาท
                    </p>
                )}
            </SectionCard>

            {isAdvancing && <AdvanceSheet detail={detail} onClose={() => setIsAdvancing(false)} onSaved={load} />}
            {isSettling && <SettleSheet detail={detail} onClose={() => setIsSettling(false)} onSaved={load} />}
            {payingLine && settlement && (
                <PayLineSheet
                    key={payingLine.ssl_id}
                    line={payingLine}
                    projectName={detail.project.project_name}
                    settledDate={settlement.sst_settled_date}
                    onClose={() => setPayingLine(null)}
                    onSaved={load}
                />
            )}
            <ReasonDialog
                open={Boolean(cancellingAdvance)}
                title="ยกเลิกการเบิกนี้?"
                description={
                    cancellingAdvance
                        ? `${cancellingAdvance.sha_recipient_name} · ${formatAmount(cancellingAdvance.sha_amount)} บาท · ใช้เมื่อบันทึกผิดหรือได้เงินคืนแล้ว รายการไม่ถูกลบ`
                        : undefined
                }
                reasonLabel="เหตุผล"
                confirmLabel="ยกเลิกการเบิก"
                tone="danger"
                loading={isCancelling}
                errorMessage={cancelError}
                onConfirm={cancelAdvance}
                onCancel={() => {
                    setCancellingAdvance(null);
                    setCancelError(null);
                }}
            />
            <ReasonDialog
                open={isCancellingSettlement}
                title="ยกเลิกการปิดยอด?"
                description="ตัวเลขที่ล็อกไว้จะถูกยกเลิก (เก็บประวัติไว้) แก้ส่วนแบ่ง/เบิกเพิ่ม/บันทึกเงิน Fastwork ได้อีก แล้วปิดยอดใหม่"
                reasonLabel="เหตุผล (เช่น มีค่าใช้จ่ายมาทีหลัง ตั้ง % ผิด)"
                confirmLabel="ยกเลิกการปิดยอด"
                tone="danger"
                loading={isCancelling}
                errorMessage={cancelError}
                onConfirm={cancelSettlement}
                onCancel={() => {
                    setIsCancellingSettlement(false);
                    setCancelError(null);
                }}
            />
        </div>
    );
}

/** ประมาณการ ณ วันนี้: ส่วนแบ่ง − เบิกแล้ว = ต้องจ่าย · แถวสุดท้ายเข้าเงินทุน → ผลรวม = กำไรที่แบ่งได้ */
function EstimateTable({ detail, showExpected }: { detail: ProjectSharesDetail; showExpected: boolean }) {
    return (
        <div className="grid gap-2">
            {showExpected && (
                <div className="flex justify-end gap-3 text-xs text-gray-500">
                    <span className="w-24 text-right sm:w-32">ได้ตอนนี้</span>
                    <span className="w-24 text-right sm:w-32">ถ้าเงินเข้าครบ</span>
                </div>
            )}
            <ul className="grid gap-2">
                {detail.shares.map((share, index) => {
                    const line = detail.estimate.lines[index];
                    const expectedAmount = detail.expected.lines[index]?.amount;
                    return (
                        <li key={share.shr_id} className="grid gap-1 rounded-xl border border-gray-100 p-3 sm:grid-cols-[1fr_auto] sm:items-center">
                            <div className="grid min-w-0 gap-0.5">
                                <span className="font-medium wrap-break-word text-gray-900">{share.recipient_name}</span>
                                <span className="text-xs text-gray-500">
                                    {[shareLabel(share.shr_kind, share.shr_percent), share.shr_vendor_id ? "ผู้ขาย/ฟรีแลนซ์" : null, share.shr_note]
                                        .filter(Boolean)
                                        .join(" · ")}
                                </span>
                            </div>
                            <span className="text-sm text-gray-700 tabular-nums sm:text-right">
                                <span className="flex justify-end gap-3">
                                    <span className={showExpected ? "w-24 text-right sm:w-32" : ""}>{formatAmount(line.amount)}</span>
                                    {showExpected && expectedAmount !== undefined && (
                                        <span className="w-24 text-right font-medium text-gray-900 sm:w-32">{formatAmount(expectedAmount)}</span>
                                    )}
                                </span>
                                {Number(line.advanced) > 0 && (
                                    <span className="block text-xs text-gray-500">
                                        เบิกแล้ว {formatAmount(line.advanced)} · คงเหลือ {formatAmount(line.due)}
                                    </span>
                                )}
                            </span>
                        </li>
                    );
                })}
            </ul>
            <div className="rounded-xl bg-gray-50 px-3">
                <TotalLine
                    label="เข้าเงินทุน (ส่วนที่เหลือ)"
                    amount={detail.estimate.company_amount}
                    expectedAmount={showExpected ? detail.expected.company_amount : undefined}
                />
            </div>
            <FieldHint>ส่วนแบ่งทุกคน + เข้าเงินทุน = กำไรที่แบ่งได้พอดี{showExpected ? " (ทั้งสองคอลัมน์)" : ""}</FieldHint>
            {Number(showExpected ? detail.expected.company_amount : detail.estimate.company_amount) <= 0 && (
                <StatusBanner tone="wait" title="งานนี้ไม่มีเงินเข้าเงินทุน">
                    แบ่งให้ผู้รับครบแล้ว · ถ้าต้องการเก็บเงินทุนเปิดบริษัทจากงานนี้ กด &quot;แก้ส่วนแบ่ง&quot; แล้วลด % ของบางคนลง
                </StatusBanner>
            )}
        </div>
    );
}

/** ยอดที่ปิดแล้ว: ส่วนแบ่ง − เบิกแล้ว = ต้องจ่าย (ติดลบ = ต้องคืน) · จ่ายแล้วแสดงยอดโอนและวันที่ */
function SettlementTable({
    lines,
    companyAmount,
    distributable,
    onPay,
}: {
    lines: SettlementLine[];
    companyAmount: string;
    distributable: string;
    onPay: (line: SettlementLine) => void;
}) {
    return (
        <div className="grid gap-2">
            <ul className="grid gap-2">
                {lines.map((line) => {
                    const isRefund = line.ssl_due.startsWith("-");
                    const isPaid = line.ssl_status === "paid";
                    return (
                        <li key={line.ssl_id} className="grid gap-2 rounded-xl border border-gray-100 p-3 sm:grid-cols-[1fr_auto] sm:items-center">
                            <div className="grid min-w-0 gap-0.5">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-medium wrap-break-word text-gray-900">{line.ssl_recipient_name}</span>
                                    <StatusPill tone={isPaid ? "success" : "wait"}>
                                        {isPaid ? (Number(line.ssl_due) === 0 ? "ไม่มียอดค้าง" : isRefund ? "รับคืนแล้ว" : "จ่ายแล้ว") : isRefund ? "รอรับคืน" : "รอจ่าย"}
                                    </StatusPill>
                                </div>
                                <span className="text-xs text-gray-500">{shareLabel(line.ssl_kind, line.ssl_percent)}</span>
                                <span className="text-sm text-gray-700 tabular-nums">
                                    {formatAmount(line.ssl_amount)} − เบิกแล้ว {formatAmount(line.ssl_advanced)} ={" "}
                                    <span className="font-medium text-gray-900">
                                        {isRefund ? `ต้องคืน ${formatAmount(line.ssl_due.slice(1))}` : `ต้องจ่าย ${formatAmount(line.ssl_due)}`}
                                    </span>
                                </span>
                                {isPaid && Number(line.ssl_due) !== 0 && (
                                    <span className="text-xs text-gray-500">
                                        {[
                                            Number(line.ssl_wht) > 0 ? `หัก ณ ที่จ่าย ${formatAmount(line.ssl_wht)}` : null,
                                            line.ssl_transfer_amount ? `โอน ${formatAmount(line.ssl_transfer_amount.replace("-", ""))}` : null,
                                            line.ssl_paid_date ? formatDateOnly(line.ssl_paid_date) : null,
                                            line.bank_account_label,
                                            line.ssl_reference,
                                        ]
                                            .filter(Boolean)
                                            .join(" · ")}
                                    </span>
                                )}
                            </div>
                            {!isPaid && (
                                <button type="button" className={buttonClass("primary", "sm")} onClick={() => onPay(line)}>
                                    {isRefund ? "บันทึกรับคืน" : "บันทึกจ่าย"}
                                </button>
                            )}
                        </li>
                    );
                })}
            </ul>
            <div className="rounded-xl bg-gray-50 px-3">
                <TotalLine label="เข้าเงินทุน (ส่วนที่เหลือ)" amount={companyAmount} />
            </div>
            <FieldHint>ส่วนแบ่งทุกคน + เข้าเงินทุน = กำไรที่แบ่งได้ {formatAmount(distributable)} บาท พอดี</FieldHint>
        </div>
    );
}
