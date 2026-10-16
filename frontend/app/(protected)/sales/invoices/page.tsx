"use client";

// รายการใบแจ้งหนี้ (2026-10-14 ขั้น 1B-3) — แท็บตามสถานะ + ค้างชำระ/เกินกำหนด · ค้นหาเลข/ชื่อเรื่อง/ลูกค้า
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
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
import { INVOICE_MESSAGES, STATUS_LABELS } from "./_messages";
import type { InvoiceListRow } from "./_types";
import { dueLabel, invoiceNumberLabel } from "./_format";

type TabKey = "all" | "waiting_me" | "draft" | "pending_approval" | "outstanding" | "overdue" | "paid" | "cancelled";

const TABS: { value: TabKey; label: string }[] = [
    { value: "all", label: "ทั้งหมด" },
    { value: "outstanding", label: "ค้างชำระ" },
    { value: "overdue", label: "เกินกำหนด" },
    { value: "paid", label: "ชำระครบ" },
    { value: "waiting_me", label: "รอคุณอนุมัติ" },
    { value: "draft", label: "ร่าง" },
    { value: "pending_approval", label: "รออนุมัติ" },
    { value: "cancelled", label: "ยกเลิก" },
];

const EMPTY_MESSAGES: Partial<Record<TabKey, string>> = {
    waiting_me: "ไม่มีใบที่รอคุณอนุมัติ",
    overdue: "ไม่มีใบที่เกินกำหนดชำระ",
    outstanding: "ไม่มีใบที่ค้างชำระ",
    paid: "ยังไม่มีใบที่ชำระครบ",
};

export default function InvoicesPage() {
    const router = useRouter();
    const hasBit = usePermission();
    const canCreate = hasBit(BITS.createInvoice);
    const [tab, setTab] = useState<TabKey>("all");
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [rows, setRows] = useState<InvoiceListRow[]>([]);
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
        apiFetch<{ data: InvoiceListRow[]; total: number }>(`/invoices?${query}`).then(({ data }) => {
            if (isLeftPage) return;
            setRows(data?.data ?? []);
            setTotal(data?.total ?? 0);
            setIsLoading(false);
        });
        return () => {
            isLeftPage = true;
        };
    }, [tab, search, page, pageSize]);

    const columns: Column<InvoiceListRow>[] = [
        {
            key: "inv_number",
            header: "เลขที่ / ชื่อเรื่อง",
            render: (_, row) => (
                <button
                    type="button"
                    className="grid min-w-0 gap-0.5 text-left"
                    onClick={() => router.push(`/sales/invoices/view?id=${row.inv_id}`)}
                >
                    <span className="text-xs text-gray-500 tabular-nums">{invoiceNumberLabel(row)}</span>
                    <span className="font-medium text-gray-800 hover:text-blue-600">{row.inv_title}</span>
                </button>
            ),
        },
        {
            key: "client_name",
            header: "ลูกค้า",
            render: (_, row) => (
                <div className="grid min-w-0 gap-0.5">
                    <span>{row.client_name}</span>
                    <span className="text-xs text-gray-500">
                        {row.qt_number ? `ใบเสนอราคา ${row.qt_number}` : "สร้างเอง"}
                    </span>
                </div>
            ),
        },
        {
            key: "inv_total",
            header: "ยอดรวม",
            className: "text-right tabular-nums",
            render: (_, row) => (
                <div className="grid gap-0.5">
                    <span>
                        {formatAmount(row.inv_total)} {row.inv_currency}
                    </span>
                    {row.inv_currency !== "THB" && (
                        <span className="text-xs text-gray-500">≈ {formatAmount(row.inv_total_thb)} บาท</span>
                    )}
                </div>
            ),
        },
        {
            key: "inv_status",
            header: "สถานะ",
            render: (_, row) => {
                const due = dueLabel(row);
                return (
                    <div className="flex flex-wrap items-center gap-1.5">
                        <StatusPill tone={STATUS_LABELS[row.inv_status].tone}>
                            {STATUS_LABELS[row.inv_status].label}
                            {row.inv_status === "pending_approval" && row.inv_approval_current_level
                                ? ` ชั้น ${row.inv_approval_current_level}/${row.approval_level_count}`
                                : ""}
                        </StatusPill>
                        {row.payment_state === "paid" && <StatusPill tone="success">ชำระครบ</StatusPill>}
                        {row.payment_state === "partial" && <StatusPill tone="wait">ชำระบางส่วน</StatusPill>}
                        {due && <StatusPill tone={row.is_overdue ? "danger" : "neutral"}>{due}</StatusPill>}
                        {row.waiting_for_me && <StatusPill tone="wait">รอคุณอนุมัติ</StatusPill>}
                    </div>
                );
            },
        },
        {
            key: "inv_issue_date",
            header: "วันที่ / ครบกำหนด",
            render: (_, row) =>
                row.inv_issue_date ? (
                    <div className="grid gap-0.5 text-sm">
                        <span>{formatDateOnly(row.inv_issue_date)}</span>
                        <span className={`text-xs ${row.is_overdue ? "text-red-600" : "text-gray-500"}`}>
                            ครบกำหนด {formatDateOnly(row.inv_due_date)}
                        </span>
                    </div>
                ) : (
                    <span className="text-xs text-gray-400">ได้ตอนออกใบ</span>
                ),
        },
    ];

    return (
        <div className="grid grid-cols-1 gap-6">
            <PageHeader
                eyebrow="ขาย"
                title="ใบแจ้งหนี้"
                description={INVOICE_MESSAGES.listDescription}
                actions={
                    canCreate && (
                        <button
                            type="button"
                            className={buttonClass("primary", "md")}
                            onClick={() => router.push("/sales/invoices/new")}
                        >
                            <Plus size={16} />
                            สร้างใบแจ้งหนี้เอง
                        </button>
                    )
                }
            />
            {canCreate && (
                <FieldHint>
                    ออกใบแจ้งหนี้ตามงวดของงานที่ลูกค้าตอบรับแล้ว: เปิดใบเสนอราคานั้น แล้วกด &quot;ออกใบแจ้งหนี้&quot;
                    ในส่วนงวดชำระ
                </FieldHint>
            )}
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
                rowKey="inv_id"
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
                searchPlaceholder="ค้นหาเลขที่ ชื่อเรื่อง หรือลูกค้า..."
                searchValue={search}
                onSearch={(value) => {
                    setSearch(value);
                    setPage(1);
                }}
                emptyMessage={EMPTY_MESSAGES[tab] ?? "ยังไม่มีใบแจ้งหนี้ในแท็บนี้"}
            />
        </div>
    );
}
