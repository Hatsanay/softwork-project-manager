"use client";

// ข้อมูลพนักงาน (อ่านอย่างเดียว) — ส่วนตัว · การทำงาน · ประกันสังคม · บัญชีรับเงินเดือน · บัญชีผู้ใช้ที่ผูก
import { IdCard } from "lucide-react";
import SectionCard from "@/components/ui/section-card";
import StatusBanner from "@/components/ui/guidance/status-banner";
import { formatDateOnly } from "@/app/function";
import type { Employee } from "../../../_types";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="grid min-w-0 gap-0.5">
            <dt className="text-xs text-gray-500">{label}</dt>
            <dd className="text-sm break-words text-gray-900">{value || "—"}</dd>
        </div>
    );
}

// "1101700230708" → "1-1017-00230-70-8" (รูปแบบบนบัตรประชาชน อ่านทวนง่าย)
function formatNationalId(nationalId: string | null) {
    if (!nationalId || nationalId.length !== 13) return nationalId;
    return `${nationalId[0]}-${nationalId.slice(1, 5)}-${nationalId.slice(5, 10)}-${nationalId.slice(10, 12)}-${nationalId[12]}`;
}

export default function EmployeeSummaryCard({ employee }: { employee: Employee }) {
    const englishName = [employee.emp_first_name_en, employee.emp_last_name_en].filter(Boolean).join(" ");
    const isUserStillActive = employee.employment_status === "terminated" && employee.user_status === "active";
    const missingForPayroll = [
        !employee.emp_national_id && "เลขประจำตัวประชาชน",
        !employee.emp_address && "ที่อยู่",
        !employee.emp_bank_account_no && "บัญชีรับเงินเดือน",
    ].filter(Boolean);

    return (
        <SectionCard icon={IdCard} title="ข้อมูลพนักงาน">
            {isUserStillActive && (
                <StatusBanner tone="warn" title="บัญชีผู้ใช้ยังเข้าระบบได้">
                    พนักงานพ้นสภาพแล้ว แต่บัญชี {employee.user_username} ยังเปิดใช้งานอยู่ —
                    ปิดที่หน้าจัดการผู้ใช้ถ้าไม่ให้เข้าระบบแล้ว
                </StatusBanner>
            )}
            {missingForPayroll.length > 0 && employee.employment_status !== "terminated" && (
                <StatusBanner tone="info" title="ข้อมูลยังไม่ครบสำหรับรอบเงินเดือน">
                    ยังขาด: {missingForPayroll.join(" · ")} — ใช้บน ภ.ง.ด.1 / 50 ทวิ และการโอนเงินเดือน
                </StatusBanner>
            )}
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <Field label="รหัสพนักงาน" value={employee.emp_code} />
                <Field label="ชื่อ (อังกฤษ)" value={englishName} />
                <Field label="ชื่อเล่น" value={employee.emp_nickname} />
                <Field
                    label="เลขประจำตัวประชาชน"
                    value={<span className="tabular-nums">{formatNationalId(employee.emp_national_id)}</span>}
                />
                <Field
                    label="วันเกิด"
                    value={employee.emp_birth_date ? formatDateOnly(employee.emp_birth_date) : null}
                />
                <Field label="ติดต่อ" value={[employee.emp_phone, employee.emp_email].filter(Boolean).join(" · ")} />
                <Field label="แผนก" value={employee.department_name} />
                <Field label="ตำแหน่งงาน" value={employee.emp_position} />
                <Field label="สาขา" value={employee.branch_name} />
                <Field label="วันเริ่มงาน" value={formatDateOnly(employee.emp_hire_date)} />
                <Field
                    label="วันทำงานวันสุดท้าย"
                    value={
                        employee.emp_termination_date
                            ? `${formatDateOnly(employee.emp_termination_date)} · ${employee.emp_termination_reason ?? ""}`
                            : null
                    }
                />
                <Field
                    label="บัญชีผู้ใช้ที่ผูก"
                    value={
                        employee.user_username ? `${employee.user_fullname} (${employee.user_username})` : "ไม่ได้ผูก"
                    }
                />
                <Field
                    label="ประกันสังคม"
                    value={
                        employee.emp_sso_enrolled
                            ? `เข้า · เลข ${employee.emp_sso_number ?? "ตามเลขประจำตัวประชาชน"}`
                            : "ไม่เข้าประกันสังคม"
                    }
                />
                <Field
                    label="บัญชีรับเงินเดือน"
                    value={
                        employee.emp_bank_account_no
                            ? `${employee.emp_bank_name ?? ""} ${employee.emp_bank_account_no}${employee.emp_bank_account_name ? ` · ${employee.emp_bank_account_name}` : ""}`
                            : null
                    }
                />
                <Field label="ที่อยู่" value={employee.emp_address} />
            </dl>
            {employee.emp_notes && <p className="text-sm whitespace-pre-line text-gray-600">{employee.emp_notes}</p>}
        </SectionCard>
    );
}
