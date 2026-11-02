"use client";

// โหลดข้อมูลไม่สำเร็จ: บอกเหตุผล + ปุ่มลองใหม่ แทนรายการว่าง (usability R2-1 · 2026-11-01)
// ไม่มีสิทธิ์ (403) บอกตรงๆ ไม่มีปุ่มลองใหม่ เพราะกดซ้ำก็ไม่ได้ · ที่เหลือ (เน็ตหลุด ระบบขัดข้อง) ลองใหม่ได้
import { RefreshCw } from "lucide-react";
import StatusBanner from "@/components/ui/guidance/status-banner";
import { buttonClass } from "@/components/ui/button";

export type LoadError = { status: number; message: string };

// เน็ตหลุด/เซิร์ฟเวอร์ไม่ตอบ (fetch โยน error) · หน้าที่ยังใช้ fetch ตรงใช้ร่วมกัน
export const NETWORK_LOAD_ERROR: LoadError = {
    status: 0,
    message: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ · ตรวจอินเทอร์เน็ตแล้วกดลองใหม่",
};

/** คำตอบที่ไม่ ok → LoadError (ข้อความจาก backend ถ้ามี) · สำหรับหน้าที่ยังใช้ fetch ตรง ไม่ผ่าน apiFetch */
export async function loadErrorOf(response: Response): Promise<LoadError> {
    const body = (await response.json().catch(() => ({}))) as { message?: unknown };
    return {
        status: response.status,
        message: typeof body.message === "string" ? body.message : "โหลดไม่สำเร็จ กรุณาลองใหม่",
    };
}

type LoadErrorBannerProps = {
    error: LoadError;
    onRetry?: () => void;
};

export default function LoadErrorBanner({ error, onRetry }: LoadErrorBannerProps) {
    if (error.status === 403) {
        return (
            <StatusBanner tone="warn" title="ไม่มีสิทธิ์ดูหน้านี้">
                บัญชีของคุณยังไม่ได้รับสิทธิ์นี้ · ถ้าต้องใช้ ขอผู้ดูแลระบบเพิ่มสิทธิ์ให้ที่หน้าจัดการสิทธิ์
            </StatusBanner>
        );
    }
    return (
        <StatusBanner tone="error" title="โหลดรายการไม่สำเร็จ">
            <p>{error.message}</p>
            {onRetry && (
                <button type="button" onClick={onRetry} className={`${buttonClass("secondary", "sm")} mt-3`}>
                    <RefreshCw size={14} />
                    ลองใหม่
                </button>
            )}
        </StatusBanner>
    );
}
