"use client";

// สร้าง/แก้ลิงก์เลือกบริการ (2026-10-25 · S-1)
// สร้าง: ชนิด (เฉพาะลูกค้า / สาธารณะ / Fastwork) → ลูกค้าหรือชื่อ → ผู้รับคำขอ (ค่าเริ่มต้นจากตั้งค่า) → หมดอายุ → หมวดที่เปิด
// แก้: ชนิดและลูกค้าเปลี่ยนไม่ได้ (เปลี่ยน = สร้างลิงก์ใหม่) · ปิดลิงก์ได้ทันที
// รายการที่ทีมเลือกให้ (ล็อก · ลูกค้าแก้ไม่ได้ · ราคาปัจจุบัน) + ให้ลูกค้าเลือกเพิ่มเองได้ไหม (2026-10-25)
// คำถามที่ลิงก์นี้จะถาม: ไม่ถามบางกลุ่ม / ถามกลุ่มเพิ่ม + ดูมุมมองลูกค้า (2026-10-26 Q-3 · link-questions-section.tsx)
import { useEffect, useState } from "react";
import { Lock, Trash2 } from "lucide-react";
import { toast } from "sonner";
import FormField, { inputClass } from "@/components/ui/form-field";
import FieldHint from "@/components/ui/guidance/field-hint";
import StatusBanner from "@/components/ui/guidance/status-banner";
import SearchableSelect, { type SelectOption } from "@/components/ui/SearchableSelect";
import Switch from "@/components/ui/switch";
import { apiFetch } from "@/lib/api";
import { buttonClass } from "@/components/ui/button";
import { formatAmount } from "@/lib/shared/money.mjs";
import { toFieldErrors, type FieldErrors } from "@/lib/form-errors";
import { DEFAULT_LINK_DAYS, MAX_PRESET_ITEMS, MAX_SET_COUNT, orderLinkSchema, orderLinkUpdateSchema } from "@/lib/shared/schemas/order-link.mjs";
import { SheetButtons, SheetFrame } from "../../../fastwork/_components/sheet-frame";
import type { OrderLink, OrderLinkKind, ServiceRequestSettings } from "../_types";
import { LINK_KIND_LABEL } from "../_types";
import LinkQuestionsSection, { type QuestionRules } from "./link-questions-section";

type Category = { pc_id: string; pc_name: string; pc_status: "active" | "inactive" };

/** ค่าที่เติมให้ตอนเปิดแผ่นสร้าง: ชนิด + ลูกค้า (จากหน้าลูกค้า) หรืองาน Fastwork เดิม (จากการ์ดงาน) */
export type LinkPreset = { kind: OrderLinkKind; client: SelectOption | null; project: SelectOption | null };

type PresetRow = { kind: "product" | "package"; id: string; name: string; quantity: string };
type ChoiceRow = { key: string; kind: "product" | "package"; id: string; name: string };

/** ตัวเลือกสินค้า (เปิดใช้งาน) + ชุดบริการ (เปิดใช้งาน) · ค่า = "p:<id>" / "k:<id>" */
async function loadPresetChoices(search: string): Promise<{ options: SelectOption[]; rows: ChoiceRow[] }> {
    const query = new URLSearchParams({ limit: "20", offset: "0", search, status: "active" });
    const [productResult, packageResult] = await Promise.all([
        apiFetch<{ data: { product_id: string; product_name: string; product_price: string; product_price_mode?: string; product_percent?: string | null }[] }>(`/products?${query}`),
        apiFetch<{ data: { pkg_id: string; pkg_name: string; pkg_status: string }[] }>("/product-packages"),
    ]);
    const keyword = search.trim().toLowerCase();
    const packages = (packageResult.data?.data ?? []).filter((row) => row.pkg_status === "active" && row.pkg_name.toLowerCase().includes(keyword)).slice(0, 20);
    const products = productResult.data?.data ?? [];
    const rows: ChoiceRow[] = [
        ...packages.map((row) => ({ key: `k:${row.pkg_id}`, kind: "package" as const, id: row.pkg_id, name: row.pkg_name })),
        ...products.map((row) => ({ key: `p:${row.product_id}`, kind: "product" as const, id: row.product_id, name: row.product_name })),
    ];
    const options: SelectOption[] = [
        ...packages.map((row) => ({ value: `k:${row.pkg_id}`, label: `ชุด: ${row.pkg_name}` })),
        ...products.map((row) => ({
            value: `p:${row.product_id}`,
            label: row.product_price_mode === "percent" ? `${row.product_name} · +${Number(row.product_percent)}%` : `${row.product_name} · ${formatAmount(row.product_price)}`,
        })),
    ];
    return { options, rows };
}

