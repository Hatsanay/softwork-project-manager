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

export const productSchema = z.object({
    product_code: optionalText("รหัสสินค้า", 30),
    product_name: requiredText("ชื่อสินค้า/บริการ", 200),
    product_description: optionalText("รายละเอียด", 2000),
    product_unit: optionalText("หน่วย", 30),
    product_price: decimalText("ราคาตั้งต้น", { minimum: "0", maximum: "9999999999999.99" }),
    product_category_id: optionalId,
    product_status: activeStatus,
});

export const productCategorySchema = z.object({
    pc_name: requiredText("ชื่อหมวด", 100),
    pc_sort_order: integerInRange("ลำดับ", 0, 9999),
    pc_status: activeStatus,
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
        items: z
            .array(packageItemSchema)
            .min(1, "ชุดรายการต้องมีอย่างน้อย 1 แถว")
            .max(MAX_PACKAGE_ITEMS, `ชุดรายการมีได้ไม่เกิน ${MAX_PACKAGE_ITEMS} แถว`),
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
