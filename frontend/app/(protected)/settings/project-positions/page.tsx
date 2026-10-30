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

type ProjectPosition = {
    position_id: string;
    position_name: string;
    position_status: "active" | "inactive";
    position_created_at: string;
    position_updated_at: string;
};

async function fetchProjectPositions(params: { limit: number; offset: number; search: string }) {
    const token = localStorage.getItem("token");
    const query = new URLSearchParams({
        limit: String(params.limit),
        offset: String(params.offset),
        search: params.search,
    });
    const res = await fetch(`${api}/project-positions?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { data: [] as ProjectPosition[], total: 0 };
    return res.json() as Promise<{ data: ProjectPosition[]; total: number }>;
}

export default function ProjectPositionSettingsPage() {
    const router = useRouter();
    const hasBit = usePermission();

    const columns: Column<ProjectPosition>[] = [
        { key: "position_id", mobile: "meta", mobileLabel: "รหัส", header: "รหัสตำแหน่ง", className: "w-16" },
        { key: "position_name", mobile: "title", header: "ชื่อตำแหน่ง" },
        {
            key: "position_status",
            mobile: "badge",
            header: "สถานะ",
            render: (v) => <ActiveStatusPill isActive={v === "active"} />,
        },
        { key: "position_created_at", mobile: "hidden", header: "สร้างเมื่อ", render: (v) => formatDate(v) },
        { key: "position_updated_at", mobile: "meta", mobileLabel: "อัปเดต", header: "อัปเดตเมื่อ", render: (v) => formatDate(v) },
    ];

    const [isPending, startTransition] = useTransition();
    const [positions, setPositions] = useState<ProjectPosition[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");
    const [pageSize, setPageSize] = useState(10);

    const [deleteTarget, setDeleteTarget] = useState<ProjectPosition | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    async function handleDelete() {
        if (!deleteTarget) return;
        const token = localStorage.getItem("token");
        setIsDeleting(true);
        try {
            const res = await fetch(`${api}/project-positions/${deleteTarget.position_id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                setPositions((prev) => prev.filter((p) => p.position_id !== deleteTarget.position_id));
                setTotal((prev) => prev - 1);
                toast.success(`ลบ "${deleteTarget.position_name}" สำเร็จ`);
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
            const result = await fetchProjectPositions({ limit, offset, search });
            setPositions(result.data);
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
                eyebrow="ตั้งค่าระบบ"
                title="ตำแหน่งในโปรเจกต์"
                description="ตำแหน่งที่มอบให้สมาชิกในแต่ละโปรเจกต์ กำหนดว่าทำอะไรได้ภายในโปรเจกต์นั้น · ผู้สร้างโปรเจกต์ได้ตำแหน่ง PM อัตโนมัติ · ลบได้เฉพาะตำแหน่งที่ไม่มีใครถืออยู่"
                actions={
                    hasBit(BITS.createProjectPosition) && (
                        <Button onClick={() => router.push("/settings/project-positions/create")}>
                            <Plus size={16} />
                            สร้างตำแหน่ง
                        </Button>
                    )
                }
            />
            <DataTable
                columns={columns}
                data={positions}
                rowKey="position_id"
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
                        {hasBit(BITS.editProjectPosition) && (
                            <EditButton onClick={() => router.push(`/settings/project-positions/edit?id=${row.position_id}`)} />
                        )}
                        {hasBit(BITS.deleteProjectPosition) && (
                            <DeleteButton onClick={() => setDeleteTarget(row)} />
                        )}
                    </div>
                )}
            />

            <ConfirmDialog
                open={!!deleteTarget}
                title="ลบตำแหน่งนี้?"
                description={deleteTarget ? `"${deleteTarget.position_name}" จะถูกลบและไม่สามารถกู้คืนได้` : undefined}
                confirmLabel="ลบ"
                loading={isDeleting}
                onConfirm={handleDelete}
                errorMessage={deleteError}
                onCancel={closeDeleteDialog}
            />
        </div>
    );
}
