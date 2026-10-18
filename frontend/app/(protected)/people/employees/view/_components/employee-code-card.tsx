"use client";

// รหัสพนักงาน: แยกส่วนให้อ่านออก (สาขา · แผนก · วันเริ่มงาน · ลำดับ) + ประวัติรหัสและแผนก + ปุ่มย้ายแผนก/สาขา
// docs/plans/2026-10-18-employee-department-codes.md ข้อ 2, 3.3
import { useState } from "react";
import { ArrowRightLeft, Hash } from "lucide-react";
import SectionCard from "@/components/ui/section-card";
import { buttonClass } from "@/components/ui/button";
import { formatDateOnly } from "@/app/function";
import { describeEmployeeCode } from "@/lib/shared/employee-code.mjs";
import { EMPLOYEE_MESSAGES } from "../../../_messages";
import type { Employee, EmployeeCodeReason } from "../../../_types";
import TransferDialog from "./transfer-dialog";

const CODE_REASONS: Record<EmployeeCodeReason, string> = {
    hire: "เริ่มงาน",
    correction: "แก้ข้อมูล",
    transfer: "ย้ายแผนก/สาขา",
    migration: "ปรับระบบรหัส",
};

export default function EmployeeCodeCard({ employee, onChanged }: { employee: Employee; onChanged: () => void }) {
    const [isTransferring, setIsTransferring] = useState(false);
    const parts = describeEmployeeCode(employee.emp_code);
    const canTransfer = employee.employment_status !== "terminated";

    return (
        <SectionCard
            icon={Hash}
            title="รหัสพนักงาน"
            description={EMPLOYEE_MESSAGES.code}
            actions={
                canTransfer && (
                    <button type="button" className={buttonClass("secondary", "md")} onClick={() => setIsTransferring(true)}>
                        <ArrowRightLeft size={16} />
                        ย้ายแผนก / สาขา
                    </button>
                )
            }
        >
            {parts ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <CodePart value={parts.branchCode} label="สาขา" detail={employee.branch_name} />
                    <CodePart value={parts.abbr} label="แผนก" detail={employee.department_name} />
                    <CodePart value={employee.emp_code.slice(8, 14)} label="วันเริ่มงาน" detail={formatDateOnly(employee.emp_hire_date)} />
                    <CodePart value={employee.emp_code.slice(14)} label="ลำดับของวันนั้น" detail={`คนที่ ${parts.sequence}`} />
                </div>
            ) : (
                <p className="text-lg font-medium tracking-wider text-gray-900 tabular-nums">{employee.emp_code}</p>
            )}

            {employee.code_history.length > 0 && (
                <div className="grid gap-2">
                    <h3 className="text-sm font-medium text-gray-800">ประวัติรหัสและแผนก</h3>
                    <ol className="grid gap-2">
                        {employee.code_history.map((row) => (
                            <li
                                key={row.ecd_id}
                                className={`grid gap-0.5 rounded-xl border px-4 py-3 text-sm ${
                                    row.ecd_valid_to ? "border-gray-200 bg-white" : "border-blue-200 bg-blue-50/50"
                                }`}
                            >
                                <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                    <span className="font-medium tracking-wider break-all text-gray-900 tabular-nums">{row.ecd_code}</span>
                                    {!row.ecd_valid_to && <span className="text-xs text-blue-700">ใช้อยู่</span>}
                                </span>
                                <span className="text-gray-700">
                                    {row.dep_name ?? "ไม่มีแผนก"}
                                    {row.branch_name_th ? ` · ${row.branch_name_th}` : ""}
                                </span>
                                <span className="text-xs text-gray-500">
                                    {formatDateOnly(row.ecd_valid_from)} ถึง {row.ecd_valid_to ? formatDateOnly(row.ecd_valid_to) : "ปัจจุบัน"} ·{" "}
                                    {CODE_REASONS[row.ecd_reason]}
                                    {row.ecd_note ? ` · ${row.ecd_note}` : ""}
                                    {row.created_by_name ? ` · โดย ${row.created_by_name}` : ""}
                                </span>
                            </li>
                        ))}
                    </ol>
                </div>
            )}

            {isTransferring && (
                <TransferDialog
                    employee={employee}
                    onClose={(isSaved) => {
                        setIsTransferring(false);
                        if (isSaved) onChanged();
                    }}
                />
            )}
        </SectionCard>
    );
}

function CodePart({ value, label, detail }: { value: string; label: string; detail: string | null }) {
    return (
        <div className="grid min-w-0 gap-0.5 rounded-xl bg-gray-50 px-3 py-2.5">
            <span className="text-lg font-medium tracking-wider text-gray-900 tabular-nums">{value}</span>
            <span className="text-xs text-gray-500">{label}</span>
            <span className="truncate text-xs text-gray-700">{detail ?? "-"}</span>
        </div>
    );
}
