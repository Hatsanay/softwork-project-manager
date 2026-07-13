"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/app/constans";
import { PERMISSION_GROUPS, GROUP_STARTS } from "@/app/components/bit";

type Role = {
    role_id: number;
    role_name: string;
    role_permission: string;
    role_department_name: string | null;
    role_granted_at: string;
    by_fullname: string;
    role_update_at: string;
};

async function fetchRoleById(id: string): Promise<Role | null> {
    const token = localStorage.getItem("token");
    const res = await fetch(`${api}/roles/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return res.json();
}

export default function ViewRolePage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();

    const [role, setRole] = useState<Role | null>(null);
    const [checked, setChecked] = useState<boolean[]>([]);

    const id = searchParams.get("id");

    useEffect(() => {
        if (!id) return;
        startTransition(async () => {
            const data = await fetchRoleById(id);
            if (data) {
                setRole(data);
                setChecked(data.role_permission.split("").map((b) => b === "1"));
            }
        });
    }, [id]);

    if (!id) return <p className="p-6 text-gray-500">ไม่พบ Role</p>;

    return (
        <div className="p-4 sm:p-6 max-w-2xl mx-auto">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-800 mb-6">
                {isPending ? "..." : (role?.role_name ?? "ไม่พบข้อมูล")}
            </h1>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        ชื่อสิทธิ์
                    </label>
                    <p className="px-3 py-2 bg-gray-50 rounded-lg text-gray-800 text-sm">
                        {role?.role_name ?? "-"}
                    </p>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        แผนก
                    </label>
                    <p className="px-3 py-2 bg-gray-50 rounded-lg text-gray-800 text-sm">
                        {role?.role_department_name ?? "-"}
                    </p>
                </div>

                <div className="space-y-2">
                    {PERMISSION_GROUPS.map((group, gi) => {
                        const start = GROUP_STARTS[gi];
                        const slice = checked.slice(start, start + group.bits.length);
                        const allChecked = slice.every(Boolean);

                        return (
                            <div key={group.groupLabel} className="rounded-lg border border-gray-100 overflow-hidden">
                                <div className="flex items-center gap-3 px-4 py-2.5 bg-gray-50">
                                    <input
                                        type="checkbox"
                                        checked={allChecked}
                                        disabled
                                        className="w-4 h-4 accent-blue-500"
                                    />
                                    <span className="text-sm font-medium text-gray-800">
                                        {group.groupLabel}
                                    </span>
                                </div>
                                <div className="divide-y divide-gray-50">
                                    {group.bits.map((bit, bi) => (
                                        <div key={bit.href} className="flex items-center gap-3 px-4 py-2 pl-10">
                                            <input
                                                type="checkbox"
                                                checked={checked[start + bi] ?? false}
                                                disabled
                                                className="w-4 h-4 accent-blue-500"
                                            />
                                            <span className="text-sm text-gray-700">
                                                {bit.label}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="flex justify-end">
                    <button
                        type="button"
                        onClick={() => router.push("/settings/roles")}
                        className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
                    >
                        ยกเลิก
                    </button>
                </div>
            </div>
        </div>
    );
}
