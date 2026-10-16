// ─── ตรวจข้อมูลค่าใช้จ่าย / บิลผู้ขาย (zod) — ใช้ทั้งฟอร์มหน้าเว็บและ backend ──────────────────────────────────
//
// ต้นฉบับอยู่ที่ backend/src/shared/ — สำเนาใน frontend/lib/shared/ สร้างด้วย `npm run sync-shared` ห้ามแก้ที่สำเนา
// ชื่อฟิลด์ = ชื่อคอลัมน์ · แบบระบบ: docs/plans/2026-10-16-purchasing-2.md หัวข้อ 3.4 และ 4.1
// ร่างบันทึกได้แม้ยังไม่ครบ (เช่น ยังไม่มีบรรทัด) — ความครบถ้วน/ซ้ำ/อ้างอิงที่ต้องมีอยู่จริง ตรวจใน backend (services/expense.service.js)

import { z } from "zod";
import { decimalText, integerInRange, optionalDate, optionalText, requiredDate, requiredText } from "./common.mjs";
import { BASE_CURRENCY } from "./quotation.mjs";

export const MAX_EXPENSE_LINES = 200;
export const MAX_EXPENSE_ATTACHMENTS = 10;
// วันที่ค่าใช้จ่าย: ย้อนได้ไม่เกิน 1 ปี · ล่วงหน้าได้ไม่เกิน 31 วัน (บิลค่าเช่าเดือนหน้า) — กันพิมพ์ปีผิด (ตรวจใน backend เวลาไทย)
export const MAX_EXPENSE_BACKDATE_DAYS = 365;
export const MAX_EXPENSE_FUTURE_DAYS = 31;

// ชนิดเอกสารของผู้ขาย — ใบกำกับภาษีเต็มรูปเท่านั้นที่ขอคืนภาษีซื้อได้ (หลังจด VAT — คำถาม X3)
export const EXPENSE_DOC_TYPES = [
    "tax_invoice",
    "abbreviated_tax_invoice",
    "receipt",
    "invoice",
    "substitute_receipt",
    "none",
];
// ชนิดที่ต้องมีเลขที่เอกสาร (ใช้กันบันทึกซ้ำ R-P2) — ใบรับรองแทนใบเสร็จ/ไม่มีเอกสาร ไม่มีเลขของผู้ขาย
export const DOC_TYPES_WITH_NUMBER = ["tax_invoice", "abbreviated_tax_invoice", "receipt", "invoice"];

const optionalId = z
    .string()
    .trim()
    .nullish()
    .transform((value) => (value ? value : null));

const version = integerInRange("เวอร์ชัน", 0, 2_000_000_000).nullish();

const exchangeRateText = z
    .union([z.string(), z.number()], { error: "กรุณากรอกอัตราแลกเปลี่ยน" })
    .transform((value) => String(value).trim())
    .refine((value) => /^\d{1,10}(\.\d{1,10})?$/.test(value) && Number(value) > 0, {
        message: "อัตราแลกเปลี่ยนต้องเป็นตัวเลขมากกว่า 0 ทศนิยมไม่เกิน 10 ตำแหน่ง",
    });

const lineSchema = z.object({
    exl_category_id: z
        .union([z.number(), z.string()], { error: "กรุณาเลือกหมวด" })
        .transform((value) => Number(value))
        .refine((value) => Number.isInteger(value) && value > 0, { message: "กรุณาเลือกหมวด" }),
    // ว่าง = ค่าใช้จ่ายส่วนกลาง (ไม่ผูกโปรเจกต์ — P4)
    exl_project_id: optionalId,
    exl_description: requiredText("รายละเอียด", 500),
    exl_quantity: decimalText("จำนวน", { minimum: "0.01", maximum: "9999999999.99" }).default("1.00"),
    exl_unit_price: decimalText("ราคาต่อหน่วย (ก่อน VAT)", { minimum: "0", maximum: "9999999999999.99" }),
});

