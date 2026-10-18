// ─── ตรวจข้อมูลหน้าตั้งค่าบริษัท (zod) — ใช้ทั้งฟอร์มหน้าเว็บและ backend ───────────────────────────────────
//
// ต้นฉบับอยู่ที่ backend/src/shared/ — สำเนาใน frontend/lib/shared/ สร้างด้วย `npm run sync-shared` ห้ามแก้ที่สำเนา
// ชื่อฟิลด์ = ชื่อคอลัมน์ในฐานข้อมูล · กติกาที่ต้องดูข้อมูลอื่น (ซ้ำไหม/ถูกใช้อยู่ไหม/วันนี้) ตรวจใน services/company.service.js
// แบบระบบ: docs/plans/2026-10-08-sales-cycle.md หัวข้อ 1, 3, 5

import { z } from "zod";
import { parseHundredths } from "../money.mjs";
import { isValidThaiTaxId, normalizeThaiTaxId } from "../thai-tax-id.mjs";
import { normalizePromptPayId } from "../promptpay.mjs";
import {
    activeStatus,
    decimalText,
    integerInRange,
    optionalDate,
    optionalEmail,
    optionalText,
    requiredDate,
    requiredText,
} from "./common.mjs";

export const MAX_APPROVAL_LEVELS = 10;

// ─── ข้อมูลบริษัท ────────────────────────────────────────────────────────────────────────────

export const companySchema = z.object({
    cs_name_th: requiredText("ชื่อบริษัท (ภาษาไทย)", 200),
    cs_name_en: optionalText("ชื่อบริษัท (ภาษาอังกฤษ)", 200),
    cs_tax_id: optionalText("เลขประจำตัวผู้เสียภาษี", 20)
        .transform((value) => (value === null ? null : normalizeThaiTaxId(value)))
        .refine((value) => value === null || isValidThaiTaxId(value), {
            message: "เลขประจำตัวผู้เสียภาษีไม่ถูกต้อง — ต้องเป็นตัวเลข 13 หลัก ตรวจว่าพิมพ์ครบและไม่สลับหลัก",
        }),
    cs_address_th: optionalText("ที่อยู่ (ภาษาไทย)", 1000),
    cs_address_en: optionalText("ที่อยู่ (ภาษาอังกฤษ)", 1000),
    cs_phone: optionalText("เบอร์โทร", 30),
    cs_email: optionalEmail(),
    cs_website: optionalText("เว็บไซต์", 255),
    cs_vat_registered_from: optionalDate("วันที่จดทะเบียน VAT"),
    cs_quotation_valid_days: integerInRange("อายุยืนราคา", 1, 365),
    cs_quotation_terms_th: optionalText("เงื่อนไขท้ายใบเสนอราคา (ภาษาไทย)", 5000),
    cs_quotation_terms_en: optionalText("เงื่อนไขท้ายใบเสนอราคา (ภาษาอังกฤษ)", 5000),
    cs_allow_self_approval: z.boolean({ error: "กรุณาเลือกว่าอนุญาตให้อนุมัติเอกสารของตัวเองไหม" }),
    // ใบแจ้งหนี้ (ช่วง 1B)
    cs_default_credit_days: integerInRange("เครดิตเทอมเริ่มต้น", 0, 365),
    cs_promptpay_id: optionalText("เลขพร้อมเพย์", 20)
        .refine((value) => value === null || normalizePromptPayId(value) !== null, {
            message: "เลขพร้อมเพย์ต้องเป็นเบอร์มือถือ 10 หลัก หรือเลขประจำตัวผู้เสียภาษี 13 หลัก",
        })
        .transform((value) => (value === null ? null : normalizePromptPayId(value).digits)),
    cs_invoice_notes_th: optionalText("หมายเหตุท้ายใบแจ้งหนี้ (ภาษาไทย)", 5000),
    cs_invoice_notes_en: optionalText("หมายเหตุท้ายใบแจ้งหนี้ (ภาษาอังกฤษ)", 5000),
});

// ─── อัตรา VAT ตามวันที่มีผล ──────────────────────────────────────────────────────────────────

export const vatRateSchema = z.object({
    vr_effective_from: requiredDate("วันที่มีผล"),
    vr_rate: decimalText("อัตรา VAT", { minimum: "0", maximum: "100" }),
    vr_note: optionalText("หมายเหตุ", 255),
});

// ─── สาขา ────────────────────────────────────────────────────────────────────────────────────

const branchFields = {
    branch_name_th: requiredText("ชื่อสาขา (ภาษาไทย)", 100),
    branch_name_en: optionalText("ชื่อสาขา (ภาษาอังกฤษ)", 100),
    branch_address_th: optionalText("ที่อยู่สาขา (ภาษาไทย)", 1000),
    branch_address_en: optionalText("ที่อยู่สาขา (ภาษาอังกฤษ)", 1000),
    branch_phone: optionalText("เบอร์โทรสาขา", 30),
    branch_status: activeStatus,
};

