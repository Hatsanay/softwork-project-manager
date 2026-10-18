"use client";

// ฉากช่วง "ทำงาน" ที่ใช้หน้าจริง — หน้าโปรเจกต์ (ProjectHeader, ShareLinkCard, TasksSectionCard + TaskBoardView) และหน้าที่ลูกค้าเห็น (share-view)
// การจัดวางตาม app/(protected)/projects/view/page.tsx · ข้อมูลจาก story.ts
// การลากการ์ด: หน้าจริงใช้ DragOverlay ของ dnd-kit ซึ่งขยับตามเมาส์จริงเท่านั้น — เดโมวาง BoardCard ตัวจริง (isOverlay) ลอยแทน
import { useLayoutEffect, useRef } from "react";
import { DndContext } from "@dnd-kit/core";
import {
    ProjectHeader,
    ShareLinkCard,
    TasksSectionCard,
} from "@/app/(protected)/projects/view/_components/project-sections";
import TaskBoardView, {
    boardColumnsOf,
    reorderHintOf,
} from "@/app/(protected)/projects/view/_components/board/task-board-view";
import BoardCard from "@/app/(protected)/projects/view/_components/board/board-card";
import type { BoardStatus, BoardTask } from "@/app/(protected)/projects/view/_components/board/board-types";
import SharedProjectView from "@/app/share/[token]/share-view";
import AppFrame from "./app-frame";
import type { Scene } from "./kit";
import {
    BOARD_TASKS,
    CLIENT_NAME,
    MOVING_TASK_ID,
    PROGRESS_AFTER,
    PROGRESS_BEFORE,
    PROJECT_DUE,
    PROJECT_NAME,
    PROJECT_START,
    SHARED_PROJECT,
    SHARED_TASKS,
    SHARED_TIMELINE,
    SHARE_PATH,
    storyDateTime,
} from "./story";

const noop = () => undefined;
const FULL_CARD_PERMISSIONS = { canDrag: true, canChangeStatus: true, canClaim: false };

function projectOf(progress: number) {
    return {
        project_name: PROJECT_NAME,
        project_description: SHARED_PROJECT.project_description,
        project_status: "in_progress" as const,
        project_type: "waterfall" as const,
        project_start_date: PROJECT_START,
        project_due_date: PROJECT_DUE,
        project_progress_percent: String(progress),
        client_name: CLIENT_NAME,
        unread_chat_count: 3,
    };
}

/** ส่วนบนของหน้าโปรเจกต์ (หัวโปรเจกต์ + ลิงก์ลูกค้า) */
function ProjectTop({ progress, copied }: { progress: number; copied: boolean }) {
    return (
        <>
            <ProjectHeader
                project={projectOf(progress)}
                memberCount={5}
                canEdit
                canDelete={false}
                onOpenChat={noop}
                onEdit={noop}
                onDelete={noop}
            />
            <ShareLinkCard
                isEnabled
                shareUrl={`https://softwork.app${SHARE_PATH}`}
                copied={copied}
                isRegenerating={false}
                onToggle={noop}
                onCopy={noop}
                onEmail={noop}
                onRegenerate={noop}
            />
        </>
    );
}

// ── บอร์ดงาน: ลากการ์ด "เชื่อมระบบชำระเงิน" จากรอตรวจไปเสร็จ ────────────────────────────────────────

const BOARD = { scroll: 900, grab: 2500, drop: 4100, end: 6600 };
// เลื่อนหน้าลงจนเห็นคอลัมน์บอร์ด (px ของจอเสมือน)
const BOARD_SCROLL_Y = 860;

function tasksAt(isDone: boolean): BoardTask[] {
    if (!isDone) return BOARD_TASKS;
    return BOARD_TASKS.map((task) =>
        task.task_id === MOVING_TASK_ID
            ? { ...task, task_status: "done", task_completed_at: storyDateTime(0, "09:05") }
            : task,
    );
}

// เรียงแบบเดียวกับบอร์ดจริง: คอลัมน์เสร็จ = เสร็จล่าสุดก่อน · คอลัมน์อื่น = ตามลำดับที่ตั้งไว้
function columnTasks(tasks: BoardTask[], status: BoardStatus) {
    const inColumn = tasks.filter((task) => task.task_status === status);
    if (status === "done") {
        return inColumn.sort((first, second) =>
            String(second.task_completed_at ?? "").localeCompare(String(first.task_completed_at ?? "")),
        );
    }
    return inColumn.sort((first, second) => (first.task_sort_order ?? 0) - (second.task_sort_order ?? 0));
}

