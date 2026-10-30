"use client";

// แผงแก้ไขด้านขวาใช้ร่วมกันทั้งระบบ (เริ่มที่หน้าสินค้า 2026-10-30 · ย้ายมา components/ui ตอน B4): จอคอมเลื่อนออกจากขวาเต็มความสูง · มือถือเต็มจอ
// หัว (ชื่อ + ปุ่มปิด) และท้าย (ปุ่มบันทึก) อยู่กับที่ เนื้อหาเลื่อนในแผง · รายการด้านหลังยังอยู่ที่เดิม ไม่ต้องเลื่อนกลับ
// มีการแก้ค้าง: ปุ่มปิด / Esc / แตะนอกแผง / ออกจากหน้า ถามก่อนทิ้ง
import { useEffect, useId } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { useLeaveWarning } from "@/components/ui/unsaved-bar";

const DISCARD_MESSAGE = "มีการแก้ไขที่ยังไม่บันทึก ปิดแล้วสิ่งที่แก้จะหายไป ต้องการปิดไหม?";

/** ถามก่อนทิ้งการแก้ค้าง · คืน true = ทิ้งได้ */
export function confirmDiscard(isDirty: boolean) {
    return !isDirty || window.confirm(DISCARD_MESSAGE);
}

export default function EditorDrawer({
    title,
    subtitle,
    size = "md",
    isDirty,
    onClose,
    onSubmit,
    footer,
    children,
}: {
    title: string;
    subtitle?: string;
    // md = ฟอร์มสินค้า · lg = ชุดรายการ (แถวรายการต้องการที่กว้าง)
    size?: "md" | "lg";
    isDirty: boolean;
    onClose: () => void;
    onSubmit: (event: React.FormEvent) => void;
    footer: React.ReactNode;
    children: React.ReactNode;
}) {
    const titleId = useId();
    useLeaveWarning(isDirty);

    useEffect(() => {
        function handleKeyDown(event: KeyboardEvent) {
            if (event.key !== "Escape" || event.defaultPrevented) return;
            if (confirmDiscard(isDirty)) onClose();
        }
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isDirty, onClose]);

    // หน้าหลังไม่เลื่อนตามตอนเลื่อนในแผง
    useEffect(() => {
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, []);

    function requestClose() {
        if (confirmDiscard(isDirty)) onClose();
    }

    return createPortal(
        <div
            className="fixed inset-0 z-50 flex justify-end bg-gray-900/40 backdrop-blur-sm"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) requestClose();
            }}
        >
            <form
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                noValidate
                onSubmit={onSubmit}
                className={`flex h-dvh w-full flex-col bg-gray-50 shadow-float sm:rounded-l-2xl ${size === "lg" ? "sm:max-w-6xl" : "sm:max-w-2xl"}`}
            >
                <header className="flex items-start justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3.5 sm:rounded-tl-2xl sm:px-6">
                    <div className="grid min-w-0 gap-0.5">
                        <h2 id={titleId} className="text-lg font-medium wrap-break-word text-gray-900">
                            {title}
                        </h2>
                        {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
                    </div>
                    <button
                        type="button"
                        aria-label="ปิด"
                        className="-mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
                        onClick={requestClose}
                    >
                        <X size={20} />
                    </button>
                </header>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
                    <div className="grid gap-4">{children}</div>
                </div>
                <footer className="border-t border-gray-200 bg-white px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:rounded-bl-2xl sm:px-6">
                    {footer}
                </footer>
            </form>
        </div>,
        document.body,
    );
}

/** ส่วนในแผง: เลขลำดับ + ชื่อ + คำอธิบายสั้น */
export function DrawerSection({
    number,
    title,
    description,
    actions,
    children,
}: {
    number: number;
    title: string;
    description?: string;
    actions?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <section className="grid gap-4 rounded-2xl border border-gray-200 bg-white p-4 sm:p-5" aria-label={title}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-medium text-blue-600">
                        {number}
                    </span>
                    <div className="grid min-w-0 gap-0.5 pt-0.5">
                        <h3 className="text-base font-medium text-gray-900">{title}</h3>
                        {description && <p className="text-xs leading-relaxed text-gray-500">{description}</p>}
                    </div>
                </div>
                {actions}
            </div>
            {children}
        </section>
    );
}

/** ปุ่มท้ายแผง: ข้อความสรุปด้านซ้าย (เช่น ราคาชุด) · ยกเลิก + บันทึก */
export function DrawerButtons({
    summary,
    isSaving,
    submitLabel,
    onCancel,
}: {
    summary?: React.ReactNode;
    isSaving: boolean;
    submitLabel: string;
    onCancel: () => void;
}) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="min-w-0 text-sm text-gray-600">{summary}</div>
            <div className="flex flex-1 justify-end gap-2 sm:flex-none">
                <button
                    type="button"
                    className={`${buttonClass("secondary", "md")} min-h-11 flex-1 justify-center sm:flex-none`}
                    onClick={onCancel}
                >
                    ยกเลิก
                </button>
                <button
                    type="submit"
                    className={`${buttonClass("primary", "md")} min-h-11 flex-1 justify-center sm:flex-none`}
                    disabled={isSaving}
                >
                    {isSaving ? "กำลังบันทึก..." : submitLabel}
                </button>
            </div>
        </div>
    );
}
