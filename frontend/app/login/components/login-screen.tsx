"use client";

// หน้าเข้าสู่ระบบ (UI ใหม่ 16 ต.ค. 2026 — ผู้ใช้เลือก "พื้นขาวทั้งหน้า ใช้ฟ้าแค่เป็นจุดเน้น")
// จอคอม: ซ้าย = แผงแนะนำระบบบนพื้นเทาอ่อน + เดโมหน้าจอจริงแบบเคลื่อนไหว (system-demo/ — 18 ต.ค. 2026) · ขวา = การ์ดฟอร์ม
// มือถือ: โลโก้ + การ์ดฟอร์ม + สไลด์แบบย่อ · ทุกส่วนค่อยๆ ขึ้นตอนเปิดหน้า (ปิดเมื่อเครื่องตั้งลดการเคลื่อนไหว)
// พื้นมีอนุภาคลอย (26 ต.ค. 2026 · ตัวเดียวกับหน้าลูกค้า): เห็นรอบฟอร์ม · แผงแนะนำบนจอคอมพื้นทึบบังไว้ ไม่แย่งสายตากับเดโม
// ใช้ทั้งหน้า "/" และ "/login" · สีตามธีม: เทา + ฟ้า blue-500/600 เฉพาะจุดเน้น (คำหลัก ไอคอน ปุ่ม)
import dynamic from "next/dynamic";
import Image from "next/image";
import ParticleBackground from "@/components/ui/particle-background";
import Skeleton from "@/components/ui/skeleton";
import FeatureCarousel from "./feature-carousel";
// เดโมสร้างฝั่งเครื่องผู้ใช้อย่างเดียว: ข้อมูลตัวอย่างนับวันที่จาก "วันนี้" ของเครื่อง (ไม่ให้ HTML จากเซิร์ฟเวอร์กับเครื่องไม่ตรงกัน)
// และโหลดแยกจากฟอร์ม login (โค้ดหน้าจริงที่เดโมใช้ไม่ทำให้ฟอร์มขึ้นช้าลง)
const SystemDemo = dynamic(() => import("./system-demo/system-demo"), {
    ssr: false,
    // จองที่ไว้เท่าคำอธิบาย 2 บรรทัด + จอ (สัดส่วนจอเสมือน) หน้าจะได้ไม่กระโดดตอนเดโมโหลดเสร็จ
    loading: () => <div className="aspect-[1024/760] w-full" aria-hidden="true" />,
});

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
        <div className="isolate grid min-h-screen bg-white lg:grid-cols-[1.35fr_1fr]">
            <ParticleBackground />
            {/* ── จอคอม: แผงแนะนำระบบ ── */}
            <section className="relative m-3 hidden flex-col justify-between gap-8 overflow-hidden rounded-[1.75rem] border border-gray-200/70 bg-gray-50 p-8 lg:flex xl:p-10">
                {/* ลายจุดจางๆ มุมขวาบน */}
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgb(37_99_235/0.12)_1px,transparent_1px)] bg-[size:20px_20px] [mask-image:radial-gradient(60%_55%_at_100%_0%,#000,transparent_75%)]"
                />
                <div className="relative">
                    <BrandMark />
                </div>

                <div className="relative grid gap-6">
                    <div className="grid gap-2 motion-safe:animate-fade-up">
                        <h2 className="text-3xl font-light leading-tight text-gray-900 xl:text-[2.1rem]">
                            ระบบงานของบริษัท <span className="text-blue-600">ในที่เดียว</span>
                        </h2>
                        <SystemDemo />
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
