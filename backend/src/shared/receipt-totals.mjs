// ─── คำนวณยอดใบเสร็จรับเงิน — ใช้ทั้ง backend (ค่าที่บันทึกจริง) และหน้าเว็บ (แสดงเงินเข้าจริงก่อนกดยืนยัน) ───────
//
// ต้นฉบับอยู่ที่ backend/src/shared/ — สำเนาใน frontend/lib/shared/ สร้างด้วย `npm run sync-shared` ห้ามแก้ที่สำเนา
// แบบระบบ: docs/plans/2026-10-15-receipts-1c.md หัวข้อ 4 และ R-C3/R-C4 · สูตรเงินพื้นฐานอยู่ใน money.mjs
// ไฟล์นี้ห้ามใช้ API ของ Node หรือของเบราว์เซอร์ · เทสต์: backend/test/receipt-totals.test.js
//
// สมการของใบเสร็จ (สกุลของใบแจ้งหนี้): ยอดตัดหนี้รวม = เงินเข้าจริง + หัก ณ ที่จ่าย + ค่าธรรมเนียม
// ทุกยอดเป็น BigInt หน่วยร้อยส่วน (สตางค์/เซนต์) · สกุลที่ทศนิยมน้อยกว่า 2 ตำแหน่ง ยอดต้องลงหน่วยของสกุลนั้นพอดี
//
// VAT และยอดบาทของแต่ละครั้งที่รับ: คิดตามสัดส่วนของใบแจ้งหนี้ ปัดครึ่งขึ้น · ครั้งที่ทำให้ใบชำระครบรับส่วนที่เหลือทั้งหมด
// → รับกี่ครั้งก็ตาม ผลรวมทุกครั้ง = VAT / ยอดบาทของใบพอดีทุกสตางค์ (เตรียมออกใบกำกับภาษีตอนรับเงิน — คำถาม B1)

import { divideRoundHalfUp, roundToCurrency } from "./money.mjs";

const RATE_DECIMALS = 10;

function clamp(value, minimum, maximum) {
    if (value < minimum) return minimum;
    if (value > maximum) return maximum;
    return value;
}

function isWholeCurrencyUnit(hundredths, currencyDecimals) {
    return roundToCurrency(hundredths, currencyDecimals) === hundredths;
}

/**
 * บาทต่อ 1 หน่วย ทศนิยม 10 ตำแหน่ง (เก็บลง DECIMAL(20,10)) — เช่น 3,550,000 สตางค์ ÷ 100,000 เซนต์ = "35.5000000000"
 * @param {bigint} bahtHundredths
 * @param {bigint} foreignHundredths
 * @returns {string}
 */
export function rateText(bahtHundredths, foreignHundredths) {
    const scaled = divideRoundHalfUp(bahtHundredths * 10n ** BigInt(RATE_DECIMALS), foreignHundredths);
    const text = scaled.toString().padStart(RATE_DECIMALS + 1, "0");
    return `${text.slice(0, -RATE_DECIMALS)}.${text.slice(-RATE_DECIMALS)}`;
}

/**
 * ยอดหัก ณ ที่จ่ายที่ระบบเสนอ = ผลรวมของ (ยอดหักโดยประมาณบนใบแจ้งหนี้ × ยอดตัด ÷ ยอดรวมใบ) — ผู้ใช้แก้ให้ตรง 50 ทวิ ได้
 * @param {Array<{ amount: bigint, invoiceTotal: bigint, invoiceWithholding: bigint }>} allocations
 * @param {number} [currencyDecimals]
 * @returns {bigint}
 */
export function suggestWithholding(allocations, currencyDecimals = 2) {
    let total = 0n;
    for (const allocation of allocations) {
        if (allocation.amount <= 0n || allocation.invoiceTotal <= 0n || allocation.invoiceWithholding <= 0n) continue;
        const share = divideRoundHalfUp(allocation.amount * allocation.invoiceWithholding, allocation.invoiceTotal);
        total += roundToCurrency(share, currencyDecimals);
    }
    return total;
}

