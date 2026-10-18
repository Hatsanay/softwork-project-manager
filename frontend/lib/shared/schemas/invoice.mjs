// ─── ตรวจข้อมูลใบแจ้งหนี้ (zod) — ใช้ทั้งฟอร์มหน้าเว็บและ backend ───────────────────────────────────────
//
// ต้นฉบับอยู่ที่ backend/src/shared/ — สำเนาใน frontend/lib/shared/ สร้างด้วย `npm run sync-shared` ห้ามแก้ที่สำเนา
// ชื่อฟิลด์ = ชื่อคอลัมน์ · แบบระบบ: docs/plans/2026-10-14-invoices-1b.md หัวข้อ 4
//
// ใบแจ้งหนี้มี 2 แบบ (+ ใบเพิ่มหนี้ ซึ่งเป็นใบสร้างเองที่อ้างใบเดิม — invoiceDebitNoteDraftSchema):
//   - ออกจากงวดของใบเสนอราคา: ยอด/รายการ/ลูกค้า/สกุลเงินล็อกตามใบเสนอราคา แก้ได้แค่ข้อมูลประกอบ (invoiceQuotationDraftSchema)
//   - สร้างเอง: แก้ได้ทุกช่องเหมือนร่างใบเสนอราคา (invoiceManualDraftSchema) แล้วต้องผ่านการอนุมัติ
// ความครบถ้วนตรวจตอนออก/ส่งขออนุมัติ (backend/src/services/invoice-workflow.service.js)

import { z } from "zod";
import { decimalText, integerInRange, optionalDate, optionalText, requiredText } from "./common.mjs";
import { BASE_CURRENCY } from "./quotation.mjs";

export const MAX_INVOICE_ITEMS = 500;
export const MAX_CREDIT_DAYS = 365;

const optionalId = z
    .string()
    .trim()
    .nullish()
    .transform((value) => (value ? value : null));

const nullableDecimal = (label, range) =>
    decimalText(label, range)
        .nullish()
        .transform((value) => value ?? null);

const version = integerInRange("เวอร์ชัน", 0, 2_000_000_000).nullish();

const exchangeRateText = z
    .union([z.string(), z.number()], { error: "กรุณากรอกอัตราแลกเปลี่ยน" })
    .transform((value) => String(value).trim())
    .refine((value) => /^\d{1,10}(\.\d{1,10})?$/.test(value) && Number(value) > 0, {
        message: "อัตราแลกเปลี่ยนต้องเป็นตัวเลขมากกว่า 0 ทศนิยมไม่เกิน 10 ตำแหน่ง",
    });

// ช่องที่แก้ได้ทั้งสองแบบ
const commonDraftFields = {
    inv_title: requiredText("ชื่อเรื่อง", 200),
    inv_branch_id: requiredText("สาขา", 18),
    inv_credit_days: integerInRange("เครดิตเทอม (วัน)", 0, MAX_CREDIT_DAYS),
    // อัตราหัก ณ ที่จ่ายที่แสดงบนใบ — ว่าง = ไม่แสดงบรรทัดหัก ณ ที่จ่าย
    inv_wht_rate: nullableDecimal("อัตราหัก ณ ที่จ่าย (%)", { minimum: "0", maximum: "15" }),
    inv_notes: optionalText("หมายเหตุ", 5000),
    inv_internal_note: optionalText("บันทึกภายใน", 2000),
    inv_bank_account_id: optionalId,
    inv_version: version,
};

/** สร้างร่างจากงวดของใบเสนอราคาที่ลูกค้าตอบรับแล้ว — เลือกได้หลายงวดของใบเดียวกัน */
export const invoiceFromQuotationSchema = z.object({
    quotation_id: requiredText("ใบเสนอราคา", 18),
    milestone_ids: z
        .array(
            z
                .union([z.number(), z.string()], { error: "งวดที่เลือกไม่ถูกต้อง" })
                .transform((value) => Number(value))
                .refine((value) => Number.isInteger(value) && value > 0, { message: "งวดที่เลือกไม่ถูกต้อง" }),
            { error: "กรุณาเลือกงวดที่จะเรียกเก็บ" },
        )
        .min(1, "เลือกงวดที่จะเรียกเก็บอย่างน้อย 1 งวด")
        .max(24, "เลือกได้ไม่เกิน 24 งวด"),
});

