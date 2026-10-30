"use client";

// ลูกค้าตอบรับ (sales-cycle หัวข้อ 7) — เลือกโปรเจกต์ (ใหม่ / เดิมของลูกค้ารายนี้ / ไม่ผูก) + สร้างงานจากรายการ
import { useEffect, useState } from "react";
import { buttonClass } from "@/components/ui/button";
import { inputClass } from "@/components/ui/form-field";
import FieldHint from "@/components/ui/guidance/field-hint";
import { apiFetch } from "@/lib/api";

type ProjectOptions = {
    projects: { project_id: string; project_name: string; project_status: string }[];
    can_create_project: boolean;
};

type ProjectMode = "new" | "existing" | "none";

export type AcceptChoice = { project_mode: ProjectMode; project_id: string | null; create_tasks: boolean };

type AcceptDialogProps = {
    open: boolean;
    quotationId: string;
    title: string;
    loading: boolean;
    errorMessage: string | null;
    onConfirm: (choice: AcceptChoice) => void;
    onCancel: () => void;
};

export default function AcceptDialog({
    open,
    quotationId,
    title,
    loading,
    errorMessage,
    onConfirm,
    onCancel,
}: AcceptDialogProps) {
    const [options, setOptions] = useState<ProjectOptions | null>(null);
    const [mode, setMode] = useState<ProjectMode | null>(null);
    const [projectId, setProjectId] = useState("");
    const [createTasks, setCreateTasks] = useState(true);

    useEffect(() => {
        if (!open) return;
        let isClosed = false;
        apiFetch<ProjectOptions>(`/quotations/${quotationId}/project-options`).then(({ data }) => {
            if (!isClosed) setOptions(data ?? { projects: [], can_create_project: false });
        });
        return () => {
            isClosed = true;
        };
    }, [open, quotationId]);

    if (!open) return null;

    // ค่าเริ่มต้น: สร้างใหม่ถ้ามีสิทธิ์ ไม่งั้นผูกโปรเจกต์เดิม (ถ้ามี) ไม่งั้นไม่ผูก
    const defaultMode: ProjectMode = options?.can_create_project
        ? "new"
        : options?.projects.length
          ? "existing"
          : "none";
    const selectedMode = mode ?? defaultMode;
    const selectedProjectId = projectId || options?.projects[0]?.project_id || "";
    const canConfirm = options !== null && (selectedMode !== "existing" || selectedProjectId !== "");

    function choiceLabel(value: ProjectMode, label: string, hint: string, disabled = false) {
        return (
            <label
                className={`flex gap-3 rounded-xl border p-3 ${selectedMode === value ? "border-blue-300 bg-blue-50/60" : "border-gray-200"} ${disabled ? "opacity-50" : "cursor-pointer"}`}
            >
                <input
                    type="radio"
                    name="project_mode"
                    className="mt-1"
                    checked={selectedMode === value}
                    disabled={disabled}
                    onChange={() => setMode(value)}
                />
                <span className="grid gap-0.5">
                    <span className="text-sm text-gray-800">{label}</span>
                    <span className="text-xs text-gray-500">{hint}</span>
                </span>
            </label>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/40 backdrop-blur-sm sm:items-center sm:p-4">
            <div
                role="dialog"
                aria-modal="true"
                aria-label="ลูกค้าตอบรับ"
                className="grid max-h-[90dvh] w-full max-w-3xl gap-4 overflow-y-auto rounded-t-2xl bg-white p-5 shadow-float sm:rounded-2xl sm:p-6"
            >
                <div className="grid gap-1">
                    <h2 className="text-base font-medium text-gray-900">บันทึกว่าลูกค้าตอบรับ?</h2>
                    <p className="text-sm text-gray-500">
                        ตอบรับแล้วใบนี้ล็อกถาวร · งานเพิ่ม/ลดภายหลังให้ใช้ &quot;คัดลอกเป็นใบใหม่&quot;
                    </p>
                </div>

                {!options && <p className="text-sm text-gray-500">กำลังโหลดโปรเจกต์ของลูกค้า...</p>}
                {options && (
                    <div className="grid gap-2">
                        {choiceLabel(
                            "new",
                            `สร้างโปรเจกต์ใหม่ "${title}"`,
                            options.can_create_project
                                ? "คุณเป็น PM ของโปรเจกต์ใหม่ เพิ่มสมาชิกต่อได้ที่หน้าโปรเจกต์"
                                : "คุณไม่มีสิทธิ์สร้างโปรเจกต์",
                            !options.can_create_project,
                        )}
                        {choiceLabel(
                            "existing",
                            "ผูกกับโปรเจกต์เดิมของลูกค้ารายนี้",
                            options.projects.length > 0
                                ? "งานจากรายการจะต่อท้ายงานที่มีอยู่"
                                : "ลูกค้ารายนี้ยังไม่มีโปรเจกต์ที่คุณเข้าถึงได้",
                            options.projects.length === 0,
                        )}
                        {selectedMode === "existing" && options.projects.length > 0 && (
                            <select
                                aria-label="โปรเจกต์"
                                value={selectedProjectId}
                                onChange={(event) => setProjectId(event.target.value)}
                                className={inputClass()}
                            >
                                {options.projects.map((project) => (
                                    <option key={project.project_id} value={project.project_id}>
                                        {project.project_name}
                                    </option>
                                ))}
                            </select>
                        )}
                        {choiceLabel(
                            "none",
                            "ไม่ผูกโปรเจกต์",
                            "บันทึกแค่ว่าลูกค้าตอบรับ · ผูกโปรเจกต์ภายหลังไม่ได้จากหน้านี้",
                        )}
                    </div>
                )}

                {options && selectedMode !== "none" && (
                    <label className="flex cursor-pointer gap-3 text-sm text-gray-800">
                        <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={createTasks}
                            onChange={(event) => setCreateTasks(event.target.checked)}
                        />
                        <span className="grid gap-0.5">
                            สร้างงานจากรายการในใบ
                            <FieldHint>
                                หัวข้อ = งานหลัก · รายการ = งานย่อย · หมายเหตุไม่สร้างงาน · ไม่คัดลอกราคาไปในงาน ·
                                ยังไม่มีผู้รับผิดชอบ/วันที่ (PM มอบหมายต่อ)
                            </FieldHint>
                        </span>
                    </label>
                )}

                {errorMessage && (
                    <p role="alert" className="text-sm text-red-600">
                        {errorMessage}
                    </p>
                )}
                <div className="flex flex-wrap justify-end gap-2">
                    <button
                        type="button"
                        className={buttonClass("secondary", "md")}
                        onClick={onCancel}
                        disabled={loading}
                    >
                        ยังไม่บันทึก
                    </button>
                    <button
                        type="button"
                        className={buttonClass("primary", "md")}
                        disabled={loading || !canConfirm}
                        onClick={() =>
                            onConfirm({
                                project_mode: selectedMode,
                                project_id: selectedMode === "existing" ? selectedProjectId : null,
                                create_tasks: selectedMode !== "none" && createTasks,
                            })
                        }
                    >
                        {loading ? "กำลังบันทึก..." : "ลูกค้าตอบรับ"}
                    </button>
                </div>
            </div>
        </div>
    );
}
