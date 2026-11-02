"use client";

// การ์ดงาน Fastwork ในหน้าโปรเจกต์ (2026-10-24 · P-1) — ขึ้นเฉพาะโปรเจกต์ช่องทาง Fastwork
// งวดงาน + สถานะ (ยังไม่ส่ง → ส่งงานแล้ว → รอโอน → เงินเข้าแล้ว) · สมาชิกกด "ส่งงานแล้ว" ได้
// ยอดเงินเฉพาะผู้จัดการ Fastwork/ผู้ดูใบแจ้งหนี้ (backend ตัดให้) · ผู้จัดการบันทึกเงินของงวดได้จากการ์ดนี้
// ทำจบในหน้าโปรเจกต์ (2026-11-01): ลูกค้ายืนยันงวด → แผงบันทึกเงิน (ติ๊กเงินเข้าแล้วได้เลย) · รอโอน → เงินเข้าแล้ว · ตัดงวดที่ลูกค้าไม่จ่าย
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { BriefcaseBusiness, ExternalLink, Link2, Scissors } from "lucide-react";
import ReasonDialog from "@/components/ui/reason-dialog";
import PayoutSheet from "../../../fastwork/_components/payout-sheet";
import ReceiveSheet from "../../../fastwork/_components/receive-sheet";
import SectionCard from "@/components/ui/section-card";
import StatusPill, { type PillTone } from "@/components/ui/status-pill";
import FieldHint from "@/components/ui/guidance/field-hint";
import StatusBanner from "@/components/ui/guidance/status-banner";
import { buttonClass } from "@/components/ui/button";
import { usePermission, BITS } from "@/app/components/permission-provider";
import { apiFetch, type ApiError } from "@/lib/api";
import { formatAmount } from "@/lib/shared/money.mjs";
import { bangkokDateTimeToIso, formatDateOnly } from "@/app/function";
import type { FastworkMilestone, FastworkMilestoneState, FastworkPayout, ProjectFastwork } from "../../../fastwork/_types";
import { FASTWORK_MESSAGES } from "../../../fastwork/_messages";

const STATE: Record<FastworkMilestoneState, { label: string; tone: PillTone }> = {
    open: { label: "ยังไม่ส่งงาน", tone: "neutral" },
    delivered: { label: "ส่งงานแล้ว รอลูกค้ายืนยัน", tone: "info" },
    pending: { label: "ลูกค้ายืนยันแล้ว รอโอน", tone: "wait" },
    received: { label: "เงินเข้าแล้ว", tone: "success" },
    cut: { label: "ตัดงวดแล้ว (ไม่ได้เงิน)", tone: "neutral" },
};

