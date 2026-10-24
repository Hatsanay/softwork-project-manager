"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/page-header";
import { apiFetch } from "@/lib/api";
import DepartmentForm, { type DepartmentDetail } from "../_components/department-form";

export default function EditDepartmentPage() {
    const searchParams = useSearchParams();
    const id = searchParams.get("id");

    const [department, setDepartment] = useState<DepartmentDetail | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        if (!id) return;
        let isLeftPage = false;
        apiFetch<DepartmentDetail>(`/departments/${id}`).then(({ data, error }) => {
            if (isLeftPage) return;
            if (error) {
                setLoadError(error.message);
                return;
            }
            setDepartment(data);
        });
        return () => {
            isLeftPage = true;
        };
    }, [id]);

    if (!id) return <p className="p-6 text-gray-500">ไม่พบแผนกนี้</p>;
    if (loadError) return <p className="p-6 text-gray-500">{loadError}</p>;

    return (
        <div className="grid w-full gap-6">
            <PageHeader
                eyebrow="ตั้งค่าระบบ · แผนก"
                title={department ? `แก้ไขแผนก ${department.dep_code}` : "แก้ไขแผนก"}
                description="แผนกที่ยังมีพนักงาน ประวัติรหัสพนักงาน หรือสิทธิ์ผูกอยู่ลบไม่ได้ ให้ปิดใช้งานแทน"
            />
            {department ? (
                <DepartmentForm key={department.dep_id} department={department} />
            ) : (
                <p className="p-6 text-gray-500">กำลังโหลด...</p>
            )}
        </div>
    );
}
