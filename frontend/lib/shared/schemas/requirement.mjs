// ตรวจข้อมูลชุดคำถามความต้องการ (2026-10-25 · S-2) — หน้าตั้งค่าและ backend ใช้ร่วมกัน
// ต้นฉบับอยู่ที่ backend/src/shared/ — สำเนาใน frontend/lib/shared/ สร้างด้วย `npm run sync-shared` ห้ามแก้ที่สำเนา
import { z } from "zod";
import { activeStatus, integerInRange, optionalText, requiredText } from "./common.mjs";
import { QUESTION_TYPES } from "../requirement-answers.mjs";

export const MAX_OPTIONS = 20;

export const requirementGroupSchema = z.object({
    rqg_name: requiredText("ชื่อกลุ่ม", 100),
    rqg_description: optionalText("คำอธิบาย", 500),
    rqg_is_general: z.boolean().default(false),
    rqg_sort_order: integerInRange("ลำดับ", 0, 9999).default(0),
    rqg_status: activeStatus,
    category_ids: z.array(z.string().trim().min(1)).max(100, "เลือกหมวดได้ไม่เกิน 100 หมวด").default([]),
    // ถามเมื่อเลือกแพ็กเหล่านี้ (นอกจากหมวด) เช่น "ต้องการระบบไหน" เฉพาะแพ็กเว็บ + ระบบ (2026-10-25)
    package_ids: z.array(z.string().trim().min(1)).max(100, "เลือกแพ็กได้ไม่เกิน 100 แพ็ก").default([]),
});

export const requirementQuestionSchema = z
    .object({
        rqq_text: requiredText("คำถาม", 300),
        rqq_help: optionalText("ข้อความช่วย", 300),
        rqq_type: z.enum(QUESTION_TYPES, { error: "เลือกชนิดคำตอบ" }),
        rqq_options: z.array(z.string().trim().min(1).max(100, "ตัวเลือกยาวได้ไม่เกิน 100 ตัวอักษร")).max(MAX_OPTIONS, `ตัวเลือกได้ไม่เกิน ${MAX_OPTIONS} ข้อ`).default([]),
        rqq_is_required: z.boolean().default(false),
        rqq_status: activeStatus,
    })
    .superRefine((question, context) => {
        const needsOptions = question.rqq_type === "single" || question.rqq_type === "multi";
        if (needsOptions && question.rqq_options.length < 2) {
            context.addIssue({ code: "custom", path: ["rqq_options"], message: "ใส่ตัวเลือกอย่างน้อย 2 ข้อ (บรรทัดละข้อ)" });
        }
        if (new Set(question.rqq_options).size !== question.rqq_options.length) {
            context.addIssue({ code: "custom", path: ["rqq_options"], message: "มีตัวเลือกซ้ำ" });
        }
    })
    .transform((question) => ({
        ...question,
        rqq_options: question.rqq_type === "single" || question.rqq_type === "multi" ? question.rqq_options : null,
    }));

export const questionOrderSchema = z.object({
    question_ids: z.array(z.number().int().positive()).max(200),
});
