"use client";

// หน้าต่างตั้งพนักงานพ้นสภาพ — วันทำงานวันสุดท้าย (ล่วงหน้าได้) + เหตุผล
// หน้าตาเดียวกับ ReasonDialog (กล่องกลางจอ มือถือเป็นแผ่นจากล่าง) · Esc ปิด · ข้อผิดพลาดค้างไว้ในหน้าต่าง
import { useEffect, useState } from "react";
import { toast } from "sonner";
import FormField, { inputClass } from "@/components/ui/form-field";
import FieldHint from "@/components/ui/guidance/field-hint";
import { buttonClass } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { toFieldErrors, type FieldErrors } from "@/lib/form-errors";
import { employeeTerminateSchema } from "@/lib/shared/schemas/people.mjs";
import { EMPLOYEE_MESSAGES } from "../../../_messages";
import type { Employee } from "../../../_types";

export default function TerminateDialog({
    employee,
    open,
    onClose,
}: {
    employee: Employee;
    open: boolean;
    onClose: (saved: boolean) => void;
}) {
    const [form, setForm] = useState({
        emp_termination_date: employee.emp_termination_date ?? employee.today,
        emp_termination_reason: employee.emp_termination_reason ?? "",
        // ตั้งครั้งแรก = ปิด (K4) · แก้วันพ้นสภาพ = คงค่าที่ตั้งไว้
        emp_close_login_on_termination: employee.emp_termination_date ? employee.emp_close_login_on_termination : true,
    });
    // ติ๊กได้เฉพาะเมื่อผูกบัญชีที่ยังเปิดใช้งาน
    const hasActiveAccount = Boolean(employee.emp_user_id) && employee.user_status === "active";
    const [errors, setErrors] = useState<FieldErrors>({});
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (!open) return;
        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape" && !isSaving) onClose(false);
        }
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [open, isSaving, onClose]);

    if (!open) return null;

    async function save(event: React.FormEvent) {
        event.preventDefault();
        const checked = employeeTerminateSchema.safeParse(form);
        if (!checked.success) {
            setErrors(toFieldErrors(checked.error.issues));
            return;
        }
        setIsSaving(true);
        const { error } = await apiFetch(`/employees/${employee.emp_id}/terminate`, {
            method: "POST",
            body: checked.data,
        });
        setIsSaving(false);
        if (error) {
            setErrors({ ...error.fields, form: error.message });
            return;
        }
        toast.success("บันทึกวันพ้นสภาพแล้ว");
        onClose(true);
    }

    const isFuture = form.emp_termination_date > employee.today;
    const resultText = isFuture ? "ยังทำงานอยู่จนถึงวันนั้น แล้วเปลี่ยนเป็นพ้นสภาพเอง" : "เปลี่ยนเป็นพ้นสภาพหลังวันนี้";

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
            <form
                role="dialog"
                aria-modal="true"
                aria-labelledby="terminate-title"
                onSubmit={save}
                noValidate
                className="grid max-h-[90dvh] w-full max-w-2xl gap-4 overflow-y-auto rounded-t-2xl bg-white p-5 shadow-float sm:rounded-2xl sm:p-6"
            >
                <div className="grid gap-1">
                    <h2 id="terminate-title" className="text-base font-medium text-gray-900">
                        ตั้งพ้นสภาพ: {employee.emp_first_name_th} {employee.emp_last_name_th}
                    </h2>
                    <p className="text-sm text-gray-500">{EMPLOYEE_MESSAGES.terminate}</p>
                </div>
                <FormField
                    label="วันทำงานวันสุดท้าย"
                    htmlFor="emp_termination_date"
                    required
                    hint={resultText}
                    error={errors.emp_termination_date}
                >
                    <input
                        id="emp_termination_date"
                        type="date"
                        min={employee.emp_hire_date}
                        value={form.emp_termination_date}
                        onChange={(event) =>
                            setForm((current) => ({ ...current, emp_termination_date: event.target.value }))
                        }
                        className={inputClass(Boolean(errors.emp_termination_date))}
                    />
                </FormField>
                <FormField
                    label="เหตุผล"
                    htmlFor="emp_termination_reason"
                    required
                    error={errors.emp_termination_reason}
                >
                    <textarea
                        id="emp_termination_reason"
                        rows={3}
                        maxLength={500}
                        placeholder="เช่น ลาออก / เลิกจ้าง / ครบสัญญา"
                        value={form.emp_termination_reason}
                        onChange={(event) =>
                            setForm((current) => ({ ...current, emp_termination_reason: event.target.value }))
                        }
                        className={inputClass(Boolean(errors.emp_termination_reason))}
                    />
                </FormField>
                {hasActiveAccount && (
                    <label className="flex min-h-11 items-start gap-3 rounded-xl border border-gray-200 px-4 py-3 text-sm">
                        <input
                            type="checkbox"
                            className="mt-0.5 h-4 w-4"
                            checked={form.emp_close_login_on_termination}
                            onChange={(event) =>
                                setForm((current) => ({ ...current, emp_close_login_on_termination: event.target.checked }))
                            }
                        />
                        <span className="grid gap-0.5">
                            <span>ปิดการเข้าระบบของบัญชี {employee.user_username} หลังวันทำงานวันสุดท้าย</span>
                            <FieldHint error={errors.emp_close_login_on_termination}>{EMPLOYEE_MESSAGES.closeLogin}</FieldHint>
                        </span>
                    </label>
                )}
                {errors.form && <FieldHint error={errors.form} />}
                <div className="flex flex-wrap justify-end gap-2">
                    <button
                        type="button"
                        className={buttonClass("secondary", "md")}
                        onClick={() => onClose(false)}
                        disabled={isSaving}
                    >
                        ไม่ทำ
                    </button>
                    <button type="submit" className={buttonClass("danger", "md")} disabled={isSaving}>
                        {isSaving ? "กำลังบันทึก..." : "บันทึกวันพ้นสภาพ"}
                    </button>
                </div>
            </form>
        </div>
    );
}
