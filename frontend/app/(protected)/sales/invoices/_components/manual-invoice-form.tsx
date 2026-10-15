"use client";

// ฟอร์มร่างใบแจ้งหนี้ที่สร้างเอง (ไม่อ้างใบเสนอราคา) — ใช้ทั้งสร้างใหม่และแก้ร่าง · บันทึกแล้วไปหน้าดูเพื่อส่งขออนุมัติ
// ใช้ส่วนประกอบรายการ/เลือกสินค้า/อัตรา/สรุปยอดชุดเดียวกับใบเสนอราคา: สถานะในฟอร์มใช้ชื่อช่องแบบใบเสนอราคา (qti_*)
// แล้วแปลงเป็นชื่อช่องของใบแจ้งหนี้ (invi_* / inv_*) ตอนส่ง · error จาก API แปลงกลับให้ไปอยู่ใต้ช่องเดิม
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Coins, FileText, ListChecks } from "lucide-react";
import FormField, { inputClass } from "@/components/ui/form-field";
import SectionCard from "@/components/ui/section-card";
import SearchableSelect, { type SelectOption } from "@/components/ui/SearchableSelect";
import StatusBanner from "@/components/ui/guidance/status-banner";
import SaveErrorBanner from "@/components/ui/save-error-banner";
import { buttonClass } from "@/components/ui/button";
import { apiFetch, type ApiError } from "@/lib/api";
import { toFieldErrors, type FieldErrors } from "@/lib/form-errors";
import { formatAmount } from "@/lib/shared/money.mjs";
import { calculateQuotation } from "@/lib/shared/quotation-totals.mjs";
import { calculateWithholding } from "@/lib/shared/invoice-totals.mjs";
import { invoiceManualDraftSchema } from "@/lib/shared/schemas/invoice.mjs";
import { emptyItem, newRowKey, type ItemForm } from "../../quotations/_form-state";
import { vatRateForForm } from "../../quotations/_hooks/use-form-options";
import { QUOTATION_MESSAGES } from "../../quotations/_messages";
import ItemsEditor from "../../quotations/_components/items-editor";
import ItemPicker from "../../quotations/_components/item-picker";
import RatePanel, { type RateChange } from "../../quotations/_components/rate-panel";
import SummaryPanel from "../../quotations/_components/summary-panel";
import { defaultBankAccountId, type InvoiceOptions } from "../_hooks/use-invoice-options";
import type { InvoiceDetail } from "../_types";
import BillingFields, { billingPayload, type BillingValues } from "./billing-fields";

type ClientDefaults = {
    client_id: string;
    client_currency: string;
    client_language: "th" | "en";
    client_vat_treatment: "standard" | "zero";
    client_credit_days: number | null;
    client_wht_rate: string | null;
};

type FormState = BillingValues & {
    inv_client_id: string;
    inv_branch_id: string;
    inv_title: string;
    inv_language: "th" | "en";
    inv_currency: string;
    // อัตราใช้ชื่อแบบใบเสนอราคาเพื่อส่งต่อให้ RatePanel ได้ตรงๆ
    qt_exchange_rate: string;
    qt_rate_source: "bot" | "manual" | null;
    qt_rate_date: string | null;
    qt_rate_bot: string | null;
    qt_rate_override_reason: string;
    inv_vat_treatment: "standard" | "zero";
    inv_discount_type: "amount" | "percent";
    inv_discount_value: string;
    items: ItemForm[];
};

type ManualInvoiceFormProps = {
    options: InvoiceOptions;
    // ไม่ส่ง = สร้างใหม่
    detail?: InvoiceDetail;
};

function defaultBranchId(options: InvoiceOptions) {
    const activeBranches = options.branches.filter((branch) => branch.branch_status === "active");
    const userBranch = activeBranches.find((branch) => branch.branch_id === options.userBranchId);
    return (userBranch ?? activeBranches.find((branch) => branch.is_head_office) ?? activeBranches[0])?.branch_id ?? "";
}

function defaultNotes(options: InvoiceOptions, language: "th" | "en") {
    return (language === "en" ? options.company.cs_invoice_notes_en : options.company.cs_invoice_notes_th) ?? "";
}

function blankIfZero(value: string | null) {
    if (value === null) return "";
    return Number(value) === 0 ? "" : value;
}

