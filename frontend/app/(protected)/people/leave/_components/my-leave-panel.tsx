"use client";

// ลาของฉัน — ยอดคงเหลือรายปี · คำขอทั้งปี · ปุ่มตามสถานะ (แก้/ส่ง/ลบร่าง · ดึงกลับ · ยกเลิก)
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import StatusBanner from "@/components/ui/guidance/status-banner";
import FieldHint from "@/components/ui/guidance/field-hint";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { PageSkeleton } from "@/components/ui/skeleton";
import { buttonClass } from "@/components/ui/button";
import { apiFetch, type ApiError } from "@/lib/api";
import { LEAVE_MESSAGES } from "../../_messages";
import type { LeaveRequest, MyLeave } from "../../_types";
import LeaveFormSheet from "./leave-form-sheet";
import LeaveRequestCard from "./leave-request-card";

type PendingAction = { request: LeaveRequest; kind: "delete" | "cancel" };

export default function MyLeavePanel() {
    const [year, setYear] = useState<number | null>(null);
    const [data, setData] = useState<MyLeave | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);
    const [formRequest, setFormRequest] = useState<LeaveRequest | null>(null);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [isWorking, setIsWorking] = useState(false);

    const load = useCallback(async (requestedYear: number | null) => {
        const query = requestedYear ? `?year=${requestedYear}` : "";
        const { data: mine, error } = await apiFetch<MyLeave>(`/leave/me${query}`);
        setLoadError(error);
        if (mine) setData(mine);
    }, []);

    useEffect(() => {
        let isLeftPage = false;
        const query = year ? `?year=${year}` : "";
        apiFetch<MyLeave>(`/leave/me${query}`).then(({ data: mine, error }) => {
            if (isLeftPage) return;
            setLoadError(error);
            if (mine) setData(mine);
        });
        return () => {
            isLeftPage = true;
        };
    }, [year]);

    if (loadError)
        return (
            <StatusBanner tone="error" title="โหลดข้อมูลการลาไม่สำเร็จ">
                {loadError.message}
            </StatusBanner>
        );
    if (!data || (year !== null && data.year !== year)) return <PageSkeleton />;
    if (!data.employee)
        return (
            <StatusBanner tone="info" title="ยังขอลาไม่ได้">
                {LEAVE_MESSAGES.notEmployee}
            </StatusBanner>
        );

    const reload = () => load(data.year);

    async function runAction(request: LeaveRequest, path: string, successMessage: string, body: object = {}) {
        setIsWorking(true);
        setActionError(null);
        const { error } = await apiFetch(`/leave/requests/${request.lr_id}/${path}`, {
            method: "POST",
            body: { lr_version: request.lr_version, ...body },
        });
        setIsWorking(false);
        if (error) {
            setActionError(error.message);
            await reload();
            return false;
        }
        toast.success(successMessage);
        await reload();
        return true;
    }

    async function confirmPendingAction() {
        if (!pendingAction) return;
        const { request, kind } = pendingAction;
        if (kind === "cancel") {
            const isDone = await runAction(request, "cancel", "ยกเลิกคำขอลาแล้ว");
            if (isDone) setPendingAction(null);
            return;
        }
        setIsWorking(true);
        const { error } = await apiFetch(`/leave/requests/${request.lr_id}`, {
            method: "DELETE",
            body: { lr_version: request.lr_version },
        });
        setIsWorking(false);
        setPendingAction(null);
        if (error) {
            setActionError(error.message);
            return;
        }
        toast.success("ลบร่างแล้ว");
        await reload();
    }

    function actionsOf(request: LeaveRequest) {
        const today = data?.today ?? "";
        const canCancelApproved = request.lr_status === "approved" && request.lr_start_date > today;
        return (
            <>
                {request.lr_status === "draft" && (
                    <>
                        <button
                            type="button"
                            className={buttonClass("ghost", "sm")}
                            disabled={isWorking}
                            onClick={() => setPendingAction({ request, kind: "delete" })}
                        >
                            ลบร่าง
                        </button>
                        <button
                            type="button"
                            className={buttonClass("secondary", "sm")}
                            onClick={() => {
                                setFormRequest(request);
                                setIsFormOpen(true);
                            }}
                        >
                            แก้
                        </button>
                        <button
                            type="button"
                            className={buttonClass("primary", "sm")}
                            disabled={isWorking}
                            onClick={() => runAction(request, "submit", "ส่งคำขอลาแล้ว รอผู้อนุมัติ")}
                        >
                            ส่งขออนุมัติ
                        </button>
                    </>
                )}
                {request.lr_status === "pending" && (
                    <>
                        <button
                            type="button"
                            className={buttonClass("ghost", "sm")}
                            disabled={isWorking}
                            onClick={() => setPendingAction({ request, kind: "cancel" })}
                        >
                            ยกเลิก
                        </button>
                        <button
                            type="button"
                            className={buttonClass("secondary", "sm")}
                            disabled={isWorking}
                            onClick={() => runAction(request, "withdraw", "ดึงกลับเป็นร่างแล้ว แก้แล้วส่งใหม่ได้")}
                        >
                            ดึงกลับไปแก้
                        </button>
                    </>
                )}
                {canCancelApproved && (
                    <button
                        type="button"
                        className={buttonClass("ghost", "sm")}
                        disabled={isWorking}
                        onClick={() => setPendingAction({ request, kind: "cancel" })}
                    >
                        ยกเลิกลา
                    </button>
                )}
            </>
        );
    }

    const currentYear = Number(data.today.slice(0, 4));

    return (
        <div className="grid grid-cols-1 gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        aria-label="ปีก่อน"
                        className={buttonClass("secondary", "md")}
                        onClick={() => setYear(data.year - 1)}
                    >
                        <ChevronLeft size={16} />
                    </button>
                    <span className="min-w-20 text-center text-sm font-medium text-gray-900">ปี {data.year + 543}</span>
                    <button
                        type="button"
                        aria-label="ปีถัดไป"
                        disabled={data.year >= currentYear + 1}
                        className={buttonClass("secondary", "md")}
                        onClick={() => setYear(data.year + 1)}
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>
                <button
                    type="button"
                    className={buttonClass("primary", "md")}
                    onClick={() => {
                        setFormRequest(null);
                        setIsFormOpen(true);
                    }}
                >
                    <Plus size={16} />
                    ขอลา
                </button>
            </div>

            <section aria-label="วันลาคงเหลือ" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {data.balances.map((balance) => (
                    <div
                        key={balance.lt_id}
                        className="grid content-start gap-0.5 rounded-xl border border-gray-200 bg-white p-3"
                    >
                        <span className="text-xs text-gray-500">{balance.lt_name_th}</span>
                        <span className="text-lg font-medium text-gray-900 tabular-nums">
                            {balance.remaining === null ? "ไม่จำกัด" : `เหลือ ${Number(balance.remaining)}`}
                        </span>
                        <span className="text-xs text-gray-500 tabular-nums">
                            ใช้ {Number(balance.used)}
                            {balance.quota !== null ? ` / ${Number(balance.quota)}` : ""} วัน
                            {Number(balance.carried) > 0 ? ` · ยกยอด ${Number(balance.carried)}` : ""}
                            {Number(balance.pending) > 0 ? ` · รออนุมัติ ${Number(balance.pending)}` : ""}
                        </span>
                        {balance.remaining !== null && Number(balance.remaining) < 0 && (
                            <span className="text-xs text-red-600">เกินโควตา</span>
                        )}
                    </div>
                ))}
            </section>
            <FieldHint>
                {LEAVE_MESSAGES.balanceHint} · {LEAVE_MESSAGES.cancelApprovedHint}
            </FieldHint>

            {actionError && (
                <StatusBanner tone="error" title="ทำรายการไม่สำเร็จ">
                    {actionError}
                </StatusBanner>
            )}

            {data.requests.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
                    ยังไม่มีคำขอลาในปีนี้
                </p>
            ) : (
                <div className="grid gap-3">
                    {data.requests.map((request) => (
                        <LeaveRequestCard key={request.lr_id} request={request} actions={actionsOf(request)} />
                    ))}
                </div>
            )}

            <LeaveFormSheet
                key={formRequest?.lr_id ?? "new"}
                open={isFormOpen}
                request={formRequest}
                balances={data.balances}
                today={data.today}
                onClose={() => setIsFormOpen(false)}
                onSaved={reload}
            />
            <ConfirmDialog
                open={Boolean(pendingAction)}
                title={pendingAction?.kind === "delete" ? "ลบร่างคำขอลานี้?" : "ยกเลิกคำขอลานี้?"}
                description={
                    pendingAction?.kind === "delete"
                        ? "ลบแล้วกู้คืนไม่ได้ ไฟล์แนบถูกลบด้วย"
                        : "ยกเลิกแล้ววันลาคืนเข้ายอดคงเหลือ · ประวัติยังเก็บไว้"
                }
                confirmLabel={pendingAction?.kind === "delete" ? "ลบร่าง" : "ยกเลิกคำขอ"}
                loading={isWorking}
                onConfirm={confirmPendingAction}
                onCancel={() => setPendingAction(null)}
            />
        </div>
    );
}
