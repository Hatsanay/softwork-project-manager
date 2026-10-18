// ข้อความของหน้าใบลดหนี้ (ป้ายสถานะ + ข้อความกำกับ) — ร่างตาม docs/plans/2026-10-18-adjustments-po.md หัวข้อ 6.3 · ไม่ใช้ tooltip
import type { PillTone } from "@/components/ui/status-pill";
import type { CreditNoteStatus } from "./_types";

export const STATUS_LABELS: Record<CreditNoteStatus, { label: string; tone: PillTone }> = {
    draft: { label: "ร่าง", tone: "neutral" },
    pending_approval: { label: "รออนุมัติ", tone: "wait" },
    issued: { label: "ออกแล้ว", tone: "info" },
    cancelled: { label: "ยกเลิก", tone: "danger" },
};

export const CREDIT_NOTE_MESSAGES = {
    listDescription:
        "ใบลดหนี้ลดยอดที่ลูกค้าต้องจ่ายของใบแจ้งหนี้ที่ออกแล้ว โดยไม่ยกเลิกใบเดิม · ทุกใบต้องผ่านการอนุมัติ · ออกได้จากหน้าใบแจ้งหนี้",
    formIntro: (invoiceNumber: string) =>
        `ใบลดหนี้ลดยอดที่ลูกค้าต้องจ่ายของ ${invoiceNumber} โดยไม่ยกเลิกใบเดิม ใช้เมื่อตกลงลดราคา/ลดงานหลังออกใบไปแล้ว · ถ้ายังไม่มีเงินเข้าและแค่กรอกผิด ใช้ "ยกเลิกแล้วออกใหม่แทน" ที่หน้าใบแจ้งหนี้จะชัดกว่า`,
    lines: "กรอกยอดที่ลดก่อน VAT ทีละรายการ · VAT ใช้อัตราของใบเดิม · ระบบคิดยอดรวมให้",
    reason: "พิมพ์บนใบลดหนี้ (กฎหมายบังคับให้ระบุเหตุผล) เช่น ลูกค้าขอตัดหน้ารายงานออก 2 หน้า",
    notes: "พิมพ์ท้ายใบลดหนี้ (ถ้ามี)",
    internalNote: "ไม่พิมพ์บนเอกสาร — เห็นเฉพาะคนในระบบ",
    approval:
        "ทุกใบต้องผ่านการอนุมัติ ระบบเลือกจำนวนชั้นจากยอดที่ลดก่อน VAT (คิดเป็นบาท) · ผู้สร้างอนุมัติใบของตัวเองไม่ได้ · อนุมัติครบแล้วออกเลขให้อัตโนมัติ",
    refund: "ลูกค้าจ่ายมาแล้วเกินยอดหลังลดหนี้ — บริษัทต้องคืนเงินส่วนนี้ · ยอดโอนคืน + หัก ณ ที่จ่ายที่ลูกค้าหักไว้แล้ว ต้องเท่ากับยอดที่ต้องคืนพอดี",
    refundWithholding:
        "ส่วนที่ลูกค้าหัก ณ ที่จ่ายไว้แล้ว (ไม่ได้โอนมาจริง) จึงไม่ต้องโอนคืน — ระบบเสนอตามสัดส่วน ตรวจกับ 50 ทวิ ที่ลูกค้าให้มา",
    cancelRefund: "ใช้เมื่อบันทึกการคืนเงินผิด — ใบลดหนี้กลับเป็น “รอคืนเงิน”",
} as const;

export function creditNoteNumberLabel(row: { cn_number: string | null }) {
    return row.cn_number ?? "ยังไม่มีเลขที่";
}
