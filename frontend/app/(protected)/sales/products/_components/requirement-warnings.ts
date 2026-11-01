// คำเตือนของแท็บคำถามลูกค้า (2026-10-26 Q-2 · docs/plans/2026-10-26-customer-questions.md ข้อ 4.4)
// ระบบตรวจให้ คนตั้งไม่ต้องจำกติกา · เตือนอย่างเดียว ไม่บล็อกการบันทึก
// ที่มา: เคสลิงก์ 323JYPCE (26 ต.ค.) ผูกหมวดที่ไม่มีสินค้าบนหน้าร้าน ลูกค้าเลยไม่เห็นอะไร · คำถามซ้ำในข้อมูลจริง
// สินค้าเลือกคำถาม (2026-11-01): เตือนข้อที่ยังไม่มีสินค้า/ชุดเลือก และข้อที่มีแต่รายการที่ไม่แสดงบนหน้าร้าน
import { choiceValuesOf } from "@/lib/shared/requirement-answers.mjs";
import type { RequirementGroup, RequirementQuestion } from "@/app/order/_types";
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
export function questionnaireWarnings(groups: RequirementGroup[], items: LinkableItems) {
    const duplicateIds = duplicateQuestionIds(groups);
    const result = new Map<number, GroupWarnings>();
    for (const group of groups) {
        const questionWarnings = new Map<number, string[]>();
        for (const question of group.questions) {
            const warnings = warningsOfQuestion(question, group, duplicateIds, items);
            if (warnings.length > 0) questionWarnings.set(question.rqq_id, warnings);
        }
        result.set(group.rqg_id, { group: warningsOfGroup(group), questions: questionWarnings });
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

function warningsOfGroup(group: RequirementGroup) {
    const warnings: string[] = [];
    if (group.rqg_status === "inactive") return warnings;
    const activeQuestions = group.questions.filter((question) => question.rqq_status === "active");
    if (activeQuestions.length === 0) warnings.push("ยังไม่มีคำถามที่ใช้งาน ลูกค้าจะไม่เห็นกลุ่มนี้");
    if (group.rqg_trigger !== "selection") return warnings;
    const isPicked = activeQuestions.some((question) => !question.rqq_parent_id && isLinked(question));
    if (activeQuestions.length > 0 && !isPicked) {
        warnings.push("ยังไม่มีสินค้าหรือชุดเลือกคำถามในกลุ่มนี้ ลูกค้าจะไม่เห็น (เลือกได้ที่แผงคำถามในหน้าแก้สินค้าหรือชุด)");
    }
    return warnings;
}

function isLinked(question: RequirementQuestion) {
    return question.product_ids.length > 0 || question.package_ids.length > 0;
}

/** ข้อแม่ของกลุ่มถามตามสินค้าที่เลือก: ไม่มีใครเลือก / มีแต่รายการที่ไม่แสดงบนหน้าร้าน */
function selectionWarning(question: RequirementQuestion, group: RequirementGroup, items: LinkableItems) {
    if (group.rqg_trigger !== "selection" || question.rqq_parent_id) return null;
    // ทั้งกลุ่มยังไม่มีใครเลือก = เตือนครั้งเดียวที่กลุ่ม
    if (!isLinked(question)) {
        const isGroupPicked = group.questions.some((row) => !row.rqq_parent_id && isLinked(row));
        return isGroupPicked ? "ยังไม่มีสินค้าหรือชุดเลือกข้อนี้ ลูกค้าจะไม่เห็นข้อนี้" : null;
    }
    const hasPublicProduct = question.product_ids.some((id) =>
        items.products.some((product) => product.product_id === id && Boolean(product.product_is_public)),
    );
    const hasPublicPackage = [...question.package_ids, ...question.via_package_ids].some((id) =>
        items.packages.some((row) => row.pkg_id === id && row.pkg_status === "active" && Boolean(row.pkg_is_public)),
    );
    if (hasPublicProduct || hasPublicPackage) return null;
    return "สินค้าหรือชุดที่เลือกข้อนี้ไม่ได้แสดงบนหน้าร้าน (หรือปิดใช้งานอยู่) ลูกค้าเห็นข้อนี้เฉพาะเมื่อทีมงานเลือกรายการให้ในลิงก์";
}

function warningsOfQuestion(
    question: RequirementQuestion,
    group: RequirementGroup,
    duplicateIds: Set<number>,
    items: LinkableItems,
) {
    const warnings: string[] = [];
    if (question.rqq_status === "inactive" || group.rqg_status === "inactive") return warnings;
    const selection = selectionWarning(question, group, items);
    if (selection) warnings.push(selection);
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
