"use client";

// ปุ่มเลือกแบบแบ่งช่อง (แท็บ/ตัวกรอง) — เลื่อนแนวนอนในตัวเองบนจอแคบ ทั้งหน้าไม่เลื่อนตาม
// ยังมีช่องซ่อนอยู่ด้านไหน ขอบด้านนั้นจางลง (บอกว่าเลื่อนดูได้) · ช่องที่เลือกเลื่อนเข้ามาให้เห็นเสมอ (usability U-4 · 2026-11-01)
import { useEffect, useRef, useState } from "react";

// ความกว้างของขอบจาง (px) · ใช้ mask ไม่ใช้สีทับ จึงใช้ได้ทั้งบนพื้นหน้าและบนการ์ดขาว
const FADE_WIDTH = 28;

type SegmentedOption<Value extends string> = {
    value: Value;
    label: string;
    count?: number;
};

type SegmentedProps<Value extends string> = {
    label: string;
    options: SegmentedOption<Value>[];
    value: Value;
    onChange: (value: Value) => void;
    role?: "tablist" | "group";
    idPrefix?: string;
};

export default function Segmented<Value extends string>({
    label,
    options,
    value,
    onChange,
    role = "group",
    idPrefix,
}: SegmentedProps<Value>) {
    const isTabs = role === "tablist";
    const scrollerRef = useRef<HTMLDivElement>(null);
    const [hiddenSide, setHiddenSide] = useState({ left: false, right: false });

    // ResizeObserver เรียกครั้งแรกทันทีที่เริ่มดู จึงไม่ต้องเรียก update เองใน effect
    useEffect(() => {
        const scroller = scrollerRef.current;
        if (!scroller) return;
        function update() {
            if (!scroller) return;
            const maxScroll = scroller.scrollWidth - scroller.clientWidth;
            setHiddenSide({ left: scroller.scrollLeft > 2, right: scroller.scrollLeft < maxScroll - 2 });
        }
        scroller.addEventListener("scroll", update, { passive: true });
        const observer = new ResizeObserver(update);
        observer.observe(scroller);
        return () => {
            scroller.removeEventListener("scroll", update);
            observer.disconnect();
        };
    }, [options.length]);

    // ช่องที่เลือกอยู่นอกจอ (เช่นเปิดจากลิงก์ที่เลือกแท็บท้ายไว้) = เลื่อนแถบให้เห็น
    // เลื่อนแค่แนวนอน ไม่ใช้ scrollIntoView เพราะจะเลื่อนทั้งหน้าด้วย
    useEffect(() => {
        const scroller = scrollerRef.current;
        const selected = scroller?.querySelector<HTMLElement>('[data-selected="true"]');
        if (!scroller || !selected) return;
        const selectedEnd = selected.offsetLeft + selected.offsetWidth;
        if (selectedEnd > scroller.scrollLeft + scroller.clientWidth) {
            scroller.scrollLeft = selectedEnd - scroller.clientWidth + FADE_WIDTH;
        } else if (selected.offsetLeft < scroller.scrollLeft) {
            scroller.scrollLeft = Math.max(0, selected.offsetLeft - FADE_WIDTH);
        }
    }, [value]);

    const leftStop = hiddenSide.left ? `${FADE_WIDTH}px` : "0px";
    const rightStop = hiddenSide.right ? `calc(100% - ${FADE_WIDTH}px)` : "100%";
    const fadeMask = `linear-gradient(to right, transparent, black ${leftStop}, black ${rightStop}, transparent)`;
    const hasFade = hiddenSide.left || hiddenSide.right;

    return (
        <div
            ref={scrollerRef}
            className="relative -mx-4 max-w-[calc(100%+2rem)] overflow-x-auto px-4 sm:mx-0 sm:max-w-full sm:px-0"
            style={hasFade ? { maskImage: fadeMask, WebkitMaskImage: fadeMask } : undefined}
        >
            <div role={role} aria-label={label} className="inline-flex gap-0.5 rounded-2xl bg-gray-100 p-1">
                {options.map((option) => {
                    const isSelected = option.value === value;
                    return (
                        <button
                            key={option.value}
                            type="button"
                            role={isTabs ? "tab" : undefined}
                            id={idPrefix ? `${idPrefix}-tab-${option.value}` : undefined}
                            aria-controls={idPrefix ? `${idPrefix}-panel-${option.value}` : undefined}
                            aria-selected={isTabs ? isSelected : undefined}
                            aria-pressed={isTabs ? undefined : isSelected}
                            data-selected={isSelected}
                            onClick={() => onChange(option.value)}
                            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm transition sm:py-1.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/20 ${
                                isSelected
                                    ? "bg-white font-medium text-gray-900 shadow-sm"
                                    : "text-gray-500 hover:text-gray-800"
                            }`}
                        >
                            {option.label}
                            {option.count !== undefined && (
                                <span className="text-xs text-gray-400 tabular-nums">{option.count}</span>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
