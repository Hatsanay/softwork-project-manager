// เทสต์การคำนวณเงิน (src/shared/money.mjs) — ทุกตัวเลขในนี้คำนวณมือแล้ว ถ้าเทสต์พังให้สงสัยโค้ดก่อนแก้ตัวเลข
const test = require("node:test");
const assert = require("node:assert/strict");
const {
    MoneyInputError,
    parseHundredths,
    formatHundredths,
    divideRoundHalfUp,
    roundToCurrency,
    calculateLine,
    calculateDocumentTotals,
    splitIntoMilestones,
    convertToBaht,
    trimQuantity,
    formatQuantity,
} = require("../src/shared/money.mjs");

// ─── แปลงข้อความ ↔ ร้อยส่วน ───────────────────────────────────────────────────────────────

test("แปลงตัวเลขที่กรอกเป็นร้อยส่วนโดยไม่ผ่าน float", () => {
    assert.equal(parseHundredths("0.1", "x"), 10n);
    assert.equal(parseHundredths(7, "x"), 700n);
    assert.equal(parseHundredths("1,234.50", "x"), 123450n);
    assert.equal(parseHundredths(0.1 + 0.2, "x"), 30n); // 0.30000000000000004 → 0.30
});

test("ทศนิยมเกิน 2 ตำแหน่งปัดครึ่งขึ้น (ติดลบปัดออกจากศูนย์)", () => {
    assert.equal(parseHundredths("12.345", "x"), 1235n);
    assert.equal(parseHundredths("12.344", "x"), 1234n);
    assert.equal(parseHundredths("1,234.567", "x"), 123457n);
    assert.equal(parseHundredths("-12.345", "x"), -1235n);
});

test("ข้อความที่ไม่ใช่ตัวเลขถูกปฏิเสธพร้อมชื่อช่อง", () => {
    for (const bad of ["", "  ", "abc", "1e5", "1.2.3", null, undefined, "12,34a"]) {
        assert.throws(
            () => parseHundredths(bad, "ราคาต่อหน่วย"),
            (error) => error instanceof MoneyInputError && error.field === "ราคาต่อหน่วย",
            `ควรปฏิเสธ ${JSON.stringify(bad)}`,
        );
    }
});

test("ร้อยส่วน → ข้อความ 2 ตำแหน่งสำหรับ DECIMAL(15,2)", () => {
    assert.equal(formatHundredths(123450n), "1234.50");
    assert.equal(formatHundredths(0n), "0.00");
    assert.equal(formatHundredths(5n), "0.05");
    assert.equal(formatHundredths(-5n), "-0.05");
});

// ─── การปัดเศษ ───────────────────────────────────────────────────────────────────────────

test("หารปัดครึ่งขึ้น", () => {
    assert.equal(divideRoundHalfUp(5n, 10n), 1n);
    assert.equal(divideRoundHalfUp(4n, 10n), 0n);
    assert.equal(divideRoundHalfUp(15n, 10n), 2n);
    assert.equal(divideRoundHalfUp(-5n, 10n), -1n);
});

test("ปัดตามทศนิยมของสกุลเงิน · เยน (0 ตำแหน่ง) ปัดเป็นเต็มหน่วย", () => {
    assert.equal(roundToCurrency(123456n, 2), 123456n);
    assert.equal(roundToCurrency(150049n, 0), 150000n);
    assert.equal(roundToCurrency(150050n, 0), 150100n);
    assert.equal(roundToCurrency(12345n, 1), 12350n);
    assert.throws(() => roundToCurrency(100n, 3));
});

// ─── ยอดต่อบรรทัด ─────────────────────────────────────────────────────────────────────────

test("บรรทัด: จำนวนทศนิยม × ราคา ปัดครึ่งขึ้น (2.5 × 333.33 = 833.33)", () => {
    const line = calculateLine({ quantity: "2.5", unitPrice: "333.33" });
    assert.deepEqual(line, { gross: 83333n, discount: 0n, amount: 83333n });
});

test("บรรทัด: ส่วนลดเป็นบาท", () => {
    const line = calculateLine({ quantity: 2, unitPrice: "500", discountType: "amount", discountValue: "150.50" });
    assert.deepEqual(line, { gross: 100000n, discount: 15050n, amount: 84950n });
});

