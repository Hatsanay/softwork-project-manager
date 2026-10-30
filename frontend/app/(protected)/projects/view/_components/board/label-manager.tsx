"use client";

// จัดการป้ายสีของโปรเจกต์ (เพิ่ม/แก้ชื่อและสี/ลบ) — เฉพาะผู้มีสิทธิ์แก้ข้อมูลโปรเจกต์ (backend ตรวจซ้ำ)
// ลบป้ายที่ติดอยู่หลายงาน: ถามยืนยันพร้อมจำนวนงานที่จะหลุดป้าย (R-K11)
import { useState } from "react";
import { toast } from "sonner";
import { Check, Pencil, Trash2 } from "lucide-react";
import FieldHint from "@/components/ui/guidance/field-hint";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { inputClass } from "@/components/ui/form-field";
import { buttonClass } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { projectLabelSchema } from "@/lib/shared/schemas/task-board.mjs";
import { LABEL_COLOR_CLASSES, LABEL_COLOR_NAMES, type LabelColor } from "./label-colors";
import type { ProjectLabel } from "./board-types";

const COLORS = Object.keys(LABEL_COLOR_CLASSES) as LabelColor[];

type Draft = { pl_id: number | null; pl_name: string; pl_color: LabelColor };

const EMPTY_DRAFT: Draft = { pl_id: null, pl_name: "", pl_color: "blue" };

export default function LabelManager({
    projectId,
    labels,
    onChanged,
}: {
    projectId: string;
    labels: ProjectLabel[];
    onChanged: () => Promise<void>;
}) {
    const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<ProjectLabel | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const isEditing = draft.pl_id !== null;

    async function save(event: React.FormEvent) {
        event.preventDefault();
        const checked = projectLabelSchema.safeParse({ pl_name: draft.pl_name, pl_color: draft.pl_color });
        if (!checked.success) {
            setError(checked.error.issues[0]?.message ?? "ข้อมูลป้ายไม่ถูกต้อง");
            return;
        }
        setIsSaving(true);
        const { error: saveError } = isEditing
            ? await apiFetch(`/projects/${projectId}/labels/${draft.pl_id}`, { method: "PUT", body: checked.data })
            : await apiFetch(`/projects/${projectId}/labels`, { method: "POST", body: checked.data });
        setIsSaving(false);
        if (saveError) {
            setError(saveError.fields.pl_name ?? saveError.message);
            return;
        }
        toast.success(isEditing ? "แก้ป้ายแล้ว" : "เพิ่มป้ายแล้ว");
        setDraft(EMPTY_DRAFT);
        setError(null);
        await onChanged();
    }

    async function confirmDelete() {
        if (!deleteTarget) return;
        const { error: removeError } = await apiFetch(`/projects/${projectId}/labels/${deleteTarget.pl_id}`, {
            method: "DELETE",
        });
        if (removeError) {
            setDeleteError(removeError.message);
            return;
        }
        toast.success("ลบป้ายแล้ว");
        setDeleteTarget(null);
        setDeleteError(null);
        await onChanged();
    }

    return (
        <div className="grid gap-3 rounded-xl bg-gray-50 p-3">
            <p className="text-xs font-medium text-gray-700">ป้ายของโปรเจกต์</p>
            {labels.length > 0 && (
                <ul className="grid gap-1.5">
                    {labels.map((label) => (
                        <li key={label.pl_id} className="flex items-center justify-between gap-2">
                            <span
                                className={`min-w-0 truncate rounded-md px-2 py-0.5 text-xs font-medium ${LABEL_COLOR_CLASSES[label.pl_color]}`}
                            >
                                {label.pl_name}
                            </span>
                            <span className="flex shrink-0 items-center gap-1 text-xs text-gray-500">
                                {label.task_count} งาน
                                <button
                                    type="button"
                                    aria-label={`แก้ป้าย ${label.pl_name}`}
                                    className="flex h-10 w-10 items-center justify-center rounded-lg text-blue-600 hover:bg-white"
                                    onClick={() =>
                                        setDraft({
                                            pl_id: label.pl_id,
                                            pl_name: label.pl_name,
                                            pl_color: label.pl_color,
                                        })
                                    }
                                >
                                    <Pencil size={14} />
                                </button>
                                <button
                                    type="button"
                                    aria-label={`ลบป้าย ${label.pl_name}`}
                                    className="flex h-10 w-10 items-center justify-center rounded-lg text-red-600 hover:bg-white"
                                    onClick={() => setDeleteTarget(label)}
                                >
                                    <Trash2 size={14} />
                                </button>
                            </span>
                        </li>
                    ))}
                </ul>
            )}
            <form onSubmit={save} noValidate className="grid gap-2">
                <input
                    aria-label="ชื่อป้าย"
                    placeholder={isEditing ? "ชื่อป้าย" : "ชื่อป้ายใหม่ เช่น ด่วน"}
                    maxLength={50}
                    value={draft.pl_name}
                    onChange={(event) => setDraft((current) => ({ ...current, pl_name: event.target.value }))}
                    className={inputClass(Boolean(error))}
                />
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="สีป้าย">
                    {COLORS.map((color) => {
                        const isSelected = draft.pl_color === color;
                        return (
                            <button
                                key={color}
                                type="button"
                                role="radio"
                                aria-checked={isSelected}
                                aria-label={LABEL_COLOR_NAMES[color]}
                                onClick={() => setDraft((current) => ({ ...current, pl_color: color }))}
                                className={`flex h-10 w-10 items-center justify-center rounded-lg ${LABEL_COLOR_CLASSES[color]} ${
                                    isSelected ? "ring-2 ring-blue-600 ring-offset-2" : ""
                                }`}
                            >
                                {isSelected && <Check size={16} />}
                            </button>
                        );
                    })}
                </div>
                <FieldHint error={error}>ป้ายใช้ได้ทั้งโปรเจกต์ · มีชื่อกำกับเสมอ (สีไม่ได้บอกสถานะงาน)</FieldHint>
                <div className="flex flex-wrap justify-end gap-2">
                    {isEditing && (
                        <button
                            type="button"
                            className={buttonClass("secondary", "sm")}
                            onClick={() => {
                                setDraft(EMPTY_DRAFT);
                                setError(null);
                            }}
                        >
                            ยกเลิกแก้
                        </button>
                    )}
                    <button type="submit" className={buttonClass("primary", "sm")} disabled={isSaving}>
                        {isEditing ? "บันทึกป้าย" : "เพิ่มป้าย"}
                    </button>
                </div>
            </form>
            <ConfirmDialog
                open={Boolean(deleteTarget)}
                title={`ลบป้าย "${deleteTarget?.pl_name ?? ""}"?`}
                description={
                    deleteTarget && deleteTarget.task_count > 0
                        ? `ป้ายนี้ติดอยู่ ${deleteTarget.task_count} งาน · ลบแล้วทุกงานจะหลุดป้ายนี้`
                        : "ป้ายนี้ยังไม่ได้ติดกับงานใด"
                }
                confirmLabel="ลบป้าย"
                errorMessage={deleteError}
                onConfirm={confirmDelete}
                onCancel={() => {
                    setDeleteTarget(null);
                    setDeleteError(null);
                }}
            />
        </div>
    );
}
