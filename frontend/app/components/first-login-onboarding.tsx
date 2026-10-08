"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Image from "next/image";
import { Check, KeyRound, UserRound } from "lucide-react";
import { api } from "@/app/constans";
import Input from "@/components/ui/Input/input";
import Button from "@/components/ui/Button/Button";
import AvatarCrop from "@/components/ui/AvatarCrop";
import EmailOtpForm from "@/app/components/email-otp-form";

// ขั้นตอนเข้าระบบครั้งแรกของผู้ใช้ที่แอดมินสร้างให้ (แนวเดียวกับ onboarding ของระบบ fasttiw)
//   1) ตั้งรหัสผ่านใหม่แทนรหัสชั่วคราว   — เมื่อ user_must_change_password
//   2) เพิ่มอีเมล + ยืนยันด้วย OTP          — เมื่อแอดมินไม่ได้ใส่อีเมลไว้
//   3) อัปโหลดรูปโปรไฟล์ (ข้ามได้)
// ขั้น 1-2 บังคับ: layout จะแสดงหน้านี้แทนระบบทุกครั้งจนกว่าจะทำครบ (ออกกลางทางแล้ว login ใหม่ก็กลับมาที่ขั้นที่ค้าง)
// ขั้น 3 ไม่บังคับ — แสดงต่อท้ายเฉพาะตอนที่เพิ่งทำขั้นก่อนหน้าเสร็จในรอบนี้

type Step = "password" | "email" | "avatar";

const STEP_LABEL: Record<Step, string> = {
    password: "ตั้งรหัสผ่านใหม่",
    email: "ยืนยันอีเมล",
    avatar: "รูปโปรไฟล์",
};

function authHeader() {
    return { Authorization: `Bearer ${localStorage.getItem("token")}` };
}

type Props = {
    mustChangePassword: boolean;
    needsEmail: boolean;
    fullname: string;
    username: string;
};

