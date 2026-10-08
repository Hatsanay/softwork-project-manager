"use client";

import { useEffect, useState, useTransition } from "react";
import { X } from "lucide-react";
import DataTable, { Column } from "@/components/ui/datatable/datatable";
import ViewButton from "@/components/ui/Button/ViewButton";
import { formatLogTime, getJson, DateRange, FilterSelect, EVENT_META, ENTITY_LABEL, FIELD_LABEL, PERMISSION_LABEL, formatValue,
} from "./log-shared";

type AuditRow = {
    aud_id: number;
    aud_request_id: string | null;
    aud_user_id: string | null;
    aud_user_username: string | null;
    aud_user_fullname: string | null;
    aud_role_name: string | null;
    aud_event: string;
    aud_action: string;
    aud_method: string;
    aud_path: string;
    aud_entity_type: string | null;
    aud_entity_id: string | null;
    aud_project_id: string | null;
    aud_status: number;
    aud_success: boolean;
    aud_error: string | null;
    aud_ip: string | null;
    aud_duration_ms: number | null;
    aud_created_at: string;
    has_changes: boolean;
};

type Change = { from: unknown; to: unknown; added?: string[]; removed?: string[] };
type AuditDetail = AuditRow & {
    aud_changes: Record<string, Change> | null;
    aud_payload: Record<string, unknown> | null;
    aud_user_agent: string | null;
};

