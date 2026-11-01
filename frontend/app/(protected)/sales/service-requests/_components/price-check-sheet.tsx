"use client";

// หน้าต่าง "ตรวจราคาก่อนสร้างใบ" (ราคาเริ่มต้น 2026-11-01 · docs/plans/2026-11-01-starting-price.md ข้อ 2.3)
// ขึ้นก่อนทุกปุ่มที่ส่งราคาออกไปถึงลูกค้า/ผู้ซื้อ (ยืนยันคำขอ · ใบภายใน · รับงาน · งวดเพิ่ม) เมื่อยังมีแถวราคาเริ่มต้นที่ไม่ได้ตรวจ
// ช่องราคาเติมราคาปัจจุบันไว้ · กดต่อโดยไม่แก้ = ยืนยันว่าใช้ราคาเริ่มต้น (Q2 ข) · บันทึกแล้วทำขั้นต่อไปให้เลย
import { useState } from "react";
import StatusBanner from "@/components/ui/guidance/status-banner";
import FieldHint from "@/components/ui/guidance/field-hint";
import FormField, { inputClass } from "@/components/ui/form-field";
import { apiFetch } from "@/lib/api";
import { toFieldErrors, type FieldErrors } from "@/lib/form-errors";
import { formatAmount, formatQuantity, parseHundredths } from "@/lib/shared/money.mjs";
import { serviceRequestPricesSchema } from "@/lib/shared/schemas/service-request.mjs";
import { SheetButtons, SheetFrame } from "../../../fastwork/_components/sheet-frame";
import type { ServiceRequestItem } from "../../order-links/_types";

/** เทียบราคาที่กรอกกับราคาที่ลูกค้าเห็นตอนเลือก · กรอกผิดรูปแบบ = ไม่บอก (ตรวจตอนบันทึก) */
function compareText(price: string, seenPrice: string, isCustomerRow: boolean) {
    let difference: bigint;
    try {
        difference = parseHundredths(price, "ราคา") - parseHundredths(seenPrice, "ราคา");
    } catch {
        return null;
    }
    if (difference === 0n) return null;
    if (difference < 0n)
        return { tone: "info" as const, text: `ต่ำกว่าราคาเริ่มต้นที่ลูกค้าเห็น (${formatAmount(seenPrice)} บาท)` };
    return {
        tone: "warn" as const,
        text: isCustomerRow
            ? `สูงกว่าที่ลูกค้าเห็น (${formatAmount(seenPrice)} บาท) · ลูกค้าเห็นราคาใหม่ในหน้าสถานะคำขอ`
            : `สูงกว่าราคาเริ่มต้น (${formatAmount(seenPrice)} บาท)`,
    };
}

