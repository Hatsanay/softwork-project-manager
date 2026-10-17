// ─── ตรวจข้อมูลบอร์ดงาน (zod) — ป้ายสีของโปรเจกต์ · ติดป้ายงาน · checklist · เรียงลำดับ ─────────────────────────
//
// ต้นฉบับอยู่ที่ backend/src/shared/ — สำเนาใน frontend/lib/shared/ สร้างด้วย `npm run sync-shared` ห้ามแก้ที่สำเนา
// แบบระบบ: docs/plans/2026-10-17-project-kanban.md หัวข้อ 2–2.1
// กติกาที่ต้องดูข้อมูลอื่น (ป้ายเป็นของโปรเจกต์นี้ไหม, รายการ id ตรงกับของจริงครบไหม, สิทธิ์) ตรวจใน backend

import { z } from "zod";
import { requiredText } from "./common.mjs";

export const TASK_STATUSES = ["todo", "in_progress", "review", "done"];

// ชุดสีแบบ Trello — ข้อยกเว้นของกติกาธีม เฉพาะป้ายบนบอร์ด (เจ้าของระบบเลือก 17 ต.ค. 2026 — K8)
// ลำดับ = ลำดับในตัวเลือกสี · ค่าสีจริงอยู่ที่หน้าเว็บที่เดียว (label-colors.ts)
export const LABEL_COLORS = ["green", "yellow", "orange", "red", "purple", "blue", "sky", "lime", "pink", "black"];

export const MAX_LABELS_PER_PROJECT = 30;
export const MAX_LABELS_PER_TASK = 10;
export const MAX_CHECKLIST_ITEMS_PER_TASK = 50;
const MAX_ORDERED_IDS = 500;

const idText = z.string({ error: "รหัสไม่ถูกต้อง" }).trim().min(1).max(18);
const positiveInteger = z.number({ error: "รหัสไม่ถูกต้อง" }).int().positive();

/** ป้ายของโปรเจกต์ (เพิ่ม/แก้) */
export const projectLabelSchema = z.object({
    pl_name: requiredText("ชื่อป้าย", 50),
    pl_color: z.enum(LABEL_COLORS, { error: "กรุณาเลือกสีป้าย" }),
});

/** ป้ายของงาน — แทนที่ทั้งชุด (ส่งรายการว่าง = เอาป้ายออกทั้งหมด) */
export const taskLabelsSchema = z.object({
    label_ids: z
        .array(positiveInteger, { error: "รายการป้ายไม่ถูกต้อง" })
        .max(MAX_LABELS_PER_TASK, `ติดป้ายได้ไม่เกิน ${MAX_LABELS_PER_TASK} ป้ายต่องาน`)
        .transform((ids) => [...new Set(ids)]),
});

/** ข้อ checklist (เพิ่ม/แก้ข้อความ) */
export const checklistItemSchema = z.object({
    tci_text: requiredText("ข้อความ", 200),
});

/** ติ๊ก/เอาติ๊กออก — ตั้งค่าตามที่ส่ง (ไม่สลับ) กดซ้ำได้ผลเหมือนเดิม */
export const checklistDoneSchema = z.object({
    tci_is_done: z.boolean({ error: "ค่าเสร็จ/ไม่เสร็จไม่ถูกต้อง" }),
});

/** เรียงลำดับข้อ checklist ทั้งงาน */
export const checklistOrderSchema = z.object({
    item_ids: z.array(positiveInteger).min(1).max(MAX_CHECKLIST_ITEMS_PER_TASK),
});

/**
 * เรียงลำดับการ์ดในคอลัมน์ — ส่งทุกการ์ดของคอลัมน์นั้นในระดับเดียวกัน (task หลัก หรือ subtask ใต้แม่เดียวกัน)
 * ไม่ครบ/เกิน = มีคนเปลี่ยนไปก่อน → backend ตอบ 409 ให้โหลดบอร์ดใหม่
 */
export const taskOrderSchema = z.object({
    task_status: z.enum(TASK_STATUSES, { error: "สถานะไม่ถูกต้อง" }),
    parent_task_id: idText.nullish().transform((value) => value ?? null),
    task_ids: z.array(idText).min(1).max(MAX_ORDERED_IDS),
});
