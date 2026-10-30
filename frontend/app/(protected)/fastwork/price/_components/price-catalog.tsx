"use client";

// ฝั่งเลือกสินค้าของตัวคิดราคา Fastwork (ปรับหน้า 2026-10-30) — ค้นหา · ชิปหมวด · แพ็กเป็นการ์ดวางเทียบกัน · งานเพิ่มแยกตามหมวด
// กติกาเดียวกับหน้าร้าน: หมวดเลือกได้อย่างเดียว = เปลี่ยนแทน (คิดที่ page) · งานเพิ่มที่มีในแพ็กแล้ว = กดไม่ได้ · ใช้กับแพ็กไม่ได้ = ซ่อน
import { useState } from "react";
import { Check, Package, Search } from "lucide-react";
import EmptyState from "@/components/ui/empty-state";
import { inputClass } from "@/components/ui/form-field";
import { formatAmount, formatHundredths } from "@/lib/shared/money.mjs";
import { packagePrice } from "@/app/order/_components/order-shop";
import QuantityControl from "@/app/order/_components/quantity-control";
import type { Catalog, CatalogPackage, CatalogProduct } from "@/app/order/_types";

// รายการในชุดที่แสดงก่อนกด "ดูทั้งหมด" (การ์ดยาวเท่ากันพอดีตา)
const PACKAGE_PREVIEW_ITEMS = 4;
const NO_CATEGORY = "none";

export type AddonState = { rule: "included" | "not_available"; packageName: string } | null;

