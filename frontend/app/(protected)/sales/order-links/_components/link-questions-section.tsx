"use client";

// คำถามที่ลิงก์นี้จะถาม (2026-10-26 Q-3 · docs/plans/2026-10-26-customer-questions.md ข้อ 4.7)
// กลุ่มที่ขึ้นตามรายการที่ทีมเลือกให้ (สวิตช์ "ไม่ถามในลิงก์นี้") · ถามกลุ่มเพิ่ม (กลุ่มไหนก็ได้ รวมที่ไม่ถามเอง)
// ลิงก์ที่ลูกค้าเลือกเพิ่มได้ ตั้ง "ไม่ถาม" กลุ่มที่อาจขึ้นตามที่ลูกค้าเลือกได้ด้วย · ดูมุมมองลูกค้าจากค่าในฟอร์มตอนนี้ (ยังไม่ต้องบันทึก)
import { useEffect, useState } from "react";
import { Eye, MessageSquareText, X } from "lucide-react";
import { inputClass } from "@/components/ui/form-field";
import FieldHint from "@/components/ui/guidance/field-hint";
import Switch from "@/components/ui/switch";
import { buttonClass } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { questionnaireSummary, visibleQuestionnaire } from "@/lib/shared/requirement-answers.mjs";
import type { RequirementGroup } from "@/app/order/_types";
import CustomerPreviewSheet from "../../products/_components/customer-preview-sheet";
import type { LinkableItems } from "../../products/_components/requirement-labels";
import {
    activeQuestionnaire,
    categoryIdsOf,
    type PreviewScenario,
} from "../../products/_components/requirement-scenario";
import type { ProductCategory } from "../../products/_types";
import type { OrderLinkKind } from "../_types";

export type QuestionRules = { include_group_ids: number[]; exclude_group_ids: number[] };

