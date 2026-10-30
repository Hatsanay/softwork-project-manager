"use client";

// ฟอร์มผู้ขาย — ใช้ทั้งหน้าเพิ่มและหน้าแก้ไข (2026-10-16 เฟส 2 ขั้น 2-1)
// ตรวจด้วย vendorSchema ชุดเดียวกับ backend ก่อนส่ง · error จากเซิร์ฟเวอร์แสดงใต้ช่องเดียวกัน
// แก้เลขบัญชีผู้ขาย: แถบเตือนให้โทรยืนยัน (กลโกงเปลี่ยนบัญชีรับเงิน R-P6) — backend บันทึกค่าก่อน/หลังใน audit log
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2, Landmark, ReceiptText, Settings2 } from "lucide-react";
import FormField, { inputClass } from "@/components/ui/form-field";
import SectionCard from "@/components/ui/section-card";
import Segmented from "@/components/ui/segmented";
import StatusBanner from "@/components/ui/guidance/status-banner";
import SaveErrorBanner from "@/components/ui/save-error-banner";
import { PageSkeleton } from "@/components/ui/skeleton";
import { buttonClass } from "@/components/ui/button";
import { apiFetch, type ApiError } from "@/lib/api";
import { toFieldErrors, type FieldErrors } from "@/lib/form-errors";
import { vendorSchema } from "@/lib/shared/schemas/purchasing.mjs";
import { COUNTRIES } from "../../../clients/_components/client-form";
import { usePurchasingSetup } from "../../_hooks/use-purchasing-setup";
import { VENDOR_MESSAGES, whtFormLabel } from "../../_messages";
import type { ActiveStatus, Vendor, VendorType, WhtForm } from "../../_types";

const THAILAND = "TH";
const HEAD_OFFICE_CODE = "00000";

type CurrencyChoice = { cur_code: string; cur_name_th: string; cur_status: ActiveStatus };

const EMPTY_FORM = {
    vd_code: "",
    vd_type: "juristic" as VendorType,
    vd_country: THAILAND,
    vd_name: "",
    vd_tax_id: "",
    vd_branch_code: "",
    vd_address: "",
    vd_contact_name: "",
    vd_email: "",
    vd_phone: "",
    vd_bank_name: "",
    vd_bank_account_no: "",
    vd_bank_account_name: "",
    vd_promptpay_id: "",
    vd_credit_days: "",
    vd_currency: "THB",
    vd_default_income_type: "",
    vd_default_category_id: "",
    vd_notes: "",
    vd_status: "active" as ActiveStatus,
};

type VendorFormValues = typeof EMPTY_FORM;
type TextField = Exclude<keyof VendorFormValues, "vd_type" | "vd_status">;

function toForm(vendor: Vendor): VendorFormValues {
    return {
        vd_code: vendor.vd_code ?? "",
        vd_type: vendor.vd_type,
        vd_country: vendor.vd_country,
        vd_name: vendor.vd_name,
        vd_tax_id: vendor.vd_tax_id ?? "",
        vd_branch_code: vendor.vd_branch_code ?? "",
        vd_address: vendor.vd_address ?? "",
        vd_contact_name: vendor.vd_contact_name ?? "",
        vd_email: vendor.vd_email ?? "",
        vd_phone: vendor.vd_phone ?? "",
        vd_bank_name: vendor.vd_bank_name ?? "",
        vd_bank_account_no: vendor.vd_bank_account_no ?? "",
        vd_bank_account_name: vendor.vd_bank_account_name ?? "",
        vd_promptpay_id: vendor.vd_promptpay_id ?? "",
        vd_credit_days: vendor.vd_credit_days === null ? "" : String(vendor.vd_credit_days),
        vd_currency: vendor.vd_currency,
        vd_default_income_type: vendor.vd_default_income_type ?? "",
        vd_default_category_id: vendor.vd_default_category_id === null ? "" : String(vendor.vd_default_category_id),
        vd_notes: vendor.vd_notes ?? "",
        vd_status: vendor.vd_status,
    };
}

// ช่องตัวเลขเป็นข้อความในฟอร์ม — ว่าง = ไม่ระบุ · พิมพ์ไม่ใช่ตัวเลข = NaN ให้ชุดตรวจบอกว่าผิด
function toPayload(form: VendorFormValues) {
    const creditDaysText = form.vd_credit_days.trim();
    return {
        ...form,
        vd_credit_days: creditDaysText === "" ? null : Number(creditDaysText),
        vd_default_category_id: form.vd_default_category_id === "" ? null : Number(form.vd_default_category_id),
    };
}

