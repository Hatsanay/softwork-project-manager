"use client";

// แผงเลือกรายการ (sales-cycle หัวข้อ 4.1) — กดเพิ่มได้หลายรายการติดกัน แผงไม่ปิด · ชุดรายการกดครั้งเดียวได้ทุกแถว
// ราคาสินค้าเป็นบาท → แปลงเป็นสกุลของใบด้วยอัตราในใบ (ปัดตามทศนิยมของสกุล) · ใบเก็บสำเนาของรายการเอง
import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import Segmented from "@/components/ui/segmented";
import StatusBanner from "@/components/ui/guidance/status-banner";
import { buttonClass } from "@/components/ui/button";
import { inputClass } from "@/components/ui/form-field";
import { apiFetch } from "@/lib/api";
import { convertFromBaht, formatAmount, formatHundredths, parseHundredths, trimQuantity } from "@/lib/shared/money.mjs";
import { QUOTATION_MESSAGES } from "../_messages";
import { emptyItem, type ItemForm } from "../_form-state";

type Product = {
    product_id: string;
    product_code: string | null;
    product_name: string;
    product_unit: string | null;
    product_price: string;
    category_name: string | null;
};

type PackageSummary = {
    pkg_id: string;
    pkg_name: string;
    pkg_status: "active" | "inactive";
    item_count: number;
    category_name: string | null;
};

type PackageDetail = {
    pkg_id: string;
    items: {
        pki_type: ItemForm["qti_type"];
        pki_product_id: string | null;
        pki_description: string;
        pki_quantity: string | null;
        pki_unit: string | null;
        pki_unit_price: string | null;
        product_name: string | null;
        product_price: string | null;
        product_status: "active" | "inactive" | null;
    }[];
};

type ItemPickerProps = {
    open: boolean;
    exchangeRate: string;
    currencyCode: string;
    currencyDecimals: number;
    addedCounts: Map<string, number>;
    onAdd: (items: ItemForm[]) => void;
    onClose: () => void;
};

const SEARCH_DELAY_MS = 250;