function EventBadge({ event }: { event: string }) {
    const meta = EVENT_META[event] ?? { label: event, className: "bg-gray-100 text-gray-700" };
    return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${meta.className}`}>{meta.label}</span>;
}

function DetailModal({ id, onClose }: { id: number; onClose: () => void }) {
    const [row, setRow] = useState<AuditDetail | null>(null);
    useEffect(() => {
        getJson<AuditDetail>(`/audit-logs/${id}`, {}).then(setRow);
    }, [id]);

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8" onClick={onClose}>
            <div className="w-full max-w-3xl rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
                    <h2 className="text-lg font-semibold text-gray-800">รายละเอียดการใช้งาน #{id}</h2>
                    <button type="button" onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600" aria-label="ปิด">
                        <X className="h-5 w-5" />
                    </button>
                </div>
                {!row ? (
                    <p className="p-6 text-sm text-gray-400">กำลังโหลด...</p>
                ) : (
                    <div className="space-y-5 p-5 text-sm">
                        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                            {[
                                ["เวลา", formatLogTime(row.aud_created_at)],
                                ["เหตุการณ์", <span key="e" className="flex items-center gap-2"><EventBadge event={row.aud_event} /> {row.aud_action}</span>],
                                ["ผู้กระทำ", row.aud_user_fullname ? `${row.aud_user_fullname} (@${row.aud_user_username ?? "-"})` : row.aud_user_id ?? "ไม่ได้เข้าสู่ระบบ"],
                                ["สิทธิ์ ณ ตอนนั้น", row.aud_role_name ?? "—"],
                                ["ข้อมูลที่เกี่ยวข้อง", row.aud_entity_type ? `${ENTITY_LABEL[row.aud_entity_type] ?? row.aud_entity_type} ${row.aud_entity_id ?? ""}` : "—"],
                                ["โปรเจกต์", row.aud_project_id ?? "—"],
                                ["ผลลัพธ์", <span key="r" className={row.aud_success ? "text-green-700" : "text-red-600"}>{row.aud_success ? "สำเร็จ" : "ไม่สำเร็จ"} (HTTP {row.aud_status})</span>],
                                ["ข้อความผิดพลาด", row.aud_error ?? "—"],
                                ["คำขอ", <code key="p" className="break-all text-xs">{row.aud_method} {row.aud_path}</code>],
                                ["Request ID", <code key="i" className="break-all text-xs">{row.aud_request_id ?? "—"}</code>],
                                ["IP", row.aud_ip ?? "—"],
                                ["เวลาที่ใช้", row.aud_duration_ms != null ? `${row.aud_duration_ms} ms` : "—"],
                            ].map(([k, v]) => (
                                <div key={String(k)}>
                                    <dt className="text-xs text-gray-400">{k}</dt>
                                    <dd className="mt-0.5 text-gray-800">{v}</dd>
                                </div>
                            ))}
                            <div className="sm:col-span-2">
                                <dt className="text-xs text-gray-400">อุปกรณ์ / เบราว์เซอร์</dt>
                                <dd className="mt-0.5 break-all text-xs text-gray-600">{row.aud_user_agent ?? "—"}</dd>
                            </div>
                        </dl>

                        {row.aud_changes && (
                            <div>
                                <h3 className="mb-2 font-semibold text-gray-700">ข้อมูลที่เปลี่ยน</h3>
                                <div className="overflow-x-auto rounded-lg border border-gray-100">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-gray-50 text-xs text-gray-500">
                                            <tr><th className="px-3 py-2 font-medium">ฟิลด์</th><th className="px-3 py-2 font-medium">ก่อน</th><th className="px-3 py-2 font-medium">หลัง</th></tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {Object.entries(row.aud_changes).map(([field, c]) => (
                                                <tr key={field} className="align-top">
                                                    <td className="whitespace-nowrap px-3 py-2 text-gray-600">{FIELD_LABEL[field] ?? field}</td>
                                                    {c.added || c.removed ? (
                                                        <td colSpan={2} className="px-3 py-2">
                                                            {(c.added ?? []).map((k) => <div key={`+${k}`} className="text-green-700">+ {PERMISSION_LABEL[k] ?? k}</div>)}
                                                            {(c.removed ?? []).map((k) => <div key={`-${k}`} className="text-red-600">− {PERMISSION_LABEL[k] ?? k}</div>)}
                                                            {!c.added?.length && !c.removed?.length && <span className="text-gray-400">ไม่มีสิทธิ์เปลี่ยน</span>}
                                                        </td>
                                                    ) : (
                                                        <>
                                                            <td className="break-all px-3 py-2 text-red-600/90">{formatValue(c.from)}</td>
                                                            <td className="break-all px-3 py-2 text-green-700">{formatValue(c.to)}</td>
                                                        </>
                                                    )}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {row.aud_payload && (
                            <div>
                                <h3 className="mb-2 font-semibold text-gray-700">ข้อมูลที่ส่งมา <span className="font-normal text-gray-400">(รหัสผ่าน/รหัส OTP ถูกปิดบัง)</span></h3>
                                <pre className="max-h-64 overflow-auto rounded-lg bg-gray-50 p-3 text-xs text-gray-700">{JSON.stringify(row.aud_payload, null, 2)}</pre>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

export default function AuditLogTab() {
    const [isPending, startTransition] = useTransition();
    const [rows, setRows] = useState<AuditRow[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [search, setSearch] = useState("");
    const [event, setEvent] = useState("");
    const [result, setResult] = useState("");
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const [detailId, setDetailId] = useState<number | null>(null);

    useEffect(() => {
        startTransition(async () => {
            const data = await getJson<{ data: AuditRow[]; total: number }>("/audit-logs", {
                limit: pageSize, offset: (page - 1) * pageSize, search, event, result, from, to,
            });
            setRows(data?.data ?? []);
            setTotal(data?.total ?? 0);
        });
    }, [page, pageSize, search, event, result, from, to]);

    const reset = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setPage(1); };

    const columns: Column<AuditRow>[] = [
        { key: "aud_created_at", header: "เวลา", className: "whitespace-nowrap", render: (v) => formatLogTime(v) },
        {
            key: "aud_user_fullname", header: "ผู้กระทำ",
            render: (_, r) => r.aud_user_fullname
                ? <div><div className="text-gray-800">{r.aud_user_fullname}</div><div className="text-xs text-gray-400">@{r.aud_user_username}</div></div>
                : <span className="text-gray-400">{r.aud_event === "view" && r.aud_path.startsWith("/share/") ? "ลูกค้า (ลิงก์)" : "ไม่ได้เข้าสู่ระบบ"}</span>,
        },
        {
            key: "aud_action", header: "การกระทำ",
            render: (_, r) => (
                <div className="flex flex-col gap-1">
                    <span className="flex items-center gap-2"><EventBadge event={r.aud_event} /> <span className="text-gray-800">{r.aud_action}</span></span>
                    {r.aud_entity_type && (
                        <span className="text-xs text-gray-400">{ENTITY_LABEL[r.aud_entity_type] ?? r.aud_entity_type} {r.aud_entity_id ?? ""}</span>
                    )}
                </div>
            ),
        },
        {
            key: "aud_success", header: "ผลลัพธ์",
            render: (_, r) => r.aud_success
                ? <span className="text-green-700">สำเร็จ</span>
                : <span className="text-red-600" title={r.aud_error ?? undefined}>ไม่สำเร็จ ({r.aud_status})</span>,
        },
        { key: "aud_ip", header: "IP", render: (v) => (v as string) || "-" },
    ];

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                <FilterSelect label="ประเภทเหตุการณ์" value={event} onChange={reset(setEvent)} options={[
                    ["", "ทุกเหตุการณ์"], ["create", "สร้าง"], ["update", "แก้ไข"], ["delete", "ลบ"], ["action", "ดำเนินการ"],
                    ["view", "เปิดดูข้อมูลสำคัญ"], ["denied", "ถูกปฏิเสธ (ไม่มีสิทธิ์)"], ["error", "ผิดพลาด"],
                ]} />
                <FilterSelect label="ผลลัพธ์" value={result} onChange={reset(setResult)} options={[["", "ทุกผลลัพธ์"], ["success", "สำเร็จ"], ["failed", "ไม่สำเร็จ"]]} />
                <DateRange from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); setPage(1); }} />
            </div>

            <DataTable
                columns={columns}
                data={rows}
                rowKey="aud_id"
                loading={isPending}
                total={total}
                page={page}
                pageSize={pageSize}
                pageSizeOptions={[20, 50, 100]}
                onPageChange={setPage}
                onPageSizeChange={reset(setPageSize)}
                searchable
                searchPlaceholder="ค้นหาผู้ใช้ / การกระทำ / รหัส / IP..."
                searchValue={search}
                onSearch={reset(setSearch)}
                emptyMessage="ยังไม่มีประวัติการใช้งาน"
                actions={(r) => <ViewButton onClick={() => setDetailId(r.aud_id)} />}
            />

            {detailId !== null && <DetailModal id={detailId} onClose={() => setDetailId(null)} />}
        </div>
    );
}
