"use client";

// แท็บคำถามลูกค้า (2026-10-25 · S-2) — ชุดคำถามความต้องการของลิงก์เลือกบริการ
// กลุ่มผูกหมวดสินค้า: ลูกค้าเลือกสินค้าหมวดไหน ขึ้นคำถามของกลุ่มนั้น · กลุ่ม "ทั่วไป" ถามทุกคำขอ
// แก้ได้เฉพาะ productManagement · ลบคำถามแล้วคำตอบในคำขอเดิมยังอ่านได้ (เก็บข้อความคำถามไว้ตอนลูกค้าส่ง)
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, MessageSquareText, Pencil, Plus, Trash2 } from "lucide-react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import EmptyState from "@/components/ui/empty-state";
import FormField, { inputClass } from "@/components/ui/form-field";
import FieldHint from "@/components/ui/guidance/field-hint";
import HowItWorks from "@/components/ui/guidance/how-it-works";
import StatusBanner from "@/components/ui/guidance/status-banner";
import SectionCard from "@/components/ui/section-card";
import StatusPill from "@/components/ui/status-pill";
import Switch from "@/components/ui/switch";
import { buttonClass } from "@/components/ui/button";
import { apiFetch, type ApiError } from "@/lib/api";
import { toFieldErrors, type FieldErrors } from "@/lib/form-errors";
import { QUESTION_TYPES, QUESTION_TYPE_LABEL } from "@/lib/shared/requirement-answers.mjs";
import { requirementGroupSchema, requirementQuestionSchema } from "@/lib/shared/schemas/requirement.mjs";
import { SheetButtons, SheetFrame } from "../../../fastwork/_components/sheet-frame";
import type { ProductCategory } from "../_types";

type QuestionType = keyof typeof QUESTION_TYPE_LABEL;

type Question = {
    rqq_id: number;
    rqq_text: string;
    rqq_help: string | null;
    rqq_type: QuestionType;
    rqq_options: string[] | null;
    rqq_is_required: boolean;
    rqq_status: "active" | "inactive";
};

type Group = {
    rqg_id: number;
    rqg_name: string;
    rqg_description: string | null;
    rqg_is_general: boolean;
    rqg_sort_order: number;
    rqg_status: "active" | "inactive";
    category_ids: string[];
    package_ids: string[];
    questions: Question[];
};

type PackageChoice = { pkg_id: string; pkg_name: string; pkg_status: "active" | "inactive" };

type SheetState = { kind: "group"; group: Group | null } | { kind: "question"; group: Group; question: Question | null } | null;

