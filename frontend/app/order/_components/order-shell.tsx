// กรอบหน้าของลิงก์เลือกบริการ (ลูกค้า) — ใช้กรอบหน้าลูกค้ากลาง (components/customer) ให้ทุกหน้าลูกค้าเป็นแบบเดียวกัน
// wide = หน้าเลือกบริการบนจอคอม (สินค้าซ้าย ตะกร้าขวา) · hasBottomBar = มีแถบตะกร้าติดล่างจอ
// main เป็นคอลัมน์เดียว minmax(0,1fr): ของที่กว้างกว่าจอ (แถบหมวด) เลื่อนในตัวเอง ไม่ดันทั้งหน้าล้น
import CustomerShell from "@/components/customer/customer-shell";
import type { ShopInfo } from "../_types";

export default function OrderShell({
    shop,
    subtitle,
    wide = false,
    hasBottomBar = false,
    children,
}: {
    shop: ShopInfo | null;
    subtitle: string;
    wide?: boolean;
    hasBottomBar?: boolean;
    children: React.ReactNode;
}) {
    return (
        <CustomerShell shop={shop} label={subtitle} width={wide ? "wide" : "narrow"} hasBottomBar={hasBottomBar}>
            {children}
        </CustomerShell>
    );
}
