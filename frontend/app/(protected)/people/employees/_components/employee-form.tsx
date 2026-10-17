"use client";

// ฟอร์มพนักงาน — ใช้ทั้งหน้าเพิ่มและหน้าแก้ไข (2026-10-17 เฟส 4 ขั้น 4-1)
// ตรวจด้วย schema ชุดเดียวกับ backend ก่อนส่ง · error จากเซิร์ฟเวอร์แสดงใต้ช่องเดียวกัน
// เงินเดือนเริ่มงานกรอกเฉพาะตอนเพิ่ม — แก้ภายหลังผ่าน "ค่าจ้างตามวันที่มีผล" ในหน้าพนักงาน (ประวัติไม่หาย)
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BriefcaseBusiness, Landmark, UserRound } from "lucide-react";
import FormField, { inputClass } from "@/components/ui/form-field";
import SectionCard from "@/components/ui/section-card";
import StatusBanner from "@/components/ui/guidance/status-banner";
import FieldHint from "@/components/ui/guidance/field-hint";
import SaveErrorBanner from "@/components/ui/save-error-banner";
import { PageSkeleton } from "@/components/ui/skeleton";
import { buttonClass } from "@/components/ui/button";
import { apiFetch, type ApiError } from "@/lib/api";
import { toFieldErrors, type FieldErrors } from "@/lib/form-errors";
import { employeeCreateSchema, employeeSchema } from "@/lib/shared/schemas/people.mjs";
import { EMPLOYEE_MESSAGES } from "../../_messages";
import type { Employee, EmployeeFormOptions } from "../../_types";

const TITLES = ["นาย", "นาง", "นางสาว"];

const EMPTY_FORM = {
    emp_code: "",
    emp_user_id: "",
    emp_title: "นาย",
    emp_first_name_th: "",
    emp_last_name_th: "",
    emp_first_name_en: "",
    emp_last_name_en: "",
    emp_nickname: "",
    emp_national_id: "",
    emp_birth_date: "",
    emp_address: "",
    emp_phone: "",
    emp_email: "",
    emp_department_id: "",
    emp_position: "",
    emp_branch_id: "",
    emp_hire_date: "",
    emp_bank_name: "",
    emp_bank_account_no: "",
    emp_bank_account_name: "",
    emp_sso_enrolled: true,
    emp_sso_number: "",
    emp_notes: "",
    ecm_base_salary: "",
};

type EmployeeFormValues = typeof EMPTY_FORM;
type TextField = Exclude<keyof EmployeeFormValues, "emp_sso_enrolled">;

function toForm(employee: Employee): EmployeeFormValues {
    return {
        emp_code: employee.emp_code,
        emp_user_id: employee.emp_user_id ?? "",
        emp_title: employee.emp_title ?? "",
        emp_first_name_th: employee.emp_first_name_th,
        emp_last_name_th: employee.emp_last_name_th,
        emp_first_name_en: employee.emp_first_name_en ?? "",
        emp_last_name_en: employee.emp_last_name_en ?? "",
        emp_nickname: employee.emp_nickname ?? "",
        emp_national_id: employee.emp_national_id ?? "",
        emp_birth_date: employee.emp_birth_date ?? "",
        emp_address: employee.emp_address ?? "",
        emp_phone: employee.emp_phone ?? "",
        emp_email: employee.emp_email ?? "",
        emp_department_id: employee.emp_department_id ?? "",
        emp_position: employee.emp_position ?? "",
        emp_branch_id: employee.emp_branch_id ?? "",
        emp_hire_date: employee.emp_hire_date,
        emp_bank_name: employee.emp_bank_name ?? "",
        emp_bank_account_no: employee.emp_bank_account_no ?? "",
        emp_bank_account_name: employee.emp_bank_account_name ?? "",
        emp_sso_enrolled: employee.emp_sso_enrolled,
        emp_sso_number: employee.emp_sso_number ?? "",
        emp_notes: employee.emp_notes ?? "",
        ecm_base_salary: "",
    };
}

