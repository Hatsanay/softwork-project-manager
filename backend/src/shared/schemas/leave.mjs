// ─── ตรวจข้อมูลคำขอลา (zod) — สร้าง/แก้ร่าง · ส่ง/ดึงกลับ/อนุมัติ · ไม่อนุมัติ/ยกเลิก (ต้องมีเหตุผล) ─────────────────
//
// ต้นฉบับอยู่ที่ backend/src/shared/ — สำเนาใน frontend/lib/shared/ สร้างด้วย `npm run sync-shared` ห้ามแก้ที่สำเนา
// แบบระบบ: docs/plans/2026-10-17-people-payroll-4.md หัวข้อ 4.4
// กติกาที่ต้องดูข้อมูลอื่น (จำนวนวันทำงาน, ช่วงที่เป็นพนักงาน, ทับซ้อน, โควตา, อายุงาน, ไฟล์แนบ) ตรวจใน backend

import { z } from "zod";
import { daysBetween } from "../payroll-math.mjs";
import { optionalText, requiredDate, requiredText } from "./common.mjs";

export const HALF_DAY_OPTIONS = ["none", "morning", "afternoon"];
export const MAX_LEAVE_SPAN_DAYS = 90;
export const MAX_LEAVE_ATTACHMENTS = 5;

const versionField = z.number({ error: "ข้อมูลเวอร์ชันไม่ถูกต้อง กรุณาโหลดหน้าใหม่" }).int().min(0);

/** สร้าง/แก้คำขอลา (ร่าง) */
export const leaveRequestSchema = z
    .object({
        lr_leave_type_id: z.number({ error: "กรุณาเลือกประเภทลา" }).int().positive({ error: "กรุณาเลือกประเภทลา" }),
        lr_start_date: requiredDate("วันเริ่มลา"),
        lr_end_date: requiredDate("วันสุดท้ายที่ลา"),
        lr_half_day: z.enum(HALF_DAY_OPTIONS, { error: "เลือกเต็มวัน เช้า หรือบ่าย" }).default("none"),
        lr_reason: optionalText("เหตุผล", 500),
    })
    .superRefine((request, context) => {
        if (request.lr_end_date < request.lr_start_date) {
            context.addIssue({ code: "custom", path: ["lr_end_date"], message: "วันสุดท้ายต้องไม่ก่อนวันเริ่มลา" });
            return;
        }
        if (request.lr_start_date.slice(0, 4) !== request.lr_end_date.slice(0, 4)) {
            context.addIssue({
                code: "custom",
                path: ["lr_end_date"],
                message: "ลาคร่อมปีไม่ได้ (โควตานับรายปี) · แยกเป็น 2 ใบ ใบละปี",
            });
        }
        if (daysBetween(request.lr_start_date, request.lr_end_date) >= MAX_LEAVE_SPAN_DAYS) {
            context.addIssue({
                code: "custom",
                path: ["lr_end_date"],
                message: `ลาได้ไม่เกิน ${MAX_LEAVE_SPAN_DAYS} วันต่อใบ`,
            });
        }
        if (request.lr_half_day !== "none" && request.lr_start_date !== request.lr_end_date) {
            context.addIssue({ code: "custom", path: ["lr_half_day"], message: "ลาครึ่งวันได้เฉพาะลาวันเดียว" });
        }
    });

/** ส่ง / ดึงกลับ / อนุมัติ / ลบร่าง (ส่งเวอร์ชันที่เห็นอยู่ — มีคนเปลี่ยนไปก่อน = 409) */
export const leaveActionSchema = z.object({ lr_version: versionField });

/** ไม่อนุมัติ / ยกเลิกลาที่อนุมัติแล้ว — ต้องมีเหตุผล */
export const leaveReasonActionSchema = leaveActionSchema.extend({ reason: requiredText("เหตุผล", 500) });

/** ยกเลิกของตัวเอง (ร่าง/รออนุมัติ/อนุมัติแล้วที่ยังไม่ถึงวันลา) — เหตุผลไม่บังคับ */
export const leaveCancelSchema = leaveActionSchema.extend({ reason: optionalText("เหตุผล", 500) });
