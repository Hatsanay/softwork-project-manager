"use client";

// ลิงก์สำหรับส่วนแสดงผล (View) ที่ใช้ทั้งในหน้าจริงและในเดโมหน้า login (docs/plans/2026-10-18-login-demo-real-ui.md)
// หน้าจริง: ทำงานเหมือน next/link ทุกอย่าง
// เดโม: ครอบด้วย <NoLinkPrefetch> → ไม่ prefetch หน้าในระบบตอนลิงก์โผล่บนจอ (คนที่ยังไม่ login ไม่ต้องโหลดหน้าที่เข้าไม่ได้)
import { createContext, useContext, type ComponentProps, type ReactNode } from "react";
import Link from "next/link";

const PrefetchContext = createContext<false | undefined>(undefined);

export function NoLinkPrefetch({ children }: { children: ReactNode }) {
    return <PrefetchContext.Provider value={false}>{children}</PrefetchContext.Provider>;
}

export default function ViewLink({ prefetch, ...props }: ComponentProps<typeof Link>) {
    const contextPrefetch = useContext(PrefetchContext);
    return <Link prefetch={contextPrefetch ?? prefetch} {...props} />;
}
