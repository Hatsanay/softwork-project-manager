"use client";

// ทีมและส่วนแบ่งตอนรับงาน Fastwork (2026-11-01 · docs/plans/2026-11-01-fastwork-flow-simplify.md ข้อ 1)
// เติมจากงาน Fastwork ล่าสุดที่ตั้งส่วนแบ่งไว้ (ผู้รับที่ปิดใช้งานแล้วข้าม และบอกชื่อ) · แก้ได้ก่อนบันทึก · ว่างได้ (ตั้งทีหลังที่หน้าส่วนแบ่ง)
// กติกาเดียวกับหน้าส่วนแบ่ง (projectSharesSchema) · ผู้รับที่เป็นผู้ใช้ระบบเพิ่มเป็นสมาชิกโปรเจกต์ให้ตอนบันทึก
// ตัวเลขประมาณ = ราคางานรวม − ค่าธรรมเนียมตามอัตราที่ตั้งไว้ (ยังไม่รวมค่าใช้จ่ายที่จะมีภายหลัง)
import { useRef } from "react";
import { Plus, Trash2 } from "lucide-react";
import FormField, { inputClass } from "@/components/ui/form-field";
import FieldHint from "@/components/ui/guidance/field-hint";
import StatusBanner from "@/components/ui/guidance/status-banner";
import SearchableSelect, { type SelectOption } from "@/components/ui/SearchableSelect";
import { buttonClass } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { formatAmount, parseHundredths } from "@/lib/shared/money.mjs";
import { suggestPayoutAmounts } from "@/lib/shared/fastwork-math.mjs";
import { splitProfit } from "@/lib/shared/profit-share-math.mjs";
import type { FastworkSettings, ShareKind } from "../../_types";

type RecipientType = "user" | "vendor";

export type JobShareRow = {
    rowId: number;
    recipient_type: RecipientType;
    recipient_id: string;
    recipient_name: string;
    kind: ShareKind;
    percent: string;
    amount: string;
    note: string;
};

export type ShareDefaults = {
    source: { project_id: string; project_name: string } | null;
    shares: {
        recipient_type: RecipientType;
        recipient_id: string;
        recipient_name: string | null;
        kind: ShareKind;
        percent: string | null;
        amount: string | null;
        note: string | null;
    }[];
    skipped: string[];
};

export function rowsFromDefaults(defaults: ShareDefaults): JobShareRow[] {
    return defaults.shares.map((share, index) => ({
        rowId: index,
        recipient_type: share.recipient_type,
        recipient_id: share.recipient_id,
        recipient_name: share.recipient_name ?? "",
        kind: share.kind,
        percent: share.percent ?? "",
        amount: share.amount ?? "",
        note: share.note ?? "",
    }));
}

/** แถวส่วนแบ่ง → รูปแบบที่ API รับ */
export function sharesPayload(rows: JobShareRow[]) {
    return rows.map((row) => ({
        recipient_type: row.recipient_type,
        recipient_id: row.recipient_id,
        kind: row.kind,
        percent: row.kind === "percent" ? row.percent : null,
        amount: row.kind === "fixed" ? row.amount : null,
        note: row.note,
    }));
}

// ตัวเลขที่ยังพิมพ์ไม่ครบ → คิดเป็น 0 ระหว่างพิมพ์ (ข้อผิดพลาดจริงแสดงตอนกดบันทึก)
function liveValue(value: string) {
    const text = value.trim().replace(/,/g, "");
    return /^\d+(\.\d{1,2})?$/.test(text) ? text : "0";
}

/** กำไรถ้าเงินเข้าครบ (ประมาณ) = ราคางานรวม − ค่าธรรมเนียม − VAT ค่าธรรมเนียม ตามอัตราที่ตั้งไว้ */
function expectedProfitOf(contractTotal: string | null, settings: FastworkSettings | null) {
    if (!contractTotal || !settings) return null;
    try {
        const amounts = suggestPayoutAmounts({
            gross: contractTotal,
            feeRate: settings.cs_fastwork_fee_rate,
            feeVatRate: settings.cs_fastwork_fee_vat_rate,
            whtRate: "0",
        });
        return (
            parseHundredths(contractTotal, "ราคางาน") -
            parseHundredths(amounts.fee, "ค่าธรรมเนียม") -
            parseHundredths(amounts.fee_vat, "VAT")
        );
    } catch {
        return null;
    }
}

type JobSharesSectionProps = {
    rows: JobShareRow[];
    onChange: (rows: JobShareRow[]) => void;
    defaults: ShareDefaults | null;
    contractTotal: string | null;
    settings: FastworkSettings | null;
    canPickVendors: boolean;
    errors: Record<string, string>;
};

