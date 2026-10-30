"use client";

// ส่วนแบ่งกำไรรายโปรเจกต์ (2026-10-25 · P-2 · ขั้นที่ 2, 7, 8, 9 ของหน้า Fastwork)
// ตัวกรองจากลิงก์: ?state=unset (ยังไม่ตั้ง) · open (ตั้งแล้ว ยังไม่ปิดยอด) · ready (เงินเข้าครบ พร้อมปิดยอด) · unpaid (ค้างจ่าย) · paid
// รายการ = งาน Fastwork ทุกงาน + โปรเจกต์ลูกค้าตรงที่ตั้งส่วนแบ่งแล้ว · กดแถวไปหน้าจัดการของโปรเจกต์นั้น
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/page-header";
import Segmented from "@/components/ui/segmented";
import StatusBanner from "@/components/ui/guidance/status-banner";
import HowItWorks from "@/components/ui/guidance/how-it-works";
import EmptyState from "@/components/ui/empty-state";
import StatusPill, { type PillTone } from "@/components/ui/status-pill";
import { PageSkeleton } from "@/components/ui/skeleton";
import { CARD_CLASS } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { usePermission, BITS } from "@/app/components/permission-provider";
import { apiFetch, type ApiError } from "@/lib/api";
import { formatAmount } from "@/lib/shared/money.mjs";
import { formatDateOnly } from "@/app/function";
import type { ShareListState, ShareProjectRow } from "../_types";
import { SHARE_MESSAGES } from "../_messages";

type Filter = "all" | "ready" | ShareListState;

const FILTERS: Filter[] = ["all", "unset", "open", "ready", "unpaid", "paid"];

const STATE: Record<ShareListState, { label: string; tone: PillTone }> = {
    unset: { label: "ยังไม่ตั้งส่วนแบ่ง", tone: "neutral" },
    open: { label: "ตั้งแล้ว ยังไม่ปิดยอด", tone: "info" },
    unpaid: { label: "ปิดยอดแล้ว ค้างจ่าย", tone: "wait" },
    paid: { label: "จ่ายครบแล้ว", tone: "success" },
};

function matches(row: ShareProjectRow, filter: Filter) {
    if (filter === "all") return true;
    if (filter === "ready") return row.is_ready_to_settle;
    return row.state === filter;
}

export default function SharesPage() {
    return (
        <Suspense fallback={<PageSkeleton />}>
            <SharesContent />
        </Suspense>
    );
}

