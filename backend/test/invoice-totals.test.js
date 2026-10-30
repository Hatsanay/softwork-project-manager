// เทสต์ยอดใบแจ้งหนี้ (src/shared/invoice-totals.mjs) — ตัวเลขคำนวณมือแล้ว (แบบระบบ 2026-10-14-invoices-1b.md R-B2/R-B4)
const test = require("node:test");
const assert = require("node:assert/strict");
const {
    splitMilestoneBases,
    calculateMilestoneInvoice,
    calculateWithholding,
} = require("../src/shared/invoice-totals.mjs");

function sum(values) {
    return values.reduce((total, value) => total + value, 0n);
}

test("แยกงวด: ไม่มี VAT → ยอดก่อน VAT = ยอดงวด", () => {
    const result = splitMilestoneBases({
        milestoneAmounts: [3000000n, 4000000n, 3000000n],
        afterDiscount: 10000000n,
        total: 10000000n,
    });
    assert.deepEqual(
        result.map((line) => [line.base, line.vat]),
        [
            [3000000n, 0n],
            [4000000n, 0n],
            [3000000n, 0n],
        ],
    );
});

test("แยกงวด: VAT 7% สามงวด 30/40/30 ของ 107,000 → ผลรวมก่อน VAT = 100,000 พอดี", () => {
    // 32,100 × 100,000/107,000 = 30,000 · 42,800 → 40,000 · 32,100 → 30,000 (ลงตัวทุกงวด)
    const result = splitMilestoneBases({
        milestoneAmounts: [3210000n, 4280000n, 3210000n],
        afterDiscount: 10000000n,
        total: 10700000n,
    });
    assert.deepEqual(
        result.map((line) => [line.base, line.vat]),
        [
            [3000000n, 210000n],
            [4000000n, 280000n],
            [3000000n, 210000n],
        ],
    );
});

test("แยกงวด: เศษไม่ลงตัว · แจกสตางค์ที่ขาดให้งวดที่เศษมากสุด ผลรวมตรงพอดี", () => {
    // ใบเสนอราคา: ก่อน VAT 1,000.00 · VAT 70.00 · รวม 1,070.00 · 3 งวด 356.67 / 356.67 / 356.66
    // งวด 1, 2: 35667 × 100000/107000 = 33333.64… → ปัดลง 33333 (เศษ .64)
    // งวด 3:   35666 × 100000/107000 = 33332.71… → ปัดลง 33332 (เศษ .71) · ขาด 100000 − 99998 = 2 สตางค์
    // แจก 1 สตางค์ให้งวด 3 (เศษ .71) แล้วงวด 1 (เศษ .64 เท่างวด 2 → งวดลำดับก่อนได้)
    const result = splitMilestoneBases({
        milestoneAmounts: [35667n, 35667n, 35666n],
        afterDiscount: 100000n,
        total: 107000n,
    });
    assert.deepEqual(
        result.map((line) => line.base),
        [33334n, 33333n, 33333n],
    );
    assert.equal(sum(result.map((line) => line.base)), 100000n);
    assert.equal(sum(result.map((line) => line.vat)), 7000n);
});

test("แยกงวด: งวดเล็กมาก (0.01) ไม่ได้ยอดก่อน VAT ติดลบหรือ VAT ติดลบ", () => {
    const result = splitMilestoneBases({
        milestoneAmounts: [106999n, 1n],
        afterDiscount: 100000n,
        total: 107000n,
    });
    for (const line of result) {
        assert.ok(line.base >= 0n && line.base <= line.amount, `ยอดก่อน VAT อยู่ในช่วง: ${line.base}`);
        assert.ok(line.vat >= 0n, `VAT ไม่ติดลบ: ${line.vat}`);
    }
    assert.equal(sum(result.map((line) => line.base)), 100000n);
});

test("แยกงวด: สกุลไม่มีทศนิยม (เยน) ได้ยอดเต็มหน่วยทุกงวด", () => {
    // รวม 107,000 เยน ก่อน VAT 100,000 · 3 งวด 35,667 / 35,667 / 35,666 (ร้อยส่วน ×100)
    const result = splitMilestoneBases({
        milestoneAmounts: [3566700n, 3566700n, 3566600n],
        afterDiscount: 10000000n,
        total: 10700000n,
        currencyDecimals: 0,
    });
    for (const line of result) assert.equal(line.base % 100n, 0n, "ยอดก่อน VAT ต้องเป็นเยนเต็ม");
    assert.equal(sum(result.map((line) => line.base)), 10000000n);
});

test("แยกงวด: ข้อมูลไม่สมบูรณ์ (ผลรวมงวด ≠ ยอดใบ) ต้องหยุด ไม่เดายอด", () => {
    assert.throws(
        () => splitMilestoneBases({ milestoneAmounts: [100n, 100n], afterDiscount: 150n, total: 300n }),
        /ผลรวมงวด/,
    );
});

const QUOTATION = { afterDiscount: 100000n, total: 107000n, vatRate: "7.00" };
const MILESTONES = [
    { id: 11, amount: 35667n },
    { id: 12, amount: 35667n },
    { id: 13, amount: 35666n },
];

