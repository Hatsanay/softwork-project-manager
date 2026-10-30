"use client";

// บอร์ดงานแบบ Trello (2026-10-17) — docs/plans/2026-10-17-project-kanban.md
// - ลากการ์ดข้ามคอลัมน์ = เปลี่ยนสถานะผ่านเส้นทางเดิม (ส่ง expected_status — มีคนย้ายไปก่อน = 409 แล้วโหลดใหม่ R-K1)
// - ลากในคอลัมน์ = เรียงลำดับ (เฉพาะผู้มีสิทธิ์แก้ไขงาน K4-ก · เฉพาะโหมด task หลักที่ไม่ได้กรอง — ต้องส่งครบทั้งคอลัมน์ R-K2)
// - ย้ายแบบเห็นผลทันที: การ์ดไปที่ใหม่ก่อน → บันทึก → ไม่สำเร็จย้อนกลับ + แถบบอกเหตุผล (ไม่ใช้ toast สำหรับ error)
// - มือถือ: กดค้างแล้วลาก (กันลากตอนเลื่อนจอ R-K3) หรือปุ่ม ⋯ → ย้ายไป… · คอลัมน์เลื่อนซ้าย-ขวาทีละคอลัมน์
// - สิทธิ์ที่หน้าเว็บใช้แค่ล็อก/ซ่อน — backend ตรวจจริงเสมอ
// - หน้าตาอยู่ที่ task-board-view.tsx (เดโมหน้า login ใช้ตัวเดียวกัน) · ไฟล์นี้ = สถานะ ตัวกรอง การลาก และการบันทึก
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    KeyboardSensor,
    MouseSensor,
    TouchSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
    type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { toDateInputValue } from "@/app/function";
import { apiFetch } from "@/lib/api";
import { BOARD_COLUMNS, type BoardLabel, type BoardStatus, type BoardTask } from "./board-types";
import { columnDropId } from "./board-column";
import TaskBoardView, { boardColumnsOf, reorderHintOf } from "./task-board-view";

const MOUSE_DRAG_DISTANCE_PX = 6;
const TOUCH_HOLD_MS = 250;
const TOUCH_TOLERANCE_PX = 8;

type Optimistic = {
    statusById: Record<string, BoardStatus>;
    orderByColumn: Partial<Record<BoardStatus, string[]>>;
};

type PendingDone = { task: BoardTask; orderIds: string[] | null };

const EMPTY_OPTIMISTIC: Optimistic = { statusById: {}, orderByColumn: {} };

function bySortOrder(first: BoardTask, second: BoardTask) {
    const orderDifference = (first.task_sort_order ?? 0) - (second.task_sort_order ?? 0);
    if (orderDifference !== 0) return orderDifference;
    return first.task_id.localeCompare(second.task_id);
}

// คอลัมน์เสร็จเรียงตามวันที่เสร็จล่าสุดก่อน (K6)
function byCompletedDesc(first: BoardTask, second: BoardTask) {
    return String(second.task_completed_at ?? "").localeCompare(String(first.task_completed_at ?? ""));
}

function isOverdue(task: BoardTask) {
    if (!task.task_due_date || task.task_status === "done") return false;
    return toDateInputValue(task.task_due_date) < toDateInputValue(new Date());
}

