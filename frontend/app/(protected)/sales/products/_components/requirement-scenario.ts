// สถานการณ์ของลูกค้าหนึ่งคน (2026-10-26 Q-3) — ใช้ร่วมกันระหว่าง "ดูมุมมองลูกค้า" และส่วนคำถามในฟอร์มลิงก์
// หน้าร้านได้กลุ่มแบบ activeOnly (requirement.service listGroups) จึงกรองแบบเดียวกันที่นี่ แล้วให้ visibleQuestionnaire ตัดสินต่อ
import type { RequirementGroup } from "@/app/order/_types";
import type { LinkableItems } from "./requirement-labels";

export type PreviewScenario = {
    linkKind: "public" | "fastwork";
    packageIds: string[];
    productIds: string[];
    hasPreset: boolean;
    includeGroupIds: number[];
    excludeGroupIds: number[];
};

/** ลิงก์ที่เลือกเป็นสถานการณ์ได้ (หน้าลิงก์ส่งมาเฉพาะช่องที่ใช้) */
export type ScenarioLink = {
    ol_id: number;
    ol_kind: "personal" | "public" | "fastwork";
    label: string;
    preset_items: { kind: "product" | "package"; id: string }[];
    question_rules: { include_group_ids: number[]; exclude_group_ids: number[] };
};

export const EMPTY_SCENARIO: PreviewScenario = {
    linkKind: "public",
    packageIds: [],
    productIds: [],
    hasPreset: false,
    includeGroupIds: [],
    excludeGroupIds: [],
};

/** เหมือนที่หน้าร้านได้รับ: เฉพาะกลุ่ม/คำถามที่ใช้งาน · กลุ่มที่ไม่มีคำถามใช้งานไม่ขึ้น */
export function activeQuestionnaire(groups: RequirementGroup[]) {
    return groups
        .filter((group) => group.rqg_status === "active")
        .map((group) => ({
            ...group,
            questions: group.questions.filter((question) => question.rqq_status === "active"),
        }))
        .filter((group) => group.questions.length > 0);
}

/** หมวดของชุดและสินค้าที่เลือก (หน้าร้านคิดหมวดจากรายการในตะกร้า) */
export function categoryIdsOf(items: LinkableItems, packageIds: string[], productIds: string[]) {
    return [
        ...items.packages.filter((row) => packageIds.includes(row.pkg_id)).map((row) => row.pkg_category_id),
        ...items.products.filter((row) => productIds.includes(row.product_id)).map((row) => row.product_category_id),
    ].filter((id): id is string => Boolean(id));
}

/** ลิงก์ → สถานการณ์ (รายการที่ทีมเลือกให้ = ล็อกแพ็ก) · ลิงก์เฉพาะลูกค้าถามแบบลิงก์ลูกค้าตรง */
export function scenarioOfLink(link: ScenarioLink): PreviewScenario {
    return {
        linkKind: link.ol_kind === "fastwork" ? "fastwork" : "public",
        packageIds: link.preset_items.filter((item) => item.kind === "package").map((item) => item.id),
        productIds: link.preset_items.filter((item) => item.kind === "product").map((item) => item.id),
        hasPreset: link.preset_items.length > 0,
        includeGroupIds: link.question_rules.include_group_ids,
        excludeGroupIds: link.question_rules.exclude_group_ids,
    };
}