test("บรรทัด: ส่วนลด % ปัดครึ่งขึ้น", () => {
    const halfPercent = calculateLine({
        quantity: 1,
        unitPrice: "1000",
        discountType: "percent",
        discountValue: "12.5",
    });
    assert.deepEqual(halfPercent, { gross: 100000n, discount: 12500n, amount: 87500n });

    // 10% ของ 99.99 = 9.999 → 10.00
    const rounded = calculateLine({ quantity: 1, unitPrice: "99.99", discountType: "percent", discountValue: 10 });
    assert.deepEqual(rounded, { gross: 9999n, discount: 1000n, amount: 8999n });
});

test("บรรทัด: สกุลเงินไม่มีทศนิยม (3 × 333.5 เยน = 1000.5 → 1001)", () => {
    const line = calculateLine({ quantity: 3, unitPrice: "333.5", currencyDecimals: 0 });
    assert.equal(formatHundredths(line.amount), "1001.00");
});

test("บรรทัด: ข้อมูลผิดถูกปฏิเสธ", () => {
    const invalidLines = [
        { quantity: 0, unitPrice: 100 },
        { quantity: -1, unitPrice: 100 },
        { quantity: 1, unitPrice: -100 },
        { quantity: 1, unitPrice: "abc" },
        { quantity: 1, unitPrice: 100, discountValue: 100.01 },
        { quantity: 1, unitPrice: 100, discountValue: -1 },
        { quantity: 1, unitPrice: 100, discountType: "percent", discountValue: 100.01 },
        { quantity: 1, unitPrice: "10000000000000" },
        { quantity: 2, unitPrice: "9999999999999" },
    ];
    for (const line of invalidLines) {
        assert.throws(() => calculateLine(line), MoneyInputError, JSON.stringify(line));
    }
});

test("บรรทัด: ส่วนลด 100% ได้ยอด 0", () => {
    const line = calculateLine({ quantity: 1, unitPrice: 100, discountType: "percent", discountValue: 100 });
    assert.equal(line.amount, 0n);
});

// ─── ยอดรวมทั้งเอกสาร ──────────────────────────────────────────────────────────────────────

test("VAT 7% ปัดครึ่งขึ้น (1000.05 → 70.00, 1000.10 → 70.01)", () => {
    const low = calculateDocumentTotals({ lineAmounts: [100000n, 5n], vatRate: "7.00" });
    assert.equal(low.vat, 7000n);
    assert.equal(low.total, 107005n);

    const high = calculateDocumentTotals({ lineAmounts: [100010n], vatRate: 7 });
    assert.equal(high.vat, 7001n);
});

test("ส่วนลดท้ายบิลเป็นบาท แล้วคิด VAT จากยอดหลังลด", () => {
    const totals = calculateDocumentTotals({
        lineAmounts: [100000n],
        discountType: "amount",
        discountValue: 100,
        vatRate: 7,
    });
    assert.deepEqual(totals, {
        subtotal: 100000n,
        discount: 10000n,
        afterDiscount: 90000n,
        vatRate: 700n,
        vat: 6300n,
        total: 96300n,
    });
});

test("ส่วนลดท้ายบิลเป็น % ปัดครึ่งขึ้น", () => {
    // 10% ของ 1000.05 = 100.005 → 100.01 · VAT 7% ของ 900.04 = 63.0028 → 63.00
    const totals = calculateDocumentTotals({
        lineAmounts: [100005n],
        discountType: "percent",
        discountValue: 10,
        vatRate: 7,
    });
    assert.equal(totals.discount, 10001n);
    assert.equal(totals.afterDiscount, 90004n);
    assert.equal(totals.vat, 6300n);
    assert.equal(totals.total, 96304n);
});

test("ไม่คิด VAT (vatRate 0) และเอกสารเยน ปัด VAT เป็นเต็มหน่วย", () => {
    const noVat = calculateDocumentTotals({ lineAmounts: [12345n] });
    assert.equal(noVat.vat, 0n);
    assert.equal(noVat.total, 12345n);

    // VAT 7% ของ 1001 เยน = 70.07 → 70
    const yen = calculateDocumentTotals({ lineAmounts: [100100n], vatRate: 7, currencyDecimals: 0 });
    assert.equal(yen.vat, 7000n);
    assert.equal(yen.total, 107100n);
});

