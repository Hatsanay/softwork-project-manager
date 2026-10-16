"use client";

// ฟอร์มลูกค้า — ใช้ทั้งหน้าสร้างและหน้าแก้ไข (2026-10-13 ขั้น 1A-1d)
// ตรวจด้วย clientSchema ชุดเดียวกับ backend ก่อนส่ง · error จากเซิร์ฟเวอร์แสดงใต้ช่องเดียวกัน
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2, ReceiptText, Settings2, UserRound } from "lucide-react";
import FormField, { inputClass } from "@/components/ui/form-field";
import SectionCard from "@/components/ui/section-card";
import Segmented from "@/components/ui/segmented";
import StatusBanner from "@/components/ui/guidance/status-banner";
import SaveErrorBanner from "@/components/ui/save-error-banner";
import { buttonClass } from "@/components/ui/button";
import { apiFetch, type ApiError } from "@/lib/api";
import { toFieldErrors, type FieldErrors } from "@/lib/form-errors";
import { clientSchema } from "@/lib/shared/schemas/client.mjs";
import { CLIENT_MESSAGES } from "../_messages";
import type { ActiveStatus, Client, ClientType, CurrencyChoice, DocumentLanguage, VatTreatment } from "../_types";

const THAILAND = "TH";
const HEAD_OFFICE_CODE = "00000";

// ประเทศที่พบบ่อย — ค่าที่ไม่อยู่ในรายการ (ลูกค้าเดิม) จะถูกเพิ่มเข้าตัวเลือกให้เอง
export const COUNTRIES: { code: string; name: string }[] = [
    { code: "TH", name: "ไทย" },
    { code: "US", name: "สหรัฐอเมริกา" },
    { code: "GB", name: "สหราชอาณาจักร" },
    { code: "JP", name: "ญี่ปุ่น" },
    { code: "CN", name: "จีน" },
    { code: "HK", name: "ฮ่องกง" },
    { code: "TW", name: "ไต้หวัน" },
    { code: "KR", name: "เกาหลีใต้" },
    { code: "SG", name: "สิงคโปร์" },
    { code: "MY", name: "มาเลเซีย" },
    { code: "VN", name: "เวียดนาม" },
    { code: "LA", name: "ลาว" },
    { code: "KH", name: "กัมพูชา" },
    { code: "MM", name: "เมียนมา" },
    { code: "ID", name: "อินโดนีเซีย" },
    { code: "PH", name: "ฟิลิปปินส์" },
    { code: "IN", name: "อินเดีย" },
    { code: "AU", name: "ออสเตรเลีย" },
    { code: "DE", name: "เยอรมนี" },
    { code: "FR", name: "ฝรั่งเศส" },
];

const EMPTY_FORM = {
    client_type: "juristic" as ClientType,
    client_name: "",
    client_company: "",
    client_contact_name: "",
    client_email: "",
    client_phone: "",
    client_country: THAILAND,
    client_tax_id: "",
    client_branch_code: "",
    client_address: "",
    client_currency: "THB",
    client_language: "th" as DocumentLanguage,
    client_vat_treatment: "standard" as VatTreatment,
    client_credit_days: "",
    client_wht_rate: "",
    client_status: "active" as ActiveStatus,
};

type ClientFormValues = typeof EMPTY_FORM;
type TextField = Exclude<
    keyof ClientFormValues,
    "client_type" | "client_language" | "client_vat_treatment" | "client_status"
>;

function toForm(client: Client): ClientFormValues {
    return {
        client_type: client.client_type,
        client_name: client.client_name,
        client_company: client.client_company ?? "",
        client_contact_name: client.client_contact_name ?? "",
        client_email: client.client_email ?? "",
        client_phone: client.client_phone ?? "",
        client_country: client.client_country,
        client_tax_id: client.client_tax_id ?? "",
        client_branch_code: client.client_branch_code ?? "",
        client_address: client.client_address ?? "",
        client_currency: client.client_currency,
        client_language: client.client_language,
        client_vat_treatment: client.client_vat_treatment,
        client_credit_days: client.client_credit_days === null ? "" : String(client.client_credit_days),
        client_wht_rate: client.client_wht_rate ?? "",
        client_status: client.client_status,
    };
}

