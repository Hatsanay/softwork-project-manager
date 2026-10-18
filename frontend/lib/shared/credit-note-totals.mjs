// ─── ยอดคงค้างของใบแจ้งหนี้ + ยอดของใบลดหนี้ — ใช้ทั้ง backend (ค่าที่บันทึกจริง) และหน้าเว็บ (แสดงก่อนกดบันทึก) ─────
//
// ต้นฉบับอยู่ที่ backend/src/shared/ — สำเนาใน frontend/lib/shared/ สร้างด้วย `npm run sync-shared` ห้ามแก้ที่สำเนา
// แบบระบบ: docs/plans/2026-10-18-adjustments-po.md หัวข้อ 3.1, 4.1, 5 · สูตรเงินพื้นฐานอยู่ใน money.mjs
// ไฟล์นี้ห้ามใช้ API ของ Node หรือของเบราว์เซอร์ · เทสต์: backend/test/credit-note-totals.test.js
//
// สมการยอดคงค้างของใบแจ้งหนี้ (สกุลของใบ) — ที่เดียวของทั้งระบบ (R-N2):
//   ยอดหลังลดหนี้ = ยอดใบ − ลดหนี้แล้ว
//   รับสุทธิ       = รับแล้ว − คืนเงินลูกค้าแล้ว
//   คงค้าง         = ยอดหลังลดหนี้ − รับสุทธิ   (ติดลบ = ลูกค้าจ่ายเกิน ต้องคืนเงิน)
//
// ใบลดหนี้: ผู้ใช้กรอกยอดก่อน VAT ทีละบรรทัด → VAT ใช้อัตราของใบเดิม · ยอดบาท/หัก ณ ที่จ่ายตามสัดส่วนของใบเดิม ปัดครึ่งขึ้น
// ใบที่ลดยอดก่อน VAT ที่เหลือทั้งหมด ("ปิดใบ") รับเศษที่เหลือทั้งหมด → ผลรวมทุกใบลดหนี้ = ยอดของใบเดิมพอดีทุกสตางค์ (R-N4)

import { divideRoundHalfUp, parseHundredths, roundToCurrency } from "./money.mjs";

const ONE_HUNDRED_PERCENT = 10_000n;

function clamp(value, minimum, maximum) {
    if (value < minimum) return minimum;
    if (value > maximum) return maximum;
    return value;
}

function isWholeCurrencyUnit(hundredths, currencyDecimals) {
    return roundToCurrency(hundredths, currencyDecimals) === hundredths;
}

/**
 * สถานะเงินของใบแจ้งหนี้ที่ออกแล้ว
 * @param {object} input ทุกยอดเป็น BigInt หน่วยร้อยส่วน
 * @param {bigint} input.total ยอดรวมของใบ
 * @param {bigint} input.credited ผลรวมใบลดหนี้ที่ออกแล้ว
 * @param {bigint} input.paid ผลรวมยอดตัดของใบเสร็จที่ไม่ยกเลิก
 * @param {bigint} input.refunded ผลรวมเงินที่บันทึกว่าคืนลูกค้าแล้ว (รวมส่วนหัก ณ ที่จ่าย)
 * @returns {{
 *   effectiveTotal: bigint, netReceived: bigint, outstanding: bigint, refundDue: bigint,
 *   state: "unpaid" | "partial" | "paid" | "credited" | "refund_due"
 * }} outstanding ไม่ติดลบ · refundDue = ส่วนที่ลูกค้าจ่ายเกิน (รอบันทึกคืนเงิน)
 */
export function invoiceBalance({ total, credited, paid, refunded }) {
    const effectiveTotal = total - credited;
    const netReceived = paid - refunded;
    const balance = effectiveTotal - netReceived;
    const outstanding = balance > 0n ? balance : 0n;
    const refundDue = balance < 0n ? -balance : 0n;

    let state;
    if (refundDue > 0n) state = "refund_due";
    else if (outstanding === 0n && netReceived === 0n) state = "credited";
    else if (outstanding === 0n) state = "paid";
    else if (netReceived === 0n) state = "unpaid";
    else state = "partial";

    return { effectiveTotal, netReceived, outstanding, refundDue, state };
}