export default function LinkQuestionsSection({
    linkKind,
    presetItems,
    allowMore,
    rules,
    error,
    onChange,
}: {
    linkKind: OrderLinkKind;
    presetItems: { kind: "product" | "package"; id: string }[];
    allowMore: boolean;
    rules: QuestionRules;
    error?: string;
    onChange: (rules: QuestionRules) => void;
}) {
    const [groups, setGroups] = useState<RequirementGroup[] | null>(null);
    const [items, setItems] = useState<LinkableItems>({ packages: [], products: [] });
    const [categories, setCategories] = useState<ProductCategory[]>([]);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);

    useEffect(() => {
        let isClosed = false;
        Promise.all([
            apiFetch<{ data: RequirementGroup[] }>("/requirement-groups"),
            apiFetch<{ data: LinkableItems["packages"] }>("/product-packages"),
            apiFetch<{ data: LinkableItems["products"] }>("/products?limit=200&status=active"),
            apiFetch<{ data: ProductCategory[] }>("/product-categories"),
        ]).then(([groupResult, packageResult, productResult, categoryResult]) => {
            if (isClosed) return;
            setGroups(groupResult.data?.data ?? []);
            setItems({ packages: packageResult.data?.data ?? [], products: productResult.data?.data ?? [] });
            setCategories(categoryResult.data?.data ?? []);
        });
        return () => {
            isClosed = true;
        };
    }, []);

    if (!groups) return null;
    const active = activeQuestionnaire(groups);
    const scenario: PreviewScenario = {
        linkKind: linkKind === "fastwork" ? "fastwork" : "public",
        packageIds: presetItems.filter((item) => item.kind === "package").map((item) => item.id),
        productIds: presetItems.filter((item) => item.kind === "product").map((item) => item.id),
        hasPreset: presetItems.length > 0,
        includeGroupIds: rules.include_group_ids,
        excludeGroupIds: rules.exclude_group_ids,
    };
    const context = {
        linkKind: scenario.linkKind,
        categoryIds: categoryIdsOf(items, scenario.packageIds, scenario.productIds),
        packageIds: scenario.packageIds,
        productIds: scenario.productIds,
        hasPreset: scenario.hasPreset,
    };
    // กลุ่มที่ขึ้นเองตามรายการที่ทีมเลือกให้ (ก่อนตั้งค่ารายลิงก์) · ยังไม่รู้คำตอบ = นับข้อลูกด้วย
    const baseline = visibleQuestionnaire(active, context, null) as RequirementGroup[];
    const baselineIds = new Set(baseline.map((group) => group.rqg_id));
    const finalGroups = visibleQuestionnaire(
        active,
        { ...context, includeGroupIds: rules.include_group_ids, excludeGroupIds: rules.exclude_group_ids },
        null,
    );
    const summary = questionnaireSummary(finalGroups);
    const nameOf = (groupId: number) => groups.find((group) => group.rqg_id === groupId)?.rqg_name ?? "กลุ่มที่ถูกลบ";
    const includeChoices = active.filter(
        (group) => !baselineIds.has(group.rqg_id) && !rules.include_group_ids.includes(group.rqg_id),
    );
    const excludeChoices = active.filter(
        (group) =>
            group.rqg_trigger === "selection" &&
            !baselineIds.has(group.rqg_id) &&
            !rules.exclude_group_ids.includes(group.rqg_id),
    );
    const extraExcluded = rules.exclude_group_ids.filter((groupId) => !baselineIds.has(groupId));

    const without = (list: number[], groupId: number) => list.filter((id) => id !== groupId);
    function setExcluded(groupId: number, isExcluded: boolean) {
        onChange({
            include_group_ids: without(rules.include_group_ids, groupId),
            exclude_group_ids: isExcluded
                ? [...without(rules.exclude_group_ids, groupId), groupId]
                : without(rules.exclude_group_ids, groupId),
        });
    }
    function include(groupId: number) {
        onChange({
            include_group_ids: [...rules.include_group_ids, groupId],
            exclude_group_ids: without(rules.exclude_group_ids, groupId),
        });
    }

    return (
        <section className="grid gap-3 rounded-xl border border-gray-200 p-3" aria-labelledby="link-questions-title">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 id="link-questions-title" className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
                    <MessageSquareText size={15} className="text-blue-600" aria-hidden="true" />
                    คำถามที่ลิงก์นี้จะถาม
                </h3>
                <button type="button" className={buttonClass("secondary", "sm")} onClick={() => setIsPreviewOpen(true)}>
                    <Eye size={15} />
                    ดูมุมมองลูกค้า
                </button>
            </div>
            <p className="text-sm text-gray-700">
                {summary.questionCount === 0
                    ? "ตอนนี้ไม่มีคำถาม (ลูกค้าข้ามขั้นตอบคำถาม)"
                    : `${finalGroups.length} กลุ่ม ราว ${summary.questionCount} ข้อ (รวมข้อที่ถามตามคำตอบ)`}
                {allowMore ? " · ลูกค้าเลือกเพิ่มได้ อาจมีกลุ่มอื่นขึ้นตามที่เลือก" : ""}
            </p>

            {baseline.length > 0 && (
                <ul className="grid gap-1.5">
                    {baseline.map((group) => (
                        <li key={group.rqg_id} className="rounded-lg bg-gray-50 px-3 py-1">
                            <Switch
                                id={`link-group-${group.rqg_id}`}
                                label={group.rqg_name}
                                description={
                                    rules.exclude_group_ids.includes(group.rqg_id)
                                        ? "ไม่ถามในลิงก์นี้"
                                        : `ถาม ${group.questions.length} ข้อ`
                                }
                                checked={!rules.exclude_group_ids.includes(group.rqg_id)}
                                onChange={(checked) => setExcluded(group.rqg_id, !checked)}
                            />
                        </li>
                    ))}
                </ul>
            )}

            {rules.include_group_ids.length > 0 && (
                <RuleChips
                    label="ถามเพิ่มในลิงก์นี้"
                    groupIds={rules.include_group_ids}
                    nameOf={nameOf}
                    onRemove={(groupId) =>
                        onChange({ ...rules, include_group_ids: without(rules.include_group_ids, groupId) })
                    }
                />
            )}
            {extraExcluded.length > 0 && (
                <RuleChips
                    label="ไม่ถามแม้ลูกค้าเลือก"
                    groupIds={extraExcluded}
                    nameOf={nameOf}
                    onRemove={(groupId) => setExcluded(groupId, false)}
                />
            )}

            <div className="grid gap-2 sm:grid-cols-2">
                {includeChoices.length > 0 && (
                    <GroupPicker label="ถามกลุ่มเพิ่ม" choices={includeChoices} onPick={include} />
                )}
                {allowMore && excludeChoices.length > 0 && (
                    <GroupPicker
                        label="ไม่ถามกลุ่มที่อาจขึ้นตามที่ลูกค้าเลือก"
                        choices={excludeChoices}
                        onPick={(groupId) => setExcluded(groupId, true)}
                    />
                )}
            </div>
            <FieldHint error={error}>
                ถามเพิ่ม = เช่น ลูกค้าคนนี้ทำระบบงาน ถามกลุ่มระบบงานด้วย · ไม่ถาม = คุยกันแล้วในแชต ไม่ต้องถามซ้ำ
                (ชนะทุกเงื่อนไข)
            </FieldHint>

            {isPreviewOpen && (
                <CustomerPreviewSheet
                    groups={groups}
                    categories={categories}
                    items={items}
                    initial={scenario}
                    onClose={() => setIsPreviewOpen(false)}
                />
            )}
        </section>
    );
}

function RuleChips({
    label,
    groupIds,
    nameOf,
    onRemove,
}: {
    label: string;
    groupIds: number[];
    nameOf: (groupId: number) => string;
    onRemove: (groupId: number) => void;
}) {
    return (
        <div className="grid gap-1.5">
            <span className="text-xs text-gray-500">{label}</span>
            <div className="flex flex-wrap gap-2">
                {groupIds.map((groupId) => (
                    <span
                        key={groupId}
                        className="flex min-h-9 items-center gap-1 rounded-xl border border-blue-200 bg-blue-50 pl-3 text-sm text-blue-700"
                    >
                        {nameOf(groupId)}
                        <button
                            type="button"
                            aria-label={`เอา ${nameOf(groupId)} ออก`}
                            className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-blue-100"
                            onClick={() => onRemove(groupId)}
                        >
                            <X size={14} />
                        </button>
                    </span>
                ))}
            </div>
        </div>
    );
}

function GroupPicker({
    label,
    choices,
    onPick,
}: {
    label: string;
    choices: RequirementGroup[];
    onPick: (groupId: number) => void;
}) {
    return (
        <label className="grid gap-1.5 text-sm text-gray-800">
            {label}
            <select
                value=""
                onChange={(event) => event.target.value && onPick(Number(event.target.value))}
                className={inputClass(false)}
            >
                <option value="">+ เลือกกลุ่ม</option>
                {choices.map((group) => (
                    <option key={group.rqg_id} value={group.rqg_id}>
                        {group.rqg_name}
                    </option>
                ))}
            </select>
        </label>
    );
}
