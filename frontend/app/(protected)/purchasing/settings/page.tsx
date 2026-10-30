"use client";

// ตั้งค่าจัดซื้อ (2026-10-16 เฟส 2 ขั้น 2-1) — หมวดค่าใช้จ่าย · ประเภทเงินได้ + อัตราหัก ณ ที่จ่ายตามวันที่มีผล
// ทุกคนดูได้ · แก้ได้เฉพาะสิทธิ์ตั้งค่าบริษัท · อัตราที่มีผลแล้วแก้/ลบไม่ได้ (เพิ่มอัตราใหม่ที่มีผลวันถัดไปแทน — R-P4)
import { useState } from "react";
import { toast } from "sonner";
import { Percent, Plus, Tags, Trash2 } from "lucide-react";
import PageHeader from "@/components/ui/page-header";
import SectionCard from "@/components/ui/section-card";
import StatusBanner from "@/components/ui/guidance/status-banner";
import FieldHint from "@/components/ui/guidance/field-hint";
import FormField, { inputClass } from "@/components/ui/form-field";
import { ActiveStatusPill } from "@/components/ui/status-pill";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { PageSkeleton } from "@/components/ui/skeleton";
import { buttonClass } from "@/components/ui/button";
import { usePermission, BITS } from "@/app/components/permission-provider";
import { formatDateOnly } from "@/app/function";
import { apiFetch } from "@/lib/api";
import { toFieldErrors, type FieldErrors } from "@/lib/form-errors";
import { expenseCategorySchema, whtIncomeTypeSchema, whtRateSchema } from "@/lib/shared/schemas/purchasing.mjs";
import { usePurchasingSetup } from "../_hooks/use-purchasing-setup";
import { SETUP_MESSAGES } from "../_messages";
import type { ActiveStatus, ExpenseCategory, PurchasingSetup, WhtIncomeType } from "../_types";

const percentText = (rate: string) => `${Number(rate)}%`;

export default function PurchasingSettingsPage() {
    const hasBit = usePermission();
    const canEdit = hasBit(BITS.companySettings);
    const { setup, loadError, reload } = usePurchasingSetup();

    if (loadError)
        return (
            <StatusBanner tone="error" title="โหลดตั้งค่าจัดซื้อไม่สำเร็จ">
                {loadError.message}
            </StatusBanner>
        );
    if (!setup) return <PageSkeleton />;

    return (
        <div className="grid w-full grid-cols-1 gap-6">
            <PageHeader eyebrow="จัดซื้อ" title="ตั้งค่าจัดซื้อ" description={SETUP_MESSAGES.description} />
            <StatusBanner tone="warn" title="ตรวจกับนักบัญชีก่อนใช้งานจริง">
                {SETUP_MESSAGES.accountantNote}
                {!canEdit && " · คุณดูได้อย่างเดียว (แก้ได้เฉพาะผู้มีสิทธิ์ตั้งค่าบริษัท)"}
            </StatusBanner>
            <IncomeTypesSection setup={setup} canEdit={canEdit} onChanged={reload} />
            <CategoriesSection setup={setup} canEdit={canEdit} onChanged={reload} />
        </div>
    );
}

// ─── ประเภทเงินได้ + อัตรา ─────────────────────────────────────────────────────────────────────

const EMPTY_TYPE = {
    wit_code: "",
    wit_name_th: "",
    wit_name_en: "",
    wit_form_row: "5",
    wit_form_label: "",
    wit_status: "active" as ActiveStatus,
    wit_sort_order: "0",
};

