"use client";

// ที่อยู่สั้นใต้ QR /o/<รหัส 8 ตัว> (2026-10-25) — พาไปหน้าร้าน /order/<รหัส> (backend รับทั้ง token และรหัสสั้น)
import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageSkeleton } from "@/components/ui/skeleton";

export default function ShortOrderLink() {
    const params = useParams<{ code: string }>();
    const router = useRouter();

    useEffect(() => {
        router.replace(`/order/${encodeURIComponent(params.code.toUpperCase())}`);
    }, [params.code, router]);

    return <PageSkeleton label="กำลังเปิด..." />;
}
