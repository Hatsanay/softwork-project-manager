"use client";

// ฟอร์มพนักงาน — ใช้ทั้งหน้าเพิ่มและหน้าแก้ไข (2026-10-17 เฟส 4 ขั้น 4-1)
// ตรวจด้วย schema ชุดเดียวกับ backend ก่อนส่ง · error จากเซิร์ฟเวอร์แสดงใต้ช่องเดียวกัน
// เงินเดือนเริ่มงานกรอกเฉพาะตอนเพิ่ม — แก้ภายหลังผ่าน "ค่าจ้างตามวันที่มีผล" ในหน้าพนักงาน (ประวัติไม่หาย)
// เพิ่มพนักงาน: ดึงข้อมูลที่ระบบมีอยู่แล้วมาเติมให้ (2026-10-19 ผู้ใช้สั่ง) — ช่องที่พิมพ์เองแล้วไม่ทับ
//   บัญชีผู้ใช้ → ชื่อ เบอร์ อีเมล · สาขาของบัญชีมีแผนกเดียว → แผนก
//   เคยเป็นพนักงาน (หาจากบัญชีหรือเลขประจำตัว) → ข้อมูลเดิมทั้งหมด + เงินเดือนล่าสุด ยกเว้นวันเริ่มงานและหมายเหตุ
// รหัสพนักงานระบบออกให้จากแผนก + วันเริ่มงาน (2026-10-18) · สาขามาจากแผนก · เข้ารอบเงินเดือนแล้วสองช่องนี้ล็อก
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BriefcaseBusiness, KeyRound, Landmark, UserRound } from "lucide-react";
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
import { employeeCodePrefix } from "@/lib/shared/employee-code.mjs";
import { formatDateOnly } from "@/app/function";
import { EMPLOYEE_MESSAGES } from "../../_messages";
import type { Employee, EmployeeFormOptions, FormerEmployee } from "../../_types";

const TITLES = ["นาย", "นาง", "นางสาว"];

const EMPTY_FORM = {
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
    emp_hire_date: "",
    emp_bank_name: "",
    emp_bank_account_no: "",
    emp_bank_account_name: "",
    emp_sso_enrolled: true,
    emp_attendance_required: true,
    emp_sso_number: "",
    emp_notes: "",
    ecm_base_salary: "",
};

type EmployeeFormValues = typeof EMPTY_FORM;
type SaveResult = { emp_id: string; emp_code: string; code_changed?: boolean };
type TextField = Exclude<keyof EmployeeFormValues, "emp_sso_enrolled" | "emp_attendance_required">;

function toForm(employee: Employee): EmployeeFormValues {
    return {
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
        emp_hire_date: employee.emp_hire_date,
        emp_bank_name: employee.emp_bank_name ?? "",
        emp_bank_account_no: employee.emp_bank_account_no ?? "",
        emp_bank_account_name: employee.emp_bank_account_name ?? "",
        emp_sso_enrolled: employee.emp_sso_enrolled,
        emp_attendance_required: employee.emp_attendance_required,
        emp_sso_number: employee.emp_sso_number ?? "",
        emp_notes: employee.emp_notes ?? "",
        ecm_base_salary: "",
    };
}

type FillValues = Partial<EmployeeFormValues>;
type AccountOption = EmployeeFormOptions["users"][number];
// nationalId = เลขที่ใช้หาพนักงานเดิม (null = หาจากบัญชี)
type FillSource = { accountName: string | null; former: FormerEmployee | null; nationalId: string | null };

// ชื่อช่องที่แสดงในแถบ "เติมข้อมูลให้แล้ว"
const FIELD_LABELS: Partial<Record<keyof EmployeeFormValues, string>> = {
    emp_title: "คำนำหน้า",
    emp_first_name_th: "ชื่อ",
    emp_last_name_th: "นามสกุล",
    emp_first_name_en: "ชื่ออังกฤษ",
    emp_last_name_en: "นามสกุลอังกฤษ",
    emp_nickname: "ชื่อเล่น",
    emp_national_id: "เลขประจำตัวประชาชน",
    emp_birth_date: "วันเกิด",
    emp_address: "ที่อยู่",
    emp_phone: "เบอร์",
    emp_email: "อีเมล",
    emp_department_id: "แผนก",
    emp_position: "ตำแหน่ง",
    emp_sso_enrolled: "ประกันสังคม",
    emp_sso_number: "เลขประกันสังคม",
    emp_bank_name: "ธนาคาร",
    emp_bank_account_no: "เลขบัญชี",
    emp_bank_account_name: "ชื่อบัญชี",
    ecm_base_salary: "เงินเดือนล่าสุด",
};

