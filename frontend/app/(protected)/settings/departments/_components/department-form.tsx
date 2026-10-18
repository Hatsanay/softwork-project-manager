"use client";

// ฟอร์มแผนก (สร้าง/แก้) — แผนกผูกสาขาเดียว · รหัสแผนก = รหัสสาขา + ตัวย่อ 3 ตัว (2026-10-18)
// docs/plans/2026-10-18-employee-department-codes.md ข้อ 3.1 · ตรวจด้วย departmentSchema ชุดเดียวกับ backend
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import FormField, { inputClass } from "@/components/ui/form-field";
import StatusBanner from "@/components/ui/guidance/status-banner";
import SaveErrorBanner from "@/components/ui/save-error-banner";
import { CARD_CLASS } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { apiFetch, type ApiError } from "@/lib/api";
import { toFieldErrors, type FieldErrors } from "@/lib/form-errors";
import { departmentSchema } from "@/lib/shared/schemas/department.mjs";
import { buildDepartmentCode, normalizeDepartmentAbbr } from "@/lib/shared/employee-code.mjs";

type Branch = { branch_id: string; branch_code: string; branch_name_th: string; branch_status: "active" | "inactive" };

export type DepartmentDetail = {
    dep_id: string;
    dep_name: string;
    dep_branch_id: string;
    dep_abbr: string;
    dep_code: string;
    dep_status: "active" | "inactive";
    employee_count: number;
};

type FormState = { dep_name: string; dep_branch_id: string; dep_abbr: string; dep_status: "active" | "inactive" };

