// หน้ากำลังโหลดระหว่างเปลี่ยนหน้า (Next.js ใช้ไฟล์นี้อัตโนมัติ) — โครงร่างแทนหน้าว่าง
import { PageSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
    return (
        <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
            <PageSkeleton />
        </div>
    );
}