/**
 * ยอดของใบลดหนี้หนึ่งใบ + ตรวจความถูกต้อง
 *
 * @param {object} input ทุกยอดเป็น BigInt หน่วยร้อยส่วน (สกุลของใบแจ้งหนี้ ยกเว้นที่ลงท้าย Thb)
 * @param {{
 *   afterDiscount: bigint, vat: bigint, total: bigint, afterDiscountThb: bigint, totalThb: bigint,
 *   withholding: bigint, vatRate: string | number
 * }} input.invoice ยอดของใบแจ้งหนี้เดิม
 * @param {{ base: bigint, vat: bigint, total: bigint, baseThb: bigint, totalThb: bigint, withholding: bigint }} input.credited
 *        ผลรวมของใบลดหนี้ที่ออกแล้วก่อนใบนี้
 * @param {bigint} input.paid ยอดรับแล้วของใบเดิม
 * @param {bigint} input.refunded เงินที่คืนลูกค้าแล้ว
 * @param {bigint[]} input.lineAmounts ยอดก่อน VAT ที่ลดแต่ละบรรทัด
 * @param {number} [input.currencyDecimals]
 * @returns {{
 *   base: bigint, vat: bigint, total: bigint, baseThb: bigint, totalThb: bigint, withholding: bigint,
 *   closesInvoice: boolean, remainingBase: bigint, originalTotal: bigint, correctTotal: bigint,
 *   outstandingBefore: bigint, refundRequired: bigint, suggestedRefundWithholding: bigint,
 *   errors: Record<string, string>
 * }} errors ว่าง = ใช้ได้ · ชื่อช่องตรงกับ schema (lines, lines.0.cnl_amount)
 */
