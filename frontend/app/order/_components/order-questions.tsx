"use client";

// ขั้นตอบคำถามความต้องการในหน้าร้าน (2026-10-25 · S-2 · ปรับ 2026-10-26 Q-1 docs/plans/2026-10-26-customer-questions.md ข้อ 5)
// groups มาจาก visibleQuestionnaire แล้ว (เฉพาะข้อที่ลูกค้าคนนี้เห็น) · ข้อลูกขึ้นใต้ข้อแม่ทันทีที่ตอบตรงเงื่อนไข (ย่อหน้า + เส้นซ้าย)
// ใต้หัวกลุ่ม: คำอธิบายสำหรับลูกค้า + "ถามเพราะคุณเลือก …" ให้ลูกค้ารู้ว่าทำไมถาม
// ชนิดคำตอบ: ข้อความ ตัวเลือก (+ อื่นๆ ระบุ) ใช่/ไม่ใช่ ตัวเลข (หน่วย/ช่วง) วันที่ ลิงก์ แนบไฟล์ (รูป/PDF หรือไฟล์งานออกแบบ)
// Q-4: หัวขั้นบอกจำนวนข้อ เวลา และความคืบหน้าข้อที่ต้องตอบ (ติดบนจอ) · ข้อที่เติมจากคำขอครั้งก่อนมีป้ายกำกับจนกว่าจะแก้
import { useRef, useState } from "react";
import { FileText, Paperclip, X } from "lucide-react";
import FieldHint from "@/components/ui/guidance/field-hint";
import { inputClass } from "@/components/ui/form-field";
import { buttonClass } from "@/components/ui/button";
import {
    choiceValuesOf,
    FILE_KIND_ACCEPT,
    FILE_KIND_HINT,
    MAX_FILES_PER_QUESTION,
    MAX_OTHER_TEXT_LENGTH,
    maxFileBytesOf,
    numberRangeText,
    OTHER_OPTION,
    YES_NO_VALUES,
} from "@/lib/shared/requirement-answers.mjs";
import { addDays } from "@/lib/shared/payroll-math.mjs";
import { CustomerSection } from "@/components/customer/customer-shell";
import type { RequirementQuestion, VisibleRequirementGroup } from "../_types";

export type AnswerValue = string | string[];

type OrderQuestionsProps = {
    groups: (VisibleRequirementGroup & { reason: string | null })[];
    answers: Record<number, AnswerValue>;
    otherTexts: Record<number, string>;
    files: Record<number, File[]>;
    errors: Record<string, string>;
    // วันนี้เวลาไทย YYYY-MM-DD (ข้อวันที่ที่ต้องเป็นวันหลังวันนี้)
    today: string;
    onAnswer: (questionId: number, value: AnswerValue) => void;
    onOtherText: (questionId: number, text: string) => void;
    onFiles: (questionId: number, files: File[]) => void;
    // หน้าร้านเท่านั้น (ดูมุมมองลูกค้าไม่ส่ง): สรุปจำนวนข้อ + ตอบข้อบังคับไปแล้วกี่ข้อ
    progress?: { questionCount: number; requiredCount: number; minutes: number; answeredRequired: number };
    // ข้อที่เติมคำตอบเดิมของลูกค้าให้และยังไม่ได้แก้
    prefilledIds?: Set<number>;
};

const OTHER_LABEL = `${OTHER_OPTION} (ระบุ)`;

