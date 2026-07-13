"use server";

import { cookies } from "next/headers";
import { api } from "../constans";

type State = { error: string } | { token: string } | null;

export async function handleLogin(_prevState: State, formData: FormData): Promise<State> {
    try {
        const user_email = formData.get("user_email");
        const user_password = formData.get("user_password");

        const res = await fetch(`${api}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_email, user_password }),
        });

        if (!res.ok) return { error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" };

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

export async function getUserProfile(): Promise<{
    fullname: string; avatarUrl: string | null; mustChangePassword: boolean; roleName: string;
}> {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    const userId = cookieStore.get("userId")?.value;
    if (!token || !userId) return { fullname: "", avatarUrl: null, mustChangePassword: false, roleName: "" };

    const res = await fetch(`${api}/users/me?user_id=${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
    });

    if (!res.ok) return { fullname: "", avatarUrl: null, mustChangePassword: false, roleName: "" };

    const data = await res.json();
    const serverBase = new URL(api).origin;
    return {
        fullname:  data.user_fullname ?? data.fullname ?? "",
        avatarUrl: data.user_avatar_url ? `${serverBase}${data.user_avatar_url}` : null,
        mustChangePassword: !!data.user_must_change_password,
        roleName: data.role_name ?? "",
    };
}


