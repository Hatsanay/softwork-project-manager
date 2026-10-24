"use client";

// รออนุมัติ (2026-10-19 · docs/plans/2026-10-19-people-ux-redesign.md ข้อ 2.1) — ใบลา + OT + WFH + ขอแก้เวลา (2026-10-24) + ลงชั่วโมง รวมไว้ที่เดียว
// ใช้แผงอนุมัติเดิมของหน้าการลา/ลงเวลา · แท็บขึ้นตามสิทธิ์ (ลา = approveLeave · ลงเวลา = ขอบเขตที่ backend ส่งมา)
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CircleCheck } from "lucide-react";
import PageHeader from "@/components/ui/page-header";
import Segmented from "@/components/ui/segmented";
import EmptyState from "@/components/ui/empty-state";
import { PageSkeleton } from "@/components/ui/skeleton";
import { usePermission, BITS } from "@/app/components/permission-provider";
import { apiFetch } from "@/lib/api";
import type { ApprovalWeek, PendingCorrection, PendingLeave, PendingOvertime, PendingWfh } from "../_types";
import LeaveApprovalsPanel from "../leave/_components/leave-approvals-panel";
import ApprovalsPanel from "../timesheet/_components/approvals-panel";
import CorrectionsPanel from "../attendance/_components/corrections-panel";
import OvertimePanel from "../attendance/_components/overtime-panel";
import WfhPanel from "../attendance/_components/wfh-panel";

type Tab = "leave" | "overtime" | "wfh" | "corrections" | "timesheet";

export default function ApprovalsPage() {
    return (
        <Suspense fallback={<PageSkeleton />}>
            <ApprovalsContent />
        </Suspense>
    );
}

function ApprovalsContent() {
    const hasBit = usePermission();
    const canApproveLeave = hasBit(BITS.approveLeave);
    const requestedTab = useSearchParams().get("tab");
    const canApproveAttendance = hasBit(BITS.approveTimesheet);
    const isKnownTab = ["timesheet", "leave", "corrections", "overtime", "wfh"].includes(requestedTab ?? "");
    const [tab, setTab] = useState<Tab | null>(isKnownTab ? (requestedTab as Tab) : null);
    const [overtime, setOvertime] = useState<PendingOvertime[]>([]);
    const [corrections, setCorrections] = useState<PendingCorrection[]>([]);
    const [wfh, setWfh] = useState<PendingWfh[]>([]);
    const [leaveCount, setLeaveCount] = useState<number | null>(null);
    const [timesheet, setTimesheet] = useState<{ can_approve: boolean; weeks: ApprovalWeek[] } | null>(null);

    const loadCounts = useCallback(async () => {
        const [leave, weeks, pendingCorrections, pendingOvertime, pendingWfh] = await Promise.all([
            canApproveLeave ? apiFetch<{ data: PendingLeave[] }>("/leave/approvals") : Promise.resolve(null),
            apiFetch<{ can_approve: boolean; weeks: ApprovalWeek[] }>("/timesheet/approvals"),
            canApproveAttendance ? apiFetch<{ data: PendingCorrection[] }>("/attendance/corrections/pending") : Promise.resolve(null),
            canApproveAttendance ? apiFetch<{ data: PendingOvertime[] }>("/attendance/overtime/pending") : Promise.resolve(null),
            canApproveAttendance ? apiFetch<{ data: PendingWfh[] }>("/attendance/wfh/pending") : Promise.resolve(null),
        ]);
        setLeaveCount(leave?.data?.data.length ?? null);
        setTimesheet(weeks.data);
        setCorrections(pendingCorrections?.data?.data ?? []);
        setOvertime(pendingOvertime?.data?.data ?? []);
        setWfh(pendingWfh?.data?.data ?? []);
    }, [canApproveLeave, canApproveAttendance]);

    useEffect(() => {
        let isLeftPage = false;
        Promise.all([
            canApproveLeave ? apiFetch<{ data: PendingLeave[] }>("/leave/approvals") : Promise.resolve(null),
            apiFetch<{ can_approve: boolean; weeks: ApprovalWeek[] }>("/timesheet/approvals"),
            canApproveAttendance ? apiFetch<{ data: PendingCorrection[] }>("/attendance/corrections/pending") : Promise.resolve(null),
            canApproveAttendance ? apiFetch<{ data: PendingOvertime[] }>("/attendance/overtime/pending") : Promise.resolve(null),
            canApproveAttendance ? apiFetch<{ data: PendingWfh[] }>("/attendance/wfh/pending") : Promise.resolve(null),
        ]).then(([leave, weeks, pendingCorrections, pendingOvertime, pendingWfh]) => {
            if (isLeftPage) return;
            setLeaveCount(leave?.data?.data.length ?? null);
            setTimesheet(weeks.data);
            setCorrections(pendingCorrections?.data?.data ?? []);
            setOvertime(pendingOvertime?.data?.data ?? []);
            setWfh(pendingWfh?.data?.data ?? []);
        });
        return () => {
            isLeftPage = true;
        };
    }, [canApproveLeave, canApproveAttendance]);

    if (!timesheet) return <PageSkeleton />;

    const options: { value: Tab; label: string; count?: number }[] = [];
    if (canApproveLeave) options.push({ value: "leave", label: "ใบลา", count: leaveCount ?? 0 });
    if (canApproveAttendance) options.push({ value: "overtime", label: "OT", count: overtime.length });
    if (canApproveAttendance) options.push({ value: "wfh", label: "WFH", count: wfh.length });
    if (canApproveAttendance) options.push({ value: "corrections", label: "ขอแก้เวลา", count: corrections.length });
    if (timesheet.can_approve) options.push({ value: "timesheet", label: "ลงเวลา", count: timesheet.weeks.length });
    // ยังไม่เลือกแท็บ: เปิดแท็บที่มีงานค้างก่อน
    const activeTab =
        tab ?? (options.find((option) => (option.count ?? 0) > 0)?.value ?? options[0]?.value ?? null);
    const totalPending =
        (leaveCount ?? 0) + overtime.length + wfh.length + corrections.length + (timesheet.can_approve ? timesheet.weeks.length : 0);

    return (
        <div className="grid w-full grid-cols-1 gap-6">
            <PageHeader
                eyebrow="บุคคล"
                title="รออนุมัติ"
                description={totalPending > 0 ? `ค้างอยู่ ${totalPending} รายการ · อนุมัติแล้วรายการหายจากหน้านี้` : "ไม่มีรายการค้าง"}
            />
            {options.length === 0 && (
                <EmptyState icon={CircleCheck} title="ไม่มีรายการที่คุณต้องอนุมัติ" description="ใบลา OT WFH และคำขอแก้เวลาที่รอคุณจะขึ้นที่นี่" />
            )}
            {options.length > 1 && (
                <Segmented<Tab> label="ประเภท" role="tablist" value={activeTab ?? "leave"} onChange={setTab} options={options} />
            )}
            {activeTab === "leave" && canApproveLeave && <LeaveApprovalsPanel onChanged={loadCounts} />}
            {activeTab === "overtime" && canApproveAttendance && <OvertimePanel overtime={overtime} onChanged={loadCounts} />}
            {activeTab === "wfh" && canApproveAttendance && <WfhPanel requests={wfh} onChanged={loadCounts} />}
            {activeTab === "corrections" && canApproveAttendance && (
                <CorrectionsPanel corrections={corrections} onChanged={loadCounts} />
            )}
            {activeTab === "timesheet" && timesheet.can_approve && (
                <ApprovalsPanel weeks={timesheet.weeks} onChanged={loadCounts} />
            )}
        </div>
    );
}
