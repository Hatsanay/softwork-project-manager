"use client";

// ต่ออายุบริการ (2026-10-31 · docs/plans/2026-10-31-recurring-services.md ข้อ 5.2)
// แท็บ ใกล้ครบ (30 วัน · ค่าเริ่ม) / เลยกำหนด / พักไว้ / ทั้งหมด · เห็นเฉพาะช่องทางที่มีสิทธิ์ (ลูกค้าตรง = ออกใบแจ้งหนี้ · Fastwork = จัดการ Fastwork)
// ปุ่มดูในแถว = แผงรายละเอียด (แก้ · ประวัติรอบ · พัก/เปิดต่อ/ยกเลิก) · ปุ่มเพิ่ม = ลูกค้าเก่าที่ต่ออายุอยู่ก่อนมีระบบ
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import PageHeader from "@/components/ui/page-header";
import Segmented from "@/components/ui/segmented";
import DataTable, { type Column } from "@/components/ui/datatable/datatable";
import StatusPill from "@/components/ui/status-pill";
import StatusBanner from "@/components/ui/guidance/status-banner";
import FieldHint from "@/components/ui/guidance/field-hint";
import { PageSkeleton } from "@/components/ui/skeleton";
import { buttonClass } from "@/components/ui/button";
import ViewButton from "@/components/ui/Button/ViewButton";
import { usePermission, BITS } from "@/app/components/permission-provider";
import { apiFetch } from "@/lib/api";
import { formatAmount } from "@/lib/shared/money.mjs";
import { thaiShortDate } from "@/lib/shared/thai-date.mjs";
import { CHANNEL_LABELS, RENEWAL_MESSAGES, STATUS_LABELS, dueText, perCycleText, renewalTitle } from "./_messages";
import type { Renewal, RenewalList, RenewalTab } from "./_types";
import RenewalFormDrawer from "./_components/renewal-form-drawer";
import RenewalDetailDrawer from "./_components/renewal-detail-drawer";

const TABS: { value: RenewalTab; label: string }[] = [
    { value: "due_soon", label: "ใกล้ครบ" },
    { value: "overdue", label: "เลยกำหนด" },
    { value: "paused", label: "พักไว้" },
    { value: "all", label: "ทั้งหมด" },
];

const EMPTY_MESSAGES: Record<RenewalTab, string> = {
    due_soon: "ไม่มีรายการที่ครบภายใน 30 วัน",
    overdue: "ไม่มีรายการที่เลยกำหนด",
    paused: "ไม่มีรายการที่พักไว้",
    all: "ยังไม่มีรายการต่ออายุ · กด เพิ่มรายการ หรือตั้งสินค้าเป็นบริการรายรอบ ระบบสร้างให้ตอนลูกค้าตอบรับ",
};

export default function RenewalsPage() {
    return (
        <Suspense fallback={<PageSkeleton />}>
            <Renewals />
        </Suspense>
    );
}

