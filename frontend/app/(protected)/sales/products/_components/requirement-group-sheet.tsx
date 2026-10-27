"use client";

// แผ่นเพิ่ม/แก้กลุ่มคำถามลูกค้า (2026-10-26 Q-1 · docs/plans/2026-10-26-customer-questions.md ข้อ 4.2)
// ถามเมื่อไหร่ 3 แบบ: ทุกคำขอ / เมื่อลูกค้าเลือกหมวด-ชุด-สินค้าที่ผูก / ไม่ถามเอง (เฉพาะลิงก์ที่เลือกถามเพิ่ม) + ชนิดลิงก์ที่ถาม
// ใต้ฟอร์มมีประโยคสรุปว่าลูกค้าคนไหนเห็นกลุ่มนี้ อัปเดตทันทีที่เลือก
import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import FormField, { inputClass } from "@/components/ui/form-field";
import FieldHint from "@/components/ui/guidance/field-hint";
import StatusBanner from "@/components/ui/guidance/status-banner";
import { buttonClass } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { toFieldErrors, type FieldErrors } from "@/lib/form-errors";
import {
    AUDIENCE_LABEL,
    GROUP_AUDIENCES,
    GROUP_TRIGGERS,
    GROUP_TRIGGER_LABEL,
} from "@/lib/shared/requirement-answers.mjs";
import { requirementGroupSchema } from "@/lib/shared/schemas/requirement.mjs";
import type { RequirementGroup } from "@/app/order/_types";
import { SheetButtons, SheetFrame } from "../../../fastwork/_components/sheet-frame";
import type { ProductCategory } from "../_types";
import { groupAudienceText, type LinkableItems } from "./requirement-labels";

type Trigger = RequirementGroup["rqg_trigger"];
type Audience = RequirementGroup["rqg_audience"];

const TRIGGER_HINT: Record<Trigger, string> = {
    always: "ทุกคนที่ส่งคำขอเห็นกลุ่มนี้ เช่น ธุรกิจทำอะไร",
    selection: "เห็นเมื่อลูกค้าเลือก (หรือทีมงานเลือกให้) หมวด ชุด หรือสินค้าที่ผูกไว้อย่างน้อย 1 อย่าง",
    link_only: "ลูกค้าไม่เห็นเอง ใช้กับลิงก์ที่ทีมงานเลือกถามกลุ่มนี้เพิ่ม เช่น งานสั่งทำเฉพาะลูกค้า",
};

