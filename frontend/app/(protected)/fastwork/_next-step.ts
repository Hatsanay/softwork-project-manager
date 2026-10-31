// ขั้นถัดไปของงาน Fastwork (ป้ายในหน้า Fastwork และแดชบอร์ด · แยกไฟล์ 2026-10-31)
import type { PillTone } from "@/components/ui/status-pill";
import type { FastworkNextStep } from "./_types";

export const NEXT_STEP: Record<FastworkNextStep, { label: string; tone: PillTone }> = {
    work: { label: "กำลังทำงาน", tone: "info" },
    record: { label: "รอบันทึกเงิน", tone: "wait" },
    receive: { label: "รอเงินเข้า", tone: "wait" },
    close: { label: "เงินเข้าครบ พร้อมปิดยอด", tone: "success" },
    pay: { label: "ปิดยอดแล้ว ค้างจ่ายส่วนแบ่ง", tone: "wait" },
    done: { label: "จ่ายส่วนแบ่งครบแล้ว", tone: "success" },
};
