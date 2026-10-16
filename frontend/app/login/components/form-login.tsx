"use client";

// ฟอร์มเข้าสู่ระบบ (UI ใหม่ 13 ต.ค. 2026 · ปรับ 16 ต.ค.) — เข้าไม่ได้ให้บอกเหตุผลค้างไว้บนหน้า (ไม่ใช่ toast ที่หายเองก่อนอ่านทัน)
// เตือน Caps Lock ใต้ช่องรหัสผ่าน (สาเหตุที่พบบ่อยของรหัสผิดจนโดนล็อก)
import { useActionState, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Loader2, LockKeyhole, UserRound } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { inputClass } from "@/components/ui/form-field";
import StatusBanner from "@/components/ui/guidance/status-banner";
import { handleLogin } from "../actions";

// กัน open redirect — ยอมรับเฉพาะ path ภายในเว็บ (ขึ้นต้นด้วย "/" แต่ไม่ใช่ "//" ที่เบราว์เซอร์ตีความเป็นโดเมนอื่น)
function safeRedirect(target: string | null): string {
    if (target && target.startsWith("/") && !target.startsWith("//")) return target;
    return "/dashboard";
}

// เบราว์เซอร์เติมรหัสอัตโนมัติแล้วพื้นช่องเป็นสีฟ้า/เหลือง — บังคับพื้นขาวให้เข้ากับการ์ด
const AUTOFILL_WHITE = "autofill:shadow-[inset_0_0_0_1000px_white]";

export default function LoginForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [state, formAction, pending] = useActionState(handleLogin, null);
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const [isCapsLockOn, setIsCapsLockOn] = useState(false);

    const errorMessage = state && "error" in state ? state.error : null;

    useEffect(() => {
        if (state && "token" in state) {
            localStorage.setItem("token", state.token);
            router.push(safeRedirect(searchParams.get("redirect")));
        }
    }, [state, router, searchParams]);

    return (
        <form action={formAction} className="grid w-full gap-5">
            <div className="grid gap-1.5">
                <h1 className="text-[1.6rem] font-medium text-gray-900 sm:text-[1.75rem]">ยินดีต้อนรับกลับ</h1>
                <p className="text-sm text-gray-500">เข้าสู่ระบบด้วยชื่อผู้ใช้หรืออีเมลที่ผู้ดูแลระบบสร้างให้</p>
            </div>

            {errorMessage && (
                <StatusBanner tone="error" title="เข้าสู่ระบบไม่สำเร็จ">
                    {errorMessage}
                </StatusBanner>
            )}

            <div className="grid gap-1.5">
                <label htmlFor="login" className="text-sm text-gray-800">
                    ชื่อผู้ใช้หรืออีเมล
                </label>
                <div className="relative">
                    <UserRound
                        size={16}
                        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                    <input
                        id="login"
                        type="text"
                        name="login"
                        autoComplete="username"
                        required
                        className={`${inputClass(Boolean(errorMessage))} ${AUTOFILL_WHITE} pl-10`}
                    />
                </div>
            </div>

            <div className="grid gap-1.5">
                <label htmlFor="user_password" className="text-sm text-gray-800">
                    รหัสผ่าน
                </label>
                <div className="relative">
                    <LockKeyhole
                        size={16}
                        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                    <input
                        id="user_password"
                        type={isPasswordVisible ? "text" : "password"}
                        name="user_password"
                        autoComplete="current-password"
                        required
                        onKeyUp={(event) => setIsCapsLockOn(event.getModifierState("CapsLock"))}
                        onBlur={() => setIsCapsLockOn(false)}
                        className={`${inputClass(Boolean(errorMessage))} ${AUTOFILL_WHITE} pl-10 pr-16`}
                    />
                    <button
                        type="button"
                        onClick={() => setIsPasswordVisible((visible) => !visible)}
                        className={buttonClass("ghost", "sm", "absolute right-1.5 top-1/2 -translate-y-1/2")}
                    >
                        {isPasswordVisible ? "ซ่อน" : "แสดง"}
                    </button>
                </div>
                {isCapsLockOn && (
                    <p className="text-xs font-medium text-amber-600">
                        Caps Lock เปิดอยู่ — รหัสผ่านแยกตัวพิมพ์เล็ก/ใหญ่
                    </p>
                )}
                <p className="text-xs leading-relaxed text-gray-500">
                    ลืมรหัสผ่าน ให้ผู้ดูแลระบบรีเซ็ตให้ · ใส่ผิดหลายครั้งระบบจะล็อกชั่วคราว
                </p>
            </div>

            <button
                type="submit"
                disabled={pending}
                className={buttonClass("primary", "md", "group h-12 text-[0.95rem]")}
            >
                {pending ? (
                    <>
                        <Loader2 size={18} className="animate-spin" />
                        กำลังเข้าสู่ระบบ...
                    </>
                ) : (
                    <>
                        เข้าสู่ระบบ
                        <ArrowRight size={18} className="transition-transform group-hover:translate-x-0.5" />
                    </>
                )}
            </button>
        </form>
    );
}
