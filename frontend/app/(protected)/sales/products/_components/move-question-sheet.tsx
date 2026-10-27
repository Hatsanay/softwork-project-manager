"use client";

// ย้ายคำถามไปกลุ่มอื่น (2026-10-26 Q-2) · บอกผลก่อนกด: ข้อลูกย้ายตาม · ข้อที่ถามตามข้อด้านบนจะถูกล้างเงื่อนไข (ข้อแม่ต้องอยู่กลุ่มเดียวกัน)
import { useState } from "react";
import { toast } from "sonner";
import FormField, { inputClass } from "@/components/ui/form-field";
import StatusBanner from "@/components/ui/guidance/status-banner";
import { apiFetch } from "@/lib/api";
import type { RequirementGroup, RequirementQuestion } from "@/app/order/_types";
import { SheetButtons, SheetFrame } from "../../../fastwork/_components/sheet-frame";

export default function MoveQuestionSheet({
    question,
    group,
    groups,
    onClose,
    onSaved,
}: {
    question: RequirementQuestion;
    group: RequirementGroup;
    groups: RequirementGroup[];
    onClose: () => void;
    onSaved: () => Promise<void>;
}) {
    const targets = groups.filter((row) => row.rqg_id !== group.rqg_id);
    const [targetId, setTargetId] = useState<number | "">(targets[0]?.rqg_id ?? "");
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const descendantCount = countDescendants(question.rqq_id, group.questions);
    const parent = question.rqq_parent_id
        ? group.questions.find((row) => row.rqq_id === question.rqq_parent_id)
        : undefined;
    const consequences = [
        descendantCount > 0
            ? `ข้อที่ถามตามคำตอบของข้อนี้ ${descendantCount} ข้อ ย้ายไปด้วย (เรียงต่อท้ายกลุ่มที่เลือก)`
            : "ย้ายไปต่อท้ายกลุ่มที่เลือก",
        parent
            ? `เงื่อนไข "ถามเมื่อข้อ ${parent.rqq_text} ตอบตรง" จะถูกล้าง (ข้อนั้นอยู่กลุ่มเดิม) ข้อนี้จะถามทุกครั้งที่กลุ่มใหม่ขึ้น`
            : null,
        "ลูกค้าเห็นข้อนี้ตามเงื่อนไขของกลุ่มใหม่ · คำตอบในคำขอเดิมไม่เปลี่ยน",
    ].filter((text): text is string => Boolean(text));

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        if (targetId === "") {
            setError("เลือกกลุ่มที่จะย้ายไป");
            return;
        }
        setIsSaving(true);
        const { error: apiError } = await apiFetch(`/requirement-questions/${question.rqq_id}/move`, {
            method: "POST",
            body: { group_id: targetId },
        });
        setIsSaving(false);
        if (apiError) {
            setError(apiError.fields.group_id ?? apiError.message);
            return;
        }
        toast.success("ย้ายคำถามแล้ว");
        await onSaved();
        onClose();
    }

    return (
        <SheetFrame
            titleId="move-title"
            title="ย้ายคำถามไปกลุ่มอื่น"
            subtitle={question.rqq_text}
            onClose={onClose}
            onSubmit={submit}
        >
            {targets.length === 0 ? (
                <StatusBanner tone="info" title="ยังไม่มีกลุ่มอื่น">
                    เพิ่มกลุ่มคำถามก่อน แล้วค่อยย้าย
                </StatusBanner>
            ) : (
                <>
                    <FormField label="ย้ายไปกลุ่ม" htmlFor="move_target" required error={error ?? undefined}>
                        <select
                            id="move_target"
                            value={targetId}
                            onChange={(event) => setTargetId(Number(event.target.value))}
                            className={inputClass(Boolean(error))}
                        >
                            {targets.map((row) => (
                                <option key={row.rqg_id} value={row.rqg_id}>
                                    {row.rqg_name}
                                    {row.rqg_status === "inactive" ? " (ปิดใช้งาน)" : ""}
                                </option>
                            ))}
                        </select>
                    </FormField>
                    <ul className="grid list-disc gap-1 pl-5 text-sm text-gray-700">
                        {consequences.map((text) => (
                            <li key={text}>{text}</li>
                        ))}
                    </ul>
                </>
            )}
            <SheetButtons
                isSaving={isSaving}
                isDisabled={targets.length === 0}
                submitLabel={descendantCount > 0 ? `ย้าย ${descendantCount + 1} ข้อ` : "ย้ายข้อนี้"}
                onClose={onClose}
            />
        </SheetFrame>
    );
}

/** ข้อลูกทุกชั้นของข้อนี้ (ข้อลูกอยู่ใต้ข้อแม่เสมอ ไล่จากบนลงล่างครั้งเดียวพอ · ตรงกับ backend withDescendants) */
function countDescendants(questionId: number, questions: RequirementQuestion[]) {
    const ids = new Set([questionId]);
    for (const row of questions) {
        if (row.rqq_parent_id && ids.has(row.rqq_parent_id)) ids.add(row.rqq_id);
    }
    return ids.size - 1;
}
