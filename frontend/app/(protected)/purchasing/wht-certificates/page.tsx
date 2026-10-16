"use client";

// หนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ) ที่บริษัทออก (ขั้น 2-4) — กรองแบบ ภ.ง.ด.3/53 และเดือนที่จ่าย · พิมพ์ซ้ำได้
// รายงานยื่น ภ.ง.ด. รายเดือนแบบเต็มอยู่ในขั้น 2-5 — หน้านี้ใช้ดู/ค้นหา/พิมพ์
import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import DataTable, { type Column } from "@/components/ui/datatable/datatable";
import PageHeader from "@/components/ui/page-header";
import Segmented from "@/components/ui/segmented";
import StatusPill from "@/components/ui/status-pill";
import FormField, { inputClass } from "@/components/ui/form-field";
import { formatDateOnly } from "@/app/function";
import { apiFetch } from "@/lib/api";
import { formatAmount } from "@/lib/shared/money.mjs";
import { PAYMENT_MESSAGES, WHT_FORM_SHORT } from "../payments/_messages";
import type { CertificateListRow } from "../payments/_types";

type FormFilter = "all" | "PND3" | "PND53";

export default function CertificatesPage() {
    const [form, setForm] = useState<FormFilter>("all");
    const [month, setMonth] = useState("");
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [rows, setRows] = useState<CertificateListRow[]>([]);
    const [total, setTotal] = useState(0);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let isLeftPage = false;
        const query = new URLSearchParams({ search, limit: String(pageSize), offset: String((page - 1) * pageSize) });
        if (form !== "all") query.set("form", form);
        if (month) query.set("month", month);
        apiFetch<{ data: CertificateListRow[]; total: number }>(`/wht-certificates?${query}`).then(({ data }) => {
            if (isLeftPage) return;
            setRows(data?.data ?? []);
            setTotal(data?.total ?? 0);
            setIsLoading(false);
        });
        return () => {
            isLeftPage = true;
        };
    }, [form, month, search, page, pageSize]);

    const columns: Column<CertificateListRow>[] = [
        {
            key: "wt_number",
            header: "เลขที่ / ผู้ถูกหัก",
            render: (_, row) => (
                <div className="grid min-w-0 gap-0.5">
                    <span className="text-xs text-gray-500 tabular-nums">{row.wt_number}</span>
                    <span className="font-medium text-gray-800">{row.payee_name ?? "—"}</span>
                    {row.payee_tax_id && <span className="text-xs text-gray-500">{row.payee_tax_id}</span>}
                </div>
            ),
        },
        {
            key: "wt_total_tax",
            header: "เงินได้ / ภาษีที่หัก",
            className: "text-right tabular-nums",
            render: (_, row) => (
                <div className="grid gap-0.5">
                    <span>{formatAmount(row.wt_total_tax)}</span>
                    <span className="text-xs text-gray-500">จาก {formatAmount(row.wt_total_paid)}</span>
                </div>
            ),
        },
        {
            key: "wt_form",
            header: "แบบ / สถานะ",
            render: (_, row) => (
                <div className="flex flex-wrap items-center gap-1.5">
                    <StatusPill tone="info">{WHT_FORM_SHORT[row.wt_form]}</StatusPill>
                    {row.wt_status === "cancelled" && <StatusPill tone="danger">ยกเลิก</StatusPill>}
                </div>
            ),
        },
        {
            key: "wt_payment_date",
            header: "วันที่จ่าย",
            render: (_, row) => (
                <div className="grid gap-0.5 text-sm">
                    <span>{formatDateOnly(row.wt_payment_date)}</span>
                    <a
                        href={`/purchasing/wht-certificates/print?id=${row.wt_id}`}
                        target="_blank"
                        rel="noopener"
                        className="-my-2 inline-flex items-center gap-1 py-2.5 text-xs text-blue-600 hover:underline"
                    >
                        <FileText size={12} aria-hidden />
                        พิมพ์ ({row.pv_number})
                    </a>
                </div>
            ),
        },
    ];

    return (
        <div className="grid grid-cols-1 gap-6">
            <PageHeader
                eyebrow="จัดซื้อ"
                title="หนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ)"
                description={PAYMENT_MESSAGES.certificatesDescription}
            />
            <div className="grid gap-4 sm:grid-cols-[auto_12rem] sm:items-end">
                <Segmented<FormFilter>
                    label="แบบยื่น"
                    value={form}
                    onChange={(value) => {
                        setForm(value);
                        setPage(1);
                    }}
                    options={[
                        { value: "all", label: "ทั้งหมด" },
                        { value: "PND3", label: "ภ.ง.ด.3" },
                        { value: "PND53", label: "ภ.ง.ด.53" },
                    ]}
                />
                <FormField label="เดือนที่จ่าย" htmlFor="month">
                    <input
                        id="month"
                        type="month"
                        value={month}
                        onChange={(event) => {
                            setMonth(event.target.value);
                            setPage(1);
                        }}
                        className={inputClass()}
                    />
                </FormField>
            </div>
            <DataTable
                columns={columns}
                data={rows}
                rowKey="wt_id"
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
                searchPlaceholder="ค้นหาเลข 50 ทวิ ใบสำคัญจ่าย หรือผู้ถูกหัก..."
                searchValue={search}
                onSearch={(value) => {
                    setSearch(value);
                    setPage(1);
                }}
                emptyMessage="ยังไม่มีหนังสือรับรองในช่วงนี้"
            />
        </div>
    );
}