function IncomeTypesSection({
    setup,
    canEdit,
    onChanged,
}: {
    setup: PurchasingSetup;
    canEdit: boolean;
    onChanged: () => Promise<void>;
}) {
    const [editing, setEditing] = useState<WhtIncomeType | "new" | null>(null);
    const [rateFor, setRateFor] = useState<WhtIncomeType | null>(null);
    const [deleteRate, setDeleteRate] = useState<{ code: string; date: string } | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    async function confirmDeleteRate() {
        if (!deleteRate) return;
        const { error } = await apiFetch(`/purchasing/wht-rates/${deleteRate.code}/${deleteRate.date}`, {
            method: "DELETE",
        });
        if (error) {
            setDeleteError(error.message);
            return;
        }
        toast.success("ลบอัตราที่ยังไม่มีผลแล้ว");
        setDeleteRate(null);
        setDeleteError(null);
        await onChanged();
    }

    return (
        <SectionCard
            icon={Percent}
            title="ประเภทเงินได้ และอัตราหัก ณ ที่จ่าย"
            description={SETUP_MESSAGES.formRow}
            actions={
                canEdit && (
                    <button type="button" className={buttonClass("secondary", "md")} onClick={() => setEditing("new")}>
                        <Plus size={16} />
                        เพิ่มประเภท
                    </button>
                )
            }
        >
            {editing && (
                <IncomeTypeForm
                    incomeType={editing === "new" ? null : editing}
                    onDone={async (saved) => {
                        setEditing(null);
                        if (saved) await onChanged();
                    }}
                />
            )}
            <ul className="grid gap-3">
                {setup.income_types.map((type) => (
                    <li key={type.wit_code} className="grid gap-2 rounded-xl border border-gray-200 p-4 text-sm">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="grid min-w-0 gap-0.5">
                                <span className="font-medium text-gray-900">{type.wit_name_th}</span>
                                <span className="text-xs text-gray-500">
                                    {type.wit_code} · แถว {type.wit_form_row} บน 50 ทวิ: &quot;{type.wit_form_label}
                                    &quot;
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <ActiveStatusPill isActive={type.wit_status === "active"} />
                                <span className="text-base font-medium text-gray-900 tabular-nums">
                                    {type.current_rate ? percentText(type.current_rate.wr_rate) : "ยังไม่มีอัตรา"}
                                </span>
                            </div>
                        </div>
                        {type.current_rate && (
                            <p className="text-xs text-gray-500">
                                ใช้ตั้งแต่ {formatDateOnly(type.current_rate.wr_effective_from)} · จ่ายต่ำกว่า{" "}
                                {Number(type.current_rate.wr_min_payment).toLocaleString("th-TH")} บาทต่อครั้งไม่หัก
                            </p>
                        )}
                        {type.rates.some((rate) => !rate.is_locked) && (
                            <ul className="grid gap-1 rounded-lg bg-blue-50 p-2 text-xs text-gray-700">
                                {type.rates
                                    .filter((rate) => !rate.is_locked)
                                    .map((rate) => (
                                        <li
                                            key={rate.wr_effective_from}
                                            className="flex flex-wrap items-center justify-between gap-2"
                                        >
                                            <span>
                                                อัตราใหม่ {percentText(rate.wr_rate)} มีผล{" "}
                                                {formatDateOnly(rate.wr_effective_from)}
                                                {rate.wr_note ? ` · ${rate.wr_note}` : ""}
                                            </span>
                                            {canEdit && (
                                                <button
                                                    type="button"
                                                    className="-my-2 flex items-center gap-1 py-2 text-red-600 hover:underline"
                                                    onClick={() =>
                                                        setDeleteRate({
                                                            code: type.wit_code,
                                                            date: rate.wr_effective_from,
                                                        })
                                                    }
                                                >
                                                    <Trash2 size={14} />
                                                    ลบ
                                                </button>
                                            )}
                                        </li>
                                    ))}
                            </ul>
                        )}
                        {canEdit && (
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    className={buttonClass("secondary", "sm")}
                                    onClick={() => setEditing(type)}
                                >
                                    แก้ไข
                                </button>
                                <button
                                    type="button"
                                    className={buttonClass("secondary", "sm")}
                                    onClick={() => setRateFor(type)}
                                >
                                    ตั้งอัตราใหม่
                                </button>
                            </div>
                        )}
                        {rateFor?.wit_code === type.wit_code && (
                            <RateForm
                                incomeType={type}
                                today={setup.today}
                                onDone={async (saved) => {
                                    setRateFor(null);
                                    if (saved) await onChanged();
                                }}
                            />
                        )}
                    </li>
                ))}
            </ul>
            <ConfirmDialog
                open={Boolean(deleteRate)}
                title="ลบอัตราที่ยังไม่มีผล?"
                description="อัตรานี้ยังไม่ถูกใช้กับเอกสารใด · ลบแล้วระบบใช้อัตราปัจจุบันต่อไป"
                confirmLabel="ลบ"
                errorMessage={deleteError}
                onConfirm={confirmDeleteRate}
                onCancel={() => {
                    setDeleteRate(null);
                    setDeleteError(null);
                }}
            />
        </SectionCard>
    );
}

