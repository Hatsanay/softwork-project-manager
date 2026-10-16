"use client";

// ใบเบิกเงินพนักงาน (ขั้น 2-3) — "ของฉัน" สำหรับทุกคน · "ทั้งหมด" สำหรับผู้มีสิทธิ์ดู/อนุมัติค่าใช้จ่ายหรือทำจ่าย
// มือถือเป็นหลัก: ปุ่มเบิกเงินอยู่บนสุด · ตารางกลายเป็นการ์ดบนจอเล็ก (DataTable)
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Paperclip } from "lucide-react";
import DataTable, { type Column } from "@/components/ui/datatable/datatable";
import PageHeader from "@/components/ui/page-header";
import Segmented from "@/components/ui/segmented";
import StatusPill from "@/components/ui/status-pill";
import FieldHint from "@/components/ui/guidance/field-hint";
import { buttonClass } from "@/components/ui/button";
import { usePermission, BITS } from "@/app/components/permission-provider";
import { formatDateOnly } from "@/app/function";
import { apiFetch } from "@/lib/api";
import { formatAmount } from "@/lib/shared/money.mjs";
import { STATUS_LABELS, expenseNumberLabel } from "../expenses/_messages";
import type { ExpenseListRow } from "../expenses/_types";
import { CLAIM_MESSAGES } from "./_messages";

type Scope = "mine" | "all";
type TabKey = "all" | "draft" | "pending_approval" | "waiting_me" | "unpaid" | "paid" | "cancelled";

const TABS: { value: TabKey; label: string }[] = [
    { value: "all", label: "ทั้งหมด" },
    { value: "draft", label: "ร่าง" },
    { value: "pending_approval", label: "รออนุมัติ" },
    { value: "unpaid", label: "รอรับเงินคืน" },
    { value: "paid", label: "ได้รับเงินแล้ว" },
    { value: "cancelled", label: "ยกเลิก" },
];

const EMPTY_MESSAGES: Partial<Record<TabKey, string>> = {
    all: 'ยังไม่มีใบเบิก — กด "เบิกเงิน" แล้วถ่ายรูปใบเสร็จได้เลย',
    waiting_me: "ไม่มีใบเบิกที่รอคุณอนุมัติ",
    unpaid: "ไม่มีใบเบิกที่รอรับเงินคืน",
};

