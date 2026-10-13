"use client";

// หน้าเข้าสู่ระบบแบบสองฝั่ง (UI ใหม่ 13 ต.ค. 2026): ซ้าย = แบรนด์ สีถ่านของโลโก้ไล่ไปฟ้า · ขวา = ฟอร์ม · มือถือเหลือฟอร์มอย่างเดียว
// ใช้ทั้งหน้า "/" และ "/login"
import dynamic from "next/dynamic";
import Image from "next/image";
import Skeleton from "@/components/ui/skeleton";

const LoginForm = dynamic(() => import("./form-login"), {
    ssr: false,
    loading: () => (
        <div className="grid w-full max-w-sm gap-5" role="status" aria-label="กำลังโหลด">
            <Skeleton className="h-9 w-48" />
            <Skeleton className="h-11 w-full rounded-xl" />
            <Skeleton className="h-11 w-full rounded-xl" />
            <Skeleton className="h-11 w-full rounded-xl" />
        </div>
    ),
});

export default function LoginScreen() {
    return (
        <div className="grid min-h-screen bg-white lg:grid-cols-[1.05fr_1fr]">
            <section className="relative m-3 hidden flex-col justify-between gap-8 overflow-hidden rounded-[1.75rem] bg-[radial-gradient(80%_60%_at_100%_0%,rgb(59_130_246/0.55),transparent_60%),linear-gradient(160deg,var(--color-gray-700),var(--color-gray-900))] p-10 text-white lg:flex">
                {/* ลายตารางจางๆ */}
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgb(255_255_255/0.05)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255/0.05)_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(90%_80%_at_80%_20%,#000,transparent_75%)]"
                />
                <div className="relative flex items-center gap-3">
                    <Image
                        src="/logo1.png"
                        alt=""
                        width={44}
                        height={44}
                        className="h-11 w-11 rounded-2xl bg-white object-contain"
                    />
                    <span className="font-semibold tracking-[0.18em]">SOFTWORK</span>
                </div>
                <div className="relative grid gap-3">
                    <h2 className="max-w-[15ch] text-4xl font-light leading-tight">
                        ติดตามโปรเจกต์และงานขายในที่เดียว
                    </h2>
                    <p className="max-w-[40ch] text-gray-300">
                        ทีมเห็นงานของตัวเองชัดเจน ผู้บริหารเห็นภาพรวมทันที ลูกค้าดูความคืบหน้าผ่านลิงก์ที่ได้รับ
                    </p>
                </div>
                <p className="relative text-xs text-gray-400">© 2026 Softwork Development</p>
            </section>

            <section className="flex flex-col items-center justify-center gap-8 px-6 py-10">
                <div className="flex items-center gap-3 lg:hidden">
                    <Image
                        src="/logo1.png"
                        alt=""
                        width={40}
                        height={40}
                        className="h-10 w-10 rounded-xl object-contain ring-1 ring-gray-200"
                    />
                    <span className="font-semibold tracking-[0.18em] text-gray-700">SOFTWORK</span>
                </div>
                <LoginForm />
            </section>
        </div>
    );
}
