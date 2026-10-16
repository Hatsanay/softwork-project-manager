// ─── ตรวจข้อมูลฝั่งจัดซื้อ (zod) — ผู้ขาย · หมวดค่าใช้จ่าย · ประเภทเงินได้/อัตราหัก ณ ที่จ่าย ──────────────────
//
// ต้นฉบับอยู่ที่ backend/src/shared/ — สำเนาใน frontend/lib/shared/ สร้างด้วย `npm run sync-shared` ห้ามแก้ที่สำเนา
// ชื่อฟิลด์ = ชื่อคอลัมน์ · แบบระบบ: docs/plans/2026-10-16-purchasing-2.md หัวข้อ 3.1–3.3
// อ้างอิงที่ต้องมีอยู่จริง (สกุลเงิน ประเภทเงินได้ หมวด) และรหัสซ้ำ ตรวจใน backend (services/vendor.service.js)

import { z } from "zod";
import { isValidThaiTaxId, normalizeThaiTaxId } from "../thai-tax-id.mjs";
import { normalizePromptPayId } from "../promptpay.mjs";
import {
    activeStatus,
    decimalText,
    integerInRange,
    optionalEmail,
    optionalText,
    requiredDate,
    requiredText,
} from "./common.mjs";

const THAILAND = "TH";

const optionalCode = (label, maxLength) =>
    optionalText(label, maxLength).refine((value) => value === null || /^[A-Za-z0-9_-]+$/.test(value), {
        message: `${label}ใช้ได้เฉพาะตัวอักษรอังกฤษ ตัวเลข - และ _`,
    });

const optionalId = z
    .union([z.string(), z.number()])
    .nullish()
    .transform((value) => (value === null || value === undefined || value === "" ? null : value));

/** ผู้ขาย / ผู้รับเงิน */
export const vendorSchema = z
    .object({
        vd_code: optionalCode("รหัสผู้ขาย", 20),
        vd_type: z.enum(["juristic", "individual"], { error: "กรุณาเลือกประเภทผู้ขาย" }).default("juristic"),
        vd_country: z
            .string({ error: "กรุณาเลือกประเทศ" })
            .trim()
            .transform((value) => value.toUpperCase())
            .refine((value) => /^[A-Z]{2}$/.test(value), { message: "รหัสประเทศต้องเป็นตัวอักษร 2 ตัว เช่น TH, US" })
            .default(THAILAND),
        vd_name: requiredText("ชื่อผู้ขาย", 150),
        vd_tax_id: optionalText("เลขประจำตัวผู้เสียภาษี", 30),
        vd_branch_code: optionalText("รหัสสาขาของผู้ขาย", 5).refine(
            (value) => value === null || /^\d{5}$/.test(value),
            {
                message: "รหัสสาขาต้องเป็นตัวเลข 5 หลัก (สำนักงานใหญ่ = 00000)",
            },
        ),
        vd_address: optionalText("ที่อยู่", 1000),
        vd_contact_name: optionalText("ชื่อผู้ติดต่อ", 100),
        vd_email: optionalEmail(),
        vd_phone: optionalText("เบอร์โทร", 20),
        vd_bank_name: optionalText("ธนาคาร", 100),
        vd_bank_account_no: optionalText("เลขที่บัญชี", 30),
        vd_bank_account_name: optionalText("ชื่อบัญชี", 150),
        vd_promptpay_id: optionalText("เลขพร้อมเพย์", 20)
            .refine((value) => value === null || normalizePromptPayId(value) !== null, {
                message: "เลขพร้อมเพย์ต้องเป็นเบอร์มือถือ 10 หลัก หรือเลขประจำตัว 13 หลัก",
            })
            .transform((value) => (value === null ? null : normalizePromptPayId(value).digits)),
        vd_credit_days: integerInRange("เครดิตเทอม", 0, 365)
            .nullish()
            .transform((value) => value ?? null),
        vd_currency: z
            .string({ error: "กรุณาเลือกสกุลเงิน" })
            .regex(/^[A-Z]{3}$/, "กรุณาเลือกสกุลเงิน")
            .default("THB"),
        vd_default_income_type: optionalText("ประเภทเงินได้", 20),
        vd_default_category_id: optionalId,
        vd_notes: optionalText("หมายเหตุ", 2000),
        vd_status: activeStatus.default("active"),
    })
    .transform((vendor) => {
        // ผู้ขายไทย: ตัดขีด/ช่องว่างในเลขผู้เสียภาษี · ต่างประเทศเก็บตามที่พิมพ์ · ต่างประเทศไม่มีสาขาแบบไทย
        const isThai = vendor.vd_country === THAILAND;
        const taxId = isThai && vendor.vd_tax_id ? normalizeThaiTaxId(vendor.vd_tax_id) : vendor.vd_tax_id;
        return {
            ...vendor,
            vd_tax_id: taxId,
            vd_branch_code: isThai && vendor.vd_type === "juristic" ? vendor.vd_branch_code : null,
            vd_bank_account_no: vendor.vd_bank_account_no ? vendor.vd_bank_account_no.replace(/\s+/g, "") : null,
        };
    })
    .superRefine((vendor, context) => {
        const isThai = vendor.vd_country === THAILAND;
        if (isThai && vendor.vd_tax_id && !isValidThaiTaxId(vendor.vd_tax_id)) {
            context.addIssue({
                code: "custom",
                path: ["vd_tax_id"],
                message:
                    "เลขประจำตัวผู้เสียภาษีไม่ถูกต้อง — ผู้ขายในไทยต้องเป็นตัวเลข 13 หลัก ตรวจว่าพิมพ์ครบและไม่สลับหลัก",
            });
        }
        if (isThai && vendor.vd_type === "juristic" && vendor.vd_tax_id && !vendor.vd_branch_code) {
            context.addIssue({
                code: "custom",
                path: ["vd_branch_code"],
                message: "นิติบุคคลที่มีเลขผู้เสียภาษีต้องระบุสาขา (สำนักงานใหญ่ = 00000) — ใช้พิมพ์บน 50 ทวิ",
            });
        }
        if (vendor.vd_bank_account_no && !vendor.vd_bank_name) {
            context.addIssue({ code: "custom", path: ["vd_bank_name"], message: "ใส่ชื่อธนาคารของเลขบัญชีนี้" });
        }
    });

