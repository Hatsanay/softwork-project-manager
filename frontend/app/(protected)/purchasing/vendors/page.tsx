"use client";

// รายการผู้ขาย (2026-10-16 เฟส 2 ขั้น 2-1) — ค้นหาชื่อ/รหัส/เลขผู้เสียภาษี · แท็บสถานะ · แบบ ภ.ง.ด. ของแต่ละราย
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import DataTable, { type Column } from "@/components/ui/datatable/datatable";
import PageHeader from "@/components/ui/page-header";
import Segmented from "@/components/ui/segmented";
import EditButton from "@/components/ui/Button/EditButton";
import DeleteButton from "@/components/ui/Button/DeleteButton";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { ActiveStatusPill } from "@/components/ui/status-pill";
import { buttonClass } from "@/components/ui/button";
import { usePermission, BITS } from "@/app/components/permission-provider";
import { apiFetch } from "@/lib/api";
import { VENDOR_MESSAGES, whtFormLabel } from "../_messages";
import type { Vendor } from "../_types";

type StatusTab = "active" | "inactive" | "all";

const TABS: { value: StatusTab; label: string }[] = [
    { value: "active", label: "ใช้งาน" },
    { value: "inactive", label: "ปิดใช้งาน" },
    { value: "all", label: "ทั้งหมด" },
];

function branchLabel(branchCode: string | null) {
    if (!branchCode) return "";
    return branchCode === "00000" ? " · สำนักงานใหญ่" : ` · สาขา ${branchCode}`;
}

export default function VendorsPage() {
    const router = useRouter();
    const hasBit = usePermission();
    const canManage = hasBit(BITS.manageVendors);
    const [tab, setTab] = useState<StatusTab>("active");
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [rows, setRows] = useState<Vendor[]>([]);
    const [total, setTotal] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [reloadKey, setReloadKey] = useState(0);
    const [deleteTarget, setDeleteTarget] = useState<Vendor | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        let isLeftPage = false;
        const query = new URLSearchParams({
            search,
            limit: String(pageSize),
            offset: String((page - 1) * pageSize),
        });
        if (tab !== "all") query.set("status", tab);
        apiFetch<{ data: Vendor[]; total: number }>(`/vendors?${query}`).then(({ data }) => {
            if (isLeftPage) return;
            setRows(data?.data ?? []);
            setTotal(data?.total ?? 0);
            setIsLoading(false);
        });
        return () => {
            isLeftPage = true;
        };
    }, [tab, search, page, pageSize, reloadKey]);

    async function handleDelete() {
        if (!deleteTarget) return;
        setIsDeleting(true);
        const { error } = await apiFetch(`/vendors/${deleteTarget.vd_id}`, { method: "DELETE" });
        setIsDeleting(false);
        if (error) {
            setDeleteError(error.message);
            return;
        }
        toast.success("ลบผู้ขายแล้ว");
        setDeleteTarget(null);
        setDeleteError(null);
        setReloadKey((current) => current + 1);
    }

    const columns: Column<Vendor>[] = [
        {
            key: "vd_name",
            header: "ผู้ขาย",
            render: (_, row) => (
                <div className="grid min-w-0 gap-0.5">
                    <span className="font-medium text-gray-800">{row.vd_name}</span>
                    <span className="text-xs text-gray-500">
                        {row.vd_code ? `${row.vd_code} · ` : ""}
                        {row.vd_type === "juristic" ? "นิติบุคคล" : "บุคคลธรรมดา"}
                        {row.vd_country !== "TH" ? ` · ${row.vd_country}` : ""}
                    </span>
                </div>
            ),
        },
        {
            key: "vd_tax_id",
            header: "ภาษี",
            render: (_, row) => (
                <div className="grid gap-0.5 text-sm">
                    <span className="tabular-nums">
                        {row.vd_tax_id ?? "—"}
                        {branchLabel(row.vd_branch_code)}
                    </span>
                    <span className="text-xs text-gray-500">{whtFormLabel(row.wht_form)}</span>
                </div>
            ),
        },
        {
            key: "vd_bank_account_no",
            header: "บัญชีรับเงิน",
            render: (_, row) =>
                row.vd_bank_account_no ? (
                    <div className="grid gap-0.5 text-sm">
                        <span>{row.vd_bank_name}</span>
                        <span className="text-xs text-gray-500 tabular-nums">{row.vd_bank_account_no}</span>
                    </div>
                ) : (
                    <span className="text-xs text-gray-400">
                        {row.vd_promptpay_id ? `พร้อมเพย์ ${row.vd_promptpay_id}` : "ยังไม่ระบุ"}
                    </span>
                ),
        },
        {
            key: "vd_status",
            header: "สถานะ",
            render: (_, row) => <ActiveStatusPill isActive={row.vd_status === "active"} />,
        },
    ];

    return (
        <div className="grid grid-cols-1 gap-6">
            <PageHeader
                eyebrow="จัดซื้อ"
                title="ผู้ขาย"
                description={VENDOR_MESSAGES.listDescription}
                actions={
                    canManage && (
                        <button
                            type="button"
                            className={buttonClass("primary", "md")}
                            onClick={() => router.push("/purchasing/vendors/new")}
                        >
                            <Plus size={16} />
                            เพิ่มผู้ขาย
                        </button>
                    )
                }
            />
            <Segmented<StatusTab>
                label="สถานะ"
                value={tab}
                onChange={(value) => {
                    setTab(value);
                    setPage(1);
                }}
                options={TABS}
            />
            <DataTable
                columns={columns}
                data={rows}
                rowKey="vd_id"
                loading={isLoading}
                total={total}
                page={page}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                    setPageSize(size);
                    setPage(1);
                }}
                searchable
                searchPlaceholder="ค้นหาชื่อ รหัส หรือเลขผู้เสียภาษี..."
                searchValue={search}
                onSearch={(value) => {
                    setSearch(value);
                    setPage(1);
                }}
                emptyMessage="ยังไม่มีผู้ขาย"
                actions={
                    canManage
                        ? (row) => (
                              <div className="flex items-center justify-end gap-2">
                                  <EditButton onClick={() => router.push(`/purchasing/vendors/edit?id=${row.vd_id}`)} />
                                  <DeleteButton onClick={() => setDeleteTarget(row)} />
                              </div>
                          )
                        : undefined
                }
            />
            <ConfirmDialog
                open={Boolean(deleteTarget)}
                title="ลบผู้ขายนี้?"
                description={
                    deleteTarget
                        ? `"${deleteTarget.vd_name}" จะถูกลบถาวร · ผู้ขายที่มีเอกสารแล้วลบไม่ได้ ให้แก้เป็นปิดใช้งานแทน`
                        : undefined
                }
                confirmLabel="ลบ"
                loading={isDeleting}
                errorMessage={deleteError}
                onConfirm={handleDelete}
                onCancel={() => {
                    setDeleteTarget(null);
                    setDeleteError(null);
                }}
            />
        </div>
    );
}
