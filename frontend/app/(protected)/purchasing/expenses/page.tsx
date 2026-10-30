"use client";

// รายการค่าใช้จ่าย / บิลผู้ขาย (2026-10-16 เฟส 2 ขั้น 2-2) — แท็บตามสถานะ + รอจ่าย/เกินกำหนด · ค้นหาเลข/เรื่อง/ผู้ขาย/เลขเอกสารผู้ขาย
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, Plus } from "lucide-react";
import DataTable, { type Column } from "@/components/ui/datatable/datatable";
import PageHeader from "@/components/ui/page-header";
import Segmented from "@/components/ui/segmented";
import StatusPill from "@/components/ui/status-pill";
import { buttonClass } from "@/components/ui/button";
import { usePermission, BITS } from "@/app/components/permission-provider";
import { formatDateOnly } from "@/app/function";
import { apiFetch } from "@/lib/api";
import { formatAmount } from "@/lib/shared/money.mjs";
import { EXPENSE_MESSAGES, STATUS_LABELS, expenseDueLabel, expenseNumberLabel } from "./_messages";
import type { ExpenseListRow } from "./_types";

type TabKey = "all" | "unpaid" | "overdue" | "paid" | "waiting_me" | "draft" | "pending_approval" | "cancelled";

const TABS: { value: TabKey; label: string }[] = [
    { value: "all", label: "ทั้งหมด" },
    { value: "unpaid", label: "รอจ่าย" },
    { value: "overdue", label: "เกินกำหนด" },
    { value: "paid", label: "จ่ายแล้ว" },
    { value: "waiting_me", label: "รอคุณอนุมัติ" },
    { value: "draft", label: "ร่าง" },
    { value: "pending_approval", label: "รออนุมัติ" },
    { value: "cancelled", label: "ยกเลิก" },
];

const EMPTY_MESSAGES: Partial<Record<TabKey, string>> = {
    waiting_me: "ไม่มีรายการที่รอคุณอนุมัติ",
    overdue: "ไม่มีรายการที่เกินกำหนดจ่าย",
    unpaid: "ไม่มีรายการที่รอจ่าย",
    paid: "ยังไม่มีรายการที่จ่ายแล้ว",
};

