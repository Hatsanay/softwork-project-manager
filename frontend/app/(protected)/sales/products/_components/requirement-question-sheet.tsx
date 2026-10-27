"use client";

// แผ่นเพิ่ม/แก้คำถามลูกค้า (2026-10-26 Q-1 · docs/plans/2026-10-26-customer-questions.md ข้อ 4.3)
// ช่องเฉพาะชนิด: ตัวเลือก + อื่นๆ (ระบุ) · ตัวเลข หน่วย/ช่วง · วันที่หลังวันนี้ · ไฟล์รูป/PDF หรือไฟล์งานออกแบบ
// "ถามเมื่อไหร่": ข้อแม่ = ข้อด้านบนในกลุ่มเดียวกัน (ชนิดเลือกตอบ/ใช่-ไม่ใช่) · ชนิดลิงก์ · ไม่ถามเมื่อทีมงานเลือกรายการให้แล้ว
import { useState } from "react";
import { toast } from "sonner";
import FormField, { inputClass } from "@/components/ui/form-field";
import FieldHint from "@/components/ui/guidance/field-hint";
import StatusBanner from "@/components/ui/guidance/status-banner";
import Switch from "@/components/ui/switch";
import { apiFetch } from "@/lib/api";
import { toFieldErrors, type FieldErrors } from "@/lib/form-errors";
import {
    AUDIENCE_LABEL,
    choiceValuesOf,
    FILE_KIND_HINT,
    OTHER_OPTION,
    PARENT_QUESTION_TYPES,
    QUESTION_AUDIENCES,
    QUESTION_TYPES,
    QUESTION_TYPE_LABEL,
    YES_NO_VALUES,
} from "@/lib/shared/requirement-answers.mjs";
import { requirementQuestionSchema } from "@/lib/shared/schemas/requirement.mjs";
import type { RequirementGroup, RequirementQuestion } from "@/app/order/_types";
import { SheetButtons, SheetFrame } from "../../../fastwork/_components/sheet-frame";

type QuestionType = RequirementQuestion["rqq_type"];
type QuestionAudience = RequirementQuestion["rqq_audience"];

// ชนิดที่ใส่ตัวอย่างในช่องได้
const PLACEHOLDER_TYPES: QuestionType[] = ["short_text", "long_text", "number", "url"];

