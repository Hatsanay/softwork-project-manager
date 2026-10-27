// ตรวจข้อมูลชุดคำถามความต้องการ (2026-10-25 · S-2 · เงื่อนไขการถาม 2026-10-26 Q-1) — หน้าตั้งค่าและ backend ใช้ร่วมกัน
// ต้นฉบับอยู่ที่ backend/src/shared/ — สำเนาใน frontend/lib/shared/ สร้างด้วย `npm run sync-shared` ห้ามแก้ที่สำเนา
// กติกาที่ต้องดูฐานข้อมูล (ข้อแม่อยู่กลุ่มเดียวกันและอยู่ด้านบน · ตัวเลือกที่ข้อลูกใช้อยู่) ตรวจใน requirement.service
import { z } from "zod";
import { activeStatus, decimalText, integerInRange, optionalText, requiredText } from "./common.mjs";
import {
    FILE_KINDS,
    GROUP_AUDIENCES,
    GROUP_TRIGGERS,
    OTHER_OPTION,
    QUESTION_AUDIENCES,
    QUESTION_TYPES,
} from "../requirement-answers.mjs";

export const MAX_OPTIONS = 20;
const MAX_LINKED_ITEMS = 100;
const MAX_NUMBER_LIMIT = "999999999.99";

const idList = (label) =>
    z
        .array(z.string().trim().min(1))
        .max(MAX_LINKED_ITEMS, `เลือก${label}ได้ไม่เกิน ${MAX_LINKED_ITEMS} รายการ`)
        .default([]);

export const requirementGroupSchema = z
    .object({
        rqg_name: requiredText("ชื่อกลุ่ม", 100),
        // ลูกค้าเห็นใต้ชื่อกลุ่ม: บอกว่าทำไมถาม
        rqg_customer_intro: optionalText("คำอธิบายสำหรับลูกค้า", 300),
        // โน้ตภายใน ลูกค้าไม่เห็น
        rqg_description: optionalText("โน้ตภายใน", 500),
        rqg_trigger: z.enum(GROUP_TRIGGERS, { error: "เลือกว่าจะถามกลุ่มนี้เมื่อไหร่" }),
        rqg_audience: z.enum(GROUP_AUDIENCES, { error: "เลือกชนิดลิงก์ที่ถาม" }).default("all"),
        rqg_sort_order: integerInRange("ลำดับ", 0, 9999).default(0),
        rqg_status: activeStatus,
        category_ids: idList("หมวด"),
        package_ids: idList("ชุด"),
        product_ids: idList("สินค้า"),
    })
    .superRefine((group, context) => {
        const linkedCount = group.category_ids.length + group.package_ids.length + group.product_ids.length;
        if (group.rqg_trigger === "selection" && linkedCount === 0) {
            context.addIssue({
                code: "custom",
                path: ["category_ids"],
                message: 'เลือกหมวด ชุด หรือสินค้าอย่างน้อย 1 รายการ หรือเปลี่ยนเป็น "ถามทุกคำขอ" / "ไม่ถามเอง"',
            });
        }
    })
    // ไม่ได้ถามตามที่ลูกค้าเลือก = ไม่เก็บรายการที่ผูก (กันเข้าใจผิดว่ายังผูกอยู่)
    .transform((group) =>
        group.rqg_trigger === "selection" ? group : { ...group, category_ids: [], package_ids: [], product_ids: [] },
    );

