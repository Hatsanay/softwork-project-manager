"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/app/constans";
import { TOTAL_BITS } from "@/app/components/bit";
import Button from "@/components/ui/Button/Button";
import Input from "@/components/ui/Input/input";
import SearchableSelect from "@/components/ui/SearchableSelect";
import PermissionChecklist from "../_components/permission-checklist";
import PageHeader from "@/components/ui/page-header";
import { buttonClass } from "@/components/ui/button";

async function loadDepartmentOptions(search: string) {
    const token = localStorage.getItem("token");
    const res = await fetch(
        `${api}/departments?${new URLSearchParams({ limit: "20", offset: "0", status: "active", search })}`,
        { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return [];
    const { data } = await res.json() as { data: { dep_id: string; dep_name: string }[] };
    return data.map((d) => ({ value: d.dep_id, label: d.dep_name }));
}

export default function CreateRolePage() {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    const [roleName, setRoleName] = useState("");
    const [department, setDepartment] = useState("");
    const [checked, setChecked] = useState<boolean[]>(Array(TOTAL_BITS).fill(false));
    const [error, setError] = useState<string | null>(null);

    function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setError(null);

        const token = localStorage.getItem("token");
        if (!token) { setError("ไม่พบ token กรุณาเข้าสู่ระบบใหม่"); return; }

        const role_permission = checked.map((isChecked) => (isChecked ? "1" : "0")).join("");

        // ผู้สร้างและประเภท role กำหนดที่ backend (2026-10-12) — ไม่ต้องส่งไป
        startTransition(async () => {
            const res = await fetch(`${api}/roles`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ role_name: roleName, role_permission, role_department: department }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setError(data.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่");
                return;
            }

            router.push("/settings/roles");
        });
    }

    return (
        <div className="mx-auto grid max-w-3xl gap-6">
            <PageHeader
                eyebrow="ตั้งค่าระบบ · จัดการสิทธิ์"
                title="สร้างสิทธิ์"
                description="ตั้งชื่อสิทธิ์แล้วเลือกว่าผู้ใช้กลุ่มนี้ทำอะไรได้ · เลือกได้เฉพาะข้อที่คุณมีสิทธิ์เอง"
            />

            <form onSubmit={handleSubmit} className="space-y-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-card sm:p-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        ชื่อสิทธิ์
                    </label>
                    <Input
                        value={roleName}
                        onChange={(e) => setRoleName(e.target.value)}
                        required
                        className="w-full"
                        placeholder="ชื่อสิทธิ์"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">แผนก</label>
                    <SearchableSelect
                        loadOptions={loadDepartmentOptions}
                        value={department}
                        onChange={setDepartment}
                        placeholder="— เลือกแผนก (ไม่บังคับ) —"
                        disabled={isPending}
                    />
                </div>

                <PermissionChecklist checked={checked} onChange={setChecked} />

                {error && <p className="text-sm text-red-600">{error}</p>}

                <div className="flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={() => router.push("/settings/roles")}
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
