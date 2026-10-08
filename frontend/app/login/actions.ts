"use server";

import { cookies } from "next/headers";
import { api } from "../constans";

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

        const permRes = await fetch(
            `${api}/auth/verifyPermission?user_role_id=${user_role_id}`,
            { headers: { Authorization: `Bearer ${token}` } }
        );

        if (!permRes.ok) return { error: "ไม่สามารถตรวจสอบสิทธิ์ได้" };

        const { role_permission } = await permRes.json();

        const cookieStore = await cookies();
        cookieStore.set("token", token, { httpOnly: true, path: "/", sameSite: "lax" });
        cookieStore.set("permission", role_permission, { httpOnly: true, path: "/", sameSite: "lax" });
        cookieStore.set("userId", String(user_id), { httpOnly: true, path: "/", sameSite: "lax" });

        const fullname = await getFullName();
        cookieStore.set("fullname", String(fullname), { httpOnly: false, path: "/", sameSite: "lax" });

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
    fullname: string; avatarUrl: string | null; mustChangePassword: boolean; roleName: string;
    username: string; needsEmail: boolean;
};

const EMPTY_PROFILE: UserProfile = {
    fullname: "", avatarUrl: null, mustChangePassword: false, roleName: "", username: "", needsEmail: false,
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

    if (!res.ok) return EMPTY_PROFILE;

    const data = await res.json();
    const serverBase = new URL(api).origin;
    return {
        fullname:  data.user_fullname ?? data.fullname ?? "",
        avatarUrl: data.user_avatar_url ? `${serverBase}${data.user_avatar_url}` : null,
        mustChangePassword: !!data.user_must_change_password,
        roleName: data.role_name ?? "",
        username: data.user_username ?? "",
        // แอดมินสร้างบัญชีโดยไม่ใส่อีเมล → ต้องยืนยันอีเมลด้วย OTP ก่อนใช้งานระบบ (ขั้นที่ 2 ของ onboarding)
        needsEmail: !data.user_email,
    };
}


