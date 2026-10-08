"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, BellRing, Loader2, LogIn, Mail, MailCheck, Pencil } from "lucide-react";
import { api } from "@/app/constans";

// ยืนยันอีเมลของตัวเองด้วยรหัส OTP 6 หลักทางอีเมล (กติกาแบบระบบ fasttiw — ดู backend/src/utils/emailOtp.js)
// ใช้ 2 ที่: ขั้นยืนยันอีเมลของ onboarding ตอนเข้าระบบครั้งแรก และปุ่ม "เปลี่ยน/เพิ่มอีเมล" ที่หน้าโปรไฟล์
// อีเมลถูกบันทึกเข้าบัญชีก็ต่อเมื่อกรอกรหัสถูกเท่านั้น (backend เป็นคนตรวจ ไม่ใช่หน้านี้)

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_LENGTH = 6;
const RESEND_COOLDOWN_SEC = 60; // กันกดขอรหัสรัวๆ — backend จำกัด 5 ครั้ง/ชม./อีเมล อยู่แล้ว

function authHeader() {
    return { Authorization: `Bearer ${localStorage.getItem("token")}` };
}

async function postJson(path: string, body: unknown) {
    const res = await fetch(`${api}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่");
    return data;
}

function PrimaryButton({ pending, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { pending?: boolean }) {
    return (
        <button
            {...props}
            disabled={props.disabled || pending}
            className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 text-white font-medium
                       shadow-sm shadow-blue-200 transition-colors hover:bg-blue-700
                       disabled:bg-blue-300 disabled:shadow-none disabled:cursor-not-allowed"
        >
            {pending && <Loader2 className="w-4 h-4 animate-spin" />}
            {children}
        </button>
    );
}

function StepIcon({ children }: { children: React.ReactNode }) {
    return (
        <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4 ring-8 ring-blue-50/50">
            {children}
        </div>
    );
}

// ช่องรหัส 6 ช่อง: พิมพ์แล้วเลื่อนช่องเอง, ลบย้อนกลับได้, วางรหัสทั้งชุดได้, ครบ 6 หลักแล้วยืนยันให้อัตโนมัติ
function OtpBoxes({ value, onChange, onComplete, disabled, error }: {
    value: string; onChange: (v: string) => void; onComplete: (v: string) => void; disabled?: boolean; error?: boolean;
}) {
    const refs = useRef<(HTMLInputElement | null)[]>([]);
    const digits = Array.from({ length: OTP_LENGTH }, (_, i) => value[i] ?? "");

    // รหัสผิดแล้วช่องถูกล้าง → พากลับไปช่องแรกให้พิมพ์ใหม่ได้ทันที ไม่ต้องคลิกเอง
    useEffect(() => {
        if (value === "" && !disabled) refs.current[0]?.focus();
    }, [value, disabled]);

    function update(next: string) {
        const clean = next.replace(/\D/g, "").slice(0, OTP_LENGTH);
        onChange(clean);
        if (clean.length === OTP_LENGTH) onComplete(clean);
        return clean;
    }

    function handleInput(i: number, raw: string) {
        const typed = raw.replace(/\D/g, "");
        if (!typed) return;
        // พิมพ์ทับช่องที่มีค่าแล้ว หรือมือถือเติมรหัสจาก SMS/อีเมลเข้ามาทีละหลายตัว
        const next = update(value.slice(0, i) + typed + value.slice(i + typed.length));
        refs.current[Math.min(next.length, OTP_LENGTH - 1)]?.focus();
    }

    function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === "Backspace") {
            e.preventDefault();
            if (digits[i]) update(value.slice(0, i) + value.slice(i + 1));
            else if (i > 0) { update(value.slice(0, i - 1) + value.slice(i)); refs.current[i - 1]?.focus(); }
        } else if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
        else if (e.key === "ArrowRight" && i < OTP_LENGTH - 1) refs.current[i + 1]?.focus();
    }

    function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
        e.preventDefault();
        const next = update(e.clipboardData.getData("text"));
        refs.current[Math.min(next.length, OTP_LENGTH - 1)]?.focus();
    }

    return (
        <div className="flex justify-between gap-2">
            {digits.map((d, i) => (
                <input
                    key={i}
                    ref={(el) => { refs.current[i] = el; }}
                    value={d}
                    onChange={(e) => handleInput(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    onPaste={handlePaste}
                    onFocus={(e) => e.target.select()}
                    inputMode="numeric"
                    autoComplete={i === 0 ? "one-time-code" : "off"}
                    aria-label={`รหัสหลักที่ ${i + 1}`}
                    autoFocus={i === 0}
                    disabled={disabled}
                    maxLength={OTP_LENGTH}
                    className={`w-full max-w-12 aspect-4/5 rounded-xl border-2 text-center text-2xl font-semibold text-gray-800
                                outline-none transition-colors disabled:bg-gray-50
                                ${error ? "border-red-300 bg-red-50/50 focus:border-red-400"
                                    : d ? "border-blue-200 bg-blue-50/40 focus:border-blue-500"
                                        : "border-gray-200 focus:border-blue-500"}`}
                />
            ))}
        </div>
    );
}

type Props = {
    initialEmail?: string;
    onVerified: (email: string) => void;
    verifyLabel?: string;
    // แสดงหัวข้อ/ไอคอน/คำอธิบายในตัวเอง (onboarding) หรือแค่ฟอร์มล้วนๆ (หน้าโปรไฟล์ที่มีหัวข้อของตัวเองแล้ว)
    showHeader?: boolean;
};

export default function EmailOtpForm({ initialEmail = "", onVerified, verifyLabel = "ยืนยันอีเมล", showHeader = false }: Props) {
    const [email, setEmail] = useState(initialEmail);
    const [sentTo, setSentTo] = useState<string | null>(null); // อีเมลที่ส่งรหัสไปแล้ว — มีค่า = อยู่ขั้นกรอกรหัส
    const [otp, setOtp] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [pending, setPending] = useState(false);
    const [cooldown, setCooldown] = useState(0);

    useEffect(() => {
        if (cooldown <= 0) return;
        const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
        return () => clearTimeout(timer);
    }, [cooldown]);

    async function requestOtp(target: string) {
        setError(null);
        if (!EMAIL_PATTERN.test(target)) { setError("รูปแบบอีเมลไม่ถูกต้อง เช่น name@example.com"); return; }

        setPending(true);
        try {
            await postJson("/users/me/email/otp", { email: target });
            setSentTo(target);
            setOtp("");
            setCooldown(RESEND_COOLDOWN_SEC);
            toast.success("ส่งรหัสยืนยันแล้ว กรุณาตรวจสอบอีเมล");
        } catch (err) {
            setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
        } finally {
            setPending(false);
        }
    }

    async function verify(code: string) {
        if (!sentTo || pending) return;
        setError(null);
        if (code.length !== OTP_LENGTH) { setError("กรุณากรอกรหัสให้ครบ 6 หลัก"); return; }

        setPending(true);
        try {
            await postJson("/users/me/email/verify", { email: sentTo, otp: code });
            toast.success("ยืนยันอีเมลสำเร็จ");
            onVerified(sentTo);
        } catch (err) {
            setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
            setOtp(""); // ล้างช่องให้กรอกใหม่ได้ทันที (ข้อความ error ยังอยู่)
        } finally {
            setPending(false);
        }
    }

    function changeEmail() {
        setSentTo(null);
        setOtp("");
        setError(null);
    }

    // ── ขั้นกรอกอีเมล ───────────────────────────────────────────────────────────
    if (!sentTo) {
        return (
            <div>
                {showHeader && (
                    <>
                        <StepIcon><Mail className="w-6 h-6" /></StepIcon>
                        <h1 className="text-xl font-bold text-gray-900">เพิ่มอีเมลของคุณ</h1>
                        <p className="mt-1 text-sm text-gray-500">บัญชีนี้ยังไม่มีอีเมล กรุณาเพิ่มและยืนยันก่อนเริ่มใช้งาน</p>
                        <ul className="mt-4 mb-6 space-y-2 rounded-xl bg-gray-50 p-3 text-sm text-gray-600">
                            <li className="flex items-center gap-2.5">
                                <BellRing className="w-4 h-4 shrink-0 text-blue-500" />
                                รับแจ้งเตือนเมื่อได้รับมอบหมายงานหรือถูกเพิ่มเข้าโปรเจกต์
                            </li>
                            <li className="flex items-center gap-2.5">
                                <LogIn className="w-4 h-4 shrink-0 text-blue-500" />
                                ใช้อีเมลเข้าสู่ระบบแทนชื่อผู้ใช้ได้
                            </li>
                        </ul>
                    </>
                )}
                <form onSubmit={(e) => { e.preventDefault(); requestOtp(email.trim()); }} className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                        <label htmlFor="otp-email" className="text-sm font-medium text-gray-700">อีเมล</label>
                        <div className="relative">
                            <Mail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400" />
                            <input
                                id="otp-email"
                                type="email"
                                inputMode="email"
                                autoComplete="email"
                                value={email}
                                onChange={(e) => { setEmail(e.target.value); setError(null); }}
                                placeholder="name@example.com"
                                autoFocus
                                disabled={pending}
                                className={`w-full h-11 rounded-lg border pl-10 pr-3 text-gray-800 outline-none transition
                                            focus:ring-4 disabled:bg-gray-50
                                            ${error ? "border-red-300 focus:border-red-400 focus:ring-red-100"
                                                : "border-gray-300 focus:border-blue-500 focus:ring-blue-100"}`}
                            />
                        </div>
                        {error
                            ? <p className="text-sm text-red-600">{error}</p>
                            : <p className="text-xs text-gray-400">เราจะส่งรหัสยืนยัน 6 หลักไปที่อีเมลนี้</p>}
                    </div>
                    <PrimaryButton type="submit" pending={pending} disabled={!email.trim()}>
                        {pending ? "กำลังส่งรหัส..." : <>ส่งรหัสยืนยัน <ArrowRight className="w-4 h-4" /></>}
                    </PrimaryButton>
                </form>
            </div>
        );
    }

    // ── ขั้นกรอกรหัส ────────────────────────────────────────────────────────────
    return (
        <div>
            {showHeader && (
                <>
                    <StepIcon><MailCheck className="w-6 h-6" /></StepIcon>
                    <h1 className="text-xl font-bold text-gray-900">ตรวจสอบอีเมลของคุณ</h1>
                </>
            )}
            <p className={`${showHeader ? "mt-1" : ""} text-sm text-gray-500`}>เราส่งรหัส 6 หลักไปที่</p>
            <div className="mt-1 mb-6 flex items-center gap-2">
                <span className="min-w-0 truncate font-medium text-gray-900">{sentTo}</span>
                <button
                    type="button"
                    onClick={changeEmail}
                    disabled={pending}
                    className="shrink-0 inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
                >
                    <Pencil className="w-3.5 h-3.5" /> แก้ไข
                </button>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); verify(otp); }} className="flex flex-col gap-4">
                <OtpBoxes
                    value={otp}
                    onChange={(v) => { setOtp(v); if (error) setError(null); }}
                    onComplete={verify}
                    disabled={pending}
                    error={!!error}
                />
                {error && <p className="text-sm text-red-600 -mt-1">{error}</p>}

                <PrimaryButton type="submit" pending={pending} disabled={otp.length !== OTP_LENGTH}>
                    {pending ? "กำลังตรวจสอบ..." : verifyLabel}
                </PrimaryButton>
            </form>

            <div className="mt-5 text-center text-sm text-gray-500">
                ไม่ได้รับรหัส?{" "}
                {cooldown > 0 ? (
                    <span className="text-gray-400">ขอรหัสใหม่ได้ใน <span className="tabular-nums">{cooldown}</span> วินาที</span>
                ) : (
                    <button
                        type="button"
                        onClick={() => requestOtp(sentTo)}
                        disabled={pending}
                        className="font-medium text-blue-600 hover:text-blue-700"
                    >
                        ส่งรหัสใหม่
                    </button>
                )}
            </div>
            <p className="mt-2 text-center text-xs text-gray-400">รหัสใช้ได้ 10 นาที · ถ้าไม่เจอให้ดูในโฟลเดอร์ Spam/จดหมายขยะ</p>
        </div>
    );
}
