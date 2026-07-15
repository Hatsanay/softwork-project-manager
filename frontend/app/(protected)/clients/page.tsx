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

type Client = {
    client_id: string;
    client_name: string;
    client_company: string | null;
    client_email: string | null;
    client_phone: string | null;
    client_created_at: string;
};

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
        { key: "client_name", header: "ชื่อลูกค้า" },
        { key: "client_company", header: "บริษัท", render: (v) => (v as string) || "-" },
        { key: "client_email", header: "อีเมล", render: (v) => (v as string) || "-" },
        { key: "client_phone", header: "เบอร์โทรศัพท์", render: (v) => (v as string) || "-" },
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
            } else {
                const data = await res.json().catch(() => ({}));
                toast.error(data.message ?? "ลบไม่สำเร็จ กรุณาลองใหม่");
            }
        } finally {
            setIsDeleting(false);
            setDeleteTarget(null);
        }
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
        <div className="p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-6">
                <h1 className="text-xl sm:text-2xl font-bold text-gray-800">จัดการลูกค้า</h1>
                {hasBit(BITS.createClient) && (
                    <Button onClick={() => router.push("/clients/create")}>สร้างลูกค้า</Button>
                )}
            </div>
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
                onCancel={() => setDeleteTarget(null)}
            />
        </div>
    );
}