export function calculateCreditNote({ invoice, credited, paid, refunded, lineAmounts, currencyDecimals = 2 }) {
    const errors = {};
    const unitMessage = currencyDecimals === 0 ? "สกุลนี้ไม่มีทศนิยม" : `สกุลนี้มีทศนิยม ${currencyDecimals} ตำแหน่ง`;

    const remainingBase = invoice.afterDiscount - credited.base;
    const remainingVat = invoice.vat - credited.vat;
    const remainingTotal = invoice.total - credited.total;
    const remainingBaseThb = invoice.afterDiscountThb - credited.baseThb;
    const remainingTotalThb = invoice.totalThb - credited.totalThb;
    const remainingWithholding = invoice.withholding - credited.withholding;

    if (lineAmounts.length === 0) errors.lines = "ใส่รายการที่ลดอย่างน้อย 1 บรรทัด";
    lineAmounts.forEach((amount, index) => {
        const field = `lines.${index}.cnl_amount`;
        if (amount <= 0n) errors[field] = "ยอดที่ลดต้องมากกว่า 0";
        else if (!isWholeCurrencyUnit(amount, currencyDecimals)) errors[field] = unitMessage;
    });

    const base = lineAmounts.reduce((sum, amount) => sum + amount, 0n);
    if (remainingBase <= 0n) {
        errors.lines = "ใบนี้ลดหนี้ครบยอดแล้ว — ลดเพิ่มไม่ได้";
    } else if (base > remainingBase) {
        errors.lines = "ยอดที่ลดรวมมากกว่ายอดก่อน VAT ที่ยังเหลือของใบนี้ — ลดเกินยอดใบไม่ได้";
    }

    const closesInvoice = base === remainingBase && remainingBase > 0n;
    let vat;
    let baseThb;
    let totalThb;
    let withholding;
    if (closesInvoice) {
        vat = remainingVat;
        baseThb = remainingBaseThb;
        withholding = remainingWithholding;
    } else {
        const vatRate = parseHundredths(invoice.vatRate, "อัตรา VAT");
        const proportionalVat = roundToCurrency(
            divideRoundHalfUp(base * vatRate, ONE_HUNDRED_PERCENT),
            currencyDecimals,
        );
        vat = clamp(proportionalVat, 0n, remainingVat > 0n ? remainingVat : 0n);
        baseThb =
            invoice.afterDiscount > 0n
                ? clamp(divideRoundHalfUp(base * invoice.afterDiscountThb, invoice.afterDiscount), 0n, remainingBaseThb)
                : 0n;
        const proportionalWithholding =
            invoice.afterDiscount > 0n
                ? roundToCurrency(
                      divideRoundHalfUp(base * invoice.withholding, invoice.afterDiscount),
                      currencyDecimals,
                  )
                : 0n;
        withholding = clamp(proportionalWithholding, 0n, remainingWithholding > 0n ? remainingWithholding : 0n);
    }
    const total = closesInvoice ? remainingTotal : base + vat;
    if (closesInvoice) {
        totalThb = remainingTotalThb;
    } else {
        totalThb =
            invoice.total > 0n
                ? clamp(divideRoundHalfUp(total * invoice.totalThb, invoice.total), 0n, remainingTotalThb)
                : 0n;
    }

    const balanceBefore = invoiceBalance({ total: invoice.total, credited: credited.total, paid, refunded });
    const outstandingBefore = balanceBefore.outstanding;
    const refundRequired = total > outstandingBefore ? total - outstandingBefore : 0n;
    // เสนอส่วนหัก ณ ที่จ่ายของส่วนที่ต้องคืน (ลูกค้าหักไว้แล้วตอนจ่าย — คืนเฉพาะเงินที่โอนมาจริง · คำถามนักบัญชี A1)
    const suggestedRefundWithholding =
        refundRequired > 0n && invoice.total > 0n
            ? clamp(
                  roundToCurrency(
                      divideRoundHalfUp(refundRequired * invoice.withholding, invoice.total),
                      currencyDecimals,
                  ),
                  0n,
                  refundRequired,
              )
            : 0n;

    return {
        base,
        vat,
        total,
        baseThb,
        totalThb,
        withholding,
        closesInvoice,
        remainingBase,
        originalTotal: remainingTotal,
        correctTotal: remainingTotal - total,
        outstandingBefore,
        refundRequired,
        suggestedRefundWithholding,
        errors,
    };
}

/**
 * ตรวจยอดคืนเงินลูกค้า: เงินที่โอนคืน + ส่วนหัก ณ ที่จ่ายที่ไม่ต้องคืน = ส่วนที่ลูกค้าจ่ายเกินพอดี
 * @param {{ required: bigint, amount: bigint, withholding: bigint, currencyDecimals?: number }} input
 * @returns {Record<string, string>} ว่าง = ใช้ได้ (ชื่อช่องตรงกับ schema)
 */
export function checkRefund({ required, amount, withholding, currencyDecimals = 2 }) {
    const errors = {};
    const unitMessage = currencyDecimals === 0 ? "สกุลนี้ไม่มีทศนิยม" : `สกุลนี้มีทศนิยม ${currencyDecimals} ตำแหน่ง`;
    if (amount < 0n) errors.cn_refund_amount = "ยอดโอนคืนต้องไม่ติดลบ";
    else if (!isWholeCurrencyUnit(amount, currencyDecimals)) errors.cn_refund_amount = unitMessage;
    if (withholding < 0n) errors.cn_refund_wht = "หัก ณ ที่จ่ายต้องไม่ติดลบ";
    else if (!isWholeCurrencyUnit(withholding, currencyDecimals)) errors.cn_refund_wht = unitMessage;
    if (!errors.cn_refund_amount && !errors.cn_refund_wht && amount + withholding !== required) {
        errors.cn_refund_amount = "ยอดโอนคืน + หัก ณ ที่จ่าย ต้องเท่ากับยอดที่ลูกค้าจ่ายเกินพอดี";
    }
    return errors;
}
