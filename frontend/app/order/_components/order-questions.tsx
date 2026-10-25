"use client";

// ขั้นตอบคำถามความต้องการในหน้าร้าน (2026-10-25 · S-2) — แสดงเฉพาะกลุ่มทั่วไป + กลุ่มของหมวดที่เลือก
// ชนิดคำตอบ: ข้อความ ตัวเลือก ใช่/ไม่ใช่ ตัวเลข วันที่ ลิงก์ แนบไฟล์ (รูป/PDF ไม่เกิน 10 MB คำถามละไม่เกิน 5 ไฟล์)
import { useRef } from "react";
import { FileText, Paperclip, X } from "lucide-react";
import FieldHint from "@/components/ui/guidance/field-hint";
import { inputClass } from "@/components/ui/form-field";
import { buttonClass } from "@/components/ui/button";
import { MAX_FILES_PER_QUESTION, MAX_FILE_BYTES } from "@/lib/shared/requirement-answers.mjs";
import { CustomerSection } from "@/components/customer/customer-shell";
import type { RequirementGroup, RequirementQuestion } from "../_types";

export type AnswerValue = string | string[];

type OrderQuestionsProps = {
    groups: RequirementGroup[];
    answers: Record<number, AnswerValue>;
    files: Record<number, File[]>;
    errors: Record<string, string>;
    onAnswer: (questionId: number, value: AnswerValue) => void;
    onFiles: (questionId: number, files: File[]) => void;
};

const ACCEPT = "image/png,image/jpeg,application/pdf";

export default function OrderQuestions({ groups, answers, files, errors, onAnswer, onFiles }: OrderQuestionsProps) {
    return (
        <div className="grid gap-4">
            <div className="grid gap-1">
                <h1 className="text-fluid-display font-medium text-gray-900">เล่าความต้องการให้ทีมงานฟัง</h1>
                <p className="text-fluid-lead text-gray-500">คำตอบช่วยให้ทีมงานออกแบบและประเมินราคาได้ตรงขึ้น · ข้อที่มี * ต้องตอบ</p>
            </div>
            {groups.map((group, index) => (
                <CustomerSection key={group.rqg_id} index={index + 1} id={`group-${group.rqg_id}`} title={group.rqg_name}>
                    {group.questions.map((question) => (
                        <QuestionField
                            key={question.rqq_id}
                            question={question}
                            value={answers[question.rqq_id]}
                            files={files[question.rqq_id] ?? []}
                            error={errors[`answers.${question.rqq_id}`]}
                            onAnswer={(value) => onAnswer(question.rqq_id, value)}
                            onFiles={(list) => onFiles(question.rqq_id, list)}
                        />
                    ))}
                </CustomerSection>
            ))}
        </div>
    );
}

