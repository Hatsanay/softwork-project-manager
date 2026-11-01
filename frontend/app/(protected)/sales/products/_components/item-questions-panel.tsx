"use client";

// คำถามที่ถามลูกค้าเมื่อเลือกรายการนี้ · สินค้า/ชุดเลือกคำถามเอง (2026-11-01 · docs/plans/2026-11-01-product-questions.md ข้อ 5)
// อยู่ในฟอร์มแก้สินค้า/ชุด: ติ๊กข้อแม่ทีละข้อหรือทั้งกลุ่ม · ข้อลูกถามตามคำตอบของข้อแม่เอง
// ติ๊กแล้วบันทึกทันที (ไม่ผูกกับปุ่มบันทึกรายการ) · ส่งทีละคำขอตามลำดับ ชุดล่าสุดชนะเสมอ
// ชุดรายการ: ข้อที่สินค้าในชุดเลือกไว้ขึ้นให้เอง (ดูได้ ติ๊กออกที่นี่ไม่ได้ ต้องแก้ที่สินค้า)
import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquareText, Plus } from "lucide-react";
import FieldHint from "@/components/ui/guidance/field-hint";
import { buttonClass } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { questionnaireSummary } from "@/lib/shared/requirement-answers.mjs";
import type { RequirementGroup, RequirementQuestion } from "@/app/order/_types";

export type QuestionsTarget = { groupId: number } | { newGroup: true };

type SaveState = "idle" | "saving" | "saved" | "error";

