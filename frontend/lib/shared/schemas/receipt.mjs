// ─── ตรวจข้อมูลใบเสร็จรับเงิน (zod) — ใช้ทั้งฟอร์มหน้าเว็บและ backend ───────────────────────────────────────
//
// ต้นฉบับอยู่ที่ backend/src/shared/ — สำเนาใน frontend/lib/shared/ สร้างด้วย `npm run sync-shared` ห้ามแก้ที่สำเนา
// ชื่อฟิลด์ = ชื่อคอลัมน์ · แบบระบบ: docs/plans/2026-10-15-receipts-1c.md หัวข้อ 4
//
// บันทึกรับเงิน = ออกใบเสร็จทันที (C1) · ยอดตัดต่อใบ/ยอดค้าง/วันที่เทียบใบแจ้งหนี้/สมการยอด ตรวจใน backend หลังล็อกใบแจ้งหนี้
// (backend/src/services/receipt.service.js) — schema นี้ตรวจรูปแบบและช่องที่บังคับตามวิธีรับเงิน

import { z } from "zod";
import { decimalText, integerInRange, optionalDate, optionalText, requiredDate, requiredText } from "./common.mjs";

export const MAX_RECEIPT_ALLOCATIONS = 100;
// วันที่ใบเสร็จย้อนหลังได้ไม่เกินกี่วัน (ผู้ใช้เลือก C2)
export const MAX_RECEIPT_BACKDATE_DAYS = 30;

export const RECEIPT_METHODS = ["transfer", "cheque", "cash", "other"];

const optionalId = z
    .string()
    .trim()
    .nullish()
    .transform((value) => (value ? value : null));

const version = integerInRange("เวอร์ชัน", 0, 2_000_000_000).nullish();

const amountText = (label) => decimalText(label, { minimum: "0", maximum: "9999999999999.99" });

const allocationSchema = z.object({
    rca_invoice_id: requiredText("ใบแจ้งหนี้", 18),
    rca_amount: decimalText("ยอดรับ", { minimum: "0.01", maximum: "9999999999999.99" }),
});

/** บันทึกรับเงิน (= ออกใบเสร็จ) */
export const receiptCreateSchema = z
    .object({
        rc_client_id: requiredText("ลูกค้า", 18),
        rc_branch_id: requiredText("สาขา", 18),
        rc_language: z.enum(["th", "en"], { error: "ภาษาเอกสารต้องเป็นไทยหรืออังกฤษ" }).default("th"),
        rc_receipt_date: requiredDate("วันที่รับเงิน"),
        rc_method: z.enum(RECEIPT_METHODS, { error: "เลือกวิธีรับเงิน" }),
        rc_bank_account_id: optionalId,
        rc_reference: optionalText("เลขอ้างอิง", 100),
        rc_cheque_no: optionalText("เลขที่เช็ค", 30),
        rc_cheque_bank: optionalText("ธนาคารของเช็ค", 100),
        rc_cheque_date: optionalDate("วันที่หน้าเช็ค"),
        allocations: z
            .array(allocationSchema, { error: "กรุณาเลือกใบแจ้งหนี้" })
            .min(1, "เลือกใบแจ้งหนี้ที่รับเงินอย่างน้อย 1 ใบ")
            .max(MAX_RECEIPT_ALLOCATIONS, `ใบเสร็จหนึ่งใบตัดได้ไม่เกิน ${MAX_RECEIPT_ALLOCATIONS} ใบแจ้งหนี้`)
            .refine((rows) => new Set(rows.map((row) => row.rca_invoice_id)).size === rows.length, {
                message: "เลือกใบแจ้งหนี้ซ้ำกัน",
            }),
        rc_wht_amount: amountText("หัก ณ ที่จ่าย").default("0.00"),
        rc_fee_amount: amountText("ค่าธรรมเนียม").default("0.00"),
        // สกุลต่างประเทศ: ยอดบาทที่เข้าบัญชีจริง (บาท = ไม่ต้องส่ง)
        rc_received_thb: amountText("ยอดบาทที่เข้าบัญชีจริง")
            .nullish()
            .transform((value) => value ?? null),
        rc_wht_certificate_no: optionalText("เลขที่ 50 ทวิ", 50),
        rc_wht_certificate_date: optionalDate("วันที่ใน 50 ทวิ"),
        rc_notes: optionalText("หมายเหตุ", 2000),
        rc_internal_note: optionalText("บันทึกภายใน", 2000),
        rc_billing_note_id: optionalId,
    })
    .superRefine((receipt, context) => {
        const addRequired = (path, message) => context.addIssue({ code: "custom", path: [path], message });
        if (receipt.rc_method === "transfer" && !receipt.rc_bank_account_id) {
            addRequired("rc_bank_account_id", "เลือกบัญชีที่เงินโอนเข้า");
        }
        if (receipt.rc_method === "cheque") {
            if (!receipt.rc_cheque_no) addRequired("rc_cheque_no", "กรอกเลขที่เช็ค");
            if (!receipt.rc_cheque_bank) addRequired("rc_cheque_bank", "กรอกธนาคารของเช็ค");
            if (!receipt.rc_cheque_date) addRequired("rc_cheque_date", "เลือกวันที่หน้าเช็ค");
        }
    })
    // ช่องเช็คใช้เฉพาะวิธีเช็ค — วิธีอื่นล้างทิ้ง กันข้อมูลค้างจากการสลับวิธีในฟอร์ม
    .transform((receipt) =>
        receipt.rc_method === "cheque"
            ? receipt
            : { ...receipt, rc_cheque_no: null, rc_cheque_bank: null, rc_cheque_date: null },
    );

/** แก้หลังออก: ได้เฉพาะข้อมูล 50 ทวิ + บันทึกภายใน (ไฟล์แนบใช้ endpoint ของไฟล์) */
export const receiptDetailsSchema = z.object({
    rc_wht_certificate_no: optionalText("เลขที่ 50 ทวิ", 50),
    rc_wht_certificate_date: optionalDate("วันที่ใน 50 ทวิ"),
    rc_internal_note: optionalText("บันทึกภายใน", 2000),
    rc_version: version,
});

/** ยกเลิก — ต้องมีเหตุผล */
export const receiptReasonSchema = z.object({
    reason: requiredText("เหตุผล", 500),
    rc_version: version,
});