export default function TaskBoard({
    projectId,
    tasks,
    currentUserId,
    isAgile,
    canReorder,
    canAddTask,
    canChangeStatus,
    onOpenTask,
    onClaimTask,
    onAddTask,
    onChanged,
}: {
    projectId: string;
    tasks: BoardTask[];
    currentUserId: string;
    isAgile: boolean;
    canReorder: boolean;
    canAddTask: boolean;
    canChangeStatus: (task: BoardTask) => boolean;
    onOpenTask: (task: BoardTask) => void;
    onClaimTask: (task: BoardTask) => void;
    onAddTask: () => void;
    onChanged: () => Promise<void>;
}) {
    const [includeSubtasks, setIncludeSubtasks] = useState(false);
    const [onlyMine, setOnlyMine] = useState(false);
    const [onlyOverdue, setOnlyOverdue] = useState(false);
    const [search, setSearch] = useState("");
    const [labelFilter, setLabelFilter] = useState<number[]>([]);
    const [optimistic, setOptimistic] = useState<Optimistic>(EMPTY_OPTIMISTIC);
    const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
    const [moveTarget, setMoveTarget] = useState<BoardTask | null>(null);
    const [pendingDone, setPendingDone] = useState<PendingDone | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: MOUSE_DRAG_DISTANCE_PX } }),
        useSensor(TouchSensor, { activationConstraint: { delay: TOUCH_HOLD_MS, tolerance: TOUCH_TOLERANCE_PX } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    // กลับมาที่แท็บ = โหลดใหม่ เห็นงานที่คนอื่นย้ายโดยไม่ต้องกดรีเฟรช
    // เก็บ onChanged ไว้ใน ref — หน้าโปรเจกต์สร้างฟังก์ชันใหม่ทุกครั้งที่เรนเดอร์ ตัวฟังไม่ต้องลงทะเบียนใหม่ทุกรอบ
    const onChangedRef = useRef(onChanged);
    useEffect(() => {
        onChangedRef.current = onChanged;
    });
    useEffect(() => {
        function handleVisibilityChange() {
            if (document.visibilityState === "visible") onChangedRef.current();
        }
        document.addEventListener("visibilitychange", handleVisibilityChange);
        return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
    }, []);

    // สถานะที่แสดง = ของจริง + ที่เพิ่งย้ายแต่ยังรอบันทึก
    const displayedTasks = useMemo(
        () =>
            tasks.map((task) => {
                const status = optimistic.statusById[task.task_id];
                return status ? { ...task, task_status: status } : task;
            }),
        [tasks, optimistic],
    );
    const tasksById = useMemo(() => new Map(displayedTasks.map((task) => [task.task_id, task])), [displayedTasks]);
    const parentTitles = useMemo(
        () => new Map(tasks.filter((task) => !task.task_parent_id).map((task) => [task.task_id, task.task_title])),
        [tasks],
    );
    const labelsInUse = useMemo(() => {
        const labels = new Map<number, BoardLabel>();
        for (const task of tasks) for (const label of task.labels ?? []) labels.set(label.pl_id, label);
        return [...labels.values()];
    }, [tasks]);

    const isFiltered = onlyMine || onlyOverdue || search.trim() !== "" || labelFilter.length > 0;
    // เรียงลำดับต้องส่งครบทั้งคอลัมน์ระดับเดียวกัน — โหมดรวม subtask / มีตัวกรอง = ปิดการเรียง (R-K2)
    const canReorderNow = canReorder && !includeSubtasks && !isFiltered;

    const boardTasks = displayedTasks.filter((task) => includeSubtasks || task.task_parent_id === null);
    const searchText = search.trim().toLowerCase();
    const filteredTasks = boardTasks.filter((task) => {
        if (onlyMine && !task.assignees.some((assignee) => assignee.user_id === currentUserId)) return false;
        if (onlyOverdue && !isOverdue(task)) return false;
        if (searchText && !task.task_title.toLowerCase().includes(searchText)) return false;
        if (labelFilter.length > 0 && !(task.labels ?? []).some((label) => labelFilter.includes(label.pl_id))) {
            return false;
        }
        return true;
    });

    const columnTasks = useCallback(
        (status: BoardStatus, source: BoardTask[]) => {
            const inColumn = source.filter((task) => task.task_status === status);
            if (status === "done") return inColumn.sort(byCompletedDesc);
            const order = optimistic.orderByColumn[status];
            if (!order) return inColumn.sort(bySortOrder);
            return inColumn.sort((first, second) => order.indexOf(first.task_id) - order.indexOf(second.task_id));
        },
        [optimistic],
    );

    function permissionsOf(task: BoardTask) {
        const canMoveStatus = canChangeStatus(task);
        return {
            canChangeStatus: canMoveStatus,
            canDrag: canMoveStatus || (canReorderNow && task.task_status !== "done"),
            canClaim: isAgile && task.assignees.length === 0,
        };
    }

    async function finishChange() {
        await onChanged();
        setOptimistic(EMPTY_OPTIMISTIC);
    }

    async function saveOrder(status: BoardStatus, orderIds: string[]) {
        const { error } = await apiFetch(`/projects/${projectId}/task-order`, {
            method: "PUT",
            body: { task_status: status, parent_task_id: null, task_ids: orderIds },
        });
        if (error) setErrorMessage(error.message);
    }

    async function moveTask(task: BoardTask, status: BoardStatus, orderIds: string[] | null) {
        setErrorMessage(null);
        const originalStatus =
            tasks.find((original) => original.task_id === task.task_id)?.task_status ?? task.task_status;
        setOptimistic((current) => ({
            statusById: { ...current.statusById, [task.task_id]: status },
            orderByColumn: orderIds ? { ...current.orderByColumn, [status]: orderIds } : current.orderByColumn,
        }));
        const { error } = await apiFetch(`/projects/${projectId}/tasks/${task.task_id}/status`, {
            method: "PUT",
            body: { task_status: status, expected_status: originalStatus },
        });
        if (error) {
            setErrorMessage(error.message);
            await finishChange();
            return;
        }
        if (orderIds) await saveOrder(status, orderIds);
        await finishChange();
    }

    // ย้ายไป "เสร็จ" ทั้งที่ subtask ยังไม่ครบ → ถามก่อน (ระบบไม่บังคับ แค่เตือน)
    function requestMove(task: BoardTask, status: BoardStatus, orderIds: string[] | null) {
        const subtaskTotal = task.subtask_total ?? 0;
        const hasOpenSubtasks = subtaskTotal > (task.subtask_done ?? 0);
        if (status === "done" && hasOpenSubtasks) {
            setPendingDone({ task, orderIds });
            return;
        }
        moveTask(task, status, orderIds);
    }

    // ลำดับใหม่ของคอลัมน์ปลายทางเมื่อวางการ์ดลงบนการ์ดอื่น (ใช้ทั้งคอลัมน์ ไม่ใช่เฉพาะที่กรองอยู่)
    function insertedOrder(status: BoardStatus, taskId: string, overTaskId: string) {
        const ids = columnTasks(status, boardTasks)
            .map((task) => task.task_id)
            .filter((id) => id !== taskId);
        const overIndex = ids.indexOf(overTaskId);
        ids.splice(overIndex < 0 ? ids.length : overIndex, 0, taskId);
        return ids;
    }

    function handleDragStart(event: DragStartEvent) {
        setActiveTaskId(String(event.active.id));
    }

    function handleDragEnd(event: DragEndEvent) {
        setActiveTaskId(null);
        const task = tasksById.get(String(event.active.id));
        const overId = event.over ? String(event.over.id) : null;
        if (!task || !overId) return;

        const overColumn = BOARD_COLUMNS.find((column) => columnDropId(column.status) === overId);
        const overTask = overColumn ? null : tasksById.get(overId);
        const targetStatus = overColumn?.status ?? overTask?.task_status;
        if (!targetStatus) return;

        if (targetStatus !== task.task_status) {
            if (!canChangeStatus(task)) {
                setErrorMessage(
                    "เปลี่ยนสถานะงานนี้ไม่ได้ · ต้องเป็นผู้รับผิดชอบงานนี้ หรือมีสิทธิ์เปลี่ยนสถานะทุกงานในตำแหน่งของคุณ",
                );
                return;
            }
            const orderIds =
                canReorderNow && overTask && targetStatus !== "done"
                    ? insertedOrder(targetStatus, task.task_id, overTask.task_id)
                    : null;
            requestMove(task, targetStatus, orderIds);
            return;
        }

        if (!canReorderNow || !overTask || overTask.task_id === task.task_id || targetStatus === "done") return;
        const ids = columnTasks(targetStatus, boardTasks).map((columnTask) => columnTask.task_id);
        const newOrder = arrayMove(ids, ids.indexOf(task.task_id), ids.indexOf(overTask.task_id));
        setOptimistic((current) => ({
            ...current,
            orderByColumn: { ...current.orderByColumn, [targetStatus]: newOrder },
        }));
        saveOrder(targetStatus, newOrder).then(finishChange);
    }

    function toggleLabel(labelId: number) {
        setLabelFilter((current) =>
            current.includes(labelId) ? current.filter((id) => id !== labelId) : [...current, labelId],
        );
    }

    const activeTask = activeTaskId ? tasksById.get(activeTaskId) : null;
    const reorderHint = reorderHintOf(canReorder, canReorderNow);

    return (
        <TaskBoardView
            reorderHint={reorderHint}
            onlyMine={onlyMine}
            onOnlyMineChange={setOnlyMine}
            onlyOverdue={onlyOverdue}
            onOnlyOverdueChange={setOnlyOverdue}
            includeSubtasks={includeSubtasks}
            onIncludeSubtasksChange={setIncludeSubtasks}
            search={search}
            onSearchChange={setSearch}
            labelsInUse={labelsInUse}
            labelFilter={labelFilter}
            onToggleLabel={toggleLabel}
            errorMessage={errorMessage}
            columns={boardColumnsOf((status) => columnTasks(status, filteredTasks))}
            parentTitles={parentTitles}
            permissionsOf={permissionsOf}
            canAddTask={canAddTask}
            onAddTask={onAddTask}
            onOpenTask={onOpenTask}
            onMoveTask={setMoveTarget}
            onClaimTask={onClaimTask}
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setActiveTaskId(null)}
            activeTask={activeTask ?? null}
            moveTarget={moveTarget}
            onMoveSelect={(status) => {
                const task = moveTarget;
                setMoveTarget(null);
                if (task) requestMove(task, status, null);
            }}
            onMoveClose={() => setMoveTarget(null)}
            pendingDoneTask={pendingDone?.task ?? null}
            onConfirmDone={() => {
                const pending = pendingDone;
                setPendingDone(null);
                if (pending) moveTask(pending.task, "done", pending.orderIds);
            }}
            onCancelDone={() => setPendingDone(null)}
        />
    );
}
