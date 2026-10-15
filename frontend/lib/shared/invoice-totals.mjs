// ─── คำนวณยอดใบแจ้งหนี้ — ใช้ทั้ง backend (ค่าที่บันทึกจริง) และหน้าเว็บ (แสดงยอดก่อนกดออก) ─────────────────
//
// ต้นฉบับอยู่ที่ backend/src/shared/ — สำเนาใน frontend/lib/shared/ สร้างด้วย `npm run sync-shared` ห้ามแก้ที่สำเนา
// แบบระบบ: docs/plans/2026-10-14-invoices-1b.md หัวข้อ 4.1 และ R-B2/R-B4 · สูตรเงินพื้นฐานอยู่ใน money.mjs
// ไฟล์นี้ห้ามใช้ API ของ Node หรือของเบราว์เซอร์ · เทสต์: backend/test/invoice-totals.test.js
//
// ใบแจ้งหนี้ที่ออกจากงวดของใบเสนอราคา:
//   - ยอดงวดตามใบเสนอราคารวม VAT ของใบเสนอราคาไว้แล้ว → แยกเป็น "ยอดก่อน VAT" กับ "VAT" ของแต่ละงวด
//   - แยกทีเดียวจาก "ทุกงวด" ของใบเสนอราคา (ไม่ใช่เฉพาะงวดที่เลือก) → ผลของแต่ละงวดคงที่เสมอ ไม่ว่าออกบิลงวดไหนก่อน
//     และผลรวมยอดก่อน VAT ของทุกงวด = ยอดก่อน VAT ของใบเสนอราคาพอดีทุกสตางค์
//   - VAT ณ วันออกใบแจ้งหนี้ไม่เท่าของใบเสนอราคา (เช่น บริษัทจด VAT ระหว่างทาง) → คิด VAT ใหม่จากยอดก่อน VAT
//     ยอดรวมจะต่างจากที่ลูกค้าตกลง จึงคืน vatChanged ให้ backend บังคับให้ผู้ใช้ยืนยันก่อนออก (R-B4)

import {
    MoneyInputError,
    convertToBaht,
    divideRoundHalfUp,
    parseHundredths,
    roundToCurrency,
} from "./money.mjs";

const ONE_HUNDRED_PERCENT = 10_000n; // 100.00% ในหน่วยร้อยส่วน

/**
 * แยกยอดแต่ละงวดเป็นยอดก่อน VAT + VAT ตามสัดส่วนของใบเสนอราคา ด้วยวิธี "เศษเหลือมากสุดได้ก่อน"
 * (largest remainder): ปัดทุกงวดลงก่อน แล้วแจกหน่วยที่ขาดให้งวดที่เศษมากสุด (เท่ากันให้งวดลำดับก่อน)
 *
 * ทำไมไม่ใช้ "งวดสุดท้ายรับเศษ": งวดสุดท้ายเล็กมาก (เช่น 0.01) อาจได้ยอดก่อน VAT ติดลบหรือมากกว่ายอดงวด (VAT ติดลบ)
 * วิธีนี้รับประกันทุกงวด: 0 ≤ ยอดก่อน VAT ≤ ยอดงวด และผลรวมยอดก่อน VAT = ยอดก่อน VAT ของใบเสนอราคาพอดี
 *
 * @param {object} input
 * @param {bigint[]} input.milestoneAmounts ยอดของทุกงวดตามลำดับ (ร้อยส่วน รวม VAT ของใบเสนอราคา)
 * @param {bigint} input.afterDiscount ยอดก่อน VAT ของใบเสนอราคา
 * @param {bigint} input.total ยอดรวมทั้งสิ้นของใบเสนอราคา (= ผลรวมยอดงวด)
 * @param {number} [input.currencyDecimals]
 * @returns {Array<{ amount: bigint, base: bigint, vat: bigint }>}
 */
export function splitMilestoneBases({ milestoneAmounts, afterDiscount, total, currencyDecimals = 2 }) {
    const milestoneSum = milestoneAmounts.reduce((sum, amount) => sum + amount, 0n);
    if (milestoneSum !== total) {
        throw new Error(`ผลรวมงวด (${milestoneSum}) ไม่เท่ายอดใบเสนอราคา (${total}) — ข้อมูลใบเสนอราคาไม่สมบูรณ์`);
    }
    if (total <= 0n) throw new Error("ยอดใบเสนอราคาต้องมากกว่า 0");
    if (afterDiscount < 0n || afterDiscount > total) {
        throw new Error("ยอดก่อน VAT ของใบเสนอราคาต้องอยู่ระหว่าง 0 ถึงยอดรวมทั้งสิ้น");
    }

    // ทำงานเป็น "หน่วยเล็กสุดของสกุลเงิน" (สตางค์ / เยน) ผลจะลงหน่วยของสกุลนั้นเสมอ
    const smallestUnit = 10n ** BigInt(2 - currencyDecimals);
    const baseUnitsTotal = afterDiscount / smallestUnit;

    const shares = milestoneAmounts.map((amount, index) => {
        const numerator = amount * afterDiscount; // ส่วนที่เป็นยอดก่อน VAT = ยอดงวด × ก่อน VAT / รวมทั้งสิ้น
        const denominator = total * smallestUnit;
        return {
            index,
            amount,
            baseUnits: numerator / denominator,
            remainder: numerator % denominator,
        };
    });

    let missingUnits = baseUnitsTotal - shares.reduce((sum, share) => sum + share.baseUnits, 0n);
    const byLargestRemainder = [...shares].sort((first, second) => {
        if (first.remainder === second.remainder) return first.index - second.index;
        return first.remainder > second.remainder ? -1 : 1;
    });
    for (const share of byLargestRemainder) {
        if (missingUnits === 0n) break;
        share.baseUnits += 1n;
        missingUnits -= 1n;
    }

    return shares.map((share) => {
        const base = share.baseUnits * smallestUnit;
        return { amount: share.amount, base, vat: share.amount - base };
    });
}

