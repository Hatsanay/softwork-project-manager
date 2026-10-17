"use client";

import PageHeader from "@/components/ui/page-header";
import EmployeeForm from "../_components/employee-form";

export default function NewEmployeePage() {
    return (
        <div className="mx-auto grid w-full max-w-4xl grid-cols-1 gap-6">
            <PageHeader
                eyebrow="บุคคล · พนักงาน"
                title="เพิ่มพนักงาน"
                description="ช่องที่มี * ต้องกรอก · เลขประจำตัวประชาชน ที่อยู่ และบัญชีรับเงินเดือนต้องครบก่อนเข้ารอบเงินเดือน"
            />
            <EmployeeForm />
        </div>
    );
}
