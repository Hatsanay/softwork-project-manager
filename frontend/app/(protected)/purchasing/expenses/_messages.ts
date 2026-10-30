// ข้อความของหน้าค่าใช้จ่าย / บิลผู้ขาย (ป้ายสถานะ + ข้อความกำกับ) — ที่เดียว · ร่างตาม docs/plans/2026-10-16-purchasing-2.md หัวข้อ 5
// ไม่ใช้ tooltip
import type { PillTone } from "@/components/ui/status-pill";
import type { ExpenseDocType, ExpenseStatus } from "./_types";

export const STATUS_LABELS: Record<ExpenseStatus, { label: string; tone: PillTone }> = {
    draft: { label: "ร่าง", tone: "neutral" },
    pending_approval: { label: "รออนุมัติ", tone: "wait" },
    approved: { label: "อนุมัติแล้ว", tone: "info" },
    cancelled: { label: "ยกเลิก", tone: "danger" },
};

export const DOC_TYPE_LABELS: Record<ExpenseDocType, string> = {
    tax_invoice: "ใบกำกับภาษีเต็มรูป",
    abbreviated_tax_invoice: "ใบกำกับภาษีอย่างย่อ",
    receipt: "ใบเสร็จรับเงิน",
    invoice: "ใบแจ้งหนี้ / Invoice",
    substitute_receipt: "ใบรับรองแทนใบเสร็จ",
    none: "ไม่มีเอกสาร",
};

export const EXPENSE_MESSAGES = {
    listDescription:
        "บิลและค่าใช้จ่ายที่บริษัทต้องจ่าย · ยอดก่อน VAT ต่ำกว่าวงเงินที่ตั้งผ่านอัตโนมัติ เกินนั้นรออนุมัติตามชั้น · อนุมัติแล้วได้เลข EX และรอจ่าย",
    vendor: "แสดงเฉพาะผู้ขายที่เปิดใช้งาน · เลือกแล้วระบบเติมสกุลเงิน เครดิต ประเภทเงินได้ และหมวดตามข้อมูลผู้ขาย",
    vendorDocNo: "ใช้กันบันทึกบิลใบเดียวซ้ำ · ผู้ขายเดียวกัน เลขเดียวกัน บันทึกซ้ำไม่ได้",
    docType:
        "ใบกำกับภาษีเต็มรูปเท่านั้นที่ขอคืนภาษีซื้อได้ (หลังบริษัทจด VAT) · ใบรับรองแทนใบเสร็จใช้เมื่อผู้ขายออกใบเสร็จไม่ได้",
    expenseDate: "วันที่ในเอกสารผู้ขาย หรือวันที่จ่ายไปก่อน · ย้อนได้ 1 ปี ล่วงหน้าได้ 31 วัน",
    creditDays: "ครบกำหนดจ่าย = วันที่ค่าใช้จ่าย + จำนวนวันนี้ · 0 = ครบกำหนดวันเดียวกัน",
    vat: "ใส่ตามที่ผู้ขายคิดในเอกสาร · บริษัทยังไม่จด VAT ภาษีซื้อเป็นต้นทุน ขอคืนไม่ได้",
    vatClaimable: "บริษัทจด VAT แล้ว และเป็นใบกำกับภาษีเต็มรูป · ภาษีซื้อนี้ขอคืนได้",
    withholding: "หักจากยอดก่อน VAT ตามประเภทเงินได้ · ยอดนี้เป็นประมาณการ หักจริงตอนทำจ่าย · ว่าง = ไม่หัก",
    withholdingForeign: "ผู้ขายต่างประเทศไม่ออก 50 ทวิ (ตรวจกับนักบัญชีเรื่อง ภ.ง.ด.54 / ภ.พ.36)",
    lineProject: "ว่าง = ค่าใช้จ่ายส่วนกลางของบริษัท · เลือกโปรเจกต์ = นับเป็นต้นทุนของโปรเจกต์นั้น",
    linePrice: "ราคาก่อน VAT หลังหักส่วนลดตามเอกสาร",
    attachments:
        "ใบเสร็จ/ใบกำกับของผู้ขาย (PDF, JPG, PNG ไม่เกิน 10 MB) · เปิดได้เฉพาะคนที่มีสิทธิ์ · ส่งแล้วแนบเพิ่มได้ แต่ลบไม่ได้",
    approval:
        "ยอดก่อน VAT (คิดเป็นบาท) ต่ำกว่าวงเงินชั้น 1 ผ่านอัตโนมัติทันทีที่ส่ง · ตั้งแต่วงเงินขึ้นไปรออนุมัติตามชั้น · ตั้งวงเงินได้ที่ ตั้งค่าระบบ › ข้อมูลบริษัท › การอนุมัติ",
    numberLater: "ได้เลข EX ตอนอนุมัติครบ (หรือผ่านอัตโนมัติ)",
    copy: "คัดลอกเป็นร่างใหม่ (รายจ่ายประจำ) · วันที่เป็นวันนี้ ไม่คัดลอกเลขเอกสารผู้ขายและไฟล์แนบ",
} as const;

/** ขนาดไฟล์อ่านง่าย: 523 KB · 1.2 MB */
export function fileSizeLabel(bytes: number) {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** "EX-20261016-000001" · ยังไม่อนุมัติ = "ยังไม่มีเลขที่" */
export function expenseNumberLabel(row: { ex_number: string | null }) {
    return row.ex_number ?? "ยังไม่มีเลขที่";
}

/** ข้อความสถานะการจ่ายสั้นๆ — null = ไม่มียอดค้าง */
export function expenseDueLabel(status: {
    is_outstanding: boolean;
    is_overdue: boolean;
    days_overdue: number;
    days_until_due: number | null;
}): string | null {
    if (!status.is_outstanding) return null;
    if (status.is_overdue) return `เกินกำหนด ${status.days_overdue} วัน`;
    if (status.days_until_due === 0) return "ครบกำหนดวันนี้";
    if (status.days_until_due !== null) return `อีก ${status.days_until_due} วันครบกำหนด`;
    return null;
}