export default function JobSharesSection({
    rows,
    onChange,
    defaults,
    contractTotal,
    settings,
    canPickVendors,
    errors,
}: JobSharesSectionProps) {
    const nextRowId = useRef(1000);

    function updateRow(rowId: number, changes: Partial<JobShareRow>) {
        onChange(rows.map((row) => (row.rowId === rowId ? { ...row, ...changes } : row)));
    }

    function addRow(recipientType: RecipientType) {
        const rowId = nextRowId.current;
        nextRowId.current += 1;
        onChange([
            ...rows,
            {
                rowId,
                recipient_type: recipientType,
                recipient_id: "",
                recipient_name: "",
                // คนนอกที่ตกลงราคาไว้ใช้แบบจำนวนเงิน
                kind: recipientType === "vendor" ? "fixed" : "percent",
                percent: "",
                amount: "",
                note: "",
            },
        ]);
    }

    async function loadUsers(search: string): Promise<SelectOption[]> {
        const { data } = await apiFetch<{ user_id: string; user_fullname: string }[]>(
            `/users/for-select?search=${encodeURIComponent(search)}`,
        );
        return (data ?? []).map((user) => ({ value: user.user_id, label: user.user_fullname }));
    }

    async function loadVendors(search: string): Promise<SelectOption[]> {
        const query = new URLSearchParams({ status: "active", limit: "20", offset: "0", search });
        const { data } = await apiFetch<{ data: { vd_id: string; vd_name: string; vd_code: string | null }[] }>(
            `/vendors?${query}`,
        );
        return (data?.data ?? []).map((vendor) => ({
            value: vendor.vd_id,
            label: vendor.vd_code ? `${vendor.vd_name} (${vendor.vd_code})` : vendor.vd_name,
        }));
    }

    // ตัวเลือกที่เลือกไว้แล้วต้องอยู่ในรายการเสมอ (ไม่งั้นช่องจะว่างแม้มีค่า)
    function optionsWithCurrent(row: JobShareRow, load: (search: string) => Promise<SelectOption[]>) {
        return async (search: string) => {
            const found = await load(search);
            const hasCurrent = found.some((option) => String(option.value) === row.recipient_id);
            if (!row.recipient_id || hasCurrent || search) return found;
            return [{ value: row.recipient_id, label: row.recipient_name || row.recipient_id }, ...found];
        };
    }

    const expectedProfit = expectedProfitOf(contractTotal, settings);
    const split =
        expectedProfit === null
            ? null
            : splitProfit({
                  distributable: expectedProfit,
                  shares: rows.map((row) => ({
                      kind: row.kind,
                      percent: liveValue(row.percent),
                      amount: liveValue(row.amount),
                  })),
              });
    const percentTotal = rows
        .filter((row) => row.kind === "percent")
        .reduce((sum, row) => sum + parseHundredths(liveValue(row.percent), "เปอร์เซ็นต์"), 0n);

    return (
        <div className="grid gap-4">
            {defaults?.source && (
                <FieldHint>
                    เติมให้จากงานล่าสุด &quot;{defaults.source.project_name}&quot; · แก้ เพิ่ม หรือเอาออกได้ก่อนบันทึก
                    {defaults.skipped.length > 0 ? ` · ข้าม ${defaults.skipped.join(", ")} เพราะปิดใช้งานแล้ว` : ""}
                </FieldHint>
            )}
            {errors.shares && (
                <StatusBanner tone="error" title="ตรวจส่วนแบ่งอีกครั้ง">
                    {errors.shares}
                </StatusBanner>
            )}

            {rows.length === 0 ? (
                <p className="rounded-xl bg-gray-50 p-4 text-sm text-gray-500">
                    ยังไม่มีผู้รับ · ตั้งตอนนี้หรือตั้งทีหลังที่หน้าส่วนแบ่งก็ได้ (ต้องตั้งก่อนปิดงาน)
                </p>
            ) : (
                <ul className="grid gap-3">
                    {rows.map((row, index) => {
                        const prefix = `shares.${index}`;
                        const valueField = row.kind === "percent" ? "percent" : "amount";
                        const estimate = split?.amounts[index];
                        return (
                            <li
                                key={row.rowId}
                                className="grid gap-3 rounded-xl border border-gray-200 p-3 sm:grid-cols-[minmax(0,1.4fr)_auto_minmax(0,0.8fr)_minmax(0,1fr)_auto] sm:items-start"
                            >
                                <FormField
                                    label={row.recipient_type === "user" ? "ผู้ใช้ในระบบ" : "ผู้ขาย/ฟรีแลนซ์"}
                                    htmlFor={`job_share_${row.rowId}`}
                                    required
                                    error={errors[`${prefix}.recipient_id`]}
                                >
                                    <SearchableSelect
                                        loadOptions={optionsWithCurrent(
                                            row,
                                            row.recipient_type === "user" ? loadUsers : loadVendors,
                                        )}
                                        value={row.recipient_id}
                                        onChange={(value) =>
                                            updateRow(row.rowId, { recipient_id: value, recipient_name: "" })
                                        }
                                        placeholder={row.recipient_type === "user" ? "ค้นหาชื่อ" : "ค้นหาผู้ขาย"}
                                        error={Boolean(errors[`${prefix}.recipient_id`])}
                                    />
                                </FormField>
                                <div className="grid gap-1.5">
                                    <span className="text-sm text-gray-800">แบ่งเป็น</span>
                                    <div
                                        role="group"
                                        aria-label="แบ่งเป็น"
                                        className="inline-flex gap-0.5 rounded-xl bg-gray-100 p-1"
                                    >
                                        {(["percent", "fixed"] as const).map((kind) => (
                                            <button
                                                key={kind}
                                                type="button"
                                                aria-pressed={row.kind === kind}
                                                onClick={() => updateRow(row.rowId, { kind })}
                                                className={`min-h-9 rounded-lg px-3 text-sm ${
                                                    row.kind === kind
                                                        ? "bg-white font-medium text-blue-600 shadow-sm"
                                                        : "text-gray-600"
                                                }`}
                                            >
                                                {kind === "percent" ? "% ของกำไร" : "จำนวนเงิน"}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <FormField
                                    label={row.kind === "percent" ? "เปอร์เซ็นต์" : "จำนวนเงิน (บาท)"}
                                    htmlFor={`job_share_value_${row.rowId}`}
                                    required
                                    error={errors[`${prefix}.${valueField}`]}
                                    hint={
                                        estimate === undefined
                                            ? undefined
                                            : `ถ้าเงินเข้าครบ ≈ ${formatAmount(estimate)} บาท`
                                    }
                                >
                                    <input
                                        id={`job_share_value_${row.rowId}`}
                                        inputMode="decimal"
                                        value={row.kind === "percent" ? row.percent : row.amount}
                                        placeholder={row.kind === "percent" ? "เช่น 40" : "เช่น 1000"}
                                        onChange={(event) => updateRow(row.rowId, { [valueField]: event.target.value })}
                                        className={inputClass(Boolean(errors[`${prefix}.${valueField}`]))}
                                    />
                                </FormField>
                                <FormField
                                    label="หน้าที่ในงาน"
                                    htmlFor={`job_share_note_${row.rowId}`}
                                    hint="ไม่บังคับ"
                                    error={errors[`${prefix}.note`]}
                                >
                                    <input
                                        id={`job_share_note_${row.rowId}`}
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
                                    onClick={() => onChange(rows.filter((item) => item.rowId !== row.rowId))}
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
                <button type="button" className={buttonClass("secondary", "sm")} onClick={() => addRow("user")}>
                    <Plus size={16} />
                    ผู้ใช้ในระบบ
                </button>
                {canPickVendors && (
                    <button type="button" className={buttonClass("secondary", "sm")} onClick={() => addRow("vendor")}>
                        <Plus size={16} />
                        ผู้ขาย/ฟรีแลนซ์
                    </button>
                )}
            </div>

            {split && rows.length > 0 && expectedProfit !== null && (
                <div className="grid gap-1 rounded-xl bg-gray-50 p-3 text-sm tabular-nums">
                    <div className="flex justify-between gap-3 text-gray-700">
                        <span>กำไรถ้าเงินเข้าครบ (ราคางาน − ค่าธรรมเนียม)</span>
                        <span>{formatAmount(expectedProfit)}</span>
                    </div>
                    <div className="flex justify-between gap-3 text-gray-700">
                        <span>− ส่วนแบ่งรวม (รวม % {formatAmount(percentTotal)}%)</span>
                        <span>{formatAmount(expectedProfit - split.companyAmount)}</span>
                    </div>
                    <div className="flex justify-between gap-3 border-t border-gray-200 pt-1.5 font-medium text-gray-900">
                        <span>= เข้าเงินทุน</span>
                        <span className={split.companyAmount < 0n ? "text-red-600" : ""}>
                            {formatAmount(split.companyAmount)}
                        </span>
                    </div>
                    <FieldHint error={percentTotal > 10000n ? "รวม % เกิน 100% · ลดลงให้รวมไม่เกิน 100%" : null}>
                        ตัวเลขประมาณจากราคางาน ยังไม่รวมค่าใช้จ่ายที่จะมีภายหลัง ·
                        ตัวเลขจริงคิดตอนปิดงานจากเงินที่เข้าจริง
                    </FieldHint>
                </div>
            )}
            <FieldHint>
                ผู้รับที่เป็นผู้ใช้ในระบบ ระบบเพิ่มเป็นสมาชิกโปรเจกต์ให้ · ตั้งตำแหน่งในโปรเจกต์ได้ที่หน้าโปรเจกต์
            </FieldHint>
        </div>
    );
}
