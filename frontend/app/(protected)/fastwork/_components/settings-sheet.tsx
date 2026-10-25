"use client";

// ตั้งอัตราค่าธรรมเนียม Fastwork (2026-10-24 · P-1) — ค่าเริ่มต้นตอนบันทึกเงิน · แก้ได้ทุกรายการ · ไม่กระทบรายการเดิม
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import FormField, { inputClass } from "@/components/ui/form-field";
import StatusBanner from "@/components/ui/guidance/status-banner";
import { buttonClass } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { toFieldErrors, type FieldErrors } from "@/lib/form-errors";
import { fastworkSettingsSchema } from "@/lib/shared/schemas/fastwork.mjs";
import type { FastworkSettings } from "../_types";
import { FASTWORK_MESSAGES } from "../_messages";

const FIELDS: { key: keyof FastworkSettings; label: string; hint: string }[] = [
    { key: "cs_fastwork_fee_rate", label: "ค่าธรรมเนียม Fastwork (% ของราคางวด)", hint: FASTWORK_MESSAGES.feeRate },
    { key: "cs_fastwork_fee_vat_rate", label: "VAT ของค่าธรรมเนียม (% ของค่าธรรมเนียม)", hint: "ใบเสร็จค่าธรรมเนียมของ Fastwork มี VAT แยกให้ใส่ 7 · ไม่มีใส่ 0" },
    { key: "cs_fastwork_wht_rate", label: "หัก ณ ที่จ่าย (% ของราคางวด)", hint: FASTWORK_MESSAGES.whtRate },
];

export default function FastworkSettingsSheet({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> }) {
    const [form, setForm] = useState<FastworkSettings | null>(null);
    const [errors, setErrors] = useState<FieldErrors>({});
    const [bannerError, setBannerError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        let isClosed = false;
        apiFetch<FastworkSettings>("/fastwork/settings").then(({ data, error }) => {
            if (isClosed) return;
            if (error) setBannerError(error.message);
            if (data) setForm(data);
        });
        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") onClose();
        }
        window.addEventListener("keydown", handleKeyDown);
        return () => {
            isClosed = true;
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [onClose]);

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        if (!form) return;
        setBannerError(null);
        const checked = fastworkSettingsSchema.safeParse(form);
        if (!checked.success) {
            setErrors(toFieldErrors(checked.error.issues));
            return;
        }
        setErrors({});
        setIsSaving(true);
        const { error } = await apiFetch("/fastwork/settings", { method: "PUT", body: checked.data });
        setIsSaving(false);
        if (error) {
            setErrors(error.fields);
            if (Object.keys(error.fields).length === 0) setBannerError(error.message);
            return;
        }
        toast.success("บันทึกอัตราค่าธรรมเนียมแล้ว");
        await onSaved();
        onClose();
    }

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/40 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
            <form
                role="dialog"
                aria-modal="true"
                aria-labelledby="fastwork-settings-title"
                noValidate
                onSubmit={submit}
                onClick={(event) => event.stopPropagation()}
                className="grid max-h-[92dvh] w-full max-w-lg gap-4 overflow-y-auto rounded-t-2xl bg-white p-5 shadow-float sm:rounded-2xl"
            >
                <div className="flex items-start justify-between gap-3">
                    <h2 id="fastwork-settings-title" className="text-base font-medium text-gray-900">
                        อัตราเริ่มต้นของเงินจาก Fastwork
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
                    <StatusBanner tone="error" title="บันทึกไม่สำเร็จ">
                        {bannerError}
                    </StatusBanner>
                )}
                {!form && !bannerError && <p className="text-sm text-gray-500">กำลังโหลด...</p>}
                {form &&
                    FIELDS.map((field) => (
                        <FormField key={field.key} label={field.label} htmlFor={field.key} required hint={field.hint} error={errors[field.key]}>
                            <input
                                id={field.key}
                                inputMode="decimal"
                                value={form[field.key]}
                                onChange={(event) => setForm((current) => (current ? { ...current, [field.key]: event.target.value } : current))}
                                className={inputClass(Boolean(errors[field.key]))}
                            />
                        </FormField>
                    ))}
                <div className="flex flex-wrap justify-end gap-2">
                    <button type="button" className={buttonClass("secondary", "md")} onClick={onClose}>
                        ยกเลิก
                    </button>
                    <button type="submit" className={buttonClass("primary", "md")} disabled={isSaving || !form}>
                        {isSaving ? "กำลังบันทึก..." : "บันทึก"}
                    </button>
                </div>
            </form>
        </div>
    );
}
