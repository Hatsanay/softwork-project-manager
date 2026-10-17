"use client";

// ป้ายสี + checklist ในหน้าต่างรายละเอียดงาน (บอร์ดงาน 2026-10-17 — แบบหัวข้อ 2.1)
// สิทธิ์: ติดป้าย/แก้ checklist = แก้ไขงานนี้ได้ · ติ๊ก checklist = เปลี่ยนสถานะงานนี้ได้ · จัดการป้ายของโปรเจกต์ = แก้ข้อมูลโปรเจกต์ได้
// checklist ไม่นับเข้าความคืบหน้าโปรเจกต์ (R-K12) — บอกในข้อความกำกับ
import { useState } from "react";
import { ArrowDown, ArrowUp, CheckSquare, Pencil, Plus, Tag, Trash2 } from "lucide-react";
import FieldHint from "@/components/ui/guidance/field-hint";
import { inputClass } from "@/components/ui/form-field";
import { buttonClass } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { checklistItemSchema } from "@/lib/shared/schemas/task-board.mjs";
import { LABEL_COLOR_CLASSES } from "./label-colors";
import type { BoardLabel, ProjectLabel } from "./board-types";
import LabelManager from "./label-manager";

export type ChecklistItem = {
    tci_id: number;
    tci_text: string;
    tci_is_done: boolean;
    tci_sort_order: number;
    tci_done_at: string | null;
    done_by_name: string | null;
};