test("ยอดรวม: ส่วนลดเกินยอด / อัตราผิด / ยอดเกินขอบ DECIMAL ถูกปฏิเสธ", () => {
    assert.throws(() => calculateDocumentTotals({ lineAmounts: [10000n], discountValue: "100.01" }), MoneyInputError);
    assert.throws(
        () => calculateDocumentTotals({ lineAmounts: [10000n], discountType: "percent", discountValue: 101 }),
        MoneyInputError,
    );
    assert.throws(() => calculateDocumentTotals({ lineAmounts: [10000n], vatRate: -7 }), MoneyInputError);
    assert.throws(() => calculateDocumentTotals({ lineAmounts: [999_999_999_999_999n], vatRate: 7 }), MoneyInputError);
});

test("ยอดรวม: เอกสารที่มีแต่หัวข้อ (ไม่มีบรรทัดเงิน) ได้ 0", () => {
    const totals = calculateDocumentTotals({ lineAmounts: [], vatRate: 7 });
    assert.equal(totals.total, 0n);
});

// ─── งวดชำระ ─────────────────────────────────────────────────────────────────────────────

test("งวด %: งวดสุดท้ายรับเศษ ผลรวมเท่ายอดเอกสารพอดี", () => {
    // 1000.01 × 33.33% = 333.3033 → 333.30 (×2) · งวดสุดท้ายรับที่เหลือ 333.41
    const milestones = splitIntoMilestones({
        milestones: [{ percent: "33.33" }, { percent: "33.33" }, { percent: "33.34" }],
        total: 100001n,
    });
    assert.deepEqual(
        milestones.map((milestone) => formatHundredths(milestone.amount)),
        ["333.30", "333.30", "333.41"],
    );
});

test("งวดผสม % กับจำนวนเงิน", () => {
    const milestones = splitIntoMilestones({
        milestones: [{ percent: 30 }, { amount: "500" }, { amount: "200" }],
        total: 100000n,
    });
    assert.deepEqual(
        milestones.map((milestone) => milestone.amount),
        [30000n, 50000n, 20000n],
    );
    assert.equal(milestones[0].percent, 3000n);
    assert.equal(milestones[1].percent, null);
});

test("งวด % ที่รวมไม่ถึง 100% ถูกปฏิเสธ แม้ยอดเอกสารเล็กจนเศษปัดกลบได้", () => {
    // 1.00 บาท × 33.33% × 3 = 0.99 — ต่างแค่ 1 สตางค์ แต่ % รวมได้ 99.99 คือกรอกผิด
    assert.throws(
        () =>
            splitIntoMilestones({
                milestones: [{ percent: 33.33 }, { percent: 33.33 }, { percent: 33.33 }],
                total: 100n,
            }),
        MoneyInputError,
    );
});

test("งวด: ผลรวมไม่ตรงยอด / ไม่มีงวด / งวดเป็น 0 ถูกปฏิเสธ", () => {
    assert.throws(
        () => splitIntoMilestones({ milestones: [{ amount: 500 }, { amount: 400 }], total: 100000n }),
        MoneyInputError,
    );
    assert.throws(() => splitIntoMilestones({ milestones: [], total: 100000n }), MoneyInputError);
    assert.throws(
        () => splitIntoMilestones({ milestones: [{ percent: 0 }, { percent: 100 }], total: 100000n }),
        MoneyInputError,
    );
    assert.throws(
        () => splitIntoMilestones({ milestones: [{ amount: 0 }, { amount: 1000 }], total: 100000n }),
        MoneyInputError,
    );
});

test("งวด: เอกสารเยนแบ่งเป็นเต็มหน่วย", () => {
    // 1001 เยน แบ่ง 50/50 → 500.5 → 501 แล้วงวดสุดท้ายรับที่เหลือ 500
    const milestones = splitIntoMilestones({
        milestones: [{ percent: 50 }, { percent: 50 }],
        total: 100100n,
        currencyDecimals: 0,
    });
    assert.deepEqual(
        milestones.map((milestone) => formatHundredths(milestone.amount)),
        ["501.00", "500.00"],
    );
});

// ─── แปลงเป็นบาท ─────────────────────────────────────────────────────────────────────────

test("แปลงเป็นบาท ปัดครึ่งขึ้นเป็นสตางค์", () => {
    // 100.00 USD × 35.123456 = 3512.3456 → 3512.35
    assert.equal(convertToBaht(10000n, "35.123456"), 351235n);
    // 1001 เยน × 0.2345 = 234.7345 → 234.73
    assert.equal(convertToBaht(100100n, "0.2345"), 23473n);
    assert.equal(convertToBaht(12345n, 1), 12345n);
    // ค่าจาก DECIMAL(20,10) ของ mysql2 มีศูนย์ต่อท้ายครบ 10 ตำแหน่ง
    assert.equal(convertToBaht(10000n, "35.1234560000"), 351235n);
});

