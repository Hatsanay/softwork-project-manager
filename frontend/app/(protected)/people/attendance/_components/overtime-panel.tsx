"use client";

// อนุมัติ OT (ลงเวลา A-3 · หน้ารออนุมัติ) — ผู้มีสิทธิ์อนุมัติลงเวลา · ไม่รวมของตัวเอง (backend กรองให้)
// แสดงชนิด/ช่วงเวลา/อนุมัติไปแล้วในสัปดาห์เทียบเพดาน · เกินเพดานกดอนุมัติไม่ได้ · ไม่อนุมัติต้องใส่เหตุผล
import { useState } from "react";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import EmptyState from "@/components/ui/empty-state";
import FieldHint from "@/components/ui/guidance/field-hint";
import ReasonDialog from "@/components/ui/reason-dialog";
import { CARD_CLASS } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { OVERTIME_MESSAGES } from "../../_messages";
import type { PendingOvertime } from "../../_types";
import { durationText } from "../../_time-text";
import { dayLabel } from "../../timesheet/_components/week-lines";
import { overtimeKindText, overtimeWindowText } from "./overtime-list";

export default function OvertimePanel({
    overtime,
    onChanged,
}: {
    overtime: PendingOvertime[];
    onChanged: () => Promise<void>;
}) {
    const [workingId, setWorkingId] = useState<number | null>(null);
    const [rejecting, setRejecting] = useState<PendingOvertime | null>(null);
    const [rejectError, setRejectError] = useState<string | null>(null);

    async function approve(item: PendingOvertime) {
        setWorkingId(item.ot_id);
        const { error } = await apiFetch(`/attendance/overtime/${item.ot_id}/approve`, { method: "POST" });
        setWorkingId(null);
        if (error) {
            toast.error(error.message);
            await onChanged();
            return;
        }
        toast.success(`อนุมัติ OT ของ ${item.employee_name} แล้ว`);
        await onChanged();
    }

    async function reject(reason: string) {
        if (!rejecting) return;
        setWorkingId(rejecting.ot_id);
        const { error } = await apiFetch(`/attendance/overtime/${rejecting.ot_id}/reject`, { method: "POST", body: { reason } });
        setWorkingId(null);
        if (error) {
            setRejectError(error.message);
            return;
        }
        setRejecting(null);
        setRejectError(null);
        toast.success("ไม่อนุมัติแล้ว");
        await onChanged();
    }

    if (overtime.length === 0) return <EmptyState title="ไม่มี OT รออนุมัติ" description="คำขอ OT ที่พนักงานส่งมาจะขึ้นที่นี่" />;

    return (
        <div className="grid gap-3">
            <FieldHint>{OVERTIME_MESSAGES.approve}</FieldHint>
            {overtime.map((item) => {
                const countedMinutes = item.ot_workday_minutes + item.ot_holiday_ot_minutes;
                const afterMinutes = item.week_approved_minutes + countedMinutes;
                const isOverCap = afterMinutes > item.week_cap_minutes;
                const isAfterTheFact = item.ot_created_at > item.ot_start_at;
                return (
                    <article key={item.ot_id} className={`grid gap-2 p-4 ${CARD_CLASS}`}>
                        <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="grid min-w-0 gap-0.5">
                                <span className="font-medium text-gray-900">
                                    {item.employee_name}
                                    {item.emp_nickname && <span className="font-normal text-gray-500"> ({item.emp_nickname})</span>}
                                </span>
                                <span className="text-xs text-gray-500">{item.emp_code}</span>
                            </div>
                            <span className="text-sm font-medium text-gray-900 tabular-nums">
                                {dayLabel(item.ot_work_date)} · {overtimeWindowText(item)}
                            </span>
                        </div>
                        <p className="text-sm text-gray-700">{overtimeKindText(item)}</p>
                        <p className="text-sm wrap-break-word text-gray-700">งาน: {item.ot_reason}</p>
                        <p className={`text-xs tabular-nums ${isOverCap ? "text-red-600" : "text-gray-500"}`}>
                            สัปดาห์นี้อนุมัติไปแล้ว {durationText(item.week_approved_minutes)} · ถ้าอนุมัติจะเป็น {durationText(afterMinutes)} จาก{" "}
                            {item.week_cap_minutes / 60} ชม.{isOverCap ? " · เกินเพดาน อนุมัติไม่ได้" : ""}
                        </p>
                        {isAfterTheFact && <p className="text-xs text-amber-700">ขอหลังเวลาเริ่ม (ขอย้อนหลัง)</p>}
                        <div className="flex flex-wrap justify-end gap-2">
                            <button
                                type="button"
                                className={buttonClass("secondary", "sm")}
                                disabled={workingId === item.ot_id}
                                onClick={() => setRejecting(item)}
                            >
                                <X size={14} />
                                ไม่อนุมัติ
                            </button>
                            <button
                                type="button"
                                className={buttonClass("primary", "sm")}
                                disabled={workingId === item.ot_id || isOverCap}
                                onClick={() => approve(item)}
                            >
                                <Check size={14} />
                                อนุมัติ
                            </button>
                        </div>
                    </article>
                );
            })}
            <ReasonDialog
                open={Boolean(rejecting)}
                title="ไม่อนุมัติ OT?"
                description={rejecting ? `${rejecting.employee_name} · ${dayLabel(rejecting.ot_work_date)} · ${overtimeWindowText(rejecting)}` : undefined}
                reasonLabel="เหตุผล (พนักงานเห็น)"
                confirmLabel="ไม่อนุมัติ"
                tone="danger"
                loading={workingId !== null}
                errorMessage={rejectError}
                onConfirm={reject}
                onCancel={() => {
                    setRejecting(null);
                    setRejectError(null);
                }}
            />
        </div>
    );
}