export default function EmployeeForm({ employee }: { employee?: Employee }) {
    const router = useRouter();
    const isEditing = employee !== undefined;
    const [form, setForm] = useState<EmployeeFormValues>(() => (employee ? toForm(employee) : EMPTY_FORM));
    const [options, setOptions] = useState<EmployeeFormOptions | null>(null);
    const [optionsError, setOptionsError] = useState<ApiError | null>(null);
    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
    const [saveError, setSaveError] = useState<ApiError | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        let isLeftPage = false;
        apiFetch<EmployeeFormOptions>("/employees/form-options").then(({ data, error }) => {
            if (isLeftPage) return;
            setOptions(data);
            setOptionsError(error);
        });
        return () => {
            isLeftPage = true;
        };
    }, []);

    if (optionsError)
        return (
            <StatusBanner tone="error" title="โหลดตัวเลือกของฟอร์มไม่สำเร็จ">
                {optionsError.message}
            </StatusBanner>
        );
    if (!options) return <PageSkeleton />;

    const titleChoices =
        TITLES.includes(form.emp_title) || form.emp_title === "" ? TITLES : [...TITLES, form.emp_title];
    const departmentChoices = options.departments.filter(
        (department) => department.dep_status === "active" || department.dep_id === employee?.emp_department_id,
    );
    const branchChoices = options.branches.filter(
        (branch) => branch.branch_status === "active" || branch.branch_id === employee?.emp_branch_id,
    );
    // บัญชีที่ผูกกับพนักงานคนอื่นที่ยังทำงานอยู่ เลือกไม่ได้ (backend ตรวจซ้ำ)
    const userChoices = options.users.filter(
        (user) =>
            user.user_id === employee?.emp_user_id ||
            (user.user_status === "active" &&
                (!user.linked_employee_id || user.linked_employee_id === employee?.emp_id)),
    );
    const isBankChanged =
        isEditing && form.emp_bank_account_no.replace(/[\s-]+/g, "") !== (employee.emp_bank_account_no ?? "");

    function updateField<Field extends keyof EmployeeFormValues>(field: Field, value: EmployeeFormValues[Field]) {
        setForm((current) => ({ ...current, [field]: value }));
    }

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault();
        setSaveError(null);
        const schema = isEditing ? employeeSchema : employeeCreateSchema;
        const checked = schema.safeParse(form);
        if (!checked.success) {
            setFieldErrors(toFieldErrors(checked.error.issues));
            toast.error("ยังบันทึกไม่ได้ — แก้ช่องที่มีข้อความสีแดงก่อน");
            return;
        }
        setFieldErrors({});
        setIsSaving(true);
        const { data, error } = isEditing
            ? await apiFetch<{ emp_id: string }>(`/employees/${employee.emp_id}`, { method: "PUT", body: checked.data })
            : await apiFetch<{ emp_id: string }>("/employees", { method: "POST", body: checked.data });
        setIsSaving(false);
        if (error) {
            setFieldErrors(error.fields);
            setSaveError(error);
            return;
        }
        toast.success(isEditing ? "บันทึกข้อมูลพนักงานแล้ว" : "เพิ่มพนักงานแล้ว");
        router.push(`/people/employees/view?id=${data?.emp_id ?? employee?.emp_id}`);
    }

    function textInput(
        field: TextField,
        inputOptions: { type?: string; inputMode?: "numeric" | "decimal" | "email" | "tel"; placeholder?: string } = {},
    ) {
        return (
            <input
                id={field}
                type={inputOptions.type ?? "text"}
                inputMode={inputOptions.inputMode}
                placeholder={inputOptions.placeholder}
                value={form[field]}
                onChange={(event) => updateField(field, event.target.value)}
                className={inputClass(Boolean(fieldErrors[field]))}
            />
        );
    }

    return (
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-5" noValidate>
            <SectionCard icon={UserRound} title="ข้อมูลส่วนตัว" description={EMPLOYEE_MESSAGES.notUser}>
                <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                        label="รหัสพนักงาน"
                        htmlFor="emp_code"
                        required
                        hint={EMPLOYEE_MESSAGES.code}
                        error={fieldErrors.emp_code}
                    >
                        {textInput("emp_code", { placeholder: "เช่น E001" })}
                    </FormField>
                    <FormField label="คำนำหน้า" htmlFor="emp_title" error={fieldErrors.emp_title}>
                        <select
                            id="emp_title"
                            value={form.emp_title}
                            onChange={(event) => updateField("emp_title", event.target.value)}
                            className={inputClass(Boolean(fieldErrors.emp_title))}
                        >
                            <option value="">— ไม่ระบุ —</option>
                            {titleChoices.map((title) => (
                                <option key={title} value={title}>
                                    {title}
                                </option>
                            ))}
                        </select>
                    </FormField>
                    <FormField label="ชื่อ" htmlFor="emp_first_name_th" required error={fieldErrors.emp_first_name_th}>
                        {textInput("emp_first_name_th")}
                    </FormField>
                    <FormField label="นามสกุล" htmlFor="emp_last_name_th" required error={fieldErrors.emp_last_name_th}>
                        {textInput("emp_last_name_th")}
                    </FormField>
                    <FormField label="ชื่อ (อังกฤษ)" htmlFor="emp_first_name_en" error={fieldErrors.emp_first_name_en}>
                        {textInput("emp_first_name_en")}
                    </FormField>
                    <FormField label="นามสกุล (อังกฤษ)" htmlFor="emp_last_name_en" error={fieldErrors.emp_last_name_en}>
                        {textInput("emp_last_name_en")}
                    </FormField>
                    <FormField label="ชื่อเล่น" htmlFor="emp_nickname" error={fieldErrors.emp_nickname}>
                        {textInput("emp_nickname")}
                    </FormField>
                    <FormField label="วันเกิด" htmlFor="emp_birth_date" error={fieldErrors.emp_birth_date}>
                        {textInput("emp_birth_date", { type: "date" })}
                    </FormField>
                    <FormField
                        label="เลขประจำตัวประชาชน"
                        htmlFor="emp_national_id"
                        hint={EMPLOYEE_MESSAGES.nationalId}
                        error={fieldErrors.emp_national_id}
                        className="sm:col-span-2"
                    >
                        {textInput("emp_national_id", { inputMode: "numeric", placeholder: "13 หลัก" })}
                    </FormField>
                    <FormField label="เบอร์โทรศัพท์" htmlFor="emp_phone" error={fieldErrors.emp_phone}>
                        {textInput("emp_phone", { type: "tel", inputMode: "tel" })}
                    </FormField>
                    <FormField label="อีเมล" htmlFor="emp_email" error={fieldErrors.emp_email}>
                        {textInput("emp_email", { type: "email", inputMode: "email" })}
                    </FormField>
                    <FormField
                        label="ที่อยู่"
                        htmlFor="emp_address"
                        hint="ใช้พิมพ์บน 50 ทวิ ประจำปี"
                        error={fieldErrors.emp_address}
                        className="sm:col-span-2"
                    >
                        <textarea
                            id="emp_address"
                            rows={2}
                            value={form.emp_address}
                            onChange={(event) => updateField("emp_address", event.target.value)}
                            className={inputClass(Boolean(fieldErrors.emp_address))}
                        />
                    </FormField>
                </div>
            </SectionCard>

            <SectionCard icon={BriefcaseBusiness} title="การทำงาน">
                <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                        label="วันเริ่มงาน"
                        htmlFor="emp_hire_date"
                        required
                        hint={EMPLOYEE_MESSAGES.hireDate}
                        error={fieldErrors.emp_hire_date}
                    >
                        {textInput("emp_hire_date", { type: "date" })}
                    </FormField>
                    {!isEditing && (
                        <FormField
                            label="เงินเดือนเริ่มงาน (บาท)"
                            htmlFor="ecm_base_salary"
                            required
                            hint={EMPLOYEE_MESSAGES.startingSalary}
                            error={fieldErrors.ecm_base_salary}
                        >
                            {textInput("ecm_base_salary", { inputMode: "decimal", placeholder: "เช่น 30000" })}
                        </FormField>
                    )}
                    <FormField label="แผนก" htmlFor="emp_department_id" error={fieldErrors.emp_department_id}>
                        <select
                            id="emp_department_id"
                            value={form.emp_department_id}
                            onChange={(event) => updateField("emp_department_id", event.target.value)}
                            className={inputClass(Boolean(fieldErrors.emp_department_id))}
                        >
                            <option value="">— ไม่ระบุ —</option>
                            {departmentChoices.map((department) => (
                                <option key={department.dep_id} value={department.dep_id}>
                                    {department.dep_name}
                                </option>
                            ))}
                        </select>
                    </FormField>
                    <FormField
                        label="ตำแหน่งงาน"
                        htmlFor="emp_position"
                        hint={EMPLOYEE_MESSAGES.position}
                        error={fieldErrors.emp_position}
                    >
                        {textInput("emp_position", { placeholder: "เช่น นักพัฒนาซอฟต์แวร์" })}
                    </FormField>
                    <FormField label="สาขา" htmlFor="emp_branch_id" error={fieldErrors.emp_branch_id}>
                        <select
                            id="emp_branch_id"
                            value={form.emp_branch_id}
                            onChange={(event) => updateField("emp_branch_id", event.target.value)}
                            className={inputClass(Boolean(fieldErrors.emp_branch_id))}
                        >
                            <option value="">— ไม่ระบุ —</option>
                            {branchChoices.map((branch) => (
                                <option key={branch.branch_id} value={branch.branch_id}>
                                    {branch.branch_code} · {branch.branch_name_th}
                                </option>
                            ))}
                        </select>
                    </FormField>
                    <FormField
                        label="บัญชีผู้ใช้ในระบบ"
                        htmlFor="emp_user_id"
                        hint={EMPLOYEE_MESSAGES.userLink}
                        error={fieldErrors.emp_user_id}
                    >
                        <select
                            id="emp_user_id"
                            value={form.emp_user_id}
                            onChange={(event) => updateField("emp_user_id", event.target.value)}
                            className={inputClass(Boolean(fieldErrors.emp_user_id))}
                        >
                            <option value="">— ไม่ผูก —</option>
                            {userChoices.map((user) => (
                                <option key={user.user_id} value={user.user_id}>
                                    {user.fullname} ({user.user_username})
                                </option>
                            ))}
                        </select>
                    </FormField>
                    <label className="flex items-start gap-2 text-sm sm:col-span-2">
                        <input
                            type="checkbox"
                            className="mt-1 h-4 w-4"
                            checked={form.emp_sso_enrolled}
                            onChange={(event) => updateField("emp_sso_enrolled", event.target.checked)}
                        />
                        <span className="grid gap-0.5">
                            <span>เข้าประกันสังคม</span>
                            <FieldHint>{EMPLOYEE_MESSAGES.sso}</FieldHint>
                        </span>
                    </label>
                    {form.emp_sso_enrolled && (
                        <FormField
                            label="เลขประกันสังคม"
                            htmlFor="emp_sso_number"
                            hint={EMPLOYEE_MESSAGES.ssoNumber}
                            error={fieldErrors.emp_sso_number}
                        >
                            {textInput("emp_sso_number", { inputMode: "numeric" })}
                        </FormField>
                    )}
                </div>
            </SectionCard>

            <SectionCard icon={Landmark} title="บัญชีรับเงินเดือน" description={EMPLOYEE_MESSAGES.bank}>
                {isBankChanged && (
                    <StatusBanner tone="warn" title="กำลังเปลี่ยนบัญชีรับเงินเดือน">
                        {EMPLOYEE_MESSAGES.bankChanged}
                    </StatusBanner>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                    <FormField label="ธนาคาร" htmlFor="emp_bank_name" error={fieldErrors.emp_bank_name}>
                        {textInput("emp_bank_name", { placeholder: "เช่น กสิกรไทย" })}
                    </FormField>
                    <FormField
                        label="เลขที่บัญชี"
                        htmlFor="emp_bank_account_no"
                        error={fieldErrors.emp_bank_account_no}
                    >
                        {textInput("emp_bank_account_no", { inputMode: "numeric" })}
                    </FormField>
                    <FormField
                        label="ชื่อบัญชี"
                        htmlFor="emp_bank_account_name"
                        hint="ว่าง = ชื่อพนักงาน"
                        error={fieldErrors.emp_bank_account_name}
                        className="sm:col-span-2"
                    >
                        {textInput("emp_bank_account_name")}
                    </FormField>
                    <FormField
                        label="หมายเหตุ"
                        htmlFor="emp_notes"
                        error={fieldErrors.emp_notes}
                        className="sm:col-span-2"
                    >
                        <textarea
                            id="emp_notes"
                            rows={2}
                            value={form.emp_notes}
                            onChange={(event) => updateField("emp_notes", event.target.value)}
                            className={inputClass(Boolean(fieldErrors.emp_notes))}
                        />
                    </FormField>
                </div>
            </SectionCard>

            <SaveErrorBanner error={saveError} />
            <div className="flex flex-wrap justify-end gap-3">
                <button
                    type="button"
                    onClick={() =>
                        router.push(isEditing ? `/people/employees/view?id=${employee.emp_id}` : "/people/employees")
                    }
                    className={buttonClass("secondary", "md")}
                >
                    ยกเลิก
                </button>
                <button type="submit" disabled={isSaving} className={buttonClass("primary", "md")}>
                    {isSaving ? "กำลังบันทึก..." : isEditing ? "บันทึกการแก้ไข" : "เพิ่มพนักงาน"}
                </button>
            </div>
        </form>
    );
}
