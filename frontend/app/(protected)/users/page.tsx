"use client";

import { useEffect, useState, useTransition } from "react";
import DataTable, { Column } from "@/components/ui/datatable/datatable";
import { api } from "@/app/constans";
import formatDate from "@/app/function";
import ViewButton from "@/components/ui/Button/ViewButton";
import EditButton from "@/components/ui/Button/EditButton";
import DeleteButton from "@/components/ui/Button/DeleteButton";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { useRouter } from "next/navigation";
import { usePermission, BITS } from "@/app/components/permission-provider";
import { toast } from "sonner";
import Button from "@/components/ui/Button/Button";

type User = {
    user_id: number;
    user_email: string;
    user_fname: string;
    user_lname: string;
    user_phone: string;
    user_role_id: string;
    user_status: string;
    user_created_at: Date;
    user_updated_at: Date;
    by_fullname: string;
    role_name: string;
    role_type: string;
};

async function fetchUsers(params: { limit: number; offset: number; search: string }) {
    const token = localStorage.getItem("token");
    const query = new URLSearchParams({
        limit: String(params.limit),
        offset: String(params.offset),
        search: params.search,
    });
    const res = await window.fetch(`${api}/users?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { data: [] as User[], total: 0 };
    return res.json() as Promise<{ data: User[]; total: number }>;
}

async function deleteUser(id: number) {
    const token = localStorage.getItem("token");
    const res = await window.fetch(`${api}/users/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
}

export default function UsersPage() {
    const router = useRouter();
    const hasBit = usePermission();

    const columns: Column<User>[] = [
        { key: "user_id", header: "รหัสผู้ใช้งาน", className: "w-20" },
        { key: "by_fullname", header: "ชื่อผู้ใช้งาน" },
        { key: "user_email", header: "อีเมล" },
        { key: "role_name", header: "สิทธิ์" },
        // { key: "role_type", header: "ประเภทสิทธิ์" },
        { key: "user_phone", header: "เบอร์โทรศัพท์", render: (v) => (v as string) || "-" },
        { key: "user_created_at", header: "สร้างเมื่อ", render: (v) => formatDate(v) },
        { key: "user_updated_at", header: "อัปเดตเมื่อ", render: (v) => formatDate(v) },
    ];

    const [isPending, startTransition] = useTransition();
    const [users, setUsers] = useState<User[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");
    const [pageSize, setPageSize] = useState(10);

    const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        const limit = pageSize === -1 ? 99999 : pageSize;
        const offset = pageSize === -1 ? 0 : (page - 1) * pageSize;
        startTransition(async () => {
            const result = await fetchUsers({ limit, offset, search });
            setUsers(result.data);
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

    async function handleDelete() {
        if (!deleteTarget) return;
        setIsDeleting(true);
        try {
            const ok = await deleteUser(deleteTarget.user_id);
            if (ok) {
                setUsers((prev) => prev.filter((u) => u.user_id !== deleteTarget.user_id));
                setTotal((prev) => prev - 1);
                toast.success(`ลบ "${deleteTarget.by_fullname}" สำเร็จ`);
            } else {
                toast.error("ลบไม่สำเร็จ กรุณาลองใหม่");
            }
        } finally {
            setIsDeleting(false);
            setDeleteTarget(null);
        }
    }

    return (
        <div className="p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-6">
                <h1 className="text-xl sm:text-2xl font-bold text-gray-800">จัดการผู้ใช้งาน</h1>
                {hasBit(BITS.createUsers) && (
                    <Button onClick={() => router.push("/users/create")}>สร้างผู้ใช้งาน</Button>
                )}
            </div>

            <DataTable
                columns={columns}
                data={users}
                rowKey="user_id"
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
                        {hasBit(BITS.usersManagement) && (
                            <ViewButton onClick={() => router.push(`/users/view?id=${row.user_id}`)} />
                        )}
                        {hasBit(BITS.editUsers) && (
                            <EditButton onClick={() => router.push(`/users/edit?id=${row.user_id}`)} />
                        )}
                        {hasBit(BITS.deleteUsers) && (
                            <DeleteButton onClick={() => setDeleteTarget(row)} />
                        )}
                    </div>
                )}
            />

            <ConfirmDialog
                open={!!deleteTarget}
                title="ลบผู้ใช้งานนี้?"
                description={deleteTarget ? `"${deleteTarget.by_fullname}" จะถูกลบและไม่สามารถกู้คืนได้` : undefined}
                confirmLabel="ลบ"
                loading={isDeleting}
                onConfirm={handleDelete}
                onCancel={() => setDeleteTarget(null)}
            />
        </div>
    );
}