function previewWhtForm(form: VendorFormValues): WhtForm {
    if (form.vd_country !== THAILAND) return null;
    return form.vd_type === "individual" ? "PND3" : "PND53";
}

export default function VendorForm({ vendor }: { vendor?: Vendor }) {
    const router = useRouter();
    const isEditing = vendor !== undefined;
    const { setup, loadError: setupError } = usePurchasingSetup();
    const [form, setForm] = useState<VendorFormValues>(() => (vendor ? toForm(vendor) : EMPTY_FORM));
    const [currencies, setCurrencies] = useState<CurrencyChoice[]>([]);
    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
    const [saveError, setSaveError] = useState<ApiError | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        let isLeftPage = false;
        apiFetch<{ currencies: CurrencyChoice[] }>("/company").then(({ data }) => {
            if (!isLeftPage && data) setCurrencies(data.currencies);
        });
        return () => {
            isLeftPage = true;
        };
    }, []);

    if (setupError)
        return (
            <StatusBanner tone="error" title="โหลดตั้งค่าจัดซื้อไม่สำเร็จ">
                {setupError.message}
            </StatusBanner>
        );
    if (!setup) return <PageSkeleton />;

    const isThai = form.vd_country === THAILAND;
    const isJuristic = form.vd_type === "juristic";
    const isBankChanged =
        isEditing &&
        (form.vd_bank_account_no.replace(/\s+/g, "") !== (vendor.vd_bank_account_no ?? "") ||
            form.vd_promptpay_id.replace(/[\s-]/g, "") !== (vendor.vd_promptpay_id ?? ""));
    const countryChoices = COUNTRIES.some((country) => country.code === form.vd_country)
        ? COUNTRIES
        : [...COUNTRIES, { code: form.vd_country, name: form.vd_country }];
    const currencyChoices = currencies.filter(
        (currency) => currency.cur_status === "active" || currency.cur_code === vendor?.vd_currency,
    );
    const incomeTypeChoices = setup.income_types.filter(
        (type) => type.wit_status === "active" || type.wit_code === vendor?.vd_default_income_type,
    );
    const categoryChoices = setup.categories.filter(
        (category) => category.ec_status === "active" || category.ec_id === vendor?.vd_default_category_id,
    );

    function updateField<Field extends keyof VendorFormValues>(field: Field, value: VendorFormValues[Field]) {
        setForm((current) => ({ ...current, [field]: value }));
    }

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault();
        setSaveError(null);
        const checked = vendorSchema.safeParse(toPayload(form));
        if (!checked.success) {
            setFieldErrors(toFieldErrors(checked.error.issues));
            toast.error("ยังบันทึกไม่ได้ · แก้ช่องที่มีข้อความสีแดงก่อน");
            return;
        }
        setFieldErrors({});
        setIsSaving(true);
        const { error } = isEditing
            ? await apiFetch(`/vendors/${vendor.vd_id}`, { method: "PUT", body: checked.data })
            : await apiFetch("/vendors", { method: "POST", body: checked.data });
        setIsSaving(false);
        if (error) {
            setFieldErrors(error.fields);
            setSaveError(error);
            return;
        }
        toast.success(isEditing ? "บันทึกผู้ขายแล้ว" : "เพิ่มผู้ขายแล้ว");
        router.push("/purchasing/vendors");
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
                className={inputClass(Boolean(fieldErrors[field]))}
            />
        );
    }

    return (
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-5" noValidate>
            <SectionCard icon={Building2} title="ข้อมูลผู้ขาย" description={VENDOR_MESSAGES.type}>
                <div className="grid gap-4 sm:grid-cols-2">
                    <FormField label="ประเภท" htmlFor="vd_type" error={fieldErrors.vd_type} className="sm:col-span-2">
                        <Segmented<VendorType>
                            label="ประเภทผู้ขาย"
                            value={form.vd_type}
                            onChange={(value) => updateField("vd_type", value)}
                            options={[
                                { value: "juristic", label: "นิติบุคคล" },
                                { value: "individual", label: "บุคคลธรรมดา" },
                            ]}
                        />
                    </FormField>
                    <FormField
                        label={isJuristic ? "ชื่อบริษัท (ตามทะเบียน)" : "ชื่อ-นามสกุล"}
                        htmlFor="vd_name"
                        required
                        hint={VENDOR_MESSAGES.name}
                        error={fieldErrors.vd_name}
                        className="sm:col-span-2"
                    >
                        {textInput("vd_name")}
                    </FormField>
                    <FormField
                        label="รหัสผู้ขาย"
                        htmlFor="vd_code"
                        hint={VENDOR_MESSAGES.code}
                        error={fieldErrors.vd_code}
                    >
                        {textInput("vd_code", { placeholder: "เช่น FL-01" })}
                    </FormField>
                    <FormField
                        label="สถานะ"
                        htmlFor="vd_status"
                        hint={form.vd_status === "inactive" ? VENDOR_MESSAGES.statusInactive : undefined}
                        error={fieldErrors.vd_status}
                    >
                        <select
                            id="vd_status"
                            value={form.vd_status}
                            onChange={(event) => updateField("vd_status", event.target.value as ActiveStatus)}
                            className={inputClass(Boolean(fieldErrors.vd_status))}
                        >
                            <option value="active">ใช้งาน</option>
                            <option value="inactive">ปิดใช้งาน</option>
                        </select>
                    </FormField>
                    <FormField label="ชื่อผู้ติดต่อ" htmlFor="vd_contact_name" error={fieldErrors.vd_contact_name}>
                        {textInput("vd_contact_name")}
                    </FormField>
                    <FormField label="เบอร์โทรศัพท์" htmlFor="vd_phone" error={fieldErrors.vd_phone}>
                        {textInput("vd_phone", { type: "tel", inputMode: "tel" })}
                    </FormField>
                    <FormField label="อีเมล" htmlFor="vd_email" error={fieldErrors.vd_email} className="sm:col-span-2">
                        {textInput("vd_email", { type: "email", inputMode: "email" })}
                    </FormField>
                </div>
            </SectionCard>

            <SectionCard
                icon={ReceiptText}
                title="ภาษีและที่อยู่"
                description={`แบบยื่นหัก ณ ที่จ่าย: ${whtFormLabel(previewWhtForm(form))}`}
            >
                <div className="grid gap-4 sm:grid-cols-2">
                    <FormField label="ประเทศ" htmlFor="vd_country" error={fieldErrors.vd_country}>
                        <select
                            id="vd_country"
                            value={form.vd_country}
                            onChange={(event) => updateField("vd_country", event.target.value)}
                            className={inputClass(Boolean(fieldErrors.vd_country))}
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
                        htmlFor="vd_tax_id"
                        hint={isThai ? VENDOR_MESSAGES.taxIdThai : VENDOR_MESSAGES.taxIdForeign}
                        error={fieldErrors.vd_tax_id}
                    >
                        {textInput("vd_tax_id", { inputMode: isThai ? "numeric" : undefined })}
                    </FormField>
                    {isThai && isJuristic && (
                        <FormField
                            label="สาขาของผู้ขาย"
                            htmlFor="vd_branch_code"
                            hint={VENDOR_MESSAGES.branchCode}
                            error={fieldErrors.vd_branch_code}
                        >
                            <div className="flex gap-2">
                                {textInput("vd_branch_code", { inputMode: "numeric", placeholder: "เช่น 00000" })}
                                <button
                                    type="button"
                                    className={`${buttonClass("secondary", "md")} shrink-0`}
                                    onClick={() => updateField("vd_branch_code", HEAD_OFFICE_CODE)}
                                >
                                    สำนักงานใหญ่
                                </button>
                            </div>
                        </FormField>
                    )}
                    <FormField
                        label="ที่อยู่"
                        htmlFor="vd_address"
                        hint={VENDOR_MESSAGES.address}
                        error={fieldErrors.vd_address}
                        className="sm:col-span-2"
                    >
                        <textarea
                            id="vd_address"
                            rows={3}
                            value={form.vd_address}
                            onChange={(event) => updateField("vd_address", event.target.value)}
                            className={inputClass(Boolean(fieldErrors.vd_address))}
                        />
                    </FormField>
                </div>
            </SectionCard>

            <SectionCard icon={Landmark} title="บัญชีรับเงินของผู้ขาย" description={VENDOR_MESSAGES.bank}>
                {isBankChanged && (
                    <StatusBanner tone="warn" title="กำลังเปลี่ยนบัญชีรับเงิน">
                        โทรยืนยันกับผู้ขายด้วยเบอร์ที่รู้จักอยู่แล้ว (ไม่ใช่เบอร์ในอีเมลที่ขอเปลี่ยน) ก่อนบันทึก
                    </StatusBanner>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                    <FormField label="ธนาคาร" htmlFor="vd_bank_name" error={fieldErrors.vd_bank_name}>
                        {textInput("vd_bank_name", { placeholder: "เช่น กสิกรไทย" })}
                    </FormField>
                    <FormField label="เลขที่บัญชี" htmlFor="vd_bank_account_no" error={fieldErrors.vd_bank_account_no}>
                        {textInput("vd_bank_account_no", { inputMode: "numeric" })}
                    </FormField>
                    <FormField
                        label="ชื่อบัญชี"
                        htmlFor="vd_bank_account_name"
                        error={fieldErrors.vd_bank_account_name}
                    >
                        {textInput("vd_bank_account_name")}
                    </FormField>
                    <FormField
                        label="พร้อมเพย์"
                        htmlFor="vd_promptpay_id"
                        hint={VENDOR_MESSAGES.promptPay}
                        error={fieldErrors.vd_promptpay_id}
                    >
                        {textInput("vd_promptpay_id", { inputMode: "numeric" })}
                    </FormField>
                </div>
            </SectionCard>

            <SectionCard
                icon={Settings2}
                title="ค่าเริ่มต้นตอนบันทึกค่าใช้จ่าย"
                description="เติมให้อัตโนมัติ · เปลี่ยนในแต่ละใบได้"
            >
                <div className="grid gap-4 sm:grid-cols-2">
                    <FormField label="สกุลเงิน" htmlFor="vd_currency" error={fieldErrors.vd_currency}>
                        <select
                            id="vd_currency"
                            value={form.vd_currency}
                            onChange={(event) => updateField("vd_currency", event.target.value)}
                            className={inputClass(Boolean(fieldErrors.vd_currency))}
                        >
                            {currencyChoices.length === 0 && (
                                <option value={form.vd_currency}>{form.vd_currency}</option>
                            )}
                            {currencyChoices.map((currency) => (
                                <option key={currency.cur_code} value={currency.cur_code}>
                                    {currency.cur_code} · {currency.cur_name_th}
                                </option>
                            ))}
                        </select>
                    </FormField>
                    <FormField
                        label="เครดิตเทอม (วัน)"
                        htmlFor="vd_credit_days"
                        hint={VENDOR_MESSAGES.creditDays}
                        error={fieldErrors.vd_credit_days}
                    >
                        {textInput("vd_credit_days", { inputMode: "numeric", placeholder: "เช่น 30" })}
                    </FormField>
                    <FormField
                        label="ประเภทเงินได้ (หัก ณ ที่จ่าย)"
                        htmlFor="vd_default_income_type"
                        hint={VENDOR_MESSAGES.incomeType}
                        error={fieldErrors.vd_default_income_type}
                    >
                        <select
                            id="vd_default_income_type"
                            value={form.vd_default_income_type}
                            onChange={(event) => updateField("vd_default_income_type", event.target.value)}
                            className={inputClass(Boolean(fieldErrors.vd_default_income_type))}
                        >
                            <option value="">ตามหมวดค่าใช้จ่าย</option>
                            {incomeTypeChoices.map((type) => (
                                <option key={type.wit_code} value={type.wit_code}>
                                    {type.wit_name_th}
                                    {type.current_rate ? ` (${Number(type.current_rate.wr_rate)}%)` : ""}
                                </option>
                            ))}
                        </select>
                    </FormField>
                    <FormField
                        label="หมวดค่าใช้จ่าย"
                        htmlFor="vd_default_category_id"
                        hint={VENDOR_MESSAGES.category}
                        error={fieldErrors.vd_default_category_id}
                    >
                        <select
                            id="vd_default_category_id"
                            value={form.vd_default_category_id}
                            onChange={(event) => updateField("vd_default_category_id", event.target.value)}
                            className={inputClass(Boolean(fieldErrors.vd_default_category_id))}
                        >
                            <option value="">ไม่ระบุ</option>
                            {categoryChoices.map((category) => (
                                <option key={category.ec_id} value={String(category.ec_id)}>
                                    {category.ec_name_th}
                                </option>
                            ))}
                        </select>
                    </FormField>
                    <FormField
                        label="หมายเหตุ"
                        htmlFor="vd_notes"
                        error={fieldErrors.vd_notes}
                        className="sm:col-span-2"
                    >
                        <textarea
                            id="vd_notes"
                            rows={2}
                            value={form.vd_notes}
                            onChange={(event) => updateField("vd_notes", event.target.value)}
                            className={inputClass(Boolean(fieldErrors.vd_notes))}
                        />
                    </FormField>
                </div>
            </SectionCard>

            <SaveErrorBanner error={saveError} />
            <div className="flex flex-wrap justify-end gap-3">
                <button
                    type="button"
                    onClick={() => router.push("/purchasing/vendors")}
                    className={buttonClass("secondary", "md")}
                >
                    ยกเลิก
                </button>
                <button type="submit" disabled={isSaving} className={buttonClass("primary", "md")}>
                    {isSaving ? "กำลังบันทึก..." : isEditing ? "บันทึกการแก้ไข" : "เพิ่มผู้ขาย"}
                </button>
            </div>
        </form>
    );
}
