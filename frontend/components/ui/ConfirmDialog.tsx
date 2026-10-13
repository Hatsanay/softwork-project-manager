"use client";

// หน้าต่างยืนยัน (UI ใหม่ 13 ต.ค. 2026) — ไอคอนในกรอบสีอ่อน · บอกผลที่จะเกิดเป็นข้อๆ ได้ (consequences) · ปุ่มบอกการกระทำจริง
// จอมือถือเลื่อนขึ้นจากล่าง · ปิดได้ด้วย Esc หรือแตะนอกหน้าต่าง (ยกเว้นระหว่างทำรายการ)
import { useEffect, useId } from "react";
import { Check, Info, Trash2, TriangleAlert } from "lucide-react";
import { buttonClass } from "@/components/ui/button";

interface ConfirmDialogProps {
    open: boolean;
    title: string;
    description?: string;
    // ผลที่จะเกิดเมื่อกดยืนยัน (แบบที่ 5 ConsequenceDialog ใน docs/plans/2026-10-12-ui-guidance.md)
    consequences?: string[];
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: "danger" | "warning" | "info";
    loading?: boolean;
    loadingLabel?: string;
    // ทำรายการไม่สำเร็จ: แสดงเหตุผลค้างไว้ในหน้าต่างนี้ (ไม่ใช้ toast ที่หายเองก่อนอ่านทัน — docs/plans/2026-10-12-ui-guidance.md)
    // มีข้อความ = ซ่อนปุ่มยืนยัน เหลือปุ่มปิด เพราะกดซ้ำก็ไม่สำเร็จเหมือนเดิม
    errorMessage?: string | null;
    onConfirm: () => void;
    onCancel: () => void;
}

const VARIANT_STYLES = {
    danger: {
        Icon: Trash2,
        iconBox: "bg-red-50 text-red-600",
        confirmVariant: "danger" as const,
        defaultLoading: "กำลังลบ...",
    },
    warning: {
        Icon: TriangleAlert,
        iconBox: "bg-amber-50 text-amber-600",
        confirmVariant: "primary" as const,
        defaultLoading: "กำลังดำเนินการ...",
    },
    info: {
        Icon: Info,
        iconBox: "bg-blue-50 text-blue-600",
        confirmVariant: "primary" as const,
        defaultLoading: "กำลังดำเนินการ...",
    },
};

export default function ConfirmDialog({
    open,
    title,
    description,
    consequences,
    confirmLabel = "ยืนยัน",
    cancelLabel = "ยกเลิก",
    variant = "danger",
    loading = false,
    loadingLabel,
    errorMessage = null,
    onConfirm,
    onCancel,
}: ConfirmDialogProps) {
    const titleId = useId();

    useEffect(() => {
        if (!open) return;
        function closeOnEscape(event: KeyboardEvent) {
            if (event.key === "Escape" && !loading) onCancel();
        }
        document.addEventListener("keydown", closeOnEscape);
        return () => document.removeEventListener("keydown", closeOnEscape);
    }, [open, loading, onCancel]);

    if (!open) return null;

    const { Icon, iconBox, confirmVariant, defaultLoading } = VARIANT_STYLES[variant];

    return (
        <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/35 backdrop-blur-sm sm:items-center sm:p-4"
            onClick={() => !loading && onCancel()}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="grid w-full gap-5 rounded-t-3xl bg-white p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] shadow-float sm:max-w-md sm:rounded-3xl sm:pb-6"
                onClick={(event) => event.stopPropagation()}
            >
                <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${iconBox}`}>
                    <Icon size={22} />
                </span>

                <div className="grid gap-1.5">
                    <h2 id={titleId} className="text-lg font-medium text-gray-900">
                        {title}
                    </h2>
                    {description && <p className="text-sm text-gray-500">{description}</p>}
                </div>

                {consequences && consequences.length > 0 && (
                    <ul className="grid gap-2 rounded-2xl bg-gray-50 px-4 py-3.5 text-sm text-gray-600">
                        {consequences.map((consequence) => (
                            <li key={consequence} className="flex gap-2.5">
                                <Check size={15} className="mt-0.5 shrink-0 text-gray-400" />
                                {consequence}
                            </li>
                        ))}
                    </ul>
                )}

                {errorMessage && (
                    <div
                        role="alert"
                        className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                    >
                        {errorMessage}
                    </div>
                )}

                <div className={`grid gap-2.5 ${errorMessage ? "" : "sm:grid-cols-2"}`}>
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={loading}
                        className={buttonClass("secondary", "md")}
                    >
                        {errorMessage ? "ปิด" : cancelLabel}
                    </button>
                    {!errorMessage && (
                        <button
                            type="button"
                            onClick={onConfirm}
                            disabled={loading}
                            className={buttonClass(confirmVariant, "md")}
                        >
                            {loading ? (loadingLabel ?? defaultLoading) : confirmLabel}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