function IncomeTypeForm({
    incomeType,
    onDone,
}: {
    incomeType: WhtIncomeType | null;
    onDone: (saved: boolean) => Promise<void>;
}) {
    const [form, setForm] = useState(() =>
        incomeType
            ? {
                  wit_code: incomeType.wit_code,
                  wit_name_th: incomeType.wit_name_th,
                  wit_name_en: incomeType.wit_name_en ?? "",
                  wit_form_row: String(incomeType.wit_form_row),
                  wit_form_label: incomeType.wit_form_label,
                  wit_status: incomeType.wit_status,
                  wit_sort_order: String(incomeType.wit_sort_order),
              }
            : EMPTY_TYPE,
    );
    const [errors, setErrors] = useState<FieldErrors>({});
    const [isSaving, setIsSaving] = useState(false);
    const update = (field: keyof typeof form, value: string) => setForm((current) => ({ ...current, [field]: value }));

    async function save(event: React.FormEvent) {
        event.preventDefault();
        const checked = whtIncomeTypeSchema.safeParse({
            ...form,
            wit_form_row: Number(form.wit_form_row),
            wit_sort_order: Number(form.wit_sort_order || 0),
        });
        if (!checked.success) {
            setErrors(toFieldErrors(checked.error.issues));
            return;
        }
        setIsSaving(true);
        const { error } = incomeType
            ? await apiFetch(`/purchasing/income-types/${incomeType.wit_code}`, { method: "PUT", body: checked.data })
            : await apiFetch("/purchasing/income-types", { method: "POST", body: checked.data });
        setIsSaving(false);
        if (error) {
            setErrors(error.fields);
            toast.error(error.message);
            return;
        }
        toast.success("บันทึกประเภทเงินได้แล้ว");
        await onDone(true);
    }

    return (
        <form onSubmit={save} noValidate className="grid gap-3 rounded-xl bg-gray-50 p-4 sm:grid-cols-2">
            <FormField
                label="รหัส"
                htmlFor="wit_code"
                required
                hint="ตั้งครั้งเดียว แก้ภายหลังไม่ได้"
                error={errors.wit_code}
            >
                <input
                    id="wit_code"
                    value={form.wit_code}
                    disabled={Boolean(incomeType)}
                    onChange={(event) => update("wit_code", event.target.value.toUpperCase())}
                    className={inputClass(Boolean(errors.wit_code))}
                />
            </FormField>
            <FormField label="ชื่อ" htmlFor="wit_name_th" required error={errors.wit_name_th}>
                <input
                    id="wit_name_th"
                    value={form.wit_name_th}
                    onChange={(event) => update("wit_name_th", event.target.value)}
                    className={inputClass(Boolean(errors.wit_name_th))}
                />
            </FormField>
            <FormField label="แถวบน 50 ทวิ (1–6)" htmlFor="wit_form_row" required error={errors.wit_form_row}>
                <select
                    id="wit_form_row"
                    value={form.wit_form_row}
                    onChange={(event) => update("wit_form_row", event.target.value)}
                    className={inputClass(Boolean(errors.wit_form_row))}
                >
                    {[1, 2, 3, 4, 5, 6].map((row) => (
                        <option key={row} value={String(row)}>
                            แถว {row}
                        </option>
                    ))}
                </select>
            </FormField>
            <FormField label="ข้อความบน 50 ทวิ" htmlFor="wit_form_label" required error={errors.wit_form_label}>
                <input
                    id="wit_form_label"
                    value={form.wit_form_label}
                    onChange={(event) => update("wit_form_label", event.target.value)}
                    className={inputClass(Boolean(errors.wit_form_label))}
                />
            </FormField>
            <FormField label="สถานะ" htmlFor="wit_status" error={errors.wit_status}>
                <select
                    id="wit_status"
                    value={form.wit_status}
                    onChange={(event) => update("wit_status", event.target.value)}
                    className={inputClass(false)}
                >
                    <option value="active">ใช้งาน</option>
                    <option value="inactive">ปิดใช้งาน</option>
                </select>
            </FormField>
            <div className="flex items-end justify-end gap-2">
                <button type="button" className={buttonClass("secondary", "md")} onClick={() => onDone(false)}>
                    ยกเลิก
                </button>
                <button type="submit" className={buttonClass("primary", "md")} disabled={isSaving}>
                    บันทึก
                </button>
            </div>
        </form>
    );
}

