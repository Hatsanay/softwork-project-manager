"use client";

// ฟอร์มร่างใบเสนอราคา (2026-10-13 ขั้น 1A-3) — ใช้ทั้งสร้างใหม่และแก้ร่าง
// ยอดคำนวณสดด้วย shared/quotation-totals.mjs (สูตรเดียวกับ backend) · บันทึกแล้วไปหน้าดูเอกสารเพื่อส่งขออนุมัติ
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Coins, FileText, ListChecks, NotebookPen, Wallet } from "lucide-react";
import FormField, { inputClass } from "@/components/ui/form-field";
import SectionCard from "@/components/ui/section-card";
import Segmented from "@/components/ui/segmented";
import SearchableSelect, { type SelectOption } from "@/components/ui/SearchableSelect";
import StatusBanner from "@/components/ui/guidance/status-banner";
import SaveErrorBanner from "@/components/ui/save-error-banner";
import { buttonClass } from "@/components/ui/button";
import { apiFetch, type ApiError } from "@/lib/api";
import { toFieldErrors, type FieldErrors } from "@/lib/form-errors";
import { convertFromBaht, formatAmount, formatHundredths, parseHundredths } from "@/lib/shared/money.mjs";
import { calculateQuotation } from "@/lib/shared/quotation-totals.mjs";
import { quotationDraftSchema } from "@/lib/shared/schemas/quotation.mjs";
import { QUOTATION_MESSAGES } from "../_messages";
import { emptyForm, formFromDetail, toPayload, type ItemForm, type QuotationForm as FormState } from "../_form-state";
import { vatRateForForm, type FormOptions } from "../_hooks/use-form-options";
import type { QuotationDetail } from "../_types";
import ItemsEditor from "./items-editor";
import ItemPicker from "./item-picker";
import MilestonesEditor from "./milestones-editor";
import RatePanel, { type RateChange } from "./rate-panel";
import SummaryPanel from "./summary-panel";

type ClientDefaults = {
    client_id: string;
    client_name: string;
    client_currency: string;
    client_language: "th" | "en";
    client_vat_treatment: "standard" | "zero";
};

type QuotationFormProps = {
    options: FormOptions;
    // ไม่ส่ง = สร้างใหม่
    detail?: QuotationDetail;
};

function defaultTerms(options: FormOptions, language: "th" | "en") {
    return (language === "en" ? options.company.cs_quotation_terms_en : options.company.cs_quotation_terms_th) ?? "";
}

function defaultBranchId(options: FormOptions) {
    const activeBranches = options.branches.filter((branch) => branch.branch_status === "active");
    const userBranch = activeBranches.find((branch) => branch.branch_id === options.userBranchId);
    return (userBranch ?? activeBranches.find((branch) => branch.is_head_office) ?? activeBranches[0])?.branch_id ?? "";
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
    // ลูกค้าเดิมของร่างต้องอยู่ในตัวเลือกเสมอ (ไม่งั้นช่องแสดงว่าง)
    const hasCurrent = current && found.some((option) => String(option.value) === String(current.value));
    return current && !hasCurrent && !search ? [current, ...found] : found;
}

