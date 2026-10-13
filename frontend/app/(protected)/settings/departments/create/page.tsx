"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/app/constans";
import Button from "@/components/ui/Button/Button";
import Input from "@/components/ui/Input/input";
import PageHeader from "@/components/ui/page-header";
import { buttonClass } from "@/components/ui/button";

export default function CreateDepartmentPage() {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    const [depName, setDepName] = useState("");
    const [error, setError] = useState<string | null>(null);

    function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setError(null);

        const token = localStorage.getItem("token");
        if (!token) { setError("ไม่พบ token กรุณาเข้าสู่ระบบใหม่"); return; }

        startTransition(async () => {
            const res = await fetch(`${api}/departments`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ dep_name: depName }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setError(data.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่");
                return;
            }

            router.push("/settings/departments");
        });
    }

    return (
        <div className="mx-auto grid max-w-3xl gap-6">
            <PageHeader
                eyebrow="ตั้งค่าระบบ · แผนก"
                title="สร้างแผนก"
                description="ชื่อแผนกห้ามซ้ำกับแผนกอื่น"
            />

            <form onSubmit={handleSubmit} className="space-y-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-card sm:p-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        ชื่อแผนก
                    </label>
                    <Input
                        value={depName}
                        onChange={(e) => setDepName(e.target.value)}
                        required
                        className="w-full"
                        placeholder="ชื่อแผนก"
                    />
                </div>

                {error && <p className="text-sm text-red-600">{error}</p>}

                <div className="flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={() => router.push("/settings/departments")}
                        className={buttonClass("secondary", "md")}
                    >
                        ยกเลิก
                    </button>
                    <Button type="submit" disabled={isPending}>
                        {isPending ? "กำลังบันทึก..." : "บันทึก"}
                    </Button>
                </div>
            </form>
        </div>
    );
}
