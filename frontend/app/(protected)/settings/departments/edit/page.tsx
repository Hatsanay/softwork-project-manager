"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/app/constans";
import Button from "@/components/ui/Button/Button";
import Input from "@/components/ui/Input/input";

type Department = {
    dep_id: string;
    dep_name: string;
    dep_status: "active" | "inactive";
};

async function fetchDepartmentById(id: string): Promise<Department | null> {
    const token = localStorage.getItem("token");
    const res = await fetch(`${api}/departments/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return res.json();
}

export default function EditDepartmentPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();

    const id = searchParams.get("id");

    const [depName, setDepName] = useState("");
    const [depStatus, setDepStatus] = useState<"active" | "inactive">("active");
    const [error, setError] = useState<string | null>(null);
    const [notFound, setNotFound] = useState(false);

    useEffect(() => {
        if (!id) return;
        startTransition(async () => {
            const data = await fetchDepartmentById(id);
            if (!data) { setNotFound(true); return; }
            setDepName(data.dep_name);
            setDepStatus(data.dep_status);
        });
    }, [id]);

    function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
        e.preventDefault();
        setError(null);

        const token = localStorage.getItem("token");
        if (!token) { setError("ไม่พบ token กรุณาเข้าสู่ระบบใหม่"); return; }

        startTransition(async () => {
            const res = await fetch(`${api}/departments/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ dep_name: depName, dep_status: depStatus }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setError(data.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่");
                return;
            }

            router.push("/settings/departments");
        });
    }

    if (!id || notFound) return <p className="p-6 text-gray-500">ไม่พบแผนกนี้</p>;

    return (
        <div className="p-4 sm:p-6 max-w-2xl mx-auto">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-800 mb-6">แก้ไขแผนก</h1>

            <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-6">
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

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        สถานะการใช้งาน
                    </label>
                    <select
                        value={depStatus}
                        onChange={(e) => setDepStatus(e.target.value === "inactive" ? "inactive" : "active")}
                        className="px-4 py-2 border rounded focus:outline-none focus:ring-2 border-gray-300 focus:border-blue-400 focus:ring-blue-500/20 w-full"
                    >
                        <option value="active">ใช้งาน</option>
                        <option value="inactive">ยกเลิกใช้งาน</option>
                    </select>
                </div>

                {error && <p className="text-sm text-red-600">{error}</p>}

                <div className="flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={() => router.push("/settings/departments")}
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
