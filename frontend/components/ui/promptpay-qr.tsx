"use client";

// รูป QR พร้อมเพย์จากข้อความที่ backend สร้าง (shared/promptpay.mjs) — หน้าเว็บแค่วาดรูป ไม่สร้างข้อความเอง
// วาดเป็น data URL (PNG) ในเครื่อง ไม่ส่งข้อมูลออกไปบริการภายนอก · ใช้ทั้งหน้าดูใบแจ้งหนี้และหน้าพิมพ์
import { useEffect, useState } from "react";
import QRCode from "qrcode";

type PromptPayQrProps = {
    payload: string;
    size?: number;
    className?: string;
};

export default function PromptPayQr({ payload, size = 160, className = "" }: PromptPayQrProps) {
    const [dataUrl, setDataUrl] = useState<string | null>(null);

    useEffect(() => {
        let isStale = false;
        // ความละเอียด 2 เท่าของขนาดที่แสดง — พิมพ์ออกมาคม แอปธนาคารอ่านง่าย
        QRCode.toDataURL(payload, { errorCorrectionLevel: "M", margin: 1, width: size * 2 })
            .then((url) => {
                if (!isStale) setDataUrl(url);
            })
            .catch(() => {
                if (!isStale) setDataUrl(null);
            });
        return () => {
            isStale = true;
        };
    }, [payload, size]);

    if (!dataUrl) return <div style={{ width: size, height: size }} className={`bg-gray-100 ${className}`} />;
    return (
        // eslint-disable-next-line @next/next/no-img-element -- รูปสร้างในเครื่องเป็น data URL ไม่ผ่าน image optimizer
        <img src={dataUrl} alt="QR พร้อมเพย์" width={size} height={size} className={className} />
    );
}