export default function ItemQuestionsPanel({
    kind,
    itemId,
    onOpenQuestions,
}: {
    kind: "product" | "package";
    itemId: string | null;
    onOpenQuestions: (target: QuestionsTarget) => void;
}) {
    const [groups, setGroups] = useState<RequirementGroup[] | null>(null);
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [saveState, setSaveState] = useState<SaveState>("idle");
    const [saveError, setSaveError] = useState<string | null>(null);
    const saveQueue = useRef<Promise<void>>(Promise.resolve());
    const pendingSaves = useRef(0);

    const load = useCallback(async () => {
        const { data } = await apiFetch<{ data: RequirementGroup[] }>("/requirement-groups");
        const list = data?.data ?? [];
        setGroups(list);
        setSelected(itemId ? new Set(chosenIdsOf(list, kind, itemId)) : new Set());
    }, [kind, itemId]);

    useEffect(() => {
        let isLeftPage = false;
        apiFetch<{ data: RequirementGroup[] }>("/requirement-groups").then(({ data }) => {
            if (isLeftPage) return;
            const list = data?.data ?? [];
            setGroups(list);
            setSelected(itemId ? new Set(chosenIdsOf(list, kind, itemId)) : new Set());
        });
        return () => {
            isLeftPage = true;
        };
    }, [kind, itemId]);

    function save(next: Set<number>) {
        if (!itemId) return;
        setSelected(next);
        setSaveState("saving");
        setSaveError(null);
        const path = kind === "product" ? `/products/${itemId}/questions` : `/product-packages/${itemId}/questions`;
        const questionIds = [...next];
        pendingSaves.current += 1;
        saveQueue.current = saveQueue.current.then(async () => {
            const { error } = await apiFetch(path, { method: "PUT", body: { question_ids: questionIds } });
            pendingSaves.current -= 1;
            if (error) {
                setSaveError(error.message);
                setSaveState("error");
                // กลับไปเชื่อข้อมูลจริง (เช่น คำถามถูกลบระหว่างนั้น)
                await load();
                return;
            }
            if (pendingSaves.current === 0) setSaveState((state) => (state === "error" ? state : "saved"));
        });
    }

    function toggle(questionIds: number[], isOn: boolean) {
        const next = new Set(selected);
        for (const id of questionIds) {
            if (isOn) next.add(id);
            else next.delete(id);
        }
        save(next);
    }

    if (!groups) return null;
    const activeGroups = groups.filter(
        (group) => group.rqg_status === "active" && activeTopQuestions(group).length > 0,
    );
    const alwaysGroups = activeGroups.filter((group) => group.rqg_trigger === "always");
    const selectionGroups = activeGroups.filter((group) => group.rqg_trigger === "selection");
    const linkOnlyGroups = activeGroups.filter((group) => group.rqg_trigger === "link_only");
    const isFromPackageProducts = (question: RequirementQuestion) =>
        kind === "package" && itemId !== null && question.via_package_ids.includes(itemId);
    const askedQuestions = selectionGroups
        .flatMap(activeTopQuestions)
        .filter((question) => selected.has(question.rqq_id) || isFromPackageProducts(question));
    const summary = questionnaireSummary([{ questions: askedQuestions }]);
    const fromProductsCount = askedQuestions.filter(isFromPackageProducts).length;

    return (
        <section
            className="grid gap-3 rounded-2xl border border-gray-200 bg-white p-4 sm:p-5"
            aria-label="คำถามที่ถามลูกค้า"
        >
            <div className="grid gap-1">
                <h3 className="flex items-center gap-2 text-sm font-medium text-gray-900">
                    <MessageSquareText size={16} className="text-blue-600" aria-hidden="true" />
                    คำถามที่ถามลูกค้า
                </h3>
                <p className="text-sm text-gray-600">
                    {askedQuestions.length === 0
                        ? "ยังไม่ถามเพิ่มเมื่อลูกค้าเลือกรายการนี้"
                        : `ลูกค้าตอบเพิ่ม ${summary.questionCount} ข้อ ราว ${summary.minutes} นาที เมื่อเลือกรายการนี้`}
                    {fromProductsCount > 0 && ` (รวมข้อของสินค้าในชุด ${fromProductsCount} ข้อ)`}
                </p>
                {alwaysGroups.length > 0 && (
                    <p className="text-xs text-gray-500">
                        ถามทุกคำขออยู่แล้ว: {alwaysGroups.map((group) => group.rqg_name).join(", ")}
                    </p>
                )}
            </div>

            {!itemId ? (
                <FieldHint>บันทึกรายการก่อน จึงเลือกคำถามที่จะถามลูกค้าได้</FieldHint>
            ) : selectionGroups.length === 0 ? (
                <p className="text-sm text-gray-500">
                    ยังไม่มีกลุ่มแบบ &quot;ถามตามสินค้าที่เลือก&quot; สร้างกลุ่มและคำถามก่อน แล้วกลับมาติ๊กที่นี่
                </p>
            ) : (
                <div className="grid gap-3">
                    {selectionGroups.map((group) => (
                        <GroupChecklist
                            key={group.rqg_id}
                            group={group}
                            selected={selected}
                            isFromPackageProducts={isFromPackageProducts}
                            onToggle={toggle}
                            onEdit={() => onOpenQuestions({ groupId: group.rqg_id })}
                        />
                    ))}
                </div>
            )}

            {itemId && linkOnlyGroups.length > 0 && (
                <FieldHint>
                    กลุ่ม {linkOnlyGroups.map((group) => group.rqg_name).join(", ")} ตั้งเป็น &quot;ไม่ถามเอง&quot;
                    จึงไม่อยู่ในรายการนี้ · เปลี่ยนเป็น &quot;ถามตามสินค้าที่เลือก&quot; ที่แท็บคำถามลูกค้า
                    ถ้าอยากให้เลือกได้
                </FieldHint>
            )}

            {itemId && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                        type="button"
                        className={buttonClass("secondary", "sm")}
                        onClick={() => onOpenQuestions({ newGroup: true })}
                    >
                        <Plus size={15} />
                        สร้างคำถามใหม่
                    </button>
                    <SaveStatus state={saveState} error={saveError} />
                </div>
            )}
            {itemId && (
                <FieldHint>
                    ติ๊กแล้วบันทึกทันที ไม่ต้องกดบันทึกรายการ · ข้อที่ถามต่อตามคำตอบขึ้นตามข้อด้านบนเอง ·
                    {kind === "package" && " ข้อที่ติ๊กค้างสีเทาได้จากสินค้าในชุด แก้ที่หน้าสินค้านั้น ·"}
                    ดูหน้าที่ลูกค้าเห็นจริงได้ที่ปุ่ม ดูมุมมองลูกค้า ในแท็บคำถามลูกค้า
                </FieldHint>
            )}
        </section>
    );
}

