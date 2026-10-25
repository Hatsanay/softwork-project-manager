"use client";

// คำขอบริการ (2026-10-25 · S-1) — คำขอที่ลูกค้าส่งจากลิงก์เลือกบริการ · รอตรวจขึ้นก่อน
// ?status= กรองสถานะ · ?link=<id> เฉพาะคำขอจากลิงก์เดียว (มาจากหน้าลิงก์)
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/page-header";
import Segmented from "@/components/ui/segmented";
import StatusBanner from "@/components/ui/guidance/status-banner";
import EmptyState from "@/components/ui/empty-state";
import StatusPill from "@/components/ui/status-pill";
import { PageSkeleton } from "@/components/ui/skeleton";
import { CARD_CLASS } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { usePermission, BITS } from "@/app/components/permission-provider";
import { apiFetch, type ApiError } from "@/lib/api";
import { formatAmount } from "@/lib/shared/money.mjs";
import { LINK_KIND_LABEL, type ServiceRequestRow, type ServiceRequestStatus } from "../order-links/_types";
import { REQUEST_STATUS, requestStatusOf } from "./_status";

type Filter = "all" | ServiceRequestStatus;
const FILTERS: Filter[] = ["submitted", "converted", "rejected", "closed", "all"];

export default function ServiceRequestsPage() {
    return (
        <Suspense fallback={<PageSkeleton />}>
            <ServiceRequestsContent />
        </Suspense>
    );
}

function ServiceRequestsContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const hasBit = usePermission();
    const canManage = hasBit(BITS.manageServiceRequests);
    const linkFilter = searchParams.get("link");
    const requested = searchParams.get("status") as Filter | null;
    const [filter, setFilter] = useState<Filter>(requested && FILTERS.includes(requested) ? requested : linkFilter ? "all" : "submitted");
    const [rows, setRows] = useState<ServiceRequestRow[] | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);

    useEffect(() => {
        if (!canManage) return;
        let isLeftPage = false;
        const query = new URLSearchParams();
        if (filter !== "all") query.set("status", filter);
        if (linkFilter) query.set("link", linkFilter);
        apiFetch<{ data: ServiceRequestRow[] }>(`/service-requests?${query}`).then(({ data, error }) => {
            if (isLeftPage) return;
            setLoadError(error);
            if (data) setRows(data.data);
        });
        return () => {
            isLeftPage = true;
        };
    }, [canManage, filter, linkFilter]);

    const header = (
        <PageHeader
            eyebrow="ขาย"
            title="คำขอบริการ"
            description="คำขอที่ลูกค้าส่งจากลิงก์เลือกบริการ · ตรวจรายการและราคา แล้วออกใบเสนอราคาหรือเปิดโปรเจกต์"
            actions={
                <Link href="/sales/order-links" className={buttonClass("secondary", "md")}>
                    ลิงก์เลือกบริการ
                </Link>
            }
        />
    );
    if (!canManage) {
        return (
            <div className="grid w-full grid-cols-1 gap-6">
                {header}
                <StatusBanner tone="info" title="ต้องมีสิทธิ์จัดการลิงก์เลือกบริการและคำขอบริการ" />
            </div>
        );
    }
    if (loadError) {
        return (
            <div className="grid w-full grid-cols-1 gap-6">
                {header}
                <StatusBanner tone="error" title="โหลดคำขอไม่สำเร็จ">
                    {loadError.message}
                </StatusBanner>
            </div>
        );
    }

    return (
        <div className="grid w-full grid-cols-1 gap-5">
            {header}
            {linkFilter && (
                <div className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
                    <span>เฉพาะคำขอจากลิงก์ที่เลือก</span>
                    <button type="button" className="min-h-9 text-blue-600 hover:underline" onClick={() => router.push("/sales/service-requests")}>
                        ดูทุกลิงก์
                    </button>
                </div>
            )}
            <Segmented<Filter>
                label="สถานะ"
                value={filter}
                onChange={(value) => {
                    setRows(null);
                    setFilter(value);
                }}
                options={FILTERS.map((value) => ({ value, label: value === "all" ? "ทั้งหมด" : REQUEST_STATUS[value].label }))}
            />
            {!rows ? (
                <PageSkeleton />
            ) : rows.length === 0 ? (
                <EmptyState title="ไม่มีคำขอในสถานะนี้" description="สร้างลิงก์เลือกบริการแล้วส่งให้ลูกค้า คำขอจะขึ้นที่นี่" />
            ) : (
                <ul className="grid gap-2">
                    {rows.map((row) => {
                        const status = requestStatusOf(row);
                        return (
                            <li key={row.svr_id}>
                                <Link
                                    href={`/sales/service-requests/view?id=${row.svr_id}`}
                                    className={`grid gap-1 p-4 transition hover:border-blue-300 sm:grid-cols-[1fr_auto] sm:items-center ${CARD_CLASS}`}
                                >
                                    <div className="grid min-w-0 gap-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <StatusPill tone={status.tone}>{status.label}</StatusPill>
                                            <StatusPill tone="neutral">{LINK_KIND_LABEL[row.ol_kind]}</StatusPill>
                                            <span className="font-medium wrap-break-word text-gray-900">
                                                {row.svr_company_name || row.client_name || row.svr_contact_name || "-"}
                                            </span>
                                        </div>
                                        <span className="text-xs text-gray-500">
                                            {[row.svr_id, row.svr_submitted_at, row.svr_contact_phone, row.ol_name, `ผู้รับ ${row.assignee_name ?? "-"}`]
                                                .filter(Boolean)
                                                .join(" · ")}
                                        </span>
                                    </div>
                                    <span className="text-sm text-gray-900 tabular-nums sm:text-right">
                                        {formatAmount(row.totals?.total ?? "0")} บาท
                                        <span className="block text-xs text-gray-500">{row.item_count} รายการ · ยอดประมาณการ</span>
                                    </span>
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
