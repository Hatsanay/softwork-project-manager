"use client";

// บันทึกข้อมูลบริษัท (PUT /company) จากแท็บไหนก็ได้ — แท็บส่งเฉพาะช่องที่ตัวเองแก้ รวมกับค่าที่บันทึกไว้ล่าสุดแล้วส่งครบทุกช่อง
// ตรวจด้วยชุดตรวจเดียวกับ backend ก่อนส่ง ผู้ใช้เห็นข้อผิดพลาดใต้ช่องทันที
import { useState } from "react";
import { toast } from "sonner";
import { apiFetch, type ApiError } from "@/lib/api";
import { toFieldErrors, type FieldErrors } from "@/lib/form-errors";
import { companySchema } from "@/lib/shared/schemas/company.mjs";
import { COMPANY_MESSAGES } from "../_messages";
import { toCompanyPayload, type Company, type CompanyPayload } from "../_types";

export function useSaveCompany(savedCompany: Company, onSaved: () => Promise<void>) {
    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
    const [saveError, setSaveError] = useState<ApiError | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    async function save(changes: Partial<CompanyPayload>) {
        const payload = { ...toCompanyPayload(savedCompany), ...changes };
        setSaveError(null);

        const checked = companySchema.safeParse(payload);
        if (!checked.success) {
            setFieldErrors(toFieldErrors(checked.error.issues));
            return;
        }

        setIsSaving(true);
        const { error } = await apiFetch<Company>("/company", { method: "PUT", body: checked.data });
        setIsSaving(false);
        if (error) {
            setFieldErrors(error.fields);
            setSaveError(error);
            return;
        }

        setFieldErrors({});
        toast.success(COMPANY_MESSAGES.saved);
        await onSaved();
    }

    return { save, fieldErrors, saveError, isSaving };
}
