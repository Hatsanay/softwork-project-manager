"use client";

import { useEffect, useState, useTransition } from "react";
import DataTable, { Column } from "@/components/ui/datatable/datatable";
import ProgressBar from "@/components/ui/ProgressBar";
import { api } from "@/app/constans";
import { formatDateOnly } from "@/app/function";
import Button from "@/components/ui/Button/Button";
import ViewButton from "@/components/ui/Button/ViewButton";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { useRouter } from "next/navigation";
import { usePermission, BITS } from "@/app/components/permission-provider";
import { toast } from "sonner";
import { Archive, Ban, FolderKanban, Plus, RotateCcw } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import PageHeader from "@/components/ui/page-header";
import StatusPill, { type PillTone } from "@/components/ui/status-pill";

type Project = {
    project_id: string;
    project_name: string;
    project_status: "planning" | "in_progress" | "on_hold" | "completed" | "cancelled";
    project_start_date: string | null;
    project_due_date: string | null;
    project_progress_percent: string;
    client_name: string | null;
    member_count: number;
};

const STATUS_LABEL: Record<Project["project_status"], string> = {
    planning: "วางแผน",
    in_progress: "กำลังทำ",
    on_hold: "พักไว้",
    completed: "เสร็จแล้ว",
    cancelled: "ยกเลิก",
};

const STATUS_TONE: Record<Project["project_status"], PillTone> = {
    planning: "neutral",
    in_progress: "info",
    on_hold: "wait",
    completed: "success",
    cancelled: "danger",
};

function authHeader() {
    return { Authorization: `Bearer ${localStorage.getItem("token")}` };
}

async function fetchProjects(params: { limit: number; offset: number; search: string; cancelled: boolean }) {
    const query = new URLSearchParams({
        limit: String(params.limit),
        offset: String(params.offset),
        search: params.search,
    });
    if (params.cancelled) query.set("status", "cancelled");
    const res = await fetch(`${api}/projects?${query}`, { headers: authHeader() });
    if (!res.ok) return { data: [] as Project[], total: 0 };
    return res.json() as Promise<{ data: Project[]; total: number }>;
}

