"use client";

// นาฬิกาและสถานะการเล่นของเดโมระบบในหน้า login (18 ต.ค. 2026 — แบบเดียวกับ flow-demo ของ fasttiw)
// ฉากทุกฉากเป็น "ฟังก์ชันของเวลา t" (ms นับจากต้นฉาก) — ตัวเล่นแค่เดินเวลา ไม่มีการต่อ backend จริงเลย
import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";

// อัปเดตฉาก ~12 ครั้ง/วินาที — ความลื่นมาจาก CSS transition ไม่ใช่จำนวนเฟรม
const TICK_MS = 80;
// ตัดช่วงเวลาที่ขาดไปนาน (สลับแท็บแล้วกลับมา) ฉากจะได้ไม่กระโดดข้าม
const MAX_DELTA_MS = 250;

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
    const query = window.matchMedia(REDUCED_MOTION_QUERY);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
}

/** ผู้ใช้ตั้ง "ลดการเคลื่อนไหว" ในเครื่อง — ฝั่งเซิร์ฟเวอร์ถือว่าไม่ลด (HTML ตรงกันตอน hydrate) */
export function usePrefersReducedMotion() {
    return useSyncExternalStore(
        subscribeReducedMotion,
        () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
        () => false,
    );
}

/**
 * เล่นเมื่อเดโมอยู่บนจอจริง (มือถือแผงนี้ซ่อนอยู่ = ไม่เล่น ไม่กินเครื่อง) · เอาเมาส์ชี้ที่เดโม = หยุด
 */
export function useDemoPlayer(sectionRef: RefObject<HTMLElement | null>) {
    const [isInView, setIsInView] = useState(false);
    const [isUserPaused, setIsUserPaused] = useState(false);
    const isReducedMotion = usePrefersReducedMotion();

    useEffect(() => {
        const section = sectionRef.current;
        if (!section) return;
        const observer = new IntersectionObserver(([entry]) => setIsInView(entry.isIntersecting), { threshold: 0.2 });
        observer.observe(section);
        return () => observer.disconnect();
    }, [sectionRef]);

    // ลดการเคลื่อนไหวยังเปลี่ยนฉาก (แสดงภาพจบของฉาก ไม่มีเมาส์/การพิมพ์) — ไม่มีปุ่มเลือกฉากแล้ว ถ้าไม่เดินจะเห็นแค่ฉากแรก
    const isPlaying = isInView && !isUserPaused;
    return { isInView, isReducedMotion, isUserPaused, setIsUserPaused, isPlaying };
}

/** เรียก onDelta(ms ที่ผ่านไปจริง) ทุก tick เฉพาะตอนเล่นอยู่และแท็บเปิดอยู่ */
export function useDemoTicker(isPlaying: boolean, onDelta: (milliseconds: number) => void) {
    const callback = useRef(onDelta);
    useEffect(() => {
        callback.current = onDelta;
    });
    useEffect(() => {
        if (!isPlaying) return;
        let last = performance.now();
        const timer = setInterval(() => {
            const now = performance.now();
            if (document.hidden) {
                last = now;
                return;
            }
            const delta = Math.min(now - last, MAX_DELTA_MS);
            last = now;
            callback.current(delta);
        }, TICK_MS);
        return () => clearInterval(timer);
    }, [isPlaying]);
}

/** ข้อความที่พิมพ์ไปแล้ว ณ เวลา t (เริ่มพิมพ์ที่ start ตัวละ perChar ms) */
export function typed(text: string, t: number, start: number, perChar = 70) {
    if (t < start) return "";
    return text.slice(0, Math.floor((t - start) / perChar) + 1);
}

/** ตัวเลขที่นับขึ้นจาก 0 ถึง value ในช่วง start..start+duration (แสดงผลเท่านั้น — ไม่ใช่ยอดเงินจริง) */
export function countUp(value: number, t: number, start: number, duration = 900) {
    if (t <= start) return 0;
    if (t >= start + duration) return value;
    const progress = (t - start) / duration;
    const eased = 1 - (1 - progress) ** 3;
    return Math.round(value * eased);
}

/** 1234567 → "1,234,567.00" (ภาพประกอบเท่านั้น) */
export function money(value: number) {
    return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
