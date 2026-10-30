"use client";

// รายการใบเสร็จรับเงิน (2026-10-15 ขั้น 1C-3) — แท็บ ทั้งหมด / ยังไม่มี 50 ทวิ / ยกเลิก · ค้นหาเลขที่/ลูกค้า/เลขใบแจ้งหนี้/เลขเช็ค
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
import { formatAmount, parseHundredths } from "@/lib/shared/money.mjs";
import { METHOD_LABELS, RECEIPT_MESSAGES, STATUS_LABELS } from "./_messages";
import type { ReceiptListRow } from "./_types";

type TabKey = "all" | "missing_wht" | "cancelled";

const TABS: { value: TabKey; label: string }[] = [
    { value: "all", label: "ทั้งหมด" },
    { value: "missing_wht", label: "ยังไม่มี 50 ทวิ" },
    { value: "cancelled", label: "ยกเลิก" },
];

const EMPTY_MESSAGES: Record<TabKey, string> = {
    all: "ยังไม่มีใบเสร็จ",
    missing_wht: "ใบเสร็จที่มีหัก ณ ที่จ่ายแนบ 50 ทวิ ครบแล้ว",
    cancelled: "ไม่มีใบเสร็จที่ยกเลิก",
};

export default function ReceiptsPage() {
    const router = useRouter();
    const hasBit = usePermission();
    const canCreate = hasBit(BITS.createReceipt);
    const [tab, setTab] = useState<TabKey>("all");
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [rows, setRows] = useState<ReceiptListRow[]>([]);
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
        apiFetch<{ data: ReceiptListRow[]; total: number }>(`/receipts?${query}`).then(({ data }) => {
            if (isLeftPage) return;
            setRows(data?.data ?? []);
            setTotal(data?.total ?? 0);
            setIsLoading(false);
        });
        return () => {
            isLeftPage = true;
        };
    }, [tab, search, page, pageSize]);

    const columns: Column<ReceiptListRow>[] = [
        {
            key: "rc_number",
            header: "เลขที่ / ลูกค้า",
            render: (_, row) => (
                <button
                    type="button"
                    className="grid min-w-0 gap-0.5 text-left"
                    onClick={() => router.push(`/sales/receipts/view?id=${row.rc_id}`)}
                >
                    <span className="text-xs text-gray-500 tabular-nums">{row.rc_number}</span>
                    <span className="font-medium text-gray-800 hover:text-blue-600">
                        {row.client_company || row.client_name}
                    </span>
                </button>
            ),
        },
        {
            key: "rc_receipt_date",
            mobile: "meta",
            header: "วันที่ / วิธีรับ",
            render: (_, row) => (
                <div className="grid gap-0.5 text-sm">
                    <span>{formatDateOnly(row.rc_receipt_date)}</span>
                    <span className="text-xs text-gray-500">
                        {METHOD_LABELS[row.rc_method]} · {row.invoice_count} ใบแจ้งหนี้
                    </span>
                </div>
            ),
        },
        {
            key: "rc_received_amount",
            mobile: "trailing",
            header: "เงินเข้าจริง",
            className: "text-right tabular-nums",
            render: (_, row) => (
                <div className="grid gap-0.5">
                    <span>
                        {formatAmount(row.rc_received_amount)} {row.rc_currency}
                    </span>
                    {parseHundredths(row.rc_wht_amount, "หัก ณ ที่จ่าย") > 0n && (
                        <span className="text-xs text-gray-500">หัก ณ ที่จ่าย {formatAmount(row.rc_wht_amount)}</span>
                    )}
                </div>
            ),
        },
        {
            key: "rc_status",
            mobile: "badge",
            header: "สถานะ",
            render: (_, row) => {
                const needsCertificate =
                    row.rc_status === "issued" &&
                    parseHundredths(row.rc_wht_amount, "หัก ณ ที่จ่าย") > 0n &&
                    !row.has_wht_file;
                return (
                    <div className="flex flex-wrap items-center gap-1.5">
                        <StatusPill tone={STATUS_LABELS[row.rc_status].tone}>
                            {STATUS_LABELS[row.rc_status].label}
                        </StatusPill>
                        {needsCertificate && <StatusPill tone="wait">ยังไม่มี 50 ทวิ</StatusPill>}
                    </div>
                );
            },
        },
    ];

    return (
        <div className="grid grid-cols-1 gap-6">
            <PageHeader
                eyebrow="ขาย"
                title="ใบเสร็จรับเงิน"
                description={RECEIPT_MESSAGES.listDescription}
                actions={
                    canCreate && (
                        <button
                            type="button"
                            className={buttonClass("primary", "md")}
                            onClick={() => router.push("/sales/receipts/new")}
                        >
                            <Plus size={16} />
                            บันทึกรับเงิน
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
                rowKey="rc_id"
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
                searchPlaceholder="ค้นหาเลขที่ ลูกค้า เลขใบแจ้งหนี้ หรือเลขเช็ค..."
                searchValue={search}
                onSearch={(value) => {
                    setSearch(value);
                    setPage(1);
                }}
                emptyMessage={EMPTY_MESSAGES[tab]}
            />
        </div>
    );
}
