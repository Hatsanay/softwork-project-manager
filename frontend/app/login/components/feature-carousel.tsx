"use client";

// สไลด์แนะนำระบบในหน้า login (16 ต.ค. 2026) — เลื่อนเองทุก 5 วินาที · หยุดเมื่อเอาเมาส์ชี้/โฟกัสด้วยคีย์บอร์ด
// กดจุดเลือกสไลด์ได้ · มือถือปัดซ้าย/ขวาได้ · เครื่องที่ตั้ง "ลดการเคลื่อนไหว" ไม่เลื่อนเองและไม่มีภาพเคลื่อนไหว
// ภาพในสไลด์เป็นภาพประกอบ (ไม่ใช่ข้อมูลจริง) — สร้างจาก div ไม่ใช้รูป จึงคมทุกขนาดจอ
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CheckCircle2, ChevronRight, Clock, FolderKanban, Link2, ReceiptText, Wallet } from "lucide-react";

const SLIDE_DURATION_MS = 5000;
const SWIPE_DISTANCE_PX = 40;

type Slide = {
    icon: typeof FolderKanban;
    title: string;
    text: string;
    Illustration: () => React.ReactNode;
};

function TasksIllustration() {
    const tasks = [
        { name: "ออกแบบหน้าแรก", percent: 100 },
        { name: "เชื่อมระบบชำระเงิน", percent: 65 },
        { name: "ทดสอบบนมือถือ", percent: 30 },
    ];
    return (
        <div className="grid gap-3">
            {tasks.map((task, index) => (
                <div key={task.name} className="grid gap-1.5">
                    <div className="flex justify-between text-xs text-gray-600">
                        <span>{task.name}</span>
                        <span className="tabular-nums">{task.percent}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                        <div
                            className="h-full origin-left rounded-full bg-brand-gradient motion-safe:animate-grow-x"
                            style={
                                {
                                    width: `${task.percent}%`,
                                    "--carousel-duration": `${0.9 + index * 0.25}s`,
                                } as React.CSSProperties
                            }
                        />
                    </div>
                </div>
            ))}
        </div>
    );
}

function SalesIllustration() {
    const documents = ["ใบเสนอราคา", "ใบแจ้งหนี้", "ใบเสร็จรับเงิน"];
    return (
        <ol className="flex flex-wrap items-center gap-1.5">
            {documents.map((name, index) => (
                <li
                    key={name}
                    className="flex items-center gap-1.5 motion-safe:animate-fade-up"
                    style={{ animationDelay: `${index * 180}ms` }}
                >
                    {index > 0 && <ChevronRight aria-hidden="true" size={14} className="text-gray-300" />}
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-sm text-blue-600">
                        <CheckCircle2 size={14} />
                        {name}
                    </span>
                </li>
            ))}
        </ol>
    );
}

function ApprovalIllustration() {
    const steps = [
        { label: "ส่งบิล + แนบใบเสร็จ", done: true },
        { label: "ชั้น 1 · หัวหน้าฝ่าย", done: true },
        { label: "ชั้น 2 · ผู้บริหาร", done: false },
    ];
    return (
        <ol className="grid gap-2.5">
            {steps.map((step, index) => (
                <li
                    key={step.label}
                    className="flex items-center gap-2.5 text-sm motion-safe:animate-fade-up"
                    style={{ animationDelay: `${index * 180}ms` }}
                >
                    {step.done ? (
                        <CheckCircle2 size={18} className="shrink-0 text-blue-600" />
                    ) : (
                        <Clock size={18} className="shrink-0 text-amber-500" />
                    )}
                    <span className={step.done ? "text-gray-700" : "text-gray-500"}>{step.label}</span>
                </li>
            ))}
        </ol>
    );
}

function ShareIllustration() {
    return (
        <div className="grid gap-3">
            <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
                <Link2 size={14} className="shrink-0 text-blue-600" />
                <span className="truncate">softwork.app/share/•••••••</span>
            </div>
            <div className="flex items-center gap-3">
                <div className="relative h-14 w-14 shrink-0">
                    <svg viewBox="0 0 36 36" className="h-14 w-14 -rotate-90">
                        <circle cx="18" cy="18" r="15" fill="none" className="stroke-gray-100" strokeWidth="4" />
                        <circle
                            cx="18"
                            cy="18"
                            r="15"
                            fill="none"
                            className="stroke-blue-500"
                            strokeWidth="4"
                            strokeLinecap="round"
                            strokeDasharray="94.2"
                            strokeDashoffset="26"
                        />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-gray-800">
                        72%
                    </span>
                </div>
                <p className="text-xs leading-relaxed text-gray-500">
                    ลูกค้าเปิดลิงก์ดูความคืบหน้าได้เอง ไม่ต้องโทรถาม
                </p>
            </div>
        </div>
    );
}

export const SLIDES: Slide[] = [
    {
        icon: FolderKanban,
        title: "โปรเจกต์และงาน",
        text: "ทุกคนเห็นงานของตัวเอง ผู้บริหารเห็นความคืบหน้าทั้งบริษัท",
        Illustration: TasksIllustration,
    },
    {
        icon: ReceiptText,
        title: "วงจรขายครบ",
        text: "ใบเสนอราคา ใบแจ้งหนี้ ใบเสร็จ ต่อกันอัตโนมัติ ไม่ต้องพิมพ์ซ้ำ",
        Illustration: SalesIllustration,
    },
    {
        icon: Wallet,
        title: "ค่าใช้จ่ายและการอนุมัติ",
        text: "บันทึกบิล แนบใบเสร็จจากมือถือ อนุมัติตามวงเงิน",
        Illustration: ApprovalIllustration,
    },
    {
        icon: Link2,
        title: "ลูกค้าติดตามเองได้",
        text: "ส่งลิงก์ให้ลูกค้าดูความคืบหน้าโดยไม่ต้องสมัครสมาชิก",
        Illustration: ShareIllustration,
    },
];

