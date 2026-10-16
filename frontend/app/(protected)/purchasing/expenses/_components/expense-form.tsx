"use client";

// ฟอร์มร่างค่าใช้จ่าย / บิลผู้ขาย — ใช้ทั้งสร้างใหม่และแก้ร่าง · บันทึกแล้วไปหน้าดูเพื่อส่ง (ผ่านอัตโนมัติหรือรออนุมัติ)
// ยอดคิดด้วยสูตรเดียวกับ backend (shared/expense-totals.mjs) แต่ backend คิดซ้ำตอนบันทึกเสมอ
// ไฟล์แนบที่เลือกในฟอร์ม: อัปโหลดหลังบันทึกร่างสำเร็จ (ต้องมีรหัสรายการก่อน) — ที่อัปโหลดไม่ผ่านแนบใหม่ได้ที่หน้าดู
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Coins, FileText, ListChecks, Paperclip, Percent, Plus, Trash2, X } from "lucide-react";
import FormField, { inputClass } from "@/components/ui/form-field";
import SectionCard from "@/components/ui/section-card";
import SearchableSelect, { type SelectOption } from "@/components/ui/SearchableSelect";
import StatusBanner from "@/components/ui/guidance/status-banner";
import FieldHint from "@/components/ui/guidance/field-hint";
import SaveErrorBanner from "@/components/ui/save-error-banner";
import Switch from "@/components/ui/switch";
import { CARD_CLASS } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { apiFetch, type ApiError } from "@/lib/api";
import { toFieldErrors, type FieldErrors } from "@/lib/form-errors";
import { formatAmount } from "@/lib/shared/money.mjs";
import { calculateExpense } from "@/lib/shared/expense-totals.mjs";
import { buildApprovalPlan } from "@/lib/shared/approval-flow.mjs";
import { EXPENSE_DOC_TYPES, MAX_EXPENSE_ATTACHMENTS, expenseBillDraftSchema } from "@/lib/shared/schemas/expense.mjs";
import RatePanel, { type RateChange } from "../../../sales/quotations/_components/rate-panel";
import type { Vendor } from "../../_types";
import type { ExpenseOptions } from "../_hooks/use-expense-options";
import { DOC_TYPE_LABELS, EXPENSE_MESSAGES, fileSizeLabel } from "../_messages";
import type { ExpenseDetail, ExpenseDocType } from "../_types";

type LineForm = {
    rowKey: string;
    exl_category_id: string;
    exl_project_id: string;
    project_label: string | null;
    exl_description: string;
    exl_quantity: string;
    exl_unit_price: string;
};

type FormState = {
    ex_vendor_id: string;
    ex_title: string;
    ex_branch_id: string;
    ex_vendor_doc_no: string;
    ex_vendor_doc_date: string;
    ex_doc_type: ExpenseDocType;
    ex_expense_date: string;
    ex_credit_days: string;
    ex_currency: string;
    // อัตราใช้ชื่อแบบใบเสนอราคาเพื่อส่งต่อให้ RatePanel ได้ตรงๆ
    qt_exchange_rate: string;
    qt_rate_source: "bot" | "manual" | null;
    qt_rate_date: string | null;
    qt_rate_bot: string | null;
    qt_rate_override_reason: string;
    has_vat: boolean;
    ex_vat_amount: string;
    ex_wht_income_type: string;
    ex_notes: string;
    lines: LineForm[];
};

type ExpenseFormProps = {
    options: ExpenseOptions;
    // ไม่ส่ง = สร้างใหม่
    detail?: ExpenseDetail;
};

let rowCounter = 0;
function newRowKey() {
    rowCounter += 1;
    return `line-${rowCounter}`;
}

function emptyLine(categoryId = ""): LineForm {
    return {
        rowKey: newRowKey(),
        exl_category_id: categoryId,
        exl_project_id: "",
        project_label: null,
        exl_description: "",
        exl_quantity: "1",
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
        ex_vendor_id: "",
        ex_title: "",
        ex_branch_id: defaultBranchId(options),
        ex_vendor_doc_no: "",
        ex_vendor_doc_date: options.today,
        ex_doc_type: "receipt",
        ex_expense_date: options.today,
        ex_credit_days: "0",
        ex_currency: "THB",
        qt_exchange_rate: "1",
        qt_rate_source: null,
        qt_rate_date: null,
        qt_rate_bot: null,
        qt_rate_override_reason: "",
        has_vat: false,
        ex_vat_amount: "",
        ex_wht_income_type: "",
        ex_notes: "",
        lines: [emptyLine()],
    };
}

