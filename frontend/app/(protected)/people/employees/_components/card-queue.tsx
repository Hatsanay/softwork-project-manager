"use client";

// คิวงานบัตรของฝ่ายบุคคล (2026-10-18 ข้อ 3.4) — แท็บ "บัตรรอพิมพ์" และ "บัตรที่ยังไม่ได้คืน" ในหน้ารายการพนักงาน
import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Printer } from "lucide-react";
import StatusPill from "@/components/ui/status-pill";
import EmptyState from "@/components/ui/empty-state";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import StatusBanner from "@/components/ui/guidance/status-banner";
import { CARD_CLASS } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import formatDate, { formatDateOnly } from "@/app/function";
import { apiFetch } from "@/lib/api";
import { EMPLOYEE_CARD_REASONS } from "@/lib/shared/schemas/people.mjs";
import type { CardQueueRow } from "../../_types";
import { cardPrintHref, cardStatusOf, todayBangkokText } from "../_card-status";

export type CardQueueKind = "pending_print" | "not_returned" | "expiring";

const QUEUE_TEXT: Record<CardQueueKind, { title: string; description: string; empty: string }> = {
    pending_print: {
        title: "บัตรรอพิมพ์",
        description:
            "บัตรใบที่ใช้อยู่ที่ยังไม่เคยพิมพ์ (พนักงานใหม่ · รหัสเปลี่ยน · ออกบัตรใหม่) · เปิดหน้าพิมพ์แล้วกดพิมพ์ ระบบบันทึกว่าพิมพ์แล้วให้เอง",
        empty: "ไม่มีบัตรรอพิมพ์",
    },
    not_returned: {
        title: "บัตรที่ยังไม่ได้คืน",
        description:
            "บัตรที่พิมพ์ไปแล้วแต่ใช้ไม่ได้แล้ว (ออกใบใหม่แทน · ย้ายแผนก · พ้นสภาพ) · ตามเก็บบัตรตัวจริงคืน แล้วกดบันทึกว่าคืนแล้ว",
        empty: "เก็บบัตรคืนครบแล้ว",
    },
    expiring: {
        title: "บัตรใกล้หมดอายุ",
        description:
            "บัตรที่ใช้อยู่ที่หมดอายุแล้ว หรือจะหมดภายใน 30 วัน (อายุบัตรตั้งที่ ตั้งค่าบุคคล) · ต่ออายุ = ออกบัตรใบใหม่รหัสเดิม ใบเดิมยกเลิก แล้วไปพิมพ์ที่แท็บบัตรรอพิมพ์ และเก็บใบเดิมคืน",
        empty: "ไม่มีบัตรใกล้หมดอายุ",
    },
};

