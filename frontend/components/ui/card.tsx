// การ์ดพื้นขาว มุมโค้งใหญ่ ขอบบาง เงาอ่อน — กล่องหลักของเนื้อหาทุกหน้า
import type { HTMLAttributes } from "react";

export const CARD_CLASS = "rounded-2xl border border-gray-200 bg-white shadow-card";

export default function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
    return <div className={`${CARD_CLASS} ${className}`} {...props} />;
}
