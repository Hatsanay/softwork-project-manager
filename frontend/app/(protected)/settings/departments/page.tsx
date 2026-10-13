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
import { Plus } from "lucide-react";
import { ActiveStatusPill } from "@/components/ui/status-pill";

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
            render: (v) => <ActiveStatusPill isActive={v === "active"} />,
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
    const [deleteError, setDeleteError] = useState<string | null>(null);

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
        <div className="grid gap-6">
            <PageHeader
                eyebrow="ตั้งค่าระบบ"
                title="แผนก"
                description="แผนกของบริษัท ใช้จัดกลุ่มสิทธิ์ (role) · ลบได้เฉพาะแผนกที่ไม่มีสิทธิ์ผูกอยู่ ถ้ายังใช้อยู่ให้แก้ไขแล้วเปลี่ยนเป็นปิดใช้งานแทน"
                actions={
                    hasBit(BITS.createDepartment) && (
                        <Button onClick={() => router.push("/settings/departments/create")}>
                            <Plus size={16} />
                            สร้างแผนก
                        </Button>
                    )
                }
            />
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
                errorMessage={deleteError}
                onCancel={closeDeleteDialog}
            />
        </div>
    );
}
