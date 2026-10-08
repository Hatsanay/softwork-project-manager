"use client";

import { useEffect, useState, useTransition } from "react";
import DataTable, { Column } from "@/components/ui/datatable/datatable";
import { formatLogTime, getJson, DateRange, FilterSelect } from "./log-shared";

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

// ประวัติการเข้าสู่ระบบ (tb_login_logs) — ย้ายมาจากหน้า Log เดิม และเอาปุ่ม "ลบข้อมูลทั้งหมด" ออก (log ต้องลบไม่ได้)
export default function LoginLogTab() {
    const [isPending, startTransition] = useTransition();
    const [logs, setLogs] = useState<LoginLog[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [search, setSearch] = useState("");
    const [action, setAction] = useState("");
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");

    useEffect(() => {
        startTransition(async () => {
            const data = await getJson<{ data: LoginLog[]; total: number }>("/logs", {
                limit: pageSize, offset: (page - 1) * pageSize, search, action, from, to,
            });
            setLogs(data?.data ?? []);
            setTotal(data?.total ?? 0);
        });
    }, [page, pageSize, search, action, from, to]);

    const columns: Column<LoginLog>[] = [
        { key: "log_created_at", header: "เวลา", className: "whitespace-nowrap", render: (v) => formatLogTime(v) },
        { key: "log_email", header: "อีเมล / ชื่อผู้ใช้ที่กรอก" },
        { key: "by_fullname", header: "ชื่อผู้ใช้งาน", render: (v) => (v as string) || "-" },
        {
            key: "log_action", header: "การกระทำ",
            render: (v) => <span className={ACTION_COLOR[v as LoginLog["log_action"]]}>{ACTION_LABEL[v as LoginLog["log_action"]] ?? String(v)}</span>,
        },
        { key: "log_ip_address", header: "IP", render: (v) => (v as string) || "-" },
    ];

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                <FilterSelect label="การกระทำ" value={action} onChange={(v) => { setAction(v); setPage(1); }} options={[
                    ["", "ทุกการกระทำ"], ["login", "เข้าสู่ระบบสำเร็จ"], ["login_failed", "เข้าสู่ระบบไม่สำเร็จ"], ["logout", "ออกจากระบบ"],
                ]} />
                <DateRange from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); setPage(1); }} />
            </div>
            <DataTable
                columns={columns}
                data={logs}
                rowKey="log_id"
                loading={isPending}
                total={total}
                page={page}
                pageSize={pageSize}
                pageSizeOptions={[20, 50, 100]}
                onPageChange={setPage}
                onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
                searchable
                searchPlaceholder="ค้นหาอีเมล / ชื่อ / IP..."
                searchValue={search}
                onSearch={(s) => { setSearch(s); setPage(1); }}
            />
        </div>
    );
}
