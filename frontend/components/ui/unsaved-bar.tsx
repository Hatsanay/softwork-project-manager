"use client";

// แถบ "มีการแก้ไขที่ยังไม่บันทึก" ลอยกลางล่างจอ — กันลืมกดบันทึกในฟอร์มยาว
// ระหว่างที่มีการแก้ค้าง: ปิดแท็บ/รีเฟรช หรือกดลิงก์ในระบบ จะถามก่อนออกจากหน้า
// วางไว้ในแท็บที่ซ่อนอยู่ (hidden) ได้ — แถบไม่แสดง แต่ยังเตือนก่อนออกจากหน้าเหมือนเดิม
import { useEffect } from "react";
import Button from "./button";

const LEAVE_MESSAGE = "มีการแก้ไขที่ยังไม่บันทึก ออกจากหน้านี้แล้วสิ่งที่แก้จะหายไป ต้องการออกไหม?";

type UnsavedBarProps = {
    isDirty: boolean;
    isSaving: boolean;
    saveLabel?: string;
    onSave: () => void;
    onDiscard: () => void;
};

export default function UnsavedBar({ isDirty, isSaving, saveLabel = "บันทึก", onSave, onDiscard }: UnsavedBarProps) {
    useEffect(() => {
        if (!isDirty) return;

        function warnBeforeUnload(event: BeforeUnloadEvent) {
            event.preventDefault();
        }

        // ลิงก์ในระบบ (Next.js) ไม่ทำให้เกิด beforeunload — ถามเองตอนกดลิงก์
        function warnBeforeLinkClick(event: MouseEvent) {
            const link = (event.target as Element | null)?.closest("a[href]");
            if (!link || link.getAttribute("target") === "_blank") return;
            if (!window.confirm(LEAVE_MESSAGE)) {
                event.preventDefault();
                event.stopPropagation();
            }
        }

        window.addEventListener("beforeunload", warnBeforeUnload);
        document.addEventListener("click", warnBeforeLinkClick, true);
        return () => {
            window.removeEventListener("beforeunload", warnBeforeUnload);
            document.removeEventListener("click", warnBeforeLinkClick, true);
        };
    }, [isDirty]);

    if (!isDirty) return null;

    return (
        <div
            role="status"
            className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))] left-1/2 z-40 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-2xl bg-gray-900/95 py-2 pl-4 pr-2 text-sm text-white shadow-float backdrop-blur"
        >
            <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500 ring-4 ring-amber-500/25" aria-hidden="true" />
            <span className="truncate">มีการแก้ไขที่ยังไม่บันทึก</span>
            <Button
                variant="ghost"
                size="sm"
                className="text-gray-300 hover:bg-white/10 hover:text-white"
                onClick={onDiscard}
                disabled={isSaving}
            >
                ยกเลิก
            </Button>
            <Button variant="primary" size="sm" onClick={onSave} disabled={isSaving}>
                {isSaving ? "กำลังบันทึก..." : saveLabel}
            </Button>
        </div>
    );
}