export default function ExpensesPage() {
    const router = useRouter();
    const hasBit = usePermission();
    const canCreate = hasBit(BITS.createExpense);
    const [tab, setTab] = useState<TabKey>("all");
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [rows, setRows] = useState<ExpenseListRow[]>([]);
    const [total, setTotal] = useState(0);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let isLeftPage = false;
        const query = new URLSearchParams({
            tab,
            search,
            limit: String(pageSize),
            offset: String((page - 1) * pageSize),
        });
        apiFetch<{ data: ExpenseListRow[]; total: number }>(`/expenses?${query}`).then(({ data }) => {
            if (isLeftPage) return;
            setRows(data?.data ?? []);
            setTotal(data?.total ?? 0);
            setIsLoading(false);
        });
        return () => {
            isLeftPage = true;
        };
    }, [tab, search, page, pageSize]);

    const columns: Column<ExpenseListRow>[] = [
        {
            key: "ex_number",
            header: "เลขที่ / เรื่อง",
            render: (_, row) => (
                <button
                    type="button"
                    className="grid min-w-0 gap-0.5 text-left"
                    onClick={() => router.push(`/purchasing/expenses/view?id=${row.ex_id}`)}
                >
                    <span className="text-xs text-gray-500 tabular-nums">{expenseNumberLabel(row)}</span>
                    <span className="font-medium text-gray-800 hover:text-blue-600">{row.ex_title}</span>
                </button>
            ),
        },
        {
            key: "vd_name",
            mobile: "meta",
            header: "ผู้ขาย",
            render: (_, row) => (
                <div className="grid min-w-0 gap-0.5">
                    <span>{row.vd_name ?? "-"}</span>
                    <span className="flex items-center gap-1 text-xs text-gray-500">
                        {row.ex_vendor_doc_no ? `เอกสาร ${row.ex_vendor_doc_no}` : "ไม่มีเลขเอกสาร"}
                        {row.attachment_count > 0 && (
                            <>
                                {" · "}
                                <Paperclip size={12} aria-hidden />
                                {row.attachment_count}
                            </>
                        )}
                    </span>
                </div>
            ),
        },
        {
            key: "ex_total",
            mobile: "trailing",
            header: "ยอดรวม",
            className: "text-right tabular-nums",
            render: (_, row) => (
                <div className="grid gap-0.5">
                    <span>
                        {formatAmount(row.ex_total)} {row.ex_currency}
                    </span>
                    {row.ex_currency !== "THB" && (
                        <span className="text-xs text-gray-500">≈ {formatAmount(row.ex_total_thb)} บาท</span>
                    )}
                </div>
            ),
        },
        {
            key: "ex_status",
            mobile: "badge",
            header: "สถานะ",
            render: (_, row) => {
                const due = expenseDueLabel(row);
                return (
                    <div className="flex flex-wrap items-center gap-1.5">
                        <StatusPill tone={STATUS_LABELS[row.ex_status].tone}>
                            {STATUS_LABELS[row.ex_status].label}
                            {row.ex_status === "pending_approval" && row.ex_approval_current_level
                                ? ` ชั้น ${row.ex_approval_current_level}/${row.approval_level_count}`
                                : ""}
                        </StatusPill>
                        {row.ex_status === "draft" && row.ex_returned_reason && (
                            <StatusPill tone="wait">ถูกตีกลับ</StatusPill>
                        )}
                        {row.payment_state === "paid" && <StatusPill tone="success">จ่ายแล้ว</StatusPill>}
                        {row.payment_state === "partial" && <StatusPill tone="wait">จ่ายบางส่วน</StatusPill>}
                        {due && <StatusPill tone={row.is_overdue ? "danger" : "neutral"}>{due}</StatusPill>}
                        {row.waiting_for_me && <StatusPill tone="wait">รอคุณอนุมัติ</StatusPill>}
                    </div>
                );
            },
        },
        {
            key: "ex_expense_date",
            mobile: "meta",
            header: "วันที่ / ครบกำหนด",
            render: (_, row) => (
                <div className="grid gap-0.5 text-sm">
                    <span>{formatDateOnly(row.ex_expense_date)}</span>
                    <span className={`text-xs ${row.is_overdue ? "text-red-600" : "text-gray-500"}`}>
                        ครบกำหนด {formatDateOnly(row.ex_due_date)}
                    </span>
                </div>
            ),
        },
    ];

    return (
        <div className="grid grid-cols-1 gap-6">
            <PageHeader
                eyebrow="จัดซื้อ"
                title="ค่าใช้จ่าย / บิลผู้ขาย"
                description={EXPENSE_MESSAGES.listDescription}
                actions={
                    canCreate && (
                        <button
                            type="button"
                            className={buttonClass("primary", "md")}
                            onClick={() => router.push("/purchasing/expenses/new")}
                        >
                            <Plus size={16} />
                            บันทึกค่าใช้จ่าย
                        </button>
                    )
                }
            />
            <Segmented<TabKey>
                label="กรองตามสถานะ"
                value={tab}
                onChange={(value) => {
                    setTab(value);
                    setPage(1);
                }}
                options={TABS}
            />
            <DataTable
                columns={columns}
                data={rows}
                rowKey="ex_id"
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
                searchPlaceholder="ค้นหาเลขที่ เรื่อง ผู้ขาย หรือเลขเอกสารผู้ขาย..."
                searchValue={search}
                onSearch={(value) => {
                    setSearch(value);
                    setPage(1);
                }}
                emptyMessage={EMPTY_MESSAGES[tab] ?? "ยังไม่มีค่าใช้จ่ายในแท็บนี้"}
            />
        </div>
    );
}
