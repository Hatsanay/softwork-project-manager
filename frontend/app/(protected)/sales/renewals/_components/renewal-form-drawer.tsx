"use client";

// เพิ่มรายการต่ออายุเอง (2026-10-31 · U12 ลูกค้าเก่าที่ต่ออายุอยู่ก่อนมีระบบ)
// เลือกลูกค้า → โปรเจกต์ (ไม่บังคับ · เติมช่องทางจากโปรเจกต์) → สินค้ารายรอบ (เติมราคา/รอบ) → ชื่อที่จำง่าย → วันครบถัดไป
import { useEffect, useState } from "react";
import { toast } from "sonner";
import EditorDrawer, { DrawerButtons, DrawerSection, confirmDiscard } from "@/components/ui/editor-drawer";
import FormField, { inputClass } from "@/components/ui/form-field";
import SearchableSelect from "@/components/ui/SearchableSelect";
import SaveErrorBanner from "@/components/ui/save-error-banner";
import { apiFetch, type ApiError } from "@/lib/api";
import { toFieldErrors, type FieldErrors } from "@/lib/form-errors";
import { RENEWAL_CYCLES, cycleLabel, periodOf } from "@/lib/shared/renewal-math.mjs";
import { renewalCreateSchema } from "@/lib/shared/schemas/renewal.mjs";
import { CHANNEL_LABELS, RENEWAL_MESSAGES, periodText } from "../_messages";
import type { RenewalChannel, RenewalFormOptions } from "../_types";

const EMPTY_FORM = {
    rnw_client_id: "",
    rnw_project_id: "",
    rnw_product_id: "",
    rnw_label: "",
    rnw_price: "",
    rnw_cycle_months: 12,
    rnw_next_due_date: "",
    rnw_notes: "",
};

async function loadClientOptions(search: string) {
    const query = new URLSearchParams({ limit: "20", offset: "0", search, status: "active" });
    const { data } = await apiFetch<{ data: { client_id: string; client_name: string }[] }>(`/clients?${query}`);
    return (data?.data ?? []).map((client) => ({ value: client.client_id, label: client.client_name }));
}