/**
 * ยอดหัก ณ ที่จ่ายโดยประมาณ (แสดงบนใบเพื่อให้ลูกค้าโอนยอดสุทธิถูก) = ยอดก่อน VAT × อัตรา ปัดครึ่งขึ้น
 * @param {bigint} afterDiscount ยอดก่อน VAT ของใบแจ้งหนี้
 * @param {string | number | null | undefined} whtRate เช่น "3" — ว่าง = ไม่แสดงหัก ณ ที่จ่าย (คืน 0)
 * @param {number} [currencyDecimals]
 * @returns {bigint}
 */
export function calculateWithholding(afterDiscount, whtRate, currencyDecimals = 2) {
    if (whtRate === null || whtRate === undefined || whtRate === "") return 0n;
    const rate = parseHundredths(whtRate, "อัตราหัก ณ ที่จ่าย");
    if (rate < 0n || rate > 1_500n) {
        throw new MoneyInputError("อัตราหัก ณ ที่จ่ายต้องอยู่ระหว่าง 0–15%", "อัตราหัก ณ ที่จ่าย");
    }
    return roundToCurrency(divideRoundHalfUp(afterDiscount * rate, ONE_HUNDRED_PERCENT), currencyDecimals);
}

/**
 * ยอดของใบแจ้งหนี้ที่ออกจากงวดของใบเสนอราคา
 *
 * @param {object} input
 * @param {{ afterDiscount: bigint, total: bigint, vatRate: string }} input.quotation ยอดของใบเสนอราคา + อัตรา VAT ที่ใช้ ("7.00")
 * @param {Array<{ id: string | number, amount: bigint }>} input.milestones ทุกงวดของใบเสนอราคา ตามลำดับ
 * @param {Array<string | number>} input.selectedIds งวดที่จะเรียกเก็บในใบนี้
 * @param {string} input.vatRate อัตรา VAT ณ วันออกใบแจ้งหนี้
 * @param {number} [input.currencyDecimals]
 * @param {string} [input.exchangeRate] บาทต่อ 1 หน่วย ณ วันออก ("1" สำหรับบาท)
 * @param {string | null} [input.whtRate] อัตราหัก ณ ที่จ่ายที่แสดงบนใบ
 */
export function calculateMilestoneInvoice({
    quotation,
    milestones,
    selectedIds,
    vatRate,
    currencyDecimals = 2,
    exchangeRate = "1",
    whtRate = null,
}) {
    const selected = new Set(selectedIds.map(String));
    if (selected.size === 0) throw new MoneyInputError("เลือกงวดที่จะเรียกเก็บอย่างน้อย 1 งวด", "งวดที่เรียกเก็บ");
    const knownIds = new Set(milestones.map((milestone) => String(milestone.id)));
    for (const id of selected) {
        if (!knownIds.has(id)) throw new MoneyInputError("งวดที่เลือกไม่อยู่ในใบเสนอราคานี้", "งวดที่เรียกเก็บ");
    }

    const splits = splitMilestoneBases({
        milestoneAmounts: milestones.map((milestone) => milestone.amount),
        afterDiscount: quotation.afterDiscount,
        total: quotation.total,
        currencyDecimals,
    });
    const lines = milestones
        .map((milestone, index) => ({ milestoneId: milestone.id, ...splits[index] }))
        .filter((line) => selected.has(String(line.milestoneId)));

    const afterDiscount = lines.reduce((sum, line) => sum + line.base, 0n);
    const quotationVat = lines.reduce((sum, line) => sum + line.vat, 0n);
    const quotationRate = parseHundredths(quotation.vatRate, "อัตรา VAT ของใบเสนอราคา");
    const invoiceRate = parseHundredths(vatRate, "อัตรา VAT");
    const vatChanged = quotationRate !== invoiceRate;

    // VAT เท่าเดิม → ใช้ VAT ที่แยกจากงวด (ยอดรวม = ยอดงวดที่ลูกค้าตกลงทุกสตางค์)
    // VAT เปลี่ยน → คิด VAT ใหม่ทั้งใบจากยอดก่อน VAT (ปัดครั้งเดียวที่ระดับเอกสาร แบบเดียวกับ calculateDocumentTotals)
    const vat = vatChanged
        ? roundToCurrency(divideRoundHalfUp(afterDiscount * invoiceRate, ONE_HUNDRED_PERCENT), currencyDecimals)
        : quotationVat;
    const total = afterDiscount + vat;
    const withholding = calculateWithholding(afterDiscount, whtRate, currencyDecimals);

    return {
        lines,
        subtotal: afterDiscount,
        discount: 0n,
        afterDiscount,
        vatRate: invoiceRate,
        vat,
        total,
        vatChanged,
        agreedTotal: lines.reduce((sum, line) => sum + line.amount, 0n),
        withholding,
        netPayable: total - withholding,
        afterDiscountThb: convertToBaht(afterDiscount, exchangeRate),
        totalThb: convertToBaht(total, exchangeRate),
    };
}
