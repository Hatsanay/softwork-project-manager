"use client";

// ทบทวนคำตอบก่อนส่ง (2026-10-26 Q-4 · docs/plans/2026-10-26-customer-questions.md ข้อ 5)
// ขั้นตรวจและส่ง: กลุ่ม → คำถาม → คำตอบ (ข้อความเดียวกับที่ทีมงานจะเห็น) · ไฟล์บอกชื่อ · ปุ่มกลับไปแก้
import { Pencil } from "lucide-react";
import { CustomerSection } from "@/components/customer/customer-shell";
import { answerText, storedAnswer, storedOtherText } from "@/lib/shared/requirement-answers.mjs";
import type { RequirementQuestion, VisibleRequirementGroup } from "../_types";
import type { AnswerValue } from "./order-questions";

export default function AnswersReview({
    index,
    groups,
    answers,
    otherTexts,
    files,
    onEdit,
}: {
    index: number;
    groups: VisibleRequirementGroup[];
    answers: Record<number, AnswerValue>;
    otherTexts: Record<number, string>;
    files: Record<number, File[]>;
    onEdit: () => void;
}) {
    return (
        <CustomerSection
            index={index}
            id="answers"
            title="คำตอบของคุณ"
            description="ตรวจอีกครั้งก่อนส่ง"
            actions={
                <button
                    type="button"
                    className="-my-2 inline-flex min-h-10 items-center gap-1 text-sm text-blue-600 hover:underline"
                    onClick={onEdit}
                >
                    <Pencil size={14} aria-hidden="true" />
                    แก้คำตอบ
                </button>
            }
        >
            <div className="grid gap-4">
                {groups.map((group) => (
                    <section key={group.rqg_id} className="grid gap-2">
                        <h3 className="text-sm font-medium text-blue-700">{group.rqg_name}</h3>
                        <dl className="grid gap-2.5">
                            {group.questions.map((question) => {
                                const shown = shownAnswer(
                                    question,
                                    answers[question.rqq_id],
                                    otherTexts[question.rqq_id],
                                    files[question.rqq_id] ?? [],
                                );
                                return (
                                    <div
                                        key={question.rqq_id}
                                        className="grid gap-0.5 border-b border-gray-100 pb-2 last:border-b-0"
                                    >
                                        <dt className="text-xs text-gray-500">{question.rqq_text}</dt>
                                        <dd
                                            className={`text-sm whitespace-pre-line wrap-break-word ${shown ? "text-gray-900" : "text-gray-400"}`}
                                        >
                                            {shown ?? "-"}
                                        </dd>
                                    </div>
                                );
                            })}
                        </dl>
                    </section>
                ))}
            </div>
        </CustomerSection>
    );
}

/** คำตอบเป็นข้อความแบบเดียวกับที่บันทึก (ทีมงานเห็นแบบนี้) · ไม่ได้ตอบ = null */
function shownAnswer(
    question: RequirementQuestion,
    value: AnswerValue | undefined,
    otherText: string | undefined,
    questionFiles: File[],
) {
    if (question.rqq_type === "file")
        return questionFiles.length > 0 ? questionFiles.map((file) => file.name).join(", ") : null;
    const stored = storedAnswer(question, value ?? null);
    return answerText(question.rqq_type, stored, storedOtherText(question, value ?? null, otherText ?? null));
}