/** หมวดค่าใช้จ่าย */
export const expenseCategorySchema = z.object({
    ec_name_th: requiredText("ชื่อหมวด", 100),
    ec_name_en: optionalText("ชื่อหมวด (อังกฤษ)", 100),
    ec_account_code: optionalCode("รหัสบัญชี", 20),
    ec_default_income_type: optionalText("ประเภทเงินได้เริ่มต้น", 20),
    ec_is_asset: z.boolean({ error: "ค่าทรัพย์สินไม่ถูกต้อง" }).default(false),
    ec_status: activeStatus.default("active"),
    ec_sort_order: integerInRange("ลำดับ", 0, 9999).default(0),
});

/** ประเภทเงินได้ (ชื่อ/ข้อความบน 50 ทวิ/สถานะ — รหัสตั้งครั้งเดียวตอนสร้าง) */
export const whtIncomeTypeSchema = z.object({
    wit_code: z
        .string({ error: "กรุณากรอกรหัส" })
        .trim()
        .transform((value) => value.toUpperCase())
        .refine((value) => /^[A-Z][A-Z0-9_]{1,19}$/.test(value), {
            message: "รหัสใช้ตัวอักษรอังกฤษพิมพ์ใหญ่ ตัวเลข และ _ (2–20 ตัว ขึ้นต้นด้วยตัวอักษร)",
        }),
    wit_name_th: requiredText("ชื่อประเภทเงินได้", 150),
    wit_name_en: optionalText("ชื่อ (อังกฤษ)", 150),
    wit_form_row: integerInRange("แถวบน 50 ทวิ", 1, 6).default(5),
    wit_form_label: requiredText("ข้อความบน 50 ทวิ", 200),
    wit_status: activeStatus.default("active"),
    wit_sort_order: integerInRange("ลำดับ", 0, 9999).default(0),
});

/** อัตราหัก ณ ที่จ่ายใหม่ — วันที่มีผลต้องเป็นวันพรุ่งนี้เป็นต้นไป (ตรวจใน backend เวลาไทย) */
export const whtRateSchema = z.object({
    wr_income_type: requiredText("ประเภทเงินได้", 20),
    wr_effective_from: requiredDate("วันที่มีผล"),
    wr_rate: decimalText("อัตรา (%)", { minimum: "0", maximum: "30" }),
    wr_min_payment: decimalText("ยอดขั้นต่ำต่อครั้ง", { minimum: "0", maximum: "9999999999999.99" }).default("0.00"),
    wr_note: optionalText("หมายเหตุ/ที่มา", 255),
});
