// ─── ตรวจข้อมูลฝั่งบุคคล (zod) — พนักงาน · ค่าจ้าง · รายการประจำ · ตั้งค่าบุคคล ─────────────────────────────
//
// ต้นฉบับอยู่ที่ backend/src/shared/ — สำเนาใน frontend/lib/shared/ สร้างด้วย `npm run sync-shared` ห้ามแก้ที่สำเนา
// ชื่อฟิลด์ = ชื่อคอลัมน์ · แบบระบบ: docs/plans/2026-10-17-people-payroll-4.md หัวข้อ 3.1–3.3
// กติกาที่ต้องดูข้อมูลอื่น (รหัสซ้ำ, วันที่เทียบกับวันเริ่มงาน, เลขประจำตัวซ้ำกับคนที่ยังทำงานอยู่) ตรวจใน backend

import { z } from "zod";
import { isValidThaiTaxId, normalizeThaiTaxId } from "../thai-tax-id.mjs";
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

// เงินเดือน/รายการต่อเดือนสูงสุด 9,999,999.99 — กันพิมพ์ศูนย์เกิน (ช่อง DECIMAL(15,2) รับได้มากกว่านี้)
export const MAX_MONTHLY_AMOUNT = "9999999.99";
export const EARLIEST_EMPLOYMENT_DATE = "1950-01-01";
export const WEEKDAY_LABELS = ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์", "อาทิตย์"];

const optionalId = (label) =>
    optionalText(label, 18).refine((value) => value === null || /^[A-Za-z0-9]+$/.test(value), {
        message: `${label}ไม่ถูกต้อง กรุณาเลือกจากรายการ`,
    });

const yesNo = (label) => z.boolean({ error: `${label}ต้องเป็น ใช่ หรือ ไม่ใช่` });

const employmentDate = (label) =>
    requiredDate(label).refine((value) => value >= EARLIEST_EMPLOYMENT_DATE, {
        message: `${label}ต้องไม่ก่อนปี 1950`,
    });

const monthlyAmount = (label, minimum = "0.01") => decimalText(label, { minimum, maximum: MAX_MONTHLY_AMOUNT });

const employeeFields = z.object({
    emp_code: requiredText("รหัสพนักงาน", 20).refine((value) => /^[A-Za-z0-9_-]+$/.test(value), {
        message: "รหัสพนักงานใช้ได้เฉพาะตัวอักษรอังกฤษ ตัวเลข - และ _",
    }),
    emp_user_id: optionalId("บัญชีผู้ใช้"),
    emp_title: optionalText("คำนำหน้า", 30),
    emp_first_name_th: requiredText("ชื่อ", 100),
    emp_last_name_th: requiredText("นามสกุล", 100),
    emp_first_name_en: optionalText("ชื่อ (อังกฤษ)", 100),
    emp_last_name_en: optionalText("นามสกุล (อังกฤษ)", 100),
    emp_nickname: optionalText("ชื่อเล่น", 50),
    emp_national_id: optionalText("เลขประจำตัวประชาชน", 20)
        .transform((value) => (value === null ? null : normalizeThaiTaxId(value)))
        .refine((value) => value === null || isValidThaiTaxId(value), {
            message: "เลขประจำตัวประชาชนไม่ถูกต้อง — ต้องเป็นตัวเลข 13 หลัก ตรวจว่าพิมพ์ครบและไม่สลับหลัก",
        }),
    emp_birth_date: optionalDate("วันเกิด"),
    emp_address: optionalText("ที่อยู่", 1000),
    emp_phone: optionalText("เบอร์โทร", 20),
    emp_email: optionalEmail(),
    emp_department_id: optionalId("แผนก"),
    emp_position: optionalText("ตำแหน่งงาน", 100),
    emp_branch_id: optionalId("สาขา"),
    emp_hire_date: employmentDate("วันเริ่มงาน"),
    emp_bank_name: optionalText("ธนาคาร", 100),
    emp_bank_account_no: optionalText("เลขที่บัญชี", 30).transform((value) =>
        value === null ? null : value.replace(/[\s-]+/g, ""),
    ),
    emp_bank_account_name: optionalText("ชื่อบัญชี", 150),
    emp_sso_enrolled: yesNo("เข้าประกันสังคม").default(true),
    emp_sso_number: optionalText("เลขประกันสังคม", 20),
    emp_notes: optionalText("หมายเหตุ", 2000),
});