/** ร่างบิลผู้ขาย (สร้าง/แก้) */
export const expenseBillDraftSchema = z
    .object({
        ex_vendor_id: requiredText("ผู้ขาย", 18),
        ex_title: requiredText("เรื่อง", 200),
        ex_branch_id: requiredText("สาขา", 18),
        // เลขเอกสารผู้ขาย: ตัดช่องว่างหัวท้ายและช่องว่างซ้อน — "INV  001" กับ "INV 001" ถือเป็นเลขเดียวกัน (R-P2)
        ex_vendor_doc_no: optionalText("เลขที่เอกสารของผู้ขาย", 50).transform((value) =>
            value === null ? null : value.replace(/\s+/g, " "),
        ),
        ex_vendor_doc_date: optionalDate("วันที่ในเอกสารของผู้ขาย"),
        ex_doc_type: z.enum(EXPENSE_DOC_TYPES, { error: "กรุณาเลือกชนิดเอกสาร" }).default("receipt"),
        ex_expense_date: requiredDate("วันที่ค่าใช้จ่าย"),
        ex_credit_days: integerInRange("เครดิต (วัน)", 0, 365).default(0),
        ex_currency: z
            .string({ error: "กรุณาเลือกสกุลเงิน" })
            .trim()
            .transform((value) => value.toUpperCase())
            .refine((value) => /^[A-Z]{3}$/.test(value), { message: "กรุณาเลือกสกุลเงิน" })
            .default(BASE_CURRENCY),
        ex_exchange_rate: exchangeRateText.default("1"),
        ex_rate_source: z.enum(["bot", "manual"], { error: "ที่มาของอัตราต้องเป็น ธปท. หรือกรอกเอง" }).nullish(),
        ex_rate_date: optionalDate("วันที่ของอัตรา"),
        ex_rate_override_reason: optionalText("เหตุผลที่แก้อัตรา", 500),
        ex_vat_amount: decimalText("VAT ตามเอกสาร", { minimum: "0", maximum: "9999999999999.99" }).default("0.00"),
        // ประเภทเงินได้ที่จะหัก ณ ที่จ่าย — ว่าง = ไม่หัก · ผู้ขายต่างประเทศ backend ล้างเป็นว่าง (ไม่ออก 50 ทวิ — X2)
        ex_wht_income_type: optionalText("ประเภทเงินได้", 20),
        ex_notes: optionalText("หมายเหตุ", 2000),
        lines: z.array(lineSchema).max(MAX_EXPENSE_LINES, `มีได้ไม่เกิน ${MAX_EXPENSE_LINES} บรรทัด`).default([]),
        ex_version: version,
    })
    .transform((expense) => {
        const isBaseCurrency = expense.ex_currency === BASE_CURRENCY;
        return {
            ...expense,
            ex_exchange_rate: isBaseCurrency ? "1" : expense.ex_exchange_rate,
            ex_rate_source: isBaseCurrency ? null : (expense.ex_rate_source ?? "manual"),
            ex_rate_date: isBaseCurrency ? null : expense.ex_rate_date,
            ex_rate_override_reason: isBaseCurrency ? null : expense.ex_rate_override_reason,
        };
    })
    .superRefine((expense, context) => {
        if (expense.ex_rate_source === "manual" && !expense.ex_rate_override_reason) {
            context.addIssue({
                code: "custom",
                path: ["ex_rate_override_reason"],
                message: "อัตราที่กรอกเองต้องใส่เหตุผล เช่น อัตราตามที่ธนาคารตัดจริง",
            });
        }
    });

/**
 * ร่างใบเบิกเงินพนักงาน (ขั้น 2-3) — ผู้เบิก = ผู้บันทึกเสมอ (backend ใส่เอง) · เงินบาทเท่านั้น · ไม่หัก ณ ที่จ่าย
 * ร้านค้าพิมพ์ชื่อเอง (ไม่ต้องอยู่ในทะเบียนผู้ขาย) · ไฟล์ใบเสร็จตรวจตอนส่ง (ต้องมีอย่างน้อย 1 ไฟล์ ยกเว้นใบรับรองแทนใบเสร็จ)
 */
export const expenseClaimDraftSchema = z.object({
    ex_title: requiredText("เรื่อง", 200),
    ex_branch_id: requiredText("สาขา", 18),
    ex_merchant_name: optionalText("ร้านค้า / ผู้รับเงิน", 150),
    ex_vendor_doc_no: optionalText("เลขที่ใบเสร็จ", 50).transform((value) =>
        value === null ? null : value.replace(/\s+/g, " "),
    ),
    ex_vendor_doc_date: optionalDate("วันที่ในใบเสร็จ"),
    ex_doc_type: z.enum(EXPENSE_DOC_TYPES, { error: "กรุณาเลือกชนิดเอกสาร" }).default("receipt"),
    ex_expense_date: requiredDate("วันที่จ่าย"),
    ex_vat_amount: decimalText("VAT ตามใบเสร็จ", { minimum: "0", maximum: "9999999999999.99" }).default("0.00"),
    ex_notes: optionalText("หมายเหตุ", 2000),
    lines: z.array(lineSchema).max(MAX_EXPENSE_LINES, `มีได้ไม่เกิน ${MAX_EXPENSE_LINES} บรรทัด`).default([]),
    ex_version: version,
});

/** ส่ง / อนุมัติ / ลบร่าง / คัดลอก */
export const expenseActionSchema = z.object({ ex_version: version });

/** ตีกลับ / ยกเลิก — ต้องมีเหตุผล */
export const expenseReasonSchema = z.object({
    reason: requiredText("เหตุผล", 500),
    ex_version: version,
});