export default function OrderQuestions({
    groups,
    answers,
    otherTexts,
    files,
    errors,
    today,
    onAnswer,
    onOtherText,
    onFiles,
    progress,
    prefilledIds,
}: OrderQuestionsProps) {
    return (
        <div className="grid gap-4">
            <div className="grid gap-1">
                <h1 className="text-fluid-display font-medium text-gray-900">เล่าความต้องการให้ทีมงานฟัง</h1>
                <p className="text-fluid-lead text-gray-500">
                    คำตอบช่วยให้ทีมงานออกแบบและประเมินราคาได้ตรงขึ้น · ข้อที่มี * ต้องตอบ
                </p>
                {progress && (
                    <p className="text-sm text-gray-500">
                        {progress.questionCount} ข้อ · ต้องตอบ {progress.requiredCount} ข้อ · ราว {progress.minutes}{" "}
                        นาที · คำตอบจำไว้ในเครื่องนี้จนกว่าจะส่ง
                    </p>
                )}
            </div>
            {progress && progress.requiredCount > 0 && (
                <RequiredProgress answered={progress.answeredRequired} total={progress.requiredCount} />
            )}
            {groups.map((group, index) => (
                <CustomerSection
                    key={group.rqg_id}
                    index={index + 1}
                    id={`group-${group.rqg_id}`}
                    title={group.rqg_name}
                    description={<GroupDescription group={group} />}
                >
                    {group.questions.map((question) => (
                        <div
                            key={question.rqq_id}
                            className={
                                question.rqq_parent_id
                                    ? "border-l-2 border-blue-100 pl-3 sm:pl-4 motion-safe:animate-fade-up"
                                    : undefined
                            }
                        >
                            <QuestionField
                                question={question}
                                value={answers[question.rqq_id]}
                                otherText={otherTexts[question.rqq_id] ?? ""}
                                files={files[question.rqq_id] ?? []}
                                error={errors[`answers.${question.rqq_id}`]}
                                today={today}
                                onAnswer={(value) => onAnswer(question.rqq_id, value)}
                                onOtherText={(text) => onOtherText(question.rqq_id, text)}
                                onFiles={(list) => onFiles(question.rqq_id, list)}
                            />
                            {prefilledIds?.has(question.rqq_id) && (
                                <p className="mt-1 text-xs text-blue-600">จากคำขอครั้งก่อน · แก้ได้</p>
                            )}
                        </div>
                    ))}
                </CustomerSection>
            ))}
        </div>
    );
}

/** แถบความคืบหน้าข้อที่ต้องตอบ · ติดใต้หัวหน้าตอนเลื่อน (มือถือเห็นตลอดว่าเหลืออีกกี่ข้อ) */
function RequiredProgress({ answered, total }: { answered: number; total: number }) {
    const isDone = answered >= total;
    return (
        <div
            className="sticky top-[4.25rem] z-10 grid gap-1.5 rounded-2xl bg-white/90 px-4 py-2.5 shadow-card ring-1 ring-gray-100 backdrop-blur-md"
            aria-live="polite"
        >
            <span className={`text-sm ${isDone ? "text-green-600" : "text-gray-700"}`}>
                {isDone ? "ตอบข้อที่ต้องตอบครบแล้ว" : `ตอบข้อที่ต้องตอบแล้ว ${answered}/${total}`}
            </span>
            <span className="h-1.5 overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
                <span
                    className={`block h-full rounded-full transition-all ${isDone ? "bg-green-600" : "bg-blue-500"}`}
                    style={{ width: `${Math.min(100, (answered / total) * 100)}%` }}
                />
            </span>
        </div>
    );
}

function GroupDescription({ group }: { group: VisibleRequirementGroup & { reason: string | null } }) {
    if (!group.rqg_customer_intro && !group.reason) return null;
    return (
        <span className="grid gap-0.5">
            {group.rqg_customer_intro && <span>{group.rqg_customer_intro}</span>}
            {group.reason && <span className="text-xs text-blue-600">{group.reason}</span>}
        </span>
    );
}

type QuestionFieldProps = {
    question: RequirementQuestion;
    value: AnswerValue | undefined;
    otherText: string;
    files: File[];
    error?: string;
    today: string;
    onAnswer: (value: AnswerValue) => void;
    onOtherText: (text: string) => void;
    onFiles: (files: File[]) => void;
};

function QuestionField(props: QuestionFieldProps) {
    const { question } = props;
    if (question.rqq_type === "single" || question.rqq_type === "multi" || question.rqq_type === "yes_no")
        return <ChoiceField {...props} />;
    if (question.rqq_type === "file") return <FileField {...props} />;
    return <TextField {...props} />;
}

