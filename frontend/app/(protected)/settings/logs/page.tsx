"use client";

import { useEffect, useState, useTransition } from "react";
import DataTable, { Column } from "@/components/ui/datatable/datatable";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { api } from "@/app/constans";
import formatDate from "@/app/function";
import { toast } from "sonner";

type LoginLog = {
    log_id: string;
    log_email: string;
    by_fullname: string | null;
    log_action: "login" | "logout" | "login_failed";
    log_ip_address: string | null;
    log_user_agent: string | null;
    log_created_at: string;
};

const ACTION_LABEL: Record<LoginLog["log_action"], string> = {
    login: "เข้าสู่ระบบสำเร็จ",
    logout: "ออกจากระบบ",
    login_failed: "เข้าสู่ระบบไม่สำเร็จ",
};

const ACTION_COLOR: Record<LoginLog["log_action"], string> = {
    login: "text-green-600",
    logout: "text-gray-500",
    login_failed: "text-red-600",
};

async function fetchLogs(params: { limit: number; offset: number; search: string }) {
    const token = localStorage.getItem("token");
    const query = new URLSearchParams({
        limit: String(params.limit),
        offset: String(params.offset),
        search: params.search,
    });
    const res = await fetch(`${api}/logs?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { data: [] as LoginLog[], total: 0 };
    return res.json() as Promise<{ data: LoginLog[]; total: number }>;
}

async function deleteAllLogs() {
    const token = localStorage.getItem("token");
    const res = await fetch(`${api}/logs`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("ลบไม่สำเร็จ กรุณาลองใหม่");
}

export default function LoginLogsPage() {
    const columns: Column<LoginLog>[] = [
        { key: "log_email", header: "อีเมล" },
        { key: "by_fullname", header: "ชื่อผู้ใช้งาน", render: (v) => (v as string) || "-" },
        {
            key: "log_action",
            header: "การกระทำ",
            render: (v) => (
                <span className={ACTION_COLOR[v as LoginLog["log_action"]]}>
                    {ACTION_LABEL[v as LoginLog["log_action"]] ?? String(v)}
                </span>
            ),
        },
        { key: "log_ip_address", header: "IP", render: (v) => (v as string) || "-" },
        { key: "log_created_at", header: "เวลา", render: (v) => formatDate(v) },
    ];

    const [isPending, startTransition] = useTransition();
    const [logs, setLogs] = useState<LoginLog[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");
    const [pageSize, setPageSize] = useState(10);
    const [reloadTick, setReloadTick] = useState(0);

    const [confirmClearOpen, setConfirmClearOpen] = useState(false);
    const [clearing, setClearing] = useState(false);

    useEffect(() => {
        const limit = pageSize === -1 ? 99999 : pageSize;
        const offset = pageSize === -1 ? 0 : (page - 1) * pageSize;
        startTransition(async () => {
            const result = await fetchLogs({ limit, offset, search });
            setLogs(result.data);
            setTotal(result.total);
        });
    }, [page, search, pageSize, reloadTick]);

    function handleSearch(val: string) {
        setSearch(val);
        setPage(1);
    }

    function handlePageSizeChange(size: number) {
        setPageSize(size);
        setPage(1);
    }

    async function handleClearAll() {
        setClearing(true);
        try {
            await deleteAllLogs();
            toast.success("ลบ log ทั้งหมดสำเร็จ");
            setConfirmClearOpen(false);
            setPage(1);
            setReloadTick((n) => n + 1);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
        } finally {
            setClearing(false);
        }
    }

    return (
        <div className="p-4 sm:p-6">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-xl sm:text-2xl font-bold text-gray-800">Log ข้อมูล</h1>
                {total > 0 && (
                    <button
                        type="button"
                        onClick={() => setConfirmClearOpen(true)}
                        className="px-4 py-2 text-sm text-red-600 border border-red-200 rounded hover:bg-red-50"
                    >
                        ลบข้อมูลทั้งหมด
                    </button>
                )}
            </div>

            <DataTable
                columns={columns}
                data={logs}
                rowKey="log_id"
                loading={isPending}
                total={total}
                page={page}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={handlePageSizeChange}
                searchable
                searchPlaceholder="ค้นหาอีเมล..."
                searchValue={search}
                onSearch={handleSearch}
            />

            <ConfirmDialog
                open={confirmClearOpen}
                variant="danger"
                title="ลบ log ทั้งหมด?"
                description={`log ที่บันทึกไว้ทั้งหมด ${total} รายการจะถูกลบและไม่สามารถกู้คืนได้`}
                confirmLabel="ลบทั้งหมด"
                loading={clearing}
                onConfirm={handleClearAll}
                onCancel={() => setConfirmClearOpen(false)}
            />
        </div>
    );
}
