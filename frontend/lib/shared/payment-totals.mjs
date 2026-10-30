// ─── คำนวณยอดใบสำคัญจ่าย + หัก ณ ที่จ่าย — ใช้ทั้ง backend (ค่าที่บันทึกจริง) และหน้าเว็บ (แสดงก่อนกดยืนยัน) ──────
//
// ต้นฉบับอยู่ที่ backend/src/shared/ — สำเนาใน frontend/lib/shared/ สร้างด้วย `npm run sync-shared` ห้ามแก้ที่สำเนา
// แบบระบบ: docs/plans/2026-10-16-purchasing-2.md หัวข้อ 4.2 และ R-P1/R-P5 · เทสต์: backend/test/payment-totals.test.js
// ไฟล์นี้ห้ามใช้ API ของ Node หรือของเบราว์เซอร์
//
// สมการ (สกุลของรายการ): ยอดตัดหนี้ = จ่ายผู้รับสุทธิ + หัก ณ ที่จ่าย · เงินออกจากบัญชี = จ่ายสุทธิ + ค่าธรรมเนียมโอน
// ฐานหัก ณ ที่จ่าย = ยอดก่อน VAT ส่วนที่จ่ายครั้งนี้ (สัดส่วนของรายการ · ครั้งที่ปิดรายการรับเศษ — R-P5)
// หักรวมตามประเภทเงินได้ของแต่ละรายการ · ฐานรวมของประเภทนั้นต่ำกว่าเกณฑ์ขั้นต่ำต่อครั้ง → เสนอ 0 (แก้ได้ — คำถาม X1)
// สกุลต่างประเทศ: ไม่หัก ณ ที่จ่าย (ผู้รับต่างประเทศไม่ออก 50 ทวิ — X2) · ต้องมียอดบาทที่ออกจากบัญชีจริง

import { divideRoundHalfUp, parseHundredths, roundToCurrency } from "./money.mjs";
import { allocationShare, rateText } from "./receipt-totals.mjs";

const ONE_HUNDRED_PERCENT = 10_000n;

function isWholeCurrencyUnit(hundredths, currencyDecimals) {
    return roundToCurrency(hundredths, currencyDecimals) === hundredths;
}

/**
 * ส่วนก่อน VAT และยอดบาทของการจ่ายครั้งนี้ของรายการหนึ่ง (สูตรเดียวกับ VAT ของใบเสร็จ — ครั้งที่ปิดรายการรับเศษ)
 * @returns {{ base: bigint, amountThb: bigint, closesExpense: boolean }}
 */
export function paymentShare({
    amount,
    expenseTotal,
    expenseSubtotal,
    expenseTotalThb,
    paidBefore,
    baseBefore,
    thbBefore,
    currencyDecimals = 2,
}) {
    const share = allocationShare({
        amount,
        invoiceTotal: expenseTotal,
        invoiceVat: expenseSubtotal,
        invoiceTotalThb: expenseTotalThb,
        paidBefore,
        vatBefore: baseBefore,
        thbBefore,
        currencyDecimals,
    });
    return { base: share.vat, amountThb: share.amountThb, closesExpense: share.closesInvoice };
}

/**
 * @param {object} input
 * @param {Array<{
 *   expenseId: string, amount: bigint, expenseTotal: bigint, expenseSubtotal: bigint, expenseTotalThb: bigint,
 *   paidBefore: bigint, baseBefore: bigint, thbBefore: bigint, incomeType: string | null
 * }>} input.allocations
 * @param {Map<string, { rate: string, minPayment: string }>} input.rates อัตรา ณ วันที่จ่ายของประเภทเงินได้ที่เกี่ยวข้อง
 * @param {Array<{ income_type: string, amount: bigint }> | null} [input.withholdings] ยอดหักที่ผู้ใช้แก้ — null/ไม่ส่งประเภทไหน = ใช้ที่ระบบเสนอ
 * @param {bigint} [input.fee]
 * @param {boolean} [input.isForeign]
 * @param {bigint | null} [input.paidThb] ยอดบาทที่ออกจากบัญชีจริง (สกุลต่างประเทศ)
 * @param {number} [input.currencyDecimals]
 */
