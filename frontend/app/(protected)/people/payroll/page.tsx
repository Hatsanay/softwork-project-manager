"use client";

// รอบเงินเดือน (2026-10-17 เฟส 4 ขั้น 4-4) — รายการรอบ + สร้างรอบใหม่ (runPayroll)
// แบบระบบ: docs/plans/2026-10-17-people-payroll-4.md หัวข้อ 3.7, 4.3
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Plus } from "lucide-react";
import PageHeader from "@/components/ui/page-header";
import StatusPill from "@/components/ui/status-pill";
import StatusBanner from "@/components/ui/guidance/status-banner";
import FormField, { inputClass } from "@/components/ui/form-field";
import { PageSkeleton } from "@/components/ui/skeleton";
import { CARD_CLASS } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { formatDateOnly } from "@/app/function";
import { usePermission, BITS } from "@/app/components/permission-provider";
import { apiFetch, type ApiError } from "@/lib/api";
import { formatAmount } from "@/lib/shared/money.mjs";
import { PAYROLL_MESSAGES, PAYROLL_STATUS } from "../_messages";
import type { PayrollRunSummary } from "../_types";
import { currentPeriodBangkok, periodLabel } from "./_lib";

export default function PayrollListPage() {
    const router = useRouter();
    const hasBit = usePermission();
    const canRun = hasBit(BITS.runPayroll);
    const [runs, setRuns] = useState<PayrollRunSummary[] | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [period, setPeriod] = useState(currentPeriodBangkok);
    const [payDate, setPayDate] = useState(`${currentPeriodBangkok()}-25`);
    const [createError, setCreateError] = useState<ApiError | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const load = useCallback(async () => {
        const { data, error } = await apiFetch<{ data: PayrollRunSummary[] }>("/payroll/runs");
        setLoadError(error);
        setRuns(data?.data ?? null);
    }, []);

    useEffect(() => {
        let isLeftPage = false;
        apiFetch<{ data: PayrollRunSummary[] }>("/payroll/runs").then(({ data, error }) => {
            if (isLeftPage) return;
            setLoadError(error);
            setRuns(data?.data ?? null);
        });
        return () => {
            isLeftPage = true;
        };
    }, []);

    async function create(event: React.FormEvent) {
        event.preventDefault();
        setIsSaving(true);
        setCreateError(null);
        const { data, error } = await apiFetch<{ pr_id: number }>("/payroll/runs", {
            method: "POST",
            body: { pr_period: period, pr_pay_date: payDate },
        });
        setIsSaving(false);
        if (error) {
            setCreateError(error);
            await load();
            return;
        }
        router.push(`/people/payroll/view?id=${data.pr_id}`);
    }

    return (
        <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-6">
            <PageHeader
                eyebrow="บุคคล"
                title="รอบเงินเดือน"
                description={PAYROLL_MESSAGES.listDescription}
                actions={
                    <>
                        <Link href="/people/payroll/reports" className={buttonClass("secondary", "md")}>
                            <FileText size={16} />
                            แบบยื่นภาษี/ประกันสังคม
                        </Link>
                        {canRun && !isCreating && (
                            <button
                                type="button"
                                className={buttonClass("primary", "md")}
                                onClick={() => setIsCreating(true)}
                            >
                                <Plus size={16} />
                                สร้างรอบ
                            </button>
                        )}
                    </>
                }
            />
            <StatusBanner tone="warn" title="รอนักบัญชียืนยันตัวเลข">
                {PAYROLL_MESSAGES.accountantPending}
            </StatusBanner>

            {isCreating && (
                <form onSubmit={create} noValidate className={`grid gap-4 p-4 sm:p-5 ${CARD_CLASS}`}>
                    <h2 className="text-base font-medium text-gray-900">สร้างรอบเงินเดือน</h2>
                    {createError && (
                        <StatusBanner tone="error" title="สร้างรอบไม่สำเร็จ">
                            {createError.message}
                        </StatusBanner>
                    )}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <FormField
                            label="เดือน"
                            htmlFor="pr_period"
                            required
                            error={createError?.fields.pr_period}
                            hint="สร้างล่วงหน้าได้ถึงเดือนหน้า"
                        >
                            <input
                                id="pr_period"
                                type="month"
                                value={period}
                                onChange={(event) => {
                                    setPeriod(event.target.value);
                                    setPayDate(`${event.target.value}-25`);
                                }}
                                className={inputClass(Boolean(createError?.fields.pr_period))}
                            />
                        </FormField>
                        <FormField
                            label="วันจ่าย"
                            htmlFor="pr_pay_date"
                            required
                            error={createError?.fields.pr_pay_date}
                            hint="แก้ได้จนกว่าจะส่งอนุมัติ"
                        >
                            <input
                                id="pr_pay_date"
                                type="date"
                                value={payDate}
                                onChange={(event) => setPayDate(event.target.value)}
                                className={inputClass(Boolean(createError?.fields.pr_pay_date))}
                            />
                        </FormField>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                        <button
                            type="button"
                            className={buttonClass("secondary", "md")}
                            onClick={() => setIsCreating(false)}
                        >
                            ยกเลิก
                        </button>
                        <button type="submit" className={buttonClass("primary", "md")} disabled={isSaving}>
                            สร้างและคิดเงินเดือน
                        </button>
                    </div>
                </form>
            )}

            {loadError && (
                <StatusBanner tone="error" title="โหลดรอบเงินเดือนไม่สำเร็จ">
                    {loadError.message}
                </StatusBanner>
            )}
            {!runs && !loadError && <PageSkeleton />}
            {runs && runs.length === 0 && (
                <p className="rounded-2xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
                    ยังไม่มีรอบเงินเดือน{canRun ? ' — กด "สร้างรอบ" เพื่อเริ่ม' : ""}
                </p>
            )}
            {runs && runs.length > 0 && (
                <ul className="grid gap-2">
                    {runs.map((run) => {
                        const status = PAYROLL_STATUS[run.pr_status];
                        return (
                            <li key={run.pr_id}>
                                <Link
                                    href={`/people/payroll/view?id=${run.pr_id}`}
                                    className={`grid gap-2 p-4 hover:border-blue-200 sm:grid-cols-[1fr_auto] sm:items-center ${CARD_CLASS}`}
                                >
                                    <span className="grid gap-0.5">
                                        <span className="font-medium text-gray-900">{periodLabel(run.pr_period)}</span>
                                        <span className="text-xs text-gray-500">
                                            {run.pr_number} · {run.pr_employee_count} คน · จ่าย{" "}
                                            {formatDateOnly(run.pr_paid_date ?? run.pr_pay_date)}
                                        </span>
                                    </span>
                                    <span className="flex flex-wrap items-center gap-3 sm:justify-end">
                                        <span className="text-sm text-gray-700 tabular-nums">
                                            สุทธิ {formatAmount(run.pr_total_net)} บาท
                                        </span>
                                        <StatusPill tone={status.tone}>{status.label}</StatusPill>
                                    </span>
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