function stateFromDetail(detail: ExpenseDetail): FormState {
    const expense = detail.expense;
    return {
        ex_vendor_id: expense.ex_vendor_id ?? "",
        ex_title: expense.ex_title,
        ex_branch_id: expense.ex_branch_id,
        ex_vendor_doc_no: expense.ex_vendor_doc_no ?? "",
        ex_vendor_doc_date: expense.ex_vendor_doc_date ?? "",
        ex_doc_type: expense.ex_doc_type,
        ex_expense_date: expense.ex_expense_date,
        ex_credit_days: String(expense.ex_credit_days),
        ex_currency: expense.ex_currency,
        qt_exchange_rate: expense.ex_exchange_rate,
        qt_rate_source: expense.ex_rate_source,
        qt_rate_date: expense.ex_rate_date,
        qt_rate_bot: null,
        qt_rate_override_reason: expense.ex_rate_override_reason ?? "",
        has_vat: Number(expense.ex_vat_amount) > 0,
        ex_vat_amount: Number(expense.ex_vat_amount) > 0 ? expense.ex_vat_amount : "",
        ex_wht_income_type: expense.ex_wht_income_type ?? "",
        ex_notes: expense.ex_notes ?? "",
        lines: detail.lines.map((line) => ({
            rowKey: newRowKey(),
            exl_category_id: String(line.exl_category_id),
            exl_project_id: line.exl_project_id ?? "",
            project_label: line.project_name,
            exl_description: line.exl_description,
            exl_quantity: line.exl_quantity,
            exl_unit_price: line.exl_unit_price,
        })),
    };
}

function textOrNull(value: string) {
    return value.trim() === "" ? null : value.trim();
}

/** ฟอร์ม → body ของ POST/PUT /expenses (ตรวจซ้ำด้วย expenseBillDraftSchema ก่อนส่ง) */
function toPayload(form: FormState, version: number | null) {
    return {
        ex_vendor_id: form.ex_vendor_id,
        ex_title: form.ex_title,
        ex_branch_id: form.ex_branch_id,
        ex_vendor_doc_no: textOrNull(form.ex_vendor_doc_no),
        ex_vendor_doc_date: textOrNull(form.ex_vendor_doc_date),
        ex_doc_type: form.ex_doc_type,
        ex_expense_date: form.ex_expense_date,
        ex_credit_days: Number(form.ex_credit_days || 0),
        ex_currency: form.ex_currency,
        ex_exchange_rate: form.qt_exchange_rate,
        ex_rate_source: form.ex_currency === "THB" ? null : form.qt_rate_source,
        ex_rate_date: form.qt_rate_date,
        ex_rate_override_reason: textOrNull(form.qt_rate_override_reason),
        ex_vat_amount: form.has_vat ? form.ex_vat_amount.trim() || "0" : "0",
        ex_wht_income_type: textOrNull(form.ex_wht_income_type),
        ex_notes: textOrNull(form.ex_notes),
        ex_version: version,
        lines: form.lines.map((line) => ({
            exl_category_id: line.exl_category_id === "" ? null : Number(line.exl_category_id),
            exl_project_id: textOrNull(line.exl_project_id),
            exl_description: line.exl_description,
            exl_quantity: line.exl_quantity.trim() || "1",
            exl_unit_price: line.exl_unit_price.trim(),
        })),
    };
}

// error ของอัตรา (ex_*) → ชื่อช่องที่ RatePanel ใช้แสดง
function toFormErrors(errors: FieldErrors): FieldErrors {
    const mapped: FieldErrors = { ...errors };
    if (errors.ex_exchange_rate) mapped.qt_exchange_rate = errors.ex_exchange_rate;
    if (errors.ex_rate_override_reason) mapped.qt_rate_override_reason = errors.ex_rate_override_reason;
    return mapped;
}

// ตัวเลขที่ยังพิมพ์ไม่ครบ → คิดเป็น 0 ระหว่างพิมพ์ (ข้อผิดพลาดจริงแสดงตอนกดบันทึก)
function liveNumber(value: string, fallback: string) {
    const text = value.trim().replace(/,/g, "");
    return /^\d+(\.\d{1,2})?$/.test(text) && Number(text) > 0 ? text : fallback;
}

async function loadVendorOptions(search: string, current: SelectOption | null): Promise<SelectOption[]> {
    const query = new URLSearchParams({ status: "active", limit: "20", offset: "0", search });
    const { data } = await apiFetch<{ data: Vendor[] }>(`/vendors?${query}`);
    const found = (data?.data ?? []).map((vendor) => ({
        value: vendor.vd_id,
        label: vendor.vd_code ? `${vendor.vd_name} (${vendor.vd_code})` : vendor.vd_name,
    }));
    const hasCurrent = current && found.some((option) => String(option.value) === String(current.value));
    return current && !hasCurrent && !search ? [current, ...found] : found;
}