export default function EmployeeForm({ employee, initialUserId }: { employee?: Employee; initialUserId?: string | null }) {
    const router = useRouter();
    const isEditing = employee !== undefined;
    const [form, setForm] = useState<EmployeeFormValues>(() => (employee ? toForm(employee) : EMPTY_FORM));
    const [options, setOptions] = useState<EmployeeFormOptions | null>(null);
    const [optionsError, setOptionsError] = useState<ApiError | null>(null);
    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
    const [saveError, setSaveError] = useState<ApiError | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    // ค่าที่ระบบเติมรอบล่าสุด: ref ใช้ตอนเติม (ค่าล่าสุดเสมอ แม้รอโหลดประวัติเดิม) · state ใช้แสดงผล
    const autoFilledRef = useRef<FillValues>({});
    const [autoFilled, setAutoFilled] = useState<FillValues>({});
    const [fillSource, setFillSource] = useState<FillSource | null>(null);
    // เปลี่ยนบัญชีเร็ว ๆ: ผลโหลดประวัติเดิมของบัญชีก่อนหน้าที่มาช้าต้องทิ้ง
    const fillRequestRef = useRef(0);
    // เลขประจำตัวล่าสุดที่พิมพ์ — ผลค้นพนักงานเดิมที่กลับมาหลังพิมพ์เลขอื่นแล้วต้องทิ้ง
    const nationalIdRef = useRef("");

    const applyFill = useCallback((values: FillValues, source: FillSource) => {
        const previous = autoFilledRef.current;
        autoFilledRef.current = values;
        setForm((current) => mergeFill(current, previous, values));
        setAutoFilled(values);
        setFillSource(source);
    }, []);

    /** เติมจากบัญชีทันที แล้วถ้าเคยเป็นพนักงาน โหลดข้อมูลเดิมมาเติมเพิ่ม */
    const fillFrom = useCallback(
        async (
            formOptions: EmployeeFormOptions,
            user: AccountOption | undefined,
            former: FormerEmployee | null,
            nationalId: string | null = null,
        ) => {
            fillRequestRef.current += 1;
            const requestId = fillRequestRef.current;
            const accountName = user?.fullname ?? null;
            applyFill(buildFill(formOptions, user, null), { accountName, former: null, nationalId: null });
            if (!former) return;
            const { data } = await apiFetch<Employee>(`/employees/${former.emp_id}`);
            const isOutdated = requestId !== fillRequestRef.current;
            if (isOutdated || !data) return;
            applyFill(buildFill(formOptions, user, data), { accountName, former, nationalId });
        },
        [applyFill],
    );

    useEffect(() => {
        let isLeftPage = false;
        apiFetch<EmployeeFormOptions>("/employees/form-options").then(({ data, error }) => {
            if (isLeftPage) return;
            setOptions(data);
            setOptionsError(error);
            // มาจากปุ่ม "เพิ่มเป็นพนักงาน" ในหน้าผู้ใช้ (?user=) — เลือกบัญชีและเติมให้เลย
            const preselected = data?.users.find((user) => user.user_id === initialUserId && !user.linked_employee_id);
            if (isEditing || !data || !preselected) return;
            setForm((current) => ({ ...current, emp_user_id: preselected.user_id }));
            void fillFrom(data, preselected, findFormer(data, preselected.user_id));
        });
        return () => {
            isLeftPage = true;
        };
    }, [isEditing, initialUserId, fillFrom]);

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
    const selectedDepartment = options.departments.find((department) => department.dep_id === form.emp_department_id);
    // เข้ารอบเงินเดือนแล้ว: วันเริ่มงาน/แผนกล็อก (backend ตรวจซ้ำ)
    const lockedPeriod = employee?.code_locked_by_payroll ?? null;
    const isCodeInputChanged =
        isEditing &&
        (form.emp_department_id !== (employee.emp_department_id ?? "") || form.emp_hire_date !== employee.emp_hire_date);
    const codePrefix =
        selectedDepartment && /^\d{4}-\d{2}-\d{2}$/.test(form.emp_hire_date)
            ? employeeCodePrefix(selectedDepartment.dep_code, form.emp_hire_date)
            : null;
    // บัญชีที่ผูกกับพนักงานคนอื่นที่ยังทำงานอยู่ เลือกไม่ได้ (backend ตรวจซ้ำ)
    const userChoices = options.users.filter(
        (user) =>
            user.user_id === employee?.emp_user_id ||
            (user.user_status === "active" &&
                (!user.linked_employee_id || user.linked_employee_id === employee?.emp_id)),
    );
    const selectedUserHint = form.emp_user_id
        ? EMPLOYEE_MESSAGES.userLink
        : isEditing
          ? undefined
          : "ไม่มีบัญชี เช่น แม่บ้าน คนขับรถ · เพิ่มบัญชีทีหลังได้ที่หน้าแก้ไขพนักงาน";
    // ช่องที่ยังเป็นค่าที่ระบบเติม (ผู้ใช้แก้แล้วหายจากรายการ)
    const filledLabels = (Object.keys(autoFilled) as (keyof EmployeeFormValues)[])
        .filter((field) => form[field] === autoFilled[field] && FIELD_LABELS[field])
        .map((field) => FIELD_LABELS[field]);
    const matchedFormer =
        fillSource?.former && fillSource.nationalId === onlyDigits(form.emp_national_id) ? fillSource.former : null;

    const isBankChanged =
        isEditing && form.emp_bank_account_no.replace(/[\s-]+/g, "") !== (employee.emp_bank_account_no ?? "");

    function updateField<Field extends keyof EmployeeFormValues>(field: Field, value: EmployeeFormValues[Field]) {
        setForm((current) => ({ ...current, [field]: value }));
    }

    /** เลือกบัญชี: ตอนเพิ่มพนักงานเติมข้อมูลที่มีให้ (บัญชี แผนก ประวัติเดิม) */
    function chooseAccount(userId: string) {
        updateField("emp_user_id", userId);
        if (isEditing || !options) return;
        const user = options.users.find((item) => item.user_id === userId);
        const accountFormer = findFormer(options, userId);
        if (accountFormer) {
            void fillFrom(options, user, accountFormer);
            return;
        }
        // บัญชีนี้ไม่มีประวัติเดิม แต่เลขประจำตัวที่พิมพ์ไว้ตรงกับพนักงานเดิม → ใช้อันนั้นต่อ
        const nationalId = matchedFormer ? (fillSource?.nationalId ?? null) : null;
        void fillFrom(options, user, matchedFormer, nationalId);
    }

    /** เลขประจำตัวครบ 13 หลักและตรงกับพนักงานเดิม → เติมข้อมูลเดิมให้ (คนที่ไม่มีบัญชีก็ได้) */
    async function changeNationalId(value: string) {
        updateField("emp_national_id", value);
        const digits = onlyDigits(value);
        nationalIdRef.current = digits;
        if (isEditing || !options || digits.length !== 13) return;
        // บัญชีที่เลือกมีประวัติเดิมแล้ว หรือเลขนี้ค้นไปแล้ว ไม่ต้องค้นซ้ำ
        if (findFormer(options, form.emp_user_id) || digits === fillSource?.nationalId) return;
        const { data } = await apiFetch<{ former: FormerEmployee | null }>(`/employees/former?national_id=${digits}`);
        const isOutdated = nationalIdRef.current !== digits;
        if (isOutdated || !data?.former) return;
        const user = options.users.find((item) => item.user_id === form.emp_user_id);
        void fillFrom(options, user, data.former, digits);
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
            ? await apiFetch<SaveResult>(`/employees/${employee.emp_id}`, { method: "PUT", body: checked.data })
            : await apiFetch<SaveResult>("/employees", { method: "POST", body: checked.data });
        setIsSaving(false);
        if (error) {
            setFieldErrors(error.fields);
            setSaveError(error);
            return;
        }
        if (!isEditing) toast.success(`เพิ่มพนักงานแล้ว · รหัส ${data?.emp_code}`);
        else if (data?.code_changed) toast.success(`บันทึกแล้ว · รหัสใหม่ ${data.emp_code} · บัตรใหม่รอพิมพ์`);
        else toast.success("บันทึกข้อมูลพนักงานแล้ว");
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
            <SectionCard
                icon={KeyRound}
                title="บัญชีผู้ใช้ในระบบ"
                description={isEditing ? EMPLOYEE_MESSAGES.userLink : EMPLOYEE_MESSAGES.chooseAccount}
            >
                <FormField label="บัญชีผู้ใช้" htmlFor="emp_user_id" error={fieldErrors.emp_user_id} hint={selectedUserHint}>
                    <select
                        id="emp_user_id"
                        value={form.emp_user_id}
                        onChange={(event) => chooseAccount(event.target.value)}
                        className={inputClass(Boolean(fieldErrors.emp_user_id))}
                    >
                        <option value="">ไม่มีบัญชี (กรอกข้อมูลเอง)</option>
                        {userChoices.map((user) => (
                            <option key={user.user_id} value={user.user_id}>
                                {user.fullname} ({user.user_username})
                                {!isEditing && findFormer(options, user.user_id) ? " · เคยเป็นพนักงาน" : ""}
                            </option>
                        ))}
                    </select>
                </FormField>
                {!isEditing && filledLabels.length > 0 && (
                    <StatusBanner tone="done" title={`เติมข้อมูลให้แล้ว ${filledLabels.length} ช่อง · แก้ได้ทุกช่อง`}>
                        <span className="block">
                            {describeSource(fillSource)}: {filledLabels.join(" ")}
                        </span>
                        {fillSource?.former && (
                            <span className="block">
                                วันเริ่มงานกรอกใหม่ (เริ่มช่วงทำงานใหม่ ได้รหัสพนักงานใหม่) · เงินเดือนเป็นอัตราล่าสุดก่อนออก
                                ตรวจก่อนบันทึก
                            </span>
                        )}
                    </StatusBanner>
                )}
            </SectionCard>

            <SectionCard icon={UserRound} title="ข้อมูลส่วนตัว" description={EMPLOYEE_MESSAGES.notUser}>
                <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                        label="คำนำหน้า"
                        htmlFor="emp_title"
                        error={fieldErrors.emp_title}
                        className="sm:col-span-2 sm:max-w-xs"
                    >
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
                        hint={
                            matchedFormer
                                ? `ตรงกับพนักงานเดิม ${matchedFormer.emp_code} ${matchedFormer.full_name} · เติมข้อมูลเดิมให้แล้ว`
                                : EMPLOYEE_MESSAGES.nationalId
                        }
                        error={fieldErrors.emp_national_id}
                        className="sm:col-span-2"
                    >
                        <input
                            id="emp_national_id"
                            inputMode="numeric"
                            placeholder="13 หลัก"
                            value={form.emp_national_id}
                            onChange={(event) => void changeNationalId(event.target.value)}
                            className={inputClass(Boolean(fieldErrors.emp_national_id))}
                        />
                    </FormField>
                    <FormField label="เบอร์โทรศัพท์" htmlFor="emp_phone" error={fieldErrors.emp_phone}>
                        {textInput("emp_phone", { type: "tel", inputMode: "tel" })}
                    </FormField>
                    <FormField
                        label="อีเมลติดต่อ"
                        htmlFor="emp_email"
                        hint={EMPLOYEE_MESSAGES.contactEmail}
                        error={fieldErrors.emp_email}
                    >
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
                {lockedPeriod && (
                    <StatusBanner tone="info" title="รหัสพนักงานล็อกแล้ว">
                        {EMPLOYEE_MESSAGES.codeLocked(lockedPeriod)}
                    </StatusBanner>
                )}
                {!lockedPeriod && isCodeInputChanged && (
                    <StatusBanner tone="warn" title="รหัสพนักงานจะเปลี่ยน">
                        {EMPLOYEE_MESSAGES.codeCorrection}
                    </StatusBanner>
                )}
                <EmployeeCodePreview
                    currentCode={employee?.emp_code ?? null}
                    prefix={codePrefix}
                    isChanging={!isEditing || isCodeInputChanged}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                        label="แผนก"
                        htmlFor="emp_department_id"
                        required
                        hint={
                            selectedDepartment
                                ? `สาขา ${selectedDepartment.branch_code} · ${selectedDepartment.branch_name_th}`
                                : EMPLOYEE_MESSAGES.department
                        }
                        error={fieldErrors.emp_department_id}
                    >
                        <select
                            id="emp_department_id"
                            value={form.emp_department_id}
                            disabled={Boolean(lockedPeriod)}
                            onChange={(event) => updateField("emp_department_id", event.target.value)}
                            className={inputClass(Boolean(fieldErrors.emp_department_id))}
                        >
                            <option value="">เลือกแผนก</option>
                            {departmentChoices.map((department) => (
                                <option key={department.dep_id} value={department.dep_id}>
                                    {department.dep_code} · {department.dep_name} ({department.branch_name_th})
                                </option>
                            ))}
                        </select>
                    </FormField>
                    <FormField
                        label="วันเริ่มงาน"
                        htmlFor="emp_hire_date"
                        required
                        hint={EMPLOYEE_MESSAGES.hireDate}
                        error={fieldErrors.emp_hire_date}
                    >
                        <input
                            id="emp_hire_date"
                            type="date"
                            value={form.emp_hire_date}
                            disabled={Boolean(lockedPeriod)}
                            onChange={(event) => updateField("emp_hire_date", event.target.value)}
                            className={inputClass(Boolean(fieldErrors.emp_hire_date))}
                        />
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
                    <FormField
                        label="ตำแหน่งงาน"
                        htmlFor="emp_position"
                        hint={EMPLOYEE_MESSAGES.position}
                        error={fieldErrors.emp_position}
                    >
                        {textInput("emp_position", { placeholder: "เช่น นักพัฒนาซอฟต์แวร์" })}
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
                    <label className="flex items-start gap-2 text-sm sm:col-span-2">
                        <input
                            type="checkbox"
                            className="mt-1 h-4 w-4"
                            checked={form.emp_attendance_required}
                            onChange={(event) => updateField("emp_attendance_required", event.target.checked)}
                        />
                        <span className="grid gap-0.5">
                            <span>ต้องลงเวลาเข้า-ออกงาน</span>
                            <FieldHint>ไม่ติ๊ก = ไม่ต้องกดเข้า/ออก และไม่นับสาย/ขาด เช่น ผู้บริหาร · กะทำงานกำหนดที่แท็บ เวลาทำงาน ในหน้าพนักงาน</FieldHint>
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

// แถบรหัสพนักงาน: รหัสปัจจุบัน หรือรหัสที่จะได้ (4 หลักท้ายระบบออกตอนบันทึก)
function EmployeeCodePreview({
    currentCode,
    prefix,
    isChanging,
}: {
    currentCode: string | null;
    prefix: string | null;
    isChanging: boolean;
}) {
    if (!isChanging && currentCode) {
        return (
            <div className="grid gap-1 rounded-xl bg-gray-50 p-4">
                <span className="text-xs text-gray-500">รหัสพนักงาน</span>
                <span className="text-lg font-medium tracking-wider break-all text-gray-900 tabular-nums">{currentCode}</span>
                <span className="text-xs text-gray-500">{EMPLOYEE_MESSAGES.code}</span>
            </div>
        );
    }
    return (
        <div className="grid gap-1 rounded-xl bg-gray-50 p-4">
            <span className="text-xs text-gray-500">{currentCode ? "รหัสใหม่ที่จะได้" : "รหัสพนักงานที่จะได้"}</span>
            <span className="text-lg font-medium tracking-wider break-all text-gray-900 tabular-nums">
                {prefix ?? "-"}
                {prefix && <span className="text-gray-400">XXXX</span>}
            </span>
            {currentCode && <span className="text-xs text-gray-500 tabular-nums">รหัสเดิม {currentCode} เก็บในประวัติ</span>}
            <span className="text-xs text-gray-500">
                {prefix ? EMPLOYEE_MESSAGES.code : "เลือกแผนกและวันเริ่มงานก่อน ระบบจะแสดงรหัสที่จะได้"}
            </span>
        </div>
    );
}

// ─── เติมข้อมูลที่ระบบมีอยู่แล้ว ─────────────────────────────────────────────────────────────

function onlyDigits(text: string): string {
    return text.replace(/\D/g, "");
}

/** ตัดช่องที่ไม่มีค่าออก (ไม่เติมค่าว่างทับ) · true/false ของประกันสังคมเก็บไว้ */
function withoutEmpty(values: FillValues): FillValues {
    return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== "" && value !== undefined));
}

