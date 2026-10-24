"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/page-header";
import { PageSkeleton } from "@/components/ui/skeleton";
import StatusBanner from "@/components/ui/guidance/status-banner";
import { apiFetch, type ApiError } from "@/lib/api";
import EmployeeForm from "../_components/employee-form";
import type { Employee } from "../../_types";

export default function EditEmployeePage() {
    const employeeId = useSearchParams().get("id");
    const [employee, setEmployee] = useState<Employee | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);

    useEffect(() => {
        if (!employeeId) return;
        let isLeftPage = false;
        apiFetch<Employee>(`/employees/${employeeId}`).then(({ data, error }) => {
            if (isLeftPage) return;
            setEmployee(data);
            setLoadError(error);
        });
        return () => {
            isLeftPage = true;
        };
    }, [employeeId]);

    return (
        <div className="grid w-full grid-cols-1 gap-6">
            <PageHeader
                eyebrow="บุคคล · พนักงาน"
                title="แก้ไขข้อมูลพนักงาน"
                description="เงินเดือนไม่ได้แก้ที่หน้านี้ — เพิ่มอัตราใหม่ในหน้าพนักงาน (ประวัติเดิมไม่หาย)"
            />
            {!employeeId && (
                <StatusBanner tone="error" title="ไม่พบพนักงานนี้">
                    กลับไปเลือกจากหน้ารายการ
                </StatusBanner>
            )}
            {loadError && (
                <StatusBanner tone="error" title="โหลดข้อมูลพนักงานไม่สำเร็จ">
                    {loadError.message}
                </StatusBanner>
            )}
            {employeeId && !employee && !loadError && <PageSkeleton />}
            {employee && <EmployeeForm employee={employee} />}
        </div>
    );
}
