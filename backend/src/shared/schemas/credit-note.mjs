// ─── ตรวจข้อมูลใบลดหนี้ (zod) — ใช้ทั้งฟอร์มหน้าเว็บและ backend ───────────────────────────────────────────
//
// ต้นฉบับอยู่ที่ backend/src/shared/ — สำเนาใน frontend/lib/shared/ สร้างด้วย `npm run sync-shared` ห้ามแก้ที่สำเนา
// ชื่อฟิลด์ = ชื่อคอลัมน์ · แบบระบบ: docs/plans/2026-10-18-adjustments-po.md หัวข้อ 3.1, 4.1
// ยอดเงินคำนวณใน backend เสมอ (shared/credit-note-totals.mjs) — ฟอร์มส่งมาแค่ยอดก่อน VAT ของแต่ละบรรทัด

import { z } from "zod";
import { decimalText, integerInRange, optionalText, requiredDate, requiredText } from "./common.mjs";

export const MAX_CREDIT_NOTE_LINES = 50;
// วันที่คืนเงินย้อนหลังได้ไม่เกิน (วัน) — เท่ากับวันที่รับเงินของใบเสร็จ
export const MAX_REFUND_BACKDATE_DAYS = 30;

export const CREDIT_NOTE_REASONS = {
    price_reduction: "ลดราคา / ให้ส่วนลดหลังออกใบ",
    scope_reduction: "ลดขอบเขตงาน / ยกเลิกบางส่วน",
    defect: "งานหรือสินค้าไม่เป็นไปตามตกลง",
    error: "คิดยอดผิด",
    other: "อื่นๆ",
};

const version = integerInRange("เวอร์ชัน", 0, 2_000_000_000).nullish();

const lineSchema = z.object({
    cnl_description: requiredText("รายละเอียด", 500),
    cnl_amount: decimalText("ยอดที่ลด (ก่อน VAT)", { minimum: "0.01" }),
});

/** ร่างใบลดหนี้ — สร้างใหม่ส่ง cn_invoice_id มาด้วย · แก้ร่างไม่ต้องส่ง (เปลี่ยนใบเดิมไม่ได้) */
export const creditNoteDraftSchema = z.object({
    cn_invoice_id: z.string().trim().max(18).optional(),
    cn_reason_code: z.enum(Object.keys(CREDIT_NOTE_REASONS), { error: "เลือกเหตุผลที่ลดหนี้" }),
    cn_reason: requiredText("รายละเอียดเหตุผล", 500),
    cn_notes: optionalText("หมายเหตุบนเอกสาร", 2000),
    cn_internal_note: optionalText("บันทึกภายใน", 2000),
    lines: z
        .array(lineSchema, { error: "ใส่รายการที่ลดอย่างน้อย 1 บรรทัด" })
        .min(1, "ใส่รายการที่ลดอย่างน้อย 1 บรรทัด")
        .max(MAX_CREDIT_NOTE_LINES, `ใส่ได้ไม่เกิน ${MAX_CREDIT_NOTE_LINES} บรรทัด`),
    cn_version: version,
});

export const creditNoteActionSchema = z.object({ cn_version: version });

export const creditNoteReasonSchema = z.object({
    reason: requiredText("เหตุผล", 500),
    cn_version: version,
});

/** บันทึกคืนเงินลูกค้า — โอนคืน + หัก ณ ที่จ่ายที่ไม่ต้องคืน = ส่วนที่ลูกค้าจ่ายเกิน (ตรวจใน backend) */
export const creditNoteRefundSchema = z.object({
    cn_refund_date: requiredDate("วันที่คืนเงิน"),
    cn_refund_bank_account_id: requiredText("บัญชีที่โอนคืนออก", 18),
    cn_refund_amount: decimalText("ยอดโอนคืน"),
    cn_refund_wht: decimalText("หัก ณ ที่จ่ายที่ไม่ต้องคืน"),
    cn_refund_reference: optionalText("เลขอ้างอิงการโอน", 100),
    cn_refund_note: optionalText("หมายเหตุการคืนเงิน", 500),
    cn_version: version,
});
