"use client";

import PageHeader from "@/components/ui/page-header";
import DepartmentForm from "../_components/department-form";

export default function CreateDepartmentPage() {
    return (
        <div className="grid w-full gap-6">
            <PageHeader
                eyebrow="ตั้งค่าระบบ · แผนก"
                title="สร้างแผนก"
                description="เลือกสาขาและตั้งตัวย่อ 3 ตัว ระบบประกอบเป็นรหัสแผนก 8 หลัก · ตัวย่อแก้ได้จนกว่าจะมีพนักงานคนแรกในแผนก"
            />
            <DepartmentForm />
        </div>
    );
}
