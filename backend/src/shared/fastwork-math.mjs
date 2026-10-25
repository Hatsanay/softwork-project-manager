// คำนวณเงินจาก Fastwork (2026-10-24 · P-1 · docs/plans/2026-10-24-pre-incorporation.md ข้อ 3.2)
//
// ต้นฉบับอยู่ที่ backend/src/shared/ — สำเนาใน frontend/lib/shared/ สร้างด้วย `npm run sync-shared` ห้ามแก้ที่สำเนา
// ทุกยอดเป็นสตางค์ (BigInt) ปัดครึ่งขึ้น · ไฟล์นี้ห้ามใช้ API ของ Node หรือของเบราว์เซอร์
//
//   ราคางวดที่ลูกค้าจ่าย
//   − ค่าธรรมเนียม            = ราคางวด × อัตราค่าธรรมเนียม %
//   − VAT ของค่าธรรมเนียม      = ค่าธรรมเนียม × อัตรา VAT %
//   − หัก ณ ที่จ่าย            = ราคางวด × อัตราหัก ณ ที่จ่าย %
//   = ยอดเข้าบัญชีจริง
import { divideRoundHalfUp, formatHundredths, parseHundredths } from "./money.mjs";

const HUNDRED_PERCENT = 10000n; // 100.00% เป็นหน่วยร้อยของเปอร์เซ็นต์

/** ยอด × อัตรา% ปัดครึ่งขึ้นเป็นสตางค์ (อัตรา "17.00" = 17%) */
export function percentOfAmount(amountHundredths, rateText) {
    const rateHundredths = parseHundredths(rateText, "อัตรา");
    return divideRoundHalfUp(amountHundredths * rateHundredths, HUNDRED_PERCENT);
}

/**
 * ค่าเริ่มต้นของรายการเงิน Fastwork จากราคางวดและอัตราที่ตั้งไว้ — ผู้ใช้แก้ยอดเองได้ทุกช่องก่อนบันทึก
 * @param {{ gross: string, feeRate: string, feeVatRate: string, whtRate: string }} input
 * @returns {{ fee: string, fee_vat: string, wht: string, net: string }}
 */
export function suggestPayoutAmounts({ gross, feeRate, feeVatRate, whtRate }) {
    const grossHundredths = parseHundredths(gross, "ราคางวด");
    const fee = percentOfAmount(grossHundredths, feeRate);
    const feeVat = percentOfAmount(fee, feeVatRate);
    const wht = percentOfAmount(grossHundredths, whtRate);
    return {
        fee: formatHundredths(fee),
        fee_vat: formatHundredths(feeVat),
        wht: formatHundredths(wht),
        net: formatHundredths(grossHundredths - fee - feeVat - wht),
    };
}

/**
 * ยอดเข้าบัญชีจากยอดที่ผู้ใช้ยืนยัน — ติดลบ = null (ยอดหักเกินราคางวด บันทึกไม่ได้)
 * @param {{ gross: string, fee: string, feeVat: string, wht: string }} amounts
 * @returns {string | null}
 */
export function payoutNetOf({ gross, fee, feeVat, wht }) {
    const net =
        parseHundredths(gross, "ราคางวด") -
        parseHundredths(fee, "ค่าธรรมเนียม") -
        parseHundredths(feeVat, "VAT ค่าธรรมเนียม") -
        parseHundredths(wht, "หัก ณ ที่จ่าย");
    return net < 0n ? null : formatHundredths(net);
}