function QuestionField({
    question,
    value,
    files,
    error,
    onAnswer,
    onFiles,
}: {
    question: RequirementQuestion;
    value: AnswerValue | undefined;
    files: File[];
    error?: string;
    onAnswer: (value: AnswerValue) => void;
    onFiles: (files: File[]) => void;
}) {
    const id = `question_${question.rqq_id}`;
    const fileInput = useRef<HTMLInputElement>(null);
    const options = question.rqq_options ?? [];
    const text = typeof value === "string" ? value : "";
    const selected = Array.isArray(value) ? value : [];
    const label = (
        <>
            {question.rqq_text}
            {question.rqq_is_required && <span className="ml-0.5 text-red-600">*</span>}
        </>
    );

    const isChoice = question.rqq_type === "single" || question.rqq_type === "multi" || question.rqq_type === "yes_no";
    const choiceOptions = question.rqq_type === "yes_no" ? ["ใช่", "ไม่ใช่"] : options;

    function addFiles(list: FileList | null) {
        if (!list) return;
        const accepted = [...list].filter((file) => file.size <= MAX_FILE_BYTES);
        onFiles([...files, ...accepted].slice(0, MAX_FILES_PER_QUESTION));
    }

    if (isChoice) {
        return (
            <fieldset className="grid gap-2" aria-describedby={`${id}-hint`}>
                <legend className="mb-1 text-sm text-gray-800">{label}</legend>
                <div className="flex flex-wrap gap-2">
                    {choiceOptions.map((option) => {
                        const optionValue = question.rqq_type === "yes_no" ? (option === "ใช่" ? "yes" : "no") : option;
                        const isOn = question.rqq_type === "multi" ? selected.includes(optionValue) : text === optionValue;
                        return (
                            <button
                                key={option}
                                type="button"
                                aria-pressed={isOn}
                                onClick={() => {
                                    if (question.rqq_type === "multi") onAnswer(isOn ? selected.filter((item) => item !== optionValue) : [...selected, optionValue]);
                                    else onAnswer(isOn ? "" : optionValue);
                                }}
                                className={`min-h-11 rounded-xl border px-3.5 text-sm transition ${isOn ? "border-blue-400 bg-blue-50 font-medium text-blue-700" : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"}`}
                            >
                                {option}
                            </button>
                        );
                    })}
                </div>
                <FieldHint id={`${id}-hint`} error={error}>
                    {question.rqq_help ?? (question.rqq_type === "multi" ? "เลือกได้หลายข้อ" : undefined)}
                </FieldHint>
            </fieldset>
        );
    }

    if (question.rqq_type === "file") {
        return (
            <div className="grid gap-2">
                <span className="text-sm text-gray-800">{label}</span>
                {files.length > 0 && (
                    <ul className="grid gap-1.5">
                        {files.map((file, index) => (
                            <li key={`${file.name}-${index}`} className="flex items-center justify-between gap-2 rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-700">
                                <span className="flex min-w-0 items-center gap-2">
                                    <FileText size={16} className="shrink-0 text-gray-400" aria-hidden="true" />
                                    <span className="truncate">{file.name}</span>
                                </span>
                                <button type="button" aria-label={`เอา ${file.name} ออก`} className="-m-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100" onClick={() => onFiles(files.filter((_, fileIndex) => fileIndex !== index))}>
                                    <X size={16} />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
                {files.length < MAX_FILES_PER_QUESTION && (
                    <button type="button" className={`${buttonClass("secondary", "md")} min-h-11 justify-self-start`} onClick={() => fileInput.current?.click()}>
                        <Paperclip size={16} />
                        แนบไฟล์
                    </button>
                )}
                <input
                    ref={fileInput}
                    type="file"
                    accept={ACCEPT}
                    multiple
                    className="hidden"
                    onChange={(event) => {
                        addFiles(event.target.files);
                        event.target.value = "";
                    }}
                />
                <FieldHint error={error}>{question.rqq_help ?? `รูป (JPG/PNG) หรือ PDF ไฟล์ละไม่เกิน 10 MB ไม่เกิน ${MAX_FILES_PER_QUESTION} ไฟล์`}</FieldHint>
            </div>
        );
    }

    const inputType = question.rqq_type === "date" ? "date" : question.rqq_type === "url" ? "url" : "text";
    return (
        <div className="grid gap-1.5">
            <label htmlFor={id} className="text-sm text-gray-800">
                {label}
            </label>
            {question.rqq_type === "long_text" ? (
                <textarea id={id} rows={3} maxLength={3000} value={text} onChange={(event) => onAnswer(event.target.value)} className={inputClass(Boolean(error))} aria-describedby={`${id}-hint`} />
            ) : (
                <input
                    id={id}
                    type={inputType}
                    inputMode={question.rqq_type === "number" ? "decimal" : question.rqq_type === "url" ? "url" : undefined}
                    maxLength={question.rqq_type === "url" ? 500 : 300}
                    placeholder={question.rqq_type === "url" ? "https://" : undefined}
                    value={text}
                    onChange={(event) => onAnswer(event.target.value)}
                    className={inputClass(Boolean(error))}
                    aria-describedby={`${id}-hint`}
                />
            )}
            <FieldHint id={`${id}-hint`} error={error}>
                {question.rqq_help}
            </FieldHint>
        </div>
    );
}
