// ─── ตรวจข้อมูลใบเสนอราคา (zod) — ใช้ทั้งฟอร์มหน้าเว็บและ backend ──────────────────────────────────────
//
// ต้นฉบับอยู่ที่ backend/src/shared/ — สำเนาใน frontend/lib/shared/ สร้างด้วย `npm run sync-shared` ห้ามแก้ที่สำเนา
// ชื่อฟิลด์ = ชื่อคอลัมน์ · แบบระบบ: docs/plans/2026-10-08-sales-cycle.md หัวข้อ 2, 4, 4.1
//
// ร่างบันทึกได้แม้ยังไม่ครบ (ยังไม่มีรายการ / งวดยังรวมไม่ตรง) แต่ทุกค่าที่กรอกมาต้องถูกรูปแบบ
// ความครบถ้วนตรวจตอน "ส่งขออนุมัติ" (backend/src/services/quotation-workflow.service.js)

import { z } from "zod";
import { decimalText, integerInRange, optionalDate, optionalText, requiredText } from "./common.mjs";

export const MAX_QUOTATION_ITEMS = 500;
export const MAX_QUOTATION_MILESTONES = 24;
export const BASE_CURRENCY = "THB";

const optionalId = z
    .string()
    .trim()
    .nullish()
    .transform((value) => (value ? value : null));

// อัตราแลกเปลี่ยน: บาทต่อ 1 หน่วย ทศนิยมได้ 10 ตำแหน่ง (ตาม DECIMAL(20,10))
const exchangeRateText = z
    .union([z.string(), z.number()], { error: "กรุณากรอกอัตราแลกเปลี่ยน" })
    .transform((value) => String(value).trim())
    .refine((value) => /^\d{1,10}(\.\d{1,10})?$/.test(value) && Number(value) > 0, {
        message: "อัตราแลกเปลี่ยนต้องเป็นตัวเลขมากกว่า 0 ทศนิยมไม่เกิน 10 ตำแหน่ง",
    });

const nullableDecimal = (label, range) =>
    decimalText(label, range)
        .nullish()
        .transform((value) => value ?? null);

const itemSchema = z
    .object({
        qti_type: z.enum(["item", "heading", "note"], { error: "ชนิดแถวต้องเป็น รายการ / หัวข้อ / หมายเหตุ" }),
        qti_product_id: optionalId,
        qti_package_id: optionalId,
        qti_description: requiredText("รายละเอียดของแถว", 2000),
        qti_quantity: nullableDecimal("จำนวน", { minimum: "0.01", maximum: "9999999999.99" }),
        qti_unit: optionalText("หน่วย", 30),
        qti_unit_price: nullableDecimal("ราคาต่อหน่วย", { minimum: "0", maximum: "9999999999999.99" }),
        qti_list_price: nullableDecimal("ราคาตั้งต้น", { minimum: "0", maximum: "9999999999999.99" }),
        qti_discount_type: z.enum(["amount", "percent"], { error: "ชนิดส่วนลดต้องเป็นบาทหรือ %" }).default("amount"),
        qti_discount_value: decimalText("ส่วนลด", { minimum: "0", maximum: "9999999999999.99" }).default("0.00"),
    })
    // หัวข้อ/หมายเหตุไม่มีจำนวน ราคา ส่วนลด — ทิ้งค่าที่อาจค้างมาจากตอนเปลี่ยนชนิดแถว
    .transform((item) =>
        item.qti_type === "item"
            ? item
            : {
                  ...item,
                  qti_product_id: null,
                  qti_quantity: null,
                  qti_unit: null,
                  qti_unit_price: null,
                  qti_list_price: null,
                  qti_discount_type: "amount",
                  qti_discount_value: "0.00",
              },
    );

const milestoneSchema = z.object({
    qtm_name: requiredText("ชื่องวด", 200),
    qtm_condition: optionalText("เงื่อนไขการเรียกเก็บ", 255),
    qtm_percent: nullableDecimal("% ของงวด", { minimum: "0.01", maximum: "100" }),
    qtm_amount: nullableDecimal("จำนวนเงินของงวด", { minimum: "0.01", maximum: "9999999999999.99" }),
});

