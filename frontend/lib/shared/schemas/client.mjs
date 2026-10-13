// ─── ตรวจข้อมูลลูกค้า (zod) — ใช้ทั้งฟอร์มหน้าเว็บและ backend ─────────────────────────────────────────
//
// ต้นฉบับอยู่ที่ backend/src/shared/ — สำเนาใน frontend/lib/shared/ สร้างด้วย `npm run sync-shared` ห้ามแก้ที่สำเนา
// ชื่อฟิลด์ = ชื่อคอลัมน์ tb_clients · แบบระบบ: docs/plans/2026-10-08-sales-cycle.md หัวข้อ 1 (tb_clients)
// ฟิลด์ใหม่ของวงจรขายมีค่าเริ่มต้น — ส่งมาไม่ครบก็บันทึกได้ (ลูกค้าเดิมที่ยังไม่ได้กรอกข้อมูลภาษี)

import { z } from "zod";
import { isValidThaiTaxId, normalizeThaiTaxId } from "../thai-tax-id.mjs";
import { activeStatus, decimalText, integerInRange, optionalEmail, optionalText, requiredText } from "./common.mjs";

const THAILAND = "TH";

export const clientSchema = z
    .object({
        client_name: requiredText("ชื่อลูกค้า", 100),
        client_company: optionalText("ชื่อบริษัท", 150),
        client_contact_name: optionalText("ชื่อผู้ติดต่อ", 100),
        client_email: optionalEmail(),
        client_phone: optionalText("เบอร์โทร", 20),
        client_type: z.enum(["juristic", "individual"], { error: "กรุณาเลือกประเภทลูกค้า" }).default("juristic"),
        client_country: z
            .string({ error: "กรุณาเลือกประเทศ" })
            .trim()
            .transform((value) => value.toUpperCase())
            .refine((value) => /^[A-Z]{2}$/.test(value), { message: "รหัสประเทศต้องเป็นตัวอักษร 2 ตัว เช่น TH, US" })
            .default(THAILAND),
        client_tax_id: optionalText("เลขประจำตัวผู้เสียภาษี", 30),
        client_branch_code: optionalText("รหัสสาขาของลูกค้า", 5).refine(
            (value) => value === null || /^\d{5}$/.test(value),
            {
                message: "รหัสสาขาต้องเป็นตัวเลข 5 หลัก (สำนักงานใหญ่ = 00000)",
            },
        ),
        client_address: optionalText("ที่อยู่สำหรับออกเอกสาร", 1000),
        client_credit_days: integerInRange("เครดิตเทอม", 0, 365)
            .nullish()
            .transform((value) => value ?? null),
        client_wht_rate: decimalText("อัตราหัก ณ ที่จ่าย", { minimum: "0", maximum: "100" })
            .nullish()
            .transform((value) => value ?? null),
        client_currency: z
            .string({ error: "กรุณาเลือกสกุลเงินเริ่มต้น" })
            .regex(/^[A-Z]{3}$/, "กรุณาเลือกสกุลเงินเริ่มต้น")
            .default("THB"),
        client_language: z.enum(["th", "en"], { error: "ภาษาเอกสารต้องเป็นไทยหรืออังกฤษ" }).default("th"),
        client_vat_treatment: z
            .enum(["standard", "zero"], { error: "การคิด VAT ต้องเป็นปกติหรือ 0%" })
            .default("standard"),
        client_status: activeStatus.default("active"),
    })
    .transform((client) => {
        // ลูกค้าไทย: ตัดขีด/ช่องว่างในเลขผู้เสียภาษีออกก่อนเก็บ · ต่างประเทศเก็บตามที่พิมพ์ (รูปแบบแต่ละประเทศต่างกัน)
        const isThai = client.client_country === THAILAND;
        const taxId = isThai && client.client_tax_id ? normalizeThaiTaxId(client.client_tax_id) : client.client_tax_id;
        return { ...client, client_tax_id: taxId };
    })
    .superRefine((client, context) => {
        const isThai = client.client_country === THAILAND;
        if (isThai && client.client_tax_id && !isValidThaiTaxId(client.client_tax_id)) {
            context.addIssue({
                code: "custom",
                path: ["client_tax_id"],
                message:
                    "เลขประจำตัวผู้เสียภาษีไม่ถูกต้อง — ลูกค้าในไทยต้องเป็นตัวเลข 13 หลัก ตรวจว่าพิมพ์ครบและไม่สลับหลัก",
            });
        }
        // ใบกำกับภาษีต้องระบุว่าเป็นสำนักงานใหญ่หรือสาขาไหนของลูกค้านิติบุคคล
        const needsBranchCode =
            isThai && client.client_type === "juristic" && client.client_tax_id && !client.client_branch_code;
        if (needsBranchCode) {
            context.addIssue({
                code: "custom",
                path: ["client_branch_code"],
                message: "นิติบุคคลที่มีเลขผู้เสียภาษีต้องระบุสาขา (สำนักงานใหญ่ = 00000)",
            });
        }
    });