/** แก้ร่างที่ออกจากงวด — ยอด/รายการ/ลูกค้า/สกุลเงินล็อกตามใบเสนอราคา */
export const invoiceQuotationDraftSchema = z.object(commonDraftFields);

const itemSchema = z
    .object({
        invi_type: z.enum(["item", "heading", "note"], { error: "ชนิดแถวต้องเป็น รายการ / หัวข้อ / หมายเหตุ" }),
        invi_product_id: optionalId,
        invi_description: requiredText("รายละเอียดของแถว", 2000),
        invi_quantity: nullableDecimal("จำนวน", { minimum: "0.01", maximum: "9999999999.99" }),
        invi_unit: optionalText("หน่วย", 30),
        invi_unit_price: nullableDecimal("ราคาต่อหน่วย", { minimum: "0", maximum: "9999999999999.99" }),
        invi_list_price: nullableDecimal("ราคาตั้งต้น", { minimum: "0", maximum: "9999999999999.99" }),
        invi_discount_type: z.enum(["amount", "percent"], { error: "ชนิดส่วนลดต้องเป็นบาทหรือ %" }).default("amount"),
        invi_discount_value: decimalText("ส่วนลด", { minimum: "0", maximum: "9999999999999.99" }).default("0.00"),
    })
    // หัวข้อ/หมายเหตุไม่มีจำนวน ราคา ส่วนลด
    .transform((item) =>
        item.invi_type === "item"
            ? item
            : {
                  ...item,
                  invi_product_id: null,
                  invi_quantity: null,
                  invi_unit: null,
                  invi_unit_price: null,
                  invi_list_price: null,
                  invi_discount_type: "amount",
                  invi_discount_value: "0.00",
              },
    );

/** แถวที่เป็นรายการ (มีราคา) ต้องมีจำนวนและราคาต่อหน่วย */
function checkPricedItems(items, context) {
    items.forEach((item, index) => {
        if (item.invi_type !== "item") return;
        if (item.invi_quantity === null) {
            context.addIssue({ code: "custom", path: ["items", index, "invi_quantity"], message: "กรุณากรอกจำนวน" });
        }
        if (item.invi_unit_price === null) {
            context.addIssue({
                code: "custom",
                path: ["items", index, "invi_unit_price"],
                message: "กรุณากรอกราคาต่อหน่วย",
            });
        }
    });
}

const itemsField = z.array(itemSchema).max(MAX_INVOICE_ITEMS, `ใบแจ้งหนี้มีได้ไม่เกิน ${MAX_INVOICE_ITEMS} แถว`).default([]);
const discountTypeField = z.enum(["amount", "percent"], { error: "ชนิดส่วนลดต้องเป็นบาทหรือ %" }).default("amount");
const discountValueField = decimalText("ส่วนลดท้ายบิล", { minimum: "0", maximum: "9999999999999.99" }).default("0.00");

/** ร่างใบแจ้งหนี้ที่สร้างเอง (ไม่อ้างใบเสนอราคา) */
export const invoiceManualDraftSchema = z
    .object({
        ...commonDraftFields,
        inv_client_id: requiredText("ลูกค้า", 18),
        inv_project_id: optionalId,
        inv_language: z.enum(["th", "en"], { error: "ภาษาเอกสารต้องเป็นไทยหรืออังกฤษ" }).default("th"),
        inv_currency: z
            .string({ error: "กรุณาเลือกสกุลเงิน" })
            .trim()
            .transform((value) => value.toUpperCase())
            .refine((value) => /^[A-Z]{3}$/.test(value), { message: "กรุณาเลือกสกุลเงิน" })
            .default(BASE_CURRENCY),
        inv_exchange_rate: exchangeRateText.default("1"),
        inv_rate_source: z.enum(["bot", "manual"], { error: "ที่มาของอัตราต้องเป็น ธปท. หรือกรอกเอง" }).nullish(),
        inv_rate_date: optionalDate("วันที่ของอัตรา"),
        inv_rate_override_reason: optionalText("เหตุผลที่แก้อัตรา", 500),
        inv_vat_treatment: z.enum(["standard", "zero"], { error: "การคิด VAT ต้องเป็นปกติหรือ 0%" }).default("standard"),
        inv_discount_type: discountTypeField,
        inv_discount_value: discountValueField,
        items: itemsField,
    })
    .transform((invoice) => {
        const isBaseCurrency = invoice.inv_currency === BASE_CURRENCY;
        return {
            ...invoice,
            inv_exchange_rate: isBaseCurrency ? "1" : invoice.inv_exchange_rate,
            inv_rate_source: isBaseCurrency ? null : (invoice.inv_rate_source ?? "manual"),
            inv_rate_date: isBaseCurrency ? null : invoice.inv_rate_date,
            inv_rate_override_reason: isBaseCurrency ? null : invoice.inv_rate_override_reason,
        };
    })
    .superRefine((invoice, context) => {
        checkPricedItems(invoice.items, context);
        if (invoice.inv_rate_source === "manual" && !invoice.inv_rate_override_reason) {
            context.addIssue({
                code: "custom",
                path: ["inv_rate_override_reason"],
                message: "อัตราที่กรอกเองต้องใส่เหตุผล เช่น ตกลงอัตราคงที่กับลูกค้า หรือ ธปท. ยังไม่มีอัตรา",
            });
        }
    });

