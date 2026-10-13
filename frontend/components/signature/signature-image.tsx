"use client";

// แสดงรูปลายเซ็นจาก GET /signatures/:id (ต้อง login — โหลดเป็น Blob แล้วทำ URL ชั่วคราว ลบทิ้งเมื่อเลิกใช้)
import { useEffect, useState } from "react";
import { apiFetchBlob } from "@/lib/api";

type SignatureImageProps = {
    signatureId: string;
    alt: string;
    className?: string;
};

export default function SignatureImage({ signatureId, alt, className = "" }: SignatureImageProps) {
    const [loaded, setLoaded] = useState<{ signatureId: string; url: string | null } | null>(null);

    useEffect(() => {
        let objectUrl: string | null = null;
        let isLeftPage = false;
        apiFetchBlob(`/signatures/${signatureId}`).then((blob) => {
            if (isLeftPage) return;
            objectUrl = blob ? URL.createObjectURL(blob) : null;
            setLoaded({ signatureId, url: objectUrl });
        });
        return () => {
            isLeftPage = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [signatureId]);

    const isCurrent = loaded?.signatureId === signatureId;
    if (!isCurrent)
        return <div className={`animate-pulse rounded-lg bg-gray-100 ${className}`} aria-label="กำลังโหลดลายเซ็น" />;
    if (!loaded.url) return <p className="text-sm text-gray-500">โหลดรูปลายเซ็นไม่สำเร็จ</p>;
    // eslint-disable-next-line @next/next/no-img-element -- URL ชั่วคราวจาก Blob ใช้ next/image ไม่ได้
    return <img src={loaded.url} alt={alt} className={`object-contain ${className}`} />;
}