function emptyState(options: InvoiceOptions): FormState {
    return {
        inv_client_id: "",
        inv_branch_id: defaultBranchId(options),
        inv_title: "",
        inv_language: "th",
        inv_currency: "THB",
        qt_exchange_rate: "1",
        qt_rate_source: null,
        qt_rate_date: null,
        qt_rate_bot: null,
        qt_rate_override_reason: "",
        inv_vat_treatment: "standard",
        inv_discount_type: "amount",
        inv_discount_value: "",
        inv_credit_days: String(options.company.cs_default_credit_days),
        inv_wht_rate: "",
        inv_bank_account_id: defaultBankAccountId(options, "THB"),
        inv_notes: defaultNotes(options, "th"),
        inv_internal_note: "",
        items: [emptyItem("item")],
    };
}

function stateFromDetail(detail: InvoiceDetail): FormState {
    const invoice = detail.invoice;
    return {
        inv_client_id: invoice.inv_client_id,
        inv_branch_id: invoice.inv_branch_id,
        inv_title: invoice.inv_title,
        inv_language: invoice.inv_language,
        inv_currency: invoice.inv_currency,
        qt_exchange_rate: invoice.inv_exchange_rate,
        qt_rate_source: invoice.inv_rate_source,
        qt_rate_date: invoice.inv_rate_date,
        qt_rate_bot: invoice.inv_rate_bot,
        qt_rate_override_reason: invoice.inv_rate_override_reason ?? "",
        inv_vat_treatment: invoice.inv_vat_treatment,
        inv_discount_type: invoice.inv_discount_type,
        inv_discount_value: blankIfZero(invoice.inv_discount_value),
        inv_credit_days: String(invoice.inv_credit_days),
        inv_wht_rate: invoice.inv_wht_rate ?? "",
        inv_bank_account_id: invoice.inv_bank_account_id,
        inv_notes: invoice.inv_notes ?? "",
        inv_internal_note: invoice.inv_internal_note ?? "",
        items: detail.items.map((item) => ({
            rowKey: newRowKey(),
            qti_type: item.invi_type,
            qti_product_id: item.invi_product_id,
            qti_package_id: null,
            qti_description: item.invi_description,
            qti_quantity: item.invi_quantity ?? "",
            qti_unit: item.invi_unit ?? "",
            qti_unit_price: item.invi_unit_price ?? "",
            qti_list_price: item.invi_list_price ?? "",
            qti_discount_type: item.invi_discount_type,
            qti_discount_value: blankIfZero(item.invi_discount_value),
            baht_price: null,
        })),
    };
}

function textOrNull(value: string) {
    return value.trim() === "" ? null : value.trim();
}

/** แถวในฟอร์ม (qti_*) → รูปที่สูตรใบเสนอราคาใช้คำนวณ */
function toCalculationItems(items: ItemForm[]) {
    return items.map((item) => ({
        qti_type: item.qti_type,
        qti_quantity: textOrNull(item.qti_quantity),
        qti_unit_price: textOrNull(item.qti_unit_price),
        qti_list_price: textOrNull(item.qti_list_price),
        qti_discount_type: item.qti_discount_type,
        qti_discount_value: item.qti_discount_value.trim() || "0",
    }));
}

/** ฟอร์ม → body ของ POST/PUT /invoices (ตรวจซ้ำด้วย invoiceManualDraftSchema ก่อนส่ง) */
function toPayload(form: FormState, version: number | null) {
    return {
        inv_client_id: form.inv_client_id,
        inv_branch_id: form.inv_branch_id,
        inv_title: form.inv_title,
        inv_language: form.inv_language,
        inv_currency: form.inv_currency,
        inv_exchange_rate: form.qt_exchange_rate,
        inv_rate_source: form.inv_currency === "THB" ? null : form.qt_rate_source,
        inv_rate_date: form.qt_rate_date,
        inv_rate_override_reason: textOrNull(form.qt_rate_override_reason),
        inv_vat_treatment: form.inv_vat_treatment,
        inv_discount_type: form.inv_discount_type,
        inv_discount_value: form.inv_discount_value.trim() || "0",
        inv_version: version,
        ...billingPayload(form),
        items: form.items.map((item) => ({
            invi_type: item.qti_type,
            invi_product_id: item.qti_product_id,
            invi_description: item.qti_description,
            invi_quantity: textOrNull(item.qti_quantity),
            invi_unit: textOrNull(item.qti_unit),
            invi_unit_price: textOrNull(item.qti_unit_price),
            invi_list_price: textOrNull(item.qti_list_price),
            invi_discount_type: item.qti_discount_type,
            invi_discount_value: item.qti_discount_value.trim() || "0",
        })),
    };
}

