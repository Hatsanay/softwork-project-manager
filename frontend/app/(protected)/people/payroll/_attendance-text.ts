// ข้อความหักสาย/ออกก่อน/ขาด ในรอบเงินเดือน (ลงเวลา A-4 · 2026-10-24) — ใช้ทั้งรายละเอียดรายคน รายการ และสลิป
import type { PayrollItem } from "../_types";
import { durationText } from "../_time-text";

export function attendanceDeductionText(item: Pick<PayrollItem, "pri_late_minutes" | "pri_early_leave_minutes" | "pri_absent_days">) {
    const parts: string[] = [];
    if (item.pri_late_minutes > 0) parts.push(`สาย ${durationText(item.pri_late_minutes)}`);
    if (item.pri_early_leave_minutes > 0) parts.push(`ออกก่อน ${durationText(item.pri_early_leave_minutes)}`);
    if (item.pri_absent_days > 0) parts.push(`ขาด ${item.pri_absent_days} วัน`);
    return parts.join(" · ");
}
