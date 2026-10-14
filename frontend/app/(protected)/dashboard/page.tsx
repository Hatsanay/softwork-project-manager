"use client";

// แดชบอร์ด (หน้าตาใหม่ U3 — 2026-10-14) — ประกอบจากการ์ดใน _components/ · ข้อมูลและพฤติกรรมเหมือนเดิมทุกอย่าง (ไม่แตะ API)
// summary หลักโหลดครั้งเดียว · ภาพรวมทีม/KPI โหลดแยกตามตัวกรองของตัวเอง (เปลี่ยนตัวกรองไม่ต้องโหลดทั้งหน้าใหม่)
import { useEffect, useState } from "react";
import { usePermission, BITS } from "@/app/components/permission-provider";
import StatusBanner from "@/components/ui/guidance/status-banner";
import { PageSkeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import { isOverdue } from "./_labels";
import type { Summary } from "./_types";
import WelcomeCard from "./_components/welcome-card";
import { ActiveProjectsCard, MyTasksCard, OpenIssuesCard, UnreadChatsCard } from "./_components/work-cards";
import TeamWorkloadCard from "./_components/team-workload-card";
import { MemberKpiCard, MyKpiSection, type KpiPeriod } from "./_components/kpi-section";
import RecentActivityCard from "./_components/recent-activity-card";

function currentPeriod(): KpiPeriod {
    const today = new Date();
    return {
        mode: "month",
        month: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`,
        year: String(today.getFullYear()),
    };
}

export default function DashboardPage() {
    const hasBit = usePermission();
    const [summary, setSummary] = useState<Summary | null>(null);
    const [firstName, setFirstName] = useState<string | null>(null);
    const [loadFailed, setLoadFailed] = useState(false);
    const [issueTab, setIssueTab] = useState<"task" | "subtask">("task");
    const [ownIssuesOnly, setOwnIssuesOnly] = useState(false);
    const [kpiPeriod, setKpiPeriod] = useState<KpiPeriod>(currentPeriod);

    useEffect(() => {
        let isLeftPage = false;
        Promise.all([apiFetch<Summary>("/dashboard/summary"), apiFetch<{ user_fname: string }>("/users/me")]).then(
            ([summaryResult, meResult]) => {
                if (isLeftPage) return;
                setSummary(summaryResult.data);
                setLoadFailed(Boolean(summaryResult.error));
                setFirstName(meResult.data?.user_fname ?? null);
            },
        );
        return () => {
            isLeftPage = true;
        };
    }, []);

    if (loadFailed)
        return (
            <StatusBanner tone="error" title="โหลดข้อมูลแดชบอร์ดไม่สำเร็จ">
                ลองรีเฟรชหน้าอีกครั้ง ถ้ายังไม่ได้ให้แจ้งผู้ดูแลระบบ
            </StatusBanner>
        );
    if (!summary) return <PageSkeleton />;

    const overdueCount = summary.myTasks.filter((task) => isOverdue(task.task_due_date)).length;

    return (
        <div className="grid grid-cols-1 gap-6">
            <WelcomeCard
                firstName={firstName}
                activeProjectCount={summary.activeProjectCount}
                myTaskCount={summary.myTasks.length}
                overdueCount={overdueCount}
                openIssueCount={ownIssuesOnly ? summary.openIssueCountOwnOnly : summary.openIssueCount}
                unreadChatCount={summary.unreadChatCount}
                canCreateProject={hasBit(BITS.createProject)}
                hasProjectAccess={summary.hasProjectAccess}
            />

            {summary.hasProjectAccess && (
                <>
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                        <MyTasksCard tasks={summary.myTasks} />
                        <OpenIssuesCard
                            issues={summary.openIssues}
                            issueTab={issueTab}
                            onIssueTabChange={setIssueTab}
                            ownOnly={ownIssuesOnly}
                            onOwnOnlyChange={setOwnIssuesOnly}
                        />
                        <UnreadChatsCard chats={summary.unreadChats} />
                        <ActiveProjectsCard projects={summary.projects} />
                    </div>

                    {summary.canViewTeamWorkload && <TeamWorkloadCard />}
                    <MyKpiSection period={kpiPeriod} onPeriodChange={setKpiPeriod} />
                    {hasBit(BITS.viewMemberKpi) && <MemberKpiCard period={kpiPeriod} />}
                    <RecentActivityCard activities={summary.recentActivity} />
                </>
            )}
        </div>
    );
}
