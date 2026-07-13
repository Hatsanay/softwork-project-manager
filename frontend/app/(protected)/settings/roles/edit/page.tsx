"use client";

import { useRef, useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/app/constans";
import { PERMISSION_GROUPS, GROUP_STARTS, TOTAL_BITS } from "@/app/components/bit";
import Button from "@/components/ui/Button/Button";
import Input from "@/components/ui/Input/input";
import SearchableSelect from "@/components/ui/SearchableSelect";

function IndeterminateCheckbox({
    indeterminate,
    ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { indeterminate?: boolean }) {
    const ref = useRef<HTMLInputElement>(null);
    useEffect(() => {
        if (ref.current) ref.current.indeterminate = indeterminate ?? false;
    }, [indeterminate]);
    return <input ref={ref} type="checkbox" {...props} />;
}

async function fetchRoleById(id: string) {
    const token = localStorage.getItem("token");
    const res = await fetch(`${api}/roles/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return res.json() as Promise<{
        role_id: number; role_name: string; role_permission: string; role_department: string | null;
    }>;
}

export default function EditRolePage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();

    const [roleName, setRoleName] = useState("");
    const [department, setDepartment] = useState("");
    const [checked, setChecked] = useState<boolean[]>(Array(TOTAL_BITS).fill(false));
    const [error, setError] = useState<string | null>(null);

    const id = searchParams.get("id");

    useEffect(() => {
        if (!id) return;
        startTransition(async () => {
            const data = await fetchRoleById(id);
            if (data) {
                setRoleName(data.role_name);
                setChecked(data.role_permission.split("").map((b) => b === "1"));
                setDepartment(data.role_department ?? "");
            }
        });
    }, [id]);

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

    function toggleBit(index: number) {
        setChecked((prev) => {
            const next = [...prev];
            next[index] = !next[index];
            if (next[index]) {
                for (let gi = 0; gi < PERMISSION_GROUPS.length; gi++) {
                    const start = GROUP_STARTS[gi];
                    const len = PERMISSION_GROUPS[gi].bits.length;
                    if (index > start && index < start + len) {
                        next[start] = true;
                        break;
                    }
                }
            }
            return next;
        });
    }

    function toggleAll() {
        setChecked((prev) => {
            const allChecked = prev.every(Boolean);
            return Array(TOTAL_BITS).fill(!allChecked);
        });
    }

    function toggleGroup(start: number, length: number) {
        setChecked((prev) => {
            const allChecked = prev.slice(start, start + length).every(Boolean);
            const next = [...prev];
            for (let i = start; i < start + length; i++) next[i] = !allChecked;
            return next;
        });
    }

    function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
        e.preventDefault();
        setError(null);

        const token = localStorage.getItem("token");
        if (!token) { setError("ไม่พบ token กรุณาเข้าสู่ระบบใหม่"); return; }

        const role_permission = checked.map((v) => (v ? "1" : "0")).join("");

        startTransition(async () => {
            const res = await fetch(`${api}/roles/${id}`, {
                method: "PUT",
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

    if (!id) return <p className="p-6 text-gray-500">ไม่พบ Role</p>;

    return (
        <div className="p-4 sm:p-6 max-w-2xl mx-auto">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-800 mb-6">แก้ไขสิทธิ์</h1>

            <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-6">
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

                <div>
                    <label className="flex items-center gap-3 cursor-pointer mb-3">
                        <IndeterminateCheckbox
                            checked={checked.every(Boolean)}
                            indeterminate={!checked.every(Boolean) && checked.some(Boolean)}
                            onChange={toggleAll}
                            className="w-4 h-4 accent-blue-500"
                        />
                        <span className="text-sm font-medium text-gray-700">ทั้งหมด</span>
                    </label>
                    <div className="space-y-2">
                        {PERMISSION_GROUPS.map((group, gi) => {
                            const start = GROUP_STARTS[gi];
                            const length = group.bits.length;
                            const slice = checked.slice(start, start + length);
                            const allChecked = slice.every(Boolean);
                            const someChecked = slice.some(Boolean);

                            return (
                                <div key={group.groupLabel} className="rounded-lg border border-gray-100 overflow-hidden">
                                    <label className="flex items-center gap-3 cursor-pointer px-4 py-2.5 bg-gray-50 hover:bg-gray-100">
                                        <IndeterminateCheckbox
                                            checked={allChecked}
                                            indeterminate={!allChecked && someChecked}
                                            onChange={() => toggleGroup(start, length)}
                                            className="w-4 h-4 accent-blue-500"
                                        />
                                        <span className="text-sm font-medium text-gray-800">
                                            {group.groupLabel}
                                        </span>
                                    </label>
                                    <div className="divide-y divide-gray-50">
                                        {group.bits.map((bit, bi) => (
                                            <label
                                                key={bit.href}
                                                className="flex items-center gap-3 cursor-pointer px-4 py-2 pl-10 hover:bg-blue-50"
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={checked[start + bi]}
                                                    onChange={() => toggleBit(start + bi)}
                                                    className="w-4 h-4 accent-blue-500"
                                                />
                                                <span className="text-sm text-gray-700">
                                                    {bit.label}
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {error && <p className="text-sm text-red-600">{error}</p>}

                <div className="flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={() => router.push("/settings/roles")}
                        className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
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