test("ใบแจ้งหนี้จากงวด: VAT เท่าเดิม → ยอดรวม = ยอดงวดที่ลูกค้าตกลงทุกสตางค์", () => {
    const invoice = calculateMilestoneInvoice({
        quotation: QUOTATION,
        milestones: MILESTONES,
        selectedIds: [12],
        vatRate: "7.00",
    });
    assert.equal(invoice.vatChanged, false);
    assert.deepEqual(invoice.lines, [{ milestoneId: 12, amount: 35667n, base: 33333n, vat: 2334n }]);
    assert.equal(invoice.afterDiscount, 33333n);
    assert.equal(invoice.vat, 2334n);
    assert.equal(invoice.total, 35667n);
    assert.equal(invoice.agreedTotal, 35667n);
});

test("ใบแจ้งหนี้จากงวด: ออกทุกงวดแยกใบ ผลรวมทุกใบ = ใบเสนอราคาพอดี (ไม่ว่าออกลำดับไหน)", () => {
    const invoices = [13, 11, 12].map((id) =>
        calculateMilestoneInvoice({ quotation: QUOTATION, milestones: MILESTONES, selectedIds: [id], vatRate: "7.00" }),
    );
    assert.equal(sum(invoices.map((invoice) => invoice.afterDiscount)), 100000n);
    assert.equal(sum(invoices.map((invoice) => invoice.vat)), 7000n);
    assert.equal(sum(invoices.map((invoice) => invoice.total)), 107000n);
});

test("ใบแจ้งหนี้จากงวด: เลือกหลายงวดรวมใบเดียว", () => {
    const invoice = calculateMilestoneInvoice({
        quotation: QUOTATION,
        milestones: MILESTONES,
        selectedIds: ["11", "13"],
        vatRate: "7.00",
    });
    assert.deepEqual(
        invoice.lines.map((line) => line.milestoneId),
        [11, 13],
    );
    assert.equal(invoice.total, 71333n);
});

test("ใบแจ้งหนี้จากงวด: VAT เปลี่ยน (ใบเสนอราคาไม่มี VAT แต่วันออกจดแล้ว) → คิด VAT ใหม่ + แจ้ง vatChanged", () => {
    const invoice = calculateMilestoneInvoice({
        quotation: { afterDiscount: 5000000n, total: 5000000n, vatRate: "0" },
        milestones: [
            { id: 1, amount: 2000000n },
            { id: 2, amount: 3000000n },
        ],
        selectedIds: [2],
        vatRate: "7.00",
    });
    assert.equal(invoice.vatChanged, true);
    assert.equal(invoice.afterDiscount, 3000000n);
    assert.equal(invoice.vat, 210000n);
    assert.equal(invoice.total, 3210000n);
    assert.equal(invoice.agreedTotal, 3000000n, "ยอดที่ลูกค้าตกลงไว้ · ใช้แสดงเทียบตอนขอยืนยัน");
});

test("ใบแจ้งหนี้จากงวด: หัก ณ ที่จ่าย 3% จากยอดก่อน VAT · ยอดสุทธิ · ยอดบาทของใบ USD", () => {
    const invoice = calculateMilestoneInvoice({
        quotation: { afterDiscount: 100000n, total: 107000n, vatRate: "7.00" },
        milestones: [{ id: 1, amount: 107000n }],
        selectedIds: [1],
        vatRate: "7.00",
        exchangeRate: "35.5",
        whtRate: "3",
    });
    // 1,000.00 × 3% = 30.00 · สุทธิ 1,070.00 − 30.00 = 1,040.00 · บาท 1,070 × 35.5 = 37,985.00
    assert.equal(invoice.withholding, 3000n);
    assert.equal(invoice.netPayable, 104000n);
    assert.equal(invoice.totalThb, 3798500n);
    assert.equal(invoice.afterDiscountThb, 3550000n);
});

test("ใบแจ้งหนี้จากงวด: เลือกงวดที่ไม่อยู่ในใบ / ไม่เลือกเลย ต้องถูกปฏิเสธ", () => {
    const base = { quotation: QUOTATION, milestones: MILESTONES, vatRate: "7.00" };
    assert.throws(() => calculateMilestoneInvoice({ ...base, selectedIds: [] }), /อย่างน้อย 1 งวด/);
    assert.throws(() => calculateMilestoneInvoice({ ...base, selectedIds: [99] }), /ไม่อยู่ในใบเสนอราคานี้/);
});

test("หัก ณ ที่จ่าย: ว่าง = 0 · ปัดครึ่งขึ้น · เกิน 15% ถูกปฏิเสธ", () => {
    assert.equal(calculateWithholding(100000n, null), 0n);
    assert.equal(calculateWithholding(100000n, ""), 0n);
    // 333.35 × 3% = 10.0005 → 10.00 · 335.00 × 1.5% = 5.025 → 5.03 (ครึ่งปัดขึ้น)
    assert.equal(calculateWithholding(33335n, "3"), 1000n);
    assert.equal(calculateWithholding(33500n, "1.5"), 503n);
    assert.throws(() => calculateWithholding(100000n, "20"), /0–15%/);
});
