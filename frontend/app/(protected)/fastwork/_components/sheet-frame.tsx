"use client";

// กรอบแผ่นทำรายการของหน้า Fastwork (ส่วนแบ่ง/เงินทุน) — มือถือเลื่อนขึ้นจากล่าง จอคอมอยู่กลางจอ · Esc หรือแตะนอกแผ่นเพื่อปิด
// ปุ่มยกเลิก/บันทึก · ตัวเลือกบัญชีธนาคาร · ส่งคำขอแล้วแสดงข้อผิดพลาดใต้ช่อง (หรือแถบบนแผ่นถ้าไม่ใช่ของช่องไหน)
import { useEffect } from "react";
import { X } from "lucide-react";
import FormField, { inputClass } from "@/components/ui/form-field";
import { buttonClass } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import type { FieldErrors } from "@/lib/form-errors";
import type { BankAccountChoice } from "../_types";

type SheetFrameProps = {
    titleId: string;
    title: string;
    subtitle: string;
    onClose: () => void;
    onSubmit: (event: React.FormEvent) => void;
    children: React.ReactNode;
};

export function SheetFrame({ titleId, title, subtitle, onClose, onSubmit, children }: SheetFrameProps) {
    useEffect(() => {
        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") onClose();
        }
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/40 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
            <form
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                noValidate
                onSubmit={onSubmit}
                onClick={(event) => event.stopPropagation()}
                className="grid max-h-[92dvh] w-full max-w-3xl gap-4 overflow-y-auto rounded-t-2xl bg-white p-5 sm:p-6 shadow-float sm:rounded-2xl"
            >
                <div className="flex items-start justify-between gap-3">
                    <div className="grid gap-0.5">
                        <h2 id={titleId} className="text-base font-medium text-gray-900">
                            {title}
                        </h2>
                        <p className="text-sm text-gray-500">{subtitle}</p>
                    </div>
                    <button
                        type="button"
                        aria-label="ปิด"
                        className="-m-2 flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
                        onClick={onClose}
                    >
                        <X size={18} />
                    </button>
                </div>
                {children}
            </form>
        </div>
    );
}

export function BankSelect({
    id,
    label,
    value,
    accounts,
    error,
    onChange,
}: {
    id: string;
    label: string;
    value: string;
    accounts: BankAccountChoice[];
    error?: string;
    onChange: (value: string) => void;
}) {
    return (
        <FormField label={label} htmlFor={id} required error={error}>
            <select id={id} value={value} onChange={(event) => onChange(event.target.value)} className={inputClass(Boolean(error))}>
                <option value="">เลือกบัญชี</option>
                {accounts.map((account) => (
                    <option key={account.ba_id} value={account.ba_id}>
                        {account.ba_bank_name} {account.ba_account_no}
                    </option>
                ))}
            </select>
        </FormField>
    );
}

export function SheetButtons({ isSaving, submitLabel, isDisabled = false, onClose }: { isSaving: boolean; submitLabel: string; isDisabled?: boolean; onClose: () => void }) {
    return (
        <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className={buttonClass("secondary", "md")} onClick={onClose}>
                ยกเลิก
            </button>
            <button type="submit" className={buttonClass("primary", "md")} disabled={isSaving || isDisabled}>
                {isSaving ? "กำลังบันทึก..." : submitLabel}
            </button>
        </div>
    );
}

/** ส่งคำขอแล้วจัดการข้อผิดพลาดแบบเดียวกันทุกแผ่น · คืน true เมื่อสำเร็จ */
export async function sendRequest(
    path: string,
    body: unknown,
    setErrors: (errors: FieldErrors) => void,
    setBannerError: (message: string | null) => void,
    method: "POST" | "PUT" = "POST",
) {
    const { error } = await apiFetch(path, { method, body });
    if (!error) return true;
    setErrors(error.fields);
    if (Object.keys(error.fields).length === 0) setBannerError(error.message);
    return false;
}