export default function RenewalFormDrawer({
    channels,
    onClose,
    onSaved,
}: {
    // ช่องทางที่ผู้ใช้มีสิทธิ์ (จากรายการ)
    channels: RenewalChannel[];
    onClose: () => void;
    onSaved: () => void;
}) {
    const [form, setForm] = useState(EMPTY_FORM);
    const [channel, setChannel] = useState<RenewalChannel>(channels[0] ?? "direct");
    const [options, setOptions] = useState<RenewalFormOptions | null>(null);
    const [errors, setErrors] = useState<FieldErrors>({});
    const [saveError, setSaveError] = useState<ApiError | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const isDirty = JSON.stringify(form) !== JSON.stringify(EMPTY_FORM);

    // สินค้ารายรอบ + โปรเจกต์ของลูกค้าที่เลือก
    useEffect(() => {
        let isLeftPage = false;
        const query = form.rnw_client_id ? `?client_id=${encodeURIComponent(form.rnw_client_id)}` : "";
        apiFetch<RenewalFormOptions>(`/renewals/form-options${query}`).then(({ data }) => {
            if (!isLeftPage) setOptions(data);
        });
        return () => {
            isLeftPage = true;
        };
    }, [form.rnw_client_id]);

    function update<Field extends keyof typeof form>(field: Field, value: (typeof form)[Field]) {
        setForm((current) => ({ ...current, [field]: value }));
    }

    function chooseProduct(productId: string) {
        const product = options?.products.find((item) => item.product_id === productId);
        setForm((current) => ({
            ...current,
            rnw_product_id: productId,
            // เติมราคาและรอบจากสินค้า (แก้ได้ · ลูกค้าแต่ละรายตกลงราคาต่างกันได้)
            rnw_price: product ? product.product_price : current.rnw_price,
            rnw_cycle_months: product ? product.product_renewal_months : current.rnw_cycle_months,
        }));
    }

    function chooseProject(projectId: string) {
        update("rnw_project_id", projectId);
        const project = options?.projects.find((item) => item.project_id === projectId);
        if (project && channels.includes(project.project_channel)) setChannel(project.project_channel);
    }

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        setSaveError(null);
        const body = {
            ...form,
            rnw_project_id: form.rnw_project_id || null,
            rnw_channel: channel,
        };
        const checked = renewalCreateSchema.safeParse(body);
        if (!checked.success) {
            const fieldErrors = toFieldErrors(checked.error.issues);
            setErrors(fieldErrors);
            toast.error(`ข้อมูลไม่ถูกต้อง ${Object.keys(fieldErrors).length} ช่อง กรุณาแก้ตามข้อความสีแดงใต้ช่อง`);
            return;
        }
        setErrors({});
        setIsSaving(true);
        const { error } = await apiFetch("/renewals", { method: "POST", body: checked.data });
        setIsSaving(false);
        if (error) {
            setErrors(error.fields);
            setSaveError(error);
            return;
        }
        toast.success("เพิ่มรายการต่ออายุแล้ว");
        onSaved();
    }

    const preview =
        form.rnw_next_due_date && /^\d{4}-\d{2}-\d{2}$/.test(form.rnw_next_due_date)
            ? periodText(
                  periodOf(form.rnw_next_due_date, form.rnw_cycle_months, Number(form.rnw_next_due_date.slice(8, 10))),
              )
            : null;
    const hasNoRenewalProduct = options !== null && options.products.length === 0;

    return (
        <EditorDrawer
            title="เพิ่มรายการต่ออายุ"
            subtitle="สำหรับลูกค้าที่ต่ออายุอยู่แล้วก่อนมีระบบ · งานใหม่ระบบสร้างให้ตอนลูกค้าตอบรับใบเสนอราคา"
            isDirty={isDirty}
            onClose={onClose}
            onSubmit={submit}
            footer={
                <DrawerButtons
                    summary={preview && <span>รอบถัดไป {preview}</span>}
                    isSaving={isSaving}
                    submitLabel="เพิ่มรายการ"
                    onCancel={() => confirmDiscard(isDirty) && onClose()}
                />
            }
        >
            <DrawerSection number={1} title="ลูกค้าและบริการ">
                <FormField label="ลูกค้า" htmlFor="rnw_client_id" required error={errors.rnw_client_id}>
                    <SearchableSelect
                        loadOptions={loadClientOptions}
                        value={form.rnw_client_id}
                        onChange={(clientId) =>
                            setForm((current) => ({ ...current, rnw_client_id: clientId, rnw_project_id: "" }))
                        }
                        placeholder="พิมพ์ชื่อลูกค้า"
                        error={Boolean(errors.rnw_client_id)}
                    />
                </FormField>
                <FormField
                    label="โปรเจกต์"
                    htmlFor="rnw_project_id"
                    hint="ไม่บังคับ · ผูกแล้วเห็นในหน้าโปรเจกต์ และเติมช่องทางให้"
                    error={errors.rnw_project_id}
                >
                    <select
                        id="rnw_project_id"
                        value={form.rnw_project_id}
                        disabled={!form.rnw_client_id}
                        onChange={(event) => chooseProject(event.target.value)}
                        className={inputClass(Boolean(errors.rnw_project_id))}
                    >
                        <option value="">{form.rnw_client_id ? "ไม่ผูกโปรเจกต์" : "เลือกลูกค้าก่อน"}</option>
                        {(options?.projects ?? []).map((project) => (
                            <option key={project.project_id} value={project.project_id}>
                                {project.project_name}
                            </option>
                        ))}
                    </select>
                </FormField>
                <FormField
                    label="สินค้า/บริการ"
                    htmlFor="rnw_product_id"
                    required
                    hint={
                        hasNoRenewalProduct
                            ? undefined
                            : "แสดงเฉพาะสินค้าที่ตั้ง ต่ออายุทุก ไว้ · เลือกแล้วเติมราคาและรอบให้"
                    }
                    error={errors.rnw_product_id}
                >
                    <select
                        id="rnw_product_id"
                        value={form.rnw_product_id}
                        disabled={options === null || hasNoRenewalProduct}
                        onChange={(event) => chooseProduct(event.target.value)}
                        className={inputClass(Boolean(errors.rnw_product_id))}
                    >
                        <option value="">{options === null ? "กำลังโหลด..." : "เลือกสินค้า"}</option>
                        {(options?.products ?? []).map((product) => (
                            <option key={product.product_id} value={product.product_id}>
                                {product.product_name} ({cycleLabel(product.product_renewal_months)})
                            </option>
                        ))}
                    </select>
                </FormField>
                {hasNoRenewalProduct && (
                    <p className="text-xs text-amber-600">
                        ยังไม่มีสินค้าที่ตั้งเป็นบริการรายรอบ · ไปที่หน้าสินค้า/บริการ แก้สินค้า แล้วเลือก ต่ออายุทุก
                    </p>
                )}
                <FormField
                    label="ชื่อที่จำง่าย"
                    htmlFor="rnw_label"
                    hint={RENEWAL_MESSAGES.label}
                    error={errors.rnw_label}
                >
                    <input
                        id="rnw_label"
                        value={form.rnw_label}
                        maxLength={200}
                        placeholder="เช่น shopabc.com"
                        onChange={(event) => update("rnw_label", event.target.value)}
                        className={inputClass(Boolean(errors.rnw_label))}
                    />
                </FormField>
            </DrawerSection>

            <DrawerSection number={2} title="ราคาและรอบ">
                <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                        label="ราคาต่อรอบ (บาท)"
                        htmlFor="rnw_price"
                        required
                        hint={RENEWAL_MESSAGES.price}
                        error={errors.rnw_price}
                    >
                        <input
                            id="rnw_price"
                            inputMode="decimal"
                            value={form.rnw_price}
                            placeholder="0.00"
                            onChange={(event) => update("rnw_price", event.target.value)}
                            className={`${inputClass(Boolean(errors.rnw_price))} text-right tabular-nums`}
                        />
                    </FormField>
                    <FormField label="ต่ออายุ" htmlFor="rnw_cycle_months" required error={errors.rnw_cycle_months}>
                        <select
                            id="rnw_cycle_months"
                            value={form.rnw_cycle_months}
                            onChange={(event) => update("rnw_cycle_months", Number(event.target.value))}
                            className={inputClass(Boolean(errors.rnw_cycle_months))}
                        >
                            {RENEWAL_CYCLES.map((months) => (
                                <option key={months} value={months}>
                                    {cycleLabel(months)}
                                </option>
                            ))}
                        </select>
                    </FormField>
                    <FormField
                        label="ครบรอบถัดไป"
                        htmlFor="rnw_next_due_date"
                        required
                        hint={RENEWAL_MESSAGES.nextDue}
                        error={errors.rnw_next_due_date}
                    >
                        <input
                            id="rnw_next_due_date"
                            type="date"
                            value={form.rnw_next_due_date}
                            onChange={(event) => update("rnw_next_due_date", event.target.value)}
                            className={inputClass(Boolean(errors.rnw_next_due_date))}
                        />
                    </FormField>
                    <FormField
                        label="ช่องทาง"
                        htmlFor="rnw_channel"
                        hint={RENEWAL_MESSAGES.channel}
                        error={errors.rnw_channel}
                    >
                        <select
                            id="rnw_channel"
                            value={channel}
                            disabled={channels.length === 1}
                            onChange={(event) => setChannel(event.target.value as RenewalChannel)}
                            className={inputClass(false)}
                        >
                            {channels.map((option) => (
                                <option key={option} value={option}>
                                    {CHANNEL_LABELS[option]}
                                </option>
                            ))}
                        </select>
                    </FormField>
                </div>
                <FormField
                    label="บันทึกภายใน"
                    htmlFor="rnw_notes"
                    hint="ไม่แสดงให้ลูกค้า เช่น ผู้ให้บริการ บัญชีที่ใช้จด"
                    error={errors.rnw_notes}
                >
                    <textarea
                        id="rnw_notes"
                        rows={2}
                        maxLength={1000}
                        value={form.rnw_notes}
                        onChange={(event) => update("rnw_notes", event.target.value)}
                        className={inputClass(Boolean(errors.rnw_notes))}
                    />
                </FormField>
            </DrawerSection>
            <SaveErrorBanner error={saveError} />
        </EditorDrawer>
    );
}