export default function QuestionsTab({ categories, canEdit }: { categories: ProductCategory[]; canEdit: boolean }) {
    const [groups, setGroups] = useState<Group[] | null>(null);
    const [packages, setPackages] = useState<PackageChoice[]>([]);
    const [loadError, setLoadError] = useState<ApiError | null>(null);
    const [sheet, setSheet] = useState<SheetState>(null);
    const [deleting, setDeleting] = useState<{ label: string; path: string } | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const load = useCallback(async () => {
        const { data, error } = await apiFetch<{ data: Group[] }>("/requirement-groups");
        setLoadError(error);
        if (data) setGroups(data.data);
    }, []);

    useEffect(() => {
        let isLeftPage = false;
        Promise.all([apiFetch<{ data: Group[] }>("/requirement-groups"), apiFetch<{ data: PackageChoice[] }>("/product-packages")]).then(([groupResult, packageResult]) => {
            if (isLeftPage) return;
            setLoadError(groupResult.error);
            if (groupResult.data) setGroups(groupResult.data.data);
            setPackages(packageResult.data?.data ?? []);
        });
        return () => {
            isLeftPage = true;
        };
    }, []);

    async function move(group: Group, index: number, offset: number) {
        const order = group.questions.map((question) => question.rqq_id);
        const target = index + offset;
        if (target < 0 || target >= order.length) return;
        [order[index], order[target]] = [order[target], order[index]];
        const { error } = await apiFetch(`/requirement-groups/${group.rqg_id}/question-order`, { method: "PUT", body: { question_ids: order } });
        if (error) toast.error(error.message);
        await load();
    }

    async function confirmDelete() {
        if (!deleting) return;
        setIsDeleting(true);
        const { error } = await apiFetch(deleting.path, { method: "DELETE" });
        setIsDeleting(false);
        if (error) {
            setDeleteError(error.message);
            return;
        }
        toast.success(`ลบ${deleting.label}แล้ว`);
        setDeleting(null);
        await load();
    }

    if (loadError) {
        return (
            <StatusBanner tone={loadError.status === 403 ? "info" : "error"} title={loadError.status === 403 ? "ต้องมีสิทธิ์จัดการสินค้าหรือคำขอบริการ" : "โหลดคำถามไม่สำเร็จ"}>
                {loadError.status === 403 ? undefined : loadError.message}
            </StatusBanner>
        );
    }
    if (!groups) return <p className="text-sm text-gray-500">กำลังโหลด...</p>;

    const categoryName = (categoryId: string) => categories.find((category) => category.pc_id === categoryId)?.pc_name ?? "หมวดที่ถูกลบ";

    return (
        <div className="grid gap-5">
            <HowItWorks label="คำถามขึ้นให้ลูกค้าอย่างไร">
                <p>ลูกค้าเลือกบริการในลิงก์เลือกบริการแล้ว ระบบถามกลุ่ม &quot;ถามทุกคำขอ&quot; + กลุ่มที่ผูกกับหมวดของสินค้าที่เลือก (กลุ่มเดียวกันถามครั้งเดียว)</p>
                <p>กลุ่มที่ยังไม่ผูกหมวดและไม่ได้ตั้งให้ถามทุกคำขอ จะไม่ขึ้นให้ลูกค้า · แก้หรือลบคำถามแล้ว คำตอบในคำขอเดิมยังอ่านได้ตามคำถามเดิม</p>
            </HowItWorks>
            {canEdit && (
                <button type="button" className={`${buttonClass("primary", "md")} justify-self-start`} onClick={() => setSheet({ kind: "group", group: null })}>
                    <Plus size={16} />
                    เพิ่มกลุ่มคำถาม
                </button>
            )}
            {groups.length === 0 && <EmptyState title="ยังไม่มีคำถาม" description='กด "เพิ่มกลุ่มคำถาม" แล้วเพิ่มคำถามที่ควรถามลูกค้า' />}
            {groups.map((group) => {
                const isUnused = !group.rqg_is_general && group.category_ids.length === 0 && group.package_ids.length === 0;
                const packageName = (packageId: string) => packages.find((row) => row.pkg_id === packageId)?.pkg_name ?? "ชุดที่ถูกลบ";
                const conditions = [
                    group.category_ids.length > 0 ? `หมวด: ${group.category_ids.map(categoryName).join(", ")}` : null,
                    group.package_ids.length > 0 ? `ชุด: ${group.package_ids.map(packageName).join(", ")}` : null,
                ].filter(Boolean);
                return (
                    <SectionCard
                        key={group.rqg_id}
                        icon={MessageSquareText}
                        title={group.rqg_name}
                        description={
                            group.rqg_is_general
                                ? "ถามทุกคำขอ"
                                : conditions.length > 0
                                  ? `ถามเมื่อเลือก ${conditions.join(" หรือ ")}`
                                  : "ยังไม่ได้ผูกหมวดหรือชุด (ลูกค้ายังไม่เห็น)"
                        }
                        actions={
                            canEdit && (
                                <div className="flex flex-wrap gap-2">
                                    <button type="button" className={buttonClass("secondary", "sm")} onClick={() => setSheet({ kind: "question", group, question: null })}>
                                        <Plus size={15} />
                                        คำถาม
                                    </button>
                                    <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setSheet({ kind: "group", group })}>
                                        <Pencil size={15} />
                                        แก้กลุ่ม
                                    </button>
                                </div>
                            )
                        }
                    >
                        {(isUnused || group.rqg_status === "inactive") && (
                            <FieldHint error={null}>
                                {group.rqg_status === "inactive" ? "กลุ่มนี้ปิดใช้งาน ลูกค้าไม่เห็น" : "แก้กลุ่มแล้วเลือกหมวด หรือตั้งให้ถามทุกคำขอ"}
                            </FieldHint>
                        )}
                        {group.questions.length === 0 ? (
                            <p className="text-sm text-gray-500">ยังไม่มีคำถามในกลุ่มนี้</p>
                        ) : (
                            <ol className="grid gap-2">
                                {group.questions.map((question, index) => (
                                    <li key={question.rqq_id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-100 p-3">
                                        <div className="grid min-w-0 flex-1 basis-60 gap-1">
                                            <span className={`text-sm wrap-break-word ${question.rqq_status === "inactive" ? "text-gray-400" : "text-gray-900"}`}>
                                                {index + 1}. {question.rqq_text}
                                                {question.rqq_is_required && <span className="ml-0.5 text-red-600">*</span>}
                                            </span>
                                            <span className="flex flex-wrap gap-1.5">
                                                <StatusPill tone="neutral">{QUESTION_TYPE_LABEL[question.rqq_type]}</StatusPill>
                                                {question.rqq_status === "inactive" && <StatusPill tone="wait">ปิดใช้งาน</StatusPill>}
                                                {question.rqq_options && <span className="text-xs text-gray-500">{question.rqq_options.join(" · ")}</span>}
                                            </span>
                                        </div>
                                        {canEdit && (
                                            <div className="flex gap-1">
                                                <button type="button" aria-label="เลื่อนขึ้น" className={buttonClass("ghost", "sm")} disabled={index === 0} onClick={() => move(group, index, -1)}>
                                                    <ArrowUp size={15} />
                                                </button>
                                                <button type="button" aria-label="เลื่อนลง" className={buttonClass("ghost", "sm")} disabled={index === group.questions.length - 1} onClick={() => move(group, index, 1)}>
                                                    <ArrowDown size={15} />
                                                </button>
                                                <button type="button" aria-label="แก้คำถาม" className={buttonClass("ghost", "sm")} onClick={() => setSheet({ kind: "question", group, question })}>
                                                    <Pencil size={15} />
                                                </button>
                                                <button type="button" aria-label="ลบคำถาม" className={buttonClass("ghost", "sm")} onClick={() => setDeleting({ label: "คำถาม", path: `/requirement-questions/${question.rqq_id}` })}>
                                                    <Trash2 size={15} />
                                                </button>
                                            </div>
                                        )}
                                    </li>
                                ))}
                            </ol>
                        )}
                    </SectionCard>
                );
            })}

            {sheet?.kind === "group" && (
                <GroupSheet
                    group={sheet.group}
                    categories={categories}
                    packages={packages}
                    onClose={() => setSheet(null)}
                    onSaved={load}
                    onDelete={(group) => {
                        setSheet(null);
                        setDeleting({ label: `กลุ่ม ${group.rqg_name}`, path: `/requirement-groups/${group.rqg_id}` });
                    }}
                />
            )}
            {sheet?.kind === "question" && <QuestionSheet group={sheet.group} question={sheet.question} onClose={() => setSheet(null)} onSaved={load} />}
            <ConfirmDialog
                open={deleting !== null}
                title={`ลบ${deleting?.label ?? ""}?`}
                consequences={["คำตอบในคำขอที่ส่งไปแล้วยังอ่านได้ตามคำถามเดิม", "ลูกค้าที่เปิดลิงก์หลังจากนี้จะไม่เห็นอีก (ปิดใช้งานแทนได้ถ้าอยากเก็บไว้)"]}
                confirmLabel="ลบ"
                loading={isDeleting}
                errorMessage={deleteError}
                onConfirm={confirmDelete}
                onCancel={() => {
                    setDeleting(null);
                    setDeleteError(null);
                }}
            />
        </div>
    );
}

