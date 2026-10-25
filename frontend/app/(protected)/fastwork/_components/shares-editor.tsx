"use client";

// ตั้งส่วนแบ่งของโปรเจกต์ (2026-10-25 · P-2 · ขั้นที่ 2) — บันทึกทั้งชุดแทนชุดเดิม
// ยังไม่เคยตั้ง: เติมสมาชิกโปรเจกต์ทุกคนให้เป็นแบบ % (ใส่แค่ตัวเลข ไม่ต้องค้นชื่อ) · คนที่ไม่ได้ส่วนแบ่งกดเอาออก
// ผู้ขาย/ฟรีแลนซ์เลือกได้เมื่อมีสิทธิ์ดูผู้ขาย · ตัวเลขประมาณการคิดสดจากกำไร ณ วันนี้ด้วยสูตรเดียวกับ backend
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import FormField, { inputClass } from "@/components/ui/form-field";
import FieldHint from "@/components/ui/guidance/field-hint";
import StatusBanner from "@/components/ui/guidance/status-banner";
import SearchableSelect, { type SelectOption } from "@/components/ui/SearchableSelect";
import { buttonClass } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { toFieldErrors, type FieldErrors } from "@/lib/form-errors";
import { formatAmount, parseHundredths } from "@/lib/shared/money.mjs";
import { splitProfit } from "@/lib/shared/profit-share-math.mjs";
import { projectSharesSchema } from "@/lib/shared/schemas/profit-share.mjs";
import type { ProjectSharesDetail, ShareKind } from "../_types";
import { SHARE_MESSAGES } from "../_messages";

type RecipientType = "user" | "vendor";

type ShareRow = {
    rowId: number;
    recipient_type: RecipientType;
    recipient_id: string;
    kind: ShareKind;
    percent: string;
    amount: string;
    note: string;
};

type SharesEditorProps = {
    detail: ProjectSharesDetail;
    canPickVendors: boolean;
    onCancel: (() => void) | null;
    onSaved: () => Promise<void>;
};

function initialRows(detail: ProjectSharesDetail): ShareRow[] {
    if (detail.shares.length > 0) {
        return detail.shares.map((share, index) => ({
            rowId: index,
            recipient_type: share.shr_vendor_id ? "vendor" : "user",
            recipient_id: share.shr_vendor_id ?? share.shr_user_id ?? "",
            kind: share.shr_kind,
            percent: share.shr_percent ?? "",
            amount: share.shr_amount ?? "",
            note: share.shr_note ?? "",
        }));
    }
    return detail.members.map((member, index) => ({
        rowId: index,
        recipient_type: "user",
        recipient_id: member.user_id,
        kind: "percent",
        percent: "",
        amount: "",
        note: "",
    }));
}

// ตัวเลขที่ยังพิมพ์ไม่ครบ → คิดเป็น 0 ระหว่างพิมพ์ (ข้อผิดพลาดจริงแสดงตอนกดบันทึก)
function liveValue(value: string) {
    const text = value.trim().replace(/,/g, "");
    return /^\d+(\.\d{1,2})?$/.test(text) ? text : "0";
}

