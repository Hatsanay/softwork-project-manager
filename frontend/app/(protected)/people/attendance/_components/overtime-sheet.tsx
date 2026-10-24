"use client";

// แผ่นขอ OT (ลงเวลา A-3 · 2026-10-24) — มือถือเลื่อนขึ้นจากล่าง
// เลือกวัน/เวลาแล้วเห็นทันที (GET /attendance/overtime/preview): ชนิด OT · อัตรา · ใช้ไปในสัปดาห์เทียบเพดาน
// error ของช่วงเวลา (ทับเวลางาน/ทับ OT อื่น/ลาเต็มวัน) ขึ้นใต้ช่องตั้งแต่ก่อนกดส่ง
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import FormField, { inputClass } from "@/components/ui/form-field";
import FieldHint from "@/components/ui/guidance/field-hint";
import StatusBanner from "@/components/ui/guidance/status-banner";
import { buttonClass } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { toFieldErrors, type FieldErrors } from "@/lib/form-errors";
import { overtimeSchema } from "@/lib/shared/schemas/attendance.mjs";
import { isRealDateText } from "@/lib/shared/schemas/common.mjs";
import { OVERTIME_MESSAGES } from "../../_messages";
import type { OvertimePreview } from "../../_types";
import { durationText } from "../../_time-text";

