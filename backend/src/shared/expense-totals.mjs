// ─── คำนวณยอดค่าใช้จ่าย / บิลผู้ขาย — ใช้ทั้ง backend (ค่าที่บันทึกจริง) และหน้าเว็บ (แสดงยอดก่อนกดบันทึก) ────────
//
// ต้นฉบับอยู่ที่ backend/src/shared/ — สำเนาใน frontend/lib/shared/ สร้างด้วย `npm run sync-shared` ห้ามแก้ที่สำเนา
// แบบระบบ: docs/plans/2026-10-16-purchasing-2.md หัวข้อ 4.1 · สูตรเงินพื้นฐานอยู่ใน money.mjs
// ไฟล์นี้ห้ามใช้ API ของ Node หรือของเบราว์เซอร์ · เทสต์: backend/test/expense-totals.test.js
//
// - ยอดบรรทัด = จำนวน × ราคาต่อหน่วย (ไม่รวม VAT · ไม่มีส่วนลด — ใส่ยอดหลังลดตามเอกสารผู้ขาย)
// - VAT ใส่ตามที่ผู้ขายคิดในเอกสาร (ไม่คิดใหม่) · ระบบเสนอ = ยอดก่อน VAT × อัตรา ณ วันที่เอกสาร และเตือนเมื่อต่างเกิน 1 หน่วย (R-P8)
// - หัก ณ ที่จ่ายเป็นยอดประมาณ = ยอดก่อน VAT × อัตราของประเภทเงินได้ · ยอดก่อน VAT เป็นบาทต่ำกว่าเกณฑ์ขั้นต่ำต่อครั้ง = 0
//   (หักจริงตอนทำจ่าย ขั้น 2-4 — เกณฑ์ต้องยืนยันกับนักบัญชี X1)
// ทุกยอดเป็น BigInt หน่วยร้อยส่วน · สกุลที่ทศนิยมน้อยกว่า 2 ตำแหน่ง ยอดต้องลงหน่วยของสกุลนั้นพอดี

import { calculateLine, convertToBaht, divideRoundHalfUp, parseHundredths, roundToCurrency } from "./money.mjs";

const ONE_HUNDRED_PERCENT = 10_000n; // 100.00% ในหน่วยร้อยส่วน
// VAT ที่ใส่ต่างจากที่ระบบเสนอได้ไม่เกิน 1 หน่วยของสกุล (ผู้ขายปัดเศษต่อบรรทัด) — เกินนั้นเตือน ไม่บล็อก
const VAT_TOLERANCE = 100n;

/**
 * @param {object} input
 * @param {Array<{ exl_quantity: string | number, exl_unit_price: string | number }>} input.lines
 * @param {string | number} input.vatAmount VAT ตามเอกสารผู้ขาย
 * @param {string | number} input.vatRate อัตรา VAT ณ วันที่เอกสาร (ไว้เสนอยอด) เช่น "7.00"
 * @param {string | number | null} [input.whtRate] อัตราหัก ณ ที่จ่าย — null = ไม่หัก
 * @param {string | number | null} [input.whtMinPayment] เกณฑ์ขั้นต่ำต่อครั้ง (บาท)
 * @param {string | number} [input.exchangeRate] บาทต่อ 1 หน่วย ("1" สำหรับบาท)
 * @param {number} [input.currencyDecimals]
 */
export function calculateExpense({
    lines,
    vatAmount,
    vatRate,
    whtRate = null,
    whtMinPayment = null,
    exchangeRate = "1",
    currencyDecimals = 2,
}) {
    const errors = {};

    const lineAmounts = lines.map((line, index) => {
        try {
            return calculateLine({
                quantity: line.exl_quantity,
                unitPrice: line.exl_unit_price,
                currencyDecimals,
            }).amount;
        } catch (err) {
            const column = err.field === "จำนวน" ? "exl_quantity" : "exl_unit_price";
            errors[`lines.${index}.${column}`] = err.message;
            return 0n;
        }
    });
    const subtotal = lineAmounts.reduce((sum, amount) => sum + amount, 0n);

    let vat = 0n;
    try {
        vat = parseHundredths(vatAmount || 0, "VAT");
        if (vat < 0n) errors.ex_vat_amount = "VAT ติดลบไม่ได้";
        else if (roundToCurrency(vat, currencyDecimals) !== vat)
            errors.ex_vat_amount = `สกุลนี้มีทศนิยม ${currencyDecimals} ตำแหน่ง — ใส่ VAT ให้ตรงหน่วย`;
    } catch (err) {
        errors.ex_vat_amount = err.message;
    }
    const vatRateHundredths = parseHundredths(vatRate || 0, "อัตรา VAT");
    const suggestedVat = roundToCurrency(
        divideRoundHalfUp(subtotal * vatRateHundredths, ONE_HUNDRED_PERCENT),
        currencyDecimals,
    );
    const vatDifference = vat > suggestedVat ? vat - suggestedVat : suggestedVat - vat;
    const total = subtotal + vat;

    let subtotalThb = 0n;
    let totalThb = 0n;
    try {
        subtotalThb = convertToBaht(subtotal, exchangeRate);
        totalThb = convertToBaht(total, exchangeRate);
    } catch (err) {
        errors.ex_exchange_rate = err.message;
    }

    let withholding = 0n;
    let isBelowWithholdingMinimum = false;
    if (whtRate !== null && whtRate !== undefined && whtRate !== "") {
        const minimum = parseHundredths(whtMinPayment || 0, "เกณฑ์ขั้นต่ำ");
        isBelowWithholdingMinimum = subtotal > 0n && subtotalThb < minimum;
        if (!isBelowWithholdingMinimum) {
            const rate = parseHundredths(whtRate, "อัตราหัก ณ ที่จ่าย");
            withholding = roundToCurrency(divideRoundHalfUp(subtotal * rate, ONE_HUNDRED_PERCENT), currencyDecimals);
        }
    }

    return {
        lineAmounts,
        subtotal,
        vat,
        suggestedVat,
        // มี VAT และต่างจากที่ระบบคิดเกิน 1 หน่วย — แสดงเตือนให้ตรวจกับเอกสาร
        isVatDifferent: vat > 0n && vatDifference > VAT_TOLERANCE,
        total,
        subtotalThb,
        totalThb,
        withholding,
        isBelowWithholdingMinimum,
        netPayable: total - withholding,
        errors,
    };
}
