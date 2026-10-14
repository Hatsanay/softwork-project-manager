"use client";

// รายการใบเสนอราคา (2026-10-13 ขั้น 1A-3) — แท็บตามสถานะ · ค้นหาเลข/ชื่อเรื่อง/ลูกค้า · ป้าย "รอคุณอนุมัติ"
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import DataTable, { type Column } from "@/components/ui/datatable/datatable";
import PageHeader from "@/components/ui/page-header";
import Segmented from "@/components/ui/segmented";
import StatusPill from "@/components/ui/status-pill";
import { buttonClass } from "@/components/ui/button";
import { usePermission, BITS } from "@/app/components/permission-provider";
import { formatDateOnly } from "@/app/function";
import { apiFetch } from "@/lib/api";
import { formatAmount } from "@/lib/shared/money.mjs";
import { QUOTATION_MESSAGES, STATUS_LABELS } from "./_messages";
import type { QuotationListRow } from "./_types";
import { documentNumberLabel } from "./_format";

type TabKey =
    | "all"
    | "waiting_me"
    | "draft"
    | "pending_approval"
    | "approved"
    | "sent"
    | "accepted"
    | "declined"
    | "expired"
    | "cancelled";

const TABS: { value: TabKey; label: string }[] = [
    { value: "all", label: "ทั้งหมด" },
    { value: "waiting_me", label: "รอคุณอนุมัติ" },
    { value: "draft", label: "ร่าง" },
    { value: "pending_approval", label: "รออนุมัติ" },
    { value: "approved", label: "อนุมัติแล้ว" },
    { value: "sent", label: "ส่งลูกค้าแล้ว" },
    { value: "accepted", label: "ตอบรับ" },
    { value: "declined", label: "ปฏิเสธ" },
    { value: "expired", label: "หมดอายุ" },
    { value: "cancelled", label: "ยกเลิก" },
];

export default function QuotationsPage() {
    const router = useRouter();
    const hasBit = usePermission();
    const canCreate = hasBit(BITS.createQuotation);
    const [tab, setTab] = useState<TabKey>("all");
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [rows, setRows] = useState<QuotationListRow[]>([]);
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
        apiFetch<{ data: QuotationListRow[]; total: number }>(`/quotations?${query}`).then(({ data }) => {
            if (isLeftPage) return;
            setRows(data?.data ?? []);
            setTotal(data?.total ?? 0);
            setIsLoading(false);
        });
        return () => {
            isLeftPage = true;
        };
    }, [tab, search, page, pageSize]);

    const columns: Column<QuotationListRow>[] = [
        {
            key: "qt_number",
            header: "เลขที่ / ชื่อเรื่อง",
            render: (_, row) => (
                <button
                    type="button"
                    className="grid min-w-0 gap-0.5 text-left"
                    onClick={() => router.push(`/sales/quotations/view?id=${row.qt_id}`)}
                >
                    <span className="text-xs text-gray-500 tabular-nums">{documentNumberLabel(row)}</span>
                    <span className="font-medium text-gray-800 hover:text-blue-600">{row.qt_title}</span>
                </button>
            ),
        },
        {
            key: "client_name",
            header: "ลูกค้า",
            render: (_, row) => (
                <div className="grid min-w-0 gap-0.5">
                    <span>{row.client_name}</span>
                    <span className="text-xs text-gray-500">{row.branch_name_th}</span>
                </div>
            ),
        },
        {
            key: "qt_total",
            header: "ยอดรวม",
            className: "text-right tabular-nums",
            render: (_, row) => (
                <div className="grid gap-0.5">
                    <span>
                        {formatAmount(row.qt_total)} {row.qt_currency}
                    </span>
                    {row.qt_currency !== "THB" && (
                        <span className="text-xs text-gray-500">≈ {formatAmount(row.qt_total_thb)} บาท</span>
                    )}
                </div>
            ),
        },
        {
            key: "qt_status",
            header: "สถานะ",
            render: (_, row) => (
                <div className="flex flex-wrap items-center gap-1.5">
                    <StatusPill tone={STATUS_LABELS[row.qt_status].tone}>
                        {STATUS_LABELS[row.qt_status].label}
                        {row.qt_status === "pending_approval" && row.qt_approval_current_level
                            ? ` ชั้น ${row.qt_approval_current_level}/${row.approval_level_count}`
                            : ""}
                    </StatusPill>
                    {row.waiting_for_me && <StatusPill tone="wait">รอคุณอนุมัติ</StatusPill>}
                </div>
            ),
        },
        {
            key: "qt_issue_date",
            header: "วันที่ / ยืนราคาถึง",
            render: (_, row) =>
                row.qt_issue_date ? (
                    <div className="grid gap-0.5 text-sm">
                        <span>{formatDateOnly(row.qt_issue_date)}</span>
                        <span className="text-xs text-gray-500">ถึง {formatDateOnly(row.qt_valid_until)}</span>
                    </div>
                ) : (
                    <span className="text-xs text-gray-400">ได้เมื่ออนุมัติครบ</span>
                ),
        },
        { key: "created_by_name", header: "ผู้สร้าง", render: (value) => (value as string | null) ?? "-" },
    ];

    return (
        <div className="grid grid-cols-1 gap-6">
            <PageHeader
                eyebrow="ขาย"
                title="ใบเสนอราคา"
                description={QUOTATION_MESSAGES.listDescription}
                actions={
                    canCreate && (
                        <button
                            type="button"
                            className={buttonClass("primary", "md")}
                            onClick={() => router.push("/sales/quotations/new")}
                        >
                            <Plus size={16} />
                            สร้างใบเสนอราคา
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
                rowKey="qt_id"
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
                emptyMessage={tab === "waiting_me" ? "ไม่มีใบที่รอคุณอนุมัติ" : "ยังไม่มีใบเสนอราคาในแท็บนี้"}
            />
        </div>
    );
}