export default function TaskLabelsChecklist({
    projectId,
    taskId,
    initialLabels,
    initialChecklist,
    canEdit,
    canTick,
    canManageLabels,
    onChanged,
}: {
    projectId: string;
    taskId: string;
    initialLabels: BoardLabel[];
    initialChecklist: ChecklistItem[];
    canEdit: boolean;
    canTick: boolean;
    canManageLabels: boolean;
    onChanged: () => Promise<void>;
}) {
    const [labels, setLabels] = useState(initialLabels);
    const [checklist, setChecklist] = useState(initialChecklist);
    const [projectLabels, setProjectLabels] = useState<ProjectLabel[] | null>(null);
    const [isPickingLabels, setIsPickingLabels] = useState(false);
    const [newItemText, setNewItemText] = useState("");
    const [editing, setEditing] = useState<{ id: number; text: string } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isWorking, setIsWorking] = useState(false);
    const taskUrl = `/projects/${projectId}/tasks/${taskId}`;
    const doneCount = checklist.filter((item) => item.tci_is_done).length;

    async function loadProjectLabels() {
        const { data } = await apiFetch<{ data: ProjectLabel[] }>(`/projects/${projectId}/labels`);
        setProjectLabels(data?.data ?? []);
    }

    async function reloadChecklist() {
        const { data } = await apiFetch<{ data: ChecklistItem[] }>(`${taskUrl}/checklist`);
        if (data) setChecklist(data.data);
        await onChanged();
    }

    // เรียกงานผ่าน API ทีละคำสั่ง — ผิดพลาดแสดงใต้ส่วนนี้ (ไม่ใช่ toast)
    async function run(
        action: () => Promise<{ error: { message: string } | null }>,
        afterSuccess: () => Promise<void>,
    ) {
        setIsWorking(true);
        setError(null);
        const { error: actionError } = await action();
        setIsWorking(false);
        if (actionError) {
            setError(actionError.message);
            await reloadChecklist();
            return false;
        }
        await afterSuccess();
        return true;
    }

    async function openLabelPicker() {
        setIsPickingLabels(true);
        await loadProjectLabels();
    }

    async function toggleLabel(label: ProjectLabel) {
        const isOn = labels.some((current) => current.pl_id === label.pl_id);
        const nextLabels = isOn ? labels.filter((current) => current.pl_id !== label.pl_id) : [...labels, label];
        await run(
            () =>
                apiFetch(`${taskUrl}/labels`, {
                    method: "PUT",
                    body: { label_ids: nextLabels.map((current) => current.pl_id) },
                }),
            async () => {
                setLabels(nextLabels.map(({ pl_id, pl_name, pl_color }) => ({ pl_id, pl_name, pl_color })));
                await loadProjectLabels();
                await onChanged();
            },
        );
    }

    async function addItem(event: React.FormEvent) {
        event.preventDefault();
        const checked = checklistItemSchema.safeParse({ tci_text: newItemText });
        if (!checked.success) {
            setError(checked.error.issues[0]?.message ?? "ข้อความไม่ถูกต้อง");
            return;
        }
        const isAdded = await run(
            () => apiFetch(`${taskUrl}/checklist`, { method: "POST", body: checked.data }),
            reloadChecklist,
        );
        if (isAdded) setNewItemText("");
    }

    async function saveEdit() {
        if (!editing) return;
        const checked = checklistItemSchema.safeParse({ tci_text: editing.text });
        if (!checked.success) {
            setError(checked.error.issues[0]?.message ?? "ข้อความไม่ถูกต้อง");
            return;
        }
        const isSaved = await run(
            () => apiFetch(`${taskUrl}/checklist/${editing.id}`, { method: "PUT", body: checked.data }),
            reloadChecklist,
        );
        if (isSaved) setEditing(null);
    }

    function setDone(item: ChecklistItem, isDone: boolean) {
        // ติ๊กแล้วเห็นผลทันที — ไม่สำเร็จ run() โหลดของจริงกลับมา
        setChecklist((current) =>
            current.map((entry) => (entry.tci_id === item.tci_id ? { ...entry, tci_is_done: isDone } : entry)),
        );
        run(
            () =>
                apiFetch(`${taskUrl}/checklist/${item.tci_id}/done`, { method: "PUT", body: { tci_is_done: isDone } }),
            onChanged,
        );
    }

    function moveItem(index: number, offset: number) {
        const reordered = [...checklist];
        const [item] = reordered.splice(index, 1);
        reordered.splice(index + offset, 0, item);
        setChecklist(reordered);
        run(
            () =>
                apiFetch(`/projects/${projectId}/tasks/${taskId}/checklist-order`, {
                    method: "PUT",
                    body: { item_ids: reordered.map((entry) => entry.tci_id) },
                }),
            async () => undefined,
        );
    }

    return (
        <div className="grid gap-4">
            {/* ─── ป้าย ─── */}
            <section className="grid gap-2" aria-labelledby={`labels-${taskId}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 id={`labels-${taskId}`} className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
                        <Tag size={15} />
                        ป้าย
                    </h3>
                    {canEdit && !isPickingLabels && (
                        <button type="button" className={buttonClass("ghost", "sm")} onClick={openLabelPicker}>
                            <Pencil size={14} />
                            เลือกป้าย
                        </button>
                    )}
                </div>
                {labels.length === 0 && !isPickingLabels && <p className="text-xs text-gray-400">ยังไม่มีป้าย</p>}
                {labels.length > 0 && !isPickingLabels && (
                    <ul className="flex flex-wrap gap-1.5">
                        {labels.map((label) => (
                            <li
                                key={label.pl_id}
                                className={`rounded-md px-2 py-0.5 text-xs font-medium ${LABEL_COLOR_CLASSES[label.pl_color]}`}
                            >
                                {label.pl_name}
                            </li>
                        ))}
                    </ul>
                )}
                {isPickingLabels && (
                    <div className="grid gap-3">
                        {projectLabels === null && <p className="text-xs text-gray-500">กำลังโหลดป้าย...</p>}
                        {projectLabels && projectLabels.length === 0 && (
                            <p className="text-xs text-gray-500">
                                โปรเจกต์นี้ยังไม่มีป้าย
                                {canManageLabels
                                    ? " — เพิ่มป้ายด้านล่าง"
                                    : " — ให้ผู้มีสิทธิ์แก้ข้อมูลโปรเจกต์สร้างป้ายก่อน"}
                            </p>
                        )}
                        {projectLabels && projectLabels.length > 0 && (
                            <div className="flex flex-wrap gap-1.5" role="group" aria-label="ป้ายของงานนี้">
                                {projectLabels.map((label) => {
                                    const isOn = labels.some((current) => current.pl_id === label.pl_id);
                                    return (
                                        <button
                                            key={label.pl_id}
                                            type="button"
                                            aria-pressed={isOn}
                                            disabled={isWorking}
                                            onClick={() => toggleLabel(label)}
                                            className={`min-h-10 rounded-lg px-3 text-xs font-medium ${LABEL_COLOR_CLASSES[label.pl_color]} ${
                                                isOn ? "ring-2 ring-blue-600 ring-offset-1" : "opacity-60"
                                            }`}
                                        >
                                            {isOn ? "✓ " : ""}
                                            {label.pl_name}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                        {canManageLabels && projectLabels && (
                            <LabelManager
                                projectId={projectId}
                                labels={projectLabels}
                                onChanged={async () => {
                                    await loadProjectLabels();
                                    await onChanged();
                                }}
                            />
                        )}
                        <button
                            type="button"
                            className={`${buttonClass("secondary", "sm")} justify-self-start`}
                            onClick={() => setIsPickingLabels(false)}
                        >
                            เสร็จ
                        </button>
                    </div>
                )}
            </section>

            {/* ─── checklist ─── */}
            <section className="grid gap-2" aria-labelledby={`checklist-${taskId}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3
                        id={`checklist-${taskId}`}
                        className="flex items-center gap-1.5 text-sm font-medium text-gray-900"
                    >
                        <CheckSquare size={15} />
                        Checklist
                        {checklist.length > 0 && (
                            <span
                                className={`text-xs tabular-nums ${doneCount === checklist.length ? "text-green-600" : "text-gray-500"}`}
                            >
                                {doneCount}/{checklist.length}
                            </span>
                        )}
                    </h3>
                </div>
                <FieldHint>
                    ไว้จดสิ่งที่ต้องทำย่อยๆ ไม่มีผู้รับผิดชอบ/สถานะ และไม่นับในความคืบหน้าโปรเจกต์ —
                    งานที่ต้องติดตามจริงให้สร้างเป็น subtask
                </FieldHint>
                <ul className="grid gap-1">
                    {checklist.map((item, index) => (
                        <li key={item.tci_id} className="flex items-start gap-2 rounded-lg px-1 py-1 hover:bg-gray-50">
                            <label className="-my-2 -ml-2 flex h-10 w-10 shrink-0 items-center justify-center">
                                <input
                                    type="checkbox"
                                    aria-label={`เสร็จ: ${item.tci_text}`}
                                    className="h-5 w-5"
                                    checked={item.tci_is_done}
                                    disabled={!canTick}
                                    onChange={(event) => setDone(item, event.target.checked)}
                                />
                            </label>
                            {editing?.id === item.tci_id ? (
                                <div className="grid min-w-0 flex-1 gap-2">
                                    <input
                                        aria-label="แก้ข้อความ checklist"
                                        maxLength={200}
                                        autoFocus
                                        value={editing.text}
                                        onChange={(event) => setEditing({ id: item.tci_id, text: event.target.value })}
                                        className={inputClass(false)}
                                    />
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            className={buttonClass("primary", "sm")}
                                            onClick={saveEdit}
                                        >
                                            บันทึก
                                        </button>
                                        <button
                                            type="button"
                                            className={buttonClass("secondary", "sm")}
                                            onClick={() => setEditing(null)}
                                        >
                                            ยกเลิก
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <span
                                    className={`min-w-0 flex-1 pt-0.5 text-sm wrap-break-word ${
                                        item.tci_is_done ? "text-gray-400 line-through" : "text-gray-800"
                                    }`}
                                >
                                    {item.tci_text}
                                </span>
                            )}
                            {canEdit && editing?.id !== item.tci_id && (
                                <span className="flex shrink-0 items-center">
                                    <button
                                        type="button"
                                        aria-label="เลื่อนขึ้น"
                                        disabled={index === 0 || isWorking}
                                        className="flex h-10 w-8 items-center justify-center text-gray-500 disabled:opacity-30"
                                        onClick={() => moveItem(index, -1)}
                                    >
                                        <ArrowUp size={14} />
                                    </button>
                                    <button
                                        type="button"
                                        aria-label="เลื่อนลง"
                                        disabled={index === checklist.length - 1 || isWorking}
                                        className="flex h-10 w-8 items-center justify-center text-gray-500 disabled:opacity-30"
                                        onClick={() => moveItem(index, 1)}
                                    >
                                        <ArrowDown size={14} />
                                    </button>
                                    <button
                                        type="button"
                                        aria-label={`แก้ ${item.tci_text}`}
                                        className="flex h-10 w-8 items-center justify-center text-blue-600"
                                        onClick={() => setEditing({ id: item.tci_id, text: item.tci_text })}
                                    >
                                        <Pencil size={14} />
                                    </button>
                                    <button
                                        type="button"
                                        aria-label={`ลบ ${item.tci_text}`}
                                        disabled={isWorking}
                                        className="flex h-10 w-8 items-center justify-center text-red-600"
                                        onClick={() =>
                                            run(
                                                () =>
                                                    apiFetch(`${taskUrl}/checklist/${item.tci_id}`, {
                                                        method: "DELETE",
                                                    }),
                                                reloadChecklist,
                                            )
                                        }
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </span>
                            )}
                        </li>
                    ))}
                </ul>
                {canEdit && (
                    <form onSubmit={addItem} noValidate className="flex gap-2">
                        <input
                            aria-label="เพิ่มข้อใน checklist"
                            placeholder="เพิ่มข้อใหม่..."
                            maxLength={200}
                            value={newItemText}
                            onChange={(event) => setNewItemText(event.target.value)}
                            className={inputClass(false)}
                        />
                        <button
                            type="submit"
                            className={`${buttonClass("secondary", "md")} shrink-0`}
                            disabled={isWorking}
                        >
                            <Plus size={16} />
                            เพิ่ม
                        </button>
                    </form>
                )}
                {!canEdit && !canTick && checklist.length > 0 && (
                    <FieldHint>ดูได้อย่างเดียว — แก้/ติ๊กได้เฉพาะผู้รับผิดชอบงานนี้ หรือผู้มีสิทธิ์ในตำแหน่ง</FieldHint>
                )}
                <FieldHint error={error} />
            </section>
        </div>
    );
}
