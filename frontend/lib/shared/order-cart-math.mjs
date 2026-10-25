// ยอดในตะกร้าของลิงก์เลือกบริการ (2026-10-25 · docs/plans/2026-10-25-client-order-link.md ข้อ 3)
//
// ต้นฉบับอยู่ที่ backend/src/shared/ — สำเนาใน frontend/lib/shared/ สร้างด้วย `npm run sync-shared` ห้ามแก้ที่สำเนา
// ทุกยอดเป็นสตางค์ (BigInt) · หน้าเว็บกับ backend คิดด้วยไฟล์นี้ไฟล์เดียว ตัวเลขที่ลูกค้าเห็นจึงตรงกับที่ระบบตรวจตอนส่ง
//
//   แต่ละแถว = ราคาต่อหน่วย × จำนวน (ปัดครึ่งขึ้นเป็นสตางค์)
//   รวม = ผลรวมทุกแถว
//   VAT = รวม × อัตรา (เฉพาะเมื่อจด VAT แล้ว · ปัดครึ่งขึ้น)
//   ยอดประมาณการ = รวม + VAT
// ชุดสินค้า: จำนวนชุด × จำนวนของแต่ละรายการในชุด แล้วคิดเป็นแถวตามปกติ
// งานเพิ่มแบบ % (เช่น งานด่วน +30%): ยอด = % × ผลรวมแถวราคาตายตัว (ไม่คิด % ซ้อน %) ปัดครึ่งขึ้นต่อแถว · VAT คิดหลังรวมแถว %
import { divideRoundHalfUp, parseHundredths } from "./money.mjs";

/** ราคาต่อหน่วย × จำนวน → สตางค์ */
export function lineAmount(unitPrice, quantity) {
    const price = parseHundredths(unitPrice, "ราคา");
    const count = parseHundredths(quantity, "จำนวน");
    return divideRoundHalfUp(price * count, 100n);
}

/** จำนวนในชุด × จำนวนชุด → ข้อความทศนิยม 2 ตำแหน่ง */
export function multiplyQuantity(quantity, setCount) {
    const hundredths = parseHundredths(quantity, "จำนวน") * BigInt(setCount);
    const whole = hundredths / 100n;
    const fraction = String(hundredths % 100n).padStart(2, "0");
    return `${whole}.${fraction}`;
}

/** ยอดของแถว % จากผลรวมแถวราคาตายตัว → สตางค์ */
export function percentAmount(baseHundredths, percentText) {
    return divideRoundHalfUp(baseHundredths * parseHundredths(percentText, "อัตรา %"), 10000n);
}

/** ผลรวมแถวราคาตายตัว (ฐานของแถว %) */
export function fixedSubtotal(lines) {
    return lines.filter((line) => !line.percent).reduce((sum, line) => sum + lineAmount(line.unitPrice, line.quantity), 0n);
}

/**
 * @param {{ lines: ({ unitPrice: string, quantity: string, percent?: null } | { percent: string })[], vatRate: string | null }} cart
 * @returns {{ subtotal: bigint, vat: bigint, total: bigint }}
 */
export function cartTotals({ lines, vatRate }) {
    const base = fixedSubtotal(lines);
    const subtotal = lines.filter((line) => line.percent).reduce((sum, line) => sum + percentAmount(base, line.percent), base);
    const vat = vatRate === null || vatRate === undefined ? 0n : divideRoundHalfUp(subtotal * parseHundredths(vatRate, "อัตรา VAT"), 10000n);
    return { subtotal, vat, total: subtotal + vat };
}
