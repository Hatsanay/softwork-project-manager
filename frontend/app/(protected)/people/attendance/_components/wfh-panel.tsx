"use client";

// อนุมัติ WFH (2026-10-24 · หน้ารออนุมัติ) — ผู้มีสิทธิ์อนุมัติลงเวลา · ไม่รวมของตัวเอง (backend กรองให้)
// อนุมัติ = วันนั้นกดได้ทุกที่ · ไม่อนุมัติต้องใส่เหตุผล (พนักงานเห็น)
import { useState } from "react";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import EmptyState from "@/components/ui/empty-state";
import FieldHint from "@/components/ui/guidance/field-hint";
import ReasonDialog from "@/components/ui/reason-dialog";
import { CARD_CLASS } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { WFH_MESSAGES } from "../../_messages";
import type { PendingWfh } from "../../_types";
import { dayLabel } from "../../timesheet/_components/week-lines";

export default function WfhPanel({ requests, onChanged }: { requests: PendingWfh[]; onChanged: () => Promise<void> }) {
    const [workingId, setWorkingId] = useState<number | null>(null);
    const [rejecting, setRejecting] = useState<PendingWfh | null>(null);
    const [rejectError, setRejectError] = useState<string | null>(null);

    async function approve(request: PendingWfh) {
        setWorkingId(request.wfh_id);
        const { error } = await apiFetch(`/attendance/wfh/${request.wfh_id}/approve`, { method: "POST" });
        setWorkingId(null);
        if (error) {
            toast.error(error.message);
            await onChanged();
            return;
        }
        toast.success(`อนุมัติ WFH ${dayLabel(request.wfh_date)} ให้ ${request.employee_name} แล้ว`);
        await onChanged();
    }

    async function reject(reason: string) {
        if (!rejecting) return;
        setWorkingId(rejecting.wfh_id);
        const { error } = await apiFetch(`/attendance/wfh/${rejecting.wfh_id}/reject`, { method: "POST", body: { reason } });
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

    if (requests.length === 0) {
        return <EmptyState title="ไม่มีคำขอ WFH รออนุมัติ" description="คำขอทำงานที่บ้านที่พนักงานส่งมาจะขึ้นที่นี่" />;
    }

    return (
        <div className="grid gap-3">
            <FieldHint>{WFH_MESSAGES.approve}</FieldHint>
            {requests.map((request) => (
                <article key={request.wfh_id} className={`grid gap-2 p-4 ${CARD_CLASS}`}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="grid min-w-0 gap-0.5">
                            <span className="font-medium text-gray-900">
                                {request.employee_name}
                                {request.emp_nickname && <span className="font-normal text-gray-500"> ({request.emp_nickname})</span>}
                            </span>
                            <span className="text-xs text-gray-500">{request.emp_code}</span>
                        </div>
                        <span className="text-sm font-medium text-gray-900">WFH {dayLabel(request.wfh_date)}</span>
                    </div>
                    <p className="text-sm wrap-break-word text-gray-700">เหตุผล: {request.wfh_reason}</p>
                    <div className="flex flex-wrap justify-end gap-2">
                        <button
                            type="button"
                            className={buttonClass("secondary", "sm")}
                            disabled={workingId === request.wfh_id}
                            onClick={() => setRejecting(request)}
                        >
                            <X size={14} />
                            ไม่อนุมัติ
                        </button>
                        <button
                            type="button"
                            className={buttonClass("primary", "sm")}
                            disabled={workingId === request.wfh_id}
                            onClick={() => approve(request)}
                        >
                            <Check size={14} />
                            อนุมัติ
                        </button>
                    </div>
                </article>
            ))}
            <ReasonDialog
                open={Boolean(rejecting)}
                title="ไม่อนุมัติ WFH?"
                description={rejecting ? `${rejecting.employee_name} · ${dayLabel(rejecting.wfh_date)}` : undefined}
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
