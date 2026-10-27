// ตรวจข้อมูลลิงก์เลือกบริการและคำขอที่ลูกค้าส่ง (2026-10-25 · docs/plans/2026-10-25-client-order-link.md)
// ต้นฉบับอยู่ที่ backend/src/shared/ — สำเนาใน frontend/lib/shared/ สร้างด้วย `npm run sync-shared` ห้ามแก้ที่สำเนา
import { z } from "zod";
import { integerInRange, optionalDate, optionalEmail, optionalText, requiredText } from "./common.mjs";

export const MAX_CART_LINES = 50;
export const MAX_SET_COUNT = 999;
// ลิงก์เฉพาะลูกค้า/Fastwork หมดอายุเริ่มต้น (วัน)
export const DEFAULT_LINK_DAYS = 30;

const optionalId = z
    .string()
    .trim()
    .nullish()
    .transform((value) => (value ? value : null));

const categoryIds = z.array(z.string().trim().min(1)).max(100, "เลือกหมวดได้ไม่เกิน 100 หมวด").default([]);

export const MAX_PRESET_ITEMS = 20;

/** รายการที่ทีมเลือกให้ในลิงก์ (ล็อก · ลูกค้าเอาออก/แก้จำนวนไม่ได้ · ราคาปัจจุบันของสินค้า/ชุด) */
const presetItems = z
    .array(
        z.object({
            kind: z.enum(["product", "package"], { error: "เลือกสินค้าหรือชุดบริการ" }),
            id: requiredText("รายการ", 18),
            quantity: integerInRange("จำนวน", 1, MAX_SET_COUNT),
        }),
    )
    .max(MAX_PRESET_ITEMS, `เลือกให้ได้ไม่เกิน ${MAX_PRESET_ITEMS} รายการ`)
    .default([])
    .superRefine((items, context) => {
        const keys = items.map((item) => `${item.kind}:${item.id}`);
        if (new Set(keys).size !== keys.length) context.addIssue({ code: "custom", message: "มีรายการซ้ำ รวมเป็นแถวเดียวแล้วแก้จำนวนแทน" });
    });

/**
 * กลุ่มคำถามรายลิงก์ (2026-10-26 Q-3 · docs/plans/2026-10-26-customer-questions.md ข้อ 4.7)
 * include = ถามเพิ่ม (กลุ่มไหนก็ได้ รวมกลุ่มที่ไม่ถามเอง) · exclude = ไม่ถามในลิงก์นี้ (ชนะทุกเงื่อนไข) · กลุ่มเดียวอยู่ทั้งสองฝั่งไม่ได้
 */
const groupIdList = z.array(z.number().int().positive()).max(100, "เลือกกลุ่มได้ไม่เกิน 100 กลุ่ม").default([]);
const questionRules = z
    .object({ include_group_ids: groupIdList, exclude_group_ids: groupIdList })
    .default({ include_group_ids: [], exclude_group_ids: [] })
    .superRefine((rules, context) => {
        if (rules.include_group_ids.some((id) => rules.exclude_group_ids.includes(id))) {
            context.addIssue({ code: "custom", message: "กลุ่มเดียวกันตั้งทั้งถามเพิ่มและไม่ถามไม่ได้" });
        }
    })
    .transform((rules) => ({
        include_group_ids: [...new Set(rules.include_group_ids)],
        exclude_group_ids: [...new Set(rules.exclude_group_ids)],
    }));

/** ไม่ให้ลูกค้าเลือกเพิ่ม = ต้องมีรายการที่ทีมเลือกให้ (ไม่งั้นลิงก์ไม่มีอะไรให้ส่ง) */
function requirePresetWhenLocked(link, context) {
    if (!link.ol_allow_more && link.preset_items.length === 0) {
        context.addIssue({ code: "custom", path: ["preset_items"], message: "เลือกรายการให้ลูกค้าอย่างน้อย 1 รายการ หรือเปิดให้ลูกค้าเลือกเพิ่มเอง" });
    }
}

/** สร้างลิงก์ · personal ไม่มีลูกค้า = ลูกค้าใหม่ · fastwork ต้องมีชื่อผู้ซื้อหรืองานเดิม */
export const orderLinkSchema = z
    .object({
        ol_kind: z.enum(["personal", "public", "fastwork"], { error: "เลือกชนิดลิงก์" }),
        ol_name: optionalText("ชื่อเรียกลิงก์", 150),
        ol_client_id: optionalId,
        ol_project_id: optionalId,
        ol_buyer_name: optionalText("ชื่อผู้ซื้อบน Fastwork", 100),
        ol_assignee_id: requiredText("ผู้รับคำขอ", 18),
        ol_expires_on: optionalDate("วันหมดอายุ"),
        category_ids: categoryIds,
        preset_items: presetItems,
        ol_allow_more: z.boolean().default(true),
        question_rules: questionRules,
    })
    .superRefine((link, context) => {
        requirePresetWhenLocked(link, context);
        if (link.ol_kind === "fastwork" && !link.ol_buyer_name && !link.ol_project_id) {
            context.addIssue({ code: "custom", path: ["ol_buyer_name"], message: "กรอกชื่อผู้ซื้อที่แสดงบน Fastwork" });
        }
        if (link.ol_kind === "public" && !link.ol_name) {
            context.addIssue({ code: "custom", path: ["ol_name"], message: "ตั้งชื่อเรียกลิงก์ เช่น หน้าเว็บ เพจ Facebook" });
        }
    })
    .transform((link) => ({
        ...link,
        ol_client_id: link.ol_kind === "personal" ? link.ol_client_id : null,
        ol_project_id: link.ol_kind === "fastwork" ? link.ol_project_id : null,
        ol_buyer_name: link.ol_kind === "fastwork" ? link.ol_buyer_name : null,
    }));