export const quotationDraftSchema = z
    .object({
        qt_client_id: requiredText("ลูกค้า", 18),
        qt_branch_id: requiredText("สาขา", 18),
        qt_project_id: optionalId,
        qt_title: requiredText("ชื่อเรื่อง", 200),
        qt_language: z.enum(["th", "en"], { error: "ภาษาเอกสารต้องเป็นไทยหรืออังกฤษ" }).default("th"),
        qt_currency: z
            .string({ error: "กรุณาเลือกสกุลเงิน" })
            .trim()
            .transform((value) => value.toUpperCase())
            .refine((value) => /^[A-Z]{3}$/.test(value), { message: "กรุณาเลือกสกุลเงิน" })
            .default(BASE_CURRENCY),
        qt_exchange_rate: exchangeRateText.default("1"),
        qt_rate_source: z.enum(["bot", "manual"], { error: "ที่มาของอัตราต้องเป็น ธปท. หรือกรอกเอง" }).nullish(),
        qt_rate_date: optionalDate("วันที่ของอัตรา"),
        qt_rate_override_reason: optionalText("เหตุผลที่แก้อัตรา", 500),
        qt_vat_treatment: z.enum(["standard", "zero"], { error: "การคิด VAT ต้องเป็นปกติหรือ 0%" }).default("standard"),
        qt_valid_days: integerInRange("อายุยืนราคา (วัน)", 1, 365).default(30),
        qt_payment_mode: z
            .enum(["single", "milestones"], { error: "การเก็บเงินต้องเป็นครั้งเดียวหรือแบ่งงวด" })
            .default("single"),
        qt_discount_type: z.enum(["amount", "percent"], { error: "ชนิดส่วนลดต้องเป็นบาทหรือ %" }).default("amount"),
        qt_discount_value: decimalText("ส่วนลดท้ายบิล", { minimum: "0", maximum: "9999999999999.99" }).default("0.00"),
        qt_terms: optionalText("เงื่อนไข", 5000),
        qt_internal_note: optionalText("บันทึกภายใน", 2000),
        // เวอร์ชันที่หน้าเว็บโหลดมา — ไม่ตรงกับในฐานข้อมูล = มีคนแก้ไปก่อน (R4) · ตอนสร้างใหม่ไม่ต้องส่ง
        qt_version: integerInRange("เวอร์ชัน", 0, 2_000_000_000).nullish(),
        items: z
            .array(itemSchema)
            .max(MAX_QUOTATION_ITEMS, `ใบเสนอราคามีได้ไม่เกิน ${MAX_QUOTATION_ITEMS} แถว`)
            .default([]),
        milestones: z
            .array(milestoneSchema)
            .max(MAX_QUOTATION_MILESTONES, `แบ่งได้ไม่เกิน ${MAX_QUOTATION_MILESTONES} งวด`)
            .default([]),
    })
    .transform((quotation) => {
        const isBaseCurrency = quotation.qt_currency === BASE_CURRENCY;
        return {
            ...quotation,
            // เอกสารบาท: อัตรา = 1 เสมอ ไม่มีที่มาของอัตรา
            qt_exchange_rate: isBaseCurrency ? "1" : quotation.qt_exchange_rate,
            qt_rate_source: isBaseCurrency ? null : (quotation.qt_rate_source ?? "manual"),
            qt_rate_date: isBaseCurrency ? null : quotation.qt_rate_date,
            qt_rate_override_reason: isBaseCurrency ? null : quotation.qt_rate_override_reason,
            // เก็บเงินครั้งเดียว = ไม่มีงวด (ใบแจ้งหนี้ช่วง 1B เรียกเก็บเต็มยอด)
            milestones: quotation.qt_payment_mode === "single" ? [] : quotation.milestones,
        };
    })
    .superRefine((quotation, context) => {
        quotation.items.forEach((item, index) => {
            if (item.qti_type !== "item") return;
            if (item.qti_quantity === null) {
                context.addIssue({ code: "custom", path: ["items", index, "qti_quantity"], message: "กรุณากรอกจำนวน" });
            }
            if (item.qti_unit_price === null) {
                context.addIssue({
                    code: "custom",
                    path: ["items", index, "qti_unit_price"],
                    message: "กรุณากรอกราคาต่อหน่วย",
                });
            }
        });
        quotation.milestones.forEach((milestone, index) => {
            const hasPercent = milestone.qtm_percent !== null;
            const hasAmount = milestone.qtm_amount !== null;
            if (hasPercent === hasAmount) {
                context.addIssue({
                    code: "custom",
                    path: ["milestones", index, "qtm_percent"],
                    message: "ระบุเป็น % หรือจำนวนเงินอย่างใดอย่างหนึ่ง",
                });
            }
        });
        // อัตรากรอกเอง (ไม่ใช่ของ ธปท.) ต้องบอกเหตุผล — ผู้อนุมัติจะเห็น
        const needsReason = quotation.qt_rate_source === "manual" && !quotation.qt_rate_override_reason;
        if (needsReason) {
            context.addIssue({
                code: "custom",
                path: ["qt_rate_override_reason"],
                message: "อัตราที่กรอกเองต้องใส่เหตุผล เช่น ตกลงอัตราคงที่กับลูกค้า หรือ ธปท. ยังไม่มีอัตรา",
            });
        }
    });

/** ตีกลับ / ปฏิเสธ / ยกเลิก — ต้องมีเหตุผล */
export const quotationReasonSchema = z.object({
    reason: requiredText("เหตุผล", 500),
    qt_version: integerInRange("เวอร์ชัน", 0, 2_000_000_000).nullish(),
});

/** ลูกค้าตอบรับ — เลือกโปรเจกต์ (ใหม่ / เดิมของลูกค้ารายนี้ / ไม่ผูก) และจะสร้างงานจากรายการไหม (1A-4) */
export const quotationAcceptSchema = z
    .object({
        project_mode: z.enum(["new", "existing", "none"], { error: "กรุณาเลือกว่าจะผูกโปรเจกต์อย่างไร" }),
        project_id: optionalId,
        create_tasks: z.boolean({ error: "ตัวเลือกสร้างงานไม่ถูกต้อง" }).default(true),
        qt_version: integerInRange("เวอร์ชัน", 0, 2_000_000_000).nullish(),
    })
    .superRefine((choice, context) => {
        if (choice.project_mode === "existing" && !choice.project_id) {
            context.addIssue({ code: "custom", path: ["project_id"], message: "กรุณาเลือกโปรเจกต์" });
        }
    });

/** ส่งขออนุมัติ / อนุมัติ / ส่งลูกค้า — ส่งเวอร์ชันมากันกดซ้ำและกันอนุมัติฉบับที่เพิ่งถูกแก้ */
export const quotationActionSchema = z.object({
    qt_version: integerInRange("เวอร์ชัน", 0, 2_000_000_000).nullish(),
});
