"use client";

// ตั้งต่ออายุบริการตอนรับงาน Fastwork (2026-10-31 · แผนบริการรายรอบข้อ 5.1 ข้อ 2)
// เสนอจากสินค้าที่เลือก: สินค้ารายรอบ (จำนวน = รอบที่จ่ายแล้ว) · แพ็กที่รวมรอบแรกของบริการไว้ (ครบหลังรอบแรก)
// ติ๊กออกได้ · ใส่ชื่อที่จำง่าย · แก้วันครบได้ · ราคาต่อรอบตามสินค้า (แก้ทีหลังที่หน้าต่ออายุบริการ)
import { useEffect, useState } from "react";
import { inputClass } from "@/components/ui/form-field";
import FieldHint from "@/components/ui/guidance/field-hint";
import { apiFetch } from "@/lib/api";
import { formatAmount } from "@/lib/shared/money.mjs";
import { addCycle, anchorDayOf, cycleUnit } from "@/lib/shared/renewal-math.mjs";
import type { CatalogSelection } from "@/lib/catalog-tasks";

type RenewalOptions = {
    products: { product_id: string; product_name: string; product_price: string; product_renewal_months: number }[];
    packages: { pkg_id: string; pkg_renewal_product_id: string }[];
};

type Override = { isSkipped?: boolean; label?: string; dueDate?: string };

export type JobRenewal = {
    key: string;
    productId: string;
    name: string;
    price: string;
    cycleMonths: number;
    dueDate: string;
    label: string;
    isSkipped: boolean;
    isIncludedInPackage: boolean;
};

/** โหลดสินค้ารายรอบ + แพ็กที่รวมรอบแรก (ครั้งเดียว) */
export function useRenewalOptions(isEnabled: boolean) {
    const [options, setOptions] = useState<RenewalOptions | null>(null);
    useEffect(() => {
        if (!isEnabled) return;
        let isLeftPage = false;
        apiFetch<RenewalOptions>("/renewals/form-options").then(({ data }) => {
            if (!isLeftPage) setOptions(data);
        });
        return () => {
            isLeftPage = true;
        };
    }, [isEnabled]);
    return options;
}

/** รายการต่ออายุที่เสนอจากสินค้าที่เลือก + ค่าที่ผู้ใช้แก้ */
export function jobRenewalsOf(
    selection: CatalogSelection[],
    options: RenewalOptions | null,
    startDate: string,
    overrides: Record<string, Override>,
): JobRenewal[] {
    if (!options || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return [];
    const productsById = new Map(options.products.map((product) => [product.product_id, product]));
    const anchor = anchorDayOf(startDate);
    const rows: JobRenewal[] = [];
    for (const row of selection) {
        const [kind, id] = row.key.split(":");
        const renewalProductId =
            kind === "p"
                ? id
                : options.packages.find((productPackage) => productPackage.pkg_id === id)?.pkg_renewal_product_id;
        const product = renewalProductId ? productsById.get(renewalProductId) : undefined;
        if (!product) continue;
        // สินค้า: จ่ายมาแล้วกี่รอบ = จำนวน · แพ็ก: รวมรอบแรกไว้ 1 รอบ
        const paidCycles = kind === "p" ? Math.max(1, row.quantity) : 1;
        let dueDate = startDate;
        for (let cycle = 0; cycle < paidCycles; cycle += 1)
            dueDate = addCycle(dueDate, product.product_renewal_months, anchor);
        const override = overrides[row.key] ?? {};
        rows.push({
            key: row.key,
            productId: product.product_id,
            name: product.product_name,
            price: product.product_price,
            cycleMonths: product.product_renewal_months,
            dueDate: override.dueDate ?? dueDate,
            label: override.label ?? "",
            isSkipped: Boolean(override.isSkipped),
            isIncludedInPackage: kind === "k",
        });
    }
    return rows;
}

export default function JobRenewals({
    renewals,
    errors,
    onChange,
}: {
    renewals: JobRenewal[];
    errors: Record<string, string>;
    onChange: (key: string, override: Override) => void;
}) {
    return (
        <div className="grid gap-3">
            {errors.renewals && <FieldHint error={errors.renewals} />}
            <ul className="grid gap-2">
                {renewals.map((renewal) => (
                    <li key={renewal.key} className="grid gap-3 rounded-xl border border-gray-200 p-3">
                        <label className="flex min-h-10 cursor-pointer items-start gap-3">
                            <input
                                type="checkbox"
                                checked={!renewal.isSkipped}
                                onChange={(event) => onChange(renewal.key, { isSkipped: !event.target.checked })}
                                className="mt-1 h-4 w-4 shrink-0 accent-blue-500"
                            />
                            <span className="grid gap-0.5">
                                <span className="text-sm text-gray-900">{renewal.name}</span>
                                <span className="text-xs text-gray-500">
                                    {formatAmount(renewal.price)} บาท/{cycleUnit(renewal.cycleMonths)}
                                    {renewal.isIncludedInPackage ? " · รอบแรกรวมในแพ็กแล้ว" : ""}
                                </span>
                            </span>
                        </label>
                        {!renewal.isSkipped && (
                            <div className="grid gap-3 sm:grid-cols-2">
                                <label
                                    className="grid gap-1 text-sm text-gray-800"
                                    htmlFor={`renew_label_${renewal.key}`}
                                >
                                    ชื่อที่จำง่าย
                                    <input
                                        id={`renew_label_${renewal.key}`}
                                        value={renewal.label}
                                        maxLength={200}
                                        placeholder="เช่น ชื่อโดเมนของผู้ซื้อ"
                                        onChange={(event) => onChange(renewal.key, { label: event.target.value })}
                                        className={inputClass(false)}
                                    />
                                </label>
                                <label
                                    className="grid gap-1 text-sm text-gray-800"
                                    htmlFor={`renew_due_${renewal.key}`}
                                >
                                    ครบรอบแรก
                                    <input
                                        id={`renew_due_${renewal.key}`}
                                        type="date"
                                        value={renewal.dueDate}
                                        onChange={(event) => onChange(renewal.key, { dueDate: event.target.value })}
                                        className={inputClass(false)}
                                    />
                                </label>
                            </div>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
}
