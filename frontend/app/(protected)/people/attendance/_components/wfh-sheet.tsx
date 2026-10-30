"use client";

// แผ่นขอ WFH รายวัน (2026-10-24) — มือถือเลื่อนขึ้นจากล่าง (CODING_GUIDELINES 5.1)
// เติมวันที่ให้แล้ว = วันทำงานถัดไปที่ยังไม่ใช่วัน WFH · ตรวจด้วย wfhRequestSchema ชุดเดียวกับ backend
// วันหยุดของกะ/วัน WFH ประจำ/ขอซ้ำ/ปิดรอบเงินเดือน ตรวจใน backend
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import FormField, { inputClass } from "@/components/ui/form-field";
import FieldHint from "@/components/ui/guidance/field-hint";
import StatusBanner from "@/components/ui/guidance/status-banner";
import { buttonClass } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { toFieldErrors, type FieldErrors } from "@/lib/form-errors";
import { wfhRequestSchema } from "@/lib/shared/schemas/attendance.mjs";
import { WFH_MESSAGES } from "../../_messages";

export default function WfhSheet({
    defaultDate,
    today,
    onClose,
    onSaved,
}: {
    defaultDate: string;
    today: string;
    onClose: () => void;
    onSaved: () => Promise<void>;
}) {
    const [form, setForm] = useState({ wfh_date: defaultDate, wfh_reason: "" });
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
        const checked = wfhRequestSchema.safeParse(form);
        if (!checked.success) {
            setErrors(toFieldErrors(checked.error.issues));
            return;
        }
        setErrors({});
        setIsSaving(true);
        const { error } = await apiFetch("/attendance/wfh", { method: "POST", body: checked.data });
        setIsSaving(false);
        if (error) {
            setErrors(error.fields);
            if (Object.keys(error.fields).length === 0) setBannerError(error.message);
            return;
        }
        toast.success("ส่งคำขอ WFH แล้ว รอผู้อนุมัติ");
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
                aria-labelledby="wfh-title"
                noValidate
                onSubmit={submit}
                onClick={(event) => event.stopPropagation()}
                className="grid max-h-[92dvh] w-full max-w-3xl gap-4 overflow-y-auto rounded-t-2xl bg-white p-5 sm:p-6 shadow-float sm:rounded-2xl"
            >
                <div className="flex items-start justify-between gap-3">
                    <h2 id="wfh-title" className="text-base font-medium text-gray-900">
                        ขอทำงานที่บ้าน (WFH)
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
                <FieldHint>{WFH_MESSAGES.request}</FieldHint>
                {bannerError && (
                    <StatusBanner tone="error" title="ส่งคำขอไม่สำเร็จ">
                        {bannerError}
                    </StatusBanner>
                )}

                <FormField label="วันที่" htmlFor="wfh_date" required error={errors.wfh_date}>
                    <input
                        id="wfh_date"
                        type="date"
                        min={today}
                        value={form.wfh_date}
                        onChange={(event) => setForm((current) => ({ ...current, wfh_date: event.target.value }))}
                        className={inputClass(Boolean(errors.wfh_date))}
                    />
                </FormField>
                <FormField label="เหตุผล" htmlFor="wfh_reason" required error={errors.wfh_reason}>
                    <textarea
                        id="wfh_reason"
                        rows={2}
                        maxLength={500}
                        value={form.wfh_reason}
                        placeholder="เช่น รอช่างมาซ่อมที่บ้าน ทำงานเอกสารต่อเนื่อง"
                        onChange={(event) => setForm((current) => ({ ...current, wfh_reason: event.target.value }))}
                        className={inputClass(Boolean(errors.wfh_reason))}
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
