"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/app/constans";
import Input from "@/components/ui/Input/input";
import Button from "@/components/ui/Button/Button";

export default function ForcePasswordChange() {
    const router = useRouter();
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [pending, setPending] = useState(false);

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setError(null);

        if (newPassword.length < 8) {
            setError("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร");
            return;
        }
        if (newPassword !== confirmPassword) {
            setError("รหัสผ่านไม่ตรงกัน");
            return;
        }

        setPending(true);
        try {
            const res = await fetch(`${api}/users/me/password`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${localStorage.getItem("token")}`,
                },
                body: JSON.stringify({ new_password: newPassword }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.message ?? "เกิดข้อผิดพลาด");

            toast.success("เปลี่ยนรหัสผ่านสำเร็จ");
            router.refresh();
        } catch (err) {
            setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
        } finally {
            setPending(false);
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
            <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <h1 className="text-xl font-bold text-gray-800 mb-1">ตั้งรหัสผ่านใหม่</h1>
                <p className="text-sm text-gray-500 mb-6">
                    เพื่อความปลอดภัย กรุณาตั้งรหัสผ่านใหม่แทนรหัสผ่านชั่วคราวก่อนใช้งานต่อ
                </p>

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1">
                        <label className="text-sm font-medium text-gray-700">รหัสผ่านใหม่</label>
                        <Input
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="อย่างน้อย 8 ตัวอักษร"
                            error={!!error}
                        />
                    </div>

                    <div className="flex flex-col gap-1">
                        <label className="text-sm font-medium text-gray-700">ยืนยันรหัสผ่านใหม่</label>
                        <Input
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="กรอกรหัสผ่านอีกครั้ง"
                            error={!!error}
                        />
                    </div>

                    {error && <p className="text-sm text-red-600">{error}</p>}

                    <Button type="submit" disabled={pending}>
                        {pending ? "กำลังบันทึก..." : "ยืนยันรหัสผ่านใหม่"}
                    </Button>
                </form>
            </div>
        </div>
    );
}