/**
 * ส่วนของ VAT และยอดบาทในการรับเงินครั้งนี้ของใบแจ้งหนี้หนึ่งใบ
 * @param {object} input
 * @param {bigint} input.amount ยอดตัดครั้งนี้ (> 0 และ ≤ ยอดค้าง — ตรวจแล้วใน calculateReceipt)
 * @param {bigint} input.invoiceTotal ยอดรวมของใบแจ้งหนี้
 * @param {bigint} input.invoiceVat VAT ของใบแจ้งหนี้
 * @param {bigint} input.invoiceTotalThb ยอดรวมเป็นบาทของใบแจ้งหนี้ (อัตรา ณ วันออก)
 * @param {bigint} input.paidBefore ยอดรับแล้วก่อนครั้งนี้ (ใบเสร็จที่ไม่ยกเลิก)
 * @param {bigint} input.vatBefore VAT ที่รับไปแล้ว
 * @param {bigint} input.thbBefore ยอดบาทที่รับไปแล้ว
 * @param {number} [input.currencyDecimals]
 * @returns {{ vat: bigint, amountThb: bigint, closesInvoice: boolean }}
 */
export function allocationShare({
    amount,
    invoiceTotal,
    invoiceVat,
    invoiceTotalThb,
    paidBefore,
    vatBefore,
    thbBefore,
    currencyDecimals = 2,
}) {
    const vatRemaining = invoiceVat - vatBefore;
    const thbRemaining = invoiceTotalThb - thbBefore;
    const closesInvoice = paidBefore + amount === invoiceTotal;
    if (closesInvoice) {
        return { vat: vatRemaining, amountThb: thbRemaining, closesInvoice };
    }
    const proportionalVat = roundToCurrency(divideRoundHalfUp(amount * invoiceVat, invoiceTotal), currencyDecimals);
    const proportionalThb = divideRoundHalfUp(amount * invoiceTotalThb, invoiceTotal);
    // ครั้งก่อนๆ ปัดขึ้นสะสมมาจนเหลือน้อยกว่าสัดส่วน → ไม่ให้เกินที่เหลือ (ครั้งที่ปิดใบจะได้ไม่ติดลบ)
    return {
        vat: clamp(proportionalVat, 0n, vatRemaining > 0n ? vatRemaining : 0n),
        amountThb: clamp(proportionalThb, 0n, thbRemaining > 0n ? thbRemaining : 0n),
        closesInvoice,
    };
}

/**
 * ยอดทั้งใบของใบเสร็จ + ตรวจความถูกต้อง
 *
 * @param {object} input
 * @param {Array<{
 *   invoiceId: string, amount: bigint, invoiceTotal: bigint, invoiceVat: bigint, invoiceTotalThb: bigint,
 *   paidBefore: bigint, vatBefore: bigint, thbBefore: bigint
 * }>} input.allocations ใบแจ้งหนี้ที่ตัด ตามลำดับ
 * @param {bigint} input.withholding หัก ณ ที่จ่ายที่ลูกค้าหักจริง
 * @param {bigint} input.fee ค่าธรรมเนียมที่ถูกหักก่อนเงินเข้า
 * @param {boolean} input.isForeign ใบเป็นสกุลต่างประเทศ (ต้องมียอดบาทที่เข้าบัญชีจริง)
 * @param {bigint | null} [input.receivedThb] ยอดบาทที่เข้าบัญชีจริง (สกุลต่างประเทศ)
 * @param {number} [input.currencyDecimals]
 * @returns {{
 *   lines: Array<{ invoiceId: string, amount: bigint, vat: bigint, amountThb: bigint, closesInvoice: boolean }>,
 *   allocatedTotal: bigint, allocatedThb: bigint, received: bigint, receivedThb: bigint,
 *   actualRate: string | null, fxDiffThb: bigint, errors: Record<string, string>
 * }} errors ว่าง = ใช้ได้ · ชื่อช่องตรงกับ schema (allocations.0.rca_amount, rc_wht_amount, ...)
 */