export default function FastworkProjectCard({
    projectId,
    isMember,
    onChanged,
}: {
    projectId: string;
    isMember: boolean;
    // งวด/เงินเปลี่ยน → หน้าโปรเจกต์โหลด "ต่อไปต้องทำ" และการเงินใหม่
    onChanged?: () => void;
}) {
    const hasBit = usePermission();
    const canManage = hasBit(BITS.manageFastwork);
    const canCreateLink = hasBit(BITS.manageServiceRequests);
    const [data, setData] = useState<ProjectFastwork | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);
    const [workingId, setWorkingId] = useState<number | null>(null);
    const [recordingMilestone, setRecordingMilestone] = useState<FastworkMilestone | null>(null);
    const [receivingPayout, setReceivingPayout] = useState<FastworkPayout | null>(null);
    const [cuttingMilestone, setCuttingMilestone] = useState<FastworkMilestone | null>(null);
    const [cutError, setCutError] = useState<string | null>(null);

    const load = useCallback(async () => {
        const { data: loaded, error } = await apiFetch<ProjectFastwork>(`/fastwork/projects/${projectId}`);
        setLoadError(error);
        if (loaded) setData(loaded);
    }, [projectId]);

    useEffect(() => {
        let isLeftPage = false;
        apiFetch<ProjectFastwork>(`/fastwork/projects/${projectId}`).then(({ data: loaded, error }) => {
            if (isLeftPage) return;
            setLoadError(error);
            if (loaded) setData(loaded);
        });
        return () => {
            isLeftPage = true;
        };
    }, [projectId]);

    async function setDelivered(milestoneId: number, delivered: boolean) {
        setWorkingId(milestoneId);
        const { error } = await apiFetch(`/fastwork/projects/${projectId}/milestones/${milestoneId}/delivered`, {
            method: "POST",
            body: { delivered },
        });
        setWorkingId(null);
        if (error) {
            toast.error(error.message);
            return;
        }
        toast.success(delivered ? "บันทึกว่าส่งงานงวดนี้แล้ว" : "ยกเลิกการส่งงานแล้ว");
        await reloadAll();
    }

    async function reloadAll() {
        await load();
        onChanged?.();
    }

    async function cutMilestone(reason: string) {
        if (!cuttingMilestone) return;
        setWorkingId(cuttingMilestone.fwm_id);
        const { error } = await apiFetch(`/fastwork/projects/${projectId}/milestones/${cuttingMilestone.fwm_id}/cut`, { method: "POST", body: { reason } });
        setWorkingId(null);
        if (error) {
            setCutError(error.message);
            return;
        }
        setCuttingMilestone(null);
        toast.success("ตัดงวดแล้ว · ไม่นับในราคางานและการปิดงาน");
        await reloadAll();
    }

    async function restoreMilestone(milestoneId: number) {
        setWorkingId(milestoneId);
        const { error } = await apiFetch(`/fastwork/projects/${projectId}/milestones/${milestoneId}/restore`, { method: "POST" });
        setWorkingId(null);
        if (error) {
            toast.error(error.message);
            return;
        }
        toast.success("ยกเลิกการตัดงวดแล้ว");
        await reloadAll();
    }

    const fastwork = data?.fastwork;
    const totals = fastwork?.totals ?? null;

    return (
        <SectionCard
            id="project-fastwork"
            icon={BriefcaseBusiness}
            title="งาน Fastwork"
            description="งวดงานตามที่ตกลงบน Fastwork · ส่งงานบนแพลตฟอร์มแล้วกด ส่งงานแล้ว ที่งวดนั้น"
            actions={
                fastwork?.url && (
                    <a href={fastwork.url} target="_blank" rel="noreferrer" className={buttonClass("secondary", "sm")}>
                        <ExternalLink size={14} />
                        เปิดหน้างานบน Fastwork
                    </a>
                )
            }
        >
            {loadError && (
                <StatusBanner tone="error" title="โหลดงวดงานไม่สำเร็จ">
                    {loadError.message}
                </StatusBanner>
            )}
            {!data && !loadError && <p className="text-sm text-gray-500">กำลังโหลด...</p>}
            {fastwork && (
                <div className="grid gap-4">
                    {fastwork.order_no && <p className="text-sm text-gray-600">เลขคำสั่งซื้อ {fastwork.order_no}</p>}

                    {/* ยอดรวม: ราคางาน = เงินเข้าแล้ว + รอโอน + ยังไม่ได้รับ (ตัวเลขชุดเดียวกันทั้งหมด) */}
                    {totals && (
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            <Total label="ราคางานรวม" value={totals.contract} />
                            <Total label="เงินเข้าแล้ว (ราคางวด)" value={totals.received_gross} tone="text-green-600" />
                            <Total label="รอโอน" value={totals.pending_gross} />
                            <Total label="ยังไม่ได้รับ" value={totals.not_yet_paid} />
                        </div>
                    )}
                    {totals && Number(totals.received_gross) > 0 && (
                        <p className="text-sm text-gray-700 tabular-nums">
                            เงินที่เข้าบัญชีแล้ว {formatAmount(totals.net_received)} = ราคางวด {formatAmount(totals.received_gross)} − ค่าธรรมเนียม{" "}
                            {formatAmount(totals.fee)}
                            {Number(totals.fee_vat) > 0 ? ` − VAT ${formatAmount(totals.fee_vat)}` : ""}
                            {Number(totals.wht) > 0 ? ` − หัก ณ ที่จ่าย ${formatAmount(totals.wht)}` : ""}
                        </p>
                    )}

                    <ol className="grid gap-2">
                        {fastwork.milestones.map((milestone) => {
                            const state = STATE[milestone.state];
                            const canRecord = canManage && (milestone.state === "open" || milestone.state === "delivered");
                            const pendingPayout =
                                milestone.state === "pending" ? (fastwork.payouts.find((payout) => payout.fwp_id === milestone.payout_id) ?? null) : null;
                            const isCut = milestone.state === "cut";
                            return (
                                <li key={milestone.fwm_id} className="grid gap-2 rounded-xl border border-gray-200 p-3 sm:grid-cols-[1fr_auto] sm:items-center">
                                    <div className="grid min-w-0 gap-0.5">
                                        <span className={`text-sm font-medium wrap-break-word ${isCut ? "text-gray-500 line-through" : "text-gray-900"}`}>
                                            งวด {milestone.fwm_order} · {milestone.fwm_name}
                                            {milestone.fwm_amount ? (
                                                <span className="font-normal text-gray-600 tabular-nums"> · {formatAmount(milestone.fwm_amount)} บาท</span>
                                            ) : null}
                                        </span>
                                        <span className="text-xs text-gray-500">
                                            {milestone.fwm_due_date ? `ครบกำหนด ${formatDateOnly(milestone.fwm_due_date)}` : "ไม่ได้กำหนดวันส่ง"}
                                            {milestone.fwm_delivered_at ? ` · ส่งงานเมื่อ ${formatDateOnly(bangkokDateTimeToIso(milestone.fwm_delivered_at))}` : ""}
                                        </span>
                                        {isCut && milestone.fwm_cancel_reason && (
                                            <span className="text-xs text-gray-600">เหตุผลที่ตัด: {milestone.fwm_cancel_reason}</span>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                                        <StatusPill tone={state.tone}>{state.label}</StatusPill>
                                        {isMember && milestone.state === "open" && (
                                            <button
                                                type="button"
                                                className={buttonClass("secondary", "sm")}
                                                disabled={workingId === milestone.fwm_id}
                                                onClick={() => setDelivered(milestone.fwm_id, true)}
                                            >
                                                ส่งงานแล้ว
                                            </button>
                                        )}
                                        {isMember && milestone.state === "delivered" && (
                                            <button
                                                type="button"
                                                className={buttonClass("ghost", "sm")}
                                                disabled={workingId === milestone.fwm_id}
                                                onClick={() => setDelivered(milestone.fwm_id, false)}
                                            >
                                                ยังไม่ได้ส่ง
                                            </button>
                                        )}
                                        {canRecord && (
                                            <button type="button" className={buttonClass("primary", "sm")} onClick={() => setRecordingMilestone(milestone)}>
                                                ลูกค้ายืนยันงวดแล้ว
                                            </button>
                                        )}
                                        {canManage && pendingPayout && (
                                            <button type="button" className={buttonClass("primary", "sm")} onClick={() => setReceivingPayout(pendingPayout)}>
                                                เงินเข้าแล้ว
                                            </button>
                                        )}
                                        {canRecord && (
                                            <button
                                                type="button"
                                                className={buttonClass("ghost", "sm")}
                                                disabled={workingId === milestone.fwm_id}
                                                onClick={() => {
                                                    setCutError(null);
                                                    setCuttingMilestone(milestone);
                                                }}
                                            >
                                                <Scissors size={14} />
                                                ตัดงวด
                                            </button>
                                        )}
                                        {canManage && isCut && (
                                            <button
                                                type="button"
                                                className={buttonClass("ghost", "sm")}
                                                disabled={workingId === milestone.fwm_id}
                                                onClick={() => restoreMilestone(milestone.fwm_id)}
                                            >
                                                ยกเลิกการตัด
                                            </button>
                                        )}
                                    </div>
                                </li>
                            );
                        })}
                    </ol>
                    {canManage && (
                        <Link href={`/fastwork/payouts?project=${projectId}`} className="-my-2 justify-self-start py-2 text-sm text-blue-600 hover:underline">
                            ดูรายการเงินของงานนี้ →
                        </Link>
                    )}
                    {canCreateLink && (
                        <div className="grid gap-1 rounded-xl border border-dashed border-gray-200 p-3">
                            <Link href={`/sales/order-links?kind=fastwork&project=${projectId}`} className={buttonClass("secondary", "sm", "justify-self-start")}>
                                <Link2 size={14} />
                                ลิงก์ให้ลูกค้าเลือกขอบเขตงานเพิ่ม
                            </Link>
                            <FieldHint>ลูกค้าเลือกสิ่งที่ต้องการ ตอบคำถาม แนบไฟล์ · คำตอบเข้าการ์ด &quot;ความต้องการจากลูกค้า&quot; · ส่วนที่เพิ่มส่งราคาและรับเงินบน Fastwork</FieldHint>
                        </div>
                    )}
                    {canManage && (
                        <FieldHint>
                            ลูกค้ายืนยันงวดบน Fastwork แล้วกด &quot;ลูกค้ายืนยันงวดแล้ว&quot; · เงินเข้าบัญชีแล้วติ๊ก &quot;เงินเข้าแล้ว&quot; ในแผงได้เลย ·
                            ลูกค้าไม่จ่ายงวดไหน กด &quot;ตัดงวด&quot; พร้อมเหตุผล (งวดที่ตัดไม่นับในราคางานและการปิดงาน)
                        </FieldHint>
                    )}
                    <FieldHint>{FASTWORK_MESSAGES.profit}</FieldHint>
                </div>
            )}

            {recordingMilestone && (
                <PayoutSheet
                    defaultProjectId={projectId}
                    defaultMilestoneId={String(recordingMilestone.fwm_id)}
                    onClose={() => setRecordingMilestone(null)}
                    onSaved={reloadAll}
                />
            )}
            {receivingPayout && (
                <ReceiveSheet key={receivingPayout.fwp_id} payout={receivingPayout} onClose={() => setReceivingPayout(null)} onSaved={reloadAll} />
            )}
            <ReasonDialog
                open={cuttingMilestone !== null}
                title={`ตัดงวด "${cuttingMilestone?.fwm_name ?? ""}"`}
                description="ใช้เมื่อลูกค้ายกเลิกบางส่วนหรือไม่จ่ายงวดนี้ · งวดที่ตัดไม่นับในราคางาน ขั้นถัดไป และการปิดงาน · ยกเลิกการตัดได้ภายหลัง"
                reasonLabel="เหตุผลที่ตัดงวด"
                reasonHint="เช่น ลูกค้าขอจบงานแค่ส่วนออกแบบ"
                confirmLabel="ตัดงวด"
                loading={workingId !== null}
                errorMessage={cutError}
                onConfirm={cutMilestone}
                onCancel={() => setCuttingMilestone(null)}
            />
        </SectionCard>
    );
}

function Total({ label, value, tone = "text-gray-900" }: { label: string; value: string; tone?: string }) {
    return (
        <div className="grid content-start gap-0.5 rounded-xl bg-gray-50 p-3">
            <span className="text-xs text-gray-500">{label}</span>
            <span className={`text-base font-medium tabular-nums ${tone}`}>{formatAmount(value)}</span>
        </div>
    );
}