function Renewals() {
    const hasBit = usePermission();
    const canSee = hasBit(BITS.createInvoice) || hasBit(BITS.manageFastwork);
    const searchParams = useSearchParams();
    // ลิงก์จากแดชบอร์ด (?tab=overdue) เปิดแท็บนั้นเลย
    const [tab, setTab] = useState<RenewalTab>(() => {
        const requested = searchParams.get("tab");
        return TABS.some((option) => option.value === requested) ? (requested as RenewalTab) : "due_soon";
    });
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [list, setList] = useState<RenewalList | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [reloadCount, setReloadCount] = useState(0);
    const [isAdding, setIsAdding] = useState(false);
    const [openedId, setOpenedId] = useState<string | null>(null);
    // ออกใบรวม (ลูกค้าตรง · ลูกค้าเดียวกัน · ใช้งานอยู่)
    const [selected, setSelected] = useState<Renewal[]>([]);
    const [isInvoicing, setIsInvoicing] = useState(false);
    const router = useRouter();
    const canInvoice = hasBit(BITS.createInvoice);

    useEffect(() => {
        if (!canSee) return;
        let isLeftPage = false;
        const query = new URLSearchParams({
            tab,
            search,
            limit: String(pageSize),
            offset: String((page - 1) * pageSize),
        });
        apiFetch<RenewalList>(`/renewals?${query}`).then(({ data }) => {
            if (isLeftPage) return;
            setList(data);
            setIsLoading(false);
        });
        return () => {
            isLeftPage = true;
        };
    }, [canSee, tab, search, page, pageSize, reloadCount]);

    const reload = () => setReloadCount((count) => count + 1);

    // เหตุผลที่ออกใบรวมไม่ได้ (บอกบนจอ ไม่ปิดปุ่มเงียบๆ)
    const selectionProblem = (() => {
        if (selected.some((row) => row.rnw_channel !== "direct"))
            return "รายการของผู้ซื้อ Fastwork ออกใบแจ้งหนี้ไม่ได้ (รับเป็นงานต่ออายุแทน)";
        if (selected.some((row) => row.rnw_status !== "active")) return "เลือกได้เฉพาะรายการที่ใช้งานอยู่";
        if (new Set(selected.map((row) => row.rnw_client_id)).size > 1)
            return "ออกใบรวมได้เฉพาะรายการของลูกค้ารายเดียวกัน";
        return null;
    })();

    async function invoiceSelected() {
        setIsInvoicing(true);
        const { data, error } = await apiFetch<{ inv_id: string; renewal_count: number }>("/renewals/invoice", {
            method: "POST",
            body: { items: selected.map((row) => ({ rnw_id: row.rnw_id, rnw_version: row.rnw_version })) },
        });
        setIsInvoicing(false);
        if (error) {
            toast.error(error.message);
            reload();
            return;
        }
        toast.success(`สร้างร่างใบแจ้งหนี้ ${data.renewal_count} รายการแล้ว · ตรวจแล้วส่งอนุมัติ`);
        router.push(`/sales/invoices/view?id=${data.inv_id}`);
    }
    const header = (
        <PageHeader
            eyebrow="ขาย"
            title="ต่ออายุบริการ"
            description={RENEWAL_MESSAGES.page}
            actions={
                canSee && (
                    <button type="button" className={buttonClass("primary", "md")} onClick={() => setIsAdding(true)}>
                        <Plus size={16} />
                        เพิ่มรายการ
                    </button>
                )
            }
        />
    );

    if (!canSee) {
        return (
            <div className="grid w-full grid-cols-1 gap-6">
                {header}
                <StatusBanner tone="info" title="ต้องมีสิทธิ์สร้างใบแจ้งหนี้ หรือจัดการงาน Fastwork">
                    รายการของลูกค้าตรงใช้สิทธิ์สร้างใบแจ้งหนี้ · รายการของผู้ซื้อ Fastwork ใช้สิทธิ์จัดการงาน Fastwork
                </StatusBanner>
            </div>
        );
    }

    const columns: Column<Renewal>[] = [
        {
            key: "rnw_label",
            mobile: "title",
            header: "บริการ",
            render: (_, row) => (
                <div className="grid min-w-0 gap-0.5 whitespace-normal sm:w-56">
                    <span className="wrap-break-word text-gray-900">{renewalTitle(row)}</span>
                    <span className="text-xs text-gray-500">
                        {row.rnw_label ? row.product_name : ""}
                        {row.rnw_label && row.project_name ? " · " : ""}
                        {row.project_name ?? ""}
                    </span>
                    {(row.client_status !== "active" || row.product_status !== "active") && (
                        <span className="text-xs text-amber-600">
                            {row.client_status !== "active" ? "ลูกค้าปิดใช้งานแล้ว" : "สินค้าปิดใช้งานแล้ว"} ·
                            ตรวจก่อนต่ออายุ
                        </span>
                    )}
                </div>
            ),
        },
        { key: "client_name", mobile: "meta", header: "ลูกค้า" },
        {
            key: "rnw_price",
            mobile: "meta",
            header: "ราคาต่อรอบ",
            className: "text-right tabular-nums whitespace-nowrap",
            render: (_, row) => `${formatAmount(row.rnw_price)} ${perCycleText(row.rnw_cycle_months)}`,
        },
        {
            key: "rnw_next_due_date",
            mobile: "trailing",
            header: "ครบรอบถัดไป",
            className: "whitespace-nowrap",
            render: (_, row) => (
                <span className="grid justify-items-end gap-0.5 text-right sm:justify-items-start sm:text-left">
                    <span className="tabular-nums text-gray-900">{thaiShortDate(row.rnw_next_due_date)}</span>
                    {row.rnw_status === "active" && (
                        <span className={`text-xs ${row.days_left < 0 ? "text-red-600" : "text-gray-500"}`}>
                            {dueText(row.days_left)}
                        </span>
                    )}
                </span>
            ),
        },
        {
            key: "rnw_channel",
            mobile: "badge",
            header: "ช่องทาง / สถานะ",
            render: (_, row) => (
                <span className="flex flex-wrap gap-1.5">
                    <StatusPill tone="neutral">{CHANNEL_LABELS[row.rnw_channel]}</StatusPill>
                    {row.rnw_status !== "active" && (
                        <StatusPill tone={row.rnw_status === "paused" ? "wait" : "neutral"}>
                            {STATUS_LABELS[row.rnw_status]}
                        </StatusPill>
                    )}
                </span>
            ),
        },
    ];

    return (
        <div className="grid w-full grid-cols-1 gap-5">
            {header}
            {list && (
                <div className="grid gap-1.5">
                    <Segmented<RenewalTab>
                        label="กรองรายการต่ออายุ"
                        value={tab}
                        onChange={(value) => {
                            setTab(value);
                            setPage(1);
                        }}
                        options={TABS.map((option) => ({
                            ...option,
                            count: option.value === "all" ? undefined : list.counts[option.value],
                        }))}
                    />
                    {list.channels.length === 1 && (
                        <FieldHint>เห็นเฉพาะรายการ{CHANNEL_LABELS[list.channels[0]]}ตามสิทธิ์ของคุณ</FieldHint>
                    )}
                </div>
            )}
            {selected.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
                    <span className="grid gap-0.5 text-sm">
                        <span className="text-gray-900">เลือก {selected.length} รายการ</span>
                        <span className={selectionProblem ? "text-amber-700" : "text-gray-600"}>
                            {selectionProblem ?? "สร้างร่างใบแจ้งหนี้ใบเดียว รอบละบรรทัด · วันครบขยับไปรอบถัดไป"}
                        </span>
                    </span>
                    <button
                        type="button"
                        disabled={Boolean(selectionProblem) || isInvoicing}
                        onClick={invoiceSelected}
                        className={buttonClass("primary", "md")}
                    >
                        {isInvoicing ? "กำลังสร้าง..." : "ออกใบแจ้งหนี้รวม"}
                    </button>
                </div>
            )}
            <DataTable
                columns={columns}
                selectable={canInvoice && tab !== "paused"}
                onSelectionChange={setSelected}
                data={list?.data ?? []}
                rowKey="rnw_id"
                loading={isLoading}
                total={list?.total ?? 0}
                page={page}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                    setPageSize(size);
                    setPage(1);
                }}
                searchable
                searchValue={search}
                searchPlaceholder="ค้นหาชื่อที่จำง่าย ลูกค้า หรือสินค้า"
                onSearch={(value) => {
                    setSearch(value);
                    setPage(1);
                }}
                actions={(row) => <ViewButton onClick={() => setOpenedId(row.rnw_id)} />}
                emptyMessage={search ? "ไม่พบรายการที่ค้นหา" : EMPTY_MESSAGES[tab]}
            />
            {isAdding && list && (
                <RenewalFormDrawer
                    channels={list.channels}
                    onClose={() => setIsAdding(false)}
                    onSaved={() => {
                        setIsAdding(false);
                        reload();
                    }}
                />
            )}
            {openedId && (
                <RenewalDetailDrawer renewalId={openedId} onClose={() => setOpenedId(null)} onChanged={reload} />
            )}
        </div>
    );
}
