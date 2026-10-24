"use client";

// รายการพนักงาน (2026-10-17 เฟส 4 ขั้น 4-1) — ค้นหารหัส (รวมรหัสเก่า) ชื่อ ชื่อเล่น ตำแหน่ง · เรียงตามรหัส = จัดกลุ่มสาขา/แผนกเอง
// U-3 (2026-10-23): รูป/ตัวอักษรย่อ · ชิปสถานะ + ชิปแผนก · คิวบัตรเป็นแถบลิงก์พร้อมจำนวน (คง ?tab=pending_print ฯลฯ ไว้ ลิงก์เดิมใช้ได้)
// เลขประจำตัวประชาชนแสดงแบบปิดบางส่วน (R-H8) · เงินเดือนดูได้ในหน้าพนักงาน (บันทึกการเปิดทุกครั้ง)
import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CreditCard, Plus } from "lucide-react";
import DataTable, { type Column } from "@/components/ui/datatable/datatable";
import PageHeader from "@/components/ui/page-header";
import HowItWorks from "@/components/ui/guidance/how-it-works";
import Segmented from "@/components/ui/segmented";
import { PageSkeleton } from "@/components/ui/skeleton";
import StatusPill from "@/components/ui/status-pill";
import { buttonClass } from "@/components/ui/button";
import { formatDateOnly } from "@/app/function";
import { apiFetch, uploadedFileUrl } from "@/lib/api";
import { EMPLOYEE_MESSAGES, EMPLOYMENT_STATUS } from "../_messages";
import type { CardQueueRow, EmployeeFormOptions, EmployeeListRow } from "../_types";
import CardQueue, { type CardQueueKind } from "./_components/card-queue";
import { nameInitial } from "./_card-status";

type StatusTab = "employed" | "terminated" | "all";
type Tab = StatusTab | CardQueueKind;

const STATUS_TABS: StatusTab[] = ["employed", "terminated", "all"];
const CARD_QUEUE_KINDS: CardQueueKind[] = ["pending_print", "not_returned", "expiring"];
const CARD_QUEUE_LABEL: Record<CardQueueKind, string> = {
    pending_print: "รอพิมพ์",
    not_returned: "ยังไม่ได้คืน",
    expiring: "ใกล้หมดอายุ",
};
const ALL_DEPARTMENTS = "all";

function isCardTab(tab: Tab): tab is CardQueueKind {
    return CARD_QUEUE_KINDS.includes(tab as CardQueueKind);
}

function fullName(row: EmployeeListRow) {
    const nickname = row.emp_nickname ? ` (${row.emp_nickname})` : "";
    return `${row.emp_title ?? ""}${row.emp_first_name_th} ${row.emp_last_name_th}${nickname}`;
}

// ชื่อแผนกบนชิป — ชื่อซ้ำกันคนละสาขา ต่อท้ายชื่อสาขาให้แยกออก
function departmentLabel(
    department: EmployeeFormOptions["departments"][number],
    departments: EmployeeFormOptions["departments"],
) {
    const sameNameCount = departments.filter((other) => other.dep_name === department.dep_name).length;
    return sameNameCount > 1 ? `${department.dep_name} (${department.branch_name_th})` : department.dep_name;
}

// โหลดทุกคิวบัตรพร้อมกัน (จำนวนบนแถบลิงก์)
async function fetchCardQueues() {
    const results = await Promise.all(
        CARD_QUEUE_KINDS.map((kind) => apiFetch<{ data: CardQueueRow[] }>(`/employee-cards?kind=${kind}`)),
    );
    return {
        pending_print: results[0].data?.data ?? [],
        not_returned: results[1].data?.data ?? [],
        expiring: results[2].data?.data ?? [],
    };
}

// ?tab= เปิดสถานะ/คิวบัตรตรงๆ (ลิงก์จากภาพรวมบุคคล) · useSearchParams ต้องอยู่ใน Suspense (Next.js 16)
export default function EmployeesPage() {
    return (
        <Suspense fallback={<PageSkeleton />}>
            <EmployeesContent />
        </Suspense>
    );
}

