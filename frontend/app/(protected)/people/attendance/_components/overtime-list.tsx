"use client";

// รายการ OT (ลงเวลา A-3) — ของฉัน (ยกเลิกได้ตอนรอ หรืออนุมัติแล้วแต่ยังไม่ถึงเวลาเริ่ม) และหน้าพนักงานของฝ่ายบุคคล (ดูอย่างเดียว)
// อนุมัติแล้วและวันนั้นมีเวลาเข้า-ออกครบ = แสดง "ทำจริง" (ช่วงที่อนุมัติ ∩ เวลาที่อยู่ ปัดลงทีละ 15 นาที)
import { useState } from "react";
import { toast } from "sonner";
import StatusPill from "@/components/ui/status-pill";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { CARD_CLASS } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { CORRECTION_STATUS } from "../../_messages";
import type { OvertimeRequest } from "../../_types";
import { clockOf, durationText } from "../../_time-text";
import { dayLabel } from "../../timesheet/_components/week-lines";

export function overtimeWindowText(overtime: Pick<OvertimeRequest, "ot_start_at" | "ot_end_at">) {
    return `${clockOf(overtime.ot_start_at)}-${clockOf(overtime.ot_end_at)}`;
}

export function overtimeKindText(overtime: OvertimeRequest) {
    const parts: string[] = [];
    if (overtime.ot_workday_minutes > 0) parts.push(`OT วันทำงาน ${durationText(overtime.ot_workday_minutes)}`);
    if (overtime.ot_holiday_work_minutes > 0) parts.push(`ทำงานวันหยุด ${durationText(overtime.ot_holiday_work_minutes)}`);
    if (overtime.ot_holiday_ot_minutes > 0) parts.push(`OT วันหยุด ${durationText(overtime.ot_holiday_ot_minutes)}`);
    return parts.join(" · ");
}

export default function OvertimeList({
    overtime,
    now,
    onChanged,
    title = "OT",
}: {
    overtime: OvertimeRequest[];
    now: string;
    onChanged?: () => Promise<void>;
    title?: string;
}) {
    const [cancelling, setCancelling] = useState<OvertimeRequest | null>(null);
    const [isWorking, setIsWorking] = useState(false);

    if (overtime.length === 0) return null;

    async function cancel() {
        if (!cancelling || !onChanged) return;
        setIsWorking(true);
        const { error } = await apiFetch(`/attendance/overtime/${cancelling.ot_id}/cancel`, { method: "POST" });
        setIsWorking(false);
        setCancelling(null);
        if (error) {
            toast.error(error.message);
            return;
        }
        toast.success("ยกเลิก OT แล้ว");
        await onChanged();
    }

    return (
        <section className={`grid gap-3 p-5 sm:p-6 ${CARD_CLASS}`} aria-label={title}>
            <h2 className="text-base font-medium text-gray-900">{title}</h2>
            <ul className="grid gap-2">
                {overtime.map((item) => {
                    const status = CORRECTION_STATUS[item.ot_status];
                    const canCancel =
                        onChanged && (item.ot_status === "pending" || (item.ot_status === "approved" && item.ot_start_at > now));
                    return (
                        <li key={item.ot_id} className="grid gap-1 rounded-xl border border-gray-100 px-3 py-2.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-sm text-gray-900 tabular-nums">
                                    {dayLabel(item.ot_work_date)} · {overtimeWindowText(item)}
                                </span>
                                <span className="flex items-center gap-2">
                                    <StatusPill tone={status.tone}>{status.label}</StatusPill>
                                    {canCancel && (
                                        <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setCancelling(item)}>
                                            ยกเลิก
                                        </button>
                                    )}
                                </span>
                            </div>
                            <span className="text-xs text-gray-600">{overtimeKindText(item)}</span>
                            {item.ot_status === "approved" && item.actual_minutes !== null && item.actual_minutes !== undefined && (
                                <span className="text-xs text-blue-700">ทำจริง {durationText(item.actual_minutes)} (ตามเวลาออกจริง)</span>
                            )}
                            <span className="text-xs text-gray-500">งาน: {item.ot_reason}</span>
                            {item.ot_status === "rejected" && item.ot_decision_note && (
                                <span className="text-xs text-red-600">ไม่อนุมัติ: {item.ot_decision_note}</span>
                            )}
                        </li>
                    );
                })}
            </ul>
            <ConfirmDialog
                open={Boolean(cancelling)}
                title="ยกเลิก OT นี้?"
                description="ยกเลิกแล้วขอใหม่ได้"
                confirmLabel="ยกเลิก OT"
                loading={isWorking}
                onConfirm={cancel}
                onCancel={() => setCancelling(null)}
            />
        </section>
    );
}
