"use client";

// ลงเวลาทำงาน (2026-10-17 เฟส 4 ขั้น 4-2) — แท็บ "สัปดาห์ของฉัน" (ทุกคน) และ "รออนุมัติ" (เฉพาะผู้มีขอบเขตอนุมัติ)
// ผู้อนุมัติ = ผู้มีสิทธิ์อนุมัติลงเวลา หรือผู้จัดการสมาชิกของโปรเจกต์ — backend เป็นคนตัดสิน หน้านี้แค่แสดงตามที่ได้
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/page-header";
import Segmented from "@/components/ui/segmented";
import { PageSkeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import Link from "next/link";
import StatusBanner from "@/components/ui/guidance/status-banner";
import { TIMESHEET_MESSAGES } from "../_messages";
import { usePeopleSetup } from "../_hooks/use-people-setup";
import type { ApprovalWeek } from "../_types";
import MyWeekPanel from "./_components/my-week-panel";
import ApprovalsPanel from "./_components/approvals-panel";

type Tab = "mine" | "approvals";

// useSearchParams (?tab= / ?week=) ต้องอยู่ใน Suspense — Next.js 16 เรนเดอร์ส่วนนี้ฝั่งผู้ใช้ ส่วนอื่นของหน้ายังเรนเดอร์จากเซิร์ฟเวอร์ได้
export default function TimesheetPage() {
    return (
        <Suspense fallback={<PageSkeleton />}>
            <TimesheetContent />
        </Suspense>
    );
}

function TimesheetContent() {
    // ?tab=approvals = เปิดแท็บรออนุมัติตรงๆ (ลิงก์จากที่อื่น)
    const [tab, setTab] = useState<Tab>(useSearchParams().get("tab") === "approvals" ? "approvals" : "mine");
    const [approvals, setApprovals] = useState<{ can_approve: boolean; weeks: ApprovalWeek[] } | null>(null);

    const loadApprovals = useCallback(async () => {
        const { data } = await apiFetch<{ can_approve: boolean; weeks: ApprovalWeek[] }>("/timesheet/approvals");
        setApprovals(data);
    }, []);

    useEffect(() => {
        let isLeftPage = false;
        apiFetch<{ can_approve: boolean; weeks: ApprovalWeek[] }>("/timesheet/approvals").then(({ data }) => {
            if (!isLeftPage) setApprovals(data);
        });
        return () => {
            isLeftPage = true;
        };
    }, []);

    const canApprove = approvals?.can_approve ?? false;
    // ปิดลงชั่วโมงต่อโปรเจกต์อยู่ (ค่าเริ่มต้นตั้งแต่ 2026-10-23) — บอกและพาไปหน้าลงเวลาเข้า-ออกงาน
    const { setup } = usePeopleSetup();
    if (setup?.settings && !setup.settings.ps_timesheet_enabled) {
        return (
            <div className="grid w-full grid-cols-1 gap-6">
                <PageHeader eyebrow="บุคคล" title="ลงชั่วโมงต่อโปรเจกต์" description={TIMESHEET_MESSAGES.description} />
                <StatusBanner tone="info" title="ปิดการลงชั่วโมงต่อโปรเจกต์อยู่">
                    บริษัทใช้ลงเวลาเข้า-ออกงานแทน ·{" "}
                    <Link href="/people/attendance" className="text-blue-600 underline">
                        ไปหน้าลงเวลาเข้า-ออกงาน
                    </Link>{" "}
                    · ฝ่ายบุคคลเปิดกลับได้ที่ ตั้งค่าบุคคล &gt; เวลาทำงาน
                </StatusBanner>
            </div>
        );
    }

    return (
        <div className="grid w-full grid-cols-1 gap-6">
            <PageHeader eyebrow="บุคคล" title="ลงเวลาทำงาน" description={TIMESHEET_MESSAGES.description} />
            {canApprove && (
                <Segmented<Tab>
                    label="มุมมอง"
                    role="tablist"
                    value={tab}
                    onChange={setTab}
                    options={[
                        { value: "mine", label: "สัปดาห์ของฉัน" },
                        { value: "approvals", label: "รออนุมัติ", count: approvals?.weeks.length ?? 0 },
                    ]}
                />
            )}
            {tab === "approvals" && approvals ? (
                <ApprovalsPanel weeks={approvals.weeks} onChanged={loadApprovals} />
            ) : (
                <MyWeekPanel />
            )}
        </div>
    );
}
