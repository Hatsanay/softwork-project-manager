"use client";

// การ์ดคำขอลาหนึ่งใบ — ใช้ทั้ง "ลาของฉัน" และ "รออนุมัติ" (ปุ่มส่งเข้ามาจากผู้ใช้)
import { useState } from "react";
import { Paperclip } from "lucide-react";
import StatusPill from "@/components/ui/status-pill";
import FieldHint from "@/components/ui/guidance/field-hint";
import { formatDateOnly } from "@/app/function";
import { apiFetchBlob } from "@/lib/api";
import { HALF_DAY_LABEL, LEAVE_STATUS } from "../../_messages";
import type { LeaveRequest } from "../../_types";

export function leaveRangeText(request: Pick<LeaveRequest, "lr_start_date" | "lr_end_date" | "lr_half_day">) {
    if (request.lr_start_date === request.lr_end_date) {
        const half = request.lr_half_day === "none" ? "" : ` (${HALF_DAY_LABEL[request.lr_half_day]})`;
        return `${formatDateOnly(request.lr_start_date)}${half}`;
    }
    return `${formatDateOnly(request.lr_start_date)} – ${formatDateOnly(request.lr_end_date)}`;
}

export default function LeaveRequestCard({
    request,
    heading,
    extra,
    actions,
}: {
    request: LeaveRequest;
    heading?: React.ReactNode;
    extra?: React.ReactNode;
    actions?: React.ReactNode;
}) {
    const [fileError, setFileError] = useState<string | null>(null);
    const status = LEAVE_STATUS[request.lr_status];

    // เปิดหน้าต่างก่อน (กันเบราว์เซอร์มือถือบล็อก popup ที่เปิดหลังรอโหลด) แล้วค่อยใส่ไฟล์ที่โหลดด้วย token
    async function openFile(fileId: number) {
        setFileError(null);
        const viewer = window.open("", "_blank");
        const blob = await apiFetchBlob(`/leave/requests/${request.lr_id}/attachments/${fileId}`);
        if (!blob) {
            viewer?.close();
            setFileError("เปิดไฟล์ไม่สำเร็จ · ไฟล์อาจหายจากเซิร์ฟเวอร์");
            return;
        }
        const url = URL.createObjectURL(blob);
        if (viewer) viewer.location.href = url;
        else window.location.assign(url);
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }

    return (
        <article className="grid gap-2 rounded-2xl border border-gray-200 bg-white p-4">
            <header className="flex flex-wrap items-start justify-between gap-2">
                <div className="grid min-w-0 gap-0.5">
                    {heading}
                    <span className="font-medium text-gray-900">
                        {request.lt_name_th}
                        {!request.lt_is_paid && (
                            <span className="text-sm font-normal text-gray-500"> · ไม่รับค่าจ้าง</span>
                        )}
                    </span>
                    <span className="text-sm text-gray-600">
                        {leaveRangeText(request)} · {Number(request.lr_days)} วัน
                    </span>
                </div>
                <StatusPill tone={status.tone}>{status.label}</StatusPill>
            </header>
            {request.lr_reason && <p className="text-sm wrap-break-word text-gray-700">เหตุผล: {request.lr_reason}</p>}
            {request.lr_status === "rejected" && request.lr_decision_note && (
                <p className="text-sm text-red-600">ไม่อนุมัติ: {request.lr_decision_note}</p>
            )}
            {request.lr_status === "cancelled" && request.lr_cancel_reason && (
                <p className="text-sm text-gray-500">ยกเลิก: {request.lr_cancel_reason}</p>
            )}
            {request.decided_by_name && ["approved", "rejected"].includes(request.lr_status) && (
                <p className="text-xs text-gray-500">โดย {request.decided_by_name}</p>
            )}
            {request.attachments.length > 0 && (
                <ul className="flex flex-wrap gap-x-3">
                    {request.attachments.map((file) => (
                        <li key={file.lra_id}>
                            <button
                                type="button"
                                className="flex min-h-10 items-center gap-1 text-sm text-blue-600 hover:underline"
                                onClick={() => openFile(file.lra_id)}
                            >
                                <Paperclip size={14} />
                                {file.lra_file_name}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            <FieldHint error={fileError} />
            {extra}
            {actions && <div className="flex flex-wrap justify-end gap-2">{actions}</div>}
        </article>
    );
}
