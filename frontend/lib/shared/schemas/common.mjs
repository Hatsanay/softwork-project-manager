// ─── ชิ้นส่วนตรวจข้อมูลที่ใช้ซ้ำทุกโมดูล (zod) ─────────────────────────────────────────────────────────
//
// ต้นฉบับอยู่ที่ backend/src/shared/ — สำเนาใน frontend/lib/shared/ สร้างด้วย `npm run sync-shared` ห้ามแก้ที่สำเนา
// ข้อความผิดพลาดเป็นภาษาไทย บอกว่าต้องแก้อย่างไร — หน้าเว็บแสดงใต้ช่องนั้นตรงๆ
// label = ชื่อช่องที่ผู้ใช้เห็น ใช้ประกอบข้อความ

import { z } from "zod";
import { parseHundredths, formatHundredths } from "../money.mjs";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_TEXT = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * ข้อความบังคับกรอก — ตัดช่องว่างหัวท้าย
 * @param {string} label
 * @param {number} maxLength
 */
export function requiredText(label, maxLength) {
    return z
        .string({ error: `กรุณากรอก${label}` })
        .trim()
        .min(1, `กรุณากรอก${label}`)
        .max(maxLength, `${label}ยาวได้ไม่เกิน ${maxLength} ตัวอักษร`);
}

/**
 * ข้อความไม่บังคับ — ค่าว่าง/ไม่ส่งมา = null (เก็บ NULL ในฐานข้อมูล ไม่เก็บสตริงว่าง)
 * @param {string} label
 * @param {number} maxLength
 */
export function optionalText(label, maxLength) {
    return z
        .string({ error: `${label}ต้องเป็นข้อความ` })
        .trim()
        .max(maxLength, `${label}ยาวได้ไม่เกิน ${maxLength} ตัวอักษร`)
        .nullish()
        .transform((value) => (value ? value : null));
}

/** อีเมลไม่บังคับ */
export function optionalEmail(label = "อีเมล") {
    return optionalText(label, 255).refine((value) => value === null || EMAIL_PATTERN.test(value), {
        message: `${label}ไม่ถูกต้อง ตัวอย่าง: name@company.com`,
    });
}

/**
 * "YYYY-MM-DD" ที่มีอยู่จริงในปฏิทิน (กัน 2026-02-30)
 * @param {string} text
 * @returns {boolean}
 */
export function isRealDateText(text) {
    const match = String(text).match(DATE_TEXT);
    if (!match) return false;
    const [, year, month, day] = match;
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    return date.toISOString().startsWith(`${year}-${month}-${day}`);
}

/** วันที่บังคับกรอก รูปแบบ YYYY-MM-DD */
export function requiredDate(label) {
    return z.string({ error: `กรุณาเลือก${label}` }).refine(isRealDateText, { message: `${label}ไม่ถูกต้อง` });
}

/** วันที่ไม่บังคับ — ค่าว่าง = null */
export function optionalDate(label) {
    return z
        .string({ error: `${label}ไม่ถูกต้อง` })
        .nullish()
        .transform((value) => (value ? value : null))
        .refine((value) => value === null || isRealDateText(value), { message: `${label}ไม่ถูกต้อง` });
}

/** จำนวนเต็มในช่วงที่กำหนด */
export function integerInRange(label, minimum, maximum) {
    return z
        .number({ error: `${label}ต้องเป็นตัวเลข` })
        .int(`${label}ต้องเป็นจำนวนเต็ม`)
        .min(minimum, `${label}ต้องอยู่ระหว่าง ${minimum}-${maximum}`)
        .max(maximum, `${label}ต้องอยู่ระหว่าง ${minimum}-${maximum}`);
}

/**
 * ตัวเลขทศนิยม 2 ตำแหน่ง (เงิน/เปอร์เซ็นต์) รับได้ทั้งตัวเลขและข้อความ ("1,234.50")
 * ผลลัพธ์เป็นข้อความ 2 ตำแหน่ง ("1234.50") พร้อมเก็บลง DECIMAL — ไม่ผ่าน float
 * @param {string} label
 * @param {{ minimum?: string, maximum?: string }} [range] เป็นข้อความทศนิยม เช่น "0", "100"
 */
export function decimalText(label, { minimum = "0", maximum = "9999999999999.99" } = {}) {
    const minimumHundredths = parseHundredths(minimum, label);
    const maximumHundredths = parseHundredths(maximum, label);

    return z.union([z.string(), z.number()], { error: `กรุณากรอก${label}` }).transform((value, context) => {
        // ผู้ใช้พิมพ์เกิน 2 ตำแหน่ง → บอกให้แก้ ไม่ปัดให้เงียบๆ
        const hasTooManyDecimals = typeof value === "string" && /\.\d{3,}$/.test(value.trim());
        if (hasTooManyDecimals) {
            context.addIssue({ code: "custom", message: `${label}ใส่ทศนิยมได้ไม่เกิน 2 ตำแหน่ง` });
            return z.NEVER;
        }

        let hundredths;
        try {
            hundredths = parseHundredths(value, label);
        } catch (error) {
            context.addIssue({ code: "custom", message: error.message });
            return z.NEVER;
        }
        if (hundredths < minimumHundredths || hundredths > maximumHundredths) {
            context.addIssue({ code: "custom", message: `${label}ต้องอยู่ระหว่าง ${minimum}-${maximum}` });
            return z.NEVER;
        }
        return formatHundredths(hundredths);
    });
}

export const activeStatus = z.enum(["active", "inactive"], { error: "สถานะต้องเป็น ใช้งาน หรือ ปิดใช้งาน" });