export function calculatePayment({
    allocations,
    rates,
    withholdings = null,
    fee = 0n,
    isForeign = false,
    paidThb = null,
    currencyDecimals = 2,
}) {
    const errors = {};
    const unitMessage = currencyDecimals === 0 ? "สกุลนี้ไม่มีทศนิยม" : `สกุลนี้มีทศนิยม ${currencyDecimals} ตำแหน่ง`;
    if (allocations.length === 0) errors.allocations = "เลือกรายการที่จะจ่ายอย่างน้อย 1 รายการ";

    const lines = allocations.map((allocation, index) => {
        const field = `allocations.${index}.pva_amount`;
        const outstanding = allocation.expenseTotal - allocation.paidBefore;
        if (allocation.amount <= 0n) errors[field] = "ยอดจ่ายต้องมากกว่า 0";
        else if (allocation.amount > outstanding) errors[field] = "ยอดจ่ายมากกว่ายอดค้างของรายการนี้ · จ่ายเกินไม่ได้";
        else if (!isWholeCurrencyUnit(allocation.amount, currencyDecimals)) errors[field] = unitMessage;
        if (errors[field]) {
            return { ...allocation, base: 0n, amountThb: 0n, closesExpense: false };
        }
        return { ...allocation, ...paymentShare({ ...allocation, currencyDecimals }) };
    });

    // รวมฐานตามประเภทเงินได้ → ยอดหักที่ระบบเสนอ
    const groupsByType = new Map();
    for (const line of lines) {
        if (!line.incomeType) continue;
        const group = groupsByType.get(line.incomeType) ?? { incomeType: line.incomeType, base: 0n };
        group.base += line.base;
        groupsByType.set(line.incomeType, group);
    }
    const overrides = new Map((withholdings ?? []).map((row) => [row.income_type, row.amount]));
    for (const type of overrides.keys()) {
        if (!groupsByType.has(type)) errors[`wht.${type}`] = "ไม่มีรายการของประเภทเงินได้นี้ในการจ่ายครั้งนี้";
    }

    const groups = [...groupsByType.values()].map((group) => {
        const rate = rates.get(group.incomeType) ?? null;
        const minimum = rate ? parseHundredths(rate.minPayment || 0, "เกณฑ์ขั้นต่ำ") : 0n;
        const isBelowMinimum = group.base < minimum;
        let suggested = 0n;
        if (!isForeign && rate && !isBelowMinimum) {
            const rateHundredths = parseHundredths(rate.rate, "อัตราหัก ณ ที่จ่าย");
            suggested = roundToCurrency(
                divideRoundHalfUp(group.base * rateHundredths, ONE_HUNDRED_PERCENT),
                currencyDecimals,
            );
        }
        const field = `wht.${group.incomeType}`;
        const withholding = overrides.has(group.incomeType) ? overrides.get(group.incomeType) : suggested;
        if (!rate && withholding > 0n) errors[field] = "ประเภทเงินได้นี้ยังไม่มีอัตราที่มีผล ณ วันที่จ่าย";
        else if (withholding < 0n) errors[field] = "ยอดหักต้องไม่ติดลบ";
        else if (withholding > group.base) errors[field] = "ยอดหักมากกว่าเงินได้ที่จ่าย";
        else if (isForeign && withholding > 0n)
            errors[field] = "จ่ายสกุลต่างประเทศไม่หัก ณ ที่จ่ายในระบบ · ตรวจกับนักบัญชี";
        else if (!isWholeCurrencyUnit(withholding, currencyDecimals)) errors[field] = unitMessage;
        return {
            ...group,
            rate: rate?.rate ?? null,
            minPayment: rate?.minPayment ?? null,
            isBelowMinimum,
            suggested,
            withholding,
        };
    });

    const allocatedTotal = lines.reduce((sum, line) => sum + line.amount, 0n);
    const allocatedThb = lines.reduce((sum, line) => sum + line.amountThb, 0n);
    const withholdingTotal = groups.reduce((sum, group) => sum + group.withholding, 0n);
    const netPaid = allocatedTotal - withholdingTotal;

    if (fee < 0n) errors.pv_fee_amount = "ค่าธรรมเนียมต้องไม่ติดลบ";
    else if (!isWholeCurrencyUnit(fee, currencyDecimals)) errors.pv_fee_amount = unitMessage;

    let paidThbValue = netPaid;
    let actualRate = null;
    let fxDiffThb = 0n;
    if (isForeign) {
        if (paidThb === null || paidThb <= 0n) {
            errors.pv_paid_thb = "ใส่ยอดบาทที่ออกจากบัญชีจริง (ไม่รวมค่าธรรมเนียม)";
            paidThbValue = 0n;
        } else {
            paidThbValue = paidThb;
            actualRate = netPaid > 0n ? rateText(paidThb, netPaid) : null;
            fxDiffThb = allocatedThb - paidThb;
        }
    }

    return {
        lines,
        groups,
        allocatedTotal,
        allocatedThb,
        withholdingTotal,
        netPaid,
        cashOut: netPaid + fee,
        paidThb: paidThbValue,
        actualRate,
        fxDiffThb,
        errors,
    };
}