function GroupSheet({
    group,
    categories,
    packages,
    onClose,
    onSaved,
    onDelete,
}: {
    group: Group | null;
    categories: ProductCategory[];
    packages: PackageChoice[];
    onClose: () => void;
    onSaved: () => Promise<void>;
    onDelete: (group: Group) => void;
}) {
    const [form, setForm] = useState({
        rqg_name: group?.rqg_name ?? "",
        rqg_description: group?.rqg_description ?? "",
        rqg_is_general: group?.rqg_is_general ?? false,
        rqg_sort_order: group?.rqg_sort_order ?? 0,
        rqg_status: group?.rqg_status ?? ("active" as const),
        category_ids: group?.category_ids ?? ([] as string[]),
        package_ids: group?.package_ids ?? ([] as string[]),
    });
    const [errors, setErrors] = useState<FieldErrors>({});
    const [isSaving, setIsSaving] = useState(false);

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        const checked = requirementGroupSchema.safeParse(form);
        if (!checked.success) {
            setErrors(toFieldErrors(checked.error.issues));
            return;
        }
        setIsSaving(true);
        const { error } = await apiFetch(group ? `/requirement-groups/${group.rqg_id}` : "/requirement-groups", { method: group ? "PUT" : "POST", body: checked.data });
        setIsSaving(false);
        if (error) {
            setErrors({ ...error.fields, _form: Object.keys(error.fields).length === 0 ? error.message : "" });
            return;
        }
        toast.success("บันทึกกลุ่มแล้ว");
        await onSaved();
        onClose();
    }

    return (
        <SheetFrame titleId="group-title" title={group ? "แก้กลุ่มคำถาม" : "เพิ่มกลุ่มคำถาม"} subtitle="กลุ่มผูกหมวดสินค้า ลูกค้าเลือกหมวดไหนเห็นกลุ่มนั้น" onClose={onClose} onSubmit={submit}>
            {errors._form && <StatusBanner tone="error" title="บันทึกไม่สำเร็จ">{errors._form}</StatusBanner>}
            <FormField label="ชื่อกลุ่ม" htmlFor="group_name" required error={errors.rqg_name}>
                <input id="group_name" value={form.rqg_name} maxLength={100} onChange={(event) => setForm({ ...form, rqg_name: event.target.value })} className={inputClass(Boolean(errors.rqg_name))} />
            </FormField>
            <FormField label="คำอธิบาย (ภายใน)" htmlFor="group_description" hint="ไม่บังคับ" error={errors.rqg_description}>
                <input id="group_description" value={form.rqg_description} maxLength={500} onChange={(event) => setForm({ ...form, rqg_description: event.target.value })} className={inputClass(false)} />
            </FormField>
            <Switch id="group_general" label="ถามทุกคำขอ" description="เปิด = ถามทุกคนไม่ว่าเลือกอะไร (ไม่ต้องผูกหมวด)" checked={form.rqg_is_general} onChange={(checked) => setForm({ ...form, rqg_is_general: checked })} />
            {!form.rqg_is_general && (
                <fieldset className="grid gap-2">
                    <legend className="mb-1 text-sm text-gray-800">ถามเมื่อลูกค้าเลือกหมวด</legend>
                    <div className="flex flex-wrap gap-2">
                        {categories.map((category) => {
                            const isOn = form.category_ids.includes(category.pc_id);
                            return (
                                <label key={category.pc_id} className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm ${isOn ? "border-blue-300 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-700"}`}>
                                    <input
                                        type="checkbox"
                                        className="h-4 w-4 accent-blue-600"
                                        checked={isOn}
                                        onChange={(event) =>
                                            setForm({ ...form, category_ids: event.target.checked ? [...form.category_ids, category.pc_id] : form.category_ids.filter((id) => id !== category.pc_id) })
                                        }
                                    />
                                    {category.pc_name}
                                </label>
                            );
                        })}
                    </div>
                    <FieldHint error={errors.category_ids}>{categories.length === 0 ? "ยังไม่มีหมวด เพิ่มได้ที่แท็บหมวดหมู่" : "เลือกได้หลายหมวด"}</FieldHint>
                </fieldset>
            )}
            {!form.rqg_is_general && (
                <fieldset className="grid gap-2">
                    <legend className="mb-1 text-sm text-gray-800">หรือถามเมื่อลูกค้าเลือกชุดบริการ</legend>
                    <div className="flex flex-wrap gap-2">
                        {packages
                            .filter((row) => row.pkg_status === "active" || form.package_ids.includes(row.pkg_id))
                            .map((row) => {
                                const isOn = form.package_ids.includes(row.pkg_id);
                                return (
                                    <label key={row.pkg_id} className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm ${isOn ? "border-blue-300 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-700"}`}>
                                        <input
                                            type="checkbox"
                                            className="h-4 w-4 accent-blue-600"
                                            checked={isOn}
                                            onChange={(event) =>
                                                setForm({ ...form, package_ids: event.target.checked ? [...form.package_ids, row.pkg_id] : form.package_ids.filter((id) => id !== row.pkg_id) })
                                            }
                                        />
                                        {row.pkg_name}
                                    </label>
                                );
                            })}
                    </div>
                    <FieldHint error={errors.package_ids}>เช่น กลุ่ม &quot;ระบบที่ต้องการ&quot; ถามเฉพาะคนที่เลือกแพ็กเว็บ + ระบบ · ผูกทั้งหมวดและชุดได้ (เข้าเงื่อนไขข้อใดข้อหนึ่ง = ถาม)</FieldHint>
                </fieldset>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="ลำดับ" htmlFor="group_order" hint="น้อยขึ้นก่อน" error={errors.rqg_sort_order}>
                    <input id="group_order" inputMode="numeric" value={form.rqg_sort_order} onChange={(event) => setForm({ ...form, rqg_sort_order: Number(event.target.value) || 0 })} className={inputClass(Boolean(errors.rqg_sort_order))} />
                </FormField>
                <FormField label="สถานะ" htmlFor="group_status" error={errors.rqg_status}>
                    <select id="group_status" value={form.rqg_status} onChange={(event) => setForm({ ...form, rqg_status: event.target.value as "active" | "inactive" })} className={inputClass(false)}>
                        <option value="active">ใช้งาน</option>
                        <option value="inactive">ปิดใช้งาน</option>
                    </select>
                </FormField>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
                {group ? (
                    <button type="button" className={buttonClass("ghost", "md")} onClick={() => onDelete(group)}>
                        <Trash2 size={16} />
                        ลบกลุ่ม
                    </button>
                ) : (
                    <span />
                )}
                <SheetButtons isSaving={isSaving} submitLabel="บันทึกกลุ่ม" onClose={onClose} />
            </div>
        </SheetFrame>
    );
}

