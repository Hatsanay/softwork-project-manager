// ─── ตรวจข้อมูลลงเวลา (zod) — บันทึกทั้งสัปดาห์ · ส่ง · อนุมัติ · ตีกลับ ─────────────────────────────────────
//
// ต้นฉบับอยู่ที่ backend/src/shared/ — สำเนาใน frontend/lib/shared/ สร้างด้วย `npm run sync-shared` ห้ามแก้ที่สำเนา
// แบบระบบ: docs/plans/2026-10-17-people-payroll-4.md หัวข้อ 3.5 และ 4.1
// กติกาที่ต้องดูข้อมูลอื่น (ช่วงที่เป็นพนักงาน, ลงย้อนหลัง, เป็นสมาชิกโปรเจกต์, งานอยู่ในโปรเจกต์) ตรวจใน backend

import { z } from "zod";
import { parseHundredths } from "../money.mjs";
import { weekDates, weekdayIndex } from "../payroll-math.mjs";
import { optionalText, requiredDate, requiredText } from "./common.mjs";

export const HOURS_STEP_HUNDREDTHS = 25n; // ลงทีละ 15 นาที
export const MAX_HOURS_PER_DAY = "24";
export const MAX_ENTRIES_PER_WEEK = 120;

const optionalId = (label) =>
    optionalText(label, 18).refine((value) => value === null || /^[A-Za-z0-9]+$/.test(value), {
        message: `${label}ไม่ถูกต้อง กรุณาเลือกจากรายการ`,
    });

const hoursText = z.union([z.string(), z.number()], { error: "กรุณากรอกชั่วโมง" }).transform((value, context) => {
    let hundredths;
    try {
        hundredths = parseHundredths(value, "ชั่วโมง");
    } catch (error) {
        context.addIssue({ code: "custom", message: error.message });
        return z.NEVER;
    }
    if (hundredths <= 0n || hundredths > parseHundredths(MAX_HOURS_PER_DAY, "ชั่วโมง")) {
        context.addIssue({ code: "custom", message: "ชั่วโมงต้องมากกว่า 0 และไม่เกิน 24" });
        return z.NEVER;
    }
    if (hundredths % HOURS_STEP_HUNDREDTHS !== 0n) {
        context.addIssue({ code: "custom", message: "ลงได้ทีละ 15 นาที เช่น 1, 1.25, 1.5, 1.75" });
        return z.NEVER;
    }
    return hundredths;
});

const entrySchema = z.object({
    tse_date: requiredDate("วันที่"),
    tse_project_id: optionalId("โปรเจกต์"),
    tse_task_id: optionalId("งาน"),
    tse_hours: hoursText,
    tse_note: optionalText("รายละเอียด", 255),
});

/** บันทึกทั้งสัปดาห์ (แทนที่ทุกแถวของสัปดาห์) — ชั่วโมงเป็น BigInt หน่วย 1/100 ชม. หลังผ่านการตรวจ */
export const timesheetWeekSchema = z
    .object({
        week_start: requiredDate("สัปดาห์").refine((value) => weekdayIndex(value) === 0, {
            message: "สัปดาห์ต้องเริ่มวันจันทร์",
        }),
        tsw_version: z.number({ error: "ข้อมูลเวอร์ชันไม่ถูกต้อง กรุณาโหลดหน้าใหม่" }).int().min(0),
        entries: z.array(entrySchema).max(MAX_ENTRIES_PER_WEEK, `ลงได้ไม่เกิน ${MAX_ENTRIES_PER_WEEK} แถวต่อสัปดาห์`),
    })
    .superRefine((week, context) => {
        const dates = new Set(weekDates(week.week_start));
        const hoursByDate = new Map();
        const seen = new Set();
        week.entries.forEach((entry, index) => {
            if (!dates.has(entry.tse_date)) {
                context.addIssue({
                    code: "custom",
                    path: ["entries", index, "tse_date"],
                    message: "วันที่อยู่นอกสัปดาห์นี้",
                });
            }
            if (entry.tse_task_id && !entry.tse_project_id) {
                context.addIssue({
                    code: "custom",
                    path: ["entries", index, "tse_task_id"],
                    message: "เลือกโปรเจกต์ก่อนเลือกงาน",
                });
            }
            const key = `${entry.tse_date}|${entry.tse_project_id ?? ""}|${entry.tse_task_id ?? ""}`;
            if (seen.has(key)) {
                context.addIssue({
                    code: "custom",
                    path: ["entries", index, "tse_hours"],
                    message: "ซ้ำกับแถวอื่นในวันเดียวกัน (โปรเจกต์/งานเดียวกัน) · รวมเป็นแถวเดียว",
                });
            }
            seen.add(key);
            hoursByDate.set(entry.tse_date, (hoursByDate.get(entry.tse_date) ?? 0n) + (entry.tse_hours ?? 0n));
        });
        const maximum = parseHundredths(MAX_HOURS_PER_DAY, "ชั่วโมง");
        for (const [date, hours] of hoursByDate) {
            if (hours > maximum) {
                const index = week.entries.findIndex((entry) => entry.tse_date === date);
                context.addIssue({
                    code: "custom",
                    path: ["entries", index, "tse_hours"],
                    message: "รวมทั้งวันเกิน 24 ชั่วโมง",
                });
            }
        }
    });

/** ส่ง / อนุมัติ (ส่งเวอร์ชันที่เห็นอยู่ — มีคนแก้ไปก่อน = 409) */
export const timesheetActionSchema = z.object({
    tsw_version: z.number({ error: "ข้อมูลเวอร์ชันไม่ถูกต้อง กรุณาโหลดหน้าใหม่" }).int().min(0),
});

/** ตีกลับพร้อมเหตุผล */
export const timesheetReturnSchema = timesheetActionSchema.extend({
    reason: requiredText("เหตุผล", 500),
});
