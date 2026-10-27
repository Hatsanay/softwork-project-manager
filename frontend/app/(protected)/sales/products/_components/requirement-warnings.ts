// คำเตือนของแท็บคำถามลูกค้า (2026-10-26 Q-2 · docs/plans/2026-10-26-customer-questions.md ข้อ 4.4)
// ระบบตรวจให้ คนตั้งไม่ต้องจำกติกา · เตือนอย่างเดียว ไม่บล็อกการบันทึก
// ที่มา: เคสลิงก์ 323JYPCE (26 ต.ค.) ผูกหมวดที่ไม่มีสินค้าบนหน้าร้าน ลูกค้าเลยไม่เห็นอะไร · คำถามซ้ำในข้อมูลจริง
import { choiceValuesOf } from "@/lib/shared/requirement-answers.mjs";
import type { RequirementGroup, RequirementQuestion } from "@/app/order/_types";
import type { ProductCategory } from "../_types";
import type { LinkableItems } from "./requirement-labels";

export type GroupWarnings = {
    group: string[];
    // รหัสคำถาม → คำเตือนของข้อนั้น
    questions: Map<number, string[]>;
};

// ข้อที่น่าจะถามช่องทางติดต่อนอกแพลตฟอร์ม (กติกา Fastwork) · เดาจากคำ อาจเตือนผิด จึงเตือนอย่างเดียว
const CONTACT_WORDS = /(line|ไลน์|เบอร์|โทร|อีเมล|e-?mail|facebook|เฟซบุ๊ก|instagram|ไอจี|ช่องทาง.*ติดต่อ|ติดต่อกลับ)/i;

/**
 * คำเตือนของทุกกลุ่ม (คีย์ = รหัสกลุ่ม)
 * @param groups กลุ่มทั้งหมด (รวมที่ปิดใช้งาน)
 */
export function questionnaireWarnings(groups: RequirementGroup[], categories: ProductCategory[], items: LinkableItems) {
    const duplicateIds = duplicateQuestionIds(groups);
    const result = new Map<number, GroupWarnings>();
    for (const group of groups) {
        const questionWarnings = new Map<number, string[]>();
        for (const question of group.questions) {
            const warnings = warningsOfQuestion(question, group, duplicateIds);
            if (warnings.length > 0) questionWarnings.set(question.rqq_id, warnings);
        }
        result.set(group.rqg_id, { group: warningsOfGroup(group, categories, items), questions: questionWarnings });
    }
    return result;
}

/** จำนวนคำเตือนทั้งหมดของกลุ่ม (ใช้กับตัวกรอง "มีคำเตือน") */
export function warningCount(warnings: GroupWarnings | undefined) {
    if (!warnings) return 0;
    let total = warnings.group.length;
    for (const list of warnings.questions.values()) total += list.length;
    return total;
}

function warningsOfGroup(group: RequirementGroup, categories: ProductCategory[], items: LinkableItems) {
    const warnings: string[] = [];
    if (group.rqg_status === "inactive") return warnings;
    const activeQuestions = group.questions.filter((question) => question.rqq_status === "active");
    if (activeQuestions.length === 0) warnings.push("ยังไม่มีคำถามที่ใช้งาน ลูกค้าจะไม่เห็นกลุ่มนี้");
    if (group.rqg_trigger !== "selection") return warnings;

    for (const categoryId of group.category_ids) {
        const name = categories.find((category) => category.pc_id === categoryId)?.pc_name ?? "หมวดที่ถูกลบ";
        const hasPublicItem =
            items.products.some(
                (product) => product.product_category_id === categoryId && Boolean(product.product_is_public),
            ) ||
            items.packages.some(
                (row) =>
                    row.pkg_category_id === categoryId && row.pkg_status === "active" && Boolean(row.pkg_is_public),
            );
        if (!hasPublicItem) {
            warnings.push(
                `หมวด "${name}" ไม่มีสินค้าหรือชุดที่แสดงบนหน้าร้าน ลูกค้าเห็นกลุ่มนี้เฉพาะเมื่อทีมงานเลือกรายการในหมวดนี้ให้ในลิงก์`,
            );
        }
    }
    for (const packageId of group.package_ids) {
        const row = items.packages.find((item) => item.pkg_id === packageId);
        if (!row || row.pkg_status !== "active") warnings.push(`ชุด "${row?.pkg_name ?? "ที่ถูกลบ"}" ปิดใช้งานแล้ว`);
        else if (!row.pkg_is_public)
            warnings.push(
                `ชุด "${row.pkg_name}" ไม่ได้แสดงบนหน้าร้าน ลูกค้าเห็นกลุ่มนี้เฉพาะเมื่อทีมงานเลือกชุดนี้ให้ในลิงก์`,
            );
    }
    for (const productId of group.product_ids) {
        const product = items.products.find((item) => item.product_id === productId);
        if (!product) warnings.push("มีสินค้าที่ผูกไว้ถูกปิดใช้งานหรือลบแล้ว");
        else if (!product.product_is_public) {
            warnings.push(
                `สินค้า "${product.product_name}" ไม่ได้แสดงบนหน้าร้าน ลูกค้าเห็นกลุ่มนี้เฉพาะเมื่อทีมงานเลือกสินค้านี้ให้ในลิงก์`,
            );
        }
    }
    return warnings;
}

