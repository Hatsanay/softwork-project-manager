"use client";

// การลา (2026-10-17 เฟส 4 ขั้น 4-3) — แท็บ "ลาของฉัน" · "ปฏิทินทีม" (ทุกคน) · "อนุมัติลา" (สิทธิ์ approveLeave)
// แบบระบบ: docs/plans/2026-10-17-people-payroll-4.md หัวข้อ 4.4
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/page-header";
import Segmented from "@/components/ui/segmented";
import { PageSkeleton } from "@/components/ui/skeleton";
import { usePermission, BITS } from "@/app/components/permission-provider";
import { LEAVE_MESSAGES } from "../_messages";
import MyLeavePanel from "./_components/my-leave-panel";
import TeamCalendar from "./_components/team-calendar";
import LeaveApprovalsPanel from "./_components/leave-approvals-panel";

type Tab = "mine" | "calendar" | "approvals";

// useSearchParams (?tab=) ต้องอยู่ใน Suspense (Next.js 16)
export default function LeavePage() {
    return (
        <Suspense fallback={<PageSkeleton />}>
            <LeaveContent />
        </Suspense>
    );
}

function LeaveContent() {
    const hasBit = usePermission();
    const canApprove = hasBit(BITS.approveLeave);
    const requestedTab = useSearchParams().get("tab");
    const [tab, setTab] = useState<Tab>(() => {
        if (requestedTab === "calendar") return "calendar";
        if (requestedTab === "approvals" && canApprove) return "approvals";
        return "mine";
    });
    // อนุมัติแล้วปฏิทินโหลดใหม่เมื่อสลับไปดู
    const [calendarRefresh, setCalendarRefresh] = useState(0);

    const options: { value: Tab; label: string }[] = [
        { value: "mine", label: "ลาของฉัน" },
        { value: "calendar", label: "ปฏิทินทีม" },
    ];
    if (canApprove) options.push({ value: "approvals", label: "อนุมัติลา" });

    return (
        <div className="grid w-full grid-cols-1 gap-6">
            <PageHeader eyebrow="บุคคล" title="การลา" description={LEAVE_MESSAGES.description} />
            <Segmented<Tab> label="มุมมอง" role="tablist" value={tab} onChange={setTab} options={options} />
            {tab === "mine" && <MyLeavePanel />}
            {tab === "calendar" && <TeamCalendar refreshKey={calendarRefresh} />}
            {tab === "approvals" && canApprove && (
                <LeaveApprovalsPanel onChanged={() => setCalendarRefresh((value) => value + 1)} />
            )}
        </div>
    );
}
