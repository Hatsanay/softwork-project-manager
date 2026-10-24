"use client";

// WFH ของฉัน (2026-10-24) — วัน WFH ประจำ (ฝ่ายบุคคลตั้ง) + คำขอรายวัน: รออนุมัติ/อนุมัติแล้วยังไม่ถึงวัน ยกเลิกได้ · ไม่อนุมัติแสดงเหตุผล
// ไม่มีวันประจำและไม่มีคำขอ = ไม่แสดงส่วนนี้ (ปุ่ม "ขอ WFH" อยู่ข้างบนอยู่แล้ว)
import { useState } from "react";
import { toast } from "sonner";
import { House } from "lucide-react";
import StatusPill from "@/components/ui/status-pill";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { CARD_CLASS } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { CORRECTION_STATUS } from "../../_messages";
import type { WfhRequest } from "../../_types";
import { dayLabel } from "../../timesheet/_components/week-lines";
import { wfhWeekdaysText } from "../../_schedule-label";

function canCancel(request: WfhRequest, today: string) {
    if (request.wfh_status === "pending") return true;
    return request.wfh_status === "approved" && request.wfh_date > today;
}

export default function WfhList({
    weekdays,
    requests,
    today,
    onChanged,
}: {
    weekdays: string;
    requests: WfhRequest[];
    today: string;
    onChanged: () => Promise<void>;
}) {
    const [cancelling, setCancelling] = useState<WfhRequest | null>(null);
    const [isWorking, setIsWorking] = useState(false);

    const regularDays = wfhWeekdaysText(weekdays);
    if (!regularDays && requests.length === 0) return null;

    async function cancel() {
        if (!cancelling) return;
        setIsWorking(true);
        const { error } = await apiFetch(`/attendance/wfh/${cancelling.wfh_id}/cancel`, { method: "POST" });
        setIsWorking(false);
        setCancelling(null);
        if (error) {
            toast.error(error.message);
            return;
        }
        toast.success("ยกเลิกคำขอ WFH แล้ว");
        await onChanged();
    }

    return (
        <section className={`grid gap-3 p-5 sm:p-6 ${CARD_CLASS}`} aria-label="WFH ของฉัน">
            <h2 className="text-base font-medium text-gray-900">ทำงานที่บ้าน (WFH)</h2>
            {regularDays && (
                <p className="flex items-start gap-2 rounded-xl bg-blue-50 px-3 py-2.5 text-sm text-blue-700">
                    <House size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                    <span>WFH ประจำ: {regularDays} · ฝ่ายบุคคลตั้งให้ ไม่ต้องขอ</span>
                </p>
            )}
            {requests.length > 0 && (
                <ul className="grid gap-2">
                    {requests.map((request) => {
                        const status = CORRECTION_STATUS[request.wfh_status];
                        return (
                            <li key={request.wfh_id} className="grid gap-1 rounded-xl border border-gray-100 px-3 py-2.5">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="text-sm text-gray-900">{dayLabel(request.wfh_date)}</span>
                                    <span className="flex items-center gap-2">
                                        <StatusPill tone={status.tone}>{status.label}</StatusPill>
                                        {canCancel(request, today) && (
                                            <button
                                                type="button"
                                                className={buttonClass("ghost", "sm")}
                                                onClick={() => setCancelling(request)}
                                            >
                                                ยกเลิก
                                            </button>
                                        )}
                                    </span>
                                </div>
                                <span className="text-xs wrap-break-word text-gray-500">เหตุผล: {request.wfh_reason}</span>
                                {request.wfh_status === "rejected" && request.wfh_decision_note && (
                                    <span className="text-xs text-red-600">ไม่อนุมัติ: {request.wfh_decision_note}</span>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
            <ConfirmDialog
                open={Boolean(cancelling)}
                title="ยกเลิกคำขอ WFH นี้?"
                description={
                    cancelling?.wfh_status === "approved"
                        ? "อนุมัติแล้ว · ยกเลิกแล้ววันนั้นต้องกดเข้า/ออกที่จุดลงเวลาตามปกติ"
                        : "ยกเลิกแล้วส่งคำขอใหม่ได้"
                }
                confirmLabel="ยกเลิกคำขอ"
                loading={isWorking}
                onConfirm={cancel}
                onCancel={() => setCancelling(null)}
            />
        </section>
    );
}