/** การ์ดที่กำลังถูกลาก: ลอยจากตำแหน่งการ์ดเดิมไปหัวคอลัมน์ปลายทาง (วัดตำแหน่งจากหน้าจริงใน DOM) */
function DragGhost({ task, progress }: { task: BoardTask; progress: number }) {
    const ghostRef = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        const ghost = ghostRef.current;
        const board = ghost?.parentElement;
        if (!ghost || !board) return;
        const source = [...board.querySelectorAll("article")].find((card) =>
            card.textContent?.includes(task.task_title),
        );
        const target = board.querySelector("#board-column-done");
        if (!source || !target) return;
        // จอเสมือนถูกย่อด้วย transform — แปลงระยะบนจอจริงกลับเป็น px ของจอเสมือน
        const boardBox = board.getBoundingClientRect();
        const scale = boardBox.width / board.offsetWidth;
        const sourceBox = source.getBoundingClientRect();
        const targetBox = target.getBoundingClientRect();
        const fromX = (sourceBox.left - boardBox.left) / scale;
        const fromY = (sourceBox.top - boardBox.top) / scale;
        const toX = (targetBox.left - boardBox.left) / scale + 8;
        const toY = (targetBox.top - boardBox.top) / scale + 44;
        const eased = 1 - (1 - progress) ** 2;
        ghost.style.width = `${sourceBox.width / scale}px`;
        ghost.style.transform = `translate(${fromX + (toX - fromX) * eased}px, ${fromY + (toY - fromY) * eased}px)`;
        ghost.style.opacity = "1";
    });

    return (
        <div ref={ghostRef} className="pointer-events-none absolute left-0 top-0 z-20 opacity-0">
            <DndContext>
                <BoardCard
                    task={task}
                    parentTitle={null}
                    permissions={FULL_CARD_PERMISSIONS}
                    isOverlay
                    onOpen={noop}
                    onMove={noop}
                    onClaim={noop}
                />
            </DndContext>
        </div>
    );
}

function SceneBoard(t: number) {
    const isDone = t >= BOARD.drop;
    const isDragging = t >= BOARD.grab && !isDone;
    const tasks = tasksAt(isDone);
    const movingTask = BOARD_TASKS.find((task) => task.task_id === MOVING_TASK_ID)!;
    return (
        <AppFrame pathname="/projects/view" scrollY={t >= BOARD.scroll ? BOARD_SCROLL_Y : 0}>
            <div className="mx-auto grid max-w-5xl gap-6">
                <ProjectTop progress={isDone ? PROGRESS_AFTER : PROGRESS_BEFORE} copied={false} />
                <TasksSectionCard canAddTask onAddTask={noop} taskView="board" onTaskViewChange={noop}>
                    <div className="relative">
                        <TaskBoardView
                            reorderHint={reorderHintOf(true, true)}
                            onlyMine={false}
                            onOnlyMineChange={noop}
                            onlyOverdue={false}
                            onOnlyOverdueChange={noop}
                            includeSubtasks={false}
                            onIncludeSubtasksChange={noop}
                            search=""
                            onSearchChange={noop}
                            labelsInUse={[]}
                            labelFilter={[]}
                            onToggleLabel={noop}
                            errorMessage={null}
                            columns={boardColumnsOf((status) => columnTasks(tasks, status))}
                            parentTitles={new Map()}
                            permissionsOf={() => FULL_CARD_PERMISSIONS}
                            canAddTask
                            onAddTask={noop}
                            onOpenTask={noop}
                            onMoveTask={noop}
                            onClaimTask={noop}
                            activeTask={null}
                            moveTarget={null}
                            onMoveSelect={noop}
                            onMoveClose={noop}
                            pendingDoneTask={null}
                            onConfirmDone={noop}
                            onCancelDone={noop}
                        />
                        {isDragging && (
                            <DragGhost
                                task={movingTask}
                                progress={Math.min(1, (t - BOARD.grab) / (BOARD.drop - BOARD.grab))}
                            />
                        )}
                    </div>
                </TasksSectionCard>
            </div>
        </AppFrame>
    );
}

export const BOARD_SCENE: Scene = {
    key: "board",
    phase: "work",
    title: "บอร์ดงาน",
    caption: "ลากการ์ดเปลี่ยนสถานะได้เหมือน Trello · ความคืบหน้าโปรเจกต์คำนวณตามน้ำหนักงานให้เอง",
    url: "/projects/view",
    duration: BOARD.end,
    waypoints: [
        { at: BOARD.grab, target: "text:เชื่อมระบบชำระเงิน" },
        { at: BOARD.drop, target: "css:#board-column-done" },
    ],
    render: SceneBoard,
};

// ── ลิงก์ให้ลูกค้า: คัดลอกลิงก์ → หน้าที่ลูกค้าเปิดเห็น ─────────────────────────────────────────────────

const SHARE = { copy: 1500, open: 3000, scrollClient: 4600, end: 7600 };
const CLIENT_SCROLL_Y = 420;

function SceneShare(t: number) {
    if (t < SHARE.open) {
        return (
            <AppFrame pathname="/projects/view">
                <div className="mx-auto grid max-w-5xl gap-6">
                    <ProjectTop progress={PROGRESS_AFTER} copied={t >= SHARE.copy} />
                </div>
            </AppFrame>
        );
    }
    return (
        <div className="demo-page-in absolute inset-0 overflow-hidden bg-gray-50">
            <div
                className="transition-transform duration-700 ease-in-out"
                style={{ transform: `translateY(${t >= SHARE.scrollClient ? -CLIENT_SCROLL_Y : 0}px)` }}
            >
                <SharedProjectView project={SHARED_PROJECT} tasks={SHARED_TASKS} timeline={SHARED_TIMELINE} />
            </div>
        </div>
    );
}

export const SHARE_SCENE: Scene = {
    key: "share",
    phase: "work",
    title: "ลิงก์ให้ลูกค้าดูความคืบหน้า",
    caption:
        "ส่งลิงก์เดียว ลูกค้าเปิดดูความคืบหน้าและสถานะงานได้เองโดยไม่ต้องสมัครสมาชิก ปิดหรือเปลี่ยนลิงก์ได้ทุกเมื่อ",
    url: (t) => (t < SHARE.open ? "/projects/view" : SHARE_PATH),
    duration: SHARE.end,
    waypoints: [{ at: SHARE.copy, target: "text:คัดลอก" }],
    render: SceneShare,
};