function SharesContent() {
    const searchParams = useSearchParams();
    const hasBit = usePermission();
    const canManage = hasBit(BITS.manageProfitShares);
    const requested = searchParams.get("state") as Filter | null;
    const [filter, setFilter] = useState<Filter>(requested && FILTERS.includes(requested) ? requested : "all");
    const [rows, setRows] = useState<ShareProjectRow[] | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);

    useEffect(() => {
        if (!canManage) return;
        let isLeftPage = false;
        apiFetch<{ data: ShareProjectRow[] }>("/profit-shares/projects").then(({ data, error }) => {
            if (isLeftPage) return;
            setLoadError(error);
            if (data) setRows(data.data);
        });
        return () => {
            isLeftPage = true;
        };
    }, [canManage]);

    const header = <PageHeader eyebrow="Fastwork · ขั้นที่ 2, 7-9" title="ส่วนแบ่งกำไร" description={SHARE_MESSAGES.description} />;
    if (!canManage) {
        return (
            <div className="grid w-full grid-cols-1 gap-6">
                {header}
                <StatusBanner tone="info" title="ต้องมีสิทธิ์จัดการส่วนแบ่งกำไร">
                    ส่วนแบ่งของทุกคนเห็นได้เฉพาะผู้มีสิทธิ์ &quot;จัดการส่วนแบ่งกำไร&quot; · ส่วนแบ่งของคุณเองดูได้ที่{" "}
                    <Link href="/people/my-shares" className="-my-2.5 inline-block py-2.5 text-blue-600 hover:underline">
                        ส่วนแบ่งของฉัน
                    </Link>
                </StatusBanner>
            </div>
        );
    }
    if (loadError) {
        return (
            <div className="grid w-full grid-cols-1 gap-6">
                {header}
                <StatusBanner tone="error" title="โหลดรายการไม่สำเร็จ">
                    {loadError.message}
                </StatusBanner>
            </div>
        );
    }
    if (!rows) return <PageSkeleton />;

    const count = (value: Filter) => rows.filter((row) => matches(row, value)).length;
    const shown = rows.filter((row) => matches(row, filter));
    const labels: Record<Filter, string> = {
        all: "ทั้งหมด",
        unset: "ยังไม่ตั้ง",
        open: "ยังไม่ปิดยอด",
        ready: "พร้อมปิดยอด",
        unpaid: "ค้างจ่าย",
        paid: "จ่ายครบ",
    };

    return (
        <div className="grid w-full grid-cols-1 gap-5">
            {header}
            <HowItWorks label="ส่วนแบ่งคิดอย่างไร">
                <p>{SHARE_MESSAGES.formula}</p>
                <p>{SHARE_MESSAGES.advance}</p>
                <p>{SHARE_MESSAGES.settle}</p>
            </HowItWorks>
            <Segmented<Filter>
                label="สถานะส่วนแบ่ง"
                value={filter}
                onChange={setFilter}
                options={FILTERS.map((value) => ({ value, label: labels[value], count: count(value) }))}
            />
            {filter === "ready" && <p className="text-sm text-gray-500">งาน Fastwork ที่เงินเข้าครบทุกงวดและไม่มีรายการรอโอน ปิดยอดได้เลย</p>}

            {shown.length === 0 ? (
                <EmptyState
                    title="ไม่มีโปรเจกต์ในสถานะนี้"
                    description="งาน Fastwork ทุกงานขึ้นที่นี่อัตโนมัติ · โปรเจกต์ลูกค้าตรงเปิดตั้งส่วนแบ่งได้จากหน้าโปรเจกต์"
                />
            ) : (
                <ul className="grid gap-2">
                    {shown.map((row) => {
                        const state = STATE[row.state];
                        return (
                            <li key={row.project_id} className={`grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center ${CARD_CLASS}`}>
                                <div className="grid min-w-0 gap-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <StatusPill tone={state.tone}>{state.label}</StatusPill>
                                        {row.is_ready_to_settle && <StatusPill tone="success">เงินเข้าครบ พร้อมปิดยอด</StatusPill>}
                                    </div>
                                    <Link
                                        href={`/fastwork/shares/project?id=${row.project_id}`}
                                        className="-my-2 inline-flex min-h-10 min-w-10 items-center font-medium wrap-break-word text-gray-900 hover:text-blue-600"
                                    >
                                        {row.project_name}
                                    </Link>
                                    <span className="text-xs text-gray-500">
                                        {[
                                            row.project_channel === "fastwork" ? "Fastwork" : "ลูกค้าตรง",
                                            row.client_name,
                                            row.share_count > 0 ? `ผู้รับ ${row.share_count} คน` : null,
                                            row.settled_date ? `ปิดยอด ${formatDateOnly(row.settled_date)}` : null,
                                        ]
                                            .filter(Boolean)
                                            .join(" · ")}
                                    </span>
                                    {row.distributable !== null && row.company_amount !== null && (
                                        <span className="text-sm text-gray-700 tabular-nums">
                                            กำไรที่แบ่งได้ {formatAmount(row.distributable)} · เข้าเงินทุน {formatAmount(row.company_amount)}
                                            {row.unpaid_count > 0 ? ` · ค้างจ่าย ${row.unpaid_count} คน` : ""}
                                        </span>
                                    )}
                                </div>
                                <Link href={`/fastwork/shares/project?id=${row.project_id}`} className={buttonClass("secondary", "sm")}>
                                    {row.state === "unset" ? "ตั้งส่วนแบ่ง" : row.state === "unpaid" ? "บันทึกจ่าย" : "เปิด"}
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
