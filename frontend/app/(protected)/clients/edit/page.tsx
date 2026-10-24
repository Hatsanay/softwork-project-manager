"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/page-header";
import { PageSkeleton } from "@/components/ui/skeleton";
import StatusBanner from "@/components/ui/guidance/status-banner";
import { apiFetch, type ApiError } from "@/lib/api";
import ClientForm from "../_components/client-form";
import type { Client } from "../_types";

export default function EditClientPage() {
    const searchParams = useSearchParams();
    const clientId = searchParams.get("id");
    const [client, setClient] = useState<Client | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);

    useEffect(() => {
        if (!clientId) return;
        let isLeftPage = false;
        apiFetch<Client>(`/clients/${clientId}`).then(({ data, error }) => {
            if (isLeftPage) return;
            setClient(data);
            setLoadError(error);
        });
        return () => {
            isLeftPage = true;
        };
    }, [clientId]);

    return (
        <div className="grid w-full gap-6">
            <PageHeader
                eyebrow="งาน · ลูกค้า"
                title="แก้ไขลูกค้า"
                description="แก้แล้วมีผลกับโปรเจกต์และเอกสารที่สร้างหลังจากนี้ · เอกสารที่ออกไปแล้วเก็บข้อมูลลูกค้าตอนออกไว้เอง"
            />
            {!clientId && (
                <StatusBanner tone="error" title="ไม่พบลูกค้านี้">
                    กลับไปเลือกลูกค้าจากหน้ารายการ
                </StatusBanner>
            )}
            {loadError && (
                <StatusBanner tone="error" title="โหลดข้อมูลลูกค้าไม่สำเร็จ">
                    {loadError.message}
                </StatusBanner>
            )}
            {clientId && !client && !loadError && <PageSkeleton />}
            {client && <ClientForm client={client} />}
        </div>
    );
}