export default function QuotationForm({ options, detail }: QuotationFormProps) {
    const router = useRouter();
    const isEditing = detail !== undefined;
    const isRevision = (detail?.quotation.qt_revision ?? 0) > 0;
    const [form, setForm] = useState<FormState>(() =>
        detail
            ? formFromDetail(detail)
            : emptyForm({
                  branchId: defaultBranchId(options),
                  validDays: options.company.cs_quotation_valid_days,
                  terms: defaultTerms(options, "th"),
              }),
    );
    // ลูกค้าเดิมของร่าง — ให้ช่องเลือกแสดงชื่อได้แม้ไม่อยู่ใน 20 รายการแรก
    const clientOption: SelectOption | null = detail
        ? { value: detail.quotation.qt_client_id, label: detail.quotation.client_name }
        : null;
    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
    const [saveError, setSaveError] = useState<ApiError | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isPickerOpen, setIsPickerOpen] = useState(false);
    const [isDirty, setIsDirty] = useState(false);

    const currency = options.currencies.find((item) => item.cur_code === form.qt_currency);
    const decimals = currency?.cur_decimals ?? 2;
    const isForeign = form.qt_currency !== "THB";
    const vatRate = vatRateForForm(options, form.qt_vat_treatment);
    const isVatRegistered = vatRateForForm(options, "standard") !== "0";

    const calculation = useMemo(
        () =>
            calculateQuotation({
                items: toPayload(form).items,
                discountType: form.qt_discount_type,
                discountValue: form.qt_discount_value.trim() || "0",
                vatRate,
                currencyDecimals: decimals,
                exchangeRate:
                    /^\d+(\.\d{1,10})?$/.test(form.qt_exchange_rate) && Number(form.qt_exchange_rate) > 0
                        ? form.qt_exchange_rate
                        : "1",
                paymentMode: form.qt_payment_mode,
                milestones: toPayload(form).milestones,
            }),
        [form, vatRate, decimals],
    );

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
        if (currencyCode === "THB") {
            update({
                qt_currency: "THB",
                qt_exchange_rate: "1",
                qt_rate_source: null,
                qt_rate_date: null,
                qt_rate_bot: null,
                qt_rate_override_reason: "",
            });
            return;
        }
        update({ qt_currency: currencyCode, qt_rate_source: null, qt_rate_date: null, qt_rate_bot: null });
        fetchRate(currencyCode);
    }

    function changeLanguage(language: "th" | "en") {
        const otherDefault = defaultTerms(options, form.qt_language);
        // เงื่อนไขยังเป็นค่าเริ่มต้นของภาษาเดิม → เปลี่ยนเป็นของภาษาใหม่ให้ (ที่ผู้ใช้แก้เองไม่แตะ)
        const terms = form.qt_terms === otherDefault ? defaultTerms(options, language) : form.qt_terms;
        update({ qt_language: language, qt_terms: terms });
    }

    async function changeClient(clientId: string) {
        update({ qt_client_id: clientId });
        if (!clientId || isEditing) return;
        const { data } = await apiFetch<ClientDefaults>(`/clients/${clientId}`);
        if (!data) return;
        const currencyIsActive = options.currencies.some(
            (item) => item.cur_code === data.client_currency && item.cur_status === "active",
        );
        update({ qt_vat_treatment: data.client_vat_treatment });
        if (data.client_language !== form.qt_language) changeLanguage(data.client_language);
        if (currencyIsActive && data.client_currency !== form.qt_currency) changeCurrency(data.client_currency);
    }

    // แถวที่มาจากสินค้าแต่ราคาตั้งต้นยังคิดจากอัตราเดิม (เปลี่ยนสกุล/อัตราหลังเพิ่มรายการ) — ถามก่อนแปลง ไม่แปลงเงียบๆ
    function convertedListPrice(item: ItemForm): string | null {
        if (!item.baht_price || item.qti_type !== "item") return null;
        try {
            return formatHundredths(
                convertFromBaht(parseHundredths(item.baht_price, "ราคา"), form.qt_exchange_rate, decimals),
            );
        } catch {
            return null;
        }
    }
    const staleRows = form.items.filter((item) => {
        const converted = convertedListPrice(item);
        return (
            converted !== null &&
            converted !== (item.qti_list_price || null) &&
            Number(converted) !== Number(item.qti_list_price)
        );
    });

    function convertStalePrices() {
        update({
            items: form.items.map((item) => {
                const converted = convertedListPrice(item);
                if (converted === null) return item;
                const isUnitPriceUnchanged =
                    Number(item.qti_unit_price) === Number(item.qti_list_price) || item.qti_unit_price === "";
                return {
                    ...item,
                    qti_list_price: converted,
                    qti_unit_price: isUnitPriceUnchanged ? converted : item.qti_unit_price,
                };
            }),
        });
    }

    async function handleSave(event: React.FormEvent) {
        event.preventDefault();
        setSaveError(null);
        const payload = toPayload(form);
        const checked = quotationDraftSchema.safeParse(payload);
        const liveErrors = calculation.errors;
        if (!checked.success || Object.keys(liveErrors).length > 0) {
            setFieldErrors({ ...(checked.success ? {} : toFieldErrors(checked.error.issues)), ...liveErrors });
            toast.error("ยังบันทึกไม่ได้ · แก้ช่องที่มีข้อความสีแดงก่อน");
            return;
        }
        setFieldErrors({});
        setIsSaving(true);
        const result = detail
            ? await apiFetch<{ qt_id: string }>(`/quotations/${detail.quotation.qt_id}`, {
                  method: "PUT",
                  body: checked.data,
              })
            : await apiFetch<{ qt_id: string }>("/quotations", { method: "POST", body: checked.data });
        setIsSaving(false);
        if (result.error) {
            setFieldErrors(result.error.fields);
            setSaveError(result.error);
            return;
        }
        setIsDirty(false);
        toast.success("บันทึกร่างแล้ว");
        router.push(`/sales/quotations/view?id=${result.data.qt_id}`);
    }

    const addedCounts = new Map<string, number>();
    for (const item of form.items) {
        if (item.qti_product_id) addedCounts.set(item.qti_product_id, (addedCounts.get(item.qti_product_id) ?? 0) + 1);
    }

    return (
        <form onSubmit={handleSave} noValidate className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
            <div className="grid min-w-0 grid-cols-1 gap-5">
                {detail?.quotation.qt_returned_reason && (
                    <StatusBanner tone="warn" title="ใบนี้ถูกตีกลับ">
                        เหตุผล: {detail.quotation.qt_returned_reason} · แก้แล้วส่งขออนุมัติใหม่ได้ (เริ่มชั้น 1 ใหม่)
                    </StatusBanner>
                )}

                <SectionCard icon={FileText} title="ลูกค้าและเอกสาร" description={QUOTATION_MESSAGES.formDescription}>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <FormField
                            label="ลูกค้า"
                            htmlFor="qt_client_id"
                            required
                            error={fieldErrors.qt_client_id}
                            className="sm:col-span-2"
                            hint={
                                isRevision
                                    ? 'revision ต้องเป็นลูกค้าเดิม · เสนอลูกค้ารายอื่นให้ใช้ "คัดลอกเป็นใบใหม่"'
                                    : "แสดงเฉพาะลูกค้าที่เปิดใช้งาน · เลือกแล้วระบบเติมสกุลเงิน ภาษา และการคิด VAT ตามข้อมูลลูกค้า"
                            }
                        >
                            <SearchableSelect
                                loadOptions={(search) => loadClientOptions(search, clientOption)}
                                value={form.qt_client_id}
                                onChange={(value) => changeClient(value)}
                                placeholder="เลือกลูกค้า"
                                disabled={isRevision}
                                error={Boolean(fieldErrors.qt_client_id)}
                            />
                        </FormField>
                        <FormField
                            label="ชื่อเรื่อง"
                            htmlFor="qt_title"
                            required
                            error={fieldErrors.qt_title}
                            className="sm:col-span-2"
                            hint="เช่น พัฒนาเว็บไซต์บริษัท · ใช้เป็นชื่อโปรเจกต์เมื่อลูกค้าตอบรับ"
                        >
                            <input
                                id="qt_title"
                                value={form.qt_title}
                                onChange={(event) => update({ qt_title: event.target.value })}
                                className={inputClass(Boolean(fieldErrors.qt_title))}
                            />
                        </FormField>
                        <FormField
                            label="สาขาที่ออกเอกสาร"
                            htmlFor="qt_branch_id"
                            required
                            hint={QUOTATION_MESSAGES.branch}
                            error={fieldErrors.qt_branch_id}
                        >
                            <select
                                id="qt_branch_id"
                                value={form.qt_branch_id}
                                onChange={(event) => update({ qt_branch_id: event.target.value })}
                                className={inputClass(Boolean(fieldErrors.qt_branch_id))}
                            >
                                {options.branches
                                    .filter(
                                        (branch) =>
                                            branch.branch_status === "active" || branch.branch_id === form.qt_branch_id,
                                    )
                                    .map((branch) => (
                                        <option key={branch.branch_id} value={branch.branch_id}>
                                            {branch.branch_code} · {branch.branch_name_th}
                                        </option>
                                    ))}
                            </select>
                        </FormField>
                        <FormField label="ภาษาเอกสาร" htmlFor="qt_language" hint={QUOTATION_MESSAGES.language}>
                            <select
                                id="qt_language"
                                value={form.qt_language}
                                onChange={(event) => changeLanguage(event.target.value as "th" | "en")}
                                className={inputClass()}
                            >
                                <option value="th">ไทย</option>
                                <option value="en">อังกฤษ</option>
                            </select>
                        </FormField>
                        <FormField
                            label="ยืนราคา (วัน)"
                            htmlFor="qt_valid_days"
                            required
                            error={fieldErrors.qt_valid_days}
                            hint={QUOTATION_MESSAGES.validDays(Number(form.qt_valid_days) || 0)}
                        >
                            <input
                                id="qt_valid_days"
                                inputMode="numeric"
                                value={form.qt_valid_days}
                                onChange={(event) => update({ qt_valid_days: event.target.value })}
                                className={inputClass(Boolean(fieldErrors.qt_valid_days))}
                            />
                        </FormField>
                        <FormField
                            label="การคิด VAT"
                            htmlFor="qt_vat_treatment"
                            hint={
                                !isVatRegistered
                                    ? QUOTATION_MESSAGES.vatNotRegistered
                                    : form.qt_vat_treatment === "zero"
                                      ? QUOTATION_MESSAGES.vatZero
                                      : QUOTATION_MESSAGES.vatStandard(vatRate)
                            }
                        >
                            <select
                                id="qt_vat_treatment"
                                value={form.qt_vat_treatment}
                                onChange={(event) =>
                                    update({ qt_vat_treatment: event.target.value as FormState["qt_vat_treatment"] })
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
                            htmlFor="qt_currency"
                            error={fieldErrors.qt_currency}
                            className="sm:max-w-xs"
                            hint="ราคาสินค้าเก็บเป็นบาท · ใส่ใบสกุลอื่นระบบแปลงตามอัตราในใบ"
                        >
                            <select
                                id="qt_currency"
                                value={form.qt_currency}
                                onChange={(event) => changeCurrency(event.target.value)}
                                className={inputClass(Boolean(fieldErrors.qt_currency))}
                            >
                                {options.currencies
                                    .filter(
                                        (item) => item.cur_status === "active" || item.cur_code === form.qt_currency,
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
                                currency={form.qt_currency}
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
                        {staleRows.length > 0 && (
                            <StatusBanner
                                tone="warn"
                                title={`ราคาของ ${staleRows.length} รายการยังคิดจากอัตรา/สกุลเงินเดิม`}
                            >
                                <p>
                                    แปลงราคาตั้งต้นของสินค้าตามอัตราปัจจุบันไหม? แถวที่คุณแก้ราคาเองจะคงราคาเดิม
                                    แค่ปรับราคาตั้งต้นที่ใช้เทียบ
                                </p>
                                <button
                                    type="button"
                                    className={`${buttonClass("secondary", "sm")} mt-2`}
                                    onClick={convertStalePrices}
                                >
                                    แปลงราคาตามอัตราปัจจุบัน
                                </button>
                            </StatusBanner>
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
                            htmlFor="qt_discount_value"
                            error={fieldErrors.qt_discount_value ?? calculation.errors.qt_discount_value}
                        >
                            <div className="flex gap-1">
                                <input
                                    id="qt_discount_value"
                                    inputMode="decimal"
                                    placeholder="0"
                                    value={form.qt_discount_value}
                                    onChange={(event) => update({ qt_discount_value: event.target.value })}
                                    className={inputClass(Boolean(fieldErrors.qt_discount_value))}
                                />
                                <select
                                    aria-label="ชนิดส่วนลดท้ายบิล"
                                    value={form.qt_discount_type}
                                    onChange={(event) =>
                                        update({
                                            qt_discount_type: event.target.value as FormState["qt_discount_type"],
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

                <SectionCard icon={Wallet} title="การเก็บเงิน">
                    <Segmented<FormState["qt_payment_mode"]>
                        label="การเก็บเงิน"
                        value={form.qt_payment_mode}
                        onChange={(mode) => update({ qt_payment_mode: mode })}
                        options={[
                            { value: "single", label: "เก็บครั้งเดียว" },
                            { value: "milestones", label: "แบ่งงวด" },
                        ]}
                    />
                    {form.qt_payment_mode === "milestones" && (
                        <MilestonesEditor
                            milestones={form.milestones}
                            amounts={calculation.milestoneAmounts}
                            currencyDecimals={decimals}
                            milestonesError={calculation.milestonesError}
                            errors={fieldErrors}
                            onChange={(milestones) => update({ milestones })}
                        />
                    )}
                </SectionCard>

                <SectionCard icon={NotebookPen} title="เงื่อนไขและบันทึกภายใน">
                    <div className="grid gap-4">
                        <FormField
                            label="เงื่อนไข (พิมพ์บนเอกสาร)"
                            htmlFor="qt_terms"
                            error={fieldErrors.qt_terms}
                            hint="ค่าเริ่มต้นจาก ตั้งค่าระบบ › ข้อมูลบริษัท ตามภาษาเอกสาร · แก้เฉพาะใบนี้ได้"
                        >
                            <textarea
                                id="qt_terms"
                                rows={4}
                                value={form.qt_terms}
                                onChange={(event) => update({ qt_terms: event.target.value })}
                                className={inputClass(Boolean(fieldErrors.qt_terms))}
                            />
                        </FormField>
                        <FormField
                            label="บันทึกภายใน"
                            htmlFor="qt_internal_note"
                            error={fieldErrors.qt_internal_note}
                            hint={QUOTATION_MESSAGES.internalNote}
                        >
                            <textarea
                                id="qt_internal_note"
                                rows={2}
                                value={form.qt_internal_note}
                                onChange={(event) => update({ qt_internal_note: event.target.value })}
                                className={inputClass()}
                            />
                        </FormField>
                    </div>
                </SectionCard>

                <SaveErrorBanner error={saveError} />
                {/* จอเล็กกว่า lg: แถบลอยติดล่างจอ มียอดรวมทั้งสิ้น + ปุ่มบันทึก — กรอกรายการไปเห็นยอดไปได้
                    ไม่ต้องเลื่อนลงไปหาการ์ดสรุปยอดที่อยู่ท้ายหน้า · จอใหญ่เป็นแถวปุ่มปกติ (สรุปยอดอยู่คอลัมน์ขวา) */}
                <div className="sticky bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-10 flex items-center justify-end gap-3 rounded-2xl border border-gray-200 bg-white/95 p-3 shadow-float backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none">
                    <div className="mr-auto grid min-w-0 lg:hidden">
                        <span className="text-xs text-gray-500">รวมทั้งสิ้น</span>
                        <span className="truncate font-medium text-gray-900 tabular-nums">
                            {formatAmount(calculation.total, decimals)} {form.qt_currency}
                        </span>
                    </div>
                    <button
                        type="button"
                        className={buttonClass("secondary", "md")}
                        onClick={() =>
                            router.push(
                                detail ? `/sales/quotations/view?id=${detail.quotation.qt_id}` : "/sales/quotations",
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

            <div className="lg:sticky lg:top-24">
                <SummaryPanel
                    totals={calculation}
                    vatRate={vatRate}
                    currency={currency}
                    language={form.qt_language}
                    approvalLevels={options.approval.levels}
                />
            </div>

            <ItemPicker
                open={isPickerOpen}
                exchangeRate={form.qt_exchange_rate}
                currencyCode={form.qt_currency}
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
