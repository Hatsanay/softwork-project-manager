// ─── ตรวจข้อมูลใบสำคัญจ่าย (zod) — ใช้ทั้งฟอร์มหน้าเว็บและ backend ──────────────────────────────────────
//
// ต้นฉบับอยู่ที่ backend/src/shared/ — สำเนาใน frontend/lib/shared/ สร้างด้วย `npm run sync-shared` ห้ามแก้ที่สำเนา
// ชื่อฟิลด์ = ชื่อคอลัมน์ · แบบระบบ: docs/plans/2026-10-16-purchasing-2.md หัวข้อ 3.5, 4.2
// ยอดค้าง/ผู้รับเดียวกัน/สกุลเดียวกัน/วันที่ ตรวจใน backend (services/payment.service.js) หลังล็อกรายการ

import { z } from "zod";
import { decimalText, integerInRange, optionalDate, optionalText, requiredDate, requiredText } from "./common.mjs";

export const MAX_PAYMENT_ALLOCATIONS = 50;
// วันที่จ่ายย้อนหลังได้ไม่เกิน 30 วัน (แบบใบเสร็จ C2 — R-P13) · ห้ามวันในอนาคต
export const MAX_PAYMENT_BACKDATE_DAYS = 30;
export const PAYMENT_METHODS = ["transfer", "cheque", "cash", "other"];

const optionalId = z
    .string()
    .trim()
    .nullish()
    .transform((value) => (value ? value : null));

const version = integerInRange("เวอร์ชัน", 0, 2_000_000_000).nullish();

export const paymentCreateSchema = z
    .object({
        pv_payee_kind: z.enum(["vendor", "employee"], { error: "กรุณาเลือกผู้รับเงิน" }),
        pv_vendor_id: optionalId,
        pv_employee_id: optionalId,
        pv_branch_id: requiredText("สาขา", 18),
        pv_payment_date: requiredDate("วันที่จ่าย"),
        pv_method: z.enum(PAYMENT_METHODS, { error: "กรุณาเลือกวิธีจ่าย" }),
        pv_bank_account_id: optionalId,
        pv_reference: optionalText("เลขอ้างอิง", 100),
        pv_cheque_no: optionalText("เลขที่เช็ค", 30),
        pv_cheque_date: optionalDate("วันที่หน้าเช็ค"),
        allocations: z
            .array(
                z.object({
                    pva_expense_id: requiredText("รายการ", 18),
                    pva_amount: decimalText("ยอดจ่าย", { minimum: "0.01", maximum: "9999999999999.99" }),
                }),
                { error: "เลือกรายการที่จะจ่าย" },
            )
            .min(1, "เลือกรายการที่จะจ่ายอย่างน้อย 1 รายการ")
            .max(MAX_PAYMENT_ALLOCATIONS, `จ่ายได้ครั้งละไม่เกิน ${MAX_PAYMENT_ALLOCATIONS} รายการ`),
        // ยอดหัก ณ ที่จ่ายต่อประเภทเงินได้ (แก้จากที่ระบบเสนอ) — ไม่ส่งประเภทไหน = ใช้ที่ระบบเสนอ
        withholdings: z
            .array(
                z.object({
                    income_type: requiredText("ประเภทเงินได้", 20),
                    amount: decimalText("ยอดหัก ณ ที่จ่าย", { minimum: "0", maximum: "9999999999999.99" }),
                }),
            )
            .max(20)
            .default([]),
        pv_fee_amount: decimalText("ค่าธรรมเนียมโอน", { minimum: "0", maximum: "9999999999999.99" }).default("0.00"),
        pv_paid_thb: decimalText("ยอดบาทที่ออกจากบัญชี", { minimum: "0", maximum: "9999999999999.99" })
            .nullish()
            .transform((value) => value ?? null),
        pv_notes: optionalText("หมายเหตุ", 2000),
    })
    .superRefine((payment, context) => {
        if (payment.pv_payee_kind === "vendor" && !payment.pv_vendor_id) {
            context.addIssue({ code: "custom", path: ["pv_vendor_id"], message: "กรุณาเลือกผู้ขาย" });
        }
        if (payment.pv_payee_kind === "employee" && !payment.pv_employee_id) {
            context.addIssue({ code: "custom", path: ["pv_employee_id"], message: "กรุณาเลือกพนักงาน" });
        }
        const needsAccount = payment.pv_method === "transfer" || payment.pv_method === "cheque";
        if (needsAccount && !payment.pv_bank_account_id) {
            context.addIssue({
                code: "custom",
                path: ["pv_bank_account_id"],
                message: "เลือกบัญชีบริษัทที่จ่ายออก (โอน/เช็คต้องระบุ)",
            });
        }
        if (payment.pv_method === "cheque" && !payment.pv_cheque_no) {
            context.addIssue({ code: "custom", path: ["pv_cheque_no"], message: "กรุณากรอกเลขที่เช็ค" });
        }
        const expenseIds = payment.allocations.map((row) => row.pva_expense_id);
        if (new Set(expenseIds).size !== expenseIds.length) {
            context.addIssue({ code: "custom", path: ["allocations"], message: "เลือกรายการเดียวกันซ้ำ" });
        }
    });

/** ยกเลิกใบสำคัญจ่าย — ต้องมีเหตุผล */
export const paymentReasonSchema = z.object({
    reason: requiredText("เหตุผล", 500),
    pv_version: version,
});