// error ของใบแจ้งหนี้ (items.2.invi_quantity, inv_exchange_rate) → ชื่อช่องที่ส่วนประกอบของใบเสนอราคาใช้แสดง
function toFormErrors(errors: FieldErrors): FieldErrors {
    const mapped: FieldErrors = {};
    for (const [field, message] of Object.entries(errors)) {
        mapped[field] = message;
        if (field.includes(".invi_")) mapped[field.replace(".invi_", ".qti_")] = message;
        if (field === "inv_exchange_rate") mapped.qt_exchange_rate = message;
        if (field === "inv_rate_override_reason") mapped.qt_rate_override_reason = message;
    }
    return mapped;
}

async function loadClientOptions(search: string, current: SelectOption | null): Promise<SelectOption[]> {
    const query = new URLSearchParams({ status: "active", limit: "20", offset: "0", search });
    const { data } = await apiFetch<{
        data: { client_id: string; client_name: string; client_company: string | null }[];
    }>(`/clients?${query}`);
    const found = (data?.data ?? []).map((client) => ({
        value: client.client_id,
        label: client.client_company ? `${client.client_name} (${client.client_company})` : client.client_name,
    }));
    const hasCurrent = current && found.some((option) => String(option.value) === String(current.value));
    return current && !hasCurrent && !search ? [current, ...found] : found;
}

