// เทสต์ยอดค่าใช้จ่าย (src/shared/expense-totals.mjs) — ตัวเลขคำนวณมือแล้ว (แบบระบบ 2026-10-16-purchasing-2.md หัวข้อ 4.1, R-P8)
const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateExpense } = require("../src/shared/expense-totals.mjs");

const lines = (...prices) =>
    prices.map(([quantity, unitPrice]) => ({ exl_quantity: quantity, exl_unit_price: unitPrice }));

test("ยอดก่อน VAT = ผลรวมจำนวน × ราคา · VAT ตามเอกสาร · ระบบเสนอ VAT ตามอัตรา ณ วันที่เอกสาร", () => {
    const result = calculateExpense({ lines: lines(["1", "1500"], ["2", "250"]), vatAmount: "140", vatRate: "7.00" });
    assert.deepEqual(result.lineAmounts, [150_000n, 50_000n]);
    assert.equal(result.subtotal, 200_000n);
    assert.equal(result.suggestedVat, 14_000n);
    assert.equal(result.vat, 14_000n);
    assert.equal(result.total, 214_000n);
    assert.equal(result.isVatDifferent, false);
    assert.deepEqual(result.errors, {});
});

test("VAT ต่างจากที่คิดไม่เกิน 1 บาทไม่เตือน (ผู้ขายปัดต่อบรรทัด) · เกินเตือน · ไม่มี VAT ไม่เตือน", () => {
    const base = { lines: lines(["1", "1000.50"]), vatRate: "7.00" };
    assert.equal(calculateExpense({ ...base, vatAmount: "70.04" }).suggestedVat, 7_004n);
    assert.equal(calculateExpense({ ...base, vatAmount: "71.04" }).isVatDifferent, false, "ต่าง 1.00 พอดี");
    assert.equal(calculateExpense({ ...base, vatAmount: "71.05" }).isVatDifferent, true);
    assert.equal(calculateExpense({ ...base, vatAmount: "0" }).isVatDifferent, false, "ผู้ขายไม่จด VAT");
});

test("หัก ณ ที่จ่ายประมาณการ = ยอดก่อน VAT × อัตรา · ยอดเป็นบาทต่ำกว่าเกณฑ์ขั้นต่ำ = 0 · ไม่มีประเภทเงินได้ = 0", () => {
    const withWht = calculateExpense({
        lines: lines(["1", "2000"]),
        vatAmount: "140",
        vatRate: "7.00",
        whtRate: "3.00",
        whtMinPayment: "1000.00",
    });
    assert.equal(withWht.withholding, 6_000n);
    assert.equal(withWht.netPayable, 208_000n, "2,140 − 60");

    const small = calculateExpense({
        lines: lines(["1", "999.99"]),
        vatAmount: "0",
        vatRate: "7.00",
        whtRate: "3.00",
        whtMinPayment: "1000.00",
    });
    assert.equal(small.withholding, 0n);
    assert.equal(small.isBelowWithholdingMinimum, true);

    assert.equal(calculateExpense({ lines: lines(["1", "5000"]), vatAmount: "0", vatRate: "0" }).withholding, 0n);
});

test("สกุลต่างประเทศ: ยอดบาทคิดจากอัตรา · เกณฑ์ขั้นต่ำเทียบยอดบาท · สกุลไม่มีทศนิยมต้องใส่ VAT เต็มหน่วย", () => {
    const usd = calculateExpense({
        lines: lines(["1", "30"]),
        vatAmount: "0",
        vatRate: "7.00",
        whtRate: "3.00",
        whtMinPayment: "1000.00",
        exchangeRate: "35.5",
    });
    assert.equal(usd.subtotalThb, 106_500n, "30 USD = 1,065 บาท");
    assert.equal(usd.isBelowWithholdingMinimum, false);
    assert.equal(usd.withholding, 90n, "0.90 USD");

    const yen = calculateExpense({
        lines: lines(["1", "1000"]),
        vatAmount: "70.50",
        vatRate: "7.00",
        currencyDecimals: 0,
    });
    assert.ok(yen.errors.ex_vat_amount);
});