function RateForm({
    incomeType,
    today,
    onDone,
}: {
    incomeType: WhtIncomeType;
    today: string;
    onDone: (saved: boolean) => Promise<void>;
}) {
    const [form, setForm] = useState({
        wr_effective_from: "",
        wr_rate: "",
        wr_min_payment: incomeType.current_rate?.wr_min_payment ?? "1000",
        wr_note: "",
    });
    const [errors, setErrors] = useState<FieldErrors>({});
    const [isSaving, setIsSaving] = useState(false);
    const update = (field: keyof typeof form, value: string) => setForm((current) => ({ ...current, [field]: value }));
    const [year, month, day] = today.split("-").map(Number);
    const tomorrow = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);

    async function save(event: React.FormEvent) {
        event.preventDefault();
        const checked = whtRateSchema.safeParse({ ...form, wr_income_type: incomeType.wit_code });
        if (!checked.success) {
            setErrors(toFieldErrors(checked.error.issues));
            return;
        }
        setIsSaving(true);
        const { error } = await apiFetch("/purchasing/wht-rates", { method: "POST", body: checked.data });
        setIsSaving(false);
        if (error) {
            setErrors(error.fields);
            toast.error(error.message);
            return;
        }
        toast.success("ตั้งอัตราใหม่แล้ว");
        await onDone(true);
    }

    return (
        <form onSubmit={save} noValidate className="grid gap-3 rounded-xl bg-gray-50 p-4 sm:grid-cols-2">
            <FormField
                label="มีผลตั้งแต่"
                htmlFor={`rate-date-${incomeType.wit_code}`}
                required
                hint={SETUP_MESSAGES.newRate}
                error={errors.wr_effective_from}
            >
                <input
                    id={`rate-date-${incomeType.wit_code}`}
                    type="date"
                    min={tomorrow}
                    value={form.wr_effective_from}
                    onChange={(event) => update("wr_effective_from", event.target.value)}
                    className={inputClass(Boolean(errors.wr_effective_from))}
                />
            </FormField>
            <FormField label="อัตรา (%)" htmlFor={`rate-value-${incomeType.wit_code}`} required error={errors.wr_rate}>
                <input
                    id={`rate-value-${incomeType.wit_code}`}
                    inputMode="decimal"
                    value={form.wr_rate}
                    onChange={(event) => update("wr_rate", event.target.value)}
                    className={inputClass(Boolean(errors.wr_rate))}
                />
            </FormField>
            <FormField
                label="ยอดขั้นต่ำต่อครั้ง (บาท)"
                htmlFor={`rate-min-${incomeType.wit_code}`}
                hint={SETUP_MESSAGES.minPayment}
                error={errors.wr_min_payment}
            >
                <input
                    id={`rate-min-${incomeType.wit_code}`}
                    inputMode="decimal"
                    value={form.wr_min_payment}
                    onChange={(event) => update("wr_min_payment", event.target.value)}
                    className={inputClass(Boolean(errors.wr_min_payment))}
                />
            </FormField>
            <FormField label="ที่มา/หมายเหตุ" htmlFor={`rate-note-${incomeType.wit_code}`} error={errors.wr_note}>
                <input
                    id={`rate-note-${incomeType.wit_code}`}
                    value={form.wr_note}
                    onChange={(event) => update("wr_note", event.target.value)}
                    className={inputClass(Boolean(errors.wr_note))}
                />
            </FormField>
            <div className="flex justify-end gap-2 sm:col-span-2">
                <button type="button" className={buttonClass("secondary", "md")} onClick={() => onDone(false)}>
                    ยกเลิก
                </button>
                <button type="submit" className={buttonClass("primary", "md")} disabled={isSaving}>
                    ตั้งอัตรา
                </button>
            </div>
        </form>
    );
}

