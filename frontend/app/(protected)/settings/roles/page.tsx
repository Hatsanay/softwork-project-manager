"use client";

import { useEffect, useState, useTransition } from "react";
import DataTable, { Column } from "@/components/ui/datatable/datatable";
import { api } from "@/app/constans";
import formatDate from "@/app/function";
import Button from "@/components/ui/Button/Button";
import ViewButton from "@/components/ui/Button/ViewButton";
import EditButton from "@/components/ui/Button/EditButton";
import DeleteButton from "@/components/ui/Button/DeleteButton";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { useRouter } from "next/navigation";
import { usePermission, BITS } from "@/app/components/permission-provider";
import { toast } from "sonner";
import PageHeader from "@/components/ui/page-header";
import { Plus } from "lucide-react";


type Role = {
    role_id: number;
    role_name: string;
    role_permission: string;
    role_department_name: string | null;
    role_granted_at: Date;
    by_fullname: string;
    role_update_at: Date;
};

async function fetchRoles(params: { limit: number; offset: number; search: string }) {
    const token = localStorage.getItem("token");
    const query = new URLSearchParams({
        limit:  String(params.limit),
        offset: String(params.offset),
        search: params.search,
    });
    const res = await fetch(`${api}/roles?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { data: [] as Role[], total: 0 };
    return res.json() as Promise<{ data: Role[]; total: number }>;
}

export default function RoleSettingsPage() {
    const router = useRouter();
    const hasBit = usePermission();

    const columns: Column<Role>[] = [
        { key: "role_id",       header: "รหัสสิทธิ์",        className: "w-16" },
        { key: "role_name",     header: "ชื่อสิทธิ์" },
        { key: "role_department_name", header: "แผนก", render: (v) => (v as string) || "-" },
        { key: "by_fullname",   header: "สร้างโดย" },
        { key: "role_granted_at", header: "สร้างเมื่อ", render: (v) => formatDate(v) },
        { key: "role_update_at",  header: "อัปเดตเมื่อ",  render: (v) => formatDate(v) },
    ];
    const [isPending, startTransition] = useTransition();
    const [roles, setRoles]   = useState<Role[]>([]);
    const [total, setTotal]   = useState(0);
    const [page, setPage]     = useState(1);
    const [search, setSearch] = useState("");
    const [pageSize, setPageSize] = useState(10);

    const [deleteTarget, setDeleteTarget] = useState<Role | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    async function handleDelete() {
        if (!deleteTarget) return;
        const token = localStorage.getItem("token");
        setIsDeleting(true);
        try {
            const res = await fetch(`${api}/roles/${deleteTarget.role_id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
                // ค้างหน้าต่างไว้พร้อมเหตุผลจาก backend (เช่น ยังมีผู้ใช้ใช้สิทธิ์นี้อยู่) — ไม่ใช้ toast ที่หายเอง
                const data = await res.json().catch(() => ({}));
                setDeleteError(data.message ?? "ลบไม่สำเร็จ กรุณาลองใหม่");
                return;
            }
            setRoles((prev) => prev.filter((r) => r.role_id !== deleteTarget.role_id));
            setTotal((prev) => prev - 1);
            toast.success(`ลบ "${deleteTarget.role_name}" สำเร็จ`);
            closeDeleteDialog();
        } finally {
            setIsDeleting(false);
        }
    }

    function closeDeleteDialog() {
        setDeleteTarget(null);
        setDeleteError(null);
    }

    useEffect(() => {
        const limit  = pageSize === -1 ? 99999 : pageSize;
        const offset = pageSize === -1 ? 0 : (page - 1) * pageSize;
        startTransition(async () => {
            const result = await fetchRoles({ limit, offset, search });
            setRoles(result.data);
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
                title="จัดการสิทธิ์"
                description="กำหนดว่าผู้ใช้แต่ละกลุ่มเข้าเมนูและทำอะไรได้บ้าง · สร้าง/แก้ได้เฉพาะสิทธิ์ที่ไม่เกินของคุณ · role ระบบได้สิทธิ์ครบเสมอ"
                actions={
                    hasBit(BITS.createRole) && (
                        <Button onClick={() => router.push("/settings/roles/create")}>
                            <Plus size={16} />
                            สร้างสิทธิ์
                        </Button>
                    )
                }
            />
            <DataTable
                columns={columns}
                data={roles}
                rowKey="role_id"
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
                        {hasBit(BITS.roleManagement) && (
                            <ViewButton onClick={() => router.push(`/settings/roles/view?id=${row.role_id}`)} />
                        )}
                        {hasBit(BITS.editRole) && (
                            <EditButton onClick={() => router.push(`/settings/roles/edit?id=${row.role_id}`)} />
                        )}
                        {hasBit(BITS.deleteRole) && (
                            <DeleteButton onClick={() => setDeleteTarget(row)} />
                        )}
                    </div>
                )}
            />

            <ConfirmDialog
                open={!!deleteTarget}
                title="ลบสิทธิ์นี้?"
                description={
                    deleteTarget
                        ? `"${deleteTarget.role_name}" จะถูกลบและกู้คืนไม่ได้ · ลบได้เฉพาะสิทธิ์ที่ไม่มีผู้ใช้คนไหนใช้อยู่`
                        : undefined
                }
                confirmLabel="ลบ"
                loading={isDeleting}
                errorMessage={deleteError}
                onConfirm={handleDelete}
                onCancel={closeDeleteDialog}
            />
        </div>
    );
}
