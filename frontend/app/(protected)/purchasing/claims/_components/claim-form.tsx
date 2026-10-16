"use client";

// ฟอร์มใบเบิกเงินพนักงาน (ขั้น 2-3) — มือถือเป็นหลัก: รูปใบเสร็จก่อน → รายละเอียด → ยอด · บันทึกร่างแล้วไปหน้าดูเพื่อส่ง
// ผู้เบิก = ผู้ใช้ที่ login เสมอ · บาทเท่านั้น · ไม่หัก ณ ที่จ่าย · ยอดคิดด้วยสูตรเดียวกับ backend (backend คิดซ้ำตอนบันทึก)
// รูปที่เลือกในฟอร์มอัปโหลดหลังบันทึกร่างสำเร็จ (ต้องมีรหัสใบก่อน) — ที่อัปโหลดไม่ผ่านแนบใหม่ได้ที่หน้าดู
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, FileText, ListChecks, Plus, Trash2, X } from "lucide-react";
import FormField, { inputClass } from "@/components/ui/form-field";
import SectionCard from "@/components/ui/section-card";
import SearchableSelect, { type SelectOption } from "@/components/ui/SearchableSelect";
import StatusBanner from "@/components/ui/guidance/status-banner";
import FieldHint from "@/components/ui/guidance/field-hint";
import SaveErrorBanner from "@/components/ui/save-error-banner";
import Switch from "@/components/ui/switch";
import { buttonClass } from "@/components/ui/button";
import { apiFetch, type ApiError } from "@/lib/api";
import { toFieldErrors, type FieldErrors } from "@/lib/form-errors";
import { formatAmount } from "@/lib/shared/money.mjs";
import { calculateExpense } from "@/lib/shared/expense-totals.mjs";
import { EXPENSE_DOC_TYPES, MAX_EXPENSE_ATTACHMENTS, expenseClaimDraftSchema } from "@/lib/shared/schemas/expense.mjs";
import type { ExpenseOptions } from "../../expenses/_hooks/use-expense-options";
import { DOC_TYPE_LABELS, fileSizeLabel } from "../../expenses/_messages";
import type { ExpenseDetail, ExpenseDocType } from "../../expenses/_types";
import { CLAIM_MESSAGES } from "../_messages";

type LineForm = {
    rowKey: string;
    exl_category_id: string;
    exl_project_id: string;
    project_label: string | null;
    exl_description: string;
    exl_unit_price: string;
};

type FormState = {
    ex_title: string;
    ex_branch_id: string;
    ex_merchant_name: string;
    ex_vendor_doc_no: string;
    ex_doc_type: ExpenseDocType;
    ex_expense_date: string;
    has_vat: boolean;
    ex_vat_amount: string;
    ex_notes: string;
    lines: LineForm[];
};

let rowCounter = 0;
function newRowKey() {
    rowCounter += 1;
    return `claim-line-${rowCounter}`;
}

function emptyLine(categoryId = ""): LineForm {
    return {
        rowKey: newRowKey(),
        exl_category_id: categoryId,
        exl_project_id: "",
        project_label: null,
        exl_description: "",
        exl_unit_price: "",
    };
}

function defaultBranchId(options: ExpenseOptions) {
    const activeBranches = options.branches.filter((branch) => branch.branch_status === "active");
    const userBranch = activeBranches.find((branch) => branch.branch_id === options.userBranchId);
    return (userBranch ?? activeBranches.find((branch) => branch.is_head_office) ?? activeBranches[0])?.branch_id ?? "";
}

function emptyState(options: ExpenseOptions): FormState {
    return {
        ex_title: "",
        ex_branch_id: defaultBranchId(options),
        ex_merchant_name: "",
        ex_vendor_doc_no: "",
        ex_doc_type: "receipt",
        ex_expense_date: options.today,
        has_vat: false,
        ex_vat_amount: "",
        ex_notes: "",
        lines: [emptyLine()],
    };
}

