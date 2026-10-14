// เทสต์ยอดทั้งใบของใบเสนอราคา (src/shared/quotation-totals.mjs) — ตัวเลขคำนวณมือแล้ว
const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateQuotation } = require("../src/shared/quotation-totals.mjs");
const { convertFromBaht } = require("../src/shared/money.mjs");

function quotation(overrides) {
    return {
        items: [],
        discountType: "amount",
        discountValue: "0",
        vatRate: "7.00",
        currencyDecimals: 2,
        exchangeRate: "1",
        paymentMode: "single",
        milestones: [],
        ...overrides,
    };
}

test("ยอดทั้งใบ: หัวข้อ/หมายเหตุไม่มียอด · ส่วนลดบรรทัด % · ส่วนลดท้ายบิล · VAT · ยอดเป็นบาท", () => {
    const result = calculateQuotation(
        quotation({
            items: [
                { qti_type: "heading" },
                {
                    qti_type: "item",
                    qti_quantity: "2",
                    qti_unit_price: "10000",
                    qti_discount_type: "percent",
                    qti_discount_value: "10",
                },
                { qti_type: "item", qti_quantity: "1", qti_unit_price: "5000.50" },
                { qti_type: "note" },
            ],
            discountValue: "500.50",
        }),
    );
    assert.deepEqual(result.errors, {});
    // 18,000 + 5,000.50 = 23,000.50 − 500.50 = 22,500 · VAT 1,575 · รวม 24,075
    assert.equal(result.subtotal, 2300050n);
    assert.equal(result.afterDiscount, 2250000n);
    assert.equal(result.vat, 157500n);
    assert.equal(result.total, 2407500n);
    assert.equal(result.afterDiscountThb, 2250000n);
    assert.equal(result.lines[0].amount, 0n);
    assert.equal(result.lines[1].discount, 200000n);
});

test("สกุลต่างประเทศ: ยอดเป็นบาทใช้อัตราของใบ · เยนปัดเป็นเต็มหน่วย", () => {
    const usd = calculateQuotation(
        quotation({
            items: [{ qti_type: "item", qti_quantity: "1", qti_unit_price: "1000" }],
            vatRate: "0",
            exchangeRate: "35.123456",
        }),
    );
    // 1,000 × 35.123456 = 35,123.456 → 35,123.46 บาท
    assert.equal(usd.totalThb, 3512346n);

    const yen = calculateQuotation(
        quotation({
            items: [{ qti_type: "item", qti_quantity: "3", qti_unit_price: "333.5" }],
            currencyDecimals: 0,
            exchangeRate: "0.226155",
        }),
    );
    // 3 × 333.5 = 1000.5 → 1001 · VAT 7% = 70.07 → 70 · รวม 1071 เยน
    assert.equal(yen.subtotal, 100100n);
    assert.equal(yen.vat, 7000n);
    assert.equal(yen.total, 107100n);
});

test("ต่ำกว่าราคาตั้งต้น: เทียบยอดบรรทัดหลังส่วนลดกับ จำนวน × ราคาตั้งต้น", () => {
    const result = calculateQuotation(
        quotation({
            items: [
                { qti_type: "item", qti_quantity: "2", qti_unit_price: "45000", qti_list_price: "50000" },
                {
                    qti_type: "item",
                    qti_quantity: "1",
                    qti_unit_price: "50000",
                    qti_list_price: "50000",
                    qti_discount_value: "5000",
                },
                { qti_type: "item", qti_quantity: "1", qti_unit_price: "60000", qti_list_price: "50000" },
            ],
        }),
    );
    assert.equal(result.lines[0].belowListBy, 1000000n);
    assert.equal(result.lines[1].belowListBy, 500000n);
    assert.equal(result.lines[2].belowListBy, 0n);
    assert.deepEqual(result.belowList, { lineCount: 2, amount: 1500000n });
});

test("ข้อมูลผิดไม่โยน error — บอกเป็นรายช่องรูปเดียวกับ API", () => {
    const result = calculateQuotation(
        quotation({
            items: [
                { qti_type: "item", qti_quantity: "1", qti_unit_price: "100", qti_discount_value: "150" },
                { qti_type: "item", qti_quantity: "0", qti_unit_price: "100" },
            ],
        }),
    );
    assert.ok(result.errors["items.0.qti_discount_value"]);
    assert.ok(result.errors["items.1.qti_quantity"]);
});

test("งวดชำระ: งวดสุดท้ายรับเศษ · รวมไม่ตรงบอกเหตุผลแต่ไม่พัง", () => {
    const items = [{ qti_type: "item", qti_quantity: "1", qti_unit_price: "100" }];
    const ok = calculateQuotation(
        quotation({
            items,
            vatRate: "0",
            paymentMode: "milestones",
            milestones: [{ qtm_percent: "33.33" }, { qtm_percent: "33.33" }, { qtm_percent: "33.34" }],
        }),
    );
    assert.equal(ok.milestonesError, null);
    assert.deepEqual(ok.milestoneAmounts, [3333n, 3333n, 3334n]);

    const wrong = calculateQuotation(
        quotation({ items, vatRate: "0", paymentMode: "milestones", milestones: [{ qtm_percent: "50" }] }),
    );
    assert.match(wrong.milestonesError, /100%/);
});

test("แปลงราคาบาทเป็นสกุลของใบ ปัดครึ่งขึ้นตามทศนิยมของสกุล", () => {
    // 50,000 บาท ÷ 35.123456 = 1,423.5501... → 1,423.55 ดอลลาร์
    assert.equal(convertFromBaht(5000000n, "35.123456", 2), 142355n);
    // 1,000 บาท ÷ 0.226155 = 4,421.75... → 4,422 เยน
    assert.equal(convertFromBaht(100000n, "0.226155", 0), 442200n);
    assert.equal(convertFromBaht(12345n, "1", 2), 12345n);
});
