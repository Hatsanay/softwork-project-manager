// สถานะคำขอบริการ (ฝั่งพนักงาน) — หลังออกใบเสนอราคา/เปิดโปรเจกต์ สถานะต่อจากนั้นดูที่เอกสารนั้น
import type { PillTone } from "@/components/ui/status-pill";
import type { ServiceRequestRow, ServiceRequestStatus } from "../order-links/_types";

export const REQUEST_STATUS: Record<ServiceRequestStatus, { label: string; tone: PillTone }> = {
    submitted: { label: "รอตรวจ", tone: "wait" },
    converted: { label: "ดำเนินการแล้ว", tone: "success" },
    rejected: { label: "ปฏิเสธ", tone: "neutral" },
    closed: { label: "ปิด (ไม่ได้งาน)", tone: "neutral" },
};

/** ป้ายสถานะของแถว · Fastwork ที่ออกใบภายในแล้วแต่ยังไม่รับงาน = รอผู้ซื้อจ่าย (ยังต้องทำต่อ ไม่ใช่ "ดำเนินการแล้ว") */
export function requestStatusOf(request: Pick<ServiceRequestRow, "svr_status" | "ol_kind" | "svr_project_id">) {
    if (request.ol_kind === "fastwork" && request.svr_status === "converted" && !request.svr_project_id) {
        return { label: "รอผู้ซื้อจ่ายบน Fastwork", tone: "wait" as PillTone };
    }
    return REQUEST_STATUS[request.svr_status];
}
