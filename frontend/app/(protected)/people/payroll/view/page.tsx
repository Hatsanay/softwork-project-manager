"use client";

// รายละเอียดรอบเงินเดือน (ขั้น 4-4) — ยอดรวม · ปัญหาก่อนส่ง · ปุ่มตามสถานะและสิทธิ์ · รายคน (กดดูที่มาของตัวเลข/แก้รายการ)
// ปุ่มบนหน้าจอแค่ซ่อน/แสดงตามสิทธิ์ — backend ตรวจสถานะ เวอร์ชัน และสิทธิ์อนุมัติจริงทุกครั้ง
// U-3 (2026-10-23): แถบขั้นตอน + ขั้นถัดไป · ยอดสรุปคิดจากบนลงล่างจบที่จ่ายสุทธิ · รายคนเป็นตาราง (จอคอม) ค้นหาได้
import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Check, RefreshCw, Send, Undo2, Wallet, X } from "lucide-react";
import PageHeader from "@/components/ui/page-header";
import StatusPill from "@/components/ui/status-pill";
import StatusBanner from "@/components/ui/guidance/status-banner";
import FieldHint from "@/components/ui/guidance/field-hint";
import ReasonDialog from "@/components/ui/reason-dialog";
import FormField, { inputClass } from "@/components/ui/form-field";
import { PageSkeleton } from "@/components/ui/skeleton";
import { CARD_CLASS } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { formatDateOnly } from "@/app/function";
import { usePermission, BITS } from "@/app/components/permission-provider";
import { apiFetch, type ApiError } from "@/lib/api";
import { formatAmount } from "@/lib/shared/money.mjs";
import { PAYROLL_MESSAGES, PAYROLL_STATUS } from "../../_messages";
import type { PayrollItem, PayrollRun } from "../../_types";
import { periodLabel } from "../_lib";
import ItemSheet from "./_components/item-sheet";
import RunItems from "./_components/run-items";
import RunSteps from "./_components/run-steps";

type ReasonAction = "return" | "cancel";

export default function PayrollRunPage() {
    return (
        <Suspense fallback={<PageSkeleton />}>
            <PayrollRunContent />
        </Suspense>
    );
}

// บรรทัดในยอดสรุป: เครื่องหมาย (− =) · ชื่อ · จำนวน ชิดขวา
function SummaryLine({ sign, label, amount, isTotal = false }: { sign: string; label: string; amount: string; isTotal?: boolean }) {
    return (
        <div
            className={`grid grid-cols-[1rem_1fr_auto] items-baseline gap-2 ${isTotal ? "border-t border-gray-200 pt-2 font-medium text-gray-900" : "text-gray-700"}`}
        >
            <span className="text-gray-400" aria-hidden="true">
                {sign}
            </span>
            <span>{label}</span>
            <span className="tabular-nums">{formatAmount(amount)}</span>
        </div>
    );
}

