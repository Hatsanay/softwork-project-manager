// ประโยค "ใครเห็น" ของกลุ่มและคำถามลูกค้า (2026-10-26 Q-1 · แบบข้อ 2.3: ทุกเงื่อนไขอ่านเป็นประโยค ไม่ต้องเดาจากช่องติ๊ก)
// ใช้ทั้งการ์ดกลุ่มในแท็บคำถามและแผ่นแก้กลุ่ม
import { AUDIENCE_LABEL, GROUP_TRIGGER_LABEL, YES_NO_VALUES } from "@/lib/shared/requirement-answers.mjs";
import type { RequirementGroup, RequirementQuestion } from "@/app/order/_types";

// สินค้าและชุดที่เลือกคำถามได้ · is_public = แสดงบนหน้าร้าน (MySQL ส่ง 0/1) ใช้เตือนกลุ่มที่ลูกค้าไม่มีทางเห็นเอง
export type LinkableItems = {
    packages: {
        pkg_id: string;
        pkg_name: string;
        pkg_status: "active" | "inactive";
        pkg_category_id: string | null;
        pkg_is_public: number | boolean;
    }[];
    products: {
        product_id: string;
        product_name: string;
        product_category_id: string | null;
        product_is_public: number | boolean;
    }[];
};

/** เช่น "เมื่อลูกค้าเลือก จดโดเมน, เว็บธุรกิจ · ลิงก์ทุกแบบ" · ถามตามสินค้าที่เลือก = รวมรายการที่เลือกข้อแม่ในกลุ่มนี้ */
export function groupAudienceText(group: RequirementGroup, items: LinkableItems) {
    const audience = AUDIENCE_LABEL[group.rqg_audience];
    if (group.rqg_trigger !== "selection") return `${GROUP_TRIGGER_LABEL[group.rqg_trigger]} · ${audience}`;
    const topQuestions = group.questions.filter((question) => !question.rqq_parent_id);
    const names = itemNames(
        topQuestions.flatMap((question) => question.product_ids),
        topQuestions.flatMap((question) => question.package_ids),
        items,
    );
    if (names.length === 0) return "ยังไม่มีสินค้าหรือชุดเลือกคำถามในกลุ่มนี้ (ลูกค้ายังไม่เห็น)";
    return `เมื่อลูกค้าเลือก ${shortList(names)} · ${audience}`;
}

/**
 * สินค้า/ชุดที่เลือกข้อนี้ เช่น "ถามเมื่อเลือก: จดโดเมน, แพ็กเว็บธุรกิจ" · เฉพาะข้อแม่ของกลุ่มถามตามสินค้าที่เลือก
 * ชุดที่ได้ข้อนี้จากสินค้าในชุด ไม่แสดงซ้ำ (ลูกค้าเห็นแน่เมื่อเลือกชุดนั้น)
 */
export function questionItemsText(question: RequirementQuestion, group: RequirementGroup, items: LinkableItems) {
    if (group.rqg_trigger !== "selection" || question.rqq_parent_id) return null;
    const names = itemNames(question.product_ids, question.package_ids, items);
    return names.length > 0 ? `ถามเมื่อเลือก: ${shortList(names)}` : "ยังไม่มีสินค้าหรือชุดเลือกข้อนี้";
}

// รายชื่อยาวเกินไปอ่านไม่ไหวบนมือถือ · ดูครบได้ที่แผงคำถามของแต่ละสินค้า/ชุด
const MAX_LISTED_NAMES = 4;

function shortList(names: string[]) {
    if (names.length <= MAX_LISTED_NAMES) return names.join(", ");
    return `${names.slice(0, MAX_LISTED_NAMES).join(", ")} และอีก ${names.length - MAX_LISTED_NAMES} รายการ`;
}

function itemNames(productIds: string[], packageIds: string[], items: LinkableItems) {
    const productNames = [...new Set(productIds)].map(
        (id) => items.products.find((row) => row.product_id === id)?.product_name ?? "สินค้าที่ปิดใช้งานอยู่",
    );
    const packageNames = [...new Set(packageIds)].map(
        (id) => items.packages.find((row) => row.pkg_id === id)?.pkg_name ?? "ชุดที่ถูกลบ",
    );
    return [...new Set([...productNames, ...packageNames])];
}

/** เงื่อนไขของคำถาม เช่น `ถามเมื่อข้อ 1 ตอบว่า มีแล้ว · เฉพาะลิงก์ลูกค้าตรง` · ไม่มีเงื่อนไข = null */
export function questionConditionText(question: RequirementQuestion, questions: RequirementQuestion[]) {
    const parts: string[] = [];
    if (question.rqq_parent_id) {
        const parentIndex = questions.findIndex((row) => row.rqq_id === question.rqq_parent_id);
        const parent = questions[parentIndex];
        if (parent) {
            const values = question.rqq_parent_values.map((value) =>
                parent.rqq_type === "yes_no" ? YES_NO_VALUES[value as keyof typeof YES_NO_VALUES] : value,
            );
            parts.push(`ถามเมื่อข้อ ${parentIndex + 1} ตอบว่า ${values.join(" หรือ ")}`);
        }
    }
    if (question.rqq_audience !== "group") parts.push(AUDIENCE_LABEL[question.rqq_audience]);
    if (question.rqq_skip_when_preset) parts.push("ไม่ถามเมื่อทีมงานเลือกรายการให้แล้ว");
    if (question.rqq_prefill) parts.push("ลูกค้าเดิมเติมคำตอบเดิมให้");
    return parts.length > 0 ? parts.join(" · ") : null;
}
