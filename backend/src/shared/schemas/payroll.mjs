// ─── ตรวจข้อมูลรอบเงินเดือน (zod) — สร้างรอบ · รายการเพิ่ม/หัก · บันทึกจ่าย · ค่าลดหย่อนรายปี ──────────────────────
//
// ต้นฉบับอยู่ที่ backend/src/shared/ — สำเนาใน frontend/lib/shared/ สร้างด้วย `npm run sync-shared` ห้ามแก้ที่สำเนา
// แบบระบบ: docs/plans/2026-10-17-people-payroll-4.md หัวข้อ 3.4, 3.7, 4.3
// กติกาที่ต้องดูข้อมูลอื่น (รอบซ้ำ, รอบก่อนหน้า, สิทธิ์อนุมัติ) ตรวจใน backend

import { z } from "zod";
import { decimalText, optionalText, requiredDate, requiredText } from "./common.mjs";

const versionField = z.number({ error: "ข้อมูลเวอร์ชันไม่ถูกต้อง กรุณาโหลดหน้าใหม่" }).int().min(0);

/** สร้างรอบเงินเดือน */
export const payrollRunSchema = z.object({
    pr_period: z
        .string({ error: "กรุณาเลือกเดือน" })
        .regex(/^\d{4}-(0[1-9]|1[0-2])$/, { error: "เดือนไม่ถูกต้อง (YYYY-MM)" }),
    pr_pay_date: requiredDate("วันจ่ายเงินเดือน"),
});

/** แก้วันจ่าย (ร่าง) */
export const payrollPayDateSchema = z.object({
    pr_version: versionField,
    pr_pay_date: requiredDate("วันจ่ายเงินเดือน"),
});

/** action ที่รับแค่เวอร์ชัน (คิดใหม่ · ส่ง · อนุมัติ) */
export const payrollActionSchema = z.object({ pr_version: versionField });

/** ตีกลับ / ยกเลิก — ต้องมีเหตุผล */
export const payrollReasonSchema = payrollActionSchema.extend({ reason: requiredText("เหตุผล", 500) });

/** บันทึกจ่ายแล้ว */
export const payrollPaidSchema = payrollActionSchema.extend({
    pr_paid_date: requiredDate("วันที่จ่าย"),
    pr_paid_note: optionalText("หมายเหตุการจ่าย", 255),
});

/** รายการเพิ่ม/หักที่กรอกเอง (โบนัส · OT · หักอื่น) — ตัวเลือกภาษี/ประกันสังคมมีผลเฉพาะรายรับ */
export const payrollLineSchema = payrollActionSchema.extend({
    pil_kind: z.enum(["earning", "deduction"], { error: "เลือกรายรับหรือรายหัก" }),
    pil_label: requiredText("ชื่อรายการ", 100),
    pil_amount: decimalText("จำนวนเงิน", { minimum: "0.01", maximum: "9999999.99" }),
    pil_is_taxable: z.boolean().default(true),
    pil_is_sso_wage: z.boolean().default(false),
    pil_is_one_off: z.boolean().default(true),
});

const allowance = (label) => decimalText(label, { minimum: "0", maximum: "9999999.99" }).default("0.00");

/** ค่าลดหย่อนรายปี + ยอดยกมาของปี */
export const taxProfileSchema = z.object({
    etp_spouse_allowance: allowance("ลดหย่อนคู่สมรส"),
    etp_child_allowance: allowance("ลดหย่อนบุตร"),
    etp_parent_allowance: allowance("ลดหย่อนบิดามารดา"),
    etp_insurance_allowance: allowance("เบี้ยประกัน"),
    etp_fund_allowance: allowance("กองทุน"),
    etp_home_loan_interest: allowance("ดอกเบี้ยเงินกู้บ้าน"),
    etp_other_allowance: allowance("ลดหย่อนอื่น"),
    etp_prior_income: allowance("เงินได้ยกมา"),
    etp_prior_tax: allowance("ภาษียกมา"),
    etp_prior_sso: allowance("ประกันสังคมยกมา"),
    // ยอดยกมาจากที่ทำงานเดิม = ใช้คิดภาษีเท่านั้น ไม่รวมในแบบ ภ.ง.ด.1ก / 50 ทวิ ของบริษัท (ขั้น 4-5)
    etp_prior_from_other_employer: z.boolean().default(false),
    etp_note: optionalText("หมายเหตุ", 255),
});
