// แสดงเหตุผลที่บันทึกไม่สำเร็จค้างไว้บนหน้า (ไม่ใช้ toast ที่หายก่อนอ่านทัน) พร้อมรหัสอ้างอิงสำหรับแจ้งผู้ดูแลระบบ
import StatusBanner from "@/components/ui/guidance/status-banner";
import type { ApiError } from "@/lib/api";

export default function SaveErrorBanner({ error }: { error: ApiError | null }) {
    if (!error) return null;
    return (
        <StatusBanner tone="error" title={"บันทึกไม่สำเร็จ"}>
            <p>{error.message}</p>
            {error.request_id && (
                <p className="mt-1 text-xs text-gray-500">ถ้าแจ้งผู้ดูแลระบบ ให้บอกรหัส {error.request_id}</p>
            )}
        </StatusBanner>
    );
}
