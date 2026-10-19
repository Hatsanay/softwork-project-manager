"use client";

// หน้าพนักงาน (2026-10-17 เฟส 4 ขั้น 4-1) — ข้อมูล · เงินเดือนตามวันที่มีผล · รายการประจำ · พ้นสภาพ/ยกเลิก · ลบ
// + รหัสพนักงาน/ย้ายแผนก และบัตรพนักงาน (2026-10-18)
// + ส่วนหัวแบบโปรไฟล์ + แท็บ (2026-10-19 docs/plans/2026-10-19-people-ux-redesign.md ข้อ 2.3) · แท็บอยู่ใน URL ?tab=
// เปิดหน้านี้ = เปิดดูเงินเดือนและเลขประจำตัว → backend บันทึก audit ทุกครั้ง (R-H1/R-H8)
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Pencil, RotateCcw, Trash2, UserX } from "lucide-react";
import Segmented from "@/components/ui/segmented";
import StatusPill from "@/components/ui/status-pill";
import StatusBanner from "@/components/ui/guidance/status-banner";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { PageSkeleton } from "@/components/ui/skeleton";
import { buttonClass } from "@/components/ui/button";
import { apiFetch, uploadedFileUrl, type ApiError } from "@/lib/api";
import { CARD_CLASS } from "@/components/ui/card";
import { EMPLOYEE_MESSAGES, EMPLOYMENT_STATUS } from "../../_messages";
import type { Employee } from "../../_types";
import EmployeeSummaryCard from "./_components/employee-summary-card";
import EmployeeCodeCard from "./_components/employee-code-card";
import EmployeeCardsCard from "./_components/employee-cards-card";
import CompensationCard from "./_components/compensation-card";
import RecurringItemsCard from "./_components/recurring-items-card";
import LeaveBalanceCard from "./_components/leave-balance-card";
import TaxProfileCard from "./_components/tax-profile-card";
import TerminateDialog from "./_components/terminate-dialog";
import { nameInitial } from "../_card-status";

type PendingAction = "delete" | "reinstate" | null;

type Tab = "overview" | "salary" | "leave" | "tax" | "code";

const TABS: { value: Tab; label: string }[] = [
    { value: "overview", label: "ภาพรวม" },
    { value: "salary", label: "เงินเดือน" },
    { value: "leave", label: "วันลา" },
    { value: "tax", label: "ภาษี" },
    { value: "code", label: "รหัสและบัตร" },
];

// ปีปัจจุบันตามเวลาไทย (ไม่ใช่เขตเวลาเครื่องผู้ใช้)
function currentYearBangkok() {
    return Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric" }).format(new Date()));
}

export default function EmployeeViewPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const employeeId = searchParams.get("id");
    const requestedTab = searchParams.get("tab") as Tab | null;
    const tab: Tab = requestedTab && TABS.some((item) => item.value === requestedTab) ? requestedTab : "overview";
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

    // เปลี่ยนแท็บ = เปลี่ยน URL (กดย้อนกลับได้ · ส่งลิงก์แท็บให้คนอื่นได้) ไม่เลื่อนหน้า
    function changeTab(nextTab: Tab) {
        router.replace(`/people/employees/view?id=${employeeId}&tab=${nextTab}`, { scroll: false });
    }

    const photoUrl = employee.emp_photo_url ?? employee.user_avatar_url;
    const subtitle = [employee.emp_position, employee.department_name, employee.branch_name].filter(Boolean).join(" · ");

    return (
        <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-5">
            <section className={`grid gap-4 p-5 sm:p-6 ${CARD_CLASS}`}>
                <div className="flex flex-wrap items-start gap-4">
                    <span className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-linear-to-br from-blue-50 to-blue-100 text-3xl font-medium text-blue-600">
                        {photoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={uploadedFileUrl(photoUrl)} alt="" className="h-full w-full object-cover" />
                        ) : (
                            nameInitial(employee.emp_first_name_th)
                        )}
                    </span>
                    <div className="grid min-w-0 flex-1 basis-56 gap-1">
                        <p className="text-xs text-blue-600">บุคคล · พนักงาน</p>
                        <h1 className="text-2xl font-medium text-gray-900">
                            {fullName}
                            {employee.emp_nickname && <span className="font-normal text-gray-500"> ({employee.emp_nickname})</span>}
                        </h1>
                        <p className="text-sm text-gray-600">{subtitle || "-"}</p>
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                            <StatusPill tone={status.tone}>{status.label}</StatusPill>
                            <span className="text-sm tracking-wide text-gray-500 tabular-nums">{employee.emp_code}</span>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Link href={`/people/employees/edit?id=${employee.emp_id}`} className={buttonClass("secondary", "md")}>
                            <Pencil size={16} />
                            แก้ไขข้อมูล
                        </Link>
                        {employee.emp_termination_date ? (
                            <button type="button" className={buttonClass("secondary", "md")} onClick={() => setPendingAction("reinstate")}>
                                <RotateCcw size={16} />
                                ยกเลิกการพ้นสภาพ
                            </button>
                        ) : (
                            <button type="button" className={buttonClass("secondary", "md")} onClick={() => setIsTerminating(true)}>
                                <UserX size={16} />
                                ตั้งพ้นสภาพ
                            </button>
                        )}
                        <button type="button" className={buttonClass("ghost", "md")} onClick={() => setPendingAction("delete")}>
                            <Trash2 size={16} />
                            ลบ
                        </button>
                    </div>
                </div>
            </section>

            <Segmented<Tab> label="ข้อมูลพนักงาน" role="tablist" idPrefix="employee" value={tab} onChange={changeTab} options={TABS} />

            <div role="tabpanel" id={`employee-panel-${tab}`} aria-labelledby={`employee-tab-${tab}`} className="grid gap-5">
                {tab === "overview" && <EmployeeSummaryCard employee={employee} onChanged={reload} />}
                {tab === "salary" && (
                    <>
                        <CompensationCard employee={employee} onChanged={reload} />
                        <RecurringItemsCard employee={employee} onChanged={reload} />
                    </>
                )}
                {tab === "leave" && <LeaveBalanceCard employeeId={employee.emp_id} currentYear={currentYearBangkok()} />}
                {tab === "tax" && <TaxProfileCard employeeId={employee.emp_id} currentYear={currentYearBangkok()} />}
                {tab === "code" && (
                    <>
                        <EmployeeCodeCard employee={employee} onChanged={reload} />
                        <EmployeeCardsCard employee={employee} onChanged={reload} />
                    </>
                )}
            </div>

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
