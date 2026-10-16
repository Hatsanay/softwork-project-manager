// เทสต์ยอดใบเสร็จรับเงิน (src/shared/receipt-totals.mjs) — ตัวเลขคำนวณมือแล้ว (แบบระบบ 2026-10-15-receipts-1c.md R-C3/R-C4)
const test = require("node:test");
const assert = require("node:assert/strict");
const { suggestWithholding, allocationShare, calculateReceipt, rateText } = require("../src/shared/receipt-totals.mjs");

// ใบแจ้งหนี้ 107,000.00 (ก่อน VAT 100,000 + VAT 7,000) · หักโดยประมาณ 3% = 3,000
const INVOICE_A = {
    invoiceTotal: 10_700_000n,
    invoiceVat: 700_000n,
    invoiceTotalThb: 10_700_000n,
    invoiceWithholding: 300_000n,
};
// ใบแจ้งหนี้ 10,700.00 · หัก 300
const INVOICE_B = {
    invoiceTotal: 1_070_000n,
    invoiceVat: 70_000n,
    invoiceTotalThb: 1_070_000n,
    invoiceWithholding: 30_000n,
};

function firstPayment(invoice, amount, invoiceId = "INV1") {
    return { invoiceId, amount, paidBefore: 0n, vatBefore: 0n, thbBefore: 0n, ...invoice };
}

test("เสนอหัก ณ ที่จ่ายตามสัดส่วนที่รับ: รับเต็ม = ยอดบนใบ · รับครึ่ง = ครึ่ง · หลายใบรวมกัน", () => {
    assert.equal(suggestWithholding([{ amount: 10_700_000n, ...INVOICE_A }]), 300_000n);
    assert.equal(suggestWithholding([{ amount: 5_350_000n, ...INVOICE_A }]), 150_000n);
    assert.equal(
        suggestWithholding([
            { amount: 10_700_000n, ...INVOICE_A },
            { amount: 1_070_000n, ...INVOICE_B },
        ]),
        330_000n,
    );
    assert.equal(
        suggestWithholding([{ amount: 10_700_000n, ...INVOICE_A, invoiceWithholding: 0n }]),
        0n,
        "ใบไม่แสดงหัก = ไม่เสนอ",
    );
});

test("รับเงินสามครั้ง 33.33 / 33.33 / 33.34: VAT ต่อครั้งปัดครึ่งขึ้น ครั้งที่ปิดใบรับเศษ → ผลรวม = VAT ของใบพอดี", () => {
    const invoice = { invoiceTotal: 10_000n, invoiceVat: 654n, invoiceTotalThb: 10_000n };
    const first = allocationShare({ ...invoice, amount: 3_333n, paidBefore: 0n, vatBefore: 0n, thbBefore: 0n });
    const second = allocationShare({
        ...invoice,
        amount: 3_333n,
        paidBefore: 3_333n,
        vatBefore: first.vat,
        thbBefore: first.amountThb,
    });
    const third = allocationShare({
        ...invoice,
        amount: 3_334n,
        paidBefore: 6_666n,
        vatBefore: first.vat + second.vat,
        thbBefore: first.amountThb + second.amountThb,
    });
    assert.deepEqual([first.vat, second.vat, third.vat], [218n, 218n, 218n]);
    assert.equal(first.vat + second.vat + third.vat, 654n);
    assert.equal(first.amountThb + second.amountThb + third.amountThb, 10_000n);
    assert.deepEqual([first.closesInvoice, second.closesInvoice, third.closesInvoice], [false, false, true]);
});

test("ปัดขึ้นสะสมจน VAT ที่เหลือหมดก่อนปิดใบ → ครั้งหลังได้ 0 ไม่ติดลบ ผลรวมยังตรง", () => {
    const invoice = { invoiceTotal: 4n, invoiceVat: 2n, invoiceTotalThb: 4n };
    let paid = 0n;
    let vat = 0n;
    let thb = 0n;
    const vats = [];
    for (let payment = 0; payment < 4; payment += 1) {
        const share = allocationShare({ ...invoice, amount: 1n, paidBefore: paid, vatBefore: vat, thbBefore: thb });
        vats.push(share.vat);
        paid += 1n;
        vat += share.vat;
        thb += share.amountThb;
    }
    assert.deepEqual(vats, [1n, 1n, 0n, 0n]);
    assert.ok(vats.every((value) => value >= 0n));
    assert.equal(vat, 2n);
    assert.equal(thb, 4n);
});

