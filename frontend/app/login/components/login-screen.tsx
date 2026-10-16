"use client";

// หน้าเข้าสู่ระบบ (UI ใหม่ 16 ต.ค. 2026 — ผู้ใช้เลือก "พื้นขาวทั้งหน้า ใช้ฟ้าแค่เป็นจุดเน้น")
// จอคอม: ซ้าย = แผงแนะนำระบบบนพื้นเทาอ่อน + สไลด์ความสามารถ (feature-carousel.tsx) · ขวา = การ์ดฟอร์ม
// มือถือ: โลโก้ + การ์ดฟอร์ม + สไลด์แบบย่อ · ทุกส่วนค่อยๆ ขึ้นตอนเปิดหน้า (ปิดเมื่อเครื่องตั้งลดการเคลื่อนไหว)
// ใช้ทั้งหน้า "/" และ "/login" · สีตามธีม: เทา + ฟ้า blue-500/600 เฉพาะจุดเน้น (คำหลัก ไอคอน ปุ่ม)
import dynamic from "next/dynamic";
import Image from "next/image";
import Skeleton from "@/components/ui/skeleton";
import FeatureCarousel from "./feature-carousel";

const LoginForm = dynamic(() => import("./form-login"), {
    ssr: false,
    loading: () => (
        <div className="grid w-full gap-5" role="status" aria-label="กำลังโหลด">
            <Skeleton className="h-9 w-48" />
            <Skeleton className="h-11 w-full rounded-xl" />
            <Skeleton className="h-11 w-full rounded-xl" />
            <Skeleton className="h-11 w-full rounded-xl" />
        </div>
    ),
});

function BrandMark() {
    return (
        <div className="flex items-center gap-3">
            <Image
                src="/logo1.png"
                alt=""
                width={44}
                height={44}
                className="h-11 w-11 rounded-2xl bg-white object-contain ring-1 ring-gray-200"
            />
            <div className="grid leading-tight">
                <span className="font-semibold tracking-[0.18em] text-gray-800">SOFTWORK</span>
                <span className="text-xs text-gray-500">Project Manager</span>
            </div>
        </div>
    );
}

export default function LoginScreen() {
    return (
        <div className="grid min-h-screen bg-white lg:grid-cols-[1.05fr_1fr]">
            {/* ── จอคอม: แผงแนะนำระบบ ── */}
            <section className="relative m-3 hidden flex-col justify-between gap-10 overflow-hidden rounded-[1.75rem] border border-gray-200/70 bg-gray-50 p-10 lg:flex xl:p-12">
                {/* ลายจุดจางๆ มุมขวาบน */}
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgb(37_99_235/0.12)_1px,transparent_1px)] bg-[size:20px_20px] [mask-image:radial-gradient(60%_55%_at_100%_0%,#000,transparent_75%)]"
                />
                <div className="relative">
                    <BrandMark />
                </div>

                <div className="relative grid gap-8">
                    <div className="grid gap-3 motion-safe:animate-fade-up">
                        <h2 className="max-w-[17ch] text-4xl font-light leading-tight text-gray-900 xl:text-[2.6rem]">
                            ติดตามโปรเจกต์ งานขาย และค่าใช้จ่าย <span className="text-blue-600">ในที่เดียว</span>
                        </h2>
                        <p className="max-w-[44ch] text-gray-500">
                            ระบบงานของบริษัท — ตั้งแต่รับงาน ทำงาน ออกเอกสาร จนรับเงินและจ่ายเงิน
                        </p>
                    </div>

                    <div className="max-w-md motion-safe:animate-fade-up [animation-delay:150ms]">
                        <FeatureCarousel />
                    </div>
                </div>

                <p className="relative text-xs text-gray-400">© 2026 Softwork Development</p>
            </section>

            {/* ── ฟอร์ม ── */}
            <section className="flex flex-col items-center px-4 pb-8 pt-[max(2rem,env(safe-area-inset-top))] sm:px-6 lg:justify-center lg:px-10 lg:py-10">
                <div className="grid w-full max-w-md gap-6">
                    {/* มือถือ/แท็บเล็ต: โลโก้ด้านบน */}
                    <div className="lg:hidden">
                        <BrandMark />
                    </div>

                    <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-[0_12px_40px_-12px_rgb(15_23_42/0.12)] sm:p-8 motion-safe:animate-fade-up">
                        <LoginForm />
                    </div>

                    {/* มือถือ: สไลด์แนะนำระบบแบบย่อ (แผงแนะนำของจอคอมซ่อนอยู่) */}
                    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 lg:hidden motion-safe:animate-fade-up [animation-delay:200ms]">
                        <FeatureCarousel compact />
                    </div>
                    <p className="text-center text-xs text-gray-400 lg:hidden">© 2026 Softwork Development</p>
                </div>
            </section>
        </div>
    );
}
