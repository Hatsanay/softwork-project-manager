"use client";

// คอลัมน์หนึ่งของบอร์ด (สถานะหนึ่ง) — รับการ์ดที่ลากมาวางได้แม้คอลัมน์ว่าง · คอลัมน์ "เสร็จ" แสดงล่าสุด 20 ใบ (K6)
import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { DONE_COLUMN_LIMIT, type BoardStatus, type BoardTask } from "./board-types";
import BoardCard, { type CardPermissions } from "./board-card";

export function columnDropId(status: BoardStatus) {
    return `column:${status}`;
}

export default function BoardColumn({
    status,
    label,
    tasks,
    parentTitles,
    permissionsOf,
    canAddTask,
    onAddTask,
    onOpenTask,
    onMoveTask,
    onClaimTask,
}: {
    status: BoardStatus;
    label: string;
    tasks: BoardTask[];
    parentTitles: Map<string, string>;
    permissionsOf: (task: BoardTask) => CardPermissions;
    canAddTask: boolean;
    onAddTask: () => void;
    onOpenTask: (task: BoardTask) => void;
    onMoveTask: (task: BoardTask) => void;
    onClaimTask: (task: BoardTask) => void;
}) {
    const { setNodeRef, isOver } = useDroppable({ id: columnDropId(status) });
    const [showAllDone, setShowAllDone] = useState(false);
    const isDoneColumn = status === "done";
    const visibleTasks = isDoneColumn && !showAllDone ? tasks.slice(0, DONE_COLUMN_LIMIT) : tasks;
    const hiddenCount = tasks.length - visibleTasks.length;

    return (
        <section
            id={`board-column-${status}`}
            aria-label={`${label} ${tasks.length} งาน`}
            className={`grid w-[85vw] max-w-xs shrink-0 snap-start content-start gap-2 rounded-2xl p-2 sm:w-72 lg:w-auto lg:max-w-none ${
                isOver ? "bg-blue-50 ring-2 ring-blue-200" : "bg-gray-100/70"
            }`}
        >
            <header className="flex items-center justify-between px-1 py-1">
                <h3 className="text-sm font-medium text-gray-800">{label}</h3>
                <span className="rounded-full bg-white px-2 text-xs text-gray-500 tabular-nums">{tasks.length}</span>
            </header>
            <SortableContext items={visibleTasks.map((task) => task.task_id)} strategy={verticalListSortingStrategy}>
                <div ref={setNodeRef} className="grid min-h-16 content-start gap-2">
                    {visibleTasks.map((task) => (
                        <BoardCard
                            key={task.task_id}
                            task={task}
                            parentTitle={task.task_parent_id ? (parentTitles.get(task.task_parent_id) ?? null) : null}
                            permissions={permissionsOf(task)}
                            onOpen={() => onOpenTask(task)}
                            onMove={() => onMoveTask(task)}
                            onClaim={() => onClaimTask(task)}
                        />
                    ))}
                    {tasks.length === 0 && (
                        <p className="rounded-xl border border-dashed border-gray-300 px-3 py-4 text-center text-xs text-gray-400">
                            ลากการ์ดมาวางที่นี่
                        </p>
                    )}
                </div>
            </SortableContext>
            {hiddenCount > 0 && (
                <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setShowAllDone(true)}>
                    ดูทั้งหมด (อีก {hiddenCount})
                </button>
            )}
            {status === "todo" && canAddTask && (
                <button type="button" className={`${buttonClass("ghost", "sm")} justify-start`} onClick={onAddTask}>
                    <Plus size={14} />
                    เพิ่ม Task
                </button>
            )}
        </section>
    );
}
