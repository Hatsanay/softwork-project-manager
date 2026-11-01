// ตรวจข้อมูลการตรวจคำขอบริการของผู้รับผิดชอบ (2026-10-25 · S-3 · docs/plans/2026-10-25-client-order-link.md ข้อ 6, 6.1)
// ต้นฉบับอยู่ที่ backend/src/shared/ — สำเนาใน frontend/lib/shared/ สร้างด้วย `npm run sync-shared` ห้ามแก้ที่สำเนา
import { z } from "zod";
import { decimalText, integerInRange, optionalText, requiredText } from "./common.mjs";
import { milestonesField } from "./fastwork.mjs";

const version = integerInRange("เวอร์ชัน", 0, 2_000_000_000);

/**
 * ปรับรายการ: ส่งทุกแถวรายการ (ไม่รวมหัวข้อชุดของลูกค้า) · svi_id ว่าง = แถวที่ผู้รับผิดชอบเพิ่มใหม่
 * ทีมเพิ่มชุดรายการได้ (2026-11-01): แถว heading (ชื่อชุด · จำนวนชุด) + แถว item ที่มี package_id เดียวกันตามหลัง
 */
export const serviceRequestItemsSchema = z.object({
    svr_version: version,
    items: z
        .array(
            z.object({
                svi_id: z.number().int().positive().nullish().transform((value) => value ?? null),
                type: z.enum(["item", "heading"]).default("item"),
                package_id: z.string().trim().nullish().transform((value) => (value ? value : null)),
                product_id: z.string().trim().nullish().transform((value) => (value ? value : null)),
                name: requiredText("รายการ", 200),
                unit: optionalText("หน่วย", 30),
                unit_price: decimalText("ราคาต่อหน่วย", { minimum: "0", maximum: "9999999999999.99" }),
                quantity: decimalText("จำนวน", { minimum: "0.01", maximum: "9999999999.99" }),
                is_removed: z.boolean().default(false),
            }),
        )
        .max(200, "รายการได้ไม่เกิน 200 แถว"),
});

export const serviceRequestClientSchema = z.object({
    svr_version: version,
    client_id: requiredText("ลูกค้า", 18),
});

export const serviceRequestReasonSchema = z.object({
    svr_version: version,
    reason: requiredText("เหตุผล", 500),
});

/** ลูกค้ายืนยันบน Fastwork แล้ว (คำขอจากลิงก์ของงานเดิม · S-5) → งวดเพิ่มของงาน */
export const serviceRequestFastworkAcceptSchema = z.object({
    svr_version: version,
    milestones: milestonesField,
});

/**
 * ยืนยันคำขอ · create_quotation = ติ๊ก "ออกใบเสนอราคา" (ไม่ติ๊ก = เปิดโปรเจกต์ทันที)
 * ราคาเริ่มต้น (2026-11-01): เปิดงานตรงแล้วมีแถวที่ราคาสูงขึ้น · ask_customer_price = รอลูกค้ายืนยันในหน้าสถานะ · ไม่ถาม = ต้องมีเหตุผล (ตรวจใน service)
 */
export const serviceRequestConfirmSchema = z.object({
    svr_version: version,
    create_quotation: z.boolean({ error: "เลือกว่าจะออกใบเสนอราคาไหม" }),
    ask_customer_price: z.boolean().default(true),
    price_skip_reason: optionalText("เหตุผล", 300),
});

/** ยืนยันราคาแถวราคาเริ่มต้น (หน้าต่างตรวจราคาก่อนสร้างใบ · 2026-11-01) */
export const serviceRequestPricesSchema = z.object({
    svr_version: version,
    prices: z
        .array(
            z.object({
                svi_id: z.number().int().positive(),
                unit_price: decimalText("ราคาต่อหน่วย", { minimum: "0", maximum: "9999999999999.99" }),
            }),
        )
        .min(1, "ไม่มีรายการให้ยืนยันราคา")
        .max(200, "รายการได้ไม่เกิน 200 แถว"),
});

/** ลูกค้าตอบราคาที่ทีมปรับขึ้น (หน้าสถานะคำขอ · 2026-11-01) · ไม่ตกลง = ทีมติดต่อกลับ */
export const servicePriceResponseSchema = z.object({
    response: z.enum(["accepted", "declined"], { error: "เลือกว่าตกลงราคานี้ไหม" }),
    note: optionalText("ข้อความถึงทีมงาน", 300),
});
