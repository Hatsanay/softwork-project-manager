"use client";

// คำขอแก้เวลาของฉัน (ลงเวลา A-2) — รออนุมัติ (ยกเลิกได้) + ที่ตัดสินแล้วใน 60 วัน · ไม่อนุมัติแสดงเหตุผล
import { useState } from "react";
import { toast } from "sonner";
import StatusPill from "@/components/ui/status-pill";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { CARD_CLASS } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { CORRECTION_STATUS } from "../../_messages";
import type { AttendanceCorrection } from "../../_types";
import { dayLabel } from "../../timesheet/_components/week-lines";

export function correctionText(correction: Pick<AttendanceCorrection, "ac_type" | "ac_requested_at">) {
    return `${correction.ac_type === "in" ? "เข้างาน" : "ออกงาน"} ${correction.ac_requested_at.slice(11, 16)}`;
}

export default function MyCorrections({
    corrections,
    onChanged,
}: {
    corrections: AttendanceCorrection[];
    onChanged: () => Promise<void>;
}) {
    const [cancelling, setCancelling] = useState<AttendanceCorrection | null>(null);
    const [isWorking, setIsWorking] = useState(false);

    if (corrections.length === 0) return null;

    async function cancel() {
        if (!cancelling) return;
        setIsWorking(true);
        const { error } = await apiFetch(`/attendance/corrections/${cancelling.ac_id}/cancel`, { method: "POST" });
        setIsWorking(false);
        setCancelling(null);
        if (error) {
            toast.error(error.message);
            return;
        }
        toast.success("ยกเลิกคำขอแล้ว");
        await onChanged();
    }

    return (
        <section className={`grid gap-3 p-5 sm:p-6 ${CARD_CLASS}`} aria-label="คำขอแก้เวลาของฉัน">
            <h2 className="text-base font-medium text-gray-900">คำขอแก้เวลา</h2>
            <ul className="grid gap-2">
                {corrections.map((correction) => {
                    const status = CORRECTION_STATUS[correction.ac_status];
                    return (
                        <li key={correction.ac_id} className="grid gap-1 rounded-xl border border-gray-100 px-3 py-2.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-sm text-gray-900">
                                    {dayLabel(correction.ac_work_date)} · {correctionText(correction)}
                                </span>
                                <span className="flex items-center gap-2">
                                    <StatusPill tone={status.tone}>{status.label}</StatusPill>
                                    {correction.ac_status === "pending" && (
                                        <button
                                            type="button"
                                            className={buttonClass("ghost", "sm")}
                                            onClick={() => setCancelling(correction)}
                                        >
                                            ยกเลิก
                                        </button>
                                    )}
                                </span>
                            </div>
                            <span className="text-xs text-gray-500">เหตุผล: {correction.ac_reason}</span>
                            {correction.ac_status === "rejected" && correction.ac_decision_note && (
                                <span className="text-xs text-red-600">ไม่อนุมัติ: {correction.ac_decision_note}</span>
                            )}
                        </li>
                    );
                })}
            </ul>
            <ConfirmDialog
                open={Boolean(cancelling)}
                title="ยกเลิกคำขอแก้เวลานี้?"
                description="ยกเลิกแล้วส่งคำขอใหม่ได้"
                confirmLabel="ยกเลิกคำขอ"
                loading={isWorking}
                onConfirm={cancel}
                onCancel={() => setCancelling(null)}
            />
        </section>
    );
}
