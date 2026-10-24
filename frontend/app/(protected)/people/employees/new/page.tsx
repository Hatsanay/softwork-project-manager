"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/page-header";
import { PageSkeleton } from "@/components/ui/skeleton";
import EmployeeForm from "../_components/employee-form";

// ?user= = มาจากปุ่ม "เพิ่มเป็นพนักงาน" ในหน้าผู้ใช้ → เลือกบัญชีและเติมข้อมูลให้เลย · useSearchParams ต้องอยู่ใน Suspense
export default function NewEmployeePage() {
    return (
        <Suspense fallback={<PageSkeleton />}>
            <NewEmployeeContent />
        </Suspense>
    );
}

function NewEmployeeContent() {
    const initialUserId = useSearchParams().get("user");
    return (
        <div className="grid w-full grid-cols-1 gap-6">
            <PageHeader
                eyebrow="บุคคล · พนักงาน"
                title="เพิ่มพนักงาน"
                description="เลือกบัญชีผู้ใช้ก่อนเพื่อไม่ต้องกรอกชื่อซ้ำ · ช่องที่มี * ต้องกรอก"
            />
            <EmployeeForm initialUserId={initialUserId} />
        </div>
    );
}