export const requirementQuestionSchema = z
    .object({
        rqq_text: requiredText("คำถาม", 300),
        rqq_help: optionalText("ข้อความช่วย", 300),
        rqq_placeholder: optionalText("ตัวอย่างในช่อง", 150),
        rqq_type: z.enum(QUESTION_TYPES, { error: "เลือกชนิดคำตอบ" }),
        rqq_options: z
            .array(z.string().trim().min(1).max(100, "ตัวเลือกยาวได้ไม่เกิน 100 ตัวอักษร"))
            .max(MAX_OPTIONS, `ตัวเลือกได้ไม่เกิน ${MAX_OPTIONS} ข้อ`)
            .default([]),
        rqq_allow_other: z.boolean().default(false),
        rqq_unit: optionalText("หน่วย", 30),
        rqq_min: decimalText("ค่าต่ำสุด", { maximum: MAX_NUMBER_LIMIT })
            .nullish()
            .transform((value) => value ?? null),
        rqq_max: decimalText("ค่าสูงสุด", { maximum: MAX_NUMBER_LIMIT })
            .nullish()
            .transform((value) => value ?? null),
        rqq_future_only: z.boolean().default(false),
        rqq_file_kind: z.enum(FILE_KINDS, { error: "เลือกชนิดไฟล์ที่รับ" }).default("document"),
        rqq_is_required: z.boolean().default(false),
        rqq_parent_id: z
            .number()
            .int()
            .positive()
            .nullish()
            .transform((value) => value ?? null),
        rqq_parent_values: z
            .array(z.string().trim().min(1).max(100))
            .max(MAX_OPTIONS + 1)
            .default([]),
        rqq_audience: z.enum(QUESTION_AUDIENCES, { error: "เลือกชนิดลิงก์ที่ถาม" }).default("group"),
        rqq_skip_when_preset: z.boolean().default(false),
        rqq_prefill: z.boolean().default(false),
        rqq_status: activeStatus,
    })
    .superRefine((question, context) => {
        const hasOptions = question.rqq_type === "single" || question.rqq_type === "multi";
        if (hasOptions && question.rqq_options.length < 2) {
            context.addIssue({
                code: "custom",
                path: ["rqq_options"],
                message: "ใส่ตัวเลือกอย่างน้อย 2 ข้อ (บรรทัดละข้อ)",
            });
        }
        if (new Set(question.rqq_options).size !== question.rqq_options.length) {
            context.addIssue({ code: "custom", path: ["rqq_options"], message: "มีตัวเลือกซ้ำ" });
        }
        if (hasOptions && question.rqq_allow_other && question.rqq_options.includes(OTHER_OPTION)) {
            context.addIssue({
                code: "custom",
                path: ["rqq_options"],
                message: `เอาตัวเลือก "${OTHER_OPTION}" ออก ระบบเพิ่ม "${OTHER_OPTION} (ระบุ)" ให้ท้ายรายการแล้ว`,
            });
        }
        const isNumber = question.rqq_type === "number";
        if (
            isNumber &&
            question.rqq_min !== null &&
            question.rqq_max !== null &&
            Number(question.rqq_min) > Number(question.rqq_max)
        ) {
            context.addIssue({ code: "custom", path: ["rqq_max"], message: "ค่าสูงสุดต้องไม่น้อยกว่าค่าต่ำสุด" });
        }
        if (question.rqq_parent_id !== null && question.rqq_parent_values.length === 0) {
            context.addIssue({
                code: "custom",
                path: ["rqq_parent_values"],
                message: "เลือกคำตอบของข้อด้านบนที่ทำให้ถามข้อนี้อย่างน้อย 1 ค่า",
            });
        }
    })
    // ค่าที่ไม่เกี่ยวกับชนิดคำตอบไม่ถูกเก็บ (เปลี่ยนชนิดแล้วค่าเก่าไม่ค้าง)
    .transform((question) => {
        const hasOptions = question.rqq_type === "single" || question.rqq_type === "multi";
        const isNumber = question.rqq_type === "number";
        return {
            ...question,
            rqq_options: hasOptions ? question.rqq_options : null,
            rqq_allow_other: hasOptions && question.rqq_allow_other,
            rqq_unit: isNumber ? question.rqq_unit : null,
            rqq_min: isNumber ? question.rqq_min : null,
            rqq_max: isNumber ? question.rqq_max : null,
            rqq_future_only: question.rqq_type === "date" && question.rqq_future_only,
            rqq_file_kind: question.rqq_type === "file" ? question.rqq_file_kind : "document",
            // ไฟล์เติมจากคำขอครั้งก่อนไม่ได้ (ข้อ 8 ของแบบ)
            rqq_prefill: question.rqq_type !== "file" && question.rqq_prefill,
            rqq_parent_values: question.rqq_parent_id === null ? [] : [...new Set(question.rqq_parent_values)],
        };
    });

export const questionOrderSchema = z.object({
    question_ids: z.array(z.number().int().positive()).max(200),
});

// เรียงกลุ่มทั้งหมด (Q-2) · ต้องส่งครบทุกกลุ่ม (ตรวจใน service)
export const groupOrderSchema = z.object({
    group_ids: z.array(z.number().int().positive()).max(500),
});

// ย้ายคำถามไปกลุ่มอื่น (Q-2) · ข้อลูกย้ายตาม
export const questionMoveSchema = z.object({
    group_id: z.number({ error: "เลือกกลุ่มที่จะย้ายไป" }).int().positive("เลือกกลุ่มที่จะย้ายไป"),
});