// ─── ใบเพิ่มหนี้ (2026-10-18 ขั้น N-2 — docs/plans/2026-10-18-adjustments-po.md หัวข้อ 4.2) ───────────────────────
// ใบแจ้งหนี้ชนิด "เพิ่มหนี้" อ้างใบแจ้งหนี้ที่ออกแล้ว · ลูกค้า สาขา โปรเจกต์ สกุลเงิน การคิด VAT ภาษาเอกสาร คัดลอกจากใบเดิม (แก้ไม่ได้)
// กรอกเฉพาะรายการที่เพิ่ม + เหตุผล (กฎหมายบังคับ) · ที่เหลือเหมือนใบแจ้งหนี้สร้างเอง (อนุมัติตามกติกา IV · รับเงิน · วางบิล · QR)

/** เหตุผลที่เพิ่มหนี้ — รหัสไว้ทำรายงาน ข้อความเต็มกรอกเอง */
export const DEBIT_NOTE_REASONS = {
    price_increase: "ปรับราคาขึ้นจากที่ออกใบไป",
    scope_increase: "งานหรือจำนวนเพิ่มจากที่ตกลง",
    error: "คิดยอดต่ำกว่าที่ควร",
    other: "อื่นๆ",
};

export const invoiceDebitNoteDraftSchema = z
    .object({
        inv_reference_invoice_id: requiredText("ใบแจ้งหนี้ที่อ้างอิง", 18),
        inv_adjust_reason_code: z.enum(Object.keys(DEBIT_NOTE_REASONS), { error: "เลือกเหตุผลที่เพิ่มหนี้" }),
        inv_adjust_reason: requiredText("รายละเอียดเหตุผล", 500),
        inv_title: commonDraftFields.inv_title,
        inv_credit_days: commonDraftFields.inv_credit_days,
        inv_wht_rate: commonDraftFields.inv_wht_rate,
        inv_notes: commonDraftFields.inv_notes,
        inv_internal_note: commonDraftFields.inv_internal_note,
        inv_bank_account_id: commonDraftFields.inv_bank_account_id,
        inv_version: commonDraftFields.inv_version,
        inv_discount_type: discountTypeField,
        inv_discount_value: discountValueField,
        items: itemsField,
    })
    .superRefine((debitNote, context) => checkPricedItems(debitNote.items, context));

/** ออกใบ (ใบจากงวด) — VAT วันนี้ต่างจากใบเสนอราคา ต้องส่ง confirm_vat_change: true มายืนยัน (R-B4) */
export const invoiceIssueSchema = z.object({
    inv_version: version,
    confirm_vat_change: z.boolean({ error: "ค่ายืนยันไม่ถูกต้อง" }).default(false),
});

/** ส่งขออนุมัติ / อนุมัติ / ส่งลูกค้า / ลบร่าง */
export const invoiceActionSchema = z.object({ inv_version: version });

/** ตีกลับ / ยกเลิก / ออกใหม่แทน — ต้องมีเหตุผล */
export const invoiceReasonSchema = z.object({
    reason: requiredText("เหตุผล", 500),
    inv_version: version,
});
