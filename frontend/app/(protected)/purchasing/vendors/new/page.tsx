"use client";

import PageHeader from "@/components/ui/page-header";
import VendorForm from "../_components/vendor-form";

export default function NewVendorPage() {
    return (
        <div className="mx-auto grid w-full max-w-4xl grid-cols-1 gap-6">
            <PageHeader
                eyebrow="จัดซื้อ · ผู้ขาย"
                title="เพิ่มผู้ขาย"
                description="กรอกแค่ชื่อก็บันทึกได้ · เลขผู้เสียภาษีและที่อยู่ต้องครบก่อนออก 50 ทวิ ให้ผู้ขายรายนี้"
            />
            <VendorForm />
        </div>
    );
}