export default function RequirementQuestionSheet({
    group,
    question,
    onClose,
    onSaved,
}: {
    group: RequirementGroup;
    question: RequirementQuestion | null;
    onClose: () => void;
    onSaved: () => Promise<void>;
}) {
    const [form, setForm] = useState({
        rqq_text: question?.rqq_text ?? "",
        rqq_help: question?.rqq_help ?? "",
        rqq_placeholder: question?.rqq_placeholder ?? "",
        rqq_type: question?.rqq_type ?? ("short_text" as QuestionType),
        options_text: (question?.rqq_options ?? []).join("\n"),
        rqq_allow_other: question?.rqq_allow_other ?? false,
        rqq_unit: question?.rqq_unit ?? "",
        rqq_min: question?.rqq_min ? String(Number(question.rqq_min)) : "",
        rqq_max: question?.rqq_max ? String(Number(question.rqq_max)) : "",
        rqq_future_only: question?.rqq_future_only ?? false,
        rqq_file_kind: question?.rqq_file_kind ?? ("document" as RequirementQuestion["rqq_file_kind"]),
        rqq_is_required: question?.rqq_is_required ?? false,
        rqq_parent_id: question?.rqq_parent_id ?? null,
        rqq_parent_values: question?.rqq_parent_values ?? ([] as string[]),
        rqq_audience: question?.rqq_audience ?? ("group" as QuestionAudience),
        rqq_skip_when_preset: question?.rqq_skip_when_preset ?? false,
        rqq_prefill: question?.rqq_prefill ?? false,
        rqq_status: question?.rqq_status ?? ("active" as const),
    });
    const [errors, setErrors] = useState<FieldErrors>({});
    const [isSaving, setIsSaving] = useState(false);
    const [isConditionOpen, setIsConditionOpen] = useState(
        Boolean(
            question && (question.rqq_parent_id || question.rqq_audience !== "group" || question.rqq_skip_when_preset),
        ),
    );

    const hasOptions = form.rqq_type === "single" || form.rqq_type === "multi";
    // ข้อแม่ได้: ข้อด้านบนของข้อนี้ในกลุ่มเดียวกัน ชนิดเลือกตอบ/ใช่-ไม่ใช่ (ข้อใหม่อยู่ท้ายกลุ่ม = ทุกข้อในกลุ่มอยู่ด้านบน)
    const ownIndex = question
        ? group.questions.findIndex((row) => row.rqq_id === question.rqq_id)
        : group.questions.length;
    const parentChoices = group.questions
        .slice(0, ownIndex)
        .filter((row) => PARENT_QUESTION_TYPES.includes(row.rqq_type));
    const parent = parentChoices.find((row) => row.rqq_id === form.rqq_parent_id) ?? null;
    const hasChildren = question ? group.questions.some((row) => row.rqq_parent_id === question.rqq_id) : false;

    function update<Field extends keyof typeof form>(field: Field, value: (typeof form)[Field]) {
        setForm((current) => ({ ...current, [field]: value }));
    }

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        const { options_text: optionsText, ...rest } = form;
        const body = {
            ...rest,
            rqq_options: optionsText
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean),
            rqq_min: form.rqq_min.trim() === "" ? null : form.rqq_min,
            rqq_max: form.rqq_max.trim() === "" ? null : form.rqq_max,
        };
        const checked = requirementQuestionSchema.safeParse(body);
        if (!checked.success) {
            setErrors(toFieldErrors(checked.error.issues));
            return;
        }
        setIsSaving(true);
        const { error } = await apiFetch(
            question ? `/requirement-questions/${question.rqq_id}` : `/requirement-groups/${group.rqg_id}/questions`,
            {
                method: question ? "PUT" : "POST",
                body: checked.data,
            },
        );
        setIsSaving(false);
        if (error) {
            setErrors({ ...error.fields, _form: Object.keys(error.fields).length === 0 ? error.message : "" });
            return;
        }
        toast.success("บันทึกคำถามแล้ว");
        await onSaved();
        onClose();
    }

    return (
        <SheetFrame
            titleId="question-title"
            title={question ? "แก้คำถาม" : "เพิ่มคำถาม"}
            subtitle={`กลุ่ม ${group.rqg_name}`}
            onClose={onClose}
            onSubmit={submit}
        >
            {errors._form && (
                <StatusBanner tone="error" title="บันทึกไม่สำเร็จ">
                    {errors._form}
                </StatusBanner>
            )}
            <FormField
                label="คำถาม"
                htmlFor="question_text"
                required
                hint={
                    (question?.answer_count ?? 0) > 0
                        ? `มีคนตอบข้อนี้แล้ว ${question?.answer_count} คำขอ · แก้แล้วคำตอบเดิมยังแสดงตามคำถามเดิม`
                        : undefined
                }
                error={errors.rqq_text}
            >
                <input
                    id="question_text"
                    value={form.rqq_text}
                    maxLength={300}
                    onChange={(event) => update("rqq_text", event.target.value)}
                    className={inputClass(Boolean(errors.rqq_text))}
                />
            </FormField>
            <FormField
                label="ชนิดคำตอบ"
                htmlFor="question_type"
                required
                hint={
                    hasChildren ? "มีข้อที่ถามตามคำตอบของข้อนี้ เปลี่ยนได้เฉพาะชนิดเลือกตอบหรือใช่/ไม่ใช่" : undefined
                }
                error={errors.rqq_type}
            >
                <select
                    id="question_type"
                    value={form.rqq_type}
                    onChange={(event) => update("rqq_type", event.target.value as QuestionType)}
                    className={inputClass(Boolean(errors.rqq_type))}
                >
                    {(QUESTION_TYPES as QuestionType[]).map((type) => (
                        <option key={type} value={type}>
                            {QUESTION_TYPE_LABEL[type]}
                        </option>
                    ))}
                </select>
            </FormField>

            {hasOptions && (
                <>
                    <FormField
                        label="ตัวเลือก"
                        htmlFor="question_options"
                        required
                        hint="บรรทัดละข้อ อย่างน้อย 2 ข้อ"
                        error={errors.rqq_options}
                    >
                        <textarea
                            id="question_options"
                            rows={4}
                            value={form.options_text}
                            onChange={(event) => update("options_text", event.target.value)}
                            className={inputClass(Boolean(errors.rqq_options))}
                        />
                    </FormField>
                    <Switch
                        id="question_allow_other"
                        label={`มีตัวเลือก "${OTHER_OPTION} (ระบุ)"`}
                        description="ลูกค้าเลือกแล้วมีช่องให้พิมพ์เอง · ระบบเพิ่มไว้ท้ายรายการ ไม่ต้องพิมพ์ในตัวเลือก"
                        checked={form.rqq_allow_other}
                        onChange={(checked) => update("rqq_allow_other", checked)}
                    />
                </>
            )}
            {form.rqq_type === "number" && (
                <div className="grid gap-3 sm:grid-cols-3">
                    <FormField label="หน่วย" htmlFor="question_unit" hint="เช่น หน้าจอ คน" error={errors.rqq_unit}>
                        <input
                            id="question_unit"
                            value={form.rqq_unit}
                            maxLength={30}
                            onChange={(event) => update("rqq_unit", event.target.value)}
                            className={inputClass(Boolean(errors.rqq_unit))}
                        />
                    </FormField>
                    <FormField label="ต่ำสุด" htmlFor="question_min" hint="ไม่บังคับ" error={errors.rqq_min}>
                        <input
                            id="question_min"
                            inputMode="decimal"
                            value={form.rqq_min}
                            onChange={(event) => update("rqq_min", event.target.value)}
                            className={inputClass(Boolean(errors.rqq_min))}
                        />
                    </FormField>
                    <FormField label="สูงสุด" htmlFor="question_max" hint="ไม่บังคับ" error={errors.rqq_max}>
                        <input
                            id="question_max"
                            inputMode="decimal"
                            value={form.rqq_max}
                            onChange={(event) => update("rqq_max", event.target.value)}
                            className={inputClass(Boolean(errors.rqq_max))}
                        />
                    </FormField>
                </div>
            )}
            {form.rqq_type === "date" && (
                <Switch
                    id="question_future_only"
                    label="ต้องเป็นวันหลังวันนี้"
                    description="เช่น อยากให้เสร็จภายใน · ลูกค้าเลือกวันนี้หรือวันที่ผ่านแล้วไม่ได้"
                    checked={form.rqq_future_only}
                    onChange={(checked) => update("rqq_future_only", checked)}
                />
            )}
            {form.rqq_type === "file" && (
                <FormField
                    label="รับไฟล์แบบไหน"
                    htmlFor="question_file_kind"
                    hint={FILE_KIND_HINT[form.rqq_file_kind]}
                    error={errors.rqq_file_kind}
                >
                    <select
                        id="question_file_kind"
                        value={form.rqq_file_kind}
                        onChange={(event) =>
                            update("rqq_file_kind", event.target.value as RequirementQuestion["rqq_file_kind"])
                        }
                        className={inputClass(false)}
                    >
                        <option value="document">รูปหรือ PDF</option>
                        <option value="design">ไฟล์งานออกแบบ (เพิ่ม AI PSD SVG ZIP · ทีมงานดาวน์โหลดไปเปิดเอง)</option>
                    </select>
                </FormField>
            )}

            {PLACEHOLDER_TYPES.includes(form.rqq_type) && (
                <FormField
                    label="ตัวอย่างในช่อง"
                    htmlFor="question_placeholder"
                    hint="ไม่บังคับ · ตัวหนังสือจางในช่อง หายเมื่อลูกค้าพิมพ์"
                    error={errors.rqq_placeholder}
                >
                    <input
                        id="question_placeholder"
                        value={form.rqq_placeholder}
                        maxLength={150}
                        placeholder="เช่น ร้านกาแฟในภูเก็ต ลูกค้าหลักเป็นนักท่องเที่ยว"
                        onChange={(event) => update("rqq_placeholder", event.target.value)}
                        className={inputClass(Boolean(errors.rqq_placeholder))}
                    />
                </FormField>
            )}
            <FormField
                label="ข้อความช่วยใต้คำถาม"
                htmlFor="question_help"
                hint="ไม่บังคับ · อธิบายว่าควรตอบอะไร"
                error={errors.rqq_help}
            >
                <input
                    id="question_help"
                    value={form.rqq_help}
                    maxLength={300}
                    onChange={(event) => update("rqq_help", event.target.value)}
                    className={inputClass(false)}
                />
            </FormField>
            <Switch
                id="question_required"
                label="ต้องตอบ"
                description="ลูกค้าส่งคำขอไม่ได้ถ้ายังไม่ตอบข้อนี้ (เฉพาะตอนข้อนี้ขึ้น)"
                checked={form.rqq_is_required}
                onChange={(checked) => update("rqq_is_required", checked)}
            />
            {form.rqq_type !== "file" && (
                <Switch
                    id="question_prefill"
                    label="ลูกค้าเดิมไม่ต้องตอบซ้ำ"
                    description="ลิงก์เฉพาะลูกค้า: เติมคำตอบล่าสุดของลูกค้าคนนั้นให้ ลูกค้าแก้ได้ · เหมาะกับข้อที่ไม่ค่อยเปลี่ยน เช่น ธุรกิจทำอะไร (ไม่เหมาะกับ อยากให้เสร็จเมื่อไหร่)"
                    checked={form.rqq_prefill}
                    onChange={(checked) => update("rqq_prefill", checked)}
                />
            )}

            <details
                open={isConditionOpen}
                onToggle={(event) => setIsConditionOpen(event.currentTarget.open)}
                className="rounded-xl border border-gray-200 p-3"
            >
                <summary className="min-h-8 cursor-pointer text-sm text-gray-800">
                    ถามเมื่อไหร่ {isConditionOpen ? "" : "(ค่าเริ่มต้น: ทุกครั้งที่กลุ่มนี้ขึ้น)"}
                </summary>
                <div className="mt-3 grid gap-3">
                    <FormField
                        label="ถามเมื่อข้อด้านบนตอบว่า…"
                        htmlFor="question_parent"
                        hint="ข้อที่เลือกได้: ข้อด้านบนในกลุ่มนี้ ชนิดเลือกตอบหรือใช่/ไม่ใช่"
                        error={errors.rqq_parent_id}
                    >
                        <select
                            id="question_parent"
                            value={form.rqq_parent_id ?? ""}
                            onChange={(event) =>
                                setForm((current) => ({
                                    ...current,
                                    rqq_parent_id: event.target.value ? Number(event.target.value) : null,
                                    rqq_parent_values: [],
                                }))
                            }
                            className={inputClass(Boolean(errors.rqq_parent_id))}
                        >
                            <option value="">ไม่ขึ้นกับข้ออื่น (ถามทุกครั้งที่กลุ่มนี้ขึ้น)</option>
                            {parentChoices.map((row) => (
                                <option key={row.rqq_id} value={row.rqq_id}>
                                    ข้อ {group.questions.indexOf(row) + 1}. {row.rqq_text}
                                </option>
                            ))}
                        </select>
                    </FormField>
                    {parent && (
                        <fieldset className="grid gap-2">
                            <legend className="mb-1 text-sm text-gray-800">ถามข้อนี้เมื่อตอบว่า</legend>
                            <div className="flex flex-wrap gap-2">
                                {choiceValuesOf(parent).map((value: string) => {
                                    const isOn = form.rqq_parent_values.includes(value);
                                    const label =
                                        parent.rqq_type === "yes_no"
                                            ? YES_NO_VALUES[value as keyof typeof YES_NO_VALUES]
                                            : value;
                                    return (
                                        <label
                                            key={value}
                                            className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm ${isOn ? "border-blue-300 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-700"}`}
                                        >
                                            <input
                                                type="checkbox"
                                                className="h-4 w-4 accent-blue-600"
                                                checked={isOn}
                                                onChange={(event) =>
                                                    update(
                                                        "rqq_parent_values",
                                                        event.target.checked
                                                            ? [...form.rqq_parent_values, value]
                                                            : form.rqq_parent_values.filter((item) => item !== value),
                                                    )
                                                }
                                            />
                                            {label}
                                        </label>
                                    );
                                })}
                            </div>
                            <FieldHint error={errors.rqq_parent_values}>
                                เลือกได้หลายค่า · ลูกค้าตอบค่าใดค่าหนึ่ง ข้อนี้ขึ้นใต้ข้อนั้นทันที
                            </FieldHint>
                        </fieldset>
                    )}
                    <FormField label="ถามในลิงก์แบบไหน" htmlFor="question_audience" error={errors.rqq_audience}>
                        <select
                            id="question_audience"
                            value={form.rqq_audience}
                            onChange={(event) => update("rqq_audience", event.target.value as QuestionAudience)}
                            className={inputClass(false)}
                        >
                            {(QUESTION_AUDIENCES as QuestionAudience[]).map((audience) => (
                                <option key={audience} value={audience}>
                                    {audience === "group"
                                        ? `ตามกลุ่ม (${AUDIENCE_LABEL[group.rqg_audience]})`
                                        : AUDIENCE_LABEL[audience]}
                                </option>
                            ))}
                        </select>
                    </FormField>
                    <Switch
                        id="question_skip_preset"
                        label="ไม่ถามเมื่อทีมงานเลือกรายการให้แล้ว"
                        description="เช่น งบประมาณ · ลิงก์ที่ทีมงานล็อกแพ็กและราคาไว้แล้วไม่ต้องถาม"
                        checked={form.rqq_skip_when_preset}
                        onChange={(checked) => update("rqq_skip_when_preset", checked)}
                    />
                </div>
            </details>

            <Switch
                id="question_active"
                label="ใช้งาน"
                description="ปิด = ลูกค้าไม่เห็นข้อนี้ (ข้อที่ถามตามคำตอบของข้อนี้ก็ไม่ขึ้นด้วย)"
                checked={form.rqq_status === "active"}
                onChange={(checked) => update("rqq_status", checked ? "active" : "inactive")}
            />
            <SheetButtons isSaving={isSaving} submitLabel="บันทึกคำถาม" onClose={onClose} />
        </SheetFrame>
    );
}
