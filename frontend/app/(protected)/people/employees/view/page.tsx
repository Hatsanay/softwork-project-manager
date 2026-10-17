"use client";

// หน้าพนักงาน (2026-10-17 เฟส 4 ขั้น 4-1) — ข้อมูล · เงินเดือนตามวันที่มีผล · รายการประจำ · พ้นสภาพ/ยกเลิก · ลบ
// เปิดหน้านี้ = เปิดดูเงินเดือนและเลขประจำตัว → backend บันทึก audit ทุกครั้ง (R-H1/R-H8)
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Pencil, RotateCcw, Trash2, UserX } from "lucide-react";
import PageHeader from "@/components/ui/page-header";
import StatusPill from "@/components/ui/status-pill";
import StatusBanner from "@/components/ui/guidance/status-banner";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { PageSkeleton } from "@/components/ui/skeleton";
import { buttonClass } from "@/components/ui/button";
import { apiFetch, type ApiError } from "@/lib/api";
import { EMPLOYEE_MESSAGES, EMPLOYMENT_STATUS } from "../../_messages";
import type { Employee } from "../../_types";
import EmployeeSummaryCard from "./_components/employee-summary-card";
import CompensationCard from "./_components/compensation-card";
import RecurringItemsCard from "./_components/recurring-items-card";
import LeaveBalanceCard from "./_components/leave-balance-card";
import TerminateDialog from "./_components/terminate-dialog";

type PendingAction = "delete" | "reinstate" | null;

// ปีปัจจุบันตามเวลาไทย (ไม่ใช่เขตเวลาเครื่องผู้ใช้)
function currentYearBangkok() {
    return Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric" }).format(new Date()));
}

export default function EmployeeViewPage() {
    const router = useRouter();
    const employeeId = useSearchParams().get("id");
    const [employee, setEmployee] = useState<Employee | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);
    const [isTerminating, setIsTerminating] = useState(false);
    const [pendingAction, setPendingAction] = useState<PendingAction>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [isWorking, setIsWorking] = useState(false);

    const reload = useCallback(async () => {
        if (!employeeId) return;
        const { data, error } = await apiFetch<Employee>(`/employees/${employeeId}`);
        setEmployee(data);
        setLoadError(error);
    }, [employeeId]);

    useEffect(() => {
        if (!employeeId) return;
        let isLeftPage = false;
        apiFetch<Employee>(`/employees/${employeeId}`).then(({ data, error }) => {
            if (isLeftPage) return;
            setEmployee(data);
            setLoadError(error);
        });
        return () => {
            isLeftPage = true;
        };
    }, [employeeId]);

    if (!employeeId)
        return (
            <StatusBanner tone="error" title="ไม่พบพนักงานนี้">
                กลับไปเลือกจากหน้ารายการ
            </StatusBanner>
        );
    if (loadError)
        return (
            <StatusBanner tone="error" title="โหลดข้อมูลพนักงานไม่สำเร็จ">
                {loadError.message}
            </StatusBanner>
        );
    if (!employee) return <PageSkeleton />;

    async function runPendingAction() {
        if (!employee || !pendingAction) return;
        setIsWorking(true);
        const { error } =
            pendingAction === "delete"
                ? await apiFetch(`/employees/${employee.emp_id}`, { method: "DELETE" })
                : await apiFetch(`/employees/${employee.emp_id}/reinstate`, { method: "POST" });
        setIsWorking(false);
        if (error) {
            setActionError(error.message);
            return;
        }
        setPendingAction(null);
        setActionError(null);
        if (pendingAction === "delete") {
            toast.success("ลบพนักงานแล้ว");
            router.push("/people/employees");
            return;
        }
        toast.success("ยกเลิกการพ้นสภาพแล้ว");
        await reload();
    }

    const status = EMPLOYMENT_STATUS[employee.employment_status];
    const fullName = `${employee.emp_title ?? ""}${employee.emp_first_name_th} ${employee.emp_last_name_th}`;

    return (
        <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-6">
            <PageHeader
                eyebrow="บุคคล · พนักงาน"
                title={fullName}
                description={
                    <span className="flex flex-wrap items-center gap-2">
                        <StatusPill tone={status.tone}>{status.label}</StatusPill>
                        <span>
                            {employee.emp_code}
                            {employee.emp_position ? ` · ${employee.emp_position}` : ""}
                        </span>
                    </span>
                }
                actions={
                    <>
                        <Link
                            href={`/people/employees/edit?id=${employee.emp_id}`}
                            className={buttonClass("secondary", "md")}
                        >
                            <Pencil size={16} />
                            แก้ไขข้อมูล
                        </Link>
                        {employee.emp_termination_date ? (
                            <button
                                type="button"
                                className={buttonClass("secondary", "md")}
                                onClick={() => setPendingAction("reinstate")}
                            >
                                <RotateCcw size={16} />
                                ยกเลิกการพ้นสภาพ
                            </button>
                        ) : (
                            <button
                                type="button"
                                className={buttonClass("secondary", "md")}
                                onClick={() => setIsTerminating(true)}
                            >
                                <UserX size={16} />
                                ตั้งพ้นสภาพ
                            </button>
                        )}
                        <button
                            type="button"
                            className={buttonClass("ghost", "md")}
                            onClick={() => setPendingAction("delete")}
                        >
                            <Trash2 size={16} />
                            ลบ
                        </button>
                    </>
                }
            />

            <EmployeeSummaryCard employee={employee} />
            <CompensationCard employee={employee} onChanged={reload} />
            <RecurringItemsCard employee={employee} onChanged={reload} />
            <LeaveBalanceCard employeeId={employee.emp_id} currentYear={currentYearBangkok()} />

            {isTerminating && (
                <TerminateDialog
                    employee={employee}
                    open={isTerminating}
                    onClose={async (saved) => {
                        setIsTerminating(false);
                        if (saved) await reload();
                    }}
                />
            )}
            <ConfirmDialog
                open={pendingAction !== null}
                title={pendingAction === "delete" ? "ลบพนักงานนี้?" : "ยกเลิกการพ้นสภาพ?"}
                description={pendingAction === "delete" ? EMPLOYEE_MESSAGES.delete : EMPLOYEE_MESSAGES.reinstate}
                confirmLabel={pendingAction === "delete" ? "ลบพนักงาน" : "ยกเลิกการพ้นสภาพ"}
                variant={pendingAction === "delete" ? "danger" : "warning"}
                loading={isWorking}
                errorMessage={actionError}
                onConfirm={runPendingAction}
                onCancel={() => {
                    setPendingAction(null);
                    setActionError(null);
                }}
            />
        </div>
    );
}
