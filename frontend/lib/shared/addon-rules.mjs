// สินค้าที่แสดงเมื่อเลือกบางชุดเท่านั้น (2026-11-02 · docs/plans/2026-11-02-product-only-with-package.md)
// ต้นฉบับอยู่ที่ backend/src/shared/ — สำเนาใน frontend/lib/shared/ สร้างด้วย `npm run sync-shared` ห้ามแก้ที่สำเนา
// ใช้ทั้งหน้าร้าน ตัวคิดราคา และ backend ตอนส่งคำขอ/ออกใบจากตะกร้า (กติกาเดียว ไม่เขียนซ้ำ)

/**
 * สินค้านี้ขายได้กับตะกร้านี้ไหม · ไม่ได้ผูกชุด (รายการว่าง) = ขายได้เสมอ · ผูกไว้ = ต้องมีชุดใดชุดหนึ่งในตะกร้า
 * @param {string[]} onlyWithPackageIds ชุดที่สินค้านี้ขายคู่ (เฉพาะชุดที่เปิดใช้งาน)
 * @param {string[]} cartPackageIds ชุดที่อยู่ในตะกร้า (รวมชุดที่ทีมล็อกไว้)
 */
export function isSupportedByCart(onlyWithPackageIds, cartPackageIds) {
    if (!onlyWithPackageIds || onlyWithPackageIds.length === 0) return true;
    return onlyWithPackageIds.some((packageId) => cartPackageIds.includes(packageId));
}

/**
 * สินค้าเฉพาะชุดในตะกร้าที่ไม่มีชุดรองรับแล้ว (เช่น ลูกค้าเอาชุดออก) → ให้หน้าเว็บเอาออกและบอกลูกค้า
 * @param {{ id: string, only_with_package_ids?: string[] }[]} cartProducts สินค้าในตะกร้า
 * @param {string[]} cartPackageIds
 * @returns {string[]} รหัสสินค้าที่ต้องเอาออก
 */
export function unsupportedProductIds(cartProducts, cartPackageIds) {
    return cartProducts.filter((product) => !isSupportedByCart(product.only_with_package_ids ?? [], cartPackageIds)).map((product) => product.id);
}

/** ข้อความบอกว่าต้องเลือกชุดไหน เช่น "ขายคู่กับ เว็บ 2 ภาษา หรือ เว็บธุรกิจ" */
export function onlyWithText(packageNames) {
    return `ขายคู่กับ ${packageNames.join(" หรือ ")}`;
}
