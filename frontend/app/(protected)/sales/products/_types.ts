// ชนิดข้อมูลของหน้าสินค้า/บริการ — ตรงกับคำตอบของ backend/src/services/product.service.js และ product-package.service.js
// ชื่อฟิลด์ = ชื่อคอลัมน์ · ราคา/จำนวนเป็นข้อความทศนิยม ("15000.00") ราคาเป็นบาทเสมอ

export type ActiveStatus = "active" | "inactive";

export type Product = {
    product_id: string;
    product_code: string | null;
    product_name: string;
    product_description: string | null;
    product_unit: string | null;
    product_price: string;
    product_category_id: string | null;
    category_name: string | null;
    product_status: ActiveStatus;
    product_created_at: string;
    product_updated_at: string;
};

export type ProductCategory = {
    pc_id: string;
    pc_name: string;
    pc_sort_order: number;
    pc_status: ActiveStatus;
    product_count: number;
};

export type PackageItemType = "item" | "heading" | "note";

export type ProductPackageSummary = {
    pkg_id: string;
    pkg_name: string;
    pkg_description: string | null;
    pkg_category_id: string | null;
    category_name: string | null;
    pkg_status: ActiveStatus;
    pkg_updated_at: string;
    item_count: number;
    inactive_product_count: number;
};

export type ProductPackageItem = {
    pki_id: number;
    pki_order: number;
    pki_type: PackageItemType;
    pki_product_id: string | null;
    pki_description: string;
    pki_quantity: string | null;
    pki_unit: string | null;
    pki_unit_price: string | null;
    product_name: string | null;
    product_code: string | null;
    product_price: string | null;
    product_unit: string | null;
    product_status: ActiveStatus | null;
};

export type ProductPackage = {
    pkg_id: string;
    pkg_name: string;
    pkg_description: string | null;
    pkg_category_id: string | null;
    pkg_status: ActiveStatus;
    items: ProductPackageItem[];
};
