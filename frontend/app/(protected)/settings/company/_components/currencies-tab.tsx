"use client";

// แท็บสกุลเงิน — เพิ่ม/แก้/ปิดใช้งาน · บาทแก้ได้แค่ชื่อและคำอ่าน · ทศนิยมล็อกเมื่อมีเอกสารใช้แล้ว
import { Coins, Plus } from "lucide-react";
import FormField, { inputClass } from "@/components/ui/form-field";
import StatusBanner from "@/components/ui/guidance/status-banner";
import { currencyCreateSchema, currencyUpdateSchema } from "@/lib/shared/schemas/company.mjs";
import { COMPANY_MESSAGES } from "../_messages";
import type { Currency } from "../_types";
import { toNumberOrNaN, useRecordEditor } from "@/lib/use-record-editor";
import { InfoPill, RecordList, RecordRow, StatusPill } from "@/components/ui/record-list";
import SaveErrorBanner from "@/components/ui/save-error-banner";
import SectionCard, { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/ui/section-card";
import { amountInWords } from "@/lib/shared/amount-in-words.mjs";
import BotRateCheck from "./bot-rate-check";

const EMPTY_FORM = {
    cur_code: "",
    cur_name_th: "",
    cur_name_en: "",
    cur_symbol: "",
    cur_decimals: "2",
    cur_unit_th: "",
    cur_subunit_th: "",
    cur_unit_en: "",
    cur_subunit_en: "",
    cur_bot_unit: "1",
    cur_sort_order: "0",
    cur_status: "active" as "active" | "inactive",
};

type CurrencyForm = typeof EMPTY_FORM;

const SAMPLE_AMOUNT = "1234.50";

// ตัวอย่างจำนวนเงินเป็นตัวอักษรจากคำอ่านที่กำลังกรอก — เห็นทันทีว่าบนเอกสารจะออกมาอย่างไร
function amountWordsPreview(form: CurrencyForm) {
    const decimals = Number(form.cur_decimals);
    if (![0, 1, 2].includes(decimals) || !form.cur_unit_th.trim() || !form.cur_unit_en.trim()) return null;
    const currency = {
        cur_decimals: decimals,
        cur_unit_th: form.cur_unit_th.trim(),
        cur_subunit_th: form.cur_subunit_th.trim() || null,
        cur_unit_en: form.cur_unit_en.trim(),
        cur_subunit_en: form.cur_subunit_en.trim() || null,
    };
    return { th: amountInWords(SAMPLE_AMOUNT, currency, "th"), en: amountInWords(SAMPLE_AMOUNT, currency, "en") };
}
type TextField = Exclude<keyof CurrencyForm, "cur_status" | "cur_decimals" | "cur_bot_unit">;

function toForm(currency: Currency): CurrencyForm {
    return {
        cur_code: currency.cur_code,
        cur_name_th: currency.cur_name_th,
        cur_name_en: currency.cur_name_en,
        cur_symbol: currency.cur_symbol ?? "",
        cur_decimals: String(currency.cur_decimals),
        cur_unit_th: currency.cur_unit_th,
        cur_subunit_th: currency.cur_subunit_th ?? "",
        cur_unit_en: currency.cur_unit_en,
        cur_subunit_en: currency.cur_subunit_en ?? "",
        cur_bot_unit: String(currency.cur_bot_unit),
        cur_sort_order: String(currency.cur_sort_order),
        cur_status: currency.cur_status,
    };
}

function toPayload(form: CurrencyForm) {
    return {
        ...form,
        cur_decimals: toNumberOrNaN(form.cur_decimals),
        cur_bot_unit: toNumberOrNaN(form.cur_bot_unit),
        cur_sort_order: toNumberOrNaN(form.cur_sort_order),
    };
}

type CurrenciesTabProps = {
    currencies: Currency[];
    canEdit: boolean;
    onSaved: () => Promise<void>;
};

export default function CurrenciesTab({ currencies, canEdit, onSaved }: CurrenciesTabProps) {
    const messages = COMPANY_MESSAGES.currencies;
    const editor = useRecordEditor<CurrencyForm>(EMPTY_FORM, onSaved);
    const { form, fieldErrors } = editor;
    const editingCurrency = currencies.find((currency) => currency.cur_code === editor.editingId) ?? null;
    const isBaseCurrency = editingCurrency?.is_base_currency ?? false;
    const isDecimalsLocked = isBaseCurrency || (editingCurrency?.is_used_in_documents ?? false);
    const wordsPreview = editor.isOpen ? amountWordsPreview(form) : null;

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault();
        await editor.submit({
            createSchema: currencyCreateSchema,
            updateSchema: currencyUpdateSchema,
            createPath: "/company/currencies",
            updatePath: (currencyCode) => `/company/currencies/${currencyCode}`,
            toPayload,
        });
    }

    function textInput(field: TextField, disabled = false) {
        return (
            <input
                id={field}
                value={form[field]}
                onChange={(event) => editor.updateField(field, event.target.value)}
                disabled={disabled}
                className={inputClass(Boolean(fieldErrors[field]))}
            />
        );
    }

    return (
        <SectionCard
            icon={Coins}
            title={COMPANY_MESSAGES.tabs.currencies}
            description={messages.description}
            actions={
                canEdit &&
                !editor.isOpen && (
                    <button type="button" className={PRIMARY_BUTTON} onClick={editor.openCreate}>
                        <Plus size={16} />
                        เพิ่มสกุลเงิน
                    </button>
                )
            }
        >
            {editor.isOpen && (
                <form onSubmit={handleSubmit} className="grid gap-4 rounded-lg bg-gray-50 p-4" noValidate>
                    <p className="font-medium text-gray-800">
                        {editingCurrency ? `แก้ไขสกุลเงิน ${editingCurrency.cur_code}` : "เพิ่มสกุลเงิน"}
                    </p>
                    {isBaseCurrency && <StatusBanner tone="info" title={messages.baseCurrencyLocked} />}
                    <div className="grid gap-4 sm:grid-cols-2">
                        <FormField
                            label="รหัสสกุลเงิน"
                            htmlFor="cur_code"
                            required
                            hint={messages.code}
                            error={fieldErrors.cur_code}
                        >
                            {textInput("cur_code", editingCurrency !== null)}
                        </FormField>
                        <FormField label="สัญลักษณ์" htmlFor="cur_symbol" error={fieldErrors.cur_symbol}>
                            {textInput("cur_symbol")}
                        </FormField>
                        <FormField
                            label="ชื่อ (ภาษาไทย)"
                            htmlFor="cur_name_th"
                            required
                            error={fieldErrors.cur_name_th}
                        >
                            {textInput("cur_name_th")}
                        </FormField>
                        <FormField
                            label="ชื่อ (ภาษาอังกฤษ)"
                            htmlFor="cur_name_en"
                            required
                            error={fieldErrors.cur_name_en}
                        >
                            {textInput("cur_name_en")}
                        </FormField>
                        <FormField
                            label="จำนวนทศนิยม"
                            htmlFor="cur_decimals"
                            hint={editingCurrency?.is_used_in_documents ? messages.decimalsLocked : messages.decimals}
                            error={fieldErrors.cur_decimals}
                        >
                            <select
                                id="cur_decimals"
                                value={form.cur_decimals}
                                onChange={(event) => editor.updateField("cur_decimals", event.target.value)}
                                disabled={isDecimalsLocked}
                                className={inputClass(Boolean(fieldErrors.cur_decimals))}
                            >
                                <option value="0">0 (ไม่มีทศนิยม)</option>
                                <option value="1">1</option>
                                <option value="2">2</option>
                            </select>
                        </FormField>
                        <FormField
                            label="ธปท. ประกาศอัตราต่อ"
                            htmlFor="cur_bot_unit"
                            hint={messages.botUnit}
                            error={fieldErrors.cur_bot_unit}
                        >
                            <select
                                id="cur_bot_unit"
                                value={form.cur_bot_unit}
                                onChange={(event) => editor.updateField("cur_bot_unit", event.target.value)}
                                disabled={isBaseCurrency}
                                className={inputClass(Boolean(fieldErrors.cur_bot_unit))}
                            >
                                <option value="1">1 หน่วย</option>
                                <option value="100">100 หน่วย</option>
                                <option value="1000">1,000 หน่วย</option>
                            </select>
                        </FormField>
                        <FormField
                            label="คำอ่านหน่วยหลัก (ภาษาไทย)"
                            htmlFor="cur_unit_th"
                            required
                            hint={messages.unitWords}
                            error={fieldErrors.cur_unit_th}
                        >
                            {textInput("cur_unit_th")}
                        </FormField>
                        <FormField
                            label="คำอ่านหน่วยย่อย (ภาษาไทย)"
                            htmlFor="cur_subunit_th"
                            hint={messages.subunitWords}
                            error={fieldErrors.cur_subunit_th}
                        >
                            {textInput("cur_subunit_th")}
                        </FormField>
                        <FormField
                            label="คำอ่านหน่วยหลัก (ภาษาอังกฤษ)"
                            htmlFor="cur_unit_en"
                            required
                            error={fieldErrors.cur_unit_en}
                        >
                            {textInput("cur_unit_en")}
                        </FormField>
                        <FormField
                            label="คำอ่านหน่วยย่อย (ภาษาอังกฤษ)"
                            htmlFor="cur_subunit_en"
                            hint={messages.subunitWords}
                            error={fieldErrors.cur_subunit_en}
                        >
                            {textInput("cur_subunit_en")}
                        </FormField>
                        <FormField
                            label="ลำดับในรายการ"
                            htmlFor="cur_sort_order"
                            hint="ตัวเลขน้อยขึ้นก่อน"
                            error={fieldErrors.cur_sort_order}
                        >
                            {textInput("cur_sort_order")}
                        </FormField>
                        <FormField label="สถานะ" htmlFor="cur_status" error={fieldErrors.cur_status}>
                            <select
                                id="cur_status"
                                value={form.cur_status}
                                onChange={(event) =>
                                    editor.updateField("cur_status", event.target.value as CurrencyForm["cur_status"])
                                }
                                disabled={isBaseCurrency}
                                className={inputClass(Boolean(fieldErrors.cur_status))}
                            >
                                <option value="active">ใช้งาน</option>
                                <option value="inactive">ปิดใช้งาน</option>
                            </select>
                        </FormField>
                    </div>
                    {wordsPreview && (
                        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
                            <p className="text-xs text-gray-500">ตัวอย่างบนเอกสาร (ยอด 1,234.50)</p>
                            <p>{wordsPreview.th}</p>
                            <p>{wordsPreview.en}</p>
                        </div>
                    )}
                    <SaveErrorBanner error={editor.saveError} />
                    <div className="flex flex-wrap justify-end gap-2">
                        <button type="button" className={SECONDARY_BUTTON} onClick={editor.close}>
                            ยกเลิก
                        </button>
                        <button type="submit" className={PRIMARY_BUTTON} disabled={editor.isSaving}>
                            {editor.isSaving ? "กำลังบันทึก..." : "บันทึกสกุลเงิน"}
                        </button>
                    </div>
                </form>
            )}

            <BotRateCheck currencies={currencies} />

            <RecordList>
                {currencies.map((currency) => (
                    <RecordRow
                        key={currency.cur_code}
                        title={`${currency.cur_code} · ${currency.cur_name_th}`}
                        details={`ทศนิยม ${currency.cur_decimals} ตำแหน่ง · ธปท. ประกาศต่อ ${currency.cur_bot_unit} หน่วย · อ่านว่า "${currency.cur_unit_th}${currency.cur_subunit_th ? `/${currency.cur_subunit_th}` : ""}"`}
                        pills={
                            <>
                                {currency.is_base_currency && <InfoPill>สกุลหลัก</InfoPill>}
                                <StatusPill isActive={currency.cur_status === "active"} />
                            </>
                        }
                        canEdit={canEdit}
                        onEdit={() => editor.openEdit(currency.cur_code, toForm(currency))}
                    />
                ))}
            </RecordList>
        </SectionCard>
    );
}