export default function SharesEditor({ detail, canPickVendors, onCancel, onSaved }: SharesEditorProps) {
    const [rows, setRows] = useState<ShareRow[]>(() => initialRows(detail));
    const nextRowId = useRef(rows.length);
    const [errors, setErrors] = useState<FieldErrors>({});
    const [bannerError, setBannerError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    // ชื่อผู้ขายที่เคยเห็นในตัวเลือก (ใช้แสดงตัวเลือกที่เลือกไว้แล้ว)
    const vendorLabels = useRef(
        new Map(detail.shares.filter((share) => share.shr_vendor_id).map((share) => [share.shr_vendor_id as string, share.recipient_name])),
    );

    // สมาชิกโปรเจกต์ + ผู้ใช้ที่ตั้งไว้เดิมแต่ออกจากโปรเจกต์แล้ว (ยังเลือกค้างไว้ได้)
    const memberOptions = [...detail.members.map((member) => ({ id: member.user_id, name: member.full_name }))];
    for (const share of detail.shares) {
        if (share.shr_user_id && !memberOptions.some((option) => option.id === share.shr_user_id)) {
            memberOptions.push({ id: share.shr_user_id, name: `${share.recipient_name} (ไม่ได้อยู่ในโปรเจกต์แล้ว)` });
        }
    }

    function updateRow(rowId: number, changes: Partial<ShareRow>) {
        setRows((current) => current.map((row) => (row.rowId === rowId ? { ...row, ...changes } : row)));
    }

    function addRow(recipientType: RecipientType) {
        const usedMemberIds = new Set(rows.filter((row) => row.recipient_type === "user").map((row) => row.recipient_id));
        const firstFreeMember = memberOptions.find((option) => !usedMemberIds.has(option.id));
        const rowId = nextRowId.current;
        nextRowId.current += 1;
        setRows((current) => [
            ...current,
            {
                rowId,
                recipient_type: recipientType,
                recipient_id: recipientType === "user" ? (firstFreeMember?.id ?? "") : "",
                kind: recipientType === "vendor" ? "fixed" : "percent",
                percent: "",
                amount: "",
                note: "",
            },
        ]);
    }

    async function loadVendorOptions(search: string): Promise<SelectOption[]> {
        const query = new URLSearchParams({ status: "active", limit: "20", offset: "0", search });
        const { data } = await apiFetch<{ data: { vd_id: string; vd_name: string; vd_code: string | null }[] }>(`/vendors?${query}`);
        return (data?.data ?? []).map((vendor) => {
            const label = vendor.vd_code ? `${vendor.vd_name} (${vendor.vd_code})` : vendor.vd_name;
            vendorLabels.current.set(vendor.vd_id, label);
            return { value: vendor.vd_id, label };
        });
    }

    async function save() {
        setBannerError(null);
        const body = {
            shares: rows.map((row) => ({
                recipient_type: row.recipient_type,
                recipient_id: row.recipient_id,
                kind: row.kind,
                percent: row.kind === "percent" ? row.percent : null,
                amount: row.kind === "fixed" ? row.amount : null,
                note: row.note,
            })),
        };
        const checked = projectSharesSchema.safeParse(body);
        if (!checked.success) {
            setErrors(toFieldErrors(checked.error.issues));
            return;
        }
        setErrors({});
        setIsSaving(true);
        const { error } = await apiFetch(`/profit-shares/projects/${detail.project.project_id}/shares`, { method: "PUT", body: checked.data });
        setIsSaving(false);
        if (error) {
            setErrors(error.fields);
            if (Object.keys(error.fields).length === 0) setBannerError(error.message);
            return;
        }
        toast.success("บันทึกส่วนแบ่งแล้ว");
        await onSaved();
    }

    // ประมาณการสด
    const distributable = parseHundredths(detail.profit.distributable, "กำไรที่แบ่งได้");
    const split = splitProfit({
        distributable,
        shares: rows.map((row) => ({ kind: row.kind, percent: liveValue(row.percent), amount: liveValue(row.amount) })),
    });
    const percentTotal = rows
        .filter((row) => row.kind === "percent")
        .reduce((sum, row) => sum + parseHundredths(liveValue(row.percent), "เปอร์เซ็นต์"), 0n);
    const isOverHundred = percentTotal > 10000n;

    return (
        <div className="grid gap-4">
            {bannerError && (
                <StatusBanner tone="error" title="บันทึกไม่สำเร็จ">
                    {bannerError}
                </StatusBanner>
            )}
            {errors.shares && (
                <StatusBanner tone="error" title="ตรวจส่วนแบ่งอีกครั้ง">
                    {errors.shares}
                </StatusBanner>
            )}
            <FieldHint>{SHARE_MESSAGES.recipients}</FieldHint>

            {rows.length === 0 ? (
                <p className="rounded-xl bg-gray-50 p-4 text-sm text-gray-500">
                    ยังไม่มีผู้รับ · ไม่มีผู้รับ = กำไรทั้งหมดเข้าเงินทุน (ยังปิดยอดไม่ได้จนกว่าจะตั้งอย่างน้อย 1 คน)
                </p>
            ) : (
                <ul className="grid gap-3">
                    {rows.map((row, index) => {
                        const prefix = `shares.${index}`;
                        const valueField = row.kind === "percent" ? "percent" : "amount";
                        return (
                            <li key={row.rowId} className="grid gap-3 rounded-xl border border-gray-200 p-3 sm:grid-cols-[minmax(0,1.4fr)_auto_minmax(0,0.8fr)_minmax(0,1fr)_auto] sm:items-start">
                                <FormField
                                    label={row.recipient_type === "user" ? "สมาชิกโปรเจกต์" : "ผู้ขาย/ฟรีแลนซ์"}
                                    htmlFor={`share_recipient_${row.rowId}`}
                                    required
                                    error={errors[`${prefix}.recipient_id`]}
                                >
                                    {row.recipient_type === "user" ? (
                                        <select
                                            id={`share_recipient_${row.rowId}`}
                                            value={row.recipient_id}
                                            onChange={(event) => updateRow(row.rowId, { recipient_id: event.target.value })}
                                            className={inputClass(Boolean(errors[`${prefix}.recipient_id`]))}
                                        >
                                            <option value="">เลือกสมาชิก</option>
                                            {memberOptions.map((option) => (
                                                <option key={option.id} value={option.id}>
                                                    {option.name}
                                                </option>
                                            ))}
                                        </select>
                                    ) : (
                                        <SearchableSelect
                                            loadOptions={async (search) => {
                                                const found = await loadVendorOptions(search);
                                                const currentLabel = vendorLabels.current.get(row.recipient_id);
                                                const hasCurrent = found.some((option) => String(option.value) === row.recipient_id);
                                                return currentLabel && !hasCurrent && !search
                                                    ? [{ value: row.recipient_id, label: currentLabel }, ...found]
                                                    : found;
                                            }}
                                            value={row.recipient_id}
                                            onChange={(value) => updateRow(row.rowId, { recipient_id: value })}
                                            placeholder="ค้นหาผู้ขาย"
                                            error={Boolean(errors[`${prefix}.recipient_id`])}
                                        />
                                    )}
                                </FormField>
                                <div className="grid gap-1.5">
                                    <span className="text-sm text-gray-800">แบ่งเป็น</span>
                                    <div role="group" aria-label="แบ่งเป็น" className="inline-flex gap-0.5 rounded-xl bg-gray-100 p-1">
                                        {(["percent", "fixed"] as const).map((kind) => (
                                            <button
                                                key={kind}
                                                type="button"
                                                aria-pressed={row.kind === kind}
                                                onClick={() => updateRow(row.rowId, { kind })}
                                                className={`min-h-9 rounded-lg px-3 text-sm ${
                                                    row.kind === kind ? "bg-white font-medium text-blue-600 shadow-sm" : "text-gray-600"
                                                }`}
                                            >
                                                {kind === "percent" ? "% ของกำไร" : "จำนวนเงิน"}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <FormField
                                    label={row.kind === "percent" ? "เปอร์เซ็นต์" : "จำนวนเงิน (บาท)"}
                                    htmlFor={`share_value_${row.rowId}`}
                                    required
                                    error={errors[`${prefix}.${valueField}`]}
                                    hint={`ประมาณ ${formatAmount(split.amounts[index] ?? 0n)} บาท`}
                                >
                                    <input
                                        id={`share_value_${row.rowId}`}
                                        inputMode="decimal"
                                        value={row.kind === "percent" ? row.percent : row.amount}
                                        placeholder={row.kind === "percent" ? "เช่น 40" : "เช่น 1000"}
                                        onChange={(event) => updateRow(row.rowId, { [valueField]: event.target.value })}
                                        className={inputClass(Boolean(errors[`${prefix}.${valueField}`]))}
                                    />
                                </FormField>
                                <FormField label="หน้าที่ในงาน" htmlFor={`share_note_${row.rowId}`} hint="ไม่บังคับ" error={errors[`${prefix}.note`]}>
                                    <input
                                        id={`share_note_${row.rowId}`}
                                        value={row.note}
                                        maxLength={100}
                                        placeholder="เช่น ออกแบบ, เขียนโค้ด"
                                        onChange={(event) => updateRow(row.rowId, { note: event.target.value })}
                                        className={inputClass(false)}
                                    />
                                </FormField>
                                <button
                                    type="button"
                                    aria-label="เอาผู้รับนี้ออก"
                                    className={`${buttonClass("ghost", "sm")} justify-self-end sm:mt-7`}
                                    onClick={() => setRows((current) => current.filter((item) => item.rowId !== row.rowId))}
                                >
                                    <Trash2 size={16} />
                                    <span className="sm:hidden">เอาออก</span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}

            <div className="flex flex-wrap gap-2">
                <button type="button" className={buttonClass("secondary", "sm")} onClick={() => addRow("user")} disabled={memberOptions.length === 0}>
                    <Plus size={16} />
                    สมาชิกโปรเจกต์
                </button>
                {canPickVendors && (
                    <button type="button" className={buttonClass("secondary", "sm")} onClick={() => addRow("vendor")}>
                        <Plus size={16} />
                        ผู้ขาย/ฟรีแลนซ์
                    </button>
                )}
            </div>
            {memberOptions.length === 0 && <FieldHint>โปรเจกต์นี้ยังไม่มีสมาชิก · เพิ่มสมาชิกในหน้าโปรเจกต์ก่อน</FieldHint>}

            {/* สรุปบนลงล่าง: ส่วนตายตัว → ฐานของ % → % รวม → เข้าเงินทุน */}
            <div className="grid gap-1 rounded-xl bg-gray-50 p-3 text-sm">
                <div className="flex justify-between gap-3 text-gray-700">
                    <span>กำไรที่แบ่งได้ ณ วันนี้</span>
                    <span className="tabular-nums">{formatAmount(distributable)}</span>
                </div>
                <div className="flex justify-between gap-3 text-gray-700">
                    <span>− ส่วนแบ่งแบบจำนวนเงิน</span>
                    <span className="tabular-nums">{formatAmount(split.fixedTotal)}</span>
                </div>
                <div className="flex justify-between gap-3 text-gray-700">
                    <span>− ส่วนแบ่งแบบ % (รวม {formatAmount(percentTotal)}%)</span>
                    <span className="tabular-nums">{formatAmount(split.amounts.reduce((sum, amount) => sum + amount, 0n) - split.fixedTotal)}</span>
                </div>
                <div className="flex justify-between gap-3 border-t border-gray-200 pt-1.5">
                    <span className="font-medium text-gray-900">= เข้าเงินทุน</span>
                    <span className={`font-medium tabular-nums ${split.companyAmount < 0n ? "text-red-600" : "text-gray-900"}`}>
                        {formatAmount(split.companyAmount)}
                    </span>
                </div>
                <FieldHint error={isOverHundred ? "รวม % เกิน 100% · ลดลงให้รวมไม่เกิน 100%" : null}>
                    ที่เหลือจาก 100% ({formatAmount(10000n - percentTotal)}%) ของกำไรหลังหักส่วนตายตัวเข้าเงินทุน รวมเศษสตางค์
                </FieldHint>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
                {onCancel && (
                    <button type="button" className={buttonClass("secondary", "md")} onClick={onCancel}>
                        ยกเลิก
                    </button>
                )}
                <button type="button" className={buttonClass("primary", "md")} onClick={save} disabled={isSaving || isOverHundred}>
                    {isSaving ? "กำลังบันทึก..." : "บันทึกส่วนแบ่ง"}
                </button>
            </div>
        </div>
    );
}
