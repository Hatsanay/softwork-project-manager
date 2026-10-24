"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/page-header";
import { PageSkeleton } from "@/components/ui/skeleton";
import StatusBanner from "@/components/ui/guidance/status-banner";
import { apiFetch, type ApiError } from "@/lib/api";
import VendorForm from "../_components/vendor-form";
import type { Vendor } from "../../_types";

export default function EditVendorPage() {
    const vendorId = useSearchParams().get("id");
    const [vendor, setVendor] = useState<Vendor | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);

    useEffect(() => {
        if (!vendorId) return;
        let isLeftPage = false;
        apiFetch<Vendor>(`/vendors/${vendorId}`).then(({ data, error }) => {
            if (isLeftPage) return;
            setVendor(data);
            setLoadError(error);
        });
        return () => {
            isLeftPage = true;
        };
    }, [vendorId]);

    return (
        <div className="grid w-full grid-cols-1 gap-6">
            <PageHeader
                eyebrow="จัดซื้อ · ผู้ขาย"
                title="แก้ไขผู้ขาย"
                description="แก้แล้วมีผลกับเอกสารที่ทำหลังจากนี้ · ใบสำคัญจ่ายและ 50 ทวิ ที่ออกไปแล้วเก็บข้อมูล ณ วันจ่ายไว้เอง"
            />
            {!vendorId && (
                <StatusBanner tone="error" title="ไม่พบผู้ขายนี้">
                    กลับไปเลือกจากหน้ารายการ
                </StatusBanner>
            )}
            {loadError && (
                <StatusBanner tone="error" title="โหลดข้อมูลผู้ขายไม่สำเร็จ">
                    {loadError.message}
                </StatusBanner>
            )}
            {vendorId && !vendor && !loadError && <PageSkeleton />}
            {vendor && <VendorForm vendor={vendor} />}
        </div>
    );
}
