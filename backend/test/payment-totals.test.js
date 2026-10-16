// เทสต์ยอดใบสำคัญจ่าย + หัก ณ ที่จ่าย (src/shared/payment-totals.mjs) — ตัวเลขคำนวณมือแล้ว
// แบบระบบ 2026-10-16-purchasing-2.md หัวข้อ 4.2 และ R-P5 (ฐาน = ยอดก่อน VAT ตามสัดส่วนที่จ่าย)
const test = require("node:test");
const assert = require("node:assert/strict");
const { calculatePayment } = require("../src/shared/payment-totals.mjs");

const SERVICE_RATE = new Map([["SERVICE", { rate: "3.00", minPayment: "1000.00" }]]);

// รายการ 2,140.00 (ก่อน VAT 2,000 + VAT 140) ค่าบริการ
const BILL = {
    expenseId: "E1",
    expenseTotal: 214_000n,
    expenseSubtotal: 200_000n,
    expenseTotalThb: 214_000n,
    paidBefore: 0n,
    baseBefore: 0n,
    thbBefore: 0n,
    incomeType: "SERVICE",
};

test("จ่ายเต็ม: ฐาน = ยอดก่อน VAT · หัก 3% · จ่ายสุทธิ = ตัดหนี้ − หัก · เงินออก = สุทธิ + ค่าธรรมเนียม", () => {
    const result = calculatePayment({ allocations: [{ ...BILL, amount: 214_000n }], rates: SERVICE_RATE, fee: 2_500n });
    assert.deepEqual(result.errors, {});
    assert.equal(result.lines[0].base, 200_000n);
    assert.equal(result.groups[0].suggested, 6_000n);
    assert.equal(result.withholdingTotal, 6_000n);
    assert.equal(result.netPaid, 208_000n);
    assert.equal(result.cashOut, 210_500n);
    assert.equal(result.paidThb, 208_000n);
});

test("จ่ายสองครั้ง: ฐานตามสัดส่วน · ครั้งที่ปิดรายการรับเศษ ผลรวมฐาน = ยอดก่อน VAT พอดี · ฐานต่ำกว่าเกณฑ์ไม่หัก", () => {
    // 3,566.66 (ก่อน VAT 3,333.33)
    const bill = { ...BILL, expenseTotal: 356_666n, expenseSubtotal: 333_333n, expenseTotalThb: 356_666n };
    const first = calculatePayment({ allocations: [{ ...bill, amount: 100_000n }], rates: SERVICE_RATE });
    assert.equal(first.lines[0].base, 93_458n, "1,000 × 3,333.33 ÷ 3,566.66 = 934.58");
    assert.equal(first.groups[0].isBelowMinimum, true, "ฐาน 934.58 ต่ำกว่า 1,000");
    assert.equal(first.withholdingTotal, 0n);

    const second = calculatePayment({
        allocations: [{ ...bill, amount: 256_666n, paidBefore: 100_000n, baseBefore: 93_458n, thbBefore: 100_000n }],
        rates: SERVICE_RATE,
    });
    assert.equal(second.lines[0].base, 239_875n, "3,333.33 − 934.58");
    assert.equal(second.lines[0].closesExpense, true);
    assert.equal(second.withholdingTotal, 7_196n, "3% ของ 2,398.75 = 71.96");
});

test("แก้ยอดหักได้ (0 ถึงฐาน) · เกินฐาน/ติดลบ/ประเภทที่ไม่มีในการจ่าย = ผิด · จ่ายเกินยอดค้าง = ผิด", () => {
    const allocations = [{ ...BILL, amount: 214_000n }];
    const zero = calculatePayment({
        allocations,
        rates: SERVICE_RATE,
        withholdings: [{ income_type: "SERVICE", amount: 0n }],
    });
    assert.equal(zero.withholdingTotal, 0n);
    assert.deepEqual(zero.errors, {});

    const tooMuch = calculatePayment({
        allocations,
        rates: SERVICE_RATE,
        withholdings: [{ income_type: "SERVICE", amount: 200_001n }],
    });
    assert.ok(tooMuch.errors["wht.SERVICE"]);
    const unknown = calculatePayment({
        allocations,
        rates: SERVICE_RATE,
        withholdings: [{ income_type: "RENT", amount: 0n }],
    });
    assert.ok(unknown.errors["wht.RENT"]);
    const overpay = calculatePayment({ allocations: [{ ...BILL, amount: 214_001n }], rates: SERVICE_RATE });
    assert.ok(overpay.errors["allocations.0.pva_amount"]);
});

test("หลายประเภทเงินได้รวมฐานแยกกัน · รายการไม่มีประเภท (ไม่หัก) ไม่เข้ากลุ่ม", () => {
    const rates = new Map([...SERVICE_RATE, ["RENT", { rate: "5.00", minPayment: "1000.00" }]]);
    const result = calculatePayment({
        allocations: [
            { ...BILL, amount: 214_000n },
            { ...BILL, expenseId: "E2", incomeType: "RENT", amount: 214_000n },
            { ...BILL, expenseId: "E3", incomeType: null, amount: 214_000n },
        ],
        rates,
    });
    assert.deepEqual(
        result.groups.map((group) => [group.incomeType, group.base, group.withholding]),
        [
            ["SERVICE", 200_000n, 6_000n],
            ["RENT", 200_000n, 10_000n],
        ],
    );
    assert.equal(result.netPaid, 642_000n - 16_000n);
});

test("สกุลต่างประเทศ: ไม่หัก ณ ที่จ่าย · ต้องมียอดบาทที่ออกจริง · ส่วนต่างอัตรา = ยอดบาทตามรายการ − ยอดบาทจริง", () => {
    const usd = {
        ...BILL,
        expenseTotal: 10_000n,
        expenseSubtotal: 10_000n,
        expenseTotalThb: 355_000n,
        incomeType: null,
    };
    const missing = calculatePayment({ allocations: [{ ...usd, amount: 10_000n }], rates: new Map(), isForeign: true });
    assert.ok(missing.errors.pv_paid_thb);
    const paid = calculatePayment({
        allocations: [{ ...usd, amount: 10_000n }],
        rates: new Map(),
        isForeign: true,
        paidThb: 360_000n,
    });
    assert.deepEqual(paid.errors, {});
    assert.equal(paid.actualRate, "36.0000000000");
    assert.equal(paid.fxDiffThb, -5_000n, "จ่ายแพงกว่าที่บันทึก 50 บาท = ขาดทุน");
});
