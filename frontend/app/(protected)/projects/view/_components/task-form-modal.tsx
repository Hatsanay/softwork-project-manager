"use client";

// เพิ่ม/แก้ Task และเพิ่ม Subtask (แยกจาก page.tsx 2026-10-30 · ส่วน C) · ฟอร์มเริ่มจาก initialForm ที่หน้าส่งมา
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { api } from "@/app/constans";
import Button from "@/components/ui/Button/Button";
import Input from "@/components/ui/Input/input";
import { buttonClass } from "@/components/ui/button";
import { inputClass } from "@/components/ui/form-field";
import { authHeader } from "../_lib/view-helpers";
import type { Member, Task, TaskFormState } from "../_types";

export default function TaskFormModal({
    projectId,
    editingTask,
    parentTask,
    initialForm,
    members,
    useTaskWeight,
    onSaved,
    onClose,
}: {
    projectId: string;
    editingTask: Task | null;
    parentTask: Task | null;
    initialForm: TaskFormState;
    members: Member[];
    // โปรเจกต์เปิดใช้น้ำหนักงาน (ถ่วง % ความคืบหน้า)
    useTaskWeight: boolean;
    onSaved: () => Promise<unknown>;
    onClose: () => void;
}) {
    const [isPending, startTransition] = useTransition();
    const [taskForm, setTaskForm] = useState<TaskFormState>(initialForm);
    const [taskFormError, setTaskFormError] = useState<string | null>(null);

    function handleTaskSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!taskForm.task_title.trim()) {
            setTaskFormError("กรุณากรอกชื่องาน");
            return;
        }
        setTaskFormError(null);

        startTransition(async () => {
            const url = editingTask
                ? `${api}/projects/${projectId}/tasks/${editingTask.task_id}`
                : `${api}/projects/${projectId}/tasks`;
            const task_weight = useTaskWeight ? Number(taskForm.task_weight) || 1 : 1;
            const body = editingTask
                ? { ...taskForm, task_weight }
                : { ...taskForm, task_weight, task_parent_id: parentTask?.task_id ?? null };
            const res = await fetch(url, {
                method: editingTask ? "PUT" : "POST",
                headers: { "Content-Type": "application/json", ...authHeader() },
                body: JSON.stringify(body),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setTaskFormError(data.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่");
                return;
            }

            toast.success(editingTask ? "แก้ไข task สำเร็จ" : "เพิ่ม task สำเร็จ");
            onClose();
            await onSaved();
        });
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/40 backdrop-blur-sm sm:items-center sm:p-4"
            onClick={() => onClose()}
        >
            <div
                className="bg-white rounded-t-2xl sm:rounded-2xl shadow-float w-full max-w-5xl p-6 sm:p-8 space-y-4 max-h-[90dvh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <h2 className="text-lg font-medium text-gray-900">
                    {editingTask ? "แก้ไข Task" : parentTask ? "เพิ่ม Subtask" : "เพิ่ม Task"}
                </h2>
                {parentTask && (
                    <p className="text-sm text-gray-500 -mt-2">
                        ของ Task: <span className="font-medium">{parentTask.task_title}</span>
                    </p>
                )}
                <form onSubmit={handleTaskSubmit} className="space-y-4">
                    <div className="flex flex-col gap-1">
                        <label className="text-sm font-medium text-gray-700">ชื่องาน</label>
                        <Input
                            value={taskForm.task_title}
                            onChange={(e) => setTaskForm((p) => ({ ...p, task_title: e.target.value }))}
                            required
                        />
                    </div>

                    <div className="flex flex-col gap-1">
                        <label className="text-sm font-medium text-gray-700">รายละเอียด</label>
                        <textarea
                            value={taskForm.task_description}
                            onChange={(e) => setTaskForm((p) => ({ ...p, task_description: e.target.value }))}
                            rows={5}
                            className={inputClass(false)}
                        />
                    </div>

                    <div className="flex flex-col gap-1">
                        <label className="text-sm font-medium text-gray-700 mb-2">ผู้รับผิดชอบ (เลือกได้หลายคน)</label>
                        <div className="grid gap-1 rounded-xl border border-gray-100 p-1.5 max-h-60 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
                            {members.length === 0 ? (
                                <p className="px-4 py-2.5 text-sm text-gray-400">ยังไม่มีสมาชิกในโปรเจกต์นี้</p>
                            ) : (
                                members.map((m) => (
                                    <label
                                        key={m.user_id}
                                        className="flex min-h-11 items-center gap-3 cursor-pointer rounded-lg px-3 py-2 hover:bg-blue-50"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={taskForm.assignee_ids.includes(m.user_id)}
                                            onChange={() =>
                                                setTaskForm((p) => ({
                                                    ...p,
                                                    assignee_ids: p.assignee_ids.includes(m.user_id)
                                                        ? p.assignee_ids.filter((uid) => uid !== m.user_id)
                                                        : [...p.assignee_ids, m.user_id],
                                                }))
                                            }
                                            className="w-4 h-4 accent-blue-500"
                                        />
                                        <span className="text-sm text-gray-700">{m.user_fullname}</span>
                                    </label>
                                ))
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        <div className="flex flex-col gap-1">
                            <label className="text-sm font-medium text-gray-700">วันเริ่ม</label>
                            <Input
                                type="date"
                                value={taskForm.task_start_date}
                                onChange={(e) => setTaskForm((p) => ({ ...p, task_start_date: e.target.value }))}
                            />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-sm font-medium text-gray-700">วันครบกำหนด</label>
                            <Input
                                type="date"
                                value={taskForm.task_due_date}
                                onChange={(e) => setTaskForm((p) => ({ ...p, task_due_date: e.target.value }))}
                            />
                        </div>
                        {useTaskWeight && (
                            <div className="col-span-2 flex flex-col gap-1 sm:col-span-1">
                                <label className="text-sm font-medium text-gray-700">
                                    น้ำหนัก (ถ่วง % ความคืบหน้า)
                                </label>
                                <Input
                                    type="number"
                                    min={1}
                                    value={taskForm.task_weight}
                                    onChange={(e) => setTaskForm((p) => ({ ...p, task_weight: e.target.value }))}
                                />
                            </div>
                        )}
                    </div>

                    {taskFormError && <p className="text-sm text-red-600">{taskFormError}</p>}

                    <div className="flex justify-end gap-3 pt-2">
                        <button type="button" onClick={() => onClose()} className={buttonClass("secondary", "md")}>
                            ยกเลิก
                        </button>
                        <Button type="submit" disabled={isPending}>
                            {isPending ? "กำลังบันทึก..." : "บันทึก"}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