function GroupChecklist({
    group,
    selected,
    isFromPackageProducts,
    onToggle,
    onEdit,
}: {
    group: RequirementGroup;
    selected: Set<number>;
    isFromPackageProducts: (question: RequirementQuestion) => boolean;
    onToggle: (questionIds: number[], isOn: boolean) => void;
    onEdit: () => void;
}) {
    const questions = activeTopQuestions(group);
    const choosable = questions.filter((question) => !isFromPackageProducts(question));
    const checkedCount = choosable.filter((question) => selected.has(question.rqq_id)).length;
    const isAll = choosable.length > 0 && checkedCount === choosable.length;
    // ทุกข้อได้จากสินค้าในชุดแล้ว = ทั้งกลุ่มถามอยู่แล้ว (ติ๊กค้าง เปลี่ยนที่นี่ไม่ได้)
    const isAllFromProducts = choosable.length === 0;
    const choosableIds = choosable.map((question) => question.rqq_id);
    return (
        <fieldset className="grid gap-1.5 rounded-xl border border-gray-100 bg-gray-50 p-3">
            <legend className="sr-only">{group.rqg_name}</legend>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm font-medium text-gray-900">
                    <IndeterminateCheckbox
                        className="h-4 w-4 accent-blue-600"
                        checked={isAll || isAllFromProducts}
                        indeterminate={checkedCount > 0 && !isAll}
                        disabled={isAllFromProducts}
                        onChange={(event) => onToggle(choosableIds, event.target.checked)}
                    />
                    {group.rqg_name}
                    <span className="font-normal text-gray-500">
                        {isAllFromProducts ? "(ได้จากสินค้าในชุดทั้งกลุ่ม)" : "(ทั้งกลุ่ม)"}
                    </span>
                </label>
                <button type="button" className="min-h-10 text-sm text-blue-600 hover:underline" onClick={onEdit}>
                    แก้คำถาม
                </button>
            </div>
            <ul className="grid gap-1">
                {questions.map((question) => {
                    const isFromProducts = isFromPackageProducts(question);
                    const childCount = group.questions.filter(
                        (row) => row.rqq_parent_id === question.rqq_id && row.rqq_status === "active",
                    ).length;
                    return (
                        <li key={question.rqq_id}>
                            <label
                                className={`flex min-h-10 items-start gap-2 rounded-lg bg-white px-3 py-2 text-sm ${isFromProducts ? "" : "cursor-pointer"}`}
                            >
                                <input
                                    type="checkbox"
                                    className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600"
                                    checked={isFromProducts || selected.has(question.rqq_id)}
                                    disabled={isFromProducts}
                                    onChange={(event) => onToggle([question.rqq_id], event.target.checked)}
                                />
                                <span className="grid min-w-0 gap-0.5">
                                    <span className="wrap-break-word text-gray-900">
                                        {question.rqq_text}
                                        {question.rqq_is_required && <span className="ml-0.5 text-red-600">*</span>}
                                    </span>
                                    {(isFromProducts || childCount > 0) && (
                                        <span className="text-xs text-gray-500">
                                            {[
                                                isFromProducts ? "ได้จากสินค้าในชุด" : null,
                                                childCount > 0 ? `+ ถามต่อ ${childCount} ข้อตามคำตอบ` : null,
                                            ]
                                                .filter(Boolean)
                                                .join(" · ")}
                                        </span>
                                    )}
                                </span>
                            </label>
                        </li>
                    );
                })}
            </ul>
        </fieldset>
    );
}

function SaveStatus({ state, error }: { state: SaveState; error: string | null }) {
    if (state === "saving") return <span className="text-xs text-gray-500">กำลังบันทึก...</span>;
    if (state === "saved") return <span className="text-xs text-gray-500">บันทึกคำถามแล้ว</span>;
    if (state === "error") return <span className="text-xs text-red-600">บันทึกไม่สำเร็จ: {error}</span>;
    return null;
}

function IndeterminateCheckbox({
    indeterminate,
    ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { indeterminate?: boolean }) {
    const ref = useRef<HTMLInputElement>(null);
    useEffect(() => {
        if (ref.current) ref.current.indeterminate = indeterminate ?? false;
    }, [indeterminate]);
    return <input ref={ref} type="checkbox" {...props} />;
}

/** ข้อแม่ที่ใช้งานอยู่ (สินค้าเลือกได้เฉพาะข้อแม่) */
function activeTopQuestions(group: RequirementGroup) {
    return group.questions.filter((question) => !question.rqq_parent_id && question.rqq_status === "active");
}

/** ข้อที่รายการนี้เลือกไว้ทั้งหมด รวมข้อที่ปิดใช้งานอยู่ (ส่งกลับไปด้วย ไม่ให้หลุดตอนบันทึก) */
function chosenIdsOf(groups: RequirementGroup[], kind: "product" | "package", itemId: string) {
    return groups
        .flatMap((group) => group.questions)
        .filter((question) => (kind === "product" ? question.product_ids : question.package_ids).includes(itemId))
        .map((question) => question.rqq_id);
}
