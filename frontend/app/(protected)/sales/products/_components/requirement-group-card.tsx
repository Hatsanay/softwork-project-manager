"use client";

// การ์ดกลุ่มคำถามในแท็บคำถามลูกค้า (2026-10-26 Q-2) — ประโยค "ใครเห็น" · คำเตือน · คำถามพร้อมเงื่อนไข · เรียง/คัดลอก/ย้าย
// คำเตือน (requirement-warnings.ts) เป็นสีเหลือง = ต้องระวัง ไม่ใช่ข้อผิดพลาด · ข้อลูกย่อหน้าใต้ข้อแม่
import {
    AlertTriangle,
    ArrowDown,
    ArrowUp,
    Copy,
    FolderInput,
    MessageSquareText,
    Pencil,
    Plus,
    Trash2,
} from "lucide-react";
import SectionCard from "@/components/ui/section-card";
import StatusPill from "@/components/ui/status-pill";
import { buttonClass } from "@/components/ui/button";
import { OTHER_OPTION, QUESTION_TYPE_LABEL } from "@/lib/shared/requirement-answers.mjs";
import type { RequirementGroup, RequirementQuestion } from "@/app/order/_types";
import { questionConditionText } from "./requirement-labels";
import type { GroupWarnings } from "./requirement-warnings";

type GroupCardProps = {
    group: RequirementGroup;
    description: string;
    warnings: GroupWarnings | undefined;
    canEdit: boolean;
    isFirst: boolean;
    isLast: boolean;
    isFocused: boolean;
    onMoveGroup: (offset: number) => void;
    onCopyGroup: () => void;
    onEditGroup: () => void;
    onAddQuestion: () => void;
    onEditQuestion: (question: RequirementQuestion) => void;
    onCopyQuestion: (question: RequirementQuestion) => void;
    onMoveQuestionToGroup: (question: RequirementQuestion) => void;
    onDeleteQuestion: (question: RequirementQuestion) => void;
    onMoveQuestion: (index: number, offset: number) => void;
};

export default function RequirementGroupCard(props: GroupCardProps) {
    const { group, description, warnings, canEdit, isFirst, isLast, isFocused } = props;
    return (
        <div
            id={`requirement-group-${group.rqg_id}`}
            className={`scroll-mt-24 rounded-2xl ${isFocused ? "ring-2 ring-blue-300" : ""}`}
        >
            <SectionCard
                icon={MessageSquareText}
                title={group.rqg_status === "inactive" ? `${group.rqg_name} (ปิดใช้งาน)` : group.rqg_name}
                description={description}
                actions={
                    canEdit && (
                        <div className="flex flex-wrap gap-1">
                            <button
                                type="button"
                                className={buttonClass("secondary", "sm")}
                                onClick={props.onAddQuestion}
                            >
                                <Plus size={15} />
                                คำถาม
                            </button>
                            <button type="button" className={buttonClass("ghost", "sm")} onClick={props.onEditGroup}>
                                <Pencil size={15} />
                                แก้กลุ่ม
                            </button>
                            <button type="button" className={buttonClass("ghost", "sm")} onClick={props.onCopyGroup}>
                                <Copy size={15} />
                                คัดลอก
                            </button>
                            <button
                                type="button"
                                aria-label="เลื่อนกลุ่มขึ้น"
                                className={buttonClass("ghost", "sm")}
                                disabled={isFirst}
                                onClick={() => props.onMoveGroup(-1)}
                            >
                                <ArrowUp size={15} />
                            </button>
                            <button
                                type="button"
                                aria-label="เลื่อนกลุ่มลง"
                                className={buttonClass("ghost", "sm")}
                                disabled={isLast}
                                onClick={() => props.onMoveGroup(1)}
                            >
                                <ArrowDown size={15} />
                            </button>
                        </div>
                    )
                }
            >
                {group.rqg_customer_intro && (
                    <p className="text-sm text-gray-500">ลูกค้าเห็นใต้ชื่อกลุ่ม: {group.rqg_customer_intro}</p>
                )}
                {warnings && warnings.group.length > 0 && <WarningList warnings={warnings.group} />}
                {group.questions.length === 0 ? (
                    <p className="text-sm text-gray-500">ยังไม่มีคำถามในกลุ่มนี้</p>
                ) : (
                    <ol className="grid gap-2">
                        {group.questions.map((question, index) => (
                            <QuestionRow
                                key={question.rqq_id}
                                question={question}
                                number={index + 1}
                                condition={questionConditionText(question, group.questions)}
                                warnings={warnings?.questions.get(question.rqq_id) ?? []}
                                isFirst={index === 0}
                                isLast={index === group.questions.length - 1}
                                canEdit={canEdit}
                                onEdit={() => props.onEditQuestion(question)}
                                onCopy={() => props.onCopyQuestion(question)}
                                onMoveToGroup={() => props.onMoveQuestionToGroup(question)}
                                onDelete={() => props.onDeleteQuestion(question)}
                                onMove={(offset) => props.onMoveQuestion(index, offset)}
                            />
                        ))}
                    </ol>
                )}
            </SectionCard>
        </div>
    );
}

