"use client";

// ฉากเปิดเรื่อง "เริ่มวันทำงาน" — แดชบอร์ดตัวจริง (WelcomeCardView + การ์ดงานจาก work-cards.tsx) ด้วยข้อมูลจาก story.ts
// การจัดวางตาม app/(protected)/dashboard/page.tsx · ค้นหา "ห้องพัก" แล้วกดเข้าโปรเจกต์ (ฉากถัดไป = หน้าโปรเจกต์)
import WelcomeCardView, { DashboardSearchView } from "@/app/(protected)/dashboard/_components/welcome-card-view";
import {
    ActiveProjectsCard,
    MyTasksCard,
    OpenIssuesCard,
    UnreadChatsCard,
} from "@/app/(protected)/dashboard/_components/work-cards";
import { isOverdue } from "@/app/(protected)/dashboard/_labels";
import type { SearchResults } from "@/app/(protected)/dashboard/_types";
import AppFrame from "./app-frame";
import type { Scene } from "./kit";
import { countUp, typed } from "./player";
import { ACTIVE_PROJECTS, DEMO_USER, MY_TASKS, OPEN_ISSUES, PROJECT_ID, PROJECT_NAME, UNREAD_CHATS } from "./story";

const DASHBOARD = { counters: 200, clickSearch: 1700, typeSearch: 2000, results: 2900, openProject: 4400, end: 5400 };

const SEARCH_RESULTS: SearchResults = {
    projects: [{ project_id: PROJECT_ID, project_name: PROJECT_NAME, project_status: "in_progress" }],
    tasks: MY_TASKS.filter((task) => task.project_id === PROJECT_ID).map((task) => ({
        task_id: task.task_id,
        task_title: task.task_title,
        task_parent_id: null,
        project_id: task.project_id,
        project_name: task.project_name,
    })),
};

const noop = () => undefined;

function SceneDashboard(t: number) {
    const query = typed("ห้องพัก", t, DASHBOARD.typeSearch, 110);
    const unreadCount = UNREAD_CHATS.reduce((sum, chat) => sum + chat.unread_count, 0);
    const countFrom = (value: number, delay: number) => countUp(value, t, DASHBOARD.counters + delay, 700);
    return (
        <AppFrame pathname="/dashboard">
            <div className="grid grid-cols-1 gap-6">
                <WelcomeCardView
                    firstName={DEMO_USER.firstName}
                    hour={new Date().getHours()}
                    activeProjectCount={countFrom(ACTIVE_PROJECTS.length, 0)}
                    myTaskCount={countFrom(MY_TASKS.length, 120)}
                    overdueCount={MY_TASKS.filter((task) => isOverdue(task.task_due_date)).length}
                    openIssueCount={countFrom(OPEN_ISSUES.length, 240)}
                    unreadChatCount={countFrom(unreadCount, 360)}
                    canCreateProject
                    hasProjectAccess
                    search={
                        <DashboardSearchView
                            query={query}
                            results={t >= DASHBOARD.results ? SEARCH_RESULTS : null}
                            isOpen={t >= DASHBOARD.clickSearch}
                            onQueryChange={noop}
                            onFocus={noop}
                            onBlur={noop}
                            onSelectProject={noop}
                            onSelectTask={noop}
                        />
                    }
                />
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <MyTasksCard tasks={MY_TASKS} onNavigate={noop} />
                    <OpenIssuesCard
                        issues={OPEN_ISSUES}
                        issueTab="task"
                        onIssueTabChange={noop}
                        ownOnly={false}
                        onOwnOnlyChange={noop}
                        onOpenIssue={noop}
                    />
                    <UnreadChatsCard chats={UNREAD_CHATS} onNavigate={noop} />
                    <ActiveProjectsCard projects={ACTIVE_PROJECTS} onNavigate={noop} />
                </div>
            </div>
        </AppFrame>
    );
}

export const DASHBOARD_SCENE: Scene = {
    key: "dashboard",
    phase: "start",
    title: "แดชบอร์ด",
    caption: "เปิดมาเห็นงานของตัวเอง งานที่เลยกำหนด ปัญหา และแชทที่ยังไม่อ่าน · ค้นหาโปรเจกต์หรืองานได้จากช่องเดียว",
    url: "/dashboard",
    duration: DASHBOARD.end,
    waypoints: [
        { at: DASHBOARD.clickSearch, target: 'css:input[aria-label="ค้นหาโปรเจกต์หรืองาน"]' },
        { at: DASHBOARD.openProject, target: `text:${PROJECT_NAME}` },
    ],
    render: SceneDashboard,
};
