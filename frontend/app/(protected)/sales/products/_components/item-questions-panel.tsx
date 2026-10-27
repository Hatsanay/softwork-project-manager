"use client";

// คำถามที่ลูกค้าจะเห็นเมื่อเลือกรายการนี้ (2026-10-26 Q-2 · docs/plans/2026-10-26-customer-questions.md ข้อ 4.6)
// อยู่ในฟอร์มแก้สินค้า/ชุด: บอกกลุ่มที่ขึ้นพร้อมเหตุผล (ถามทุกคำขอ · ผูกหมวด · ผูกรายการนี้ตรง) + ปุ่มไปแก้ในแท็บคำถาม
// ไม่รวมเงื่อนไขของลิงก์และคำถามรายข้อ (ชนิดลิงก์ · ข้อลูก) ดูครบได้ที่ "ดูมุมมองลูกค้า" ในแท็บคำถาม
import { useEffect, useState } from "react";
import { MessageSquareText, Plus } from "lucide-react";
import FieldHint from "@/components/ui/guidance/field-hint";
import { buttonClass } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { AUDIENCE_LABEL } from "@/lib/shared/requirement-answers.mjs";
import type { RequirementGroup } from "@/app/order/_types";

export type QuestionsTarget = { groupId: number } | { createFor: { kind: "product" | "package"; id: string } };

export default function ItemQuestionsPanel({
    kind,
    itemId,
    categoryId,
    onOpenQuestions,
}: {
    kind: "product" | "package";
    itemId: string | null;
    categoryId: string | null;
    onOpenQuestions: (target: QuestionsTarget) => void;
}) {
    const [groups, setGroups] = useState<RequirementGroup[] | null>(null);

    useEffect(() => {
        let isLeftPage = false;
        apiFetch<{ data: RequirementGroup[] }>("/requirement-groups").then(({ data }) => {
            if (!isLeftPage) setGroups(data?.data ?? []);
        });
        return () => {
            isLeftPage = true;
        };
    }, []);

    if (!groups) return null;
    const asked = groups
        .filter(
            (group) =>
                group.rqg_status === "active" && group.questions.some((question) => question.rqq_status === "active"),
        )
        .map((group) => ({ group, reason: reasonOf(group, kind, itemId, categoryId) }))
        .filter((row): row is { group: RequirementGroup; reason: string } => row.reason !== null);
    const hasOwnGroup = asked.some((row) => row.reason === "ผูกรายการนี้");

    return (
        <section
            className="grid gap-2 rounded-xl border border-gray-200 bg-white p-3"
            aria-label="คำถามที่ลูกค้าจะเห็น"
        >
            <h3 className="flex items-center gap-2 text-sm font-medium text-gray-900">
                <MessageSquareText size={16} className="text-blue-600" aria-hidden="true" />
                คำถามที่ลูกค้าจะเห็นเมื่อเลือกรายการนี้
            </h3>
            {asked.length === 0 ? (
                <p className="text-sm text-gray-500">ยังไม่มีกลุ่มคำถามที่ขึ้นเมื่อเลือกรายการนี้</p>
            ) : (
                <ul className="grid gap-1.5">
                    {asked.map(({ group, reason }) => (
                        <li
                            key={group.rqg_id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm"
                        >
                            <span className="grid min-w-0 gap-0.5">
                                <span className="text-gray-900">
                                    {group.rqg_name} ·{" "}
                                    {group.questions.filter((question) => question.rqq_status === "active").length} ข้อ
                                </span>
                                <span className="text-xs text-gray-500">
                                    {reason}
                                    {group.rqg_audience !== "all" ? ` · ${AUDIENCE_LABEL[group.rqg_audience]}` : ""}
                                </span>
                            </span>
                            <button
                                type="button"
                                className="-my-2 min-h-10 text-sm text-blue-600 hover:underline"
                                onClick={() => onOpenQuestions({ groupId: group.rqg_id })}
                            >
                                แก้คำถาม
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            {itemId && !hasOwnGroup && (
                <button
                    type="button"
                    className={`${buttonClass("secondary", "sm")} justify-self-start`}
                    onClick={() => onOpenQuestions({ createFor: { kind, id: itemId } })}
                >
                    <Plus size={15} />
                    เพิ่มกลุ่มคำถามสำหรับรายการนี้
                </button>
            )}
            <FieldHint>
                {itemId
                    ? "ข้อที่ถามตามคำตอบ และการตั้งชนิดลิงก์ ดูครบได้ที่ปุ่ม ดูมุมมองลูกค้า ในแท็บคำถามลูกค้า"
                    : "บันทึกรายการก่อน จึงเพิ่มกลุ่มคำถามเฉพาะรายการนี้ได้"}
            </FieldHint>
        </section>
    );
}

/** เหตุที่กลุ่มนี้ขึ้นเมื่อเลือกรายการนี้ · ไม่ขึ้น = null (กลุ่มที่ถามเฉพาะลิงก์ที่ถามเพิ่มไม่นับ) */
function reasonOf(
    group: RequirementGroup,
    kind: "product" | "package",
    itemId: string | null,
    categoryId: string | null,
) {
    if (group.rqg_trigger === "always") return "ถามทุกคำขอ";
    if (group.rqg_trigger !== "selection") return null;
    const ownIds = kind === "product" ? group.product_ids : group.package_ids;
    if (itemId && ownIds.includes(itemId)) return "ผูกรายการนี้";
    if (categoryId && group.category_ids.includes(categoryId)) return "ผูกหมวดของรายการนี้";
    return null;
}
