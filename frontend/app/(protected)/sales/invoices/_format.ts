// รูปแบบการแสดงผลที่ใช้หลายหน้าในโมดูลใบแจ้งหนี้
import type { DueStatus } from "./_types";

/** "IV-20261014-000001" · ร่างที่ยังไม่มีเลข = "ยังไม่มีเลขที่" */
export function invoiceNumberLabel(row: { inv_number: string | null }) {
    return row.inv_number ?? "ยังไม่มีเลขที่";
}

/** ชื่อใบที่อ้างถึงจากหน้าอื่น — ร่างที่ยังไม่มีเลข = "ใบแจ้งหนี้ร่าง" */
export function invoiceReferenceLabel(row: { inv_number: string | null }) {
    return row.inv_number ?? "ใบแจ้งหนี้ร่าง";
}

/** "3.00" → "3" · "1.50" → "1.5" (อัตรา % บนเอกสาร) */
export function percentLabel(rate: string | null) {
    return rate === null ? "" : String(Number(rate));
}

/** ข้อความสถานะการชำระสั้นๆ ("เกินกำหนด 5 วัน" / "ครบกำหนดวันนี้" / "อีก 3 วันครบกำหนด") — null = ไม่มีค้างชำระ */
export function dueLabel(status: DueStatus): string | null {
    if (!status.is_outstanding) return null;
    if (status.is_overdue) return `เกินกำหนด ${status.days_overdue} วัน`;
    if (status.days_until_due === 0) return "ครบกำหนดวันนี้";
    if (status.days_until_due !== null) return `อีก ${status.days_until_due} วันครบกำหนด`;
    return null;
}