export default function PriceCheckSheet<T>({
    requestId,
    version,
    rows,
    nextLabel,
    onClose,
    onConfirmed,
}: {
    requestId: string;
    version: number;
    // แถวราคาเริ่มต้นที่ยังไม่ตรวจ
    rows: ServiceRequestItem[];
    // ขั้นที่จะทำต่อหลังยืนยันราคา เช่น "สร้างใบเสนอราคา"
    nextLabel: string;
    onClose: () => void;
    onConfirmed: (detail: T) => Promise<void> | void;
}) {
    const [prices, setPrices] = useState<Record<number, string>>(() =>
        Object.fromEntries(rows.map((row) => [row.svi_id, row.svi_adjusted_unit_price ?? row.svi_unit_price ?? "0"])),
    );
    const [errors, setErrors] = useState<FieldErrors>({});
    const [banner, setBanner] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        setBanner(null);
        const checked = serviceRequestPricesSchema.safeParse({
            svr_version: version,
            prices: rows.map((row) => ({ svi_id: row.svi_id, unit_price: prices[row.svi_id] ?? "" })),
        });
        if (!checked.success) {
            setErrors(toFieldErrors(checked.error.issues));
            return;
        }
        setErrors({});
        setIsSaving(true);
        const { data, error } = await apiFetch<T>(`/service-requests/${encodeURIComponent(requestId)}/prices`, {
            method: "PUT",
            body: checked.data,
        });
        if (error) {
            setIsSaving(false);
            setBanner(error.fields.prices ?? error.message);
            return;
        }
        await onConfirmed(data);
        setIsSaving(false);
    }

    return (
        <SheetFrame
            titleId="price-check-title"
            title="ตรวจราคาก่อนสร้างใบ"
            subtitle={`มี ${rows.length} รายการที่เป็นราคาเริ่มต้น · กรอกราคาจริงก่อน${nextLabel}`}
            onClose={onClose}
            onSubmit={submit}
        >
            {banner && (
                <StatusBanner tone="error" title="บันทึกไม่สำเร็จ">
                    {banner}
                </StatusBanner>
            )}
            <ol className="grid gap-3">
                {rows.map((row, index) => {
                    const seenPrice = row.svi_unit_price ?? "0";
                    const price = prices[row.svi_id] ?? "";
                    const comparison = compareText(price, seenPrice, !row.svi_added_by_staff);
                    const quantity = row.svi_adjusted_quantity ?? row.svi_quantity ?? "1";
                    const fieldError = errors[`prices.${index}.unit_price`];
                    return (
                        <li key={row.svi_id} className="grid gap-3 rounded-xl border border-gray-200 p-3">
                            <div className="grid gap-0.5">
                                <span className="text-sm font-medium wrap-break-word text-gray-900">
                                    {row.svi_name}
                                </span>
                                <span className="text-xs text-gray-500">
                                    ลูกค้าเห็น เริ่มต้น {formatAmount(seenPrice)} บาท × {formatQuantity(quantity)}{" "}
                                    {row.svi_unit ?? ""}
                                    {row.svi_package_id && " · อยู่ในชุด"}
                                    {row.price_note && ` · ราคาขึ้นกับ${row.price_note}`}
                                </span>
                            </div>
                            {row.related_answers && row.related_answers.length > 0 && (
                                <dl className="grid gap-1.5 rounded-lg bg-gray-50 p-2.5 text-sm">
                                    {row.related_answers.map((answer) => (
                                        <div key={answer.question} className="grid gap-0.5">
                                            <dt className="text-xs text-gray-500">{answer.question}</dt>
                                            <dd className="wrap-break-word whitespace-pre-line text-gray-900">
                                                {answer.answer}
                                            </dd>
                                        </div>
                                    ))}
                                </dl>
                            )}
                            <FormField
                                label="ราคาจริงต่อหน่วย (บาท)"
                                htmlFor={`price_${row.svi_id}`}
                                required
                                error={fieldError}
                                className="sm:max-w-xs"
                            >
                                <input
                                    id={`price_${row.svi_id}`}
                                    inputMode="decimal"
                                    value={price}
                                    onChange={(event) =>
                                        setPrices((current) => ({ ...current, [row.svi_id]: event.target.value }))
                                    }
                                    className={`${inputClass(Boolean(fieldError))} text-right tabular-nums`}
                                />
                            </FormField>
                            {comparison && (
                                <p
                                    className={`text-xs ${comparison.tone === "warn" ? "text-amber-600" : "text-gray-500"}`}
                                >
                                    {comparison.text}
                                </p>
                            )}
                        </li>
                    );
                })}
            </ol>
            <FieldHint>
                ราคาถูกแล้วกดต่อได้เลย (ถือว่ายืนยันราคานี้) · บันทึกชื่อคนยืนยันและเวลาไว้ในคำขอ ·
                คำตอบอื่นของลูกค้าดูได้ที่ส่วนความต้องการ
            </FieldHint>
            <SheetButtons isSaving={isSaving} submitLabel={`ยืนยันราคาแล้ว${nextLabel}`} onClose={onClose} />
        </SheetFrame>
    );
}
