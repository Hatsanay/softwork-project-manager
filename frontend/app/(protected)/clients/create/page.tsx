"use client";

import PageHeader from "@/components/ui/page-header";
import ClientForm from "../_components/client-form";

export default function CreateClientPage() {
    return (
        <div className="grid w-full gap-6">
            <PageHeader
                eyebrow="งาน · ลูกค้า"
                title="สร้างลูกค้า"
                description="กรอกแค่ชื่อก็บันทึกได้ · ข้อมูลภาษีและที่อยู่กรอกเพิ่มทีหลังได้ก่อนออกเอกสารให้ลูกค้ารายนี้"
            />
            <ClientForm />
        </div>
    );
}
