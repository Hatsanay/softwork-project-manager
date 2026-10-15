"use client";

// ลิงก์ "ทำงานอย่างไร?" กดแล้วกางคำอธิบายในที่ (แบบที่ 2 ใน docs/plans/2026-10-12-ui-guidance.md) — ใช้แทนไอคอน ⓘ/tooltip
// เนื้อหาข้างในควรเป็นตัวอย่างที่คำนวณจากค่าที่ตั้งจริงตรงนั้น ไม่ใช่ข้อความตายตัว
import { useId, useState } from "react";
import { ChevronRight } from "lucide-react";

type HowItWorksProps = {
    label?: string;
    defaultOpen?: boolean;
    children: React.ReactNode;
};

export default function HowItWorks({ label = "ทำงานอย่างไร?", defaultOpen = false, children }: HowItWorksProps) {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    const bodyId = useId();

    return (
        <div className="grid gap-2">
            <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={bodyId}
                onClick={() => setIsOpen((open) => !open)}
                className="-my-2.5 inline-flex w-fit items-center gap-1 py-2.5 text-sm font-medium text-blue-600 hover:text-blue-700"
            >
                <ChevronRight size={15} className={`transition-transform ${isOpen ? "rotate-90" : ""}`} />
                {label}
            </button>
            <div
                id={bodyId}
                hidden={!isOpen}
                className="grid gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700"
            >
                {children}
            </div>
        </div>
    );
}
