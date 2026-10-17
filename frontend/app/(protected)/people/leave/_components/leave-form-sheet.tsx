"use client";

// หน้าต่างขอลา/แก้ร่าง — บนมือถือเลื่อนขึ้นจากล่าง (CODING_GUIDELINES 5.1)
// บันทึกร่าง = สร้าง/แก้ → แนบไฟล์ที่เลือก · ส่งขออนุมัติ = บันทึกร่างแล้วส่งต่อทันที
// ตรวจด้วย leaveRequestSchema ชุดเดียวกับ backend ก่อนส่ง · จำนวนวันจริงคิดใน backend (ไม่นับวันหยุด)
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Paperclip, X } from "lucide-react";
import FormField, { inputClass } from "@/components/ui/form-field";
import FieldHint from "@/components/ui/guidance/field-hint";
import StatusBanner from "@/components/ui/guidance/status-banner";
import Segmented from "@/components/ui/segmented";
import { buttonClass } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { toFieldErrors, type FieldErrors } from "@/lib/form-errors";
import { leaveRequestSchema } from "@/lib/shared/schemas/leave.mjs";
import { HALF_DAY_LABEL, LEAVE_MESSAGES } from "../../_messages";
import type { HalfDay, LeaveBalance, LeaveRequest } from "../../_types";

type FormState = {
    lr_leave_type_id: string;
    lr_start_date: string;
    lr_end_date: string;
    lr_half_day: HalfDay;
    lr_reason: string;
};

function initialForm(request: LeaveRequest | null, today: string): FormState {
    if (!request) {
        return { lr_leave_type_id: "", lr_start_date: today, lr_end_date: today, lr_half_day: "none", lr_reason: "" };
    }
    return {
        lr_leave_type_id: String(request.lr_leave_type_id),
        lr_start_date: request.lr_start_date,
        lr_end_date: request.lr_end_date,
        lr_half_day: request.lr_half_day,
        lr_reason: request.lr_reason ?? "",
    };
}