function stateFromDetail(detail: ExpenseDetail): FormState {
    const expense = detail.expense;
    const hasVat = Number(expense.ex_vat_amount) > 0;
    return {
        ex_title: expense.ex_title,
        ex_branch_id: expense.ex_branch_id,
        ex_merchant_name: expense.ex_merchant_name ?? "",
        ex_vendor_doc_no: expense.ex_vendor_doc_no ?? "",
        ex_doc_type: expense.ex_doc_type,
        ex_expense_date: expense.ex_expense_date,
        has_vat: hasVat,
        ex_vat_amount: hasVat ? expense.ex_vat_amount : "",
        ex_notes: expense.ex_notes ?? "",
        lines: detail.lines.map((line) => ({
            rowKey: newRowKey(),
            exl_category_id: String(line.exl_category_id),
            exl_project_id: line.exl_project_id ?? "",
            project_label: line.project_name,
            exl_description: line.exl_description,
            exl_unit_price: line.exl_amount,
        })),
    };
}

function textOrNull(value: string) {
    return value.trim() === "" ? null : value.trim();
}

/** ฟอร์ม → body ของ POST/PUT /claims · ใบเสร็จวันที่เดียวกับวันที่จ่าย (ฟอร์มไม่ถามแยก — ลดช่องบนมือถือ) */
function toPayload(form: FormState, version: number | null) {
    return {
        ex_title: form.ex_title,
        ex_branch_id: form.ex_branch_id,
        ex_merchant_name: textOrNull(form.ex_merchant_name),
        ex_vendor_doc_no: textOrNull(form.ex_vendor_doc_no),
        ex_vendor_doc_date: form.ex_expense_date || null,
        ex_doc_type: form.ex_doc_type,
        ex_expense_date: form.ex_expense_date,
        ex_vat_amount: form.has_vat ? form.ex_vat_amount.trim() || "0" : "0",
        ex_notes: textOrNull(form.ex_notes),
        ex_version: version,
        lines: form.lines.map((line) => ({
            exl_category_id: line.exl_category_id === "" ? null : Number(line.exl_category_id),
            exl_project_id: textOrNull(line.exl_project_id),
            exl_description: line.exl_description,
            exl_quantity: "1",
            exl_unit_price: line.exl_unit_price.trim(),
        })),
    };
}

// ตัวเลขที่ยังพิมพ์ไม่ครบ → คิดเป็น 0 ระหว่างพิมพ์ (ข้อผิดพลาดจริงแสดงตอนกดบันทึก)
function liveNumber(value: string) {
    const text = value.trim().replace(/,/g, "");
    return /^\d+(\.\d{1,2})?$/.test(text) ? text : "0";
}

async function loadProjectOptions(search: string, current: SelectOption | null): Promise<SelectOption[]> {
    const { data } = await apiFetch<{
        data: { project_id: string; project_name: string; client_name: string | null }[];
    }>(`/claims/project-options?${new URLSearchParams({ search })}`);
    const found = (data?.data ?? []).map((project) => ({
        value: project.project_id,
        label: project.client_name ? `${project.project_name} · ${project.client_name}` : project.project_name,
    }));
    const none = { value: "", label: "ไม่เกี่ยวกับโปรเจกต์" };
    const hasCurrent = current && found.some((option) => String(option.value) === String(current.value));
    return [none, ...(current && !hasCurrent && !search ? [current] : []), ...found];
}