test("ใบเสร็จบาท 2 ใบ: เงินเข้าจริง = ยอดตัด − หัก ณ ที่จ่าย − ค่าธรรมเนียม", () => {
    const result = calculateReceipt({
        allocations: [firstPayment(INVOICE_A, 5_350_000n, "A"), firstPayment(INVOICE_B, 1_070_000n, "B")],
        withholding: 180_000n,
        fee: 2_500n,
        isForeign: false,
    });
    assert.deepEqual(result.errors, {});
    assert.equal(result.allocatedTotal, 6_420_000n);
    assert.equal(result.received, 6_237_500n, "64,200 − 1,800 − 25 = 62,375");
    assert.equal(result.receivedThb, 6_237_500n);
    assert.equal(result.actualRate, null);
    assert.equal(result.fxDiffThb, 0n);
    assert.deepEqual(
        result.lines.map((line) => [line.invoiceId, line.vat, line.closesInvoice]),
        [
            ["A", 350_000n, false],
            ["B", 70_000n, true],
        ],
    );
    assert.equal(result.allocatedThb, 6_420_000n);
});

test("ข้อผิดพลาด: ยอดเป็น 0 · เกินยอดค้าง · หักติดลบ · เงินเข้าไม่เหลือ · ไม่เลือกใบ · ทศนิยมเกินหน่วยของสกุล", () => {
    const overpaid = calculateReceipt({
        allocations: [firstPayment(INVOICE_A, 0n), { ...firstPayment(INVOICE_B, 1_000_000n), paidBefore: 100_000n }],
        withholding: -1n,
        fee: 0n,
        isForeign: false,
    });
    assert.equal(overpaid.errors["allocations.0.rca_amount"], "ยอดรับต้องมากกว่า 0");
    assert.match(overpaid.errors["allocations.1.rca_amount"], /มากกว่ายอดค้าง/);
    assert.match(overpaid.errors.rc_wht_amount, /ไม่ติดลบ/);

    const nothingLeft = calculateReceipt({
        allocations: [firstPayment(INVOICE_B, 1_070_000n)],
        withholding: 1_000_000n,
        fee: 70_000n,
        isForeign: false,
    });
    assert.match(nothingLeft.errors.rc_received_amount, /มากกว่า 0/);

    assert.ok(calculateReceipt({ allocations: [], withholding: 0n, fee: 0n, isForeign: false }).errors.allocations);

    // เยน (0 ทศนิยม): 1,000.50 เยน ไม่มีจริง
    const yen = calculateReceipt({
        allocations: [firstPayment({ invoiceTotal: 200_000n, invoiceVat: 0n, invoiceTotalThb: 50_000n }, 100_050n)],
        withholding: 50n,
        fee: 0n,
        isForeign: true,
        receivedThb: 25_000n,
        currencyDecimals: 0,
    });
    assert.equal(yen.errors["allocations.0.rca_amount"], "สกุลนี้ไม่มีทศนิยม");
    assert.equal(yen.errors.rc_wht_amount, "สกุลนี้ไม่มีทศนิยม");
});

test("สกุลต่างประเทศ: ต้องมียอดบาทจริง · อัตราจริง + ส่วนต่างอัตรา (หัก/ค่าธรรมเนียมคิดด้วยอัตราจริง)", () => {
    // USD 1,070.00 ออกใบที่ 35.50 → 37,985.00 บาท · หัก 30 ค่าธรรมเนียม 15 → เงินเข้า 1,025 USD = 36,000.00 บาท
    const usdInvoice = { invoiceTotal: 107_000n, invoiceVat: 7_000n, invoiceTotalThb: 3_798_500n };
    const missingThb = calculateReceipt({
        allocations: [firstPayment(usdInvoice, 107_000n)],
        withholding: 3_000n,
        fee: 1_500n,
        isForeign: true,
    });
    assert.ok(missingThb.errors.rc_received_thb);

    const result = calculateReceipt({
        allocations: [firstPayment(usdInvoice, 107_000n)],
        withholding: 3_000n,
        fee: 1_500n,
        isForeign: true,
        receivedThb: 3_600_000n,
    });
    assert.deepEqual(result.errors, {});
    assert.equal(result.received, 102_500n);
    assert.equal(result.actualRate, "35.1219512195");
    assert.equal(result.allocatedThb, 3_798_500n);
    // 36,000 + (45 × 35.12195...) = 36,000 + 1,580.49 = 37,580.49 → ส่วนต่าง −404.51 (ขาดทุน)
    assert.equal(result.fxDiffThb, -40_451n);
});

test("อัตราเป็นข้อความทศนิยม 10 ตำแหน่ง", () => {
    assert.equal(rateText(3_550_000n, 100_000n), "35.5000000000");
    assert.equal(rateText(1n, 300n), "0.0033333333");
});
