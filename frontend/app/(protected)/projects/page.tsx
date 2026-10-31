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
import Segmented from "@/components/ui/segmented";
import FieldHint from "@/components/ui/guidance/field-hint";

// ต่อไปต้องทำ (2026-10-31): เรื่องที่เร่งที่สุดของแต่ละโปรเจกต์ · กฎอยู่ที่ backend (project-next-steps.service)
type NextLevel = "urgent" | "todo" | "wait" | "info";
type NextFilter = "all" | "urgent" | "todo" | "wait";
type NextCounts = { urgent: number; todo: number; wait: number };

const NEXT_DOT: Record<NextLevel, string> = {
    urgent: "bg-red-500",
    todo: "bg-blue-500",
    wait: "bg-gray-300",
    info: "bg-gray-300",
};

type Project = {
    project_id: string;
    project_name: string;
    project_status: "planning" | "in_progress" | "on_hold" | "completed" | "cancelled";
    project_start_date: string | null;
    project_due_date: string | null;
    project_progress_percent: string;
    client_name: string | null;
    member_count: number;
    next_step: { title: string; level: NextLevel; more_count: number } | null;
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

async function fetchProjects(params: { limit: number; offset: number; search: string; cancelled: boolean; next: NextFilter }) {
    const query = new URLSearchParams({
        limit: String(params.limit),
        offset: String(params.offset),
        search: params.search,
    });
    if (params.cancelled) query.set("status", "cancelled");
    if (!params.cancelled && params.next !== "all") query.set("next", params.next);
    const res = await fetch(`${api}/projects?${query}`, { headers: authHeader() });
    if (!res.ok) return { data: [] as Project[], total: 0, next_counts: null };
    return res.json() as Promise<{ data: Project[]; total: number; next_counts: NextCounts | null }>;
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
    const [nextFilter, setNextFilter] = useState<NextFilter>("all");
    const [nextCounts, setNextCounts] = useState<NextCounts | null>(null);

    const [cancelTarget, setCancelTarget] = useState<Project | null>(null);
    const [isCancelling, setIsCancelling] = useState(false);
    const [reactivatingId, setReactivatingId] = useState<string | null>(null);

    function reload() {
        const limit = pageSize === -1 ? 99999 : pageSize;
        const offset = pageSize === -1 ? 0 : (page - 1) * pageSize;
        startTransition(async () => {
            const result = await fetchProjects({ limit, offset, search, cancelled: showCancelled, next: nextFilter });
            setProjects(result.data);
            setTotal(result.total);
            setNextCounts(result.next_counts ?? null);
        });
    }

    useEffect(() => {
        reload();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, search, pageSize, showCancelled, nextFilter]);

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
        setNextFilter("all");
        setPage(1);
    }

    function changeNextFilter(value: NextFilter) {
        setNextFilter(value);
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
        {
            // ชื่อ + เรื่องที่ต้องทำต่อใต้ชื่อ (คอลัมน์แยกทำให้ตารางกว้างเกินจอ) · กว้างคงที่บนจอใหญ่ให้ข้อความยาวตัดบรรทัด
            key: "project_name",
            header: "โปรเจกต์ · ต่อไปต้องทำ",
            render: (_, row) => (
                <div className="grid gap-1 whitespace-normal sm:w-80">
                    <span className="wrap-break-word text-gray-900">{row.project_name}</span>
                    <NextStepCell step={row.next_step} />
                </div>
            ),
        },
        { key: "client_name", mobile: "meta", header: "ลูกค้า", render: (v) => (v as string) || "-" },
        {
            key: "project_status",
            mobile: "badge",
            header: "สถานะ",
            render: (v) => (
                <StatusPill tone={STATUS_TONE[v as Project["project_status"]] ?? "neutral"}>
                    {STATUS_LABEL[v as Project["project_status"]] ?? String(v)}
                </StatusPill>
            ),
        },
        {
            key: "project_progress_percent",
            mobile: "trailing",
            header: "ความคืบหน้า",
            className: "min-w-[140px]",
            render: (v) => <ProgressBar percent={Number(v)} />,
        },
        { key: "member_count", mobile: "meta", mobileLabel: "สมาชิก", header: "สมาชิก" },
        { key: "project_due_date", mobile: "meta", mobileLabel: "ครบ", header: "ครบกำหนด", render: (v) => formatDateOnly(v) },
    ];

    return (
        <div className="grid grid-cols-1 gap-6">
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
            {!showCancelled && nextCounts && (
                <div className="grid gap-1.5">
                    <Segmented<NextFilter>
                        label="กรองตามสิ่งที่ต้องทำ"
                        value={nextFilter}
                        onChange={changeNextFilter}
                        options={[
                            { value: "all", label: "ทั้งหมด" },
                            { value: "urgent", label: "เลยกำหนด", count: nextCounts.urgent },
                            { value: "todo", label: "ถึงคิวเรา", count: nextCounts.todo },
                            { value: "wait", label: "รอคนอื่น", count: nextCounts.wait },
                        ]}
                    />
                    <FieldHint>
                        บรรทัดใต้ชื่อ = เรื่องที่เร่งที่สุดของโปรเจกต์ (เห็นตามสิทธิ์ของคุณ) · เปิดโปรเจกต์เพื่อดูทุกเรื่องและปุ่มพาไปทำ
                    </FieldHint>
                </div>
            )}
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
                emptyMessage={
                    showCancelled
                        ? "ไม่มีโปรเจกต์ที่ยกเลิก"
                        : nextFilter !== "all"
                          ? "ไม่มีโปรเจกต์ในกลุ่มนี้"
                          : "ยังไม่มีโปรเจกต์ในระบบ"
                }
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

function NextStepCell({ step }: { step: Project["next_step"] }) {
    if (!step) return null;
    return (
        <span className="flex items-start gap-2">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${NEXT_DOT[step.level]}`} aria-hidden="true" />
            <span className="min-w-0 wrap-break-word text-sm text-gray-600">
                {step.title}
                {step.more_count > 0 && <span className="ml-1 text-xs text-gray-500">+{step.more_count} เรื่อง</span>}
            </span>
        </span>
    );
}