// ช่องตัวเลขเป็นข้อความในฟอร์ม — ว่าง = ไม่ระบุ · พิมพ์ไม่ใช่ตัวเลข = NaN ให้ชุดตรวจบอกว่าผิด (ไม่แปลงเป็น 0 เงียบๆ)
function toPayload(form: ClientFormValues) {
    const creditDaysText = form.client_credit_days.trim();
    const whtRateText = form.client_wht_rate.trim();
    return {
        ...form,
        client_credit_days: creditDaysText === "" ? null : Number(creditDaysText),
        client_wht_rate: whtRateText === "" ? null : whtRateText,
        // บุคคลธรรมดาไม่มีสาขา — ทิ้งค่าที่อาจค้างจากตอนเลือกนิติบุคคล
        client_branch_code: form.client_type === "individual" ? "" : form.client_branch_code,
    };
}

type ClientFormProps = {
    // ไม่ส่ง = สร้างใหม่
    client?: Client;
};

export default function ClientForm({ client }: ClientFormProps) {
    const router = useRouter();
    const isEditing = client !== undefined;
    const [form, setForm] = useState<ClientFormValues>(() => (client ? toForm(client) : EMPTY_FORM));
    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
    const [saveError, setSaveError] = useState<ApiError | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [currencies, setCurrencies] = useState<CurrencyChoice[]>([]);

    useEffect(() => {
        let isLeftPage = false;
        apiFetch<{ currencies: CurrencyChoice[] }>("/company").then(({ data }) => {
            if (!isLeftPage && data) setCurrencies(data.currencies);
        });
        return () => {
            isLeftPage = true;
        };
    }, []);

    const isThai = form.client_country === THAILAND;
    const needsBranchCode = form.client_type === "juristic";
    const savedCurrency = client?.client_currency ?? null;
    // เลือกได้เฉพาะสกุลที่เปิดใช้งาน + สกุลเดิมของลูกค้า (แม้ถูกปิดไปแล้ว)
    const currencyChoices = currencies.filter(
        (currency) => currency.cur_status === "active" || currency.cur_code === savedCurrency,
    );
    const isSelectedCurrencyInactive = currencies.some(
        (currency) => currency.cur_code === form.client_currency && currency.cur_status !== "active",
    );
    const countryChoices = COUNTRIES.some((country) => country.code === form.client_country)
        ? COUNTRIES
        : [...COUNTRIES, { code: form.client_country, name: form.client_country }];

    function updateField<Field extends keyof ClientFormValues>(field: Field, value: ClientFormValues[Field]) {
        setForm((current) => ({ ...current, [field]: value }));
    }

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault();
        setSaveError(null);
        const checked = clientSchema.safeParse(toPayload(form));
        if (!checked.success) {
            setFieldErrors(toFieldErrors(checked.error.issues));
            return;
        }
        setFieldErrors({});

        setIsSaving(true);
        const { error } = isEditing
            ? await apiFetch(`/clients/${client.client_id}`, { method: "PUT", body: checked.data })
            : await apiFetch("/clients", { method: "POST", body: checked.data });
        setIsSaving(false);
        if (error) {
            setFieldErrors(error.fields);
            setSaveError(error);
            return;
        }

        toast.success(isEditing ? "บันทึกลูกค้าแล้ว" : "สร้างลูกค้าแล้ว");
        router.push("/clients");
    }

    function textInput(
        field: TextField,
        options: { type?: string; inputMode?: "numeric" | "decimal" | "email" | "tel"; placeholder?: string } = {},
    ) {
        return (
            <input
                id={field}
                type={options.type ?? "text"}
                inputMode={options.inputMode}
                placeholder={options.placeholder}
                value={form[field]}
                onChange={(event) => updateField(field, event.target.value)}
                aria-describedby={`${field}-hint`}
                className={inputClass(Boolean(fieldErrors[field]))}
            />
        );
    }

    return (
        <form onSubmit={handleSubmit} className="grid gap-5" noValidate>
            <SectionCard icon={Building2} title="ข้อมูลลูกค้า" description={CLIENT_MESSAGES.formDescription}>
                <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                        label="ประเภทลูกค้า"
                        htmlFor="client_type"
                        hint={CLIENT_MESSAGES.type}
                        error={fieldErrors.client_type}
                        className="sm:col-span-2"
                    >
                        <Segmented<ClientType>
                            label="ประเภทลูกค้า"
                            value={form.client_type}
                            onChange={(value) => updateField("client_type", value)}
                            options={[
                                { value: "juristic", label: "นิติบุคคล" },
                                { value: "individual", label: "บุคคลธรรมดา" },
                            ]}
                        />
                    </FormField>
                    <FormField
                        label="ชื่อลูกค้า"
                        htmlFor="client_name"
                        required
                        hint={CLIENT_MESSAGES.name}
                        error={fieldErrors.client_name}
                    >
                        {textInput("client_name")}
                    </FormField>
                    <FormField
                        label={form.client_type === "juristic" ? "ชื่อบริษัท (ตามทะเบียน)" : "ชื่อ-นามสกุลเต็ม"}
                        htmlFor="client_company"
                        hint={CLIENT_MESSAGES.company}
                        error={fieldErrors.client_company}
                    >
                        {textInput("client_company")}
                    </FormField>
                    <FormField
                        label="สถานะ"
                        htmlFor="client_status"
                        hint={form.client_status === "inactive" ? CLIENT_MESSAGES.statusInactive : undefined}
                        error={fieldErrors.client_status}
                    >
                        <select
                            id="client_status"
                            value={form.client_status}
                            onChange={(event) => updateField("client_status", event.target.value as ActiveStatus)}
                            className={inputClass(Boolean(fieldErrors.client_status))}
                        >
                            <option value="active">ใช้งาน</option>
                            <option value="inactive">ปิดใช้งาน</option>
                        </select>
                    </FormField>
                </div>
            </SectionCard>

            <SectionCard icon={UserRound} title="ผู้ติดต่อ">
                <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                        label="ชื่อผู้ติดต่อ"
                        htmlFor="client_contact_name"
                        hint={CLIENT_MESSAGES.contactName}
                        error={fieldErrors.client_contact_name}
                        className="sm:col-span-2"
                    >
                        {textInput("client_contact_name")}
                    </FormField>
                    <FormField label="อีเมล" htmlFor="client_email" error={fieldErrors.client_email}>
                        {textInput("client_email", { type: "email", inputMode: "email" })}
                    </FormField>
                    <FormField label="เบอร์โทรศัพท์" htmlFor="client_phone" error={fieldErrors.client_phone}>
                        {textInput("client_phone", { type: "tel", inputMode: "tel" })}
                    </FormField>
                </div>
            </SectionCard>

            <SectionCard icon={ReceiptText} title="ภาษีและที่อยู่สำหรับออกเอกสาร">
                <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                        label="ประเทศ"
                        htmlFor="client_country"
                        hint={CLIENT_MESSAGES.country}
                        error={fieldErrors.client_country}
                    >
                        <select
                            id="client_country"
                            value={form.client_country}
                            onChange={(event) => updateField("client_country", event.target.value)}
                            className={inputClass(Boolean(fieldErrors.client_country))}
                        >
                            {countryChoices.map((country) => (
                                <option key={country.code} value={country.code}>
                                    {country.name} ({country.code})
                                </option>
                            ))}
                        </select>
                    </FormField>
                    <FormField
                        label="เลขประจำตัวผู้เสียภาษี"
                        htmlFor="client_tax_id"
                        hint={isThai ? CLIENT_MESSAGES.taxIdThai : CLIENT_MESSAGES.taxIdForeign}
                        error={fieldErrors.client_tax_id}
                    >
                        {textInput("client_tax_id", { inputMode: isThai ? "numeric" : undefined })}
                    </FormField>
                    {needsBranchCode && (
                        <FormField
                            label="สาขาของลูกค้า"
                            htmlFor="client_branch_code"
                            hint={CLIENT_MESSAGES.branchCode}
                            error={fieldErrors.client_branch_code}
                        >
                            <div className="flex gap-2">
                                {textInput("client_branch_code", { inputMode: "numeric", placeholder: "เช่น 00000" })}
                                <button
                                    type="button"
                                    className={`${buttonClass("secondary", "md")} shrink-0`}
                                    onClick={() => updateField("client_branch_code", HEAD_OFFICE_CODE)}
                                >
                                    สำนักงานใหญ่
                                </button>
                            </div>
                        </FormField>
                    )}
                    <FormField
                        label="ที่อยู่สำหรับออกเอกสาร"
                        htmlFor="client_address"
                        hint={CLIENT_MESSAGES.address}
                        error={fieldErrors.client_address}
                        className="sm:col-span-2"
                    >
                        <textarea
                            id="client_address"
                            rows={3}
                            value={form.client_address}
                            onChange={(event) => updateField("client_address", event.target.value)}
                            aria-describedby="client_address-hint"
                            className={inputClass(Boolean(fieldErrors.client_address))}
                        />
                    </FormField>
                </div>
            </SectionCard>

            <SectionCard
                icon={Settings2}
                title="ค่าเริ่มต้นของเอกสารขาย"
                description="เติมให้อัตโนมัติตอนสร้างใบเสนอราคาให้ลูกค้านี้ — เปลี่ยนในแต่ละใบได้"
            >
                <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                        label="สกุลเงิน"
                        htmlFor="client_currency"
                        hint={isSelectedCurrencyInactive ? CLIENT_MESSAGES.currencyInactive : CLIENT_MESSAGES.currency}
                        error={fieldErrors.client_currency}
                    >
                        <select
                            id="client_currency"
                            value={form.client_currency}
                            onChange={(event) => updateField("client_currency", event.target.value)}
                            className={inputClass(Boolean(fieldErrors.client_currency))}
                        >
                            {currencyChoices.length === 0 && (
                                <option value={form.client_currency}>{form.client_currency}</option>
                            )}
                            {currencyChoices.map((currency) => (
                                <option key={currency.cur_code} value={currency.cur_code}>
                                    {currency.cur_code} · {currency.cur_name_th}
                                    {currency.cur_status !== "active" ? " (ปิดใช้งาน)" : ""}
                                </option>
                            ))}
                        </select>
                    </FormField>
                    <FormField
                        label="ภาษาเอกสาร"
                        htmlFor="client_language"
                        hint={CLIENT_MESSAGES.language}
                        error={fieldErrors.client_language}
                    >
                        <select
                            id="client_language"
                            value={form.client_language}
                            onChange={(event) => updateField("client_language", event.target.value as DocumentLanguage)}
                            className={inputClass(Boolean(fieldErrors.client_language))}
                        >
                            <option value="th">ไทย</option>
                            <option value="en">อังกฤษ</option>
                        </select>
                    </FormField>
                    <FormField
                        label="การคิด VAT"
                        htmlFor="client_vat_treatment"
                        hint={
                            form.client_vat_treatment === "zero" ? CLIENT_MESSAGES.vatZero : CLIENT_MESSAGES.vatStandard
                        }
                        error={fieldErrors.client_vat_treatment}
                    >
                        <select
                            id="client_vat_treatment"
                            value={form.client_vat_treatment}
                            onChange={(event) =>
                                updateField("client_vat_treatment", event.target.value as VatTreatment)
                            }
                            className={inputClass(Boolean(fieldErrors.client_vat_treatment))}
                        >
                            <option value="standard">ปกติ (ตามอัตราของบริษัท)</option>
                            <option value="zero">0% (ส่งออกบริการ)</option>
                        </select>
                    </FormField>
                    <FormField
                        label="เครดิตเทอม (วัน)"
                        htmlFor="client_credit_days"
                        hint={CLIENT_MESSAGES.creditDays}
                        error={fieldErrors.client_credit_days}
                    >
                        {textInput("client_credit_days", { inputMode: "numeric", placeholder: "เช่น 30" })}
                    </FormField>
                    <FormField
                        label="หัก ณ ที่จ่าย (%)"
                        htmlFor="client_wht_rate"
                        hint={CLIENT_MESSAGES.whtRate}
                        error={fieldErrors.client_wht_rate}
                    >
                        {textInput("client_wht_rate", { inputMode: "decimal", placeholder: "เช่น 3" })}
                    </FormField>
                </div>
                {form.client_vat_treatment === "zero" && isThai && (
                    <StatusBanner tone="warn" title="ลูกค้าในไทยแต่เลือก VAT 0%">
                        VAT 0% ใช้กับการส่งออกบริการไปต่างประเทศเป็นหลัก ลูกค้าในไทยปกติใช้แบบปกติ —
                        ตรวจกับนักบัญชีก่อนบันทึก
                    </StatusBanner>
                )}
            </SectionCard>

            <SaveErrorBanner error={saveError} />
            <div className="flex flex-wrap justify-end gap-3">
                <button
                    type="button"
                    onClick={() => router.push("/clients")}
                    className={buttonClass("secondary", "md")}
                >
                    ยกเลิก
                </button>
                <button type="submit" disabled={isSaving} className={buttonClass("primary", "md")}>
                    {isSaving ? "กำลังบันทึก..." : isEditing ? "บันทึกการแก้ไข" : "สร้างลูกค้า"}
                </button>
            </div>
        </form>
    );
}
