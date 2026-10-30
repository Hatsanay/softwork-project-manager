"use client";

// ส่วนแสดงผลของบอร์ดงาน (แยกจาก task-board.tsx 18 ต.ค. 2026 ให้เดโมหน้า login ใช้หน้าตัวจริงได้)
// รับข้อมูล สถานะตัวกรอง และ callback ผ่าน props อย่างเดียว — การบันทึก/เรียก API อยู่ที่ task-board.tsx
// ห้ามเรียก API / router / toast ในไฟล์นี้ (scripts/check-demo-imports.mjs)
import {
    DndContext,
    DragOverlay,
    closestCorners,
    type DragEndEvent,
    type DragStartEvent,
    type SensorDescriptor,
    type SensorOptions,
} from "@dnd-kit/core";
import StatusBanner from "@/components/ui/guidance/status-banner";
import FieldHint from "@/components/ui/guidance/field-hint";
import Switch from "@/components/ui/switch";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { inputClass } from "@/components/ui/form-field";
import { BOARD_COLUMNS, STATUS_LABELS, type BoardLabel, type BoardStatus, type BoardTask } from "./board-types";
import { LABEL_COLOR_CLASSES } from "./label-colors";
import BoardColumn from "./board-column";
import BoardCard, { type CardPermissions } from "./board-card";
import MoveToSheet from "./move-to-sheet";

export type BoardColumnData = { status: BoardStatus; label: string; tasks: BoardTask[] };

export type TaskBoardViewProps = {
    reorderHint: string;
    onlyMine: boolean;
    onOnlyMineChange: (checked: boolean) => void;
    onlyOverdue: boolean;
    onOnlyOverdueChange: (checked: boolean) => void;
    includeSubtasks: boolean;
    onIncludeSubtasksChange: (checked: boolean) => void;
    search: string;
    onSearchChange: (search: string) => void;
    labelsInUse: BoardLabel[];
    labelFilter: number[];
    onToggleLabel: (labelId: number) => void;
    errorMessage: string | null;
    // การ์ดในแต่ละคอลัมน์ (กรองและเรียงแล้ว)
    columns: BoardColumnData[];
    parentTitles: Map<string, string>;
    permissionsOf: (task: BoardTask) => CardPermissions;
    canAddTask: boolean;
    onAddTask: () => void;
    onOpenTask: (task: BoardTask) => void;
    onMoveTask: (task: BoardTask) => void;
    onClaimTask: (task: BoardTask) => void;
    // ลากการ์ด (dnd-kit) — ไม่ส่ง sensors = ใช้ค่าเริ่มต้นของ dnd-kit
    sensors?: SensorDescriptor<SensorOptions>[];
    onDragStart?: (event: DragStartEvent) => void;
    onDragEnd?: (event: DragEndEvent) => void;
    onDragCancel?: () => void;
    activeTask: BoardTask | null;
    // แผ่น "ย้ายไป…"
    moveTarget: BoardTask | null;
    onMoveSelect: (status: BoardStatus) => void;
    onMoveClose: () => void;
    // ถามก่อนย้ายไปเสร็จทั้งที่ subtask ยังไม่ครบ
    pendingDoneTask: BoardTask | null;
    onConfirmDone: () => void;
    onCancelDone: () => void;
};

/** ข้อความบอกว่าตอนนี้เรียงลำดับการ์ดได้ไหม (ต่อท้ายข้อความกำกับหัวบอร์ด) */
export function reorderHintOf(canReorder: boolean, canReorderNow: boolean) {
    if (!canReorder) return "ลำดับในคอลัมน์ตั้งได้เฉพาะผู้มีสิทธิ์แก้ไขงาน";
    if (!canReorderNow) return "ปิดตัวกรองและโหมดรวม subtask เพื่อเรียงลำดับการ์ด";
    return "ลากขึ้น-ลงในคอลัมน์เพื่อเรียงลำดับความสำคัญ (คอลัมน์เสร็จเรียงตามวันที่เสร็จ)";
}

