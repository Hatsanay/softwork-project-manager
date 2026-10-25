"use client";

// หน้าที่ลูกค้าเปิดผ่านลิงก์ (ไม่ต้องเข้าระบบ) — หน้าตาใหม่ U4 (2026-10-14) · ข้อมูลเหมือนเดิมทุกอย่าง
// backend กรองให้แล้ว: เห็นแค่ "สร้างงาน"/"เปลี่ยนสถานะ" และไม่มีชื่อพนักงานจริงในความเคลื่อนไหว · ส่วนใหญ่ลูกค้าเปิดจากมือถือ
// หน้าตาอยู่ที่ share-view.tsx (เดโมหน้า login ใช้ตัวเดียวกัน) · ไฟล์นี้ = โหลดข้อมูลจากลิงก์
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Link2Off } from "lucide-react";
import { CustomerLoading, CustomerNotice } from "@/components/customer/customer-shell";
import { api } from "@/app/constans";
import SharedProjectView, { ShareShell, type SharedProject, type SharedTask, type ShareShop, type TimelineEntry } from "./share-view";

export default function SharedProjectPage() {
    const params = useParams<{ token: string }>();
    const token = params.token;
    const [project, setProject] = useState<SharedProject | null>(null);
    const [tasks, setTasks] = useState<SharedTask[]>([]);
    const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
    const [shop, setShop] = useState<ShareShop | null>(null);
    const [notFound, setNotFound] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!token) return;
        let isLeftPage = false;
        fetch(`${api}/share/${token}`)
            .then(async (response) => {
                if (isLeftPage) return;
                if (!response.ok) {
                    setNotFound(true);
                    return;
                }
                const data = await response.json();
                setProject(data.project);
                setTasks(data.tasks ?? []);
                setTimeline(data.timeline ?? []);
                setShop(data.shop ?? null);
            })
            .catch(() => {
                if (!isLeftPage) setNotFound(true);
            })
            .finally(() => {
                if (!isLeftPage) setIsLoading(false);
            });
        return () => {
            isLeftPage = true;
        };
    }, [token]);

    if (isLoading) {
        return <CustomerLoading label="กำลังโหลดความคืบหน้า..." />;
    }

    if (notFound || !project) {
        return (
            <ShareShell>
                <CustomerNotice icon={Link2Off} title="เปิดลิงก์นี้ไม่ได้">
                    ลิงก์อาจถูกปิดใช้งาน หรือทีมงานสร้างลิงก์ใหม่แทนแล้ว ติดต่อทีมงานเพื่อขอลิงก์ล่าสุด
                </CustomerNotice>
            </ShareShell>
        );
    }

    return <SharedProjectView project={project} tasks={tasks} timeline={timeline} shop={shop} />;
}
