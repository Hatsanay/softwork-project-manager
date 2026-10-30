"use client";

import { useEffect, useState, useTransition } from "react";
import DataTable, { Column } from "@/components/ui/datatable/datatable";
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
import { apiFetch } from "@/lib/api";

type Department = {
    dep_id: string;
    dep_code: string;
    dep_name: string;
    dep_status: "active" | "inactive";
    branch_code: string;
    branch_name_th: string;
    employee_count: number;
};

async function fetchDepartments(params: { limit: number; offset: number; search: string }) {
    const query = new URLSearchParams({
        limit: String(params.limit),
        offset: String(params.offset),
        search: params.search,
    });
    const { data } = await apiFetch<{ data: Department[]; total: number }>(`/departments?${query}`);
    return data ?? { data: [] as Department[], total: 0 };
}

export default function DepartmentSettingsPage() {
    const router = useRouter();
    const hasBit = usePermission();

    const columns: Column<Department>[] = [
        {
            key: "dep_code",
            mobile: "meta",
            header: "รหัสแผนก",
            render: (value) => <span className="tracking-wider tabular-nums">{value}</span>,
        },
        { key: "dep_name", mobile: "title", header: "ชื่อแผนก" },
        {
            key: "branch_name_th",
            mobile: "meta",
            header: "สาขา",
            render: (value, row) => (
                <span>
                    <span className="tabular-nums text-gray-500">{row.branch_code}</span> · {value}
                </span>
            ),
        },
        {
            key: "employee_count",
            mobile: "meta",
            header: "พนักงาน",
            render: (value) => <span className="tabular-nums">{value} คน</span>,
        },
        {
            key: "dep_status",
            mobile: "badge",
            header: "สถานะ",
            render: (value) => <ActiveStatusPill isActive={value === "active"} />,
        },
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
        setIsDeleting(true);
        const { error } = await apiFetch(`/departments/${deleteTarget.dep_id}`, { method: "DELETE" });
        setIsDeleting(false);
        if (error) {
            // ค้างหน้าต่างไว้พร้อมเหตุผลจาก backend (เช่น ยังมีพนักงาน) · ไม่ใช้ toast ที่หายเอง
            setDeleteError(error.message);
            return;
        }
        setDepartments((current) => current.filter((department) => department.dep_id !== deleteTarget.dep_id));
        setTotal((current) => current - 1);
        toast.success(`ลบ "${deleteTarget.dep_name}" สำเร็จ`);
        closeDeleteDialog();
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

    function handleSearch(value: string) {
        setSearch(value);
        setPage(1);
    }

    function handlePageSizeChange(size: number) {
        setPageSize(size);
        setPage(1);
    }

    return (
        <div className="grid grid-cols-1 gap-6">
            <PageHeader
                eyebrow="ตั้งค่าระบบ"
                title="แผนก"
                description="รหัสแผนก = รหัสสาขา 5 หลัก + ตัวย่อ 3 ตัว เช่น 00000ACC · เป็นส่วนหน้าของรหัสพนักงาน จึงแก้สาขา/ตัวย่อได้เฉพาะแผนกที่ยังไม่มีพนักงาน · ลบได้เฉพาะแผนกที่ไม่เคยมีพนักงานและไม่มีสิทธิ์ผูกอยู่ ที่เหลือให้ปิดใช้งานแทน"
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
                    <div className="flex items-center justify-end gap-2">
                        {hasBit(BITS.editDepartment) && (
                            <EditButton onClick={() => router.push(`/settings/departments/edit?id=${row.dep_id}`)} />
                        )}
                        {hasBit(BITS.deleteDepartment) && <DeleteButton onClick={() => setDeleteTarget(row)} />}
                    </div>
                )}
            />

            <ConfirmDialog
                open={!!deleteTarget}
                title="ลบแผนกนี้?"
                description={
                    deleteTarget ? `"${deleteTarget.dep_code} ${deleteTarget.dep_name}" จะถูกลบและไม่สามารถกู้คืนได้` : undefined
                }
                confirmLabel="ลบ"
                loading={isDeleting}
                onConfirm={handleDelete}
                errorMessage={deleteError}
                onCancel={closeDeleteDialog}
            />
        </div>
    );
}
