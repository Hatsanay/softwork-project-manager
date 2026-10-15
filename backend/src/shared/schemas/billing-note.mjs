// ─── ตรวจข้อมูลใบวางบิล (zod) — ใช้ทั้งฟอร์มหน้าเว็บและ backend ───────────────────────────────────────
//
// ต้นฉบับอยู่ที่ backend/src/shared/ — สำเนาใน frontend/lib/shared/ สร้างด้วย `npm run sync-shared` ห้ามแก้ที่สำเนา
// ชื่อฟิลด์ = ชื่อคอลัมน์ · แบบระบบ: docs/plans/2026-10-14-invoices-1b.md หัวข้อ 4.4
//
// ใบวางบิล = รวมใบแจ้งหนี้ที่ออกแล้วของลูกค้ารายเดียว สกุลเงินเดียว + วันนัดชำระ · สกุลเงินมาจากใบแจ้งหนี้ (ไม่ต้องส่ง)
// ใบแจ้งหนี้ที่เลือกได้/วันนัดชำระไม่ย้อนหลัง ตรวจใน backend/src/services/billing-note.service.js

import { z } from "zod";
import { integerInRange, optionalDate, optionalText, requiredText } from "./common.mjs";

export const MAX_BILLING_NOTE_INVOICES = 100;

const version = integerInRange("เวอร์ชัน", 0, 2_000_000_000).nullish();

/** สร้าง/แก้ร่างใบวางบิล */
export const billingNoteDraftSchema = z.object({
    bn_client_id: requiredText("ลูกค้า", 18),
    bn_branch_id: requiredText("สาขา", 18),
    bn_language: z.enum(["th", "en"], { error: "ภาษาเอกสารต้องเป็นไทยหรืออังกฤษ" }).default("th"),
    // วันที่ลูกค้านัดจ่าย — ว่างได้ (หน้าพิมพ์เว้นช่องให้เขียนเอง)
    bn_payment_date: optionalDate("วันนัดชำระ"),
    bn_notes: optionalText("หมายเหตุ", 2000),
    invoice_ids: z
        .array(requiredText("ใบแจ้งหนี้", 18), { error: "กรุณาเลือกใบแจ้งหนี้" })
        .min(1, "เลือกใบแจ้งหนี้อย่างน้อย 1 ใบ")
        .max(MAX_BILLING_NOTE_INVOICES, `ใบวางบิลหนึ่งใบรวมได้ไม่เกิน ${MAX_BILLING_NOTE_INVOICES} ใบแจ้งหนี้`)
        .refine((ids) => new Set(ids).size === ids.length, { message: "เลือกใบแจ้งหนี้ซ้ำกัน" }),
    bn_version: version,
});

/** ออก / ลบร่าง */
export const billingNoteActionSchema = z.object({ bn_version: version });

/** ยกเลิก — ต้องมีเหตุผล */
export const billingNoteReasonSchema = z.object({
    reason: requiredText("เหตุผล", 500),
    bn_version: version,
});