async function loadProjectOptions(search: string, current: SelectOption | null): Promise<SelectOption[]> {
    const { data } = await apiFetch<{
        data: { project_id: string; project_name: string; client_name: string | null }[];
    }>(`/expenses/project-options?${new URLSearchParams({ search })}`);
    const found = (data?.data ?? []).map((project) => ({
        value: project.project_id,
        label: project.client_name ? `${project.project_name} · ${project.client_name}` : project.project_name,
    }));
    const none = { value: "", label: "ส่วนกลาง (ไม่ผูกโปรเจกต์)" };
    const hasCurrent = current && found.some((option) => String(option.value) === String(current.value));
    return [none, ...(current && !hasCurrent && !search ? [current] : []), ...found];
}

export default function ExpenseForm({ options, detail }: ExpenseFormProps) {
    const router = useRouter();
    const [form, setForm] = useState<FormState>(() => (detail ? stateFromDetail(detail) : emptyState(options)));
    const [vendor, setVendor] = useState<Pick<Vendor, "vd_id" | "vd_name" | "wht_form"> | null>(
        detail?.expense.ex_vendor_id
            ? {
                  vd_id: detail.expense.ex_vendor_id,
                  vd_name: detail.expense.vd_name ?? "",
                  wht_form: detail.expense.wht_form,
              }
            : null,
    );
    const vendorOption: SelectOption | null = vendor ? { value: vendor.vd_id, label: vendor.vd_name } : null;
    const [pendingFiles, setPendingFiles] = useState<File[]>([]);
    const fileInput = useRef<HTMLInputElement>(null);
    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
    const [saveError, setSaveError] = useState<ApiError | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isDirty, setIsDirty] = useState(false);

    const currency = options.currencies.find((item) => item.cur_code === form.ex_currency);
    const decimals = currency?.cur_decimals ?? 2;
    const isForeign = form.ex_currency !== "THB";
    const isForeignVendor = vendor !== null && vendor.wht_form === null;
    const officialVatRate = options.vat_rate_today ?? "0";
    const categories = options.setup.categories;
    const incomeTypes = options.setup.income_types;
    const selectedIncomeType = incomeTypes.find((type) => type.wit_code === form.ex_wht_income_type);
    const usableRate =
        /^\d+(\.\d{1,10})?$/.test(form.qt_exchange_rate) && Number(form.qt_exchange_rate) > 0
            ? form.qt_exchange_rate
            : "1";
    const existingCount = detail?.attachments.length ?? 0;

    const calculation = useMemo(
        () =>
            calculateExpense({
                lines: form.lines.map((line) => ({
                    exl_quantity: liveNumber(line.exl_quantity, "1"),
                    exl_unit_price: liveNumber(line.exl_unit_price, "0"),
                })),
                vatAmount: form.has_vat ? liveNumber(form.ex_vat_amount, "0") : "0",
                vatRate: officialVatRate,
                whtRate: isForeignVendor ? null : (selectedIncomeType?.current_rate?.wr_rate ?? null),
                whtMinPayment: selectedIncomeType?.current_rate?.wr_min_payment ?? null,
                exchangeRate: usableRate,
                currencyDecimals: decimals,
            }),
        [
            form.lines,
            form.has_vat,
            form.ex_vat_amount,
            officialVatRate,
            isForeignVendor,
            selectedIncomeType,
            usableRate,
            decimals,
        ],
    );
    // แสดงล่วงหน้าว่าส่งแล้วผ่านอัตโนมัติหรือต้องรอกี่ชั้น — backend ตัดสินจริงตอนกดส่ง
    const approvalPlan = buildApprovalPlan(options.expenseApprovalLevels, calculation.subtotalThb);
    const thresholdText = options.expenseApprovalLevels[0]?.al_min_amount_thb ?? null;

    // ออกจากหน้าโดยยังไม่บันทึก → เบราว์เซอร์ถามก่อน
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

    function changeCategory(rowKey: string, categoryId: string) {
        updateLine(rowKey, { exl_category_id: categoryId });
        // ยังไม่ได้เลือกประเภทเงินได้ → เสนอตามหมวด (ผู้ขายต่างประเทศไม่หัก)
        const category = categories.find((item) => String(item.ec_id) === categoryId);
        if (!form.ex_wht_income_type && !isForeignVendor && category?.ec_default_income_type) {
            update({ ex_wht_income_type: category.ec_default_income_type });
        }
    }

    function changeCurrency(currencyCode: string) {
        if (currencyCode === "THB") {
            update({
                ex_currency: "THB",
                qt_exchange_rate: "1",
                qt_rate_source: null,
                qt_rate_date: null,
                qt_rate_bot: null,
                qt_rate_override_reason: "",
            });
            return;
        }
        update({
            ex_currency: currencyCode,
            qt_exchange_rate: "",
            qt_rate_source: "manual",
            qt_rate_date: null,
            qt_rate_bot: null,
        });
    }

    async function changeVendor(vendorId: string) {
        update({ ex_vendor_id: vendorId });
        if (!vendorId) {
            setVendor(null);
            return;
        }
        const { data } = await apiFetch<Vendor>(`/vendors/${vendorId}`);
        if (!data) return;
        setVendor({ vd_id: data.vd_id, vd_name: data.vd_name, wht_form: data.wht_form });
        const isForeignNow = data.wht_form === null;
        const defaultCategory = data.vd_default_category_id ? String(data.vd_default_category_id) : "";
        setForm((current) => ({
            ...current,
            ex_credit_days: String(data.vd_credit_days ?? 0),
            ex_wht_income_type: isForeignNow ? "" : (data.vd_default_income_type ?? current.ex_wht_income_type),
            lines: current.lines.map((line) =>
                line.exl_category_id === "" && defaultCategory ? { ...line, exl_category_id: defaultCategory } : line,
            ),
        }));
        const currencyIsActive = options.currencies.some(
            (item) => item.cur_code === data.vd_currency && item.cur_status === "active",
        );
        if (currencyIsActive && data.vd_currency !== form.ex_currency) changeCurrency(data.vd_currency);
    }

    function addFiles(files: FileList | null) {
        if (!files) return;
        const room = MAX_EXPENSE_ATTACHMENTS - existingCount - pendingFiles.length;
        const picked = Array.from(files).slice(0, Math.max(room, 0));
        if (picked.length < files.length) toast.error(`แนบได้ไม่เกิน ${MAX_EXPENSE_ATTACHMENTS} ไฟล์ต่อรายการ`);
        setPendingFiles((current) => [...current, ...picked]);
        if (fileInput.current) fileInput.current.value = "";
    }

    async function uploadPending(expenseId: string) {
        let failed = 0;
        for (const file of pendingFiles) {
            const body = new FormData();
            body.append("file", file);
            const { error } = await apiFetch(`/expenses/${expenseId}/attachments`, { method: "POST", body });
            if (error) failed += 1;
        }
        if (failed > 0)
            toast.error(
                `แนบไฟล์ไม่สำเร็จ ${failed} ไฟล์ — แนบใหม่ได้ที่หน้ารายการ (ใช้ PDF, JPG หรือ PNG ไม่เกิน 10 MB)`,
            );
    }

    async function handleSave(event: React.FormEvent) {
        event.preventDefault();
        setSaveError(null);
        const checked = expenseBillDraftSchema.safeParse(toPayload(form, detail?.expense.ex_version ?? null));
        if (!checked.success) {
            setFieldErrors(toFormErrors(toFieldErrors(checked.error.issues)));
            toast.error("ยังบันทึกไม่ได้ — แก้ช่องที่มีข้อความสีแดงก่อน");
            return;
        }
        setFieldErrors({});
        setIsSaving(true);
        const result = detail
            ? await apiFetch<{ ex_id: string }>(`/expenses/${detail.expense.ex_id}`, {
                  method: "PUT",
                  body: checked.data,
              })
            : await apiFetch<{ ex_id: string }>("/expenses", { method: "POST", body: checked.data });
        if (result.error) {
            setIsSaving(false);
            setFieldErrors(toFormErrors(result.error.fields));
            setSaveError(result.error);
            return;
        }
        const expenseId = detail?.expense.ex_id ?? result.data.ex_id;
        await uploadPending(expenseId);
        setIsSaving(false);
        setIsDirty(false);
        toast.success("บันทึกร่างแล้ว");
        router.push(`/purchasing/expenses/view?id=${expenseId}`);
    }

    const activeCategories = (selectedId: string) =>
        categories.filter((category) => category.ec_status === "active" || String(category.ec_id) === selectedId);

    return (
        <form onSubmit={handleSave} noValidate className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
            <div className="grid min-w-0 grid-cols-1 gap-5">
                {detail?.expense.ex_returned_reason && (
                    <StatusBanner tone="warn" title="รายการนี้ถูกตีกลับ">
                        เหตุผล: {detail.expense.ex_returned_reason} — แก้แล้วส่งใหม่ได้ (เริ่มอนุมัติชั้น 1 ใหม่)
                    </StatusBanner>
                )}

                <SectionCard icon={FileText} title="ผู้ขายและเอกสาร" description={EXPENSE_MESSAGES.numberLater}>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <FormField
                            label="ผู้ขาย"
                            htmlFor="ex_vendor_id"
                            required
                            error={fieldErrors.ex_vendor_id}
                            className="sm:col-span-2"
                            hint={EXPENSE_MESSAGES.vendor}
                        >
                            <SearchableSelect
                                loadOptions={(search) => loadVendorOptions(search, vendorOption)}
                                value={form.ex_vendor_id}
                                onChange={(value) => changeVendor(value)}
                                placeholder="— เลือกผู้ขาย —"
                                error={Boolean(fieldErrors.ex_vendor_id)}
                            />
                        </FormField>
                        <FormField
                            label="เรื่อง"
                            htmlFor="ex_title"
                            required
                            error={fieldErrors.ex_title}
                            className="sm:col-span-2"
                            hint="เช่น ค่าจ้างออกแบบหน้าเว็บ งานลูกค้า ก"
                        >
                            <input
                                id="ex_title"
                                value={form.ex_title}
                                onChange={(event) => update({ ex_title: event.target.value })}
                                className={inputClass(Boolean(fieldErrors.ex_title))}
                            />
                        </FormField>
                        <FormField
                            label="ชนิดเอกสารของผู้ขาย"
                            htmlFor="ex_doc_type"
                            error={fieldErrors.ex_doc_type}
                            hint={EXPENSE_MESSAGES.docType}
                        >
                            <select
                                id="ex_doc_type"
                                value={form.ex_doc_type}
                                onChange={(event) => update({ ex_doc_type: event.target.value as ExpenseDocType })}
                                className={inputClass(Boolean(fieldErrors.ex_doc_type))}
                            >
                                {(EXPENSE_DOC_TYPES as ExpenseDocType[]).map((type) => (
                                    <option key={type} value={type}>
                                        {DOC_TYPE_LABELS[type]}
                                    </option>
                                ))}
                            </select>
                        </FormField>
                        <FormField
                            label="เลขที่เอกสารของผู้ขาย"
                            htmlFor="ex_vendor_doc_no"
                            error={fieldErrors.ex_vendor_doc_no}
                            hint={EXPENSE_MESSAGES.vendorDocNo}
                        >
                            <input
                                id="ex_vendor_doc_no"
                                value={form.ex_vendor_doc_no}
                                onChange={(event) => update({ ex_vendor_doc_no: event.target.value })}
                                className={inputClass(Boolean(fieldErrors.ex_vendor_doc_no))}
                            />
                        </FormField>
                        <FormField
                            label="วันที่ในเอกสารของผู้ขาย"
                            htmlFor="ex_vendor_doc_date"
                            error={fieldErrors.ex_vendor_doc_date}
                            hint="ใช้หาอัตรา VAT และเป็นวันที่ของภาษีซื้อ"
                        >
                            <input
                                id="ex_vendor_doc_date"
                                type="date"
                                value={form.ex_vendor_doc_date}
                                onChange={(event) => update({ ex_vendor_doc_date: event.target.value })}
                                className={inputClass(Boolean(fieldErrors.ex_vendor_doc_date))}
                            />
                        </FormField>
                        <FormField
                            label="วันที่ค่าใช้จ่าย"
                            htmlFor="ex_expense_date"
                            required
                            error={fieldErrors.ex_expense_date}
                            hint={EXPENSE_MESSAGES.expenseDate}
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
                            label="เครดิต (วัน)"
                            htmlFor="ex_credit_days"
                            error={fieldErrors.ex_credit_days}
                            hint={EXPENSE_MESSAGES.creditDays}
                        >
                            <input
                                id="ex_credit_days"
                                inputMode="numeric"
                                value={form.ex_credit_days}
                                onChange={(event) => update({ ex_credit_days: event.target.value.replace(/\D/g, "") })}
                                className={inputClass(Boolean(fieldErrors.ex_credit_days))}
                            />
                        </FormField>
                        <FormField
                            label="สาขาที่รับเอกสาร"
                            htmlFor="ex_branch_id"
                            required
                            error={fieldErrors.ex_branch_id}
                            hint="สาขาของบริษัทที่ผู้ขายออกเอกสารให้"
                        >
                            <select
                                id="ex_branch_id"
                                value={form.ex_branch_id}
                                onChange={(event) => update({ ex_branch_id: event.target.value })}
                                className={inputClass(Boolean(fieldErrors.ex_branch_id))}
                            >
                                {options.branches
                                    .filter(
                                        (branch) =>
                                            branch.branch_status === "active" || branch.branch_id === form.ex_branch_id,
                                    )
                                    .map((branch) => (
                                        <option key={branch.branch_id} value={branch.branch_id}>
                                            {branch.branch_code} · {branch.branch_name_th}
                                        </option>
                                    ))}
                            </select>
                        </FormField>
                    </div>
                </SectionCard>

                <SectionCard icon={Coins} title="สกุลเงิน">
                    <div className="grid gap-4">
                        <FormField
                            label="สกุลเงินของเอกสาร"
                            htmlFor="ex_currency"
                            error={fieldErrors.ex_currency}
                            className="sm:max-w-xs"
                            hint="ยอดเป็นบาทใช้เทียบวงเงินอนุมัติและทำรายงาน"
                        >
                            <select
                                id="ex_currency"
                                value={form.ex_currency}
                                onChange={(event) => changeCurrency(event.target.value)}
                                className={inputClass(Boolean(fieldErrors.ex_currency))}
                            >
                                {options.currencies
                                    .filter(
                                        (item) => item.cur_status === "active" || item.cur_code === form.ex_currency,
                                    )
                                    .map((item) => (
                                        <option key={item.cur_code} value={item.cur_code}>
                                            {item.cur_code} · {item.cur_name_th}
                                        </option>
                                    ))}
                            </select>
                        </FormField>
                        {isForeign && (
                            <RatePanel
                                currency={form.ex_currency}
                                rate={form.qt_exchange_rate}
                                source={form.qt_rate_source}
                                rateDate={form.qt_rate_date}
                                rateBot={form.qt_rate_bot}
                                reason={form.qt_rate_override_reason}
                                errors={fieldErrors}
                                onRateChange={(change: RateChange) => update(change)}
                                onReasonChange={(reason) => update({ qt_rate_override_reason: reason })}
                            />
                        )}
                    </div>
                </SectionCard>

                <SectionCard
                    icon={ListChecks}
                    title="รายการ"
                    description="ยอดก่อน VAT · แต่ละบรรทัดเลือกหมวดและโปรเจกต์ได้"
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
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-sm font-medium text-gray-700">บรรทัด {index + 1}</span>
                                        <span className="flex items-center gap-2">
                                            <span className="text-sm text-gray-900 tabular-nums">
                                                {formatAmount(calculation.lineAmounts[index] ?? 0n, decimals)}{" "}
                                                {form.ex_currency}
                                            </span>
                                            {form.lines.length > 1 && (
                                                <button
                                                    type="button"
                                                    aria-label={`ลบบรรทัด ${index + 1}`}
                                                    className={buttonClass("ghost", "sm")}
                                                    onClick={() =>
                                                        update({
                                                            lines: form.lines.filter(
                                                                (item) => item.rowKey !== line.rowKey,
                                                            ),
                                                        })
                                                    }
                                                >
                                                    <Trash2 size={15} />
                                                </button>
                                            )}
                                        </span>
                                    </div>
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
                                                onChange={(event) => changeCategory(line.rowKey, event.target.value)}
                                                className={inputClass(
                                                    Boolean(fieldErrors[`${prefix}.exl_category_id`]),
                                                )}
                                            >
                                                <option value="">— เลือกหมวด —</option>
                                                {activeCategories(line.exl_category_id).map((category) => (
                                                    <option key={category.ec_id} value={category.ec_id}>
                                                        {category.ec_name_th}
                                                    </option>
                                                ))}
                                            </select>
                                        </FormField>
                                        <FormField
                                            label="โปรเจกต์"
                                            htmlFor={`${prefix}.exl_project_id`}
                                            error={fieldErrors[`${prefix}.exl_project_id`]}
                                            hint={index === 0 ? EXPENSE_MESSAGES.lineProject : undefined}
                                        >
                                            <SearchableSelect
                                                loadOptions={(search) => loadProjectOptions(search, projectCurrent)}
                                                value={line.exl_project_id}
                                                onChange={(value) => updateLine(line.rowKey, { exl_project_id: value })}
                                                placeholder="ส่วนกลาง (ไม่ผูกโปรเจกต์)"
                                                error={Boolean(fieldErrors[`${prefix}.exl_project_id`])}
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
                                            label="จำนวน"
                                            htmlFor={`${prefix}.exl_quantity`}
                                            error={fieldErrors[`${prefix}.exl_quantity`]}
                                        >
                                            <input
                                                id={`${prefix}.exl_quantity`}
                                                inputMode="decimal"
                                                value={line.exl_quantity}
                                                onChange={(event) =>
                                                    updateLine(line.rowKey, { exl_quantity: event.target.value })
                                                }
                                                className={inputClass(Boolean(fieldErrors[`${prefix}.exl_quantity`]))}
                                            />
                                        </FormField>
                                        <FormField
                                            label="ราคาต่อหน่วย"
                                            htmlFor={`${prefix}.exl_unit_price`}
                                            required
                                            error={fieldErrors[`${prefix}.exl_unit_price`]}
                                            hint={index === 0 ? EXPENSE_MESSAGES.linePrice : undefined}
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
                                    </div>
                                </div>
                            );
                        })}
                        {fieldErrors.lines && <p className="text-xs text-red-600">{fieldErrors.lines}</p>}
                        <button
                            type="button"
                            className={`${buttonClass("secondary", "md")} justify-self-start`}
                            onClick={() => {
                                const lastCategory = form.lines[form.lines.length - 1]?.exl_category_id ?? "";
                                update({ lines: [...form.lines, emptyLine(lastCategory)] });
                            }}
                        >
                            <Plus size={16} />
                            เพิ่มบรรทัด
                        </button>
                    </div>
                </SectionCard>

                <SectionCard icon={Percent} title="VAT และหัก ณ ที่จ่าย">
                    <div className="grid gap-4">
                        <Switch
                            id="has_vat"
                            label="เอกสารนี้มี VAT"
                            description={EXPENSE_MESSAGES.vat}
                            checked={form.has_vat}
                            onChange={(checked) =>
                                update({
                                    has_vat: checked,
                                    ex_vat_amount:
                                        checked && !form.ex_vat_amount
                                            ? formatAmount(calculation.suggestedVat, decimals).replace(/,/g, "")
                                            : form.ex_vat_amount,
                                })
                            }
                        />
                        {form.has_vat && (
                            <FormField
                                label="VAT ตามเอกสาร"
                                htmlFor="ex_vat_amount"
                                error={fieldErrors.ex_vat_amount}
                                className="sm:max-w-xs"
                                hint={
                                    calculation.isVatDifferent
                                        ? `ต่างจาก ${officialVatRate}% ของยอดก่อน VAT (${formatAmount(calculation.suggestedVat, decimals)}) เกิน 1 — ตรวจกับเอกสารอีกครั้ง`
                                        : `${officialVatRate}% ของยอดก่อน VAT = ${formatAmount(calculation.suggestedVat, decimals)}`
                                }
                            >
                                <div className="flex gap-2">
                                    <input
                                        id="ex_vat_amount"
                                        inputMode="decimal"
                                        value={form.ex_vat_amount}
                                        onChange={(event) => update({ ex_vat_amount: event.target.value })}
                                        className={inputClass(Boolean(fieldErrors.ex_vat_amount))}
                                    />
                                    <button
                                        type="button"
                                        className={`${buttonClass("secondary", "md")} shrink-0`}
                                        onClick={() =>
                                            update({
                                                ex_vat_amount: formatAmount(calculation.suggestedVat, decimals).replace(
                                                    /,/g,
                                                    "",
                                                ),
                                            })
                                        }
                                    >
                                        ใช้ยอดที่คิด
                                    </button>
                                </div>
                            </FormField>
                        )}
                        <FormField
                            label="หัก ณ ที่จ่าย (ประเภทเงินได้)"
                            htmlFor="ex_wht_income_type"
                            error={fieldErrors.ex_wht_income_type}
                            className="sm:max-w-md"
                            hint={
                                isForeignVendor
                                    ? EXPENSE_MESSAGES.withholdingForeign
                                    : calculation.isBelowWithholdingMinimum
                                      ? `ยอดก่อน VAT ต่ำกว่าเกณฑ์ ${formatAmount(selectedIncomeType?.current_rate?.wr_min_payment ?? "0")} บาท — ระบบเสนอไม่หัก`
                                      : EXPENSE_MESSAGES.withholding
                            }
                        >
                            <select
                                id="ex_wht_income_type"
                                value={isForeignVendor ? "" : form.ex_wht_income_type}
                                disabled={isForeignVendor}
                                onChange={(event) => update({ ex_wht_income_type: event.target.value })}
                                className={inputClass(Boolean(fieldErrors.ex_wht_income_type))}
                            >
                                <option value="">ไม่หัก</option>
                                {incomeTypes
                                    .filter(
                                        (type) =>
                                            type.wit_status === "active" || type.wit_code === form.ex_wht_income_type,
                                    )
                                    .map((type) => (
                                        <option key={type.wit_code} value={type.wit_code}>
                                            {type.wit_name_th}
                                            {type.current_rate ? ` · ${Number(type.current_rate.wr_rate)}%` : ""}
                                        </option>
                                    ))}
                            </select>
                        </FormField>
                    </div>
                </SectionCard>

                <SectionCard icon={Paperclip} title="ไฟล์แนบ" description={EXPENSE_MESSAGES.attachments}>
                    <div className="grid gap-3">
                        {existingCount > 0 && (
                            <FieldHint>มีไฟล์แนบแล้ว {existingCount} ไฟล์ — ดู/ลบได้ที่หน้ารายการ</FieldHint>
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
                            accept="application/pdf,image/jpeg,image/png"
                            className="hidden"
                            onChange={(event) => addFiles(event.target.files)}
                        />
                        <button
                            type="button"
                            className={`${buttonClass("secondary", "md")} justify-self-start`}
                            disabled={existingCount + pendingFiles.length >= MAX_EXPENSE_ATTACHMENTS}
                            onClick={() => fileInput.current?.click()}
                        >
                            <Paperclip size={16} />
                            เลือกไฟล์ / ถ่ายรูปเอกสาร
                        </button>
                        {pendingFiles.length > 0 && <FieldHint>ไฟล์จะอัปโหลดตอนกดบันทึกร่าง</FieldHint>}
                    </div>
                </SectionCard>

                <SectionCard icon={FileText} title="หมายเหตุ">
                    <FormField
                        label="หมายเหตุภายใน"
                        htmlFor="ex_notes"
                        error={fieldErrors.ex_notes}
                        hint="เห็นเฉพาะคนในระบบ เช่น จ่ายแทนลูกค้า / ตกลงราคากับใคร"
                    >
                        <textarea
                            id="ex_notes"
                            rows={3}
                            value={form.ex_notes}
                            onChange={(event) => update({ ex_notes: event.target.value })}
                            className={inputClass(Boolean(fieldErrors.ex_notes))}
                        />
                    </FormField>
                </SectionCard>

                <SaveErrorBanner error={saveError} />
                {/* จอเล็กกว่า lg: แถบลอยติดล่างจอ มียอดรวม + ปุ่มบันทึก (แบบเดียวกับฟอร์มใบแจ้งหนี้) */}
                <div className="sticky bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-10 flex items-center justify-end gap-3 rounded-2xl border border-gray-200 bg-white/95 p-3 shadow-float backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none">
                    <div className="mr-auto grid min-w-0 lg:hidden">
                        <span className="text-xs text-gray-500">รวมทั้งสิ้น</span>
                        <span className="truncate font-medium text-gray-900 tabular-nums">
                            {formatAmount(calculation.total, decimals)} {form.ex_currency}
                        </span>
                    </div>
                    <button
                        type="button"
                        className={buttonClass("secondary", "md")}
                        onClick={() =>
                            router.push(
                                detail
                                    ? `/purchasing/expenses/view?id=${detail.expense.ex_id}`
                                    : "/purchasing/expenses",
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

            <aside className={`grid gap-3 p-5 text-sm lg:sticky lg:top-24 ${CARD_CLASS}`}>
                <h2 className="text-base font-medium text-gray-900">สรุปยอด</h2>
                <SummaryRow label="ยอดก่อน VAT" value={formatAmount(calculation.subtotal, decimals)} />
                <SummaryRow label="VAT" value={form.has_vat ? formatAmount(calculation.vat, decimals) : "ไม่มี"} />
                <div className="flex justify-between gap-3 border-t border-gray-100 pt-2 text-base font-medium text-gray-900">
                    <span>รวมทั้งสิ้น ({form.ex_currency})</span>
                    <span className="tabular-nums">{formatAmount(calculation.total, decimals)}</span>
                </div>
                {calculation.withholding > 0n && (
                    <>
                        <SummaryRow
                            label={`หัก ณ ที่จ่าย ${Number(selectedIncomeType?.current_rate?.wr_rate ?? 0)}% (ประมาณ)`}
                            value={`−${formatAmount(calculation.withholding, decimals)}`}
                        />
                        <SummaryRow
                            label="จ่ายผู้ขายสุทธิ (ประมาณ)"
                            value={formatAmount(calculation.netPayable, decimals)}
                        />
                    </>
                )}
                {isForeign && (
                    <p className="text-xs text-gray-500">
                        ยอดก่อน VAT เป็นบาท ≈ {formatAmount(calculation.subtotalThb)} บาท
                    </p>
                )}
                <div className="grid gap-1 rounded-xl bg-gray-50 p-3">
                    <p className="font-medium text-gray-800">
                        {approvalPlan.length === 0
                            ? "ส่งแล้วผ่านอัตโนมัติ"
                            : `ส่งแล้วต้องอนุมัติ ${approvalPlan.length} ชั้น`}
                    </p>
                    <p className="text-xs text-gray-500">
                        {thresholdText
                            ? `ยอดก่อน VAT ต่ำกว่า ${formatAmount(thresholdText)} บาท ไม่ต้องรออนุมัติ`
                            : EXPENSE_MESSAGES.approval}
                    </p>
                </div>
            </aside>
        </form>
    );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between gap-3 text-gray-600">
            <span>{label}</span>
            <span className="tabular-nums">{value}</span>
        </div>
    );
}
