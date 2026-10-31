"use client";

// ฟอร์มเพิ่ม/แก้ไขแถวในรายการ — ใช้ร่วมกัน: สาขา บัญชีธนาคาร สกุลเงิน (ตั้งค่าบริษัท) และหมวดหมู่/ชุดรายการ (หน้าสินค้า)
// เปิดฟอร์มเปล่า (เพิ่ม) หรือฟอร์มที่เติมค่าจากแถวเดิม (แก้) → ตรวจด้วยชุดตรวจเดียวกับ backend → POST/PUT → โหลดใหม่
import { useState } from "react";
import { toast } from "sonner";
import { apiFetch, type ApiError } from "@/lib/api";
import { toFieldErrors, type FieldErrors } from "@/lib/form-errors";

type SafeParseSchema = {
    safeParse(
        input: unknown,
    ):
        | { success: true; data: unknown }
        | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } };
};

type SubmitOptions<Form> = {
    createSchema: SafeParseSchema;
    updateSchema: SafeParseSchema;
    createPath: string;
    updatePath: (editingId: string) => string;
    toPayload: (form: Form) => unknown;
};

export function useRecordEditor<Form extends object>(emptyForm: Form, onSaved: () => Promise<void>) {
    const [isOpen, setIsOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<Form>(emptyForm);
    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
    const [saveError, setSaveError] = useState<ApiError | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    // ค่าตอนเปิดฟอร์ม · ต่างจากตอนนี้ = มีการแก้ค้าง (แผงแก้ไขถามก่อนปิด 2026-10-30)
    const [openedFormJson, setOpenedFormJson] = useState("");

    function resetMessages() {
        setFieldErrors({});
        setSaveError(null);
    }

    function openCreate() {
        resetMessages();
        setEditingId(null);
        setForm(emptyForm);
        setOpenedFormJson(JSON.stringify(emptyForm));
        setIsOpen(true);
    }

    function openEdit(recordId: string, recordForm: Form) {
        resetMessages();
        setEditingId(recordId);
        setForm(recordForm);
        setOpenedFormJson(JSON.stringify(recordForm));
        setIsOpen(true);
    }

    function close() {
        resetMessages();
        setIsOpen(false);
    }

    function updateField<Field extends keyof Form>(field: Field, value: Form[Field]) {
        setForm((current) => ({ ...current, [field]: value }));
    }

    async function submit(options: SubmitOptions<Form>) {
        setSaveError(null);
        const isEditing = editingId !== null;
        const schema = isEditing ? options.updateSchema : options.createSchema;
        const checked = schema.safeParse(options.toPayload(form));
        if (!checked.success) {
            const errors = toFieldErrors(checked.error.issues);
            setFieldErrors(errors);
            // บอกเสมอว่าบันทึกไม่ผ่าน (2026-10-31): ช่องที่ผิดอาจอยู่นอกจอหรือถูกซ่อน กดแล้วเงียบ = ผู้ใช้คิดว่าปุ่มเสีย
            const message = `ข้อมูลไม่ถูกต้อง ${Object.keys(errors).length} ช่อง กรุณาแก้ตามข้อความสีแดงใต้ช่อง`;
            setSaveError({ status: 400, message, code: "VALIDATION", fields: errors, request_id: null });
            toast.error(message);
            return;
        }

        setIsSaving(true);
        const path = isEditing ? options.updatePath(editingId) : options.createPath;
        const { error } = await apiFetch(path, { method: isEditing ? "PUT" : "POST", body: checked.data });
        setIsSaving(false);
        if (error) {
            setFieldErrors(error.fields);
            setSaveError(error);
            return;
        }

        close();
        toast.success("บันทึกแล้ว");
        await onSaved();
    }

    return {
        isOpen,
        isDirty: isOpen && JSON.stringify(form) !== openedFormJson,
        editingId,
        form,
        fieldErrors,
        saveError,
        isSaving,
        openCreate,
        openEdit,
        close,
        updateField,
        submit,
    };
}

// ช่องตัวเลขในฟอร์มเป็นข้อความ — แปลงก่อนตรวจ · ช่องว่าง/ไม่ใช่ตัวเลข = NaN ให้ชุดตรวจบอกว่า "ต้องเป็นตัวเลข" (ไม่แปลงเป็น 0 เงียบๆ)
export function toNumberOrNaN(text: string): number {
    return text.trim() === "" ? Number.NaN : Number(text);
}
