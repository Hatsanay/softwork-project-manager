"use client";

// รายการใบลดหนี้ (ขั้น N-1) — แท็บตามสถานะ + รอคืนเงิน · ค้นหาเลขที่/เลขใบแจ้งหนี้/ลูกค้า · สร้างใหม่จากหน้าใบแจ้งหนี้
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DataTable, { type Column } from "@/components/ui/datatable/datatable";
import PageHeader from "@/components/ui/page-header";
import Segmented from "@/components/ui/segmented";
import StatusPill from "@/components/ui/status-pill";
import FieldHint from "@/components/ui/guidance/field-hint";
import { formatDateOnly } from "@/app/function";
import { apiFetch } from "@/lib/api";
import { formatAmount } from "@/lib/shared/money.mjs";
import { CREDIT_NOTE_MESSAGES, STATUS_LABELS, creditNoteNumberLabel } from "./_messages";
import type { CreditNoteListRow } from "./_types";

type TabKey = "all" | "waiting_me" | "pending_approval" | "refund_due" | "draft" | "issued" | "cancelled";

const TABS: { value: TabKey; label: string }[] = [
    { value: "all", label: "ทั้งหมด" },
    { value: "waiting_me", label: "รอฉันอนุมัติ" },
    { value: "pending_approval", label: "รออนุมัติ" },
    { value: "refund_due", label: "รอคืนเงิน" },
    { value: "draft", label: "ร่าง" },
    { value: "issued", label: "ออกแล้ว" },
    { value: "cancelled", label: "ยกเลิก" },
];

export default function CreditNotesPage() {
    const router = useRouter();
    const [tab, setTab] = useState<TabKey>("all");
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [rows, setRows] = useState<CreditNoteListRow[]>([]);
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
        apiFetch<{ data: CreditNoteListRow[]; total: number }>(`/credit-notes?${query}`).then(({ data }) => {
            if (isLeftPage) return;
            setRows(data?.data ?? []);
            setTotal(data?.total ?? 0);
            setIsLoading(false);
        });
        return () => {
            isLeftPage = true;
        };
    }, [tab, search, page, pageSize]);

    const columns: Column<CreditNoteListRow>[] = [
        {
            key: "cn_number",
            header: "เลขที่ / ลูกค้า",
            render: (_, row) => (
                <button
                    type="button"
                    className="grid min-w-0 gap-0.5 text-left"
                    onClick={() => router.push(`/sales/credit-notes/view?id=${row.cn_id}`)}
                >
                    <span className="text-xs text-gray-500 tabular-nums">
                        {creditNoteNumberLabel(row)} · อ้าง {row.inv_number}
                    </span>
                    <span className="font-medium text-gray-800 hover:text-blue-600">
                        {row.client_company || row.client_name}
                    </span>
                    <span className="truncate text-xs text-gray-500">{row.cn_reason}</span>
                </button>
            ),
        },
        {
            key: "cn_total",
            header: "รวมลดหนี้",
            className: "text-right tabular-nums",
            render: (_, row) => (
                <span>
                    {formatAmount(row.cn_total)} {row.cn_currency}
                </span>
            ),
        },
        {
            key: "cn_status",
            header: "สถานะ",
            render: (_, row) => (
                <div className="flex flex-wrap items-center gap-1.5">
                    <StatusPill tone={STATUS_LABELS[row.cn_status].tone}>
                        {STATUS_LABELS[row.cn_status].label}
                        {row.cn_status === "pending_approval" && row.cn_approval_current_level
                            ? ` ชั้น ${row.cn_approval_current_level}/${row.approval_level_count}`
                            : ""}
                    </StatusPill>
                    {row.is_refund_due && <StatusPill tone="danger">รอคืนเงิน</StatusPill>}
                    {row.is_refunded && <StatusPill tone="success">คืนเงินแล้ว</StatusPill>}
                    {row.waiting_for_me && <StatusPill tone="wait">รอคุณอนุมัติ</StatusPill>}
                </div>
            ),
        },
        {
            key: "cn_issue_date",
            header: "วันที่",
            render: (_, row) => (
                <span>{row.cn_issue_date ? formatDateOnly(row.cn_issue_date) : "ได้ตอนอนุมัติครบ"}</span>
            ),
        },
    ];

    return (
        <div className="grid grid-cols-1 gap-6">
            <PageHeader eyebrow="ขาย" title="ใบลดหนี้" description={CREDIT_NOTE_MESSAGES.listDescription} />
            <FieldHint>ออกใบลดหนี้ใหม่ได้จากหน้าใบแจ้งหนี้ที่ออกแล้ว (ปุ่ม &quot;ออกใบลดหนี้&quot;)</FieldHint>
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
                rowKey="cn_id"
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
                searchPlaceholder="ค้นหาเลขที่ เลขใบแจ้งหนี้ หรือลูกค้า..."
                searchValue={search}
                onSearch={(value) => {
                    setSearch(value);
                    setPage(1);
                }}
                emptyMessage="ยังไม่มีใบลดหนี้ในแท็บนี้"
            />
        </div>
    );
}