export type OvertimeDefaults = { ot_work_date: string; ot_start_time: string; ot_end_time: string };

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "18:00" + 120 นาที → "20:00" (วนรอบเที่ยงคืน) */
export function addMinutesToTime(timeText: string, minutes: number) {
    const [hours, rest] = timeText.split(":").map(Number);
    const total = (((hours * 60 + rest + minutes) % 1440) + 1440) % 1440;
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export default function OvertimeSheet({
    defaults,
    onClose,
    onSaved,
}: {
    defaults: OvertimeDefaults;
    onClose: () => void;
    onSaved: () => Promise<void>;
}) {
    const [form, setForm] = useState({ ...defaults, ot_reason: "" });
    const [errors, setErrors] = useState<FieldErrors>({});
    const [bannerError, setBannerError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [preview, setPreview] = useState<{ query: string; data: OvertimePreview | null; fields: FieldErrors } | null>(null);

    useEffect(() => {
        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") onClose();
        }
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [onClose]);

    // ตัวอย่าง: ช่องครบแล้วถามเซิร์ฟเวอร์ (รอพิมพ์เสร็จ 300 ms) · ผลเก่าที่ไม่ตรงค่าปัจจุบันไม่แสดง
    const isReady =
        isRealDateText(form.ot_work_date) && TIME_PATTERN.test(form.ot_start_time) && TIME_PATTERN.test(form.ot_end_time);
    const previewQuery = isReady
        ? new URLSearchParams({
              ot_work_date: form.ot_work_date,
              ot_start_time: form.ot_start_time,
              ot_end_time: form.ot_end_time,
          }).toString()
        : null;

    useEffect(() => {
        if (!previewQuery) return;
        let isCancelled = false;
        const timer = setTimeout(async () => {
            const { data, error } = await apiFetch<OvertimePreview>(`/attendance/overtime/preview?${previewQuery}`);
            if (isCancelled) return;
            setPreview({ query: previewQuery, data, fields: error?.fields ?? {} });
        }, 300);
        return () => {
            isCancelled = true;
            clearTimeout(timer);
        };
    }, [previewQuery]);
    const current = preview?.query === previewQuery ? preview : null;
    const shownErrors = { ...(current?.fields ?? {}), ...errors };

    function update(field: keyof typeof form, value: string) {
        setForm((existing) => ({ ...existing, [field]: value }));
        // แก้ช่องไหน error ที่ส่งมาจากการกดส่งของช่องนั้นหาย
        setErrors((existing) => {
            const next = { ...existing };
            delete next[field];
            return next;
        });
    }

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        setBannerError(null);
        const checked = overtimeSchema.safeParse(form);
        if (!checked.success) {
            setErrors(toFieldErrors(checked.error.issues));
            return;
        }
        setIsSaving(true);
        const { error } = await apiFetch("/attendance/overtime", { method: "POST", body: checked.data });
        setIsSaving(false);
        if (error) {
            setErrors(error.fields);
            if (Object.keys(error.fields).length === 0) setBannerError(error.message);
            return;
        }
        toast.success("ส่งคำขอ OT แล้ว รอผู้อนุมัติ");
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
                aria-labelledby="overtime-title"
                noValidate
                onSubmit={submit}
                onClick={(event) => event.stopPropagation()}
                className="grid max-h-[92dvh] w-full max-w-lg gap-4 overflow-y-auto rounded-t-2xl bg-white p-5 shadow-float sm:rounded-2xl"
            >
                <div className="flex items-start justify-between gap-3">
                    <h2 id="overtime-title" className="text-base font-medium text-gray-900">
                        ขอ OT
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
                <FieldHint>{OVERTIME_MESSAGES.request}</FieldHint>
                {bannerError && (
                    <StatusBanner tone="error" title="ส่งคำขอไม่สำเร็จ">
                        {bannerError}
                    </StatusBanner>
                )}

                <FormField label="วันที่" htmlFor="ot_work_date" required error={shownErrors.ot_work_date}>
                    <input
                        id="ot_work_date"
                        type="date"
                        value={form.ot_work_date}
                        onChange={(event) => update("ot_work_date", event.target.value)}
                        className={inputClass(Boolean(shownErrors.ot_work_date))}
                    />
                </FormField>
                <div className="grid grid-cols-2 gap-3">
                    <FormField label="เริ่ม" htmlFor="ot_start_time" required error={shownErrors.ot_start_time}>
                        <input
                            id="ot_start_time"
                            type="time"
                            step={900}
                            value={form.ot_start_time}
                            onChange={(event) => update("ot_start_time", event.target.value)}
                            className={inputClass(Boolean(shownErrors.ot_start_time))}
                        />
                    </FormField>
                    <FormField
                        label="เลิก"
                        htmlFor="ot_end_time"
                        required
                        hint={form.ot_end_time <= form.ot_start_time ? "เลิกวันถัดไป" : undefined}
                        error={shownErrors.ot_end_time}
                    >
                        <input
                            id="ot_end_time"
                            type="time"
                            step={900}
                            value={form.ot_end_time}
                            onChange={(event) => update("ot_end_time", event.target.value)}
                            className={inputClass(Boolean(shownErrors.ot_end_time))}
                        />
                    </FormField>
                </div>

                {current?.data && <OvertimePreviewBox preview={current.data} />}

                <FormField label="เหตุผล/งานที่ทำ" htmlFor="ot_reason" required error={errors.ot_reason}>
                    <textarea
                        id="ot_reason"
                        rows={2}
                        maxLength={500}
                        value={form.ot_reason}
                        placeholder="เช่น ปิดงานส่งลูกค้า ABC"
                        onChange={(event) => update("ot_reason", event.target.value)}
                        className={inputClass(Boolean(errors.ot_reason))}
                    />
                </FormField>

                <div className="flex flex-wrap justify-end gap-2">
                    <button type="button" className={buttonClass("secondary", "md")} onClick={onClose}>
                        ยกเลิก
                    </button>
                    <button
                        type="submit"
                        className={buttonClass("primary", "md")}
                        disabled={isSaving || Boolean(current?.data?.is_over_cap)}
                    >
                        {isSaving ? "กำลังส่ง..." : "ส่งคำขอ"}
                    </button>
                </div>
            </form>
        </div>
    );
}

// กล่องตัวอย่าง: ชนิดและอัตรา · ใช้ไปในสัปดาห์ → หลังขอ เทียบเพดาน
function OvertimePreviewBox({ preview }: { preview: OvertimePreview }) {
    const lines: string[] = [];
    if (preview.workday_minutes > 0) lines.push(`OT วันทำงาน ${durationText(preview.workday_minutes)} × ${Number(preview.rates.workday)} เท่า`);
    if (preview.holiday_work_minutes > 0) {
        lines.push(`ทำงานวันหยุดในเวลาปกติ ${durationText(preview.holiday_work_minutes)} จ่ายเพิ่ม ${Number(preview.rates.holiday_work)} เท่า`);
    }
    if (preview.holiday_ot_minutes > 0) lines.push(`OT วันหยุด ${durationText(preview.holiday_ot_minutes)} × ${Number(preview.rates.holiday_ot)} เท่า`);
    const capHours = preview.week.cap_minutes / 60;

    return (
        <div className="grid gap-1.5 rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-sm text-gray-700">
            <span className="font-medium text-gray-900">
                {preview.is_off_day ? `วันหยุด${preview.holiday_name ? ` (${preview.holiday_name})` : ""}` : "วันทำงาน"} · รวม{" "}
                {durationText(preview.total_minutes)}
            </span>
            {lines.map((line) => (
                <span key={line} className="tabular-nums">
                    {line}
                </span>
            ))}
            <span className={`text-xs tabular-nums ${preview.is_over_cap ? "text-red-600" : "text-gray-600"}`}>
                สัปดาห์นี้ OT ใช้ไป {durationText(preview.week.used_minutes)} (รวมที่รออนุมัติ) · หลังขอ{" "}
                {durationText(preview.week.after_minutes)} จาก {capHours} ชม.
                {preview.is_over_cap ? " · เกินเพดาน ส่งไม่ได้" : ""}
            </span>
            {preview.is_after_the_fact && <span className="text-xs text-amber-700">ขอหลังเวลาเริ่มแล้ว · ผู้อนุมัติจะเห็นว่าขอย้อนหลัง</span>}
        </div>
    );
}