const KIND_HINT: Record<OrderLinkKind, string> = {
    personal: "ส่งให้ลูกค้าตรงรายเดียว (LINE/อีเมล) · ส่งคำขอได้ครั้งเดียว · ข้อมูลติดต่อเติมให้จากลูกค้าที่เลือก · ไม่เลือกลูกค้า = ลูกค้าใหม่กรอกเอง",
    public: "ติดหน้าเว็บ เพจ หรือโปรไฟล์ LINE · ใครเปิดก็ส่งคำขอได้ · เปิดตลอดจนกว่าจะปิดเอง",
    fastwork: "ส่งในแชต Fastwork (ก่อนจ้างก็ได้) · ไม่มีช่องทางจ่ายเงินและไม่ถามข้อมูลติดต่อ · ราคาและการจ่ายเงินยังทำบน Fastwork",
};

async function loadClientOptions(search: string): Promise<SelectOption[]> {
    const query = new URLSearchParams({ limit: "20", offset: "0", search, status: "active" });
    const { data } = await apiFetch<{ data: { client_id: string; client_name: string }[] }>(`/clients?${query}`);
    return (data?.data ?? []).map((client) => ({ value: client.client_id, label: client.client_name }));
}

export default function LinkSheet({
    link,
    preset,
    settings,
    onClose,
    onSaved,
}: {
    link: OrderLink | null;
    preset: LinkPreset;
    settings: ServiceRequestSettings;
    onClose: () => void;
    onSaved: (saved: OrderLink) => Promise<void>;
}) {
    const isEdit = link !== null;
    const defaultClient = preset.client;
    const project = preset.project;
    const [categories, setCategories] = useState<Category[]>([]);
    const [form, setForm] = useState({
        ol_kind: (link?.ol_kind ?? preset.kind) as OrderLinkKind,
        ol_name: link?.ol_name ?? "",
        ol_client_id: link?.ol_client_id ?? defaultClient?.value?.toString() ?? "",
        ol_buyer_name: link?.ol_buyer_name ?? "",
        ol_assignee_id: link?.ol_assignee_id ?? settings.cs_service_request_assignee_id ?? "",
        ol_expires_on: link?.ol_expires_on ?? "",
        ol_status: link?.ol_status ?? "active",
        category_ids: link?.category_ids ?? ([] as string[]),
        ol_allow_more: link?.ol_allow_more ?? true,
    });
    const [presetRows, setPresetRows] = useState<PresetRow[]>(() =>
        (link?.preset_items ?? []).map((item) => ({ kind: item.kind, id: item.id, name: item.name, quantity: String(item.quantity) })),
    );
    const [questionRules, setQuestionRules] = useState<QuestionRules>(link?.question_rules ?? { include_group_ids: [], exclude_group_ids: [] });
    const [presetChoice, setPresetChoice] = useState("");
    const [choiceRows, setChoiceRows] = useState<Map<string, ChoiceRow>>(new Map());
    const [errors, setErrors] = useState<FieldErrors>({});
    const [bannerError, setBannerError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        let isClosed = false;
        apiFetch<{ data: Category[] }>("/product-categories").then(({ data }) => {
            if (!isClosed) setCategories((data?.data ?? []).filter((category) => category.pc_status === "active"));
        });
        return () => {
            isClosed = true;
        };
    }, []);

    function update<Field extends keyof typeof form>(field: Field, value: (typeof form)[Field]) {
        setForm((current) => ({ ...current, [field]: value }));
    }

    async function searchPresetChoices(search: string) {
        const { options, rows } = await loadPresetChoices(search);
        setChoiceRows((current) => new Map([...current, ...rows.map((row) => [row.key, row] as const)]));
        return options.filter((option) => !presetRows.some((row) => `${row.kind === "product" ? "p" : "k"}:${row.id}` === option.value));
    }

    function addPreset(key: string) {
        const choice = choiceRows.get(key);
        setPresetChoice("");
        if (!choice || presetRows.length >= MAX_PRESET_ITEMS) return;
        setPresetRows((current) => [...current, { kind: choice.kind, id: choice.id, name: choice.name, quantity: "1" }]);
    }

    function toggleCategory(categoryId: string, isOn: boolean) {
        update("category_ids", isOn ? [...form.category_ids, categoryId] : form.category_ids.filter((id) => id !== categoryId));
    }

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        setBannerError(null);
        const presetItems = presetRows.map((row) => ({ kind: row.kind, id: row.id, quantity: Number(row.quantity) }));
        const body = isEdit
            ? {
                  ol_name: form.ol_name,
                  ol_assignee_id: form.ol_assignee_id,
                  ol_expires_on: form.ol_expires_on,
                  ol_status: form.ol_status,
                  category_ids: form.category_ids,
                  ol_allow_more: form.ol_allow_more,
                  preset_items: presetItems,
                  question_rules: questionRules,
              }
            : {
                  ...form,
                  ol_client_id: form.ol_client_id || null,
                  ol_project_id: project ? String(project.value) : null,
                  preset_items: presetItems,
                  question_rules: questionRules,
              };
        const checked = (isEdit ? orderLinkUpdateSchema : orderLinkSchema).safeParse(body);
        if (!checked.success) {
            setErrors(toFieldErrors(checked.error.issues));
            return;
        }
        setErrors({});
        setIsSaving(true);
        const { data, error } = await apiFetch<OrderLink>(isEdit ? `/order-links/${link.ol_id}` : "/order-links", {
            method: isEdit ? "PUT" : "POST",
            body: checked.data,
        });
        setIsSaving(false);
        if (error) {
            setErrors(error.fields);
            if (Object.keys(error.fields).length === 0) setBannerError(error.message);
            return;
        }
        toast.success(isEdit ? "บันทึกลิงก์แล้ว" : "สร้างลิงก์แล้ว");
        await onSaved(data);
        onClose();
    }

    const expiryHint =
        form.ol_kind === "public" ? "ว่าง = เปิดตลอดจนปิดเอง" : isEdit ? "ว่าง = ไม่หมดอายุ" : `ว่าง = หมดอายุใน ${DEFAULT_LINK_DAYS} วัน`;

    return (
        <SheetFrame
            titleId="link-title"
            title={isEdit ? "แก้ลิงก์" : "สร้างลิงก์เลือกบริการ"}
            subtitle={
                isEdit
                    ? `${LINK_KIND_LABEL[link.ol_kind]} · ${link.client_name ?? link.project_name ?? link.ol_buyer_name ?? link.ol_name ?? ""}`
                    : project
                      ? `ลิงก์ของงาน Fastwork: ${project.label}`
                      : "ลูกค้าเลือกบริการ เห็นราคา แล้วส่งคำขอถึงผู้รับ"
            }
            onClose={onClose}
            onSubmit={submit}
        >
            {bannerError && (
                <StatusBanner tone="error" title="บันทึกไม่สำเร็จ">
                    {bannerError}
                </StatusBanner>
            )}
            {!isEdit && project && (
                <StatusBanner tone="info" title="ลิงก์ให้ลูกค้าเลือกขอบเขตงานเพิ่ม">
                    คำขอจากลิงก์นี้เข้าการ์ดความต้องการของ {project.label} ทันที · ส่วนที่เพิ่มส่งราคาบน Fastwork แล้วกด &quot;ลูกค้ายืนยันบน Fastwork แล้ว&quot; ในหน้าคำขอ (งวดเพิ่ม)
                </StatusBanner>
            )}
            {!isEdit && !project && (
                <div className="grid gap-1.5">
                    <span className="text-sm text-gray-800">ชนิดลิงก์</span>
                    <div role="group" aria-label="ชนิดลิงก์" className="grid grid-cols-3 gap-1 rounded-xl bg-gray-100 p-1">
                        {(["personal", "public", "fastwork"] as const).map((kind) => (
                            <button
                                key={kind}
                                type="button"
                                aria-pressed={form.ol_kind === kind}
                                onClick={() => update("ol_kind", kind)}
                                className={`min-h-10 rounded-lg px-2 text-sm ${form.ol_kind === kind ? "bg-white font-medium text-blue-600 shadow-sm" : "text-gray-600"}`}
                            >
                                {LINK_KIND_LABEL[kind]}
                            </button>
                        ))}
                    </div>
                    <FieldHint>{KIND_HINT[form.ol_kind]}</FieldHint>
                </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
                {!isEdit && form.ol_kind === "personal" && (
                    <FormField label="ลูกค้า" htmlFor="link_client" hint="ไม่บังคับ · ลูกค้าที่มีงาน Fastwork ใช้ลิงก์ Fastwork แทน" error={errors.ol_client_id} className="sm:col-span-2">
                        <SearchableSelect
                            loadOptions={async (search) => {
                                const found = await loadClientOptions(search);
                                const hasDefault = defaultClient && found.some((option) => String(option.value) === String(defaultClient.value));
                                return defaultClient && !hasDefault && !search ? [defaultClient, ...found] : found;
                            }}
                            value={form.ol_client_id}
                            onChange={(value) => update("ol_client_id", value)}
                            placeholder="ลูกค้าใหม่ (ยังไม่มีในระบบ)"
                            error={Boolean(errors.ol_client_id)}
                        />
                    </FormField>
                )}
                {!isEdit && form.ol_kind === "fastwork" && !project && (
                    <FormField label="ชื่อผู้ซื้อบน Fastwork" htmlFor="link_buyer" required error={errors.ol_buyer_name} className="sm:col-span-2">
                        <input id="link_buyer" value={form.ol_buyer_name} maxLength={100} onChange={(event) => update("ol_buyer_name", event.target.value)} className={inputClass(Boolean(errors.ol_buyer_name))} />
                    </FormField>
                )}
                <FormField
                    label="ชื่อเรียกลิงก์"
                    htmlFor="link_name"
                    required={form.ol_kind === "public"}
                    hint={form.ol_kind === "public" ? "เช่น หน้าเว็บ เพจ Facebook (ไว้ดูว่าคำขอมาจากไหน)" : "ไม่บังคับ"}
                    error={errors.ol_name}
                    className="sm:col-span-2"
                >
                    <input id="link_name" value={form.ol_name} maxLength={150} onChange={(event) => update("ol_name", event.target.value)} className={inputClass(Boolean(errors.ol_name))} />
                </FormField>
                <FormField label="ผู้รับคำขอ" htmlFor="link_assignee" required error={errors.ol_assignee_id}>
                    <select id="link_assignee" value={form.ol_assignee_id} onChange={(event) => update("ol_assignee_id", event.target.value)} className={inputClass(Boolean(errors.ol_assignee_id))}>
                        <option value="">เลือกผู้รับ</option>
                        {settings.users.map((user) => (
                            <option key={user.user_id} value={user.user_id}>
                                {user.full_name}
                            </option>
                        ))}
                    </select>
                </FormField>
                <FormField label="หมดอายุหลังวันที่" htmlFor="link_expires" hint={expiryHint} error={errors.ol_expires_on}>
                    <input id="link_expires" type="date" value={form.ol_expires_on} onChange={(event) => update("ol_expires_on", event.target.value)} className={inputClass(Boolean(errors.ol_expires_on))} />
                </FormField>
            </div>
            <section className="grid gap-2 rounded-xl border border-gray-200 p-3" aria-labelledby="preset-title">
                <h3 id="preset-title" className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
                    <Lock size={15} className="text-blue-600" aria-hidden="true" />
                    รายการที่ทีมงานเลือกให้ (ไม่บังคับ)
                </h3>
                {presetRows.length > 0 && (
                    <ul className="grid gap-2">
                        {presetRows.map((row, index) => (
                            <li key={`${row.kind}:${row.id}`} className="flex items-center gap-2">
                                <span className="min-w-0 flex-1 text-sm wrap-break-word text-gray-900">
                                    {row.kind === "package" ? "ชุด: " : ""}
                                    {row.name}
                                </span>
                                <input
                                    aria-label={`จำนวน ${row.name}`}
                                    inputMode="numeric"
                                    value={row.quantity}
                                    onChange={(event) =>
                                        setPresetRows((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, quantity: event.target.value.replace(/\D/g, "").slice(0, String(MAX_SET_COUNT).length) } : item)))
                                    }
                                    className={`${inputClass(false, "sm")} w-16 text-center`}
                                />
                                <button type="button" aria-label={`เอา ${row.name} ออก`} className={buttonClass("ghost", "sm")} onClick={() => setPresetRows((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                                    <Trash2 size={15} />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
                <SearchableSelect loadOptions={searchPresetChoices} value={presetChoice} onChange={addPreset} placeholder="+ เลือกชุดบริการหรือสินค้าให้ลูกค้า" />
                <FieldHint error={errors.preset_items}>
                    ลูกค้าเห็นบนสุดพร้อมไอคอนกุญแจ เอาออกหรือแก้จำนวนไม่ได้ · ราคาตามราคาปัจจุบัน · เลือกของที่ไม่ได้เปิดหน้าร้านได้
                </FieldHint>
                <Switch
                    id="link_allow_more"
                    label="ให้ลูกค้าเลือกเพิ่มเองได้"
                    description={form.ol_allow_more ? "ลูกค้าเลือกงานเพิ่มจากหมวดด้านล่างได้" : "ลูกค้าเห็นแค่รายการที่ทีมเลือกให้ ตอบคำถามแล้วส่ง"}
                    checked={form.ol_allow_more}
                    onChange={(checked) => update("ol_allow_more", checked)}
                />
            </section>
            {form.ol_allow_more && (
                <fieldset className="grid gap-2">
                    <legend className="mb-1 text-sm text-gray-800">หมวดที่ให้ลูกค้าเลือกเพิ่ม</legend>
                    {categories.length === 0 ? (
                        <p className="text-sm text-gray-500">ยังไม่มีหมวดสินค้า · ลิงก์จะแสดงทุกสินค้าที่เปิดหน้าร้าน</p>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            {categories.map((category) => {
                                const isOn = form.category_ids.includes(category.pc_id);
                                return (
                                    <label key={category.pc_id} className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm ${isOn ? "border-blue-300 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-700"}`}>
                                        <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={isOn} onChange={(event) => toggleCategory(category.pc_id, event.target.checked)} />
                                        {category.pc_name}
                                    </label>
                                );
                            })}
                        </div>
                    )}
                    <FieldHint error={errors.category_ids}>ไม่เลือก = ทุกหมวด · เห็นเฉพาะสินค้าที่ติ๊ก &quot;แสดงบนหน้าร้าน&quot; ในหน้าสินค้า/บริการ</FieldHint>
                </fieldset>
            )}
            <LinkQuestionsSection
                linkKind={form.ol_kind}
                presetItems={presetRows}
                allowMore={form.ol_allow_more}
                rules={questionRules}
                error={errors.question_rules}
                onChange={setQuestionRules}
            />
            {isEdit && (
                <Switch
                    id="link_status"
                    label="เปิดรับคำขอ"
                    description="ปิด = ลูกค้าเปิดลิงก์แล้วเห็นว่าปิดรับ · คำขอที่ส่งแล้วไม่หาย"
                    checked={form.ol_status === "active"}
                    onChange={(checked) => update("ol_status", checked ? "active" : "disabled")}
                />
            )}
            <SheetButtons isSaving={isSaving} submitLabel={isEdit ? "บันทึก" : "สร้างลิงก์"} onClose={onClose} />
        </SheetFrame>
    );
}
