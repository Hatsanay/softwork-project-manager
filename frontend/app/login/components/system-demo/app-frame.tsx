"use client";

// โครงหน้าระบบในจอเดโม = แถบเมนูซ้าย + แถบบน ตัวจริง (SidebarPanel / NavbarView) + พื้นที่เนื้อหา
// ระยะห่างและพื้นหลังตาม app/(protected)/layout.tsx · ความสูงยึดจอเสมือน (ไม่ใช่ h-screen ของจอจริง)
// ฉากส่งเนื้อหาของหน้าจริง (View) เข้ามาเป็น children · scrollY = เลื่อนเนื้อหาลงเหมือนคนเลื่อนจอ
import { useLayoutEffect, useRef, type ReactNode } from "react";
import SidebarPanel, { getInitialOpen } from "@/app/components/sidebar-panel";
import NavbarView from "@/app/components/navbar-view";
import { findBreadcrumbs } from "@/app/components/bit";
import { DEMO_MENU, DEMO_USER } from "./story";

const noop = () => undefined;

export default function AppFrame({
    pathname,
    breadcrumbs,
    scrollY = 0,
    overlay,
    children,
}: {
    // หน้าที่เปิดอยู่ (ใช้เลือกเมนูและ breadcrumb เหมือนหน้าจริง)
    pathname: string;
    // breadcrumb ที่ต่อท้ายเอง (เช่น เลขเอกสาร) — ไม่ส่ง = ตามเมนู
    breadcrumbs?: string[];
    scrollY?: number;
    // หน้าต่างที่บังทั้งจอ (ถ้าฉากไม่ได้ใช้ ConfirmDialog ตัวจริงที่อยู่ในเนื้อหา)
    overlay?: ReactNode;
    children: ReactNode;
}) {
    const sidebarRef = useRef<HTMLDivElement>(null);

    // เมนูกลุ่มที่กางยาวจนเลยจอ: เลื่อนแถบเมนูให้เห็นเมนูของหน้านี้ (แถบเมนูจริงเลื่อนได้เหมือนกัน)
    useLayoutEffect(() => {
        const sidebar = sidebarRef.current;
        if (!sidebar) return;
        const nav = sidebar.querySelector("nav");
        const active = sidebar.querySelector<HTMLElement>('nav [aria-current="page"]');
        if (!nav || !active) return;
        const overflow = active.offsetTop + active.offsetHeight - (nav.clientHeight - 12);
        nav.scrollTop = Math.max(0, overflow);
    }, [pathname]);

    return (
        <div className="absolute inset-0 isolate flex overflow-hidden bg-gray-50 text-gray-700">
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-96 bg-[radial-gradient(60%_100%_at_70%_0%,rgb(59_130_246/0.10),transparent_70%),radial-gradient(40%_80%_at_10%_0%,rgb(96_165_250/0.08),transparent_70%)]"
            />
            <aside ref={sidebarRef} className="h-full w-[17rem] shrink-0 py-3.5 pl-3.5">
                <SidebarPanel
                    items={DEMO_MENU}
                    pathname={pathname}
                    openItems={getInitialOpen(DEMO_MENU, pathname)}
                    isCompact={false}
                    isMobile={false}
                    canSearch
                    user={DEMO_USER}
                    onToggleSubmenu={noop}
                    onToggleCollapsed={noop}
                    onOpenSearch={noop}
                    onCloseMobile={noop}
                    onNavigate={noop}
                />
            </aside>
            <div className="relative flex min-w-0 flex-1 flex-col">
                <NavbarView
                    breadcrumbs={breadcrumbs ?? findBreadcrumbs(pathname)}
                    firstName={DEMO_USER.firstName}
                    avatarUrl={DEMO_USER.avatarUrl}
                    isMenuOpen={false}
                    onToggleMenu={noop}
                    onOpenMobileMenu={noop}
                />
                <main className="min-h-0 min-w-0 flex-1 overflow-hidden px-4 py-5 sm:px-6 lg:px-8">
                    <div
                        className="transition-transform duration-700 ease-in-out"
                        style={{ transform: `translateY(${-scrollY}px)` }}
                    >
                        {children}
                    </div>
                </main>
            </div>
            {overlay}
        </div>
    );
}
