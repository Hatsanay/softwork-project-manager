// สูตรยอดคงค้างของใบแจ้งหนี้ + ยอดใบลดหนี้ (ขั้น N-1) — docs/plans/2026-10-18-adjustments-po.md หัวข้อ 3.1, R-N4
const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateCreditNote, checkRefund, invoiceBalance } = require("../src/shared/credit-note-totals.mjs");

const ZERO_CREDITED = { base: 0n, vat: 0n, total: 0n, baseThb: 0n, totalThb: 0n, withholding: 0n };

// ใบแจ้งหนี้ 10,000 + VAT 7% = 10,700 · หักประมาณ 3% = 300 · บาท = ยอดเดิม
const INVOICE = {
    afterDiscount: 1_000_000n,
    vat: 70_000n,
    total: 1_070_000n,
    afterDiscountThb: 1_000_000n,
    totalThb: 1_070_000n,
    withholding: 30_000n,
    vatRate: "7.00",
};

function addToCredited(credited, result) {
    return {
        base: credited.base + result.base,
        vat: credited.vat + result.vat,
        total: credited.total + result.total,
        baseThb: credited.baseThb + result.baseThb,
        totalThb: credited.totalThb + result.totalThb,
        withholding: credited.withholding + result.withholding,
    };
}

test("invoiceBalance: ค้าง/ชำระครบ/ปิดยอดด้วยใบลดหนี้/จ่ายเกินรอคืน", () => {
    assert.equal(invoiceBalance({ total: 100n, credited: 0n, paid: 0n, refunded: 0n }).state, "unpaid");
    assert.equal(invoiceBalance({ total: 100n, credited: 20n, paid: 50n, refunded: 0n }).outstanding, 30n);
    assert.equal(invoiceBalance({ total: 100n, credited: 20n, paid: 80n, refunded: 0n }).state, "paid");
    assert.equal(invoiceBalance({ total: 100n, credited: 100n, paid: 0n, refunded: 0n }).state, "credited");

    const overpaid = invoiceBalance({ total: 100n, credited: 30n, paid: 100n, refunded: 0n });
    assert.equal(overpaid.state, "refund_due");
    assert.equal(overpaid.refundDue, 30n);
    assert.equal(overpaid.outstanding, 0n);

    const refunded = invoiceBalance({ total: 100n, credited: 30n, paid: 100n, refunded: 30n });
    assert.equal(refunded.state, "paid");
    assert.equal(refunded.netReceived, 70n);
});

test("ลดบางส่วน: VAT ตามอัตราใบเดิม · หัก ณ ที่จ่ายตามสัดส่วน · มูลค่าเดิม/ที่ถูกต้อง/ผลต่าง", () => {
    const result = calculateCreditNote({
        invoice: INVOICE,
        credited: ZERO_CREDITED,
        paid: 0n,
        refunded: 0n,
        lineAmounts: [200_000n],
    });
    assert.deepEqual(result.errors, {});
    assert.equal(result.base, 200_000n);
    assert.equal(result.vat, 14_000n);
    assert.equal(result.total, 214_000n);
    assert.equal(result.withholding, 6_000n);
    assert.equal(result.originalTotal, 1_070_000n);
    assert.equal(result.correctTotal, 856_000n);
    assert.equal(result.closesInvoice, false);
    assert.equal(result.refundRequired, 0n);
});

test("R-N4: ลด 3 ใบ × 3,333.33 แล้วใบสุดท้ายปิดใบ · ผลรวม VAT/บาท/หัก เท่ายอดใบเดิมพอดีทุกสตางค์", () => {
    let credited = ZERO_CREDITED;
    for (const amount of [333_333n, 333_333n]) {
        const result = calculateCreditNote({
            invoice: INVOICE,
            credited,
            paid: 0n,
            refunded: 0n,
            lineAmounts: [amount],
        });
        assert.deepEqual(result.errors, {});
        credited = addToCredited(credited, result);
    }
    const last = calculateCreditNote({
        invoice: INVOICE,
        credited,
        paid: 0n,
        refunded: 0n,
        lineAmounts: [INVOICE.afterDiscount - credited.base],
    });
    assert.equal(last.closesInvoice, true);
    credited = addToCredited(credited, last);
    assert.equal(credited.total, INVOICE.total);
    assert.equal(credited.vat, INVOICE.vat);
    assert.equal(credited.totalThb, INVOICE.totalThb);
    assert.equal(credited.withholding, INVOICE.withholding);
    assert.equal(last.correctTotal, 0n);
});

test("ลดเกินยอดที่เหลือไม่ได้ · ใบที่ลดครบแล้วลดอีกไม่ได้ · บรรทัด 0 ไม่ได้", () => {
    const tooMuch = calculateCreditNote({
        invoice: INVOICE,
        credited: ZERO_CREDITED,
        paid: 0n,
        refunded: 0n,
        lineAmounts: [1_000_001n],
    });
    assert.match(tooMuch.errors.lines, /มากกว่ายอดก่อน VAT ที่ยังเหลือ/);

    const fullyCredited = calculateCreditNote({
        invoice: INVOICE,
        credited: { ...ZERO_CREDITED, base: INVOICE.afterDiscount, total: INVOICE.total },
        paid: 0n,
        refunded: 0n,
        lineAmounts: [100n],
    });
    assert.match(fullyCredited.errors.lines, /ลดหนี้ครบยอดแล้ว/);

    const zero = calculateCreditNote({
        invoice: INVOICE,
        credited: ZERO_CREDITED,
        paid: 0n,
        refunded: 0n,
        lineAmounts: [0n],
    });
    assert.ok(zero.errors["lines.0.cnl_amount"]);
});

test("N1-ก: ลูกค้าจ่ายเต็มแล้ว ลดหนี้ = ต้องคืน · เสนอหักตามสัดส่วน · โอนคืน + หัก ต้องเท่ายอดที่ต้องคืน", () => {
    const result = calculateCreditNote({
        invoice: INVOICE,
        credited: ZERO_CREDITED,
        paid: INVOICE.total,
        refunded: 0n,
        lineAmounts: [200_000n],
    });
    assert.equal(result.outstandingBefore, 0n);
    assert.equal(result.refundRequired, 214_000n);
    // 2,140 × 300 ÷ 10,700 = 60
    assert.equal(result.suggestedRefundWithholding, 6_000n);

    assert.deepEqual(checkRefund({ required: 214_000n, amount: 208_000n, withholding: 6_000n }), {});
    assert.ok(checkRefund({ required: 214_000n, amount: 214_000n, withholding: 6_000n }).cn_refund_amount);
    assert.ok(checkRefund({ required: 214_000n, amount: -1n, withholding: 0n }).cn_refund_amount);
});

test("จ่ายมาบางส่วน: ต้องคืนเฉพาะส่วนที่ลดเกินยอดค้าง", () => {
    const result = calculateCreditNote({
        invoice: INVOICE,
        credited: ZERO_CREDITED,
        paid: 900_000n,
        refunded: 0n,
        lineAmounts: [200_000n],
    });
    assert.equal(result.outstandingBefore, 170_000n);
    assert.equal(result.refundRequired, 44_000n);
});

test("สกุลไม่มีทศนิยม: ยอดต้องเต็มหน่วย", () => {
    const result = calculateCreditNote({
        invoice: { ...INVOICE, vatRate: "0" },
        credited: ZERO_CREDITED,
        paid: 0n,
        refunded: 0n,
        lineAmounts: [150n],
        currencyDecimals: 0,
    });
    assert.equal(result.errors["lines.0.cnl_amount"], "สกุลนี้ไม่มีทศนิยม");
});
