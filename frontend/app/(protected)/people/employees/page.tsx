"use client";

// รายการพนักงาน (2026-10-17 เฟส 4 ขั้น 4-1) — แท็บ ทำงานอยู่/พ้นสภาพ · ค้นหารหัส ชื่อ ชื่อเล่น ตำแหน่ง
// + แท็บคิวบัตร "บัตรรอพิมพ์" / "บัตรที่ยังไม่ได้คืน" · ค้นด้วยรหัสเก่าก็เจอ · เรียงตามรหัส = จัดกลุ่มสาขา/แผนกเอง (2026-10-18)
// เลขประจำตัวประชาชนแสดงแบบปิดบางส่วน (R-H8) · เงินเดือนดูได้ในหน้าพนักงาน (บันทึกการเปิดทุกครั้ง)
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import DataTable, { type Column } from "@/components/ui/datatable/datatable";
import PageHeader from "@/components/ui/page-header";
import Segmented from "@/components/ui/segmented";
import StatusPill from "@/components/ui/status-pill";
import { buttonClass } from "@/components/ui/button";
import { formatDateOnly } from "@/app/function";
import { apiFetch } from "@/lib/api";
import { EMPLOYEE_MESSAGES, EMPLOYMENT_STATUS } from "../_messages";
import type { CardQueueRow, EmployeeListRow } from "../_types";
import CardQueue, { type CardQueueKind } from "./_components/card-queue";

type StatusTab = "employed" | "terminated" | "all";
type Tab = StatusTab | CardQueueKind;

function isCardTab(tab: Tab): tab is CardQueueKind {
    return tab === "pending_print" || tab === "not_returned" || tab === "expiring";
}

function fullName(row: EmployeeListRow) {
    const nickname = row.emp_nickname ? ` (${row.emp_nickname})` : "";
    return `${row.emp_title ?? ""}${row.emp_first_name_th} ${row.emp_last_name_th}${nickname}`;
}

const CARD_QUEUE_KINDS: CardQueueKind[] = ["pending_print", "not_returned", "expiring"];

// โหลดทุกคิวบัตรพร้อมกัน (จำนวนบนแท็บ)
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

export default function EmployeesPage() {
    const [tab, setTab] = useState<Tab>("employed");
    const [cardQueues, setCardQueues] = useState<Record<CardQueueKind, CardQueueRow[] | null>>({
        pending_print: null,
        not_returned: null,
        expiring: null,
    });
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [rows, setRows] = useState<EmployeeListRow[]>([]);
    const [total, setTotal] = useState(0);
    const [isLoading, setIsLoading] = useState(true);

    // โหลดทั้งสองคิวเพื่อแสดงจำนวนบนแท็บ (งานค้างเห็นได้โดยไม่ต้องกดเข้าไป)
    const loadCardQueues = useCallback(async () => {
        setCardQueues(await fetchCardQueues());
    }, []);

    useEffect(() => {
        let isLeftPage = false;
        fetchCardQueues().then((queues) => {
            if (isLeftPage) return;
            setCardQueues(queues);
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
        apiFetch<{ data: EmployeeListRow[]; total: number }>(`/employees?${query}`).then(({ data }) => {
            if (isLeftPage) return;
            setRows(data?.data ?? []);
            setTotal(data?.total ?? 0);
            setIsLoading(false);
        });
        return () => {
            isLeftPage = true;
        };
    }, [tab, search, page, pageSize]);

    const columns: Column<EmployeeListRow>[] = [
        {
            key: "emp_first_name_th",
            header: "พนักงาน",
            render: (_, row) => (
                <Link
                    href={`/people/employees/view?id=${row.emp_id}`}
                    className="-my-2 grid min-w-0 gap-0.5 py-2 text-left"
                >
                    <span className="font-medium text-gray-800 hover:text-blue-600">{fullName(row)}</span>
                    <span className="text-xs tracking-wide break-all text-gray-500 tabular-nums">{row.emp_code}</span>
                    <span className="text-xs text-gray-500 tabular-nums">
                        {row.national_id_masked ?? "ยังไม่มีเลขประจำตัว"}
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
            header: "บัญชีผู้ใช้",
            render: (_, row) =>
                row.user_username ? (
                    <span className="text-sm">{row.user_username}</span>
                ) : (
                    <span className="text-xs text-gray-400">ไม่ได้ผูก</span>
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

    return (
        <div className="grid grid-cols-1 gap-6">
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
            <Segmented<Tab>
                label="สถานะ"
                value={tab}
                onChange={(value) => {
                    setTab(value);
                    setPage(1);
                }}
                options={[
                    { value: "employed", label: "ทำงานอยู่" },
                    { value: "terminated", label: "พ้นสภาพ" },
                    { value: "all", label: "ทั้งหมด" },
                    { value: "pending_print", label: "บัตรรอพิมพ์", count: cardQueues.pending_print?.length },
                    { value: "not_returned", label: "บัตรที่ยังไม่ได้คืน", count: cardQueues.not_returned?.length },
                    { value: "expiring", label: "บัตรใกล้หมดอายุ", count: cardQueues.expiring?.length },
                ]}
            />
            {isCardTab(tab) ? (
                <CardQueue kind={tab} rows={cardQueues[tab]} onChanged={loadCardQueues} />
            ) : (
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
            )}
        </div>
    );
}
