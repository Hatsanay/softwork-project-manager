"use client";

// ผู้อนุมัติลา (approveLeave) — รออนุมัติ: อนุมัติ/ไม่อนุมัติ (ต้องมีเหตุผล) · อนุมัติแล้ว: ยกเลิกให้ (ต้องมีเหตุผล)
// เกินโควตาอนุมัติได้ แต่แสดงแถบเตือนบนการ์ด · ของตัวเองไม่อยู่ในรายการ (backend กันซ้ำ)
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import StatusBanner from "@/components/ui/guidance/status-banner";
import Segmented from "@/components/ui/segmented";
import ReasonDialog from "@/components/ui/reason-dialog";
import { PageSkeleton } from "@/components/ui/skeleton";
import { buttonClass } from "@/components/ui/button";
import { apiFetch, type ApiError } from "@/lib/api";
import { LEAVE_MESSAGES } from "../../_messages";
import type { PendingLeave } from "../../_types";
import LeaveRequestCard from "./leave-request-card";

type View = "pending" | "approved";
type ReasonTarget = { request: PendingLeave; action: "reject" | "cancel-approved" };

export default function LeaveApprovalsPanel({ onChanged }: { onChanged: () => void }) {
    const [view, setView] = useState<View>("pending");
    const [requests, setRequests] = useState<PendingLeave[] | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);
    const [workingId, setWorkingId] = useState<number | null>(null);
    const [reasonTarget, setReasonTarget] = useState<ReasonTarget | null>(null);
    const [reasonError, setReasonError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    const load = useCallback(async (status: View) => {
        const { data, error } = await apiFetch<{ data: PendingLeave[] }>(`/leave/approvals?status=${status}`);
        setLoadError(error);
        setRequests(data?.data ?? null);
    }, []);

    useEffect(() => {
        let isLeftPage = false;
        apiFetch<{ data: PendingLeave[] }>(`/leave/approvals?status=${view}`).then(({ data, error }) => {
            if (isLeftPage) return;
            setLoadError(error);
            setRequests(data?.data ?? null);
        });
        return () => {
            isLeftPage = true;
        };
    }, [view]);

    async function act(request: PendingLeave, action: string, body: object = {}) {
        setWorkingId(request.lr_id);
        setActionError(null);
        const { error } = await apiFetch(`/leave/requests/${request.lr_id}/${action}`, {
            method: "POST",
            body: { lr_version: request.lr_version, ...body },
        });
        setWorkingId(null);
        await load(view);
        onChanged();
        return error;
    }

    async function approve(request: PendingLeave) {
        const error = await act(request, "approve");
        if (error) {
            setActionError(error.message);
            return;
        }
        toast.success(`อนุมัติลาของ ${request.employee_name} แล้ว`);
    }

    async function confirmReason(reason: string) {
        if (!reasonTarget) return;
        const error = await act(reasonTarget.request, reasonTarget.action, { reason });
        if (error) {
            setReasonError(error.message);
            return;
        }
        toast.success(reasonTarget.action === "reject" ? "ไม่อนุมัติแล้ว" : "ยกเลิกลาแล้ว");
        setReasonTarget(null);
        setReasonError(null);
    }

    return (
        <div className="grid grid-cols-1 gap-4">
            <Segmented<View>
                label="สถานะคำขอ"
                value={view}
                onChange={(value) => {
                    setRequests(null);
                    setView(value);
                }}
                options={[
                    { value: "pending", label: "รออนุมัติ" },
                    { value: "approved", label: "อนุมัติแล้ว (ล่าสุด)" },
                ]}
            />
            <p className="text-sm text-gray-500">
                {view === "pending"
                    ? LEAVE_MESSAGES.approvalsDescription
                    : "ลาที่อนุมัติแล้ว (จบไปไม่เกิน 60 วัน) · ยกเลิกได้เมื่อพนักงานกลับมาทำงานก่อนหรือลาผิด (ต้องมีเหตุผล)"}
            </p>
            {loadError && (
                <StatusBanner tone="error" title="โหลดคำขอลาไม่สำเร็จ">
                    {loadError.message}
                </StatusBanner>
            )}
            {actionError && (
                <StatusBanner tone="error" title="ทำรายการไม่สำเร็จ">
                    {actionError}
                </StatusBanner>
            )}
            {!requests && !loadError && <PageSkeleton />}
            {requests && requests.length === 0 && (
                <StatusBanner
                    tone="done"
                    title={view === "pending" ? "ไม่มีคำขอลารออนุมัติ" : "ไม่มีลาที่อนุมัติล่าสุด"}
                />
            )}
            {requests?.map((request) => (
                <LeaveRequestCard
                    key={request.lr_id}
                    request={request}
                    heading={
                        <span className="text-xs text-gray-500">
                            {request.employee_name}
                            {request.emp_nickname ? ` (${request.emp_nickname})` : ""} · {request.emp_code}
                        </span>
                    }
                    extra={
                        view === "pending" &&
                        request.remaining_after_approve !== null && (
                            <p className={`text-sm ${request.is_over_quota ? "text-red-600" : "text-gray-600"}`}>
                                {request.is_over_quota
                                    ? `เกินโควตา · อนุมัติแล้วจะติดลบ ${Math.abs(Number(request.remaining_after_approve))} วัน (โควตา ${Number(request.quota)} วัน/ปี)`
                                    : `อนุมัติแล้วเหลือ ${Number(request.remaining_after_approve)} วัน`}
                            </p>
                        )
                    }
                    actions={
                        view === "pending" ? (
                            <>
                                <button
                                    type="button"
                                    className={buttonClass("secondary", "md")}
                                    disabled={workingId === request.lr_id}
                                    onClick={() => setReasonTarget({ request, action: "reject" })}
                                >
                                    <X size={16} />
                                    ไม่อนุมัติ
                                </button>
                                <button
                                    type="button"
                                    className={buttonClass("primary", "md")}
                                    disabled={workingId === request.lr_id}
                                    onClick={() => approve(request)}
                                >
                                    <Check size={16} />
                                    อนุมัติ
                                </button>
                            </>
                        ) : (
                            <button
                                type="button"
                                className={buttonClass("secondary", "md")}
                                disabled={workingId === request.lr_id}
                                onClick={() => setReasonTarget({ request, action: "cancel-approved" })}
                            >
                                ยกเลิกลานี้
                            </button>
                        )
                    }
                />
            ))}
            <ReasonDialog
                open={Boolean(reasonTarget)}
                title={
                    reasonTarget?.action === "reject"
                        ? `ไม่อนุมัติลาของ ${reasonTarget.request.employee_name}?`
                        : `ยกเลิกลาของ ${reasonTarget?.request.employee_name ?? ""}?`
                }
                description={
                    reasonTarget?.action === "reject"
                        ? "พนักงานเห็นเหตุผลนี้ และแก้แล้วยื่นใหม่ได้"
                        : "วันลาคืนเข้ายอดคงเหลือ · พนักงานเห็นเหตุผลนี้"
                }
                reasonLabel="เหตุผล (พนักงานเห็น)"
                confirmLabel={reasonTarget?.action === "reject" ? "ไม่อนุมัติ" : "ยกเลิกลา"}
                tone="danger"
                loading={workingId === reasonTarget?.request.lr_id}
                errorMessage={reasonError}
                onConfirm={confirmReason}
                onCancel={() => {
                    setReasonTarget(null);
                    setReasonError(null);
                }}
            />
        </div>
    );
}
