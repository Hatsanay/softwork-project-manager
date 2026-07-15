"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/app/constans";
import { PROJECT_PERMISSION_GROUPS, PROJECT_GROUP_STARTS, TOTAL_PROJECT_BITS } from "@/app/components/project-position-bits";
import Button from "@/components/ui/Button/Button";
import Input from "@/components/ui/Input/input";

async function fetchPositionById(id: string) {
    const token = localStorage.getItem("token");
    const res = await fetch(`${api}/project-positions/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return res.json() as Promise<{
        position_id: string; position_name: string; position_permission: string;
        position_status: "active" | "inactive";
    }>;
}

export default function EditProjectPositionPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();

    const [positionName, setPositionName] = useState("");
    const [positionStatus, setPositionStatus] = useState<"active" | "inactive">("active");
    const [checked, setChecked] = useState<boolean[]>(Array(TOTAL_PROJECT_BITS).fill(false));
    const [error, setError] = useState<string | null>(null);
    const [notFound, setNotFound] = useState(false);

    const id = searchParams.get("id");

    useEffect(() => {
        if (!id) return;
        startTransition(async () => {
            const data = await fetchPositionById(id);
            if (!data) { setNotFound(true); return; }
            setPositionName(data.position_name);
            setPositionStatus(data.position_status);
            setChecked(data.position_permission.split("").map((b) => b === "1"));
        });
    }, [id]);

    function toggleBit(index: number) {
        setChecked((prev) => {
            const next = [...prev];
            next[index] = !next[index];
            return next;
        });
    }

    function toggleAll() {
        setChecked((prev) => {
            const allChecked = prev.every(Boolean);
            return Array(TOTAL_PROJECT_BITS).fill(!allChecked);
        });
    }

    function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
        e.preventDefault();
        setError(null);

        const token = localStorage.getItem("token");
        if (!token) { setError("ไม่พบ token กรุณาเข้าสู่ระบบใหม่"); return; }

        const position_permission = checked.map((v) => (v ? "1" : "0")).join("");

        startTransition(async () => {
            const res = await fetch(`${api}/project-positions/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ position_name: positionName, position_permission, position_status: positionStatus }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setError(data.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่");
                return;
            }

            router.push("/settings/project-positions");
        });
    }

    if (!id || notFound) return <p className="p-6 text-gray-500">ไม่พบตำแหน่งนี้</p>;

    return (
        <div className="p-4 sm:p-6 max-w-2xl mx-auto">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-800 mb-6">แก้ไขตำแหน่งในโปรเจกต์</h1>

            <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        ชื่อตำแหน่ง
                    </label>
                    <Input
                        value={positionName}
                        onChange={(e) => setPositionName(e.target.value)}
                        required
                        className="w-full"
                        placeholder="เช่น PM, SA, BA, Dev"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        สถานะการใช้งาน
                    </label>
                    <select
                        value={positionStatus}
                        onChange={(e) => setPositionStatus(e.target.value === "inactive" ? "inactive" : "active")}
                        className="px-4 py-2 border rounded focus:outline-none focus:ring-2 border-gray-300 focus:border-blue-400 focus:ring-blue-500/20 w-full"
                    >
                        <option value="active">ใช้งาน</option>
                        <option value="inactive">ยกเลิกใช้งาน</option>
                    </select>
                </div>

                <div>
                    <label className="flex items-center gap-3 cursor-pointer mb-3">
                        <input
                            type="checkbox"
                            checked={checked.every(Boolean)}
                            onChange={toggleAll}
                            className="w-4 h-4 accent-blue-500"
                        />
                        <span className="text-sm font-medium text-gray-700">ทั้งหมด</span>
                    </label>
                    <div className="space-y-4">
                        {PROJECT_PERMISSION_GROUPS.map((group, gi) => (
                            <div key={group.groupLabel}>
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 px-1">
                                    {group.groupLabel}
                                </p>
                                <div className="rounded-lg border border-gray-100 divide-y divide-gray-50 overflow-hidden">
                                    {group.bits.map((bit, bi) => {
                                        const index = PROJECT_GROUP_STARTS[gi] + bi;
                                        return (
                                            <label
                                                key={bit.key}
                                                className="flex items-start gap-3 cursor-pointer px-4 py-3 hover:bg-blue-50"
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={checked[index] ?? false}
                                                    onChange={() => toggleBit(index)}
                                                    className="w-4 h-4 accent-blue-500 mt-0.5 shrink-0"
                                                />
                                                <span className="flex flex-col gap-0.5">
                                                    <span className="text-sm font-medium text-gray-700">{bit.label}</span>
                                                    <span className="text-xs text-gray-400 leading-relaxed">{bit.description}</span>
                                                </span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {error && <p className="text-sm text-red-600">{error}</p>}

                <div className="flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={() => router.push("/settings/project-positions")}
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
