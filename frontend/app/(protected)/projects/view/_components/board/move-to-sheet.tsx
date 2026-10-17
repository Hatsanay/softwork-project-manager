"use client";

// แผ่น "ย้ายไป…" — ทางเลือกแทนการลาก (มือถือ/คีย์บอร์ด) · หน้าต่างเลื่อนขึ้นจากล่างบนมือถือ (CODING_GUIDELINES 5.1)
import { useEffect } from "react";
import { Check } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { BOARD_COLUMNS, type BoardStatus, type BoardTask } from "./board-types";

export default function MoveToSheet({
    task,
    onSelect,
    onClose,
}: {
    task: BoardTask | null;
    onSelect: (status: BoardStatus) => void;
    onClose: () => void;
}) {
    useEffect(() => {
        if (!task) return;
        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") onClose();
        }
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [task, onClose]);

    if (!task) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/40 backdrop-blur-sm sm:items-center sm:p-4"
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="move-to-title"
                className="grid max-h-[90dvh] w-full max-w-sm gap-3 overflow-y-auto rounded-t-2xl bg-white p-5 shadow-float sm:rounded-2xl"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="grid gap-0.5">
                    <h2 id="move-to-title" className="text-base font-medium text-gray-900">
                        ย้ายไปสถานะ
                    </h2>
                    <p className="text-sm wrap-break-word text-gray-500">{task.task_title}</p>
                </div>
                <ul className="grid gap-2">
                    {BOARD_COLUMNS.map((column) => {
                        const isCurrent = column.status === task.task_status;
                        return (
                            <li key={column.status}>
                                <button
                                    type="button"
                                    disabled={isCurrent}
                                    onClick={() => onSelect(column.status)}
                                    className={`flex min-h-11 w-full items-center justify-between rounded-xl border px-4 text-sm ${
                                        isCurrent
                                            ? "border-blue-200 bg-blue-50 text-blue-600"
                                            : "border-gray-200 text-gray-800 hover:border-blue-200 hover:bg-blue-50"
                                    }`}
                                >
                                    {column.label}
                                    {isCurrent && (
                                        <span className="flex items-center gap-1 text-xs">
                                            <Check size={14} />
                                            อยู่ที่นี่
                                        </span>
                                    )}
                                </button>
                            </li>
                        );
                    })}
                </ul>
                <button type="button" className={buttonClass("secondary", "md")} onClick={onClose}>
                    ปิด
                </button>
            </div>
        </div>
    );
}
