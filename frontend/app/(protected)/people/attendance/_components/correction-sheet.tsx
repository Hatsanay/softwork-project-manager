"use client";

// แผ่นขอแก้เวลา (ลงเวลา A-2 · 2026-10-24) — มือถือเลื่อนขึ้นจากล่าง (CODING_GUIDELINES 5.1)
// เปิดจากวันที่ "ไม่ครบ/ขาด" ในสรุปเดือน = เติมวันที่และชนิดที่ขาดให้แล้ว (เข้ายังไม่มี → เข้างาน · มีเข้าแล้ว → ออกงาน)
// ตรวจด้วย correctionSchema ชุดเดียวกับ backend · เวลาเต็ม/กะข้ามคืน/ไม่เกินตอนนี้ ตรวจใน backend
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import FormField, { inputClass } from "@/components/ui/form-field";
import FieldHint from "@/components/ui/guidance/field-hint";
import StatusBanner from "@/components/ui/guidance/status-banner";
import Segmented from "@/components/ui/segmented";
import { buttonClass } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { toFieldErrors, type FieldErrors } from "@/lib/form-errors";
import { correctionSchema } from "@/lib/shared/schemas/attendance.mjs";
import { CORRECTION_MESSAGES } from "../../_messages";

export type CorrectionDefaults = { ac_work_date: string; ac_type: "in" | "out"; ac_time: string };

export default function CorrectionSheet({
    defaults,
    today,
    onClose,
    onSaved,
}: {
    defaults: CorrectionDefaults;
    today: string;
    onClose: () => void;
    onSaved: () => Promise<void>;
}) {
    const [form, setForm] = useState({ ...defaults, ac_reason: "" });
    const [errors, setErrors] = useState<FieldErrors>({});
    const [bannerError, setBannerError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") onClose();
        }
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [onClose]);

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        setBannerError(null);
        const checked = correctionSchema.safeParse(form);
        if (!checked.success) {
            setErrors(toFieldErrors(checked.error.issues));
            return;
        }
        setErrors({});
        setIsSaving(true);
        const { error } = await apiFetch("/attendance/corrections", { method: "POST", body: checked.data });
        setIsSaving(false);
        if (error) {
            setErrors(error.fields);
            if (Object.keys(error.fields).length === 0) setBannerError(error.message);
            return;
        }
        toast.success("ส่งคำขอแก้เวลาแล้ว รอผู้อนุมัติ");
        await onSaved();
        onClose();
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/40 backdrop-blur-sm sm:items-center sm:p-4"
            onClick={onClose}
        >
            <form
                role="dialog"
                aria-modal="true"
                aria-labelledby="correction-title"
                noValidate
                onSubmit={submit}
                onClick={(event) => event.stopPropagation()}
                className="grid max-h-[92dvh] w-full max-w-3xl gap-4 overflow-y-auto rounded-t-2xl bg-white p-5 sm:p-6 shadow-float sm:rounded-2xl"
            >
                <div className="flex items-start justify-between gap-3">
                    <h2 id="correction-title" className="text-base font-medium text-gray-900">
                        ขอแก้เวลา
                    </h2>
                    <button
                        type="button"
                        aria-label="ปิด"
                        className="-m-2 flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
                        onClick={onClose}
                    >
                        <X size={18} />
                    </button>
                </div>
                <FieldHint>{CORRECTION_MESSAGES.request}</FieldHint>
                {bannerError && (
                    <StatusBanner tone="error" title="ส่งคำขอไม่สำเร็จ">
                        {bannerError}
                    </StatusBanner>
                )}

                <div className="grid gap-1.5">
                    <Segmented<"in" | "out">
                        label="ขอแก้เวลา"
                        value={form.ac_type}
                        onChange={(value) => setForm((current) => ({ ...current, ac_type: value }))}
                        options={[
                            { value: "in", label: "เวลาเข้างาน" },
                            { value: "out", label: "เวลาออกงาน" },
                        ]}
                    />
                    <FieldHint error={errors.ac_type} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <FormField label="วันที่" htmlFor="ac_work_date" required error={errors.ac_work_date}>
                        <input
                            id="ac_work_date"
                            type="date"
                            max={today}
                            value={form.ac_work_date}
                            onChange={(event) => setForm((current) => ({ ...current, ac_work_date: event.target.value }))}
                            className={inputClass(Boolean(errors.ac_work_date))}
                        />
                    </FormField>
                    <FormField label="เวลา" htmlFor="ac_time" required error={errors.ac_time}>
                        <input
                            id="ac_time"
                            type="time"
                            value={form.ac_time}
                            onChange={(event) => setForm((current) => ({ ...current, ac_time: event.target.value }))}
                            className={inputClass(Boolean(errors.ac_time))}
                        />
                    </FormField>
                </div>
                <FormField label="เหตุผล" htmlFor="ac_reason" required error={errors.ac_reason}>
                    <textarea
                        id="ac_reason"
                        rows={2}
                        maxLength={500}
                        value={form.ac_reason}
                        placeholder="เช่น ลืมกดตอนเข้างาน แบตมือถือหมด"
                        onChange={(event) => setForm((current) => ({ ...current, ac_reason: event.target.value }))}
                        className={inputClass(Boolean(errors.ac_reason))}
                    />
                </FormField>

                <div className="flex flex-wrap justify-end gap-2">
                    <button type="button" className={buttonClass("secondary", "md")} onClick={onClose}>
                        ยกเลิก
                    </button>
                    <button type="submit" className={buttonClass("primary", "md")} disabled={isSaving}>
                        {isSaving ? "กำลังส่ง..." : "ส่งคำขอ"}
                    </button>
                </div>
            </form>
        </div>
    );
}