export default function RequirementGroupSheet({
    group,
    initialItem,
    categories,
    items,
    onClose,
    onSaved,
    onDelete,
}: {
    group: RequirementGroup | null;
    // กลุ่มใหม่ที่เปิดจากแผ่นแก้สินค้า/ชุด: ผูกรายการนั้นไว้ให้แล้ว
    initialItem?: { kind: "product" | "package"; id: string };
    categories: ProductCategory[];
    items: LinkableItems;
    onClose: () => void;
    onSaved: () => Promise<void>;
    onDelete: (group: RequirementGroup) => void;
}) {
    const [form, setForm] = useState({
        rqg_name: group?.rqg_name ?? "",
        rqg_customer_intro: group?.rqg_customer_intro ?? "",
        rqg_description: group?.rqg_description ?? "",
        rqg_trigger: group?.rqg_trigger ?? ("selection" as Trigger),
        rqg_audience: group?.rqg_audience ?? ("all" as Audience),
        rqg_sort_order: group?.rqg_sort_order ?? 0,
        rqg_status: group?.rqg_status ?? ("active" as const),
        category_ids: group?.category_ids ?? ([] as string[]),
        package_ids: group?.package_ids ?? (initialItem?.kind === "package" ? [initialItem.id] : ([] as string[])),
        product_ids: group?.product_ids ?? (initialItem?.kind === "product" ? [initialItem.id] : ([] as string[])),
    });
    const [productSearch, setProductSearch] = useState("");
    const [errors, setErrors] = useState<FieldErrors>({});
    const [isSaving, setIsSaving] = useState(false);

    function toggle(field: "category_ids" | "package_ids" | "product_ids", id: string, isOn: boolean) {
        setForm((current) => ({
            ...current,
            [field]: isOn ? [...current[field], id] : current[field].filter((value) => value !== id),
        }));
    }

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        const checked = requirementGroupSchema.safeParse(form);
        if (!checked.success) {
            setErrors(toFieldErrors(checked.error.issues));
            return;
        }
        setIsSaving(true);
        const { error } = await apiFetch(group ? `/requirement-groups/${group.rqg_id}` : "/requirement-groups", {
            method: group ? "PUT" : "POST",
            body: checked.data,
        });
        setIsSaving(false);
        if (error) {
            setErrors({ ...error.fields, _form: Object.keys(error.fields).length === 0 ? error.message : "" });
            return;
        }
        toast.success("บันทึกกลุ่มแล้ว");
        await onSaved();
        onClose();
    }

    const keyword = productSearch.trim().toLowerCase();
    const shownProducts = items.products.filter(
        (product) =>
            form.product_ids.includes(product.product_id) ||
            keyword === "" ||
            product.product_name.toLowerCase().includes(keyword),
    );
    const shownPackages = items.packages.filter(
        (row) => row.pkg_status === "active" || form.package_ids.includes(row.pkg_id),
    );
    const summary = groupAudienceText({ ...form, product_ids: form.product_ids }, categories, items);

    return (
        <SheetFrame
            titleId="group-title"
            title={group ? "แก้กลุ่มคำถาม" : "เพิ่มกลุ่มคำถาม"}
            subtitle="ตั้งว่าลูกค้าคนไหนเห็นกลุ่มนี้"
            onClose={onClose}
            onSubmit={submit}
        >
            {errors._form && (
                <StatusBanner tone="error" title="บันทึกไม่สำเร็จ">
                    {errors._form}
                </StatusBanner>
            )}
            <FormField label="ชื่อกลุ่ม (ลูกค้าเห็น)" htmlFor="group_name" required error={errors.rqg_name}>
                <input
                    id="group_name"
                    value={form.rqg_name}
                    maxLength={100}
                    onChange={(event) => setForm({ ...form, rqg_name: event.target.value })}
                    className={inputClass(Boolean(errors.rqg_name))}
                />
            </FormField>
            <FormField
                label="คำอธิบายสำหรับลูกค้า"
                htmlFor="group_intro"
                hint="ไม่บังคับ · ขึ้นใต้ชื่อกลุ่ม บอกว่าทำไมถาม"
                error={errors.rqg_customer_intro}
            >
                <input
                    id="group_intro"
                    value={form.rqg_customer_intro}
                    maxLength={300}
                    placeholder="เช่น ใช้ออกแบบหน้าเว็บให้ตรงกับร้าน"
                    onChange={(event) => setForm({ ...form, rqg_customer_intro: event.target.value })}
                    className={inputClass(Boolean(errors.rqg_customer_intro))}
                />
            </FormField>

            <fieldset className="grid gap-2">
                <legend className="mb-1 text-sm text-gray-800">ถามเมื่อไหร่</legend>
                {(GROUP_TRIGGERS as Trigger[]).map((trigger) => (
                    <label
                        key={trigger}
                        className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm ${form.rqg_trigger === trigger ? "border-blue-300 bg-blue-50" : "border-gray-200"}`}
                    >
                        <input
                            type="radio"
                            name="group_trigger"
                            className="mt-1 h-4 w-4 accent-blue-600"
                            checked={form.rqg_trigger === trigger}
                            onChange={() => setForm({ ...form, rqg_trigger: trigger })}
                        />
                        <span className="grid gap-0.5">
                            <span className="text-gray-900">{GROUP_TRIGGER_LABEL[trigger]}</span>
                            <span className="text-xs text-gray-500">{TRIGGER_HINT[trigger]}</span>
                        </span>
                    </label>
                ))}
            </fieldset>

            {form.rqg_trigger === "selection" && (
                <div className="grid gap-4 rounded-xl border border-gray-100 bg-gray-50 p-3">
                    <ChipPicker
                        legend="หมวด"
                        items={categories.map((category) => ({ id: category.pc_id, name: category.pc_name }))}
                        selected={form.category_ids}
                        onToggle={(id, isOn) => toggle("category_ids", id, isOn)}
                        hint={categories.length === 0 ? "ยังไม่มีหมวด เพิ่มได้ที่แท็บหมวดหมู่" : undefined}
                    />
                    <ChipPicker
                        legend="ชุดบริการ"
                        items={shownPackages.map((row) => ({ id: row.pkg_id, name: row.pkg_name }))}
                        selected={form.package_ids}
                        onToggle={(id, isOn) => toggle("package_ids", id, isOn)}
                        hint='เช่น กลุ่ม "ระบบที่ต้องการ" ถามเฉพาะคนที่เลือกแพ็กเว็บ + ระบบ'
                    />
                    <div className="grid gap-2">
                        <input
                            aria-label="ค้นหาสินค้า"
                            placeholder="ค้นหาสินค้า (งานเพิ่ม)"
                            value={productSearch}
                            onChange={(event) => setProductSearch(event.target.value)}
                            className={inputClass(false)}
                        />
                        <ChipPicker
                            legend="สินค้า (งานเพิ่มรายตัว)"
                            items={shownProducts.map((product) => ({
                                id: product.product_id,
                                name: product.product_name,
                            }))}
                            selected={form.product_ids}
                            onToggle={(id, isOn) => toggle("product_ids", id, isOn)}
                            hint="เช่น เว็บ 2 ภาษา → ถามว่าใครแปล"
                        />
                    </div>
                    <FieldHint error={errors.category_ids ?? errors.package_ids ?? errors.product_ids}>
                        เลือกได้หลายรายการ · เข้าเงื่อนไขข้อใดข้อหนึ่ง = ถามกลุ่มนี้
                    </FieldHint>
                </div>
            )}

            <FormField
                label="ถามในลิงก์แบบไหน"
                htmlFor="group_audience"
                hint="ลิงก์ Fastwork ห้ามถามช่องทางติดต่อนอกแพลตฟอร์ม (LINE โทร อีเมล)"
                error={errors.rqg_audience}
            >
                <select
                    id="group_audience"
                    value={form.rqg_audience}
                    onChange={(event) => setForm({ ...form, rqg_audience: event.target.value as Audience })}
                    className={inputClass(false)}
                >
                    {(GROUP_AUDIENCES as Audience[]).map((audience) => (
                        <option key={audience} value={audience}>
                            {AUDIENCE_LABEL[audience]}
                        </option>
                    ))}
                </select>
            </FormField>

            <p className="rounded-xl bg-blue-50 px-3 py-2 text-sm text-blue-700">ลูกค้าจะเห็นกลุ่มนี้: {summary}</p>

            <FormField
                label="โน้ตภายใน"
                htmlFor="group_description"
                hint="ไม่บังคับ · ลูกค้าไม่เห็น"
                error={errors.rqg_description}
            >
                <input
                    id="group_description"
                    value={form.rqg_description}
                    maxLength={500}
                    onChange={(event) => setForm({ ...form, rqg_description: event.target.value })}
                    className={inputClass(false)}
                />
            </FormField>
            {/* ลำดับกลุ่มเรียงด้วยปุ่มขึ้น/ลงบนการ์ด (Q-2) · ฟอร์มส่งลำดับเดิมกลับไปเฉยๆ กลุ่มใหม่ต่อท้ายเอง */}
            <FormField
                label="สถานะ"
                htmlFor="group_status"
                hint={group ? undefined : "กลุ่มใหม่ต่อท้ายรายการ · เรียงด้วยปุ่มลูกศรบนการ์ด"}
                error={errors.rqg_status}
            >
                <select
                    id="group_status"
                    value={form.rqg_status}
                    onChange={(event) => setForm({ ...form, rqg_status: event.target.value as "active" | "inactive" })}
                    className={inputClass(false)}
                >
                    <option value="active">ใช้งาน</option>
                    <option value="inactive">ปิดใช้งาน (ลูกค้าไม่เห็น)</option>
                </select>
            </FormField>
            <div className="flex flex-wrap items-center justify-between gap-2">
                {group ? (
                    <button type="button" className={buttonClass("ghost", "md")} onClick={() => onDelete(group)}>
                        <Trash2 size={16} />
                        ลบกลุ่ม
                    </button>
                ) : (
                    <span />
                )}
                <SheetButtons isSaving={isSaving} submitLabel="บันทึกกลุ่ม" onClose={onClose} />
            </div>
        </SheetFrame>
    );
}

function ChipPicker({
    legend,
    items,
    selected,
    onToggle,
    hint,
}: {
    legend: string;
    items: { id: string; name: string }[];
    selected: string[];
    onToggle: (id: string, isOn: boolean) => void;
    hint?: string;
}) {
    return (
        <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm text-gray-800">{legend}</legend>
            {items.length === 0 ? (
                <p className="text-sm text-gray-500">ไม่มีรายการ</p>
            ) : (
                <div className="flex flex-wrap gap-2">
                    {items.map((item) => {
                        const isOn = selected.includes(item.id);
                        return (
                            <label
                                key={item.id}
                                className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm ${isOn ? "border-blue-300 bg-white text-blue-700" : "border-gray-200 bg-white text-gray-700"}`}
                            >
                                <input
                                    type="checkbox"
                                    className="h-4 w-4 accent-blue-600"
                                    checked={isOn}
                                    onChange={(event) => onToggle(item.id, event.target.checked)}
                                />
                                {item.name}
                            </label>
                        );
                    })}
                </div>
            )}
            {hint && <FieldHint>{hint}</FieldHint>}
        </fieldset>
    );
}