export default function ItemPicker({
    open,
    exchangeRate,
    currencyCode,
    currencyDecimals,
    addedCounts,
    onAdd,
    onClose,
}: ItemPickerProps) {
    const [tab, setTab] = useState<"products" | "packages">("products");
    const [search, setSearch] = useState("");
    const [products, setProducts] = useState<Product[]>([]);
    const [packages, setPackages] = useState<PackageSummary[]>([]);
    const [notice, setNotice] = useState<string | null>(null);

    useEffect(() => {
        if (!open || tab !== "products") return;
        let isStale = false;
        const timer = setTimeout(
            () => {
                const query = new URLSearchParams({ status: "active", limit: "50", offset: "0", search });
                apiFetch<{ data: Product[] }>(`/products?${query}`).then(({ data }) => {
                    if (!isStale) setProducts(data?.data ?? []);
                });
            },
            search ? SEARCH_DELAY_MS : 0,
        );
        return () => {
            isStale = true;
            clearTimeout(timer);
        };
    }, [open, tab, search]);

    useEffect(() => {
        if (!open || tab !== "packages") return;
        let isStale = false;
        apiFetch<{ data: PackageSummary[] }>("/product-packages").then(({ data }) => {
            if (!isStale)
                setPackages((data?.data ?? []).filter((productPackage) => productPackage.pkg_status === "active"));
        });
        return () => {
            isStale = true;
        };
    }, [open, tab]);

    useEffect(() => {
        if (!open) return;
        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") onClose();
        }
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [open, onClose]);

    if (!open) return null;

    // ราคาบาท → สกุลของใบ · อัตรายังไม่ถูกต้อง = คืน null (ให้ผู้ใช้กรอกราคาเอง)
    function toDocumentPrice(bahtPrice: string): string | null {
        try {
            return formatHundredths(
                convertFromBaht(parseHundredths(bahtPrice, "ราคา"), exchangeRate, currencyDecimals),
            );
        } catch {
            return null;
        }
    }

    function addProduct(product: Product) {
        const price = toDocumentPrice(product.product_price);
        onAdd([
            {
                ...emptyItem("item"),
                qti_product_id: product.product_id,
                qti_description: product.product_name,
                qti_unit: product.product_unit ?? "",
                qti_unit_price: price ?? "",
                qti_list_price: price ?? "",
                baht_price: product.product_price,
            },
        ]);
        setNotice(
            price
                ? `เพิ่ม "${product.product_name}" แล้ว`
                : `เพิ่ม "${product.product_name}" แล้ว · ยังไม่มีอัตราแลกเปลี่ยน กรอกราคาเอง`,
        );
    }

    async function addPackage(productPackage: PackageSummary) {
        const { data, error } = await apiFetch<PackageDetail>(`/product-packages/${productPackage.pkg_id}`);
        if (error || !data) {
            setNotice(error?.message ?? "โหลดชุดรายการไม่สำเร็จ");
            return;
        }
        const skipped: string[] = [];
        const rows: ItemForm[] = [];
        for (const packageItem of data.items) {
            if (packageItem.pki_product_id && packageItem.product_status === "inactive") {
                skipped.push(packageItem.product_name ?? packageItem.pki_description);
                continue;
            }
            const bahtPrice = packageItem.pki_product_id ? packageItem.product_price : packageItem.pki_unit_price;
            const price = bahtPrice ? toDocumentPrice(bahtPrice) : null;
            rows.push({
                ...emptyItem(packageItem.pki_type),
                qti_product_id: packageItem.pki_product_id,
                qti_package_id: data.pkg_id,
                qti_description: packageItem.pki_description,
                qti_quantity: packageItem.pki_quantity ? trimQuantity(packageItem.pki_quantity) : packageItem.pki_type === "item" ? "1" : "",
                qti_unit: packageItem.pki_unit ?? "",
                qti_unit_price: price ?? "",
                qti_list_price: packageItem.pki_product_id ? (price ?? "") : "",
                baht_price: packageItem.pki_product_id ? packageItem.product_price : null,
            });
        }
        onAdd(rows);
        const skippedText =
            skipped.length > 0 ? ` · ข้าม ${skipped.length} รายการที่ปิดใช้งาน: ${skipped.join(", ")}` : "";
        setNotice(`เพิ่มชุด "${productPackage.pkg_name}" ${rows.length} แถวแล้ว${skippedText}`);
    }

    return (
        <div className="fixed inset-0 z-40 flex justify-end bg-gray-900/30" onClick={onClose}>
            <aside
                role="dialog"
                aria-label="เลือกรายการสินค้า"
                onClick={(event) => event.stopPropagation()}
                className="mt-auto flex max-h-[90dvh] w-full flex-col gap-3 rounded-t-2xl bg-white p-4 shadow-float sm:mt-0 sm:max-h-none sm:h-full sm:max-w-2xl sm:rounded-none sm:rounded-l-2xl"
            >
                <div className="flex items-start justify-between gap-2">
                    <div>
                        <h2 className="text-base font-medium text-gray-900">เพิ่มจากรายการสินค้า</h2>
                        <p className="text-xs text-gray-500">
                            {tab === "packages" ? QUOTATION_MESSAGES.pickerPackages : QUOTATION_MESSAGES.picker}
                        </p>
                    </div>
                    <button type="button" aria-label="ปิด" className={buttonClass("ghost", "sm")} onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>
                <Segmented
                    label="ชนิดรายการ"
                    value={tab}
                    onChange={setTab}
                    options={[
                        { value: "products", label: "สินค้า/บริการ" },
                        { value: "packages", label: "ชุดรายการ" },
                    ]}
                />
                {tab === "products" && (
                    <input
                        autoFocus
                        value={search}
                        placeholder="ค้นหาชื่อ รหัส หรือรายละเอียด..."
                        onChange={(event) => setSearch(event.target.value)}
                        className={inputClass()}
                    />
                )}
                {notice && <StatusBanner tone="done" title={notice} />}

                <ul className="-mx-1 grid flex-1 content-start gap-1 overflow-y-auto px-1">
                    {tab === "products" &&
                        products.map((product) => {
                            const price = toDocumentPrice(product.product_price);
                            const addedCount = addedCounts.get(product.product_id) ?? 0;
                            return (
                                <li key={product.product_id}>
                                    <button
                                        type="button"
                                        onClick={() => addProduct(product)}
                                        className="flex w-full items-center justify-between gap-3 rounded-xl border border-transparent px-3 py-2 text-left hover:border-blue-100 hover:bg-blue-50/60"
                                    >
                                        <span className="grid min-w-0 gap-0.5">
                                            <span className="truncate text-sm text-gray-800">
                                                {product.product_name}
                                            </span>
                                            <span className="text-xs text-gray-500">
                                                {[product.product_code, product.product_unit, product.category_name]
                                                    .filter(Boolean)
                                                    .join(" · ")}
                                                {addedCount > 0 ? ` · ในใบแล้ว ×${addedCount}` : ""}
                                            </span>
                                        </span>
                                        <span className="flex shrink-0 items-center gap-2 text-sm tabular-nums text-gray-700">
                                            {price ? `${formatAmount(price, currencyDecimals)} ${currencyCode}` : "-"}
                                            <Plus size={16} className="text-blue-600" />
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                    {tab === "packages" &&
                        packages.map((productPackage) => (
                            <li key={productPackage.pkg_id}>
                                <button
                                    type="button"
                                    onClick={() => addPackage(productPackage)}
                                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-transparent px-3 py-2 text-left hover:border-blue-100 hover:bg-blue-50/60"
                                >
                                    <span className="grid min-w-0 gap-0.5">
                                        <span className="truncate text-sm text-gray-800">
                                            {productPackage.pkg_name}
                                        </span>
                                        <span className="text-xs text-gray-500">
                                            {productPackage.item_count} แถว
                                            {productPackage.category_name ? ` · ${productPackage.category_name}` : ""}
                                        </span>
                                    </span>
                                    <Plus size={16} className="shrink-0 text-blue-600" />
                                </button>
                            </li>
                        ))}
                    {tab === "products" && products.length === 0 && (
                        <li className="px-3 py-6 text-center text-sm text-gray-500">ไม่พบสินค้าที่เปิดใช้งาน</li>
                    )}
                    {tab === "packages" && packages.length === 0 && (
                        <li className="px-3 py-6 text-center text-sm text-gray-500">ยังไม่มีชุดรายการ</li>
                    )}
                </ul>
                <button type="button" className={buttonClass("secondary", "md")} onClick={onClose}>
                    เสร็จแล้ว
                </button>
            </aside>
        </div>
    );
}