function PayrollRunContent() {
    const runId = Number(useSearchParams().get("id"));
    const hasBit = usePermission();
    const canRun = hasBit(BITS.runPayroll);
    const canApprovePermission = hasBit(BITS.approvePayroll);
    const [run, setRun] = useState<PayrollRun | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);
    const [openItemId, setOpenItemId] = useState<number | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [isWorking, setIsWorking] = useState(false);
    const [reasonAction, setReasonAction] = useState<ReasonAction | null>(null);
    const [reasonError, setReasonError] = useState<string | null>(null);
    const [isMarkingPaid, setIsMarkingPaid] = useState(false);
    const [paidDate, setPaidDate] = useState("");
    const [paidNote, setPaidNote] = useState("");

    const load = useCallback(async () => {
        const { data, error } = await apiFetch<PayrollRun>(`/payroll/runs/${runId}`);
        setLoadError(error);
        if (data) setRun(data);
    }, [runId]);

    useEffect(() => {
        let isLeftPage = false;
        apiFetch<PayrollRun>(`/payroll/runs/${runId}`).then(({ data, error }) => {
            if (isLeftPage) return;
            setLoadError(error);
            if (data) setRun(data);
        });
        return () => {
            isLeftPage = true;
        };
    }, [runId]);

    if (loadError)
        return (
            <StatusBanner tone="error" title="โหลดรอบเงินเดือนไม่สำเร็จ">
                {loadError.message}
            </StatusBanner>
        );
    if (!run) return <PageSkeleton />;

    const status = PAYROLL_STATUS[run.pr_status];
    const isDraft = run.pr_status === "draft";
    const openItem: PayrollItem | null = run.items.find((item) => item.pri_id === openItemId) ?? null;

    async function act(path: string, successMessage: string, body: object = {}) {
        setIsWorking(true);
        setActionError(null);
        const { error } = await apiFetch(`/payroll/runs/${runId}/${path}`, {
            method: "POST",
            body: { pr_version: run!.pr_version, ...body },
        });
        setIsWorking(false);
        await load();
        if (error) {
            setActionError(error.message);
            return error;
        }
        toast.success(successMessage);
        return null;
    }

    async function confirmReason(reason: string) {
        if (!reasonAction) return;
        const error = await act(reasonAction, reasonAction === "return" ? "ตีกลับเป็นร่างแล้ว" : "ยกเลิกรอบแล้ว", {
            reason,
        });
        if (error) {
            setReasonError(error.message);
            return;
        }
        setReasonAction(null);
        setReasonError(null);
    }

    async function confirmPaid(event: React.FormEvent) {
        event.preventDefault();
        const error = await act("paid", "บันทึกจ่ายแล้ว พนักงานเปิดดูสลิปได้", {
            pr_paid_date: paidDate,
            pr_paid_note: paidNote,
        });
        if (!error) setIsMarkingPaid(false);
    }

    const canCancel = canRun && ["draft", "pending_approval", "approved"].includes(run.pr_status);

    return (
        <div className="grid w-full grid-cols-1 gap-6">
            <PageHeader
                eyebrow="รอบเงินเดือน"
                title={periodLabel(run.pr_period)}
                description={`${run.pr_number} · วันทำงานของเดือน ${run.pr_working_days} วัน`}
                actions={<StatusPill tone={status.tone}>{status.label}</StatusPill>}
            />

            <section className={`grid gap-5 p-5 sm:grid-cols-[1fr_1.3fr] sm:p-6 ${CARD_CLASS}`} aria-label="ยอดสรุปรอบ">
                <div className="grid content-start gap-1">
                    <span className="text-sm text-gray-500">จ่ายสุทธิทั้งรอบ</span>
                    <span className="text-3xl font-medium text-blue-600 tabular-nums">
                        {formatAmount(run.pr_total_net)}
                        <span className="ml-1.5 text-base font-normal text-gray-500">บาท</span>
                    </span>
                    <span className="text-xs text-gray-500">
                        {run.pr_employee_count} คน · จ่าย {formatDateOnly(run.pr_paid_date ?? run.pr_pay_date)}
                    </span>
                </div>
                <div className="grid content-start gap-1.5 text-sm">
                    <SummaryLine sign="" label="รวมเงินได้" amount={run.pr_total_gross} />
                    <SummaryLine sign="−" label="รายหักอื่น" amount={run.pr_total_deductions} />
                    <SummaryLine sign="−" label="ประกันสังคม (ส่วนพนักงาน)" amount={run.pr_total_sso_employee} />
                    <SummaryLine sign="−" label="ภาษีหัก ณ ที่จ่าย" amount={run.pr_total_tax} />
                    <SummaryLine sign="=" label="จ่ายสุทธิ" amount={run.pr_total_net} isTotal />
                    <p className="pt-1 text-xs text-gray-500 tabular-nums">
                        บริษัทสมทบประกันสังคมเพิ่ม {formatAmount(run.pr_total_sso_employer)} บาท (ไม่หักจากพนักงาน)
                    </p>
                </div>
            </section>

            <RunSteps status={run.pr_status} />

            {run.pr_returned_reason && isDraft && (
                <StatusBanner tone="error" title="ถูกตีกลับ แก้แล้วส่งใหม่">
                    {run.pr_returned_reason}
                </StatusBanner>
            )}
            {run.readiness && run.readiness.problems.length > 0 && (
                <StatusBanner tone="error" title="ต้องแก้ก่อนส่งอนุมัติ">
                    <ul className="list-disc space-y-1 pl-5">
                        {run.readiness.problems.map((problem) => (
                            <li key={problem}>{problem}</li>
                        ))}
                    </ul>
                </StatusBanner>
            )}
            {run.readiness && run.readiness.warnings.length > 0 && (
                <StatusBanner tone="warn" title="ตรวจก่อนส่ง (ส่งได้)">
                    <ul className="list-disc space-y-1 pl-5">
                        {run.readiness.warnings.map((warning) => (
                            <li key={warning}>{warning}</li>
                        ))}
                    </ul>
                </StatusBanner>
            )}
            {run.pr_status === "pending_approval" &&
                run.approval &&
                !run.approval.can_approve &&
                canApprovePermission && (
                    <StatusBanner tone="info" title="คุณยังอนุมัติรอบนี้ไม่ได้">
                        {run.approval.reason}
                    </StatusBanner>
                )}
            {run.pr_status === "approved" && <StatusBanner tone="info" title={PAYROLL_MESSAGES.approvedLock} />}
            {run.pr_status === "paid" && (
                <StatusBanner tone="done" title={PAYROLL_MESSAGES.paidNote}>
                    {run.pr_paid_note}
                </StatusBanner>
            )}
            {run.pr_status === "cancelled" && (
                <StatusBanner tone="info" title="รอบนี้ถูกยกเลิก">
                    {run.pr_cancel_reason}
                </StatusBanner>
            )}
            {actionError && (
                <StatusBanner tone="error" title="ทำรายการไม่สำเร็จ">
                    {actionError}
                </StatusBanner>
            )}

            <div className="flex flex-wrap justify-end gap-2">
                {canCancel && (
                    <button
                        type="button"
                        className={buttonClass("ghost", "md")}
                        disabled={isWorking}
                        onClick={() => setReasonAction("cancel")}
                    >
                        <X size={16} />
                        ยกเลิกรอบ
                    </button>
                )}
                {isDraft && canRun && (
                    <>
                        <button
                            type="button"
                            className={buttonClass("secondary", "md")}
                            disabled={isWorking}
                            onClick={() => act("recalculate", "คิดใหม่ทั้งรอบแล้ว")}
                        >
                            <RefreshCw size={16} />
                            คิดใหม่
                        </button>
                        <button
                            type="button"
                            className={buttonClass("primary", "md")}
                            disabled={isWorking || (run.readiness?.problems.length ?? 0) > 0}
                            onClick={() => act("submit", "ส่งอนุมัติแล้ว")}
                        >
                            <Send size={16} />
                            ส่งอนุมัติ
                        </button>
                    </>
                )}
                {run.pr_status === "pending_approval" && canApprovePermission && (
                    <>
                        <button
                            type="button"
                            className={buttonClass("secondary", "md")}
                            disabled={isWorking}
                            onClick={() => setReasonAction("return")}
                        >
                            <Undo2 size={16} />
                            ตีกลับ
                        </button>
                        <button
                            type="button"
                            className={buttonClass("primary", "md")}
                            disabled={isWorking || !run.approval?.can_approve}
                            onClick={() =>
                                act(
                                    "approve",
                                    run.approval?.is_final ? "อนุมัติรอบเงินเดือนแล้ว" : "อนุมัติชั้นนี้แล้ว",
                                )
                            }
                        >
                            <Check size={16} />
                            อนุมัติ
                        </button>
                    </>
                )}
                {run.pr_status === "approved" && canRun && !isMarkingPaid && (
                    <button
                        type="button"
                        className={buttonClass("primary", "md")}
                        onClick={() => {
                            setPaidDate(run.pr_pay_date);
                            setIsMarkingPaid(true);
                        }}
                    >
                        <Wallet size={16} />
                        บันทึกจ่ายแล้ว
                    </button>
                )}
            </div>
            {isDraft && <FieldHint>{PAYROLL_MESSAGES.recalculate}</FieldHint>}

            {isMarkingPaid && (
                <form onSubmit={confirmPaid} noValidate className={`grid gap-4 p-4 sm:p-5 ${CARD_CLASS}`}>
                    <h2 className="text-base font-medium text-gray-900">บันทึกจ่ายเงินเดือน</h2>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <FormField label="วันที่จ่าย" htmlFor="pr_paid_date" required>
                            <input
                                id="pr_paid_date"
                                type="date"
                                value={paidDate}
                                onChange={(event) => setPaidDate(event.target.value)}
                                className={inputClass(false)}
                            />
                        </FormField>
                        <FormField label="หมายเหตุ" htmlFor="pr_paid_note" hint="เช่น โอนจากบัญชีกสิกรไทย">
                            <input
                                id="pr_paid_note"
                                maxLength={255}
                                value={paidNote}
                                onChange={(event) => setPaidNote(event.target.value)}
                                className={inputClass(false)}
                            />
                        </FormField>
                    </div>
                    <FieldHint>บันทึกแล้วพนักงานเปิดดูสลิปของตัวเองได้ทันที และยกเลิกรอบนี้ไม่ได้อีก</FieldHint>
                    <div className="flex flex-wrap justify-end gap-2">
                        <button
                            type="button"
                            className={buttonClass("secondary", "md")}
                            onClick={() => setIsMarkingPaid(false)}
                        >
                            ยกเลิก
                        </button>
                        <button type="submit" className={buttonClass("primary", "md")} disabled={isWorking}>
                            ยืนยันจ่ายแล้ว
                        </button>
                    </div>
                </form>
            )}

            <RunItems items={run.items} onOpen={setOpenItemId} />

            {run.approvals.length > 0 && (
                <section className="grid gap-2 text-sm" aria-label="ประวัติอนุมัติ">
                    <h2 className="font-medium text-gray-900">ประวัติอนุมัติ</h2>
                    <ul className="grid gap-1 text-gray-600">
                        {run.approvals.map((approval, index) => (
                            <li key={index}>
                                รอบที่ {approval.pra_round} ชั้น {approval.pra_level} ·{" "}
                                {approval.pra_action === "approve" ? "อนุมัติ" : "ตีกลับ"} โดย {approval.pra_user_name}
                                {approval.pra_reason ? ` · ${approval.pra_reason}` : ""}
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            <Link
                href="/people/payroll"
                className="-my-2 justify-self-start py-2 text-sm text-blue-600 hover:underline"
            >
                ← กลับไปรายการรอบเงินเดือน
            </Link>

            <ItemSheet
                key={openItemId ?? "none"}
                runId={run.pr_id}
                version={run.pr_version}
                item={openItem}
                canEdit={isDraft && canRun}
                canOpenSlip={run.pr_status !== "cancelled"}
                onClose={() => setOpenItemId(null)}
                onChanged={load}
            />
            <ReasonDialog
                open={Boolean(reasonAction)}
                title={reasonAction === "return" ? "ตีกลับรอบเงินเดือนเป็นร่าง?" : "ยกเลิกรอบเงินเดือนนี้?"}
                description={
                    reasonAction === "return"
                        ? "ฝ่ายบุคคลแก้แล้วส่งใหม่ · การอนุมัติรอบนี้เริ่มชั้น 1 ใหม่"
                        : "ยกเลิกแล้วสร้างรอบของเดือนนี้ใหม่ได้ · รอบที่อนุมัติแล้วยกเลิกได้เมื่อยังไม่มีรอบเดือนถัดไป"
                }
                reasonLabel="เหตุผล"
                confirmLabel={reasonAction === "return" ? "ตีกลับ" : "ยกเลิกรอบ"}
                tone="danger"
                loading={isWorking}
                errorMessage={reasonError}
                onConfirm={confirmReason}
                onCancel={() => {
                    setReasonAction(null);
                    setReasonError(null);
                }}
            />
        </div>
    );
}