function warningsOfQuestion(question: RequirementQuestion, group: RequirementGroup, duplicateIds: Set<number>) {
    const warnings: string[] = [];
    if (question.rqq_status === "inactive" || group.rqg_status === "inactive") return warnings;
    if (duplicateIds.has(question.rqq_id)) {
        warnings.push("คล้ายกับข้ออื่น (ข้อความเดียวกันหรือข้อหนึ่งอยู่ในอีกข้อ) ลูกค้าที่เห็นทั้งสองข้ออาจถูกถามซ้ำ");
    }
    if (question.rqq_parent_id) {
        const parent = group.questions.find((row) => row.rqq_id === question.rqq_parent_id);
        if (!parent || parent.rqq_status === "inactive")
            warnings.push("ข้อด้านบนที่เป็นเงื่อนไขปิดใช้งานอยู่ ข้อนี้จะไม่ขึ้นเลย");
        else if (!question.rqq_parent_values.some((value) => choiceValuesOf(parent).includes(value))) {
            warnings.push("คำตอบที่ตั้งเป็นเงื่อนไขไม่มีในตัวเลือกของข้อด้านบนแล้ว ข้อนี้จะไม่ขึ้นเลย");
        }
    }
    const audience = question.rqq_audience === "group" ? group.rqg_audience : question.rqq_audience;
    if (audience !== "direct" && CONTACT_WORDS.test(question.rqq_text)) {
        warnings.push(
            'ข้อนี้ขึ้นในลิงก์ Fastwork ด้วย ถ้าถามช่องทางติดต่อของลูกค้า ให้ตั้งเป็น "เฉพาะลิงก์ลูกค้าตรง" (ถามเรื่องเนื้อหาเว็บ ไม่ต้องแก้)',
        );
    }
    return warnings;
}

// ข้อความสั้นกว่านี้ไม่เทียบแบบ "อยู่ในอีกข้อ" (คำสั้นๆ อย่าง "อื่นๆ" ซ้ำได้ทั่วไป)
const MIN_CONTAINED_LENGTH = 8;

/** ข้อที่ซ้ำหรือคล้ายข้ออื่น: ข้อความเดียวกัน หรือข้อความหนึ่งอยู่ในอีกข้อ (เทียบเฉพาะข้อที่ใช้งาน) */
function duplicateQuestionIds(groups: RequirementGroup[]) {
    const active = groups
        .filter((group) => group.rqg_status === "active")
        .flatMap((group) => group.questions.filter((question) => question.rqq_status === "active"))
        .map((question) => ({ id: question.rqq_id, text: normalizedText(question.rqq_text) }));
    const ids = new Set<number>();
    for (const [index, first] of active.entries()) {
        for (const second of active.slice(index + 1)) {
            if (!isSimilar(first.text, second.text)) continue;
            ids.add(first.id);
            ids.add(second.id);
        }
    }
    return ids;
}

function isSimilar(first: string, second: string) {
    if (first === second) return true;
    const [shorter, longer] = first.length <= second.length ? [first, second] : [second, first];
    return shorter.length >= MIN_CONTAINED_LENGTH && longer.includes(shorter);
}

/** ข้อความสำหรับเทียบซ้ำ: ตัดวงเล็บท้าย (ถ้ามี) ช่องว่าง และตัวพิมพ์ใหญ่ */
function normalizedText(text: string) {
    return text
        .replace(/\(.*?\)/g, "")
        .replace(/\s+/g, "")
        .toLowerCase();
}
