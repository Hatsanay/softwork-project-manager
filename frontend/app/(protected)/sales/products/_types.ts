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
    // หน้าร้านของลิงก์เลือกบริการ (2026-10-25) · MySQL ส่ง 0/1
    product_is_public: number | boolean;
    product_image_url: string | null;
    // งานเพิ่มแบบ % ของยอดรายการอื่น (2026-10-25)
    product_price_mode: "fixed" | "percent";
    product_percent: string | null;
    product_created_at: string;
    product_updated_at: string;
};

export type ProductCategory = {
    pc_id: string;
    pc_name: string;
    pc_sort_order: number;
    pc_status: ActiveStatus;
    pc_is_single_choice: boolean | number;
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
    pkg_is_public: number | boolean;
    pkg_image_url: string | null;
    pkg_updated_at: string;
    item_count: number;
    inactive_product_count: number;
    // ราคาชุดตอนนี้ (ไม่นับแถวสินค้าปิดใช้งาน) และชื่อรายการแรกๆ สำหรับการ์ด (2026-10-30)
    pkg_total: string;
    preview_items: string[];
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
    pkg_is_public: number | boolean;
    pkg_image_url: string | null;
    items: ProductPackageItem[];
    // กติกางานเพิ่มบนหน้าร้าน (2026-10-25)
    addon_rules: { product_id: string; rule: "included" | "not_available"; product_name: string }[];
};
