"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/app/constans";
import { TOTAL_BITS } from "@/app/components/bit";
import Button from "@/components/ui/Button/Button";
import Input from "@/components/ui/Input/input";
import SearchableSelect from "@/components/ui/SearchableSelect";
import PermissionChecklist from "../_components/permission-checklist";
import PageHeader from "@/components/ui/page-header";
import { buttonClass } from "@/components/ui/button";

type RoleDetail = {
    role_id: number;
    role_name: string;
    role_permission: string;
    role_department: string | null;
    total_bits: number;
    is_system_role: boolean;
    can_edit: boolean;
};

async function fetchRoleById(id: string) {
    const token = localStorage.getItem("token");
    const res = await fetch(`${api}/roles/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return res.json() as Promise<RoleDetail>;
}

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

export default function EditRolePage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();

    const [roleName, setRoleName] = useState("");
    const [department, setDepartment] = useState("");
    const [checked, setChecked] = useState<boolean[]>(Array(TOTAL_BITS).fill(false));
    const [error, setError] = useState<string | null>(null);
    // หน้านี้เปิดค้างไว้ตั้งแต่ก่อนระบบเพิ่มสิทธิ์ใหม่ → รู้จักบิตไม่ครบ ห้ามบันทึก (2026-10-12, risk-fixes R1)
    const [isOutdatedPage, setIsOutdatedPage] = useState(false);
    // role ระบบได้สิทธิ์ครบทุกข้อเสมอ แก้ได้แค่ชื่อและแผนก (2026-10-12, risk-fixes R24)
    const [isSystemRole, setIsSystemRole] = useState(false);
    // role ที่มีสิทธิ์บางข้อที่คนแก้ไม่มี แก้ไม่ได้ทั้ง role (2026-10-12, risk-fixes R25)
    const [canEdit, setCanEdit] = useState(true);

    const id = searchParams.get("id");
    const canSave = canEdit && !isOutdatedPage;

    useEffect(() => {
        if (!id) return;
        startTransition(async () => {
            const data = await fetchRoleById(id);
            if (!data) return;
            setRoleName(data.role_name);
            setChecked(data.role_permission.split("").map((bit) => bit === "1"));
            setDepartment(data.role_department ?? "");
            setIsOutdatedPage(data.total_bits !== TOTAL_BITS);
            setIsSystemRole(data.is_system_role);
            setCanEdit(data.can_edit !== false);
        });
    }, [id]);

    function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
        e.preventDefault();
        setError(null);

        const token = localStorage.getItem("token");
        if (!token) { setError("ไม่พบ token กรุณาเข้าสู่ระบบใหม่"); return; }

        const role_permission = checked.map((isChecked) => (isChecked ? "1" : "0")).join("");

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
        <div className="grid w-full gap-6">
            <PageHeader
                eyebrow="ตั้งค่าระบบ · จัดการสิทธิ์"
                title="แก้ไขสิทธิ์"
                description="เปลี่ยนสิทธิ์แล้วมีผลกับผู้ใช้ทุกคนใน role นี้ทันทีที่เปลี่ยนหน้า · แก้ได้เฉพาะ role ที่สิทธิ์ไม่เกินของคุณ"
            />

            <form onSubmit={handleSubmit} className="space-y-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-card sm:p-6">
                {/* แถบแจ้งอยู่บนสุดของฟอร์ม ให้เห็นก่อนเริ่มแก้ — ไม่ใช่เลื่อนลงไปเจอหลังแก้เสร็จ */}
                {!canEdit && (
                    <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-600">
                        <p className="font-medium">คุณแก้ไข role นี้ไม่ได้</p>
                        <p>
                            role นี้มีสิทธิ์บางข้อที่คุณเองไม่มี · กันการแก้ role ที่สูงกว่าตัวเอง
                            ให้ผู้ที่มีสิทธิ์สูงกว่าเป็นคนจัดการ
                        </p>
                    </div>
                )}

                {canEdit && isOutdatedPage && (
                    <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-600">
                        <p className="font-medium">หน้านี้เป็นเวอร์ชันเก่า บันทึกไม่ได้</p>
                        <p>
                            ระบบเพิ่งเพิ่มสิทธิ์ใหม่ที่หน้านี้ยังไม่รู้จัก กรุณารีเฟรชหน้า (Ctrl+F5) ก่อนแก้สิทธิ์
ป้องกันไม่ให้สิทธิ์ใหม่ของ role นี้หายไปตอนบันทึก
                        </p>
                    </div>
                )}

                {canEdit && isSystemRole && (
                    <div role="status" className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-600">
                        <p className="font-medium">นี่คือ role ระบบ · ได้สิทธิ์ครบทุกข้อเสมอ</p>
                        <p>
                            แก้ได้เฉพาะชื่อและแผนก ส่วนสิทธิ์ล็อกไว้ เพื่อให้มีคนจัดการระบบได้เสมอ
                            และได้สิทธิ์ใหม่ที่ระบบเพิ่มในอนาคตโดยอัตโนมัติ
                        </p>
                    </div>
                )}

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        ชื่อสิทธิ์
                    </label>
                    <Input
                        value={roleName}
                        onChange={(e) => setRoleName(e.target.value)}
                        required
                        disabled={!canEdit}
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
                        placeholder="เลือกแผนก (ไม่บังคับ)"
                        disabled={isPending || !canEdit}
                    />
                </div>

                <PermissionChecklist checked={checked} onChange={setChecked} disabled={isSystemRole || !canEdit} />

                {error && <p className="text-sm text-red-600">{error}</p>}

                <div className="flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={() => router.push("/settings/roles")}
                        className={buttonClass("secondary", "md")}
                    >
                        ยกเลิก
                    </button>
                    {canSave && (
                        <Button type="submit" disabled={isPending}>
                            {isPending ? "กำลังบันทึก..." : "บันทึก"}
                        </Button>
                    )}
                </div>
            </form>
        </div>
    );
}