test("อัตรา 10 ทศนิยม: สกุลที่ ธปท. ประกาศต่อ 1000 หน่วย ไม่เสียความแม่นยำเมื่อยอดใหญ่", () => {
    // 1,000,000,000 รูเปียห์ × 0.0021234567 = 2,123,456.70 บาท (ถ้าตัดเหลือ 6 ตำแหน่งจะได้ 2,123,000.00 — ขาดไป 456.70)
    assert.equal(convertToBaht(100_000_000_000n, "0.0021234567"), 212345670n);
});

test("อัตราแลกเปลี่ยนผิดรูปแบบถูกปฏิเสธ", () => {
    for (const badRate of ["0", "0.0000000000", "-35", "abc", "", null, "35.12345678901", "1e2"]) {
        assert.throws(() => convertToBaht(10000n, badRate), MoneyInputError, JSON.stringify(badRate));
    }
});

test("แสดงผลยอดเงิน: จุลภาคคั่นหลักพัน ทศนิยมตามสกุลเงิน ไม่ผ่าน float", () => {
    const { formatAmount } = require("../src/shared/money.mjs");
    assert.equal(formatAmount(123450n), "1,234.50");
    assert.equal(formatAmount("100000.00"), "100,000.00");
    assert.equal(formatAmount("0"), "0.00");
    assert.equal(formatAmount(-500n), "-5.00");
    assert.equal(formatAmount("9999999999999.99"), "9,999,999,999,999.99");
    assert.equal(formatAmount(100100n, 0), "1,001");
    assert.equal(formatAmount(150050n, 0), "1,501"); // ปัดครึ่งขึ้นตามสกุล
    assert.equal(formatAmount(12345n, 1), "123.5");
});

test("อัตรา ธปท. ที่ประกาศต่อหลายหน่วย → บาทต่อ 1 หน่วย 10 ทศนิยม ปัดครึ่งขึ้น", () => {
    const { ratePerUnit } = require("../src/shared/money.mjs");
    assert.equal(ratePerUnit("34.7286", 1), "34.7286000000");
    // ต่อ 100 เยน
    assert.equal(ratePerUnit("22.6155", 100), "0.2261550000");
    // ต่อ 1000 รูเปียห์ — 2.1234567 / 1000 = 0.0021234567 พอดี
    assert.equal(ratePerUnit("2.1234567", 1000), "0.0021234567");
    // 2.12345675 / 1000 = 0.00212345675 → ปัดครึ่งขึ้นเป็น 0.0021234568
    assert.equal(ratePerUnit("2.12345675", 1000), "0.0021234568");
    // ผลที่ได้ใช้กับ convertToBaht ได้ทันที
    const { convertToBaht } = require("../src/shared/money.mjs");
    // 1,000 เยน × 0.226155 = 226.155 → 226.16 บาท
    assert.equal(convertToBaht(100000n, ratePerUnit("22.6155", 100)), 22616n);
    for (const bad of ["", "abc", "-1", null]) {
        assert.throws(() => ratePerUnit(bad, 1), MoneyInputError, JSON.stringify(bad));
    }
    assert.throws(() => ratePerUnit("1", 0), MoneyInputError);
});

// ─── จำนวน (ไม่ใช่เงิน) ─────────────────────────────────────────────────────────────────────

test("จำนวน: ตัดศูนย์ท้ายทศนิยม · จำนวนเต็มไม่มีทศนิยม · คั่นหลักพันเฉพาะตอนแสดง", () => {
    assert.equal(trimQuantity("8.00"), "8");
    assert.equal(trimQuantity("1.50"), "1.5");
    assert.equal(trimQuantity("0.25"), "0.25");
    assert.equal(trimQuantity("1200.00"), "1200");
    assert.equal(trimQuantity(3), "3");
    assert.equal(trimQuantity("-0.00"), "0");
    // ไม่ใช่ตัวเลข: คืนตามเดิมให้ชุดตรวจบอกผิด
    assert.equal(trimQuantity("abc"), "abc");
    assert.equal(trimQuantity(null), "");
    assert.equal(formatQuantity("1200.00"), "1,200");
    assert.equal(formatQuantity("1234567.50"), "1,234,567.5");
    assert.equal(formatQuantity("12.00"), "12");
});