export default function ManualInvoiceForm({ options, detail }: ManualInvoiceFormProps) {
    const router = useRouter();
    const [form, setForm] = useState<FormState>(() => (detail ? stateFromDetail(detail) : emptyState(options)));
    const clientOption: SelectOption | null = detail
        ? { value: detail.invoice.inv_client_id, label: detail.invoice.client_name }
        : null;
    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
    const [saveError, setSaveError] = useState<ApiError | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isPickerOpen, setIsPickerOpen] = useState(false);
    const [isDirty, setIsDirty] = useState(false);

    const currency = options.currencies.find((item) => item.cur_code === form.inv_currency);
    const decimals = currency?.cur_decimals ?? 2;
    const isForeign = form.inv_currency !== "THB";
    const vatRate = vatRateForForm(options, form.inv_vat_treatment);
    const isVatRegistered = vatRateForForm(options, "standard") !== "0";
    const usableRate =
        /^\d+(\.\d{1,10})?$/.test(form.qt_exchange_rate) && Number(form.qt_exchange_rate) > 0
            ? form.qt_exchange_rate
            : "1";

    const calculation = useMemo(
        () =>
            calculateQuotation({
                items: toCalculationItems(form.items),
                discountType: form.inv_discount_type,
                discountValue: form.inv_discount_value.trim() || "0",
                vatRate,
                currencyDecimals: decimals,
                exchangeRate: usableRate,
                paymentMode: "single",
                milestones: [],
            }),
        [form.items, form.inv_discount_type, form.inv_discount_value, vatRate, decimals, usableRate],
    );

    let withholdingPreview: string | null = null;
    try {
        const withholding = calculateWithholding(calculation.afterDiscount, form.inv_wht_rate.trim() || null, decimals);
        if (withholding > 0n) {
            withholdingPreview = `หักประมาณ ${formatAmount(withholding, decimals)} · ลูกค้าโอน ${formatAmount(calculation.total - withholding, decimals)} ${form.inv_currency}`;
        }
    } catch {
        withholdingPreview = null;
    }

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

    async function fetchRate(currencyCode: string) {
        const { data } = await apiFetch<{ available: boolean; rate: string | null; rate_date: string | null }>(
            `/exchange-rates?currency=${currencyCode}`,
        );
        if (data?.available && data.rate) {
            update({
                qt_exchange_rate: data.rate,
                qt_rate_source: "bot",
                qt_rate_date: data.rate_date,
                qt_rate_bot: data.rate,
            });
        } else {
            update({ qt_exchange_rate: "", qt_rate_source: "manual", qt_rate_date: null, qt_rate_bot: null });
        }
    }

    function changeCurrency(currencyCode: string) {
        const bankAccountId = defaultBankAccountId(options, currencyCode);
        if (currencyCode === "THB") {
            update({
                inv_currency: "THB",
                qt_exchange_rate: "1",
                qt_rate_source: null,
                qt_rate_date: null,
                qt_rate_bot: null,
                qt_rate_override_reason: "",
                inv_bank_account_id: bankAccountId,
            });
            return;
        }
        update({
            inv_currency: currencyCode,
            qt_rate_source: null,
            qt_rate_date: null,
            qt_rate_bot: null,
            inv_bank_account_id: bankAccountId,
        });
        fetchRate(currencyCode);
    }

    function changeLanguage(language: "th" | "en") {
        const otherDefault = defaultNotes(options, form.inv_language);
        // หมายเหตุยังเป็นค่าเริ่มต้นของภาษาเดิม → เปลี่ยนเป็นของภาษาใหม่ให้ (ที่ผู้ใช้แก้เองไม่แตะ)
        const notes = form.inv_notes === otherDefault ? defaultNotes(options, language) : form.inv_notes;
        update({ inv_language: language, inv_notes: notes });
    }

    async function changeClient(clientId: string) {
        update({ inv_client_id: clientId });
        if (!clientId || detail) return;
        const { data } = await apiFetch<ClientDefaults>(`/clients/${clientId}`);
        if (!data) return;
        update({
            inv_vat_treatment: data.client_vat_treatment,
            inv_credit_days: String(data.client_credit_days ?? options.company.cs_default_credit_days),
            inv_wht_rate: data.client_wht_rate ?? "",
        });
        if (data.client_language !== form.inv_language) changeLanguage(data.client_language);
        const currencyIsActive = options.currencies.some(
            (item) => item.cur_code === data.client_currency && item.cur_status === "active",
        );
        if (currencyIsActive && data.client_currency !== form.inv_currency) changeCurrency(data.client_currency);
    }

    async function handleSave(event: React.FormEvent) {
        event.preventDefault();
        setSaveError(null);
        const payload = toPayload(form, detail?.invoice.inv_version ?? null);
        const checked = invoiceManualDraftSchema.safeParse(payload);
        const liveErrors = calculation.errors;
        if (!checked.success || Object.keys(liveErrors).length > 0) {
            const schemaErrors = checked.success ? {} : toFormErrors(toFieldErrors(checked.error.issues));
            setFieldErrors({ ...schemaErrors, ...liveErrors });
            toast.error("ยังบันทึกไม่ได้ — แก้ช่องที่มีข้อความสีแดงก่อน");
            return;
        }
        setFieldErrors({});
        setIsSaving(true);
        const result = detail
            ? await apiFetch<{ inv_id: string }>(`/invoices/${detail.invoice.inv_id}`, {
                  method: "PUT",
                  body: checked.data,
              })
            : await apiFetch<{ inv_id: string }>("/invoices", { method: "POST", body: checked.data });
        setIsSaving(false);
        if (result.error) {
            setFieldErrors(toFormErrors(result.error.fields));
            setSaveError(result.error);
            return;
        }
        setIsDirty(false);
        toast.success("บันทึกร่างแล้ว");
        router.push(`/sales/invoices/view?id=${detail?.invoice.inv_id ?? result.data.inv_id}`);
    }

    const addedCounts = new Map<string, number>();
    for (const item of form.items) {
        if (item.qti_product_id) addedCounts.set(item.qti_product_id, (addedCounts.get(item.qti_product_id) ?? 0) + 1);
    }

    return (
        <form onSubmit={handleSave} noValidate className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
            <div className="grid min-w-0 grid-cols-1 gap-5">
                {detail?.invoice.inv_returned_reason && (
                    <StatusBanner tone="warn" title="ใบนี้ถูกตีกลับ">
                        เหตุผล: {detail.invoice.inv_returned_reason} — แก้แล้วส่งขออนุมัติใหม่ได้ (เริ่มชั้น 1 ใหม่)
                    </StatusBanner>
                )}

                <SectionCard
                    icon={FileText}
                    title="ลูกค้าและเอกสาร"
                    description="ใบที่สร้างเองต้องผ่านการอนุมัติก่อนออก · ยอดทุกบรรทัดคำนวณซ้ำที่เซิร์ฟเวอร์ตอนบันทึก"
                >
                    <div className="grid gap-4 sm:grid-cols-2">
                        <FormField
                            label="ลูกค้า"
                            htmlFor="inv_client_id"
                            required
                            error={fieldErrors.inv_client_id}
                            className="sm:col-span-2"
                            hint="แสดงเฉพาะลูกค้าที่เปิดใช้งาน · เลือกแล้วระบบเติมสกุลเงิน ภาษา การคิด VAT เครดิตเทอม และหัก ณ ที่จ่ายตามข้อมูลลูกค้า"
                        >
                            <SearchableSelect
                                loadOptions={(search) => loadClientOptions(search, clientOption)}
                                value={form.inv_client_id}
                                onChange={(value) => changeClient(value)}
                                placeholder="— เลือกลูกค้า —"
                                error={Boolean(fieldErrors.inv_client_id)}
                            />
                        </FormField>
                        <FormField
                            label="ชื่อเรื่อง"
                            htmlFor="inv_title"
                            required
                            error={fieldErrors.inv_title}
                            className="sm:col-span-2"
                            hint="เช่น ค่าบริการดูแลระบบเดือนตุลาคม"
                        >
                            <input
                                id="inv_title"
                                value={form.inv_title}
                                onChange={(event) => update({ inv_title: event.target.value })}
                                className={inputClass(Boolean(fieldErrors.inv_title))}
                            />
                        </FormField>
                        <FormField
                            label="สาขาที่ออกเอกสาร"
                            htmlFor="inv_branch_id"
                            required
                            hint={QUOTATION_MESSAGES.branch}
                            error={fieldErrors.inv_branch_id}
                        >
                            <select
                                id="inv_branch_id"
                                value={form.inv_branch_id}
                                onChange={(event) => update({ inv_branch_id: event.target.value })}
                                className={inputClass(Boolean(fieldErrors.inv_branch_id))}
                            >
                                {options.branches
                                    .filter(
                                        (branch) =>
                                            branch.branch_status === "active" ||
                                            branch.branch_id === form.inv_branch_id,
                                    )
                                    .map((branch) => (
                                        <option key={branch.branch_id} value={branch.branch_id}>
                                            {branch.branch_code} · {branch.branch_name_th}
                                        </option>
                                    ))}
                            </select>
                        </FormField>
                        <FormField label="ภาษาเอกสาร" htmlFor="inv_language" hint={QUOTATION_MESSAGES.language}>
                            <select
                                id="inv_language"
                                value={form.inv_language}
                                onChange={(event) => changeLanguage(event.target.value as "th" | "en")}
                                className={inputClass()}
                            >
                                <option value="th">ไทย</option>
                                <option value="en">อังกฤษ</option>
                            </select>
                        </FormField>
                        <FormField
                            label="การคิด VAT"
                            htmlFor="inv_vat_treatment"
                            hint={
                                !isVatRegistered
                                    ? "บริษัทยังไม่จด VAT — ใบนี้ไม่คิด VAT"
                                    : form.inv_vat_treatment === "zero"
                                      ? QUOTATION_MESSAGES.vatZero
                                      : `VAT ${vatRate}% ตามวันที่ส่งขออนุมัติ`
                            }
                        >
                            <select
                                id="inv_vat_treatment"
                                value={form.inv_vat_treatment}
                                onChange={(event) =>
                                    update({ inv_vat_treatment: event.target.value as FormState["inv_vat_treatment"] })
                                }
                                className={inputClass()}
                            >
                                <option value="standard">ปกติ</option>
                                <option value="zero">0% (ส่งออกบริการ)</option>
                            </select>
                        </FormField>
                    </div>
                </SectionCard>

                <SectionCard icon={Coins} title="สกุลเงิน">
                    <div className="grid gap-4">
                        <FormField
                            label="สกุลเงินของเอกสาร"
                            htmlFor="inv_currency"
                            error={fieldErrors.inv_currency}
                            className="sm:max-w-xs"
                            hint="ราคาสินค้าเก็บเป็นบาท — ใส่ใบสกุลอื่นระบบแปลงตามอัตราในใบ"
                        >
                            <select
                                id="inv_currency"
                                value={form.inv_currency}
                                onChange={(event) => changeCurrency(event.target.value)}
                                className={inputClass(Boolean(fieldErrors.inv_currency))}
                            >
                                {options.currencies
                                    .filter(
                                        (item) => item.cur_status === "active" || item.cur_code === form.inv_currency,
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
                                currency={form.inv_currency}
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

                <SectionCard icon={ListChecks} title="รายการ">
                    <ItemsEditor
                        items={form.items}
                        lines={calculation.lines}
                        currencyDecimals={decimals}
                        errors={fieldErrors}
                        onChange={(items) => update({ items })}
                        onOpenPicker={() => setIsPickerOpen(true)}
                    />
                    <div className="grid gap-4 sm:grid-cols-2">
                        <FormField
                            label="ส่วนลดท้ายบิล"
                            htmlFor="inv_discount_value"
                            error={fieldErrors.inv_discount_value ?? calculation.errors.qt_discount_value}
                        >
                            <div className="flex gap-1">
                                <input
                                    id="inv_discount_value"
                                    inputMode="decimal"
                                    placeholder="0"
                                    value={form.inv_discount_value}
                                    onChange={(event) => update({ inv_discount_value: event.target.value })}
                                    className={inputClass(Boolean(fieldErrors.inv_discount_value))}
                                />
                                <select
                                    aria-label="ชนิดส่วนลดท้ายบิล"
                                    value={form.inv_discount_type}
                                    onChange={(event) =>
                                        update({
                                            inv_discount_type: event.target.value as FormState["inv_discount_type"],
                                        })
                                    }
                                    className={`${inputClass(false, "tight")} w-20`}
                                >
                                    <option value="amount">฿</option>
                                    <option value="percent">%</option>
                                </select>
                            </div>
                        </FormField>
                    </div>
                </SectionCard>

                <BillingFields
                    values={form}
                    currencyCode={form.inv_currency}
                    options={options}
                    errors={fieldErrors}
                    withholdingPreview={withholdingPreview}
                    onChange={(changes) => update(changes)}
                />

                <SaveErrorBanner error={saveError} />
                {/* จอเล็กกว่า lg: แถบลอยติดล่างจอ มียอดรวม + ปุ่มบันทึก (แบบเดียวกับฟอร์มใบเสนอราคา) */}
                <div className="sticky bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-10 flex items-center justify-end gap-3 rounded-2xl border border-gray-200 bg-white/95 p-3 shadow-float backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none">
                    <div className="mr-auto grid min-w-0 lg:hidden">
                        <span className="text-xs text-gray-500">รวมทั้งสิ้น</span>
                        <span className="truncate font-medium text-gray-900 tabular-nums">
                            {formatAmount(calculation.total, decimals)} {form.inv_currency}
                        </span>
                    </div>
                    <button
                        type="button"
                        className={buttonClass("secondary", "md")}
                        onClick={() =>
                            router.push(detail ? `/sales/invoices/view?id=${detail.invoice.inv_id}` : "/sales/invoices")
                        }
                    >
                        ยกเลิก
                    </button>
                    <button type="submit" className={buttonClass("primary", "md")} disabled={isSaving}>
                        {isSaving ? "กำลังบันทึก..." : "บันทึกร่าง"}
                    </button>
                </div>
            </div>

            <div className="lg:sticky lg:top-24">
                <SummaryPanel
                    totals={calculation}
                    vatRate={vatRate}
                    currency={currency}
                    language={form.inv_language}
                    approvalLevels={options.invoiceApprovalLevels}
                />
            </div>

            <ItemPicker
                open={isPickerOpen}
                exchangeRate={form.qt_exchange_rate}
                currencyCode={form.inv_currency}
                currencyDecimals={decimals}
                addedCounts={addedCounts}
                onAdd={(items) =>
                    update({
                        items: [
                            ...form.items.filter(
                                (item) =>
                                    item.qti_type !== "item" ||
                                    item.qti_description.trim() !== "" ||
                                    item.qti_unit_price !== "",
                            ),
                            ...items,
                        ],
                    })
                }
                onClose={() => setIsPickerOpen(false)}
            />
        </form>
    );
}
