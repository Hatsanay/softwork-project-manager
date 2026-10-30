"use client";

// ออกบัตรใหม่เอง (หาย · ชำรุด · ข้อมูลบนบัตรเปลี่ยน · หมดอายุ) — รหัสเดิม · บัตรใบที่ใช้อยู่ถูกยกเลิก
// รหัสเปลี่ยน (แก้ข้อมูล/ย้าย) ระบบออกบัตรให้เอง ไม่ต้องกดที่นี่
import { useEffect, useState } from "react";
import { toast } from "sonner";
import FormField, { inputClass } from "@/components/ui/form-field";
import FieldHint from "@/components/ui/guidance/field-hint";
import { buttonClass } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { toFieldErrors, type FieldErrors } from "@/lib/form-errors";
import { EMPLOYEE_CARD_REASONS, employeeCardIssueSchema } from "@/lib/shared/schemas/people.mjs";
import type { Employee } from "../../../_types";

const MANUAL_REASONS = ["lost", "damaged", "info_change", "expired"] as const;

export default function IssueCardDialog({ employee, onClose }: { employee: Employee; onClose: (isSaved: boolean) => void }) {
    const [form, setForm] = useState({ ec_reason: "", ec_note: "" });
    const [errors, setErrors] = useState<FieldErrors>({});
    const [isSaving, setIsSaving] = useState(false);
    const activeCard = employee.cards.find((card) => !card.ec_voided_at);

    useEffect(() => {
        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape" && !isSaving) onClose(false);
        }
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isSaving, onClose]);

    async function save(event: React.FormEvent) {
        event.preventDefault();
        const checked = employeeCardIssueSchema.safeParse(form);
        if (!checked.success) {
            setErrors(toFieldErrors(checked.error.issues));
            return;
        }
        setIsSaving(true);
        const { data, error } = await apiFetch<{ ec_seq: number }>(`/employees/${employee.emp_id}/cards`, {
            method: "POST",
            body: checked.data,
        });
        setIsSaving(false);
        if (error) {
            setErrors({ ...error.fields, form: error.message });
            return;
        }
        toast.success(`ออกบัตรใบที่ ${data.ec_seq} แล้ว · รอพิมพ์`);
        onClose(true);
    }

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
            <form
                role="dialog"
                aria-modal="true"
                aria-labelledby="issue-card-title"
                onSubmit={save}
                noValidate
                className="grid max-h-[90dvh] w-full max-w-2xl gap-4 overflow-y-auto rounded-t-2xl bg-white p-5 shadow-float sm:rounded-2xl sm:p-6"
            >
                <div className="grid gap-1">
                    <h2 id="issue-card-title" className="text-base font-medium text-gray-900">
                        ออกบัตรใหม่: {employee.emp_first_name_th} {employee.emp_last_name_th}
                    </h2>
                    <p className="text-sm text-gray-500">
                        รหัสพนักงานเดิม · ข้อมูลบนบัตรใช้ข้อมูลล่าสุด (ชื่อ ตำแหน่ง แผนก รูป)
                        {activeCard ? ` · บัตรใบที่ ${activeCard.ec_seq} ถูกยกเลิกทันที` : ""}
                        {activeCard?.ec_printed_at ? " ต้องเก็บคืน" : ""}
                    </p>
                </div>
                <fieldset className="grid gap-2">
                    <legend className="mb-1.5 text-sm text-gray-800">
                        เหตุผล<span className="ml-0.5 text-red-600">*</span>
                    </legend>
                    {MANUAL_REASONS.map((reason) => (
                        <label
                            key={reason}
                            className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-4 py-2.5 text-sm ${
                                form.ec_reason === reason ? "border-blue-500 bg-blue-50" : "border-gray-200"
                            }`}
                        >
                            <input
                                type="radio"
                                name="ec_reason"
                                value={reason}
                                checked={form.ec_reason === reason}
                                onChange={() => setForm((current) => ({ ...current, ec_reason: reason }))}
                                className="h-4 w-4"
                            />
                            {EMPLOYEE_CARD_REASONS[reason]}
                        </label>
                    ))}
                    <FieldHint error={errors.ec_reason}>
                        รูปใหม่ขึ้นบัตรที่ยังไม่ได้พิมพ์เองอยู่แล้ว · บัตรที่พิมพ์แล้วอยากได้รูปใหม่ ให้เลือก ข้อมูลบนบัตรเปลี่ยน
                    </FieldHint>
                </fieldset>
                <FormField label="หมายเหตุ" htmlFor="ec_note" error={errors.ec_note}>
                    <textarea
                        id="ec_note"
                        rows={2}
                        maxLength={500}
                        placeholder="เช่น แจ้งหายวันที่ 15 · เปลี่ยนนามสกุลหลังแต่งงาน"
                        value={form.ec_note}
                        onChange={(event) => setForm((current) => ({ ...current, ec_note: event.target.value }))}
                        className={inputClass(Boolean(errors.ec_note))}
                    />
                </FormField>
                {errors.form && <FieldHint error={errors.form} />}
                <div className="flex flex-wrap justify-end gap-2">
                    <button type="button" className={buttonClass("secondary", "md")} onClick={() => onClose(false)} disabled={isSaving}>
                        ไม่ทำ
                    </button>
                    <button type="submit" className={buttonClass("primary", "md")} disabled={isSaving}>
                        {isSaving ? "กำลังบันทึก..." : "ออกบัตรใหม่"}
                    </button>
                </div>
            </form>
        </div>
    );
}