function QuestionLabel({ question }: { question: RequirementQuestion }) {
    return (
        <>
            {question.rqq_text}
            {question.rqq_is_required && <span className="ml-0.5 text-red-600">*</span>}
        </>
    );
}

function ChoiceField({ question, value, otherText, error, onAnswer, onOtherText }: QuestionFieldProps) {
    const id = `question_${question.rqq_id}`;
    const isMulti = question.rqq_type === "multi";
    const selected = Array.isArray(value) ? value : [];
    const single = typeof value === "string" ? value : "";
    const isOtherOn = isMulti ? selected.includes(OTHER_OPTION) : single === OTHER_OPTION;
    const labelOf = (choice: string) => {
        if (question.rqq_type === "yes_no") return YES_NO_VALUES[choice as keyof typeof YES_NO_VALUES];
        return choice === OTHER_OPTION && question.rqq_allow_other ? OTHER_LABEL : choice;
    };

    function toggle(choice: string) {
        const isOn = isMulti ? selected.includes(choice) : single === choice;
        if (isMulti) {
            onAnswer(isOn ? selected.filter((item) => item !== choice) : [...selected, choice]);
            return;
        }
        onAnswer(isOn ? "" : choice);
    }

    const hint = question.rqq_help ?? (isMulti ? "เลือกได้หลายข้อ" : undefined);
    return (
        <fieldset className="grid gap-2" aria-describedby={`${id}-hint`}>
            <legend className="mb-1 text-sm text-gray-800">
                <QuestionLabel question={question} />
            </legend>
            <div className="flex flex-wrap gap-2">
                {choiceValuesOf(question).map((choice: string) => {
                    const isOn = isMulti ? selected.includes(choice) : single === choice;
                    return (
                        <button
                            key={choice}
                            type="button"
                            aria-pressed={isOn}
                            onClick={() => toggle(choice)}
                            className={`min-h-11 rounded-xl border px-3.5 text-sm transition ${isOn ? "border-blue-400 bg-blue-50 font-medium text-blue-700" : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"}`}
                        >
                            {labelOf(choice)}
                        </button>
                    );
                })}
            </div>
            {question.rqq_allow_other && isOtherOn && (
                <input
                    id={`${id}-other`}
                    aria-label={`รายละเอียดของ ${OTHER_OPTION}`}
                    placeholder={`พิมพ์${OTHER_OPTION}ที่ต้องการ`}
                    maxLength={MAX_OTHER_TEXT_LENGTH}
                    value={otherText}
                    onChange={(event) => onOtherText(event.target.value)}
                    className={inputClass(Boolean(error))}
                />
            )}
            <FieldHint id={`${id}-hint`} error={error}>
                {hint}
            </FieldHint>
        </fieldset>
    );
}

function TextField({ question, value, error, today, onAnswer }: QuestionFieldProps) {
    const id = `question_${question.rqq_id}`;
    const text = typeof value === "string" ? value : "";
    const isNumber = question.rqq_type === "number";
    const range = isNumber ? numberRangeText(question).trim() : "";
    const hint = [
        question.rqq_help,
        range ? `ใส่ได้ ${range}` : null,
        question.rqq_future_only ? "เลือกวันหลังวันนี้" : null,
    ]
        .filter(Boolean)
        .join(" · ");
    const describedBy = `${id}-hint`;

    let field;
    if (question.rqq_type === "long_text") {
        field = (
            <textarea
                id={id}
                rows={3}
                maxLength={3000}
                placeholder={question.rqq_placeholder ?? undefined}
                value={text}
                onChange={(event) => onAnswer(event.target.value)}
                className={inputClass(Boolean(error))}
                aria-describedby={describedBy}
            />
        );
    } else {
        const inputType = question.rqq_type === "date" ? "date" : question.rqq_type === "url" ? "url" : "text";
        const input = (
            <input
                id={id}
                type={inputType}
                inputMode={isNumber ? "decimal" : question.rqq_type === "url" ? "url" : undefined}
                maxLength={question.rqq_type === "url" ? 500 : 300}
                min={question.rqq_future_only ? addDays(today, 1) : undefined}
                placeholder={question.rqq_placeholder ?? (question.rqq_type === "url" ? "https://" : undefined)}
                value={text}
                onChange={(event) => onAnswer(event.target.value)}
                className={inputClass(Boolean(error))}
                aria-describedby={describedBy}
            />
        );
        field = question.rqq_unit ? (
            <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">{input}</div>
                <span className="shrink-0 text-sm text-gray-500">{question.rqq_unit}</span>
            </div>
        ) : (
            input
        );
    }

    return (
        <div className="grid gap-1.5">
            <label htmlFor={id} className="text-sm text-gray-800">
                <QuestionLabel question={question} />
            </label>
            {field}
            <FieldHint id={describedBy} error={error}>
                {hint || undefined}
            </FieldHint>
        </div>
    );
}

