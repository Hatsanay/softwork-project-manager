"use client";

// ลิงก์เลือกบริการ /order/<token หรือรหัสสั้น> (2026-10-25 · S-1) — ลูกค้าเปิดได้โดยไม่ต้อง login
// ลิงก์ปิด/หมดอายุ = บอกเหตุผล · ลิงก์รายคนที่ส่งแล้ว = ไปหน้าสถานะ · เปิดอยู่ = หน้าร้าน
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CalendarX, Link2Off, PackageX } from "lucide-react";
import { CustomerLoading, CustomerNotice } from "@/components/customer/customer-shell";
import type { ApiError } from "@/lib/api";
import OrderShell from "../_components/order-shell";
import OrderShop from "../_components/order-shop";
import { publicFetch } from "../_public-api";
import type { ShopResponse } from "../_types";

const CLOSED_TITLE: Partial<Record<string, string>> = {
    expired: "ลิงก์นี้หมดอายุแล้ว",
    unavailable: "ลิงก์นี้ใช้ไม่ได้ชั่วคราว",
};

export default function OrderPage() {
    const params = useParams<{ code: string }>();
    const code = params.code;
    const router = useRouter();
    const [data, setData] = useState<ShopResponse | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);
    // โหลดใหม่ (ราคาเปลี่ยน) = แทนข้อมูลร้าน · หน้าร้านไม่เริ่มใหม่ สิ่งที่ลูกค้ากรอกไว้ไม่หาย
    const load = useCallback(async () => {
        const { data: loaded, error } = await publicFetch<ShopResponse>(`/order/${code}`);
        setLoadError(error);
        if (loaded) setData(loaded);
    }, [code]);

    useEffect(() => {
        let isLeftPage = false;
        publicFetch<ShopResponse>(`/order/${code}`).then(({ data: loaded, error }) => {
            if (isLeftPage) return;
            setLoadError(error);
            if (loaded) setData(loaded);
        });
        return () => {
            isLeftPage = true;
        };
    }, [code]);

    useEffect(() => {
        if (data?.submitted_token) router.replace(`/order/r/${data.submitted_token}`);
    }, [data, router]);

    if (loadError) {
        return (
            <OrderShell shop={null} subtitle="ลิงก์เลือกบริการ">
                <CustomerNotice icon={Link2Off} title="เปิดลิงก์นี้ไม่ได้">
                    {loadError.message}
                </CustomerNotice>
            </OrderShell>
        );
    }
    if (!data || data.submitted_token) return <CustomerLoading label="กำลังเปิดหน้าเลือกบริการ..." width="wide" />;
    if (data.link.state !== "open" || !data.catalog) {
        return (
            <OrderShell shop={data.shop} subtitle="ลิงก์เลือกบริการ">
                <CustomerNotice
                    icon={data.link.state === "expired" ? CalendarX : data.link.state === "unavailable" ? PackageX : Link2Off}
                    title={CLOSED_TITLE[data.link.state] ?? "ลิงก์นี้ปิดรับแล้ว"}
                >
                    {data.link.state === "unavailable" ? `รายการที่ทีมงานเลือกให้มีการเปลี่ยนแปลง กรุณาติดต่อ ${data.shop.name}` : `ติดต่อ ${data.shop.name} เพื่อขอลิงก์ใหม่`}
                </CustomerNotice>
            </OrderShell>
        );
    }
    return <OrderShop code={code} data={data} onReload={load} />;
}
