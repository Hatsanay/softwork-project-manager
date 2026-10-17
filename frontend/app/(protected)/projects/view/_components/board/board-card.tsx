"use client";

// การ์ดงานบนบอร์ด — ป้าย · ชื่อ · ครบกำหนด · checklist · subtask · ปัญหา/แชท · ผู้รับผิดชอบ · รับงาน (Agile) · ย้ายไป…
// ลากได้เมื่อเปลี่ยนสถานะงานนี้ได้ หรือเรียงลำดับได้ · ลากไม่ได้ = รูปกุญแจ (เหตุผลอยู่ในข้อความกำกับหัวบอร์ด)
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarDays, CheckSquare, ListTree, Lock, MessageCircle, MoreHorizontal, TriangleAlert } from "lucide-react";
import { initialsOf } from "@/components/ui/person-cell";
import { buttonClass } from "@/components/ui/button";
import { formatDateOnly, toDateInputValue } from "@/app/function";
import { LABEL_COLOR_CLASSES } from "./label-colors";
import type { BoardTask } from "./board-types";

const MAX_VISIBLE_ASSIGNEES = 3;

// ปุ่มในการ์ด: กด/แตะ/Enter ที่ปุ่มต้องไม่เริ่มลากการ์ด (ตัวจับการลากฟังที่ตัวการ์ด)
const stopPropagation = (event: { stopPropagation: () => void }) => event.stopPropagation();
const STOP_DRAG = { onMouseDown: stopPropagation, onTouchStart: stopPropagation, onKeyDown: stopPropagation };

export type CardPermissions = {
    canDrag: boolean;
    canChangeStatus: boolean;
    canClaim: boolean;
};

function isOverdue(task: BoardTask) {
    if (!task.task_due_date || task.task_status === "done") return false;
    return toDateInputValue(task.task_due_date) < toDateInputValue(new Date());
}

export default function BoardCard({
    task,
    parentTitle,
    permissions,
    isOverlay = false,
    onOpen,
    onMove,
    onClaim,
}: {
    task: BoardTask;
    parentTitle: string | null;
    permissions: CardPermissions;
    isOverlay?: boolean;
    onOpen: () => void;
    onMove: () => void;
    onClaim: () => void;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: task.task_id,
        disabled: !permissions.canDrag,
    });
    const style = { transform: CSS.Transform.toString(transform), transition };
    const labels = task.labels ?? [];
    const checklistTotal = task.checklist_total ?? 0;
    const checklistDone = task.checklist_done ?? 0;
    const subtaskTotal = task.subtask_total ?? 0;
    const hiddenAssignees = task.assignees.length - MAX_VISIBLE_ASSIGNEES;

    return (
        <article
            ref={isOverlay ? undefined : setNodeRef}
            style={isOverlay ? undefined : style}
            className={`grid gap-2 rounded-xl border bg-white p-3 text-sm shadow-sm ${
                isDragging ? "opacity-40" : ""
            } ${isOverlay ? "rotate-1 border-blue-200 shadow-float" : "border-gray-200"} ${
                permissions.canDrag ? "cursor-grab touch-manipulation active:cursor-grabbing" : ""
            }`}
            {...(isOverlay ? {} : attributes)}
            {...(isOverlay ? {} : listeners)}
        >
            {labels.length > 0 && (
                <ul className="flex flex-wrap gap-1" aria-label="ป้าย">
                    {labels.map((label) => (
                        <li
                            key={label.pl_id}
                            className={`max-w-full truncate rounded-md px-2 py-0.5 text-xs font-medium ${LABEL_COLOR_CLASSES[label.pl_color]}`}
                        >
                            {label.pl_name}
                        </li>
                    ))}
                </ul>
            )}

            <div className="flex items-start justify-between gap-2">
                <button
                    type="button"
                    onClick={onOpen}
                    {...STOP_DRAG}
                    className="-my-2.5 min-w-0 py-2.5 text-left font-medium wrap-break-word text-gray-900 hover:text-blue-600"
                >
                    {parentTitle && <span className="block text-xs font-normal text-gray-500">↳ {parentTitle}</span>}
                    {task.task_title}
                </button>
                <span className="flex shrink-0 items-center gap-1">
                    {!permissions.canChangeStatus && (
                        <Lock size={14} className="text-gray-400" aria-label="เปลี่ยนสถานะไม่ได้" />
                    )}
                    {permissions.canChangeStatus && (
                        <button
                            type="button"
                            aria-label={`ย้าย "${task.task_title}" ไปสถานะอื่น`}
                            onClick={onMove}
                            {...STOP_DRAG}
                            className="-m-2 flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
                        >
                            <MoreHorizontal size={16} />
                        </button>
                    )}
                </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                {task.task_due_date && (
                    <span className={`flex items-center gap-1 ${isOverdue(task) ? "font-medium text-red-600" : ""}`}>
                        <CalendarDays size={13} />
                        {formatDateOnly(task.task_due_date)}
                    </span>
                )}
                {checklistTotal > 0 && (
                    <span
                        className={`flex items-center gap-1 tabular-nums ${checklistDone === checklistTotal ? "text-green-600" : ""}`}
                    >
                        <CheckSquare size={13} />
                        {checklistDone}/{checklistTotal}
                    </span>
                )}
                {subtaskTotal > 0 && (
                    <span className="flex items-center gap-1 tabular-nums">
                        <ListTree size={13} />
                        subtask {task.subtask_done ?? 0}/{subtaskTotal}
                    </span>
                )}
                {task.open_issue_count > 0 && (
                    <span className="flex items-center gap-1 text-red-600">
                        <TriangleAlert size={13} />
                        {task.open_issue_count}
                    </span>
                )}
                {task.subtask_open_issue_count > 0 && (
                    <span className="flex items-center gap-1 text-blue-600">
                        <TriangleAlert size={13} />
                        {task.subtask_open_issue_count}
                    </span>
                )}
                {task.unread_chat_count > 0 && (
                    <span className="flex items-center gap-1 text-blue-600">
                        <MessageCircle size={13} />
                        {task.unread_chat_count}
                    </span>
                )}
            </div>

            {task.assignees.length > 0 ? (
                <div className="flex items-center -space-x-1.5" aria-label="ผู้รับผิดชอบ">
                    {task.assignees.slice(0, MAX_VISIBLE_ASSIGNEES).map((assignee) => (
                        <span
                            key={assignee.user_id}
                            className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-blue-50 text-[11px] font-medium text-blue-600"
                        >
                            {initialsOf(assignee.user_fullname)}
                        </span>
                    ))}
                    {hiddenAssignees > 0 && (
                        <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-gray-100 text-[11px] text-gray-600">
                            +{hiddenAssignees}
                        </span>
                    )}
                    <span className="sr-only">
                        {task.assignees.map((assignee) => assignee.user_fullname).join(", ")}
                    </span>
                </div>
            ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-amber-600">ยังไม่มีคนรับ</span>
                    {permissions.canClaim && (
                        <button
                            type="button"
                            onClick={onClaim}
                            {...STOP_DRAG}
                            className={buttonClass("secondary", "sm")}
                        >
                            รับงาน
                        </button>
                    )}
                </div>
            )}
        </article>
    );
}