export default function FirstLoginOnboarding({ mustChangePassword, needsEmail, fullname, username }: Props) {
    const router = useRouter();
    const steps: Step[] = [
        ...(mustChangePassword ? (["password"] as Step[]) : []),
        ...(needsEmail ? (["email"] as Step[]) : []),
        "avatar",
    ];
    const [stepIndex, setStepIndex] = useState(0);
    const step = steps[stepIndex];
    const next = () => setStepIndex((i) => Math.min(i + 1, steps.length - 1));

    // ── ขั้น 1: ตั้งรหัสผ่านใหม่ ──────────────────────────────────────────────
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [passwordError, setPasswordError] = useState<string | null>(null);
    const [pending, setPending] = useState(false);

    async function handlePasswordSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setPasswordError(null);
        if (newPassword.length < 8) { setPasswordError("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร"); return; }
        if (newPassword !== confirmPassword) { setPasswordError("รหัสผ่านไม่ตรงกัน"); return; }

        setPending(true);
        try {
            const res = await fetch(`${api}/users/me/password`, {
                method: "PUT",
                headers: { "Content-Type": "application/json", ...authHeader() },
                body: JSON.stringify({ new_password: newPassword }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.message ?? "เกิดข้อผิดพลาด");
            toast.success("ตั้งรหัสผ่านใหม่สำเร็จ");
            next();
        } catch (err) {
            setPasswordError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
        } finally {
            setPending(false);
        }
    }

    // ── ขั้น 3: รูปโปรไฟล์ ─────────────────────────────────────────────────────
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [avatarError, setAvatarError] = useState<string | null>(null);

    // จบ onboarding: refresh ให้ layout (server) อ่านสถานะใหม่จาก backend แล้วแสดงระบบตามปกติ
    function finish() {
        router.refresh();
    }

    async function handleAvatarSubmit() {
        if (!avatarFile) return;
        setAvatarError(null);
        setPending(true);
        try {
            const fd = new FormData();
            fd.append("image", avatarFile);
            const res = await fetch(`${api}/users/me/image`, { method: "PUT", headers: authHeader(), body: fd });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.message ?? "อัปโหลดรูปไม่สำเร็จ");
            toast.success("บันทึกรูปโปรไฟล์สำเร็จ");
            finish();
        } catch (err) {
            setAvatarError(err instanceof Error ? err.message : "อัปโหลดรูปไม่สำเร็จ");
            setPending(false);
        }
    }

    const initials = (fullname || username || "?").trim().charAt(0).toUpperCase();

    return (
        <div className="min-h-screen bg-linear-to-b from-blue-50 via-gray-50 to-gray-50 px-4 py-8 sm:py-14">
            <div className="mx-auto w-full max-w-md">
                {/* แบรนด์ */}
                <div className="mb-6 flex items-center justify-center gap-2.5">
                    <Image src="/logo1.png" alt="Softwork Development" width={36} height={36} className="object-contain" />
                    <span className="text-base font-semibold tracking-wide text-gray-800">Softwork Project Manager</span>
                </div>

                <div className="rounded-2xl border border-gray-100 bg-white shadow-xl shadow-blue-900/5">
                    {/* ต้อนรับ + ตัวบอกขั้นตอน */}
                    <div className="border-b border-gray-100 px-6 pt-6 pb-5">
                        <div className="flex items-center gap-3">
                            <span className="w-10 h-10 shrink-0 rounded-full bg-blue-600 text-white flex items-center justify-center font-semibold">
                                {initials}
                            </span>
                            <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-gray-900">
                                    ยินดีต้อนรับ{fullname ? ` คุณ${fullname}` : ""}
                                </p>
                                <p className="text-xs text-gray-500">
                                    ชื่อผู้ใช้ <span className="font-medium text-gray-700 break-all">{username}</span>
                                    <span className="hidden sm:inline"> · </span>
                                    <span className="block sm:inline">ตั้งค่าบัญชีให้เสร็จก่อนเริ่มใช้งาน</span>
                                </p>
                            </div>
                        </div>

                        <ol className="mt-5 flex items-start">
                            {steps.map((s, i) => {
                                const done = i < stepIndex;
                                const current = i === stepIndex;
                                return (
                                    <li key={s} className="relative flex flex-1 flex-col items-center text-center">
                                        {i > 0 && (
                                            <span className={`absolute right-1/2 top-3.5 h-0.5 w-full ${done || current ? "bg-blue-500" : "bg-gray-200"}`} />
                                        )}
                                        <span
                                            className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ring-4 ring-white ${
                                                done ? "bg-blue-500 text-white" : current ? "bg-blue-600 text-white shadow-md shadow-blue-200" : "bg-gray-100 text-gray-400"
                                            }`}
                                        >
                                            {done ? <Check className="w-4 h-4" /> : i + 1}
                                        </span>
                                        <span className={`mt-1.5 text-xs ${current ? "font-medium text-gray-900" : done ? "text-gray-600" : "text-gray-400"}`}>
                                            {STEP_LABEL[s]}
                                        </span>
                                    </li>
                                );
                            })}
                        </ol>
                    </div>

                    <div className="px-6 py-6">

                {step === "password" && (
                    <>
                        <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4 ring-8 ring-blue-50/50">
                            <KeyRound className="w-6 h-6" />
                        </div>
                        <h1 className="text-xl font-bold text-gray-900 mb-1">ตั้งรหัสผ่านใหม่</h1>
                        <p className="text-sm text-gray-500 mb-6">
                            เพื่อความปลอดภัย กรุณาตั้งรหัสผ่านใหม่แทนรหัสผ่านชั่วคราวก่อนใช้งานต่อ
                        </p>
                        <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-4">
                            <div className="flex flex-col gap-1">
                                <label className="text-sm font-medium text-gray-700">รหัสผ่านใหม่</label>
                                <Input
                                    type="password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    placeholder="อย่างน้อย 8 ตัวอักษร"
                                    error={!!passwordError}
                                    autoFocus
                                />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-sm font-medium text-gray-700">ยืนยันรหัสผ่านใหม่</label>
                                <Input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="กรอกรหัสผ่านอีกครั้ง"
                                    error={!!passwordError}
                                />
                            </div>
                            {passwordError && <p className="text-sm text-red-600">{passwordError}</p>}
                            <Button type="submit" disabled={pending}>
                                {pending ? "กำลังบันทึก..." : "ถัดไป"}
                            </Button>
                        </form>
                    </>
                )}

                {step === "email" && (
                    <EmailOtpForm onVerified={next} verifyLabel="ยืนยันและถัดไป" showHeader />
                )}

                {step === "avatar" && (
                    <>
                        <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4 ring-8 ring-blue-50/50">
                            <UserRound className="w-6 h-6" />
                        </div>
                        <h1 className="text-xl font-bold text-gray-900 mb-1">รูปโปรไฟล์</h1>
                        <p className="text-sm text-gray-500 mb-6">
                            ให้เพื่อนร่วมทีมจำคุณได้ง่ายขึ้น จะข้ามไปก่อนแล้วเพิ่มทีหลังที่หน้าโปรไฟล์ก็ได้
                        </p>
                        <div className="flex flex-col gap-4">
                            <AvatarCrop onChange={(file) => { setAvatarFile(file); setAvatarError(null); }} disabled={pending} />
                            {avatarError && <p className="text-sm text-red-600">{avatarError}</p>}
                            <Button type="button" onClick={handleAvatarSubmit} disabled={pending || !avatarFile}>
                                {pending ? "กำลังบันทึก..." : "บันทึกและเริ่มใช้งาน"}
                            </Button>
                            <button
                                type="button"
                                onClick={finish}
                                disabled={pending}
                                className="text-sm text-gray-500 hover:text-gray-700"
                            >
                                ข้ามไปก่อน
                            </button>
                        </div>
                    </>
                )}
                    </div>
                </div>

                <p className="mt-6 text-center text-xs text-gray-400">
                    มีปัญหาในการตั้งค่าบัญชี? ติดต่อผู้ดูแลระบบของทีมคุณ
                </p>
            </div>
        </div>
    );
}