function checkEmployee(employee, context) {
    if (employee.emp_bank_account_no && !employee.emp_bank_name) {
        context.addIssue({ code: "custom", path: ["emp_bank_name"], message: "ใส่ชื่อธนาคารของเลขบัญชีนี้" });
    }
    if (employee.emp_bank_account_no && !/^\d{6,20}$/.test(employee.emp_bank_account_no)) {
        context.addIssue({
            code: "custom",
            path: ["emp_bank_account_no"],
            message: "เลขที่บัญชีต้องเป็นตัวเลข 6–20 หลัก (เว้นวรรค/ขีดได้)",
        });
    }
    if (employee.emp_birth_date && employee.emp_birth_date >= employee.emp_hire_date) {
        context.addIssue({ code: "custom", path: ["emp_birth_date"], message: "วันเกิดต้องก่อนวันเริ่มงาน" });
    }
}

/** แก้ข้อมูลพนักงาน (เงินเดือนแก้ผ่านค่าจ้างตามวันที่มีผล ไม่ใช่ที่นี่) */
export const employeeSchema = employeeFields.superRefine(checkEmployee);

/** เพิ่มพนักงาน = ข้อมูลพนักงาน + เงินเดือนเริ่มต้น (มีผลวันเริ่มงาน) */
export const employeeCreateSchema = employeeFields
    .extend({ ecm_base_salary: monthlyAmount("เงินเดือนเริ่มต้น") })
    .superRefine(checkEmployee);

/** พ้นสภาพ — วันทำงานวันสุดท้าย (ตั้งล่วงหน้าได้) */
export const employeeTerminateSchema = z.object({
    emp_termination_date: employmentDate("วันทำงานวันสุดท้าย"),
    emp_termination_reason: requiredText("เหตุผล", 500),
});

/** ค่าจ้างอัตราใหม่ */
export const compensationSchema = z.object({
    ecm_effective_from: employmentDate("วันที่มีผล"),
    ecm_base_salary: monthlyAmount("เงินเดือน"),
    ecm_note: optionalText("เหตุผล", 255),
});

/** แก้ยอด/เหตุผลของอัตราเดิม (พิมพ์ผิด) — วันที่มีผลแก้ไม่ได้ */
export const compensationUpdateSchema = z.object({
    ecm_base_salary: monthlyAmount("เงินเดือน"),
    ecm_note: optionalText("เหตุผล", 255),
});

/** รายรับ/รายหักประจำ — ตัวเลือกภาษี/ประกันสังคมใช้กับรายรับเท่านั้น */
export const recurringItemSchema = z
    .object({
        eri_kind: z.enum(["earning", "deduction"], { error: "กรุณาเลือกรายรับหรือรายหัก" }),
        eri_label: requiredText("ชื่อรายการ", 100),
        eri_amount: monthlyAmount("ยอดต่อเดือน"),
        eri_is_taxable: yesNo("คิดภาษี").default(true),
        eri_is_sso_wage: yesNo("นับเป็นค่าจ้างประกันสังคม").default(false),
        eri_effective_from: employmentDate("เริ่มตั้งแต่"),
        eri_effective_to: optionalDate("ถึงวันที่"),
        eri_note: optionalText("หมายเหตุ", 255),
    })
    .transform((item) =>
        item.eri_kind === "deduction" ? { ...item, eri_is_taxable: false, eri_is_sso_wage: false } : item,
    )
    .superRefine((item, context) => {
        if (item.eri_effective_to && item.eri_effective_to < item.eri_effective_from) {
            context.addIssue({
                code: "custom",
                path: ["eri_effective_to"],
                message: "วันสิ้นสุดต้องไม่ก่อนวันเริ่ม",
            });
        }
    });

/** หยุดรายการประจำ — วันสุดท้ายที่มีผล */
export const recurringItemEndSchema = z.object({
    eri_effective_to: requiredDate("วันสุดท้ายที่มีผล"),
});

// ─── ตั้งค่าบุคคล ───────────────────────────────────────────────────────────────────────────────

/** อัตราประกันสังคม */
export const ssoRateSchema = z
    .object({
        sr_effective_from: requiredDate("วันที่มีผล"),
        sr_employee_rate: decimalText("อัตราลูกจ้าง (%)", { minimum: "0", maximum: "20" }),
        sr_employer_rate: decimalText("อัตรานายจ้าง (%)", { minimum: "0", maximum: "20" }),
        sr_wage_floor: decimalText("ฐานค่าจ้างขั้นต่ำ", { minimum: "0", maximum: MAX_MONTHLY_AMOUNT }),
        sr_wage_ceiling: monthlyAmount("ฐานค่าจ้างสูงสุด"),
        sr_note: optionalText("ที่มา/หมายเหตุ", 255),
    })
    .superRefine((rate, context) => {
        if (Number(rate.sr_wage_floor) > Number(rate.sr_wage_ceiling)) {
            context.addIssue({
                code: "custom",
                path: ["sr_wage_ceiling"],
                message: "ฐานค่าจ้างสูงสุดต้องไม่น้อยกว่าขั้นต่ำ",
            });
        }
    });

