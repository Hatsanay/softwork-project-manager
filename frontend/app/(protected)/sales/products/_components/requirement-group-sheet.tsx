"use client";

// แผ่นเพิ่ม/แก้กลุ่มคำถามลูกค้า (2026-10-26 Q-1 · docs/plans/2026-10-26-customer-questions.md ข้อ 4.2)
// ถามเมื่อไหร่ 3 แบบ: ทุกคำขอ / ถามตามสินค้าที่เลือก / ไม่ถามเอง (เฉพาะลิงก์ที่เลือกถามเพิ่ม) + ชนิดลิงก์ที่ถาม
// สินค้าเลือกคำถาม (2026-11-01): กลุ่มไม่ผูกหมวด/ชุด/สินค้าแล้ว · สินค้าและชุดติ๊กข้อที่ถามเองในแผงของรายการนั้น
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
import { groupAudienceText, type LinkableItems } from "./requirement-labels";

type Trigger = RequirementGroup["rqg_trigger"];
type Audience = RequirementGroup["rqg_audience"];

const TRIGGER_HINT: Record<Trigger, string> = {
    always: "ทุกคนที่ส่งคำขอเห็นกลุ่มนี้ เช่น ธุรกิจทำอะไร",
    selection: "ถามเฉพาะข้อที่สินค้าหรือชุดที่ลูกค้าเลือก (หรือทีมงานเลือกให้) ติ๊กไว้",
    link_only: "ลูกค้าไม่เห็นเอง ใช้กับลิงก์ที่ทีมงานเลือกถามกลุ่มนี้เพิ่ม เช่น งานสั่งทำเฉพาะลูกค้า",
};

export default function RequirementGroupSheet({
    group,
    items,
    onClose,
    onSaved,
    onDelete,
}: {
    group: RequirementGroup | null;
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
    });
    const [errors, setErrors] = useState<FieldErrors>({});
    const [isSaving, setIsSaving] = useState(false);

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

    const summary = groupAudienceText(
        { ...form, rqg_id: group?.rqg_id ?? 0, questions: group?.questions ?? [] },
        items,
    );

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
                <FieldHint>
                    ติ๊กข้อที่จะถามได้ที่แผง &quot;คำถามที่ถามลูกค้า&quot; ในหน้าแก้สินค้าหรือชุดรายการ · เลือกชุด =
                    ถามข้อของสินค้าในชุดให้ด้วย
                </FieldHint>
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