export default function PriceCatalog({
    catalog,
    quantities,
    addonStateOf,
    onChange,
}: {
    catalog: Catalog;
    quantities: Record<string, number>;
    // งานเพิ่มชิ้นนี้ติดกติกาของแพ็กที่เลือกอยู่ไหม (included / not_available)
    addonStateOf: (productId: string) => AddonState;
    onChange: (key: string, quantity: number) => void;
}) {
    const [search, setSearch] = useState("");
    const [categoryFilter, setCategoryFilter] = useState("all");

    const keyword = search.trim().toLowerCase();
    const matches = (name: string, description: string | null) =>
        keyword === "" || name.toLowerCase().includes(keyword) || (description ?? "").toLowerCase().includes(keyword);
    const inFilter = (categoryId: string | null) =>
        categoryFilter === "all" || (categoryId ?? NO_CATEGORY) === categoryFilter;

    const packages = catalog.packages
        .filter((row) => matches(row.pkg_name, row.pkg_description) && inFilter(row.pkg_category_id))
        .sort((first, second) => Number(packagePrice(first) - packagePrice(second)));
    const visibleProducts = catalog.products.filter((row) => addonStateOf(row.product_id)?.rule !== "not_available");
    const hiddenCount = catalog.products.length - visibleProducts.length;
    const products = visibleProducts.filter(
        (row) => matches(row.product_name, row.product_description) && inFilter(row.product_category_id),
    );
    const productGroups = [
        ...catalog.categories.map((category) => ({
            key: category.pc_id,
            name: category.pc_name,
            rows: products.filter((row) => row.product_category_id === category.pc_id),
        })),
        { key: NO_CATEGORY, name: "อื่นๆ", rows: products.filter((row) => !row.product_category_id) },
    ].filter((group) => group.rows.length > 0);

    // ทุกแพ็กอยู่หมวดเลือกได้อย่างเดียวหมวดเดียวกัน = บอกว่าเลือกได้ 1 แพ็ก (หมวดปกติเลือกหลายแพ็กได้)
    const packageCategoryIds = new Set(catalog.packages.map((row) => row.pkg_category_id));
    const [packageCategoryId] = [...packageCategoryIds];
    const isOnePackage =
        packageCategoryIds.size === 1 &&
        catalog.categories.some((category) => category.pc_id === packageCategoryId && category.pc_is_single_choice);

    const chips = [
        { value: "all", label: "ทั้งหมด" },
        ...catalog.categories
            .filter(
                (category) =>
                    catalog.products.some((row) => row.product_category_id === category.pc_id) ||
                    catalog.packages.some((row) => row.pkg_category_id === category.pc_id),
            )
            .map((category) => ({ value: category.pc_id, label: category.pc_name })),
        ...(catalog.products.some((row) => !row.product_category_id) ? [{ value: NO_CATEGORY, label: "อื่นๆ" }] : []),
    ];

    return (
        <section className="grid min-w-0 gap-4" aria-label="สินค้าและชุด">
            <div className="grid gap-3">
                <label className="relative block">
                    <span className="sr-only">ค้นหาสินค้าหรือชุด</span>
                    <Search
                        size={16}
                        className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-gray-400"
                        aria-hidden="true"
                    />
                    <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="ค้นหาชื่อหรือรายละเอียด"
                        className={`${inputClass()} pl-10`}
                    />
                </label>
                {chips.length > 2 && (
                    <div
                        className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
                        role="group"
                        aria-label="หมวด"
                    >
                        <div className="flex w-max gap-2 pb-1">
                            {chips.map((chip) => (
                                <button
                                    key={chip.value}
                                    type="button"
                                    aria-pressed={categoryFilter === chip.value}
                                    onClick={() => setCategoryFilter(chip.value)}
                                    className={`min-h-10 rounded-full border px-4 text-sm whitespace-nowrap transition ${
                                        categoryFilter === chip.value
                                            ? "border-blue-600 bg-blue-600 text-white shadow-brand"
                                            : "border-gray-200 bg-white text-gray-700 hover:border-blue-300"
                                    }`}
                                >
                                    {chip.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {packages.length === 0 && productGroups.length === 0 && (
                <EmptyState
                    title="ไม่พบรายการ"
                    description={
                        keyword
                            ? "ลองค้นด้วยคำอื่น หรือกด ทั้งหมด"
                            : 'เปิด "แสดงบนหน้าร้าน" ที่สินค้า/ชุดในหน้าสินค้าและบริการก่อน'
                    }
                />
            )}

            {packages.length > 0 && (
                <div className="grid gap-3">
                    <h2 className="flex items-center gap-2 text-base font-medium text-gray-900">
                        <Package size={18} className="text-blue-600" aria-hidden="true" />
                        แพ็กเกจ
                        {isOnePackage && (
                            <span className="text-sm font-normal text-gray-500">
                                เลือกได้ 1 แพ็ก · เลือกใหม่ = เปลี่ยนแทน
                            </span>
                        )}
                    </h2>
                    <ul
                        className={`grid gap-3 ${packages.length > 1 ? "sm:grid-cols-2" : ""} ${packages.length > 2 ? "2xl:grid-cols-3" : ""}`}
                    >
                        {packages.map((row) => (
                            <PackageCard
                                key={row.pkg_id}
                                productPackage={row}
                                quantity={quantities[`k:${row.pkg_id}`] ?? 0}
                                onChange={(quantity) => onChange(`k:${row.pkg_id}`, quantity)}
                            />
                        ))}
                    </ul>
                </div>
            )}

            {productGroups.map((group) => (
                <div key={group.key} className="grid gap-2">
                    <h2 className="flex items-baseline gap-2 text-base font-medium text-gray-900">
                        {group.name}
                        <span className="text-sm font-normal text-gray-500">{group.rows.length} รายการ</span>
                    </h2>
                    <ul className="grid overflow-hidden rounded-2xl border border-gray-200 bg-white">
                        {group.rows.map((row) => (
                            <AddonRow
                                key={row.product_id}
                                product={row}
                                state={addonStateOf(row.product_id)}
                                quantity={quantities[`p:${row.product_id}`] ?? 0}
                                onChange={(quantity) => onChange(`p:${row.product_id}`, quantity)}
                            />
                        ))}
                    </ul>
                </div>
            ))}
            {hiddenCount > 0 && (
                <p className="text-xs text-gray-500">ซ่อน {hiddenCount} รายการที่ใช้กับแพ็กที่เลือกไม่ได้</p>
            )}
        </section>
    );
}

function PackageCard({
    productPackage,
    quantity,
    onChange,
}: {
    productPackage: CatalogPackage;
    quantity: number;
    onChange: (quantity: number) => void;
}) {
    const [isExpanded, setIsExpanded] = useState(false);
    const isChosen = quantity > 0;
    const items = isExpanded ? productPackage.items : productPackage.items.slice(0, PACKAGE_PREVIEW_ITEMS);
    const moreCount = productPackage.items.length - PACKAGE_PREVIEW_ITEMS;
    return (
        <li
            className={`grid content-start gap-3 rounded-2xl border bg-white p-4 transition ${isChosen ? "border-blue-400 shadow-card ring-2 ring-blue-100" : "border-gray-200 hover:border-blue-200"}`}
        >
            <div className="grid gap-1">
                <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-medium wrap-break-word text-gray-900">{productPackage.pkg_name}</h3>
                    {isChosen && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                            <Check size={12} aria-hidden="true" />
                            เลือกแล้ว
                        </span>
                    )}
                </div>
                <p className="text-2xl font-medium text-gray-900 tabular-nums">
                    {formatAmount(formatHundredths(packagePrice(productPackage)))}
                    <span className="ml-1 text-sm font-normal text-gray-500">บาท / ชุด</span>
                </p>
                {productPackage.pkg_description && (
                    <p className="line-clamp-2 text-xs text-gray-500">{productPackage.pkg_description}</p>
                )}
            </div>
            <ul className="grid gap-1 text-sm text-gray-700">
                {items.map((item, index) => (
                    <li key={`${item.name}-${index}`} className="flex items-start gap-1.5">
                        <Check size={14} className="mt-1 shrink-0 text-blue-600" aria-hidden="true" />
                        <span className="min-w-0 wrap-break-word">{item.name}</span>
                    </li>
                ))}
            </ul>
            {moreCount > 0 && (
                <button
                    type="button"
                    className="-my-1 min-h-9 justify-self-start text-sm text-blue-600 hover:underline"
                    onClick={() => setIsExpanded((current) => !current)}
                >
                    {isExpanded ? "ย่อรายการ" : `ดูอีก ${moreCount} รายการ`}
                </button>
            )}
            <div className="mt-auto">
                <QuantityControl quantity={quantity} onChange={onChange} label={productPackage.pkg_name} fullWidth />
            </div>
        </li>
    );
}

function AddonRow({
    product,
    state,
    quantity,
    onChange,
}: {
    product: CatalogProduct;
    state: AddonState;
    quantity: number;
    onChange: (quantity: number) => void;
}) {
    const isPercent = product.product_price_mode === "percent";
    const priceText = isPercent
        ? `+${Number(product.product_percent)}% ของยอด`
        : `${formatAmount(product.product_price)} บาท${product.product_unit ? ` / ${product.product_unit}` : ""}`;
    const isIncluded = state?.rule === "included";
    return (
        <li
            className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-gray-100 px-4 py-3 first:border-t-0 ${quantity > 0 ? "bg-blue-50/50" : ""}`}
        >
            <div className="grid min-w-0 gap-0.5">
                <span className={`text-sm wrap-break-word ${isIncluded ? "text-gray-500" : "text-gray-900"}`}>
                    {product.product_name}
                </span>
                {product.product_description && (
                    <span className="line-clamp-1 text-xs text-gray-500">{product.product_description}</span>
                )}
                <span className="text-sm text-gray-700 tabular-nums">{priceText}</span>
            </div>
            {isIncluded ? (
                <span className="max-w-32 text-right text-xs text-gray-500">มีใน {state.packageName} แล้ว</span>
            ) : (
                <QuantityControl
                    quantity={quantity}
                    onChange={(next) => onChange(isPercent ? Math.min(next, 1) : next)}
                    label={product.product_name}
                    compact
                />
            )}
        </li>
    );
}