function WarningList({ warnings }: { warnings: string[] }) {
    return (
        <ul className="grid gap-1 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-600 ring-1 ring-amber-200">
            {warnings.map((warning) => (
                <li key={warning} className="flex items-start gap-1.5">
                    <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
                    <span>{warning}</span>
                </li>
            ))}
        </ul>
    );
}

type QuestionRowProps = {
    question: RequirementQuestion;
    number: number;
    condition: string | null;
    warnings: string[];
    isFirst: boolean;
    isLast: boolean;
    canEdit: boolean;
    onEdit: () => void;
    onCopy: () => void;
    onMoveToGroup: () => void;
    onDelete: () => void;
    onMove: (offset: number) => void;
};

function QuestionRow({
    question,
    number,
    condition,
    warnings,
    isFirst,
    isLast,
    canEdit,
    onEdit,
    onCopy,
    onMoveToGroup,
    onDelete,
    onMove,
}: QuestionRowProps) {
    const options = question.rqq_options
        ? [...question.rqq_options, ...(question.rqq_allow_other ? [`${OTHER_OPTION} (ระบุ)`] : [])]
        : null;
    const isInactive = question.rqq_status === "inactive";
    const indent = question.rqq_parent_id ? "ml-4 border-l-2 border-l-blue-200 sm:ml-6" : "";
    return (
        <li className={`grid gap-2 rounded-xl border border-gray-100 p-3 ${indent}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="grid min-w-0 flex-1 basis-60 gap-1">
                    <span className={`text-sm wrap-break-word ${isInactive ? "text-gray-400" : "text-gray-900"}`}>
                        {number}. {question.rqq_text}
                        {question.rqq_is_required && <span className="ml-0.5 text-red-600">*</span>}
                    </span>
                    {condition && <span className="text-xs text-blue-600">{condition}</span>}
                    <span className="flex flex-wrap items-center gap-1.5">
                        <StatusPill tone="neutral">{QUESTION_TYPE_LABEL[question.rqq_type]}</StatusPill>
                        {question.rqq_type === "file" && question.rqq_file_kind === "design" && (
                            <StatusPill tone="neutral">ไฟล์งานออกแบบ</StatusPill>
                        )}
                        {isInactive && <StatusPill tone="wait">ปิดใช้งาน</StatusPill>}
                        {(question.answer_count ?? 0) > 0 && (
                            <span className="text-xs text-gray-500">ตอบแล้ว {question.answer_count} คำขอ</span>
                        )}
                        {options && <span className="text-xs text-gray-500">{options.join(" · ")}</span>}
                    </span>
                </div>
                {canEdit && (
                    <div className="flex flex-wrap gap-1">
                        <button
                            type="button"
                            aria-label="เลื่อนขึ้น"
                            className={buttonClass("ghost", "sm")}
                            disabled={isFirst}
                            onClick={() => onMove(-1)}
                        >
                            <ArrowUp size={15} />
                        </button>
                        <button
                            type="button"
                            aria-label="เลื่อนลง"
                            className={buttonClass("ghost", "sm")}
                            disabled={isLast}
                            onClick={() => onMove(1)}
                        >
                            <ArrowDown size={15} />
                        </button>
                        <button
                            type="button"
                            aria-label="แก้คำถาม"
                            className={buttonClass("ghost", "sm")}
                            onClick={onEdit}
                        >
                            <Pencil size={15} />
                        </button>
                        <button
                            type="button"
                            aria-label="คัดลอกคำถาม"
                            className={buttonClass("ghost", "sm")}
                            onClick={onCopy}
                        >
                            <Copy size={15} />
                        </button>
                        <button
                            type="button"
                            aria-label="ย้ายไปกลุ่มอื่น"
                            className={buttonClass("ghost", "sm")}
                            onClick={onMoveToGroup}
                        >
                            <FolderInput size={15} />
                        </button>
                        <button
                            type="button"
                            aria-label="ลบคำถาม"
                            className={buttonClass("ghost", "sm")}
                            onClick={onDelete}
                        >
                            <Trash2 size={15} />
                        </button>
                    </div>
                )}
            </div>
            {warnings.length > 0 && <WarningList warnings={warnings} />}
        </li>
    );
}