export default function DepartmentForm({ department }: { department?: DepartmentDetail }) {
    const router = useRouter();
    const [branches, setBranches] = useState<Branch[] | null>(null);
    const [form, setForm] = useState<FormState>({
        dep_name: department?.dep_name ?? "",
        dep_branch_id: department?.dep_branch_id ?? "",
        dep_abbr: department?.dep_abbr ?? "",
        dep_status: department?.dep_status ?? "active",
    });
    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
    const [saveError, setSaveError] = useState<ApiError | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // แผนกที่มีพนักงานแล้ว: สาขา/ตัวย่อล็อก (รหัสพนักงานประกอบจากรหัสแผนก)
    const isCodeLocked = (department?.employee_count ?? 0) > 0;

    useEffect(() => {
        let isLeftPage = false;
        apiFetch<{ branches: Branch[] }>("/company").then(({ data }) => {
            if (isLeftPage || !data) return;
            setBranches(data.branches);
            // สร้างใหม่: เลือกสำนักงานใหญ่ไว้ก่อน
            setForm((current) =>
                current.dep_branch_id
                    ? current
                    : { ...current, dep_branch_id: data.branches.find((branch) => branch.branch_code === "00000")?.branch_id ?? "" },
            );
        });
        return () => {
            isLeftPage = true;
        };
    }, []);

    const branch = branches?.find((item) => item.branch_id === form.dep_branch_id);
    const abbr = normalizeDepartmentAbbr(form.dep_abbr);
    const previewCode = branch && abbr.length === 3 ? buildDepartmentCode(branch.branch_code, abbr) : null;

    function update(changes: Partial<FormState>) {
        setForm((current) => ({ ...current, ...changes }));
    }

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault();
        setSaveError(null);
        const checked = departmentSchema.safeParse(form);
        if (!checked.success) {
            setFieldErrors(toFieldErrors(checked.error.issues));
            return;
        }
        setFieldErrors({});
        setIsSaving(true);
        const result = department
            ? await apiFetch(`/departments/${department.dep_id}`, { method: "PUT", body: checked.data })
            : await apiFetch("/departments", { method: "POST", body: checked.data });
        setIsSaving(false);
        if (result.error) {
            setFieldErrors(result.error.fields);
            setSaveError(result.error);
            return;
        }
        toast.success(department ? "บันทึกแผนกแล้ว" : "สร้างแผนกแล้ว");
        router.push("/settings/departments");
    }

    return (
        <form onSubmit={handleSubmit} noValidate className={`grid gap-5 p-5 sm:p-6 ${CARD_CLASS}`}>
            {isCodeLocked && (
                <StatusBanner tone="info" title={`แผนกนี้มีพนักงาน ${department?.employee_count} คนแล้ว`}>
                    เปลี่ยนสาขาหรือตัวย่อไม่ได้ เพราะรหัสพนักงานขึ้นต้นด้วยรหัสแผนก · ถ้าต้องการรหัสใหม่ ให้สร้างแผนกใหม่ แล้วใช้
                    &quot;ย้ายแผนก / สาขา&quot; ที่หน้าพนักงานทีละคน (รหัสเปลี่ยนพร้อมออกบัตรใหม่)
                </StatusBanner>
            )}
            <FormField label="ชื่อแผนก" htmlFor="dep_name" required error={fieldErrors.dep_name} hint="ชื่อซ้ำได้ถ้าอยู่คนละสาขา">
                <input
                    id="dep_name"
                    value={form.dep_name}
                    onChange={(event) => update({ dep_name: event.target.value })}
                    className={inputClass(Boolean(fieldErrors.dep_name))}
                />
            </FormField>
            <div className="grid gap-5 sm:grid-cols-2">
                <FormField
                    label="สาขา"
                    htmlFor="dep_branch_id"
                    required
                    error={fieldErrors.dep_branch_id}
                    hint="แผนกสังกัดสาขาเดียว · พนักงานในแผนกนี้อยู่สาขานี้"
                >
                    <select
                        id="dep_branch_id"
                        value={form.dep_branch_id}
                        disabled={isCodeLocked || !branches}
                        onChange={(event) => update({ dep_branch_id: event.target.value })}
                        className={inputClass(Boolean(fieldErrors.dep_branch_id))}
                    >
                        <option value="">เลือกสาขา</option>
                        {(branches ?? [])
                            .filter((item) => item.branch_status === "active" || item.branch_id === form.dep_branch_id)
                            .map((item) => (
                                <option key={item.branch_id} value={item.branch_id}>
                                    {item.branch_code} · {item.branch_name_th}
                                </option>
                            ))}
                    </select>
                </FormField>
                <FormField
                    label="ตัวย่อแผนก"
                    htmlFor="dep_abbr"
                    required
                    error={fieldErrors.dep_abbr}
                    hint="ตัวอักษรอังกฤษหรือตัวเลข 3 ตัวพอดี เช่น ACC, ITD, HRM · ห้ามซ้ำในสาขาเดียวกัน"
                >
                    <input
                        id="dep_abbr"
                        value={form.dep_abbr}
                        maxLength={3}
                        disabled={isCodeLocked}
                        autoCapitalize="characters"
                        onChange={(event) => update({ dep_abbr: normalizeDepartmentAbbr(event.target.value) })}
                        className={`${inputClass(Boolean(fieldErrors.dep_abbr))} uppercase`}
                    />
                </FormField>
            </div>
            <div className="grid gap-1 rounded-xl bg-gray-50 p-4">
                <span className="text-xs text-gray-500">รหัสแผนก</span>
                <span className="text-xl font-medium tracking-wider text-gray-900 tabular-nums">
                    {previewCode ?? "-"}
                </span>
                <span className="text-xs text-gray-500">
                    รหัสสาขา 5 หลัก + ตัวย่อ 3 ตัว · เป็นส่วนหน้าของรหัสพนักงานทุกคนในแผนกนี้ เช่น{" "}
                    <span className="tabular-nums">{previewCode ?? "00000ACC"}2610180001</span>
                </span>
            </div>
            {department && (
                <FormField label="สถานะ" htmlFor="dep_status" hint="ปิดใช้งาน = เลือกให้พนักงานใหม่ไม่ได้ (พนักงานเดิมยังอยู่)">
                    <select
                        id="dep_status"
                        value={form.dep_status}
                        onChange={(event) => update({ dep_status: event.target.value as FormState["dep_status"] })}
                        className={`${inputClass()} sm:max-w-xs`}
                    >
                        <option value="active">ใช้งาน</option>
                        <option value="inactive">ปิดใช้งาน</option>
                    </select>
                </FormField>
            )}
            <SaveErrorBanner error={saveError} />
            <div className="flex justify-end gap-3">
                <button type="button" onClick={() => router.push("/settings/departments")} className={buttonClass("secondary", "md")}>
                    ยกเลิก
                </button>
                <button type="submit" disabled={isSaving} className={buttonClass("primary", "md")}>
                    {isSaving ? "กำลังบันทึก..." : "บันทึก"}
                </button>
            </div>
        </form>
    );
}
