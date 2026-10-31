// ─── ตรวจข้อมูลสินค้า/บริการ หมวดหมู่ และชุดรายการ (zod) — ใช้ทั้งฟอร์มหน้าเว็บและ backend ──────────────────
//
// ต้นฉบับอยู่ที่ backend/src/shared/ — สำเนาใน frontend/lib/shared/ สร้างด้วย `npm run sync-shared` ห้ามแก้ที่สำเนา
// ชื่อฟิลด์ = ชื่อคอลัมน์ · ราคาเป็นบาทเสมอ (แปลงเป็นสกุลของเอกสารตอนเลือกใส่ใบเสนอราคา)
// แบบระบบ: docs/plans/2026-10-08-sales-cycle.md หัวข้อ 1 และ 4.1

import { z } from "zod";
import { activeStatus, decimalText, integerInRange, optionalText, requiredText } from "./common.mjs";

export const MAX_PACKAGE_ITEMS = 200;

const optionalId = z
    .string()
    .trim()
    .nullish()
    .transform((value) => (value ? value : null));

export const MAX_ADDON_RULES = 200;

export const productSchema = z
    .object({
        product_code: optionalText("รหัสสินค้า", 30),
        product_name: requiredText("ชื่อสินค้า/บริการ", 200),
        product_description: optionalText("รายละเอียด", 2000),
        product_unit: optionalText("หน่วย", 30),
        product_price: decimalText("ราคาตั้งต้น", { minimum: "0", maximum: "9999999999999.99" }),
        product_category_id: optionalId,
        product_status: activeStatus,
        // แสดงบนหน้าร้านของลิงก์เลือกบริการ (2026-10-25)
        product_is_public: z.boolean().default(false),
        // งานเพิ่มแบบ % ของยอดรายการอื่นก่อน VAT เช่น งานด่วน +30% (2026-10-25)
        product_price_mode: z.enum(["fixed", "percent"], { error: "เลือกวิธีคิดราคา" }).default("fixed"),
        // ฟอร์มส่งช่องว่าง "" มาเมื่อเลือกราคาตายตัว (ช่องนี้ซ่อนอยู่) = ไม่ใช้ ไม่ใช่กรอกผิด (2026-10-31: เดิมกดบันทึกแล้วเงียบ เพราะ error อยู่ใต้ช่องที่ซ่อน)
        product_percent: z
            .preprocess(
                (value) => (typeof value === "string" && value.trim() === "" ? null : value),
                decimalText("อัตรา %", { minimum: "0.01", maximum: "100" }).nullish(),
            )
            .transform((value) => value ?? null),
    })
    .superRefine((product, context) => {
        if (product.product_price_mode === "percent" && !product.product_percent) {
            context.addIssue({ code: "custom", path: ["product_percent"], message: "ใส่อัตรา % เช่น 30" });
        }
    })
    // แบบ %: ราคาตั้งต้นไม่ใช้ (ตั้งเป็น 0) · แบบราคาตายตัว: ไม่มีอัตรา %
    .transform((product) =>
        product.product_price_mode === "percent" ? { ...product, product_price: "0.00" } : { ...product, product_percent: null },
    );

export const productCategorySchema = z.object({
    pc_name: requiredText("ชื่อหมวด", 100),
    pc_sort_order: integerInRange("ลำดับ", 0, 9999),
    pc_status: activeStatus,
    // ลูกค้าเลือกได้รายการเดียวในหมวดนี้ เช่น แพ็กเกจ (2026-10-25)
    pc_is_single_choice: z.boolean().default(false),
});

/** กติกางานเพิ่มต่อแพ็ก: included = มีในแพ็กแล้ว (กดซื้อไม่ได้) · not_available = ใช้กับแพ็กนี้ไม่ได้ (ซ่อน) */
const addonRuleSchema = z.object({
    product_id: requiredText("สินค้า", 18),
    rule: z.enum(["included", "not_available"], { error: "เลือก มีในแพ็กแล้ว หรือ ใช้กับแพ็กนี้ไม่ได้" }),
});

const packageItemSchema = z.object({
    pki_type: z.enum(["item", "heading", "note"], { error: "ชนิดแถวต้องเป็น รายการ / หัวข้อ / หมายเหตุ" }),
    pki_product_id: optionalId,
    pki_description: requiredText("รายละเอียดของแถว", 2000),
    pki_quantity: decimalText("จำนวน", { minimum: "0.01", maximum: "9999999999.99" })
        .nullish()
        .transform((value) => value ?? null),
    pki_unit: optionalText("หน่วย", 30),
    pki_unit_price: decimalText("ราคา", { minimum: "0", maximum: "9999999999999.99" })
        .nullish()
        .transform((value) => value ?? null),
});

export const productPackageSchema = z
    .object({
        pkg_name: requiredText("ชื่อชุดรายการ", 200),
        pkg_description: optionalText("รายละเอียด", 2000),
        pkg_category_id: optionalId,
        pkg_status: activeStatus,
        // แสดงบนหน้าร้านของลิงก์เลือกบริการ (2026-10-25)
        pkg_is_public: z.boolean().default(false),
        items: z
            .array(packageItemSchema)
            .min(1, "ชุดรายการต้องมีอย่างน้อย 1 แถว")
            .max(MAX_PACKAGE_ITEMS, `ชุดรายการมีได้ไม่เกิน ${MAX_PACKAGE_ITEMS} แถว`),
        addon_rules: z.array(addonRuleSchema).max(MAX_ADDON_RULES, `กติกางานเพิ่มได้ไม่เกิน ${MAX_ADDON_RULES} รายการ`).default([]),
    })
    .transform((productPackage) => ({
        ...productPackage,
        // หัวข้อ/หมายเหตุไม่มีจำนวนและราคา — ทิ้งค่าที่อาจค้างมาจากตอนเปลี่ยนชนิดแถว
        items: productPackage.items.map((item) =>
            item.pki_type === "item"
                ? item
                : { ...item, pki_product_id: null, pki_quantity: null, pki_unit: null, pki_unit_price: null },
        ),
    }))
    .superRefine((productPackage, context) => {
        const ruleProductIds = productPackage.addon_rules.map((rule) => rule.product_id);
        if (new Set(ruleProductIds).size !== ruleProductIds.length) {
            context.addIssue({ code: "custom", path: ["addon_rules"], message: "มีงานเพิ่มซ้ำในกติกา" });
        }
        const hasPricedItem = productPackage.items.some((item) => item.pki_type === "item");
        if (!hasPricedItem) {
            context.addIssue({
                code: "custom",
                path: ["items"],
                message: 'ชุดรายการต้องมีแถวชนิด "รายการ" อย่างน้อย 1 แถว',
            });
        }
        productPackage.items.forEach((item, index) => {
            if (item.pki_type !== "item") return;
            if (item.pki_quantity === null) {
                context.addIssue({ code: "custom", path: ["items", index, "pki_quantity"], message: "กรุณากรอกจำนวน" });
            }
            // แถวที่ไม่ได้อ้างสินค้าต้องมีราคาของตัวเอง · แถวที่อ้างสินค้าใช้ราคาปัจจุบันของสินค้าตอนกดเพิ่มลงใบ
            if (!item.pki_product_id && item.pki_unit_price === null) {
                context.addIssue({
                    code: "custom",
                    path: ["items", index, "pki_unit_price"],
                    message: "แถวที่ไม่ได้เลือกสินค้าต้องกรอกราคา",
                });
            }
        });
    });