function EmployeesContent() {
    const router = useRouter();
    const requestedTab = useSearchParams().get("tab") as Tab | null;
    const isKnownTab = requestedTab && [...STATUS_TABS, ...CARD_QUEUE_KINDS].includes(requestedTab);
    const tab: Tab = isKnownTab ? requestedTab : "employed";
    const [cardQueues, setCardQueues] = useState<Record<CardQueueKind, CardQueueRow[] | null>>({
        pending_print: null,
        not_returned: null,
        expiring: null,
    });
    const [departments, setDepartments] = useState<EmployeeFormOptions["departments"]>([]);
    const [departmentId, setDepartmentId] = useState(ALL_DEPARTMENTS);
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [rows, setRows] = useState<EmployeeListRow[]>([]);
    const [total, setTotal] = useState(0);
    const [isLoading, setIsLoading] = useState(true);

    const loadCardQueues = useCallback(async () => {
        setCardQueues(await fetchCardQueues());
    }, []);

    // คิวบัตร (จำนวนบนแถบ) + แผนก (ชิปตัวกรอง) โหลดครั้งเดียว
    useEffect(() => {
        let isLeftPage = false;
        fetchCardQueues().then((queues) => {
            if (!isLeftPage) setCardQueues(queues);
        });
        apiFetch<EmployeeFormOptions>("/employees/form-options").then(({ data }) => {
            if (!isLeftPage) setDepartments(data?.departments.filter((department) => department.dep_status === "active") ?? []);
        });
        return () => {
            isLeftPage = true;
        };
    }, []);

    useEffect(() => {
        if (isCardTab(tab)) return;
        let isLeftPage = false;
        const query = new URLSearchParams({
            search,
            status: tab,
            limit: String(pageSize),
            offset: String((page - 1) * pageSize),
        });
        if (departmentId !== ALL_DEPARTMENTS) query.set("department_id", departmentId);
        apiFetch<{ data: EmployeeListRow[]; total: number }>(`/employees?${query}`).then(({ data }) => {
            if (isLeftPage) return;
            setRows(data?.data ?? []);
            setTotal(data?.total ?? 0);
            setIsLoading(false);
        });
        return () => {
            isLeftPage = true;
        };
    }, [tab, search, page, pageSize, departmentId]);

    // เปลี่ยนสถานะ/คิว = เปลี่ยน URL (กดย้อนกลับได้ · ส่งลิงก์ให้คนอื่นได้)
    function changeTab(nextTab: Tab) {
        router.replace(`/people/employees?tab=${nextTab}`, { scroll: false });
        setPage(1);
    }

    const columns: Column<EmployeeListRow>[] = [
        {
            key: "emp_first_name_th",
            header: "พนักงาน",
            render: (_, row) => (
                <Link
                    href={`/people/employees/view?id=${row.emp_id}`}
                    className="-my-2 flex min-w-0 items-center gap-3 py-2 text-left"
                >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-linear-to-br from-blue-50 to-blue-100 text-base font-medium text-blue-600">
                        {row.photo_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={uploadedFileUrl(row.photo_url)} alt="" className="h-full w-full object-cover" />
                        ) : (
                            nameInitial(row.emp_first_name_th)
                        )}
                    </span>
                    <span className="grid min-w-0 gap-0.5">
                        <span className="font-medium text-gray-800 hover:text-blue-600">{fullName(row)}</span>
                        <span className="text-xs tracking-wide break-all text-gray-500 tabular-nums">{row.emp_code}</span>
                    </span>
                </Link>
            ),
        },
        {
            key: "emp_position",
            header: "แผนก / ตำแหน่ง",
            render: (_, row) => (
                <div className="grid gap-0.5 text-sm">
                    <span>{row.department_name ?? "-"}</span>
                    <span className="text-xs text-gray-500">{row.emp_position ?? ""}</span>
                </div>
            ),
        },
        {
            key: "emp_hire_date",
            header: "ช่วงทำงาน",
            render: (_, row) => (
                <div className="grid gap-0.5 text-sm tabular-nums">
                    <span>เริ่ม {formatDateOnly(row.emp_hire_date)}</span>
                    {row.emp_termination_date && (
                        <span className="text-xs text-gray-500">
                            วันสุดท้าย {formatDateOnly(row.emp_termination_date)}
                        </span>
                    )}
                </div>
            ),
        },
        {
            key: "user_username",
            header: "บัญชี / เลขประจำตัว",
            render: (_, row) => (
                <div className="grid gap-0.5 text-sm">
                    {row.user_username ? (
                        <span>{row.user_username}</span>
                    ) : (
                        <span className="text-xs text-gray-400">ไม่มีบัญชี</span>
                    )}
                    <span className="text-xs text-gray-500 tabular-nums">
                        {row.national_id_masked ?? "ยังไม่มีเลขประจำตัว"}
                    </span>
                </div>
            ),
        },
        {
            key: "employment_status",
            header: "สถานะ",
            render: (_, row) => (
                <StatusPill tone={EMPLOYMENT_STATUS[row.employment_status].tone}>
                    {EMPLOYMENT_STATUS[row.employment_status].label}
                </StatusPill>
            ),
        },
    ];

    const cardQueueLinks = (
        <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="inline-flex items-center gap-1.5 text-gray-500">
                <CreditCard size={15} aria-hidden="true" />
                บัตรพนักงาน
            </span>
            {CARD_QUEUE_KINDS.map((kind) => {
                const count = cardQueues[kind]?.length;
                const isSelected = tab === kind;
                return (
                    <button
                        key={kind}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => changeTab(kind)}
                        className={`inline-flex min-h-9 items-center gap-1.5 rounded-xl border px-3 transition ${
                            isSelected
                                ? "border-blue-500 bg-blue-50 text-blue-700"
                                : "border-gray-200 bg-white text-gray-700 hover:border-blue-200"
                        }`}
                    >
                        {CARD_QUEUE_LABEL[kind]}
                        {count !== undefined && (
                            <span className={`tabular-nums ${count > 0 ? "font-medium text-blue-600" : "text-gray-400"}`}>
                                {count}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );

    return (
        <div className="grid grid-cols-1 gap-5">
            <PageHeader
                eyebrow="บุคคล"
                title="พนักงาน"
                description={EMPLOYEE_MESSAGES.listDescription}
                actions={
                    <Link href="/people/employees/new" className={buttonClass("primary", "md")}>
                        <Plus size={16} />
                        เพิ่มพนักงาน
                    </Link>
                }
            />
            <HowItWorks label="ใครเห็นข้อมูลนี้">{EMPLOYEE_MESSAGES.listPrivacy}</HowItWorks>
            {cardQueueLinks}

            {isCardTab(tab) ? (
                <>
                    <button
                        type="button"
                        className="-my-1 inline-flex w-fit items-center gap-1 py-1 text-sm text-blue-600 hover:underline"
                        onClick={() => changeTab("employed")}
                    >
                        <ArrowLeft size={15} />
                        กลับไปรายชื่อพนักงาน
                    </button>
                    <CardQueue kind={tab} rows={cardQueues[tab]} onChanged={loadCardQueues} />
                </>
            ) : (
                <>
                    <div className="grid gap-2">
                        <Segmented<StatusTab>
                            label="สถานะ"
                            value={tab}
                            onChange={changeTab}
                            options={[
                                { value: "employed", label: "ทำงานอยู่" },
                                { value: "terminated", label: "พ้นสภาพ" },
                                { value: "all", label: "ทั้งหมด" },
                            ]}
                        />
                        {departments.length > 1 && (
                            <Segmented<string>
                                label="แผนก"
                                value={departmentId}
                                onChange={(value) => {
                                    setDepartmentId(value);
                                    setPage(1);
                                }}
                                options={[
                                    { value: ALL_DEPARTMENTS, label: "ทุกแผนก" },
                                    ...departments.map((department) => ({
                                        value: department.dep_id,
                                        label: departmentLabel(department, departments),
                                    })),
                                ]}
                            />
                        )}
                    </div>
                    <DataTable
                        columns={columns}
                        data={rows}
                        rowKey="emp_id"
                        loading={isLoading}
                        total={total}
                        page={page}
                        pageSize={pageSize}
                        onPageChange={setPage}
                        onPageSizeChange={(size) => {
                            setPageSize(size);
                            setPage(1);
                        }}
                        searchable
                        searchPlaceholder="ค้นหารหัส (รวมรหัสเก่า) ชื่อ ชื่อเล่น หรือตำแหน่ง..."
                        searchValue={search}
                        onSearch={(value) => {
                            setSearch(value);
                            setPage(1);
                        }}
                        emptyMessage={
                            tab === "terminated" ? "ยังไม่มีพนักงานที่พ้นสภาพ" : 'ยังไม่มีพนักงาน · กด "เพิ่มพนักงาน"'
                        }
                    />
                </>
            )}
        </div>
    );
}