export default function TaskBoardView(props: TaskBoardViewProps) {
    const { activeTask, pendingDoneTask, parentTitles } = props;
    return (
        <div className="grid grid-cols-1 gap-4">
            <FieldHint>
                ลากการ์ดข้ามคอลัมน์เพื่อเปลี่ยนสถานะ (มือถือ: กดค้างแล้วลาก หรือกด ⋯ → ย้ายไป) · การ์ดที่มีรูปกุญแจ =
                คุณเปลี่ยนสถานะงานนั้นไม่ได้ · {props.reorderHint}
            </FieldHint>

            <div className="grid gap-3">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                    <Switch
                        id="board-only-mine"
                        label="เฉพาะงานของฉัน"
                        checked={props.onlyMine}
                        onChange={props.onOnlyMineChange}
                    />
                    <Switch
                        id="board-overdue"
                        label="เลยกำหนด"
                        checked={props.onlyOverdue}
                        onChange={props.onOnlyOverdueChange}
                    />
                    <Switch
                        id="board-subtasks"
                        label="แสดง subtask เป็นการ์ด"
                        checked={props.includeSubtasks}
                        onChange={props.onIncludeSubtasksChange}
                    />
                </div>
                <input
                    type="search"
                    aria-label="ค้นหางานบนบอร์ด"
                    placeholder="ค้นหาชื่องาน..."
                    value={props.search}
                    onChange={(event) => props.onSearchChange(event.target.value)}
                    className={`${inputClass(false)} max-w-sm`}
                />
                {props.labelsInUse.length > 0 && (
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label="กรองตามป้าย">
                        {props.labelsInUse.map((label) => {
                            const isSelected = props.labelFilter.includes(label.pl_id);
                            return (
                                <button
                                    key={label.pl_id}
                                    type="button"
                                    aria-pressed={isSelected}
                                    onClick={() => props.onToggleLabel(label.pl_id)}
                                    className={`min-h-9 rounded-lg px-3 text-xs font-medium ${LABEL_COLOR_CLASSES[label.pl_color]} ${
                                        isSelected
                                            ? "ring-2 ring-blue-600 ring-offset-1"
                                            : props.labelFilter.length > 0
                                              ? "opacity-50"
                                              : ""
                                    }`}
                                >
                                    {label.pl_name}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {props.errorMessage && (
                <StatusBanner tone="error" title="ย้ายการ์ดไม่สำเร็จ">
                    {props.errorMessage}
                </StatusBanner>
            )}

            {/* มือถือ: กระโดดไปคอลัมน์ */}
            <nav className="flex gap-2 overflow-x-auto lg:hidden" aria-label="ไปที่คอลัมน์">
                {props.columns.map((column) => (
                    <button
                        key={column.status}
                        type="button"
                        className="min-h-9 shrink-0 rounded-full border border-gray-200 bg-white px-3 text-xs text-gray-700"
                        onClick={() =>
                            document
                                .getElementById(`board-column-${column.status}`)
                                ?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" })
                        }
                    >
                        {column.label} {column.tasks.length}
                    </button>
                ))}
            </nav>

            <DndContext
                sensors={props.sensors}
                collisionDetection={closestCorners}
                onDragStart={props.onDragStart}
                onDragEnd={props.onDragEnd}
                onDragCancel={props.onDragCancel}
            >
                <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0 lg:grid lg:grid-cols-4 lg:overflow-visible">
                    {props.columns.map((column) => (
                        <BoardColumn
                            key={column.status}
                            status={column.status}
                            label={column.label}
                            tasks={column.tasks}
                            parentTitles={parentTitles}
                            permissionsOf={props.permissionsOf}
                            canAddTask={props.canAddTask}
                            onAddTask={props.onAddTask}
                            onOpenTask={props.onOpenTask}
                            onMoveTask={props.onMoveTask}
                            onClaimTask={props.onClaimTask}
                        />
                    ))}
                </div>
                <DragOverlay>
                    {activeTask && (
                        <BoardCard
                            task={activeTask}
                            parentTitle={
                                activeTask.task_parent_id ? (parentTitles.get(activeTask.task_parent_id) ?? null) : null
                            }
                            permissions={props.permissionsOf(activeTask)}
                            isOverlay
                            onOpen={() => undefined}
                            onMove={() => undefined}
                            onClaim={() => undefined}
                        />
                    )}
                </DragOverlay>
            </DndContext>

            <MoveToSheet task={props.moveTarget} onClose={props.onMoveClose} onSelect={props.onMoveSelect} />
            <ConfirmDialog
                open={Boolean(pendingDoneTask)}
                title="ย้ายไป 'เสร็จ' ทั้งที่ subtask ยังไม่ครบ?"
                description={
                    pendingDoneTask
                        ? `subtask ยังไม่เสร็จ ${(pendingDoneTask.subtask_total ?? 0) - (pendingDoneTask.subtask_done ?? 0)} จาก ${pendingDoneTask.subtask_total ?? 0} · ระบบไม่บังคับ แต่ความคืบหน้าของงานนี้จะยังไม่ครบ`
                        : undefined
                }
                confirmLabel={`ย้ายไป ${STATUS_LABELS.done}`}
                variant="warning"
                onConfirm={props.onConfirmDone}
                onCancel={props.onCancelDone}
            />
        </div>
    );
}

/** คอลัมน์ทั้งหมดของบอร์ดตามลำดับมาตรฐาน */
export function boardColumnsOf(tasksOf: (status: BoardStatus) => BoardTask[]): BoardColumnData[] {
    return BOARD_COLUMNS.map((column) => ({ ...column, tasks: tasksOf(column.status) }));
}