export const branchCreateSchema = z.object({
    branch_code: z
        .string({ error: "กรุณากรอกรหัสสาขา" })
        .trim()
        .regex(/^\d{5}$/, "รหัสสาขาต้องเป็นตัวเลข 5 หลัก เช่น 00001 (ตามที่จดกับกรมสรรพากร)"),
    ...branchFields,
});

// รหัสสาขาแก้ไม่ได้หลังสร้าง — อยู่บนเอกสารภาษีที่ออกไปแล้ว
export const branchUpdateSchema = z.object(branchFields);

// ─── บัญชีธนาคาร ──────────────────────────────────────────────────────────────────────────────

export const bankAccountSchema = z.object({
    ba_bank_name: requiredText("ชื่อธนาคาร", 100),
    ba_account_name: requiredText("ชื่อบัญชี", 200),
    ba_account_no: requiredText("เลขที่บัญชี", 30).regex(/^[0-9-]+$/, "เลขที่บัญชีใช้ได้เฉพาะตัวเลขและขีด"),
    ba_bank_branch: optionalText("สาขาธนาคาร", 100),
    ba_swift_code: optionalText("รหัส SWIFT", 11)
        .transform((value) => (value === null ? null : value.toUpperCase()))
        .refine((value) => value === null || /^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(value), {
            message: "รหัส SWIFT ต้องเป็นตัวอักษร/ตัวเลข 8 หรือ 11 ตัว เช่น KASITHBK",
        }),
    ba_currency: z.string({ error: "กรุณาเลือกสกุลเงินของบัญชี" }).regex(/^[A-Z]{3}$/, "กรุณาเลือกสกุลเงินของบัญชี"),
    ba_is_default: z.boolean(),
    ba_status: activeStatus,
});

// ─── สกุลเงิน ─────────────────────────────────────────────────────────────────────────────────

const currencyFields = {
    cur_name_th: requiredText("ชื่อสกุลเงิน (ภาษาไทย)", 100),
    cur_name_en: requiredText("ชื่อสกุลเงิน (ภาษาอังกฤษ)", 100),
    cur_symbol: optionalText("สัญลักษณ์", 10),
    cur_decimals: integerInRange("จำนวนทศนิยม", 0, 2),
    cur_unit_th: requiredText("คำอ่านหน่วยหลัก (ภาษาไทย)", 50),
    cur_subunit_th: optionalText("คำอ่านหน่วยย่อย (ภาษาไทย)", 50),
    cur_unit_en: requiredText("คำอ่านหน่วยหลัก (ภาษาอังกฤษ)", 50),
    cur_subunit_en: optionalText("คำอ่านหน่วยย่อย (ภาษาอังกฤษ)", 50),
    cur_bot_unit: z.union([z.literal(1), z.literal(100), z.literal(1000)], {
        error: "หน่วยที่ ธปท. ประกาศต้องเป็น 1, 100 หรือ 1000",
    }),
    cur_sort_order: integerInRange("ลำดับ", 0, 9999),
    cur_status: activeStatus,
};

// สกุลที่มีทศนิยมต้องมีคำอ่านหน่วยย่อย ไม่งั้นพิมพ์จำนวนเงินตัวอักษร (เช่น "...ห้าสิบสตางค์") ไม่ได้
function requireSubunitWords(currency, context) {
    if (currency.cur_decimals === 0) return;
    if (!currency.cur_subunit_th) {
        context.addIssue({
            code: "custom",
            path: ["cur_subunit_th"],
            message: "สกุลที่มีทศนิยมต้องมีคำอ่านหน่วยย่อย เช่น สตางค์, เซนต์",
        });
    }
    if (!currency.cur_subunit_en) {
        context.addIssue({
            code: "custom",
            path: ["cur_subunit_en"],
            message: "สกุลที่มีทศนิยมต้องมีคำอ่านหน่วยย่อย เช่น Satang, Cents",
        });
    }
}

export const currencyCreateSchema = z
    .object({
        cur_code: z
            .string({ error: "กรุณากรอกรหัสสกุลเงิน" })
            .trim()
            .transform((value) => value.toUpperCase())
            .refine((value) => /^[A-Z]{3}$/.test(value), {
                message: "รหัสสกุลเงินต้องเป็นตัวอักษรภาษาอังกฤษ 3 ตัวตามมาตรฐาน ISO 4217 เช่น USD, EUR, JPY",
            }),
        ...currencyFields,
    })
    .superRefine(requireSubunitWords);

// รหัสสกุลเงินแก้ไม่ได้หลังสร้าง
export const currencyUpdateSchema = z.object(currencyFields).superRefine(requireSubunitWords);

// ─── กติกาอนุมัติหลายชั้น (บันทึกทั้งชุด) ─────────────────────────────────────────────────────────

const approvalLevelSchema = z.object({
    al_min_amount_thb: decimalText("ยอดขั้นต่ำ"),
    al_require_distinct: z.boolean(),
    role_ids: z
        .array(z.string().min(1), { error: "กรุณาเลือก role ผู้อนุมัติ" })
        .min(1, "ทุกชั้นต้องมี role ผู้อนุมัติอย่างน้อย 1 role"),
});

