// ─── ตรวจข้อมูลแผนก (zod) — ใช้ทั้งฟอร์มหน้าเว็บและ backend ─────────────────────────────────────────────
//
// ต้นฉบับอยู่ที่ backend/src/shared/ — สำเนาใน frontend/lib/shared/ สร้างด้วย `npm run sync-shared` ห้ามแก้ที่สำเนา
// แผนกผูกสาขาเดียว · รหัสแผนก = รหัสสาขา + ตัวย่อ 3 ตัว (docs/plans/2026-10-18-employee-department-codes.md)
// กติกาที่ต้องดูข้อมูลอื่น (รหัสซ้ำ · แผนกมีพนักงานแล้วเปลี่ยนสาขา/ตัวย่อไม่ได้) ตรวจใน backend

import { z } from "zod";
import { DEPARTMENT_ABBR_PATTERN, normalizeDepartmentAbbr } from "../employee-code.mjs";
import { activeStatus, requiredText } from "./common.mjs";

export const departmentSchema = z.object({
    dep_name: requiredText("ชื่อแผนก", 100),
    dep_branch_id: requiredText("สาขา", 18),
    dep_abbr: z
        .string({ error: "กรุณากรอกตัวย่อแผนก" })
        .transform(normalizeDepartmentAbbr)
        .refine((value) => DEPARTMENT_ABBR_PATTERN.test(value), {
            message: "ตัวย่อต้องเป็นตัวอักษรอังกฤษหรือตัวเลข 3 ตัวพอดี เช่น ACC, ITD, HRM",
        }),
    dep_status: activeStatus.default("active"),
});