export default function ClaimForm({ options, detail }: { options: ExpenseOptions; detail?: ExpenseDetail }) {
    const router = useRouter();
    const [form, setForm] = useState<FormState>(() => (detail ? stateFromDetail(detail) : emptyState(options)));
    const [pendingFiles, setPendingFiles] = useState<File[]>([]);
    const fileInput = useRef<HTMLInputElement>(null);
    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
    const [saveError, setSaveError] = useState<ApiError | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isDirty, setIsDirty] = useState(false);

    const categories = options.setup.categories;
    const activeBranches = options.branches.filter(
        (branch) => branch.branch_status === "active" || branch.branch_id === form.ex_branch_id,
    );
    const existingCount = detail?.attachments.length ?? 0;
    const officialVatRate = options.vat_rate_today ?? "0";

    const calculation = useMemo(
        () =>
            calculateExpense({
                lines: form.lines.map((line) => ({
                    exl_quantity: "1",
                    exl_unit_price: liveNumber(line.exl_unit_price),
                })),
                vatAmount: form.has_vat ? liveNumber(form.ex_vat_amount) : "0",
                vatRate: officialVatRate,
            }),
        [form.lines, form.has_vat, form.ex_vat_amount, officialVatRate],
    );

    useEffect(() => {
        if (!isDirty) return;
        function warn(event: BeforeUnloadEvent) {
            event.preventDefault();
        }
        window.addEventListener("beforeunload", warn);
        return () => window.removeEventListener("beforeunload", warn);
    }, [isDirty]);

    function update(changes: Partial<FormState>) {
        setForm((current) => ({ ...current, ...changes }));
        setIsDirty(true);
    }

    function updateLine(rowKey: string, changes: Partial<LineForm>) {
        setForm((current) => ({
            ...current,
            lines: current.lines.map((line) => (line.rowKey === rowKey ? { ...line, ...changes } : line)),
        }));
        setIsDirty(true);
    }

    function addFiles(files: FileList | null) {
        if (!files) return;
        const room = MAX_EXPENSE_ATTACHMENTS - existingCount - pendingFiles.length;
        const picked = Array.from(files).slice(0, Math.max(room, 0));
        if (picked.length < files.length) toast.error(`แนบได้ไม่เกิน ${MAX_EXPENSE_ATTACHMENTS} ไฟล์ต่อใบ`);
        setPendingFiles((current) => [...current, ...picked]);
        setIsDirty(true);
        if (fileInput.current) fileInput.current.value = "";
    }

    async function uploadPending(claimId: string) {
        let failed = 0;
        for (const file of pendingFiles) {
            const body = new FormData();
            body.append("file", file);
            const { error } = await apiFetch(`/claims/${claimId}/attachments`, { method: "POST", body });
            if (error) failed += 1;
        }
        if (failed > 0)
            toast.error(`แนบรูปไม่สำเร็จ ${failed} ไฟล์ — แนบใหม่ได้ที่หน้าใบเบิก (JPG, PNG หรือ PDF ไม่เกิน 10 MB)`);
    }

    async function handleSave(event: React.FormEvent) {
        event.preventDefault();
        setSaveError(null);
        const checked = expenseClaimDraftSchema.safeParse(toPayload(form, detail?.expense.ex_version ?? null));
        if (!checked.success) {
            setFieldErrors(toFieldErrors(checked.error.issues));
            toast.error("ยังบันทึกไม่ได้ — แก้ช่องที่มีข้อความสีแดงก่อน");
            return;
        }
        setFieldErrors({});
        setIsSaving(true);
        const result = detail
            ? await apiFetch<{ ex_id: string }>(`/claims/${detail.expense.ex_id}`, {
                  method: "PUT",
                  body: checked.data,
              })
            : await apiFetch<{ ex_id: string }>("/claims", { method: "POST", body: checked.data });
        if (result.error) {
            setIsSaving(false);
            setFieldErrors(result.error.fields);
            setSaveError(result.error);
            return;
        }
        const claimId = detail?.expense.ex_id ?? result.data.ex_id;
        await uploadPending(claimId);
        setIsSaving(false);
        setIsDirty(false);
        toast.success("บันทึกร่างแล้ว — ตรวจแล้วกดส่งเบิก");
        router.push(`/purchasing/claims/view?id=${claimId}`);
    }

    return (
        <form onSubmit={handleSave} noValidate className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
            <div className="grid min-w-0 grid-cols-1 gap-5">
                {detail?.expense.ex_returned_reason && (
                    <StatusBanner tone="warn" title="ใบเบิกนี้ถูกตีกลับ">
                        เหตุผล: {detail.expense.ex_returned_reason} — แก้แล้วส่งใหม่ได้
                    </StatusBanner>
                )}

                <SectionCard icon={Camera} title="รูปใบเสร็จ" description={CLAIM_MESSAGES.receiptFirst}>
                    <div className="grid gap-3">
                        {existingCount > 0 && (
                            <FieldHint>มีรูปแนบแล้ว {existingCount} ไฟล์ — ดู/ลบได้ที่หน้าใบเบิก</FieldHint>
                        )}
                        {pendingFiles.length > 0 && (
                            <ul className="grid gap-2">
                                {pendingFiles.map((file, index) => (
                                    <li
                                        key={`${file.name}-${index}`}
                                        className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm"
                                    >
                                        <span className="min-w-0 wrap-break-word text-gray-700">
                                            {file.name}
                                            <span className="text-xs text-gray-500"> · {fileSizeLabel(file.size)}</span>
                                        </span>
                                        <button
                                            type="button"
                                            aria-label={`เอา ${file.name} ออก`}
                                            className={buttonClass("ghost", "sm")}
                                            onClick={() =>
                                                setPendingFiles((current) =>
                                                    current.filter((_, fileIndex) => fileIndex !== index),
                                                )
                                            }
                                        >
                                            <X size={15} />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <input
                            ref={fileInput}
                            type="file"
                            multiple
                            accept="image/jpeg,image/png,application/pdf"
                            className="hidden"
                            onChange={(event) => addFiles(event.target.files)}
                        />
                        <button
                            type="button"
                            className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50/50 px-4 py-6 text-blue-600 transition hover:bg-blue-50 disabled:opacity-60"
                            disabled={existingCount + pendingFiles.length >= MAX_EXPENSE_ATTACHMENTS}
                            onClick={() => fileInput.current?.click()}
                        >
                            <Camera size={26} />
                            <span className="font-medium">ถ่ายรูป / เลือกไฟล์ใบเสร็จ</span>
                            <span className="text-xs text-gray-500">JPG, PNG หรือ PDF · หลายไฟล์ได้</span>
                        </button>
                        {pendingFiles.length > 0 && <FieldHint>รูปจะอัปโหลดตอนกดบันทึก</FieldHint>}
                    </div>
                </SectionCard>

                <SectionCard icon={FileText} title="รายละเอียด">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <FormField
                            label="เรื่อง"
                            htmlFor="ex_title"
                            required
                            error={fieldErrors.ex_title}
                            className="sm:col-span-2"
                            hint="เช่น ค่าแท็กซี่ไปพบลูกค้า / ค่าอาหารประชุมทีม"
                        >
                            <input
                                id="ex_title"
                                value={form.ex_title}
                                onChange={(event) => update({ ex_title: event.target.value })}
                                className={inputClass(Boolean(fieldErrors.ex_title))}
                            />
                        </FormField>
                        <FormField
                            label="วันที่จ่าย"
                            htmlFor="ex_expense_date"
                            required
                            error={fieldErrors.ex_expense_date}
                            hint="วันที่ในใบเสร็จ · ย้อนได้ 1 ปี"
                        >
                            <input
                                id="ex_expense_date"
                                type="date"
                                value={form.ex_expense_date}
                                onChange={(event) => update({ ex_expense_date: event.target.value })}
                                className={inputClass(Boolean(fieldErrors.ex_expense_date))}
                            />
                        </FormField>
                        <FormField
                            label="ร้านค้า / ผู้รับเงิน"
                            htmlFor="ex_merchant_name"
                            error={fieldErrors.ex_merchant_name}
                            hint={CLAIM_MESSAGES.merchant}
                        >
                            <input
                                id="ex_merchant_name"
                                value={form.ex_merchant_name}
                                onChange={(event) => update({ ex_merchant_name: event.target.value })}
                                className={inputClass(Boolean(fieldErrors.ex_merchant_name))}
                            />
                        </FormField>
                        <FormField
                            label="ชนิดเอกสาร"
                            htmlFor="ex_doc_type"
                            error={fieldErrors.ex_doc_type}
                            hint={CLAIM_MESSAGES.docType}
                        >
                            <select
                                id="ex_doc_type"
                                value={form.ex_doc_type}
                                onChange={(event) => update({ ex_doc_type: event.target.value as ExpenseDocType })}
                                className={inputClass(Boolean(fieldErrors.ex_doc_type))}
                            >
                                {(EXPENSE_DOC_TYPES as ExpenseDocType[])
                                    .filter((type) => type !== "invoice")
                                    .map((type) => (
                                        <option key={type} value={type}>
                                            {DOC_TYPE_LABELS[type]}
                                        </option>
                                    ))}
                            </select>
                        </FormField>
                        <FormField
                            label="เลขที่ใบเสร็จ"
                            htmlFor="ex_vendor_doc_no"
                            error={fieldErrors.ex_vendor_doc_no}
                            hint={CLAIM_MESSAGES.receiptNo}
                        >
                            <input
                                id="ex_vendor_doc_no"
                                value={form.ex_vendor_doc_no}
                                onChange={(event) => update({ ex_vendor_doc_no: event.target.value })}
                                className={inputClass(Boolean(fieldErrors.ex_vendor_doc_no))}
                            />
                        </FormField>
                        {activeBranches.length > 1 && (
                            <FormField
                                label="สาขา"
                                htmlFor="ex_branch_id"
                                required
                                error={fieldErrors.ex_branch_id}
                                hint="สาขาที่ทำงานนี้"
                            >
                                <select
                                    id="ex_branch_id"
                                    value={form.ex_branch_id}
                                    onChange={(event) => update({ ex_branch_id: event.target.value })}
                                    className={inputClass(Boolean(fieldErrors.ex_branch_id))}
                                >
                                    {activeBranches.map((branch) => (
                                        <option key={branch.branch_id} value={branch.branch_id}>
                                            {branch.branch_code} · {branch.branch_name_th}
                                        </option>
                                    ))}
                                </select>
                            </FormField>
                        )}
                    </div>
                </SectionCard>

                <SectionCard
                    icon={ListChecks}
                    title="ยอดที่เบิก"
                    description="ใบเสร็จเดียวมีหลายหมวดได้ เช่น ค่าอาหาร + ค่าเดินทาง"
                >
                    <div className="grid gap-3">
                        {form.lines.map((line, index) => {
                            const prefix = `lines.${index}`;
                            const projectCurrent = line.exl_project_id
                                ? { value: line.exl_project_id, label: line.project_label ?? line.exl_project_id }
                                : null;
                            return (
                                <div
                                    key={line.rowKey}
                                    className="grid gap-3 rounded-xl border border-gray-200 p-3 sm:p-4"
                                >
                                    {form.lines.length > 1 && (
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-sm font-medium text-gray-700">
                                                รายการ {index + 1}
                                            </span>
                                            <button
                                                type="button"
                                                aria-label={`ลบรายการ ${index + 1}`}
                                                className={buttonClass("ghost", "sm")}
                                                onClick={() =>
                                                    update({
                                                        lines: form.lines.filter((item) => item.rowKey !== line.rowKey),
                                                    })
                                                }
                                            >
                                                <Trash2 size={15} />
                                            </button>
                                        </div>
                                    )}
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <FormField
                                            label="หมวด"
                                            htmlFor={`${prefix}.exl_category_id`}
                                            required
                                            error={fieldErrors[`${prefix}.exl_category_id`]}
                                        >
                                            <select
                                                id={`${prefix}.exl_category_id`}
                                                value={line.exl_category_id}
                                                onChange={(event) =>
                                                    updateLine(line.rowKey, { exl_category_id: event.target.value })
                                                }
                                                className={inputClass(
                                                    Boolean(fieldErrors[`${prefix}.exl_category_id`]),
                                                )}
                                            >
                                                <option value="">— เลือกหมวด —</option>
                                                {categories
                                                    .filter(
                                                        (category) =>
                                                            category.ec_status === "active" ||
                                                            String(category.ec_id) === line.exl_category_id,
                                                    )
                                                    .map((category) => (
                                                        <option key={category.ec_id} value={category.ec_id}>
                                                            {category.ec_name_th}
                                                        </option>
                                                    ))}
                                            </select>
                                        </FormField>
                                        <FormField
                                            label="ยอด (บาท)"
                                            htmlFor={`${prefix}.exl_unit_price`}
                                            required
                                            error={fieldErrors[`${prefix}.exl_unit_price`]}
                                            hint={index === 0 ? CLAIM_MESSAGES.amount : undefined}
                                        >
                                            <input
                                                id={`${prefix}.exl_unit_price`}
                                                inputMode="decimal"
                                                placeholder="0.00"
                                                value={line.exl_unit_price}
                                                onChange={(event) =>
                                                    updateLine(line.rowKey, { exl_unit_price: event.target.value })
                                                }
                                                className={inputClass(Boolean(fieldErrors[`${prefix}.exl_unit_price`]))}
                                            />
                                        </FormField>
                                        <FormField
                                            label="รายละเอียด"
                                            htmlFor={`${prefix}.exl_description`}
                                            required
                                            error={fieldErrors[`${prefix}.exl_description`]}
                                            className="sm:col-span-2"
                                        >
                                            <input
                                                id={`${prefix}.exl_description`}
                                                value={line.exl_description}
                                                onChange={(event) =>
                                                    updateLine(line.rowKey, { exl_description: event.target.value })
                                                }
                                                className={inputClass(
                                                    Boolean(fieldErrors[`${prefix}.exl_description`]),
                                                )}
                                            />
                                        </FormField>
                                        <FormField
                                            label="โปรเจกต์"
                                            htmlFor={`${prefix}.exl_project_id`}
                                            error={fieldErrors[`${prefix}.exl_project_id`]}
                                            className="sm:col-span-2"
                                            hint={
                                                index === 0
                                                    ? "เลือกถ้าเป็นค่าใช้จ่ายของงานลูกค้า (นับเป็นต้นทุนโปรเจกต์)"
                                                    : undefined
                                            }
                                        >
                                            <SearchableSelect
                                                loadOptions={(search) => loadProjectOptions(search, projectCurrent)}
                                                value={line.exl_project_id}
                                                onChange={(value) => updateLine(line.rowKey, { exl_project_id: value })}
                                                placeholder="ไม่เกี่ยวกับโปรเจกต์"
                                            />
                                        </FormField>
                                    </div>
                                </div>
                            );
                        })}
                        <button
                            type="button"
                            className={`${buttonClass("secondary", "md")} justify-self-start`}
                            onClick={() =>
                                update({
                                    lines: [
                                        ...form.lines,
                                        emptyLine(form.lines[form.lines.length - 1]?.exl_category_id ?? ""),
                                    ],
                                })
                            }
                        >
                            <Plus size={16} />
                            เพิ่มรายการ
                        </button>

                        <Switch
                            id="has_vat"
                            label="ใบเสร็จแยก VAT"
                            description={CLAIM_MESSAGES.vat}
                            checked={form.has_vat}
                            onChange={(checked) => update({ has_vat: checked })}
                        />
                        {form.has_vat && (
                            <FormField
                                label="VAT ตามใบเสร็จ"
                                htmlFor="ex_vat_amount"
                                error={fieldErrors.ex_vat_amount}
                                className="sm:max-w-xs"
                                hint={`${Number(officialVatRate)}% ของยอดก่อน VAT = ${formatAmount(calculation.suggestedVat)}`}
                            >
                                <input
                                    id="ex_vat_amount"
                                    inputMode="decimal"
                                    value={form.ex_vat_amount}
                                    onChange={(event) => update({ ex_vat_amount: event.target.value })}
                                    className={inputClass(Boolean(fieldErrors.ex_vat_amount))}
                                />
                            </FormField>
                        )}
                        <FormField
                            label="หมายเหตุ"
                            htmlFor="ex_notes"
                            error={fieldErrors.ex_notes}
                            hint="เช่น ไปพบลูกค้าที่ไหน / ประชุมเรื่องอะไร"
                        >
                            <textarea
                                id="ex_notes"
                                rows={2}
                                value={form.ex_notes}
                                onChange={(event) => update({ ex_notes: event.target.value })}
                                className={inputClass(Boolean(fieldErrors.ex_notes))}
                            />
                        </FormField>
                    </div>
                </SectionCard>

                <SaveErrorBanner error={saveError} />
                <div className="sticky bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-10 flex items-center justify-end gap-3 rounded-2xl border border-gray-200 bg-white/95 p-3 shadow-float backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none">
                    <div className="mr-auto grid min-w-0 lg:hidden">
                        <span className="text-xs text-gray-500">ยอดเบิก</span>
                        <span className="truncate font-medium text-gray-900 tabular-nums">
                            {formatAmount(calculation.total)} บาท
                        </span>
                    </div>
                    <button
                        type="button"
                        className={buttonClass("secondary", "md")}
                        onClick={() =>
                            router.push(
                                detail ? `/purchasing/claims/view?id=${detail.expense.ex_id}` : "/purchasing/claims",
                            )
                        }
                    >
                        ยกเลิก
                    </button>
                    <button type="submit" className={buttonClass("primary", "md")} disabled={isSaving}>
                        {isSaving ? "กำลังบันทึก..." : "บันทึกร่าง"}
                    </button>
                </div>
            </div>

            <aside className="hidden gap-3 rounded-2xl border border-gray-200 bg-white p-5 text-sm shadow-card lg:sticky lg:top-24 lg:grid">
                <h2 className="text-base font-medium text-gray-900">ยอดเบิก</h2>
                <div className="flex justify-between gap-3 text-gray-600">
                    <span>ก่อน VAT</span>
                    <span className="tabular-nums">{formatAmount(calculation.subtotal)}</span>
                </div>
                <div className="flex justify-between gap-3 text-gray-600">
                    <span>VAT</span>
                    <span className="tabular-nums">{form.has_vat ? formatAmount(calculation.vat) : "ไม่แยก"}</span>
                </div>
                <div className="flex justify-between gap-3 border-t border-gray-100 pt-2 text-base font-medium text-gray-900">
                    <span>รวม (บาท)</span>
                    <span className="tabular-nums">{formatAmount(calculation.total)}</span>
                </div>
                <FieldHint>{CLAIM_MESSAGES.approval}</FieldHint>
            </aside>
        </form>
    );
}