// ประเภทเอกสารที่มีกติกาอนุมัติของตัวเอง + สิทธิ์ที่ผู้อนุมัติต้องมี
// QT ใบเสนอราคา · IV ใบแจ้งหนี้ที่สร้างเอง (ใบจากงวดใบเสนอราคาไม่ต้องอนุมัติ) · EX ค่าใช้จ่าย/บิลผู้ขาย · EC ใบเบิกเงิน (เฟส 2)
// allowsThreshold = ชั้น 1 เริ่มเกิน 0 ได้ → ยอดต่ำกว่าชั้น 1 ผ่านอัตโนมัติ (เฟส 2 ข้อ P2) · เอกสารขายต้องผ่านอย่างน้อย 1 ชั้นเสมอ
export const APPROVAL_DOCUMENTS = {
    QT: { name: "ใบเสนอราคา", permission: "approveQuotation", allowsThreshold: false },
    IV: { name: "ใบแจ้งหนี้ที่สร้างเอง", permission: "approveInvoice", allowsThreshold: false },
    EX: { name: "ค่าใช้จ่าย / บิลผู้ขาย", permission: "approveExpense", allowsThreshold: true },
    EC: { name: "ใบเบิกเงินพนักงาน", permission: "approveExpense", allowsThreshold: true },
    // รอบเงินเดือน (เฟส 4 ขั้น 4-4) — ทุกรอบต้องผ่านชั้น 1 (ไม่มีวงเงินอนุมัติอัตโนมัติ) · ยอดที่ใช้เทียบชั้น = ยอดจ่ายสุทธิรวม
    PR: { name: "รอบเงินเดือน", permission: "approvePayroll", allowsThreshold: false },
    // ใบลดหนี้ (2026-10-18 N2-ก) — ทุกใบต้องผ่านชั้น 1 · ยอดที่ใช้เทียบชั้น = ยอดที่ลดก่อน VAT เป็นบาท
    CN: { name: "ใบลดหนี้", permission: "approveInvoice", allowsThreshold: false },
};
export const APPROVAL_DOCUMENT_TYPES = Object.keys(APPROVAL_DOCUMENTS);

export const approvalLevelsSchema = z
    .object({
        doc_type: z.enum(APPROVAL_DOCUMENT_TYPES, { error: "ประเภทเอกสารของกติกาอนุมัติไม่ถูกต้อง" }).default("QT"),
        levels: z
            .array(approvalLevelSchema)
            .min(1, "ต้องมีอย่างน้อย 1 ชั้น")
            .max(MAX_APPROVAL_LEVELS, `ตั้งได้สูงสุด ${MAX_APPROVAL_LEVELS} ชั้น`),
    })
    .superRefine(({ doc_type: documentType, levels }, context) => {
        const allowsThreshold = APPROVAL_DOCUMENTS[documentType]?.allowsThreshold === true;
        levels.forEach((level, index) => {
            const levelNumber = index + 1;

            const minimumAmount = parseHundredths(level.al_min_amount_thb, "ยอดขั้นต่ำ");

            // เอกสารขาย: ชั้น 1 ต้องเริ่มที่ 0 — ทุกใบต้องผ่านอย่างน้อยชั้น 1
            if (index === 0 && minimumAmount !== 0n && !allowsThreshold) {
                context.addIssue({
                    code: "custom",
                    path: ["levels", index, "al_min_amount_thb"],
                    message: "ชั้น 1 ต้องเริ่มที่ 0 บาท เพื่อให้ทุกใบผ่านการอนุมัติอย่างน้อย 1 ชั้น",
                });
            }
            if (index === 0 && level.al_require_distinct) {
                context.addIssue({
                    code: "custom",
                    path: ["levels", index, "al_require_distinct"],
                    message: 'ชั้น 1 ไม่มีชั้นก่อนหน้า จึงตั้ง "ต้องเป็นคนละคน" ไม่ได้',
                });
            }

            // ยอดขั้นต่ำต้องเพิ่มขึ้นทุกชั้น ไม่งั้นลำดับชั้นไม่มีความหมาย
            const previousLevel = levels[index - 1];
            const previousMinimumAmount = previousLevel
                ? parseHundredths(previousLevel.al_min_amount_thb, "ยอดขั้นต่ำ")
                : null;
            if (previousMinimumAmount !== null && minimumAmount <= previousMinimumAmount) {
                context.addIssue({
                    code: "custom",
                    path: ["levels", index, "al_min_amount_thb"],
                    message: `ยอดขั้นต่ำของชั้น ${levelNumber} ต้องมากกว่าชั้น ${levelNumber - 1}`,
                });
            }

            const uniqueRoleIds = new Set(level.role_ids);
            if (uniqueRoleIds.size !== level.role_ids.length) {
                context.addIssue({
                    code: "custom",
                    path: ["levels", index, "role_ids"],
                    message: "เลือก role ซ้ำในชั้นเดียวกัน",
                });
            }
        });
    });
