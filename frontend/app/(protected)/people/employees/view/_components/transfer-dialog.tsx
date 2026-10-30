"use client";

// ย้ายแผนก / สาขา = รหัสพนักงานใหม่ + บัตรใหม่ (ข้อ 3.3) · ตัวอย่างรหัสใหม่สดก่อนบันทึก
// หน้าตาเดียวกับ TerminateDialog (กล่องกลางจอ มือถือเป็นแผ่นจากล่าง) · Esc ปิด · ข้อผิดพลาดค้างไว้ในหน้าต่าง
import { useEffect, useState } from "react";
import { toast } from "sonner";
import FormField, { inputClass } from "@/components/ui/form-field";
import FieldHint from "@/components/ui/guidance/field-hint";
import StatusBanner from "@/components/ui/guidance/status-banner";
import { buttonClass } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { toFieldErrors, type FieldErrors } from "@/lib/form-errors";
import { employeeTransferSchema } from "@/lib/shared/schemas/people.mjs";
import { employeeCodePrefix } from "@/lib/shared/employee-code.mjs";
import { EMPLOYEE_MESSAGES } from "../../../_messages";
import type { Employee, EmployeeFormOptions } from "../../../_types";

export default function TransferDialog({ employee, onClose }: { employee: Employee; onClose: (isSaved: boolean) => void }) {
    const range = employee.transfer_range;
    const [departments, setDepartments] = useState<EmployeeFormOptions["departments"] | null>(null);
    const [form, setForm] = useState({ emp_department_id: "", effective_date: range.maxDate, reason: "" });
    const [errors, setErrors] = useState<FieldErrors>({});
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        let isLeftPage = false;
        apiFetch<EmployeeFormOptions>("/employees/form-options").then(({ data, error }) => {
            if (isLeftPage) return;
            if (error) {
                setErrors({ form: error.message });
                return;
            }
            setDepartments(data.departments);
        });
        return () => {
            isLeftPage = true;
        };
    }, []);

    useEffect(() => {
        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape" && !isSaving) onClose(false);
        }
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isSaving, onClose]);

    // ช่วงวันว่าง = วันนี้ยังย้ายไม่ได้ (เช่น เพิ่มพนักงานวันนี้ หรือยังไม่ถึงวันเริ่มงาน)
    const hasDateRange = range.minDate <= range.maxDate;
    const departmentChoices = (departments ?? []).filter(
        (department) => department.dep_status === "active" && department.dep_id !== employee.emp_department_id,
    );
    const newDepartment = departmentChoices.find((department) => department.dep_id === form.emp_department_id);
    const newCodePrefix = newDepartment ? employeeCodePrefix(newDepartment.dep_code, employee.emp_hire_date) : null;
    const activeCard = employee.cards.find((card) => !card.ec_voided_at);

    async function save(event: React.FormEvent) {
        event.preventDefault();
        const checked = employeeTransferSchema.safeParse(form);
        if (!checked.success) {
            setErrors(toFieldErrors(checked.error.issues));
            return;
        }
        setIsSaving(true);
        const { data, error } = await apiFetch<{ old_code: string; emp_code: string }>(
            `/employees/${employee.emp_id}/transfer`,
            { method: "POST", body: checked.data },
        );
        setIsSaving(false);
        if (error) {
            setErrors({ ...error.fields, form: error.message });
            return;
        }
        toast.success(`ย้ายแล้ว · รหัสใหม่ ${data.emp_code} · บัตรใหม่รอพิมพ์`);
        onClose(true);
    }

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
            <form
                role="dialog"
                aria-modal="true"
                aria-labelledby="transfer-title"
                onSubmit={save}
                noValidate
                className="grid max-h-[90dvh] w-full max-w-3xl gap-4 overflow-y-auto rounded-t-2xl bg-white p-5 shadow-float sm:rounded-2xl sm:p-6"
            >
                <div className="grid gap-1">
                    <h2 id="transfer-title" className="text-base font-medium text-gray-900">
                        ย้ายแผนก / สาขา: {employee.emp_first_name_th} {employee.emp_last_name_th}
                    </h2>
                    <p className="text-sm text-gray-500">{EMPLOYEE_MESSAGES.transfer}</p>
                </div>

                {!hasDateRange && (
                    <StatusBanner tone="wait" title={`ย้ายได้ตั้งแต่ ${range.minDate}`}>
                        วันที่มีผลต้องไม่ก่อนวันเริ่มงานและวันที่เริ่มใช้รหัสปัจจุบัน แต่ต้องไม่เกินวันนี้ · ถ้าเลือกแผนกผิดตอนเพิ่มพนักงาน
                        ให้ใช้ปุ่ม &quot;แก้ไขข้อมูล&quot; แทน (ยังแก้ได้จนกว่าจะเข้ารอบเงินเดือนแรก)
                    </StatusBanner>
                )}

                <FormField
                    label="แผนกใหม่"
                    htmlFor="emp_department_id"
                    required
                    hint={
                        newDepartment
                            ? `สาขา ${newDepartment.branch_code} · ${newDepartment.branch_name_th}`
                            : "แผนกไหนก็ได้ทุกสาขา · สาขาของพนักงานเปลี่ยนตามแผนก"
                    }
                    error={errors.emp_department_id}
                >
                    <select
                        id="emp_department_id"
                        value={form.emp_department_id}
                        disabled={!departments}
                        onChange={(event) => setForm((current) => ({ ...current, emp_department_id: event.target.value }))}
                        className={inputClass(Boolean(errors.emp_department_id))}
                    >
                        <option value="">{departments ? "เลือกแผนก" : "กำลังโหลด..."}</option>
                        {departmentChoices.map((department) => (
                            <option key={department.dep_id} value={department.dep_id}>
                                {department.dep_code} · {department.dep_name} ({department.branch_name_th})
                            </option>
                        ))}
                    </select>
                </FormField>

                <FormField
                    label="วันที่มีผล"
                    htmlFor="effective_date"
                    required
                    hint={EMPLOYEE_MESSAGES.transferDate(range)}
                    error={errors.effective_date}
                >
                    <input
                        id="effective_date"
                        type="date"
                        min={range.minDate}
                        max={range.maxDate}
                        value={form.effective_date}
                        disabled={!hasDateRange}
                        onChange={(event) => setForm((current) => ({ ...current, effective_date: event.target.value }))}
                        className={inputClass(Boolean(errors.effective_date))}
                    />
                </FormField>

                <FormField label="เหตุผลที่ย้าย" htmlFor="reason" required error={errors.reason}>
                    <textarea
                        id="reason"
                        rows={2}
                        maxLength={500}
                        placeholder="เช่น ปรับโครงสร้างทีม / ย้ายไปประจำสาขาใหม่"
                        value={form.reason}
                        onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))}
                        className={inputClass(Boolean(errors.reason))}
                    />
                </FormField>

                <div className="grid gap-1 rounded-xl bg-gray-50 p-4 text-sm">
                    <span className="text-xs text-gray-500">รหัสพนักงาน</span>
                    <span className="tracking-wider break-all text-gray-500 tabular-nums line-through">{employee.emp_code}</span>
                    <span className="text-lg font-medium tracking-wider break-all text-gray-900 tabular-nums">
                        {newCodePrefix ?? "เลือกแผนกใหม่ก่อน"}
                        {newCodePrefix && <span className="text-gray-400">XXXX</span>}
                    </span>
                    <span className="text-xs text-gray-500">
                        วันเริ่มงานในรหัสใช้วันเดิม · 4 หลักท้ายระบบออกตอนบันทึก
                        {activeCard?.ec_printed_at && ` · บัตรใบที่ ${activeCard.ec_seq} ถูกยกเลิก ต้องเก็บคืน`}
                        {activeCard && !activeCard.ec_printed_at && ` · บัตรใบที่ ${activeCard.ec_seq} (ยังไม่ได้พิมพ์) ถูกยกเลิก`}
                    </span>
                </div>

                {errors.form && <FieldHint error={errors.form} />}
                <div className="flex flex-wrap justify-end gap-2">
                    <button type="button" className={buttonClass("secondary", "md")} onClick={() => onClose(false)} disabled={isSaving}>
                        ไม่ทำ
                    </button>
                    <button type="submit" className={buttonClass("primary", "md")} disabled={isSaving || !hasDateRange}>
                        {isSaving ? "กำลังบันทึก..." : "ย้ายและออกรหัสใหม่"}
                    </button>
                </div>
            </form>
        </div>
    );
}
