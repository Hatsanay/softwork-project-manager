// การ์ดของแต่ละส่วนในฟอร์ม/หน้าตั้งค่า (UI ใหม่ 13 ต.ค. 2026): การ์ดกลาง + ไอคอนหัวข้อในกรอบฟ้าอ่อน (ถ้ามี)
import type { LucideIcon } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { CARD_CLASS } from "@/components/ui/card";

type SectionCardProps = {
    // ปลายทางของลิงก์ในหน้า เช่น "#project-tasks" จากกล่อง "ต่อไปต้องทำ" (2026-10-31)
    id?: string;
    title: string;
    description?: React.ReactNode;
    icon?: LucideIcon;
    actions?: React.ReactNode;
    children: React.ReactNode;
};

export default function SectionCard({ id, title, description, icon: Icon, actions, children }: SectionCardProps) {
    return (
        // scroll-mt: เลื่อนมาแล้วหัวการ์ดไม่จมใต้แถบบนที่ติดหน้าจอ
        <section id={id} className={`grid scroll-mt-24 gap-5 p-5 sm:p-6 ${CARD_CLASS}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                {/* หัวข้อยืดเต็มที่เหลือ (ขั้นต่ำ 18rem) — ปุ่มจึงอยู่มุมขวาบรรทัดเดียวกัน ตกบรรทัดเฉพาะจอแคบ */}
                <div className="flex min-w-0 flex-1 basis-72 items-start gap-3.5">
                    {Icon && (
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                            <Icon size={19} />
                        </span>
                    )}
                    <div className="grid max-w-3xl gap-0.5">
                        <h2 className="text-base font-medium text-gray-900">{title}</h2>
                        {description && <p className="text-sm text-gray-500">{description}</p>}
                    </div>
                </div>
                {actions && <div className="shrink-0">{actions}</div>}
            </div>
            {children}
        </section>
    );
}

// ปุ่มตามแบบใหม่ — คงชื่อเดิมไว้ให้แท็บที่ใช้อยู่ไม่ต้องแก้
export const PRIMARY_BUTTON = buttonClass("primary", "md");
export const SECONDARY_BUTTON = buttonClass("secondary", "md");
