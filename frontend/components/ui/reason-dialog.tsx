"use client";

// หน้าต่างยืนยันที่ต้องกรอกเหตุผล (ตีกลับ / ลูกค้าปฏิเสธ / ยกเลิก) — เหตุผลบันทึกไว้ในประวัติให้คนอื่นเห็น
// ใช้หน้าตาเดียวกับ ConfirmDialog (กล่องกลางจอ, มือถือเป็นแผ่นจากล่าง) · Esc ปิด · ข้อผิดพลาดค้างไว้ในหน้าต่าง
import { useEffect, useId, useState } from "react";
import { buttonClass } from "@/components/ui/button";
import { inputClass } from "@/components/ui/form-field";
import FieldHint from "@/components/ui/guidance/field-hint";

type ReasonDialogProps = {
    open: boolean;
    title: string;
    description?: string;
    reasonLabel?: string;
    reasonHint?: string;
    confirmLabel: string;
    tone?: "danger" | "primary";
    loading?: boolean;
    errorMessage?: string | null;
    onConfirm: (reason: string) => void;
    onCancel: () => void;
};

export default function ReasonDialog({
    open,
    title,
    description,
    reasonLabel = "เหตุผล",
    reasonHint,
    confirmLabel,
    tone = "danger",
    loading = false,
    errorMessage,
    onConfirm,
    onCancel,
}: ReasonDialogProps) {
    const [reason, setReason] = useState("");
    const [showRequired, setShowRequired] = useState(false);
    const fieldId = useId();

    useEffect(() => {
        if (!open) return;
        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape" && !loading) onCancel();
        }
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [open, loading, onCancel]);

    if (!open) return null;

    function handleSubmit(event: React.FormEvent) {
        event.preventDefault();
        if (!reason.trim()) {
            setShowRequired(true);
            return;
        }
        onConfirm(reason.trim());
    }

    function close() {
        setReason("");
        setShowRequired(false);
        onCancel();
    }

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
            <form
                role="dialog"
                aria-modal="true"
                aria-labelledby={`${fieldId}-title`}
                onSubmit={handleSubmit}
                className="grid max-h-[90dvh] w-full max-w-md gap-4 overflow-y-auto rounded-t-2xl bg-white p-5 shadow-float sm:rounded-2xl sm:p-6"
            >
                <div className="grid gap-1">
                    <h2 id={`${fieldId}-title`} className="text-base font-medium text-gray-900">
                        {title}
                    </h2>
                    {description && <p className="text-sm text-gray-500">{description}</p>}
                </div>
                <div className="grid gap-1.5">
                    <label htmlFor={fieldId} className="text-sm text-gray-800">
                        {reasonLabel}
                        <span className="ml-0.5 text-red-600">*</span>
                    </label>
                    <textarea
                        id={fieldId}
                        rows={3}
                        autoFocus
                        maxLength={500}
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        className={inputClass(showRequired && !reason.trim())}
                    />
                    <FieldHint error={showRequired && !reason.trim() ? "กรุณากรอกเหตุผล" : errorMessage}>
                        {reasonHint}
                    </FieldHint>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                    <button type="button" className={buttonClass("secondary", "md")} onClick={close} disabled={loading}>
                        ไม่ทำ
                    </button>
                    <button
                        type="submit"
                        className={buttonClass(tone === "danger" ? "danger" : "primary", "md")}
                        disabled={loading}
                    >
                        {loading ? "กำลังบันทึก..." : confirmLabel}
                    </button>
                </div>
            </form>
        </div>
    );
}