export default function LeaveFormSheet({
    open,
    request,
    balances,
    today,
    onClose,
    onSaved,
}: {
    open: boolean;
    request: LeaveRequest | null;
    balances: LeaveBalance[];
    today: string;
    onClose: () => void;
    onSaved: () => Promise<void>;
}) {
    const [form, setForm] = useState<FormState>(() => initialForm(request, today));
    const [files, setFiles] = useState<File[]>([]);
    const [errors, setErrors] = useState<FieldErrors>({});
    const [bannerError, setBannerError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const fileInput = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!open) return;
        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") onClose();
        }
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [open, onClose]);

    if (!open) return null;

    const activeTypes = balances.filter(
        (balance) => balance.lt_status === "active" || balance.lt_id === request?.lr_leave_type_id,
    );
    const selectedType = activeTypes.find((balance) => String(balance.lt_id) === form.lr_leave_type_id);
    const isSingleDay = form.lr_start_date !== "" && form.lr_start_date === form.lr_end_date;

    function change<Key extends keyof FormState>(key: Key, value: FormState[Key]) {
        setForm((current) => {
            const next = { ...current, [key]: value };
            // เลื่อนวันเริ่มเลยวันสุดท้าย → วันสุดท้ายตาม · หลายวันแล้วครึ่งวันใช้ไม่ได้
            if (key === "lr_start_date" && next.lr_end_date < next.lr_start_date) next.lr_end_date = next.lr_start_date;
            if (next.lr_start_date !== next.lr_end_date) next.lr_half_day = "none";
            return next;
        });
    }

    // บันทึกร่าง + แนบไฟล์ — คืน id และเวอร์ชันล่าสุด (ใช้ส่งต่อ)
    async function saveDraft(): Promise<{ id: number } | null> {
        setBannerError(null);
        const payload = {
            lr_leave_type_id: Number(form.lr_leave_type_id) || 0,
            lr_start_date: form.lr_start_date,
            lr_end_date: form.lr_end_date,
            lr_half_day: form.lr_half_day,
            lr_reason: form.lr_reason,
        };
        const checked = leaveRequestSchema.safeParse(payload);
        if (!checked.success) {
            setErrors(toFieldErrors(checked.error.issues));
            return null;
        }
        setErrors({});
        const result = request
            ? await apiFetch<{ lr_id: number }>(`/leave/requests/${request.lr_id}`, {
                  method: "PUT",
                  body: { ...payload, lr_version: request.lr_version },
              })
            : await apiFetch<{ lr_id: number }>("/leave/requests", { method: "POST", body: payload });
        if (result.error) {
            setErrors(result.error.fields);
            setBannerError(result.error.message);
            return null;
        }
        const id = result.data.lr_id;
        for (const file of files) {
            const formData = new FormData();
            formData.append("file", file);
            const upload = await apiFetch(`/leave/requests/${id}/attachments`, { method: "POST", body: formData });
            if (upload.error) {
                setBannerError(`บันทึกร่างแล้ว แต่แนบ "${file.name}" ไม่สำเร็จ: ${upload.error.message}`);
                setFiles([]);
                await onSaved();
                return null;
            }
        }
        setFiles([]);
        return { id };
    }

    async function handleSaveDraft() {
        setIsSaving(true);
        const saved = await saveDraft();
        setIsSaving(false);
        if (!saved) return;
        toast.success("บันทึกร่างคำขอลาแล้ว");
        await onSaved();
        onClose();
    }

    async function handleSubmit() {
        setIsSaving(true);
        const saved = await saveDraft();
        if (!saved) {
            setIsSaving(false);
            return;
        }
        // เวอร์ชันเปลี่ยนหลังบันทึก — อ่านเวอร์ชันล่าสุดก่อนส่ง
        const { data: mine } = await apiFetch<{ requests: LeaveRequest[] }>(
            `/leave/me?year=${form.lr_start_date.slice(0, 4)}`,
        );
        const latest = mine?.requests.find((item) => item.lr_id === saved.id);
        const { error } = await apiFetch(`/leave/requests/${saved.id}/submit`, {
            method: "POST",
            body: { lr_version: latest?.lr_version ?? 0 },
        });
        setIsSaving(false);
        await onSaved();
        if (error) {
            setBannerError(`บันทึกเป็นร่างแล้ว แต่ยังส่งไม่ได้: ${error.message}`);
            return;
        }
        toast.success("ส่งคำขอลาแล้ว รอผู้อนุมัติ");
        onClose();
    }

    const attachmentHint = selectedType?.lt_attachment_from_days
        ? `${selectedType.lt_name_th}ตั้งแต่ ${Number(selectedType.lt_attachment_from_days)} วันต้องแนบไฟล์ (เช่น ใบรับรองแพทย์) · PDF/JPG/PNG ไม่เกิน 10 MB`
        : "ไม่บังคับ · PDF/JPG/PNG ไม่เกิน 10 MB · ผู้อนุมัติและฝ่ายบุคคลเท่านั้นที่เปิดได้";

    return (
        <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/40 backdrop-blur-sm sm:items-center sm:p-4"
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="leave-form-title"
                className="grid max-h-[92dvh] w-full max-w-lg gap-4 overflow-y-auto rounded-t-2xl bg-white p-5 shadow-float sm:rounded-2xl"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-3">
                    <h2 id="leave-form-title" className="text-base font-medium text-gray-900">
                        {request ? "แก้คำขอลา" : "ขอลา"}
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
                {bannerError && (
                    <StatusBanner tone="error" title="ยังไม่เสร็จ">
                        {bannerError}
                    </StatusBanner>
                )}

                <FormField label="ประเภทลา" htmlFor="lr_leave_type_id" required error={errors.lr_leave_type_id}>
                    <select
                        id="lr_leave_type_id"
                        value={form.lr_leave_type_id}
                        onChange={(event) => change("lr_leave_type_id", event.target.value)}
                        className={inputClass(Boolean(errors.lr_leave_type_id))}
                    >
                        <option value="">— เลือกประเภท —</option>
                        {activeTypes.map((balance) => (
                            <option key={balance.lt_id} value={balance.lt_id}>
                                {balance.lt_name_th}
                                {balance.remaining !== null ? ` (เหลือ ${Number(balance.remaining)} วัน)` : ""}
                                {balance.lt_is_paid ? "" : " · ไม่รับค่าจ้าง"}
                            </option>
                        ))}
                    </select>
                </FormField>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormField label="วันเริ่มลา" htmlFor="lr_start_date" required error={errors.lr_start_date}>
                        <input
                            id="lr_start_date"
                            type="date"
                            value={form.lr_start_date}
                            onChange={(event) => change("lr_start_date", event.target.value)}
                            className={inputClass(Boolean(errors.lr_start_date))}
                        />
                    </FormField>
                    <FormField label="วันสุดท้ายที่ลา" htmlFor="lr_end_date" required error={errors.lr_end_date}>
                        <input
                            id="lr_end_date"
                            type="date"
                            min={form.lr_start_date}
                            value={form.lr_end_date}
                            onChange={(event) => change("lr_end_date", event.target.value)}
                            className={inputClass(Boolean(errors.lr_end_date))}
                        />
                    </FormField>
                </div>

                {isSingleDay && (
                    <div className="grid gap-1.5">
                        <Segmented<HalfDay>
                            label="ช่วงเวลา"
                            value={form.lr_half_day}
                            onChange={(value) => change("lr_half_day", value)}
                            options={(["none", "morning", "afternoon"] as HalfDay[]).map((value) => ({
                                value,
                                label: HALF_DAY_LABEL[value],
                            }))}
                        />
                        <FieldHint error={errors.lr_half_day}>ครึ่งวัน = 0.5 วัน</FieldHint>
                    </div>
                )}

                <FormField
                    label="เหตุผล"
                    htmlFor="lr_reason"
                    error={errors.lr_reason}
                    hint="ไม่บังคับ · เห็นเฉพาะผู้อนุมัติและฝ่ายบุคคล (ปฏิทินทีมไม่แสดง)"
                >
                    <textarea
                        id="lr_reason"
                        rows={2}
                        maxLength={500}
                        value={form.lr_reason}
                        onChange={(event) => change("lr_reason", event.target.value)}
                        className={inputClass(Boolean(errors.lr_reason))}
                    />
                </FormField>

                <div className="grid gap-1.5">
                    <span className="text-sm text-gray-800">ไฟล์แนบ</span>
                    {request && request.attachments.length > 0 && (
                        <ul className="grid gap-1 text-sm text-gray-700">
                            {request.attachments.map((file) => (
                                <li key={file.lra_id} className="flex items-center gap-1.5">
                                    <Paperclip size={14} /> {file.lra_file_name}
                                </li>
                            ))}
                        </ul>
                    )}
                    {files.length > 0 && (
                        <ul className="grid gap-1 text-sm text-gray-700">
                            {files.map((file, index) => (
                                <li key={`${file.name}-${index}`} className="flex items-center justify-between gap-2">
                                    <span className="min-w-0 truncate">{file.name}</span>
                                    <button
                                        type="button"
                                        aria-label={`เอา ${file.name} ออก`}
                                        className="flex h-10 w-10 items-center justify-center text-red-600"
                                        onClick={() => setFiles((current) => current.filter((_, at) => at !== index))}
                                    >
                                        <X size={14} />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                    <input
                        ref={fileInput}
                        type="file"
                        accept="application/pdf,image/jpeg,image/png"
                        multiple
                        className="hidden"
                        onChange={(event) => {
                            const picked = Array.from(event.target.files ?? []);
                            setFiles((current) => [...current, ...picked]);
                            event.target.value = "";
                        }}
                    />
                    <button
                        type="button"
                        className={`${buttonClass("secondary", "sm")} justify-self-start`}
                        onClick={() => fileInput.current?.click()}
                    >
                        <Paperclip size={14} />
                        เลือกไฟล์
                    </button>
                    <FieldHint>{attachmentHint}</FieldHint>
                </div>

                <FieldHint>{LEAVE_MESSAGES.formRules}</FieldHint>

                <div className="flex flex-wrap justify-end gap-2">
                    <button
                        type="button"
                        className={buttonClass("secondary", "md")}
                        disabled={isSaving}
                        onClick={handleSaveDraft}
                    >
                        บันทึกร่าง
                    </button>
                    <button
                        type="button"
                        className={buttonClass("primary", "md")}
                        disabled={isSaving}
                        onClick={handleSubmit}
                    >
                        ส่งขออนุมัติ
                    </button>
                </div>
            </div>
        </div>
    );
}
