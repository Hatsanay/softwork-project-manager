// ─── ตรวจข้อมูลลงเวลาเข้า-ออกงาน (zod · 2026-10-23 ช่วง A-1) ────────────────────────────────────────
//
// ต้นฉบับอยู่ที่ backend/src/shared/ — สำเนาใน frontend/lib/shared/ สร้างด้วย `npm run sync-shared` ห้ามแก้ที่สำเนา
// แบบระบบ: docs/plans/2026-10-23-attendance-ot.md หัวข้อ 2
// กติกาที่ต้องดูข้อมูลอื่น (เป็นพนักงาน · ต้องลงเวลา · ในรัศมี · รอบเงินเดือนปิดแล้ว) ตรวจใน backend

import { z } from "zod";
import { activeStatus, integerInRange, optionalText, requiredDate, requiredText } from "./common.mjs";
import { scheduleWorkMinutes } from "../attendance-math.mjs";

export const PUNCH_TYPES = ["in", "out"];
export const MIN_LOCATION_RADIUS_M = 20;
export const MAX_LOCATION_RADIUS_M = 5000;

const timeOfDay = (label) =>
    z
        .string({ error: `กรุณากรอก${label}` })
        .trim()
        .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, `${label}ต้องเป็นเวลา เช่น 09:00`)
        .transform((value) => (value.length === 5 ? `${value}:00` : value));

const coordinate = (label, limit) =>
    z.coerce
        .number({ error: `${label}ต้องเป็นตัวเลข` })
        .min(-limit, `${label}ต้องอยู่ระหว่าง -${limit} ถึง ${limit}`)
        .max(limit, `${label}ต้องอยู่ระหว่าง -${limit} ถึง ${limit}`)
        .transform((value) => Number(value.toFixed(6)));

/** กะทำงาน */
export const workScheduleSchema = z
    .object({
        ws_name: requiredText("ชื่อกะ", 100),
        ws_start_time: timeOfDay("เวลาเข้างาน"),
        ws_end_time: timeOfDay("เวลาเลิกงาน"),
        ws_break_minutes: integerInRange("พัก (นาที)", 0, 480),
        ws_working_weekdays: z
            .string({ error: "กรุณาเลือกวันทำงาน" })
            .regex(/^[01]{7}$/, "รูปแบบวันทำงานไม่ถูกต้อง")
            .refine((value) => value.includes("1"), { message: "ต้องมีวันทำงานอย่างน้อย 1 วันต่อสัปดาห์" }),
        ws_late_grace_minutes: integerInRange("ผ่อนผันสาย (นาที)", 0, 120),
        ws_checkin_open_minutes: integerInRange("กดเข้างานได้ก่อน (นาที)", 0, 720).default(120),
        ws_status: activeStatus.default("active"),
    })
    .superRefine((schedule, context) => {
        if (schedule.ws_start_time === schedule.ws_end_time) {
            context.addIssue({ code: "custom", path: ["ws_end_time"], message: "เวลาเลิกงานต้องไม่เท่ากับเวลาเข้างาน" });
            return;
        }
        if (scheduleWorkMinutes(schedule) <= 0) {
            context.addIssue({ code: "custom", path: ["ws_break_minutes"], message: "เวลาพักยาวเท่ากับหรือเกินเวลากะ" });
        }
    });

/** จุดลงเวลา */
export const attendanceLocationSchema = z.object({
    al_name: requiredText("ชื่อจุดลงเวลา", 100),
    al_branch_id: optionalText("สาขา", 18),
    al_latitude: coordinate("ละติจูด", 90),
    al_longitude: coordinate("ลองจิจูด", 180),
    al_radius_m: integerInRange("รัศมี (เมตร)", MIN_LOCATION_RADIUS_M, MAX_LOCATION_RADIUS_M),
    al_status: activeStatus.default("active"),
});

/** กำหนดกะให้พนักงาน (มีผลตั้งแต่วันที่) */
export const employeeScheduleSchema = z.object({
    es_schedule_id: integerInRange("กะ", 1, 2147483647),
    es_effective_from: requiredDate("มีผลตั้งแต่"),
});

