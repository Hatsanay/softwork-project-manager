// ─── บริการรายรอบ (zod) · 2026-10-31 · docs/plans/2026-10-31-recurring-services.md ─────────────────────
//
// ต้นฉบับอยู่ที่ backend/src/shared/ — สำเนาใน frontend/lib/shared/ สร้างด้วย `npm run sync-shared` ห้ามแก้ที่สำเนา
// กติกาที่ต้องดูฐานข้อมูล (ลูกค้า/สินค้า/โปรเจกต์มีจริง · โปรเจกต์เป็นของลูกค้านี้ · สิทธิ์ตามช่องทาง) ตรวจใน renewal.service

import { z } from "zod";
import { RENEWAL_CYCLES } from "../renewal-math.mjs";
import { decimalText, integerInRange, optionalText, requiredDate, requiredText } from "./common.mjs";

const RENEWAL_CHANNELS = ["direct", "fastwork"];

export const cycleMonthsField = z
    .number({ error: "เลือกรอบการต่ออายุ" })
    .int()
    .refine((value) => RENEWAL_CYCLES.includes(value), { message: "รอบต้องเป็น 1, 3, 6, 12 หรือ 24 เดือน" });

// ต่ออายุฟรีไม่ต้องมีรายการ → ราคาต้องมากกว่า 0
const priceField = decimalText("ราคาต่อรอบ", { minimum: "0.01", maximum: "9999999999999.99" });
const versionField = integerInRange("เวอร์ชัน", 0, 2_000_000_000);

/** เพิ่มรายการเอง (ลูกค้าเก่าที่ต่ออายุอยู่ก่อนมีระบบ) */
export const renewalCreateSchema = z.object({
    rnw_client_id: requiredText("ลูกค้า", 18),
    rnw_project_id: optionalText("โปรเจกต์", 18),
    rnw_product_id: requiredText("สินค้า", 18),
    rnw_label: optionalText("ชื่อที่จำง่าย", 200),
    rnw_price: priceField,
    rnw_cycle_months: cycleMonthsField,
    rnw_next_due_date: requiredDate("วันครบรอบถัดไป"),
    rnw_channel: z.enum(RENEWAL_CHANNELS, { error: "เลือกช่องทาง" }).default("direct"),
    rnw_notes: optionalText("บันทึกภายใน", 1000),
});

/** แก้รายการ · ราคา/รอบใหม่มีผลกับรอบที่ยังไม่ออก (รอบที่ออกใบแล้วเก็บยอดของตัวเอง) */
export const renewalUpdateSchema = z.object({
    rnw_label: optionalText("ชื่อที่จำง่าย", 200),
    rnw_price: priceField,
    rnw_cycle_months: cycleMonthsField,
    rnw_next_due_date: requiredDate("วันครบรอบถัดไป"),
    rnw_notes: optionalText("บันทึกภายใน", 1000),
    rnw_version: versionField,
});

/** ตั้งต่ออายุตอนรับงาน Fastwork (จากสินค้ารายรอบในตะกร้า) · ลูกค้า/โปรเจกต์/ช่องทางมาจากงานที่สร้าง */
const jobRenewalSchema = z.object({
    rnw_product_id: requiredText("สินค้า", 18),
    rnw_label: optionalText("ชื่อที่จำง่าย", 200),
    rnw_price: priceField,
    rnw_cycle_months: cycleMonthsField,
    rnw_next_due_date: requiredDate("วันครบรอบถัดไป"),
});

export const MAX_JOB_RENEWALS = 20;
export const jobRenewalsField = z
    .array(jobRenewalSchema)
    .max(MAX_JOB_RENEWALS, `ตั้งต่ออายุได้ไม่เกิน ${MAX_JOB_RENEWALS} รายการต่องาน`)
    .default([]);

/** ออกใบแจ้งหนี้รอบนี้ (ลูกค้าตรง) · เลือกหลายรายการของลูกค้าเดียวกัน = ใบเดียว · version กันกดซ้ำ */
export const renewalInvoiceSchema = z.object({
    items: z
        .array(z.object({ rnw_id: requiredText("รายการ", 18), rnw_version: versionField }), {
            error: "เลือกรายการที่จะออกใบ",
        })
        .min(1, "เลือกรายการที่จะออกใบอย่างน้อย 1 รายการ")
        .max(50, "ออกใบรวมได้ไม่เกิน 50 รายการ"),
});

/** พัก / ยกเลิก: ต้องบอกเหตุผล (เห็นในรายการ) */
export const renewalEndSchema = z.object({
    reason: requiredText("เหตุผล", 500),
    rnw_version: versionField,
});

/** เปิดต่อหลังพัก: เลือกวันครบใหม่ (หน้าเว็บเติมให้ = วันครบเดิม + จำนวนวันที่พัก) */
export const renewalResumeSchema = z.object({
    rnw_next_due_date: requiredDate("วันครบรอบถัดไป"),
    rnw_version: versionField,
});
