"use client";

// แดชบอร์ด (หน้าตาใหม่ U3 2026-10-14 · ภาพรวมธุรกิจ 2026-10-31 docs/plans/2026-10-31-dashboard-business.md)
// เรียงหัวข้อ: ต้องจัดการ → ธุรกิจ → งานของฉัน → ทีม · แต่ละส่วนขึ้นตามสิทธิ์เดิม (backend ไม่ส่งส่วนที่ไม่มีสิทธิ์)
// summary งาน + ภาพรวมธุรกิจโหลดพร้อมกันครั้งเดียว · ภาพรวมทีม/KPI โหลดแยกตามตัวกรองของตัวเอง
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
    FileClock,
    Inbox,
    ListTodo,
    MessageCircle,
    ReceiptText,
    Rocket,
    Send,
    TriangleAlert,
    Users,
    Wallet,
} from "lucide-react";
import { usePermission, BITS } from "@/app/components/permission-provider";
import StatusBanner from "@/components/ui/guidance/status-banner";
import { PageSkeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import { formatAmount, parseHundredths } from "@/lib/shared/money.mjs";
import { isOverdue, taskLink } from "./_labels";
import type { BusinessSummary, OpenIssue, Summary } from "./_types";
import WelcomeCard from "./_components/welcome-card";
import { ActiveProjectsCard, MyTasksCard, OpenIssuesCard, UnreadChatsCard } from "./_components/work-cards";
import TeamWorkloadCard from "./_components/team-workload-card";
import KpiSection, { type KpiPeriod } from "./_components/kpi-section";
import RecentActivityCard from "./_components/recent-activity-card";
import { ActionStrip, CapitalCard, CashCard, FastworkJobsCard, type ActionItem } from "./_components/business-cards";

function currentPeriod(): KpiPeriod {
    const today = new Date();
    return {
        mode: "month",
        month: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`,
        year: String(today.getFullYear()),
    };
}

/** สิ่งที่ต้องจัดการ: เรื่องเงิน/ลูกค้าก่อน แล้วเรื่องงาน · ช่องที่เป็น 0 ไม่แสดง */
function actionItemsOf(
    summary: Summary,
    business: BusinessSummary | null,
    overdueCount: number,
    openIssueCount: number,
): ActionItem[] {
    const items: ActionItem[] = [];
    const add = (count: number, item: Omit<ActionItem, "value"> & { value?: string }) => {
        if (count > 0) items.push({ value: String(count), ...item });
    };
    if (business?.requests) {
        add(business.requests.submitted, {
            key: "requests",
            label: "คำขอใหม่รอตรวจ",
            href: "/sales/service-requests?status=submitted",
            icon: Inbox,
            tone: "normal",
        });
    }
    if (business?.quotations) {
        const { waiting, expiring_soon: expiringSoon, expiring_days: expiringDays } = business.quotations;
        add(waiting, {
            key: "quotations",
            label: "ใบเสนอราคารอลูกค้าตอบ",
            note: expiringSoon > 0 ? `${expiringSoon} ใบหมดอายุใน ${expiringDays} วัน` : undefined,
            href: "/sales/quotations?tab=sent",
            icon: Send,
            tone: expiringSoon > 0 ? "wait" : "normal",
        });
    }
    if (business?.receivables && parseHundredths(business.receivables.overdue, "ยอด") > 0n) {
        items.push({
            key: "overdue",
            value: formatAmount(business.receivables.overdue),
            label: "ลูกค้าจ่ายเลยกำหนด (บาท)",
            note: `${business.receivables.overdue_clients} ราย`,
            href: "/sales/receivables",
            icon: ReceiptText,
            tone: "urgent",
        });
    }
    if (business?.fastwork) {
        const steps = business.fastwork.steps;
        add(steps.milestones_awaiting_record, {
            key: "fw-record",
            label: "งวด Fastwork รอบันทึกเงิน",
            href: "/fastwork/payouts?new=1",
            icon: FileClock,
            tone: "wait",
        });
        add(steps.payouts_pending, {
            key: "fw-pending",
            label: "งวดรอ Fastwork โอน",
            note: steps.payouts_pending_net === null ? undefined : `${formatAmount(steps.payouts_pending_net)} บาท`,
            href: "/fastwork/payouts?status=pending",
            icon: Wallet,
            tone: "wait",
        });
        add(steps.projects_without_shares, {
            key: "fw-unset",
            label: "งานยังไม่ตั้งส่วนแบ่ง",
            href: "/fastwork/shares?state=unset",
            icon: Users,
            tone: "normal",
        });
        add(steps.projects_ready_to_close, {
            key: "fw-close",
            label: "งานเงินเข้าครบ พร้อมปิดยอด",
            href: "/fastwork/shares?state=ready",
            icon: Rocket,
            tone: "normal",
        });
        add(steps.share_lines_unpaid, {
            key: "fw-unpaid",
            label: "ส่วนแบ่งค้างจ่าย",
            href: "/fastwork/shares?state=unpaid",
            icon: Wallet,
            tone: "wait",
        });
    }
    if (summary.hasProjectAccess) {
        add(summary.myTasks.length, {
            key: "my-tasks",
            label: "งานของฉันที่ยังไม่เสร็จ",
            note: overdueCount > 0 ? `เลยกำหนด ${overdueCount} งาน` : undefined,
            href: "#my-tasks",
            icon: ListTodo,
            tone: overdueCount > 0 ? "urgent" : "normal",
        });
        add(openIssueCount, {
            key: "issues",
            label: "ปัญหาที่เปิดอยู่",
            href: "#open-issues",
            icon: TriangleAlert,
            tone: "wait",
        });
        add(summary.unreadChatCount, {
            key: "chats",
            label: "ข้อความที่ยังไม่อ่าน",
            href: "#unread-chats",
            icon: MessageCircle,
            tone: "normal",
        });
    }
    return items;
}

function SectionHeading({ title, note }: { title: string; note?: string }) {
    return (
        <div className="-mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <h2 className="text-sm font-medium tracking-wide text-gray-500">{title}</h2>
            {note && <p className="text-xs text-gray-400">{note}</p>}
        </div>
    );
}

export default function DashboardPage() {
    const router = useRouter();
    const hasBit = usePermission();
    const [summary, setSummary] = useState<Summary | null>(null);
    const [business, setBusiness] = useState<BusinessSummary | null>(null);
    const [firstName, setFirstName] = useState<string | null>(null);
    const [loadFailed, setLoadFailed] = useState(false);
    const [issueTab, setIssueTab] = useState<"task" | "subtask">("task");
    const [ownIssuesOnly, setOwnIssuesOnly] = useState(false);
    const [kpiPeriod, setKpiPeriod] = useState<KpiPeriod>(currentPeriod);

    useEffect(() => {
        let isLeftPage = false;
        Promise.all([
            apiFetch<Summary>("/dashboard/summary"),
            apiFetch<{ user_fname: string }>("/users/me"),
            apiFetch<BusinessSummary>("/dashboard/business"),
        ]).then(([summaryResult, meResult, businessResult]) => {
            if (isLeftPage) return;
            setSummary(summaryResult.data);
            setLoadFailed(Boolean(summaryResult.error));
            setFirstName(meResult.data?.user_fname ?? null);
            // ภาพรวมธุรกิจโหลดไม่ได้ = หน้ายังใช้ได้ แค่ไม่มีส่วนธุรกิจ
            setBusiness(businessResult.data);
        });
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

    function navigate(url: string) {
        router.push(url);
    }

    // เปิดปัญหาที่มีการตอบกลับใหม่ = ถือว่าอ่านแล้ว (ยิง GET replies เพื่อ mark-read เหมือนตอนเปิดเธรดในหน้าโปรเจกต์)
    // ไม่ต้องรอผล · ปัญหาหายจากรายการตอนโหลดแดชบอร์ดครั้งถัดไป (ถ้าไม่ได้โผล่มาด้วยเหตุผลอื่น)
    function openIssue(issue: OpenIssue) {
        if (issue.is_unread_reply) apiFetch(`/projects/${issue.project_id}/issues/${issue.issue_id}/replies`);
        router.push(taskLink(issue.project_id, issue.task_id));
    }

    const overdueCount = summary.myTasks.filter((task) => isOverdue(task.task_due_date)).length;
    const openIssueCount = ownIssuesOnly ? summary.openIssueCountOwnOnly : summary.openIssueCount;
    const actionItems = actionItemsOf(summary, business, overdueCount, openIssueCount);
    const hasBusiness = Boolean(business?.cash || business?.capital || business?.fastwork);
    const fastworkPending = business?.fastwork
        ? { count: business.fastwork.steps.payouts_pending, net: business.fastwork.steps.payouts_pending_net }
        : undefined;

    return (
        <div className="grid grid-cols-1 gap-6">
            <WelcomeCard
                firstName={firstName}
                activeProjectCount={summary.activeProjectCount}
                myTaskCount={summary.myTasks.length}
                overdueCount={overdueCount}
                openIssueCount={openIssueCount}
                unreadChatCount={summary.unreadChatCount}
                canCreateProject={hasBit(BITS.createProject)}
                hasProjectAccess={summary.hasProjectAccess}
                showCounters={false}
            />

            {(summary.hasProjectAccess || business) && (
                <>
                    <SectionHeading title="ต้องจัดการ" note="กดเพื่อไปหน้านั้น · ช่องที่ไม่มีอะไรค้างจะไม่แสดง" />
                    <ActionStrip items={actionItems} />
                </>
            )}

            {hasBusiness && business && (
                <>
                    <SectionHeading title="ธุรกิจ" />
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                        {business.cash && (
                            <CashCard
                                months={business.cash.months}
                                receivables={business.receivables}
                                fastworkPending={fastworkPending}
                            />
                        )}
                        {/* คอลัมน์ขวา: เงินทุน + งาน Fastwork ซ้อนกัน (ไม่มีกราฟเงินเข้า = เต็มแถว 2 คอลัมน์) */}
                        {(business.capital || business.fastwork) && (
                            <div
                                className={`grid content-start gap-6 ${business.cash ? "" : "lg:col-span-3 lg:grid-cols-2"}`}
                            >
                                {business.capital && <CapitalCard capital={business.capital} />}
                                {business.fastwork && <FastworkJobsCard fastwork={business.fastwork} />}
                            </div>
                        )}
                    </div>
                </>
            )}

            {summary.hasProjectAccess && (
                <>
                    <SectionHeading title="งานของฉัน" />
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                        <div id="my-tasks" className="grid scroll-mt-24">
                            <MyTasksCard tasks={summary.myTasks} onNavigate={navigate} />
                        </div>
                        <div id="open-issues" className="grid scroll-mt-24">
                            <OpenIssuesCard
                                issues={summary.openIssues}
                                issueTab={issueTab}
                                onIssueTabChange={setIssueTab}
                                ownOnly={ownIssuesOnly}
                                onOwnOnlyChange={setOwnIssuesOnly}
                                onOpenIssue={openIssue}
                            />
                        </div>
                        <div id="unread-chats" className="grid scroll-mt-24">
                            <UnreadChatsCard chats={summary.unreadChats} onNavigate={navigate} />
                        </div>
                        <ActiveProjectsCard projects={summary.projects} onNavigate={navigate} />
                    </div>

                    <SectionHeading title="ทีม" />
                    {summary.canViewTeamWorkload && <TeamWorkloadCard />}
                    <KpiSection
                        period={kpiPeriod}
                        onPeriodChange={setKpiPeriod}
                        canViewMembers={hasBit(BITS.viewMemberKpi)}
                    />
                    <RecentActivityCard activities={summary.recentActivity} />
                </>
            )}
        </div>
    );
}