export default function CardQueue({
    kind,
    rows,
    onChanged,
}: {
    kind: CardQueueKind;
    rows: CardQueueRow[] | null;
    onChanged: () => void;
}) {
    const [returnTarget, setReturnTarget] = useState<CardQueueRow | null>(null);
    const [renewTarget, setRenewTarget] = useState<CardQueueRow | null>(null);
    const [renewError, setRenewError] = useState<string | null>(null);
    const [isRenewing, setIsRenewing] = useState(false);
    const today = todayBangkokText();
    const [returnError, setReturnError] = useState<string | null>(null);
    const [isReturning, setIsReturning] = useState(false);
    const text = QUEUE_TEXT[kind];

    async function markReturned() {
        if (!returnTarget) return;
        setIsReturning(true);
        const { error } = await apiFetch(
            `/employees/${returnTarget.ec_employee_id}/cards/${returnTarget.ec_id}/returned`,
            { method: "POST" },
        );
        setIsReturning(false);
        if (error) {
            setReturnError(error.message);
            return;
        }
        toast.success(`บันทึกว่าเก็บบัตร ${returnTarget.ec_name_th} คืนแล้ว`);
        setReturnTarget(null);
        setReturnError(null);
        onChanged();
    }

    async function renewCard() {
        if (!renewTarget) return;
        setIsRenewing(true);
        const { error } = await apiFetch(`/employees/${renewTarget.ec_employee_id}/cards`, {
            method: "POST",
            body: { ec_reason: "expired" },
        });
        setIsRenewing(false);
        if (error) {
            setRenewError(error.message);
            return;
        }
        toast.success(`ออกบัตรใหม่ให้ ${renewTarget.ec_name_th} แล้ว · ไปพิมพ์ที่แท็บบัตรรอพิมพ์`);
        setRenewTarget(null);
        setRenewError(null);
        onChanged();
    }

    return (
        <div className="grid gap-4">
            <StatusBanner tone="info" title={text.title}>
                {text.description}
            </StatusBanner>
            {rows === null ? (
                <p className="text-sm text-gray-500">กำลังโหลด...</p>
            ) : rows.length === 0 ? (
                <EmptyState title={text.empty} />
            ) : (
                <ol className={`grid divide-y divide-gray-100 ${CARD_CLASS}`}>
                    {rows.map((row) => {
                        // คิวรอพิมพ์ไม่มีคนพ้นสภาพ (backend กรองแล้ว) · คิวไม่ได้คืน: บัตรที่ยังไม่ยกเลิก = ของคนพ้นสภาพ
                        const isTerminated = kind === "not_returned" && !row.ec_voided_at;
                        const status = cardStatusOf({ ...row, ec_returned_at: null }, isTerminated, today);
                        return (
                            <li key={row.ec_id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
                                <div className="grid min-w-0 gap-0.5 text-sm">
                                    <span className="flex flex-wrap items-center gap-2">
                                        <Link
                                            href={`/people/employees/view?id=${row.ec_employee_id}`}
                                            className="font-medium text-gray-900 hover:text-blue-600"
                                        >
                                            {row.ec_name_th}
                                        </Link>
                                        <StatusPill tone={status.tone}>{status.label}</StatusPill>
                                    </span>
                                    <span className="tracking-wider break-all text-gray-700 tabular-nums">
                                        {row.ec_emp_code} · ใบที่ {row.ec_seq}
                                    </span>
                                    <span className="text-xs text-gray-500">
                                        {row.ec_department_name ?? "-"}
                                        {row.ec_branch_name ? ` · ${row.ec_branch_name}` : ""} · ออก {formatDate(row.ec_issued_at)} · ใช้ได้ถึง{" "}
                                        {formatDateOnly(row.ec_expires_on)} ·{" "}
                                        {EMPLOYEE_CARD_REASONS[row.ec_reason]}
                                        {row.ec_void_reason ? ` · ยกเลิกเพราะ ${row.ec_void_reason}` : ""}
                                    </span>
                                </div>
                                {kind === "expiring" && (
                                    <button
                                        type="button"
                                        className={buttonClass("primary", "sm")}
                                        onClick={() => setRenewTarget(row)}
                                    >
                                        ต่ออายุบัตร
                                    </button>
                                )}
                                {kind === "pending_print" && (
                                    <Link
                                        href={cardPrintHref(row.ec_employee_id, row.ec_id)}
                                        target="_blank"
                                        className={buttonClass("primary", "sm")}
                                    >
                                        <Printer size={15} />
                                        พิมพ์บัตร
                                    </Link>
                                )}
                                {kind === "not_returned" && (
                                    <button
                                        type="button"
                                        className={buttonClass("secondary", "sm")}
                                        onClick={() => setReturnTarget(row)}
                                    >
                                        บันทึกว่าคืนแล้ว
                                    </button>
                                )}
                            </li>
                        );
                    })}
                </ol>
            )}
            <ConfirmDialog
                open={renewTarget !== null}
                title={`ต่ออายุบัตรของ ${renewTarget?.ec_name_th ?? ""}?`}
                description="ออกบัตรใบใหม่รหัสเดิม อายุนับจากวันนี้ตามตั้งค่า · บัตรใบเดิมยกเลิกทันที ต้องเก็บคืนหลังให้บัตรใหม่"
                confirmLabel="ออกบัตรใหม่"
                variant="info"
                loading={isRenewing}
                errorMessage={renewError}
                onConfirm={renewCard}
                onCancel={() => {
                    setRenewTarget(null);
                    setRenewError(null);
                }}
            />
            <ConfirmDialog
                open={returnTarget !== null}
                title={`เก็บบัตรของ ${returnTarget?.ec_name_th ?? ""} คืนแล้ว?`}
                description="บันทึกเมื่อได้บัตรตัวจริงคืนมาแล้วเท่านั้น · บัตรออกจากรายการนี้"
                confirmLabel="บันทึกว่าคืนแล้ว"
                variant="info"
                loading={isReturning}
                errorMessage={returnError}
                onConfirm={markReturned}
                onCancel={() => {
                    setReturnTarget(null);
                    setReturnError(null);
                }}
            />
        </div>
    );
}
