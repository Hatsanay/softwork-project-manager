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

type Department = {
    dep_id: string;
    dep_name: string;
    dep_status: "active" | "inactive";
    dep_created_at: string;
    dep_updated_at: string;
};

async function fetchDepartments(params: { limit: number; offset: number; search: string }) {
    const token = localStorage.getItem("token");
    const query = new URLSearchParams({
        limit: String(params.limit),
        offset: String(params.offset),
        search: params.search,
    });
    const res = await fetch(`${api}/departments?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { data: [] as Department[], total: 0 };
    return res.json() as Promise<{ data: Department[]; total: number }>;
}

export default function DepartmentSettingsPage() {
    const router = useRouter();
    const hasBit = usePermission();

    const columns: Column<Department>[] = [
        { key: "dep_id",   header: "รหัสแผนก", className: "w-16" },
        { key: "dep_name", header: "ชื่อแผนก" },
        {
            key: "dep_status",
            header: "สถานะ",
            render: (v) => (
                <span className={v === "active" ? "text-green-600" : "text-gray-400"}>
                    {v === "active" ? "ใช้งาน" : "ยกเลิกใช้งาน"}
                </span>
            ),
        },
        { key: "dep_created_at", header: "สร้างเมื่อ", render: (v) => formatDate(v) },
        { key: "dep_updated_at", header: "อัปเดตเมื่อ", render: (v) => formatDate(v) },
    ];

    const [isPending, startTransition] = useTransition();
    const [departments, setDepartments] = useState<Department[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");
    const [pageSize, setPageSize] = useState(10);

    const [deleteTarget, setDeleteTarget] = useState<Department | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    async function handleDelete() {
        if (!deleteTarget) return;
        const token = localStorage.getItem("token");
        setIsDeleting(true);
        try {
            const res = await fetch(`${api}/departments/${deleteTarget.dep_id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                setDepartments((prev) => prev.filter((d) => d.dep_id !== deleteTarget.dep_id));
                setTotal((prev) => prev - 1);
                toast.success(`ลบ "${deleteTarget.dep_name}" สำเร็จ`);
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
            const result = await fetchDepartments({ limit, offset, search });
            setDepartments(result.data);
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
                <h1 className="text-xl sm:text-2xl font-bold text-gray-800">จัดการแผนก</h1>
                {hasBit(BITS.createDepartment) && (
                    <Button onClick={() => router.push("/settings/departments/create")}>สร้างแผนก</Button>
                )}
            </div>
            <DataTable
                columns={columns}
                data={departments}
                rowKey="dep_id"
                loading={isPending}
                total={total}
                page={page}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={handlePageSizeChange}
                searchable
                searchValue={search}
                onSearch={handleSearch}
                actions={(row) => (
                    <div className="flex items-center gap-2 justify-end">
                        {hasBit(BITS.editDepartment) && (
                            <EditButton onClick={() => router.push(`/settings/departments/edit?id=${row.dep_id}`)} />
                        )}
                        {hasBit(BITS.deleteDepartment) && (
                            <DeleteButton onClick={() => setDeleteTarget(row)} />
                        )}
                    </div>
                )}
            />

            <ConfirmDialog
                open={!!deleteTarget}
                title="ลบแผนกนี้?"
                description={deleteTarget ? `"${deleteTarget.dep_name}" จะถูกลบและไม่สามารถกู้คืนได้` : undefined}
                confirmLabel="ลบ"
                loading={isDeleting}
                onConfirm={handleDelete}
                onCancel={() => setDeleteTarget(null)}
            />
        </div>
    );
}