// ─── หมวดค่าใช้จ่าย ───────────────────────────────────────────────────────────────────────────

function CategoriesSection({
    setup,
    canEdit,
    onChanged,
}: {
    setup: PurchasingSetup;
    canEdit: boolean;
    onChanged: () => Promise<void>;
}) {
    const [editing, setEditing] = useState<ExpenseCategory | "new" | null>(null);
    return (
        <SectionCard
            icon={Tags}
            title="หมวดค่าใช้จ่าย"
            description="ใช้จัดกลุ่มค่าใช้จ่ายทุกบรรทัด · ปิดใช้งานแทนการลบ (เอกสารเดิมยังอ้างหมวดนี้อยู่)"
            actions={
                canEdit && (
                    <button type="button" className={buttonClass("secondary", "md")} onClick={() => setEditing("new")}>
                        <Plus size={16} />
                        เพิ่มหมวด
                    </button>
                )
            }
        >
            {editing && (
                <CategoryForm
                    category={editing === "new" ? null : editing}
                    incomeTypes={setup.income_types}
                    onDone={async (saved) => {
                        setEditing(null);
                        if (saved) await onChanged();
                    }}
                />
            )}
            <ul className="grid gap-2 text-sm">
                {setup.categories.map((category) => (
                    <li
                        key={category.ec_id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 p-3"
                    >
                        <div className="grid min-w-0 gap-0.5">
                            <span className="font-medium text-gray-900">
                                {category.ec_name_th}
                                {category.ec_is_asset ? " · ทรัพย์สิน" : ""}
                            </span>
                            <span className="text-xs text-gray-500">
                                {category.ec_account_code ? `บัญชี ${category.ec_account_code} · ` : ""}
                                {category.income_type_name
                                    ? `หัก ณ ที่จ่าย: ${category.income_type_name}`
                                    : "ไม่หัก ณ ที่จ่าย"}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <ActiveStatusPill isActive={category.ec_status === "active"} />
                            {canEdit && (
                                <button
                                    type="button"
                                    className={buttonClass("secondary", "sm")}
                                    onClick={() => setEditing(category)}
                                >
                                    แก้ไข
                                </button>
                            )}
                        </div>
                    </li>
                ))}
            </ul>
        </SectionCard>
    );
}

function CategoryForm({
    category,
    incomeTypes,
    onDone,
}: {
    category: ExpenseCategory | null;
    incomeTypes: WhtIncomeType[];
    onDone: (saved: boolean) => Promise<void>;
}) {
    const [form, setForm] = useState({
        ec_name_th: category?.ec_name_th ?? "",
        ec_name_en: category?.ec_name_en ?? "",
        ec_account_code: category?.ec_account_code ?? "",
        ec_default_income_type: category?.ec_default_income_type ?? "",
        ec_is_asset: category?.ec_is_asset ?? false,
        ec_status: category?.ec_status ?? ("active" as ActiveStatus),
        ec_sort_order: String(category?.ec_sort_order ?? 0),
    });
    const [errors, setErrors] = useState<FieldErrors>({});
    const [isSaving, setIsSaving] = useState(false);
    const update = (field: keyof typeof form, value: string | boolean) =>
        setForm((current) => ({ ...current, [field]: value }));

    async function save(event: React.FormEvent) {
        event.preventDefault();
        const checked = expenseCategorySchema.safeParse({ ...form, ec_sort_order: Number(form.ec_sort_order || 0) });
        if (!checked.success) {
            setErrors(toFieldErrors(checked.error.issues));
            return;
        }
        setIsSaving(true);
        const { error } = category
            ? await apiFetch(`/purchasing/categories/${category.ec_id}`, { method: "PUT", body: checked.data })
            : await apiFetch("/purchasing/categories", { method: "POST", body: checked.data });
        setIsSaving(false);
        if (error) {
            setErrors(error.fields);
            toast.error(error.message);
            return;
        }
        toast.success("บันทึกหมวดแล้ว");
        await onDone(true);
    }

    return (
        <form onSubmit={save} noValidate className="grid gap-3 rounded-xl bg-gray-50 p-4 sm:grid-cols-2">
            <FormField label="ชื่อหมวด" htmlFor="ec_name_th" required error={errors.ec_name_th}>
                <input
                    id="ec_name_th"
                    value={form.ec_name_th}
                    onChange={(event) => update("ec_name_th", event.target.value)}
                    className={inputClass(Boolean(errors.ec_name_th))}
                />
            </FormField>
            <FormField
                label="รหัสบัญชี"
                htmlFor="ec_account_code"
                hint={SETUP_MESSAGES.accountCode}
                error={errors.ec_account_code}
            >
                <input
                    id="ec_account_code"
                    value={form.ec_account_code}
                    onChange={(event) => update("ec_account_code", event.target.value)}
                    className={inputClass(Boolean(errors.ec_account_code))}
                />
            </FormField>
            <FormField
                label="หัก ณ ที่จ่ายเริ่มต้น"
                htmlFor="ec_default_income_type"
                hint={SETUP_MESSAGES.categoryIncomeType}
                error={errors.ec_default_income_type}
            >
                <select
                    id="ec_default_income_type"
                    value={form.ec_default_income_type}
                    onChange={(event) => update("ec_default_income_type", event.target.value)}
                    className={inputClass(Boolean(errors.ec_default_income_type))}
                >
                    <option value="">ไม่หัก</option>
                    {incomeTypes
                        .filter(
                            (type) =>
                                type.wit_status === "active" || type.wit_code === category?.ec_default_income_type,
                        )
                        .map((type) => (
                            <option key={type.wit_code} value={type.wit_code}>
                                {type.wit_name_th}
                            </option>
                        ))}
                </select>
            </FormField>
            <FormField label="สถานะ" htmlFor="ec_status">
                <select
                    id="ec_status"
                    value={form.ec_status}
                    onChange={(event) => update("ec_status", event.target.value)}
                    className={inputClass(false)}
                >
                    <option value="active">ใช้งาน</option>
                    <option value="inactive">ปิดใช้งาน</option>
                </select>
            </FormField>
            <label className="flex items-start gap-2 text-sm sm:col-span-2">
                <input
                    type="checkbox"
                    className="mt-1 h-4 w-4"
                    checked={form.ec_is_asset}
                    onChange={(event) => update("ec_is_asset", event.target.checked)}
                />
                <span className="grid gap-0.5">
                    <span>เป็นทรัพย์สิน</span>
                    <FieldHint>{SETUP_MESSAGES.isAsset}</FieldHint>
                </span>
            </label>
            <div className="flex justify-end gap-2 sm:col-span-2">
                <button type="button" className={buttonClass("secondary", "md")} onClick={() => onDone(false)}>
                    ยกเลิก
                </button>
                <button type="submit" className={buttonClass("primary", "md")} disabled={isSaving}>
                    บันทึก
                </button>
            </div>
        </form>
    );
}
