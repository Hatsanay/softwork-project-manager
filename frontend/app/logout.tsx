"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { api } from "./constans";

export async function logout() {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;

    if (token) {
        // best-effort — เขียน log ฝั่ง backend แต่ไม่บล็อกการ logout ถ้า backend ล่ม/ช้า
        await fetch(`${api}/auth/logout`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {});
    }

    cookieStore.delete("token");
    cookieStore.delete("permission");
    cookieStore.delete("userId");
    cookieStore.delete("fullname");
    redirect("/");
}
