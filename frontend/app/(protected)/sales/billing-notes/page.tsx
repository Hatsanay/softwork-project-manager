"use client";

// รายการใบวางบิล (2026-10-15 ขั้น 1B-4) — แท็บตามสถานะ · ค้นหาเลขที่/ลูกค้า/เลขใบแจ้งหนี้ในใบ
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
import { BILLING_NOTE_MESSAGES, STATUS_LABELS, billingNoteNumberLabel } from "./_messages";
import type { BillingNoteListRow } from "./_types";

type TabKey = "all" | "draft" | "issued" | "cancelled";

const TABS: { value: TabKey; label: string }[] = [
    { value: "all", label: "ทั้งหมด" },
    { value: "draft", label: "ร่าง" },
    { value: "issued", label: "ออกแล้ว" },
    { value: "cancelled", label: "ยกเลิก" },
];

export default function BillingNotesPage() {
    const router = useRouter();
    const hasBit = usePermission();
    const canCreate = hasBit(BITS.createInvoice);
    const [tab, setTab] = useState<TabKey>("all");
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [rows, setRows] = useState<BillingNoteListRow[]>([]);
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
        apiFetch<{ data: BillingNoteListRow[]; total: number }>(`/billing-notes?${query}`).then(({ data }) => {
            if (isLeftPage) return;
            setRows(data?.data ?? []);
            setTotal(data?.total ?? 0);
            setIsLoading(false);
        });
        return () => {
            isLeftPage = true;
        };
    }, [tab, search, page, pageSize]);

    const columns: Column<BillingNoteListRow>[] = [
        {
            key: "bn_number",
            header: "เลขที่ / ลูกค้า",
            render: (_, row) => (
                <button
                    type="button"
                    className="grid min-w-0 gap-0.5 text-left"
                    onClick={() => router.push(`/sales/billing-notes/view?id=${row.bn_id}`)}
                >
                    <span className="text-xs text-gray-500 tabular-nums">{billingNoteNumberLabel(row)}</span>
                    <span className="font-medium text-gray-800 hover:text-blue-600">
                        {row.client_company || row.client_name}
                    </span>
                </button>
            ),
        },
        {
            key: "invoice_count",
            mobile: "meta",
            header: "ใบแจ้งหนี้",
            render: (_, row) => <span>{row.invoice_count} ใบ</span>,
        },
        {
            key: "bn_total",
            mobile: "trailing",
            header: "ยอดรวม",
            className: "text-right tabular-nums",
            render: (_, row) => (
                <span>
                    {formatAmount(row.bn_total)} {row.bn_currency}
                </span>
            ),
        },
        {
            key: "bn_status",
            mobile: "badge",
            header: "สถานะ",
            render: (_, row) => (
                <StatusPill tone={STATUS_LABELS[row.bn_status].tone}>{STATUS_LABELS[row.bn_status].label}</StatusPill>
            ),
        },
        {
            key: "bn_payment_date",
            mobile: "meta",
            header: "วันที่ / นัดชำระ",
            render: (_, row) => (
                <div className="grid gap-0.5 text-sm">
                    <span>{row.bn_issue_date ? formatDateOnly(row.bn_issue_date) : "ได้ตอนออกใบ"}</span>
                    <span className="text-xs text-gray-500">
                        {row.bn_payment_date ? `นัดชำระ ${formatDateOnly(row.bn_payment_date)}` : "ยังไม่นัดวันชำระ"}
                    </span>
                </div>
            ),
        },
    ];

    return (
        <div className="grid grid-cols-1 gap-6">
            <PageHeader
                eyebrow="ขาย"
                title="ใบวางบิล"
                description={BILLING_NOTE_MESSAGES.listDescription}
                actions={
                    canCreate && (
                        <button
                            type="button"
                            className={buttonClass("primary", "md")}
                            onClick={() => router.push("/sales/billing-notes/new")}
                        >
                            <Plus size={16} />
                            สร้างใบวางบิล
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
                rowKey="bn_id"
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
                searchPlaceholder="ค้นหาเลขที่ ลูกค้า หรือเลขใบแจ้งหนี้..."
                searchValue={search}
                onSearch={(value) => {
                    setSearch(value);
                    setPage(1);
                }}
                emptyMessage="ยังไม่มีใบวางบิลในแท็บนี้"
            />
        </div>
    );
}
