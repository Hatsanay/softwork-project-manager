"use server";

import { cookies, headers } from "next/headers";
import { api } from "../constans";

/**
 * ค่าตั้งของ cookie เข้าระบบ · secure เมื่อเปิดเว็บผ่าน https (production) ให้ cookie ไม่ถูกส่งผ่าน http (A-1 · 2026-11-02)
 * ดูจาก Origin ของคำขอ server action (เบราว์เซอร์ส่งมาเสมอ) · dev บน http://localhost ไม่ใส่ secure ไม่งั้น cookie ไม่ถูกเก็บ
 */
async function sessionCookieOptions(httpOnly = true) {
    const origin = (await headers()).get("origin") ?? "";
    return { httpOnly, path: "/", sameSite: "lax" as const, secure: origin.startsWith("https://") };
}

/**
 * เก็บ token ใหม่ลง cookie (หลังเปลี่ยนรหัสผ่าน/ออกจากระบบเครื่องอื่น backend ออก token ใหม่ให้เครื่องนี้ · A-1)
 * ตรวจกับ backend ก่อนว่า token ใช้ได้จริง ไม่รับค่าอะไรก็ได้มาตั้งเป็น cookie
 */
export async function storeSessionToken(token: string): Promise<boolean> {
    const response = await fetch(`${api}/users/me`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
    }).catch(() => null);
    if (!response?.ok) return false;
    const cookieStore = await cookies();
    cookieStore.set("token", token, await sessionCookieOptions());
    return true;
}

type State = { error: string } | { token: string } | null;

export async function handleLogin(_prevState: State, formData: FormData): Promise<State> {
    try {
        // ช่องเดียวรับได้ทั้งอีเมลและชื่อผู้ใช้ (ผู้ใช้ที่แอดมินสร้างโดยไม่ใส่อีเมลมีแค่ชื่อผู้ใช้)
        const login = formData.get("login");
        const user_password = formData.get("user_password");

        const res = await fetch(`${api}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ login, user_password }),
        });

        if (res.status === 429) {
            // backend ล็อกชั่วคราวเพราะใส่รหัสผิดหลายครั้ง — ส่งข้อความ (บอกว่าต้องรอกี่นาที) ต่อให้ผู้ใช้ตรงๆ
            const body = await res.json().catch(() => null);
            return { error: body?.message ?? "พยายามเข้าสู่ระบบหลายครั้งเกินไป กรุณาลองใหม่ภายหลัง" };
        }
        if (!res.ok) return { error: "อีเมล/ชื่อผู้ใช้ หรือรหัสผ่านไม่ถูกต้อง" };

        const { token } = await res.json();

        const { user_role_id, user_id } = decodeToken(token);

        const permRes = await fetch(`${api}/auth/verifyPermission?user_role_id=${user_role_id}`, {
            headers: { Authorization: `Bearer ${token}` },
        });

        if (!permRes.ok) return { error: "ไม่สามารถตรวจสอบสิทธิ์ได้" };

        const { role_permission } = await permRes.json();

        const cookieStore = await cookies();
        const options = await sessionCookieOptions();
        cookieStore.set("token", token, options);
        cookieStore.set("permission", role_permission, options);
        cookieStore.set("userId", String(user_id), options);

        const fullname = await getFullName();
        cookieStore.set("fullname", String(fullname), await sessionCookieOptions(false));

        return { token };
    } catch {
        return { error: "เกิดข้อผิดพลาด กรุณาลองใหม่" };
    }
}

function decodeToken(token: string): { user_role_id: number; user_id: number } {
    const payload = token.split(".")[1];
    return JSON.parse(Buffer.from(payload, "base64").toString());
}

export async function getFullName(): Promise<string> {
    return (await getUserProfile()).fullname;
}

type UserProfile = {
    fullname: string;
    avatarUrl: string | null;
    mustChangePassword: boolean;
    roleName: string;
    username: string;
    needsEmail: boolean;
    // สิทธิ์ล่าสุดจาก backend ("" = ดึงไม่ได้ ให้ใช้ค่าที่จำไว้ตอน login แทน)
    permission: string;
    // backend ตอบ 401: token หมดอายุหรือถูกยกเลิก (เปลี่ยนรหัสผ่านจากเครื่องอื่น · A-1) → layout ส่งไปหน้า login
    isSignedOut: boolean;
};

const EMPTY_PROFILE: UserProfile = {
    fullname: "",
    avatarUrl: null,
    mustChangePassword: false,
    roleName: "",
    username: "",
    needsEmail: false,
    permission: "",
    isSignedOut: false,
};

export async function getUserProfile(): Promise<UserProfile> {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return EMPTY_PROFILE;

    // backend ใช้ user_id จาก token เสมอ ไม่ต้องส่ง user_id ไปเอง
    // ต่อ backend ไม่ติด (กำลังรีสตาร์ท/ล่มชั่วคราว) → fetch โยน "fetch failed" ถ้าไม่ดักไว้ layout ทั้งหน้าจะพัง
    // ทั้งที่แค่ชื่อ/รูปบน navbar หายไป — ถอยไปใช้โปรไฟล์ว่างแทน หน้ายังแสดงได้ และกลับมาปกติเองเมื่อรีเฟรชหลัง backend ขึ้น
    let res: Response;
    try {
        res = await fetch(`${api}/users/me`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
        });
    } catch (err) {
        console.error("[getUserProfile] ต่อ backend ไม่ได้:", err instanceof Error ? err.message : err);
        return EMPTY_PROFILE;
    }

    if (res.status === 401) return { ...EMPTY_PROFILE, isSignedOut: true };
    if (!res.ok) return EMPTY_PROFILE;

    const data = await res.json();
    const serverBase = new URL(api).origin;
    return {
        fullname: data.user_fullname ?? data.fullname ?? "",
        avatarUrl: data.user_avatar_url ? `${serverBase}${data.user_avatar_url}` : null,
        mustChangePassword: !!data.user_must_change_password,
        roleName: data.role_name ?? "",
        username: data.user_username ?? "",
        // แอดมินสร้างบัญชีโดยไม่ใส่อีเมล → ต้องยืนยันอีเมลด้วย OTP ก่อนใช้งานระบบ (ขั้นที่ 2 ของ onboarding)
        needsEmail: !data.user_email,
        permission: typeof data.role_permission === "string" ? data.role_permission : "",
        isSignedOut: false,
    };
}