function QuestionSheet({ group, question, onClose, onSaved }: { group: Group; question: Question | null; onClose: () => void; onSaved: () => Promise<void> }) {
    const [form, setForm] = useState({
        rqq_text: question?.rqq_text ?? "",
        rqq_help: question?.rqq_help ?? "",
        rqq_type: question?.rqq_type ?? ("short_text" as QuestionType),
        options_text: (question?.rqq_options ?? []).join("\n"),
        rqq_is_required: question?.rqq_is_required ?? false,
        rqq_status: question?.rqq_status ?? ("active" as const),
    });
    const [errors, setErrors] = useState<FieldErrors>({});
    const [isSaving, setIsSaving] = useState(false);
    const needsOptions = form.rqq_type === "single" || form.rqq_type === "multi";

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        const body = {
            rqq_text: form.rqq_text,
            rqq_help: form.rqq_help,
            rqq_type: form.rqq_type,
            rqq_options: form.options_text.split("\n").map((line) => line.trim()).filter(Boolean),
            rqq_is_required: form.rqq_is_required,
            rqq_status: form.rqq_status,
        };
        const checked = requirementQuestionSchema.safeParse(body);
        if (!checked.success) {
            setErrors(toFieldErrors(checked.error.issues));
            return;
        }
        setIsSaving(true);
        const { error } = await apiFetch(question ? `/requirement-questions/${question.rqq_id}` : `/requirement-groups/${group.rqg_id}/questions`, {
            method: question ? "PUT" : "POST",
            body: checked.data,
        });
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
        <SheetFrame titleId="question-title" title={question ? "แก้คำถาม" : "เพิ่มคำถาม"} subtitle={`กลุ่ม ${group.rqg_name}`} onClose={onClose} onSubmit={submit}>
            {errors._form && <StatusBanner tone="error" title="บันทึกไม่สำเร็จ">{errors._form}</StatusBanner>}
            <FormField label="คำถาม" htmlFor="question_text" required error={errors.rqq_text}>
                <input id="question_text" value={form.rqq_text} maxLength={300} onChange={(event) => setForm({ ...form, rqq_text: event.target.value })} className={inputClass(Boolean(errors.rqq_text))} />
            </FormField>
            <FormField label="ข้อความช่วยใต้คำถาม" htmlFor="question_help" hint="ไม่บังคับ เช่น ตัวอย่างคำตอบ" error={errors.rqq_help}>
                <input id="question_help" value={form.rqq_help} maxLength={300} onChange={(event) => setForm({ ...form, rqq_help: event.target.value })} className={inputClass(false)} />
            </FormField>
            <FormField label="ชนิดคำตอบ" htmlFor="question_type" required error={errors.rqq_type}>
                <select id="question_type" value={form.rqq_type} onChange={(event) => setForm({ ...form, rqq_type: event.target.value as QuestionType })} className={inputClass(false)}>
                    {QUESTION_TYPES.map((type) => (
                        <option key={type} value={type}>
                            {QUESTION_TYPE_LABEL[type as QuestionType]}
                        </option>
                    ))}
                </select>
            </FormField>
            {needsOptions && (
                <FormField label="ตัวเลือก" htmlFor="question_options" required hint="บรรทัดละข้อ อย่างน้อย 2 ข้อ" error={errors.rqq_options}>
                    <textarea id="question_options" rows={4} value={form.options_text} onChange={(event) => setForm({ ...form, options_text: event.target.value })} className={inputClass(Boolean(errors.rqq_options))} />
                </FormField>
            )}
            {form.rqq_type === "file" && <FieldHint>ลูกค้าแนบรูป (JPG/PNG) หรือ PDF ได้ ไฟล์ละไม่เกิน 10 MB ไม่เกิน 5 ไฟล์</FieldHint>}
            <Switch id="question_required" label="ต้องตอบ" description="ลูกค้าส่งคำขอไม่ได้ถ้ายังไม่ตอบข้อนี้" checked={form.rqq_is_required} onChange={(checked) => setForm({ ...form, rqq_is_required: checked })} />
            <Switch id="question_active" label="ใช้งาน" description="ปิด = ลูกค้าไม่เห็นข้อนี้ (เก็บไว้ใช้ภายหลังได้)" checked={form.rqq_status === "active"} onChange={(checked) => setForm({ ...form, rqq_status: checked ? "active" : "inactive" })} />
            <SheetButtons isSaving={isSaving} submitLabel="บันทึกคำถาม" onClose={onClose} />
        </SheetFrame>
    );
}
