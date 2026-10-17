"use client";

// สัปดาห์ที่รอฉันอนุมัติ — เห็นเฉพาะแถวในขอบเขตของตัวเอง · อนุมัติแถวที่ค้าง · ตีกลับทั้งสัปดาห์พร้อมเหตุผล
import { useState } from "react";
import { toast } from "sonner";
import { Check, Undo2 } from "lucide-react";
import StatusBanner from "@/components/ui/guidance/status-banner";
import StatusPill from "@/components/ui/status-pill";
import ReasonDialog from "@/components/ui/reason-dialog";
import { CARD_CLASS } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { addDays } from "@/lib/shared/payroll-math.mjs";
import { TIMESHEET_MESSAGES } from "../../_messages";
import type { ApprovalWeek } from "../../_types";
import { dayLabel } from "./day-card";

export default function ApprovalsPanel({
    weeks,
    onChanged,
}: {
    weeks: ApprovalWeek[];
    onChanged: () => Promise<void>;
}) {
    const [returnTarget, setReturnTarget] = useState<ApprovalWeek | null>(null);
    const [returnError, setReturnError] = useState<string | null>(null);
    const [workingWeekId, setWorkingWeekId] = useState<number | null>(null);

    async function approve(week: ApprovalWeek) {
        setWorkingWeekId(week.tsw_id);
        const { data, error } = await apiFetch<{ approved_rows: number; is_fully_approved: boolean }>(
            `/timesheet/weeks/${week.tsw_id}/approve`,
            { method: "POST", body: { tsw_version: week.tsw_version } },
        );
        setWorkingWeekId(null);
        if (error) {
            toast.error(error.message);
            await onChanged();
            return;
        }
        toast.success(
            data.is_fully_approved
                ? `อนุมัติ ${data.approved_rows} แถว — สัปดาห์นี้อนุมัติครบแล้ว`
                : `อนุมัติ ${data.approved_rows} แถว — รอผู้อนุมัติโปรเจกต์อื่น`,
        );
        await onChanged();
    }

    async function confirmReturn(reason: string) {
        if (!returnTarget) return;
        setWorkingWeekId(returnTarget.tsw_id);
        const { error } = await apiFetch(`/timesheet/weeks/${returnTarget.tsw_id}/return`, {
            method: "POST",
            body: { tsw_version: returnTarget.tsw_version, reason },
        });
        setWorkingWeekId(null);
        if (error) {
            setReturnError(error.message);
            return;
        }
        toast.success("ตีกลับแล้ว");
        setReturnTarget(null);
        setReturnError(null);
        await onChanged();
    }

    if (weeks.length === 0) {
        return (
            <StatusBanner tone="done" title="ไม่มีลงเวลารออนุมัติ">
                {TIMESHEET_MESSAGES.approvalsDescription}
            </StatusBanner>
        );
    }

    return (
        <div className="grid grid-cols-1 gap-4">
            <p className="text-sm text-gray-500">{TIMESHEET_MESSAGES.approvalsDescription}</p>
            {weeks.map((week) => {
                const pendingCount = week.entries.filter((entry) => !entry.is_approved).length;
                const scopeHours = week.entries.reduce((sum, entry) => sum + Number(entry.tse_hours), 0);
                return (
                    <section key={week.tsw_id} className={`grid gap-3 p-4 sm:p-5 ${CARD_CLASS}`}>
                        <header className="flex flex-wrap items-start justify-between gap-2">
                            <div className="grid gap-0.5">
                                <span className="font-medium text-gray-900">
                                    {week.employee_name}
                                    {week.emp_nickname ? ` (${week.emp_nickname})` : ""}
                                </span>
                                <span className="text-xs text-gray-500">
                                    {week.emp_code} · {dayLabel(week.tsw_week_start)} –{" "}
                                    {dayLabel(addDays(week.tsw_week_start, 6))} · ทั้งสัปดาห์{" "}
                                    {Number(week.tsw_total_hours)} ชม. · ในส่วนของคุณ {scopeHours} ชม.
                                </span>
                            </div>
                            <StatusPill tone="wait">รอ {pendingCount} แถว</StatusPill>
                        </header>
                        <ul className="grid divide-y divide-gray-100 text-sm">
                            {week.entries.map((entry) => (
                                <li
                                    key={entry.tse_id}
                                    className="flex flex-wrap items-start justify-between gap-2 py-2"
                                >
                                    <span className="grid min-w-0 gap-0.5">
                                        <span className="text-gray-900">
                                            {entry.project_name ?? "งานภายใน"}
                                            {entry.task_title ? ` · ${entry.task_title}` : ""}
                                        </span>
                                        <span className="text-xs text-gray-500">
                                            {dayLabel(entry.tse_date)}
                                            {entry.tse_note ? ` · ${entry.tse_note}` : ""}
                                        </span>
                                    </span>
                                    <span className="flex items-center gap-2 tabular-nums">
                                        {entry.is_approved && <StatusPill tone="success">อนุมัติแล้ว</StatusPill>}
                                        {Number(entry.tse_hours)} ชม.
                                    </span>
                                </li>
                            ))}
                        </ul>
                        <div className="flex flex-wrap justify-end gap-2">
                            <button
                                type="button"
                                className={buttonClass("secondary", "md")}
                                disabled={workingWeekId === week.tsw_id}
                                onClick={() => setReturnTarget(week)}
                            >
                                <Undo2 size={16} />
                                ตีกลับ
                            </button>
                            <button
                                type="button"
                                className={buttonClass("primary", "md")}
                                disabled={workingWeekId === week.tsw_id}
                                onClick={() => approve(week)}
                            >
                                <Check size={16} />
                                อนุมัติ {pendingCount} แถว
                            </button>
                        </div>
                    </section>
                );
            })}
            <ReasonDialog
                open={Boolean(returnTarget)}
                title={`ตีกลับลงเวลาของ ${returnTarget?.employee_name ?? ""}?`}
                description={TIMESHEET_MESSAGES.returnHint}
                reasonLabel="เหตุผล (พนักงานเห็น)"
                confirmLabel="ตีกลับทั้งสัปดาห์"
                loading={workingWeekId === returnTarget?.tsw_id}
                errorMessage={returnError}
                onConfirm={confirmReturn}
                onCancel={() => {
                    setReturnTarget(null);
                    setReturnError(null);
                }}
            />
        </div>
    );
}
