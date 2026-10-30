// ข้อความของหน้าลูกหนี้คงค้าง — ที่เดียว · ไม่ใช้ tooltip (แบบระบบ 2026-10-15-receipts-1c.md หัวข้อ 4.5)
import type { PillTone } from "@/components/ui/status-pill";
import type { AgingBucketKey } from "./_types";

export const RECEIVABLE_MESSAGES = {
    description:
        "ใบแจ้งหนี้ที่ออกแล้วและยังค้างชำระ แยกตามจำนวนวันที่เลยวันครบกำหนด (เทียบวันนี้ เวลาไทย) · ยอดเป็นบาท · สกุลต่างประเทศคิดจากอัตรา ณ วันออกใบแจ้งหนี้",
    empty: "ไม่มีลูกหนี้คงค้าง · ใบแจ้งหนี้ที่ออกแล้วรับชำระครบทุกใบ",
    clientDescription: "ยอดค้างของแต่ละใบในสกุลของใบ และเทียบเป็นบาท · เรียงจากใบที่ครบกำหนดก่อน",
} as const;

// สีของช่วงอายุ: ยิ่งเกินนานยิ่งเตือนแรง (ใช้สีสถานะชุดเดียวกับทั้งระบบ)
export const BUCKET_TONES: Record<AgingBucketKey, PillTone> = {
    current: "neutral",
    days_1_30: "wait",
    days_31_60: "wait",
    days_61_90: "danger",
    days_over_90: "danger",
};