export default function ProjectsPage() {
    const router = useRouter();
    const hasBit = usePermission();

    const [isPending, startTransition] = useTransition();
    const [projects, setProjects] = useState<Project[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");
    const [pageSize, setPageSize] = useState(10);
    const [showCancelled, setShowCancelled] = useState(false);

    const [cancelTarget, setCancelTarget] = useState<Project | null>(null);
    const [isCancelling, setIsCancelling] = useState(false);
    const [reactivatingId, setReactivatingId] = useState<string | null>(null);

    function reload() {
        const limit = pageSize === -1 ? 99999 : pageSize;
        const offset = pageSize === -1 ? 0 : (page - 1) * pageSize;
        startTransition(async () => {
            const result = await fetchProjects({ limit, offset, search, cancelled: showCancelled });
            setProjects(result.data);
            setTotal(result.total);
        });
    }

    useEffect(() => {
        reload();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, search, pageSize, showCancelled]);

    function handleSearch(val: string) {
        setSearch(val);
        setPage(1);
    }

    function handlePageSizeChange(size: number) {
        setPageSize(size);
        setPage(1);
    }

    function toggleShowCancelled() {
        setShowCancelled((v) => !v);
        setPage(1);
    }

    async function handleCancel() {
        if (!cancelTarget) return;
        setIsCancelling(true);
        try {
            const res = await fetch(`${api}/projects/${cancelTarget.project_id}/cancel`, {
                method: "PUT", headers: authHeader(),
            });
            if (res.ok) {
                toast.success(`ยกเลิก "${cancelTarget.project_name}" สำเร็จ`);
                reload();
            } else {
                const data = await res.json().catch(() => ({}));
                toast.error(data.message ?? "ยกเลิกไม่สำเร็จ กรุณาลองใหม่");
            }
        } finally {
            setIsCancelling(false);
            setCancelTarget(null);
        }
    }

    async function handleReactivate(project: Project) {
        setReactivatingId(project.project_id);
        try {
            const res = await fetch(`${api}/projects/${project.project_id}/reactivate`, {
                method: "PUT", headers: authHeader(),
            });
            if (res.ok) {
                toast.success(`กู้คืน "${project.project_name}" สำเร็จ`);
                reload();
            } else {
                const data = await res.json().catch(() => ({}));
                toast.error(data.message ?? "กู้คืนไม่สำเร็จ กรุณาลองใหม่");
            }
        } finally {
            setReactivatingId(null);
        }
    }

    const columns: Column<Project>[] = [
        { key: "project_name", header: "ชื่อโปรเจกต์" },
        { key: "client_name",  header: "ลูกค้า", render: (v) => (v as string) || "-" },
        {
            key: "project_status",
            header: "สถานะ",
            render: (v) => (
                <StatusPill tone={STATUS_TONE[v as Project["project_status"]] ?? "neutral"}>
                    {STATUS_LABEL[v as Project["project_status"]] ?? String(v)}
                </StatusPill>
            ),
        },
        {
            key: "project_progress_percent",
            header: "ความคืบหน้า",
            className: "min-w-[140px]",
            render: (v) => <ProgressBar percent={Number(v)} />,
        },
        { key: "member_count", header: "สมาชิก" },
        { key: "project_due_date", header: "ครบกำหนด", render: (v) => formatDateOnly(v) },
    ];

    return (
        <div className="grid gap-6">
            <PageHeader
                eyebrow="งาน"
                title={showCancelled ? "โปรเจกต์ที่ยกเลิก" : "โปรเจกต์"}
                description={
                    showCancelled
                        ? "โปรเจกต์ที่ยกเลิกไว้ ข้อมูลและงานยังอยู่ครบ · กู้คืนได้ถ้ามีสิทธิ์ยกเลิกโปรเจกต์"
                        : hasBit(BITS.viewAllProjects)
                          ? "โปรเจกต์ทั้งหมดของบริษัท · กดดูเพื่อจัดการงาน สมาชิก และลิงก์ให้ลูกค้า"
                          : "โปรเจกต์ที่คุณเป็นสมาชิก · โปรเจกต์อื่นจะเห็นเมื่อถูกเพิ่มเป็นสมาชิก"
                }
                actions={
                    <>
                        <button type="button" onClick={toggleShowCancelled} className={buttonClass("secondary", "md")}>
                            {showCancelled ? <FolderKanban size={16} /> : <Archive size={16} />}
                            {showCancelled ? "ดูโปรเจกต์ปกติ" : "ดูโปรเจกต์ที่ยกเลิก"}
                        </button>
                        {!showCancelled && hasBit(BITS.createProject) && (
                            <Button onClick={() => router.push("/projects/create")}>
                                <Plus size={16} />
                                สร้างโปรเจกต์
                            </Button>
                        )}
                    </>
                }
            />
            <DataTable
                columns={columns}
                data={projects}
                rowKey="project_id"
                loading={isPending}
                total={total}
                page={page}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={handlePageSizeChange}
                searchable
                searchValue={search}
                onSearch={handleSearch}
                emptyMessage={showCancelled ? "ไม่มีโปรเจกต์ที่ยกเลิก" : "ยังไม่มีโปรเจกต์ในระบบ"}
                actions={(row) => (
                    <div className="flex items-center gap-2 justify-end">
                        <ViewButton onClick={() => router.push(`/projects/view?id=${row.project_id}`)} />
                        {showCancelled
                            ? hasBit(BITS.cancelProject) && (
                                <button
                                    type="button"
                                    onClick={() => handleReactivate(row)}
                                    disabled={reactivatingId === row.project_id}
                                    className={buttonClass("secondary", "sm")}
                                >
                                    <RotateCcw size={14} className="text-gray-400" />
                                    {reactivatingId === row.project_id ? "กำลังกู้คืน..." : "กู้คืน"}
                                </button>
                            )
                            : hasBit(BITS.cancelProject) && (
                                <button
                                    type="button"
                                    onClick={() => setCancelTarget(row)}
                                    className={buttonClass("ghost", "sm", "text-red-600 hover:bg-red-50 hover:text-red-700")}
                                >
                                    <Ban size={14} />
                                    ยกเลิก
                                </button>
                            )}
                    </div>
                )}
            />

            <ConfirmDialog
                open={!!cancelTarget}
                title="ยกเลิกโปรเจกต์นี้?"
                description={cancelTarget ? `"${cancelTarget.project_name}"` : undefined}
                consequences={[
                    "ย้ายไปที่รายการโปรเจกต์ที่ยกเลิก",
                    "งาน แชท และปัญหายังอยู่ครบ",
                    "กู้คืนได้ภายหลังจากรายการโปรเจกต์ที่ยกเลิก",
                ]}
                confirmLabel="ยกเลิกโปรเจกต์"
                variant="warning"
                loading={isCancelling}
                onConfirm={handleCancel}
                onCancel={() => setCancelTarget(null)}
            />
        </div>
    );
}