/** กดเข้า/ออกงาน — ไม่มีตำแหน่งก็กดได้ (ถือเป็นนอกจุด ต้องใส่เหตุผล · backend ตรวจ) */
export const punchSchema = z.object({
    ap_type: z.enum(PUNCH_TYPES, { error: "กรุณาเลือก เข้างาน หรือ ออกงาน" }),
    latitude: coordinate("ละติจูด", 90).nullish().transform((value) => value ?? null),
    longitude: coordinate("ลองจิจูด", 180).nullish().transform((value) => value ?? null),
    accuracy: z.coerce
        .number({ error: "ความแม่นยำต้องเป็นตัวเลข" })
        .min(0)
        .nullish()
        .transform((value) => (value === null || value === undefined ? null : Math.round(value))),
    note: optionalText("เหตุผล", 255),
});

/** ขอแก้เวลา (ลืมกดเข้า/ออก · A-2) — เวลาเต็มและกติกาอื่น (ไม่เกินตอนนี้ · ช่วงที่เป็นพนักงาน · เดือนที่ปิดรอบ) ตรวจใน backend */
export const correctionSchema = z.object({
    ac_work_date: requiredDate("วันที่"),
    ac_type: z.enum(PUNCH_TYPES, { error: "กรุณาเลือก เข้างาน หรือ ออกงาน" }),
    ac_time: timeOfDay("เวลา"),
    ac_reason: requiredText("เหตุผล", 500),
});

/** ไม่อนุมัติคำขอแก้เวลา (พนักงานเห็นเหตุผล) */
export const correctionRejectSchema = z.object({
    reason: requiredText("เหตุผลที่ไม่อนุมัติ", 500),
});

export const MAX_OVERTIME_HOURS_PER_REQUEST = 12;

const quarterHourTime = (label) =>
    timeOfDay(label).refine((value) => Number(value.slice(3, 5)) % 15 === 0, {
        message: `${label}ต้องเป็นนาทีที่ 00 15 30 หรือ 45`,
    });

/** ขอ OT (A-3) — เวลาเลิก <= เวลาเริ่ม = ข้ามเที่ยงคืน · ชนิด/เพดาน/ช่วงที่เป็นพนักงาน/เดือนที่ปิดรอบ ตรวจใน backend */
export const overtimeSchema = z.object({
    ot_work_date: requiredDate("วันที่"),
    ot_start_time: quarterHourTime("เวลาเริ่ม"),
    ot_end_time: quarterHourTime("เวลาเลิก"),
    ot_reason: requiredText("เหตุผล/งานที่ทำ", 500),
});

/** ไม่อนุมัติ OT (พนักงานเห็นเหตุผล) */
export const overtimeRejectSchema = z.object({
    reason: requiredText("เหตุผลที่ไม่อนุมัติ", 500),
});

// ─── WFH (2026-10-24) ───────────────────────────────────────────────────────────────────────────

/** ขอ WFH รายวัน — วันนี้หรือหลังจากนี้ · วันทำงานของกะ · ช่วงที่เป็นพนักงาน ตรวจใน backend */
export const wfhRequestSchema = z.object({
    wfh_date: requiredDate("วันที่"),
    wfh_reason: requiredText("เหตุผล", 500),
});

/** ไม่อนุมัติ WFH (พนักงานเห็นเหตุผล) */
export const wfhRejectSchema = z.object({
    reason: requiredText("เหตุผลที่ไม่อนุมัติ", 500),
});

/** วัน WFH ประจำของพนักงาน (จันทร์→อาทิตย์ · 1111111 = WFH เต็มเวลา) */
export const employeeWfhSchema = z.object({
    emp_wfh_weekdays: z.string({ error: "กรุณาเลือกวัน WFH" }).regex(/^[01]{7}$/, "รูปแบบวัน WFH ไม่ถูกต้อง"),
});
