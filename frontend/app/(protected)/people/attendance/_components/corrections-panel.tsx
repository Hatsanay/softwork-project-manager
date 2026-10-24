"use client";

// อนุมัติคำขอแก้เวลา (ลงเวลา A-2 · หน้ารออนุมัติ) — ผู้มีสิทธิ์อนุมัติลงเวลา · ไม่รวมของตัวเอง (backend กรองให้)
// อนุมัติ = บันทึกเวลาตามที่ขอ · ไม่อนุมัติต้องใส่เหตุผล (พนักงานเห็น)
import { useState } from "react";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import EmptyState from "@/components/ui/empty-state";
import FieldHint from "@/components/ui/guidance/field-hint";
import ReasonDialog from "@/components/ui/reason-dialog";
import { CARD_CLASS } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { CORRECTION_MESSAGES } from "../../_messages";
import type { PendingCorrection } from "../../_types";
import { dayLabel } from "../../timesheet/_components/week-lines";
import { correctionText } from "./my-corrections";

export default function CorrectionsPanel({
    corrections,
    onChanged,
}: {
    corrections: PendingCorrection[];
    onChanged: () => Promise<void>;
}) {
    const [workingId, setWorkingId] = useState<number | null>(null);
    const [rejecting, setRejecting] = useState<PendingCorrection | null>(null);
    const [rejectError, setRejectError] = useState<string | null>(null);

    async function approve(correction: PendingCorrection) {
        setWorkingId(correction.ac_id);
        const { error } = await apiFetch(`/attendance/corrections/${correction.ac_id}/approve`, { method: "POST" });
        setWorkingId(null);
        if (error) {
            toast.error(error.message);
            await onChanged();
            return;
        }
        toast.success(`อนุมัติแล้ว · บันทึก${correctionText(correction)} ให้ ${correction.employee_name}`);
        await onChanged();
    }

    async function reject(reason: string) {
        if (!rejecting) return;
        setWorkingId(rejecting.ac_id);
        const { error } = await apiFetch(`/attendance/corrections/${rejecting.ac_id}/reject`, {
            method: "POST",
            body: { reason },
        });
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

    if (corrections.length === 0) {
        return <EmptyState title="ไม่มีคำขอแก้เวลารออนุมัติ" description="คำขอที่พนักงานส่งมาจะขึ้นที่นี่" />;
    }

    return (
        <div className="grid gap-3">
            <FieldHint>{CORRECTION_MESSAGES.approve}</FieldHint>
            {corrections.map((correction) => (
                <article key={correction.ac_id} className={`grid gap-2 p-4 ${CARD_CLASS}`}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="grid min-w-0 gap-0.5">
                            <span className="font-medium text-gray-900">
                                {correction.employee_name}
                                {correction.emp_nickname && <span className="font-normal text-gray-500"> ({correction.emp_nickname})</span>}
                            </span>
                            <span className="text-xs text-gray-500">{correction.emp_code}</span>
                        </div>
                        <span className="text-sm font-medium text-gray-900 tabular-nums">
                            {dayLabel(correction.ac_work_date)} · {correctionText(correction)}
                        </span>
                    </div>
                    <p className="text-sm wrap-break-word text-gray-700">เหตุผล: {correction.ac_reason}</p>
                    <div className="flex flex-wrap justify-end gap-2">
                        <button
                            type="button"
                            className={buttonClass("secondary", "sm")}
                            disabled={workingId === correction.ac_id}
                            onClick={() => setRejecting(correction)}
                        >
                            <X size={14} />
                            ไม่อนุมัติ
                        </button>
                        <button
                            type="button"
                            className={buttonClass("primary", "sm")}
                            disabled={workingId === correction.ac_id}
                            onClick={() => approve(correction)}
                        >
                            <Check size={14} />
                            อนุมัติ
                        </button>
                    </div>
                </article>
            ))}
            <ReasonDialog
                open={Boolean(rejecting)}
                title="ไม่อนุมัติคำขอแก้เวลา?"
                description={rejecting ? `${rejecting.employee_name} · ${dayLabel(rejecting.ac_work_date)} · ${correctionText(rejecting)}` : undefined}
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
