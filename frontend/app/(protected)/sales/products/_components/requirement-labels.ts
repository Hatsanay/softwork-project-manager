// ประโยค "ใครเห็น" ของกลุ่มและคำถามลูกค้า (2026-10-26 Q-1 · แบบข้อ 2.3: ทุกเงื่อนไขอ่านเป็นประโยค ไม่ต้องเดาจากช่องติ๊ก)
// ใช้ทั้งการ์ดกลุ่มในแท็บคำถามและแผ่นแก้กลุ่ม
import { AUDIENCE_LABEL, GROUP_TRIGGER_LABEL, YES_NO_VALUES } from "@/lib/shared/requirement-answers.mjs";
import type { RequirementGroup, RequirementQuestion } from "@/app/order/_types";
import type { ProductCategory } from "../_types";

// สินค้าและชุดที่ผูกกับกลุ่มได้ · is_public = แสดงบนหน้าร้าน (MySQL ส่ง 0/1) ใช้เตือนกลุ่มที่ลูกค้าไม่มีทางเห็นเอง
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

type GroupConditions = Pick<
    RequirementGroup,
    "rqg_trigger" | "rqg_audience" | "category_ids" | "package_ids" | "product_ids"
>;

/** เช่น "เมื่อเลือก หมวด แพ็กเกจเว็บไซต์ หรือ ชุด เว็บธุรกิจ · ลิงก์ทุกแบบ" */
export function groupAudienceText(group: GroupConditions, categories: ProductCategory[], items: LinkableItems) {
    const audience = AUDIENCE_LABEL[group.rqg_audience];
    if (group.rqg_trigger !== "selection") return `${GROUP_TRIGGER_LABEL[group.rqg_trigger]} · ${audience}`;
    const parts = [
        namesText(
            "หมวด",
            group.category_ids.map(
                (id) => categories.find((category) => category.pc_id === id)?.pc_name ?? "หมวดที่ถูกลบ",
            ),
        ),
        namesText(
            "ชุด",
            group.package_ids.map((id) => items.packages.find((row) => row.pkg_id === id)?.pkg_name ?? "ชุดที่ถูกลบ"),
        ),
        namesText(
            "สินค้า",
            group.product_ids.map(
                (id) =>
                    items.products.find((row) => row.product_id === id)?.product_name ?? "สินค้าที่ถูกลบหรือปิดอยู่",
            ),
        ),
    ].filter(Boolean);
    if (parts.length === 0) return "ยังไม่ได้เลือกหมวด ชุด หรือสินค้า (ลูกค้ายังไม่เห็น)";
    return `เมื่อลูกค้าเลือก ${parts.join(" หรือ ")} · ${audience}`;
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

function namesText(label: string, names: string[]) {
    return names.length > 0 ? `${label} ${names.join(", ")}` : null;
}
