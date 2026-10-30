"use client";

// ใบสำคัญจ่าย (ขั้น 2-4) — รายการทุกใบ · ค้นหาเลข PV / ผู้รับ / เลข 50 ทวิ
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
import { METHOD_LABELS, PAYMENT_MESSAGES } from "./_messages";
import type { PaymentListRow } from "./_types";

type TabKey = "all" | "issued" | "cancelled";

const TABS: { value: TabKey; label: string }[] = [
    { value: "all", label: "ทั้งหมด" },
    { value: "issued", label: "จ่ายแล้ว" },
    { value: "cancelled", label: "ยกเลิก" },
];

export default function PaymentsPage() {
    const router = useRouter();
    const hasBit = usePermission();
    const canPay = hasBit(BITS.makePayment);
    const [tab, setTab] = useState<TabKey>("all");
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [rows, setRows] = useState<PaymentListRow[]>([]);
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
        apiFetch<{ data: PaymentListRow[]; total: number }>(`/payments?${query}`).then(({ data }) => {
            if (isLeftPage) return;
            setRows(data?.data ?? []);
            setTotal(data?.total ?? 0);
            setIsLoading(false);
        });
        return () => {
            isLeftPage = true;
        };
    }, [tab, search, page, pageSize]);

    const columns: Column<PaymentListRow>[] = [
        {
            key: "pv_number",
            header: "เลขที่ / ผู้รับ",
            render: (_, row) => (
                <button
                    type="button"
                    className="grid min-w-0 gap-0.5 text-left"
                    onClick={() => router.push(`/purchasing/payments/view?id=${row.pv_id}`)}
                >
                    <span className="text-xs text-gray-500 tabular-nums">{row.pv_number}</span>
                    <span className="font-medium text-gray-800 hover:text-blue-600">
                        {row.payee_name ?? "-"}
                        {row.pv_payee_kind === "employee" ? " (เบิกเงิน)" : ""}
                    </span>
                </button>
            ),
        },
        {
            key: "pv_net_paid",
            mobile: "trailing",
            header: "จ่ายสุทธิ",
            className: "text-right tabular-nums",
            render: (_, row) => (
                <div className="grid gap-0.5">
                    <span>
                        {formatAmount(row.pv_net_paid)} {row.pv_currency}
                    </span>
                    {parseHundredths(row.pv_wht_amount, "หัก") > 0n && (
                        <span className="text-xs text-gray-500">หัก ณ ที่จ่าย {formatAmount(row.pv_wht_amount)}</span>
                    )}
                </div>
            ),
        },
        {
            key: "pv_status",
            mobile: "badge",
            header: "สถานะ",
            render: (_, row) => (
                <div className="flex flex-wrap items-center gap-1.5">
                    <StatusPill tone={row.pv_status === "issued" ? "success" : "danger"}>
                        {row.pv_status === "issued" ? "จ่ายแล้ว" : "ยกเลิก"}
                    </StatusPill>
                    {row.wt_number && <StatusPill tone="info">50 ทวิ {row.wt_number}</StatusPill>}
                </div>
            ),
        },
        {
            key: "pv_payment_date",
            mobile: "meta",
            header: "วันที่จ่าย / วิธี",
            render: (_, row) => (
                <div className="grid gap-0.5 text-sm">
                    <span>{formatDateOnly(row.pv_payment_date)}</span>
                    <span className="text-xs text-gray-500">
                        {METHOD_LABELS[row.pv_method]} · {row.expense_count} รายการ
                    </span>
                </div>
            ),
        },
    ];

    return (
        <div className="grid grid-cols-1 gap-6">
            <PageHeader
                eyebrow="จัดซื้อ"
                title="ใบสำคัญจ่าย"
                description={PAYMENT_MESSAGES.listDescription}
                actions={
                    canPay && (
                        <button
                            type="button"
                            className={buttonClass("primary", "md")}
                            onClick={() => router.push("/purchasing/payments/new")}
                        >
                            <Plus size={16} />
                            ทำจ่าย
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
                rowKey="pv_id"
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
                searchPlaceholder="ค้นหาเลขใบสำคัญจ่าย ผู้รับ หรือเลข 50 ทวิ..."
                searchValue={search}
                onSearch={(value) => {
                    setSearch(value);
                    setPage(1);
                }}
                emptyMessage="ยังไม่มีใบสำคัญจ่ายในแท็บนี้"
            />
        </div>
    );
}
