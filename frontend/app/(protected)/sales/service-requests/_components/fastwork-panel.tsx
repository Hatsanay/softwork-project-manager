"use client";

// ขั้นตอนของคำขอจากลิงก์ Fastwork (2026-10-25 · S-5) — แทนส่วน "ยืนยันคำขอ" ของลูกค้าตรง
// ก่อนจ้าง: ออกใบเสนอราคาภายใน (ไม่ส่งลูกค้า) → ส่งราคาบน Fastwork → ผู้ซื้อจ่าย → "รับงานจากคำขอนี้" (หน้ารับงานใหม่ที่เติมให้)
// งานเดิม: "ลูกค้ายืนยันบน Fastwork แล้ว" → งวดเพิ่มต่อท้ายงวดเดิม + งานจากรายการ · ผู้ซื้อไม่จ้าง = ปิดคำขอ
import { useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import StatusBanner from "@/components/ui/guidance/status-banner";
import FieldHint from "@/components/ui/guidance/field-hint";
import FormField, { inputClass } from "@/components/ui/form-field";
import { buttonClass } from "@/components/ui/button";
import { usePermission, BITS } from "@/app/components/permission-provider";
import { apiFetch } from "@/lib/api";
import { toFieldErrors, type FieldErrors } from "@/lib/form-errors";
import { formatAmount, formatHundredths, parseHundredths } from "@/lib/shared/money.mjs";
import { serviceRequestFastworkAcceptSchema } from "@/lib/shared/schemas/service-request.mjs";
import { SheetButtons, SheetFrame } from "../../../fastwork/_components/sheet-frame";
import type { FastworkPlan, ServiceRequestRow } from "../../order-links/_types";

const QUOTATION_STATUS_LABEL: Record<string, string> = {
    draft: "ร่าง",
    pending_approval: "รออนุมัติ",
    approved: "อนุมัติแล้ว",
    accepted: "ผูกงานแล้ว",
    cancelled: "ยกเลิก",
    declined: "ไม่ได้งาน",
    expired: "หมดอายุ",
};

export default function FastworkPanel({
    request,
    plan,
    isEditingItems,
    onIssueQuotation,
    isIssuing,
    onClose,
    onAccepted,
}: {
    request: ServiceRequestRow;
    plan: FastworkPlan;
    isEditingItems: boolean;
    onIssueQuotation: () => void;
    isIssuing: boolean;
    onClose: () => void;
    onAccepted: () => Promise<void>;
}) {
    const hasBit = usePermission();
    const [isAccepting, setIsAccepting] = useState(false);
    const isExisting = plan.mode === "existing";
    const canIssueQuotation = request.svr_status === "submitted" && hasBit(BITS.createQuotation);

    return (
        <div className="grid gap-3">
            <ol className="grid gap-1.5 rounded-xl bg-gray-50 p-3 text-sm text-gray-700">
                <li>1. ตรวจและปรับรายการด้านบน · ออกใบเสนอราคาภายในไว้อ้างอิงได้ (ไม่ส่งลูกค้า)</li>
                <li>2. ส่งราคาบน Fastwork ด้วยยอดหลังปรับ · การคุยและการจ่ายเงินอยู่บน Fastwork ทั้งหมด</li>
                <li>
                    3. ผู้ซื้อจ่ายแล้ว กด {isExisting ? `"ลูกค้ายืนยันบน Fastwork แล้ว" (งวดเพิ่มในงาน ${request.link_project_name ?? ""})` : '"รับงานจากคำขอนี้" (เปิดงาน Fastwork ใหม่)'}
                </li>
            </ol>

            {plan.quotation ? (
                <p className="text-sm text-gray-700">
                    ใบเสนอราคาภายใน{" "}
                    <Link href={`/sales/quotations/view?id=${plan.quotation.qt_id}`} className="-my-2 inline-block py-2 text-blue-600 hover:underline">
                        {plan.quotation.qt_number}
                    </Link>{" "}
                    · {QUOTATION_STATUS_LABEL[plan.quotation.qt_status] ?? plan.quotation.qt_status}
                </p>
            ) : (
                canIssueQuotation && (
                    <div className="grid gap-1">
                        <button type="button" className={buttonClass("secondary", "md", "justify-self-start")} disabled={isIssuing || isEditingItems} onClick={onIssueQuotation}>
                            {isIssuing ? "กำลังสร้าง..." : "ออกใบเสนอราคาภายใน"}
                        </button>
                        <FieldHint>ไม่บังคับ · ไม่ได้ผูกลูกค้า = สร้างลูกค้าจากชื่อผู้ซื้อให้ · แบ่งงวดในใบได้ แล้วงวดจะเติมให้ตอนรับงาน</FieldHint>
                    </div>
                )
            )}

            {plan.blocked_reason && (
                <StatusBanner tone="wait" title="ยังรับงานไม่ได้">
                    {plan.blocked_reason}
                </StatusBanner>
            )}

            <div className="flex flex-wrap justify-end gap-2">
                <button type="button" className={buttonClass("ghost", "md")} onClick={onClose}>
                    ปิดคำขอ (ไม่ได้งาน)
                </button>
                {isExisting ? (
                    <button type="button" className={buttonClass("primary", "md")} disabled={!plan.can_take || isEditingItems} onClick={() => setIsAccepting(true)}>
                        ลูกค้ายืนยันบน Fastwork แล้ว
                    </button>
                ) : plan.can_take && !isEditingItems ? (
                    <Link href={`/fastwork/new?request=${encodeURIComponent(request.svr_id)}`} className={buttonClass("primary", "md")}>
                        รับงานจากคำขอนี้
                    </Link>
                ) : (
                    <button type="button" className={buttonClass("primary", "md")} disabled>
                        รับงานจากคำขอนี้
                    </button>
                )}
            </div>

            {isAccepting && (
                <AcceptOnFastworkSheet
                    request={request}
                    plan={plan}
                    onClose={() => setIsAccepting(false)}
                    onSaved={async () => {
                        setIsAccepting(false);
                        await onAccepted();
                    }}
                />
            )}
        </div>
    );
}

type MilestoneRow = { key: number; fwm_name: string; fwm_amount: string };

/** งวดเพิ่มของงานเดิม (เติมจากใบภายใน หรือ 1 งวด = ยอดหลังปรับ) · แก้ให้ตรงกับที่ตกลงบน Fastwork */
function AcceptOnFastworkSheet({ request, plan, onClose, onSaved }: { request: ServiceRequestRow; plan: FastworkPlan; onClose: () => void; onSaved: () => Promise<void> }) {
    const [rows, setRows] = useState<MilestoneRow[]>(() =>
        plan.milestones.map((milestone, index) => ({ key: index, fwm_name: index === 0 && milestone.fwm_name === "ทั้งงาน" ? "งานเพิ่มตามคำขอ" : milestone.fwm_name, fwm_amount: milestone.fwm_amount })),
    );
    const nextKey = useRef(plan.milestones.length);
    const [errors, setErrors] = useState<FieldErrors>({});
    const [banner, setBanner] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    function update(key: number, field: "fwm_name" | "fwm_amount", value: string) {
        setRows((current) => current.map((row) => (row.key === key ? { ...row, [field]: value } : row)));
    }

    let total: string | null = null;
    try {
        total = formatHundredths(rows.reduce((sum, row) => sum + parseHundredths(row.fwm_amount || "0", "ราคางวด"), 0n));
    } catch {
        total = null;
    }

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        setBanner(null);
        const checked = serviceRequestFastworkAcceptSchema.safeParse({
            svr_version: request.svr_version,
            milestones: rows.map((row) => ({ fwm_name: row.fwm_name, fwm_amount: row.fwm_amount, fwm_due_date: null })),
        });
        if (!checked.success) {
            setErrors(toFieldErrors(checked.error.issues));
            return;
        }
        setErrors({});
        setIsSaving(true);
        const { error } = await apiFetch(`/service-requests/${encodeURIComponent(request.svr_id)}/fastwork-accept`, { method: "POST", body: checked.data });
        setIsSaving(false);
        if (error) {
            setErrors(error.fields);
            setBanner(error.message);
            return;
        }
        toast.success("เพิ่มงวดและงานในงานเดิมแล้ว");
        await onSaved();
    }

    return (
        <SheetFrame titleId="fastwork-accept-title" title="ลูกค้ายืนยันบน Fastwork แล้ว" subtitle={`งวดเพิ่มต่อท้ายงวดเดิมของ ${request.link_project_name ?? "งานนี้"}`} onClose={onClose} onSubmit={submit}>
            {banner && (
                <StatusBanner tone="error" title="บันทึกไม่สำเร็จ">
                    {banner}
                </StatusBanner>
            )}
            {errors.milestones && <FieldHint error={errors.milestones} />}
            <ol className="grid gap-3">
                {rows.map((row, index) => (
                    <li key={row.key} className="grid gap-3 rounded-xl border border-gray-200 p-3 sm:grid-cols-[1fr_9rem_auto] sm:items-start">
                        <FormField label="ชื่องวด" htmlFor={`accept_name_${index}`} required error={errors[`milestones.${index}.fwm_name`]}>
                            <input id={`accept_name_${index}`} value={row.fwm_name} maxLength={200} onChange={(event) => update(row.key, "fwm_name", event.target.value)} className={inputClass(Boolean(errors[`milestones.${index}.fwm_name`]))} />
                        </FormField>
                        <FormField label="ราคางวด (บาท)" htmlFor={`accept_amount_${index}`} required error={errors[`milestones.${index}.fwm_amount`]}>
                            <input
                                id={`accept_amount_${index}`}
                                inputMode="decimal"
                                value={row.fwm_amount}
                                onChange={(event) => update(row.key, "fwm_amount", event.target.value)}
                                className={`${inputClass(Boolean(errors[`milestones.${index}.fwm_amount`]))} text-right tabular-nums`}
                            />
                        </FormField>
                        <button
                            type="button"
                            aria-label={`ลบงวด ${index + 1}`}
                            disabled={rows.length === 1}
                            onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}
                            className={`${buttonClass("ghost", "md")} justify-self-end sm:mt-6`}
                        >
                            <Trash2 size={16} />
                        </button>
                    </li>
                ))}
            </ol>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                    type="button"
                    className={buttonClass("secondary", "sm")}
                    onClick={() => {
                        const key = nextKey.current;
                        nextKey.current += 1;
                        setRows((current) => [...current, { key, fwm_name: "", fwm_amount: "" }]);
                    }}
                >
                    <Plus size={14} />
                    เพิ่มงวด
                </button>
                <span className="text-sm text-gray-700">
                    รวมงวดเพิ่ม <span className="font-medium text-gray-900 tabular-nums">{total === null ? "-" : formatAmount(total)}</span> บาท
                </span>
            </div>
            <FieldHint>บันทึกแล้ว: งวดเพิ่มต่อท้ายงวดเดิม · สร้างงานจากรายการในคำขอ · ใบภายในที่อนุมัติแล้วผูกกับงานนี้</FieldHint>
            <SheetButtons isSaving={isSaving} submitLabel="บันทึกงวดเพิ่ม" onClose={onClose} />
        </SheetFrame>
    );
}
