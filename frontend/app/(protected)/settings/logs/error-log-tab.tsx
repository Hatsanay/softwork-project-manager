"use client";

import { useEffect, useState, useTransition } from "react";
import DataTable, { Column } from "@/components/ui/datatable/datatable";
import { formatLogTime, getJson } from "./log-shared";

type ErrorRow = {
    err_id: number;
    err_message: string;
    err_stack: string | null;
    err_status: number;
    err_method: string | null;
    err_path: string | null;
    err_count: number;
    err_first_seen: string;
    err_last_seen: string;
    err_last_request_id: string | null;
    err_last_user_id: string | null;
};

// error 5xx ที่เกิดจริงบนเซิร์ฟเวอร์ จัดกลุ่มตามต้นเหตุ — กดแถวเพื่อดู stack trace
// "Request ID ล่าสุด" เอาไปค้นในแท็บประวัติการใช้งานได้ ว่าใครเจอ ตอนทำอะไร
export default function ErrorLogTab() {
    const [isPending, startTransition] = useTransition();
    const [rows, setRows] = useState<ErrorRow[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [search, setSearch] = useState("");
    const [openId, setOpenId] = useState<number | null>(null);

    useEffect(() => {
        startTransition(async () => {
            const data = await getJson<{ data: ErrorRow[]; total: number }>("/error-logs", { limit: pageSize, offset: (page - 1) * pageSize, search });
            setRows(data?.data ?? []);
            setTotal(data?.total ?? 0);
        });
    }, [page, pageSize, search]);

    const columns: Column<ErrorRow>[] = [
        { key: "err_last_seen", header: "เกิดล่าสุด", className: "whitespace-nowrap", render: (v) => formatLogTime(v) },
        {
            key: "err_message", header: "ข้อผิดพลาด",
            render: (_, r) => (
                <div className="max-w-xl">
                    <button type="button" onClick={() => setOpenId(openId === r.err_id ? null : r.err_id)} className="text-left text-red-700 hover:underline">
                        {r.err_message}
                    </button>
                    <div className="text-xs text-gray-400">{r.err_method} {r.err_path}</div>
                    {openId === r.err_id && (
                        <div className="mt-2 space-y-1">
                            <div className="text-xs text-gray-500">พบครั้งแรก {formatLogTime(r.err_first_seen)} · Request ID ล่าสุด <code>{r.err_last_request_id ?? "—"}</code></div>
                            <pre className="max-h-64 overflow-auto rounded bg-gray-50 p-2 text-[11px] leading-relaxed text-gray-700">{r.err_stack ?? "ไม่มี stack"}</pre>
                        </div>
                    )}
                </div>
            ),
        },
        { key: "err_count", header: "จำนวนครั้ง", render: (v) => <span className="font-semibold">{Number(v).toLocaleString("th-TH")}</span> },
        { key: "err_status", header: "HTTP" },
    ];

    return (
        <DataTable
            columns={columns}
            data={rows}
            rowKey="err_id"
            loading={isPending}
            total={total}
            page={page}
            pageSize={pageSize}
            pageSizeOptions={[20, 50, 100]}
            onPageChange={setPage}
            onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
            searchable
            searchPlaceholder="ค้นหาข้อความ error / path / Request ID..."
            searchValue={search}
            onSearch={(s) => { setSearch(s); setPage(1); }}
            emptyMessage="ไม่พบข้อผิดพลาดของระบบ"
        />
    );
}
