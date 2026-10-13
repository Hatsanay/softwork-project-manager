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
import PageHeader from "@/components/ui/page-header";
import PersonCell from "@/components/ui/person-cell";
import { ActiveStatusPill } from "@/components/ui/status-pill";
import { Plus } from "lucide-react";

type User = {
    user_id: number;
    user_username: string;
    user_email: string | null;
    user_fname: string;
    user_lname: string;
    user_phone: string;
    user_role_id: string;
    user_status: "active" | "inactive";
    user_avatar_url: string | null;
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

// ลบไม่สำเร็จ = คืนข้อความเหตุผลจาก backend (เช่น ผู้ใช้มีประวัติในระบบ ให้ยกเลิกใช้งานแทน)
async function deleteUser(id: number): Promise<{ ok: true } | { ok: false; message: string }> {
    const token = localStorage.getItem("token");
    const res = await window.fetch(`${api}/users/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) return { ok: true };

    const data = await res.json().catch(() => ({}));
    return { ok: false, message: data.message ?? "ลบไม่สำเร็จ กรุณาลองใหม่" };
}

export default function UsersPage() {
    const router = useRouter();
    const hasBit = usePermission();

    const columns: Column<User>[] = [
        {
            key: "by_fullname",
            header: "ผู้ใช้งาน",
            render: (_, row) => (
                <PersonCell name={row.by_fullname} subtitle={`@${row.user_username}`} avatarPath={row.user_avatar_url} />
            ),
        },
        // ยังไม่มีอีเมล = แอดมินสร้างไว้โดยไม่ใส่อีเมล และผู้ใช้ยังไม่ได้เข้าระบบครั้งแรกไปยืนยัน
        { key: "user_email", header: "อีเมล", render: (v) => (v as string) || <span className="text-gray-400">รอยืนยัน</span> },
        {
            key: "role_name",
            header: "สิทธิ์",
            render: (v) => (
                <span className="inline-flex h-6 items-center rounded-lg bg-gray-100 px-2.5 text-xs text-gray-600">
                    {(v as string) || "-"}
                </span>
            ),
        },
        { key: "user_status", header: "สถานะ", render: (v) => <ActiveStatusPill isActive={v === "active"} /> },
        // { key: "role_type", header: "ประเภทสิทธิ์" },
        { key: "user_phone", header: "เบอร์โทรศัพท์", render: (v) => (v as string) || "-" },
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
    const [deleteError, setDeleteError] = useState<string | null>(null);

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
            const result = await deleteUser(deleteTarget.user_id);
            if (!result.ok) {
                // ค้างหน้าต่างไว้พร้อมเหตุผล ให้ผู้ใช้อ่านแล้วตัดสินใจเอง (ไม่ใช้ toast ที่หายเอง)
                setDeleteError(result.message);
                return;
            }
            setUsers((prev) => prev.filter((u) => u.user_id !== deleteTarget.user_id));
            setTotal((prev) => prev - 1);
            toast.success(`ลบ "${deleteTarget.by_fullname}" สำเร็จ`);
            closeDeleteDialog();
        } finally {
            setIsDeleting(false);
        }
    }

    function closeDeleteDialog() {
        setDeleteTarget(null);
        setDeleteError(null);
    }

    return (
        <div className="grid gap-6">
            <PageHeader
                eyebrow="จัดการข้อมูลผู้ใช้งาน"
                title="ผู้ใช้งาน"
                description="ผู้ใช้ที่เข้าระบบได้ · จัดการได้เฉพาะผู้ใช้ที่สิทธิ์ไม่เกินของคุณ · ผู้ใช้ที่เคยทำงานแล้วลบไม่ได้ ให้แก้ไขแล้วเปลี่ยนเป็นปิดใช้งานแทน"
                actions={
                    hasBit(BITS.createUsers) && (
                        <Button onClick={() => router.push("/users/create")}>
                            <Plus size={16} />
                            สร้างผู้ใช้งาน
                        </Button>
                    )
                }
            />

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
                description={
                    deleteTarget
                        ? `"${deleteTarget.by_fullname}" จะถูกลบและกู้คืนไม่ได้ · ลบได้เฉพาะผู้ใช้ที่ยังไม่เคยใช้งานระบบ (เช่น สร้างผิด) ` +
                          `ถ้าเคยทำงานแล้วให้แก้ไขผู้ใช้และเปลี่ยนสถานะเป็น "ยกเลิกใช้งาน" แทน`
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
