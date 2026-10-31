// ─── สร้างโปรเจกต์ (zod) ─────────────────────────────────────────────────────────
//
// ต้นฉบับอยู่ที่ backend/src/shared/ — สำเนาใน frontend/lib/shared/ สร้างด้วย `npm run sync-shared` ห้ามแก้ที่สำเนา
// งานจากสินค้าที่เลือก (2026-10-31 · docs/plans/2026-10-31-project-tasks-from-catalog.md)
// หัวข้อ = งานหลัก · รายการ = งานย่อยใต้หัวข้อล่าสุด (รายการก่อนหัวข้อแรก = งานหลัก) ตามกติกาของ insertTasksFromRows

import { z } from "zod";
import { requiredText } from "./common.mjs";

export const MAX_CATALOG_TASKS = 200;

export const catalogTaskSchema = z.object({
    type: z.enum(["heading", "item"], { error: "ชนิดงานไม่ถูกต้อง" }),
    description: requiredText("ชื่องาน", 500),
});

/** งานที่สร้างพร้อมโปรเจกต์/งวด · ไม่ส่ง = ไม่สร้างงาน */
export const catalogTasksField = z
    .array(catalogTaskSchema)
    .max(MAX_CATALOG_TASKS, `งานได้ไม่เกิน ${MAX_CATALOG_TASKS} รายการ`)
    .default([]);

/** ส่วนงานของหน้าสร้างโปรเจกต์ (ช่องอื่นยังตรวจใน project.controller แบบเดิม) */
export const projectCreateTasksSchema = z.object({
    tasks: catalogTasksField,
});
