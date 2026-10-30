"use client";

// เงินจาก Fastwork (2026-10-24 · P-1 · ขั้นที่ 4-5 ของหน้า Fastwork)
// ตัวกรองจากลิงก์: ?status=pending (รอโอน) · ?project=<id> (งานเดียว) · ?new=1 เปิดแผ่นบันทึกเงินทันที (&milestone=<id> เลือกงวดให้)
// รอโอนขึ้นก่อนเสมอ · จอคอมเป็นตาราง มือถือเป็นการ์ด · ยกเลิกต้องใส่เหตุผล (ไม่ลบรายการ)
import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import PageHeader from "@/components/ui/page-header";
import Segmented from "@/components/ui/segmented";
import StatusBanner from "@/components/ui/guidance/status-banner";
import FieldHint from "@/components/ui/guidance/field-hint";
import EmptyState from "@/components/ui/empty-state";
import ReasonDialog from "@/components/ui/reason-dialog";
import StatusPill, { type PillTone } from "@/components/ui/status-pill";
import { PageSkeleton } from "@/components/ui/skeleton";
import { CARD_CLASS } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { usePermission, BITS } from "@/app/components/permission-provider";
import { apiFetch, type ApiError } from "@/lib/api";
import { formatAmount } from "@/lib/shared/money.mjs";
import { formatDateOnly } from "@/app/function";
import type { FastworkPayout, FastworkPayoutStatus } from "../_types";
import { FASTWORK_MESSAGES } from "../_messages";
import PayoutSheet from "../_components/payout-sheet";
import ReceiveSheet from "../_components/receive-sheet";

type Filter = "all" | FastworkPayoutStatus;

const STATUS: Record<FastworkPayoutStatus, { label: string; tone: PillTone }> = {
    pending: { label: "รอโอน", tone: "wait" },
    received: { label: "เงินเข้าแล้ว", tone: "success" },
    cancelled: { label: "ยกเลิก", tone: "neutral" },
};

export default function FastworkPayoutsPage() {
    return (
        <Suspense fallback={<PageSkeleton />}>
            <PayoutsContent />
        </Suspense>
    );
}

function PayoutsContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const hasBit = usePermission();
    const canManage = hasBit(BITS.manageFastwork);
    const projectFilter = searchParams.get("project");
    const requestedStatus = searchParams.get("status");
    const [filter, setFilter] = useState<Filter>(
        requestedStatus === "pending" || requestedStatus === "received" || requestedStatus === "cancelled" ? requestedStatus : "all",
    );
    const [payouts, setPayouts] = useState<FastworkPayout[] | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);
    const [isRecording, setIsRecording] = useState(searchParams.get("new") === "1");
    const [receiving, setReceiving] = useState<FastworkPayout | null>(null);
    const [cancelling, setCancelling] = useState<FastworkPayout | null>(null);
    const [cancelError, setCancelError] = useState<string | null>(null);
    const [isCancelling, setIsCancelling] = useState(false);

    const query = projectFilter ? `?project_id=${encodeURIComponent(projectFilter)}` : "";
    const load = useCallback(async () => {
        const { data, error } = await apiFetch<{ data: FastworkPayout[] }>(`/fastwork/payouts${query}`);
        setLoadError(error);
        if (data) setPayouts(data.data);
    }, [query]);

    useEffect(() => {
        if (!canManage) return;
        let isLeftPage = false;
        apiFetch<{ data: FastworkPayout[] }>(`/fastwork/payouts${query}`).then(({ data, error }) => {
            if (isLeftPage) return;
            setLoadError(error);
            if (data) setPayouts(data.data);
        });
        return () => {
            isLeftPage = true;
        };
    }, [query, canManage]);

    async function cancel(reason: string) {
        if (!cancelling) return;
        setIsCancelling(true);
        const { error } = await apiFetch(`/fastwork/payouts/${cancelling.fwp_id}/cancel`, {
            method: "POST",
            body: { reason, fwp_version: cancelling.fwp_version },
        });
        setIsCancelling(false);
        if (error) {
            setCancelError(error.message);
            return;
        }
        setCancelling(null);
        setCancelError(null);
        toast.success("ยกเลิกรายการแล้ว");
        await load();
    }

    const header = (
        <PageHeader
            eyebrow="Fastwork · ขั้นที่ 4-5"
            title="เงินจาก Fastwork"
            description="บันทึกเมื่อลูกค้ายืนยันงวด (รอโอน) แล้วยืนยันเมื่อเงินเข้าบัญชีจริง"
            actions={
                canManage && (
                    <button type="button" className={buttonClass("primary", "md")} onClick={() => setIsRecording(true)}>
                        <Plus size={16} />
                        บันทึกเงิน
                    </button>
                )
            }
        />
    );
    if (!canManage) {
        return (
            <div className="grid w-full grid-cols-1 gap-6">
                {header}
                <StatusBanner tone="info" title="ต้องมีสิทธิ์จัดการงาน Fastwork">
                    รายการเงินเห็นได้เฉพาะผู้มีสิทธิ์ &quot;จัดการงาน Fastwork&quot;
                </StatusBanner>
            </div>
        );
    }
    if (loadError) {
        return (
            <div className="grid w-full grid-cols-1 gap-6">
                {header}
                <StatusBanner tone="error" title="โหลดรายการเงินไม่สำเร็จ">
                    {loadError.message}
                </StatusBanner>
            </div>
        );
    }
    if (!payouts) return <PageSkeleton />;

    const count = (status: FastworkPayoutStatus) => payouts.filter((payout) => payout.fwp_status === status).length;
    const shown = filter === "all" ? payouts : payouts.filter((payout) => payout.fwp_status === filter);
    const projectName = projectFilter ? payouts.find((payout) => payout.fwp_project_id === projectFilter)?.project_name : null;

    return (
        <div className="grid w-full grid-cols-1 gap-5">
            {header}
            {projectFilter && (
                <div className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
                    <span>เฉพาะงาน: {projectName ?? "งานที่เลือก"}</span>
                    <button type="button" className="min-h-9 text-blue-600 hover:underline" onClick={() => router.push("/fastwork/payouts")}>
                        ดูทุกงาน
                    </button>
                </div>
            )}
            <Segmented<Filter>
                label="สถานะ"
                value={filter}
                onChange={setFilter}
                options={[
                    { value: "all", label: "ทั้งหมด", count: payouts.length },
                    { value: "pending", label: "รอโอน", count: count("pending") },
                    { value: "received", label: "เงินเข้าแล้ว", count: count("received") },
                    { value: "cancelled", label: "ยกเลิก", count: count("cancelled") },
                ]}
            />
            <FieldHint>{FASTWORK_MESSAGES.payoutNet}</FieldHint>

            {shown.length === 0 ? (
                <EmptyState
                    title={filter === "pending" ? "ไม่มีรายการรอโอน" : "ยังไม่มีรายการเงิน"}
                    description='ลูกค้ายืนยันงวดบน Fastwork แล้วกด "บันทึกเงิน"'
                />
            ) : (
                <ul className="grid gap-2">
                    {shown.map((payout) => {
                        const status = STATUS[payout.fwp_status];
                        return (
                            <li key={payout.fwp_id} className={`grid gap-3 p-4 lg:grid-cols-[1fr_auto] lg:items-center ${CARD_CLASS}`}>
                                <div className="grid min-w-0 gap-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <StatusPill tone={status.tone}>{status.label}</StatusPill>
                                        <Link href={`/projects/view?id=${payout.fwp_project_id}`} className="-my-2 inline-flex min-h-10 min-w-10 items-center font-medium wrap-break-word text-gray-900 hover:text-blue-600">
                                            {payout.project_name}
                                        </Link>
                                    </div>
                                    <span className="text-xs text-gray-500">
                                        {[
                                            payout.fwm_name ? `งวด ${payout.fwm_order} ${payout.fwm_name}` : "เงินนอกงวด",
                                            payout.client_name,
                                            `ลูกค้ายืนยัน ${formatDateOnly(payout.fwp_approved_date)}`,
                                            payout.fwp_received_date ? `เงินเข้า ${formatDateOnly(payout.fwp_received_date)}` : null,
                                            payout.bank_account_label,
                                            payout.fwp_reference,
                                        ]
                                            .filter(Boolean)
                                            .join(" · ")}
                                    </span>
                                    {/* ที่มาของยอด: ราคางวด − ค่าธรรมเนียม − VAT − หัก ณ ที่จ่าย = เข้าบัญชี */}
                                    <span className="text-sm text-gray-700 tabular-nums">
                                        {formatAmount(payout.fwp_gross)} − ค่าธรรมเนียม {formatAmount(payout.fwp_fee)} ({Number(payout.fwp_fee_rate)}%)
                                        {Number(payout.fwp_fee_vat) > 0 ? ` − VAT ${formatAmount(payout.fwp_fee_vat)}` : ""}
                                        {Number(payout.fwp_wht) > 0 ? ` − หัก ณ ที่จ่าย ${formatAmount(payout.fwp_wht)}` : ""} ={" "}
                                        <span className="font-medium text-gray-900">{formatAmount(payout.fwp_net)}</span>
                                    </span>
                                    {payout.fwp_status === "cancelled" && payout.fwp_cancel_reason && (
                                        <span className="text-xs text-red-600">ยกเลิก: {payout.fwp_cancel_reason}</span>
                                    )}
                                </div>
                                {payout.fwp_status !== "cancelled" && (
                                    <div className="flex flex-wrap gap-2 lg:justify-end">
                                        {payout.fwp_status === "pending" && (
                                            <button type="button" className={buttonClass("primary", "sm")} onClick={() => setReceiving(payout)}>
                                                ยืนยันเงินเข้า
                                            </button>
                                        )}
                                        <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setCancelling(payout)}>
                                            ยกเลิก
                                        </button>
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}

            {isRecording && (
                <PayoutSheet
                    defaultProjectId={projectFilter}
                    defaultMilestoneId={searchParams.get("milestone")}
                    onClose={() => setIsRecording(false)}
                    onSaved={load}
                />
            )}
            {receiving && <ReceiveSheet key={receiving.fwp_id} payout={receiving} onClose={() => setReceiving(null)} onSaved={load} />}
            <ReasonDialog
                open={Boolean(cancelling)}
                title="ยกเลิกรายการเงินนี้?"
                description={cancelling ? `${cancelling.project_name} · ${formatAmount(cancelling.fwp_gross)} บาท · ${FASTWORK_MESSAGES.cancel}` : undefined}
                reasonLabel="เหตุผล (เช่น คืนเงินลูกค้า บันทึกผิด)"
                confirmLabel="ยกเลิกรายการ"
                tone="danger"
                loading={isCancelling}
                errorMessage={cancelError}
                onConfirm={cancel}
                onCancel={() => {
                    setCancelling(null);
                    setCancelError(null);
                }}
            />
        </div>
    );
}
