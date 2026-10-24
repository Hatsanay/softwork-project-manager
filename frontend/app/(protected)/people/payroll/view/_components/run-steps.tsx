// แถบขั้นตอนรอบเงินเดือน (U-3 · 2026-10-23) — ร่าง → รออนุมัติ → อนุมัติแล้ว → จ่ายแล้ว + บอกขั้นถัดไปเป็นประโยคเดียว
// ยกเลิกแล้วไม่แสดงแถบ (หน้าแสดงแถบสถานะยกเลิกแทน)
import { Check } from "lucide-react";
import type { PayrollStatus } from "../../../_types";

const STEPS: { status: PayrollStatus; label: string }[] = [
    { status: "draft", label: "ร่าง" },
    { status: "pending_approval", label: "รออนุมัติ" },
    { status: "approved", label: "อนุมัติแล้ว" },
    { status: "paid", label: "จ่ายแล้ว" },
];

// ประโยค "ขั้นถัดไป" ตามสถานะ — บอกว่าใครต้องทำอะไร
const NEXT_STEP: Partial<Record<PayrollStatus, string>> = {
    draft: "ขั้นถัดไป: ตรวจรายคน แก้ปัญหาที่แจ้ง แล้วกด ส่งอนุมัติ",
    pending_approval: "ขั้นถัดไป: ผู้มีสิทธิ์อนุมัติเงินเดือนตรวจแล้วกด อนุมัติ หรือ ตีกลับ",
    approved: "ขั้นถัดไป: โอนเงินแล้วกด บันทึกจ่ายแล้ว พนักงานจึงเห็นสลิป",
    paid: "จบรอบแล้ว · พนักงานเปิดดูสลิปของตัวเองได้",
};

export default function RunSteps({ status }: { status: PayrollStatus }) {
    if (status === "cancelled") return null;
    const currentIndex = STEPS.findIndex((step) => step.status === status);
    const isFinished = status === "paid";

    return (
        <div className="grid gap-2">
            <ol className="grid grid-cols-4 gap-1.5" aria-label="ขั้นตอนรอบเงินเดือน">
                {STEPS.map((step, index) => {
                    const isDone = index < currentIndex || (isFinished && index === currentIndex);
                    const isCurrent = index === currentIndex && !isFinished;
                    return (
                        <li
                            key={step.status}
                            aria-current={isCurrent ? "step" : undefined}
                            className="grid gap-1.5 text-center"
                        >
                            <span
                                className={`h-1.5 rounded-full ${isDone ? "bg-blue-600" : isCurrent ? "bg-blue-300" : "bg-gray-200"}`}
                            />
                            <span
                                className={`inline-flex items-center justify-center gap-1 text-xs ${
                                    isCurrent ? "font-medium text-blue-600" : isDone ? "text-gray-700" : "text-gray-400"
                                }`}
                            >
                                {isDone && <Check size={12} aria-hidden="true" />}
                                {step.label}
                            </span>
                        </li>
                    );
                })}
            </ol>
            {NEXT_STEP[status] && <p className="text-sm text-gray-600">{NEXT_STEP[status]}</p>}
        </div>
    );
}