export default function ClaimsPage() {
    const router = useRouter();
    const hasBit = usePermission();
    const canViewAll = hasBit(BITS.viewExpenses) || hasBit(BITS.approveExpense) || hasBit(BITS.makePayment);
    const canApprove = hasBit(BITS.approveExpense);
    const [scope, setScope] = useState<Scope>("mine");
    const [tab, setTab] = useState<TabKey>("all");
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [rows, setRows] = useState<ExpenseListRow[]>([]);
    const [total, setTotal] = useState(0);
    const [isLoading, setIsLoading] = useState(true);

    const tabs =
        canApprove && scope === "all"
            ? [...TABS.slice(0, 3), { value: "waiting_me" as const, label: "รอคุณอนุมัติ" }, ...TABS.slice(3)]
            : TABS;

    useEffect(() => {
        let isLeftPage = false;
        const query = new URLSearchParams({
            scope,
            tab,
            search,
            limit: String(pageSize),
            offset: String((page - 1) * pageSize),
        });
        apiFetch<{ data: ExpenseListRow[]; total: number }>(`/claims?${query}`).then(({ data }) => {
            if (isLeftPage) return;
            setRows(data?.data ?? []);
            setTotal(data?.total ?? 0);
            setIsLoading(false);
        });
        return () => {
            isLeftPage = true;
        };
    }, [scope, tab, search, page, pageSize]);

    const columns: Column<ExpenseListRow>[] = [
        {
            key: "ex_number",
            header: "เลขที่ / เรื่อง",
            render: (_, row) => (
                <button
                    type="button"
                    className="grid min-w-0 gap-0.5 text-left"
                    onClick={() => router.push(`/purchasing/claims/view?id=${row.ex_id}`)}
                >
                    <span className="text-xs text-gray-500 tabular-nums">{expenseNumberLabel(row)}</span>
                    <span className="font-medium text-gray-800 hover:text-blue-600">{row.ex_title}</span>
                </button>
            ),
        },
        {
            key: "employee_name",
            header: scope === "all" ? "ผู้เบิก / ร้านค้า" : "ร้านค้า",
            render: (_, row) => (
                <div className="grid min-w-0 gap-0.5">
                    {scope === "all" && <span>{row.employee_name ?? "—"}</span>}
                    <span className={`flex items-center gap-1 ${scope === "all" ? "text-xs text-gray-500" : ""}`}>
                        {row.ex_merchant_name ?? "—"}
                        {row.attachment_count > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-xs text-gray-500">
                                · <Paperclip size={12} aria-hidden />
                                {row.attachment_count}
                            </span>
                        )}
                    </span>
                </div>
            ),
        },
        {
            key: "ex_total",
            header: "ยอดเบิก",
            className: "text-right tabular-nums",
            render: (_, row) => `${formatAmount(row.ex_total)} บาท`,
        },
        {
            key: "ex_status",
            header: "สถานะ",
            render: (_, row) => (
                <div className="flex flex-wrap items-center gap-1.5">
                    <StatusPill tone={STATUS_LABELS[row.ex_status].tone}>
                        {STATUS_LABELS[row.ex_status].label}
                    </StatusPill>
                    {row.ex_status === "draft" && row.ex_returned_reason && (
                        <StatusPill tone="wait">ถูกตีกลับ</StatusPill>
                    )}
                    {row.payment_state === "unpaid" && <StatusPill tone="neutral">รอรับเงินคืน</StatusPill>}
                    {row.payment_state === "paid" && <StatusPill tone="success">ได้รับเงินแล้ว</StatusPill>}
                    {row.waiting_for_me && <StatusPill tone="wait">รอคุณอนุมัติ</StatusPill>}
                </div>
            ),
        },
        {
            key: "ex_expense_date",
            header: "วันที่จ่าย",
            render: (_, row) => formatDateOnly(row.ex_expense_date),
        },
    ];

    return (
        <div className="grid grid-cols-1 gap-6">
            <PageHeader
                eyebrow="จัดซื้อ"
                title="เบิกเงิน"
                description={CLAIM_MESSAGES.listDescription}
                actions={
                    <button
                        type="button"
                        className={buttonClass("primary", "md")}
                        onClick={() => router.push("/purchasing/claims/new")}
                    >
                        <Camera size={16} />
                        เบิกเงิน
                    </button>
                }
            />
            {canViewAll && (
                <div className="grid gap-1.5">
                    <Segmented<Scope>
                        label="ใบเบิกของใคร"
                        value={scope}
                        onChange={(value) => {
                            setScope(value);
                            setTab("all");
                            setPage(1);
                        }}
                        options={[
                            { value: "mine", label: "ของฉัน" },
                            { value: "all", label: "ทุกคน" },
                        ]}
                    />
                    {scope === "all" && <FieldHint>{CLAIM_MESSAGES.allScope}</FieldHint>}
                </div>
            )}
            <Segmented<TabKey>
                label="กรองตามสถานะ"
                value={tab}
                onChange={(value) => {
                    setTab(value);
                    setPage(1);
                }}
                options={tabs}
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
                searchPlaceholder={
                    scope === "all" ? "ค้นหาเลขที่ เรื่อง ร้านค้า หรือผู้เบิก..." : "ค้นหาเลขที่ เรื่อง หรือร้านค้า..."
                }
                searchValue={search}
                onSearch={(value) => {
                    setSearch(value);
                    setPage(1);
                }}
                emptyMessage={EMPTY_MESSAGES[tab] ?? "ไม่มีใบเบิกในแท็บนี้"}
            />
        </div>
    );
}
