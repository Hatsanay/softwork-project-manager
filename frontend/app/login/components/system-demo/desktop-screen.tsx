"use client";

// กรอบจอคอมจำลอง + หน้าจอเสมือนกว้าง 1024px ที่ย่อให้พอดีกรอบ + เมาส์ที่เลื่อนไปกดปุ่มเอง (แบบ PhoneScreen ของ fasttiw)
// หน้าจอเสมือนกว้างเท่าเดิมเสมอแล้วย่อทั้งก้อน — layout ข้างในเหมือนหน้าจริงทุกขนาดจอ
// ⚠ ฉากข้างในห้ามใช้ class ที่มี breakpoint (sm:/md:/lg:) เพราะ breakpoint อ่านความกว้างจอจริง ไม่ใช่ 1024px เสมือน
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Lock } from "lucide-react";

export const SCREEN_WIDTH = 1024;
export const SCREEN_HEIGHT = 640;
// เมาส์เริ่มเลื่อนไปหาเป้าก่อนกดกี่ ms
const CURSOR_LEAD_MS = 650;

/**
 * จุดที่เมาส์กด: at = ms ที่กด (นับจากต้นฉาก) · target = สิ่งที่จะกด เมาส์หาตำแหน่งจาก DOM เอง
 * - "ชื่อ" = ค่า data-demo (ฉากที่เขียนเอง)
 * - "css:ตัวเลือก" = CSS selector (ปุ่มในหน้าจริง เช่น css:[aria-label="ค้นหาโปรเจกต์หรืองาน"])
 * - "text:ข้อความ" = ปุ่ม/ลิงก์ตัวแรกที่ข้อความขึ้นต้นด้วยข้อความนี้ (ปุ่มในหน้าจริงที่ไม่มีตัวเลือกอื่น เช่น text:คัดลอก)
 */
export type Waypoint = { at: number; target: string };

function findTarget(screen: HTMLElement, target: string) {
    if (target.startsWith("css:")) return screen.querySelector<HTMLElement>(target.slice(4));
    if (target.startsWith("text:")) {
        const text = target.slice(5);
        const candidates = screen.querySelectorAll<HTMLElement>("button, a, [role=button], [role=tab], label");
        return [...candidates].find((element) => element.textContent?.trim().startsWith(text)) ?? null;
    }
    return screen.querySelector<HTMLElement>(`[data-demo="${target}"]`);
}

function activeWaypoint(waypoints: Waypoint[], t: number) {
    let current: Waypoint | null = null;
    for (const waypoint of waypoints) {
        if (t >= waypoint.at - CURSOR_LEAD_MS) current = waypoint;
    }
    const first = waypoints[0];
    const last = waypoints[waypoints.length - 1];
    const isVisible = Boolean(first) && t >= first.at - CURSOR_LEAD_MS - 300 && t <= last.at + 900;
    const isClicking = Boolean(current) && t >= current!.at && t < current!.at + 350;
    return { current, isVisible, isClicking };
}

export default function DesktopScreen({
    url,
    waypoints,
    t,
    hideCursor,
    children,
}: {
    url: string;
    waypoints: Waypoint[];
    t: number;
    hideCursor: boolean;
    children: ReactNode;
}) {
    const frameRef = useRef<HTMLDivElement>(null);
    const screenRef = useRef<HTMLDivElement>(null);
    const cursorRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(0.6);

    useEffect(() => {
        const frame = frameRef.current;
        if (!frame) return;
        const observer = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / SCREEN_WIDTH));
        observer.observe(frame);
        return () => observer.disconnect();
    }, []);

    // ตำแหน่งเมาส์มาจากปุ่มจริงใน DOM (data-demo) — layout เปลี่ยนก็ยังชี้ถูก · ขยับผ่าน style ตรงๆ ไม่เรนเดอร์ซ้ำ
    useLayoutEffect(() => {
        const cursor = cursorRef.current;
        const screen = screenRef.current;
        if (!cursor || !screen) return;
        const { current, isVisible, isClicking } = hideCursor
            ? { current: null, isVisible: false, isClicking: false }
            : activeWaypoint(waypoints, t);
        const target = current ? findTarget(screen, current.target) : null;
        const screenBox = screen.getBoundingClientRect();
        const shownScale = screenBox.width / SCREEN_WIDTH;
        if (target && shownScale > 0) {
            const box = target.getBoundingClientRect();
            const x = (box.left + box.width * 0.5 - screenBox.left) / shownScale;
            const y = (box.top + box.height * 0.55 - screenBox.top) / shownScale;
            cursor.style.transform = `translate(${x}px, ${y}px)`;
        }
        cursor.style.opacity = isVisible && target ? "1" : "0";
        cursor.dataset.clicking = isClicking ? "1" : "0";
    });

    return (
        <div className="grid justify-items-center">
            {/* จอ: ขอบดำบาง (สีถ่านตามโลโก้) + แถบเบราว์เซอร์ */}
            <div className="w-full rounded-[1.1rem] border-[7px] border-gray-800 bg-gray-800 shadow-float">
                <div className="flex items-center gap-3 rounded-t-[0.7rem] bg-gray-100 px-3 py-1.5">
                    <span className="flex gap-1.5" aria-hidden="true">
                        <span className="h-2 w-2 rounded-full bg-gray-300" />
                        <span className="h-2 w-2 rounded-full bg-gray-300" />
                        <span className="h-2 w-2 rounded-full bg-gray-300" />
                    </span>
                    <span className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md bg-white px-2.5 py-0.5 text-[10px] text-gray-500">
                        <Lock size={9} className="shrink-0 text-gray-400" />
                        <span className="truncate">softwork.app{url}</span>
                    </span>
                </div>
                <div
                    ref={frameRef}
                    className="relative overflow-hidden rounded-b-[0.7rem] bg-gray-50"
                    style={{ height: SCREEN_HEIGHT * scale }}
                    aria-hidden="true"
                    inert
                >
                    <div
                        ref={screenRef}
                        className="absolute left-0 top-0 origin-top-left"
                        style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT, transform: `scale(${scale})` }}
                    >
                        {children}
                        <div
                            ref={cursorRef}
                            className="demo-cursor pointer-events-none absolute left-0 top-0 z-30 opacity-0"
                        >
                            <svg
                                width="22"
                                height="22"
                                viewBox="0 0 24 24"
                                className="demo-cursor-arrow"
                                aria-hidden="true"
                            >
                                <path
                                    d="M4 2.5 19 12.4l-6.7 1.2 3.9 7.4-2.7 1.4-3.9-7.5L4 19.6Z"
                                    fill="#1f2937"
                                    stroke="#fff"
                                    strokeWidth="1.5"
                                    strokeLinejoin="round"
                                />
                            </svg>
                        </div>
                    </div>
                </div>
            </div>
            {/* ขาตั้งจอ */}
            <div className="h-5 w-16 bg-linear-to-b from-gray-300 to-gray-200" aria-hidden="true" />
            <div className="h-1.5 w-40 rounded-full bg-gray-300" aria-hidden="true" />
        </div>
    );
}