/** พนักงานเดิมของบัญชีนี้ (ใหม่สุด) */
function findFormer(options: EmployeeFormOptions, userId: string): FormerEmployee | null {
    if (!userId) return null;
    return options.former_employees.find((former) => former.emp_user_id === userId) ?? null;
}

/** ค่าที่จะเติม: ประวัติเดิม < บัญชี (บัญชีใหม่กว่า) · แผนกจากสาขาของบัญชีถ้าสาขามีแผนกเดียว */
function buildFill(options: EmployeeFormOptions, user: AccountOption | undefined, former: Employee | null): FillValues {
    const values: FillValues = {};
    if (former) Object.assign(values, formerValues(options, former));
    if (user) Object.assign(values, accountValues(user));
    const branchId = user?.user_branch_id;
    if (!values.emp_department_id && branchId) {
        const branchDepartments = options.departments.filter(
            (department) => department.dep_status === "active" && department.dep_branch_id === branchId,
        );
        if (branchDepartments.length === 1) values.emp_department_id = branchDepartments[0].dep_id;
    }
    return values;
}

/** ค่าจากบัญชีผู้ใช้ */
function accountValues(user: AccountOption): FillValues {
    return withoutEmpty({
        emp_first_name_th: user.user_fname,
        emp_last_name_th: user.user_lname,
        emp_phone: user.user_phone ?? "",
        emp_email: user.user_email ?? "",
    });
}

