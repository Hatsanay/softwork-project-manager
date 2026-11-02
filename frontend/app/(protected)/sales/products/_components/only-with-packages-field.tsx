"use client";

// แสดงเมื่อเลือกชุด (2026-11-02 · docs/plans/2026-11-02-product-only-with-package.md)
// เลือกได้หลายชุด · ว่าง = แสดงตามปกติ · ลูกค้าเห็นสินค้านี้เมื่อเลือกชุดใดชุดหนึ่งแล้ว · ทีมเห็นในตัวคิดราคาพร้อมบอกว่าต้องเลือกชุดไหน
// ชุดที่ปิดใช้งานยังอยู่ในรายการ (บอกว่าปิดอยู่) · ปิดหมดทุกชุด = เตือนว่าลูกค้าจะไม่เห็นสินค้านี้เลย
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import FormField from "@/components/ui/form-field";
import FieldHint from "@/components/ui/guidance/field-hint";
import SearchableSelect from "@/components/ui/SearchableSelect";
import StatusPill from "@/components/ui/status-pill";
import { apiFetch } from "@/lib/api";
import type { ActiveStatus, OnlyWithPackage, ProductPackageSummary } from "../_types";

export default function OnlyWithPackagesField({
    value,
    initialPackages,
    error,
    onChange,
}: {
    value: string[];
    // ชุดที่ผูกไว้ตอนเปิดฟอร์ม (มีชื่อและสถานะ แม้ชุดนั้นปิดใช้งาน)
    initialPackages: OnlyWithPackage[];
    error?: string;
    onChange: (packageIds: string[]) => void;
}) {
    const [packages, setPackages] =
        useState<{ pkg_id: string; pkg_name: string; pkg_status: ActiveStatus }[]>(initialPackages);
    const [choice, setChoice] = useState("");

    useEffect(() => {
        let isClosed = false;
        apiFetch<{ data: ProductPackageSummary[] }>("/product-packages").then(({ data }) => {
            if (isClosed || !data) return;
            const loaded = data.data.map((row) => ({
                pkg_id: row.pkg_id,
                pkg_name: row.pkg_name,
                pkg_status: row.pkg_status,
            }));
            // ชุดที่ผูกไว้แต่ไม่อยู่ในรายการที่โหลด (เช่น เพิ่งถูกลบ) ยังแสดงชื่อเดิมไว้
            const missing = initialPackages.filter((row) => !loaded.some((item) => item.pkg_id === row.pkg_id));
            setPackages([...loaded, ...missing]);
        });
        return () => {
            isClosed = true;
        };
    }, [initialPackages]);

    const packageById = new Map(packages.map((row) => [row.pkg_id, row]));
    const selected = value.map(
        (packageId) =>
            packageById.get(packageId) ?? {
                pkg_id: packageId,
                pkg_name: packageId,
                pkg_status: "active" as ActiveStatus,
            },
    );
    const options = packages
        .filter((row) => row.pkg_status === "active" && !value.includes(row.pkg_id))
        .map((row) => ({ value: row.pkg_id, label: row.pkg_name }));
    const isAllInactive = selected.length > 0 && selected.every((row) => row.pkg_status !== "active");

    return (
        <FormField
            label="แสดงเมื่อเลือกชุด"
            htmlFor="only_with_packages"
            error={error}
            hint="ไม่บังคับ · ว่าง = แสดงตามปกติ · เลือกไว้ = ลูกค้าเห็นสินค้านี้เมื่อเลือกชุดใดชุดหนึ่งในรายการแล้วเท่านั้น (ทีมเห็นในตัวคิดราคาพร้อมบอกว่าต้องเลือกชุดไหน)"
        >
            <div className="grid gap-2">
                {selected.length > 0 && (
                    <ul className="flex flex-wrap gap-2">
                        {selected.map((row) => (
                            <li
                                key={row.pkg_id}
                                className="flex min-h-10 items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 py-1 pr-1 pl-3 text-sm text-blue-800"
                            >
                                <span className="wrap-break-word">{row.pkg_name}</span>
                                {row.pkg_status !== "active" && <StatusPill tone="neutral">ปิดใช้งาน</StatusPill>}
                                <button
                                    type="button"
                                    aria-label={`เอาชุด ${row.pkg_name} ออก`}
                                    className="flex h-8 w-8 items-center justify-center rounded-lg text-blue-700 hover:bg-blue-100"
                                    onClick={() => onChange(value.filter((packageId) => packageId !== row.pkg_id))}
                                >
                                    <X size={15} />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
                <SearchableSelect
                    options={options}
                    value={choice}
                    onChange={(packageId) => {
                        setChoice("");
                        if (packageId && !value.includes(packageId)) onChange([...value, packageId]);
                    }}
                    placeholder={selected.length > 0 ? "+ เพิ่มชุด" : "+ เลือกชุดที่ขายคู่กัน"}
                />
                {isAllInactive && (
                    <FieldHint error="ชุดที่เลือกปิดใช้งานทั้งหมด · ลูกค้าจะไม่เห็นสินค้านี้เลยจนกว่าจะเปิดชุดหรือเลือกชุดอื่น" />
                )}
            </div>
        </FormField>
    );
}
