// ตัวคิดราคา: ออกใบเสนอราคาจากตะกร้า (2026-11-01 · docs/plans/2026-11-01-calculator-direct-quotation.md)
// ต้นฉบับอยู่ที่ backend/src/shared/ — สำเนาใน frontend/lib/shared/ สร้างด้วย `npm run sync-shared` ห้ามแก้ที่สำเนา
import { z } from "zod";
import { decimalText, optionalText, requiredText } from "./common.mjs";
import { MAX_SET_COUNT } from "./order-link.mjs";

export const MAX_CART_LINES = 100;

export const quotationFromCartSchema = z
    .object({
        // ลูกค้าเดิม หรือพิมพ์ชื่อลูกค้าใหม่ (Q2 ก · สร้างเป็นบุคคล เติมข้อมูลภาษีทีหลัง)
        client_id: optionalText("ลูกค้า", 18),
        client_name: optionalText("ชื่อลูกค้า", 100),
        // โปรเจกต์เดิมของลูกค้า (ไม่บังคับ · จ้างเพิ่มในงานเดิม) · ลูกค้าใหม่ไม่มีโปรเจกต์
        project_id: optionalText("โปรเจกต์", 18),
        qt_title: requiredText("ชื่อเรื่อง", 200),
        lines: z
            .array(
                z.object({
                    kind: z.enum(["product", "package"]),
                    id: requiredText("รายการ", 18),
                    quantity: z.number().int().min(1).max(MAX_SET_COUNT),
                }),
            )
            .min(1, "เลือกรายการในตะกร้าอย่างน้อย 1 รายการ")
            .max(MAX_CART_LINES, `ตะกร้ามีได้ไม่เกิน ${MAX_CART_LINES} รายการ`),
        // ราคาเริ่มต้นที่ทีมกรอก: รหัสสินค้า → ราคาต่อหน่วย (ใช้กับแถวในชุดด้วย) · ไม่ส่ง = ราคาเริ่มต้น
        starting_prices: z
            .record(z.string(), decimalText("ราคา", { minimum: "0", maximum: "9999999999999.99" }))
            .default({}),
    })
    .superRefine((input, context) => {
        if (!input.client_id && !input.client_name) {
            context.addIssue({ code: "custom", path: ["client_name"], message: "เลือกลูกค้าเดิม หรือพิมพ์ชื่อลูกค้าใหม่" });
        }
        if (input.project_id && !input.client_id) {
            context.addIssue({ code: "custom", path: ["project_id"], message: "ผูกโปรเจกต์ได้เมื่อเลือกลูกค้าเดิม" });
        }
    });