/** ค่าจากพนักงานเดิม: ทุกอย่างยกเว้นบัญชี วันเริ่มงาน หมายเหตุ · แผนกที่ปิดแล้วไม่เติม · เงินเดือน = อัตราล่าสุด */
function formerValues(options: EmployeeFormOptions, former: Employee): FillValues {
    const old = toForm(former);
    const isDepartmentActive = options.departments.some(
        (department) => department.dep_id === old.emp_department_id && department.dep_status === "active",
    );
    return withoutEmpty({
        emp_title: old.emp_title,
        emp_first_name_th: old.emp_first_name_th,
        emp_last_name_th: old.emp_last_name_th,
        emp_first_name_en: old.emp_first_name_en,
        emp_last_name_en: old.emp_last_name_en,
        emp_nickname: old.emp_nickname,
        emp_national_id: old.emp_national_id,
        emp_birth_date: old.emp_birth_date,
        emp_address: old.emp_address,
        emp_phone: old.emp_phone,
        emp_email: old.emp_email,
        emp_department_id: isDepartmentActive ? old.emp_department_id : "",
        emp_position: old.emp_position,
        emp_sso_enrolled: old.emp_sso_enrolled,
        emp_sso_number: old.emp_sso_number,
        emp_bank_name: old.emp_bank_name,
        emp_bank_account_no: old.emp_bank_account_no,
        emp_bank_account_name: old.emp_bank_account_name,
        ecm_base_salary: former.compensations[0]?.ecm_base_salary ?? "",
    });
}