// ตั้งค่า "ลดการเคลื่อนไหว" ของเครื่อง — อ่านผ่าน useSyncExternalStore: ฝั่งเซิร์ฟเวอร์ถือว่าไม่ลด (HTML ตรงกันตอน hydrate)
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
    const query = window.matchMedia(REDUCED_MOTION_QUERY);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
}

function usePrefersReducedMotion() {
    return useSyncExternalStore(
        subscribeReducedMotion,
        () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
        () => false,
    );
}

export default function FeatureCarousel({ compact = false }: { compact?: boolean }) {
    const [activeIndex, setActiveIndex] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    const isReducedMotion = usePrefersReducedMotion();
    const touchStartX = useRef<number | null>(null);
    const isAutoPlaying = !isPaused && !isReducedMotion;

    // เลื่อนไปสไลด์ถัดไปเมื่อครบเวลา — ตั้งเวลาใหม่ทุกครั้งที่เปลี่ยนสไลด์ (กดจุดแล้วนับใหม่)
    useEffect(() => {
        if (!isAutoPlaying) return;
        const timer = setTimeout(() => setActiveIndex((index) => (index + 1) % SLIDES.length), SLIDE_DURATION_MS);
        return () => clearTimeout(timer);
    }, [activeIndex, isAutoPlaying]);

    function goTo(index: number) {
        setActiveIndex((index + SLIDES.length) % SLIDES.length);
    }

    function handleTouchEnd(event: React.TouchEvent) {
        if (touchStartX.current === null) return;
        const distance = event.changedTouches[0].clientX - touchStartX.current;
        touchStartX.current = null;
        if (Math.abs(distance) < SWIPE_DISTANCE_PX) return;
        goTo(activeIndex + (distance < 0 ? 1 : -1));
    }

    return (
        <div
            role="region"
            aria-roledescription="carousel"
            aria-label="ความสามารถของระบบ"
            className="grid gap-4"
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
            onFocus={() => setIsPaused(true)}
            onBlur={() => setIsPaused(false)}
            onTouchStart={(event) => (touchStartX.current = event.touches[0].clientX)}
            onTouchEnd={handleTouchEnd}
        >
            {/* สไลด์ซ้อนกันในช่องเดียว (grid-area เดียวกัน) — ความสูงเท่าสไลด์ที่สูงสุด ไม่กระตุกตอนเปลี่ยน */}
            <div className="grid">
                {SLIDES.map((slide, index) => {
                    const isActive = index === activeIndex;
                    const Icon = slide.icon;
                    return (
                        <div
                            key={slide.title}
                            role="group"
                            aria-roledescription="slide"
                            aria-label={`${index + 1} จาก ${SLIDES.length}: ${slide.title}`}
                            aria-hidden={!isActive}
                            className={`col-start-1 row-start-1 grid content-start gap-4 transition-all duration-500 ease-out motion-reduce:transition-none ${
                                isActive ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-6 opacity-0"
                            }`}
                        >
                            <div className="flex items-start gap-3">
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                                    <Icon size={20} />
                                </span>
                                <span className="grid gap-0.5">
                                    <span className="font-medium text-gray-900">{slide.title}</span>
                                    <span className="text-sm leading-relaxed text-gray-500">{slide.text}</span>
                                </span>
                            </div>
                            {/* ภาพประกอบ: สร้างใหม่ทุกครั้งที่สไลด์ขึ้น ภาพเคลื่อนไหวในสไลด์จึงเล่นใหม่ */}
                            {!compact && (
                                <div
                                    aria-hidden="true"
                                    className="rounded-2xl border border-gray-200 bg-white p-5 shadow-card motion-safe:animate-float"
                                >
                                    {isActive && <slide.Illustration />}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            <div className="-mx-2 flex items-center">
                {SLIDES.map((slide, index) => {
                    const isActive = index === activeIndex;
                    return (
                        <button
                            key={slide.title}
                            type="button"
                            aria-label={`ดูสไลด์ ${index + 1}: ${slide.title}`}
                            aria-current={isActive}
                            onClick={() => goTo(index)}
                            className="-my-2 flex h-10 min-w-8 items-center justify-center px-1"
                        >
                            <span
                                className={`relative block h-1.5 overflow-hidden rounded-full transition-all duration-300 ${
                                    isActive ? "w-10 bg-blue-100" : "w-1.5 bg-gray-300 hover:bg-gray-400"
                                }`}
                            >
                                {isActive && (
                                    <span
                                        key={`${activeIndex}-${isAutoPlaying}`}
                                        className={`absolute inset-0 origin-left rounded-full bg-blue-500 ${
                                            isAutoPlaying ? "animate-grow-x" : ""
                                        }`}
                                        style={
                                            { "--carousel-duration": `${SLIDE_DURATION_MS}ms` } as React.CSSProperties
                                        }
                                    />
                                )}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
