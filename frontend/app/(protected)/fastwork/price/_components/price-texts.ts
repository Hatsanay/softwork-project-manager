// ข้อความคัดลอกไปวางในแชต/ข้อเสนอ Fastwork (ตัวคิดราคา · 2026-10-25 S-5 · ปรับหน้า 2026-10-30)
import { formatAmount } from "@/lib/shared/money.mjs";
import { numberRangeText, OTHER_OPTION, YES_NO_VALUES } from "@/lib/shared/requirement-answers.mjs";
import type { RequirementGroup, RequirementQuestion } from "@/app/order/_types";

const ANSWER_HINT: Partial<Record<RequirementQuestion["rqq_type"], string>> = {
    yes_no: "ใช่/ไม่ใช่",
    file: "ส่งไฟล์ในแชต",
    date: "วันที่",
    number: "ตัวเลข",
    url: "ลิงก์",
    multi: "เลือกได้หลายข้อ",
};

/**
 * คำถามเป็นข้อความสำหรับวางในแชต Fastwork · ข้อลูกขึ้นทุกข้อพร้อมเงื่อนไข "(ถ้าข้อ 3 ตอบว่า มีแล้ว)" (ยังไม่รู้คำตอบ)
 * ตัวเลือก "อื่นๆ (ระบุ)" · ตัวเลขบอกช่วง/หน่วย · ไฟล์บอกให้ส่งในแชต
 */
export function questionsText(groups: RequirementGroup[]) {
    const parts = ["รบกวนตอบคำถามเหล่านี้เพื่อประเมินงานครับ"];
    const numberById = new Map<number, number>();
    for (const group of groups) {
        parts.push("", `[${group.rqg_name}]`);
        for (const question of group.questions) {
            const number = numberById.size + 1;
            numberById.set(question.rqq_id, number);
            const parent = question.rqq_parent_id
                ? group.questions.find((row) => row.rqq_id === question.rqq_parent_id)
                : undefined;
            const condition = parent
                ? `(ถ้าข้อ ${numberById.get(parent.rqq_id)} ตอบว่า ${conditionLabels(parent, question.rqq_parent_values)}) `
                : "";
            const hint = [
                ANSWER_HINT[question.rqq_type],
                choicesText(question),
                numberRangeText(question).trim() || null,
            ]
                .filter(Boolean)
                .join(" · ");
            parts.push(`${parent ? "   " : ""}${number}. ${condition}${question.rqq_text}${hint ? ` (${hint})` : ""}`);
        }
    }
    return parts.join("\n");
}

/**
 * รายละเอียดข้อเสนอสำหรับวางในช่องรายละเอียดของข้อเสนอบน Fastwork: รายการ (ชุด = รายการในชุด) + ราคาเสนอ
 * ไม่ใส่ค่าธรรมเนียม/เงินเข้าจริง (ข้อมูลภายใน ผู้ซื้อไม่ต้องเห็น)
 * @param lines แถวในตะกร้า · packageItems = รายการในชุด (ว่าง = สินค้าเดี่ยว)
 * @param offer ราคาเสนอ (ข้อความทศนิยม 2 ตำแหน่ง)
 */
export function offerText(
    lines: { name: string; quantity: number; unit: string | null; packageItems: string[] }[],
    offer: string,
) {
    const parts = ["ขอบเขตงาน"];
    for (const line of lines) {
        const quantity = line.quantity > 1 ? ` × ${line.quantity}${line.unit ? ` ${line.unit}` : ""}` : "";
        parts.push(`- ${line.name}${quantity}`);
        for (const item of line.packageItems) parts.push(`   · ${item}`);
    }
    parts.push("", `ราคารวม ${formatAmount(offer)} บาท`);
    return parts.join("\n");
}

function choicesText(question: RequirementQuestion) {
    if (!question.rqq_options?.length) return null;
    const choices = question.rqq_allow_other
        ? [...question.rqq_options, `${OTHER_OPTION} (ระบุ)`]
        : question.rqq_options;
    return `ตัวเลือก: ${choices.join(" / ")}`;
}

function conditionLabels(parent: RequirementQuestion, values: string[]) {
    const labels = values.map((value) =>
        parent.rqq_type === "yes_no" ? YES_NO_VALUES[value as keyof typeof YES_NO_VALUES] : value,
    );
    return labels.join(" หรือ ");
}