/**
 * เติมค่าใหม่ลงฟอร์ม: ช่องที่ยังเป็นค่าเริ่มต้นหรือยังเป็นค่าที่ระบบเติมรอบก่อนเท่านั้น (ที่ผู้ใช้พิมพ์เองไม่ทับ)
 * ค่ารอบก่อนที่รอบนี้ไม่มี (เช่น เปลี่ยนบัญชี) ล้างกลับเป็นค่าเริ่มต้น
 */
function mergeFill(current: EmployeeFormValues, previous: FillValues, values: FillValues): EmployeeFormValues {
    const defaults: Record<string, string | boolean> = EMPTY_FORM;
    const before: Record<string, string | boolean> = current;
    const next: Record<string, string | boolean> = { ...current };
    for (const [field, value] of Object.entries(previous)) {
        if (before[field] === value) next[field] = defaults[field];
    }
    for (const [field, value] of Object.entries(values)) {
        const isUntouched = before[field] === defaults[field] || before[field] === previous[field as keyof FillValues];
        if (isUntouched && value !== undefined) next[field] = value;
    }
    return next as EmployeeFormValues;
}

function describeSource(source: FillSource | null): string {
    const parts: string[] = [];
    if (source?.accountName) parts.push(`บัญชี ${source.accountName}`);
    if (source?.former) {
        const lastDay = formatDateOnly(source.former.emp_termination_date);
        parts.push(`ประวัติพนักงานเดิม ${source.former.emp_code} (ทำงานวันสุดท้าย ${lastDay})`);
    }
    if (parts.length === 0) return "จากข้อมูลในระบบ";
    return `จาก${parts.join(" และ")}`;
}