function FileField({ question, files, error, onFiles }: QuestionFieldProps) {
    const id = `question_${question.rqq_id}`;
    const fileInput = useRef<HTMLInputElement>(null);
    const [rejectedNote, setRejectedNote] = useState<string | null>(null);
    const kind = question.rqq_file_kind ?? "document";
    const maxBytes = maxFileBytesOf(question);

    function addFiles(list: FileList | null) {
        if (!list) return;
        const picked = [...list];
        const accepted = picked.filter((file) => file.size <= maxBytes);
        const tooBig = picked.filter((file) => file.size > maxBytes);
        const combined = [...files, ...accepted];
        const notes = [];
        if (tooBig.length > 0)
            notes.push(
                `ไม่ได้แนบ ${tooBig.map((file) => file.name).join(", ")} เพราะใหญ่เกิน ${maxBytes / 1024 / 1024} MB`,
            );
        if (combined.length > MAX_FILES_PER_QUESTION) notes.push(`แนบได้ไม่เกิน ${MAX_FILES_PER_QUESTION} ไฟล์ต่อข้อ`);
        setRejectedNote(notes.length > 0 ? notes.join(" · ") : null);
        onFiles(combined.slice(0, MAX_FILES_PER_QUESTION));
    }

    const defaultHint = `${FILE_KIND_HINT[kind]} ไม่เกิน ${MAX_FILES_PER_QUESTION} ไฟล์ · ปิดหน้านี้แล้วต้องแนบใหม่`;
    return (
        <div className="grid gap-2">
            <span id={id} className="text-sm text-gray-800">
                <QuestionLabel question={question} />
            </span>
            {files.length > 0 && (
                <ul className="grid gap-1.5">
                    {files.map((file, index) => (
                        <li
                            key={`${file.name}-${index}`}
                            className="flex items-center justify-between gap-2 rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-700"
                        >
                            <span className="flex min-w-0 items-center gap-2">
                                <FileText size={16} className="shrink-0 text-gray-400" aria-hidden="true" />
                                <span className="truncate">{file.name}</span>
                            </span>
                            <button
                                type="button"
                                aria-label={`เอา ${file.name} ออก`}
                                className="-m-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
                                onClick={() => onFiles(files.filter((_, fileIndex) => fileIndex !== index))}
                            >
                                <X size={16} />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            {files.length < MAX_FILES_PER_QUESTION && (
                <button
                    type="button"
                    className={`${buttonClass("secondary", "md")} min-h-11 justify-self-start`}
                    onClick={() => fileInput.current?.click()}
                >
                    <Paperclip size={16} />
                    แนบไฟล์
                </button>
            )}
            <input
                ref={fileInput}
                type="file"
                accept={FILE_KIND_ACCEPT[kind]}
                multiple
                className="hidden"
                onChange={(event) => {
                    addFiles(event.target.files);
                    event.target.value = "";
                }}
            />
            <FieldHint error={error ?? rejectedNote}>{question.rqq_help ?? defaultHint}</FieldHint>
        </div>
    );
}