const taxBracketSchema = z.object({
    itb_from_amount: decimalText("เงินได้สุทธิตั้งแต่", { minimum: "0", maximum: "9999999999999.99" }),
    itb_rate: decimalText("อัตราภาษี (%)", { minimum: "0", maximum: "100" }),
});

/** ปีภาษี + ขั้นภาษีทั้งชุด — ขั้นแรกต้องเริ่มที่ 0 · ยอดเริ่มของแต่ละขั้นต้องมากขึ้นเรื่อยๆ */
export const taxYearSchema = z
    .object({
        ity_tax_year: integerInRange("ปีภาษี (ค.ศ.)", 2000, 2200),
        ity_expense_rate: decimalText("หักค่าใช้จ่าย (%)", { minimum: "0", maximum: "100" }),
        ity_expense_cap: decimalText("หักค่าใช้จ่ายสูงสุด", { minimum: "0", maximum: "9999999999.99" }),
        ity_personal_allowance: decimalText("ลดหย่อนส่วนตัว", { minimum: "0", maximum: "9999999999.99" }),
        ity_note: optionalText("ที่มา/หมายเหตุ", 255),
        brackets: z
            .array(taxBracketSchema, { error: "กรุณาใส่ขั้นภาษี" })
            .min(1, "ต้องมีขั้นภาษีอย่างน้อย 1 ขั้น")
            .max(20),
    })
    .superRefine((year, context) => {
        if (year.brackets.length === 0) return;
        if (year.brackets[0].itb_from_amount !== "0.00") {
            context.addIssue({
                code: "custom",
                path: ["brackets", 0, "itb_from_amount"],
                message: "ขั้นแรกต้องเริ่มที่ 0 บาท",
            });
        }
        for (let index = 1; index < year.brackets.length; index++) {
            const previous = Number(year.brackets[index - 1].itb_from_amount);
            if (Number(year.brackets[index].itb_from_amount) <= previous) {
                context.addIssue({
                    code: "custom",
                    path: ["brackets", index, "itb_from_amount"],
                    message: "ยอดเริ่มของขั้นนี้ต้องมากกว่าขั้นก่อนหน้า",
                });
            }
        }
    });

/** ตั้งค่าเวลาทำงาน/เงินเดือนของบริษัท */
export const payrollSettingsSchema = z.object({
    ps_working_weekdays: z
        .string({ error: "กรุณาเลือกวันทำงาน" })
        .regex(/^[01]{7}$/, "รูปแบบวันทำงานไม่ถูกต้อง")
        .refine((value) => value.includes("1"), { message: "ต้องมีวันทำงานอย่างน้อย 1 วันต่อสัปดาห์" }),
    ps_hours_per_day: decimalText("ชั่วโมงทำงานต่อวัน", { minimum: "1", maximum: "24" }),
    ps_pay_day: integerInRange("วันจ่ายเงินเดือน", 1, 31),
    ps_unpaid_leave_divisor: z.enum(["days_30", "working_days"], { error: "กรุณาเลือกวิธีหักลาไม่รับค่าจ้าง" }),
    ps_timesheet_backdate_days: integerInRange("ลงเวลาย้อนหลังได้ (วัน)", 0, 90),
});

/** วันหยุดบริษัท */
export const holidaySchema = z.object({
    hd_date: requiredDate("วันที่"),
    hd_name: requiredText("ชื่อวันหยุด", 100),
});

// จำนวนวันไม่บังคับ (ช่องว่าง = ไม่กำหนด) — ทีละครึ่งวัน
const optionalDays = (label) =>
    z.preprocess(
        (value) => (typeof value === "string" && value.trim() === "" ? null : value),
        decimalText(label, { minimum: "0", maximum: "365" })
            .nullish()
            .transform((value) => value ?? null)
            .refine((value) => value === null || Number(value) * 2 === Math.round(Number(value) * 2), {
                message: `${label}ใส่ได้ทีละครึ่งวัน เช่น 3 หรือ 3.5`,
            }),
    );

/** ประเภทลา */
export const leaveTypeSchema = z.object({
    lt_name_th: requiredText("ชื่อประเภทลา", 100),
    lt_name_en: optionalText("ชื่อ (อังกฤษ)", 100),
    lt_days_per_year: optionalDays("โควตาต่อปี"),
    lt_is_paid: yesNo("ได้รับค่าจ้าง").default(true),
    lt_attachment_from_days: optionalDays("ต้องแนบไฟล์เมื่อลาตั้งแต่"),
    lt_min_service_days: integerInRange("ต้องทำงานครบ (วัน)", 0, 3650).default(0),
    lt_carry_over_days: optionalDays("ยกไปปีถัดไปได้").transform((value) => value ?? "0.00"),
    lt_status: activeStatus.default("active"),
    lt_sort_order: integerInRange("ลำดับ", 0, 9999).default(0),
});
