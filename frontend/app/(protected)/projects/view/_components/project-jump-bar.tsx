"use client";

// ปุ่มกระโดดไปแต่ละส่วนของหน้าโปรเจกต์ (มือถือเท่านั้น · 2026-11-02 · docs/plans/2026-11-02-project-page-mobile.md)
// ติดใต้แถบบนตอนเลื่อน · ปุ่มเฉพาะส่วนที่มีบนหน้าจริงสำหรับผู้ใช้คนนี้ (ดูจาก id ของส่วนในหน้า · การ์ดที่ไม่มีสิทธิ์/ไม่มีข้อมูลไม่แสดง)
// ปุ่มของส่วนที่กำลังดูเป็นสีเด่น · ใช้ Segmented (ขอบจางบอกว่าเลื่อนได้ · ปุ่มที่เลือกเลื่อนเข้ามาให้เห็นเอง)
import { useEffect, useRef, useState, type RefObject } from "react";
import Segmented from "@/components/ui/segmented";

type JumpKey = "tasks" | "share" | "fastwork" | "requirements" | "finance" | "members" | "activity";

// เรียงตามลำดับบนหน้าจอมือถือ · ids = ส่วนที่นับเป็นกลุ่มนี้ (กระโดดไปอันแรกที่มี)
const GROUPS: { key: JumpKey; label: string; ids: string[] }[] = [
    { key: "tasks", label: "งาน", ids: ["project-agile", "project-tasks"] },
    { key: "share", label: "ลิงก์ลูกค้า", ids: ["project-share"] },
    { key: "fastwork", label: "งวดงาน", ids: ["project-fastwork"] },
    { key: "requirements", label: "ความต้องการ", ids: ["project-requirements"] },
    { key: "finance", label: "การเงิน", ids: ["project-finance", "project-shares"] },
    { key: "members", label: "ทีม", ids: ["project-members"] },
    { key: "activity", label: "ประวัติ", ids: ["project-activity"] },
];

// ระยะเผื่อใต้แถบปุ่ม ตอนเลื่อนไปส่วนนั้น (px)
const SCROLL_GAP = 12;

/**
 * ขอบล่างของแถบตอนติดบนจอ (ระยะ top ของ sticky + ความสูงแถบ)
 * ไม่ใช้ตำแหน่งตอนนี้: ตอนอยู่บนสุดของหน้าแถบยังไม่ติด ขอบล่างอยู่ต่ำกว่ามาก ทำให้เลื่อนไปไม่ถึงส่วนที่กด
 */
function stuckBottomOf(bar: HTMLElement | null) {
    if (!bar) return 0;
    return parseFloat(getComputedStyle(bar).top) + bar.offsetHeight;
}

function firstElementOf(group: (typeof GROUPS)[number]) {
    for (const id of group.ids) {
        const element = document.getElementById(id);
        if (element) return element;
    }
    return null;
}

export default function ProjectJumpBar({
    containerRef,
    className = "",
}: {
    containerRef: RefObject<HTMLElement | null>;
    className?: string;
}) {
    const barRef = useRef<HTMLDivElement>(null);
    const [availableKeys, setAvailableKeys] = useState<JumpKey[]>([]);
    const [activeKey, setActiveKey] = useState<JumpKey>("tasks");

    // ส่วนไหนมีบนหน้า: การ์ดโหลดข้อมูลเองแล้วค่อยแสดง จึงดูการเปลี่ยนแปลงของหน้าไปเรื่อยๆ
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        function refresh() {
            const keys = GROUPS.filter((group) => firstElementOf(group) !== null).map((group) => group.key);
            setAvailableKeys((current) => (current.join("|") === keys.join("|") ? current : keys));
        }
        const observer = new MutationObserver(refresh);
        observer.observe(container, { childList: true, subtree: true });
        const frame = requestAnimationFrame(refresh);
        return () => {
            observer.disconnect();
            cancelAnimationFrame(frame);
        };
    }, [containerRef]);

    // ส่วนที่กำลังดู = ส่วนสุดท้ายที่หัวเลื่อนพ้นแถบปุ่มแล้ว
    useEffect(() => {
        let frame = 0;
        function update() {
            frame = 0;
            const barBottom = stuckBottomOf(barRef.current);
            let current: JumpKey | null = null;
            for (const group of GROUPS) {
                const element = firstElementOf(group);
                if (element && element.getBoundingClientRect().top - barBottom <= SCROLL_GAP * 2) current = group.key;
            }
            setActiveKey(current ?? "tasks");
        }
        function onScroll() {
            if (!frame) frame = requestAnimationFrame(update);
        }
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => {
            window.removeEventListener("scroll", onScroll);
            if (frame) cancelAnimationFrame(frame);
        };
    }, []);

    function jumpTo(key: JumpKey) {
        const group = GROUPS.find((item) => item.key === key);
        const element = group ? firstElementOf(group) : null;
        if (!element) return;
        window.scrollTo({
            top: element.getBoundingClientRect().top + window.scrollY - stuckBottomOf(barRef.current) - SCROLL_GAP,
            behavior: "smooth",
        });
        setActiveKey(key);
    }

    if (availableKeys.length < 2) return null;
    return (
        <nav
            ref={barRef}
            aria-label="ไปยังส่วนของโปรเจกต์"
            // min-w-0: แถวปุ่มยาวไม่ดันความกว้างของกริดหน้า (ไม่งั้นการ์ดทั้งหน้ากว้างเกินจอแล้วถูกตัด)
            className={`sticky top-[4.75rem] z-20 -mx-4 min-w-0 bg-gray-50/90 px-4 py-2 backdrop-blur sm:hidden ${className}`}
        >
            <Segmented<JumpKey>
                label="ไปยังส่วนของโปรเจกต์"
                value={activeKey}
                onChange={jumpTo}
                options={GROUPS.filter((group) => availableKeys.includes(group.key)).map((group) => ({
                    value: group.key,
                    label: group.label,
                }))}
            />
        </nav>
    );
}