/** แก้ลิงก์ (ชนิด/ลูกค้า/งาน เปลี่ยนไม่ได้) */
export const orderLinkUpdateSchema = z
    .object({
        ol_name: optionalText("ชื่อเรียกลิงก์", 150),
        ol_assignee_id: requiredText("ผู้รับคำขอ", 18),
        ol_expires_on: optionalDate("วันหมดอายุ"),
        ol_status: z.enum(["active", "disabled"], { error: "สถานะต้องเป็น เปิด หรือ ปิด" }),
        category_ids: categoryIds,
        preset_items: presetItems,
        ol_allow_more: z.boolean().default(true),
        question_rules: questionRules,
    })
    .superRefine(requirePresetWhenLocked);

/** ลูกค้ายอมรับใบเสนอราคาในลิงก์ (S-4) — พิมพ์ชื่อยืนยัน + ติ๊กยอมรับ */
export const orderAcceptSchema = z.object({
    name: requiredText("ชื่อผู้ยอมรับ", 150),
    agree: z.literal(true, { error: "ติ๊กยอมรับใบเสนอราคาก่อน" }),
});

export const serviceRequestSettingsSchema = z.object({
    cs_service_request_assignee_id: optionalId,
});

const phone = requiredText("เบอร์โทร", 30).refine((value) => /^[0-9+\-\s()]{9,30}$/.test(value), {
    message: "เบอร์โทรต้องเป็นตัวเลขอย่างน้อย 9 หลัก",
});

/** ข้อมูลติดต่อ (ลิงก์ลูกค้าตรง · ลิงก์ Fastwork ไม่ถาม) */
export const orderContactSchema = z
    .object({
        contact_name: requiredText("ชื่อผู้ติดต่อ", 150),
        contact_phone: phone,
        contact_email: optionalEmail(),
        contact_line: optionalText("LINE ID", 100),
        company_name: optionalText("ชื่อบริษัท/ร้าน", 200),
        wants_tax_invoice: z.boolean().default(false),
        tax_id: optionalText("เลขประจำตัวผู้เสียภาษี", 20),
        address: optionalText("ที่อยู่", 1000),
        consent: z.literal(true, { error: "กรุณายินยอมการเก็บข้อมูลก่อนส่ง" }),
    })
    .superRefine((contact, context) => {
        if (!contact.wants_tax_invoice) return;
        if (!contact.tax_id) context.addIssue({ code: "custom", path: ["tax_id"], message: "กรอกเลขประจำตัวผู้เสียภาษีสำหรับใบกำกับ" });
        if (!contact.address) context.addIssue({ code: "custom", path: ["address"], message: "กรอกที่อยู่สำหรับใบกำกับ" });
    });

const cartLineSchema = z.object({
    kind: z.enum(["product", "package"], { error: "รายการไม่ถูกต้อง" }),
    id: requiredText("รายการ", 18),
    quantity: integerInRange("จำนวน", 1, MAX_SET_COUNT),
});

/**
 * ส่งคำขอ · contact ตรวจแยกตามชนิดลิงก์ใน backend · seen_total = ยอดที่ลูกค้าเห็นตอนกดส่ง
 * items = สิ่งที่ลูกค้าเลือกเอง (ว่างได้ถ้าลิงก์มีรายการที่ทีมเลือกให้ · backend ตรวจว่ารวมแล้วต้องมีอย่างน้อย 1 รายการ)
 */
export const orderSubmitSchema = z.object({
    submit_key: z.string({ error: "กรุณาโหลดหน้าใหม่แล้วส่งอีกครั้ง" }).uuid("กรุณาโหลดหน้าใหม่แล้วส่งอีกครั้ง"),
    items: z.array(cartLineSchema).max(MAX_CART_LINES, `เลือกได้ไม่เกิน ${MAX_CART_LINES} รายการ`),
    contact: z.unknown().optional(),
    note: optionalText("ข้อความถึงทีมงาน", 2000),
    seen_total: z.string({ error: "กรุณาโหลดหน้าใหม่แล้วส่งอีกครั้ง" }),
    // คำตอบคำถามความต้องการ (S-2) — ตรวจตามชนิดคำถามใน backend (shared/requirement-answers.mjs) · ไฟล์ส่งแยกเป็น multipart file_<question_id>
    answers: z
        .array(
            z.object({
                question_id: z.number().int().positive(),
                value: z.union([z.string().max(5000), z.array(z.string().max(100)).max(50), z.null()]).optional(),
                // ข้อความใน "อื่นๆ (ระบุ)" (2026-10-26 Q-1) · ความยาวตรวจใน requirement-answers ให้ข้อความผิดอยู่ใต้คำถาม
                other_text: z.string().max(1000).nullish(),
            }),
        )
        .max(300)
        .default([]),
    // ข้อที่หน้าร้านแสดงตอนกดส่ง (Q-4) · มีข้อที่ต้องตอบนอกจากนี้ = ทีมงานเพิ่งปรับคำถาม → QUESTIONNAIRE_CHANGED (ไม่ส่งมา = ไม่ตรวจ)
    seen_question_ids: z.array(z.number().int().positive()).max(300).optional(),
    // ช่องดักบอท (ซ่อนจากคน) — มีค่า = ไม่ใช่คน
    website: z.string().optional(),
});
