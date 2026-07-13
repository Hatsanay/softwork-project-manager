"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/app/constans";
import formatDate from "@/app/function";
import Image from "next/image";

async function fetchUser(id: string) {
    const res = await window.fetch(`${api}/users/${id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    });
    if (!res.ok) return null;
    return res.json();
}

function Field({ label, value }: { label: string; value?: string | null }) {
    return (
        <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</span>
            <span className="text-sm text-gray-800">{value || "—"}</span>
        </div>
    );
}

const SERVER_BASE = new URL(api).origin;

export default function ViewUserPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();

    const id = searchParams.get("id") ?? "";
    const [user, setUser] = useState<Record<string, string> | null>(null);
    const [notFound, setNotFound] = useState(false);

    useEffect(() => {
        if (!id) return;
        startTransition(async () => {
            const data = await fetchUser(id);
            if (!data) setNotFound(true);
            else setUser(data);
        });
    }, [id]);

    if (!id || notFound) return <p className="p-6 text-gray-500">ไม่พบผู้ใช้งาน</p>;
    if (isPending || !user) return <p className="p-6 text-gray-400">กำลังโหลด...</p>;

    const avatarUrl = user.user_avatar_url ? `${SERVER_BASE}${user.user_avatar_url}` : "/defult.png";

    return (
        <div className="p-4 sm:p-6 max-w-2xl mx-auto">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-800 mb-6">ข้อมูลผู้ใช้งาน</h1>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-6">

                {/* Avatar + name header */}
                <div className="flex items-center gap-4">
                    <Image
                        src={avatarUrl}
                        alt={user.user_fullname ?? `${user.user_fname} ${user.user_lname}`}
                        width={72}
                        height={72}
                        unoptimized={!!user.user_avatar_url}
                        className="rounded-full object-cover border border-gray-200"
                    />
                    <div>
                        <p className="text-lg font-semibold text-gray-800">{user.user_fullname}</p>
                        <p className="text-sm text-gray-500">{user.user_email}</p>
                        {user.role_name && (
                            <span className="inline-block mt-1 px-2 py-0.5 text-xs rounded-full bg-blue-50 text-blue-600">
                                {user.role_name}
                            </span>
                        )}
                    </div>
                </div>

                <hr className="border-gray-100" />

                <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                    <Field label="ชื่อ"         value={user.user_fname} />
                    <Field label="นามสกุล"       value={user.user_lname} />
                    <Field label="อีเมล"         value={user.user_email} />
                    <Field label="เบอร์โทรศัพท์" value={user.user_phone} />
                    <Field label="Line ID"      value={user.user_line_uid} />
                    <Field label="WhatsApp No." value={user.user_whatsapp_no} />
                    <Field label="สิทธิ์"        value={user.role_name} />
                    <Field label="เข้าสู่ระบบล่าสุด" value={formatDate(user.user_last_login_at)} />
                    <Field label="สร้างเมื่อ"    value={formatDate(user.user_created_at)} />
                    <Field label="อัปเดตเมื่อ"   value={formatDate(user.user_updated_at)} />
                </div>

                <div className="flex justify-end">
                    <button
                        onClick={() => router.push("/users")}
                        className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
                    >
                        ย้อนกลับ
                    </button>
                </div>
            </div>
        </div>
    );
}