export function calculateReceipt({
    allocations,
    withholding,
    fee,
    isForeign,
    receivedThb = null,
    currencyDecimals = 2,
}) {
    const errors = {};
    const unitMessage = currencyDecimals === 0 ? "สกุลนี้ไม่มีทศนิยม" : `สกุลนี้มีทศนิยม ${currencyDecimals} ตำแหน่ง`;

    if (allocations.length === 0) errors.allocations = "เลือกใบแจ้งหนี้ที่รับเงินอย่างน้อย 1 ใบ";

    const lines = [];
    allocations.forEach((allocation, index) => {
        const field = `allocations.${index}.rca_amount`;
        const outstanding = allocation.invoiceTotal - allocation.paidBefore;
        if (allocation.amount <= 0n) {
            errors[field] = "ยอดรับต้องมากกว่า 0";
        } else if (allocation.amount > outstanding) {
            errors[field] = "ยอดรับมากกว่ายอดค้างของใบนี้ · รับเกินยอดค้างไม่ได้";
        } else if (!isWholeCurrencyUnit(allocation.amount, currencyDecimals)) {
            errors[field] = unitMessage;
        }
        if (errors[field]) {
            lines.push({
                invoiceId: allocation.invoiceId,
                amount: allocation.amount,
                vat: 0n,
                amountThb: 0n,
                closesInvoice: false,
            });
            return;
        }
        lines.push({
            invoiceId: allocation.invoiceId,
            amount: allocation.amount,
            ...allocationShare({ ...allocation, currencyDecimals }),
        });
    });

    const allocatedTotal = lines.reduce((sum, line) => sum + line.amount, 0n);
    const allocatedThb = lines.reduce((sum, line) => sum + line.amountThb, 0n);

    if (withholding < 0n) errors.rc_wht_amount = "หัก ณ ที่จ่ายต้องไม่ติดลบ";
    else if (!isWholeCurrencyUnit(withholding, currencyDecimals)) errors.rc_wht_amount = unitMessage;
    if (fee < 0n) errors.rc_fee_amount = "ค่าธรรมเนียมต้องไม่ติดลบ";
    else if (!isWholeCurrencyUnit(fee, currencyDecimals)) errors.rc_fee_amount = unitMessage;

    const received = allocatedTotal - withholding - fee;
    if (allocatedTotal > 0n && received <= 0n && !errors.rc_wht_amount && !errors.rc_fee_amount) {
        errors.rc_received_amount = "เงินเข้าจริงต้องมากกว่า 0 · หัก ณ ที่จ่ายรวมค่าธรรมเนียมต้องน้อยกว่ายอดรับ";
    }

    let receivedThbValue = received;
    let actualRate = null;
    let fxDiffThb = 0n;
    if (isForeign) {
        if (receivedThb === null || receivedThb === undefined || receivedThb <= 0n) {
            errors.rc_received_thb = "กรอกยอดบาทที่เข้าบัญชีจริง (ดูจากสเตทเมนต์)";
            receivedThbValue = 0n;
        } else {
            receivedThbValue = receivedThb;
            if (received > 0n) {
                actualRate = rateText(receivedThb, received);
                // หัก ณ ที่จ่าย + ค่าธรรมเนียม แปลงเป็นบาทด้วยอัตราจริงเดียวกัน แล้วเทียบกับยอดตัดหนี้ตามอัตราใบแจ้งหนี้
                const deductionsThb = divideRoundHalfUp((withholding + fee) * receivedThb, received);
                fxDiffThb = receivedThb + deductionsThb - allocatedThb;
            }
        }
    }

    return {
        lines,
        allocatedTotal,
        allocatedThb,
        received,
        receivedThb: receivedThbValue,
        actualRate,
        fxDiffThb,
        errors,
    };
}
