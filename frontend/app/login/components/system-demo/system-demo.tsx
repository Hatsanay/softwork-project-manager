"use client";

// เดโมระบบบนจอคอมจำลองในหน้า login (18 ต.ค. 2026 — ผู้ใช้สั่ง "UI จริงเป็น motion แบบ fasttiw.com แต่เป็นหน้าจอคอม")
// เล่นทีละฉาก (scenes.tsx) วนไปเรื่อยๆ · คำอธิบายใต้หัวข้อเปลี่ยนตามฉาก (ผู้ใช้สั่งเอาแถบขั้นตอนใต้จอออก — 18 ต.ค. 2026)
// เล่นเฉพาะตอนอยู่บนจอ · เอาเมาส์ชี้ = หยุด · เครื่องที่ตั้ง "ลดการเคลื่อนไหว" ไม่มีอะไรขยับในฉาก แสดงภาพจบของแต่ละฉากแทน
// **ทำไมไม่ใช่วิดีโอ**: ไฟล์ใหญ่ทำให้หน้า login ช้า ตัวหนังสือแตก และหน้าจริงเปลี่ยนเมื่อไหร่ต้องอัดใหม่
import { useEffect, useRef, useState } from "react";
import DesktopScreen from "./desktop-screen";
import { STORY_PHASES } from "./kit";
import { NoLinkPrefetch } from "@/components/ui/view-link";
import { useDemoPlayer, useDemoTicker } from "./player";
import { SCENES } from "./scenes";

type Position = { scene: number; t: number };

export default function SystemDemo() {
    const sectionRef = useRef<HTMLElement>(null);
    const { isReducedMotion, setIsUserPaused, isPlaying } = useDemoPlayer(sectionRef);
    const [position, setPosition] = useState<Position>({ scene: 0, t: 0 });

    // ตัวช่วยตรวจงาน (เฉพาะเครื่อง dev): window.__systemDemo.seek(ฉาก, ms) หยุดที่เฟรมนั้นเป๊ะ — ใช้ถ่ายภาพทีละเฟรม
    useEffect(() => {
        if (process.env.NODE_ENV === "production") return;
        const debugWindow = window as unknown as { __systemDemo?: unknown };
        debugWindow.__systemDemo = {
            scenes: SCENES.map((scene) => ({ key: scene.key, duration: scene.duration })),
            seek: (scene: number, t: number) => {
                setIsUserPaused(true);
                setPosition({ scene, t });
            },
        };
        return () => {
            delete debugWindow.__systemDemo;
        };
    }, [setIsUserPaused]);

    useDemoTicker(isPlaying, (delta) =>
        setPosition(({ scene, t }) => {
            const next = t + delta;
            if (next < SCENES[scene].duration) return { scene, t: next };
            return { scene: (scene + 1) % SCENES.length, t: 0 };
        }),
    );

    const scene = SCENES[position.scene];
    // ลดการเคลื่อนไหว: แสดงสถานะจบของฉาก (เห็นผลลัพธ์ครบโดยไม่มีอะไรขยับ)
    const t = isReducedMotion ? scene.duration - 1 : position.t;
    const url = typeof scene.url === "function" ? scene.url(t) : scene.url;

    return (
        <section
            ref={sectionRef}
            aria-label="ตัวอย่างหน้าจอของระบบ"
            className="grid gap-6"
            // เอาเมาส์ชี้ที่จอ = หยุดฉากไว้ให้อ่าน (แทนปุ่มหยุดชั่วคราวที่เอาออกไป)
            onMouseEnter={() => setIsUserPaused(true)}
            onMouseLeave={() => setIsUserPaused(false)}
        >
            {/* คำอธิบายเปลี่ยนตามฉากที่กำลังเล่น · สูงคงที่ 2 บรรทัด จอด้านล่างจะได้ไม่กระตุกเวลาข้อความยาวไม่เท่ากัน */}
            <p key={scene.key} className="demo-page-in min-h-[3em] text-gray-500">
                <span className="text-blue-600">{STORY_PHASES[scene.phase]}</span>
                {" · "}
                <span className="font-medium text-gray-700">{scene.title}</span>: {scene.caption}
            </p>
            <DesktopScreen url={url} waypoints={scene.waypoints} t={t} hideCursor={isReducedMotion}>
                {/* หน้าจริงในจอเดโมมีลิงก์ — ไม่ให้ prefetch หน้าในระบบตอนลิงก์โผล่ (คนดูยังไม่ได้ login) */}
                <NoLinkPrefetch>
                    <div key={scene.key} className="absolute inset-0">
                        {scene.render(t)}
                    </div>
                </NoLinkPrefetch>
            </DesktopScreen>
        </section>
    );
}
