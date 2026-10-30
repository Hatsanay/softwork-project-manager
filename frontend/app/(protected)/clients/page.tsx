"use client";

import { useEffect, useState, useTransition } from "react";
import DataTable, { Column } from "@/components/ui/datatable/datatable";
import { api } from "@/app/constans";
import formatDate from "@/app/function";
import Button from "@/components/ui/Button/Button";
import EditButton from "@/components/ui/Button/EditButton";
import DeleteButton from "@/components/ui/Button/DeleteButton";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { useRouter } from "next/navigation";
import { usePermission, BITS } from "@/app/components/permission-provider";
import { toast } from "sonner";
import PageHeader from "@/components/ui/page-header";
import { Plus, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { ActiveStatusPill } from "@/components/ui/status-pill";
import { CLIENT_MESSAGES } from "./_messages";
import type { Client } from "./_types";

const CLIENT_TYPE_LABELS: Record<Client["client_type"], string> = { juristic: "นิติบุคคล", individual: "บุคคลธรรมดา" };

// สาขาของลูกค้านิติบุคคล — "00000" แสดงเป็นคำว่าสำนักงานใหญ่
function branchLabel(branchCode: string | null) {
    if (!branchCode) return "";
    return branchCode === "00000" ? " · สำนักงานใหญ่" : ` · สาขา ${branchCode}`;
}

async function fetchClients(params: { limit: number; offset: number; search: string }) {
    const token = localStorage.getItem("token");
    const query = new URLSearchParams({
        limit: String(params.limit),
        offset: String(params.offset),
        search: params.search,
    });
    const res = await fetch(`${api}/clients?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { data: [] as Client[], total: 0 };
    return res.json() as Promise<{ data: Client[]; total: number }>;
}

export default function ClientsPage() {
    const router = useRouter();
    const hasBit = usePermission();

    const columns: Column<Client>[] = [
        {
            key: "client_name",
            header: "ลูกค้า",
            render: (_, row) => (
                <div className="grid min-w-0 gap-0.5">
                    <span className="font-medium text-gray-800">{row.client_name}</span>
                    {row.client_company && <span className="text-xs text-gray-500">{row.client_company}</span>}
                </div>
            ),
        },
        {
            key: "client_tax_id",
            mobile: "meta",
            header: "ประเภท / เลขผู้เสียภาษี",
            render: (_, row) => (
                <div className="grid gap-0.5">
                    <span>{CLIENT_TYPE_LABELS[row.client_type]}{row.client_country !== "TH" ? ` · ${row.client_country}` : ""}</span>
                    <span className="text-xs text-gray-500 tabular-nums">
                        {row.client_tax_id ? `${row.client_tax_id}${branchLabel(row.client_branch_code)}` : "ยังไม่มีเลขผู้เสียภาษี"}
                    </span>
                </div>
            ),
        },
        {
            key: "client_contact_name",
            mobile: "meta",
            header: "ติดต่อ",
            render: (_, row) => (
                <div className="grid gap-0.5 text-sm">
                    <span>{row.client_contact_name || row.client_email || "-"}</span>
                    {row.client_phone && <span className="text-xs text-gray-500">{row.client_phone}</span>}
                </div>
            ),
        },
        { key: "client_currency", header: "สกุลเงิน" },
        { key: "client_status", header: "สถานะ", render: (_, row) => <ActiveStatusPill isActive={row.client_status === "active"} /> },
        { key: "client_created_at", header: "สร้างเมื่อ", render: (v) => formatDate(v) },
    ];

    const [isPending, startTransition] = useTransition();
    const [clients, setClients] = useState<Client[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");
    const [pageSize, setPageSize] = useState(10);

    const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    async function handleDelete() {
        if (!deleteTarget) return;
        const token = localStorage.getItem("token");
        setIsDeleting(true);
        try {
            const res = await fetch(`${api}/clients/${deleteTarget.client_id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                setClients((prev) => prev.filter((c) => c.client_id !== deleteTarget.client_id));
                setTotal((prev) => prev - 1);
                toast.success(`ลบ "${deleteTarget.client_name}" สำเร็จ`);
                closeDeleteDialog();
            } else {
                // ค้างหน้าต่างไว้พร้อมเหตุผลจาก backend (เช่น ยังถูกใช้งานอยู่) — ไม่ใช้ toast ที่หายเอง
                const data = await res.json().catch(() => ({}));
                setDeleteError(data.message ?? "ลบไม่สำเร็จ กรุณาลองใหม่");
            }
        } finally {
            setIsDeleting(false);
        }
    }

    function closeDeleteDialog() {
        setDeleteTarget(null);
        setDeleteError(null);
    }

    useEffect(() => {
        const limit = pageSize === -1 ? 99999 : pageSize;
        const offset = pageSize === -1 ? 0 : (page - 1) * pageSize;
        startTransition(async () => {
            const result = await fetchClients({ limit, offset, search });
            setClients(result.data);
            setTotal(result.total);
        });
    }, [page, search, pageSize]);

    function handleSearch(val: string) {
        setSearch(val);
        setPage(1);
    }

    function handlePageSizeChange(size: number) {
        setPageSize(size);
        setPage(1);
    }

    return (
        <div className="grid grid-cols-1 gap-6">
            <PageHeader
                eyebrow="งาน"
                title="ลูกค้า"
                description={CLIENT_MESSAGES.pageDescription}
                actions={
                    hasBit(BITS.createClient) && (
                        <Button onClick={() => router.push("/clients/create")}>
                            <Plus size={16} />
                            สร้างลูกค้า
                        </Button>
                    )
                }
            />
            <DataTable
                columns={columns}
                data={clients}
                rowKey="client_id"
                loading={isPending}
                total={total}
                page={page}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={handlePageSizeChange}
                searchable
                searchValue={search}
                onSearch={handleSearch}
                emptyMessage="ยังไม่มีข้อมูลลูกค้า"
                actions={(row) => (
                    <div className="flex items-center gap-2 justify-end">
                        {hasBit(BITS.manageServiceRequests) && (
                            <Link
                                href={`/sales/order-links?client=${row.client_id}`}
                                className={buttonClass("ghost", "sm")}
                                aria-label={`ส่งลิงก์เลือกบริการให้ ${row.client_name}`}
                            >
                                <ShoppingBag size={15} />
                                <span className="hidden xl:inline">ลิงก์เลือกบริการ</span>
                            </Link>
                        )}
                        {hasBit(BITS.editClient) && (
                            <EditButton onClick={() => router.push(`/clients/edit?id=${row.client_id}`)} />
                        )}
                        {hasBit(BITS.deleteClient) && (
                            <DeleteButton onClick={() => setDeleteTarget(row)} />
                        )}
                    </div>
                )}
            />

            <ConfirmDialog
                open={!!deleteTarget}
                title="ลบลูกค้านี้?"
                description={deleteTarget ? `"${deleteTarget.client_name}" จะถูกลบและไม่สามารถกู้คืนได้` : undefined}
                confirmLabel="ลบ"
                loading={isDeleting}
                onConfirm={handleDelete}
                errorMessage={deleteError}
                onCancel={closeDeleteDialog}
            />
        </div>
    );
}
