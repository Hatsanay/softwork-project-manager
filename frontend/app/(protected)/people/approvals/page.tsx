"use client";

// รออนุมัติ (2026-10-19 · docs/plans/2026-10-19-people-ux-redesign.md ข้อ 2.1) — ใบลา + ลงเวลา รวมไว้ที่เดียว
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
import type { ApprovalWeek, PendingLeave } from "../_types";
import LeaveApprovalsPanel from "../leave/_components/leave-approvals-panel";
import ApprovalsPanel from "../timesheet/_components/approvals-panel";

type Tab = "leave" | "timesheet";

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
    const [tab, setTab] = useState<Tab | null>(requestedTab === "timesheet" || requestedTab === "leave" ? requestedTab : null);
    const [leaveCount, setLeaveCount] = useState<number | null>(null);
    const [timesheet, setTimesheet] = useState<{ can_approve: boolean; weeks: ApprovalWeek[] } | null>(null);

    const loadCounts = useCallback(async () => {
        const [leave, weeks] = await Promise.all([
            canApproveLeave ? apiFetch<{ data: PendingLeave[] }>("/leave/approvals") : Promise.resolve(null),
            apiFetch<{ can_approve: boolean; weeks: ApprovalWeek[] }>("/timesheet/approvals"),
        ]);
        setLeaveCount(leave?.data?.data.length ?? null);
        setTimesheet(weeks.data);
    }, [canApproveLeave]);

    useEffect(() => {
        let isLeftPage = false;
        Promise.all([
            canApproveLeave ? apiFetch<{ data: PendingLeave[] }>("/leave/approvals") : Promise.resolve(null),
            apiFetch<{ can_approve: boolean; weeks: ApprovalWeek[] }>("/timesheet/approvals"),
        ]).then(([leave, weeks]) => {
            if (isLeftPage) return;
            setLeaveCount(leave?.data?.data.length ?? null);
            setTimesheet(weeks.data);
        });
        return () => {
            isLeftPage = true;
        };
    }, [canApproveLeave]);

    if (!timesheet) return <PageSkeleton />;

    const options: { value: Tab; label: string; count?: number }[] = [];
    if (canApproveLeave) options.push({ value: "leave", label: "ใบลา", count: leaveCount ?? 0 });
    if (timesheet.can_approve) options.push({ value: "timesheet", label: "ลงเวลา", count: timesheet.weeks.length });
    // ยังไม่เลือกแท็บ: เปิดแท็บที่มีงานค้างก่อน
    const activeTab =
        tab ?? (options.find((option) => (option.count ?? 0) > 0)?.value ?? options[0]?.value ?? null);
    const totalPending = (leaveCount ?? 0) + (timesheet.can_approve ? timesheet.weeks.length : 0);

    return (
        <div className="mx-auto grid w-full max-w-4xl grid-cols-1 gap-6">
            <PageHeader
                eyebrow="บุคคล"
                title="รออนุมัติ"
                description={totalPending > 0 ? `ค้างอยู่ ${totalPending} รายการ · อนุมัติแล้วรายการหายจากหน้านี้` : "ไม่มีรายการค้าง"}
            />
            {options.length === 0 && (
                <EmptyState icon={CircleCheck} title="ไม่มีรายการที่คุณต้องอนุมัติ" description="ใบลาและลงเวลาที่รอคุณจะขึ้นที่นี่" />
            )}
            {options.length > 1 && (
                <Segmented<Tab> label="ประเภท" role="tablist" value={activeTab ?? "leave"} onChange={setTab} options={options} />
            )}
            {activeTab === "leave" && canApproveLeave && <LeaveApprovalsPanel onChanged={loadCounts} />}
            {activeTab === "timesheet" && timesheet.can_approve && (
                <ApprovalsPanel weeks={timesheet.weeks} onChanged={loadCounts} />
            )}
        </div>
    );
}
